import { describe, expect, it } from 'vitest';

import {
  buildDiagnostic,
  computeValid,
  dedupeDiagnostics,
  MODE_DEPENDENT_CODES,
  messageForCode,
  severityByMode,
  severityForCode,
  sortDiagnostics,
} from './diagnostics.js';
import type { Diagnostic, DiagnosticCode, Span } from './types.js';

const ALL_CODES = [
  'ears.no_match',
  'ears.invalid_clause_order',
  'ears.missing_system',
  'ears.missing_shall',
  'ears.multiple_shall',
  'ears.invalid_if_then_form',
  'ears.empty_clause',
  'ears.empty_response',
  'expr.unbalanced_parentheses',
  'expr.invalid_operator_sequence',
  'expr.empty_subexpression',
  'expr.operator_precedence_warning',
  'expr.unknown_term',
  'expr.ambiguous_term',
  'expr.mixed_unresolved_terms',
  'catalog.system_unresolved',
  'catalog.system_ambiguous',
  'catalog.state_unresolved',
  'catalog.state_ambiguous',
  'catalog.event_unresolved',
  'catalog.event_ambiguous',
  'catalog.feature_unresolved',
  'catalog.feature_ambiguous',
  'catalog.term_unreferenced',
  'lint.multiple_responses',
  'lint.vague_response',
  'lint.unparsed_tail',
  'lint.alias_used',
  'lint.suspicious_text_shape',
] as const satisfies readonly DiagnosticCode[];

const STRUCTURAL_CODES = [
  'ears.no_match',
  'ears.invalid_clause_order',
  'ears.missing_system',
  'ears.missing_shall',
  'ears.multiple_shall',
  'ears.invalid_if_then_form',
  'ears.empty_clause',
  'ears.empty_response',
  'expr.unbalanced_parentheses',
  'expr.invalid_operator_sequence',
  'expr.empty_subexpression',
] as const satisfies readonly DiagnosticCode[];

const SYSTEM_CATALOG_CODES = [
  'catalog.system_unresolved',
  'catalog.system_ambiguous',
] as const satisfies readonly DiagnosticCode[];

const NON_SYSTEM_CATALOG_CODES = [
  'catalog.state_unresolved',
  'catalog.state_ambiguous',
  'catalog.event_unresolved',
  'catalog.event_ambiguous',
  'catalog.feature_unresolved',
  'catalog.feature_ambiguous',
  'catalog.term_unreferenced',
] as const satisfies readonly DiagnosticCode[];

const LINT_CODES = [
  'lint.multiple_responses',
  'lint.vague_response',
  'lint.unparsed_tail',
  'lint.alias_used',
  'lint.suspicious_text_shape',
] as const satisfies readonly DiagnosticCode[];

const EXPR_WARNING_CODES = [
  'expr.operator_precedence_warning',
  'expr.unknown_term',
  'expr.ambiguous_term',
  'expr.mixed_unresolved_terms',
] as const satisfies readonly DiagnosticCode[];

const span = (start: number, end: number): Span => ({ start, end });

const startOf = (d: Diagnostic): number | undefined => (d.span ? d.span.start : undefined);
const endOf = (d: Diagnostic): number | undefined => (d.span ? d.span.end : undefined);

describe('severityByMode', () => {
  it('is error in strict mode and warning in guided mode', () => {
    expect(severityByMode('strict')).toBe('error');
    expect(severityByMode('guided')).toBe('warning');
  });
});

describe('severityForCode', () => {
  it('makes structural failures errors in strict and warnings in guided', () => {
    for (const code of STRUCTURAL_CODES) {
      expect(severityForCode(code, 'strict')).toBe('error');
      expect(severityForCode(code, 'guided')).toBe('warning');
    }
  });

  it('makes system catalog failures errors in strict and warnings in guided', () => {
    for (const code of SYSTEM_CATALOG_CODES) {
      expect(severityForCode(code, 'strict')).toBe('error');
      expect(severityForCode(code, 'guided')).toBe('warning');
    }
  });

  it('keeps non-system catalog failures warnings in both modes', () => {
    for (const code of NON_SYSTEM_CATALOG_CODES) {
      expect(severityForCode(code, 'strict')).toBe('warning');
      expect(severityForCode(code, 'guided')).toBe('warning');
    }
  });

  it('keeps lint findings warnings in both modes', () => {
    for (const code of LINT_CODES) {
      expect(severityForCode(code, 'strict')).toBe('warning');
      expect(severityForCode(code, 'guided')).toBe('warning');
    }
  });

  it('keeps expression precedence and term warnings warnings in both modes', () => {
    for (const code of EXPR_WARNING_CODES) {
      expect(severityForCode(code, 'strict')).toBe('warning');
      expect(severityForCode(code, 'guided')).toBe('warning');
    }
  });

  it('classifies every registered code as either mode-dependent or warning', () => {
    for (const code of ALL_CODES) {
      const inSet = MODE_DEPENDENT_CODES.has(code);
      expect(severityForCode(code, 'strict')).toBe(inSet ? 'error' : 'warning');
    }
  });

  it('MODE_DEPENDENT_CODES contains exactly the structural and system catalog codes', () => {
    const expected = [...STRUCTURAL_CODES, ...SYSTEM_CATALOG_CODES].sort();
    const actual = [...MODE_DEPENDENT_CODES].sort();
    expect(actual).toEqual(expected);
  });
});

