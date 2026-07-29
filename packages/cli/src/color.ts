/**
 * Minimal ANSI color helpers.
 *
 * Color is applied only when enabled (the `--no-color` global turns it off), so
 * stripping ANSI is a matter of not emitting it in the first place. Pretty
 * output is the only consumer; JSON output never carries color.
 */

const ESC = '';

const CODES = {
  reset: `${ESC}[0m`,
  bold: `${ESC}[1m`,
  dim: `${ESC}[2m`,
  red: `${ESC}[31m`,
  green: `${ESC}[32m`,
  yellow: `${ESC}[33m`,
  cyan: `${ESC}[36m`,
} as const;

type ColorName = keyof typeof CODES;

/** A colorizer bound to whether color is enabled. */
export interface Painter {
  paint(name: ColorName, text: string): string;
}

/** Build a {@link Painter}. When `enabled` is false every call returns the text unchanged. */
export function createPainter(enabled: boolean): Painter {
  return {
    paint(name, text) {
      if (!enabled) {
        return text;
      }
      return `${CODES[name]}${text}${CODES.reset}`;
    },
  };
}