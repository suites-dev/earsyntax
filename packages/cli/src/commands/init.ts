/**
 * `earsyntax init --agent <agents> --host <hosts>` — render managed agent-wrapper
 * and host-integration files.
 *
 * The command is pure orchestration over the pure renderers in
 * `../renderers`: it resolves the requested agents and hosts, detects the repo
 * root, renders every file, and writes only what changed. It is idempotent, so a
 * second run with the same arguments reports every file as `skipped` and touches
 * no bytes. It never creates `.earsyntax/`, never edits requirement or spec
 * documents, never validates as a side effect, and never calls an LLM.
 *
 * `--tools` is a deprecated alias for `--agent`: it works, folds its agents into
 * the agent set, and adds a warning to `warnings`. It is absent from help.
 *
 * Exit codes: `0` on a successful render (including an all-skipped no-op), `2`
 * for a usage failure (unknown agent or host, no targets requested). Conflicts
 * over already-present files are reported in `skipped` and `warnings`, never via
 * a nonzero exit.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { CommandContext, CommandResult } from '../context.js';
import type { FacadeDiagnostic, FacadeResponse, NextAction } from '../facade-types.js';
import { detectRoot } from '../paths.js';
import { buildResponse } from '../response.js';
import {
  AGENTS,
  type Agent,
  type Contribution,
  HOST_VALIDATE,
  HOSTS,
  type Host,
  renderAgent,
  renderHost,
  spliceManaged,
} from '../renderers/index.js';

/** The disk access init needs, injectable so tests stay hermetic. */
export interface InitDeps {
  exists(absPath: string): boolean;
  readFile(absPath: string): string;
  /** Write `content` to `absPath`, creating parent directories as needed. */
  writeFile(absPath: string, content: string): void;
}

/** The default deps: real disk access with recursive directory creation. */
const DEFAULT_DEPS: InitDeps = {
  exists: (absPath) => existsSync(absPath),
  readFile: (absPath) => readFileSync(absPath, 'utf8'),
  writeFile: (absPath, content) => {
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, content, 'utf8');
  },
};

/** The resolved inputs {@link runInit} works from. */
export interface InitInputs {
  /** The `--agent` value, a comma list, if present. */
  agents?: string;
  /** The deprecated `--tools` value, a comma list, if present. */
  tools?: string;
  /** The `--host` value, a comma list, if present. */
  hosts?: string;
  /** The resolved working directory the repo root is detected from. */
  cwd: string;
}

/** The framed outcome of an init run: response, pretty text, exit code. */
export interface InitResult {
  response: FacadeResponse;
  pretty: string;
  exitCode: number;
}

/** One planned file: its absolute path, its repo-relative path, and its target content. */
interface PlannedFile {
  abs: string;
  rel: string;
  content: string;
}

/**
 * Parse a comma list into canonical members of `order`, deduped and returned in
 * `order`'s sequence. Returns the offending token on the first unknown member.
 */
function resolveNames<T extends string>(
  raw: string | undefined,
  order: readonly T[],
): { ok: true; values: T[] } | { ok: false; unknown: string } {
  if (raw === undefined) {
    return { ok: true, values: [] };
  }
  const requested = new Set<string>();
  for (const token of raw.split(',')) {
    const name = token.trim();
    if (name === '') {
      continue;
    }
    if (!(order as readonly string[]).includes(name)) {
      return { ok: false, unknown: name };
    }
    requested.add(name);
  }
  return { ok: true, values: order.filter((name) => requested.has(name)) };
}

/**
 * Run an init render and frame the result. Never throws for user error: unknown
 * agent or host and an empty target set are returned in-band as exit-2 results.
 */
export function runInit(inputs: InitInputs, deps: InitDeps = DEFAULT_DEPS): InitResult {
  const warnings: string[] = [];

  // `--tools` is a deprecated alias for `--agent`; fold its agents in and warn.
  const agentSource =
    inputs.tools === undefined
      ? inputs.agents
      : [inputs.agents, inputs.tools].filter((value) => value !== undefined).join(',');
  if (inputs.tools !== undefined) {
    warnings.push('The --tools flag is deprecated; use --agent instead.');
  }

  const agents = resolveNames(agentSource, AGENTS);
  if (!agents.ok) {
    return usageResult('init.unknown_agent', `Unknown agent "${agents.unknown}".`);
  }
  const hosts = resolveNames(inputs.hosts, HOSTS);
  if (!hosts.ok) {
    return usageResult('init.unknown_host', `Unknown host "${hosts.unknown}".`);
  }

  if (agents.values.length === 0 && hosts.values.length === 0) {
    return usageResult('init.no_targets', 'Request at least one --agent or --host to render.');
  }

  const root = detectRoot(inputs.cwd) ?? inputs.cwd;
  const contributions: Contribution[] = [
    ...agents.values.map((agent: Agent) => renderAgent(agent, hosts.values)),
    ...hosts.values.map((host: Host) => renderHost(host)),
  ];

  const planned = planFiles(contributions, root, deps);
  return apply(planned, root, agents.values, hosts.values, warnings, deps);
}

