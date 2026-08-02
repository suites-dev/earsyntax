/**
 * `earsyntax extract <paths...|->` — print the requirement candidates the active
 * profile's locator finds, with source positions and the matching locator rule.
 *
 * This is the debugging surface for profiles. It is stateless: no workspace, no
 * manifest, no config. It never lints, so it carries no findings and never
 * returns exit 1; extraction alone decides the output. Exit codes:
 *
 * - `0` success, including a clean run with zero candidates.
 * - `2` a usage or environment failure: no paths, an unknown profile, a missing
 *   or unreadable file, or a malformed structured document (surfaced as an
 *   error-severity notice in the facade `diagnostics` channel).
 *
 * The command reads each file, hands the in-memory content to
 * `@earsyntax/extract`'s {@link extractCandidates}, then projects each pipeline
 * {@link Candidate} into the frozen facade candidate shape
 * `{ file, line, col?, text, profile, locatorRuleId, requirementId? }`
 * (see `docs/refactor/host-native-facade.md`). It never calls an LLM, never
 * mutates or deletes any file, and keeps stdout pure JSON in `--json` mode.
 */

import { existsSync, globSync, readFileSync } from 'node:fs';
import { type Candidate, resolveProfile } from '@earsyntax/core';
import { extractCandidates, type PipelineFile } from '@earsyntax/extract';
import type { CommandContext, CommandResult } from '../context.js';
import type { FacadeDiagnostic } from '../facade-types.js';
import { usageError } from '../errors.js';
import { resolveInput, toRelative } from '../paths.js';
import { buildResponse } from '../response.js';

const GLOB_CHARS = /[*?[\]{}]/;
const STDIN = '-';

/** The facade candidate shape, in the frozen field order the JSON contract fixes. */
interface FacadeCandidate {
  file: string;
  line: number;
  col?: number;
  text: string;
  profile: string;
  locatorRuleId: string;
  requirementId?: string;
}

/** One resolved input source: a real file, or stdin under the sentinel path `-`. */
interface Source {
  /** The path recorded on every candidate (cwd-relative POSIX, or `-`). */
  path: string;
  /** The absolute path on disk, or `undefined` for stdin. */
  abs?: string;
}

/**
 * Expand the positional path arguments into ordered {@link Source}s.
 *
 * A literal path must exist (else exit `2`); a glob expands to its sorted
 * matches; the sentinel `-` names stdin. Paths are recorded relative to the
 * resolved cwd with POSIX separators so candidate `file` fields are stable.
 */
function resolveSources(cwd: string, patterns: readonly string[]): Source[] {
  const sources: Source[] = [];
  for (const pattern of patterns) {
    if (pattern === STDIN) {
      sources.push({ path: STDIN });
      continue;
    }
    if (GLOB_CHARS.test(pattern)) {
      const matches = globSync(pattern, { cwd });
      for (const match of matches.sort((a, b) => a.localeCompare(b))) {
        const abs = resolveInput(cwd, match);
        sources.push({ path: toRelative(cwd, abs), abs });
      }
      continue;
    }
    const abs = resolveInput(cwd, pattern);
    if (!existsSync(abs)) {
      throw usageError('extract.missing_file', `File not found: ${pattern}.`);
    }
    sources.push({ path: toRelative(cwd, abs), abs });
  }
  return sources;
}

/** Read a source's content, throwing a usage error (exit `2`) on an unreadable file. */
function readSource(source: Source): string {
  try {
    // fd 0 is stdin; `readFileSync(0, ...)` drains it synchronously for `-`.
    return source.abs === undefined ? readFileSync(0, 'utf8') : readFileSync(source.abs, 'utf8');
  } catch {
    const label = source.abs === undefined ? 'standard input' : source.path;
    throw usageError('extract.unreadable', `Could not read ${label}.`);
  }
}

/** Project a pipeline {@link Candidate} into the frozen facade candidate order. */
function toFacadeCandidate(candidate: Candidate): FacadeCandidate {
  return {
    file: candidate.file,
    line: candidate.line,
    ...(candidate.col === undefined ? {} : { col: candidate.col }),
    text: candidate.text,
    profile: candidate.profile,
    locatorRuleId: candidate.locatorRuleId,
    ...(candidate.requirementId === undefined ? {} : { requirementId: candidate.requirementId }),
  };
}

/** Render the human-readable listing: one `file:line:col [rule] text` line per candidate. */
function renderPretty(candidates: readonly FacadeCandidate[], quiet: boolean): string {
  const lines = candidates.map((candidate) => {
    const position =
      candidate.col === undefined
        ? `${candidate.file}:${candidate.line}`
        : `${candidate.file}:${candidate.line}:${candidate.col}`;
    const id = candidate.requirementId === undefined ? '' : `${candidate.requirementId} `;
    return `${position} [${candidate.locatorRuleId}] ${id}${candidate.text}`;
  });
  if (quiet) {
    return lines.join('\n');
  }
  if (candidates.length === 0) {
    return 'No candidates found.';
  }
  lines.push(`\n${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`);
  return lines.join('\n');
}

/**
 * Run the `extract` command: locate candidates and build the result.
 *
 * @param context The command context (parsed args, globals, cwd, emitter).
 * @returns The {@link CommandResult}; the dispatcher performs the single write.
 */
export function extractCommand(context: CommandContext): CommandResult {
  const patterns = context.args.positionals;
  if (patterns.length === 0) {
    throw usageError('extract.no_paths', 'Provide one or more files (or `-` for stdin) to extract.');
  }

  const resolved = resolveProfile(context.global.profile);
  if (!resolved.ok) {
    throw usageError('cli.unknown_profile', resolved.error.message);
  }
  const profile = resolved.profile;

  const sources = resolveSources(context.cwd, patterns);
  const files: PipelineFile[] = sources.map((source) => ({
    path: source.path,
    content: readSource(source),
  }));

  const { candidates, notices } = extractCandidates({ files, profile });
  const facadeCandidates = candidates.map(toFacadeCandidate);

  // Notices are the environment/usage channel, never lint findings. An
  // error-severity notice (a malformed structured document) is an environment
  // failure: surface every notice in `diagnostics` and exit 2 while still
  // showing whatever candidates were located.
  const diagnostics: FacadeDiagnostic[] = notices.map((notice) => ({
    code: notice.code,
    severity: notice.severity,
    message: notice.message,
    ...(notice.file === undefined ? {} : { path: notice.file }),
    ...(notice.line === undefined ? {} : { line: notice.line }),
  }));
  const ok = !notices.some((notice) => notice.severity === 'error');

  const summary = { files: files.length, candidates: facadeCandidates.length };
  const response = buildResponse(
    { command: 'extract', ok, diagnostics, next: [] },
    { summary, candidates: facadeCandidates },
  );
  const pretty = renderPretty(facadeCandidates, context.global.quiet);
  return { response, pretty, exitCode: ok ? 0 : 2 };
}
