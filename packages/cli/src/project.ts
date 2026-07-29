/**
 * Project resolution, config, and path helpers.
 *
 * The project root is the directory containing `.earsyntax/`, discovered by
 * walking up from the resolved cwd. Paths in facade JSON are relative to this
 * root (POSIX separators) unless the caller supplied an absolute path.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { usageError } from './errors.js';

/** The Earsyntax project config stored at `.earsyntax/config.json`. */
export interface EarsyntaxConfig {
  version: number;
  /** Work directory relative to the root, for example `.earsyntax/work`. */
  workDir: string;
  /** Tool wrappers written at init time. */
  tools: string[];
}

/** The default config `init` writes. */
export function defaultConfig(tools: string[]): EarsyntaxConfig {
  return { version: 1, workDir: '.earsyntax/work', tools };
}

/** The absolute path to the `.earsyntax` directory for a given root. */
export function earsyntaxDir(root: string): string {
  return resolve(root, '.earsyntax');
}

/** Find the project root by walking up from `startDir` looking for `.earsyntax/`. */
export function findRoot(startDir: string): string | undefined {
  let current = resolve(startDir);
  for (;;) {
    if (existsSync(earsyntaxDir(current))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

/** Resolve the project root or throw a usage error if the project is not initialized. */
export function requireRoot(cwd: string): string {
  const root = findRoot(cwd);
  if (root === undefined) {
    throw usageError(
      'project.not_initialized',
      'No .earsyntax project found. Run `earsyntax init` first.',
    );
  }
  return root;
}

/** Load config from an explicit path or the project's `.earsyntax/config.json`. */
export function loadConfig(root: string, explicitPath?: string): EarsyntaxConfig {
  const path = explicitPath
    ? resolve(root, explicitPath)
    : resolve(earsyntaxDir(root), 'config.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw usageError('config.unreadable', `Could not read config at ${path}.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw usageError('config.invalid', `Config at ${path} is not valid JSON.`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw usageError('config.invalid', `Config at ${path} is not a JSON object.`);
  }
  const obj = parsed as Partial<EarsyntaxConfig>;
  return {
    version: typeof obj.version === 'number' ? obj.version : 1,
    workDir: typeof obj.workDir === 'string' ? obj.workDir : '.earsyntax/work',
    tools: Array.isArray(obj.tools)
      ? obj.tools.filter((t): t is string => typeof t === 'string')
      : [],
  };
}

/** Convert an absolute path to a root-relative POSIX path, or keep it absolute if outside the root. */
export function toRelative(root: string, absPath: string): string {
  const rel = relative(root, absPath);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    return absPath;
  }
  return rel.split(sep).join('/');
}

/** Resolve a possibly-relative user path against the resolved cwd. */
export function resolveInput(cwd: string, input: string): string {
  return isAbsolute(input) ? input : resolve(cwd, input);
}
