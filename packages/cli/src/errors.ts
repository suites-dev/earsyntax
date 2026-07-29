/**
 * The single error type command handlers throw to abort with a facade
 * diagnostic and a specific exit code.
 *
 * `run` catches {@link CliError}, renders a base {@link FacadeResponse} carrying
 * the diagnostic (JSON or pretty), and returns the carried exit code. Exit
 * codes follow the contract: 2 for usage/resolution errors, 3 for refusals.
 */

import type { FacadeDiagnostic } from './facade-types.js';

export class CliError extends Error {
  readonly exitCode: number;
  readonly diagnostic: FacadeDiagnostic;
  readonly next: { command: string; reason: string; forAgent?: boolean; blocking?: boolean }[];

  constructor(
    exitCode: number,
    diagnostic: FacadeDiagnostic,
    next: { command: string; reason: string; forAgent?: boolean; blocking?: boolean }[] = [],
  ) {
    super(diagnostic.message);
    this.name = 'CliError';
    this.exitCode = exitCode;
    this.diagnostic = diagnostic;
    this.next = next;
  }
}

/** Build a usage/resolution error (exit 2). */
export function usageError(
  code: string,
  message: string,
  extra?: Partial<FacadeDiagnostic>,
): CliError {
  return new CliError(2, { code, severity: 'error', message, ...extra });
}

/** Build a refusal error (exit 3): overwrite protection, stale source, confirmation required. */
export function refusalError(
  code: string,
  message: string,
  extra?: Partial<FacadeDiagnostic>,
): CliError {
  return new CliError(3, { code, severity: 'error', message, ...extra });
}
