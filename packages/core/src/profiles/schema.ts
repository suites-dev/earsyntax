/**
 * Profile schema v1: types and strict validation for `@earsyntax/core`.
 *
 * A profile is data, not code (see `docs/contracts/profile.md`). It tells the
 * pipeline which host document regions to locate, which EARS dialect to accept,
 * and how to classify each diagnostic. Parser and linter logic never branch on
 * a profile name; they read these fields. This module owns the frozen shapes
 * and the closed-schema validator.
 *
 * The schema is closed: unknown keys anywhere (top level, `dialect`, `locator`,
 * `idFormat`, or any `LocatorRule`) are a validation error, never silently
 * ignored. {@link validateProfile} is pure: it returns typed errors and never
 * throws on bad caller input.
 *
 * Determinism note: no clock, file system, or network. The one impurity is
 * `new RegExp(...)` used solely to check that pattern fields compile; it is
 * wrapped and never leaks an exception.
 */

import { isKnownDiagnosticId } from './registry-ids.js';

/** The five closed profile identities. There are no user-defined names. */
export type ProfileName = 'strict' | 'ears-x' | 'kiro' | 'speckit' | 'openspec';

/** EARS keyword casing tolerance. */
export type KeywordCase = 'strict' | 'case-insensitive';

/** Whether a leading clause must be comma-terminated before the main clause. */
export type CommaAfterLeadingClause = 'required' | 'optional';

/** Whether fenced code blocks are eligible as candidate regions. */
export type CodeFences = 'ignore' | 'include';

/** Effective classification a profile can assign a diagnostic id. */
export type SeverityLevel = 'error' | 'warning' | 'off';

/**
 * The region-selection strategy of a {@link LocatorRule}.
 *
 * These four values are frozen: `extract` output and profile fixtures depend on
 * them (see `docs/contracts/profile.md`).
 */
export type LocatorRuleKind = 'every-line' | 'heading-section' | 'list-item' | 'block';

/** Which markdown list markers a `list-item` rule accepts. */
export type ListMarker = 'bullet' | 'ordered' | 'any';

/**
 * One region-selection rule. The extractor reports the matching rule's `id` for
 * each candidate (`extract` returns `locatorRuleId`).
 *
 * `id` and `kind` are the frozen core. The remaining fields are the minimal set
 * the built-in markdown profiles need; each field applies to specific kinds:
 *
 * - `every-line` (strict, ears-x): uses no extra fields. Every non-empty line
 *   of a `documentKinds` file is a candidate.
 * - `heading-section` (speckit): `headingPattern` selects the section whose body
 *   lines become candidates (include) or are removed (exclude).
 * - `list-item` (kiro): `underHeading` names the ancestor heading a list must
 *   sit under; `listMarker` restricts which markers qualify.
 * - `block` (openspec): `blockPrefix` is the literal heading line that opens a
 *   candidate block; the block body runs until the next heading of equal or
 *   higher level.
 *
 * `headingPattern` and `underHeading` are JavaScript regular-expression source
 * strings matched case-insensitively against a heading's trimmed text.
 * `blockPrefix` is a literal string matched against a trimmed line, not a regex.
 */
export interface LocatorRule {
  /** Stable rule identity, surfaced as `extract`'s `locatorRuleId`. */
  id: string;
  /** The region-selection strategy. */
  kind: LocatorRuleKind;
  /** `heading-section`: regex selecting the heading whose section this rule targets. */
  headingPattern?: string;
  /** `list-item`: regex selecting the ancestor heading a candidate list sits under. */
  underHeading?: string;
  /** `list-item`: which list markers qualify. Defaults to `any` when omitted. */
  listMarker?: ListMarker;
  /** `block`: literal heading line that opens a candidate block. */
  blockPrefix?: string;
  /** Human note documenting intent in the data file. Rendered nowhere. */
  note?: string;
}

/** Grammar tolerances the parser and linter apply under a profile. */
export interface ProfileDialect {
  /** Casing rule for EARS keywords. */
  keywordCase: KeywordCase;
  /** Literal system phrases accepted in place of `the <system>`. Empty allows only the canonical form. */
  allowLiteralSystemName: string[];
  /** Whether a leading clause must be comma-terminated. */
  commaAfterLeadingClause: CommaAfterLeadingClause;
  /** Whether user-story frame lines are skipped as non-requirement content. */
  allowStoryWrapper: boolean;
  /** Whether `REQ-###` ids and `[source: path:line]` tags are accepted as metadata. */
  allowFrameMetadata: boolean;
  /** Whether `shall not` is accepted as a prohibition kind. */
  allowProhibition: boolean;
}

