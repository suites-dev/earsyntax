/**
 * Markdown extractor.
 *
 * Extracts requirements from three Markdown structures:
 *
 * - bullet lists (`-`, `*`, `+`)
 * - numbered lists (`1.`, `1)`)
 * - GFM pipe tables (`| ID | Requirement |` and single-column requirement
 *   tables)
 *
 * Everything else is ignored: prose paragraphs, headings, and fenced code
 * blocks (both ``` ``` ``` and `~~~`). A metadata prefix inside a bullet, list
 * item, or single-column table cell (`REQ-001:` or
 * `REQ-001 [source: path:line]:`) is lifted into the item's `id`, and a
 * `[source: ...]` reference becomes the item's source location. Tables with an
 * explicit `ID` column take the id from that column instead.
 */

import type { RequirementInput } from '@earsyntax/core';
import type { ExtractResult } from './types.js';
import { splitId, type SourceRef } from './internal.js';

const BULLET = /^\s*[-*+]\s+(.+)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.+)$/;
const SEPARATOR_CELL = /^:?-{1,}:?$/;
const REQUIREMENT_HEADERS = new Set(['requirement', 'requirements', 'text', 'statement']);

interface TableRow {
  line: number;
  cells: string[];
}

/**
 * Extract requirements from Markdown content.
 *
 * @param content Raw file contents.
 * @param file Optional source path, echoed onto each item's source location.
 */
export function extractMarkdown(content: string, file?: string): ExtractResult {
  const items: RequirementInput[] = [];
  const lines = content.split('\n');
  let inFence = false;

  const push = (id: string | undefined, text: string, line: number, ref: SourceRef | undefined): void => {
    const source =
      ref === undefined ? { ...(file === undefined ? {} : { file }), line } : { file: ref.file, line: ref.line };
    items.push({
      ...(id === undefined || id === '' ? {} : { id }),
      text,
      source,
    });
  };

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence;
      i++;
      continue;
    }
    if (inFence || trimmed === '' || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    const bullet = BULLET.exec(raw);
    if (bullet) {
      const { id, ref, text } = splitId(bullet[1]);
      push(id, text, i + 1, ref);
      i++;
      continue;
    }

    const numbered = NUMBERED.exec(raw);
    if (numbered) {
      const { id, ref, text } = splitId(numbered[1]);
      push(id, text, i + 1, ref);
      i++;
      continue;
    }

    if (trimmed.startsWith('|')) {
      const block: TableRow[] = [];
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        block.push({ line: j + 1, cells: splitRow(lines[j].trim()) });
        j++;
      }
      extractTable(block, push);
      i = j;
      continue;
    }

    // Prose paragraph: ignored.
    i++;
  }

  return { items, errors: [] };
}

/**
 * Split a pipe-delimited table row into trimmed cells, dropping the empty
 * segments produced by leading and trailing pipes.
 */
function splitRow(trimmed: string): string[] {
  let body = trimmed;
  if (body.startsWith('|')) {
    body = body.slice(1);
  }
  if (body.endsWith('|')) {
    body = body.slice(0, -1);
  }
  return body.split('|').map((cell) => cell.trim());
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
