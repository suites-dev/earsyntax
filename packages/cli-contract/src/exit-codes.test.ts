import { describe, expect, it } from 'vitest';
import type { Findings } from '@earsyntax/core';
import { EXIT_LINT_ERRORS, EXIT_OK, EXIT_USAGE, exitCodeForFindings } from './exit-codes.js';

function findings(partial: Partial<Findings['summary']>): Findings {
  const summary = { files: 1, requirements: 1, valid: 1, errors: 0, warnings: 0, ...partial };
  return { ok: summary.errors === 0, summary, diagnostics: [] };
}

describe('exit code constants', () => {
  it('are the closed 0/1/2 surface (no exit 3)', () => {
    expect(EXIT_OK).toBe(0);
    expect(EXIT_LINT_ERRORS).toBe(1);
    expect(EXIT_USAGE).toBe(2);
  });
});

describe('exitCodeForFindings', () => {
  it('returns EXIT_LINT_ERRORS when findings have error diagnostics', () => {
    expect(exitCodeForFindings(findings({ errors: 2, valid: 0 }))).toBe(EXIT_LINT_ERRORS);
  });

  it('returns EXIT_OK when findings have no error diagnostics', () => {
    expect(exitCodeForFindings(findings({}))).toBe(EXIT_OK);
  });

  it('treats warnings alone as EXIT_OK', () => {
    expect(exitCodeForFindings(findings({ warnings: 3 }))).toBe(EXIT_OK);
  });
});