describe('messageForCode', () => {
  it('produces a non-empty single sentence for every code', () => {
    for (const code of ALL_CODES) {
      const message = messageForCode(code);
      expect(message.length).toBeGreaterThan(0);
      expect(message.endsWith('.')).toBe(true);
    }
  });

  it('never emits an em dash', () => {
    for (const code of ALL_CODES) {
      expect(messageForCode(code, { term: 'x', clause: 'while', alias: 'a', canonical: 'b' })).not.toContain(
        '—',
      );
    }
  });

  it('interpolates the offending term when provided', () => {
    expect(messageForCode('catalog.system_unresolved', { term: 'billing service' })).toContain(
      'billing service',
    );
    expect(messageForCode('expr.unknown_term', { term: 'the widget spins' })).toContain(
      'the widget spins',
    );
    expect(messageForCode('lint.vague_response', { term: 'appropriate' })).toContain('appropriate');
  });

  it('falls back to a generic phrasing without context', () => {
    expect(messageForCode('catalog.system_unresolved')).toBe(
      'The system name does not match any known system.',
    );
    expect(messageForCode('expr.unknown_term')).toBe(
      'A clause term does not match any known catalog entry.',
    );
  });

  it('interpolates the clause keyword for clause-scoped codes', () => {
    expect(messageForCode('ears.empty_clause', { clause: 'while' })).toContain("'while'");
    expect(messageForCode('ears.invalid_clause_order', { clause: 'if' })).toContain("'if'");
  });

  it('interpolates alias and canonical name for lint.alias_used', () => {
    expect(messageForCode('lint.alias_used', { alias: 'db', canonical: 'Postgres' })).toBe(
      'The catalog alias "db" matched; prefer the canonical name "Postgres".',
    );
    expect(messageForCode('lint.alias_used', { term: 'db' })).toContain('db');
    expect(messageForCode('lint.alias_used')).toBe(
      'A catalog alias matched; prefer the canonical name.',
    );
  });
});

describe('buildDiagnostic', () => {
  it('builds a strict error for a structural finding with its span', () => {
    const d = buildDiagnostic({ code: 'ears.missing_shall', span: span(0, 5) }, 'strict');
    expect(d).toEqual({
      code: 'ears.missing_shall',
      severity: 'error',
      message: "The requirement does not contain exactly one 'shall' response boundary.",
      span: { start: 0, end: 5 },
    });
  });

  it('downgrades a structural finding to a warning in guided mode', () => {
    const d = buildDiagnostic({ code: 'ears.missing_shall' }, 'guided');
    expect(d.severity).toBe('warning');
    expect(d.span).toBeUndefined();
  });

  it('keeps a non-system catalog finding a warning even in strict mode', () => {
    const d = buildDiagnostic({ code: 'catalog.state_unresolved' }, 'strict', {
      term: 'is idle',
    });
    expect(d.severity).toBe('warning');
    expect(d.message).toContain('is idle');
  });

  it('omits the span key entirely when the finding has no span', () => {
    const d = buildDiagnostic({ code: 'lint.unparsed_tail' }, 'strict');
    expect('span' in d).toBe(false);
  });
});

describe('sortDiagnostics', () => {
  const make = (
    code: DiagnosticCode,
    s: Span | undefined,
    severity: Diagnostic['severity'] = 'warning',
    message = 'm',
  ): Diagnostic => (s ? { code, severity, message, span: s } : { code, severity, message });

  it('orders by span start ascending', () => {
    const sorted = sortDiagnostics([
      make('ears.no_match', span(10, 12)),
      make('ears.no_match', span(2, 4)),
      make('ears.no_match', span(6, 8)),
    ]);
    expect(sorted.map(startOf)).toEqual([2, 6, 10]);
  });

  it('breaks a start tie by span end ascending', () => {
    const sorted = sortDiagnostics([
      make('ears.no_match', span(5, 20)),
      make('ears.no_match', span(5, 8)),
      make('ears.no_match', span(5, 12)),
    ]);
    expect(sorted.map(endOf)).toEqual([8, 12, 20]);
  });

  it('breaks a span tie by code, then message, then severity', () => {
    const sorted = sortDiagnostics([
      make('expr.unknown_term', span(0, 3), 'warning', 'b'),
      make('expr.unknown_term', span(0, 3), 'error', 'a'),
      make('ears.no_match', span(0, 3), 'warning', 'z'),
    ]);
    expect(sorted.map((d) => d.code)).toEqual([
      'ears.no_match',
      'expr.unknown_term',
      'expr.unknown_term',
    ]);
    // Same code and span: message 'a' sorts before 'b'.
    expect(sorted[1].message).toBe('a');
    expect(sorted[2].message).toBe('b');
  });

  it('places spanless diagnostics after all spanned ones', () => {
    const sorted = sortDiagnostics([
      make('ears.no_match', undefined),
      make('ears.no_match', span(100, 101)),
      make('ears.missing_shall', undefined),
    ]);
    expect(startOf(sorted[0])).toBe(100);
    expect(sorted[1].span).toBeUndefined();
    expect(sorted[2].span).toBeUndefined();
    // Spanless ties fall back to code order.
    expect(sorted[1].code).toBe('ears.missing_shall');
    expect(sorted[2].code).toBe('ears.no_match');
  });

  it('does not mutate the input array', () => {
    const input = [make('ears.no_match', span(5, 6)), make('ears.no_match', span(1, 2))];
    const snapshot = input.slice();
    sortDiagnostics(input);
    expect(input).toEqual(snapshot);
  });

  it('is order-independent: shuffled inputs produce identical output', () => {
    const base = [
      make('ears.no_match', span(3, 4)),
      make('expr.unknown_term', span(3, 4)),
      make('ears.missing_shall', undefined),
      make('lint.unparsed_tail', span(0, 2)),
    ];
    const forward = sortDiagnostics(base);
    const reversed = sortDiagnostics(base.slice().reverse());
    expect(forward).toEqual(reversed);
  });
});

