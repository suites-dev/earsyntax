import { describe, expect, it } from 'vitest';
import type { Findings } from '@earsyntax/core';
import { canonicalizeFindings, serializeFindings } from './findings-report.js';

const sample: Findings = {
  ok: false,
  summary: { files: 1, requirements: 3, valid: 2, errors: 1, warnings: 1 },
  diagnostics: [
    {
      id: 'EARS-E006',
      severity: 'error',
      file: '.kiro/specs/checkout/requirements.md',
      line: 12,
      col: 3,
      message: 'An If clause is missing its required then boundary.',
      fix: 'Write: If <condition>, then the <system> shall <response>.',
      requirementId: 'REQ-003',
    },
    {
      id: 'EARS-W016',
      severity: 'warning',
      file: '.kiro/specs/checkout/requirements.md',
      line: 20,
      message: 'The response contains a vague term.',
    },
  ],
};

describe('serializeFindings', () => {
  it('emits keys in the frozen contract order', () => {
    const keys = (json: string) => Array.from(json.matchAll(/"(\w+)":/g), (m) => m[1]);

    expect(Object.keys(canonicalizeFindings(sample))).toEqual(['ok', 'summary', 'diagnostics']);

    const summaryKeys = keys(JSON.stringify(canonicalizeFindings(sample).summary));
    expect(summaryKeys).toEqual(['files', 'requirements', 'valid', 'errors', 'warnings']);

    const firstDiag = keys(JSON.stringify(canonicalizeFindings(sample).diagnostics[0]));
    expect(firstDiag).toEqual([
      'id',
      'severity',
      'file',
      'line',
      'col',
      'message',
      'fix',
      'requirementId',
    ]);
  });

  it('omits optional keys when absent', () => {
    const second = canonicalizeFindings(sample).diagnostics[1] as object;
    expect(Object.keys(second)).toEqual(['id', 'severity', 'file', 'line', 'message']);
    expect(Object.hasOwn(second, 'col')).toBe(false);
    expect(Object.hasOwn(second, 'fix')).toBe(false);
    expect(Object.hasOwn(second, 'requirementId')).toBe(false);
  });

  it('is byte-identical for the same input', () => {
    expect(serializeFindings(sample)).toBe(serializeFindings(sample));
  });

  it('is byte-identical regardless of input key order', () => {
    const reordered: Findings = {
      diagnostics: sample.diagnostics.map((d) => ({
        requirementId: d.requirementId,
        message: d.message,
        line: d.line,
        file: d.file,
        severity: d.severity,
        id: d.id,
        ...(d.col === undefined ? {} : { col: d.col }),
        ...(d.fix === undefined ? {} : { fix: d.fix }),
      })),
      summary: {
        warnings: sample.summary.warnings,
        errors: sample.summary.errors,
        valid: sample.summary.valid,
        requirements: sample.summary.requirements,
        files: sample.summary.files,
      },
      ok: sample.ok,
    };
    expect(serializeFindings(reordered)).toBe(serializeFindings(sample));
  });

  it('uses 2-space indentation and no trailing newline', () => {
    const out = serializeFindings(sample);
    expect(out).toContain('\n  "summary": {');
    expect(out.endsWith('\n')).toBe(false);
    expect(JSON.parse(out)).toEqual(canonicalizeFindings(sample));
  });

  it('round-trips a clean, empty findings result', () => {
    const clean: Findings = {
      ok: true,
      summary: { files: 0, requirements: 0, valid: 0, errors: 0, warnings: 0 },
      diagnostics: [],
    };
    expect(JSON.parse(serializeFindings(clean))).toEqual(clean);
  });
});
