/**
 * Frozen public type contracts for `@earsyntax/core`.
 *
 * This module is the single source of truth for every shared shape used across
 * the EARS JS toolkit. Downstream packages (`@earsyntax/extract`,
 * `@earsyntax/cli`) and every implementation agent compile against these types.
 *
 * The types combine two sources:
 * 1. The recommended TypeScript shapes from the orchestration brief.
 * 2. The Go reference implementation (`ears-lint-go`) for `TermMatch`,
 *    `ReferenceMatch`, `CatalogRef`, `TermRole`, and `Severity`.
 *
 * Determinism note: none of these shapes carry runtime behavior. The linter
 * and parser that consume them must remain deterministic (no LLM, no network,
 * no file system, no fuzzy matching).
 */

/**
 * Linting strictness.
 *
 * - `strict`: structural parse failures and unresolved systems are errors.
 * - `guided`: structural parse failures may be downgraded to warnings where a
 *   partial AST can still be recovered.
 */
export type Mode = 'strict' | 'guided';

/**
 * The EARS shell pattern a requirement matches.
 *
 * Values follow the canonical Mavin EARS templates. TypeScript uses
 * `optional-feature` and `unwanted-behaviour` consistently.
 */
export type Pattern =
  | 'ubiquitous'
  | 'state-driven'
  | 'event-driven'
  | 'optional-feature'
  | 'unwanted-behaviour'
  | 'complex';

/**
 * Diagnostic severity level.
 *
 * `valid` on a {@link LintResult} is `false` when any diagnostic has severity
 * `error`, and `true` otherwise. `warning` and `info` never affect validity.
 */
export type Severity = 'error' | 'warning' | 'info';

/**
 * The clause keyword a reference or expression belongs to.
 *
 * Mirrors the four EARS shell clause keywords. Used to describe where a
 * {@link ReferenceMatch} was found and to classify clause expressions.
 */
export type ClauseType = 'while' | 'when' | 'where' | 'if';

/**
 * The semantic role a matched term plays in a requirement.
 *
 * Ported verbatim from the Go reference `TermRole`. Catalog groups map one to
 * one onto these roles (for example `systems` entries carry role `system`).
 */
export type TermRole =
  'system' | 'actor' | 'event' | 'state' | 'feature' | 'mode' | 'condition' | 'data-term';

/**
 * A half-open source offset range `[start, end)`.
 *
 * Offsets are 0-based character indices into the requirement text. `end` is
 * exclusive. Spans are preserved through parsing so tools can point at the
 * exact substring a diagnostic or term refers to.
 */
export interface Span {
  /** 0-based inclusive start offset in the input text. */
  start: number;
  /** 0-based exclusive end offset in the input text. */
  end: number;
}

/**
 * A single catalog entry: one canonical named concept plus optional aliases.
 */
export interface CatalogEntry {
  /** Stable identifier for the entry (for example `SYS-BILLING`). */
  id: string;
  /** Canonical display name matched against requirement text. */
  name: string;
  /** Optional alternative spellings that also match this entry. */
  aliases?: string[];
}

/**
 * A user-supplied catalog of known domain terms grouped by role.
 *
 * Each group is optional. Matching is deterministic: exact canonical name,
 * then exact alias, then ambiguous (more than one match), then unresolved
 * (no match). No fuzzy or semantic matching is performed.
 */
export interface Catalog {
  /** Entries whose role is `system`. */
  systems?: CatalogEntry[];
  /** Entries whose role is `actor`. */
  actors?: CatalogEntry[];
  /** Entries whose role is `event`. */
  events?: CatalogEntry[];
  /** Entries whose role is `state`. */
  states?: CatalogEntry[];
  /** Entries whose role is `feature`. */
  features?: CatalogEntry[];
  /** Entries whose role is `mode`. */
  modes?: CatalogEntry[];
  /** Entries whose role is `condition`. */
  conditions?: CatalogEntry[];
  /** Entries whose role is `data-term`. */
  dataTerms?: CatalogEntry[];
}

/**
 * A resolved pointer to the catalog entry a term matched.
 *
 * Ported from the Go reference `CatalogRef`. `group` is the catalog group name
 * (for example `systems`), not the {@link TermRole}.
 */
