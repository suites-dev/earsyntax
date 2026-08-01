/**
 * Golden-fixture harness for profile schema v1 validation.
 *
 * Discovers every JSON fixture under `fixtures/profiles/schema/{valid,invalid}`
 * and runs each through `validateProfile`. Valid fixtures must validate.
 * Invalid fixtures carry an `expectedErrors` array; each expected
 * `{ path, code }` must appear in the reported errors (subset match). File
 * system access lives only in this test module, never in `src`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { validateProfile, type ProfileValidationErrorCode } from '../src/profiles/schema.js';

const SCHEMA_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/profiles/schema');

interface ExpectedError {
  path: string;
  code: ProfileValidationErrorCode;
}

interface InvalidFixture {
  expectedErrors: ExpectedError[];
  profile: unknown;
}

function jsonFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('profile schema fixtures: valid', () => {
  const dir = join(SCHEMA_ROOT, 'valid');
  for (const file of jsonFiles(dir)) {
    test(file, () => {
      const profile = readJson(join(dir, file));
      const result = validateProfile(profile);
      expect(result.ok, result.ok ? '' : JSON.stringify(result.errors)).toBe(true);
    });
  }
});

describe('profile schema fixtures: invalid', () => {
  const dir = join(SCHEMA_ROOT, 'invalid');
  for (const file of jsonFiles(dir)) {
    test(file, () => {
      const fixture = readJson(join(dir, file)) as InvalidFixture;
      const result = validateProfile(fixture.profile);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        for (const expected of fixture.expectedErrors) {
          const match = result.errors.find(
            (error) => error.path === expected.path && error.code === expected.code,
          );
          expect(
            match,
            `expected error ${expected.code} at '${expected.path}', got ${JSON.stringify(result.errors)}`,
          ).toBeDefined();
        }
      }
    });
  }
});
