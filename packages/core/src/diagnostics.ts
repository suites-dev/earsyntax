/**
 * Diagnostic construction, severity mapping, ordering, and message wording for
 * `@earsyntax/core`.
 *
 * The shell parser, expression parser, and catalog matcher discover raw
 * findings (a {@link DiagnosticCode} plus an optional {@link Span}). This module
 * owns turning those raw findings into fully formed {@link Diagnostic} values:
 * it assigns severity from the code and the active {@link Mode}, interpolates a
 * clear one-sentence message, sorts findings into a stable order, and derives
 * the `valid` flag.
 *
 * Determinism: nothing here reads the clock, the file system, the network, or a
 * random source. The same inputs always produce byte-identical output.
 *
 * Severity model (ported from the Go reference `ears-lint-go`):
 * - Structural shell and expression failures, plus unresolved or ambiguous
 *   `system` catalog terms, are errors in `strict` mode and warnings in
 *   `guided` mode (partial-recovery downgrade). See {@link MODE_DEPENDENT_CODES}.
 * - Every other code is always a warning. The Go reference emits no `info`
 *   diagnostics in v1, so `info` is reserved but unused by the builders here.
 */

import type { Diagnostic, DiagnosticCode, Mode, Severity } from './types.js';

/**
 * A raw finding emitted by a parser or the catalog matcher, before severity and
 * message wording are applied.
 *
 * Producers report only the code and (where known) the source span. This module
 * supplies the severity and message.
 */
export type RawFinding = Pick<Diagnostic, 'code'> & Partial<Pick<Diagnostic, 'span'>>;

/**
 * The full set of strings a message builder can interpolate.
 *
 * A {@link DiagnosticContext} is a partial view of this shape: any subset of
 * these fields may be supplied. When a field is absent the message falls back
 * to a generic phrasing that names no specific term or clause.
 */
export interface DiagnosticContextFields {
  /** The offending term or system name (for catalog and expression codes). */
  term: string;
  /** The clause keyword the finding relates to (for example `while`, `if`). */
  clause: string;
  /** The alias that matched, for `lint.alias_used`. */
  alias: string;
  /** The canonical name that should be preferred, for `lint.alias_used`. */
  canonical: string;
}

/**
 * Optional strings interpolated into a diagnostic message.
 *
 * Every field is optional; supply only what is known at the call site.
 */
export type DiagnosticContext = Partial<DiagnosticContextFields>;

/**
 * Codes whose severity depends on the active {@link Mode}.
 *
 * These are `error` in `strict` mode and `warning` in `guided` mode. They cover
 * structural shell failures, structural expression failures, and unresolved or
 * ambiguous `system` catalog terms.
 *
 * Judgment call: `ears.empty_clause` and `ears.empty_response` are not emitted
 * by the Go reference, but they are structural shell defects of the same kind
 * as the codes the reference does downgrade in guided mode, so they are treated
 * as mode-dependent for consistency.
 */
export const MODE_DEPENDENT_CODES = new Set<DiagnosticCode>([
  // Structural shell failures.
  'ears.no_match',
  'ears.invalid_clause_order',
  'ears.missing_system',
  'ears.missing_shall',
  'ears.multiple_shall',
  'ears.invalid_if_then_form',
  'ears.empty_clause',
  'ears.empty_response',
  // Structural expression failures.
  'expr.unbalanced_parentheses',
  'expr.invalid_operator_sequence',
  'expr.empty_subexpression',
  // System-role catalog failures (non-system roles stay warnings).
  'catalog.system_unresolved',
  'catalog.system_ambiguous',
  // Host-native grammar failures. Errors under the strict dialect; a relaxing
  // dialect suppresses them at parse time (keyword case and leading comma) or
  // legalizes the construct (prohibition), so they never reach this map there.
  'ears.keyword_case',
  'ears.missing_leading_comma',
  'ears.prohibition_not_allowed',
]);

