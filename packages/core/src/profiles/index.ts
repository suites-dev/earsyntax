/**
 * `@earsyntax/core` profiles subsystem barrel.
 *
 * Re-exports the profile schema types and validator, the built-in profile data,
 * resolution, and diffing. Profiles are data, not code: nothing here branches on
 * a profile name beyond validation and diffing.
 */

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
} from './schema.js';
export { validateProfile } from './schema.js';

export { KNOWN_DIAGNOSTIC_IDS, isKnownDiagnosticId } from './registry-ids.js';

export { BUILTIN_PROFILES, BUILTIN_PROFILE_NAMES } from './builtins.js';

export { resolveProfile } from './resolve.js';
export type { ResolveProfileResult, UnknownProfileError } from './resolve.js';

export { diffProfile, summarizeProfiles } from './diff.js';
export type { ProfileDiff } from './diff.js';
