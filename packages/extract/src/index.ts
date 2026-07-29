/**
 * `@earsyntax/extract` public API surface.
 *
 * Turns files people author (`.ears`, Markdown, YAML, JSON) into the frozen
 * {@link RequirementInput} shape from `@earsyntax/core`. Every parser is a pure
 * function of its input string; only {@link extractFromFile} touches the disk.
 *
 * This package never lints or parses EARS semantics and has no dependency on
 * the core parser internals; it imports types only.
 */

export type { ExtractError, ExtractResult } from './types.js';

export { extractEars } from './ears.js';
export { extractMarkdown } from './markdown.js';
export { extractYaml } from './yaml.js';
export { extractJson } from './json.js';
export { extractFromContent, extractFromFile } from './dispatch.js';