/**
 * Map a {@link Mode} to the severity used for {@link MODE_DEPENDENT_CODES}.
 *
 * Ported from the Go reference `severityByMode`: `guided` yields `warning`,
 * every other mode yields `error`.
 *
 * @param mode The active linting mode.
 * @returns `warning` in guided mode, otherwise `error`.
 */
export function severityByMode(mode: Mode): Severity {
  return mode === 'guided' ? 'warning' : 'error';
}

/**
 * Resolve the severity of a diagnostic code under a given mode.
 *
 * Codes in {@link MODE_DEPENDENT_CODES} follow {@link severityByMode}. Every
 * other registered code is always a `warning`.
 *
 * @param code The diagnostic code.
 * @param mode The active linting mode.
 * @returns The severity to assign.
 */
export function severityForCode(code: DiagnosticCode, mode: Mode): Severity {
  return MODE_DEPENDENT_CODES.has(code) ? severityByMode(mode) : 'warning';
}

/**
 * Message builders keyed by diagnostic code.
 *
 * Each builder returns one factual sentence. When the relevant
 * {@link DiagnosticContext} field is present the sentence names the offending
 * term or clause; otherwise it falls back to a generic phrasing. Messages never
 * contain em dashes.
 */
const MESSAGE_BUILDERS = {
  // EARS shell diagnostics.
  'ears.no_match': () => 'The requirement does not match any supported EARS shell pattern.',
  'ears.invalid_clause_order': (ctx) =>
    ctx.clause
      ? `The '${ctx.clause}' clause appears in an unsupported position in the EARS shell.`
      : 'The shell clauses appear in an unsupported order.',
  'ears.missing_system': () => "The requirement is missing the system name before 'shall'.",
  'ears.missing_shall': () =>
    "The requirement does not contain exactly one 'shall' response boundary.",
  'ears.multiple_shall': () => "The requirement contains more than one shell-level 'shall'.",
  'ears.invalid_if_then_form': () => "The 'If' clause is missing the required 'then' boundary.",
  'ears.empty_clause': (ctx) =>
    ctx.clause ? `The '${ctx.clause}' clause body is empty.` : 'A shell clause body is empty.',
  'ears.empty_response': () => "The response after 'shall' is empty.",

  // Expression diagnostics.
  'expr.unbalanced_parentheses': () => 'The clause expression has unbalanced parentheses.',
  'expr.invalid_operator_sequence': () =>
    'The clause expression contains a malformed operator sequence.',
  'expr.empty_subexpression': () => 'The clause expression contains an empty subexpression.',
  'expr.operator_precedence_warning': () =>
    "The clause expression mixes 'and' and 'or' without grouping; add parentheses to make precedence explicit.",
  'expr.unknown_term': (ctx) =>
    ctx.term
      ? `The clause term "${ctx.term}" does not match any known catalog entry.`
      : 'A clause term does not match any known catalog entry.',
  'expr.ambiguous_term': (ctx) =>
    ctx.term
      ? `The clause term "${ctx.term}" matches more than one catalog entry.`
      : 'A clause term matches more than one catalog entry.',
  'expr.mixed_unresolved_terms': () =>
    'The clause expression mixes resolved and unresolved catalog terms.',

  // Catalog diagnostics: system role.
  'catalog.system_unresolved': (ctx) =>
    ctx.term
      ? `The system "${ctx.term}" does not match any known system.`
      : 'The system name does not match any known system.',
  'catalog.system_ambiguous': (ctx) =>
    ctx.term
      ? `The system "${ctx.term}" matches more than one known system.`
      : 'The system name matches more than one known system.',

  // Catalog diagnostics: state role.
  'catalog.state_unresolved': (ctx) =>
    ctx.term
      ? `The state term "${ctx.term}" does not match any known state.`
      : 'A state term does not match any known state.',
  'catalog.state_ambiguous': (ctx) =>
    ctx.term
      ? `The state term "${ctx.term}" matches more than one known state.`
      : 'A state term matches more than one known state.',

  // Catalog diagnostics: event role.
  'catalog.event_unresolved': (ctx) =>
    ctx.term
      ? `The event term "${ctx.term}" does not match any known event.`
      : 'An event term does not match any known event.',
  'catalog.event_ambiguous': (ctx) =>
    ctx.term
      ? `The event term "${ctx.term}" matches more than one known event.`
      : 'An event term matches more than one known event.',

  // Catalog diagnostics: feature role.
  'catalog.feature_unresolved': (ctx) =>
    ctx.term
      ? `The feature term "${ctx.term}" does not match any known feature.`
      : 'A feature term does not match any known feature.',
  'catalog.feature_ambiguous': (ctx) =>
    ctx.term
      ? `The feature term "${ctx.term}" matches more than one known feature.`
      : 'A feature term matches more than one known feature.',

  // Catalog coverage.
  'catalog.term_unreferenced': (ctx) =>
    ctx.term
      ? `The catalog term "${ctx.term}" is not referenced by any requirement.`
      : 'A catalog term is not referenced by any requirement.',

  // Lint diagnostics.
  'lint.multiple_responses': () =>
    'The response contains multiple responses; split them into separate requirements.',
  'lint.vague_response': (ctx) =>
    ctx.term
      ? `The response contains the vague term "${ctx.term}".`
      : 'The response contains a vague term.',
  'lint.unparsed_tail': () => 'Text remains after the parsed requirement.',
  'lint.alias_used': (ctx) => {
    if (ctx.alias && ctx.canonical) {
      return `The catalog alias "${ctx.alias}" matched; prefer the canonical name "${ctx.canonical}".`;
    }
    if (ctx.term) {
      return `A catalog alias matched for "${ctx.term}"; prefer the canonical name.`;
    }
    return 'A catalog alias matched; prefer the canonical name.';
  },
  'lint.suspicious_text_shape': () => 'The sentence shape is likely accidental or malformed.',

  // Host-native grammar diagnostics.
  'ears.keyword_case': (ctx) =>
    ctx.term
      ? `The keyword "${ctx.term}" does not match its required canonical casing.`
      : 'A keyword does not match its required canonical casing.',
  'ears.missing_leading_comma': (ctx) =>
    ctx.clause
      ? `The leading '${ctx.clause}' clause is not followed by the required comma.`
      : 'A leading clause is not followed by the required comma.',
  'ears.prohibition_not_allowed': () =>
    "The 'shall not' prohibition form is not allowed by this dialect.",
} satisfies Record<DiagnosticCode, (ctx: DiagnosticContext) => string>;

