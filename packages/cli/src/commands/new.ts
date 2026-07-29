/**
 * `earsyntax new <slug>` — scaffold a work item.
 *
 * Prepares the directory an agent writes into; it never generates EARS content.
 * Convert mode requires `--source <path>`, author mode requires `--prompt`.
 * Refuses to clobber an existing work item without `--force` (exit 3).
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import type { CommandContext } from '../context.js';
import type { WorkManifest, WorkMode } from '../facade-types.js';
import { refusalError, usageError } from '../errors.js';
import { hashContent } from '../hash.js';
import { loadConfig, requireRoot, resolveInput, toRelative } from '../project.js';
import { buildResponse, emit } from '../response.js';
import { nextForStatus } from '../next-actions.js';
import { sourceKind, workPaths } from '../workspace.js';

const SLUG_RE = /^[a-z0-9][a-z0-9._-]*$/i;

const QUESTIONS_TEMPLATE = [
  '# Open questions',
  '',
  '<!-- One bullet per unresolved item. Blocking questions must be answered by a human before acceptance. Example:',
  '- [REQ?] Source specs/source.md:18 says "notify the customer quickly." What channel, and what time bound?',
  '-->',
  '',
].join('\n');

const TRACEABILITY_TEMPLATE = `${JSON.stringify({ requirements: [], questions: [] }, null, 2)}\n`;

interface ModeResolution {
  mode: WorkMode;
  source?: string;
  prompt?: string;
}

function resolveMode(context: CommandContext): ModeResolution {
  const modeFlag = context.args.values.get('mode');
  const source = context.args.values.get('source');
  const prompt = context.args.values.get('prompt');

  if (modeFlag !== undefined && modeFlag !== 'convert' && modeFlag !== 'author') {
    throw usageError('new.bad_mode', `Unknown --mode "${modeFlag}". Expected convert or author.`);
  }

  const mode: WorkMode | undefined =
    modeFlag === 'convert' || modeFlag === 'author'
      ? modeFlag
      : source !== undefined
        ? 'convert'
        : prompt !== undefined
          ? 'author'
          : undefined;

  if (mode === undefined) {
    throw usageError(
      'new.missing_mode',
      'Specify a mode: pass --source <path> (convert) or --prompt <text> (author).',
    );
  }
  if (mode === 'convert' && source === undefined) {
    throw usageError('new.missing_source', 'Convert mode requires --source <path>.');
  }
  if (mode === 'author' && prompt === undefined) {
    throw usageError('new.missing_prompt', 'Author mode requires --prompt <text>.');
  }

  return {
    mode,
    ...(source !== undefined ? { source } : {}),
    ...(prompt !== undefined ? { prompt } : {}),
  };
}

export function newCommand(context: CommandContext): number {
  const root = requireRoot(context.cwd);
  const config = loadConfig(root, context.global.config);

  const slug = context.args.positionals.at(0);
  if (slug === undefined || !SLUG_RE.test(slug)) {
    throw usageError(
      'new.bad_slug',
      `Provide a valid work-item slug (letters, digits, ., -, _). Got: "${slug ?? ''}".`,
    );
  }

  const { mode, source, prompt } = resolveMode(context);
  const force = context.args.booleans.has('force');

  const paths = workPaths(root, config, slug);
  if (existsSync(paths.manifest) && !force) {
    throw refusalError('new.exists', `Work item "${slug}" already exists. Pass --force to recreate.`);
  }

  // Read and hash the source for convert mode.
  let sourceRel: string | undefined;
  let sourceHash: string | undefined;
  let snapshotRel: string | undefined;
  if (mode === 'convert' && source !== undefined) {
    const sourceAbs = resolveInput(context.cwd, source);
    let content: string;
    try {
      content = readFileSync(sourceAbs, 'utf8');
    } catch {
      throw usageError('new.source_unreadable', `Could not read source file: ${source}.`);
    }
    sourceRel = toRelative(root, sourceAbs);
    sourceHash = hashContent(content);
    if (context.args.booleans.has('snapshot-source')) {
      const snapshotAbs = resolve(paths.dir, `source${extname(sourceAbs) || '.txt'}`);
      mkdirSync(paths.dir, { recursive: true });
      copyFileSync(sourceAbs, snapshotAbs);
      snapshotRel = toRelative(root, snapshotAbs);
    }
  }

  const outFlag = context.args.values.get('out');
  const outputRel = outFlag
    ? toRelative(root, resolveInput(context.cwd, outFlag))
    : toRelative(root, paths.requirements);

  const now = new Date().toISOString();
  const sourceBlock =
    mode === 'convert' && sourceRel !== undefined
      ? {
          source: {
            path: sourceRel,
            hash: sourceHash,
            kind: sourceKind(sourceRel),
            ...(snapshotRel !== undefined ? { snapshotPath: snapshotRel } : {}),
          },
        }
      : {};
  const promptBlock = mode === 'author' && prompt !== undefined ? { prompt } : {};
  const manifest: WorkManifest = {
    schemaVersion: 1,
    id: slug,
    mode,
    status: 'scaffolded',
    ...sourceBlock,
    ...promptBlock,
    output: { path: outputRel },
    artifacts: {
      questions: toRelative(root, paths.questions),
      traceability: toRelative(root, paths.traceability),
      validationJson: toRelative(root, paths.validationJson),
      validationMarkdown: toRelative(root, paths.validationMarkdown),
    },
    createdAt: now,
    updatedAt: now,
  };

  // Write the manifest and empty artifacts.
  mkdirSync(paths.dir, { recursive: true });
  const written: string[] = [];
  const outputAbs = resolveInput(root, outputRel);
  mkdirSync(resolve(outputAbs, '..'), { recursive: true });
  writeFileSync(outputAbs, '');
  written.push(outputRel);
  writeFileSync(paths.questions, QUESTIONS_TEMPLATE);
  written.push(toRelative(root, paths.questions));
  writeFileSync(paths.traceability, TRACEABILITY_TEMPLATE);
  written.push(toRelative(root, paths.traceability));
  writeFileSync(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  written.push(toRelative(root, paths.manifest));

  const work: Record<string, unknown> = {
    id: slug,
    mode,
    status: 'scaffolded',
    ...(mode === 'convert' ? { source: sourceRel, sourceHash } : { prompt }),
    output: outputRel,
  };

  const response = buildResponse(
    {
      command: 'new',
      ok: true,
      root,
      next: nextForStatus(slug, 'scaffolded', sourceRel),
    },
    { work, written },
  );

  const pretty = [
    `Created work item "${slug}" (${mode}, scaffolded).`,
    ...written.map((p) => `  wrote ${p}`),
  ].join('\n');

  emit(context.emitter, response, pretty);
  return 0;
}