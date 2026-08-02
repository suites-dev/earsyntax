/**
 * Shared Markdown scanning primitives for `@earsyntax/extract`. Not part of the
 * public API.
 *
 * {@link FenceTracker} is a CommonMark-aware fenced-code-block tracker used by
 * the profile-driven locator to keep fenced-code handling consistent. It
 * records the opening marker's character and length and closes only on a
 * matching-or-longer run of the same character with no info string. A `~~~`
 * fence is never closed by a ``` line, and a ` ``` ` fence is never closed by
 * a shorter run.
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
