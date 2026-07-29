/**
 * A lean, hand-rolled argument parser.
 *
 * The facade JSON contract is exact and the command set is small, so a tiny
 * parser keeps the output shape under direct control rather than fitting a
 * framework's conventions. It understands `--flag`, `--flag value`,
 * `--flag=value`, and `--no-flag`, and separates positionals from options.
 *
 * Value-taking flags are declared up front so `--flag value` consumes the next
 * token only for those; every other `--flag` is a boolean.
 */

import { usageError } from './errors.js';

/** Flags that take a value (`--flag value` or `--flag=value`). */
const VALUE_FLAGS = new Set([
  'cwd',
  'config',
  'tools',
  'mode',
  'source',
  'prompt',
  'out',
  'by',
  'work',
  'catalog',
  'format',
  'artifact',
  'status',
]);

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

    // `--flag=value` form.
    const eq = body.indexOf('=');
    if (eq !== -1) {
      const name = body.slice(0, eq);
      values.set(name, body.slice(eq + 1));
      continue;
    }

    // `--no-flag` boolean negation.
    if (body.startsWith('no-')) {
      booleans.add(body);
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
  color: boolean;
  interactive: boolean;
  cwd?: string;
  config?: string;
}

/** Extract global options from parsed args. */
export function resolveGlobals(args: ParsedArgs): GlobalOptions {
  return {
    json: args.booleans.has('json'),
    color: !args.booleans.has('no-color'),
    interactive: !args.booleans.has('no-interactive'),
    cwd: args.values.get('cwd'),
    config: args.values.get('config'),
  };
}
