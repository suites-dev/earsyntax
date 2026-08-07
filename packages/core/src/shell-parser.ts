/**
 * The outer EARS sentence parser.
 *
 * This module owns shell-level concerns only: tokenizing the leading clause
 * keywords (`While`, `Where`, `When`, `If ... then`), detecting clause
 * boundaries, classifying the shell {@link Pattern}, and extracting the
 * `the <system> shall <response>` tail. It deliberately does NOT parse the
 * boolean internals of a clause body (the expression parser owns that) and
 * does NOT touch a catalog (the catalog matcher owns that).
 *
 * Clause bodies are emitted as {@link FreeTextExpr} nodes carrying a span into
 * the original input. A later integration layer may re-parse those bodies into
 * boolean expressions and split responses on semicolons.
 *
 * Findings are returned as raw {@link ShellFinding} records (code plus optional
 * span and context). Severity, message wording, and stable ordering are the
 * responsibility of the separate diagnostics module.
 *
 * Accepted clause order: `While* -> Where* -> When* -> If*`, followed by the
 * mandatory `the <system> shall <response>` tail.
 *
 * Determinism note: no dependencies, no file system, no network, no fuzzy
 * matching. The same input always yields the same result.
 */

import { STRICT_DIALECT, type ResolvedDialect } from './options.js';
import type {
  ClauseExpr,
  DiagnosticCode,
  EarsAst,
  FreeTextExpr,
  Pattern,
  Span,
  TermMatch,
} from './types.js';

/**
 * A raw structural finding produced by the shell parser.
 *
 * The diagnostics module maps `code` to a severity and message; the shell
 * parser only reports what it observed and where.
 */
export interface ShellFinding {
  /** The registered diagnostic code for the observed condition. */
  code: DiagnosticCode;
  /** Source span the finding refers to, when known. */
  span?: Span;
  /** Optional extra context (for example the raw text the finding is about). */
  context?: string;
}

/**
 * The result of a shell parse.
 *
 * `ast` is present when a `the <system> shall <response>` tail was recovered,
 * even if soft findings (such as `ears.invalid_clause_order`) were also
 * reported. It is absent when parsing failed structurally.
 */
export interface ShellParseResult {
  /** The recovered partial AST, when a system-and-response tail was found. */
  ast?: EarsAst;
  /** Every raw structural finding, in the order they were observed. */
  findings: ShellFinding[];
}

/** The four EARS shell clause keywords. */
type ClauseKind = 'while' | 'where' | 'when' | 'if';

/** An extracted clause: its keyword kind, body text, and body span. */
interface ClauseSlot {
  kind: ClauseKind;
  text: string;
  span: Span;
}

/**
 * Options that influence shell tokenization.
 */
export interface ShellParseOptions {
  /**
   * Treat commas inside a clause body as `and` rather than clause separators.
   *
   * When `true`, a comma followed by `the` ends the clause only if that `the`
   * begins the mandatory system tail (`the ... shall`, with no comma between
   * `the` and `shall`). A comma followed by another shell keyword (`while`,
   * `when`, `where`, `if`) always ends the clause. When `false` (the default),
   * a comma followed by any shell keyword (including `the`) ends the clause.
   */
  commaAsAnd?: boolean;
  /**
   * The resolved dialect tolerances the parser applies. When absent the parser
   * uses {@link STRICT_DIALECT}: canonical keyword casing, a required leading
   * comma, no literal system names, no frame metadata, and no prohibition.
   */
  dialect?: ResolvedDialect;
}

/**
 * Parse one EARS requirement into a partial AST plus raw structural findings.
 *
 * @param input The requirement text. Spans in the result are 0-based offsets
 *   into this exact string (`end` exclusive).
 * @param options Optional shell tokenization options.
 */
export function parseShell(input: string, options?: ShellParseOptions): ShellParseResult {
  const parser = new ShellParser(
    input,
    options?.commaAsAnd ?? false,
    options?.dialect ?? STRICT_DIALECT,
  );
  return parser.run();
}

class ShellParser {
  private readonly text: string;
  private readonly commaAsAnd: boolean;
  private readonly dialect: ResolvedDialect;
  private readonly findings: ShellFinding[] = [];
  private readonly clauses: ClauseSlot[] = [];
  private pos = 0;
  /** Effective start of the EARS sentence, after any stripped frame-metadata prefix. */
  private start = 0;