/** Which regions of which host document kinds become requirement candidates. */
export interface ProfileLocator {
  /** File kinds this profile locates over (for example `['ears','text']`). */
  documentKinds: string[];
  /** Ordered rules selecting candidate regions. */
  include: LocatorRule[];
  /** Ordered rules removing regions from the candidate set. */
  exclude: LocatorRule[];
  /** Whether fenced code blocks are eligible. */
  codeFences: CodeFences;
}

/** Whether requirements must carry an id and its shape. */
export interface ProfileIdFormat {
  /** When `true`, a requirement without an id is a finding. */
  required: boolean;
  /** Optional regex a present id must match (for example `^REQ-\\d+$`). */
  pattern?: string;
}

/** A validated profile. */
export interface Profile {
  /** The profile identity. */
  name: ProfileName;
  /** Always `'ears'`. Reserved against a future notation being silently added. */
  notation: 'ears';
  /** Grammar tolerances. */
  dialect: ProfileDialect;
  /** Region selection. */
  locator: ProfileLocator;
  /** Partial per-id severity overrides keyed by current registry id. */
  severity: Record<string, SeverityLevel>;
  /** Id presence and shape requirements. */
  idFormat: ProfileIdFormat;
}

/** The category of a {@link ProfileValidationError}. */
export type ProfileValidationErrorCode =
  | 'not-object'
  | 'unknown-key'
  | 'missing-key'
  | 'wrong-type'
  | 'invalid-enum'
  | 'unknown-diagnostic-id'
  | 'invalid-pattern';

/** One typed reason a candidate profile failed validation. */
export interface ProfileValidationError {
  /** Dotted path to the offending value (for example `locator.include[0].kind`). */
  path: string;
  /** The failure category. */
  code: ProfileValidationErrorCode;
  /** Human-readable explanation. */
  message: string;
}

/** The outcome of {@link validateProfile}. */
export type ProfileValidationResult =
  | { ok: true; profile: Profile }
  | { ok: false; errors: ProfileValidationError[] };

const PROFILE_NAMES: readonly ProfileName[] = ['strict', 'ears-x', 'kiro', 'speckit', 'openspec'];
const KEYWORD_CASES: readonly KeywordCase[] = ['strict', 'case-insensitive'];
const COMMA_MODES: readonly CommaAfterLeadingClause[] = ['required', 'optional'];
const CODE_FENCES: readonly CodeFences[] = ['ignore', 'include'];
const SEVERITY_LEVELS: readonly SeverityLevel[] = ['error', 'warning', 'off'];
const LOCATOR_KINDS: readonly LocatorRuleKind[] = [
  'every-line',
  'heading-section',
  'list-item',
  'block',
];
const LIST_MARKERS: readonly ListMarker[] = ['bullet', 'ordered', 'any'];

const TOP_KEYS = ['name', 'notation', 'dialect', 'locator', 'severity', 'idFormat'] as const;
const DIALECT_KEYS = [
  'keywordCase',
  'allowLiteralSystemName',
  'commaAfterLeadingClause',
  'allowStoryWrapper',
  'allowFrameMetadata',
  'allowProhibition',
] as const;
const LOCATOR_KEYS = ['documentKinds', 'include', 'exclude', 'codeFences'] as const;
const ID_FORMAT_KEYS = ['required', 'pattern'] as const;
const LOCATOR_RULE_KEYS = [
  'id',
  'kind',
  'headingPattern',
  'underHeading',
  'listMarker',
  'blockPrefix',
  'note',
] as const;

/** A mutable error sink threaded through the validators. */
type Errors = ProfileValidationError[];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reportUnknownKeys(value: Record<string, unknown>, known: readonly string[], path: string, errors: Errors): void {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) {
      errors.push({
        path: path ? `${path}.${key}` : key,
        code: 'unknown-key',
        message: `Unknown key '${key}' is not permitted by the closed profile schema.`,
      });
    }
  }
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[], path: string, errors: Errors): value is T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    errors.push({
      path,
      code: 'invalid-enum',
      message: `Expected one of ${allowed.map((v) => `'${v}'`).join(', ')}.`,
    });
    return false;
  }
  return true;
}

function requireBoolean(value: unknown, path: string, errors: Errors): value is boolean {
  if (typeof value !== 'boolean') {
    errors.push({ path, code: 'wrong-type', message: 'Expected a boolean.' });
    return false;
  }
  return true;
}

function requireStringArray(value: unknown, path: string, errors: Errors): value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    errors.push({ path, code: 'wrong-type', message: 'Expected an array of strings.' });
    return false;
  }
  return true;
}

