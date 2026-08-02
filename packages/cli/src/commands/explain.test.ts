/**
 * Tests for the `explain` command.
 *
 * Four concerns, each a describe block:
 *
 * 1. Coverage — every id in {@link DIAGNOSTIC_REGISTRY} explains successfully,
 *    with a non-empty meaning, rationale, and both examples, and echoes the
 *    registry's severity. The registry is enumerated directly, so a newly
 *    appended id is covered automatically.
 * 2. Alias resolution — every entry's deprecated old code resolves to its
 *    current id with `alias: true` and the exact deprecation note.
 * 3. Executable examples — every registry example is run through the real
 *    `@earsyntax/core` linter and asserted to behave as documented: the bad
 *    example emits the diagnostic's own id, the good example does not. Structural
 *    codes run through `lintEars`; catalog codes run with a minimal catalog
 *    derived from the example (the linter never emits catalog codes without a
 *    catalog); coverage codes run through `lintCatalogCoverage`, whose input is a
 *    requirement set plus its catalog. One code, EARS-W014, is emitted only by
 *    the legacy guided mode the host-native CLI never selects; it is documented
 *    in {@link NON_EXECUTABLE} with a guard pinning that behavior rather than
 *    executed. Every id lands in exactly one of these buckets, so the executable
 *    check has no silent gaps.
 * 4. Errors and the envelope — unknown id, missing id, and extra args each exit
 *    2 with the facade envelope; JSON output is pure; the dispatcher wires it end
 *    to end.
 *
 * The command renders from the registry, so the coverage and alias assertions
 * compare against registry fields, not string literals: no explanation text is
 * duplicated here.
 */

import {
  type Catalog,
  DIAGNOSTIC_REGISTRY,
  idForCode,
  lintCatalogCoverage,
  lintEars,
} from '@earsyntax/core';
import { describe, expect, it } from 'vitest';
import type { GlobalOptions, ParsedArgs } from '../args.js';
import { run } from '../cli.js';
import { createPainter } from '../color.js';
import type { CommandContext } from '../context.js';
import type { Emitter } from '../response.js';
import { explainCommand } from './explain.js';

/** Build a {@link CommandContext} for the handler with the given positional ids. */
function makeContext(positionals: string[], options: { json?: boolean; quiet?: boolean } = {}): CommandContext {
  const args: ParsedArgs = { positionals, booleans: new Set(), values: new Map() };
  const global: GlobalOptions = {
    json: options.json ?? false,
    sarif: false,
    strict: false,
    quiet: options.quiet ?? false,
    profile: 'strict',
    cwd: '/work',
    color: false,
  };
  const emitter: Emitter = { json: global.json, painter: createPainter(false), write: () => undefined };
  return { args, global, cwd: '/work', emitter };
}

/** Explain one id through the handler and return the JSON payload as a record. */
function explain(id: string): Record<string, unknown> {
  const result = explainCommand(makeContext([id], { json: true }));
  return result.response;
}

describe('explain — coverage of every registry id', () => {
  it('explains every current id with complete, non-empty metadata', () => {
    for (const entry of DIAGNOSTIC_REGISTRY) {
      const result = explainCommand(makeContext([entry.id], { json: true }));
      expect(result.exitCode).toBe(0);
      const payload = result.response;
      expect(payload.ok).toBe(true);
      expect(payload.id).toBe(entry.id);
      expect(payload.requestedId).toBe(entry.id);
      // A current id is not an alias.
      expect(payload.alias).toBeUndefined();
      expect(payload.deprecationNote).toBeUndefined();
      // Severity and text project straight from the registry entry.
      expect(payload.severity).toBe(entry.defaultSeverity);
      expect(payload.title).toBe(entry.title);
      expect(payload.meaning).toBe(entry.meaning);
      expect(payload.rationale).toBe(entry.rationale);
      expect(payload.badExample).toBe(entry.badExample);
      expect(payload.goodExample).toBe(entry.goodExample);
      expect(payload.profileNotes).toBe(entry.profileNotes);
      // The documented fields carry real content.
      expect((payload.meaning as string).length).toBeGreaterThan(0);
      expect((payload.rationale as string).length).toBeGreaterThan(0);
      expect((payload.badExample as string).length).toBeGreaterThan(0);
      expect((payload.goodExample as string).length).toBeGreaterThan(0);
      expect(payload.next).toEqual([]);
    }
  });

  it('renders each id in pretty text with its title and both examples', () => {
    for (const entry of DIAGNOSTIC_REGISTRY) {
      const result = explainCommand(makeContext([entry.id]));
      expect(result.pretty).toContain(entry.id);
      expect(result.pretty).toContain(entry.title);
      expect(result.pretty).toContain(entry.meaning);
      expect(result.pretty).toContain(entry.badExample);
      expect(result.pretty).toContain(entry.goodExample);
    }
  });
});

