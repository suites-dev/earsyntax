/**
 * A hand-built linting run used across the contract tests.
 *
 * It exercises the shapes the builders care about: multiple files, requirements
 * with and without ids, source lines and spans present and absent, and all
 * three severities. It does not call the core linter (still a stub); it
 * assembles {@link LintResult} values directly so the builders can be tested in
 * isolation.
 */

import type { LintResult } from '@earsyntax/core';
import type { ReportInput } from '../input.js';

function result(partial: Partial<LintResult> & Pick<LintResult, 'valid'>): LintResult {
  return { references: [], diagnostics: [], ...partial };
}

export const sampleRun = [
  {
    path: 'specs/subscribe.ears',
    items: [
      {
        input: { id: 'REQ-1', text: 'The BFF shall return a 200 response.', source: { line: 3 } },
        result: result({ valid: true, pattern: 'ubiquitous' }),
      },
      {
        input: {
          id: 'REQ-2',
          text: 'When alice subscribes the BFF shall notify Redis appropriately.',
          source: { line: 7 },
        },
        result: result({
          valid: false,
          pattern: 'event-driven',
          diagnostics: [
            {
              code: 'lint.vague_response',
              severity: 'warning',
              message: 'A response uses vague, unverifiable wording.',
              span: { start: 44, end: 57 },
            },
            {
              code: 'catalog.system_unresolved',
              severity: 'error',
              message: 'The system does not resolve to a catalog entry.',
              span: { start: 20, end: 23 },
            },
          ],
        }),
      },
    ],
  },
  {
    path: 'specs/payment.ears',
    items: [
      {
        // No id, no source line: exercises optional-key omission and the
        // span-based SARIF region path.
        input: { text: 'gibberish that does not match' },
        result: result({
          valid: false,
          diagnostics: [
            {
              code: 'ears.no_match',
              severity: 'error',
              message: 'Text does not match any EARS shell pattern.',
              span: { start: 0, end: 29 },
            },
            {
              code: 'lint.suspicious_text_shape',
              severity: 'info',
              message: 'Requirement text has a suspicious shape.',
            },
          ],
        }),
      },
    ],
  },
] satisfies ReportInput;

/** A clean run with no diagnostics, used for the "valid" and EXIT_OK paths. */
export const cleanRun = [
  {
    path: 'specs/clean.ears',
    items: [
      {
        input: { id: 'OK-1', text: 'The BFF shall persist the order.', source: { line: 1 } },
        result: result({ valid: true, pattern: 'ubiquitous' }),
      },
    ],
  },
] satisfies ReportInput;
