/**
 * Tests for the built-in profile data.
 *
 * Every built-in must be schema-valid, the render order is fixed, and `ears-x`
 * must be a strict superset: each dialect field equal to or looser than strict.
 */

import { describe, expect, test } from 'vitest';
import { BUILTIN_PROFILES, BUILTIN_PROFILE_NAMES } from './builtins.js';
import { validateProfile, type Profile } from './schema.js';

describe('built-in profiles', () => {
  test('render order is the frozen order', () => {
    expect(BUILTIN_PROFILE_NAMES).toEqual(['strict', 'ears-x', 'kiro', 'speckit', 'openspec']);
  });

  test('every built-in is schema-valid', () => {
    for (const name of BUILTIN_PROFILE_NAMES) {
      const result = validateProfile(BUILTIN_PROFILES[name]);
      expect(result.ok, `profile ${name} should validate`).toBe(true);
    }
  });

  test('each built-in name matches its key', () => {
    for (const name of BUILTIN_PROFILE_NAMES) {
      expect(BUILTIN_PROFILES[name].name).toBe(name);
    }
  });

  test('locator rule ids are unique across include and exclude within a profile', () => {
    for (const name of BUILTIN_PROFILE_NAMES) {
      const profile = BUILTIN_PROFILES[name];
      const ids = [...profile.locator.include, ...profile.locator.exclude].map((rule) => rule.id);
      expect(new Set(ids).size, `profile ${name} rule ids unique`).toBe(ids.length);
    }
  });
});

/** Whether ears-x's value for one dialect field is equal to or looser than strict's. */
function fieldIsLooserOrEqual(
  strict: Profile,
  earsx: Profile,
  field: keyof Profile['dialect'],
): boolean {
  const s = strict.dialect;
  const x = earsx.dialect;
  switch (field) {
    case 'keywordCase':
      // strict casing is the tightest; case-insensitive is looser.
      return s.keywordCase === 'strict' || x.keywordCase === s.keywordCase;
    case 'commaAfterLeadingClause':
      // required is the tightest; optional is looser.
      return (
        s.commaAfterLeadingClause === 'required' ||
        x.commaAfterLeadingClause === s.commaAfterLeadingClause
      );
    case 'allowLiteralSystemName':
      // Superset of accepted literals is looser.
      return s.allowLiteralSystemName.every((literal) =>
        x.allowLiteralSystemName.includes(literal),
      );
    case 'allowStoryWrapper':
    case 'allowFrameMetadata':
    case 'allowProhibition':
      // A false->true move accepts strictly more; true->false would be tighter.
      return x[field] || !s[field];
    default:
      return true;
  }
}

describe('ears-x superset invariant', () => {
  const strict = BUILTIN_PROFILES.strict;
  const earsx = BUILTIN_PROFILES['ears-x'];
  const fields: (keyof Profile['dialect'])[] = [
    'keywordCase',
    'allowLiteralSystemName',
    'commaAfterLeadingClause',
    'allowStoryWrapper',
    'allowFrameMetadata',
    'allowProhibition',
  ];

  for (const field of fields) {
    test(`ears-x '${field}' is equal or looser than strict`, () => {
      expect(fieldIsLooserOrEqual(strict, earsx, field)).toBe(true);
    });
  }

  test('ears-x shares strict document kinds and every-line locator', () => {
    expect(earsx.locator.documentKinds).toEqual(strict.locator.documentKinds);
    expect(earsx.locator.include[0]?.kind).toBe('every-line');
  });
});
