import { describe, expect, it } from 'vitest';

import {
  catalogCoverageDiagnostics,
  findMatches,
  isCatalogEmpty,
  normalizeKey,
  resolveAndCollect,
  resolveTerm,
} from './catalog.js';
import type { Catalog, EarsAst } from './types.js';

describe('normalizeKey', () => {
  it('lowercases and collapses surrounding and internal whitespace', () => {
    expect(normalizeKey('  Billing   Service ')).toBe('billing service');
  });

  it('trims leading and trailing punctuation from each token', () => {
    expect(normalizeKey('Billing, Service.')).toBe('billing service');
    expect(normalizeKey('"quoted";')).toBe('quoted');
  });

  it('returns an empty key for blank input', () => {
    expect(normalizeKey('')).toBe('');
    expect(normalizeKey('   ')).toBe('');
  });

  it('is stable across case and whitespace variants', () => {
    expect(normalizeKey('REVERSE\tThrust')).toBe(normalizeKey('reverse thrust'));
  });
});

describe('isCatalogEmpty', () => {
  it('treats an undefined catalog as empty', () => {
    expect(isCatalogEmpty(undefined)).toBe(true);
  });

  it('treats a catalog with no entries in any group as empty', () => {
    expect(isCatalogEmpty({})).toBe(true);
    expect(isCatalogEmpty({ systems: [], events: [] })).toBe(true);
  });

  it('is not empty when any group has an entry', () => {
    expect(isCatalogEmpty({ systems: [{ id: 'S1', name: 'billing service' }] })).toBe(false);
  });
});

describe('resolveTerm: single match', () => {
  const catalog: Catalog = {
    systems: [{ id: 'SYS-BILLING', name: 'billing service', aliases: ['billing'] }],
  };

  it('matches an exact canonical name with viaAlias false and no diagnostics', () => {
    const { term, diagnostics } = resolveTerm('billing service', 'system', catalog, 'strict');
    expect(term.matched).toEqual({ group: 'systems', id: 'SYS-BILLING', name: 'billing service' });
    expect(term.viaAlias).toBeUndefined();
    expect(term.unresolved).toBeUndefined();
    expect(diagnostics).toEqual([]);
  });

  it('matches through case and whitespace normalization', () => {
    const { term } = resolveTerm('  BILLING   SERVICE ', 'system', catalog, 'strict');
    expect(term.matched?.id).toBe('SYS-BILLING');
  });

  it('flags an alias match with viaAlias and a lint.alias_used warning', () => {
    const { term, diagnostics } = resolveTerm('billing', 'system', catalog, 'strict');
    expect(term.matched?.id).toBe('SYS-BILLING');
    expect(term.viaAlias).toBe(true);
    expect(diagnostics).toEqual([
      {
        code: 'lint.alias_used',
        severity: 'warning',
        message: 'alias used instead of canonical term',
      },
    ]);
  });

  it('prefers the canonical name over an alias within the same entry', () => {
    const dupeCatalog: Catalog = {
      systems: [{ id: 'SYS-1', name: 'reverse thrust', aliases: ['reverse thrust'] }],
    };
    const { term, diagnostics } = resolveTerm('reverse thrust', 'system', dupeCatalog, 'strict');
    expect(term.viaAlias).toBeUndefined();
    expect(diagnostics).toEqual([]);
  });
});

describe('resolveTerm: unresolved', () => {
  const catalog: Catalog = {
    systems: [{ id: 'SYS-1', name: 'billing service' }],
    events: [{ id: 'EV-1', name: 'timeout' }],
  };

  it('marks an unknown system unresolved as an error in strict mode without an expr code', () => {
    const { term, diagnostics } = resolveTerm('unknown system', 'system', catalog, 'strict');
    expect(term.unresolved).toBe(true);
    expect(term.matched).toBeUndefined();
    expect(diagnostics).toEqual([
      { code: 'catalog.system_unresolved', severity: 'error', message: 'unresolved catalog term' },
    ]);
  });

  it('keeps expr.unknown_term for unresolved clause-expression terms', () => {
    const { diagnostics } = resolveTerm('never happens', 'event', catalog, 'strict');
    expect(diagnostics.map((d) => d.code)).toEqual([
      'expr.unknown_term',
      'catalog.event_unresolved',
    ]);
  });

  it('downgrades an unresolved system to a warning in guided mode', () => {
    const { diagnostics } = resolveTerm('unknown system', 'system', catalog, 'guided');
    const systemDiag = diagnostics.find((d) => d.code === 'catalog.system_unresolved');
    expect(systemDiag?.severity).toBe('warning');
  });

  it('keeps an unresolved non-system term a warning even in strict mode', () => {
    const { diagnostics } = resolveTerm('never happens', 'event', catalog, 'strict');
    const eventDiag = diagnostics.find((d) => d.code === 'catalog.event_unresolved');
    expect(eventDiag?.severity).toBe('warning');
  });

  it('attaches the span to unresolved diagnostics when one is given', () => {
    const span = { start: 3, end: 9 };
    const { diagnostics } = resolveTerm('mystery', 'event', catalog, 'strict', span);
    expect(diagnostics.every((d) => d.span === span)).toBe(true);
  });
});