/**
 * Turn contributions into a deterministic list of planned files. Owned files
 * pass through by path (later contributions for the same path win, which does
 * not happen across the built-in agents and hosts). Managed contributions are
 * grouped by shared file, deduped by id, ordered by id, and spliced into the
 * file's current content.
 */
function planFiles(contributions: Contribution[], root: string, deps: InitDeps): PlannedFile[] {
  const owned = new Map<string, string>();
  const managed = new Map<string, Map<string, string>>();

  for (const contribution of contributions) {
    for (const file of contribution.owned) {
      owned.set(file.path, file.content);
    }
    for (const block of contribution.managed) {
      const byId = managed.get(block.file) ?? new Map<string, string>();
      byId.set(block.id, block.block);
      managed.set(block.file, byId);
    }
  }

  const planned: PlannedFile[] = [];
  for (const [rel, content] of owned) {
    planned.push({ abs: resolve(root, rel), rel, content });
  }
  for (const [rel, byId] of managed) {
    const abs = resolve(root, rel);
    const blocks = [...byId.keys()].sort().map((id) => byId.get(id) ?? '');
    const existing = deps.exists(abs) ? deps.readFile(abs) : undefined;
    planned.push({ abs, rel, content: spliceManaged(existing, blocks.join('\n\n')) });
  }
  return planned.sort((a, b) => a.rel.localeCompare(b.rel));
}

/** Write each planned file that changed and frame the response. */
function apply(
  planned: PlannedFile[],
  root: string,
  agents: Agent[],
  hosts: Host[],
  warnings: string[],
  deps: InitDeps,
): InitResult {
  const written: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];

  for (const file of planned) {
    if (!deps.exists(file.abs)) {
      deps.writeFile(file.abs, file.content);
      written.push(file.rel);
      continue;
    }
    if (deps.readFile(file.abs) === file.content) {
      skipped.push(file.rel);
      continue;
    }
    deps.writeFile(file.abs, file.content);
    updated.push(file.rel);
  }

  const next: NextAction[] = hosts.map((host) => ({
    command: HOST_VALIDATE[host].command,
    reason: `Validate ${host} requirements with the ${host} profile.`,
  }));

  const response = buildResponse(
    { command: 'init', ok: true, root, next },
    {
      agents,
      hosts,
      written: written.sort(),
      updated: updated.sort(),
      skipped: skipped.sort(),
      warnings,
    },
  );
  return { response, pretty: prettyInit(root, written, updated, skipped, warnings), exitCode: 0 };
}

/** Pretty output: the root, then one line per file bucket, then any warnings. */
function prettyInit(
  root: string,
  written: string[],
  updated: string[],
  skipped: string[],
  warnings: string[],
): string {
  const lines = [
    `root ${root}`,
    `written ${written.length}, updated ${updated.length}, skipped ${skipped.length}`,
  ];
  for (const rel of [...written].sort()) {
    lines.push(`  + ${rel}`);
  }
  for (const rel of [...updated].sort()) {
    lines.push(`  ~ ${rel}`);
  }
  for (const rel of [...skipped].sort()) {
    lines.push(`  = ${rel}`);
  }
  for (const warning of warnings) {
    lines.push(`warning ${warning}`);
  }
  return lines.join('\n');
}

/** Build an exit-2 usage result carrying a single facade diagnostic. */
function usageResult(code: string, message: string): InitResult {
  const diagnostic: FacadeDiagnostic = { code, severity: 'error', message };
  const response = buildResponse({
    command: 'init',
    ok: false,
    diagnostics: [diagnostic],
    next: [],
  });
  return { response, pretty: `error ${code}: ${message}`, exitCode: 2 };
}

/**
 * The `init` command handler. Reads the raw `--agent`, `--tools`, and `--host`
 * values and the resolved working directory from the context, runs the render,
 * and returns the {@link CommandResult}. `--quiet` blanks the pretty rendering;
 * JSON output is unaffected.
 */
export function initCommand(context: CommandContext): CommandResult {
  const result = runInit({
    agents: context.args.values.get('agent'),
    tools: context.args.values.get('tools'),
    hosts: context.args.values.get('host'),
    cwd: context.cwd,
  });
  return context.global.quiet && !context.global.json ? { ...result, pretty: '' } : result;
}