  constructor(input: string, commaAsAnd: boolean, dialect: ResolvedDialect) {
    this.text = input;
    this.commaAsAnd = commaAsAnd;
    this.dialect = dialect;
  }

  run(): ShellParseResult {
    let firstNonWs = skipWS(this.text, 0);
    if (firstNonWs >= this.text.length) {
      this.add('ears.no_match');
      return { findings: this.findings };
    }

    // A frame-metadata `REQ-###` id prefix is not part of the EARS sentence.
    // When the dialect accepts frame metadata, skip it so the sentence that
    // follows parses on its own terms; otherwise it flows through as ordinary
    // leading text and surfaces whatever diagnostic naturally results.
    if (this.dialect.allowFrameMetadata) {
      firstNonWs = skipFrameMetadataPrefix(this.text, firstNonWs);
    }

    const shallCount = countShall(this.text);
    if (shallCount === 0) {
      this.add('ears.missing_shall');
    } else if (shallCount > 1) {
      this.add('ears.multiple_shall');
    }

    this.start = firstNonWs;
    this.pos = firstNonWs;
    const ast = this.parse();
    return ast ? { ast, findings: this.findings } : { findings: this.findings };
  }

  private parse(): EarsAst | undefined {
    // Leading clauses: While* -> Where* -> When* -> If*, in any observed order.
    // Order is validated after the tail is found; here we only tokenize.
    for (;;) {
      this.pos = skipWS(this.text, this.pos);
      if (this.peekKeyword('while')) {
        this.consumeClauseKeyword('while');
        this.pushClause(this.scanCommaClause('while'));
      } else if (this.peekKeyword('when')) {
        this.consumeClauseKeyword('when');
        this.pushClause(this.scanCommaClause('when'));
      } else if (this.peekKeyword('where')) {
        this.consumeClauseKeyword('where');
        this.pushClause(this.scanCommaClause('where'));
      } else if (this.peekKeyword('if')) {
        this.consumeClauseKeyword('if');
        const ifClause = this.scanIfClause();
        if (!ifClause) {
          return undefined;
        }
        this.pushClause(ifClause);
      } else {
        break;
      }
    }

    // Mandatory tail: the <system> shall <response>. A dialect that accepts a
    // literal system name (for example `THE SYSTEM`) may substitute it for the
    // canonical `the <system>` form.
    let systemStart: number;
    const literalLen = this.matchLiteralSystemName();
    if (literalLen > 0) {
      systemStart = this.pos;
    } else if (this.consumeKeyword('the')) {
      systemStart = this.pos;
    } else {
      this.add(this.clauses.length === 0 ? 'ears.no_match' : 'ears.missing_system');
      return undefined;
    }

    const shallIdx = findWordFrom(this.text, systemStart, 'shall');
    if (shallIdx < 0) {
      this.add('ears.missing_shall');
      return undefined;
    }
    this.checkKeywordCase('shall', shallIdx, false);

    const systemSpan = trimmedSpan(this.text, systemStart, shallIdx);
    const systemRaw = this.text.slice(systemSpan.start, systemSpan.end);
    if (systemRaw === '') {
      this.add('ears.missing_system', systemSpan);
    }

    this.pos = shallIdx + 'shall'.length;
    let responseRaw = this.text.slice(this.pos).trim();
    // A trailing `[source: path:line]` tag is frame metadata, not part of the
    // response; strip it when the dialect accepts frame metadata.
    if (this.dialect.allowFrameMetadata) {
      responseRaw = stripTrailingSourceTag(responseRaw);
    }
    if (responseRaw.endsWith('.')) {
      responseRaw = responseRaw.slice(0, -1).trimEnd();
    }

    // A `shall not` response is a prohibition. Canonical EARS has no prohibition
    // template, so a strict dialect rejects it; a dialect that permits it marks
    // the requirement so downstream verification can treat it as an absence.
    let prohibition = false;
    if (/^not\b/i.test(responseRaw)) {
      if (this.dialect.allowProhibition) {
        prohibition = true;
      } else {
        const notStart = skipWS(this.text, this.pos);
        this.add('ears.prohibition_not_allowed', { start: shallIdx, end: notStart + 'not'.length });
      }
    }

    if (responseRaw === '') {
      const responseSpan = trimmedSpan(this.text, this.pos, this.text.length);
      this.add('ears.empty_response', responseSpan);
      return undefined;
    }

    if (!validClauseOrder(this.clauses)) {
      this.add('ears.invalid_clause_order');
    }
    this.validateCardinality();

    // `then` is the discriminator for the unwanted-behaviour form; outside an
    // `If ... then` requirement it is not part of the EARS grammar.
    if (
      !this.clauses.some((clause) => clause.kind === 'if') &&
      hasTopLevelThen(this.text, this.start)
    ) {
      this.add('ears.invalid_if_then_form');
    }

    return {
      pattern: classifyPattern(this.clauses),
      ...buildClauseFields(this.clauses),
      system: { raw: systemRaw, role: 'system' } satisfies TermMatch,
      responses: [responseRaw],
      raw: this.text,
      ...(prohibition ? { prohibition: true } : {}),
    };
  }