describe('resolveTerm: ambiguous', () => {
  it('reports all candidates when more than one entry matches', () => {
    const catalog: Catalog = {
      events: [{ id: 'EV-A', name: 'timeout' }],
      states: [{ id: 'ST-B', name: 'session ended', aliases: ['timeout'] }],
    };
    const { term, diagnostics } = resolveTerm('timeout', 'event', catalog, 'strict');
    expect(term.matched).toBeUndefined();
    expect(term.ambiguous).toEqual([
      { group: 'events', id: 'EV-A', name: 'timeout' },
      { group: 'states', id: 'ST-B', name: 'session ended' },
    ]);
    expect(diagnostics).toEqual([
      {
        code: 'expr.ambiguous_term',
        severity: 'warning',
        message: 'ambiguous catalog term in expression',
      },
      {
        code: 'catalog.event_ambiguous',
        severity: 'warning',
        message: 'ambiguous catalog term match',
      },
    ]);
  });

  it('reports an ambiguous system with only its catalog code', () => {
    const catalog: Catalog = {
      systems: [
        { id: 'SYS-A', name: 'core' },
        { id: 'SYS-B', name: 'core' },
      ],
    };
    const { term, diagnostics } = resolveTerm('core', 'system', catalog, 'strict');
    expect(term.ambiguous?.map((ref) => ref.id)).toEqual(['SYS-A', 'SYS-B']);
    expect(diagnostics).toEqual([
      {
        code: 'catalog.system_ambiguous',
        severity: 'error',
        message: 'ambiguous catalog term match',
      },
    ]);
  });

  it('orders ambiguous candidates by group then id deterministically', () => {
    const catalog: Catalog = {
      events: [
        { id: 'EV-9', name: 'spike' },
        { id: 'EV-1', name: 'spike' },
      ],
    };
    const { term } = resolveTerm('spike', 'event', catalog, 'strict');
    expect(term.ambiguous?.map((ref) => ref.id)).toEqual(['EV-1', 'EV-9']);
  });
});

describe('findMatches: role-scoped groups', () => {
  const catalog: Catalog = {
    systems: [{ id: 'SYS-1', name: 'shared' }],
    events: [{ id: 'EV-1', name: 'shared' }],
    states: [{ id: 'ST-1', name: 'shared' }],
    features: [{ id: 'FT-1', name: 'shared' }],
  };

  it('restricts the system role to the systems group only', () => {
    const matches = findMatches('shared', 'system', catalog);
    expect(matches.map((m) => m.ref.group)).toEqual(['systems']);
  });

  it('lets an event term reach events and states but not systems', () => {
    const groups = findMatches('shared', 'event', catalog).map((m) => m.ref.group);
    expect(groups).toContain('events');
    expect(groups).toContain('states');
    expect(groups).not.toContain('systems');
  });

  it('returns no matches for a blank term', () => {
    expect(findMatches('   ', 'event', catalog)).toEqual([]);
  });
});

describe('resolveTerm: no-catalog mode', () => {
  it('skips matching for an undefined catalog', () => {
    const { term, diagnostics } = resolveTerm('anything', 'system', undefined, 'strict');
    expect(term).toEqual({ raw: 'anything', role: 'system' });
    expect(diagnostics).toEqual([]);
  });

  it('skips matching for a catalog with no entries', () => {
    const { term, diagnostics } = resolveTerm('anything', 'event', {}, 'strict');
    expect(term.matched).toBeUndefined();
    expect(term.unresolved).toBeUndefined();
    expect(diagnostics).toEqual([]);
  });
});

