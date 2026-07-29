import { describe, expect, it } from 'vitest';
import { parseShell, type ShellFinding } from '../src/shell-parser.js';
import type { AndExpr, DiagnosticCode, FreeTextExpr } from '../src/types.js';

function codes(findings: ShellFinding[]): DiagnosticCode[] {
  return findings.map((f) => f.code);
}

describe('parseShell: valid shell patterns', () => {
  it('parses a ubiquitous requirement (no clauses)', () => {
    const { ast, findings } = parseShell('The system shall respond.');
    expect(findings).toEqual([]);
    expect(ast).toBeDefined();
    expect(ast!.pattern).toBe('ubiquitous');
    expect(ast!.system).toEqual({ raw: 'system', role: 'system' });
    expect(ast!.responses).toEqual(['respond']);
    expect(ast!.preconditions).toBeUndefined();
    expect(ast!.trigger).toBeUndefined();
    expect(ast!.feature).toBeUndefined();
    expect(ast!.unwanted).toBeUndefined();
  });

  it('parses a state-driven requirement (While)', () => {
    const { ast, findings } = parseShell('While the door is open, the system shall lock.');
    expect(findings).toEqual([]);
    expect(ast!.pattern).toBe('state-driven');
    expect(ast!.preconditions).toEqual<FreeTextExpr>({
      kind: 'free-text',
      span: { start: 6, end: 22 },
      text: 'the door is open',
    });
    expect(ast!.responses).toEqual(['lock']);
  });

  it('parses an event-driven requirement (When)', () => {
    const { ast, findings } = parseShell('When the user logs in, the system shall greet the user.');
    expect(findings).toEqual([]);
    expect(ast!.pattern).toBe('event-driven');
    expect((ast!.trigger as FreeTextExpr).text).toBe('the user logs in');
    expect(ast!.responses).toEqual(['greet the user']);
  });

  it('parses an optional-feature requirement (Where)', () => {
    const { ast, findings } = parseShell('Where analytics is enabled, the system shall log events.');
    expect(findings).toEqual([]);
    expect(ast!.pattern).toBe('optional-feature');
    expect((ast!.feature as FreeTextExpr).text).toBe('analytics is enabled');
  });

  it('parses an unwanted-behaviour requirement (If ... then)', () => {
    const { ast, findings } = parseShell('If the user is unknown, then the system shall reject.');
    expect(findings).toEqual([]);
    expect(ast!.pattern).toBe('unwanted-behaviour');
    expect((ast!.unwanted as FreeTextExpr).text).toBe('the user is unknown');
    expect(ast!.trigger).toBeUndefined();
    expect(ast!.responses).toEqual(['reject']);
  });

  it('keeps the response text intact and does not split on semicolons', () => {
    const { ast } = parseShell('The system shall log the event; notify the operator.');
    expect(ast!.responses).toEqual(['log the event; notify the operator']);
  });
});

describe('parseShell: case-insensitive keywords', () => {
  it('accepts upper-case and mixed-case keywords', () => {
    const { ast, findings } = parseShell('WHILE the door is open, THE system SHALL respond.');
    expect(findings).toEqual([]);
    expect(ast!.pattern).toBe('state-driven');
    expect(ast!.system.raw).toBe('system');
    expect(ast!.responses).toEqual(['respond']);
  });
});

describe('parseShell: complex multi-clause', () => {
  it('classifies a While + When requirement as complex', () => {
    const { ast, findings } = parseShell('While the door is open, when the user acts, the system shall respond.');
    expect(findings).toEqual([]);
    expect(ast!.pattern).toBe('complex');
    expect((ast!.preconditions as FreeTextExpr).text).toBe('the door is open');
    expect((ast!.trigger as FreeTextExpr).text).toBe('the user acts');
  });

  it('accepts When followed by If ... then as valid complex (no spurious order finding)', () => {
    const input =
      'When a payment webhook is received, if the HMAC signature is invalid, then the billing service shall reject the webhook.';
    const { ast, findings } = parseShell(input);
    expect(findings).toEqual([]);
    expect(ast!.pattern).toBe('complex');
    expect((ast!.trigger as FreeTextExpr).text).toBe('a payment webhook is received');
    expect((ast!.unwanted as FreeTextExpr).text).toBe('the HMAC signature is invalid');
    expect(ast!.system.raw).toBe('billing service');
    expect(ast!.responses).toEqual(['reject the webhook']);
  });

  it('flags repeated When clauses as invalid clause order', () => {
    const { findings } = parseShell('When the user logs in, when the user logs out, the system shall respond.');
    expect(codes(findings)).toContain('ears.invalid_clause_order');
  });

  it('and-joins repeated same-kind clauses', () => {
    const { ast } = parseShell('While the door is open, while the light is on, the system shall respond.');
    expect(ast!.pattern).toBe('complex');
    const pre = ast!.preconditions as AndExpr;
    expect(pre.kind).toBe('and');
    expect(pre.items).toHaveLength(2);
    expect((pre.items[0] as FreeTextExpr).text).toBe('the door is open');
    expect((pre.items[1] as FreeTextExpr).text).toBe('the light is on');
  });
});