  /**
   * Extract a leading clause body, tracking parenthesis depth.
   *
   * A leading clause is delimited from the main clause by a comma. When the
   * comma is absent the clause runs into the system tail; this method locates
   * that tail so it can still recover a clause and, when the dialect requires
   * the comma, report `ears.missing_leading_comma`.
   */
  private scanCommaClause(kind: ClauseKind): ClauseSlot {
    const start = this.pos;
    const { end, next, comma } = scanUntilClauseBoundary(this.text, this.pos, this.commaAsAnd);
    if (comma) {
      this.pos = next;
      return this.makeClause(kind, start, end);
    }

    // No comma delimiter was found. Recover the clause boundary at the system
    // tail (`the <system> shall`) when one is present, so a missing comma still
    // yields a parseable requirement rather than a swallowed tail.
    const tail = findSystemTailThe(this.text, start);
    if (tail > start) {
      if (this.dialect.commaAfterLeadingClause === 'required') {
        this.add('ears.missing_leading_comma', { start, end: tail });
      }
      this.pos = tail;
      return this.makeClause(kind, start, tail);
    }

    this.pos = next;
    return this.makeClause(kind, start, end);
  }

  /**
   * Extract an `If ... then ...` clause body.
   *
   * Returns `undefined` (fatal) only when a `then` boundary exists but is not
   * followed by `the`. A missing `then` is reported as a soft finding and the
   * clause is recovered by scanning to the next clause boundary.
   */
  private scanIfClause(): ClauseSlot | undefined {
    const start = this.pos;
    const thenIdx = findThenBoundary(this.text, this.pos);
    if (thenIdx < 0) {
      this.add('ears.invalid_if_then_form', { start, end: this.text.length });
      const { end, next } = scanUntilClauseBoundary(this.text, this.pos, this.commaAsAnd);
      this.pos = next;
      return this.makeClause('if', start, end);
    }

    this.checkKeywordCase('then', thenIdx, false);
    let end = thenIdx;
    // Drop a trailing comma before `then`, if present.
    const beforeThen = this.text.slice(start, thenIdx).trimEnd();
    if (beforeThen.endsWith(',')) {
      end = start + beforeThen.length - 1;
    }

    this.pos = skipWS(this.text, thenIdx + 'then'.length);
    if (!this.peekKeyword('the')) {
      this.add('ears.invalid_if_then_form', { start, end: thenIdx });
      return undefined;
    }
    return this.makeClause('if', start, end);
  }

  private makeClause(kind: ClauseKind, start: number, end: number): ClauseSlot {
    const span = trimmedSpan(this.text, start, end);
    const body = this.text.slice(span.start, span.end);
    if (body === '') {
      this.add('ears.empty_clause', span);
    }
    return { kind, text: body, span };
  }

  private pushClause(clause: ClauseSlot): void {
    this.clauses.push(clause);
  }

  private validateCardinality(): void {
    const counts: Record<ClauseKind, number> = { while: 0, where: 0, when: 0, if: 0 };
    for (const clause of this.clauses) {
      counts[clause.kind]++;
    }
    // `when` and `if` are distinct trigger kinds. A `when` followed by an `if`
    // is a valid complex requirement; only a repeat of the same kind is invalid.
    if (counts.when > 1) {
      this.add('ears.invalid_clause_order');
    }
    if (counts.where > 1) {
      this.add('ears.invalid_clause_order');
    }
    if (counts.if > 1) {
      this.add('ears.invalid_if_then_form');
    }
  }

