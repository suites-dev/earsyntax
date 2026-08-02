/**
 * Tests for `earsyntax doctor`.
 *
 * The dispatcher (cli.ts/args.ts) is owned by another agent; these drive
 * {@link doctorCommand} directly with a hand-built {@link CommandContext} and
 * assert against the returned {@link CommandResult}. Once the dispatcher routes
 * `doctor`, the acceptance gate
 * `node packages/cli/bin/run.js doctor --cwd fixtures/host-repos/kiro --json`
 * exercises the same path end to end.
 *
 * Detection runs against real fixture trees under `fixtures/host-repos/*`, plus a
 * few `mkdtemp` scratch repos for marker-precedence cases the fixtures do not
 * cover (Kiro steering/hooks fallback, Spec Kit `.specify/` precedence, an
 * unreadable `--cwd`).
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { GlobalOptions, ParsedArgs } from '../args.js';
import { createPainter } from '../color.js';
import type { CommandContext, CommandResult } from '../context.js';
import { CliError } from '../errors.js';
import { serialize, type Emitter } from '../response.js';
import { doctorCommand } from './doctor.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
const HOST_REPOS = resolve(REPO_ROOT, 'fixtures', 'host-repos');

/** Scratch directories created during the run, removed in `afterAll`. */
const scratch: string[] = [];

afterAll(() => {
  for (const dir of scratch) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Build a context and invoke {@link doctorCommand}, returning its result. */
function runDoctor(opts: { cwd: string; json?: boolean; quiet?: boolean }): CommandResult {
  const args: ParsedArgs = { positionals: [], booleans: new Set(), values: new Map() };
  const global: GlobalOptions = {
    json: opts.json ?? false,
    sarif: false,
    strict: false,
    quiet: opts.quiet ?? false,
    profile: 'strict',
    color: false,
  };
  const emitter: Emitter = {
    json: global.json,
    painter: createPainter(false),
    write: () => undefined,
  };
  const context: CommandContext = { args, global, cwd: opts.cwd, emitter };
  return doctorCommand(context);
}

/** The `detected` payload from a doctor result. */
function detected(result: CommandResult): {
  hosts: { host: string; evidence: string; profile: string }[];
  agents: { agent: string; evidence: string }[];
} {
  return result.response.detected as {
    hosts: { host: string; evidence: string; profile: string }[];
    agents: { agent: string; evidence: string }[];
  };
}

/** Create a scratch repo directory registered for cleanup, and return its path. */
function makeRepo(): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'earsyntax-doctor-'));
  scratch.push(dir);
  return dir;
}

describe('doctor: host detection', () => {
  it('detects Kiro from .kiro/specs/', () => {
    const result = runDoctor({ cwd: resolve(HOST_REPOS, 'kiro') });
    expect(result.exitCode).toBe(0);
    expect(result.response.ok).toBe(true);
    expect(detected(result).hosts).toEqual([
      { host: 'kiro', evidence: '.kiro/specs/', profile: 'kiro' },
    ]);
    expect(detected(result).agents).toEqual([]);
  });

  it('detects Spec Kit from a matched specs/**/spec.md', () => {
    const result = runDoctor({ cwd: resolve(HOST_REPOS, 'speckit') });
    expect(detected(result).hosts).toEqual([
      { host: 'speckit', evidence: 'specs/checkout/spec.md', profile: 'speckit' },
    ]);
  });

  it('detects OpenSpec from openspec/', () => {
    const result = runDoctor({ cwd: resolve(HOST_REPOS, 'openspec') });
    expect(detected(result).hosts).toEqual([
      { host: 'openspec', evidence: 'openspec/', profile: 'openspec' },
    ]);
  });

  it('falls back to .kiro/steering/ then .kiro/hooks/ when specs are absent', () => {
    const steeringRepo = makeRepo();
    mkdirSync(resolve(steeringRepo, '.kiro', 'steering'), { recursive: true });
    writeFileSync(resolve(steeringRepo, '.kiro', 'steering', 'product.md'), '# steering\n');
    expect(detected(runDoctor({ cwd: steeringRepo })).hosts).toEqual([
      { host: 'kiro', evidence: '.kiro/steering/', profile: 'kiro' },
    ]);

    const hooksRepo = makeRepo();
    mkdirSync(resolve(hooksRepo, '.kiro', 'hooks'), { recursive: true });
    writeFileSync(resolve(hooksRepo, '.kiro', 'hooks', 'on-save.json'), '{}\n');
    expect(detected(runDoctor({ cwd: hooksRepo })).hosts).toEqual([
      { host: 'kiro', evidence: '.kiro/hooks/', profile: 'kiro' },
    ]);
  });

  it('prefers .specify/ over the spec glob for Spec Kit evidence', () => {
    const repo = makeRepo();
    mkdirSync(resolve(repo, '.specify'), { recursive: true });
    writeFileSync(resolve(repo, '.specify', 'config.yml'), 'name: demo\n');
    mkdirSync(resolve(repo, 'specs', 'checkout'), { recursive: true });
    writeFileSync(resolve(repo, 'specs', 'checkout', 'spec.md'), '# spec\n');
    expect(detected(runDoctor({ cwd: repo })).hosts).toEqual([
      { host: 'speckit', evidence: '.specify/', profile: 'speckit' },
    ]);
  });
});