describe('resolveAndCollect', () => {
  const catalog: Catalog = {
    systems: [{ id: 'SYS-1', name: 'billing service' }],
    events: [{ id: 'EV-1', name: 'timeout' }],
  };

  function buildAst(): EarsAst {
    return {
      pattern: 'event-driven',
      system: { raw: 'billing service', role: 'system' },
      trigger: {
        kind: 'and',
        span: { start: 0, end: 24 },
        items: [
          { kind: 'term', text: 'timeout', span: { start: 0, end: 7 } },
          { kind: 'term', text: 'ghost event', span: { start: 12, end: 23 } },
        ],
      },
      responses: ['do x'],
      raw: 'When timeout and ghost event, billing service shall do x',
    };
  }

  it('fills the system term on the returned ast and collects it as a reference', () => {
    const ast = buildAst();
    const { ast: resolved, references } = resolveAndCollect(ast, catalog);
    expect(resolved.system.matched?.id).toBe('SYS-1');
    const systemRef = references.find((ref) => ref.clause === 'system');
    expect(systemRef?.matched?.id).toBe('SYS-1');
  });

  it('fills clause term nodes on the returned ast', () => {
    const ast = buildAst();
    const { ast: resolved } = resolveAndCollect(ast, catalog);
    const items = resolved.trigger?.kind === 'and' ? resolved.trigger.items : [];
    const timeout = items[0];
    expect(timeout.kind === 'term' ? timeout.term?.matched?.id : undefined).toBe('EV-1');
  });

  it('does not mutate the input ast', () => {
    const ast = buildAst();
    const before = structuredClone(ast);
    resolveAndCollect(ast, catalog);
    expect(ast).toEqual(before);
    expect(ast.system.matched).toBeUndefined();
    const items = ast.trigger?.kind === 'and' ? ast.trigger.items : [];
    const timeout = items[0];
    expect(timeout.kind === 'term' ? timeout.term : undefined).toBeUndefined();
  });

  it('orders references by span start with spanless system reference last', () => {
    const ast = buildAst();
    const { references } = resolveAndCollect(ast, catalog);
    expect(references.map((ref) => ref.clause)).toEqual(['trigger', 'trigger', 'system']);
    expect(references[0].text).toBe('timeout');
    expect(references[1].text).toBe('ghost event');
  });

  it('warns when a clause mixes resolved and unresolved terms', () => {
    const ast = buildAst();
    const { diagnostics } = resolveAndCollect(ast, catalog);
    const mixed = diagnostics.find((d) => d.code === 'expr.mixed_unresolved_terms');
    expect(mixed).toBeDefined();
    expect(mixed?.severity).toBe('warning');
    expect(mixed?.span).toEqual({ start: 0, end: 24 });
  });

  it('resolves the unwanted (If) clause under the event role', () => {
    const ast: EarsAst = {
      pattern: 'unwanted-behaviour',
      system: { raw: 'billing service', role: 'system' },
      unwanted: { kind: 'term', text: 'timeout', span: { start: 3, end: 10 } },
      responses: ['do x'],
      raw: 'If timeout, the billing service shall do x',
    };
    const { references } = resolveAndCollect(ast, catalog);
    const unwantedRef = references.find((ref) => ref.clause === 'unwanted');
    expect(unwantedRef?.role).toBe('event');
    expect(unwantedRef?.matched?.id).toBe('EV-1');
  });

  it('skips catalog matching entirely in no-catalog mode', () => {
    const ast = buildAst();
    const { references, diagnostics } = resolveAndCollect(ast, undefined);
    expect(diagnostics).toEqual([]);
    expect(
      references.every((ref) => ref.matched === undefined && ref.unresolved === undefined),
    ).toBe(true);
  });
});

describe('catalogCoverageDiagnostics', () => {
  const catalog: Catalog = {
    systems: [{ id: 'SYS-1', name: 'billing service' }],
    events: [
      { id: 'EV-1', name: 'timeout', aliases: ['time out'] },
      { id: 'EV-2', name: 'reverse thrust' },
    ],
  };

  it('flags catalog entries that no text references', () => {
    const diagnostics = catalogCoverageDiagnostics(
      ['The billing service shall react to a timeout.'],
      catalog,
      { mode: 'strict' },
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toEqual({
      code: 'catalog.term_unreferenced',
      severity: 'warning',
      message:
        'catalog events term "reverse thrust" (EV-2) is not referenced by any requirement text',
    });
  });

  it('counts an alias occurrence as coverage', () => {
    const diagnostics = catalogCoverageDiagnostics(
      ['The billing service shall react to a time out event and reverse thrust.'],
      catalog,
      { mode: 'strict' },
    );
    expect(diagnostics.map((d) => d.message)).not.toContain(
      'catalog events term "timeout" (EV-1) is not referenced by any requirement text',
    );
  });

  it('requires whole-phrase matches on word boundaries', () => {
    const diagnostics = catalogCoverageDiagnostics(
      ['The billing service shall log a timeouts spike.'],
      { events: [{ id: 'EV-1', name: 'timeout' }] },
      { mode: 'strict' },
    );
    expect(diagnostics.map((d) => d.code)).toContain('catalog.term_unreferenced');
  });

  it('returns nothing in guided mode', () => {
    expect(catalogCoverageDiagnostics(['anything'], catalog, { mode: 'guided' })).toEqual([]);
  });

  it('returns nothing when there are no texts', () => {
    expect(catalogCoverageDiagnostics([], catalog, { mode: 'strict' })).toEqual([]);
  });

  it('returns nothing when no catalog is supplied', () => {
    expect(catalogCoverageDiagnostics(['anything'], undefined, { mode: 'strict' })).toEqual([]);
  });

  it('defaults to strict mode when no options are given', () => {
    const diagnostics = catalogCoverageDiagnostics(['unrelated text'], {
      systems: [{ id: 'SYS-1', name: 'billing service' }],
    });
    expect(diagnostics).toHaveLength(1);
  });

  it('produces a stably ordered result', () => {
    const many: Catalog = {
      systems: [
        { id: 'SYS-2', name: 'zeta' },
        { id: 'SYS-1', name: 'alpha' },
      ],
    };
    const diagnostics = catalogCoverageDiagnostics(['nothing here'], many, { mode: 'strict' });
    const messages = diagnostics.map((d) => d.message);
    expect([...messages]).toEqual([...messages].sort());
  });
});
