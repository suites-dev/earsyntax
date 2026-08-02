/**
 * Tests for the `profiles` command.
 *
 * The command is a pure projection of `@earsyntax/core`'s
 * {@link summarizeProfiles}, so the drift-proof assertions compare the response
 * `profiles` payload against that function's output directly rather than against
 * string literals: if the profile data changes, the command and the assertion
 * move together and no per-profile prose can rot in the CLI. A second group
 * covers the envelope shape, purity, exit code, and the fixed render order, and
 * a third drives {@link profilesCommand} through the CLI dispatcher end to end.
 */

import { BUILTIN_PROFILE_NAMES, summarizeProfiles } from '@earsyntax/core';
import { describe, expect, it } from 'vitest';
import type { GlobalOptions, ParsedArgs } from '../args.js';
import { run } from '../cli.js';
import { createPainter } from '../color.js';
import type { CommandContext } from '../context.js';
import type { Emitter } from '../response.js';
import { profilesCommand } from './profiles.js';

/** Build a bare {@link CommandContext} for the handler; it reads no args or flags. */
function makeContext(
  options: { json?: boolean; quiet?: boolean; profile?: string } = {},
): CommandContext {
  const args: ParsedArgs = { positionals: [], booleans: new Set(), values: new Map() };
  const global: GlobalOptions = {
    json: options.json ?? false,
    sarif: false,
    strict: false,
    quiet: options.quiet ?? false,
    profile: options.profile ?? 'strict',
    cwd: '/work',
    color: false,
  };
  const emitter: Emitter = {
    json: global.json,
    painter: createPainter(false),
    write: () => undefined,
  };
  return { args, global, cwd: '/work', emitter };
}

describe('profilesCommand — payload is a drift-proof projection of profile data', () => {
  it('emits exactly summarizeProfiles() in the profiles payload', () => {
    const result = profilesCommand(makeContext({ json: true }));
    // Compared against the core function, not literals: the assertion cannot
    // drift from the profile data because both sides read the same source.
    expect(result.response.profiles).toEqual(summarizeProfiles());
  });

  it('lists all five built-ins in the frozen render order', () => {
    const result = profilesCommand(makeContext({ json: true }));
    const names = (result.response.profiles as { name: string }[]).map((p) => p.name);
    expect(names).toEqual([...BUILTIN_PROFILE_NAMES]);
    expect(names).toEqual(['strict', 'ears-x', 'kiro', 'speckit', 'openspec']);
  });

  it('carries the ProfileSummary keys and nothing else per entry', () => {
    const result = profilesCommand(makeContext({ json: true }));
    for (const profile of result.response.profiles as Record<string, unknown>[]) {
      expect(Object.keys(profile).sort()).toEqual(
        ['adds', 'locates', 'name', 'relaxes', 'severityOverrides'].sort(),
      );
    }
  });

  it('shows strict as the baseline: empty relaxes, adds, and overrides', () => {
    const result = profilesCommand(makeContext({ json: true }));
    const strict = (result.response.profiles as ProfileSummary[]).find((p) => p.name === 'strict');
    expect(strict?.relaxes).toEqual([]);
    expect(strict?.adds).toEqual([]);
    expect(strict?.severityOverrides).toEqual({});
  });
});

interface ProfileSummary {
  name: string;
  locates: string;
  relaxes: string[];
  adds: string[];
  severityOverrides: Record<string, string>;
}

describe('profilesCommand — envelope, purity, and exit code', () => {
  it('returns a well-formed envelope: ok true, empty next, exit 0', () => {
    const result = profilesCommand(makeContext({ json: true }));
    expect(result.response.command).toBe('profiles');
    expect(result.response.ok).toBe(true);
    expect(result.response.next).toEqual([]);
    expect(result.exitCode).toBe(0);
    expect(result.response.diagnostics).toBeUndefined();
  });

  it('is pure JSON: the payload round-trips with no undefined or functions', () => {
    const result = profilesCommand(makeContext({ json: true }));
    const roundTripped = JSON.parse(JSON.stringify(result.response));
    expect(roundTripped.profiles).toEqual(summarizeProfiles());
  });

  it('ignores the global --profile value: output does not depend on it', () => {
    const withStrict = profilesCommand(makeContext({ json: true, profile: 'strict' }));
    const withKiro = profilesCommand(makeContext({ json: true, profile: 'kiro' }));
    expect(withStrict.response.profiles).toEqual(withKiro.response.profiles);
  });
});

describe('profilesCommand — pretty rendering derives from the same data', () => {
  it('names every profile and never invents prose beyond the data', () => {
    const result = profilesCommand(makeContext());
    for (const profile of summarizeProfiles()) {
      expect(result.pretty).toContain(profile.name);
      expect(result.pretty).toContain(profile.locates);
      for (const relaxed of profile.relaxes) {
        expect(result.pretty).toContain(relaxed);
      }
      for (const added of profile.adds) {
        expect(result.pretty).toContain(added);
      }
    }
  });

  it('renders severity overrides as id=level pairs', () => {
    const result = profilesCommand(makeContext());
    const kiro = summarizeProfiles().find((p) => p.name === 'kiro');
    for (const [id, level] of Object.entries(kiro?.severityOverrides ?? {})) {
      expect(result.pretty).toContain(`${id}=${level}`);
    }
  });
});

describe('profiles — through the dispatcher', () => {
  function capture(argv: string[]): { out: string; code: number } {
    let out = '';
    const code = run(argv, { stdout: (text) => (out += text), cwd: '/work' });
    return { out, code };
  }

  it('exits 0 and emits the JSON envelope under --json', () => {
    const { out, code } = capture(['profiles', '--json']);
    expect(code).toBe(0);
    const parsed = JSON.parse(out);
    expect(parsed.command).toBe('profiles');
    expect(parsed.profiles).toEqual(summarizeProfiles());
  });

  it('exits 0 and emits pretty text without --json', () => {
    const { out, code } = capture(['profiles']);
    expect(code).toBe(0);
    expect(out).toContain('strict');
    expect(out).toContain('openspec');
    expect(() => JSON.parse(out)).toThrow();
  });

  it('rejects an unknown flag with exit 2', () => {
    const { out, code } = capture(['profiles', '--bogus']);
    expect(code).toBe(2);
    expect(out).toContain('cli.unknown_flag');
  });

  it('rejects the misplaced --profile flag with exit 2 and does not distort output', () => {
    const { out, code } = capture(['profiles', '--profile', 'kiro']);
    expect(code).toBe(2);
    expect(out).toContain('cli.flag_not_allowed');
  });
});
