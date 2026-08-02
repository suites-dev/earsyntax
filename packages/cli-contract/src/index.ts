/**
 * `@earsyntax/cli-contract` public API surface.
 *
 * Shared output contracts so external tools can consume `earsyntax` results
 * without depending on the CLI. This package defines pure serializers and DATA
 * shapes only: no I/O, no argument parsing, no `process.exit`, and no
 * assumptions about command names or flags.
 *
 * The canonical result is the Findings model, built in `@earsyntax/core`
 * (`toFindings`) and serialized here by {@link serializeFindings}. SARIF is a
 * projection of that same Findings model ({@link buildSarifLog}); the pretty
 * model is a legacy projection kept compiling, to be rebuilt from Findings by a
 * later agent.
 *
 * Determinism contract: serializers construct object keys in a fixed order and
 * preserve input order, so identical input always produces identical output.
 */

export type {
  Findings,
  FindingsDiagnostic,
  FindingsSummary,
  FindingsSeverity,
} from '@earsyntax/core';

export { canonicalizeFindings, serializeFindings } from './findings-report.js';

export { EXIT_LINT_ERRORS, EXIT_OK, EXIT_USAGE, exitCodeForFindings } from './exit-codes.js';

export type { ReportInput, ReportInputFile, ReportInputItem } from './input.js';

export { DIAGNOSTIC_CODES, DIAGNOSTIC_DESCRIPTIONS } from './diagnostic-registry.js';

export type {
  BuildSarifOptions,
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
export {
  buildSarifLog,
  serializeSarifLog,
  SARIF_SCHEMA,
  SARIF_TOOL_NAME,
  SARIF_VERSION,
} from './sarif.js';

export type { PrettyModel, PrettyRecord, PrettySummary } from './pretty.js';
export { buildPrettyModel } from './pretty.js';
