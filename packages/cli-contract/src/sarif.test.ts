/**
 * Tests for the SARIF 2.1.0 projection of the Findings model.
 *
 * Two groups: unit assertions over {@link buildSarifLog}'s shape, ordering,
 * severity mapping, URI normalization, and determinism; and a schema-validation
 * group that loads the vendored canonical SARIF 2.1.0 LOG schema
 * (`test/sarif-schema-2.1.0.json`) and checks every emitted log against the
 * required-property, enum, and type constraints that schema declares on the
 * shapes this projection produces. ajv is not in the pnpm catalog, so the
 * validator is hand-rolled but reads its constraints from the real schema file.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Findings } from '@earsyntax/core';
import { describe, expect, it } from 'vitest';
import {
  buildSarifLog,
  SARIF_SCHEMA,
  SARIF_TOOL_NAME,
  SARIF_VERSION,
  serializeSarifLog,
  type SarifLog,
} from './sarif.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The vendored canonical SARIF 2.1.0 LOG schema, read once. */
interface JsonSchema {
  $id: string;
  required: string[];
  properties: Record<string, { enum?: string[] }>;
  definitions: Record<
    string,
    { required?: string[]; properties?: Record<string, { enum?: string[]; minimum?: number }> }
  >;
}
const SCHEMA: JsonSchema = JSON.parse(
  readFileSync(join(HERE, '..', 'test', 'sarif-schema-2.1.0.json'), 'utf8'),
) as JsonSchema;

/** A findings value with one error and one warning across two files. */
const SAMPLE: Findings = {
  ok: false,
  summary: { files: 2, requirements: 3, valid: 1, errors: 1, warnings: 1 },
  diagnostics: [
    {
      id: 'EARS-E006',
      severity: 'error',
      file: 'specs/checkout/requirements.md',
      line: 12,
      col: 3,
      message: 'An If clause is missing its required then boundary.',
      requirementId: 'REQ-003',
    },
    {
      id: 'EARS-W016',
      severity: 'warning',
      file: 'specs/orders/requirements.md',
      line: 20,
      message: 'The response contains a configured vague term.',
    },
  ],
};

/** A clean run: no findings. */
const CLEAN: Findings = {
  ok: true,
  summary: { files: 1, requirements: 2, valid: 2, errors: 0, warnings: 0 },
  diagnostics: [],
};

describe('buildSarifLog — shape and metadata', () => {
  it('emits a single run with the earsyntax driver and the log schema/version', () => {
    const log = buildSarifLog(SAMPLE);
    expect(log.version).toBe(SARIF_VERSION);
    expect(log.$schema).toBe(SARIF_SCHEMA);
    expect(log.runs).toHaveLength(1);
    expect(log.runs[0]?.tool.driver.name).toBe(SARIF_TOOL_NAME);
  });

  it('uses the canonical LOG schema $id, not the external-property-file schema', () => {
    expect(SARIF_SCHEMA).toBe(
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    );
    // The vendored schema declares itself with the same $id, and is the log
    // schema (its top-level required set is version + runs).
    expect(SCHEMA.$id).toBe(SARIF_SCHEMA);
    expect(SCHEMA.required).toEqual(['version', 'runs']);
  });

  it('declares one rule per DISTINCT id, sorted by id, with registry metadata', () => {
    const rules = buildSarifLog(SAMPLE).runs[0]?.tool.driver.rules ?? [];
    expect(rules.map((rule) => rule.id)).toEqual(['EARS-E006', 'EARS-W016']);
    const e006 = rules[0];
    expect(e006.shortDescription.text).toBe('Malformed If/then unwanted-behaviour form');
    expect(e006.fullDescription.text).toBe('An If clause is missing its required then boundary.');
    expect(e006.helpUri).toBe('docs/diagnostics.md#ears-e006');
    expect(e006.defaultConfiguration.level).toBe('error');
    expect(rules[1]?.defaultConfiguration.level).toBe('warning');
  });

  it('collapses repeated ids into a single rule and keeps result ruleIndex aligned', () => {
    const repeated: Findings = {
      ok: false,
      summary: { files: 1, requirements: 2, valid: 0, errors: 2, warnings: 0 },
      diagnostics: [
        { id: 'EARS-W016', severity: 'warning', file: 'a.md', line: 1, message: 'm1' },
        { id: 'EARS-E006', severity: 'error', file: 'a.md', line: 2, message: 'm2' },
        { id: 'EARS-W016', severity: 'warning', file: 'a.md', line: 3, message: 'm3' },
      ],
    };
    const run = buildSarifLog(repeated).runs[0];
    const rules = run.tool.driver.rules;
    expect(rules.map((rule) => rule.id)).toEqual(['EARS-E006', 'EARS-W016']);
    const results = run.results;
    // Results preserve findings order; ruleIndex points into the sorted rules.
    expect(results.map((result) => [result.ruleId, result.ruleIndex])).toEqual([
      ['EARS-W016', 1],
      ['EARS-E006', 0],
      ['EARS-W016', 1],
    ]);
  });

  it('maps effective severity to the SARIF level; the result level, not the default', () => {
    const upgraded: Findings = {
      ok: false,
      summary: { files: 1, requirements: 1, valid: 0, errors: 1, warnings: 0 },
      // A W-band id carrying effective severity error (as after --strict).
      diagnostics: [{ id: 'EARS-W016', severity: 'error', file: 'a.md', line: 1, message: 'm' }],
    };
    const run = buildSarifLog(upgraded).runs[0];
    expect(run.results[0]?.level).toBe('error');
    // The rule's default configuration still reflects the registry default.
    expect(run.tool.driver.rules[0]?.defaultConfiguration.level).toBe('warning');
  });

  it('carries startLine always and startColumn only when col is present', () => {
    const results = buildSarifLog(SAMPLE).runs[0]?.results ?? [];
    expect(results[0]?.locations[0]?.physicalLocation.region).toEqual({
      startLine: 12,
      startColumn: 3,
    });
    expect(results[1]?.locations[0]?.physicalLocation.region).toEqual({ startLine: 20 });
  });

  it('carries the requirement id on result.properties when present, omits it otherwise', () => {
    const results = buildSarifLog(SAMPLE).runs[0]?.results ?? [];
    expect(results[0]?.properties).toEqual({ requirementId: 'REQ-003' });
    expect(results[1]?.properties).toBeUndefined();
  });

  it('records tool.driver.version only when toolVersion is supplied', () => {
    expect(buildSarifLog(CLEAN).runs[0]?.tool.driver.version).toBeUndefined();
    expect(buildSarifLog(CLEAN, { toolVersion: '1.2.3' }).runs[0]?.tool.driver.version).toBe(
      '1.2.3',
    );
  });

  it('emits an empty, valid log for a clean run', () => {
    const log = buildSarifLog(CLEAN);
    expect(log.runs[0]?.results).toEqual([]);
    expect(log.runs[0]?.tool.driver.rules).toEqual([]);
  });
});