describe('explain — deprecated alias resolution', () => {
  it('resolves every old code to its current id with the deprecation note', () => {
    for (const entry of DIAGNOSTIC_REGISTRY) {
      const result = explainCommand(makeContext([entry.oldCode], { json: true }));
      expect(result.exitCode).toBe(0);
      const payload = result.response;
      expect(payload.id).toBe(entry.id);
      expect(payload.requestedId).toBe(entry.oldCode);
      expect(payload.alias).toBe(true);
      expect(payload.deprecationNote).toBe(`${entry.oldCode} is a deprecated alias for ${entry.id}.`);
      // The resolved content is the same entry as the current-id path.
      expect(payload.meaning).toBe(entry.meaning);
    }
  });

  it('names the deprecated alias in the pretty rendering', () => {
    const entry = DIAGNOSTIC_REGISTRY[5]; // EARS-E006 / ears.invalid_if_then_form.
    const result = explainCommand(makeContext([entry.oldCode]));
    expect(result.pretty).toContain(entry.oldCode);
    expect(result.pretty).toContain('deprecated alias');
  });

  it('resolves ids case-insensitively without marking them as aliases', () => {
    const payload = explain('ears-e006');
    expect(payload.id).toBe('EARS-E006');
    expect(payload.alias).toBeUndefined();
  });
});

// --- Executable examples ---------------------------------------------------

/** A system entry so the literal "the system" in an example resolves and does not add noise. */
const SYSTEM: Catalog['systems'] = [{ id: 'SYS', name: 'system' }];

/**
 * Per-entry linter context for the executable-examples check. `badCatalog` and
 * `goodCatalog` are supplied only for catalog diagnostics, which cannot fire
 * from text alone. A structural diagnostic carries neither and runs against the
 * default strict dialect, which is exactly the dialect its example is written
 * for.
 */
interface ExampleContext {
  badCatalog?: Catalog;
  goodCatalog?: Catalog;
}

/**
 * The linter context for every non-divergent registry id. Structural entries map
 * to an empty context (text-only, strict dialect). Catalog entries carry the
 * minimal catalog that makes the documented example resolve as claimed. The
 * catalogs live here, in the test, not in the registry: they are test scaffolding
 * for executing the examples, not explanation content.
 */
