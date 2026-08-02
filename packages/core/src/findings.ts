/**
 * The canonical Findings model for `@earsyntax/core`.
 *
 * Findings v1 is the single result every findings-bearing command returns.
 * `validate` returns it directly; other commands embed it. This module owns the
 * frozen shapes from `docs/contracts/findings.md` and the pure converter that
 * turns the core linter's {@link LintResult} output (plus per-file source info)
 * into a {@link Findings} value.
 *
 * Severity in a {@link FindingsDiagnostic} is the EFFECTIVE severity: the
 * registry default for the diagnostic id, then any active profile override, then
 * `--strict`. A profile override of `off` drops the diagnostic and wins over
 * `--strict`. `ok` is `true` exactly when no diagnostic has effective severity
 * `error`.
 *
 * Determinism contract: no LLM, no network, no file system, no clock, no random
 * source. The same input always produces a deeply equal, stably ordered result.
 */

import { getDiagnosticEntry, idForCode } from './registry.js';
import type { LintResult, RequirementInput } from './types.js';

/**
 * The effective severity a {@link FindingsDiagnostic} can carry.
 *
 * There is no `info` level in the Findings model: the core `Severity` union's
 * `info` value never reaches this layer.
 */
export type FindingsSeverity = 'error' | 'warning';

/**
 * A single finding in the Findings model.
 *
 * This is the `Diagnostic` shape from `docs/contracts/findings.md`, renamed to
 * avoid colliding with the legacy core {@link import('./types.js').Diagnostic}.
 * Object keys are constructed in the fixed order `id`, `severity`, `file`,
 * `line`, `col?`, `message`, `fix?`, `requirementId?`.
 */
export interface FindingsDiagnostic {
  /** The registry id: `EARS-E###` or `EARS-W###`. */
  id: string;
  /** The EFFECTIVE severity after overrides and `--strict`. */
  severity: FindingsSeverity;
  /** Source file path relative to `--cwd` (POSIX), or `-` for stdin. */
  file: string;
  /** 1-based line in `file`. Always present. */
  line: number;
  /** 1-based column, when the finding maps to a specific column. */
  col?: number;
  /** One factual sentence describing the finding. */
  message: string;
  /** One suggested remediation sentence, when a deterministic hint exists. */
  fix?: string;
  /** The requirement's own id (for example `REQ-001`), when known. */
  requirementId?: string;
}

/** Aggregate counts across a Findings result. Always all five keys. */
export interface FindingsSummary {
  /** Count of source files the pipeline located and read. */
  files: number;
  /** Count of requirement candidates across all files. */
  requirements: number;
  /** Count of requirements carrying no error-severity diagnostic. */
  valid: number;
  /** Total diagnostics with effective severity `error`. */
  errors: number;
  /** Total diagnostics with effective severity `warning`. */
  warnings: number;
}

/** The canonical Findings result. */
export interface Findings {
  /** `true` when `summary.errors === 0`. */
  ok: boolean;
  /** Aggregate counts. */
  summary: FindingsSummary;
  /** Every finding, stably ordered. Always present; may be empty. */
  diagnostics: FindingsDiagnostic[];
}

/**
 * A profile severity override for one diagnostic id.
 *
 * `off` drops the diagnostic entirely before `--strict` is considered.
 */
export type SeverityOverride = 'error' | 'warning' | 'off';

/**
 * Profile severity overrides, keyed by current `EARS-*` id (never by an alias).
 *
 * Supplied by the active profile (Agent C3 owns profile data); an absent id
 * uses the registry default severity.
 */
export type SeverityOverrides = Readonly<Record<string, SeverityOverride>>;

/**
 * One linted requirement: the requirement that went in and the result that came
 * out.
 */
export interface FindingsInputItem {
  /** The requirement that was linted (`id`, `text`, and optional `source`). */
  input: RequirementInput;
  /** The result the core linter returned for {@link FindingsInputItem.input}. */
  result: LintResult;
}

/** All linted requirements that share one source file. */
export interface FindingsInputFile {
  /** The source file path, relative to `--cwd` (POSIX), or `-` for stdin. */
  file: string;
  /** The linted requirements, in the order they appeared in the file. */
  items: FindingsInputItem[];
}

/**
 * The full converter input: files in processed order, each carrying its linted
 * requirements in source order.
 */
export type FindingsInput = readonly FindingsInputFile[];

/** Options that tune {@link toFindings} severity resolution. */
export interface ToFindingsOptions {
  /** Active profile severity overrides, keyed by current `EARS-*` id. */
  overrides?: SeverityOverrides;
  /** Upgrade every surviving `warning` to `error` at this layer. */
  strict?: boolean;
}

/**
 * The registry default severity for an `EARS-*` id.
 *
 * Reads {@link getDiagnosticEntry}'s `defaultSeverity` from Agent C1's
 * diagnostic registry, the single source of truth for the id/severity migration
 * table. This is the default only: a profile override or `--strict` can change
 * the effective severity a diagnostic carries. An id with no registry entry
 * (which should not occur for a resolved id) falls back to its band prefix.
 *
 * @param id The current `EARS-*` id.
 * @returns The registry default severity for the id.
 */
