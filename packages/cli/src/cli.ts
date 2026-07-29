/**
 * The `earsyntax` command dispatcher.
 *
 * A lean hand-rolled entry point: it parses global options, resolves the
 * working directory, builds the output emitter, and routes to one command
 * handler. Handlers emit their own JSON or pretty output and return an exit
 * code. {@link CliError}s are caught here and rendered as a base response.
 *
 * Kept framework-free on purpose: the facade JSON contract is exact, and owning
 * the response shape directly is simpler than bending a CLI framework to it.
 */

import { resolveGlobals, parseArgs } from './args.js';
import { createPainter } from './color.js';
import type { CommandContext, CommandHandler } from './context.js';
import { CliError, usageError } from './errors.js';
import { findRoot, resolveInput } from './project.js';
import { emit, errorResponse } from './response.js';
import { acceptCommand } from './commands/accept.js';
import { doctorCommand } from './commands/doctor.js';
import { initCommand } from './commands/init.js';
import { instructionsCommand } from './commands/instructions.js';
import { listCommand } from './commands/list.js';
import { newCommand } from './commands/new.js';
import { showCommand } from './commands/show.js';
import { statusCommand } from './commands/status.js';
import { validateCommand } from './commands/validate.js';
import { versionCommand } from './commands/version.js';

/** Injection points for tests and the bin wrapper. */
export interface RunOptions {
  cwd?: string;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

const COMMANDS: Record<string, CommandHandler> = {
  init: initCommand,
  doctor: doctorCommand,
  version: versionCommand,
  new: newCommand,
  list: listCommand,
  status: statusCommand,
  instructions: instructionsCommand,
  validate: validateCommand,
  accept: acceptCommand,
  show: showCommand,
};

/** The command label used on responses (instructions carries its mode). */
function commandLabel(command: string, args: ReturnType<typeof parseArgs>): string {
  if (command === 'instructions') {
    const mode = args.positionals[0];
    return mode ? `instructions ${mode}` : 'instructions';
  }
  return command;
}

/**
 * Run the CLI with an argv slice (no node/script prefix). Returns the process
 * exit code. Never calls `process.exit`; the bin wrapper does that.
 */
export function run(argv: string[], options: RunOptions = {}): number {
  const write = options.stdout ?? ((text: string): void => void process.stdout.write(text));
  const baseCwd = options.cwd ?? process.cwd();

  const command = argv.at(0);
  const rest = argv.slice(1);

  // Bare invocation and top-level flags.
  if (command === undefined || command === '--help' || command === '-h') {
    write(`${usageText()}\n`);
    return command === undefined ? 2 : 0;
  }
  if (command === '--version' || command === '-v') {
    return dispatch('version', [], baseCwd, write);
  }

  return dispatch(command, rest, baseCwd, write);
}

function dispatch(
  command: string,
  rest: string[],
  baseCwd: string,
  write: (text: string) => void,
): number {
  const args = parseArgs(rest);
  const global = resolveGlobals(args);
  const cwd = global.cwd ? resolveInput(baseCwd, global.cwd) : baseCwd;
  const emitter = { json: global.json, painter: createPainter(global.color), write };

  const label = commandLabel(command, args);

  try {
    if (!Object.hasOwn(COMMANDS, command)) {
      throw usageError(
        'cli.unknown_command',
        `Unknown command "${command}". Run \`earsyntax --help\`.`,
      );
    }
    const handler = COMMANDS[command];
    const context: CommandContext = { args, global, cwd, emitter };
    return handler(context);
  } catch (error) {
    const cliError =
      error instanceof CliError
        ? error
        : new CliError(2, {
            code: 'cli.internal_error',
            severity: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
    const response = errorResponse(label, findRoot(cwd), cliError);
    const pretty = `error ${cliError.diagnostic.code}: ${cliError.diagnostic.message}`;
    emit(emitter, response, pretty);
    return cliError.exitCode;
  }
}

function usageText(): string {
  return [
    'earsyntax <command> [options]',
    '',
    'Commands:',
    '  init          Initialize .earsyntax/ and optional agent wrappers',
    '  doctor        Read-only project health report',
    '  version       Version and feature discovery',
    '  new           Create a work item for a source spec or prompt',
    '  list          List work items',
    '  status        Show one work item state and next steps',
    '  instructions  Return the rules an agent follows for a step',
    '  validate      Validate .ears files and emit diagnostics',
    '  accept        Mark a valid .ears artifact as human-accepted',
    '  show          Show resolved artifact paths or content',
    '',
    'Global options: --json --no-color --cwd <path> --config <path> --no-interactive',
  ].join('\n');
}
