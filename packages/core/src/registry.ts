/**
 * The append-only diagnostic registry for the host-native `earsyntax` facade.
 *
 * Every finding `@earsyntax/core` reports carries a raw {@link DiagnosticCode}
 * (a dotted string such as `ears.missing_shall`). The facade surfaces findings
 * under stable public ids instead: `EARS-E###` for defaults in the error band,
 * `EARS-W###` for defaults in the warning band. This module is the single
 * source of truth mapping each id to its deprecated old code, title, default
 * severity, meaning, rationale, examples, and profile notes. It is the data the
 * `explain` command renders and the metadata the SARIF rule list reads.
 *
 * APPEND-ONLY CONTRACT. The id assignment is frozen and grows in one direction
 * only:
 * - Never renumber an existing id.
 * - Never reuse a retired number.
 * - Never delete an id.
 * - A new diagnostic takes the next free number in its severity band.
 * Old dotted codes remain resolvable forever as deprecated aliases through
 * {@link resolveDiagnosticId}; they are never removed. The `E`/`W` band is the
 * DEFAULT severity only. A profile severity override or `--strict` can change
 * the effective severity a diagnostic carries in a findings result without
 * changing its id (see `docs/contracts/findings.md`).
 *
 * The exported registry data is deeply frozen: consumers read it, they never
 * mutate it. Determinism: nothing here reads the clock, the file system, the
 * network, or a random source.
 */

import type { DiagnosticCode } from './types.js';

/** The default severity band an id belongs to. Effective severity may differ. */
export type RegistrySeverity = 'error' | 'warning';

/**
 * One entry in the diagnostic registry: the stable public id, its deprecated
 * old-code alias, and the human-facing metadata the `explain` command renders.
 */
export interface DiagnosticRegistryEntry {
  /** Stable public id: `EARS-E###` (error band) or `EARS-W###` (warning band). */
  id: string;
  /** The deprecated old code this id replaces; resolvable forever as an alias. */
  oldCode: DiagnosticCode;
  /** Short human-readable title of the diagnostic. */
  title: string;
  /** Default severity, implied by the id band. Not the effective severity. */
  defaultSeverity: RegistrySeverity;
  /** One factual sentence describing what the diagnostic means. */
  meaning: string;
  /** Why the rule exists, in one or two sentences. */
  rationale: string;
  /** A short requirement that triggers the diagnostic. */
  badExample: string;
  /** The corrected form of {@link badExample}. */
  goodExample: string;
  /** How profiles and `--strict` affect this diagnostic's effective severity. */
  profileNotes: string;
}

/** Profile-note phrasing shared by every error-band entry. */
const ERROR_PROFILE_NOTE =
  'Error by default under every built-in profile. --strict has no further effect on an error; only an explicit profile severity override can change its effective severity.';

/** Profile-note phrasing shared by most warning-band entries. */
const WARNING_PROFILE_NOTE =
  'Warning by default. --strict upgrades it to error at the findings layer; a profile severity override can set it to error or off.';

/**
 * The registry, in ascending id order within each band (errors, then
 * warnings). Ids are assigned per the frozen migration table in
 * `docs/refactor/host-native-facade.md`: alphabetically by old code within each
 * severity, errors `E001+`, warnings `W001+`.
 */