export function defaultSeverityForId(id: string): FindingsSeverity {
  const entry = getDiagnosticEntry(id);
  if (entry) {
    return entry.defaultSeverity;
  }
  return id.startsWith('EARS-E') ? 'error' : 'warning';
}

/**
 * Compute the effective severity for a diagnostic id, or `undefined` when the
 * diagnostic is dropped.
 *
 * Order: registry default, then the profile override (`error`, `warning`, or
 * `off`), then `--strict`. An override of `off` returns `undefined` (dropped)
 * and wins over `--strict`.
 */
function effectiveSeverity(
  id: string,
  overrides: SeverityOverrides,
  strict: boolean,
): FindingsSeverity | undefined {
  // `overrides` is a Record, whose index type omits `undefined`; guard with
  // `hasOwn` so a missing id is honestly typed as absent.
  const override: SeverityOverride | undefined = Object.hasOwn(overrides, id)
    ? overrides[id]
    : undefined;
  if (override === 'off') {
    return undefined;
  }
  const base: FindingsSeverity = override ?? defaultSeverityForId(id);
  return strict && base === 'warning' ? 'error' : base;
}

/**
 * Build one {@link FindingsDiagnostic}, constructing keys in their fixed order.
 *
 * `fix` is never set yet: the legacy diagnostics carry no repair hint and the
 * registry that will supply one is Agent C1's (RECONCILE WITH C1).
 */
function buildFindingsDiagnostic(
  id: string,
  severity: FindingsSeverity,
  file: string,
  item: FindingsInputItem,
  message: string,
): FindingsDiagnostic {
  // Keys constructed in fixed order: id, severity, file, line, col?, message,
  // fix?, requirementId?. Local construction only; no input is mutated.
  const diagnostic = {} as FindingsDiagnostic;
  diagnostic.id = id;
  diagnostic.severity = severity;
  diagnostic.file = file;
  diagnostic.line = item.input.source?.line ?? 1;
  const col = item.input.source?.column;
  if (col !== undefined) {
    diagnostic.col = col;
  }
  diagnostic.message = message;
  if (item.input.id !== undefined) {
    diagnostic.requirementId = item.input.id;
  }
  return diagnostic;
}

/**
 * Compare two findings for stable ordering.
 *
 * Order, in priority: `file` (code-unit), `line` ascending, `col` ascending
 * (a finding without `col` sorts after one with `col` on the same line), `id`
 * (code-unit), then `message` (code-unit). String comparison uses code-unit
 * order to stay locale-independent and deterministic.
 */
function compareFindings(a: FindingsDiagnostic, b: FindingsDiagnostic): number {
  if (a.file !== b.file) {
    return a.file < b.file ? -1 : 1;
  }
  if (a.line !== b.line) {
    return a.line - b.line;
  }
  if (a.col !== undefined && b.col !== undefined) {
    if (a.col !== b.col) {
      return a.col - b.col;
    }
  } else if (a.col !== undefined) {
    return -1;
  } else if (b.col !== undefined) {
    return 1;
  }
  if (a.id !== b.id) {
    return a.id < b.id ? -1 : 1;
  }
  if (a.message !== b.message) {
    return a.message < b.message ? -1 : 1;
  }
  return 0;
}

/**
 * Convert a linting run into the canonical {@link Findings} model.
 *
 * Each legacy {@link import('./types.js').Diagnostic} maps to a
 * {@link FindingsDiagnostic}: its `code` becomes the new `EARS-*` id, its
 * effective severity is resolved from the registry default, the profile
 * overrides, and `--strict`, and its position comes from the file group plus the
 * requirement's source location. Diagnostics whose override is `off` are
 * dropped. Findings are stably sorted; the summary and `ok` derive from the
 * emitted diagnostics.
 *
 * @param input The linted requirements grouped by source file.
 * @param options Profile overrides and `--strict`.
 * @returns The assembled Findings result.
 */
export function toFindings(input: FindingsInput, options: ToFindingsOptions = {}): Findings {
  const overrides = options.overrides ?? {};
  const strict = options.strict ?? false;

  const collected: FindingsDiagnostic[] = [];
  let files = 0;
  let requirements = 0;
  let valid = 0;

  for (const fileGroup of input) {
    files += 1;
    for (const item of fileGroup.items) {
      requirements += 1;
      let hasError = false;
      for (const diagnostic of item.result.diagnostics) {
        const id = idForCode(diagnostic.code);
        const severity = effectiveSeverity(id, overrides, strict);
        if (severity === undefined) {
          continue;
        }
        if (severity === 'error') {
          hasError = true;
        }
        collected.push(
          buildFindingsDiagnostic(id, severity, fileGroup.file, item, diagnostic.message),
        );
      }
      if (!hasError) {
        valid += 1;
      }
    }
  }

  const diagnostics = collected.slice().sort(compareFindings);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
  const warnings = diagnostics.length - errors;

  return {
    ok: errors === 0,
    summary: { files, requirements, valid, errors, warnings },
    diagnostics,
  };
}
