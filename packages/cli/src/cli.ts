/**
 * The `earsyntax` command dispatcher.
 *
 * A lean hand-rolled entry point: it validates flags against the closed command
 * surface, resolves global options and the working directory, routes to one
 * command handler, and performs the single write to stdout. Handlers return a
 * {@link CommandResult}; the dispatcher decides between JSON, pretty, and raw
 * SARIF output so `--json` stdout stays pure JSON.
 *
 * The surface is the eight facade commands and nothing else. There is no
 * `new`/`list`/`status`/`show`/`accept`/`check`; the workspace is gone.
 */

import process from 'node:process';
import { parseArgs, resolveGlobals, type ParsedArgs } from './args.js';
import { createPainter } from './color.js';
import type { CommandContext, CommandHandler } from './context.js';
import { CliError, usageError } from './errors.js';
import { resolveInput } from './paths.js';
import { emitResult, errorResponse } from './response.js';
import { doctorCommand } from './commands/doctor.js';
import { explainCommand } from './commands/explain.js';
import { extractCommand } from './commands/extract.js';
import { initCommand } from './commands/init.js';
import { instructionsCommand } from './commands/instructions.js';
import { profilesCommand } from './commands/profiles.js';
import { validateCommand } from './commands/validate.js';
import { versionCommand } from './commands/version.js';

/** Injection points for tests and the bin wrapper. */
export interface RunOptions {
  cwd?: string;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

/** A routed command: its handler and the flags it accepts beyond the universal set. */
interface CommandSpec {
  handler: CommandHandler;
  flags: readonly string[];
}

/** Flags valid on every command. */
const UNIVERSAL_FLAGS = ['json', 'quiet', 'cwd'] as const;

const COMMANDS: Record<string, CommandSpec> = {
  validate: { handler: validateCommand, flags: ['profile', 'strict', 'sarif'] },
  extract: { handler: extractCommand, flags: ['profile'] },
  instructions: { handler: instructionsCommand, flags: ['profile', 'strict', 'file', 'from'] },
  explain: { handler: explainCommand, flags: [] },
  profiles: { handler: profilesCommand, flags: [] },
  doctor: { handler: doctorCommand, flags: [] },
  init: { handler: initCommand, flags: ['agent', 'host', 'tools'] },
  version: { handler: versionCommand, flags: ['features'] },
};

/** Every flag the surface understands, for distinguishing "unknown" from "not here". */
const KNOWN_FLAGS = new Set<string>([
  ...UNIVERSAL_FLAGS,
  ...Object.values(COMMANDS).flatMap((spec) => spec.flags),
]);

/** The command label used on responses (instructions carries its mode). */
function commandLabel(command: string, positionals: string[]): string {
  if (command === 'instructions' && positionals.length > 0) {
    return `instructions ${positionals[0]}`;
  }
  return command;
}

/** Reject any flag not valid for this command, distinguishing unknown from misplaced. */
function checkFlags(command: string, spec: CommandSpec, args: ParsedArgs): void {
  const allowed = new Set<string>([...UNIVERSAL_FLAGS, ...spec.flags]);
  const provided = [...args.booleans, ...args.values.keys()];
  for (const name of provided) {
    if (allowed.has(name)) {
      continue;
    }
    if (KNOWN_FLAGS.has(name)) {
      throw usageError(
        'cli.flag_not_allowed',
        `The --${name} flag is not valid for the ${command} command.`,
      );
    }
    throw usageError('cli.unknown_flag', `Unknown option --${name}. Run \`earsyntax --help\`.`);
  }
}

/**
 * Run the CLI with an argv slice (no node/script prefix). Returns the process
 * exit code. Never calls `process.exit`; the bin wrapper does that.
 */
export function run(argv: string[], options: RunOptions = {}): number {
  const write = options.stdout ?? ((text: string): void => void process.stdout.write(text));
  const baseCwd = options.cwd ?? process.cwd();
  // Color only when writing to a real terminal; injected stdout (tests) stays plain.
  const color = options.stdout === undefined && process.stdout.isTTY;

  const command = argv.at(0);
  const rest = argv.slice(1);

  if (command === undefined || command === '--help' || command === '-h') {
    write(`${usageText()}\n`);
    return command === undefined ? 2 : 0;
  }
  if (command === '--version' || command === '-v') {
    return dispatch('version', [], baseCwd, color, write);
  }

  return dispatch(command, rest, baseCwd, color, write);
}

function dispatch(
  command: string,
  rest: string[],
  baseCwd: string,
  color: boolean,
  write: (text: string) => void,
): number {
  const emitter = { json: rest.includes('--json'), painter: createPainter(color), write };

  try {
    if (!Object.hasOwn(COMMANDS, command)) {
      throw usageError(
        'cli.unknown_command',
        `Unknown command "${command}". Run \`earsyntax --help\`.`,
      );
    }
    const spec = COMMANDS[command];
    const args = parseArgs(rest);
    checkFlags(command, spec, args);

    const global = resolveGlobals(args, color);
    if (global.json && global.sarif) {
      throw usageError('cli.exclusive_flags', 'The --json and --sarif flags are mutually exclusive.');
    }

    const cwd = global.cwd ? resolveInput(baseCwd, global.cwd) : baseCwd;
    const context: CommandContext = { args, global, cwd, emitter };
    const result = spec.handler(context);
    emitResult(emitter, result.response, result.pretty, result.raw);
    return result.exitCode;
  } catch (error) {
    const cliError =
      error instanceof CliError
        ? error
        : new CliError(2, {
            code: 'cli.internal_error',
            severity: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
    const label = commandLabel(command, parsePositionalsSafely(rest));
    const response = errorResponse(label, undefined, cliError);
    const pretty = `error ${cliError.diagnostic.code}: ${cliError.diagnostic.message}`;
    emitResult(emitter, response, pretty);
    return cliError.exitCode;
  }
}

/** Best-effort positional extraction for the error label; never throws. */
function parsePositionalsSafely(rest: string[]): string[] {
  const positionals: string[] = [];
  for (const token of rest) {
    if (token === '--') {
      break;
    }
    if (!token.startsWith('--')) {
      positionals.push(token);
    }
  }
  return positionals;
}

function usageText(): string {
  return [
    'earsyntax <command> [options]',
    '',
    'Commands:',
    '  validate       Validate EARS in host files and emit findings',
    '  extract        Print the requirement candidates a profile locates',
    '  instructions   Return the rules an agent follows for one loop step',
    '  explain        Explain one diagnostic id',
    '  profiles       List the built-in profiles',
    '  doctor         Detect hosts and agents and recommend commands',
    '  init           Render managed agent-wrapper and host-integration files',
    '  version        Version and feature discovery',
    '',
    'Global options: --profile <name> --json --sarif (validate only) --strict --quiet --cwd <dir>',
  ].join('\n');
}