  private add(code: DiagnosticCode, span?: Span, context?: string): void {
    this.findings.push({ code, ...(span ? { span } : {}), ...(context ? { context } : {}) });
  }

  private peekKeyword(keyword: string): boolean {
    return hasWordAt(this.text, this.pos, keyword);
  }

  private consumeKeyword(keyword: string): boolean {
    if (!this.peekKeyword(keyword)) {
      return false;
    }
    this.pos = skipWS(this.text, this.pos + keyword.length);
    return true;
  }

  /**
   * Consume a leading clause keyword, checking its casing first. The first
   * keyword of the sentence is sentence-initial (capitalized in Mavin's
   * templates); a later clause keyword is mid-sentence and lowercase.
   */
  private consumeClauseKeyword(keyword: ClauseKind): void {
    this.checkKeywordCase(keyword, this.pos, this.pos === this.start);
    this.pos = skipWS(this.text, this.pos + keyword.length);
  }

  /**
   * Report `ears.keyword_case` when a keyword at `pos` does not match its
   * canonical casing under a strict dialect. Clause keywords are capitalized
   * sentence-initially and lowercase mid-sentence; `shall` and `then` are always
   * lowercase. A case-insensitive dialect performs no check.
   */
  private checkKeywordCase(keyword: string, pos: number, sentenceInitial: boolean): void {
    if (this.dialect.keywordCase !== 'strict') {
      return;
    }
    const actual = this.text.slice(pos, pos + keyword.length);
    const expected = expectedKeywordCasing(keyword, sentenceInitial);
    if (actual !== expected) {
      this.add('ears.keyword_case', { start: pos, end: pos + keyword.length }, actual);
    }
  }

  /**
   * When the current position begins a literal system phrase the dialect
   * accepts (for example `THE SYSTEM`), return its length so the tail parser can
   * take it in place of the canonical `the <system>` form. Returns `0` otherwise.
   */
  private matchLiteralSystemName(): number {
    for (const name of this.dialect.allowLiteralSystemName) {
      if (name !== '' && hasPhraseAt(this.text, this.pos, name)) {
        return name.length;
      }
    }
    return 0;
  }
}

/** The clause-derived optional fields of an {@link EarsAst}. */
type ClauseFields = Pick<EarsAst, 'preconditions' | 'trigger' | 'feature' | 'unwanted'>;

/**
 * Build the clause fields for the AST from the extracted clauses.
 *
 * Each clause body becomes a {@link FreeTextExpr}. Repeated same-kind clauses
 * are `and`-joined. `If` maps to `unwanted`, `When` to `trigger`, `Where` to
 * `feature`, and `While` to `preconditions`.
 */
function buildClauseFields(clauses: readonly ClauseSlot[]): ClauseFields {
  const fields: ClauseFields = {};
  for (const clause of clauses) {
    const node: FreeTextExpr = { kind: 'free-text', span: clause.span, text: clause.text };
    switch (clause.kind) {
      case 'while':
        fields.preconditions = combine(fields.preconditions, node);
        break;
      case 'when':
        fields.trigger = combine(fields.trigger, node);
        break;
      case 'where':
        fields.feature = combine(fields.feature, node);
        break;
      case 'if':
        fields.unwanted = node;
        break;
    }
  }
  return fields;
}

/** Combine a same-kind clause node into an existing slot, `and`-joining them. */
function combine(existing: ClauseExpr | undefined, node: ClauseExpr): ClauseExpr {
  if (!existing) {
    return node;
  }
  const items = existing.kind === 'and' ? [...existing.items, node] : [existing, node];
  const start = existing.span?.start;
  const end = node.span?.end;
  const span = start !== undefined && end !== undefined ? { start, end } : undefined;
  return { kind: 'and', items, ...(span ? { span } : {}) };
}

function classifyPattern(clauses: readonly ClauseSlot[]): Pattern {
  if (clauses.length === 0) {
    return 'ubiquitous';
  }
  if (clauses.length === 1) {
    switch (clauses[0].kind) {
      case 'while':
        return 'state-driven';
      case 'when':
        return 'event-driven';
      case 'where':
        return 'optional-feature';
      case 'if':
        return 'unwanted-behaviour';
    }
  }
  return 'complex';
}

