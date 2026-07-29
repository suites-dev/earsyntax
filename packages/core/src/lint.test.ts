import { describe, expect, it } from 'vitest';

import { lintCatalogCoverage, lintEars, lintEarsBatch, parseEars } from './index.js';
import { DEFAULT_VAGUE_TERMS, withDefaults } from './options.js';
import type { Catalog, Diagnostic, DiagnosticCode } from './types.js';

/** Collect the set of diagnostic codes present on a result. */
function codes(diagnostics: Diagnostic[]): DiagnosticCode[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}

/** A small catalog aligned with the billing showcase used in the brief. */
function billingCatalog(): Catalog {
  return {
    systems: [{ id: 'SYS-BILLING', name: 'billing service', aliases: ['billing svc'] }],
    events: [{ id: 'EVT-WEBHOOK', name: 'a payment webhook is received' }],
  };
}

describe('lintEars: canonical patterns', () => {
  it('classifies a ubiquitous requirement', () => {
    const result = lintEars('The billing service shall retain the audit log.');
    expect(result.pattern).toBe('ubiquitous');
    expect(result.valid).toBe(true);
    expect(result.ast?.system.raw).toBe('billing service');
    expect(result.ast?.responses).toEqual(['retain the audit log']);
    expect(result.diagnostics).toEqual([]);
  });

  it('classifies a state-driven requirement', () => {
    const result = lintEars(
      'While the payment provider is unavailable, the billing service shall queue retryable events.',
    );
    expect(result.pattern).toBe('state-driven');
    expect(result.valid).toBe(true);
    expect(result.ast?.preconditions?.kind).toBe('term');
  });

  it('classifies an event-driven requirement', () => {
    const result = lintEars(
      'When a payment webhook is received, the billing service shall verify the HMAC signature.',
    );
    expect(result.pattern).toBe('event-driven');
    expect(result.valid).toBe(true);
    expect(result.ast?.trigger?.kind).toBe('term');
    expect(result.ast?.responses).toEqual(['verify the HMAC signature']);
  });

  it('classifies an optional-feature requirement', () => {
    const result = lintEars(
      'Where enterprise SSO is enabled, the billing service shall enforce single sign-on.',
    );
    expect(result.pattern).toBe('optional-feature');
    expect(result.valid).toBe(true);
    expect(result.ast?.feature?.kind).toBe('term');
  });

  it('classifies an unwanted-behaviour requirement', () => {
    const result = lintEars(
      'If the HMAC signature is invalid, then the billing service shall reject the webhook.',
    );
    expect(result.pattern).toBe('unwanted-behaviour');
    expect(result.valid).toBe(true);
    expect(result.ast?.unwanted?.kind).toBe('term');
  });

  it('classifies a complex multi-clause requirement', () => {
    const result = lintEars(
      'While the payment provider is unavailable, when a payment webhook is received, the billing service shall queue retryable events.',
    );
    expect(result.pattern).toBe('complex');
    expect(result.valid).toBe(true);
    expect(result.ast?.preconditions).toBeDefined();
    expect(result.ast?.trigger).toBeDefined();
  });
});

describe('lintEars: clause expression trees', () => {
  it('parses boolean operators in a clause body into an expression tree', () => {
    const result = lintEars(
      'When a webhook arrives and the queue is ready, the billing service shall process the event.',
    );
    expect(result.ast?.trigger?.kind).toBe('and');
    // Every leaf term carries a span pointing back into the source text.
    const trigger = result.ast?.trigger;
    if (trigger?.kind === 'and') {
      for (const item of trigger.items) {
        expect(item.kind).toBe('term');
        expect(item.span).toBeDefined();
      }
    }
  });

  it('flags mixed and/or without grouping', () => {
    const result = lintEars(
      'When a or b and c, the billing service shall process the event.',
    );
    expect(codes(result.diagnostics)).toContain('expr.operator_precedence_warning');
  });
});

describe('lintEars: structural failures', () => {
  it('reports a missing shall as an error in strict mode', () => {
    const result = lintEars('The billing service verifies the signature.');
    expect(result.valid).toBe(false);
    expect(codes(result.diagnostics)).toContain('ears.missing_shall');
    expect(result.ast).toBeUndefined();
    expect(result.references).toEqual([]);
  });

  it('reports an invalid if/then form', () => {
    const result = lintEars('If the signature is invalid, the billing service shall reject it.');
    expect(result.valid).toBe(false);
    expect(codes(result.diagnostics)).toContain('ears.invalid_if_then_form');
  });
});

