/**
 * Shared Markdown scanning primitives for `@earsyntax/extract`. Not part of the
 * public API.
 *
 * Two structures are shared by the legacy Markdown extractor and the
 * profile-driven locator so fenced-code and table handling stay consistent:
 *
 * 1. {@link FenceTracker}, a CommonMark-aware fenced-code-block tracker that
 *    records the opening marker's character and length and closes only on a
 *    matching-or-longer run of the same character with no info string. A `~~~`
 *    fence is never closed by a ``` line, and a ` ``` ` fence is never closed by
 *    a shorter run.
 * 2. {@link splitTableRow}, a GFM pipe-row splitter that ignores escaped pipes
 *    (`\|`) and pipes inside inline code spans (`` `a | b` ``), and tolerates
 *    rows with or without leading and trailing pipes.
 */

/** Where a line sits relative to fenced code blocks. */
export type FenceState = 'outside' | 'open' | 'inside' | 'close';

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * Tracks fenced code blocks across a document, one line at a time.
 *
 * Feed every line in order. The tracker is stateful and must see lines in
 * document order. `outside` lines are ordinary content; `open` and `close` lines
 * are the fence delimiters themselves; `inside` lines are fenced code.
 */
export class FenceTracker {
  private open: { char: string; len: number } | null = null;

  /**
   * Classify the next line and advance the fence state.
   *
   * @param line The raw line (without its trailing newline).
   * @returns The line's position relative to fenced code.
   */
  feed(line: string): FenceState {
    if (this.open === null) {
      const match = FENCE_OPEN.exec(line);
      if (match) {
        const marker = match[1];
        const char = marker.startsWith('`') ? '`' : '~';
        // A backtick info string must not contain a backtick; a run that does is
        // not a valid opening fence, so treat it as ordinary content.
        if (char === '`' && match[2].includes('`')) {
          return 'outside';
        }
        this.open = { char, len: marker.length };
        return 'open';
      }
      return 'outside';
    }

    // Inside a fence: only a bare run of the same character, at least as long as
    // the opener and carrying no info string, closes it.
    const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
    if (close) {
      const closeChar = close[1].startsWith('`') ? '`' : '~';
      if (closeChar === this.open.char && close[1].length >= this.open.len) {
        this.open = null;
        return 'close';
      }
    }
    return 'inside';
  }

  /** Whether the tracker is currently inside an unclosed fence. */
  get isOpen(): boolean {
    return this.open !== null;
  }
}

/**
 * Classify every line's fence position in a single forward pass.
 *
 * Returns one {@link FenceState} per input line so callers can read a line's
 * fence position by index without re-feeding a stateful tracker (which would
 * corrupt the state on any line inspected more than once).
 *
 * @param lines The document split into lines, in order.
 * @returns A parallel array of fence states, one per line.
 */
export function classifyFences(lines: readonly string[]): FenceState[] {
  const tracker = new FenceTracker();
  return lines.map((line) => tracker.feed(line));
}

/**
 * Split a GFM pipe-table row into trimmed cells.
 *
 * Pipes escaped as `\|` and pipes inside inline code spans are not treated as
 * cell separators. A single leading and a single trailing pipe (the common GFM
 * form) are dropped; rows without them are still split correctly.
 *
 * @param row The trimmed row text.
 * @returns The row's cells, trimmed, in order.
 */
export function splitTableRow(row: string): string[] {
  const cells: string[] = [];
  let current = '';
  let codeRun = 0; // length of the backtick run that opened the current code span
  let i = 0;

  while (i < row.length) {
    const ch = row[i];

    if (ch === '\\' && codeRun === 0 && i + 1 < row.length) {
      // A backslash escape outside code spans: keep the escaped character whole
      // so an escaped pipe never splits the cell.
      current += ch + row[i + 1];
      i += 2;
      continue;
    }

    if (ch === '`') {
      let run = 0;
      while (i + run < row.length && row[i + run] === '`') {
        run++;
      }
      if (codeRun === 0) {
        codeRun = run;
      } else if (run === codeRun) {
        codeRun = 0;
      }
      current += '`'.repeat(run);
      i += run;
      continue;
    }

    if (ch === '|' && codeRun === 0) {
      cells.push(current);
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }
  cells.push(current);

  if (cells.length > 0 && cells[0].trim() === '' && row.startsWith('|')) {
    cells.shift();
  }
  if (cells.length > 0 && cells[cells.length - 1].trim() === '' && row.endsWith('|')) {
    cells.pop();
  }
  return cells.map((cell) => cell.trim());
}
