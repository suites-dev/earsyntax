/**
 * Tests for the `init` command.
 *
 * The logic tests drive {@link runInit} with an in-memory {@link InitDeps} so no
 * disk is touched: they cover the agent x host render matrix, idempotency,
 * managed-section preservation, the `--tools` deprecation, name validation, and
 * the exact JSON envelope shape. A second group drives the {@link initCommand}
 * handler and the dispatcher against real temp directories to prove the files
 * land on disk and a second run produces byte-identical output.
 */

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../cli.js';
import { AGENTS, HOSTS } from '../renderers/index.js';
import { type InitDeps, type InitResult, runInit } from './init.js';

const CWD = '/repo';

/** An in-memory {@link InitDeps} over a path->content map. Keys are absolute. */
function memFs(seed: Record<string, string> = {}): { files: Map<string, string>; deps: InitDeps } {
  const files = new Map<string, string>(Object.entries(seed));
  const deps: InitDeps = {
    exists: (absPath) => files.has(absPath),
    readFile: (absPath) => {
      const value = files.get(absPath);
      if (value === undefined) {
        throw new Error(`no such file: ${absPath}`);
      }
      return value;
    },
    writeFile: (absPath, content) => void files.set(absPath, content),
  };
  return { files, deps };
}

/** The response payload keys under test, typed for convenience. */
interface InitPayload {
  ok: boolean;
  root: string;
  agents: string[];
  hosts: string[];
  written: string[];
  updated: string[];
  skipped: string[];
  warnings: string[];
  next: { command: string; reason: string }[];
  diagnostics?: { code: string; message: string }[];
}

function payload(result: InitResult): InitPayload {
  const r = result.response;
  return {
    ok: r.ok,
    root: r.root!,
    agents: r.agents as string[],
    hosts: r.hosts as string[],
    written: r.written as string[],
    updated: r.updated as string[],
    skipped: r.skipped as string[],
    warnings: r.warnings as string[],
    next: r.next,
    diagnostics: r.diagnostics,
  };
}

describe('runInit — render matrix', () => {
  it('renders the expected files for every agent alone', () => {
    const expected: Record<string, string[]> = {
      claude: [
        '.claude/commands/earsyntax-author.md',
        '.claude/commands/earsyntax-convert.md',
        '.claude/commands/earsyntax-repair.md',
        '.claude/commands/earsyntax-review.md',
      ],
      codex: ['AGENTS.md'],
      cursor: ['.cursor/rules/earsyntax.mdc'],
      copilot: ['.github/prompts/earsyntax.prompt.md'],
      gemini: ['GEMINI.md'],
      generic: ['AGENTS.md'],
    };
    for (const agent of AGENTS) {
      const { deps } = memFs();
      const result = runInit({ agents: agent, cwd: CWD }, deps);
      expect(result.exitCode).toBe(0);
      expect(payload(result).written).toEqual(expected[agent]);
    }
  });

  it('renders the expected files for every host alone', () => {
    const expected: Record<string, string[]> = {
      kiro: ['.kiro/hooks/ears-validate.yaml', '.kiro/steering/earsyntax.md'],
      speckit: ['.specify/extensions/earsyntax.md'],
      openspec: ['AGENTS.md'],
    };
    for (const host of HOSTS) {
      const { deps } = memFs();
      const result = runInit({ hosts: host, cwd: CWD }, deps);
      expect(result.exitCode).toBe(0);
      expect(payload(result).written).toEqual(expected[host]);
    }
  });

  it('covers every agent x host pair without error', () => {
    for (const agent of AGENTS) {
      for (const host of HOSTS) {
        const { deps } = memFs();
        const result = runInit({ agents: agent, hosts: host, cwd: CWD }, deps);
        expect(result.exitCode).toBe(0);
        expect(payload(result).ok).toBe(true);
        expect(payload(result).written.length).toBeGreaterThan(0);
      }
    }
  });

  it('never writes under .earsyntax/', () => {
    const { files, deps } = memFs();
    runInit({ agents: [...AGENTS].join(','), hosts: [...HOSTS].join(','), cwd: CWD }, deps);
    for (const path of files.keys()) {
      expect(path).not.toContain('.earsyntax');
    }
  });
});

