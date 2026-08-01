import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DIAGNOSTIC_REGISTRY,
  getDiagnosticEntry,
  idForCode,
  resolveDiagnosticId,
  type DiagnosticRegistryEntry,
} from './registry.js';
import type { DiagnosticCode } from './types.js';

/**
 * The expected migration table, duplicated here as inline test data so drift in
 * the registry fails the test. It mirrors the table in
 * `docs/refactor/host-native-facade.md` and the fixture
 * `fixtures/diagnostics/migration-table.json`, which is also cross-checked
 * below. Kept in the frozen alphabetical-by-old-code order within each band.
 */
const EXPECTED: readonly { id: string; oldCode: DiagnosticCode }[] = [
  { id: 'EARS-E001', oldCode: 'catalog.system_ambiguous' },
  { id: 'EARS-E002', oldCode: 'catalog.system_unresolved' },
  { id: 'EARS-E003', oldCode: 'ears.empty_clause' },
  { id: 'EARS-E004', oldCode: 'ears.empty_response' },
  { id: 'EARS-E005', oldCode: 'ears.invalid_clause_order' },
  { id: 'EARS-E006', oldCode: 'ears.invalid_if_then_form' },
  { id: 'EARS-E007', oldCode: 'ears.missing_shall' },
  { id: 'EARS-E008', oldCode: 'ears.missing_system' },
  { id: 'EARS-E009', oldCode: 'ears.multiple_shall' },
  { id: 'EARS-E010', oldCode: 'ears.no_match' },
  { id: 'EARS-E011', oldCode: 'expr.empty_subexpression' },
  { id: 'EARS-E012', oldCode: 'expr.invalid_operator_sequence' },
  { id: 'EARS-E013', oldCode: 'expr.unbalanced_parentheses' },
  { id: 'EARS-W001', oldCode: 'catalog.event_ambiguous' },
  { id: 'EARS-W002', oldCode: 'catalog.event_unresolved' },
  { id: 'EARS-W003', oldCode: 'catalog.feature_ambiguous' },
  { id: 'EARS-W004', oldCode: 'catalog.feature_unresolved' },
  { id: 'EARS-W005', oldCode: 'catalog.state_ambiguous' },
  { id: 'EARS-W006', oldCode: 'catalog.state_unresolved' },
  { id: 'EARS-W007', oldCode: 'catalog.term_unreferenced' },
  { id: 'EARS-W008', oldCode: 'expr.ambiguous_term' },
  { id: 'EARS-W009', oldCode: 'expr.mixed_unresolved_terms' },
  { id: 'EARS-W010', oldCode: 'expr.operator_precedence_warning' },
  { id: 'EARS-W011', oldCode: 'expr.unknown_term' },
  { id: 'EARS-W012', oldCode: 'lint.alias_used' },
  { id: 'EARS-W013', oldCode: 'lint.multiple_responses' },
  { id: 'EARS-W014', oldCode: 'lint.suspicious_text_shape' },
  { id: 'EARS-W015', oldCode: 'lint.unparsed_tail' },
  { id: 'EARS-W016', oldCode: 'lint.vague_response' },
];

/** Every raw code in the frozen union, so we can prove the registry is total. */
const ALL_CODES: readonly DiagnosticCode[] = EXPECTED.map((row) => row.oldCode);

interface MigrationTableFixture {
  rows: { id: string; oldCode: string; defaultSeverity: 'error' | 'warning' }[];
}

function loadMigrationFixture(): MigrationTableFixture {
  const fixturesRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures');
  const path = resolve(fixturesRoot, 'diagnostics/migration-table.json');
  return JSON.parse(readFileSync(path, 'utf8')) as MigrationTableFixture;
}

