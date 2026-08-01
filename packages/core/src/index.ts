/**
 * `@earsyntax/core` public API surface.
 *
 * This module re-exports every shared type from {@link ./types} and the public
 * functions from {@link ./lint}. The function implementations wire the shell
 * parser, expression parser, catalog matcher, and diagnostics module into the
 * frozen public signatures.
 *
 * Determinism contract: every function here is deterministic. No LLM calls, no
 * network, no file system access, no fuzzy matching. Diagnostics are stably
 * sorted; batch order is preserved.
 */

export type * from './types.js';

export { lintEars, lintEarsBatch, parseEars, lintCatalogCoverage } from './lint.js';

// The diagnostic registry (Agent C1) is the single source of truth for the
// id/alias/severity migration table. `idForCode` is exported here from
// './registry.js'; `findings.js` imports it (and default severity via
// `getDiagnosticEntry`) rather than redefining the table, so the mapping lives
// in exactly one place. `defaultSeverityForId` is a Findings-layer wrapper over
// the registry, exported once from './findings.js' below.
export {
  DIAGNOSTIC_REGISTRY,
  resolveDiagnosticId,
  getDiagnosticEntry,
  idForCode,
} from './registry.js';
export type { DiagnosticRegistryEntry, RegistrySeverity } from './registry.js';

// --- Profiles subsystem (owned by Agent C3). Appended as a distinct block. ---
export type {
  Profile,
  ProfileName,
  ProfileDialect,
  ProfileLocator,
  ProfileIdFormat,
  LocatorRule,
  LocatorRuleKind,
  ListMarker,
  KeywordCase,
  CommaAfterLeadingClause,
  CodeFences,
  SeverityLevel,
  ProfileValidationError,
  ProfileValidationErrorCode,
  ProfileValidationResult,
  ResolveProfileResult,
  UnknownProfileError,
  ProfileDiff,
} from './profiles/index.js';
export {
  validateProfile,
  resolveProfile,
  diffProfile,
  summarizeProfiles,
  BUILTIN_PROFILES,
  BUILTIN_PROFILE_NAMES,
  KNOWN_DIAGNOSTIC_IDS,
  isKnownDiagnosticId,
} from './profiles/index.js';

export type {
  Findings,
  FindingsDiagnostic,
  FindingsInput,
  FindingsInputFile,
  FindingsInputItem,
  FindingsSeverity,
  FindingsSummary,
  SeverityOverride,
  SeverityOverrides,
  ToFindingsOptions,
} from './findings.js';
export { defaultSeverityForId, toFindings } from './findings.js';
