/**
 * The context every command handler receives, and the result it returns.
 *
 * Handlers are pure with respect to output: they build a response, a pretty
 * rendering, and an exit code, and hand them back. The dispatcher owns the one
 * write to stdout, which keeps `--json` output pure JSON and `--sarif` output a
 * bare SARIF log.
 */

import type { GlobalOptions, ParsedArgs } from './args.js';
import type { FacadeResponse } from './facade-types.js';
import type { Emitter } from './response.js';

export interface CommandContext {
  args: ParsedArgs;
  global: GlobalOptions;
  /** The resolved working directory (from `--cwd`, else the process cwd). */
  cwd: string;
  /** Carries `json` and the `painter`; handlers use the painter for pretty color but never write. */
  emitter: Emitter;
  /**
   * Optional stdin content injected by programmatic callers. When absent,
   * commands that support `-` read from file descriptor 0 like the real CLI.
   */
  stdin?: string;
}

/** What a command handler returns; the dispatcher performs the single write. */
export interface CommandResult {
  /** The JSON envelope, always built (even in pretty or SARIF mode). */
  response: FacadeResponse;
  /** The human rendering, used when `--json` is off and `raw` is unset. */
  pretty: string;
  /** The process exit code: `0`, `1`, or `2`. */
  exitCode: number;
  /**
   * Raw stdout that replaces the envelope entirely (SARIF). When set, the
   * dispatcher writes it verbatim regardless of `--json` or `pretty`.
   */
  raw?: string;
}

/** A command handler: does its work and returns a {@link CommandResult}. */
export type CommandHandler = (context: CommandContext) => CommandResult;
