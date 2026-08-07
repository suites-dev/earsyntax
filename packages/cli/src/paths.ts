/**
 * Path helpers, free of any workspace concept.
 *
 * The host-native CLI resolves user paths against the working directory and, for
 * the `root` envelope field, detects the enclosing repository root by walking up
 * to a `.git` marker. There is no `.earsyntax/` project to discover: these are
 * ordinary filesystem utilities the commands share.
 */

import { existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

/** Resolve a possibly-relative user path against the resolved working directory. */
export function resolveInput(cwd: string, input: string): string {
  return isAbsolute(input) ? input : resolve(cwd, input);
}

/**
 * Convert an absolute path to a `base`-relative POSIX path, or keep it absolute
 * when it falls outside `base`.
 */
export function toRelative(base: string, absPath: string): string {
  const rel = relative(base, absPath);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    return absPath;
  }
  return rel.split(sep).join('/');
}

/**
 * Detect the repository root by walking up from `startDir` to the nearest
 * ancestor containing a `.git` entry. Returns `undefined` when none is found,
 * so callers can omit the optional `root` field rather than inventing one.
 */
export function detectRoot(startDir: string): string | undefined {
  let current = resolve(startDir);
  for (;;) {
    if (existsSync(resolve(current, '.git'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}
