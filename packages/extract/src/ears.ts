/**
 * `.ears` extractor.
 *
 * Format: one requirement per non-empty line. A line may carry an optional
 * metadata prefix: a bare `REQ-001:` id, or `REQ-001 [source: path:line]:` /
 * `REQ-001 [source: path:line-line]:` with a declared source reference. When a
 * `[source: ...]` reference is present it becomes the item's source location
 * (overriding the physical `.ears` file and line); otherwise the source is the
 * physical file and 1-based line. Lines whose first non-whitespace character is
 * `#` are comments and are ignored. Blank lines are ignored. Order is document
 * order.
 */

import type { RequirementInput } from '@earsyntax/core';
import type { ExtractResult } from './types.js';
import { splitId } from './internal.js';

/**
 * Extract requirements from `.ears` content.
 *
 * @param content Raw file contents.
 * @param file Optional source path, echoed onto each item's source location.
 */
export function extractEars(content: string, file?: string): ExtractResult {
  const items: RequirementInput[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    const line = i + 1;
    const { id, ref, text } = splitId(trimmed);
    const source =
      ref === undefined ? { ...(file === undefined ? {} : { file }), line } : { file: ref.file, line: ref.line };
    items.push({
      ...(id === undefined ? {} : { id }),
      text,
      source,
    });
  }

  return { items, errors: [] };
}
