/**
 * Tests for profile diffing.
 *
 * The diff is derived from profile data, so these assertions double as a guard
 * that the built-in data keeps the intended relationship to strict. A snapshot
 * locks the full rendered set for the `profiles` command.
 */

import { describe, expect, test } from 'vitest';
import { BUILTIN_PROFILES } from './builtins.js';
import { diffProfile, summarizeProfiles } from './diff.js';

describe('diffProfile', () => {
  test('strict diffed against itself is empty', () => {
    const diff = diffProfile(BUILTIN_PROFILES.strict);
    expect(diff.relaxes).toEqual([]);
    expect(diff.adds).toEqual([]);
    expect(diff.severityOverrides).toEqual({});
  });

  test('ears-x only adds, never relaxes', () => {
    const diff = diffProfile(BUILTIN_PROFILES['ears-x']);
    expect(diff.relaxes).toEqual([]);
    expect(diff.adds).toContain('frame metadata');
    expect(diff.adds).toContain('prohibition (shall not)');
    expect(diff.adds.some((entry) => entry.startsWith('id format'))).toBe(true);
  });

  test('kiro relaxes casing, comma, literal system name, and story wrappers', () => {
    const diff = diffProfile(BUILTIN_PROFILES.kiro);
    expect(diff.relaxes).toEqual(
      expect.arrayContaining([
        'keyword case',
        'leading comma',
        expect.stringContaining('literal system name'),
        'user-story wrappers',
      ]),
    );
    expect(diff.adds).toEqual([]);
    expect(diff.severityOverrides['EARS-W011']).toBe('off');
  });

  test('locates is generated from locator data', () => {
    expect(diffProfile(BUILTIN_PROFILES.strict).locates).toBe('every non-empty line in ears, text files.');
    expect(diffProfile(BUILTIN_PROFILES.openspec).locates).toContain('### Requirement: blocks');
    expect(diffProfile(BUILTIN_PROFILES.openspec).locates).toContain('#### Scenario: blocks');
  });
});

describe('summarizeProfiles', () => {
  test('returns all five profiles in render order', () => {
    expect(summarizeProfiles().map((diff) => diff.name)).toEqual([
      'strict',
      'ears-x',
      'kiro',
      'speckit',
      'openspec',
    ]);
  });

  test('snapshot of the full rendered summary set', () => {
    expect(summarizeProfiles()).toMatchInlineSnapshot(`
      [
        {
          "adds": [],
          "locates": "every non-empty line in ears, text files.",
          "name": "strict",
          "relaxes": [],
          "severityOverrides": {},
        },
        {
          "adds": [
            "frame metadata",
            "prohibition (shall not)",
            "id format (^REQ-\\d+$)",
          ],
          "locates": "every non-empty line in ears, text files.",
          "name": "ears-x",
          "relaxes": [],
          "severityOverrides": {},
        },
        {
          "adds": [],
          "locates": "list items under /^acceptance criteria$/ in markdown files.",
          "name": "kiro",
          "relaxes": [
            "keyword case",
            "leading comma",
            "literal system name (THE SYSTEM)",
            "user-story wrappers",
          ],
          "severityOverrides": {
            "EARS-W011": "off",
            "EARS-W014": "off",
          },
        },
        {
          "adds": [],
          "locates": "sections matching /^(functional )?requirements$/ in markdown files.",
          "name": "speckit",
          "relaxes": [],
          "severityOverrides": {},
        },
        {
          "adds": [],
          "locates": "### Requirement: blocks and #### Scenario: blocks in markdown files.",
          "name": "openspec",
          "relaxes": [],
          "severityOverrides": {},
        },
      ]
    `);
  });
});