function requireRegexSource(value: unknown, path: string, errors: Errors): boolean {
  if (typeof value !== 'string') {
    errors.push({ path, code: 'wrong-type', message: 'Expected a regular-expression string.' });
    return false;
  }
  try {
    RegExp(value);
    return true;
  } catch {
    errors.push({ path, code: 'invalid-pattern', message: `Not a valid regular expression: '${value}'.` });
    return false;
  }
}

function validateLocatorRule(value: unknown, path: string, errors: Errors): void {
  if (!isPlainObject(value)) {
    errors.push({ path, code: 'not-object', message: 'Expected a locator-rule object.' });
    return;
  }
  reportUnknownKeys(value, LOCATOR_RULE_KEYS, path, errors);

  if (!('id' in value)) {
    errors.push({ path: `${path}.id`, code: 'missing-key', message: "Missing required key 'id'." });
  } else if (typeof value.id !== 'string') {
    errors.push({ path: `${path}.id`, code: 'wrong-type', message: 'Expected a string.' });
  }

  if (!('kind' in value)) {
    errors.push({ path: `${path}.kind`, code: 'missing-key', message: "Missing required key 'kind'." });
  } else {
    requireEnum(value.kind, LOCATOR_KINDS, `${path}.kind`, errors);
  }

  if ('headingPattern' in value) {
    requireRegexSource(value.headingPattern, `${path}.headingPattern`, errors);
  }
  if ('underHeading' in value) {
    requireRegexSource(value.underHeading, `${path}.underHeading`, errors);
  }
  if ('listMarker' in value) {
    requireEnum(value.listMarker, LIST_MARKERS, `${path}.listMarker`, errors);
  }
  if ('blockPrefix' in value && typeof value.blockPrefix !== 'string') {
    errors.push({ path: `${path}.blockPrefix`, code: 'wrong-type', message: 'Expected a string.' });
  }
  if ('note' in value && typeof value.note !== 'string') {
    errors.push({ path: `${path}.note`, code: 'wrong-type', message: 'Expected a string.' });
  }
}

function validateLocatorRuleList(value: unknown, path: string, errors: Errors): void {
  if (!Array.isArray(value)) {
    errors.push({ path, code: 'wrong-type', message: 'Expected an array of locator rules.' });
    return;
  }
  value.forEach((rule, index) => {
    validateLocatorRule(rule, `${path}[${index}]`, errors);
  });
}

function validateDialect(value: unknown, errors: Errors): void {
  const path = 'dialect';
  if (!isPlainObject(value)) {
    errors.push({ path, code: 'not-object', message: 'Expected a dialect object.' });
    return;
  }
  reportUnknownKeys(value, DIALECT_KEYS, path, errors);

  if ('keywordCase' in value) {
    requireEnum(value.keywordCase, KEYWORD_CASES, `${path}.keywordCase`, errors);
  } else {
    errors.push({ path: `${path}.keywordCase`, code: 'missing-key', message: "Missing required key 'keywordCase'." });
  }

  if ('allowLiteralSystemName' in value) {
    requireStringArray(value.allowLiteralSystemName, `${path}.allowLiteralSystemName`, errors);
  } else {
    errors.push({
      path: `${path}.allowLiteralSystemName`,
      code: 'missing-key',
      message: "Missing required key 'allowLiteralSystemName'.",
    });
  }

  if ('commaAfterLeadingClause' in value) {
    requireEnum(value.commaAfterLeadingClause, COMMA_MODES, `${path}.commaAfterLeadingClause`, errors);
  } else {
    errors.push({
      path: `${path}.commaAfterLeadingClause`,
      code: 'missing-key',
      message: "Missing required key 'commaAfterLeadingClause'.",
    });
  }

  for (const key of ['allowStoryWrapper', 'allowFrameMetadata', 'allowProhibition'] as const) {
    if (key in value) {
      requireBoolean(value[key], `${path}.${key}`, errors);
    } else {
      errors.push({ path: `${path}.${key}`, code: 'missing-key', message: `Missing required key '${key}'.` });
    }
  }
}

