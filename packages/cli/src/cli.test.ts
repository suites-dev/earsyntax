/**
 * Dispatcher-level tests for the host-native facade shell.
 *
 * These exercise the command surface `run()` owns: routing across the eight
 * commands, flag validation against the closed surface, help and version text,
 * the response envelope, and the not-yet-reimplemented stubs. Command bodies
 * (validate, extract, and the W4/W5 commands) are tested in their own suites;
 * here we only prove the shell routes to them and enforces their flags.
 */

import { describe, expect, it } from 'vitest';
import { parseArgs } from './args.js';
import { run } from './cli.js';

interface RunResult {
  code: number;
  out: string;
  json: () => Record<string, unknown>;
}

function runCli(...argv: string[]): RunResult {
  let out = '';
  const code = run(argv, { cwd: process.cwd(), stdout: (s) => (out += s) });
  return { code, out, json: () => JSON.parse(out) as Record<string, unknown> };
}

const REMOVED_VERBS = ['new', 'list', 'status', 'show', 'accept', 'check'];
const FACADE_COMMANDS = [
  'validate',
  'extract',
  'instructions',
  'explain',
  'profiles',
  'doctor',
  'init',
  'version',
];

describe('help', () => {
  it('lists exactly the eight facade commands and none of the removed verbs', () => {
    const res = runCli('--help');
    expect(res.code).toBe(0);
    for (const command of FACADE_COMMANDS) {
      expect(res.out).toContain(command);
    }
    for (const verb of REMOVED_VERBS) {
      // Word-boundary check so "extract" does not count as containing "act", etc.
      expect(new RegExp(`\\b${verb}\\b`).test(res.out)).toBe(false);
    }
  });

  it('exits 2 on a bare invocation and prints usage', () => {
    const res = runCli();
    expect(res.code).toBe(2);
    expect(res.out).toContain('earsyntax <command>');
  });

  it('does not advertise --work, --source, --out, or --mode', () => {
    const res = runCli('--help');
    for (const flag of ['--work', '--source', '--out', '--mode', '--config']) {
      expect(res.out).not.toContain(flag);
    }
  });
});

describe('version', () => {
  it('reports the feature map as JSON with the closed surface', () => {
    const res = runCli('version', '--features', '--json');
    expect(res.code).toBe(0);
    const body = res.json();
    expect(body.version).toBeTypeOf('string');
    expect(body.command).toBe('version');
    expect(body.ok).toBe(true);
    expect(body.next).toEqual([]);
    expect('root' in body).toBe(false);

    const features = body.features as Record<string, unknown>;
    expect(features.facade).toBe(1);
    expect(features.commands).toEqual(FACADE_COMMANDS);
    expect(features.profiles).toEqual(['strict', 'ears-x', 'kiro', 'speckit', 'openspec']);
    expect(features.instructions).toEqual(['author', 'convert', 'repair', 'review']);
    expect(features.hosts).toEqual(['kiro', 'speckit', 'openspec']);
    expect(features.agents).toEqual(['claude', 'codex', 'cursor', 'copilot', 'gemini', 'generic']);
    expect(features.inputFormats).toEqual(['ears', 'text', 'markdown', 'yaml', 'json']);
    expect(features.outputFormats).toEqual(['pretty', 'json', 'sarif']);
    expect(features.sarif).toBe(true);
    expect('workItems' in features).toBe(false);
  });

  it('does not report the removed work-item verbs in its command list', () => {
    const features = runCli('version', '--features', '--json').json().features as {
      commands: string[];
    };
    for (const verb of REMOVED_VERBS) {
      expect(features.commands).not.toContain(verb);
    }
  });

  it('maps --version and -v to the version command', () => {
    for (const flag of ['--version', '-v']) {
      const res = runCli(flag);
      expect(res.code).toBe(0);
      expect(res.out).toContain('earsyntax ');
    }
  });

  it('emits pure JSON to stdout in --json mode', () => {
    const res = runCli('version', '--json');
    expect(() => JSON.parse(res.out)).not.toThrow();
  });
});

describe('envelope shape', () => {
  it('orders base keys version, command, ok, then next last', () => {
    const res = runCli('version', '--json');
    const keys = Object.keys(res.json());
    expect(keys[0]).toBe('version');
    expect(keys[1]).toBe('command');
    expect(keys[2]).toBe('ok');
    expect(keys.at(-1)).toBe('next');
  });
});