describe('doctor: agent detection', () => {
  it('detects every agent marker in the multi repo, in fixed order', () => {
    const result = runDoctor({ cwd: resolve(HOST_REPOS, 'multi') });
    expect(detected(result).agents).toEqual([
      { agent: 'claude', evidence: '.claude/' },
      { agent: 'codex', evidence: 'AGENTS.md' },
      { agent: 'cursor', evidence: '.cursor/' },
      { agent: 'copilot', evidence: '.github/prompts/' },
      { agent: 'gemini', evidence: 'GEMINI.md' },
    ]);
  });
});

describe('doctor: multi-host repo', () => {
  it('lists all three hosts in fixed order', () => {
    const result = runDoctor({ cwd: resolve(HOST_REPOS, 'multi') });
    expect(detected(result).hosts).toEqual([
      { host: 'kiro', evidence: '.kiro/specs/', profile: 'kiro' },
      { host: 'speckit', evidence: '.specify/', profile: 'speckit' },
      { host: 'openspec', evidence: 'openspec/', profile: 'openspec' },
    ]);
  });

  it('recommends a validate command per host, then one init covering all', () => {
    const result = runDoctor({ cwd: resolve(HOST_REPOS, 'multi') });
    expect(result.response.next).toEqual([
      {
        command: 'earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro',
        reason: 'Validate Kiro requirements with the Kiro profile.',
        forAgent: true,
      },
      {
        command: 'earsyntax validate "specs/**/spec.md" --profile speckit',
        reason: 'Validate Spec Kit specs with the Spec Kit profile.',
        forAgent: true,
      },
      {
        command: 'earsyntax validate "openspec/specs/**" "openspec/changes/**" --profile openspec',
        reason: 'Validate OpenSpec specs and changes with the OpenSpec profile.',
        forAgent: true,
      },
      {
        command:
          'earsyntax init --agent claude,codex,cursor,copilot,gemini --host kiro,speckit,openspec',
        reason: 'Render integration files for the detected hosts and agents.',
        forAgent: true,
      },
    ]);
  });
});

describe('doctor: recommendation matrix', () => {
  it('gives the exact Kiro validate and init commands', () => {
    const result = runDoctor({ cwd: resolve(HOST_REPOS, 'kiro') });
    expect(result.response.next).toEqual([
      {
        command: 'earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro',
        reason: 'Validate Kiro requirements with the Kiro profile.',
        forAgent: true,
      },
      {
        command: 'earsyntax init --agent claude --host kiro',
        reason: 'Render integration files for the detected hosts and agents.',
        forAgent: true,
      },
    ]);
  });

  it('defaults the init agent to claude when a host but no agent is detected', () => {
    const result = runDoctor({ cwd: resolve(HOST_REPOS, 'speckit') });
    const init = result.response.next.find((action) => action.command.startsWith('earsyntax init'));
    expect(init?.command).toBe('earsyntax init --agent claude --host speckit');
  });
});

