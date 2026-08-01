/**
 * Fixture-driven coverage for the host-native locator.
 *
 * Each fixture under `fixtures/pipeline/` is a representative host document; the
 * sibling `*.candidates.json` file pins the candidates the profile's locator
 * must produce, including their original `line` and `col`. This guards the
 * position-preservation acceptance bar against regressions.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILTIN_PROFILES, type ProfileName } from '@earsyntax/core';
import { describe, expect, it } from 'vitest';
import { extractCandidates } from './pipeline.js';

const FIXTURES = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'pipeline');

const CASES: { file: string; profile: ProfileName }[] = [
  { file: 'kiro-requirements.md', profile: 'kiro' },
  { file: 'speckit-spec.md', profile: 'speckit' },
  { file: 'openspec-spec.md', profile: 'openspec' },
  { file: 'strict-basic.ears', profile: 'strict' },
];

describe('pipeline fixtures', () => {
  for (const { file, profile } of CASES) {
    it(`locates ${file} under the ${profile} profile`, () => {
      const content = readFileSync(join(FIXTURES, file), 'utf8');
      const expected = JSON.parse(
        readFileSync(join(FIXTURES, `${file.replace(/\.[^.]+$/, '')}.candidates.json`), 'utf8'),
      );
      const { candidates, notices } = extractCandidates({
        files: [{ path: file, content }],
        profile: BUILTIN_PROFILES[profile],
      });
      expect(notices).toEqual([]);
      expect(candidates).toEqual(expected);
    });
  }
});
