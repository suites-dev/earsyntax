/**
 * Shared document normalization for `@earsyntax/extract`. Not part of the public
 * API.
 *
 * Two concerns live here:
 *
 * 1. A single BOM-stripping step so every format extractor (`.ears`, Markdown,
 *    YAML, JSON) sees the same normalized content. Only one leading U+FEFF is
 *    removed; interior BOMs are left untouched.
 * 2. A monotonic {@link LineFinder} that maps a requirement's id or text back to
 *    a 1-based source line for structured formats (YAML, JSON) whose parsers do
 *    not preserve positions. It scans the document once, in document order, from
 *    a cursor that only moves forward, so repeated ids or texts resolve to
 *    successive occurrences instead of always the first, and the whole file is
 *    processed in O(n).
 */

/** The Unicode byte-order mark. */
const BOM = '﻿';

/**
 * Strip a single leading byte-order mark, if present.
 *
 * @param content Raw file contents.
 * @returns The content without a leading BOM.
 */
export function stripBom(content: string): string {
  return content.startsWith(BOM) ? content.slice(1) : content;
}

/**
 * A forward-only locator that resolves a needle (an item's id or text) to its
 * 1-based source line.
 *
 * The finder precomputes each line's start offset once, then remembers the
 * offset just past the last match. Each {@link LineFinder.locate} call searches
 * from that cursor forward, so structured items resolved in document order never
 * collide on an earlier duplicate occurrence. When a needle is not found from
 * the cursor the finder falls back to a search from the document start, so an
 * out-of-order lookup still resolves rather than returning nothing.
 */
export class LineFinder {
  private readonly content: string;
  private readonly lineStarts: number[];
  private cursor = 0;

  /**
   * @param content The raw (BOM-stripped) document the needles come from.
   */
  constructor(content: string) {
    this.content = content;
    this.lineStarts = [0];
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '\n') {
        this.lineStarts.push(i + 1);
      }
    }
  }

  /**
   * Resolve `needle` to its 1-based line, searching forward from the cursor.
   *
   * @param needle The id or text to locate, or `undefined`.
   * @returns The 1-based line, or `undefined` when the needle is absent/empty.
   */
  locate(needle: string | undefined): number | undefined {
    if (!needle) {
      return undefined;
    }
    let index = this.content.indexOf(needle, this.cursor);
    if (index === -1) {
      // Out-of-order lookup: fall back to a full scan without moving the cursor
      // backward, so a later needle is never masked by this miss.
      index = this.content.indexOf(needle);
      if (index === -1) {
        return undefined;
      }
      return this.lineForOffset(index);
    }
    this.cursor = index + needle.length;
    return this.lineForOffset(index);
  }

  /** Map a 0-based offset to its 1-based line via binary search over line starts. */
  private lineForOffset(offset: number): number {
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid] <= offset) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo + 1;
  }
}
