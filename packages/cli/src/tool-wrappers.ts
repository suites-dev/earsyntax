/**
 * Thin per-agent wrapper files written by `init --tools`.
 *
 * Every wrapper is a pointer to the same CLI loop: call
 * `earsyntax instructions <mode> --json`, write the `.ears` file, then call
 * `earsyntax validate --json` and repair until it is clean. Wrappers never fork
 * or paraphrase the rules; the CLI is the single source of truth.
 */

/** A file a tool wrapper writes: a root-relative path and its content. */
export interface WrapperFile {
  path: string;
  content: string;
}

/** Marker wrapping the injected AGENTS.md section so it can be detected and replaced. */
export const AGENTS_START = '<!-- earsyntax:start -->';
export const AGENTS_END = '<!-- earsyntax:end -->';

function claudeCommand(mode: 'author' | 'convert' | 'repair'): string {
  const verb =
    mode === 'author'
      ? 'Author EARS requirements from a prompt'
      : mode === 'convert'
        ? 'Convert a source spec into EARS requirements'
        : 'Repair EARS requirements after validation diagnostics';
  return [
    `# /earsyntax-${mode}`,
    '',
    `${verb}. This command is a thin wrapper around the \`earsyntax\` facade; the CLI returns the rules to follow.`,
    '',
    '1. Run `earsyntax instructions ' +
      mode +
      ' --work <id> --json` and follow the returned rules exactly.',
    '2. Write the `.ears` file, and maintain `questions.md` and `traceability.json`.',
    '3. Run `earsyntax validate <output>.ears --json`.',
    '4. If it reports error diagnostics, run `earsyntax instructions repair --work <id> --json` and fix only what the diagnostics justify. Repeat until validation is clean.',
    '',
    'Do not invent behavior the source does not state. Put ambiguity in `questions.md`.',
    '',
  ].join('\n');
}

const AGENTS_SECTION = [
  AGENTS_START,
  '## EARS requirements (earsyntax)',
  '',
  'When asked to write or repair EARS `.ears` requirements, drive the `earsyntax` facade:',
  '',
  '1. `earsyntax instructions <author|convert|repair|review> --work <id> --json` returns the rules. Follow them exactly.',
  '2. Write the `.ears` file (one requirement per line, stable REQ IDs), then `earsyntax validate <output>.ears --json`.',
  '3. Repair by diagnostic code until validation is clean. A human runs `earsyntax accept`.',
  '',
  'Do not invent behavior the source does not state; record ambiguity in `questions.md`.',
  AGENTS_END,
  '',
].join('\n');

const CURSOR_RULES = [
  '---',
  'description: Drive EARS requirement authoring through the earsyntax CLI facade',
  'globs: ["**/*.ears"]',
  '---',
  '',
  '# EARS requirements via earsyntax',
  '',
  'Author and repair `.ears` files only through the `earsyntax` facade:',
  '',
  '1. `earsyntax instructions <author|convert|repair|review> --work <id> --json` returns the rules; follow them exactly.',
  '2. Write the `.ears` file, then `earsyntax validate <output>.ears --json`.',
  '3. Fix by diagnostic code until validation is clean. Acceptance is a human step (`earsyntax accept`).',
  '',
  'Do not invent behavior the source does not state; put ambiguity in `questions.md`.',
  '',
].join('\n');

/** The wrapper files for one tool, as root-relative paths and content. */
export function wrapperFilesFor(tool: string): WrapperFile[] {
  switch (tool) {
    case 'claude':
      return [
        { path: '.claude/commands/earsyntax-author.md', content: claudeCommand('author') },
        { path: '.claude/commands/earsyntax-convert.md', content: claudeCommand('convert') },
        { path: '.claude/commands/earsyntax-repair.md', content: claudeCommand('repair') },
      ];
    case 'cursor':
      return [{ path: '.cursor/rules/earsyntax.mdc', content: CURSOR_RULES }];
    case 'codex':
      // codex uses an AGENTS.md section, handled specially by init (append or
      // replace the marked section rather than clobbering a user-owned file).
      return [{ path: 'AGENTS.md', content: AGENTS_SECTION }];
    default:
      return [];
  }
}

/** The set of tool names `init --tools` understands. */
export const KNOWN_TOOLS = new Set(['claude', 'codex', 'cursor']);