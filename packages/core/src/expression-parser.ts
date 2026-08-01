/**
 * Boolean clause expression parser for EARS clause bodies.
 *
 * Parses the boolean-like body of a `While`, `Where`, `When`, or `If` clause
 * into a {@link ClauseExpr} tree. The grammar supports `and`, `or`, `not`, and
 * parenthesized groups with precedence `not > and > or`. Keywords are matched
 * case-insensitively.
 *
 * This module is a faithful port of the Go reference
 * (`ears-lint-go/expression_parser.go`). It differs in one deliberate way:
 * it emits raw {@link ExprFinding} values (code plus optional span) rather than
 * fully formed diagnostics. Severity and message are assigned downstream by the
 * diagnostics module. Term catalog resolution is left unset here; the catalog
 * module fills {@link TermExpr.term} later.
 *
 * Determinism contract: no LLM, no network, no file system, no fuzzy matching.
 * Given the same input the output tree and findings are always identical.
 */

import type {
  AndExpr,
  ClauseExpr,
  DiagnosticCode,
  FreeTextExpr,
  GroupExpr,
  NotExpr,
  Options,
  OrExpr,
  Span,
  TermExpr,
} from './types.js';

/**
 * A raw parser finding: a diagnostic code and the span it refers to.
 *
 * Unlike {@link Diagnostic}, a finding carries no severity or message. Those
 * are owned by the diagnostics module, which maps findings onto the final
 * diagnostic surface based on mode and context.
 */
export interface ExprFinding {
  /** The diagnostic code the finding maps to. */
  code: DiagnosticCode;
  /** Source span the finding refers to, when known. */
  span?: Span;
}

/**
 * The result of parsing a clause expression.
 */
export interface ParseExpressionResult {
  /** The parsed expression tree. Never null; empty input yields free text. */
  expr: ClauseExpr;
  /** Raw findings collected during tokenizing and parsing, stably ordered. */
  findings: ExprFinding[];
}

/** The subset of {@link Options} that influences parsing behavior. */
type ExpressionOptions = Pick<Options, 'commaAsAnd'>;

enum TokenKind {
  Word,
  And,
  Or,
  Not,
  LParen,
  RParen,
  Comma,
}

interface ExprToken {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
}

/**
 * Parse a clause body into a {@link ClauseExpr} tree plus raw findings.
 *
 * @param raw The clause body text (already stripped of the clause keyword).
 * @param baseOffset Absolute offset of `raw` within the original requirement
 *   text, so every emitted span points back into the source.
 * @param options Parsing options; only `commaAsAnd` affects the parse.
 * @returns The expression tree and the findings gathered while parsing.
 */
export function parseClauseExpression(
  raw: string,
  baseOffset: number,
  options: ExpressionOptions = {},
): ParseExpressionResult {
  const { tokens, findings: tokenFindings } = tokenizeExpression(raw, baseOffset);
  const parser = new ExprParser(tokens, options);

  let expr = parser.parseExpr();
  if (expr === null) {
    const span: Span = { start: baseOffset, end: baseOffset + raw.length };
    const freeText: FreeTextExpr = { kind: 'free-text', text: raw.trim(), span };
    expr = freeText;
    parser.addFinding('expr.empty_subexpression', span);
  }

  if (parser.pos < tokens.length && !parser.operatorError) {
    const start = tokens[parser.pos].start;
    const end = tokens[tokens.length - 1].end;
    parser.addFinding('lint.unparsed_tail', { start, end });
  }

  if (parser.hasAnd && parser.hasOr && !parser.hasGroup) {
    parser.addFinding('expr.operator_precedence_warning', expr.span);
  }

  const findings = sortFindings([...tokenFindings, ...parser.findings]);
  return { expr, findings };
}

