/**
 * The exit-code contract for tools that run `ears lint`.
 *
 * These values match the orchestration brief. A tool derives the lint-outcome
 * code from a {@link JsonReport} with {@link exitCodeForReport}; it selects
 * {@link EXIT_USAGE} itself for argument, config, or file-read failures, since
 * those are not represented in a report.
 */

import type { JsonReport } from './json-report.js';

/** No error-severity diagnostics. The run succeeded. */
export const EXIT_OK = 0;

/** At least one error-severity diagnostic was reported. */
export const EXIT_LINT_ERRORS = 1;

/** A CLI usage, configuration, or file-read error occurred. */
export const EXIT_USAGE = 2;

/**
 * The exit code implied by a report's findings.
 *
 * Returns {@link EXIT_LINT_ERRORS} when the report contains any error-severity
 * diagnostic, otherwise {@link EXIT_OK}. It never returns {@link EXIT_USAGE}:
 * usage failures are a CLI concern, not a property of a completed report.
 *
 * @param report The JSON report to inspect.
 * @returns {@link EXIT_OK} or {@link EXIT_LINT_ERRORS}.
 */
export function exitCodeForReport(report: JsonReport): typeof EXIT_OK | typeof EXIT_LINT_ERRORS {
  return report.summary.errors > 0 ? EXIT_LINT_ERRORS : EXIT_OK;
}