const ENTRIES: DiagnosticRegistryEntry[] = [
  // Errors: EARS-E001 - EARS-E013.
  {
    id: 'EARS-E001',
    oldCode: 'catalog.system_ambiguous',
    title: 'Ambiguous system term',
    defaultSeverity: 'error',
    meaning: 'The system name matches more than one known system.',
    rationale:
      'A requirement constrains exactly one system. A system name that resolves to several catalog entries leaves the constrained system undetermined.',
    badExample: 'The controller shall stop the motor.',
    goodExample: 'The brake controller shall stop the motor.',
    profileNotes: ERROR_PROFILE_NOTE,
  },
  {
    id: 'EARS-E002',
    oldCode: 'catalog.system_unresolved',
    title: 'Unresolved system term',
    defaultSeverity: 'error',
    meaning: 'The system name matches no known system.',
    rationale:
      'When a catalog is supplied, the system a requirement constrains must be one of its known systems, so an unknown system usually signals a typo or a missing catalog entry.',
    badExample: 'The invoicing engine shall retry the charge.',
    goodExample: 'The billing service shall retry the charge.',
    profileNotes: ERROR_PROFILE_NOTE,
  },
  {
    id: 'EARS-E003',
    oldCode: 'ears.empty_clause',
    title: 'Empty clause body',
    defaultSeverity: 'error',
    meaning: 'A While, Where, When, or If clause body is empty.',
    rationale:
      'A clause keyword with no body states no condition, so the requirement it introduces has no meaning.',
    badExample: 'When , the system shall reset the timer.',
    goodExample: 'When the timer fires, the system shall reset the timer.',
    profileNotes: ERROR_PROFILE_NOTE,
  },
  {
    id: 'EARS-E004',
    oldCode: 'ears.empty_response',
    title: 'Empty response',
    defaultSeverity: 'error',
    meaning: 'The response after shall is empty.',
    rationale:
      'The response is the behaviour the requirement mandates. An empty response mandates nothing.',
    badExample: 'The system shall .',
    goodExample: 'The system shall reset the timer.',
    profileNotes: ERROR_PROFILE_NOTE,
  },
  {
    id: 'EARS-E005',
    oldCode: 'ears.invalid_clause_order',
    title: 'Invalid clause order',
    defaultSeverity: 'error',
    meaning: 'Shell clauses appear in an unsupported order.',
    rationale:
      'Canonical EARS orders leading clauses as While, then Where, then When, then If. Out-of-order clauses do not match a supported shell pattern.',
    badExample: 'When the timer fires, while idle, the system shall reset the timer.',
    goodExample: 'While idle, when the timer fires, the system shall reset the timer.',
    profileNotes: ERROR_PROFILE_NOTE,
  },
  {
    id: 'EARS-E006',
    oldCode: 'ears.invalid_if_then_form',
    title: 'Malformed If/then unwanted-behaviour form',
    defaultSeverity: 'error',
    meaning: 'An If clause is missing its required then boundary.',
    rationale:
      "Canonical EARS requires 'If <condition>, then the <system> shall <response>.' Without the then boundary the unwanted-behaviour form is incomplete.",
    badExample: 'If the signature is invalid, the system shall reject the webhook.',
    goodExample: 'If the signature is invalid, then the system shall reject the webhook.',
    profileNotes: ERROR_PROFILE_NOTE,
  },
  {
    id: 'EARS-E007',
    oldCode: 'ears.missing_shall',
    title: 'Missing shall boundary',
    defaultSeverity: 'error',
    meaning: 'The requirement does not contain exactly one shall response boundary.',
    rationale:
      'The shall keyword separates the system from the response it must perform. Without it the sentence is a statement, not a requirement.',
    badExample: 'The system resets the timer.',
    goodExample: 'The system shall reset the timer.',
    profileNotes: ERROR_PROFILE_NOTE,
  },
  {
    id: 'EARS-E008',
    oldCode: 'ears.missing_system',
    title: 'Missing system name',
    defaultSeverity: 'error',
    meaning: 'The requirement is missing the system name before shall.',
    rationale:
      'Every requirement names the system it constrains. An empty system leaves the responsible component unstated.',
    badExample: 'When the timer fires, shall reset the timer.',
    goodExample: 'When the timer fires, the system shall reset the timer.',
    profileNotes: ERROR_PROFILE_NOTE,
  },
  {
    id: 'EARS-E009',
    oldCode: 'ears.multiple_shall',
    title: 'Multiple shall boundaries',
    defaultSeverity: 'error',
    meaning: 'The requirement contains more than one shell-level shall.',
    rationale:
      'A single requirement states a single obligation. More than one shall packs several requirements into one sentence, which cannot be traced or tested independently.',
    badExample: 'The system shall reset the timer and shall log the event.',
    goodExample: 'The system shall reset the timer.',
    profileNotes: ERROR_PROFILE_NOTE,
  },
  {
    id: 'EARS-E010',
    oldCode: 'ears.no_match',
    title: 'Unrecognized EARS shell',
    defaultSeverity: 'error',
    meaning: 'The text does not match any supported EARS shell pattern.',
    rationale:
      'The text has no recognizable EARS shape at all, so no more precise structural cause can be reported.',
    badExample: 'The quick brown fox.',
    goodExample: 'The system shall log the event.',
    profileNotes: ERROR_PROFILE_NOTE,
  },
  {
    id: 'EARS-E011',
    oldCode: 'expr.empty_subexpression',
    title: 'Empty subexpression',
    defaultSeverity: 'error',
    meaning: 'A clause expression contains an empty subexpression.',
    rationale:
      'A grouped or operator operand with no content, such as an empty pair of parentheses, contributes no condition and is almost always a mistake.',
    badExample: 'While A and (), the system shall reset the timer.',
    goodExample: 'While A and B, the system shall reset the timer.',
    profileNotes: ERROR_PROFILE_NOTE,
  },
  {
    id: 'EARS-E012',
    oldCode: 'expr.invalid_operator_sequence',
    title: 'Invalid operator sequence',
    defaultSeverity: 'error',
    meaning: 'A clause expression contains a malformed operator sequence.',
    rationale:
      'Operators such as and, or, and not must join operands. A doubled or dangling operator has no operand to act on.',
    badExample: 'While A or or B, the system shall reset the timer.',
    goodExample: 'While A or B, the system shall reset the timer.',
    profileNotes: ERROR_PROFILE_NOTE,
  },
  {
    id: 'EARS-E013',
    oldCode: 'expr.unbalanced_parentheses',
    title: 'Unbalanced parentheses',
    defaultSeverity: 'error',
    meaning: 'A clause expression has unbalanced parentheses.',
    rationale:
      'Every opening parenthesis needs a matching close. An unbalanced group cannot be parsed into a determinate expression tree.',
    badExample: 'When (A and B, the system shall reset the timer.',
    goodExample: 'When (A and B), the system shall reset the timer.',
    profileNotes: ERROR_PROFILE_NOTE,
  },

  // Warnings: EARS-W001 - EARS-W016.
  {
    id: 'EARS-W001',
    oldCode: 'catalog.event_ambiguous',
    title: 'Ambiguous event term',
    defaultSeverity: 'warning',
    meaning: 'An event term matches more than one known event.',
    rationale:
      'An event that resolves to several catalog entries leaves the trigger undetermined, though a non-system term never blocks validity on its own.',
    badExample: 'When the request arrives, the system shall respond.',
    goodExample: 'When the payment webhook arrives, the system shall respond.',
    profileNotes: WARNING_PROFILE_NOTE,
  },
  {
    id: 'EARS-W002',
    oldCode: 'catalog.event_unresolved',
    title: 'Unresolved event term',
    defaultSeverity: 'warning',
    meaning: 'An event term matches no known event.',
    rationale:
      'An event absent from the catalog is often a typo or a term the catalog has yet to define.',
    badExample: 'When a refund is requested, the system shall notify the operator.',
    goodExample: 'When a refund event occurs, the system shall notify the operator.',
    profileNotes: WARNING_PROFILE_NOTE,
  },
  {
    id: 'EARS-W003',
    oldCode: 'catalog.feature_ambiguous',
    title: 'Ambiguous feature term',
    defaultSeverity: 'warning',
    meaning: 'A feature term matches more than one known feature.',
    rationale:
      'A feature name shared by several catalog entries leaves the optional feature undetermined.',
    badExample: 'Where retries are enabled, the system shall back off.',
    goodExample: 'Where automatic retries are enabled, the system shall back off.',
    profileNotes: WARNING_PROFILE_NOTE,
  },
  {
    id: 'EARS-W004',
    oldCode: 'catalog.feature_unresolved',
    title: 'Unresolved feature term',
    defaultSeverity: 'warning',
    meaning: 'A feature term matches no known feature.',
    rationale:
      'A feature absent from the catalog is often a typo or a term the catalog has yet to define.',
    badExample: 'Where premium mode is enabled, the system shall unlock the report.',
    goodExample: 'Where the premium tier is enabled, the system shall unlock the report.',
    profileNotes: WARNING_PROFILE_NOTE,
  },
  {
    id: 'EARS-W005',
    oldCode: 'catalog.state_ambiguous',
    title: 'Ambiguous state term',
    defaultSeverity: 'warning',
    meaning: 'A state term matches more than one known state.',
    rationale:
      'A state name shared by several catalog entries leaves the precondition undetermined.',
    badExample: 'While draining, the system shall reject new work.',
    goodExample: 'While the queue is draining, the system shall reject new work.',
    profileNotes: WARNING_PROFILE_NOTE,
  },
  {
    id: 'EARS-W006',
    oldCode: 'catalog.state_unresolved',
    title: 'Unresolved state term',
    defaultSeverity: 'warning',
    meaning: 'A state term matches no known state.',
    rationale:
      'A state absent from the catalog is often a typo or a term the catalog has yet to define.',
    badExample: 'While the queue is draining, the system shall reject new work.',
    goodExample: 'While the queue is full, the system shall reject new work.',
    profileNotes: WARNING_PROFILE_NOTE,
  },
  {
    id: 'EARS-W007',
    oldCode: 'catalog.term_unreferenced',
    title: 'Unreferenced catalog term',
    defaultSeverity: 'warning',
    meaning: 'A cataloged term is never referenced by any requirement text.',
    rationale:
      'A catalog entry that no requirement mentions is either dead vocabulary or a sign that a requirement is missing.',
    badExample: 'A payment-http entry that no requirement references.',
    goodExample: 'When the payment-http call fails, the system shall retry once.',
    profileNotes: WARNING_PROFILE_NOTE,
  },
  {
    id: 'EARS-W008',
    oldCode: 'expr.ambiguous_term',
    title: 'Ambiguous clause term',
    defaultSeverity: 'warning',
    meaning: 'A clause term matches more than one catalog entry.',
    rationale:
      'A clause term whose name collides across catalog groups is undetermined; the accompanying role-specific catalog diagnostic names the collision.',
    badExample: 'When the reset is triggered, the system shall clear the buffer.',
    goodExample: 'When the watchdog reset is triggered, the system shall clear the buffer.',
    profileNotes: WARNING_PROFILE_NOTE,
  },
  {
    id: 'EARS-W009',
    oldCode: 'expr.mixed_unresolved_terms',
    title: 'Mixed resolved and unresolved terms',
    defaultSeverity: 'warning',
    meaning: 'One clause mixes resolved and unresolved terms.',
    rationale:
      'A clause where some terms resolve and others do not often hides a typo in the unresolved operand, since the author clearly intended cataloged terms.',
    badExample: 'While A and B, the system shall reset the timer.',
    goodExample: 'While A and C, the system shall reset the timer.',
    profileNotes: WARNING_PROFILE_NOTE,
  },
  {
    id: 'EARS-W010',
    oldCode: 'expr.operator_precedence_warning',
    title: 'Implicit operator precedence',
    defaultSeverity: 'warning',
    meaning: 'A mixed and/or expression may need parentheses.',
    rationale:
      'Mixing and with or without grouping relies on implicit precedence that a reader can misjudge. Explicit parentheses remove the ambiguity.',
    badExample: 'While A and B or C, the system shall reset the timer.',
    goodExample: 'While (A and B) or C, the system shall reset the timer.',
    profileNotes: WARNING_PROFILE_NOTE,
  },
  {
    id: 'EARS-W011',
    oldCode: 'expr.unknown_term',
    title: 'Unknown clause term',
    defaultSeverity: 'warning',
    meaning: 'A clause term matches no catalog entry for its role.',
    rationale:
      'A clause term absent from the catalog is often a typo or a term the catalog has yet to define.',
    badExample: 'When the doorbell rings, the system shall log the event.',
    goodExample: 'When the entry sensor triggers, the system shall log the event.',
    profileNotes:
      'Warning by default. --strict upgrades it to error at the findings layer; a profile severity override can set it to error or off. The kiro profile sets EARS-W011 to off.',
  },
  {
    id: 'EARS-W012',
    oldCode: 'lint.alias_used',
    title: 'Catalog alias used',
    defaultSeverity: 'warning',
    meaning: 'A catalog alias matched; the canonical name is preferred.',
    rationale:
      'An alias resolves correctly but hides the canonical name, so different requirements can refer to the same concept by different spellings.',
    badExample: 'When db is unavailable, the system shall queue the write.',
    goodExample: 'When Postgres is unavailable, the system shall queue the write.',
    profileNotes: WARNING_PROFILE_NOTE,
  },
  {
    id: 'EARS-W013',
    oldCode: 'lint.multiple_responses',
    title: 'Multiple responses',
    defaultSeverity: 'warning',
    meaning: 'The response holds several semicolon-joined responses.',
    rationale:
      'Several responses in one requirement cannot be traced or tested independently; splitting them keeps each obligation atomic.',
    badExample: 'The system shall log the event; notify the operator.',
    goodExample: 'The system shall log the event.',
    profileNotes: WARNING_PROFILE_NOTE,
  },
  {
    id: 'EARS-W014',
    oldCode: 'lint.suspicious_text_shape',
    title: 'Suspicious text shape',
    defaultSeverity: 'warning',
    meaning: 'The sentence shape is likely accidental or malformed.',
    rationale:
      'Text that resembles no EARS shell but was submitted as a requirement is flagged so it is not silently ignored in guided processing.',
    badExample: 'timer reset maybe when idle',
    goodExample: 'While idle, the system shall reset the timer.',
    profileNotes: WARNING_PROFILE_NOTE,
  },
  {
    id: 'EARS-W015',
    oldCode: 'lint.unparsed_tail',
    title: 'Unparsed trailing text',
    defaultSeverity: 'warning',
    meaning: 'Text remains after the parsed requirement.',
    rationale:
      'Tokens the parser could not consume usually mean the sentence ran two requirements together or trailed off into prose.',
    badExample: 'The system shall reset the timer. Also it logs the event.',
    goodExample: 'The system shall reset the timer.',
    profileNotes: WARNING_PROFILE_NOTE,
  },
  {
    id: 'EARS-W016',
    oldCode: 'lint.vague_response',
    title: 'Vague response',
    defaultSeverity: 'warning',
    meaning: 'The response contains a configured vague term.',
    rationale:
      'A vague response such as "as needed" is not verifiable, so a tester cannot confirm the system met it.',
    badExample: 'The system shall respond as needed.',
    goodExample: 'The system shall respond within 200 milliseconds.',
    profileNotes: WARNING_PROFILE_NOTE,
  },
];