function tokenizeExpression(
  raw: string,
  baseOffset: number,
): { tokens: ExprToken[]; findings: ExprFinding[] } {
  const tokens: ExprToken[] = [];
  const findings: ExprFinding[] = [];
  let depth = 0;

  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (c === '(') {
      depth++;
      tokens.push({
        kind: TokenKind.LParen,
        text: '(',
        start: baseOffset + i,
        end: baseOffset + i + 1,
      });
      i++;
      continue;
    }
    if (c === ')') {
      if (depth === 0) {
        findings.push({
          code: 'expr.unbalanced_parentheses',
          span: { start: baseOffset + i, end: baseOffset + i + 1 },
        });
      } else {
        depth--;
      }
      tokens.push({
        kind: TokenKind.RParen,
        text: ')',
        start: baseOffset + i,
        end: baseOffset + i + 1,
      });
      i++;
      continue;
    }
    if (c === ',') {
      tokens.push({
        kind: TokenKind.Comma,
        text: ',',
        start: baseOffset + i,
        end: baseOffset + i + 1,
      });
      i++;
      continue;
    }

    const start = i;
    while (i < raw.length) {
      const x = raw[i];
      if (
        x === ' ' ||
        x === '\t' ||
        x === '\n' ||
        x === '\r' ||
        x === '(' ||
        x === ')' ||
        x === ','
      ) {
        break;
      }
      i++;
    }
    const chunk = raw.slice(start, i);
    let kind = TokenKind.Word;
    switch (chunk.toLowerCase()) {
      case 'and':
        kind = TokenKind.And;
        break;
      case 'or':
        kind = TokenKind.Or;
        break;
      case 'not':
        kind = TokenKind.Not;
        break;
    }
    tokens.push({ kind, text: chunk, start: baseOffset + start, end: baseOffset + i });
  }

  if (depth > 0) {
    findings.push({
      code: 'expr.unbalanced_parentheses',
      span: { start: baseOffset, end: baseOffset + raw.length },
    });
  }

  return { tokens, findings: sortFindings(findings) };
}

/**
 * Maximum parenthesis-nesting depth the parser recurses through. Beyond this,
 * the over-deep group is reported as an empty subexpression instead of
 * recursing further, so pathological input (thousands of nested parentheses)
 * cannot overflow the JS stack. Real requirements never approach this depth.
 */
const MAX_EXPR_DEPTH = 200;

class ExprParser {
  pos = 0;
  readonly findings: ExprFinding[] = [];
  hasAnd = false;
  hasOr = false;
  hasGroup = false;
  /** Current parenthesis-nesting depth, guarded by {@link MAX_EXPR_DEPTH}. */
  private groupDepth = 0;
  /** Set once an operator error truncated the parse, to suppress a follow-on tail finding. */
  operatorError = false;

  constructor(
    private readonly tokens: ExprToken[],
    private readonly options: ExpressionOptions,
  ) {}

  parseExpr(): ClauseExpr | null {
    return this.parseOr();
  }

  private parseOr(): ClauseExpr | null {
    const left = this.parseAnd();
    if (left === null) {
      return null;
    }
    const items: ClauseExpr[] = [left];
    while (this.match(TokenKind.Or)) {
      this.hasOr = true;
      const right = this.parseAnd();
      if (right === null) {
        this.addFinding('expr.invalid_operator_sequence', this.currentSpan());
        break;
      }
      items.push(right);
    }
    if (items.length === 1) {
      return items[0];
    }
    const orExpr: OrExpr = { kind: 'or', items, span: mergeSpan(items) };
    return orExpr;
  }

  private parseAnd(): ClauseExpr | null {
    const left = this.parseUnary();
    if (left === null) {
      return null;
    }
    const items: ClauseExpr[] = [left];
    for (;;) {
      if (this.match(TokenKind.And)) {
        this.hasAnd = true;
      } else if (this.options.commaAsAnd && this.match(TokenKind.Comma)) {
        this.hasAnd = true;
      } else {
        break;
      }
      const right = this.parseUnary();
      if (right === null) {
        this.addFinding('expr.invalid_operator_sequence', this.currentSpan());
        break;
      }
      items.push(right);
    }
    if (items.length === 1) {
      return items[0];
    }
    const andExpr: AndExpr = { kind: 'and', items, span: mergeSpan(items) };
    return andExpr;
  }