export interface CatalogRef {
  /** Catalog group the entry belongs to (for example `systems`). */
  group: string;
  /** Identifier of the matched {@link CatalogEntry}. */
  id: string;
  /** Canonical name of the matched {@link CatalogEntry}. */
  name: string;
}

/**
 * The result of attempting to match a single raw term against the catalog.
 *
 * Ported from the Go reference `TermMatch`. Exactly one outcome applies:
 * a single `matched` entry, a non-empty `ambiguous` list, or `unresolved`.
 * When the catalog is absent the term is neither matched nor unresolved.
 */
export interface TermMatch {
  /** The raw term text as it appeared in the requirement. */
  raw: string;
  /** The role this term was expected to play. */
  role: TermRole;
  /** The single catalog entry matched, when the match is unambiguous. */
  matched?: CatalogRef;
  /** All candidate entries, when more than one entry matched. */
  ambiguous?: CatalogRef[];
  /** `true` when a catalog was supplied but no entry matched. */
  unresolved?: boolean;
  /** `true` when the match was via an alias rather than the canonical name. */
  viaAlias?: boolean;
}

/**
 * A catalog reference discovered somewhere in a requirement, with its clause
 * context and source span.
 *
 * Ported from the Go reference `ReferenceMatch`. Collected into
 * {@link LintResult.references} so tools can report every catalog touch point.
 */
export interface ReferenceMatch {
  /** Where the reference was found (for example `system`, `trigger`). */
  clause: string;
  /** The raw reference text. */
  text: string;
  /** The role this reference was matched under. */
  role: TermRole;
  /** The single catalog entry matched, when the match is unambiguous. */
  matched?: CatalogRef;
  /** All candidate entries, when more than one entry matched. */
  ambiguous?: CatalogRef[];
  /** `true` when a catalog was supplied but no entry matched. */
  unresolved?: boolean;
  /** `true` when the match was via an alias rather than the canonical name. */
  viaAlias?: boolean;
  /** Source span of the reference in the requirement text, when known. */
  span?: Span;
}

/**
 * The complete registry of diagnostic codes the toolkit can emit.
 *
 * This union is append-only once fixtures depend on it. It contains:
 * - The 24 codes from the orchestration diagnostic table.
 * - Two Go reference extras: `expr.mixed_unresolved_terms` and
 *   `catalog.term_unreferenced`.
 * - The generated `catalog.<role>_unresolved` / `catalog.<role>_ambiguous`
 *   family for roles `system`, `state`, `event`, and `feature`.
 */
export type DiagnosticCode =
  // EARS shell diagnostics.
  | 'ears.no_match'
  | 'ears.invalid_clause_order'
  | 'ears.missing_system'
  | 'ears.missing_shall'
  | 'ears.multiple_shall'
  | 'ears.invalid_if_then_form'
  | 'ears.empty_clause'
  | 'ears.empty_response'
  // Expression diagnostics.
  | 'expr.unbalanced_parentheses'
  | 'expr.invalid_operator_sequence'
  | 'expr.empty_subexpression'
  | 'expr.operator_precedence_warning'
  | 'expr.unknown_term'
  | 'expr.ambiguous_term'
  | 'expr.mixed_unresolved_terms'
  // Catalog diagnostics: system role.
  | 'catalog.system_unresolved'
  | 'catalog.system_ambiguous'
  // Catalog diagnostics: state role.
  | 'catalog.state_unresolved'
  | 'catalog.state_ambiguous'
  // Catalog diagnostics: event role.
  | 'catalog.event_unresolved'
  | 'catalog.event_ambiguous'
  // Catalog diagnostics: feature role.
  | 'catalog.feature_unresolved'
  | 'catalog.feature_ambiguous'
  // Catalog coverage.
  | 'catalog.term_unreferenced'
  // Lint diagnostics.
  | 'lint.multiple_responses'
  | 'lint.vague_response'
  | 'lint.unparsed_tail'
  | 'lint.alias_used'
  | 'lint.suspicious_text_shape'
  // Host-native grammar diagnostics. Introduced by the host-native grammar
  // work; these have no legacy code they migrate from, but the dotted form
  // registers as an alias like every other code.
  | 'ears.keyword_case'
  | 'ears.missing_leading_comma'
  | 'ears.prohibition_not_allowed';

