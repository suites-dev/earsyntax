/**
 * Canonical JSON serialization of the Findings model.
 *
 * Findings v1 (`docs/contracts/findings.md`) is the single result every
 * findings-bearing command returns. The canonical result is built in
 * `@earsyntax/core` (`toFindings`); this module owns only its stable, byte-
 * deterministic JSON projection. It reconstructs every object in the frozen key
 * order so serialization stays canonical regardless of how the input
 * {@link Findings} was assembled.
 *
 * Determinism contract: no I/O, no clock, no randomness. The same input always
 * serializes to a byte-identical string.
 */

import type { Findings, FindingsDiagnostic } from '@earsyntax/core';

/**
 * Rebuild one diagnostic with keys in the fixed contract order: `id`,
 * `severity`, `file`, `line`, `col?`, `message`, `fix?`, `requirementId?`.
 * Optional keys are included only when present.
 */
function canonicalDiagnostic(diagnostic: FindingsDiagnostic): FindingsDiagnostic {
  const out = {} as FindingsDiagnostic;
  out.id = diagnostic.id;
  out.severity = diagnostic.severity;
  out.file = diagnostic.file;
  out.line = diagnostic.line;
  if (diagnostic.col !== undefined) {
    out.col = diagnostic.col;
  }
  out.message = diagnostic.message;
  if (diagnostic.fix !== undefined) {
    out.fix = diagnostic.fix;
  }
  if (diagnostic.requirementId !== undefined) {
    out.requirementId = diagnostic.requirementId;
  }
  return out;
}

/**
 * Rebuild a {@link Findings} value with every key in canonical order.
 *
 * `Findings`: `ok`, `summary`, `diagnostics`. `summary`: `files`,
 * `requirements`, `valid`, `errors`, `warnings`. Each diagnostic follows
 * {@link canonicalDiagnostic}.
 *
 * @param findings The findings to normalize.
 * @returns A new findings value with canonical key order.
 */
export function canonicalizeFindings(findings: Findings): Findings {
  return {
    ok: findings.ok,
    summary: {
      files: findings.summary.files,
      requirements: findings.summary.requirements,
      valid: findings.summary.valid,
      errors: findings.summary.errors,
      warnings: findings.summary.warnings,
    },
    diagnostics: findings.diagnostics.map(canonicalDiagnostic),
  };
}

/**
 * Serialize a {@link Findings} value to a stable, 2-space-indented JSON string.
 *
 * Keys are emitted in the frozen contract order (see
 * {@link canonicalizeFindings}), so identical input always yields a byte-
 * identical string. No trailing newline is appended: the command envelope layer
 * owns final output framing.
 *
 * @param findings The findings to serialize.
 * @returns The canonical JSON string.
 */
export function serializeFindings(findings: Findings): string {
  return JSON.stringify(canonicalizeFindings(findings), null, 2);
}
