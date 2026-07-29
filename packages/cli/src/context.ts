/**
 * The context object every command handler receives.
 *
 * It bundles the parsed arguments, resolved global options, the resolved
 * working directory, and the output emitter. Command handlers read their inputs
 * from here and return an exit code after emitting their response.
 */

import type { GlobalOptions, ParsedArgs } from './args.js';
import type { Emitter } from './response.js';

export interface CommandContext {
  args: ParsedArgs;
  global: GlobalOptions;
  /** The resolved working directory (from `--cwd`, else the process cwd). */
  cwd: string;
  emitter: Emitter;
}

/** A command handler: does its work, emits output, and returns an exit code. */
export type CommandHandler = (context: CommandContext) => number;