/**
 * Validate the accepted clause order `While* -> Where* -> When* -> If*`.
 *
 * A clause whose rank is lower than a previously seen clause's rank breaks the
 * order.
 */
function validClauseOrder(clauses: readonly ClauseSlot[]): boolean {
  const rank: Record<ClauseKind, number> = { while: 1, where: 2, when: 3, if: 4 };
  let max = 0;
  for (const clause of clauses) {
    const v = rank[clause.kind];
    if (v < max) {
      return false;
    }
    max = v;
  }
  return true;
}

const SHALL_RE = /\bshall\b/gi;

function countShall(text: string): number {
  const matches = text.match(SHALL_RE);
  return matches ? matches.length : 0;
}

function skipWS(text: string, pos: number): number {
  let cursor = pos;
  while (cursor < text.length && isWhitespace(text.charCodeAt(cursor))) {
    cursor++;
  }
  return cursor;
}

function isWhitespace(code: number): boolean {
  // space, tab, newline, carriage return.
  return code === 32 || code === 9 || code === 10 || code === 13;
}

function isWordChar(code: number): boolean {
  return (
    (code >= 97 && code <= 122) || // a-z
    (code >= 65 && code <= 90) || // A-Z
    (code >= 48 && code <= 57) || // 0-9
    code === 95 // _
  );
}

/** Case-insensitive whole-word match of `word` at `pos`. */
function hasWordAt(text: string, pos: number, word: string): boolean {
  if (pos < 0 || pos + word.length > text.length) {
    return false;
  }
  if (text.slice(pos, pos + word.length).toLowerCase() !== word.toLowerCase()) {
    return false;
  }
  const beforeOk = pos === 0 || !isWordChar(text.charCodeAt(pos - 1));
  const afterPos = pos + word.length;
  const afterOk = afterPos >= text.length || !isWordChar(text.charCodeAt(afterPos));
  return beforeOk && afterOk;
}

function hasAnyKeywordAt(text: string, pos: number, keywords: readonly string[]): boolean {
  return keywords.some((kw) => hasWordAt(text, pos, kw));
}

/** Case-insensitive whole-phrase match of `phrase` at `pos` (word-bounded). */
function hasPhraseAt(text: string, pos: number, phrase: string): boolean {
  if (pos + phrase.length > text.length) {
    return false;
  }
  if (text.slice(pos, pos + phrase.length).toLowerCase() !== phrase.toLowerCase()) {
    return false;
  }
  const beforeOk = pos === 0 || !isWordChar(text.charCodeAt(pos - 1));
  const afterPos = pos + phrase.length;
  const afterOk = afterPos >= text.length || !isWordChar(text.charCodeAt(afterPos));
  return beforeOk && afterOk;
}

/**
 * The canonical casing a keyword must carry under a strict dialect. Clause
 * keywords (`while`, `when`, `where`, `if`) are capitalized when they open the
 * sentence and lowercase when they appear mid-sentence; `shall` and `then` are
 * always lowercase.
 */
function expectedKeywordCasing(keyword: string, sentenceInitial: boolean): string {
  if (keyword === 'shall' || keyword === 'then') {
    return keyword;
  }
  return sentenceInitial ? keyword[0].toUpperCase() + keyword.slice(1) : keyword;
}

const FRAME_ID_PREFIX_RE = /^REQ-\d+[.:)\]]?\s+/i;

/**
 * Skip a leading `REQ-###` frame-metadata id prefix starting at `from`, returning
 * the offset of the first character after it. When no such prefix is present the
 * input offset is returned unchanged.
 */
function skipFrameMetadataPrefix(text: string, from: number): number {
  const match = FRAME_ID_PREFIX_RE.exec(text.slice(from));
  return match ? skipWS(text, from + match[0].length) : from;
}

const TRAILING_SOURCE_TAG_RE = /\s*\[source:[^\]]*\]\s*\.?\s*$/i;

/**
 * Strip a trailing `[source: path:line]` frame-metadata tag (and any trailing
 * period it precedes) from a response string. Returns the response unchanged
 * when no such tag is present.
 */
function stripTrailingSourceTag(response: string): string {
  return response.replace(TRAILING_SOURCE_TAG_RE, '').trimEnd();
}

function findWordFrom(text: string, pos: number, word: string): number {
  for (let i = pos; i < text.length; i++) {
    if (hasWordAt(text, i, word)) {
      return i;
    }
  }
  return -1;
}