describe('parseShell: commaAsAnd', () => {
  const input =
    'When a payment webhook is received, the signature header is present, the billing service shall verify the HMAC signature.';

  it('keeps a comma-joined clause body intact when commaAsAnd is true', () => {
    const { ast, findings } = parseShell(input, { commaAsAnd: true });
    expect(findings).toEqual([]);
    expect(ast!.pattern).toBe('event-driven');
    expect((ast!.trigger as FreeTextExpr).text).toBe(
      'a payment webhook is received, the signature header is present',
    );
    expect(ast!.system.raw).toBe('billing service');
    expect(ast!.responses).toEqual(['verify the HMAC signature']);
  });

  it('splits at the first comma-then-the when commaAsAnd is false (default)', () => {
    const { ast } = parseShell(input);
    // Without commaAsAnd, the first "comma + the" ends the trigger clause, so
    // the system tail is mis-detected. The bodies differ from the true tail.
    expect((ast!.trigger as FreeTextExpr).text).toBe('a payment webhook is received');
    expect(ast!.system.raw).not.toBe('billing service');
  });
});

describe('parseShell: structural findings', () => {
  it('reports invalid clause order (When before While)', () => {
    const { ast, findings } = parseShell('When the user acts, while the door is open, the system shall respond.');
    expect(codes(findings)).toContain('ears.invalid_clause_order');
    expect(ast).toBeDefined();
  });

  it('reports missing shall', () => {
    const { ast, findings } = parseShell('The system responds.');
    expect(codes(findings)).toContain('ears.missing_shall');
    expect(ast).toBeUndefined();
  });

  it('reports multiple shall but still recovers an ast', () => {
    const { ast, findings } = parseShell('The system shall shall respond.');
    expect(codes(findings)).toContain('ears.multiple_shall');
    expect(ast).toBeDefined();
  });

  it('reports missing system when the system name is empty', () => {
    const { ast, findings } = parseShell('The shall respond.');
    expect(codes(findings)).toContain('ears.missing_system');
    expect(ast!.system.raw).toBe('');
  });

  it('reports an empty response', () => {
    const { ast, findings } = parseShell('The system shall .');
    expect(codes(findings)).toContain('ears.empty_response');
    expect(ast).toBeUndefined();
  });

  it('reports an empty clause', () => {
    const { ast, findings } = parseShell('When , the system shall respond.');
    expect(codes(findings)).toContain('ears.empty_clause');
    expect(ast).toBeDefined();
  });

  it('reports an If clause with no then', () => {
    const { findings } = parseShell('If the user is unknown the system shall reject.');
    expect(codes(findings)).toContain('ears.invalid_if_then_form');
  });

  it('reports no match for empty input', () => {
    const { ast, findings } = parseShell('   ');
    expect(codes(findings)).toEqual(['ears.no_match']);
    expect(ast).toBeUndefined();
  });

  it('reports no match for text with no recognizable structure', () => {
    const { ast, findings } = parseShell('just some prose without a shall keyword');
    expect(codes(findings)).toContain('ears.no_match');
    expect(ast).toBeUndefined();
  });
});

describe('parseShell: span correctness', () => {
  it('produces spans that index into the original input', () => {
    const input = 'While the door is open, the system shall lock.';
    const { ast } = parseShell(input);
    const span = (ast!.preconditions as FreeTextExpr).span!;
    expect(input.slice(span.start, span.end)).toBe('the door is open');
  });

  it('preserves leading-whitespace offsets in spans', () => {
    const input = '   While ready, the system shall run.';
    const { ast } = parseShell(input);
    const span = (ast!.preconditions as FreeTextExpr).span!;
    expect(input.slice(span.start, span.end)).toBe('ready');
    expect(span.start).toBe(9);
  });

  it('spans the trigger body of a nested clause correctly', () => {
    const input = 'While the door is open, when the user acts, the system shall respond.';
    const { ast } = parseShell(input);
    const span = (ast!.trigger as FreeTextExpr).span!;
    expect(input.slice(span.start, span.end)).toBe('the user acts');
  });
});