describe('doctor: empty repo', () => {
  it('is a clean exit 0 with no detections and an init recommendation', () => {
    const result = runDoctor({ cwd: resolve(HOST_REPOS, 'empty') });
    expect(result.exitCode).toBe(0);
    expect(result.response.ok).toBe(true);
    expect(detected(result)).toEqual({ hosts: [], agents: [] });
    expect(result.response.next).toEqual([
      {
        command: 'earsyntax init --agent claude --host kiro',
        reason: 'No SDD host detected. Run init with the agents and hosts you use.',
        forAgent: true,
      },
    ]);
  });
});

describe('doctor: envelope and cwd', () => {
  it('reports the scanned root as the resolved cwd', () => {
    const cwd = resolve(HOST_REPOS, 'kiro');
    expect(runDoctor({ cwd }).response.root).toBe(cwd);
  });

  it('respects --cwd: the same command sees different repos', () => {
    const kiro = detected(runDoctor({ cwd: resolve(HOST_REPOS, 'kiro') }));
    const openspec = detected(runDoctor({ cwd: resolve(HOST_REPOS, 'openspec') }));
    expect(kiro.hosts[0]?.host).toBe('kiro');
    expect(openspec.hosts[0]?.host).toBe('openspec');
  });

  it('rejects a --cwd that is not a directory with exit 2', () => {
    const missing = resolve(HOST_REPOS, 'does-not-exist');
    try {
      runDoctor({ cwd: missing });
      expect.unreachable('doctor should throw for a missing --cwd');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).exitCode).toBe(2);
      expect((error as CliError).diagnostic.code).toBe('doctor.bad_cwd');
    }
  });

  it('keeps --json stdout pure JSON with no findings key', () => {
    const result = runDoctor({ cwd: resolve(HOST_REPOS, 'multi'), json: true });
    const roundTrip = JSON.parse(serialize(result.response)) as Record<string, unknown>;
    expect(roundTrip.command).toBe('doctor');
    expect(roundTrip.ok).toBe(true);
    expect(roundTrip).not.toHaveProperty('findings');
    expect(roundTrip).not.toHaveProperty('diagnostics');
    expect(roundTrip).toHaveProperty('detected');
    expect(Array.isArray(roundTrip.next)).toBe(true);
  });
});

describe('doctor: pretty output', () => {
  it('renders a readable table with hosts, agents, and recommendations', () => {
    const pretty = runDoctor({ cwd: resolve(HOST_REPOS, 'multi') }).pretty;
    expect(pretty).toContain('Hosts:');
    expect(pretty).toContain('kiro');
    expect(pretty).toContain('.kiro/specs/');
    expect(pretty).toContain('Agents:');
    expect(pretty).toContain('claude');
    expect(pretty).toContain('Recommended commands:');
    expect(pretty).toContain(
      'earsyntax init --agent claude,codex,cursor,copilot,gemini --host kiro,speckit,openspec',
    );
  });

  it('reports no detections plainly for an empty repo', () => {
    const pretty = runDoctor({ cwd: resolve(HOST_REPOS, 'empty') }).pretty;
    expect(pretty).toContain('No hosts or agents detected.');
    expect(pretty).toContain('earsyntax init --agent claude --host kiro');
  });

  it('under --quiet, emits only the recommended command lines', () => {
    const pretty = runDoctor({ cwd: resolve(HOST_REPOS, 'kiro'), quiet: true }).pretty;
    expect(pretty).toBe(
      [
        'earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro',
        'earsyntax init --agent claude --host kiro',
      ].join('\n'),
    );
  });
});