const EXAMPLE_CONTEXT: Record<string, ExampleContext> = {
  // Structural diagnostics: the example text alone determines the outcome.
  'EARS-E003': {},
  'EARS-E004': {},
  'EARS-E005': {},
  'EARS-E006': {},
  'EARS-E007': {},
  'EARS-E008': {},
  'EARS-E009': {},
  'EARS-E010': {},
  'EARS-E011': {},
  'EARS-E012': {},
  'EARS-E013': {},
  'EARS-E014': {},
  'EARS-E015': {},
  'EARS-E016': {},
  'EARS-W010': {},
  'EARS-W013': {},
  'EARS-W015': {},
  'EARS-W016': {},
  // Catalog diagnostics: a minimal catalog makes the example resolve as claimed.
  'EARS-E001': {
    badCatalog: {
      systems: [
        { id: 'S1', name: 'controller' },
        { id: 'S2', name: 'controller' },
      ],
    },
    goodCatalog: { systems: [{ id: 'S3', name: 'brake controller' }] },
  },
  'EARS-E002': {
    badCatalog: { systems: [{ id: 'S1', name: 'billing service' }] },
    goodCatalog: { systems: [{ id: 'S1', name: 'billing service' }] },
  },
  'EARS-W001': {
    badCatalog: {
      systems: SYSTEM,
      events: [
        { id: 'E1', name: 'the request arrives' },
        { id: 'E2', name: 'the request arrives' },
      ],
    },
    goodCatalog: { systems: SYSTEM, events: [{ id: 'E3', name: 'the payment webhook arrives' }] },
  },
  'EARS-W002': {
    badCatalog: { systems: SYSTEM, events: [{ id: 'E1', name: 'a refund event occurs' }] },
    goodCatalog: { systems: SYSTEM, events: [{ id: 'E1', name: 'a refund event occurs' }] },
  },
  'EARS-W003': {
    badCatalog: {
      systems: SYSTEM,
      features: [
        { id: 'F1', name: 'retries are enabled' },
        { id: 'F2', name: 'retries are enabled' },
      ],
    },
    goodCatalog: { systems: SYSTEM, features: [{ id: 'F3', name: 'automatic retries are enabled' }] },
  },
  'EARS-W004': {
    badCatalog: { systems: SYSTEM, features: [{ id: 'F1', name: 'the premium tier is enabled' }] },
    goodCatalog: { systems: SYSTEM, features: [{ id: 'F1', name: 'the premium tier is enabled' }] },
  },
  'EARS-W005': {
    badCatalog: {
      systems: SYSTEM,
      states: [
        { id: 'T1', name: 'draining' },
        { id: 'T2', name: 'draining' },
      ],
    },
    goodCatalog: { systems: SYSTEM, states: [{ id: 'T3', name: 'the queue is draining' }] },
  },
  'EARS-W006': {
    badCatalog: { systems: SYSTEM, states: [{ id: 'T1', name: 'the queue is full' }] },
    goodCatalog: { systems: SYSTEM, states: [{ id: 'T1', name: 'the queue is full' }] },
  },
  'EARS-W008': {
    badCatalog: {
      systems: SYSTEM,
      events: [
        { id: 'E1', name: 'the reset is triggered' },
        { id: 'E2', name: 'the reset is triggered' },
      ],
    },
    goodCatalog: { systems: SYSTEM, events: [{ id: 'E3', name: 'the watchdog reset is triggered' }] },
  },
  'EARS-W009': {
    badCatalog: { systems: SYSTEM, states: [{ id: 'T1', name: 'A' }] },
    goodCatalog: {
      systems: SYSTEM,
      states: [
        { id: 'T1', name: 'A' },
        { id: 'T2', name: 'C' },
      ],
    },
  },
  'EARS-W011': {
    badCatalog: { systems: SYSTEM, events: [{ id: 'E1', name: 'something else' }] },
    goodCatalog: { systems: SYSTEM, events: [{ id: 'E1', name: 'the entry sensor triggers' }] },
  },
  'EARS-W012': {
    badCatalog: {
      systems: SYSTEM,
      events: [{ id: 'E1', name: 'Postgres is unavailable', aliases: ['db is unavailable'] }],
    },
    goodCatalog: {
      systems: SYSTEM,
      events: [{ id: 'E1', name: 'Postgres is unavailable', aliases: ['db is unavailable'] }],
    },
  },
};

/**
 * Coverage diagnostics: their example is a requirement evaluated by
 * `lintCatalogCoverage` against a catalog, not by linting a single requirement.
 * The bad catalog holds a term the bad requirement leaves unreferenced (so the
 * code fires); the good requirement references that term (so it does not). The
 * catalogs live here as test scaffolding, the same as {@link EXAMPLE_CONTEXT}.
 */
