/**
 * Facade-neutral input contract for the report builders.
 *
 * These shapes describe the DATA a linting run produced, grouped by source
 * file. They are intentionally decoupled from any CLI command surface: no flag
 * names, no argv parsing, no I/O. A tool collects one {@link ReportInputItem}
 * per requirement it linted, groups them into {@link ReportInputFile}s, and
 * passes the array to `buildJsonReport`, `buildSarifLog`, or
 * `buildPrettyModel`.
 */

import type { LintResult, RequirementInput } from '@earsyntax/core';

/**
 * One linted requirement: the requirement that went in, and the result that
 * came out.
 */
export interface ReportInputItem {
  /** The requirement that was linted (`id`, `text`, and optional `source`). */
  input: RequirementInput;
  /** The result the core linter returned for {@link ReportInputItem.input}. */
  result: LintResult;
}

/**
 * All linted requirements that share one source file path.
 */
export interface ReportInputFile {
  /** The source file path the items were extracted from. */
  path: string;
  /** The linted requirements, in the order they appeared in the file. */
  items: ReportInputItem[];
}

/**
 * The complete input to every report builder: files in the order they were
 * processed, each carrying its linted requirements in source order. Builders
 * never reorder files or items; array order is the contract.
 */
export type ReportInput = ReportInputFile[];
