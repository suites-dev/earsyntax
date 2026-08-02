/**
 * The facade envelope types for the `earsyntax` CLI.
 *
 * These shapes are the normative wire format described in
 * `docs/refactor/host-native-facade.md`. Every `--json` command returns a
 * {@link FacadeResponse}; command-specific payloads are added as top-level
 * convenience keys. This module defines only the envelope; each command owns
 * its own payload types (findings, candidates, profile summaries, and so on).
 */

/** Severity of a facade-level notice. Core lint findings live in a command's own payload, not here. */
export type FacadeSeverity = 'error' | 'warning';

/**
 * A facade-level diagnostic: a usage or environment notice (bad flag, unknown
 * profile, missing path). It is distinct from the lint findings a command
 * carries in its `findings` payload; lint results never appear here.
 */
export interface FacadeDiagnostic {
  code: string;
  severity: FacadeSeverity;
  message: string;
  path?: string;
  line?: number;
}

/** A runnable follow-up command returned in `next`. */
export interface NextAction {
  command: string;
  reason: string;
  forAgent?: boolean;
}

/** The base shape every `--json` response carries. */
export interface FacadeResponse {
  version: string;
  command: string;
  ok: boolean;
  root?: string;
  diagnostics?: FacadeDiagnostic[];
  next: NextAction[];
  /** Command-specific convenience keys (findings, summary, candidates, features, ...). */
  [key: string]: unknown;
}