/**
 * Recursively freeze a value and every object it reaches, returning it typed as
 * deeply readonly. Used to lock the registry data so consumers cannot mutate a
 * shared export. Frozen input is returned untouched.
 */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/**
 * The full diagnostic registry, in ascending id order (errors, then warnings).
 * Deeply frozen: read it, do not mutate it.
 */
export const DIAGNOSTIC_REGISTRY: readonly DiagnosticRegistryEntry[] = deepFreeze(ENTRIES);

/** Lookup by current id, built once from the frozen registry. */
const BY_ID = new Map(
  DIAGNOSTIC_REGISTRY.map((entry): [string, DiagnosticRegistryEntry] => [entry.id, entry]),
);

/** Lookup by deprecated old code (alias), built once from the frozen registry. */
const BY_OLD_CODE = new Map(
  DIAGNOSTIC_REGISTRY.map((entry): [string, DiagnosticRegistryEntry] => [entry.oldCode, entry]),
);

/**
 * Resolve a current id or a deprecated old code to its current id.
 *
 * `resolveDiagnosticId('ears.missing_shall')` returns `'EARS-E007'`;
 * `resolveDiagnosticId('EARS-E007')` returns itself. Aliases resolve forever.
 * An unrecognized id or code returns `undefined` so the caller can report it as
 * an unknown diagnostic.
 *
 * @param idOrAlias A current `EARS-*` id or a deprecated dotted old code.
 * @returns The current id, or `undefined` when nothing matches.
 */