/** Find a top-level (paren-depth-0) `then` boundary from `start`. */
function findThenBoundary(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') {
      depth++;
    } else if (ch === ')' && depth > 0) {
      depth--;
    }
    if (depth === 0 && hasWordAt(text, i, 'then')) {
      return i;
    }
  }
  return -1;
}

const LEADING_CLAUSE_KEYWORDS: readonly string[] = ['while', 'when', 'where', 'if'];

/**
 * Scan from `start` to the next top-level clause boundary: a comma at
 * paren-depth 0 followed by another clause keyword or the system tail.
 *
 * A comma followed by a leading clause keyword (`while`, `when`, `where`,
 * `if`) always ends the clause. A comma followed by `the` ends the clause
 * when `commaAsAnd` is `false`, or when `commaAsAnd` is `true` only if that
 * `the` begins the system tail (`the ... shall`, per {@link isSystemTail}).
 *
 * Returns the body `end` (exclusive, at the comma) and the `next` position to
 * resume parsing from (the keyword after the comma). When no boundary is
 * found, both are the end of the text.
 */
function scanUntilClauseBoundary(
  text: string,
  start: number,
  commaAsAnd: boolean,
): { end: number; next: number; comma: boolean } {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') {
      depth++;
    } else if (ch === ')' && depth > 0) {
      depth--;
    }
    if (depth === 0 && ch === ',' && isClauseBoundaryAfterComma(text, i + 1, commaAsAnd)) {
      return { end: i, next: skipWS(text, i + 1), comma: true };
    }
  }
  return { end: text.length, next: text.length, comma: false };
}

/**
 * Find the `the` that opens the system tail (`the <system> shall`) at or after
 * `from`, tracking parenthesis depth. This is the last top-level `the` before
 * the shell `shall`, so a comma-less leading clause can still be split from the
 * tail it ran into. Returns `-1` when no such `the` precedes a `shall`.
 */
function findSystemTailThe(text: string, from: number): number {
  const shallIdx = findWordFrom(text, from, 'shall');
  if (shallIdx < 0) {
    return -1;
  }
  let depth = 0;
  let last = -1;
  for (let i = from; i < shallIdx; i++) {
    const ch = text[i];
    if (ch === '(') {
      depth++;
    } else if (ch === ')' && depth > 0) {
      depth--;
    }
    if (depth === 0 && hasWordAt(text, i, 'the')) {
      last = i;
    }
  }
  return last;
}

/** Whether a top-level (paren-depth-0) `then` keyword appears from `start`. */
function hasTopLevelThen(text: string, start: number): boolean {
  return findThenBoundary(text, start) >= 0;
}

/** Whether a comma at position `commaEnd - 1` marks a clause boundary. */
function isClauseBoundaryAfterComma(text: string, commaEnd: number, commaAsAnd: boolean): boolean {
  const j = skipWS(text, commaEnd);
  if (hasAnyKeywordAt(text, j, LEADING_CLAUSE_KEYWORDS)) {
    return true;
  }
  if (!hasWordAt(text, j, 'the')) {
    return false;
  }
  // A comma + `the` ends the clause unless commaAsAnd keeps non-tail `the`
  // segments inside the body.
  return !commaAsAnd || isSystemTail(text, j);
}

/**
 * Whether the `the` at `pos` begins the system tail: a `shall` follows at
 * paren-depth 0 with no intervening top-level comma. This distinguishes the
 * real `the <system> shall` tail from a `the ...` segment that is part of a
 * comma-joined clause body.
 */
function isSystemTail(text: string, pos: number): boolean {
  let depth = 0;
  for (let i = pos; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') {
      depth++;
    } else if (ch === ')' && depth > 0) {
      depth--;
    } else if (depth === 0 && ch === ',') {
      return false;
    }
    if (depth === 0 && hasWordAt(text, i, 'shall')) {
      return true;
    }
  }
  return false;
}

/** The span of the trimmed content of `text[start:end)`. */
function trimmedSpan(text: string, start: number, end: number): Span {
  let s = start;
  let e = end;
  while (s < e && isWhitespace(text.charCodeAt(s))) {
    s++;
  }
  while (e > s && isWhitespace(text.charCodeAt(e - 1))) {
    e--;
  }
  return { start: s, end: e };
}
