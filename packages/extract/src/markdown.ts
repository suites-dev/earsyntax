/**
 * Markdown extractor (legacy, non-profile surface).
 *
 * Extracts requirements from three Markdown structures:
 *
 * - bullet lists (`-`, `*`, `+`), including indented continuation lines
 * - numbered lists (`1.`, `1)`), including indented continuation lines
 * - GFM pipe tables (`| ID | Requirement |` and single-column requirement
 *   tables), with or without leading and trailing pipes
 *
 * Everything else is ignored: prose paragraphs, headings, and fenced code blocks
 * (both ` ``` ` and `~~~`, tracked by opening marker character and length). A
 * metadata prefix inside a bullet, list item, or single-column table cell
 * (`REQ-001:` or `REQ-001 [source: path:line]:`) is lifted into the item's `id`,
 * and a `[source: ...]` reference becomes the item's source location. Tables with
 * an explicit `ID` column take the id from that column instead.
 *
 * This is the non-profile extraction surface consumed by callers that want every
 * list item and table row. The profile-driven host-native locator lives in
 * `./locator.ts` and does not do table extraction (see `docs/input-formats.md`).
 */

import type { RequirementInput } from '@earsyntax/core';
import type { ExtractResult } from './types.js';
import { splitId, type SourceRef } from './internal.js';
import { classifyFences, splitTableRow } from './markdown-scan.js';
import { stripBom } from './normalize.js';

const BULLET = /^(\s*)[-*+](\s+)(.+)$/;
const NUMBERED = /^(\s*)\d+[.)](\s+)(.+)$/;
const SEPARATOR_CELL = /^:?-{1,}:?$/;
const REQUIREMENT_HEADERS = new Set(['requirement', 'requirements', 'text', 'statement']);

interface TableRow {
  line: number;
  cells: string[];
}

/**
 * Extract requirements from Markdown content.
 *
 * @param rawContent Raw file contents.
 * @param file Optional source path, echoed onto each item's source location.
 */
export function extractMarkdown(rawContent: string, file?: string): ExtractResult {
  const items: RequirementInput[] = [];
  const lines = stripBom(rawContent).split('\n');
  const fenceStates = classifyFences(lines);

  const push = (
    id: string | undefined,
    text: string,
    line: number,
    ref: SourceRef | undefined,
  ): void => {
    const source =
      ref === undefined
        ? { ...(file === undefined ? {} : { file }), line }
        : { file: ref.file, line: ref.line };
    items.push({
      ...(id === undefined || id === '' ? {} : { id }),
      text,
      source,
    });
  };

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    if (fenceStates[i] !== 'outside') {
      // A fence delimiter or a fenced-code line: never a requirement.
      i++;
      continue;
    }

    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    const bullet = BULLET.exec(raw);
    if (bullet) {
      const { text: itemText, next } = gatherListItem(lines, fenceStates, i, bullet[1].length);
      const { id, ref, text } = splitId(itemText);
      push(id, text, i + 1, ref);
      i = next;
      continue;
    }

    const numbered = NUMBERED.exec(raw);
    if (numbered) {
      const { text: itemText, next } = gatherListItem(lines, fenceStates, i, numbered[1].length);
      const { id, ref, text } = splitId(itemText);
      push(id, text, i + 1, ref);
      i = next;
      continue;
    }

    if (trimmed.includes('|')) {
      const block: TableRow[] = [];
      let j = i;
      while (j < lines.length && fenceStates[j] === 'outside') {
        const rowTrimmed = lines[j].trim();
        if (!rowTrimmed.includes('|') || rowTrimmed.startsWith('#') || rowTrimmed === '') {
          break;
        }
        block.push({ line: j + 1, cells: splitTableRow(rowTrimmed) });
        j++;
      }
      if (block.length >= 2) {
        extractTable(block, push);
        i = j;
        continue;
      }
      // Not a table (single pipe line): treat as prose and skip just this line.
      i++;
      continue;
    }

    // Prose paragraph: ignored.
    i++;
  }

  return { items, errors: [] };
}

/**
 * Gather a list item's text starting at `start`, absorbing indented continuation
 * lines that are more indented than the marker and are not themselves a new list
 * item, heading, blank line, or fenced-code delimiter. Continuation lines are
 * joined to the first line with single spaces.
 *
 * @returns The joined item text and the index of the first unconsumed line.
 */
function gatherListItem(
  lines: string[],
  fenceStates: readonly string[],
  start: number,
  markerIndent: number,
): { text: string; next: number } {
  const first = lines[start];
  const firstBody = (BULLET.exec(first) ?? NUMBERED.exec(first))?.[3] ?? first.trim();
  const parts = [firstBody.trim()];

  let j = start + 1;
  while (j < lines.length) {
    const line = lines[j];
    if (line.trim() === '' || fenceStates[j] !== 'outside') {
      break;
    }
    const indent = line.length - line.trimStart().length;
    if (indent <= markerIndent) {
      break;
    }
    if (BULLET.test(line) || NUMBERED.test(line) || line.trim().startsWith('#')) {
      break;
    }
    parts.push(line.trim());
    j++;
  }

  return { text: parts.join(' '), next: j };
}

/**
 * Turn a contiguous block of pipe rows into requirements. A valid table needs a
 * separator row (`| --- |`) with a header row directly above it; anything else
 * is ignored.
 */
function extractTable(
  block: TableRow[],
  push: (id: string | undefined, text: string, line: number, ref: SourceRef | undefined) => void,
): void {
  if (block.length < 2) {
    return;
  }
  const separatorIndex = block.findIndex(
    (row) => row.cells.length > 0 && row.cells.every((cell) => SEPARATOR_CELL.test(cell)),
  );
  if (separatorIndex < 1) {
    return;
  }

  const header = block[separatorIndex - 1].cells.map((cell) => cell.toLowerCase());
  const idColumn = header.indexOf('id');
  let requirementColumn = header.findIndex((cell) => REQUIREMENT_HEADERS.has(cell));
  if (requirementColumn === -1) {
    if (header.length === 1) {
      requirementColumn = 0;
    } else {
      requirementColumn = idColumn === header.length - 1 ? header.length - 2 : header.length - 1;
    }
  }

  for (const row of block.slice(separatorIndex + 1)) {
    const rawText = (row.cells[requirementColumn] ?? '').trim();
    if (idColumn >= 0) {
      if (rawText === '') {
        continue;
      }
      const id = (row.cells[idColumn] ?? '').trim();
      push(id, rawText, row.line, undefined);
    } else {
      const { id, ref, text } = splitId(rawText);
      if (text === '') {
        continue;
      }
      push(id, text, row.line, ref);
    }
  }
}