function validateLocator(value: unknown, errors: Errors): void {
  const path = 'locator';
  if (!isPlainObject(value)) {
    errors.push({ path, code: 'not-object', message: 'Expected a locator object.' });
    return;
  }
  reportUnknownKeys(value, LOCATOR_KEYS, path, errors);

  if ('documentKinds' in value) {
    requireStringArray(value.documentKinds, `${path}.documentKinds`, errors);
  } else {
    errors.push({ path: `${path}.documentKinds`, code: 'missing-key', message: "Missing required key 'documentKinds'." });
  }

  if ('include' in value) {
    validateLocatorRuleList(value.include, `${path}.include`, errors);
  } else {
    errors.push({ path: `${path}.include`, code: 'missing-key', message: "Missing required key 'include'." });
  }

  if ('exclude' in value) {
    validateLocatorRuleList(value.exclude, `${path}.exclude`, errors);
  } else {
    errors.push({ path: `${path}.exclude`, code: 'missing-key', message: "Missing required key 'exclude'." });
  }

  if ('codeFences' in value) {
    requireEnum(value.codeFences, CODE_FENCES, `${path}.codeFences`, errors);
  } else {
    errors.push({ path: `${path}.codeFences`, code: 'missing-key', message: "Missing required key 'codeFences'." });
  }
}

function validateSeverity(value: unknown, errors: Errors): void {
  const path = 'severity';
  if (!isPlainObject(value)) {
    errors.push({ path, code: 'not-object', message: 'Expected a severity map.' });
    return;
  }
  for (const [key, level] of Object.entries(value)) {
    if (!isKnownDiagnosticId(key)) {
      errors.push({
        path: `${path}.${key}`,
        code: 'unknown-diagnostic-id',
        message: `'${key}' is not a resolvable current diagnostic id (EARS-E### / EARS-W###).`,
      });
    }
    requireEnum(level, SEVERITY_LEVELS, `${path}.${key}`, errors);
  }
}

function validateIdFormat(value: unknown, errors: Errors): void {
  const path = 'idFormat';
  if (!isPlainObject(value)) {
    errors.push({ path, code: 'not-object', message: 'Expected an idFormat object.' });
    return;
  }
  reportUnknownKeys(value, ID_FORMAT_KEYS, path, errors);

  if ('required' in value) {
    requireBoolean(value.required, `${path}.required`, errors);
  } else {
    errors.push({ path: `${path}.required`, code: 'missing-key', message: "Missing required key 'required'." });
  }

  if ('pattern' in value) {
    requireRegexSource(value.pattern, `${path}.pattern`, errors);
  }
}

/**
 * Validate an untrusted value against profile schema v1.
 *
 * Collects every error rather than stopping at the first, so a fixture can
 * assert the full set. Never throws: malformed input yields `{ ok: false }`
 * with typed errors, which a caller maps to exit `2` (see the facade contract).
 *
 * @param input The candidate profile (any shape).
 * @returns A typed result carrying either the validated profile or all errors.
 */
export function validateProfile(input: unknown): ProfileValidationResult {
  const errors: Errors = [];

  if (!isPlainObject(input)) {
    return { ok: false, errors: [{ path: '', code: 'not-object', message: 'Expected a profile object.' }] };
  }

  reportUnknownKeys(input, TOP_KEYS, '', errors);

  if ('name' in input) {
    requireEnum(input.name, PROFILE_NAMES, 'name', errors);
  } else {
    errors.push({ path: 'name', code: 'missing-key', message: "Missing required key 'name'." });
  }

  if ('notation' in input) {
    requireEnum(input.notation, ['ears'] as const, 'notation', errors);
  } else {
    errors.push({ path: 'notation', code: 'missing-key', message: "Missing required key 'notation'." });
  }

  if ('dialect' in input) {
    validateDialect(input.dialect, errors);
  } else {
    errors.push({ path: 'dialect', code: 'missing-key', message: "Missing required key 'dialect'." });
  }

  if ('locator' in input) {
    validateLocator(input.locator, errors);
  } else {
    errors.push({ path: 'locator', code: 'missing-key', message: "Missing required key 'locator'." });
  }

  if ('severity' in input) {
    validateSeverity(input.severity, errors);
  } else {
    errors.push({ path: 'severity', code: 'missing-key', message: "Missing required key 'severity'." });
  }

  if ('idFormat' in input) {
    validateIdFormat(input.idFormat, errors);
  } else {
    errors.push({ path: 'idFormat', code: 'missing-key', message: "Missing required key 'idFormat'." });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  // Every field validated above; assemble the typed profile from the checked
  // members (single assertions from `unknown`, no forced double cast).
  const profile: Profile = {
    name: input.name as ProfileName,
    notation: 'ears',
    dialect: input.dialect as ProfileDialect,
    locator: input.locator as ProfileLocator,
    severity: input.severity as Record<string, SeverityLevel>,
    idFormat: input.idFormat as ProfileIdFormat,
  };
  return { ok: true, profile };
}
