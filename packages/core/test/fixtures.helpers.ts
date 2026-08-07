/**
 * Pure comparison helpers for the golden-fixture harness.
 *
 * These functions encode the matching semantics from `fixtures/schema.md`.
 * They carry no I/O and no test-runner coupling so they can be unit tested
 * directly (see `fixtures.helpers.test.ts`).
 */

/** A `(code, severity)` pair, the unit of diagnostic multiset comparison. */
export interface DiagPair {
  code: string;
  severity: string;
}

/** A diagnostic entry that may pin an exact span. */
export interface SpannedDiag extends DiagPair {
  span?: { start: number; end: number };
}

/** Stable key for a `(code, severity)` pair. */
export function pairKey(d: DiagPair): string {
  return `${d.code}|${d.severity}`;
}

function counts(pairs: readonly DiagPair[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of pairs) {
    const key = pairKey(p);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

/**
 * Compare two diagnostic sets as a multiset of `(code, severity)` pairs.
 *
 * Order is irrelevant; duplicates count. Returns the pairs that are under- or
 * over-represented in `actual` relative to `expected`. An empty `missing` and
 * `extra` means the multisets are equal.
 */
export function multisetDiff(
  expected: readonly DiagPair[],
  actual: readonly DiagPair[],
): { missing: string[]; extra: string[] } {
  const ec = counts(expected);
  const ac = counts(actual);
  const missing: string[] = [];
  const extra: string[] = [];
  const keys = new Set<string>([...ec.keys(), ...ac.keys()]);
  for (const key of [...keys].sort()) {
    const e = ec.get(key) ?? 0;
    const a = ac.get(key) ?? 0;
    if (e > a) {
      missing.push(`${key} (expected ${e}, got ${a})`);
    } else if (a > e) {
      extra.push(`${key} (expected ${e}, got ${a})`);
    }
  }
  return { missing, extra };
}

/**
 * Verify per-diagnostic span assertions.
 *
 * Span is opt-in: only expected diagnostics that carry a `span` are checked.
 * For each such entry there must be at least one actual diagnostic with the
 * same `(code, severity)` and an exactly equal span. Returns a description for
 * every unsatisfied span assertion; empty means all span pins are satisfied.
 */
export function spanAssertionFailures(
  expected: readonly SpannedDiag[],
  actual: readonly SpannedDiag[],
): string[] {
  const failures: string[] = [];
  for (const ed of expected) {
    if (!ed.span) {
      continue;
    }
    const found = actual.some(
      (ad) =>
        ad.code === ed.code &&
        ad.severity === ed.severity &&
        ad.span !== undefined &&
        ad.span.start === ed.span!.start &&
        ad.span.end === ed.span!.end,
    );
    if (!found) {
      failures.push(`${pairKey(ed)} expected span ${JSON.stringify(ed.span)} not found in actual`);
    }
  }
  return failures;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function typeName(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

/**
 * Recursive subset (partial deep) match, per the `expected.ast` semantics.
 *
 * Only keys present in `expected` are checked; extra keys in `actual` are
 * ignored. Nested objects recurse by the same rule. Arrays compare element by
 * element in order over the first `expected.length` elements, and `actual`
 * must be at least that long. Primitive leaves compare with strict equality.
 *
 * Returns `null` on a match, or a `path: reason` string locating the first
 * mismatch for a readable failure message.
 */
export function subsetMatch(expected: unknown, actual: unknown, path = '$'): string | null {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      return `${path}: expected array, got ${typeName(actual)}`;
    }
    if (actual.length < expected.length) {
      return `${path}: expected at least ${expected.length} element(s), got ${actual.length}`;
    }
    for (let i = 0; i < expected.length; i++) {
      const result = subsetMatch(expected[i], actual[i], `${path}[${i}]`);
      if (result) {
        return result;
      }
    }
    return null;
  }

  if (isPlainObject(expected)) {
    if (!isPlainObject(actual)) {
      return `${path}: expected object, got ${typeName(actual)}`;
    }
    for (const key of Object.keys(expected)) {
      if (!(key in actual)) {
        return `${path}.${key}: missing key in actual`;
      }
      const result = subsetMatch(expected[key], actual[key], `${path}.${key}`);
      if (result) {
        return result;
      }
    }
    return null;
  }

  if (expected !== actual) {
    return `${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
  }
  return null;
}
