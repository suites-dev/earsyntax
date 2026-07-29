/**
 * `earsyntax validate <files|globs>` — validate `.ears` files deterministically.
 *
 * Uses `@earsyntax/extract` to read every supported format and
 * `@earsyntax/core` `lintEarsBatch` to lint. Never writes source or asks
 * questions. This is the only command that returns exit 1 (error diagnostics).
 * When run against a work item it updates the manifest status and writes the
 * `validation.json` / `validation.md` artifacts, and reports source staleness.
 */

import { existsSync, globSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { type Catalog, lintEarsBatch, type Options } from '@earsyntax/core';
import { extractFromFile } from '@earsyntax/extract';
import type { CommandContext } from '../context.js';
import type { FacadeDiagnostic, ValidationResult, WorkManifest, WorkStatus } from '../facade-types.js';
import { usageError } from '../errors.js';
import { hashContent } from '../hash.js';
import { findRoot, loadConfig, requireRoot, resolveInput, toRelative } from '../project.js';
import { buildResponse, emit } from '../response.js';
import { currentSourceHash, requireManifest, toWorkSummary, type WorkPaths } from '../workspace.js';

const GLOB_CHARS = /[*?[\]{}]/;

/** Expand file arguments (literals and globs) into absolute paths, in order. */
function expandFiles(cwd: string, patterns: string[]): string[] {
  const files: string[] = [];
  for (const pattern of patterns) {
    if (GLOB_CHARS.test(pattern)) {
      const matches = globSync(pattern, { cwd });
      for (const match of matches.sort((a, b) => a.localeCompare(b))) {
        files.push(resolveInput(cwd, match));
      }
    } else {
      const abs = resolveInput(cwd, pattern);
      if (!existsSync(abs)) {
        throw usageError('validate.missing_file', `File not found: ${pattern}.`);
      }
      files.push(abs);
    }
  }
  return files;
}

/** Load and parse a catalog file, throwing a usage error on failure. */
function loadCatalog(cwd: string, catalogArg: string | undefined): Catalog | undefined {
  if (catalogArg === undefined) {
    return undefined;
  }
  const abs = resolveInput(cwd, catalogArg);
  let raw: string;
  try {
    raw = readFileSync(abs, 'utf8');
  } catch {
    throw usageError('validate.catalog_unreadable', `Could not read catalog: ${catalogArg}.`);
  }
  try {
    return JSON.parse(raw) as Catalog;
  } catch {
    throw usageError('validate.catalog_invalid', `Catalog is not valid JSON: ${catalogArg}.`);
  }
}

/** Build core lint options from the parsed flags. */
function buildOptions(context: CommandContext): Options {
  const mode = context.args.values.get('mode');
  if (mode !== undefined && mode !== 'strict' && mode !== 'guided') {
    throw usageError('validate.bad_mode', `Unknown --mode "${mode}". Expected strict or guided.`);
  }
  return {
    ...(mode === 'strict' || mode === 'guided' ? { mode } : {}),
    ...(context.args.booleans.has('comma-as-and') ? { commaAsAnd: true } : {}),
  };
}

/** Find the work-item slug a validated path belongs to, if any. */
function inferWorkSlug(root: string, workDir: string, absFiles: string[]): string | undefined {
  const base = resolve(root, workDir);
  for (const file of absFiles) {
    const rel = relative(base, file);
    if (!rel.startsWith('..') && rel !== '') {
      const segment = rel.split(/[/\\]/).at(0);
      if (segment !== undefined && segment !== '') {
        return segment;
      }
    }
  }
  return undefined;
}

/** Render a short human-readable validation.md artifact. */
function renderValidationMarkdown(results: ValidationResult[], errors: number, warnings: number): string {
  const lines = ['# Validation', '', `errors: ${errors}, warnings: ${warnings}`, ''];
  for (const result of results) {
    for (const diagnostic of result.diagnostics) {
      const at = result.line === undefined ? '' : `:${result.line}`;
      lines.push(`- ${diagnostic.severity} ${diagnostic.code} (${result.id ?? '?'}${at}) ${diagnostic.message}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

export function validateCommand(context: CommandContext): number {
  const patterns = context.args.positionals;
  if (patterns.length === 0) {
    throw usageError('validate.no_files', 'Provide one or more .ears files or globs to validate.');
  }

  const workId = context.args.values.get('work');
  const root = workId !== undefined ? requireRoot(context.cwd) : (findRoot(context.cwd) ?? context.cwd);
  const config = existsSync(resolve(root, '.earsyntax')) ? loadConfig(root, context.global.config) : undefined;

  const absFiles = expandFiles(context.cwd, patterns);
  const catalog = loadCatalog(context.cwd, context.args.values.get('catalog'));
  const options = buildOptions(context);

  // Lint each file, grouping results in input order.
  const results: ValidationResult[] = [];
  let requirements = 0;
  for (const abs of absFiles) {
    const extracted = extractFromFile(abs);
    if (extracted.items.length === 0 && extracted.errors.length > 0) {
      throw usageError('validate.unreadable', extracted.errors.at(0)?.message ?? `Could not read ${abs}.`);
    }
    const fileRel = toRelative(root, abs);
    const lintResults = lintEarsBatch(extracted.items, catalog, options);
    for (let i = 0; i < extracted.items.length; i++) {
      const item = extracted.items.at(i);
      const lint = lintResults.at(i);
      if (item === undefined || lint === undefined) {
        continue;
      }
      requirements += 1;
      results.push({
        ...(item.id !== undefined ? { id: item.id } : {}),
        file: fileRel,
        ...(item.source?.line !== undefined ? { line: item.source.line } : {}),
        valid: lint.valid,
        ...(lint.pattern !== undefined ? { pattern: lint.pattern } : {}),
        ...(lint.ast !== undefined ? { ast: lint.ast } : {}),
        references: lint.references,
        diagnostics: lint.diagnostics,
      });
    }
  }

  // Facade-level stable-ID validation: duplicate IDs are error diagnostics.
  const facadeDiagnostics: FacadeDiagnostic[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    if (result.id === undefined) {
      continue;
    }
    if (seen.has(result.id)) {
      facadeDiagnostics.push({
        code: 'facade.duplicate_id',
        severity: 'error',
        message: `Duplicate requirement ID "${result.id}". Requirement IDs must be unique.`,
        path: result.file,
        ...(result.line !== undefined ? { line: result.line } : {}),
      });
    } else {
      seen.add(result.id);
    }
  }

  let errors = facadeDiagnostics.length;
  let warnings = 0;
  let validCount = 0;
  for (const result of results) {
    if (result.valid) {
      validCount += 1;
    }
    for (const diagnostic of result.diagnostics) {
      if (diagnostic.severity === 'error') {
        errors += 1;
      } else if (diagnostic.severity === 'warning') {
        warnings += 1;
      }
    }
  }

  const summary = { files: absFiles.length, requirements, valid: validCount, errors, warnings };
  const ok = errors === 0;

  // Work-item integration: update the manifest and write artifacts, then expose
  // the refreshed work summary and staleness. No target work item leaves it {}.
  const slug =
    config === undefined ? undefined : (workId ?? inferWorkSlug(root, config.workDir, absFiles));
  const workBlock =
    config !== undefined && slug !== undefined
      ? (() => {
          const { paths, manifest } = requireManifest(root, config, slug);
          const { manifest: updated, stale } = updateWorkItem(
            root,
            paths,
            manifest,
            errors,
            results,
            summary,
            warnings,
          );
          return { work: toWorkSummary(root, updated), stale };
        })()
      : {};

  const extra: Record<string, unknown> = { summary, results, ...workBlock };

  const next = ok
    ? []
    : [
        {
          command: `earsyntax instructions repair${workId ? ` --work ${workId}` : ''} --json`,
          reason: 'Get targeted repair rules for the reported diagnostics.',
          forAgent: true,
        },
      ];

  const response = buildResponse(
    { command: 'validate', ok, root, diagnostics: facadeDiagnostics, next },
    extra,
  );

  const pretty = renderPretty(results, summary, facadeDiagnostics);
  emit(context.emitter, response, pretty);
  return ok ? 0 : 1;
}

/** Update the work manifest after a validation and persist the artifacts. */
function updateWorkItem(
  root: string,
  paths: WorkPaths,
  manifest: WorkManifest,
  errors: number,
  results: ValidationResult[],
  summary: { files: number; requirements: number; valid: number; errors: number; warnings: number },
  warnings: number,
): { manifest: WorkManifest; stale: boolean } {
  const outputAbs = resolveInput(root, manifest.output.path);
  let outputHash = manifest.output.hash;
  try {
    outputHash = hashContent(readFileSync(outputAbs, 'utf8'));
  } catch {
    // Leave the recorded hash if the output is unreadable.
  }

  const nextStatus: WorkStatus = errors > 0 ? 'invalid' : 'valid';
  const updated: WorkManifest = {
    ...manifest,
    status: nextStatus,
    output: { ...manifest.output, hash: outputHash },
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(paths.manifest, `${JSON.stringify(updated, null, 2)}\n`);
  writeFileSync(paths.validationJson, `${JSON.stringify({ summary, results }, null, 2)}\n`);
  writeFileSync(paths.validationMarkdown, renderValidationMarkdown(results, errors, warnings));

  const current = currentSourceHash(root, updated.source?.path);
  const stale =
    nextStatus === 'valid' &&
    current !== undefined &&
    updated.source?.hash !== undefined &&
    current !== updated.source.hash;
  return { manifest: updated, stale };
}

/** Pretty output: one line per diagnostic plus a summary. */
function renderPretty(
  results: ValidationResult[],
  summary: { requirements: number; valid: number; errors: number; warnings: number },
  facadeDiagnostics: FacadeDiagnostic[],
): string {
  const lines: string[] = [];
  for (const result of results) {
    for (const diagnostic of result.diagnostics) {
      const at = result.line === undefined ? '' : `:${result.line}`;
      lines.push(`${result.file}${at} ${diagnostic.severity} ${diagnostic.code}  ${diagnostic.message}`);
    }
  }
  for (const diagnostic of facadeDiagnostics) {
    const at = diagnostic.line === undefined ? '' : `:${diagnostic.line}`;
    lines.push(`${diagnostic.path ?? ''}${at} ${diagnostic.severity} ${diagnostic.code}  ${diagnostic.message}`);
  }
  lines.push(
    `\n${summary.valid}/${summary.requirements} valid, ${summary.errors} errors, ${summary.warnings} warnings`,
  );
  return lines.join('\n');
}