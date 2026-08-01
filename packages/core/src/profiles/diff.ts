/**
 * Profile diffing for `@earsyntax/core`.
 *
 * For each built-in profile this computes a structured diff against `strict`:
 * which dialect tolerances it relaxes, which capabilities it adds, and which
 * severities it overrides. It also renders a one-line `locates` summary from the
 * profile's locator data. Everything here is derived from the profile objects,
 * so the future `profiles` command cannot drift from the data (there is no
 * hand-written per-profile description).
 *
 * Determinism note: pure functions over profile data. No clock, file system, or
 * network.
 */

import { BUILTIN_PROFILES, BUILTIN_PROFILE_NAMES } from './builtins.js';
import type { LocatorRule, Profile, ProfileName, SeverityLevel } from './schema.js';

/**
 * A profile's difference from `strict`, plus a generated locator summary.
 *
 * This is the shape the `profiles` command renders (`ProfileSummary` in the
 * facade contract): `{ name, locates, relaxes, adds, severityOverrides }`.
 */
export interface ProfileDiff {
  /** The profile name. */
  name: ProfileName;
  /** One-line locator summary generated from locator data. */
  locates: string;
  /** Dialect tolerances this profile loosens relative to strict. */
  relaxes: string[];
  /** Capabilities this profile adds relative to strict. */
  adds: string[];
  /** Severity overrides this profile applies relative to strict (keyed by diagnostic id). */
  severityOverrides: Record<string, SeverityLevel>;
}

function describeRule(rule: LocatorRule): string {
  switch (rule.kind) {
    case 'every-line':
      return 'every non-empty line';
    case 'heading-section':
      return rule.headingPattern ? `sections matching /${rule.headingPattern}/` : 'sections';
    case 'list-item':
      return rule.underHeading ? `list items under /${rule.underHeading}/` : 'list items';
    case 'block':
      return rule.blockPrefix ? `${rule.blockPrefix} blocks` : 'blocks';
    default:
      return rule.kind;
  }
}

function generateLocates(profile: Profile): string {
  const kinds = profile.locator.documentKinds.join(', ');
  if (profile.locator.include.length === 0) {
    return `no regions in ${kinds} files.`;
  }
  const included = profile.locator.include.map(describeRule).join(' and ');
  return `${included} in ${kinds} files.`;
}

/**
 * Compute the diff of `profile` against the `strict` baseline.
 *
 * `strict` diffed against itself yields empty `relaxes`, `adds`, and
 * `severityOverrides`.
 */
export function diffProfile(profile: Profile): ProfileDiff {
  const strict = BUILTIN_PROFILES.strict;
  const relaxes: string[] = [];
  const adds: string[] = [];

  const dialect = profile.dialect;

  if (dialect.keywordCase !== strict.dialect.keywordCase && dialect.keywordCase === 'case-insensitive') {
    relaxes.push('keyword case');
  }
  if (
    dialect.commaAfterLeadingClause !== strict.dialect.commaAfterLeadingClause &&
    dialect.commaAfterLeadingClause === 'optional'
  ) {
    relaxes.push('leading comma');
  }
  if (dialect.allowLiteralSystemName.length > strict.dialect.allowLiteralSystemName.length) {
    relaxes.push(`literal system name (${dialect.allowLiteralSystemName.join(', ')})`);
  }
  if (dialect.allowStoryWrapper && !strict.dialect.allowStoryWrapper) {
    relaxes.push('user-story wrappers');
  }

  if (dialect.allowFrameMetadata && !strict.dialect.allowFrameMetadata) {
    adds.push('frame metadata');
  }
  if (dialect.allowProhibition && !strict.dialect.allowProhibition) {
    adds.push('prohibition (shall not)');
  }
  if (profile.idFormat.pattern && !strict.idFormat.pattern) {
    adds.push(`id format (${profile.idFormat.pattern})`);
  }

  const severityOverrides: Record<string, SeverityLevel> = {};
  for (const [id, level] of Object.entries(profile.severity)) {
    if (strict.severity[id] !== level) {
      severityOverrides[id] = level;
    }
  }

  return {
    name: profile.name,
    locates: generateLocates(profile),
    relaxes,
    adds,
    severityOverrides,
  };
}

/**
 * The diffs of all five built-in profiles against `strict`, in render order
 * (`strict`, `ears-x`, `kiro`, `speckit`, `openspec`).
 */
export function summarizeProfiles(): ProfileDiff[] {
  return BUILTIN_PROFILE_NAMES.map((name) => diffProfile(BUILTIN_PROFILES[name]));
}
