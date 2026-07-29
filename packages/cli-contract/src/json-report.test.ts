import { describe, expect, it } from 'vitest';
import { buildJsonReport, JSON_REPORT_VERSION, serializeJsonReport } from './json-report.js';
import { cleanRun, sampleRun } from './__fixtures__/sample-run.js';

describe('buildJsonReport', () => {
  it('counts diagnostics by severity across all files', () => {
    const report = buildJsonReport(sampleRun);
    expect(report.summary).toEqual({
      files: 2,
      requirements: 3,
      errors: 2,
      warnings: 1,
      infos: 1,
      valid: false,
    });
  });

  it('marks the report valid when there are no error diagnostics', () => {
    const report = buildJsonReport(cleanRun);
    expect(report.summary.errors).toBe(0);
    expect(report.summary.valid).toBe(true);
  });

  it('carries the schema version', () => {
    expect(buildJsonReport(sampleRun).version).toBe(JSON_REPORT_VERSION);
    expect(JSON_REPORT_VERSION).toBe(1);
  });

  it('preserves file and requirement input order', () => {
    const report = buildJsonReport(sampleRun);
    expect(report.files.map((f) => f.path)).toEqual(['specs/subscribe.ears', 'specs/payment.ears']);
    expect(report.files[0]?.requirements.map((r) => r.id)).toEqual(['REQ-1', 'REQ-2']);
  });

  it('omits optional keys when absent and includes them when present', () => {
    const report = buildJsonReport(sampleRun);
    const withMeta = report.files[0]?.requirements[0];
    expect(withMeta).toMatchObject({ id: 'REQ-1', line: 3, pattern: 'ubiquitous' });

    const noMeta = report.files[1]?.requirements[0];
    expect(Object.hasOwn(noMeta, 'id')).toBe(false);
    expect(Object.hasOwn(noMeta, 'line')).toBe(false);
    expect(Object.hasOwn(noMeta, 'pattern')).toBe(false);
  });

  it('preserves diagnostic order and spans', () => {
    const report = buildJsonReport(sampleRun);
    const diags = report.files[0]?.requirements[1]?.diagnostics;
    expect(diags.map((d) => d.code)).toEqual(['lint.vague_response', 'catalog.system_unresolved']);
    expect(diags[0].span).toEqual({ start: 44, end: 57 });
  });
});

describe('serializeJsonReport', () => {
  it('is deterministic: the same input serializes identically', () => {
    const a = serializeJsonReport(buildJsonReport(sampleRun));
    const b = serializeJsonReport(buildJsonReport(sampleRun));
    expect(a).toBe(b);
  });

  it('uses 2-space indentation and a trailing newline', () => {
    const out = serializeJsonReport(buildJsonReport(cleanRun));
    expect(out.endsWith('\n')).toBe(true);
    expect(out).toContain('\n  "version": 1');
    expect(JSON.parse(out)).toEqual(buildJsonReport(cleanRun));
  });

  it('orders requirement keys as id, line, text, valid, pattern, diagnostics', () => {
    const req = buildJsonReport(sampleRun).files[0]?.requirements[0];
    expect(Object.keys(req)).toEqual(['id', 'line', 'text', 'valid', 'pattern', 'diagnostics']);
    // The serialized key order matches the object key order.
    const serializedKeys = Array.from(JSON.stringify(req).matchAll(/"(\w+)":/g), (m) => m[1]);
    expect(serializedKeys).toEqual(['id', 'line', 'text', 'valid', 'pattern', 'diagnostics']);

    // A requirement carrying diagnostics keeps the diagnostic keys ordered too.
    const withDiags = buildJsonReport(sampleRun).files[0]?.requirements[1];
    const diagKeys = Array.from(
      JSON.stringify(withDiags.diagnostics[0]).matchAll(/"(\w+)":/g),
      (m) => m[1],
    );
    expect(diagKeys).toEqual(['code', 'severity', 'message', 'span', 'start', 'end']);
  });
});