describe('dedupeDiagnostics', () => {
  const d = (
    code: DiagnosticCode,
    s: Span | undefined,
    severity: Diagnostic['severity'] = 'error',
    message = 'm',
  ): Diagnostic => (s ? { code, severity, message, span: s } : { code, severity, message });

  it('drops an exact duplicate with matching code, span, severity, and message', () => {
    const out = dedupeDiagnostics([
      d('ears.missing_shall', span(0, 5)),
      d('ears.missing_shall', span(0, 5)),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(d('ears.missing_shall', span(0, 5)));
  });

  it('collapses spanless duplicates too', () => {
    const out = dedupeDiagnostics([
      d('ears.missing_shall', undefined),
      d('ears.missing_shall', undefined),
    ]);
    expect(out).toHaveLength(1);
  });

  it('keeps findings that share a code and span but differ in message', () => {
    const out = dedupeDiagnostics([
      d('catalog.state_unresolved', span(0, 4), 'warning', 'The state term "a" ...'),
      d('catalog.state_unresolved', span(0, 4), 'warning', 'The state term "b" ...'),
    ]);
    expect(out).toHaveLength(2);
  });

  it('keeps findings that share code and message but differ in span', () => {
    const out = dedupeDiagnostics([
      d('ears.missing_shall', span(0, 5)),
      d('ears.missing_shall', span(6, 10)),
    ]);
    expect(out).toHaveLength(2);
  });

  it('does not treat a spanless finding as a duplicate of a spanned one', () => {
    const out = dedupeDiagnostics([
      d('ears.missing_shall', undefined),
      d('ears.missing_shall', span(0, 0)),
    ]);
    expect(out).toHaveLength(2);
  });

  it('keeps the first occurrence and preserves relative order', () => {
    const first = d('ears.no_match', span(2, 3), 'error', 'first');
    const out = dedupeDiagnostics([
      first,
      d('lint.unparsed_tail', span(0, 1), 'warning'),
      d('ears.no_match', span(2, 3), 'error', 'first'),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(first);
    expect(out[1].code).toBe('lint.unparsed_tail');
  });

  it('does not mutate the input array', () => {
    const input = [d('ears.no_match', span(0, 1)), d('ears.no_match', span(0, 1))];
    const snapshot = input.slice();
    dedupeDiagnostics(input);
    expect(input).toEqual(snapshot);
  });

  it('composes with sortDiagnostics the same in either order', () => {
    const input = [
      d('ears.no_match', span(5, 6), 'error', 'x'),
      d('lint.unparsed_tail', span(0, 1), 'warning'),
      d('ears.no_match', span(5, 6), 'error', 'x'),
    ];
    expect(sortDiagnostics(dedupeDiagnostics(input))).toEqual(
      dedupeDiagnostics(sortDiagnostics(input)),
    );
  });
});

describe('computeValid', () => {
  it('is true when there are no diagnostics', () => {
    expect(computeValid([])).toBe(true);
  });

  it('is true when every diagnostic is a warning or info', () => {
    expect(
      computeValid([
        { code: 'lint.unparsed_tail', severity: 'warning', message: 'm' },
        { code: 'lint.alias_used', severity: 'info', message: 'm' },
      ]),
    ).toBe(true);
  });

  it('is false when any diagnostic is an error', () => {
    expect(
      computeValid([
        { code: 'lint.unparsed_tail', severity: 'warning', message: 'm' },
        { code: 'ears.missing_shall', severity: 'error', message: 'm' },
      ]),
    ).toBe(false);
  });

  it('agrees with buildDiagnostic across modes', () => {
    const strict = buildDiagnostic({ code: 'catalog.system_unresolved' }, 'strict');
    const guided = buildDiagnostic({ code: 'catalog.system_unresolved' }, 'guided');
    expect(computeValid([strict])).toBe(false);
    expect(computeValid([guided])).toBe(true);
  });
});