  private parseUnary(): ClauseExpr | null {
    // Collect a leading run of `not` keywords iteratively rather than recursing
    // once per keyword. A `not not not ...` chain of unbounded length would
    // otherwise recurse until the JS stack overflows (core must never throw on
    // user input). The tree is identical to the recursive form: each keyword
    // wraps the operand in one more negation, innermost first.
    const notStarts: number[] = [];
    while (this.peek(TokenKind.Not)) {
      notStarts.push(this.tokens[this.pos].start);
      this.pos++;
    }
    if (notStarts.length === 0) {
      return this.parsePrimary();
    }

    const inner = this.parsePrimary();
    if (inner === null) {
      this.addFinding('expr.invalid_operator_sequence', this.currentSpan());
      const dangling: FreeTextExpr = { kind: 'free-text', text: 'not' };
      return dangling;
    }

    let node: ClauseExpr = inner;
    for (let k = notStarts.length - 1; k >= 0; k--) {
      // Each negation's span reaches from its own `not` keyword to the end of
      // the operand it negates, so it covers the keyword rather than starting at
      // the inner term.
      const span: Span | undefined =
        node.span === undefined ? undefined : { start: notStarts[k], end: node.span.end };
      const notExpr: NotExpr = span ? { kind: 'not', item: node, span } : { kind: 'not', item: node };
      node = notExpr;
    }
    return node;
  }

  private parsePrimary(): ClauseExpr | null {
    if (this.peek(TokenKind.LParen)) {
      const open = this.tokens[this.pos];
      this.pos++;
      this.hasGroup = true;

      // Empty group `()`: emit a single empty_subexpression finding and
      // consume both parens. Handling it here keeps the closing paren from
      // being mistaken for an invalid operator sequence.
      if (this.peek(TokenKind.RParen)) {
        const close = this.tokens[this.pos];
        this.pos++;
        const span: Span = { start: open.start, end: close.end };
        this.addFinding('expr.empty_subexpression', span);
        const emptyItem: FreeTextExpr = { kind: 'free-text', text: '', span };
        const emptyGroup: GroupExpr = { kind: 'group', item: emptyItem, span };
        return emptyGroup;
      }

      // Guard the parse depth before recursing into the group body. Past the
      // limit the over-deep group is collapsed to an empty subexpression, which
      // keeps a pathologically nested input from overflowing the stack.
      this.groupDepth++;
      if (this.groupDepth > MAX_EXPR_DEPTH) {
        this.groupDepth--;
        return this.bailDeepGroup(open);
      }

      let inner = this.parseExpr();
      let closeEnd = inner?.span?.end ?? open.end;
      if (this.peek(TokenKind.RParen)) {
        closeEnd = this.tokens[this.pos].end;
        this.pos++;
      } else {
        this.addFinding('expr.unbalanced_parentheses', this.currentSpan());
      }
      this.groupDepth--;
      if (inner === null) {
        const span = this.currentSpan();
        this.addFinding('expr.empty_subexpression', span);
        const empty: FreeTextExpr = { kind: 'free-text', text: '', span };
        inner = empty;
      }
      // The group span covers its parentheses, from the opening paren to the
      // closing one (or the end of the recovered body when it is unterminated).
      const group: GroupExpr = { kind: 'group', item: inner, span: { start: open.start, end: closeEnd } };
      return group;
    }

    if (
      this.peek(TokenKind.RParen) ||
      this.peek(TokenKind.And) ||
      this.peek(TokenKind.Or) ||
      this.peek(TokenKind.Comma)
    ) {
      this.addFinding('expr.invalid_operator_sequence', this.currentSpan());
      this.pos++;
      const empty: FreeTextExpr = { kind: 'free-text', text: '' };
      return empty;
    }

    return this.parseTerm();
  }

