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
 * projection of that same Findings model ({@link buildSarifLog}).
 *
 * Determinism contract: serializers construct object keys in a fixed order and
 * preserve input order, so identical input always produces identical output.
 */

export type { Findings } from '@earsyntax/core';

export { canonicalizeFindings, serializeFindings } from './findings-report.js';

export { EXIT_LINT_ERRORS, EXIT_OK, EXIT_USAGE, exitCodeForFindings } from './exit-codes.js';

export { buildSarifLog, serializeSarifLog } from './sarif.js';
