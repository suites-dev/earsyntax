import { describe, expect, it } from 'vitest';

import { parseClauseExpression } from './expression-parser.js';
import type { AndExpr, ClauseExpr, GroupExpr, NotExpr, OrExpr, TermExpr } from './types.js';

function term(expr: ClauseExpr): TermExpr {
  expect(expr.kind).toBe('term');
  return expr as TermExpr;
}

describe('parseClauseExpression', () => {
  it('parses a single term with its span and leaves catalog resolution unset', () => {
    const { expr, findings } = parseClauseExpression('the user is signed in', 0);
    const t = term(expr);
    expect(t.text).toBe('the user is signed in');
    expect(t.span).toEqual({ start: 0, end: 21 });
    expect(t.term).toBeUndefined();
    expect(findings).toEqual([]);
  });

  it('applies precedence not > and > or for "not A and B or C"', () => {
    const { expr, findings } = parseClauseExpression('not A and B or C', 0);

    // Top level is OR of [ (not A) and B, C ].
    expect(expr.kind).toBe('or');
    const or = expr as OrExpr;
    expect(or.items).toHaveLength(2);

    const and = or.items[0] as AndExpr;
    expect(and.kind).toBe('and');
    expect(and.items).toHaveLength(2);

    const not = and.items[0] as NotExpr;
    expect(not.kind).toBe('not');
    expect(term(not.item).text).toBe('A');
    expect(term(and.items[1]).text).toBe('B');
    expect(term(or.items[1]).text).toBe('C');

    // Mixed and/or without parentheses warns.
    expect(findings.map((f) => f.code)).toContain('expr.operator_precedence_warning');
  });

  it('does not warn on mixed and/or when parentheses group the operands', () => {
    const { expr, findings } = parseClauseExpression('(A or B) and C', 0);
    expect(expr.kind).toBe('and');
    const and = expr as AndExpr;
    expect(and.items).toHaveLength(2);

    const group = and.items[0] as GroupExpr;
    expect(group.kind).toBe('group');
    expect(group.item.kind).toBe('or');
    expect(term(and.items[1]).text).toBe('C');

    expect(findings.map((f) => f.code)).not.toContain('expr.operator_precedence_warning');
  });

  it('parses nested groups', () => {
    const { expr, findings } = parseClauseExpression('((A or B) and C) or D', 0);
    expect(expr.kind).toBe('or');
    const or = expr as OrExpr;
    const outerGroup = or.items[0] as GroupExpr;
    expect(outerGroup.kind).toBe('group');

    const innerAnd = outerGroup.item as AndExpr;
    expect(innerAnd.kind).toBe('and');
    const innerGroup = innerAnd.items[0] as GroupExpr;
    expect(innerGroup.kind).toBe('group');
    expect(innerGroup.item.kind).toBe('or');
    expect(term(or.items[1]).text).toBe('D');

    // Grouping suppresses the precedence warning even with mixed operators.
    expect(findings.map((f) => f.code)).not.toContain('expr.operator_precedence_warning');
  });

  it('reports an unbalanced closing parenthesis', () => {
    const { findings } = parseClauseExpression('A and B)', 0);
    const paren = findings.filter((f) => f.code === 'expr.unbalanced_parentheses');
    expect(paren.length).toBeGreaterThanOrEqual(1);
    expect(paren[0].span).toEqual({ start: 7, end: 8 });
  });

  it('reports an unbalanced opening parenthesis', () => {
    const { findings } = parseClauseExpression('(A and B', 0);
    const codes = findings.map((f) => f.code);
    expect(codes).toContain('expr.unbalanced_parentheses');
    // The tokenizer flags the span of the whole clause body.
    const openFinding = findings.find(
      (f) => f.code === 'expr.unbalanced_parentheses' && f.span?.start === 0 && f.span.end === 8,
    );
    expect(openFinding).toBeDefined();
  });

  it('flags a repeated operator such as "A and and B"', () => {
    const { findings } = parseClauseExpression('A and and B', 0);
    expect(findings.map((f) => f.code)).toContain('expr.invalid_operator_sequence');
  });

  it('emits only invalid_operator_sequence for "X or or Y" (fixture INV-010)', () => {
    // Once an operator error truncates the parse, the follow-on unparsed tail
    // is suppressed so a single root cause yields a single finding.
    const { findings } = parseClauseExpression('a webhook is received or or a refund is requested', 0);
    const codes = findings.map((f) => f.code);
    expect(codes).toContain('expr.invalid_operator_sequence');
    expect(codes).not.toContain('lint.unparsed_tail');
  });

  it('treats infix "not" as part of a term (fixture VAL-034)', () => {
    const { expr, findings } = parseClauseExpression(
      'the payment provider is available and (the retry queue is not full or the system is in maintenance mode)',
      0,
    );
    expect(expr.kind).toBe('and');
    const and = expr as AndExpr;
    expect(and.items).toHaveLength(2);
    expect(term(and.items[0]).text).toBe('the payment provider is available');

    const group = and.items[1] as GroupExpr;
    expect(group.kind).toBe('group');
    const or = group.item as OrExpr;
    expect(or.kind).toBe('or');
    expect(term(or.items[0]).text).toBe('the retry queue is not full');
    expect(term(or.items[1]).text).toBe('the system is in maintenance mode');

    // Balanced input parses cleanly: no spurious unbalanced parens or tail.
    expect(findings).toEqual([]);
  });

  it('flags a leading operator', () => {
    const { findings } = parseClauseExpression('and A', 0);
    expect(findings.map((f) => f.code)).toContain('expr.invalid_operator_sequence');
  });

  it('flags a trailing operator', () => {
    const { expr, findings } = parseClauseExpression('A and', 0);
    expect(term(expr).text).toBe('A');
    expect(findings.map((f) => f.code)).toContain('expr.invalid_operator_sequence');
  });

  it('flags an empty group "()" with a single empty_subexpression finding', () => {
    // Approved deviation from the Go port: the empty-group branch emits exactly
    // expr.empty_subexpression, not invalid_operator_sequence + unbalanced.
    const { expr, findings } = parseClauseExpression('()', 0);
    expect(expr.kind).toBe('group');
    expect((expr as GroupExpr).item.kind).toBe('free-text');
    const codes = findings.map((f) => f.code);
    expect(codes).toEqual(['expr.empty_subexpression']);
  });

  it('emits only empty_subexpression for "A and ()" (fixture INV-012)', () => {
    const { expr, findings } = parseClauseExpression('a webhook is received and ()', 0);
    expect(expr.kind).toBe('and');
    const and = expr as AndExpr;
    expect(and.items[1].kind).toBe('group');
    expect(findings.map((f) => f.code)).toEqual(['expr.empty_subexpression']);
  });

  it('emits expr.empty_subexpression for an unterminated empty group', () => {
    const { expr, findings } = parseClauseExpression('(', 0);
    expect(expr.kind).toBe('group');
    const codes = findings.map((f) => f.code);
    expect(codes).toContain('expr.empty_subexpression');
    expect(codes).toContain('expr.unbalanced_parentheses');
  });

  it('emits expr.empty_subexpression for a wholly empty body', () => {
    const { expr, findings } = parseClauseExpression('   ', 0);
    expect(expr.kind).toBe('free-text');
    expect(findings.map((f) => f.code)).toContain('expr.empty_subexpression');
  });

  describe('commaAsAnd option', () => {
    it('treats commas as "and" when commaAsAnd is true', () => {
      const { expr, findings } = parseClauseExpression('A, B', 0, { commaAsAnd: true });
      expect(expr.kind).toBe('and');
      const and = expr as AndExpr;
      expect(and.items).toHaveLength(2);
      expect(term(and.items[0]).text).toBe('A');
      expect(term(and.items[1]).text).toBe('B');
      expect(findings.map((f) => f.code)).not.toContain('expr.invalid_operator_sequence');
    });

    it('never treats a comma as "and" when commaAsAnd is false (default)', () => {
      const { expr, findings } = parseClauseExpression('A, B', 0);
      // The leading term parses; the comma and everything after it is left as
      // an unparsed tail rather than joined with "and".
      expect(term(expr).text).toBe('A');
      const codes = findings.map((f) => f.code);
      expect(codes).toContain('lint.unparsed_tail');
      expect(codes).not.toContain('expr.invalid_operator_sequence');
    });
  });

  it('produces absolute spans using the base offset', () => {
    const baseOffset = 10;
    const { expr } = parseClauseExpression('A and B', baseOffset);
    const and = expr as AndExpr;
    expect(term(and.items[0]).span).toEqual({ start: 10, end: 11 });
    expect(term(and.items[1]).span).toEqual({ start: 16, end: 17 });
    expect(and.span).toEqual({ start: 10, end: 17 });
  });

  it('matches keywords case-insensitively', () => {
    const { expr } = parseClauseExpression('A AND B Or C', 0);
    expect(expr.kind).toBe('or');
    const or = expr as OrExpr;
    const and = or.items[0] as AndExpr;
    expect(and.kind).toBe('and');
    expect(term(and.items[0]).text).toBe('A');
    expect(term(and.items[1]).text).toBe('B');
    expect(term(or.items[1]).text).toBe('C');
  });

  it('parses "not A" as a negation', () => {
    const { expr } = parseClauseExpression('not the service is available', 0);
    expect(expr.kind).toBe('not');
    const not = expr as NotExpr;
    expect(term(not.item).text).toBe('the service is available');
  });

  it('is deterministic across repeated parses', () => {
    const first = parseClauseExpression('not A and B or (C or D)', 3, { commaAsAnd: true });
    const second = parseClauseExpression('not A and B or (C or D)', 3, { commaAsAnd: true });
    expect(second).toEqual(first);
  });
});
