/**
 * JSON extractor.
 *
 * Expects an object with a `requirements` array:
 *
 * ```json
 * { "requirements": [ { "id": "REQ-001", "text": "When ..." } ] }
 * ```
 *
 * Missing ids are tolerated. Malformed JSON, a missing `requirements` array, or
 * a non-string `text` field are reported as {@link ExtractError}s rather than
 * thrown. Source lines are a best-effort lookup of each item's id or text in
 * the raw document.
 */

import type { RequirementInput } from '@earsyntax/core';
import type { ExtractError, ExtractResult } from './types.js';
import { readRequirementsArray } from './internal.js';
import { LineFinder, stripBom } from './normalize.js';

/**
 * Extract requirements from JSON content.
 *
 * @param rawContent Raw file contents.
 * @param file Optional source path, echoed onto each item and error.
 */
export function extractJson(rawContent: string, file?: string): ExtractResult {
  const content = stripBom(rawContent);
  const items: RequirementInput[] = [];
  const errors: ExtractError[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    errors.push({
      message: `Malformed JSON: ${error instanceof Error ? error.message : String(error)}`,
      ...(file === undefined ? {} : { file }),
    });
    return { items, errors };
  }

  const requirements = readRequirementsArray(parsed);
  if (requirements === undefined) {
    errors.push({
      message: 'Expected an object with a "requirements" array.',
      ...(file === undefined ? {} : { file }),
    });
    return { items, errors };
  }

  const finder = new LineFinder(content);
  for (let index = 0; index < requirements.length; index++) {
    const entry = requirements[index];
    if (typeof entry !== 'object' || entry === null) {
      errors.push({
        message: `requirements[${index}] is not an object.`,
        ...(file === undefined ? {} : { file }),
      });
      continue;
    }
    const record = entry as Record<string, unknown>;
    const text = record.text;
    if (typeof text !== 'string' || text.trim() === '') {
      errors.push({
        message: `requirements[${index}] is missing a non-empty string "text".`,
        ...(file === undefined ? {} : { file }),
      });
      continue;
    }
    const id = typeof record.id === 'string' ? record.id : undefined;
    const line = finder.locate(id) ?? finder.locate(text);
    items.push({
      ...(id === undefined ? {} : { id }),
      text: text.trim(),
      source: {
        ...(file === undefined ? {} : { file }),
        ...(line === undefined ? {} : { line }),
      },
    });
  }

  return { items, errors };
}
