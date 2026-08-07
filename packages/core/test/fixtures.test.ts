/**
 * Golden-fixture harness for `@earsyntax/core`.
 *
 * Discovers every JSON fixture under `fixtures/{valid,invalid,ears-lint-go-parity}`
 * at test time and runs each through `lintEars`, asserting the result against
 * the fixture's `expected` block using the matching semantics defined in
 * `fixtures/schema.md`. File system access lives only in this test module,
 * never in `src`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { lintEars } from '../src/index.js';
import type {
  Catalog,
  DialectOptions,
  DiagnosticCode,
  LintResult,
  Options,
  Pattern,
  Severity,
  Span,
} from '../src/types.js';
import { multisetDiff, pairKey, spanAssertionFailures, subsetMatch } from './fixtures.helpers.js';

interface ExpectedDiagnostic {
  code: DiagnosticCode;
  severity: Severity;
  span?: Span;
}

interface Fixture {
  id: string;
  text: string;
  options?: Options;
  catalog?: Catalog;
  expected: {
    valid: boolean;
    pattern?: Pattern;
    diagnostics: ExpectedDiagnostic[];
    ast?: Record<string, unknown>;
    responses?: string[];
  };
}

interface LoadedFixture {
  group: string;
  file: string;
  name: string;
  fixture: Fixture;
}

// Resolve the fixtures dir relative to the repo root from this test's location:
// packages/core/test/ -> ../../../fixtures.
const FIXTURES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures');
const GROUPS = ['valid', 'invalid', 'ears-lint-go-parity'] as const;

function loadGroup(group: string): LoadedFixture[] {
  const dir = join(FIXTURES_ROOT, group);
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const fixture = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Fixture;
      return { group, file, name: `${group}/${file} :: ${fixture.id}`, fixture };
    });
}

/**
 * The dialect the Go reference (`ears-lint-go`) implements: keywords match
 * case-insensitively, a leading comma is not separately required, and `shall not`
 * is not treated as a prohibition. The parity corpus pins Go behavior, so it runs
 * under this dialect while the strict `valid`/`invalid` corpora assert the new
 * strict defaults. A parity fixture that sets its own `dialect` overrides this.
 */
const GO_PARITY_DIALECT: DialectOptions = {
  keywordCase: 'case-insensitive',
  commaAfterLeadingClause: 'optional',
  allowProhibition: true,
};

/** Resolve the options a fixture runs under, injecting the parity dialect. */
function fixtureOptions(loaded: LoadedFixture): Options | undefined {
  const { group, fixture } = loaded;
  if (group !== 'ears-lint-go-parity') {
    return fixture.options;
  }
  const options: Options = { ...fixture.options };
  options.dialect = { ...GO_PARITY_DIALECT, ...fixture.options?.dialect };
  return options;
}

function runFixture(loaded: LoadedFixture): void {
  const { fixture } = loaded;
  const { expected } = fixture;
  const result: LintResult = lintEars(fixture.text, fixture.catalog, fixtureOptions(loaded));

  expect(result.valid, 'valid mismatch').toBe(expected.valid);

  if (expected.pattern !== undefined) {
    expect(result.pattern, 'pattern mismatch').toBe(expected.pattern);
  }

  const diff = multisetDiff(expected.diagnostics, result.diagnostics);
  expect(
    diff.missing.length === 0 && diff.extra.length === 0,
    `diagnostics multiset mismatch\n  missing: ${diff.missing.join(', ') || 'none'}\n  extra:   ${diff.extra.join(', ') || 'none'}\n  actual:  ${result.diagnostics.map(pairKey).join(', ') || 'none'}`,
  ).toBe(true);

  const spanFailures = spanAssertionFailures(expected.diagnostics, result.diagnostics);
  expect(spanFailures, `span assertion failures: ${spanFailures.join('; ')}`).toEqual([]);

  if (expected.ast !== undefined) {
    const astFailure = subsetMatch(expected.ast, result.ast, 'ast');
    expect(astFailure, `ast subset mismatch: ${astFailure ?? ''}`).toBeNull();
  }

  if (expected.responses !== undefined) {
    expect(result.ast?.responses, 'responses mismatch').toEqual(expected.responses);
  }
}

for (const group of GROUPS) {
  const fixtures = loadGroup(group);
  describe(`fixtures: ${group} (${fixtures.length})`, () => {
    test.each(fixtures.map((loaded) => [loaded.name, loaded] as const))('%s', (_name, loaded) => {
      runFixture(loaded);
    });
  });
}