const COVERAGE_CONTEXT: Record<string, { badCatalog: Catalog; goodCatalog: Catalog }> = {
  'EARS-W007': {
    badCatalog: {
      systems: [{ id: 'SYS-BILLING', name: 'billing service' }],
      events: [{ id: 'EVT-PAY', name: 'a payment webhook is received' }],
    },
    goodCatalog: {
      systems: [{ id: 'SYS-BILLING', name: 'billing service' }],
      events: [{ id: 'EVT-PAY', name: 'a payment webhook is received' }],
    },
  },
};

/**
 * Registry entries no host-native code path emits, documented rather than
 * executed. EARS-W014 is produced only by the legacy guided mode, which the
 * facade never selects; its guard pins that the strict default reports EARS-E010
 * for the same text and guided mode adds EARS-W014, so a future change to either
 * path fails here instead of passing silently.
 */
const NON_EXECUTABLE: Record<string, { reason: string; guard: () => void }> = {
  'EARS-W014': {
    reason:
      'suspicious_text_shape is emitted only by lintEars in guided mode; the host-native CLI never selects guided mode. Under the strict default the badExample reports EARS-E010, and guided mode adds EARS-W014 alongside it.',
    guard: () => {
      const strict = codesFor('timer reset maybe when idle');
      expect(strict).not.toContain('EARS-W014');
      expect(strict).toContain('EARS-E010');
      const guided = lintEars('timer reset maybe when idle', undefined, { mode: 'guided' }).diagnostics.map(
        (diagnostic) => idForCode(diagnostic.code),
      );
      expect(guided).toContain('EARS-W014');
    },
  },
};

/** Run the linter and return the emitted findings as current registry ids. */
function codesFor(text: string, catalog?: Catalog): string[] {
  return lintEars(text, catalog).diagnostics.map((diagnostic) => idForCode(diagnostic.code));
}

/** Run the coverage pass over one requirement and return the ids it emits. */
function coverageCodesFor(text: string, catalog: Catalog): string[] {
  return lintCatalogCoverage([{ text }], catalog).map((diagnostic) => idForCode(diagnostic.code));
}

describe('explain — the registry examples execute as documented', () => {
  it('partitions every registry id into exactly one execution bucket', () => {
    for (const entry of DIAGNOSTIC_REGISTRY) {
      const buckets = [
        entry.id in EXAMPLE_CONTEXT,
        entry.id in COVERAGE_CONTEXT,
        entry.id in NON_EXECUTABLE,
      ].filter(Boolean).length;
      expect(buckets, `id ${entry.id} must belong to exactly one execution bucket`).toBe(1);
    }
  });

  it('emits the diagnostic id for the bad example and not for the good example', () => {
    for (const entry of DIAGNOSTIC_REGISTRY) {
      if (!(entry.id in EXAMPLE_CONTEXT)) {
        continue;
      }
      const context = EXAMPLE_CONTEXT[entry.id];
      const badCodes = codesFor(entry.badExample, context.badCatalog);
      const goodCodes = codesFor(entry.goodExample, context.goodCatalog);
      expect(badCodes, `${entry.id} bad example should emit ${entry.id}`).toContain(entry.id);
      expect(goodCodes, `${entry.id} good example should not emit ${entry.id}`).not.toContain(entry.id);
    }
  });

  it('emits the coverage diagnostic for the bad example and not the good example', () => {
    for (const [id, context] of Object.entries(COVERAGE_CONTEXT)) {
      const entry = DIAGNOSTIC_REGISTRY.find((candidate) => candidate.id === id);
      expect(entry, `${id} is not in the registry`).toBeDefined();
      const badCodes = coverageCodesFor(entry!.badExample, context.badCatalog);
      const goodCodes = coverageCodesFor(entry!.goodExample, context.goodCatalog);
      expect(badCodes, `${id} bad example should emit ${id}`).toContain(id);
      expect(goodCodes, `${id} good example should not emit ${id}`).not.toContain(id);
    }
  });

  it('documents the non-executable entries with their observed behavior', () => {
    // Codes no host-native path emits, pinned rather than executed. Each guard
    // fixes the current behavior so a later change to the emitting path surfaces
    // here instead of passing silently.
    expect(Object.keys(NON_EXECUTABLE).sort()).toEqual(['EARS-W014']);
    for (const { guard } of Object.values(NON_EXECUTABLE)) {
      guard();
    }
  });
});

