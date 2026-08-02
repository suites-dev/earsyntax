/**
 * `earsyntax validate <paths...|->` — stateless EARS validation.
 *
 * Locate, extract, parse, and lint EARS in the given files (or stdin `-`) under
 * the active profile, and return the frozen Findings model. This command is
 * stateless: it works in any directory, knows nothing about a `.earsyntax/`
 * workspace, records no manifest, and never edits source. It is the only command
 * that returns exit 1 (an error-severity finding).
 *
 * The heavy lifting lives in `@earsyntax/extract`'s {@link runPipeline}; this
 * module only resolves flags, reads inputs, maps pipeline notices onto the
 * facade-level `diagnostics` channel, and frames the response. Extraction is not
 * reimplemented here.
 *
 * Exit codes: `0` no error findings, `1` at least one error finding, `2` usage
 * or environment failure (unknown profile, missing/unreadable path, bad flag
 * combination). A missing file is an environment failure (exit 2), never a lint
 * finding.
 */

import { existsSync, globSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';
import { type Profile, resolveProfile } from '@earsyntax/core';
import {
  type DocumentKind,
  inferKind,
  type PipelineFile,
  type PipelineNotice,
  runPipeline,
} from '@earsyntax/extract';
import {
  buildSarifLog,
  canonicalizeFindings,
  EXIT_USAGE,
  exitCodeForFindings,
  type Findings,
  serializeSarifLog,
} from '@earsyntax/cli-contract';
import type { CommandContext, CommandResult } from '../context.js';
import type { FacadeDiagnostic, FacadeResponse, NextAction } from '../facade-types.js';
import { buildResponse } from '../response.js';
import { resolveInput } from '../paths.js';

/** Characters that mark a positional as a glob pattern rather than a literal path. */
const GLOB_CHARS = /[*?[\]{}]/;

/** The document kinds the pipeline understands, for narrowing a profile's first kind. */
const KNOWN_KINDS: readonly DocumentKind[] = ['ears', 'text', 'markdown', 'yaml', 'json'];

/** The disk and stdin access the command needs, injectable so tests stay hermetic. */
export interface ValidateDeps {
  /** Whether a path exists on disk. */
  exists(absPath: string): boolean;
  /** Read a file's UTF-8 content; throws when the file is unreadable. */
  readFile(absPath: string): string;
  /** Expand a glob pattern against `cwd`, returning cwd-relative matches. */
  glob(pattern: string, cwd: string): string[];
  /** Read all of stdin as one UTF-8 document. */
  readStdin(): string;
}

/** The resolved inputs {@link runValidate} works from. */
export interface ValidateInputs {
  /** Positional paths, glob patterns, or `-` for stdin. */
  paths: string[];
  /** The `--profile` value (defaults to `strict` at the call site). */
  profileName: string;
  /** `--strict`: upgrade surviving warnings to errors at the findings layer. */
  strict: boolean;
  /** `--sarif`: emit a SARIF 2.1.0 log as raw stdout instead of the envelope. */
  sarif: boolean;
  /** `--json`: JSON output. Used only to reject the `--json --sarif` conflict in-band. */
  json: boolean;
  /** The resolved working directory paths and globs resolve against. */
  cwd: string;
}

/** The framed outcome of a validation: the response, its pretty text, and the exit code. */
export interface ValidateResult {
  response: FacadeResponse;
  pretty: string;
  exitCode: number;
  /**
   * Raw stdout that replaces the envelope entirely, set only under `--sarif`: a
   * serialized SARIF 2.1.0 log. The dispatcher writes it verbatim.
   */
  raw?: string;
}

/** The default deps: real disk and stdin access. */
const DEFAULT_DEPS: ValidateDeps = {
  exists: (absPath) => existsSync(absPath),
  readFile: (absPath) => readFileSync(absPath, 'utf8'),
  glob: (pattern, cwd) => globSync(pattern, { cwd }),
  readStdin: () => readFileSync(0, 'utf8'),
};

/** One resolved input file, ready for the pipeline and for a missing/unreadable check. */
interface ResolvedFile {
  pipelineFile: PipelineFile;
}

/** The outcome of resolving the positional inputs into pipeline files. */
type ResolveInputsOutcome =
  { ok: true; files: PipelineFile[] } | { ok: false; result: ValidateResult };

/**
 * Run a stateless validation and frame the result.
 *
 * Never throws for user error: unknown profile, missing or unreadable path, no
 * inputs, and the `--json --sarif` conflict are all returned in-band as an
 * exit-2 {@link ValidateResult} carrying a facade-level diagnostic. Extraction
 * and linting are delegated to {@link runPipeline}.
 *
 * @param inputs The resolved flags and positional paths.
 * @param deps Injectable disk and stdin access; defaults to real I/O.
 * @returns The response, pretty text, and exit code.
 */
export function runValidate(
  inputs: ValidateInputs,
  deps: ValidateDeps = DEFAULT_DEPS,
): ValidateResult {
  // `--json` and `--sarif` are mutually exclusive. The dispatcher rejects the
  // combination before reaching a handler; this in-band guard covers direct
  // callers of runValidate so the invariant holds either way. Same code as the
  // dispatcher's guard (cli.exclusive_flags), so the two never diverge.
  if (inputs.sarif && inputs.json) {
    return usageResult(
      'cli.exclusive_flags',
      'The --json and --sarif flags are mutually exclusive.',
    );
  }

  const resolved = resolveProfile(inputs.profileName);
  if (!resolved.ok) {
    return usageResult('cli.unknown_profile', resolved.error.message);
  }
  const profile = resolved.profile;

  if (inputs.paths.length === 0) {
    return usageResult('validate.no_files', 'Provide one or more files, globs, or - for stdin.');
  }

  const outcome = resolveInputs(inputs.paths, profile, inputs.cwd, deps);
  if (!outcome.ok) {
    return outcome.result;
  }
  if (outcome.files.length === 0) {
    return usageResult('validate.no_files', 'No files matched the given paths or globs.');
  }

  const { findings, notices } = runPipeline({
    files: outcome.files,
    profile,
    strict: inputs.strict,
  });

  return frame(canonicalizeFindings(findings), notices, profile, inputs.sarif);
}

/** Resolve the positional inputs into pipeline files, or an exit-2 result. */
function resolveInputs(
  paths: string[],
  profile: Profile,
  cwd: string,
  deps: ValidateDeps,
): ResolveInputsOutcome {
  const files: PipelineFile[] = [];
  let readStdin = false;

  for (const path of paths) {
    if (path === '-') {
      if (readStdin) {
        return {
          ok: false,
          result: usageResult('validate.duplicate_stdin', 'Read stdin (-) at most once.'),
        };
      }
      readStdin = true;
      files.push({ path: '-', content: deps.readStdin(), kind: stdinKind(profile) });
      continue;
    }

    if (GLOB_CHARS.test(path)) {
      const matches = deps.glob(path, cwd).sort((a, b) => a.localeCompare(b));
      for (const match of matches) {
        const resolvedFile = readResolved(match, cwd, deps);
        if (!resolvedFile.ok) {
          return { ok: false, result: resolvedFile.result };
        }
        files.push(resolvedFile.file.pipelineFile);
      }
      continue;
    }

    const resolvedFile = readResolved(path, cwd, deps);
    if (!resolvedFile.ok) {
      return { ok: false, result: resolvedFile.result };
    }
    files.push(resolvedFile.file.pipelineFile);
  }

  return { ok: true, files };
}

/** Read one literal or glob-matched path into a pipeline file, or an exit-2 result. */
function readResolved(
  userPath: string,
  cwd: string,
  deps: ValidateDeps,
): { ok: true; file: ResolvedFile } | { ok: false; result: ValidateResult } {
  const abs = resolveInput(cwd, userPath);
  if (!deps.exists(abs)) {
    return {
      ok: false,
      result: usageResult('validate.missing_file', `File not found: ${userPath}.`, userPath),
    };
  }
  let content: string;
  try {
    content = deps.readFile(abs);
  } catch {
    return {
      ok: false,
      result: usageResult('validate.unreadable', `Could not read file: ${userPath}.`, userPath),
    };
  }
  return {
    ok: true,
    file: {
      pipelineFile: {
        path: displayPath(userPath, abs, cwd),
        content,
        kind: inferKind(abs),
      },
    },
  };
}

/**
 * The path recorded on findings for a file. Absolute when the caller passed an
 * absolute path, otherwise a cwd-relative POSIX path (per the Findings contract).
 */
function displayPath(userPath: string, abs: string, cwd: string): string {
  if (isAbsolute(userPath)) {
    return userPath;
  }
  return relative(cwd, abs).split(sep).join('/');
}

/** The document kind to read stdin as: the profile's first located kind, else text. */
function stdinKind(profile: Profile): DocumentKind {
  const first = profile.locator.documentKinds.at(0);
  if (first !== undefined && (KNOWN_KINDS as readonly string[]).includes(first)) {
    return first as DocumentKind;
  }
  return 'text';
}

/**
 * Frame a completed pipeline run into a response, pretty text, and exit code.
 *
 * Under `--sarif`, a serialized SARIF 2.1.0 projection of the findings is set as
 * `raw`, which the dispatcher writes verbatim in place of the envelope. The exit
 * code stays findings-driven regardless of output format.
 */
function frame(
  findings: Findings,
  notices: PipelineNotice[],
  profile: Profile,
  sarif: boolean,
): ValidateResult {
  const diagnostics = notices.map(noticeToDiagnostic);
  const environmentError = notices.some((notice) => notice.severity === 'error');
  const ok = !environmentError && findings.summary.errors === 0;
  const exitCode = environmentError ? EXIT_USAGE : exitCodeForFindings(findings);

  const next = buildNext(findings, profile);
  const response = buildResponse(
    {
      command: 'validate',
      ok,
      ...(diagnostics.length > 0 ? { diagnostics } : {}),
      next,
    },
    { findings },
  );

  const framed: ValidateResult = {
    response,
    pretty: prettyFindings(findings, diagnostics),
    exitCode,
  };
  if (sarif) {
    framed.raw = serializeSarifLog(buildSarifLog(findings));
  }
  return framed;
}

/** Map a pipeline notice onto the facade-level diagnostic channel. */
function noticeToDiagnostic(notice: PipelineNotice): FacadeDiagnostic {
  return {
    code: notice.code,
    severity: notice.severity,
    message: notice.message,
    ...(notice.file === undefined ? {} : { path: notice.file }),
    ...(notice.line === undefined ? {} : { line: notice.line }),
  };
}

/** A repair `next` action pointing at the first file that carries an error finding. */
function buildNext(findings: Findings, profile: Profile): NextAction[] {
  if (findings.summary.errors === 0) {
    return [];
  }
  const erroredFile = findings.diagnostics.find(
    (diagnostic) => diagnostic.severity === 'error' && diagnostic.file !== '-',
  )?.file;
  if (erroredFile === undefined) {
    return [];
  }
  return [
    {
      command: `earsyntax instructions repair --file ${erroredFile} --profile ${profile.name} --json`,
      reason: 'Get repair rules for the reported diagnostics.',
      forAgent: true,
    },
  ];
}

/** Pretty output: one line per finding, then per notice, then a summary line. */
function prettyFindings(findings: Findings, diagnostics: FacadeDiagnostic[]): string {
  const lines: string[] = [];
  for (const diagnostic of findings.diagnostics) {
    const col = diagnostic.col === undefined ? '' : `:${diagnostic.col}`;
    lines.push(
      `${diagnostic.file}:${diagnostic.line}${col} ${diagnostic.id} ${diagnostic.severity} ${diagnostic.message}`,
    );
  }
  for (const diagnostic of diagnostics) {
    const at = diagnostic.line === undefined ? '' : `:${diagnostic.line}`;
    lines.push(
      `${diagnostic.path ?? ''}${at} ${diagnostic.severity} ${diagnostic.code} ${diagnostic.message}`,
    );
  }
  const { valid, requirements, files, errors, warnings } = findings.summary;
  lines.push(
    `${valid}/${requirements} valid across ${files} file(s), ${errors} error(s), ${warnings} warning(s)`,
  );
  return lines.join('\n');
}

/** Build an exit-2 usage/environment result carrying a single facade diagnostic. */
function usageResult(code: string, message: string, path?: string): ValidateResult {
  const diagnostic: FacadeDiagnostic = {
    code,
    severity: 'error',
    message,
    ...(path === undefined ? {} : { path }),
  };
  const response = buildResponse({
    command: 'validate',
    ok: false,
    diagnostics: [diagnostic],
    next: [],
  });
  return { response, pretty: `error ${code}: ${message}`, exitCode: 2 };
}

/**
 * The `validate` command handler. Reads the resolved globals and positionals
 * from the context, runs the stateless validation, and returns the
 * {@link CommandResult}; the dispatcher performs the single write. `--quiet`
 * blanks the pretty rendering (JSON output is unaffected, per the facade).
 */
export function validateCommand(context: CommandContext): CommandResult {
  const { global } = context;
  const result = runValidate({
    paths: context.args.positionals,
    profileName: global.profile,
    strict: global.strict,
    sarif: global.sarif,
    json: global.json,
    cwd: context.cwd,
  });
  return global.quiet && !global.json ? { ...result, pretty: '' } : result;
}
