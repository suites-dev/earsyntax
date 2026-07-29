import { describe, expect, it } from 'vitest';
import { buildSarifLog, SARIF_SCHEMA, SARIF_TOOL_NAME, SARIF_VERSION } from './sarif.js';
import { DIAGNOSTIC_CODES } from './diagnostic-registry.js';
import { sampleRun } from './__fixtures__/sample-run.js';

describe('buildSarifLog', () => {
  it('emits a single run with the earsyntax driver', () => {
    const log = buildSarifLog(sampleRun);
    expect(log.version).toBe(SARIF_VERSION);
    expect(log.$schema).toBe(SARIF_SCHEMA);
    expect(log.runs).toHaveLength(1);
    expect(log.runs[0]?.tool.driver.name).toBe(SARIF_TOOL_NAME);
  });

  it('declares one sorted rule per registered diagnostic code', () => {
    const rules = buildSarifLog(sampleRun).runs[0]?.tool.driver.rules ?? [];
    expect(rules.map((r) => r.id)).toEqual(DIAGNOSTIC_CODES);
    for (const rule of rules) {
      expect(rule.shortDescription.text.length).toBeGreaterThan(0);
    }
  });

  it('maps severities to SARIF levels (error, warning, note)', () => {
    const results = buildSarifLog(sampleRun).runs[0]?.results ?? [];
    const byCode = new Map(results.map((r) => [r.ruleId, r.level]));
    expect(byCode.get('catalog.system_unresolved')).toBe('error');
    expect(byCode.get('lint.vague_response')).toBe('warning');
    expect(byCode.get('lint.suspicious_text_shape')).toBe('note');
  });

  it('produces one result per diagnostic in input order', () => {
    const results = buildSarifLog(sampleRun).runs[0]?.results ?? [];
    expect(results.map((r) => r.ruleId)).toEqual([
      'lint.vague_response',
      'catalog.system_unresolved',
      'ears.no_match',
      'lint.suspicious_text_shape',
    ]);
  });

  it('uses a line-based region when the source line is known', () => {
    const results = buildSarifLog(sampleRun).runs[0]?.results ?? [];
    const loc = results[0]?.locations[0]?.physicalLocation;
    expect(loc.artifactLocation.uri).toBe('specs/subscribe.ears');
    expect(loc.region).toEqual({ startLine: 7 });
  });

  it('falls back to a char-offset region when the line is unknown', () => {
    const results = buildSarifLog(sampleRun).runs[0]?.results ?? [];
    const noMatch = results.find((r) => r.ruleId === 'ears.no_match');
    expect(noMatch?.locations[0]?.physicalLocation.region).toEqual({
      charOffset: 0,
      charLength: 29,
    });
  });

  it('omits the region when neither line nor span is known', () => {
    const results = buildSarifLog(sampleRun).runs[0]?.results ?? [];
    const suspicious = results.find((r) => r.ruleId === 'lint.suspicious_text_shape');
    expect(suspicious?.locations[0]?.physicalLocation.region).toBeUndefined();
  });

  it('serializes to valid JSON', () => {
    const log = buildSarifLog(sampleRun);
    const roundTrip = JSON.parse(JSON.stringify(log));
    expect(roundTrip).toEqual(log);
  });
});