describe('lintEars: guided vs strict severity', () => {
  const text = 'maybe enable reverse thrust someday';

  it('emits errors and no suspicious-shape hint in strict mode', () => {
    const result = lintEars(text);
    expect(result.valid).toBe(false);
    const strictCodes = codes(result.diagnostics);
    expect(strictCodes).toContain('ears.no_match');
    expect(strictCodes).not.toContain('lint.suspicious_text_shape');
    const noMatch = result.diagnostics.find((d) => d.code === 'ears.no_match');
    expect(noMatch?.severity).toBe('error');
  });

  it('downgrades to warnings and adds a suspicious-shape hint in guided mode', () => {
    const result = lintEars(text, undefined, { mode: 'guided' });
    const guidedCodes = codes(result.diagnostics);
    expect(guidedCodes).toContain('lint.suspicious_text_shape');
    expect(guidedCodes).toContain('ears.no_match');
    const noMatch = result.diagnostics.find((d) => d.code === 'ears.no_match');
    expect(noMatch?.severity).toBe('warning');
    // With every structural failure downgraded, the result is valid.
    expect(result.valid).toBe(true);
  });
});

describe('lintEars: response handling', () => {
  it('splits semicolon-separated responses and flags multiple responses', () => {
    const result = lintEars(
      'The billing service shall persist the event; enqueue a processing job.',
    );
    expect(result.ast?.responses).toEqual(['persist the event', 'enqueue a processing job']);
    expect(codes(result.diagnostics)).toContain('lint.multiple_responses');
    const multi = result.diagnostics.find((d) => d.code === 'lint.multiple_responses');
    expect(multi?.severity).toBe('warning');
  });

  it('keeps a single response without a multiple-responses finding', () => {
    const result = lintEars('The billing service shall persist the event.');
    expect(result.ast?.responses).toEqual(['persist the event']);
    expect(codes(result.diagnostics)).not.toContain('lint.multiple_responses');
  });

  it('flags a default vague term in a response', () => {
    const result = lintEars('The billing service shall retry as needed.');
    expect(codes(result.diagnostics)).toContain('lint.vague_response');
    const vague = result.diagnostics.find((d) => d.code === 'lint.vague_response');
    expect(vague?.message).toContain('as needed');
  });

  it('honors a configured vague-term list', () => {
    const custom = lintEars('The billing service shall retry quickly.', undefined, {
      vagueTerms: ['quickly'],
    });
    expect(codes(custom.diagnostics)).toContain('lint.vague_response');

    // The default terms no longer apply when a custom list is supplied.
    const noDefault = lintEars('The billing service shall retry as needed.', undefined, {
      vagueTerms: ['quickly'],
    });
    expect(codes(noDefault.diagnostics)).not.toContain('lint.vague_response');
  });
});

describe('lintEars: catalog matching end to end', () => {
  it('resolves a system and event against the catalog', () => {
    const result = lintEars(
      'When a payment webhook is received, the billing service shall verify the HMAC signature.',
      billingCatalog(),
    );
    expect(result.valid).toBe(true);
    expect(result.ast?.system.matched?.id).toBe('SYS-BILLING');
    const systemRef = result.references.find((ref) => ref.clause === 'system');
    expect(systemRef?.matched?.id).toBe('SYS-BILLING');
  });

  it('warns when a system is matched via an alias', () => {
    const result = lintEars('The billing svc shall retain the audit log.', billingCatalog());
    expect(result.valid).toBe(true);
    expect(codes(result.diagnostics)).toContain('lint.alias_used');
    expect(result.ast?.system.viaAlias).toBe(true);
  });

  it('reports an unresolved system as an error in strict mode', () => {
    const result = lintEars('The shipping service shall retain the audit log.', billingCatalog());
    expect(result.valid).toBe(false);
    expect(codes(result.diagnostics)).toContain('catalog.system_unresolved');
    const diag = result.diagnostics.find((d) => d.code === 'catalog.system_unresolved');
    expect(diag?.severity).toBe('error');
  });

  it('downgrades an unresolved system to a warning in guided mode', () => {
    const result = lintEars('The shipping service shall retain the audit log.', billingCatalog(), {
      mode: 'guided',
    });
    expect(result.valid).toBe(true);
    const diag = result.diagnostics.find((d) => d.code === 'catalog.system_unresolved');
    expect(diag?.severity).toBe('warning');
  });

  it('reports an ambiguous system match', () => {
    const ambiguous: Catalog = {
      systems: [
        { id: 'SYS-A', name: 'billing service' },
        { id: 'SYS-B', name: 'billing service' },
      ],
    };
    const result = lintEars('The billing service shall retain the audit log.', ambiguous);
    expect(result.valid).toBe(false);
    expect(codes(result.diagnostics)).toContain('catalog.system_ambiguous');
    expect(result.ast?.system.ambiguous?.length).toBe(2);
  });

  it('operates in no-catalog mode when no catalog is supplied', () => {
    const result = lintEars('The billing service shall retain the audit log.');
    expect(result.ast?.system.matched).toBeUndefined();
    expect(result.ast?.system.unresolved).toBeUndefined();
    expect(codes(result.diagnostics)).not.toContain('catalog.system_unresolved');
  });
});

