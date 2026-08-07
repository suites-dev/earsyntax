/**
 * Shared renderer primitives for `earsyntax init`.
 *
 * Every wrapper this module produces is thin: it never duplicates the EARS
 * protocol, it points the agent at `earsyntax instructions` and `earsyntax
 * validate` and tells it to loop until clean. The rendered bytes are
 * deterministic (no timestamps, no host paths beyond the configured hosts) so
 * running `init` twice produces byte-identical files.
 *
 * Two kinds of output exist. An {@link RenderedFile} is a file earsyntax owns
 * whole (a Claude command, a Cursor rule, a Kiro steering doc). A
 * {@link ManagedContribution} is a block spliced into a file earsyntax shares
 * with other tools (`AGENTS.md`, `GEMINI.md`) between begin/end markers, leaving
 * the rest of that file untouched.
 */

/** The built-in host profile names, in render order. Used when no `--host` is set. */
export const BUILTIN_HOSTS = ['kiro', 'speckit', 'openspec'] as const;

/** The four instruction phases an agent runs, in loop order. */
export const PHASES = ['author', 'convert', 'repair', 'review'] as const;
export type Phase = (typeof PHASES)[number];

/** Markers bounding earsyntax's managed section inside a shared markdown file. */
export const MANAGED_BEGIN = '<!-- earsyntax:begin -->';
export const MANAGED_END = '<!-- earsyntax:end -->';

/** A file earsyntax owns whole; `path` is repo-root-relative POSIX. */
export interface RenderedFile {
  path: string;
  content: string;
}

/**
 * A block earsyntax splices into a shared file. `id` dedupes contributions that
 * render identically (codex and generic both contribute the same agent-loop
 * block); `file` is the repo-root-relative shared file it lands in.
 */
export interface ManagedContribution {
  file: string;
  id: string;
  block: string;
}

/** What one requested agent or host renders: owned files and shared-file blocks. */
export interface Contribution {
  owned: RenderedFile[];
  managed: ManagedContribution[];
}

/** An empty contribution, the base every renderer extends. */
export function emptyContribution(): Contribution {
  return { owned: [], managed: [] };
}

/**
 * The `--profile` token a host-agnostic wrapper uses, plus a note. With one
 * configured host the token is that host's name; with several it is the
 * `<profile>` placeholder and the note lists the choices so the agent picks the
 * one matching the document it edits.
 */
export function profileContext(hosts: readonly string[]): { token: string; note: string } {
  const configured = hosts.length > 0 ? hosts : [...BUILTIN_HOSTS];
  if (configured.length === 1) {
    return { token: configured[0], note: '' };
  }
  return {
    token: '<profile>',
    note: `Set <profile> to the host that matches the document: ${configured.join(', ')}.`,
  };
}

/** Options for {@link loopSteps}: which phase, which file token, which profile token. */
export interface LoopOptions {
  /** A fixed phase, or undefined for the `<author|convert|repair|review>` placeholder. */
  phase?: Phase;
  /** The `--file` token: `$ARGUMENTS` for Claude, a `<requirements-file>` placeholder elsewhere. */
  file: string;
  /** The `--profile` token: a host name or `<profile>`. */
  profile: string;
}

/**
 * The thin protocol, one instruction per line. This is the whole contract a
 * wrapper carries: run instructions, follow them, edit only the host file,
 * re-validate, repeat, never approve. It never restates an EARS rule.
 */
export function loopSteps(options: LoopOptions): string[] {
  const phase = options.phase ?? '<author|convert|repair|review>';
  return [
    `Run: earsyntax instructions ${phase} --file ${options.file} --profile ${options.profile} --json`,
    'Follow the returned rules exactly.',
    'Edit only the host file passed to --file.',
    `Run: earsyntax validate ${options.file} --profile ${options.profile} --json`,
    'Repeat until validate reports zero errors.',
    'Do not approve, accept, or merge.',
  ];
}

/**
 * Splice a managed region carrying `block` into `existing`. Returns the new file
 * content. Absent file: the region alone. Markers present: the region between
 * them is replaced and the rest is preserved byte for byte. Markers absent: the
 * region is appended after one blank line. Idempotent: re-splicing an identical
 * block over its own output returns identical bytes.
 */
export function spliceManaged(existing: string | undefined, block: string): string {
  const region = `${MANAGED_BEGIN}\n${block}\n${MANAGED_END}`;
  if (existing === undefined) {
    return `${region}\n`;
  }
  const beginIdx = existing.indexOf(MANAGED_BEGIN);
  const endIdx = existing.indexOf(MANAGED_END);
  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    const before = existing.slice(0, beginIdx);
    const after = existing.slice(endIdx + MANAGED_END.length);
    return `${before}${region}${after}`;
  }
  const base = existing.endsWith('\n') ? existing : `${existing}\n`;
  return `${base}\n${region}\n`;
}
