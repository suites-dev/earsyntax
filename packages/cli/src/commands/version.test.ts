/**
 * Tests for the `version` command: the envelope shape, the `--features`
 * pretty expansion, and `--quiet` suppressing pretty output uniformly with
 * every other command.
 */

import { BUILTIN_PROFILE_NAMES } from '@earsyntax/core';
import { describe, expect, it } from 'vitest';
import type { GlobalOptions, ParsedArgs } from '../args.js';
import { run } from '../cli.js';
import { createPainter } from '../color.js';
import type { CommandContext } from '../context.js';
import type { Emitter } from '../response.js';
import { AGENTS } from '../renderers/agents.js';
import { HOSTS } from '../renderers/hosts.js';
import { CLI_VERSION, FEATURES } from '../version.js';
import { versionCommand } from './version.js';

function makeContext(
  options: { json?: boolean; quiet?: boolean; features?: boolean } = {},
): CommandContext {
  const booleans = new Set<string>();
  if (options.features) {
    booleans.add('features');
  }
  const args: ParsedArgs = { positionals: [], booleans, values: new Map() };
  const global: GlobalOptions = {
    json: options.json ?? false,
    sarif: false,
    strict: false,
    quiet: options.quiet ?? false,
    profile: 'strict',
    cwd: '/work',
  };
  const emitter: Emitter = {
    json: global.json,
    painter: createPainter(false),
    write: () => undefined,
  };
  return { args, global, cwd: '/work', emitter };
}

describe('versionCommand — envelope', () => {
  it('carries the version, no root, and the full features map', () => {
    const result = versionCommand(makeContext({ json: true }));
    expect(result.response.command).toBe('version');
    expect(result.response.ok).toBe(true);
    expect(result.response.root).toBeUndefined();
    expect(result.response.features).toEqual(FEATURES);
    expect(result.exitCode).toBe(0);
  });

  it('derives the profiles capability from the same builtin registry the profiles command uses', () => {
    expect(FEATURES.profiles).toEqual([...BUILTIN_PROFILE_NAMES]);
  });

  it('derives the hosts and agents capabilities from the renderer registries', () => {
    expect(FEATURES.hosts).toEqual([...HOSTS]);
    expect(FEATURES.agents).toEqual([...AGENTS]);
  });
});

describe('versionCommand — pretty rendering', () => {
  it('prints just the version line without --features', () => {
    const result = versionCommand(makeContext());
    expect(result.pretty).toBe(`earsyntax ${CLI_VERSION}`);
  });

  it('expands the capability map under --features', () => {
    const result = versionCommand(makeContext({ features: true }));
    expect(result.pretty).toContain(`facade contract: ${FEATURES.facade}`);
    expect(result.pretty).toContain(FEATURES.profiles.join(', '));
  });
});

describe('versionCommand — --quiet suppresses pretty output', () => {
  it('empties pretty under --quiet without --json', () => {
    const result = versionCommand(makeContext({ quiet: true, features: true }));
    expect(result.pretty).toBe('');
  });

  it('leaves the JSON payload untouched when --quiet is combined with --json', () => {
    const result = versionCommand(makeContext({ json: true, quiet: true }));
    expect(result.response.features).toEqual(FEATURES);
  });
});

describe('version — through the dispatcher', () => {
  function capture(argv: string[]): { out: string; code: number } {
    let out = '';
    const code = run(argv, { stdout: (text) => (out += text), cwd: '/work' });
    return { out, code };
  }

  it('exits 0 and emits nothing under --quiet without --json', () => {
    const { out, code } = capture(['version', '--quiet']);
    expect(code).toBe(0);
    expect(out).toBe('\n');
  });

  it('leaves --json output unaffected by --quiet', () => {
    const { out, code } = capture(['version', '--json', '--quiet']);
    expect(code).toBe(0);
    const parsed = JSON.parse(out);
    expect(parsed.features).toEqual(FEATURES);
  });
});