describe('lintEarsBatch', () => {
  it('preserves input order and echoes ids', () => {
    const results = lintEarsBatch([
      { id: 'REQ-001', text: 'The billing service shall retain the audit log.' },
      { id: 'REQ-002', text: 'The billing service verifies the signature.' },
      { id: 'REQ-003', text: 'When a webhook arrives, the billing service shall process it.' },
    ]);
    expect(results.map((r) => r.id)).toEqual(['REQ-001', 'REQ-002', 'REQ-003']);
    expect(results[0].valid).toBe(true);
    expect(results[1].valid).toBe(false);
    expect(results[2].pattern).toBe('event-driven');
  });

  it('omits id when the input item has none', () => {
    const results = lintEarsBatch([{ text: 'The billing service shall retain the audit log.' }]);
    expect('id' in results[0]).toBe(false);
  });
});

describe('parseEars', () => {
  it('returns pattern, ast, and diagnostics without a references field', () => {
    const result = parseEars(
      'When a payment webhook is received, the billing service shall verify the HMAC signature.',
    );
    expect(result.pattern).toBe('event-driven');
    expect(result.ast?.trigger?.kind).toBe('term');
    expect(Array.isArray(result.diagnostics)).toBe(true);
    expect('references' in result).toBe(false);
  });

  it('fills catalog term matches on the ast without emitting catalog diagnostics', () => {
    const result = parseEars('The shipping service shall retain the audit log.', billingCatalog());
    // The ast reflects the catalog match outcome.
    expect(result.ast?.system.unresolved).toBe(true);
    // But structural-only diagnostics exclude catalog findings.
    expect(codes(result.diagnostics)).not.toContain('catalog.system_unresolved');
  });

  it('reports structural diagnostics', () => {
    const result = parseEars('The billing service verifies the signature.');
    expect(codes(result.diagnostics)).toContain('ears.missing_shall');
    expect(result.ast).toBeUndefined();
  });
});

describe('lintCatalogCoverage', () => {
  it('reports catalog entries no requirement references, in strict mode', () => {
    const diagnostics = lintCatalogCoverage(
      [{ text: 'The billing service shall retain the audit log.' }],
      billingCatalog(),
    );
    const coverageCodes = codes(diagnostics);
    expect(coverageCodes).toContain('catalog.term_unreferenced');
    // The referenced system is covered; the unreferenced event is not.
    const messages = diagnostics.map((d) => d.message);
    expect(messages.some((m) => m.includes('EVT-WEBHOOK'))).toBe(true);
    expect(messages.some((m) => m.includes('SYS-BILLING'))).toBe(false);
  });

  it('returns no coverage diagnostics in guided mode', () => {
    const diagnostics = lintCatalogCoverage(
      [{ text: 'The billing service shall retain the audit log.' }],
      billingCatalog(),
      { mode: 'guided' },
    );
    expect(diagnostics).toEqual([]);
  });
});

describe('determinism', () => {
  it('produces deeply equal results for the same input', () => {
    const text =
      'While the payment provider is unavailable, when a payment webhook is received, the billing service shall queue the event; retry as needed.';
    const first = lintEars(text, billingCatalog());
    const second = lintEars(text, billingCatalog());
    expect(second).toEqual(first);
  });

  it('produces deeply equal batch results across runs', () => {
    const items = [
      { id: 'a', text: 'The billing service shall retain the audit log.' },
      { id: 'b', text: 'If the signature is invalid, then the billing service shall reject it.' },
    ];
    expect(lintEarsBatch(items, billingCatalog())).toEqual(lintEarsBatch(items, billingCatalog()));
  });
});

describe('withDefaults', () => {
  it('applies the documented defaults', () => {
    expect(withDefaults()).toEqual({
      mode: 'strict',
      commaAsAnd: false,
      vagueTerms: [...DEFAULT_VAGUE_TERMS],
    });
  });

  it('falls back to default vague terms for an empty array', () => {
    expect(withDefaults({ vagueTerms: [] }).vagueTerms).toEqual([...DEFAULT_VAGUE_TERMS]);
  });

  it('keeps a supplied non-empty vague-term list', () => {
    expect(withDefaults({ vagueTerms: ['quickly'] }).vagueTerms).toEqual(['quickly']);
  });
});
