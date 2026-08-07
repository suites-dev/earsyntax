/**
 * Public types for `@earsyntax/extract`.
 *
 * The extractor turns files people actually write (`.ears`, Markdown, YAML,
 * JSON) into the frozen {@link RequirementInput} shape from `@earsyntax/core`.
 * It never lints or parses EARS semantics; that is the job of the core package.
 */

import type { RequirementInput } from '@earsyntax/core';

/**
 * A problem encountered while extracting requirements from a source.
 *
 * Extractors are tolerant: a single malformed item or file does not throw. Each
 * recoverable problem is collected here so callers can report all of them at
 * once. Structural failures (malformed YAML/JSON, wrong top-level shape) also
 * surface as errors rather than exceptions.
 */
export interface ExtractError {
  /** Human-readable explanation of the problem. */
  message: string;
  /** Path of the source file, when known. */
  file?: string;
  /** 1-based line number the problem relates to, when known. */
  line?: number;
}

/**
 * The outcome of extracting requirements from a single source.
 *
 * `items` are in document order. `errors` is empty on a clean extraction.
 */
export interface ExtractResult {
  /** Extracted requirements, in the order they appear in the source. */
  items: RequirementInput[];
  /** Recoverable problems found while extracting. Empty when clean. */
  errors: ExtractError[];
}
