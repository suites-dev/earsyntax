/**
 * The exit-code contract for the host-native `earsyntax` CLI.
 *
 * The surface is `0`, `1`, `2` only (exit `3`, the old workspace-refusal code,
 * is removed). A findings run derives its outcome code from a {@link Findings}
 * value with {@link exitCodeForFindings}; a tool selects {@link EXIT_USAGE}
 * itself for argument, profile, or environment failures, since those are not
 * represented in a findings result.
 */

import type { Findings } from '@earsyntax/core';

/** No error-severity findings. The run succeeded. */
export const EXIT_OK = 0;

/** At least one error-severity finding was reported. */
export const EXIT_LINT_ERRORS = 1;

/** A usage or environment failure occurred (bad flag, unknown profile, ...). */
export const EXIT_USAGE = 2;

/**
 * The exit code implied by a findings result.
 *
 * Returns {@link EXIT_LINT_ERRORS} when the findings contain any error-severity
 * diagnostic, otherwise {@link EXIT_OK}. It never returns {@link EXIT_USAGE}:
 * usage and environment failures are a CLI concern, not a property of a
 * completed findings run. Equivalent to `findings.ok ? EXIT_OK : EXIT_LINT_ERRORS`.
 *
 * @param findings The findings to inspect.
 * @returns {@link EXIT_OK} or {@link EXIT_LINT_ERRORS}.
 */
export function exitCodeForFindings(findings: Findings): typeof EXIT_OK | typeof EXIT_LINT_ERRORS {
  return findings.summary.errors > 0 ? EXIT_LINT_ERRORS : EXIT_OK;
}
