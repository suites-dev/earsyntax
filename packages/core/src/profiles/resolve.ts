/**
 * Profile resolution for `@earsyntax/core`.
 *
 * `resolveProfile` maps a `--profile` name to a built-in profile or a typed
 * unknown-profile error. The error feeds the CLI's exit `2` path (see the
 * facade contract); this function never throws.
 *
 * Determinism note: pure lookup over {@link BUILTIN_PROFILES}. No clock, file
 * system, or network.
 */

import { BUILTIN_PROFILES, BUILTIN_PROFILE_NAMES } from './builtins.js';
import type { Profile, ProfileName } from './schema.js';

/** The reason a name did not resolve to a built-in profile. */
export interface UnknownProfileError {
  code: 'unknown-profile';
  /** The name the caller passed. */
  name: string;
  /** The available built-in names, for a helpful message. */
  available: readonly ProfileName[];
  /** Human-readable explanation. */
  message: string;
}

/** The outcome of {@link resolveProfile}. */
export type ResolveProfileResult =
  | { ok: true; profile: Profile }
  | { ok: false; error: UnknownProfileError };

function isProfileName(name: string): name is ProfileName {
  return (BUILTIN_PROFILE_NAMES as readonly string[]).includes(name);
}

/**
 * Resolve a profile name to its built-in profile.
 *
 * @param name The `--profile` value (defaults to `strict` at the CLI layer, not
 *   here).
 * @returns The built-in profile, or a typed unknown-profile error.
 */
export function resolveProfile(name: string): ResolveProfileResult {
  if (isProfileName(name)) {
    return { ok: true, profile: BUILTIN_PROFILES[name] };
  }
  return {
    ok: false,
    error: {
      code: 'unknown-profile',
      name,
      available: BUILTIN_PROFILE_NAMES,
      message: `Unknown profile '${name}'. Available profiles: ${BUILTIN_PROFILE_NAMES.join(', ')}.`,
    },
  };
}
