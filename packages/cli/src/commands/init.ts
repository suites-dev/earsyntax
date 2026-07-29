/**
 * `earsyntax init` — create `.earsyntax/` and optional agent wrapper files.
 *
 * Refuses to overwrite an existing `.earsyntax/` (or an existing tool wrapper
 * file) without `--force`, returning exit 3. The workflow works with
 * `--tools none`; wrappers are a convenience layer.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { CommandContext } from '../context.js';
import { refusalError, usageError } from '../errors.js';
import { defaultConfig, earsyntaxDir, toRelative } from '../project.js';
import { buildResponse, emit } from '../response.js';
import {
  AGENTS_END,
  AGENTS_START,
  KNOWN_TOOLS,
  type WrapperFile,
  wrapperFilesFor,
} from '../tool-wrappers.js';

function resolveTools(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === '') {
    return [];
  }
  if (raw.trim() === 'none') {
    return [];
  }
  const tools = raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '');
  for (const tool of tools) {
    if (!KNOWN_TOOLS.has(tool)) {
      throw usageError(
        'init.bad_tools',
        `Unknown tool "${tool}" in --tools. Expected: claude, codex, cursor, or none.`,
      );
    }
  }
  return [...new Set(tools)];
}

/** Merge the earsyntax section into an existing or new AGENTS.md, returning its content. */
function mergeAgentsFile(existing: string | undefined, section: string): string {
  if (existing === undefined) {
    return section;
  }
  const startIdx = existing.indexOf(AGENTS_START);
  const endIdx = existing.indexOf(AGENTS_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existing.slice(0, startIdx);
    const after = existing.slice(endIdx + AGENTS_END.length);
    return `${before}${section.trim()}${after}`;
  }
  const separator = existing.endsWith('\n') ? '\n' : '\n\n';
  return `${existing}${separator}${section}`;
}

export function initCommand(context: CommandContext): number {
  const root = context.cwd;
  const force = context.args.booleans.has('force');
  const tools = resolveTools(context.args.values.get('tools'));

  const earsDir = earsyntaxDir(root);
  if (existsSync(earsDir) && !force) {
    throw refusalError(
      'init.exists',
      'An .earsyntax/ directory already exists. Pass --force to reinitialize.',
    );
  }

  // Collect every wrapper file up front so overwrite protection can run before
  // any write. AGENTS.md is merged, not clobbered, so it is exempt.
  const wrappers: WrapperFile[] = tools.flatMap((tool) => wrapperFilesFor(tool));
  for (const wrapper of wrappers) {
    if (wrapper.path === 'AGENTS.md') {
      continue;
    }
    if (existsSync(resolve(root, wrapper.path)) && !force) {
      throw refusalError(
        'init.wrapper_exists',
        `Refusing to overwrite ${wrapper.path} without --force.`,
        { path: wrapper.path },
      );
    }
  }

  const written: string[] = [];
  const writeFile = (relPath: string, content: string): void => {
    const abs = resolve(root, relPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    written.push(relPath);
  };

  // Core workspace.
  mkdirSync(earsDir, { recursive: true });
  writeFile('.earsyntax/config.json', `${JSON.stringify(defaultConfig(tools), null, 2)}\n`);
  writeFile('.earsyntax/work/.gitkeep', '');

  // Tool wrappers.
  for (const wrapper of wrappers) {
    if (wrapper.path === 'AGENTS.md') {
      const abs = resolve(root, 'AGENTS.md');
      const existing = existsSync(abs) ? readFileSync(abs, 'utf8') : undefined;
      writeFileSync(abs, mergeAgentsFile(existing, wrapper.content));
      written.push('AGENTS.md');
    } else {
      writeFile(wrapper.path, wrapper.content);
    }
  }

  const response = buildResponse(
    {
      command: 'init',
      ok: true,
      root,
      next: [
        {
          command: 'earsyntax new <slug> --source specs/source.md --json',
          reason: 'Create a work item for a source spec.',
          forAgent: true,
        },
      ],
    },
    { written, tools },
  );

  const pretty = [
    `Initialized earsyntax in ${toRelative(root, earsDir)}`,
    ...written.map((p) => `  wrote ${p}`),
    tools.length > 0 ? `  tools: ${tools.join(', ')}` : '  tools: none',
  ].join('\n');

  emit(context.emitter, response, pretty);
  return 0;
}
