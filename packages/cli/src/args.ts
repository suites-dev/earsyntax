/**
 * A lean, hand-rolled argument parser.
 *
 * The facade JSON contract is exact and the command set is closed, so a tiny
 * parser keeps the output shape under direct control rather than fitting a
 * framework's conventions. It understands `--flag`, `--flag value`,
 * `--flag=value`, and `--` (end of flags), and separates positionals from
 * options.
 *
 * Value-taking flags are declared up front so `--flag value` consumes the next
 * token only for those; every other `--flag` is a boolean. A repeated value
 * flag takes the last value; a repeated boolean stays set.
 */

import { usageError } from './errors.js';

/** Flags that take a value (`--flag value` or `--flag=value`), across all commands. */
const VALUE_FLAGS = new Set(['cwd', 'profile', 'file', 'from', 'agent', 'host', 'tools']);

/** The parsed result: positionals plus a flat flag map. */
export interface ParsedArgs {
  positionals: string[];
  booleans: Set<string>;
  values: Map<string, string>;
}

/** Parse an argv slice (without the command name) into {@link ParsedArgs}. */
export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const booleans = new Set<string>();
  const values = new Map<string, string>();

  for (let i = 0; i < argv.length; i++) {
    const token = argv.at(i);
    if (token === undefined) {
      continue;
    }
    if (token === '--') {
      // Everything after `--` is a positional.
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const body = token.slice(2);
    if (body === '') {
      continue;
    }

    // `--flag=value` form. Last assignment wins for a repeated flag.
    const eq = body.indexOf('=');
    if (eq !== -1) {
      values.set(body.slice(0, eq), body.slice(eq + 1));
      continue;
    }

    // `--flag value` for known value flags; otherwise a boolean.
    if (VALUE_FLAGS.has(body)) {
      const next = argv.at(i + 1);
      if (next === undefined || (next.startsWith('--') && next !== '--')) {
        throw usageError('cli.missing_value', `Option --${body} requires a value.`);
      }
      values.set(body, next);
      i += 1;
      continue;
    }

    booleans.add(body);
  }

  return { positionals, booleans, values };
}

/** Resolved global options shared by every command. */
export interface GlobalOptions {
  json: boolean;
  sarif: boolean;
  strict: boolean;
  quiet: boolean;
  /** The active profile name; defaults to `strict`. Commands validate it against the registry. */
  profile: string;
  cwd?: string;
  /** Whether pretty output may use ANSI color. Set by the dispatcher, not a user flag. */
  color: boolean;
}

/** Extract global options from parsed args. `color` is supplied by the dispatcher. */
export function resolveGlobals(args: ParsedArgs, color: boolean): GlobalOptions {
  return {
    json: args.booleans.has('json'),
    sarif: args.booleans.has('sarif'),
    strict: args.booleans.has('strict'),
    quiet: args.booleans.has('quiet'),
    profile: args.values.get('profile') ?? 'strict',
    cwd: args.values.get('cwd'),
    color,
  };
}
