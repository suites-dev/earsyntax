/**
 * Facade JSON contracts for the `earsyntax` CLI.
 *
 * These shapes are the normative wire format described in `docs/facade-api.md`.
 * Every `--json` command returns a {@link FacadeResponse}; command-specific
 * payloads are added as top-level convenience keys rather than nested under
 * `data` (see the `[DECIDED] Convenience keys over data` note in the contract).
 *
 * Core linting types (`Pattern`, `Diagnostic`, `EarsAst`, `ReferenceMatch`) are
 * imported from `@earsyntax/core`; this module only defines the facade layer.
 */

import type { Diagnostic, EarsAst, Pattern, ReferenceMatch } from '@earsyntax/core';

/** Severity of a facade-level notice. `info` is facade-only; core emits only error/warning. */
export type FacadeSeverity = 'error' | 'warning' | 'info';

/** A facade-level diagnostic about config, paths, or work items. */
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
  blocking?: boolean;
  forAgent?: boolean;
}

/** The base shape every `--json` response carries. */
export interface FacadeResponse {
  version: string;
  command: string;
  ok: boolean;
  root?: string;
  data?: unknown;
  diagnostics?: FacadeDiagnostic[];
  next: NextAction[];
  /** Command-specific convenience keys (work, written, summary, results, ...). */
  [key: string]: unknown;
}

/** The two ways a work item can be created. */
export type WorkMode = 'author' | 'convert';

/** The lifecycle state of a work item. */
export type WorkStatus =
  | 'missing'
  | 'scaffolded'
  | 'drafted'
  | 'invalid'
  | 'valid'
  | 'accepted'
  | 'stale';

/** How a source file was classified for extraction. */
export type SourceKind = 'markdown' | 'yaml' | 'json' | 'text' | 'prompt';

/** The durable state of a work item, stored at `.earsyntax/work/<slug>/manifest.json`. */
export interface WorkManifest {
  schemaVersion: 1;
  id: string;
  mode: WorkMode;
  status: WorkStatus;
  source?: {
    path?: string;
    hash?: string;
    kind: SourceKind;
    snapshotPath?: string;
  };
  prompt?: string;
  output: {
    path: string;
    hash?: string;
  };
  artifacts: {
    questions: string;
    traceability: string;
    validationJson: string;
    validationMarkdown: string;
  };
  createdAt: string;
  updatedAt: string;
  accepted?: {
    at: string;
    by?: string;
    sourceHash?: string;
    outputHash: string;
  };
}

/** The compact work-item view returned by `instructions`, `list`, and `show`. */
export interface WorkSummary {
  id: string;
  status: WorkStatus;
  source?: string;
  output: string;
  questions: string;
  traceability: string;
}

/** One source excerpt returned in convert-mode instructions. */
export interface SourceExcerpt {
  path: string;
  startLine: number;
  endLine: number;
  text: string;
}

/** One validated requirement in a `validate` response. */
export interface ValidationResult {
  id?: string;
  file: string;
  line?: number;
  valid: boolean;
  pattern?: Pattern;
  ast?: EarsAst;
  references: ReferenceMatch[];
  diagnostics: Diagnostic[];
}