/**
 * A single machine-readable finding about a requirement.
 *
 * Ported from the Go reference `Diagnostic`, with `code` narrowed to the
 * frozen {@link DiagnosticCode} registry. Diagnostics are stably sorted by
 * span, then code, then message, then severity.
 */
export interface Diagnostic {
  /** The registered diagnostic code. */
  code: DiagnosticCode;
  /** Severity, which drives {@link LintResult.valid}. */
  severity: Severity;
  /** Human-readable explanation of the finding. */
  message: string;
  /** Source span the finding refers to, when known. */
  span?: Span;
}

/**
 * A clause expression node.
 *
 * Discriminated on `kind`. Built by parsing the boolean-like body of a
 * `While`, `Where`, `When`, or `If` clause. Precedence is `not > and > or`.
 */
export type ClauseExpr = TermExpr | AndExpr | OrExpr | NotExpr | GroupExpr | FreeTextExpr;

/**
 * A leaf clause term (for example `the payment provider is unavailable`).
 */
export interface TermExpr {
  kind: 'term';
  /** Source span of the term, when known. */
  span?: Span;
  /** The raw term text. */
  text: string;
  /** Catalog match result for the term, when catalog matching ran. */
  term?: TermMatch;
}

/**
 * A conjunction of two or more operands (`A and B`).
 */
export interface AndExpr {
  kind: 'and';
  /** Source span covering the whole conjunction, when known. */
  span?: Span;
  /** The conjoined operands, in source order. */
  items: ClauseExpr[];
}

/**
 * A disjunction of two or more operands (`A or B`).
 */
export interface OrExpr {
  kind: 'or';
  /** Source span covering the whole disjunction, when known. */
  span?: Span;
  /** The disjoined operands, in source order. */
  items: ClauseExpr[];
}

/**
 * A negation of a single operand (`not A`).
 */
export interface NotExpr {
  kind: 'not';
  /** Source span covering the negation, when known. */
  span?: Span;
  /** The negated operand. */
  item: ClauseExpr;
}

/**
 * A parenthesized group wrapping a single operand (`(A or B)`).
 */
export interface GroupExpr {
  kind: 'group';
  /** Source span covering the group including parentheses, when known. */
  span?: Span;
  /** The grouped operand. */
  item: ClauseExpr;
}

/**
 * A clause body that could not be parsed as a boolean expression and is kept
 * verbatim as free text.
 */
export interface FreeTextExpr {
  kind: 'free-text';
  /** Source span of the free text, when known. */
  span?: Span;
  /** The raw clause body. */
  text: string;
}

/**
 * The parsed abstract syntax tree of one EARS requirement.
 *
 * Which optional clause fields are present depends on {@link EarsAst.pattern}.
 * `system`, `responses`, and `raw` are always present.
 */
export interface EarsAst {
  /** The classified shell pattern. */
  pattern: Pattern;
  /** State/optional preconditions (`While` / `Where` clause bodies). */
  preconditions?: ClauseExpr;
  /** Event trigger (`When` clause body). */
  trigger?: ClauseExpr;
  /** Optional feature condition (`Where` clause body). */
  feature?: ClauseExpr;
  /** Unwanted-behaviour condition (`If` clause body). */
  unwanted?: ClauseExpr;
  /** The system the requirement constrains. */
  system: TermMatch;
  /** Response phrases after `shall`, split on semicolons. */
  responses: string[];
  /** The original requirement text. */
  raw: string;
  /**
   * `true` when the requirement is a prohibition (`shall not`) accepted because
   * the active dialect sets {@link DialectOptions.allowProhibition}. Absent or
   * `false` for an ordinary `shall` obligation. See `docs/contracts/profile.md`.
   */
  prohibition?: boolean;
}

/**
 * Grammar tolerances an EARS dialect applies during parsing and linting.
 *
 * These mirror the `dialect` block of a profile (see `docs/contracts/profile.md`,
 * "dialect"). Every field is optional; an absent field takes the canonical
 * strict default (strict keyword casing, no literal system names, a required
 * leading comma, and no story wrapper, frame metadata, or prohibition).
 */