describe('routing', () => {
  it('routes all eight facade commands (never reports an unknown command)', () => {
    // A bogus flag proves the command was recognized and reached flag checking,
    // without executing an unfinished command body.
    for (const command of FACADE_COMMANDS) {
      const res = runCli(command, '--totally-unknown', '--json');
      const code = (res.json().diagnostics as { code: string }[])[0]?.code;
      expect(code).not.toBe('cli.unknown_command');
    }
  });

  it('rejects an unknown command with exit 2', () => {
    const res = runCli('frobnicate', '--json');
    expect(res.code).toBe(2);
    const diags = res.json().diagnostics as { code: string }[];
    expect(diags[0]?.code).toBe('cli.unknown_command');
    expect(res.json().ok).toBe(false);
  });

  it('rejects each removed verb as an unknown command', () => {
    for (const verb of REMOVED_VERBS) {
      const res = runCli(verb, '--json');
      expect(res.code).toBe(2);
      expect((res.json().diagnostics as { code: string }[])[0]?.code).toBe('cli.unknown_command');
    }
  });
});

describe('not-yet-reimplemented stubs', () => {
  it('returns exit 2 with cli.not_implemented for the W4/W5 commands', () => {
    for (const command of ['init', 'doctor', 'explain', 'profiles']) {
      const res = runCli(command, '--json');
      expect(res.code).toBe(2);
      const body = res.json();
      expect(body.command).toBe(command);
      expect(body.ok).toBe(false);
      expect((body.diagnostics as { code: string }[])[0]?.code).toBe('cli.not_implemented');
    }
  });

  it('carries the instructions mode into the stub command label', () => {
    const res = runCli('instructions', 'repair', '--file', 'x.md', '--json');
    expect(res.code).toBe(2);
    expect(res.json().command).toBe('instructions repair');
  });
});

describe('flag validation', () => {
  it('rejects an unknown flag with exit 2', () => {
    const res = runCli('version', '--bogus', '--json');
    expect(res.code).toBe(2);
    expect((res.json().diagnostics as { code: string }[])[0]?.code).toBe('cli.unknown_flag');
  });

  it('rejects a known flag used on the wrong command with exit 2', () => {
    const res = runCli('doctor', '--strict', '--json');
    expect(res.code).toBe(2);
    expect((res.json().diagnostics as { code: string }[])[0]?.code).toBe('cli.flag_not_allowed');
  });

  it('rejects --sarif on any command other than validate', () => {
    for (const command of ['extract', 'doctor', 'init', 'explain', 'profiles', 'instructions']) {
      const res = runCli(command, '--sarif', '--json');
      expect(res.code).toBe(2);
      expect((res.json().diagnostics as { code: string }[])[0]?.code).toBe('cli.flag_not_allowed');
    }
  });

  it('accepts --sarif on validate (reaches the handler, not a flag error)', () => {
    const res = runCli('validate', '--sarif', '--totally-unknown', '--json');
    // Routed past flag-allow for --sarif; the unknown flag is what trips it.
    expect((res.json().diagnostics as { code: string }[])[0]?.code).toBe('cli.unknown_flag');
  });

  it('rejects --json and --sarif together as mutually exclusive', () => {
    const res = runCli('validate', '--json', '--sarif');
    expect(res.code).toBe(2);
    expect((res.json().diagnostics as { code: string }[])[0]?.code).toBe('cli.exclusive_flags');
  });

  it('rejects a value flag with no value with exit 2', () => {
    const res = runCli('version', '--cwd', '--json');
    expect(res.code).toBe(2);
    expect((res.json().diagnostics as { code: string }[])[0]?.code).toBe('cli.missing_value');
  });
});

describe('parseArgs', () => {
  it('takes the last value for a repeated value flag', () => {
    const parsed = parseArgs(['--profile', 'kiro', '--profile', 'speckit']);
    expect(parsed.values.get('profile')).toBe('speckit');
  });

  it('treats everything after -- as positional', () => {
    const parsed = parseArgs(['validate', '--', '--profile', '-x']);
    expect(parsed.positionals).toEqual(['validate', '--profile', '-x']);
    expect(parsed.values.has('profile')).toBe(false);
  });

  it('supports --flag=value form', () => {
    const parsed = parseArgs(['--cwd=/tmp/x']);
    expect(parsed.values.get('cwd')).toBe('/tmp/x');
  });

  it('separates positionals from boolean flags', () => {
    const parsed = parseArgs(['a.md', 'b.md', '--json', '--strict']);
    expect(parsed.positionals).toEqual(['a.md', 'b.md']);
    expect(parsed.booleans.has('json')).toBe(true);
    expect(parsed.booleans.has('strict')).toBe(true);
  });
});
