/**
 * `earsyntax instructions <author|convert|repair|review> --file <path> [--from <source>]`
 * — return the deterministic rules an agent follows for one loop step against a
 * host file.
 *
 * The command is read-only. It returns the rules, the active profile locator and
 * dialect, an edit policy, and (for `repair` and `review`) the findings the
 * validate pipeline reports on `--file`. It never edits the host file, never
 * converts content semantically, never reads or transforms a `--from` source,
 * and never calls an LLM. The instruction body never tells an agent to approve,
 * accept, or merge, and never references a workspace, work item, or manifest.
 *
 * Modes:
 * - `author`: write new EARS requirements into the host file requirements region.
 * - `convert`: rewrite natural-language requirements already in the host file.
 * - `repair`: fix the reported findings; the findings are embedded.
 * - `review`: read-only assessment; the findings are embedded, no edits.
 *
 * `--from <source>` is valid only with `author` and `convert`; it names an input
 * spec the agent reads while writing EARS into `--file`. The CLI only points at
 * it.
 *
 * Exit codes: `0` on success (this command never returns `1`; only `validate`
 * does), `2` on a usage or environment failure (unknown or missing mode, missing
 * `--file` flag, unknown profile, `--from` on a non-author/convert mode, or a
 * required `--file`/convert source that is missing or unreadable).
 */

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';
import { type Profile, resolveProfile } from '@earsyntax/core';
import { type PipelineFile, runPipeline } from '@earsyntax/extract';
import { canonicalizeFindings, type Findings } from '@earsyntax/cli-contract';
import type { CommandContext, CommandResult } from '../context.js';
import type { NextAction } from '../facade-types.js';
import { usageError } from '../errors.js';
import { resolveInput } from '../paths.js';
import { buildResponse } from '../response.js';
import {
  buildDialect,
  buildLocator,
  buildRules,
  type DialectPayload,
  type InstructionMode,
  isInstructionMode,
  type LocatorPayload,
  modeAcceptsSource,
} from '../rules.js';

/** The edit policy: which file the agent may change, and that structure is preserved. */
interface EditPolicy {
  editableFile: string;
  preserveStructure: true;
}

/** The output policy is always in-place editing of the host file. */
const OUTPUT_POLICY = 'edit-in-place';

/**
 * The path recorded on the payload and findings for a file. Absolute when the
 * caller passed an absolute path, otherwise a cwd-relative POSIX path, matching
 * the `validate` command so a follow-up validate targets the same string.
 */
function displayPath(userPath: string, cwd: string): string {
  if (isAbsolute(userPath)) {
    return userPath;
  }
  const abs = resolveInput(cwd, userPath);
  return relative(cwd, abs).split(sep).join('/');
}

/** Resolve the mode positional, or throw an exit-2 usage error. */
function resolveMode(positionals: string[]): InstructionMode {
  const raw = positionals.at(0);
  if (raw === undefined) {
    throw usageError(
      'instructions.missing_mode',
      'Provide a mode: author, convert, repair, or review.',
    );
  }
  if (!isInstructionMode(raw)) {
    throw usageError(
      'instructions.unknown_mode',
      `Unknown mode "${raw}". Use author, convert, repair, or review.`,
    );
  }
  return raw;
}

/** Read a required host file for a mode that needs its content, or throw exit 2. */
function readHostFile(userPath: string, cwd: string, code: string): string {
  const abs = resolveInput(cwd, userPath);
  if (!existsSync(abs)) {
    throw usageError(code, `File not found: ${userPath}.`, { path: userPath });
  }
  try {
    return readFileSync(abs, 'utf8');
  } catch {
    throw usageError('instructions.unreadable', `Could not read file: ${userPath}.`, {
      path: userPath,
    });
  }
}

/** Run the validate pipeline on the host file and return the canonicalized findings. */
function collectFindings(
  displayFile: string,
  content: string,
  profile: Profile,
  strict: boolean,
): Findings {
  const file: PipelineFile = { path: displayFile, content };
  const { findings } = runPipeline({ files: [file], profile, strict });
  return canonicalizeFindings(findings);
}

