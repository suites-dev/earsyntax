/**
 * The single error type command handlers throw to abort with a facade
 * diagnostic and a specific exit code.
 *
 * The dispatcher catches {@link CliError}, renders a base {@link FacadeResponse}
 * carrying the diagnostic (JSON or pretty), and returns the carried exit code.
 * The only failure exit code is `2` (usage or environment): there is no
 * workspace to refuse writes over, so exit `3` no longer exists.
 */

import type { FacadeDiagnostic, NextAction } from './facade-types.js';

export class CliError extends Error {
  readonly exitCode: number;
  readonly diagnostic: FacadeDiagnostic;
  readonly next: NextAction[];

  constructor(exitCode: number, diagnostic: FacadeDiagnostic, next: NextAction[] = []) {
    super(diagnostic.message);
    this.name = 'CliError';
    this.exitCode = exitCode;
    this.diagnostic = diagnostic;
    this.next = next;
  }
}

/** Build a usage or environment error (exit 2). */
export function usageError(
  code: string,
  message: string,
  extra?: Partial<FacadeDiagnostic>,
): CliError {
  return new CliError(2, { code, severity: 'error', message, ...extra });
}