describe('diagnostic registry', () => {
  it('has 29 entries, one per old code', () => {
    expect(DIAGNOSTIC_REGISTRY).toHaveLength(29);
    expect(EXPECTED).toHaveLength(29);
    expect(ALL_CODES).toHaveLength(29);
  });

  it('assigns unique ids', () => {
    const ids = DIAGNOSTIC_REGISTRY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('assigns unique old-code aliases', () => {
    const codes = DIAGNOSTIC_REGISTRY.map((entry) => entry.oldCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('matches the frozen migration table exactly (drift guard)', () => {
    const actual = DIAGNOSTIC_REGISTRY.map((entry) => ({ id: entry.id, oldCode: entry.oldCode }));
    expect(actual).toEqual(EXPECTED);
  });

  it('agrees with the committed migration-table.json fixture', () => {
    const fixture = loadMigrationFixture();
    const actual = DIAGNOSTIC_REGISTRY.map((entry) => ({
      id: entry.id,
      oldCode: entry.oldCode,
      defaultSeverity: entry.defaultSeverity,
    }));
    expect(actual).toEqual(fixture.rows);
  });

  it('maps every one of the 29 old codes to a current id', () => {
    for (const code of ALL_CODES) {
      const id = resolveDiagnosticId(code);
      expect(id, `no id for old code ${code}`).toBeDefined();
      expect(id).toMatch(/^EARS-[EW]\d{3}$/);
    }
  });

  it("aligns each id's E/W band with its default severity", () => {
    for (const entry of DIAGNOSTIC_REGISTRY) {
      const band = entry.id.startsWith('EARS-E') ? 'error' : 'warning';
      expect(entry.defaultSeverity, `${entry.id} band vs defaultSeverity`).toBe(band);
      expect(entry.id).toMatch(/^EARS-[EW]\d{3}$/);
    }
  });

  it('carries complete human-facing metadata on every entry', () => {
    for (const entry of DIAGNOSTIC_REGISTRY) {
      for (const field of [
        'title',
        'meaning',
        'rationale',
        'badExample',
        'goodExample',
        'profileNotes',
      ] as const) {
        expect(entry[field].length, `${entry.id}.${field} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('never emits an em dash in metadata', () => {
    for (const entry of DIAGNOSTIC_REGISTRY) {
      for (const value of Object.values(entry)) {
        expect(value).not.toContain('—');
      }
    }
  });
});

describe('resolveDiagnosticId', () => {
  it('resolves a deprecated alias to its current id', () => {
    expect(resolveDiagnosticId('ears.missing_shall')).toBe('EARS-E007');
    expect(resolveDiagnosticId('lint.vague_response')).toBe('EARS-W016');
  });

  it('resolves a current id to itself', () => {
    expect(resolveDiagnosticId('EARS-E001')).toBe('EARS-E001');
    expect(resolveDiagnosticId('EARS-W011')).toBe('EARS-W011');
  });

  it('returns undefined for an unknown id or code', () => {
    expect(resolveDiagnosticId('EARS-E999')).toBeUndefined();
    expect(resolveDiagnosticId('ears.not_a_code')).toBeUndefined();
    expect(resolveDiagnosticId('')).toBeUndefined();
  });
});

describe('getDiagnosticEntry', () => {
  it('fetches an entry by current id', () => {
    const entry = getDiagnosticEntry('EARS-E006');
    expect(entry?.oldCode).toBe('ears.invalid_if_then_form');
    expect(entry?.title).toBe('Malformed If/then unwanted-behaviour form');
  });

  it('fetches an entry by deprecated alias', () => {
    const entry = getDiagnosticEntry('ears.invalid_if_then_form');
    expect(entry?.id).toBe('EARS-E006');
  });

  it('returns undefined for an unknown id', () => {
    expect(getDiagnosticEntry('nope')).toBeUndefined();
  });
});

describe('idForCode', () => {
  it('maps a raw code to its current id', () => {
    expect(idForCode('catalog.system_ambiguous')).toBe('EARS-E001');
    expect(idForCode('lint.alias_used')).toBe('EARS-W012');
  });
});

describe('registry immutability', () => {
  it('deeply freezes the registry array and every entry', () => {
    expect(Object.isFrozen(DIAGNOSTIC_REGISTRY)).toBe(true);
    for (const entry of DIAGNOSTIC_REGISTRY) {
      expect(Object.isFrozen(entry)).toBe(true);
    }
  });

  it('rejects mutation of an entry at runtime', () => {
    const entry = DIAGNOSTIC_REGISTRY[0];
    expect(() => {
      (entry as { title: string }).title = 'mutated';
    }).toThrow(TypeError);
  });

  it('rejects mutation of the array at runtime', () => {
    const array = DIAGNOSTIC_REGISTRY as DiagnosticRegistryEntry[];
    expect(() => {
      array.push(array[0]);
    }).toThrow(TypeError);
  });
});
