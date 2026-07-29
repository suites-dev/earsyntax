/**
 * `@earsyntax/cli-contract` public API surface.
 *
 * Shared report output contracts so external tools can consume `ears lint`
 * reports without depending on the CLI. This package defines report DATA
 * shapes and pure serializers only: no I/O, no argument parsing, no
 * `process.exit`, and no assumptions about command names or flags.
 *
 * Determinism contract: builders preserve input order and construct object
 * keys in a fixed order, so identical input always produces identical output.
 */

export type { ReportInput, ReportInputFile, ReportInputItem } from './input.js';

export { DIAGNOSTIC_CODES, DIAGNOSTIC_DESCRIPTIONS } from './diagnostic-registry.js';

export type {
  JsonDiagnostic,
  JsonReport,
  JsonReportFile,
  JsonReportSummary,
  JsonRequirement,
} from './json-report.js';
export { buildJsonReport, JSON_REPORT_VERSION, serializeJsonReport } from './json-report.js';

export type {
  SarifDriver,
  SarifLevel,
  SarifLocation,
  SarifLog,
  SarifPhysicalLocation,
  SarifRegion,
  SarifResult,
  SarifRule,
  SarifRun,
} from './sarif.js';
export { buildSarifLog, SARIF_SCHEMA, SARIF_TOOL_NAME, SARIF_VERSION } from './sarif.js';

export type { PrettyModel, PrettyRecord, PrettySummary } from './pretty.js';
export { buildPrettyModel } from './pretty.js';

export { EXIT_LINT_ERRORS, EXIT_OK, EXIT_USAGE, exitCodeForReport } from './exit-codes.js';