  private parseTerm(): ClauseExpr | null {
    if (this.pos >= this.tokens.length) {
      return null;
    }
    const first = this.tokens[this.pos];
    if (first.kind !== TokenKind.Word) {
      return null;
    }
    const start = first.start;
    let end = first.end;
    const parts: string[] = [first.text];
    this.pos++;
    // Fold trailing words into the term. A `not` reached here is infix (a term
    // already started, e.g. "the queue is not full"), so it reads as an English
    // word rather than a negation operator; a leading `not` is consumed earlier
    // by parseUnary and never reaches this loop.
    while (this.pos < this.tokens.length) {
      const kind = this.tokens[this.pos].kind;
      if (kind !== TokenKind.Word && kind !== TokenKind.Not) {
        break;
      }
      const token = this.tokens[this.pos];
      parts.push(token.text);
      end = token.end;
      this.pos++;
    }
    const text = parts.join(' ').trim();
    const term: TermExpr = { kind: 'term', text, span: { start, end } };
    return term;
  }

  private match(kind: TokenKind): boolean {
    if (this.pos >= this.tokens.length || this.tokens[this.pos].kind !== kind) {
      return false;
    }
    this.pos++;
    return true;
  }

  private peek(kind: TokenKind): boolean {
    return this.pos < this.tokens.length && this.tokens[this.pos].kind === kind;
  }

  addFinding(code: DiagnosticCode, span?: Span): void {
    if (code === 'expr.invalid_operator_sequence') {
      this.operatorError = true;
    }
    this.findings.push(span === undefined ? { code } : { code, span });
  }

  private currentSpan(): Span | undefined {
    if (this.pos < this.tokens.length) {
      const token = this.tokens[this.pos];
      return { start: token.start, end: token.end };
    }
    if (this.tokens.length === 0) {
      return undefined;
    }
    const last = this.tokens[this.tokens.length - 1];
    return { start: last.start, end: last.end };
  }

  /**
   * Skip an over-deep group without recursing, given that its opening paren is
   * already consumed. Consumes tokens up to the matching close paren (tracking
   * nested parens iteratively), reports the group as an empty subexpression, and
   * returns a placeholder group node spanning the skipped range. This is the
   * depth-guard escape hatch that keeps deeply nested input from overflowing the
   * stack.
   */
  private bailDeepGroup(open: ExprToken): ClauseExpr {
    let depth = 1;
    let end = open.end;
    while (this.pos < this.tokens.length && depth > 0) {
      const token = this.tokens[this.pos];
      if (token.kind === TokenKind.LParen) {
        depth++;
      } else if (token.kind === TokenKind.RParen) {
        depth--;
      }
      end = token.end;
      this.pos++;
    }
    const span: Span = { start: open.start, end };
    this.addFinding('expr.empty_subexpression', span);
    const item: FreeTextExpr = { kind: 'free-text', text: '', span };
    const group: GroupExpr = { kind: 'group', item, span };
    return group;
  }
}

function mergeSpan(items: ClauseExpr[]): Span | undefined {
  // Accumulate the min start and max end incrementally. A spread into
  // Math.min/Math.max would throw a RangeError once the operand list grows past
  // the engine's argument limit (long `and`/`or` chains), so a plain loop is the
  // only safe form here.
  let start: number | undefined;
  let end: number | undefined;
  for (const item of items) {
    if (item.span === undefined) {
      continue;
    }
    if (start === undefined || item.span.start < start) {
      start = item.span.start;
    }
    if (end === undefined || item.span.end > end) {
      end = item.span.end;
    }
  }
  return start === undefined || end === undefined ? undefined : { start, end };
}

/**
 * Sort findings deterministically by span start, then span end, then code.
 * Findings without a span sort after those with one. The sort is stable, so
 * findings with equal keys keep their insertion order.
 */
function sortFindings(findings: ExprFinding[]): ExprFinding[] {
  return [...findings].sort((a, b) => {
    const aStart = a.span?.start ?? Number.POSITIVE_INFINITY;
    const bStart = b.span?.start ?? Number.POSITIVE_INFINITY;
    if (aStart !== bStart) {
      return aStart - bStart;
    }
    const aEnd = a.span?.end ?? Number.POSITIVE_INFINITY;
    const bEnd = b.span?.end ?? Number.POSITIVE_INFINITY;
    if (aEnd !== bEnd) {
      return aEnd - bEnd;
    }
    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
  });
}
