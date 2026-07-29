/**
 * A structured model for pretty (human) rendering.
 *
 * This is NOT terminal output: it carries no ANSI codes, no column widths, and
 * no formatting decisions. It flattens a linting run into one record per
 * diagnostic plus a summary, so a CLI can render it however it likes while the
 * ordering and content stay defined here.
 */

import type { DiagnosticCode, Severity } from '@earsyntax/core';
import type { ReportInput } from './input.js';

/** One diagnostic flattened for rendering, with its file and requirement. */
export interface PrettyRecord {
  /** The source file path. */
  file: string;
  /** 1-based source line, when known. */
  line?: number;
  /** Severity of the diagnostic. */
  severity: Severity;
  /** The diagnostic code. */
  code: DiagnosticCode;
  /** The human-readable message. */
  message: string;
  /** The text of the requirement the diagnostic belongs to. */
  requirementText: string;
}

/** Aggregate counts for the pretty summary line. */
export interface PrettySummary {
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

/** The complete pretty model: flattened records plus a summary. */
export interface PrettyModel {
  /** One record per diagnostic, in file then requirement then diagnostic order. */
  records: PrettyRecord[];
  /** Aggregate counts across the run. */
  summary: PrettySummary;
}

/**
 * Build a {@link PrettyModel} from a linting run.
 *
 * Records follow input order: files, then requirements within each file, then
 * diagnostics within each requirement (in the order core produced them).
 * Requirements with no diagnostics contribute to the summary counts but add no
 * records.
 *
 * @param input The linted requirements grouped by source file.
 * @returns The flattened pretty model.
 */
export function buildPrettyModel(input: ReportInput): PrettyModel {
  const records: PrettyRecord[] = [];
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  let requirements = 0;

  for (const file of input) {
    for (const item of file.items) {
      requirements += 1;
      const line = item.input.source?.line;

      for (const diagnostic of item.result.diagnostics) {
        if (diagnostic.severity === 'error') {
          errors += 1;
        } else if (diagnostic.severity === 'warning') {
          warnings += 1;
        } else {
          infos += 1;
        }

        const record: PrettyRecord = {
          file: file.path,
          severity: diagnostic.severity,
          code: diagnostic.code,
          message: diagnostic.message,
          requirementText: item.input.text,
        };
        if (line !== undefined) {
          record.line = line;
        }
        records.push(record);
      }
    }
  }

  const summary: PrettySummary = {
    files: input.length,
    requirements,
    errors,
    warnings,
    infos,
    valid: errors === 0,
  };

  return { records, summary };
}