/**
 * Build the message for a code from optional context.
 *
 * @param code The diagnostic code.
 * @param context Optional strings to interpolate.
 * @returns One factual sentence describing the finding.
 */
export function messageForCode(code: DiagnosticCode, context: DiagnosticContext = {}): string {
  return MESSAGE_BUILDERS[code](context);
}

/**
 * Build a fully formed {@link Diagnostic} from a raw finding.
 *
 * Assigns severity from the code and mode ({@link severityForCode}) and a
 * one-sentence message ({@link messageForCode}). The span is copied through
 * unchanged when present.
 *
 * @param finding The raw finding: a code and optional span.
 * @param mode The active linting mode, which drives mode-dependent severity.
 * @param context Optional strings interpolated into the message.
 * @returns The constructed diagnostic.
 */
export function buildDiagnostic(
  finding: RawFinding,
  mode: Mode,
  context: DiagnosticContext = {},
): Diagnostic {
  const severity = severityForCode(finding.code, mode);
  const message = messageForCode(finding.code, context);
  return finding.span
    ? { code: finding.code, severity, message, span: finding.span }
    : { code: finding.code, severity, message };
}

/** A start/end pair used for span comparison; spanless findings sort last. */
function spanStart(diagnostic: Diagnostic): number {
  return diagnostic.span ? diagnostic.span.start : Number.MAX_SAFE_INTEGER;
}