describe('buildSarifLog — URI normalization', () => {
  const uriFor = (file: string): string => {
    const findings: Findings = {
      ok: false,
      summary: { files: 1, requirements: 1, valid: 0, errors: 1, warnings: 0 },
      diagnostics: [{ id: 'EARS-E006', severity: 'error', file, line: 1, message: 'm' }],
    };
    return (
      buildSarifLog(findings).runs[0]?.results[0]?.locations[0]?.physicalLocation.artifactLocation
        .uri ?? ''
    );
  };

  it('leaves a relative POSIX path as forward-slash segments', () => {
    expect(uriFor('specs/checkout/requirements.md')).toBe('specs/checkout/requirements.md');
  });

  it('drops a leading slash so an absolute path becomes relative', () => {
    expect(uriFor('/work/specs/a.ears')).toBe('work/specs/a.ears');
  });

  it('collapses Windows separators and drops the drive segment', () => {
    expect(uriFor('C:\\work\\specs\\a.ears')).toBe('work/specs/a.ears');
  });

  it('percent-encodes spaces and reserved characters per segment', () => {
    expect(uriFor('my specs/a b.ears')).toBe('my%20specs/a%20b.ears');
  });

  it('passes the stdin sentinel through as a single segment', () => {
    expect(uriFor('-')).toBe('-');
  });
});

