/**
 * Fixture-driven checks for the strict and ears-x profile fixtures.
 *
 * These drive the strict and ears-x built-in dialects through `lintEars` and
 * assert the per-line expectations recorded in the sidecar JSON, plus the
 * superset invariant (every strict-valid line is ears-x-valid unchanged). The
 * host-native grammar rulings (Agent C4b) that these fixtures witness are now
 * wired into the parser, so every line runs; the `verification` markers in the
 * sidecars are retained as documentation of which ruling each line covers.
 *
 * File system access lives only in this test module, never in `src`.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { lintEars, BUILTIN_PROFILES, type DialectOptions } from '../src/index.js';

const PROFILES_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/profiles',
);

function dialectOf(name: 'strict' | 'ears-x'): DialectOptions {
  return BUILTIN_PROFILES[name].dialect;
}

function nonEmptyLines(relPath: string): string[] {
  return readFileSync(resolve(PROFILES_ROOT, relPath), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

interface StrictInvalidExpected {
  lines: {
    line: number;
    ruling: string;
    expect?: { id: string; code: string; severity: string }[];
  }[];
}

interface PerProfileExpected {
  lines: {
    line: number;
    text: string;
    pattern?: string;
    prohibition?: boolean;
    strict: { ok: boolean; expect?: { code: string }[] };
    'ears-x': { ok: boolean; expect?: { code: string }[]; prohibition?: boolean };
  }[];
}

function readText(relPath: string): string {
  return readFileSync(resolve(PROFILES_ROOT, relPath), 'utf8');
}

describe('strict/valid.ears', () => {
  const lines = nonEmptyLines('strict/valid.ears');
  const dialect = dialectOf('strict');

  test('every line is valid under strict with no diagnostics', () => {
    for (const text of lines) {
      const result = lintEars(text, undefined, { dialect });
      expect(result.valid, text).toBe(true);
      expect(result.diagnostics, text).toHaveLength(0);
    }
  });
});

describe('strict/invalid.ears', () => {
  const lines = nonEmptyLines('strict/invalid.ears');
  const expected = JSON.parse(readText('strict/invalid.expected.json')) as StrictInvalidExpected;
  const dialect = dialectOf('strict');

  for (const entry of expected.lines) {
    const text = lines[entry.line - 1];
    const want = (entry.expect ?? []).map((d) => d.code).sort();

    test(`line ${entry.line} (${entry.ruling})`, () => {
      const result = lintEars(text, undefined, { dialect });
      expect(result.valid, text).toBe(false);
      const actual = result.diagnostics.map((d) => d.code).sort();
      expect(actual, text).toEqual(want);
    });
  }
});

describe('ears-x/prohibition.ears', () => {
  const expected = JSON.parse(readText('ears-x/prohibition.expected.json')) as PerProfileExpected;
  const strict = dialectOf('strict');
  const earsx = dialectOf('ears-x');

  for (const entry of expected.lines) {
    test(`line ${entry.line} rejected under strict, accepted as a prohibition under ears-x`, () => {
      const underStrict = lintEars(entry.text, undefined, { dialect: strict });
      expect(underStrict.valid, entry.text).toBe(entry.strict.ok);
      const strictCodes = underStrict.diagnostics.map((d) => d.code).sort();
      expect(strictCodes, entry.text).toEqual(
        (entry.strict.expect ?? []).map((d) => d.code).sort(),
      );

      const underEarsX = lintEars(entry.text, undefined, { dialect: earsx });
      expect(underEarsX.valid, entry.text).toBe(true);
      expect(underEarsX.diagnostics, entry.text).toHaveLength(0);
      expect(underEarsX.ast?.prohibition, entry.text).toBe(true);
      if (entry.pattern) {
        expect(underEarsX.pattern, entry.text).toBe(entry.pattern);
      }
    });
  }
});

describe('ears-x/frame-metadata.ears', () => {
  const expected = JSON.parse(
    readText('ears-x/frame-metadata.expected.json'),
  ) as PerProfileExpected;
  const strict = dialectOf('strict');
  const earsx = dialectOf('ears-x');

  for (const entry of expected.lines) {
    test(`line ${entry.line} frame metadata rejected under strict, parsed clean under ears-x`, () => {
      const underStrict = lintEars(entry.text, undefined, { dialect: strict });
      expect(underStrict.valid, entry.text).toBe(entry.strict.ok);
      const strictCodes = underStrict.diagnostics.map((d) => d.code).sort();
      expect(strictCodes, entry.text).toEqual(
        (entry.strict.expect ?? []).map((d) => d.code).sort(),
      );

      const underEarsX = lintEars(entry.text, undefined, { dialect: earsx });
      expect(underEarsX.valid, entry.text).toBe(true);
      expect(underEarsX.diagnostics, entry.text).toHaveLength(0);
      if (entry.pattern) {
        expect(underEarsX.pattern, entry.text).toBe(entry.pattern);
      }
    });
  }
});

describe('superset invariant', () => {
  test('every strict-valid line is ears-x-valid unchanged', () => {
    const lines = nonEmptyLines('strict/valid.ears');
    const strict = dialectOf('strict');
    const earsx = dialectOf('ears-x');
    for (const text of lines) {
      const underStrict = lintEars(text, undefined, { dialect: strict });
      const underEarsX = lintEars(text, undefined, { dialect: earsx });
      expect(underStrict.valid, text).toBe(true);
      expect(underEarsX.valid, text).toBe(true);
      expect(underEarsX.diagnostics, text).toHaveLength(0);
    }
  });
});