export interface DialectOptions {
  /**
   * `strict`: EARS keywords must match canonical casing (`When`, `While`,
   * `Where`, `If`, `shall`). `case-insensitive`: any casing is accepted.
   */
  keywordCase?: 'strict' | 'case-insensitive';
  /**
   * Literal system phrases accepted in place of `the <system>` (for example
   * `['THE SYSTEM']`). Absent or empty means only the canonical form is valid.
   */
  allowLiteralSystemName?: string[];
  /**
   * `required`: a leading `When`/`While`/`Where`/`If` clause must be followed by
   * a comma before the main clause. `optional`: the comma may be absent.
   */
  commaAfterLeadingClause?: 'required' | 'optional';
  /**
   * When `true`, user-story frame lines (for example `As a user, I want ...`)
   * are treated as non-requirement frame content and skipped, not parsed.
   */
  allowStoryWrapper?: boolean;
  /**
   * When `true`, `REQ-###` frame ids and `[source: path:line]` tags are accepted
   * as metadata prefixes on a requirement line.
   */
  allowFrameMetadata?: boolean;
  /**
   * When `true`, `shall not` is accepted as a prohibition kind. When `false` or
   * absent, `shall not` is rejected (canonical Mavin EARS has no prohibition
   * template).
   */
  allowProhibition?: boolean;
}

/**
 * Options that tune parsing and linting behavior.
 *
 * Defaults (applied by the core integration layer): `mode` is `strict`,
 * `commaAsAnd` is `false`, and `vagueTerms` is `['appropriate', 'sufficient',
 * 'as needed']`.
 */
export interface Options {
  /** Linting strictness. Defaults to `strict`. */
  mode?: Mode;
  /** Treat unambiguous commas inside clause bodies as `and`. Defaults to `false`. */
  commaAsAnd?: boolean;
  /** Terms flagged as vague when they appear in a response. */
  vagueTerms?: string[];
  /**
   * Grammar tolerances applied while parsing and linting. Defaults to the
   * canonical strict dialect when absent. See `docs/contracts/profile.md`.
   */
  dialect?: DialectOptions;
}

/**
 * The origin of a requirement in a source file.
 *
 * Populated by extractors so diagnostics can be traced back to their file
 * and position. All fields are optional.
 */
export interface SourceLocation {
  /** Path of the source file. */
  file?: string;
  /** 1-based line number within the file. */
  line?: number;
  /** 1-based column number within the line. */
  column?: number;
}

/**
 * One requirement to lint, with an optional id and source origin.
 *
 * Used by {@link LintResult} batch APIs and produced by extractors.
 */
export interface RequirementInput {
  /** Caller-supplied identifier, echoed back on the result. */
  id?: string;
  /** The requirement text to parse and lint. */
  text: string;
  /** Where the requirement came from, when known. */
  source?: SourceLocation;
}

/**
 * The full result of linting one requirement.
 *
 * `valid` is derived only from diagnostic severity: `false` if any diagnostic
 * is an `error`, otherwise `true`.
 */
export interface LintResult {
  /** Echo of {@link RequirementInput.id}, when one was supplied. */
  id?: string;
  /** `false` when any diagnostic has severity `error`. */
  valid: boolean;
  /** The classified pattern, when the requirement parsed. */
  pattern?: Pattern;
  /** The parsed AST, when available. */
  ast?: EarsAst;
  /** Every catalog reference found, in stable order. */
  references: ReferenceMatch[];
  /** Every finding, stably sorted. */
  diagnostics: Diagnostic[];
}

/**
 * The result of parsing (without full linting) one requirement.
 *
 * A lighter surface than {@link LintResult}: it carries the pattern, AST, and
 * any structural diagnostics, but not catalog references or lint findings.
 */
export interface ParseResult {
  /** The classified pattern, when the requirement parsed. */
  pattern?: Pattern;
  /** The parsed AST, when available. */
  ast?: EarsAst;
  /** Structural findings from parsing, stably sorted. */
  diagnostics: Diagnostic[];
}
