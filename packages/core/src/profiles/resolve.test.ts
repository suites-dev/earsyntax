/**
 * Tests for resolveProfile.
 */

import { describe, expect, test } from 'vitest';
import { BUILTIN_PROFILE_NAMES } from './builtins.js';
import { resolveProfile } from './resolve.js';

describe('resolveProfile', () => {
  test('resolves every built-in name to its profile', () => {
    for (const name of BUILTIN_PROFILE_NAMES) {
      const result = resolveProfile(name);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.profile.name).toBe(name);
      }
    }
  });

  test('returns a typed unknown-profile error for an unknown name', () => {
    const result = resolveProfile('nope');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unknown-profile');
      expect(result.error.name).toBe('nope');
      expect(result.error.available).toEqual(BUILTIN_PROFILE_NAMES);
      expect(result.error.message).toContain('nope');
    }
  });

  test('is case-sensitive: STRICT does not resolve', () => {
    expect(resolveProfile('STRICT').ok).toBe(false);
  });
});
