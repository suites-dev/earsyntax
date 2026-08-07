/**
 * `earsyntax doctor` — detect host frameworks and agent integrations in the repo
 * at `--cwd`, and recommend exact commands.
 *
 * Doctor is stateless and read-only. It scans the directory named by `--cwd`
 * (defaulting to the process working directory), reports the SDD hosts and agent
 * integrations it finds by their on-disk markers, and returns runnable
 * `earsyntax` commands in `next`. It never reads document content, never writes
 * or deletes, never resolves a workspace, and never calls an LLM. It works in any
 * directory, including an empty one.
 *
 * Exit codes: `0` always for a successful scan (an empty repo is a clean exit
 * `0`, not a failure); `2` only for the usage failure of a `--cwd` that does not
 * name a directory. There are no lint findings here, so exit `1` never occurs.
 *
 * Detection is anchored at the scan root (the resolved `--cwd`), which is also the
 * `root` reported in the envelope. Evidence paths are recorded relative to that
 * root, with a trailing slash for directory markers.
 */

import { existsSync, globSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import type { CommandContext, CommandResult } from '../context.js';
import type { NextAction } from '../facade-types.js';
import { usageError } from '../errors.js';
import { buildResponse } from '../response.js';

/** A detected SDD host: which host, the marker that proved it, and the profile to lint it with. */
interface DetectedHost {
  host: string;
  evidence: string;
  profile: string;
}

/** A detected agent integration: which agent, and the marker that proved it. */
interface DetectedAgent {
  agent: string;
  evidence: string;
}

/** The validate recommendation for each detectable host, keyed by host name. */
const HOST_VALIDATE: Record<string, { command: string; reason: string }> = {
  kiro: {
    command: 'earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro',
    reason: 'Validate Kiro requirements with the Kiro profile.',
  },
  speckit: {
    command: 'earsyntax validate "specs/**/spec.md" --profile speckit',
    reason: 'Validate Spec Kit specs with the Spec Kit profile.',
  },
  openspec: {
    command: 'earsyntax validate "openspec/specs/**" "openspec/changes/**" --profile openspec',
    reason: 'Validate OpenSpec specs and changes with the OpenSpec profile.',
  },
};

/**
 * A directory marker. Present when `rel` resolves to a directory under `root`.
 * Evidence is the relative path with a trailing slash (`.kiro/specs/`).
 */
function detectDir(root: string, rel: string): string | undefined {
  const abs = resolve(root, rel);
  if (existsSync(abs) && statSync(abs).isDirectory()) {
    return `${rel}/`;
  }
  return undefined;
}

/** A file marker. Present when `rel` resolves to a file under `root`; evidence is `rel`. */
function detectFile(root: string, rel: string): string | undefined {
  const abs = resolve(root, rel);
  if (existsSync(abs) && statSync(abs).isFile()) {
    return rel;
  }
  return undefined;
}

/**
 * A glob marker. Present when `pattern` matches at least one path under `root`;
 * evidence is the first match in sorted order, as a POSIX-relative path.
 */
function detectGlob(root: string, pattern: string): string | undefined {
  const matches = globSync(pattern, { cwd: root }).sort((a, b) => a.localeCompare(b));
  const first = matches.at(0);
  return first === undefined ? undefined : first.split(sep).join('/');
}

/**
 * Detect SDD hosts under `root`, in the fixed order `kiro`, `speckit`,
 * `openspec`. Each host reports a single primary evidence marker chosen by
 * precedence: for Kiro, the specs directory before steering before hooks; for
 * Spec Kit, the `.specify/` config directory before a matched `specs/**\/spec.md`.
 */
function detectHosts(root: string): DetectedHost[] {
  const hosts: DetectedHost[] = [];

  const kiro =
    detectDir(root, '.kiro/specs') ??
    detectDir(root, '.kiro/steering') ??
    detectDir(root, '.kiro/hooks');
  if (kiro !== undefined) {
    hosts.push({ host: 'kiro', evidence: kiro, profile: 'kiro' });
  }

  const speckit = detectDir(root, '.specify') ?? detectGlob(root, 'specs/**/spec.md');
  if (speckit !== undefined) {
    hosts.push({ host: 'speckit', evidence: speckit, profile: 'speckit' });
  }

  const openspec = detectDir(root, 'openspec');
  if (openspec !== undefined) {
    hosts.push({ host: 'openspec', evidence: openspec, profile: 'openspec' });
  }

  return hosts;
}

/**
 * Detect agent integrations under `root`, in the fixed order `claude`, `codex`,
 * `cursor`, `copilot`, `gemini`. `AGENTS.md` maps to `codex`, the canonical agent
 * for that shared convention; `init --agent codex` renders it.
 */
function detectAgents(root: string): DetectedAgent[] {
  const agents: DetectedAgent[] = [];

  const claude = detectDir(root, '.claude');
  if (claude !== undefined) {
    agents.push({ agent: 'claude', evidence: claude });
  }

  const codex = detectFile(root, 'AGENTS.md');
  if (codex !== undefined) {
    agents.push({ agent: 'codex', evidence: codex });
  }

  const cursor = detectDir(root, '.cursor');
  if (cursor !== undefined) {
    agents.push({ agent: 'cursor', evidence: cursor });
  }

  const copilot = detectDir(root, '.github/prompts');
  if (copilot !== undefined) {
    agents.push({ agent: 'copilot', evidence: copilot });
  }

  const gemini = detectFile(root, 'GEMINI.md');
  if (gemini !== undefined) {
    agents.push({ agent: 'gemini', evidence: gemini });
  }

  return agents;
}

/**
 * Build the recommended commands. Each detected host contributes its validate
 * command; when at least one host is detected, a single `init` action renders the
 * detected hosts against the detected agents (or `claude` when no agent marker was
 * found). An empty scan recommends running `init` with explicit flags.
 */
function buildNext(hosts: DetectedHost[], agents: DetectedAgent[]): NextAction[] {
  const next: NextAction[] = [];

  for (const host of hosts) {
    const rec = HOST_VALIDATE[host.host];
    next.push({ command: rec.command, reason: rec.reason, forAgent: true });
  }

  if (hosts.length > 0) {
    const agentList = agents.length > 0 ? agents.map((agent) => agent.agent).join(',') : 'claude';
    const hostList = hosts.map((host) => host.host).join(',');
    next.push({
      command: `earsyntax init --agent ${agentList} --host ${hostList}`,
      reason: 'Render integration files for the detected hosts and agents.',
      forAgent: true,
    });
    return next;
  }

  next.push({
    command: 'earsyntax init --agent claude --host kiro',
    reason: 'No SDD host detected. Run init with the agents and hosts you use.',
    forAgent: true,
  });
  return next;
}

/** Render the human listing: the scan root, detected hosts and agents, then recommendations. */
function renderPretty(
  root: string,
  hosts: DetectedHost[],
  agents: DetectedAgent[],
  next: NextAction[],
): string {
  const lines = [`Repo: ${root}`, ''];

  if (hosts.length === 0 && agents.length === 0) {
    lines.push('No hosts or agents detected.');
  } else {
    if (hosts.length > 0) {
      lines.push('Hosts:');
      for (const host of hosts) {
        lines.push(
          `  ${host.host.padEnd(10)} ${host.evidence.padEnd(24)} (profile ${host.profile})`,
        );
      }
    }
    if (agents.length > 0) {
      if (hosts.length > 0) {
        lines.push('');
      }
      lines.push('Agents:');
      for (const agent of agents) {
        lines.push(`  ${agent.agent.padEnd(10)} ${agent.evidence}`);
      }
    }
  }

  lines.push('', 'Recommended commands:');
  for (const action of next) {
    lines.push(`  ${action.command}`);
  }
  return lines.join('\n');
}

/** Render the quiet form: only the recommended command lines, the actionable core. */
function renderQuiet(next: NextAction[]): string {
  return next.map((action) => action.command).join('\n');
}

/**
 * Run the `doctor` command: scan the resolved `--cwd`, report detected hosts and
 * agents, and recommend commands.
 *
 * @param context The command context (parsed args, globals, cwd, emitter).
 * @returns The {@link CommandResult}; the dispatcher performs the single write.
 * @throws {@link CliError} exit 2 when `--cwd` does not name a directory.
 */
export function doctorCommand(context: CommandContext): CommandResult {
  const root = context.cwd;
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw usageError('doctor.bad_cwd', `Directory not found: ${root}.`);
  }

  const hosts = detectHosts(root);
  const agents = detectAgents(root);
  const next = buildNext(hosts, agents);

  const response = buildResponse(
    { command: 'doctor', ok: true, root, next },
    { detected: { hosts, agents } },
  );

  const pretty = context.global.quiet ? renderQuiet(next) : renderPretty(root, hosts, agents, next);
  return { response, pretty, exitCode: 0 };
}