describe('explain — errors, envelope, and purity', () => {
  it('exits 2 with a suggestion for an unknown id', () => {
    const result = explainCommand(makeContext(['EARS-E999'], { json: true }));
    expect(result.exitCode).toBe(2);
    const payload = result.response;
    expect(payload.command).toBe('explain');
    expect(payload.ok).toBe(false);
    const diagnostics = payload.diagnostics as { code: string; message: string }[];
    expect(diagnostics[0].code).toBe('explain.unknown_id');
    // The nearest ids are offered; EARS-E### codes are closest to EARS-E999.
    expect(diagnostics[0].message).toMatch(/EARS-E0\d\d/);
    expect(payload.next).toEqual([]);
  });

  it('exits 2 when no id is given', () => {
    const result = explainCommand(makeContext([], { json: true }));
    expect(result.exitCode).toBe(2);
    expect((result.response.diagnostics as { code: string }[])[0].code).toBe('explain.missing_id');
  });

  it('exits 2 when more than one id is given', () => {
    const result = explainCommand(makeContext(['EARS-E001', 'EARS-E002'], { json: true }));
    expect(result.exitCode).toBe(2);
    expect((result.response.diagnostics as { code: string }[])[0].code).toBe('explain.too_many_args');
  });

  it('is pure JSON: the payload round-trips with no undefined or functions', () => {
    const result = explainCommand(makeContext(['ears.missing_shall'], { json: true }));
    const roundTripped = JSON.parse(JSON.stringify(result.response));
    expect(roundTripped.id).toBe('EARS-E007');
    expect(roundTripped.alias).toBe(true);
    expect(roundTripped.deprecationNote).toBe('ears.missing_shall is a deprecated alias for EARS-E007.');
  });

  it('keeps the base envelope key order: version, command, ok, then payload, then next', () => {
    const keys = Object.keys(explain('EARS-E006'));
    expect(keys.slice(0, 3)).toEqual(['version', 'command', 'ok']);
    expect(keys.at(-1)).toBe('next');
  });
});

describe('explain — through the dispatcher', () => {
  function capture(argv: string[]): { out: string; code: number } {
    let out = '';
    const code = run(argv, { stdout: (text) => (out += text), cwd: '/work' });
    return { out, code };
  }

  it('exits 0 and emits the JSON envelope for a known id', () => {
    const { out, code } = capture(['explain', 'EARS-E006', '--json']);
    expect(code).toBe(0);
    const parsed = JSON.parse(out);
    expect(parsed.command).toBe('explain');
    expect(parsed.id).toBe('EARS-E006');
  });

  it('exits 0 and emits pretty text without --json', () => {
    const { out, code } = capture(['explain', 'EARS-E006']);
    expect(code).toBe(0);
    expect(out).toContain('EARS-E006');
    expect(() => JSON.parse(out)).toThrow();
  });

  it('resolves a deprecated alias end to end', () => {
    const { out, code } = capture(['explain', 'ears.invalid_if_then_form', '--json']);
    expect(code).toBe(0);
    const parsed = JSON.parse(out);
    expect(parsed.id).toBe('EARS-E006');
    expect(parsed.alias).toBe(true);
  });

  it('exits 2 for an unknown id through the dispatcher', () => {
    const { out, code } = capture(['explain', 'nope', '--json']);
    expect(code).toBe(2);
    expect(JSON.parse(out).diagnostics[0].code).toBe('explain.unknown_id');
  });
});
