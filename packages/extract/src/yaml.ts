/**
 * YAML extractor.
 *
 * Expects a top-level mapping with a `requirements` sequence:
 *
 * ```yaml
 * requirements:
 *   - id: REQ-001
 *     text: When ...
 * ```
 *
 * Missing ids are tolerated. Malformed YAML, a missing `requirements` key, or a
 * non-string `text` field are reported as {@link ExtractError}s rather than
 * thrown. Source lines are a best-effort lookup of each item's id or text in
 * the raw document.
 */

import jsYaml from 'js-yaml';
import type { RequirementInput } from '@earsyntax/core';
import type { ExtractError, ExtractResult } from './types.js';
import { readRequirementsArray } from './internal.js';
import { LineFinder, stripBom } from './normalize.js';

/**
 * Extract requirements from YAML content.
 *
 * @param rawContent Raw file contents.
 * @param file Optional source path, echoed onto each item and error.
 */
export function extractYaml(rawContent: string, file?: string): ExtractResult {
  const content = stripBom(rawContent);
  const items: RequirementInput[] = [];
  const errors: ExtractError[] = [];

  let parsed: unknown;
  try {
    parsed = jsYaml.load(content);
  } catch (error) {
    if (error instanceof jsYaml.YAMLException) {
      // `@types/js-yaml` types `mark` as always present, but a YAMLException can
      // be constructed without one; read it through an optional-property view so
      // the guard is honest and control-flow does not narrow it away.
      const mark = (error as { mark?: jsYaml.Mark }).mark;
      errors.push({
        message: `Malformed YAML: ${error.reason}`,
        ...(file === undefined ? {} : { file }),
        // `mark.line` is 0-based; present it as a 1-based line number.
        ...(mark ? { line: mark.line + 1 } : {}),
      });
    } else {
      errors.push({
        message: `Malformed YAML: ${error instanceof Error ? error.message : String(error)}`,
        ...(file === undefined ? {} : { file }),
      });
    }
    return { items, errors };
  }

  const requirements = readRequirementsArray(parsed);
  if (requirements === undefined) {
    errors.push({
      message: 'Expected a top-level "requirements" sequence.',
      ...(file === undefined ? {} : { file }),
    });
    return { items, errors };
  }

  const finder = new LineFinder(content);
  for (let index = 0; index < requirements.length; index++) {
    const entry = requirements[index];
    if (typeof entry !== 'object' || entry === null) {
      errors.push({
        message: `requirements[${index}] is not a mapping.`,
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
    items.push(buildInput(id, text.trim(), file, line));
  }

  return { items, errors };
}

function buildInput(
  id: string | undefined,
  text: string,
  file: string | undefined,
  line: number | undefined,
): RequirementInput {
  return {
    ...(id === undefined ? {} : { id }),
    text,
    source: {
      ...(file === undefined ? {} : { file }),
      ...(line === undefined ? {} : { line }),
    },
  };
}