describe('runInit — idempotency', () => {
  it('reports every file skipped on a second identical run, byte for byte', () => {
    const { files, deps } = memFs();
    const first = runInit({ agents: 'claude,codex', hosts: 'kiro,openspec', cwd: CWD }, deps);
    const snapshot = new Map(files);

    const second = runInit({ agents: 'claude,codex', hosts: 'kiro,openspec', cwd: CWD }, deps);
    expect(payload(second).written).toEqual([]);
    expect(payload(second).updated).toEqual([]);
    expect(payload(second).skipped).toEqual(
      [...payload(first).written].sort(),
    );

    expect(files.size).toBe(snapshot.size);
    for (const [path, content] of files) {
      expect(content).toBe(snapshot.get(path));
    }
  });
});

describe('runInit — managed sections', () => {
  it('preserves pre-existing AGENTS.md content around the managed block', () => {
    const seed = { [`${CWD}/AGENTS.md`]: '# House rules\n\nKeep it tidy.\n' };
    const { files, deps } = memFs(seed);
    const result = runInit({ agents: 'codex', cwd: CWD }, deps);

    expect(payload(result).updated).toEqual(['AGENTS.md']);
    const content = files.get(`${CWD}/AGENTS.md`) ?? '';
    expect(content.startsWith('# House rules\n\nKeep it tidy.\n')).toBe(true);
    expect(content).toContain('<!-- earsyntax:begin -->');
    expect(content).toContain('<!-- earsyntax:end -->');
  });

  it('dedupes the codex and generic agent-loop block into one section', () => {
    const { files, deps } = memFs();
    runInit({ agents: 'codex,generic', cwd: CWD }, deps);
    const content = files.get(`${CWD}/AGENTS.md`) ?? '';
    expect(content.match(/## earsyntax\b/g)?.length).toBe(1);
  });

  it('composes the agent-loop and openspec blocks in one AGENTS.md section', () => {
    const { files, deps } = memFs();
    const result = runInit({ agents: 'codex', hosts: 'openspec', cwd: CWD }, deps);
    expect(payload(result).written).toEqual(['AGENTS.md']);
    const content = files.get(`${CWD}/AGENTS.md`) ?? '';
    expect(content).toContain('## earsyntax\n');
    expect(content).toContain('## earsyntax with OpenSpec');
    expect(content.match(/earsyntax:begin/g)?.length).toBe(1);
  });
});

describe('runInit — profile token', () => {
  it('pins the profile when exactly one host is configured', () => {
    const { files, deps } = memFs();
    runInit({ agents: 'cursor', hosts: 'kiro', cwd: CWD }, deps);
    const content = files.get(`${CWD}/.cursor/rules/earsyntax.mdc`) ?? '';
    expect(content).toContain('--profile kiro --json');
    expect(content).not.toContain('<profile>');
  });

  it('uses the <profile> placeholder and a note with several hosts', () => {
    const { files, deps } = memFs();
    runInit({ agents: 'cursor', hosts: 'kiro,openspec', cwd: CWD }, deps);
    const content = files.get(`${CWD}/.cursor/rules/earsyntax.mdc`) ?? '';
    expect(content).toContain('--profile <profile> --json');
    expect(content).toContain('kiro, openspec');
  });
});

describe('runInit — thin wrappers', () => {
  it('carries the loop protocol and no lifecycle verbs', () => {
    const { files, deps } = memFs();
    runInit({ agents: 'claude', hosts: 'kiro', cwd: CWD }, deps);
    const content = files.get(`${CWD}/.claude/commands/earsyntax-repair.md`) ?? '';
    expect(content).toContain('earsyntax instructions repair');
    expect(content).toContain('earsyntax validate');
    expect(content).toContain('Do not approve, accept, or merge.');
    for (const verb of ['plan', 'tasks', 'design', 'implement']) {
      expect(new RegExp(`\\b${verb}\\b`).test(content)).toBe(false);
    }
  });

  it('renders no em dashes in any wrapper', () => {
    const { files, deps } = memFs();
    runInit({ agents: [...AGENTS].join(','), hosts: [...HOSTS].join(','), cwd: CWD }, deps);
    for (const content of files.values()) {
      expect(content.includes('—')).toBe(false);
    }
  });
});

describe('runInit — --tools deprecation', () => {
  it('maps --tools to agents and warns', () => {
    const { deps } = memFs();
    const result = runInit({ tools: 'claude', cwd: CWD }, deps);
    expect(result.exitCode).toBe(0);
    expect(payload(result).agents).toEqual(['claude']);
    expect(payload(result).warnings).toEqual([
      'The --tools flag is deprecated; use --agent instead.',
    ]);
  });

  it('folds --tools agents in beside --agent', () => {
    const { deps } = memFs();
    const result = runInit({ agents: 'cursor', tools: 'claude', cwd: CWD }, deps);
    expect(payload(result).agents).toEqual(['claude', 'cursor']);
    expect(payload(result).warnings.length).toBe(1);
  });
});

describe('runInit — validation', () => {
  it('exits 2 on an unknown agent', () => {
    const { deps } = memFs();
    const result = runInit({ agents: 'bogus', hosts: 'kiro', cwd: CWD }, deps);
    expect(result.exitCode).toBe(2);
    expect(payload(result).diagnostics?.[0].code).toBe('init.unknown_agent');
  });

  it('exits 2 on an unknown host', () => {
    const { deps } = memFs();
    const result = runInit({ agents: 'claude', hosts: 'bogus', cwd: CWD }, deps);
    expect(result.exitCode).toBe(2);
    expect(payload(result).diagnostics?.[0].code).toBe('init.unknown_host');
  });

  it('exits 2 when no agent or host is requested', () => {
    const { deps } = memFs();
    const result = runInit({ cwd: CWD }, deps);
    expect(result.exitCode).toBe(2);
    expect(payload(result).diagnostics?.[0].code).toBe('init.no_targets');
  });
});

describe('runInit — envelope shape', () => {
  it('matches the facade key order and next actions for claude + kiro', () => {
    const { deps } = memFs();
    const result = runInit({ agents: 'claude', hosts: 'kiro', cwd: CWD }, deps);
    expect(Object.keys(result.response)).toEqual([
      'version',
      'command',
      'ok',
      'root',
      'agents',
      'hosts',
      'written',
      'updated',
      'skipped',
      'warnings',
      'next',
    ]);
    expect(payload(result).next).toEqual([
      {
        command: 'earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro',
        reason: 'Validate kiro requirements with the kiro profile.',
      },
    ]);
  });

  it('carries no next actions when only agents are requested', () => {
    const { deps } = memFs();
    const result = runInit({ agents: 'claude', cwd: CWD }, deps);
    expect(payload(result).next).toEqual([]);
  });
});

describe('initCommand and dispatcher — real disk', () => {
  it('writes files and reports them skipped on a second run, byte-identical', () => {
    const dir = mkdtempSync(join(tmpdir(), 'earsyntax-init-'));
    const first = capture((out) =>
      run(['init', '--agent', 'claude', '--host', 'kiro', '--cwd', dir, '--json'], {
        cwd: dir,
        stdout: out,
      }),
    );
    expect(first.code).toBe(0);
    const authored = readFileSync(resolve(dir, '.claude/commands/earsyntax-author.md'), 'utf8');

    const second = capture((out) =>
      run(['init', '--agent', 'claude', '--host', 'kiro', '--cwd', dir, '--json'], {
        cwd: dir,
        stdout: out,
      }),
    );
    const body = JSON.parse(second.out) as { written: string[]; skipped: string[] };
    expect(body.written).toEqual([]);
    expect(body.skipped.length).toBeGreaterThan(0);
    expect(readFileSync(resolve(dir, '.claude/commands/earsyntax-author.md'), 'utf8')).toBe(authored);
  });

  it('blanks pretty output under --quiet but still writes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'earsyntax-init-'));
    const res = capture((out) =>
      run(['init', '--agent', 'cursor', '--cwd', dir, '--quiet'], { cwd: dir, stdout: out }),
    );
    expect(res.code).toBe(0);
    expect(res.out.trim()).toBe('');
    expect(readFileSync(resolve(dir, '.cursor/rules/earsyntax.mdc'), 'utf8')).toContain('earsyntax');
  });
});

/** Run `fn` with a stdout collector, returning the exit code and captured text. */
function capture(fn: (out: (text: string) => void) => number): { code: number; out: string } {
  let out = '';
  const code = fn((text) => {
    out += text;
  });
  return { code, out };
}
