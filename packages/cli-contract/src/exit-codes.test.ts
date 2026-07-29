import { describe, expect, it } from 'vitest';
import { EXIT_LINT_ERRORS, EXIT_OK, EXIT_USAGE, exitCodeForReport } from './exit-codes.js';
import { buildJsonReport } from './json-report.js';
import { cleanRun, sampleRun } from './__fixtures__/sample-run.js';

describe('exit code constants', () => {
  it('match the orchestration contract', () => {
    expect(EXIT_OK).toBe(0);
    expect(EXIT_LINT_ERRORS).toBe(1);
    expect(EXIT_USAGE).toBe(2);
  });
});

describe('exitCodeForReport', () => {
  it('returns EXIT_LINT_ERRORS when the report has error diagnostics', () => {
    expect(exitCodeForReport(buildJsonReport(sampleRun))).toBe(EXIT_LINT_ERRORS);
  });

  it('returns EXIT_OK when the report has no error diagnostics', () => {
    expect(exitCodeForReport(buildJsonReport(cleanRun))).toBe(EXIT_OK);
  });

  it('treats warnings and infos alone as EXIT_OK', () => {
    const report = buildJsonReport([
      {
        path: 'specs/warn.ears',
        items: [
          {
            input: { text: 'The BFF shall respond appropriately.' },
            result: {
              valid: true,
              references: [],
              diagnostics: [
                {
                  code: 'lint.vague_response',
                  severity: 'warning',
                  message: 'A response uses vague, unverifiable wording.',
                },
              ],
            },
          },
        ],
      },
    ]);
    expect(report.summary.warnings).toBe(1);
    expect(exitCodeForReport(report)).toBe(EXIT_OK);
  });
});