/** The `next` action: re-run validation on the same file with the matching profile. */
function buildNext(displayFile: string, profile: Profile, mode: InstructionMode): NextAction[] {
  const reason =
    mode === 'review'
      ? 'Reproduce the validation status this review reports.'
      : 'Validate the host file after editing and repeat until no error-severity finding remains.';
  return [
    {
      command: `earsyntax validate ${displayFile} --profile ${profile.name} --json`,
      reason,
      forAgent: true,
    },
  ];
}

/** Render the human-readable instruction summary. */
function renderPretty(payload: {
  mode: InstructionMode;
  file: string;
  profileName: string;
  sourceFile?: string;
  locator: LocatorPayload;
  rules: string[];
  findings?: Findings;
  next: NextAction[];
}): string {
  const lines: string[] = [];
  lines.push(`instructions ${payload.mode} for ${payload.file} (profile ${payload.profileName})`);
  if (payload.sourceFile !== undefined) {
    lines.push(`source (read-only): ${payload.sourceFile}`);
  }
  lines.push(`locator: ${payload.locator.summary}`);
  lines.push('rules:');
  for (const rule of payload.rules) {
    lines.push(`  - ${rule}`);
  }
  if (payload.findings !== undefined) {
    const { requirements, errors, warnings } = payload.findings.summary;
    lines.push(
      `findings: ${requirements} requirement(s), ${errors} error(s), ${warnings} warning(s)`,
    );
  }
  const next = payload.next.at(0);
  if (next !== undefined) {
    lines.push(`next: ${next.command}`);
  }
  return lines.join('\n');
}

/**
 * Run the `instructions` command: validate flags, gather findings for the
 * findings-bearing modes, assemble the payload, and frame the result.
 *
 * @param context The command context (parsed args, globals, cwd, emitter).
 * @returns The {@link CommandResult}; the dispatcher performs the single write.
 */
export function instructionsCommand(context: CommandContext): CommandResult {
  const { args, global, cwd } = context;
  const mode = resolveMode(args.positionals);

  const fileArg = args.values.get('file');
  if (fileArg === undefined) {
    throw usageError('instructions.missing_file_flag', 'The --file <path> option is required.');
  }

  const sourceArg = args.values.get('from');
  if (sourceArg !== undefined && !modeAcceptsSource(mode)) {
    throw usageError(
      'instructions.from_not_allowed',
      `The --from source is only valid with author and convert, not ${mode}.`,
    );
  }

  const resolved = resolveProfile(global.profile);
  if (!resolved.ok) {
    throw usageError('cli.unknown_profile', resolved.error.message);
  }
  const profile = resolved.profile;

  const file = displayPath(fileArg, cwd);
  const sourceFile = sourceArg === undefined ? undefined : displayPath(sourceArg, cwd);

  // File-existence policy by mode. `repair` and `review` read the host file to
  // run the pipeline, so it must exist. `convert` without a source transforms
  // content already in the host file, so it must exist too. `author`, and any
  // mode given a `--from` source, may target a host file that does not exist
  // yet; the rules tell the agent to create the requirements region.
  let findings: Findings | undefined;
  if (mode === 'repair' || mode === 'review') {
    const content = readHostFile(fileArg, cwd, 'instructions.missing_file');
    findings = collectFindings(file, content, profile, global.strict);
  } else if (mode === 'convert' && sourceArg === undefined) {
    readHostFile(fileArg, cwd, 'instructions.missing_file');
  }

  const locator = buildLocator(profile);
  const dialect: DialectPayload = buildDialect(profile);
  const rules = buildRules({ mode, hasSource: sourceArg !== undefined, findings });
  const editPolicy: EditPolicy = { editableFile: file, preserveStructure: true };
  const next = buildNext(file, profile, mode);

  const response = buildResponse(
    { command: `instructions ${mode}`, ok: true, next },
    {
      mode,
      file,
      profile: profile.name,
      ...(sourceFile === undefined ? {} : { sourceFile, sourcePolicy: 'read-only' }),
      locator,
      dialect,
      rules,
      editPolicy,
      outputPolicy: OUTPUT_POLICY,
      ...(findings === undefined ? {} : { findings }),
    },
  );

  const pretty = renderPretty({
    mode,
    file,
    profileName: profile.name,
    sourceFile,
    locator,
    rules,
    findings,
    next,
  });

  return global.quiet && !global.json
    ? { response, pretty: '', exitCode: 0 }
    : { response, pretty, exitCode: 0 };
}
