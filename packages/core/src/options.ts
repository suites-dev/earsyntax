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

import type { DialectOptions, Mode, Options } from './types.js';

/**
 * The default vague terms flagged in responses when the caller supplies none.
 *
 * Ported verbatim from the Go reference default vague-term list.
 */
export const DEFAULT_VAGUE_TERMS: readonly string[] = ['appropriate', 'sufficient', 'as needed'];

/** The default linting mode when none is supplied. */
export const DEFAULT_MODE: Mode = 'strict';

/**
 * A fully resolved dialect with every tolerance decided.
 *
 * The parser and linter branch only on these fields, never on a profile name.
 * See `docs/contracts/profile.md` ("dialect") for the semantics of each knob.
 */
export interface ResolvedDialect {
  /** Whether EARS keywords must match canonical casing or any casing is accepted. */
  keywordCase: 'strict' | 'case-insensitive';
  /** Literal system phrases accepted in place of the canonical `the <system>` form. */
  allowLiteralSystemName: string[];
  /** Whether a leading clause must be comma-delimited from the main clause. */
  commaAfterLeadingClause: 'required' | 'optional';
  /** Whether user-story frame lines are treated as skippable frame content. */
  allowStoryWrapper: boolean;
  /** Whether `REQ-###` ids and `[source: path:line]` tags are accepted as frame metadata. */
  allowFrameMetadata: boolean;
  /** Whether `shall not` is accepted as a prohibition kind. */
  allowProhibition: boolean;
}

/**
 * The canonical strict dialect: Mavin's ruleset with nothing relaxed.
 *
 * This is the default dialect for {@link withDefaults}, so `lintEars` and
 * `parseEars` apply the strict tightenings (keyword casing, a required leading
 * comma, no prohibition, no frame metadata, no story wrapper) unless a caller
 * passes a relaxing {@link DialectOptions} block.
 */
export const STRICT_DIALECT: ResolvedDialect = {
  keywordCase: 'strict',
  allowLiteralSystemName: [],
  commaAfterLeadingClause: 'required',
  allowStoryWrapper: false,
  allowFrameMetadata: false,
  allowProhibition: false,
};

/**
 * Merge a partial {@link DialectOptions} block over {@link STRICT_DIALECT}.
 *
 * Every absent field takes its strict default, so an omitted `dialect` yields
 * the fully strict dialect. Arrays are copied so the resolved dialect never
 * aliases the caller's input.
 *
 * @param options The caller-supplied options, or `undefined`.
 * @returns A resolved dialect with every tolerance decided.
 */
export function resolveDialect(options?: Options): ResolvedDialect {
  const dialect: DialectOptions | undefined = options?.dialect;
  return {
    keywordCase: dialect?.keywordCase ?? STRICT_DIALECT.keywordCase,
    allowLiteralSystemName: dialect?.allowLiteralSystemName
      ? [...dialect.allowLiteralSystemName]
      : [],
    commaAfterLeadingClause:
      dialect?.commaAfterLeadingClause ?? STRICT_DIALECT.commaAfterLeadingClause,
    allowStoryWrapper: dialect?.allowStoryWrapper ?? STRICT_DIALECT.allowStoryWrapper,
    allowFrameMetadata: dialect?.allowFrameMetadata ?? STRICT_DIALECT.allowFrameMetadata,
    allowProhibition: dialect?.allowProhibition ?? STRICT_DIALECT.allowProhibition,
  };
}

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
  /** The resolved dialect tolerances applied while parsing and linting. */
  dialect: ResolvedDialect;
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
    dialect: resolveDialect(options),
  };
}
