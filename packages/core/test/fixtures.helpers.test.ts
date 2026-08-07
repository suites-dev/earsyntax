import { describe, expect, it } from 'vitest';
import { multisetDiff, pairKey, spanAssertionFailures, subsetMatch } from './fixtures.helpers.js';

describe('pairKey', () => {
  it('joins code and severity', () => {
    expect(pairKey({ code: 'ears.missing_shall', severity: 'error' })).toBe(
      'ears.missing_shall|error',
    );
  });
});

describe('multisetDiff', () => {
  it('reports equal multisets as no diff', () => {
    const diff = multisetDiff(
      [
        { code: 'a', severity: 'error' },
        { code: 'b', severity: 'warning' },
      ],
      [
        { code: 'b', severity: 'warning' },
        { code: 'a', severity: 'error' },
      ],
    );
    expect(diff).toEqual({ missing: [], extra: [] });
  });

  it('treats an empty-vs-empty comparison as equal', () => {
    expect(multisetDiff([], [])).toEqual({ missing: [], extra: [] });
  });

  it('detects a missing pair', () => {
    const diff = multisetDiff([{ code: 'a', severity: 'error' }], []);
    expect(diff.missing).toEqual(['a|error (expected 1, got 0)']);
    expect(diff.extra).toEqual([]);
  });

  it('detects an extra pair', () => {
    const diff = multisetDiff([], [{ code: 'a', severity: 'error' }]);
    expect(diff.extra).toEqual(['a|error (expected 0, got 1)']);
    expect(diff.missing).toEqual([]);
  });

  it('counts duplicates: two expected require two actual', () => {
    const diff = multisetDiff(
      [
        { code: 'lint.vague_response', severity: 'warning' },
        { code: 'lint.vague_response', severity: 'warning' },
      ],
      [{ code: 'lint.vague_response', severity: 'warning' }],
    );
    expect(diff.missing).toEqual(['lint.vague_response|warning (expected 2, got 1)']);
    expect(diff.extra).toEqual([]);
  });

  it('distinguishes same code across severities', () => {
    const diff = multisetDiff(
      [{ code: 'x', severity: 'error' }],
      [{ code: 'x', severity: 'warning' }],
    );
    expect(diff.missing).toEqual(['x|error (expected 1, got 0)']);
    expect(diff.extra).toEqual(['x|warning (expected 0, got 1)']);
  });
});

describe('spanAssertionFailures', () => {
  it('ignores expected diagnostics without a span', () => {
    expect(spanAssertionFailures([{ code: 'a', severity: 'error' }], [])).toEqual([]);
  });

  it('passes when an actual diagnostic carries the pinned span', () => {
    const failures = spanAssertionFailures(
      [{ code: 'a', severity: 'error', span: { start: 0, end: 3 } }],
      [{ code: 'a', severity: 'error', span: { start: 0, end: 3 } }],
    );
    expect(failures).toEqual([]);
  });

  it('fails when the span differs', () => {
    const failures = spanAssertionFailures(
      [{ code: 'a', severity: 'error', span: { start: 0, end: 3 } }],
      [{ code: 'a', severity: 'error', span: { start: 0, end: 4 } }],
    );
    expect(failures).toHaveLength(1);
  });

  it('fails when no actual diagnostic matches code and severity', () => {
    const failures = spanAssertionFailures(
      [{ code: 'a', severity: 'error', span: { start: 0, end: 3 } }],
      [{ code: 'a', severity: 'warning', span: { start: 0, end: 3 } }],
    );
    expect(failures).toHaveLength(1);
  });
});

describe('subsetMatch', () => {
  it('matches when only a subset of keys is asserted', () => {
    expect(
      subsetMatch(
        { pattern: 'event-driven', system: { role: 'system' } },
        {
          pattern: 'event-driven',
          system: { role: 'system', raw: 'billing service' },
          responses: ['verify'],
        },
      ),
    ).toBeNull();
  });

  it('ignores extra keys in actual', () => {
    expect(subsetMatch({ a: 1 }, { a: 1, b: 2 })).toBeNull();
  });

  it('reports a primitive mismatch with a path', () => {
    const result = subsetMatch({ pattern: 'ubiquitous' }, { pattern: 'event-driven' });
    expect(result).toBe('$.pattern: expected "ubiquitous", got "event-driven"');
  });

  it('reports a missing key', () => {
    expect(subsetMatch({ a: { b: 1 } }, { a: {} })).toBe('$.a.b: missing key in actual');
  });

  it('compares arrays element by element in order', () => {
    expect(subsetMatch(['verify'], ['verify', 'log'])).toBeNull();
    expect(subsetMatch(['verify', 'log'], ['verify'])).toBe(
      '$: expected at least 2 element(s), got 1',
    );
    expect(subsetMatch(['a'], ['b'])).toBe('$[0]: expected "a", got "b"');
  });

  it('matches array elements as subsets', () => {
    expect(subsetMatch([{ kind: 'term' }], [{ kind: 'term', text: 'x' }])).toBeNull();
  });

  it('handles null leaves distinctly from objects', () => {
    expect(subsetMatch(null, null)).toBeNull();
    expect(subsetMatch({ a: null }, { a: null })).toBeNull();
    expect(subsetMatch({ a: 1 }, null)).toBe('$: expected object, got null');
  });

  it('reports a type mismatch when actual is not an object', () => {
    expect(subsetMatch({ a: 1 }, 'x')).toBe('$: expected object, got string');
  });

  it('reports a type mismatch when actual is not an array', () => {
    expect(subsetMatch([1], { 0: 1 })).toBe('$: expected array, got object');
  });
});
