import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Shared helpers for the conformance smoke suite.
 *
 * Every helper spawns the real built binary through `node packages/cli/bin/run.js`
 * so the tests exercise exactly what a published install would run. No command
 * module is imported here: the only contract under test is the process boundary
 * (argv in, exit code and stdout out).
 */

/** Absolute path to the repo root, resolved from this file's location. */
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Absolute path to the CLI entrypoint the published `earsyntax` bin points at. */
export const CLI_BIN = fileURLToPath(new URL('../../packages/cli/bin/run.js', import.meta.url));

/** Result of one CLI invocation. */
export interface CliResult {
  /** Process exit code. `null` only if the process was killed by a signal. */
  code: number | null;
  /** Captured stdout. */
  stdout: string;
  /** Captured stderr. */
  stderr: string;
}

/** Options for a single CLI invocation. */
export interface RunOptions {
  /** Data piped to the process stdin (for `validate -` and other stdin routes). */
  input?: string;
  /** Working directory. Defaults to the repo root. */
  cwd?: string;
}

/** Spawn the CLI with the given argv and return its exit code and streams. */
export function runCli(args: string[], options: RunOptions = {}): CliResult {
  const result = spawnSync(process.execPath, [CLI_BIN, ...args], {
    cwd: options.cwd ?? REPO_ROOT,
    input: options.input,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) {
    throw result.error;
  }
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Run the CLI and parse its stdout as the JSON envelope, failing loudly on bad JSON. */
export function runCliJson(args: string[], options: RunOptions = {}): {
  result: CliResult;
  json: Record<string, unknown>;
} {
  const result = runCli(args, options);
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(result.stdout) as Record<string, unknown>;
  } catch (cause) {
    throw new Error(
      `CLI stdout was not valid JSON for args [${args.join(' ')}]:\n${result.stdout}\n${result.stderr}`,
      { cause },
    );
  }
  return { result, json };
}
