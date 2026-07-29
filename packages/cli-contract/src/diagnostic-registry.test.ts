import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES, DIAGNOSTIC_DESCRIPTIONS } from './diagnostic-registry.js';

describe('diagnostic registry', () => {
  it('lists every described code, sorted', () => {
    const expected = [...Object.keys(DIAGNOSTIC_DESCRIPTIONS)].sort();
    expect(DIAGNOSTIC_CODES).toEqual(expected);
  });

  it('gives every code a non-empty description ending with a period', () => {
    for (const code of DIAGNOSTIC_CODES) {
      const text = DIAGNOSTIC_DESCRIPTIONS[code];
      expect(text.length).toBeGreaterThan(0);
      expect(text.endsWith('.')).toBe(true);
    }
  });

  it('has no duplicate codes', () => {
    expect(new Set(DIAGNOSTIC_CODES).size).toBe(DIAGNOSTIC_CODES.length);
  });
});