describe('buildSarifLog — determinism', () => {
  it('serializes byte-identically for identical findings', () => {
    expect(serializeSarifLog(buildSarifLog(SAMPLE))).toBe(serializeSarifLog(buildSarifLog(SAMPLE)));
  });

  it('produces no timestamps or clock-derived fields', () => {
    const text = serializeSarifLog(buildSarifLog(SAMPLE));
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('round-trips through JSON unchanged', () => {
    const log = buildSarifLog(SAMPLE);
    expect(JSON.parse(JSON.stringify(log))).toEqual(log);
  });
});

/**
 * Validate a SARIF log against the required-property, enum, and type constraints
 * the vendored schema declares on the shapes this projection emits. Returns the
 * list of violations (empty when the log conforms). This is not a full JSON
 * Schema validator; it checks exactly the constraints relevant to our output,
 * reading each constraint from the real schema so the assertions track the spec.
 */
function schemaViolations(log: SarifLog): string[] {
  const problems: string[] = [];
  const def = SCHEMA.definitions;
  const has = (obj: object, key: string): boolean => Object.hasOwn(obj, key);
  const requireKeys = (obj: object, keys: string[] | undefined, where: string): void => {
    for (const key of keys ?? []) {
      if (!has(obj, key)) {
        problems.push(`${where}: missing required "${key}"`);
      }
    }
  };

  for (const key of SCHEMA.required) {
    if (!has(log, key)) {
      problems.push(`log: missing required "${key}"`);
    }
  }
  if (!SCHEMA.properties.version.enum?.includes(log.version)) {
    problems.push(`log.version "${log.version}" not in schema enum`);
  }
  if (typeof log.$schema !== 'string') {
    problems.push('log.$schema is not a string');
  }
  if (!Array.isArray(log.runs)) {
    problems.push('log.runs is not an array');
  }

  const resultLevels = def.result.properties?.level.enum ?? [];
  const configLevels = def.reportingConfiguration.properties?.level.enum ?? [];
  const startLineMin = def.region.properties?.startLine.minimum ?? 1;
  const startColumnMin = def.region.properties?.startColumn.minimum ?? 1;

  log.runs.forEach((run, ri) => {
    requireKeys(run, def.run.required, `runs[${ri}]`);
    requireKeys(run.tool, def.tool.required, `runs[${ri}].tool`);
    requireKeys(run.tool.driver, def.toolComponent.required, `runs[${ri}].tool.driver`);

    run.tool.driver.rules.forEach((rule, di) => {
      const at = `runs[${ri}].tool.driver.rules[${di}]`;
      requireKeys(rule, def.reportingDescriptor.required, at);
      if (typeof rule.id !== 'string') {
        problems.push(`${at}.id is not a string`);
      }
      requireKeys(
        rule.shortDescription,
        def.multiformatMessageString.required,
        `${at}.shortDescription`,
      );
      if (!configLevels.includes(rule.defaultConfiguration.level)) {
        problems.push(
          `${at}.defaultConfiguration.level "${rule.defaultConfiguration.level}" not in enum`,
        );
      }
    });

    run.results.forEach((result, si) => {
      const at = `runs[${ri}].results[${si}]`;
      requireKeys(result, def.result.required, at);
      requireKeys(result.message, def.multiformatMessageString.required, `${at}.message`);
      if (typeof result.ruleId !== 'string') {
        problems.push(`${at}.ruleId is not a string`);
      }
      if (!Number.isInteger(result.ruleIndex)) {
        problems.push(`${at}.ruleIndex is not an integer`);
      }
      if (!resultLevels.includes(result.level)) {
        problems.push(`${at}.level "${result.level}" not in enum`);
      }
      result.locations.forEach((location, li) => {
        const region = location.physicalLocation.region;
        const rat = `${at}.locations[${li}].physicalLocation`;
        const uri = location.physicalLocation.artifactLocation.uri;
        if (typeof uri !== 'string') {
          problems.push(`${rat}.artifactLocation.uri is not a string`);
        }
        if (uri.startsWith('/') || /^[A-Za-z]:/.test(uri) || uri.includes('\\')) {
          problems.push(
            `${rat}.artifactLocation.uri "${uri}" is not a relative forward-slash path`,
          );
        }
        if (!Number.isInteger(region.startLine) || region.startLine < startLineMin) {
          problems.push(
            `${rat}.region.startLine "${region.startLine}" violates minimum ${startLineMin}`,
          );
        }
        if (region.startColumn !== undefined && region.startColumn < startColumnMin) {
          problems.push(
            `${rat}.region.startColumn "${region.startColumn}" violates minimum ${startColumnMin}`,
          );
        }
      });
    });
  });

  return problems;
}

describe('buildSarifLog — schema conformance', () => {
  it('conforms to the vendored SARIF 2.1.0 schema for a populated run', () => {
    expect(schemaViolations(buildSarifLog(SAMPLE))).toEqual([]);
  });

  it('conforms to the vendored SARIF 2.1.0 schema for a clean run', () => {
    expect(schemaViolations(buildSarifLog(CLEAN))).toEqual([]);
  });

  it('conforms with Windows and absolute input paths normalized away', () => {
    const findings: Findings = {
      ok: false,
      summary: { files: 2, requirements: 2, valid: 0, errors: 2, warnings: 0 },
      diagnostics: [
        {
          id: 'EARS-E006',
          severity: 'error',
          file: 'C:\\work\\a.ears',
          line: 1,
          col: 2,
          message: 'm',
        },
        { id: 'EARS-E007', severity: 'error', file: '/abs/b.ears', line: 3, message: 'n' },
      ],
    };
    expect(schemaViolations(buildSarifLog(findings))).toEqual([]);
  });
});
