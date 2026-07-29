/**
 * `earsyntax instructions <mode> --work <id>` — return the rules an agent
 * follows for one loop step. Read-only.
 *
 * The four modes are author, convert, repair, and review. Convert (and repair
 * and review when the item has a source) include a `source` block with
 * excerpts; repair also includes the diagnostics the agent must address, read
 * from the work item's last `validation.json`.
 */

import { existsSync, readFileSync } from 'node:fs';
import type { CommandContext } from '../context.js';
import type {
  FacadeDiagnostic,
  NextAction,
  SourceExcerpt,
  ValidationResult,
} from '../facade-types.js';
import { usageError } from '../errors.js';
import { requireInstructionMode } from '../mode.js';
import { loadConfig, requireRoot, resolveInput } from '../project.js';
import { buildResponse, emit } from '../response.js';
import { ALLOWED_PATTERNS, exampleLine, METADATA_PREFIXES, rulesFor } from '../rules.js';
import { requireManifest, toWorkSummary } from '../workspace.js';

const MAX_EXCERPTS = 3;

/** Best-effort source excerpts: the first few content lines with their numbers. */
function buildExcerpts(root: string, sourcePath: string): SourceExcerpt[] {
  const abs = resolveInput(root, sourcePath);
  let content: string;
  try {
    content = readFileSync(abs, 'utf8');
  } catch {
    return [];
  }
  const excerpts: SourceExcerpt[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length && excerpts.length < MAX_EXCERPTS; i++) {
    const text = lines[i]?.trim() ?? '';
    if (text === '' || text.startsWith('#')) {
      continue;
    }
    const lineNo = i + 1;
    excerpts.push({ path: sourcePath, startLine: lineNo, endLine: lineNo, text });
  }
  return excerpts;
}

/** Read the last validation.json results and flatten them to facade diagnostics. */
function readRepairDiagnostics(validationJsonAbs: string): FacadeDiagnostic[] {
  if (!existsSync(validationJsonAbs)) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(validationJsonAbs, 'utf8'));
  } catch {
    return [];
  }
  const results =
    parsed && typeof parsed === 'object' && 'results' in parsed
      ? ((parsed as { results?: ValidationResult[] }).results ?? [])
      : [];
  return results.flatMap((result) =>
    result.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      path: result.file,
      ...(result.line !== undefined ? { line: result.line } : {}),
    })),
  );
}

export function instructionsCommand(context: CommandContext): number {
  const mode = requireInstructionMode(context.args.positionals[0]);
  const workId = context.args.values.get('work');
  if (workId === undefined) {
    throw usageError('instructions.missing_work', 'Provide the work item with --work <id>.');
  }

  const root = requireRoot(context.cwd);
  const config = loadConfig(root, context.global.config);
  const { paths, manifest } = requireManifest(root, config, workId);

  const sourcePath = manifest.source?.path;
  const output = manifest.output.path;

  // Convert mode carries the source block with excerpts; repair mode carries
  // the diagnostics to fix. This mirrors the golden instruction fixtures.
  const sourceBlock =
    mode === 'convert' && sourcePath !== undefined
      ? {
          source: {
            path: sourcePath,
            hash: manifest.source?.hash,
            excerpts: buildExcerpts(root, sourcePath),
          },
        }
      : {};
  const diagnosticsBlock =
    mode === 'repair' ? { diagnostics: readRepairDiagnostics(paths.validationJson) } : {};

  const extra: Record<string, unknown> = {
    mode,
    work: toWorkSummary(root, manifest),
    rules: rulesFor(mode),
    format: {
      line: exampleLine(mode, sourcePath),
      allowedPatterns: ALLOWED_PATTERNS,
      metadataPrefixes: METADATA_PREFIXES,
    },
    ...sourceBlock,
    ...diagnosticsBlock,
  };

  const sourceFlag = sourcePath ? ` --source ${sourcePath}` : '';
  const validateNext: NextAction = {
    command: `earsyntax validate ${output}${sourceFlag} --json`,
    reason:
      mode === 'repair'
        ? 'Re-validate after applying the repairs and repeat until validation is clean.'
        : 'Validate the generated .ears file once it is written.',
    forAgent: true,
  };
  const reviewNext: NextAction[] = [
    {
      command: `earsyntax show ${manifest.id} --artifact questions --json`,
      reason: 'Read the open questions the human must resolve before acceptance.',
      forAgent: true,
    },
    {
      command: `earsyntax accept ${manifest.id}`,
      reason: 'Record human acceptance once the reviewer approves.',
      blocking: true,
    },
  ];

  const response = buildResponse(
    {
      command: `instructions ${mode}`,
      ok: true,
      root,
      next: mode === 'review' ? reviewNext : [validateNext],
    },
    extra,
  );

  const pretty = [
    `instructions ${mode} for "${manifest.id}"`,
    ...rulesFor(mode).map((r) => `  - ${r}`),
  ].join('\n');

  emit(context.emitter, response, pretty);
  return 0;
}