export function resolveDiagnosticId(idOrAlias: string): string | undefined {
  if (BY_ID.has(idOrAlias)) {
    return idOrAlias;
  }
  return BY_OLD_CODE.get(idOrAlias)?.id;
}

/**
 * Fetch the full registry entry for a current id or a deprecated old code.
 *
 * Resolves aliases the same way as {@link resolveDiagnosticId}, then returns the
 * entry. Returns `undefined` when nothing matches.
 *
 * @param idOrAlias A current `EARS-*` id or a deprecated dotted old code.
 * @returns The registry entry, or `undefined` when nothing matches.
 */
export function getDiagnosticEntry(idOrAlias: string): DiagnosticRegistryEntry | undefined {
  return BY_ID.get(idOrAlias) ?? BY_OLD_CODE.get(idOrAlias);
}

/**
 * Look up the current id for a raw {@link DiagnosticCode}.
 *
 * The typed counterpart to {@link resolveDiagnosticId} for callers that already
 * hold a core diagnostic code. Every registered code maps, so the result is
 * always defined for a valid {@link DiagnosticCode}.
 *
 * @param code A core diagnostic code.
 * @returns The current `EARS-*` id for the code.
 */
export function idForCode(code: DiagnosticCode): string {
  const entry = BY_OLD_CODE.get(code);
  // Every DiagnosticCode has a registry entry by construction; the drift test
  // in registry.test.ts fails if a code is ever left unmapped.
  return entry ? entry.id : code;
}
