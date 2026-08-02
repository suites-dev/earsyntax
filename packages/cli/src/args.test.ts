/**
 * Tests for {@link parseArgs}: positional/flag separation, the value-flag
 * `--flag value` and `--flag=value` forms, `--` as an end-of-flags marker, and
 * the boolean-flag `--flag=value` rejection.
 */

import { describe, expect, it } from 'vitest';
import { parseArgs } from './args.js';
import { CliError } from './errors.js';

describe('parseArgs', () => {
  it('separates positionals from flags', () => {
    const result = parseArgs(['a.md', '--json', 'b.md']);
    expect(result.positionals).toEqual(['a.md', 'b.md']);
    expect(result.booleans.has('json')).toBe(true);
  });

  it('reads a value flag in `--flag value` form', () => {
    const result = parseArgs(['--profile', 'kiro']);
    expect(result.values.get('profile')).toBe('kiro');
  });

  it('reads a value flag in `--flag=value` form', () => {
    const result = parseArgs(['--profile=kiro']);
    expect(result.values.get('profile')).toBe('kiro');
  });

  it('treats everything after `--` as positional', () => {
    const result = parseArgs(['--json', '--', '--not-a-flag']);
    expect(result.positionals).toEqual(['--not-a-flag']);
  });

  it('throws cli.missing_value when a value flag has no following token', () => {
    expect(() => parseArgs(['--profile'])).toThrow(CliError);
    try {
      parseArgs(['--profile']);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).diagnostic.code).toBe('cli.missing_value');
      expect((error as CliError).exitCode).toBe(2);
    }
  });

  it('rejects `--flag=value` on a boolean flag', () => {
    try {
      parseArgs(['--json=true']);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).diagnostic.code).toBe('cli.flag_takes_no_value');
      expect((error as CliError).exitCode).toBe(2);
    }
  });

  it('keeps bare boolean tokens working', () => {
    const result = parseArgs(['--json', '--quiet', '--strict']);
    expect(result.booleans.has('json')).toBe(true);
    expect(result.booleans.has('quiet')).toBe(true);
    expect(result.booleans.has('strict')).toBe(true);
  });
});
