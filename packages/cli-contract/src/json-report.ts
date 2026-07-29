/**
 * The JSON report contract.
 *
 * A stable, machine-readable serialization of a linting run that external
 * tools can consume without depending on the CLI. Object keys are constructed
 * in a fixed order and arrays preserve input order, so the same input always
 * serializes to a byte-identical string.
 */

import type { DiagnosticCode, Pattern, Severity, Span } from '@earsyntax/core';
import type { ReportInput } from './input.js';

/** The current JSON report schema version. Bumped on breaking shape changes. */
export const JSON_REPORT_VERSION = 1 as const;

/** A single finding as it appears in the JSON report. */
export interface JsonDiagnostic {
  /** The registered diagnostic code. */
  code: DiagnosticCode;
  /** Severity of the finding. */
  severity: Severity;
  /** Human-readable explanation. */
  message: string;
  /** Source span within the requirement text, when known. */
  span?: Span;
}

/** A single linted requirement as it appears in the JSON report. */
export interface JsonRequirement {
  /** Caller-supplied identifier, when one was provided. */
  id?: string;
  /** 1-based line in the source file, when known. */
  line?: number;
  /** The requirement text that was linted. */
  text: string;
  /** `false` when any diagnostic on this requirement is an error. */
  valid: boolean;
  /** The classified shell pattern, when the requirement parsed. */
  pattern?: Pattern;
  /** Findings for this requirement, in the order core produced them. */
  diagnostics: JsonDiagnostic[];
}

/** One source file and its linted requirements in the JSON report. */
export interface JsonReportFile {
  /** The source file path. */
  path: string;
  /** The requirements linted from this file, in source order. */
  requirements: JsonRequirement[];
}

/** Aggregate counts across the whole report. */
export interface JsonReportSummary {
  /** Number of source files. */
  files: number;
  /** Number of linted requirements. */
  requirements: number;
  /** Total error-severity diagnostics. */
  errors: number;
  /** Total warning-severity diagnostics. */
  warnings: number;
  /** Total info-severity diagnostics. */
  infos: number;
  /** `true` when there are no error-severity diagnostics anywhere. */
  valid: boolean;
}

/** The complete JSON report. */
export interface JsonReport {
  /** Schema version. Always {@link JSON_REPORT_VERSION}. */
  version: typeof JSON_REPORT_VERSION;
  /** Aggregate counts. */
  summary: JsonReportSummary;
  /** Per-file results, in the order they were processed. */
  files: JsonReportFile[];
}

/**
 * Build a {@link JsonReport} from a linting run.
 *
 * Files and requirements keep their input order. Optional keys (`id`, `line`,
 * `pattern`, `span`) are included only when a value is present, and always in
 * their fixed position, so serialization is deterministic.
 *
 * @param input The linted requirements grouped by source file.
 * @returns The assembled JSON report.
 */
export function buildJsonReport(input: ReportInput): JsonReport {
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  let requirements = 0;

  const files: JsonReportFile[] = input.map((file) => {
    const reqs: JsonRequirement[] = file.items.map((item) => {
      requirements += 1;

      const diagnostics: JsonDiagnostic[] = item.result.diagnostics.map((diagnostic) => {
        if (diagnostic.severity === 'error') {
          errors += 1;
        } else if (diagnostic.severity === 'warning') {
          warnings += 1;
        } else {
          infos += 1;
        }

        // Keys constructed in fixed order: code, severity, message, span.
        const jsonDiagnostic: JsonDiagnostic = {
          code: diagnostic.code,
          severity: diagnostic.severity,
          message: diagnostic.message,
        };
        if (diagnostic.span !== undefined) {
          jsonDiagnostic.span = { start: diagnostic.span.start, end: diagnostic.span.end };
        }
        return jsonDiagnostic;
      });

      // Keys constructed in fixed order: id, line, text, valid, pattern,
      // diagnostics.
      const requirement = {} as JsonRequirement;
      if (item.input.id !== undefined) {
        requirement.id = item.input.id;
      }
      if (item.input.source?.line !== undefined) {
        requirement.line = item.input.source.line;
      }
      requirement.text = item.input.text;
      requirement.valid = item.result.valid;
      if (item.result.pattern !== undefined) {
        requirement.pattern = item.result.pattern;
      }
      requirement.diagnostics = diagnostics;
      return requirement;
    });

    return { path: file.path, requirements: reqs };
  });

  const summary: JsonReportSummary = {
    files: files.length,
    requirements,
    errors,
    warnings,
    infos,
    valid: errors === 0,
  };

  return { version: JSON_REPORT_VERSION, summary, files };
}

/**
 * Serialize a {@link JsonReport} to a stable string.
 *
 * Uses 2-space indentation and appends a trailing newline. Because
 * {@link buildJsonReport} constructs keys in a fixed order, the same input
 * always yields a byte-identical string.
 *
 * @param report The report to serialize.
 * @returns The pretty-printed JSON with a trailing newline.
 */
export function serializeJsonReport(report: JsonReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