function spanEnd(diagnostic: Diagnostic): number {
  return diagnostic.span ? diagnostic.span.end : Number.MAX_SAFE_INTEGER;
}

/**
 * Compare two diagnostics for stable ordering.
 *
 * Order, in priority: span start ascending, then span end ascending (so nested
 * or shorter spans at the same start come first), then code, then message, then
 * severity. Diagnostics without a span sort after all spanned ones. String
 * fields compare by code-unit order to stay locale-independent and
 * deterministic.
 *
 * This refines the Go reference `sortDiagnostics`, which orders only by span
 * start before falling back to code, message, and severity. Adding span end as
 * a secondary key makes the order fully determined by the diagnostics
 * themselves rather than by their insertion order.
 */
function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  const aStart = spanStart(a);
  const bStart = spanStart(b);
  if (aStart !== bStart) {
    return aStart - bStart;
  }
  const aEnd = spanEnd(a);
  const bEnd = spanEnd(b);
  if (aEnd !== bEnd) {
    return aEnd - bEnd;
  }
  if (a.code !== b.code) {
    return a.code < b.code ? -1 : 1;
  }
  if (a.message !== b.message) {
    return a.message < b.message ? -1 : 1;
  }
  if (a.severity !== b.severity) {
    return a.severity < b.severity ? -1 : 1;
  }
  return 0;
}

/**
 * Return a stably sorted copy of the diagnostics.
 *
 * The input array is not mutated. Sorting is total and deterministic: repeated
 * calls on equal inputs produce identical output regardless of insertion order.
 *
 * @param diagnostics The diagnostics to sort.
 * @returns A new array in stable diagnostic order.
 */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return diagnostics.slice().sort(compareDiagnostics);
}

/**
 * The identity key that defines an exact duplicate diagnostic.
 *
 * Two diagnostics are duplicates when their code, span, severity, and message
 * all match. The message carries any interpolated context (term or clause), so
 * findings that share a code and span but differ in context stay distinct. The
 * ` ` separator cannot appear in a diagnostic message, so the joined key
 * is unambiguous. A missing span uses an empty component that never collides
 * with a real `[start, end)` pair.
 */
function diagnosticKey(diagnostic: Diagnostic): string {
  const span = diagnostic.span ? `${diagnostic.span.start}:${diagnostic.span.end}` : '';
  return [diagnostic.code, span, diagnostic.severity, diagnostic.message].join(' ');
}

/**
 * Return a copy of the diagnostics with exact duplicates removed.
 *
 * A duplicate is a diagnostic whose code, span start and end, severity, and
 * message all match an earlier one. A parser can legitimately report the same
 * finding twice (for example `ears.missing_shall` from a pre-check and again at
 * parse time with the same span); this collapses those to a single diagnostic.
 *
 * The first occurrence is kept and relative order is preserved, so the result
 * is deterministic for a given input. Compose with {@link sortDiagnostics} in
 * either order; the sorted, deduplicated set is identical either way.
 *
 * @param diagnostics The diagnostics to deduplicate.
 * @returns A new array with exact duplicates removed, first occurrence kept.
 */
export function dedupeDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  const out: Diagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = diagnosticKey(diagnostic);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(diagnostic);
  }
  return out;
}

/**
 * Derive the `valid` flag from a set of diagnostics.
 *
 * A requirement is valid unless at least one diagnostic has severity `error`.
 * `warning` and `info` never affect validity.
 *
 * @param diagnostics The diagnostics to inspect.
 * @returns `false` when any diagnostic is an error, otherwise `true`.
 */
export function computeValid(diagnostics: readonly Diagnostic[]): boolean {
  return !diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}
