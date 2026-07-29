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
