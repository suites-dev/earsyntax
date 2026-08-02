import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, runCli } from './helpers.js';

/**
 * Profile fixture matrix.
 *
 * Each profile has a host document that validates clean under its own profile.
 * The kiro document additionally witnesses the strict/kiro split: strict is
 * markdown-blind, so the same acceptance-criteria markdown fed through the
 * documented stdin/text route lints as plain prose and fails. This encodes the
 * documented semantics; it does not try to make strict read markdown structure.
 */

interface MatrixRow {
  profile: string;
  fixture: string;
}

const CLEAN_UNDER_OWN_PROFILE: MatrixRow[] = [
  { profile: 'strict', fixture: 'fixtures/profiles/strict/valid.ears' },
  { profile: 'ears-x', fixture: 'fixtures/profiles/ears-x/prohibition.ears' },
  { profile: 'ears-x', fixture: 'fixtures/profiles/ears-x/frame-metadata.ears' },
  { profile: 'kiro', fixture: 'fixtures/profiles/kiro/requirements.md' },
  { profile: 'speckit', fixture: 'fixtures/profiles/speckit/spec.md' },
  { profile: 'openspec', fixture: 'fixtures/profiles/openspec/spec.md' },
];

describe('profile fixture matrix: clean under own profile', () => {
  it.each(CLEAN_UNDER_OWN_PROFILE)(
    'validates $fixture clean under $profile',
    ({ profile, fixture }) => {
      const result = runCli(['validate', join(REPO_ROOT, fixture), '--profile', profile]);
      expect(result.code).toBe(0);
    },
  );
});

describe('strict-dialect text lint', () => {
  it('fails the Kiro acceptance-criteria markdown fed as text through stdin', () => {
    // strict does not locate markdown structure, so it lints every non-empty line
    // as a candidate requirement. The Kiro doc's prose lines are not valid EARS,
    // so the run produces error findings and exits 1.
    const kiroDoc = readFileSync(
      join(REPO_ROOT, 'fixtures/host-repos/kiro/.kiro/specs/checkout/requirements.md'),
      'utf8',
    );
    const result = runCli(['validate', '-', '--profile', 'strict'], { input: kiroDoc });
    expect(result.code).toBe(1);
  });
});
