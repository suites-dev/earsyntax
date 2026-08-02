/**
 * Compiling stubs for the commands whose bodies land in a later alpha.
 *
 * `instructions`, `init`, `doctor`, `explain`, and `profiles` are part of the
 * closed command surface and appear in help, so the dispatcher routes them and
 * help stays truthful. Their bodies are reimplemented by the host-native
 * command agents; until then each returns a typed not-yet-reimplemented
 * envelope with exit `2`.
 */

import type { CommandContext, CommandHandler, CommandResult } from '../context.js';
import { buildResponse } from '../response.js';

/** Build a handler that reports the command is not yet available in this alpha. */
export function notImplemented(name: string, withMode = false): CommandHandler {
  return (context: CommandContext): CommandResult => {
    const mode = withMode ? context.args.positionals.at(0) : undefined;
    const command = mode ? `${name} ${mode}` : name;
    const message = `The ${command} command arrives in a later alpha of the host-native CLI.`;
    const response = buildResponse({
      command,
      ok: false,
      diagnostics: [{ code: 'cli.not_implemented', severity: 'error', message }],
      next: [],
    });
    return { response, pretty: `error cli.not_implemented: ${message}`, exitCode: 2 };
  };
}
