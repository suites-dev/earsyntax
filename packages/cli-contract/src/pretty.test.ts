import { describe, expect, it } from 'vitest';
import { buildPrettyModel } from './pretty.js';
import { cleanRun, sampleRun } from './__fixtures__/sample-run.js';

describe('buildPrettyModel', () => {
  it('flattens diagnostics in file then requirement then diagnostic order', () => {
    const model = buildPrettyModel(sampleRun);
    expect(model.records.map((r) => r.code)).toEqual([
      'lint.vague_response',
      'catalog.system_unresolved',
      'ears.no_match',
      'lint.suspicious_text_shape',
    ]);
  });

  it('carries file, line, severity, message, and requirement text', () => {
    const first = buildPrettyModel(sampleRun).records[0];
    expect(first).toMatchObject({
      file: 'specs/subscribe.ears',
      line: 7,
      severity: 'warning',
      code: 'lint.vague_response',
      requirementText: 'When alice subscribes the BFF shall notify Redis appropriately.',
    });
  });

  it('omits line when the source line is unknown', () => {
    const model = buildPrettyModel(sampleRun);
    const noMatch = model.records.find((r) => r.code === 'ears.no_match');
    expect(noMatch).toBeDefined();
    expect(Object.hasOwn(noMatch as object, 'line')).toBe(false);
  });

  it('summarizes counts the same way the JSON report does', () => {
    expect(buildPrettyModel(sampleRun).summary).toEqual({
      files: 2,
      requirements: 3,
      errors: 2,
      warnings: 1,
      infos: 1,
      valid: false,
    });
  });

  it('produces no records but still counts requirements for a clean run', () => {
    const model = buildPrettyModel(cleanRun);
    expect(model.records).toEqual([]);
    expect(model.summary).toEqual({
      files: 1,
      requirements: 1,
      errors: 0,
      warnings: 0,
      infos: 0,
      valid: true,
    });
  });

  it('emits no ANSI escape codes', () => {
    const serialized = JSON.stringify(buildPrettyModel(sampleRun));
    // The ESC byte (char code 27) introduces every ANSI sequence; the model
    // carries none.
    const esc = String.fromCharCode(27);
    expect(serialized.includes(esc)).toBe(false);
  });
});
