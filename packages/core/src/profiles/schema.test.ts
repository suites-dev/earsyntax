/**
 * Unit tests for profile schema v1 validation.
 *
 * Covers closed-schema rejection (unknown keys at every level, recursively),
 * enum and type checks, regex-pattern checks, severity-id resolution, and the
 * no-throw contract on arbitrary input.
 */

import { describe, expect, test } from 'vitest';
import { validateProfile, type Profile, type ProfileValidationError } from './schema.js';

function baseProfile(): Profile {
  return {
    name: 'strict',
    notation: 'ears',
    dialect: {
      keywordCase: 'strict',
      allowLiteralSystemName: [],
      commaAfterLeadingClause: 'required',
      allowStoryWrapper: false,
      allowFrameMetadata: false,
      allowProhibition: false,
    },
    locator: {
      documentKinds: ['ears', 'text'],
      include: [{ id: 'strict.every-line', kind: 'every-line' }],
      exclude: [],
      codeFences: 'ignore',
    },
    severity: {},
    idFormat: { required: false },
  };
}

function errorAt(errors: ProfileValidationError[], path: string): ProfileValidationError | undefined {
  return errors.find((error) => error.path === path);
}

describe('validateProfile', () => {
  test('accepts a well-formed profile', () => {
    const result = validateProfile(baseProfile());
    expect(result.ok).toBe(true);
  });

  test('never throws on non-object input and reports not-object', () => {
    for (const bad of [null, undefined, 42, 'x', [] as unknown]) {
      const result = validateProfile(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0]?.code).toBe('not-object');
      }
    }
  });

  test('rejects an unknown top-level key', () => {
    const input = { ...baseProfile(), extra: true };
    const result = validateProfile(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(errorAt(result.errors, 'extra')?.code).toBe('unknown-key');
    }
  });

  test('rejects an unknown key inside dialect', () => {
    const input = baseProfile();
    (input.dialect as Record<string, unknown>).surprise = 1;
    const result = validateProfile(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(errorAt(result.errors, 'dialect.surprise')?.code).toBe('unknown-key');
    }
  });

  test('rejects an unknown key inside a nested locator rule (recursive)', () => {
    const input = baseProfile();
    (input.locator.include[0] as Record<string, unknown>).bogus = 'x';
    const result = validateProfile(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(errorAt(result.errors, 'locator.include[0].bogus')?.code).toBe('unknown-key');
    }
  });

  test('rejects an unknown key inside idFormat', () => {
    const input = baseProfile();
    (input.idFormat as Record<string, unknown>).flavor = 'x';
    const result = validateProfile(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(errorAt(result.errors, 'idFormat.flavor')?.code).toBe('unknown-key');
    }
  });

  test('rejects a bad name enum value', () => {
    const input = { ...baseProfile(), name: 'custom' };
    const result = validateProfile(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(errorAt(result.errors, 'name')?.code).toBe('invalid-enum');
    }
  });

  test('rejects a notation other than ears', () => {
    const input = { ...baseProfile(), notation: 'gherkin' };
    const result = validateProfile(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(errorAt(result.errors, 'notation')?.code).toBe('invalid-enum');
    }
  });

  test('rejects a bad locator-rule kind', () => {
    const input = baseProfile();
    (input.locator.include[0] as Record<string, unknown>).kind = 'paragraph';
    const result = validateProfile(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(errorAt(result.errors, 'locator.include[0].kind')?.code).toBe('invalid-enum');
    }
  });

  test('rejects a severity key that is not a resolvable diagnostic id', () => {
    const input = baseProfile();
    input.severity = { 'ears.no_match': 'off' };
    const result = validateProfile(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(errorAt(result.errors, 'severity.ears.no_match')?.code).toBe('unknown-diagnostic-id');
    }
  });

  test('accepts a resolvable severity id', () => {
    const input = baseProfile();
    input.severity = { 'EARS-W011': 'off' };
    const result = validateProfile(input);
    expect(result.ok).toBe(true);
  });

  test('rejects a bad severity value', () => {
    const input = baseProfile();
    (input.severity as Record<string, unknown>)['EARS-W011'] = 'silence';
    const result = validateProfile(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(errorAt(result.errors, 'severity.EARS-W011')?.code).toBe('invalid-enum');
    }
  });

  test('rejects an uncompilable idFormat pattern', () => {
    const input = baseProfile();
    input.idFormat = { required: false, pattern: '(' };
    const result = validateProfile(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(errorAt(result.errors, 'idFormat.pattern')?.code).toBe('invalid-pattern');
    }
  });

  test('rejects an uncompilable headingPattern', () => {
    const input = baseProfile();
    input.locator.include = [{ id: 'r', kind: 'heading-section', headingPattern: '[' }];
    const result = validateProfile(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(errorAt(result.errors, 'locator.include[0].headingPattern')?.code).toBe('invalid-pattern');
    }
  });

  test('reports missing required keys', () => {
    const result = validateProfile({ name: 'strict', notation: 'ears' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const paths = result.errors.map((error) => error.path);
      expect(paths).toEqual(expect.arrayContaining(['dialect', 'locator', 'severity', 'idFormat']));
    }
  });

  test('rejects a non-string entry in allowLiteralSystemName', () => {
    const input = baseProfile();
    (input.dialect as Record<string, unknown>).allowLiteralSystemName = ['THE SYSTEM', 3];
    const result = validateProfile(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(errorAt(result.errors, 'dialect.allowLiteralSystemName')?.code).toBe('wrong-type');
    }
  });
});
