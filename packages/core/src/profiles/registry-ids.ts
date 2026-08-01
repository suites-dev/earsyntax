/**
 * The set of diagnostic ids a profile `severity` map is allowed to key on.
 *
 * A profile classifies diagnostics by their stable registry id
 * (`EARS-E###` / `EARS-W###`), never by the old dotted `DiagnosticCode`. The
 * authoritative id space is the diagnostic registry
 * (`packages/core/src/registry.ts`); this module derives the legal-key set from
 * it so the two can never drift.
 *
 * Only current ids are legal severity keys. Deprecated dotted aliases resolve in
 * `explain` but are rejected as override keys (see `docs/contracts/profile.md`,
 * validation rule 4). {@link isKnownDiagnosticId} therefore treats an id as
 * known only when it is a current registry id, not an alias.
 *
 * Determinism note: pure data derived once from the frozen registry. No clock,
 * file system, or network.
 */

import { DIAGNOSTIC_REGISTRY } from '../registry.js';

/**
 * Every current diagnostic id, in the registry's ascending id order (errors,
 * then warnings). Deprecated aliases are deliberately absent.
 */
export const KNOWN_DIAGNOSTIC_IDS: readonly string[] = DIAGNOSTIC_REGISTRY.map((entry) => entry.id);

const KNOWN_DIAGNOSTIC_ID_SET = new Set<string>(KNOWN_DIAGNOSTIC_IDS);

/**
 * Whether `id` is a current diagnostic id and therefore a legal profile
 * `severity` key. Deprecated aliases return `false`.
 */
export function isKnownDiagnosticId(id: string): boolean {
  return KNOWN_DIAGNOSTIC_ID_SET.has(id);
}
