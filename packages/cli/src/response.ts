/**
 * Base response construction, JSON serialization, and output emission.
 *
 * Every `--json` command returns a {@link FacadeResponse}. This module builds
 * the base shape in a fixed key order and prints either the serialized JSON or
 * a caller-supplied pretty string. It is the one place that writes to stdout.
 */

import type { Painter } from './color.js';
import type { CliError } from './errors.js';
import type { FacadeDiagnostic, FacadeResponse, NextAction } from './facade-types.js';
import { CLI_VERSION } from './version.js';

/** Fields for building a base response, before command-specific keys are merged in. */
export interface BaseInit {
  command: string;
  ok: boolean;
  root?: string;
  diagnostics?: FacadeDiagnostic[];
  next?: NextAction[];
}

/**
 * Build a {@link FacadeResponse} with the base fields in a stable order,
 * then merge command-specific convenience keys on top. Construction is a single
 * immutable literal: no mutation, no `delete`. Key order is `version`,
 * `command`, `ok`, `root?`, command keys, `diagnostics?`, `next`.
 */
export function buildResponse(init: BaseInit, extra: Record<string, unknown> = {}): FacadeResponse {
  const hasDiagnostics = init.diagnostics !== undefined && init.diagnostics.length > 0;
  return {
    version: CLI_VERSION,
    command: init.command,
    ok: init.ok,
    ...(init.root !== undefined ? { root: init.root } : {}),
    ...extra,
    ...(hasDiagnostics ? { diagnostics: init.diagnostics } : {}),
    next: init.next ?? [],
  };
}

/** Serialize a response to pretty-printed, deterministic JSON. */
export function serialize(response: FacadeResponse): string {
  return JSON.stringify(response, null, 2);
}

/** Where and how a command writes its output. */
export interface Emitter {
  json: boolean;
  painter: Painter;
  write(text: string): void;
}

/** Emit a command result: raw stdout if present, else JSON when `--json`, else the pretty string. */
export function emitResult(
  emitter: Emitter,
  response: FacadeResponse,
  pretty: string,
  raw?: string,
): void {
  if (raw !== undefined) {
    emitter.write(raw.endsWith('\n') ? raw : `${raw}\n`);
    return;
  }
  emitter.write(`${emitter.json ? serialize(response) : pretty}\n`);
}

/** Emit a response: JSON when `--json`, otherwise the pretty string. */
export function emit(emitter: Emitter, response: FacadeResponse, pretty: string): void {
  emitResult(emitter, response, pretty);
}

/** Build the response for a {@link CliError} so the dispatcher can emit it uniformly. */
export function errorResponse(
  command: string,
  root: string | undefined,
  error: CliError,
): FacadeResponse {
  return buildResponse({
    command,
    ok: false,
    root,
    diagnostics: [error.diagnostic],
    next: error.next,
  });
}
