/**
 * Option defaulting for `@earsyntax/core`.
 *
 * The public {@link Options} shape is fully optional; every function in the core
 * API resolves it into a complete {@link ResolvedOptions} before running. This
 * module owns that single defaulting step so `lintEars`, `lintEarsBatch`,
 * `parseEars`, and `lintCatalogCoverage` all apply identical defaults.
 *
 * Defaults follow the Go reference `withDefaults` (`ears-lint-go/api.go`):
 * strict mode, commas are not treated as `and`, and the vague-term list is
 * `appropriate`, `sufficient`, `as needed`. An explicitly empty `vagueTerms`
 * array falls back to the defaults, matching the Go behavior.
 *
 * Determinism note: no dependencies, no clock, no file system, no network.
 */

import type { Mode, Options } from './types.js';

/**
 * The default vague terms flagged in responses when the caller supplies none.
 *
 * Ported verbatim from the Go reference default vague-term list.
 */
export const DEFAULT_VAGUE_TERMS: readonly string[] = ['appropriate', 'sufficient', 'as needed'];

/** The default linting mode when none is supplied. */
export const DEFAULT_MODE: Mode = 'strict';

/**
 * A fully resolved option set with every field present.
 *
 * The core pipeline works against this shape so it never has to re-check for
 * absent option fields.
 */
export interface ResolvedOptions {
  /** Linting strictness. */
  mode: Mode;
  /** Whether unambiguous commas inside clause bodies are treated as `and`. */
  commaAsAnd: boolean;
  /** Terms flagged as vague when they appear in a response. */
  vagueTerms: string[];
}

/**
 * Resolve a partial {@link Options} into a complete {@link ResolvedOptions}.
 *
 * Applies the core defaults: `mode` defaults to `strict`, `commaAsAnd` defaults
 * to `false`, and `vagueTerms` defaults to {@link DEFAULT_VAGUE_TERMS} when the
 * caller supplies no terms (or an empty array).
 *
 * @param options The caller-supplied options, or `undefined`.
 * @returns A resolved option set with every field present.
 */
export function withDefaults(options?: Options): ResolvedOptions {
  const vagueTerms =
    options?.vagueTerms && options.vagueTerms.length > 0
      ? [...options.vagueTerms]
      : [...DEFAULT_VAGUE_TERMS];
  return {
    mode: options?.mode ?? DEFAULT_MODE,
    commaAsAnd: options?.commaAsAnd ?? false,
    vagueTerms,
  };
}
