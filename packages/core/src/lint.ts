/**
 * Core integration layer for `@earsyntax/core`.
 *
 * This module wires the independent core stages into the public API:
 *
 * 1. {@link parseShell} recovers the shell AST and raw structural findings.
 * 2. Each clause body ({@link FreeTextExpr}) is re-parsed with
 *    {@link parseClauseExpression} so the AST carries a real boolean expression
 *    tree with {@link TermExpr} leaves.
 * 3. {@link resolveAndCollect} matches every term against the catalog and
 *    returns a new AST carrying the match results, plus catalog diagnostics
 *    and references. No stage mutates a shared or parameter object; each new
 *    AST shape is built by construction.
 * 4. Responses are split on semicolons and linted for multiplicity and vague
 *    wording.
 * 5. Every raw finding is turned into a {@link Diagnostic} through
 *    {@link buildDiagnostic}, merged with catalog diagnostics, deduplicated,
 *    and stably sorted. Validity is derived from error severity.
 *
 * The end-to-end flow mirrors the Go reference (`ears-lint-go/lint.go`,
 * `linter.go`, `api.go`) with the documented TypeScript deviations: responses
 * are split only on semicolons, and clause bodies are parsed into expression
 * trees before catalog matching.
 *
 * Determinism contract: no LLM, no network, no file system, no clock, no random
 * source. The same input always produces deeply equal output.
 */

import { resolveAndCollect, catalogCoverageDiagnostics } from './catalog.js';
import {
  buildDiagnostic,
  computeValid,
  dedupeDiagnostics,
  sortDiagnostics,
  type RawFinding,
} from './diagnostics.js';
import { parseClauseExpression } from './expression-parser.js';
import { withDefaults, type ResolvedOptions } from './options.js';
import { parseShell } from './shell-parser.js';
import type {
  Catalog,
  ClauseExpr,
  Diagnostic,
  EarsAst,
  LintResult,
  Options,
  ParseResult,
  Pattern,
  ReferenceMatch,
  RequirementInput,
} from './types.js';

/**
 * The internal outcome of running the full pipeline on one requirement.
 *
 * The public functions project this onto their respective result shapes:
 * `lintEars` returns everything, `parseEars` returns only the structural view.
 */
interface PipelineResult {
  pattern?: Pattern;
  ast?: EarsAst;
  references: ReferenceMatch[];
  /** Shell and expression parse findings, already built into diagnostics. */
  structural: Diagnostic[];
  /** Catalog match diagnostics and response lint diagnostics. */
  semantic: Diagnostic[];
}

/**
 * Lint a single EARS requirement into a complete {@link LintResult}.
 *
 * @param text The requirement text to lint.
 * @param catalog Optional catalog of known domain terms.
 * @param options Optional parsing and linting options.
 * @returns The lint result: `valid`, `pattern`, `ast`, `references`, and stably
 *   sorted `diagnostics`.
 */
export function lintEars(text: string, catalog?: Catalog, options?: Options): LintResult {
  const opts = withDefaults(options);
  return toLintResult(undefined, runPipeline(text, catalog, opts));
}

/**
 * Lint a batch of EARS requirements, preserving input order.
 *
 * Each result corresponds positionally to its input item and echoes the item's
 * `id`. Options are defaulted once and shared across the batch.
 *
 * @param items The requirements to lint, in order.
 * @param catalog Optional catalog of known domain terms.
 * @param options Optional parsing and linting options.
 * @returns One {@link LintResult} per input item, in the same order.
 */
export function lintEarsBatch(
  items: RequirementInput[],
  catalog?: Catalog,
  options?: Options,
): LintResult[] {
  const opts = withDefaults(options);
  return items.map((item) => toLintResult(item.id, runPipeline(item.text, catalog, opts)));
}

/**
 * Parse a single EARS requirement into a {@link ParseResult}.
 *
 * Returns the classified `pattern`, the parsed `ast` (with catalog term matches
 * filled when a catalog is supplied), and the structural `diagnostics` from
 * shell and expression parsing. Catalog references and lint findings are not
 * included, matching the frozen {@link ParseResult} contract.
 *
 * @param text The requirement text to parse.
 * @param catalog Optional catalog used for term matching during parsing.
 * @param options Optional parsing options.
 * @returns The parse result for the requirement.
 */
export function parseEars(text: string, catalog?: Catalog, options?: Options): ParseResult {
  const opts = withDefaults(options);
  const pipeline = runPipeline(text, catalog, opts);
  const diagnostics = sortDiagnostics(dedupeDiagnostics(pipeline.structural));
  const result: ParseResult = { diagnostics };
  if (pipeline.pattern !== undefined) {
    result.pattern = pipeline.pattern;
  }
  if (pipeline.ast !== undefined) {
    result.ast = pipeline.ast;
  }
  return result;
}

/**
 * Report catalog entries that no requirement text references.
 *
 * Maps each input item to its text and delegates to
 * {@link catalogCoverageDiagnostics}, which runs only in strict mode.
 *
 * @param items The requirements whose text is scanned for coverage.
 * @param catalog Optional catalog whose entries are checked for references.
 * @param options Optional options; coverage runs only when mode is strict.
 * @returns Coverage diagnostics, stably sorted.
 */
export function lintCatalogCoverage(
  items: RequirementInput[],
  catalog?: Catalog,
  options?: Options,
): Diagnostic[] {
  const opts = withDefaults(options);
  const texts = items.map((item) => item.text);
  return catalogCoverageDiagnostics(texts, catalog, opts);
}

/**
 * Run the shared pipeline: shell parse, expression parse, catalog match, and
 * response lint. Splits the produced diagnostics into a structural set (shell
 * and expression) and a semantic set (catalog and response lint).
 */
function runPipeline(
  text: string,
  catalog: Catalog | undefined,
  opts: ResolvedOptions,
): PipelineResult {
  const shell = parseShell(text, { commaAsAnd: opts.commaAsAnd });
  const structural: Diagnostic[] = [];

  if (!shell.ast) {
    return { references: [], structural: recoverFailedShell(text, shell.findings, opts), semantic: [] };
  }

  // Re-parse each clause body into a real expression tree before catalog
  // matching so the resolver sees TermExpr leaves rather than free text. The
  // shell's AST is never mutated: a fresh copy carries the parsed clauses.
  const exprFindings: RawFinding[] = [];
  const parsedAst: EarsAst = { ...shell.ast };
  if (parsedAst.preconditions) {
    parsedAst.preconditions = parseClauseBodies(parsedAst.preconditions, opts, exprFindings);
  }
  if (parsedAst.trigger) {
    parsedAst.trigger = parseClauseBodies(parsedAst.trigger, opts, exprFindings);
  }
  if (parsedAst.feature) {
    parsedAst.feature = parseClauseBodies(parsedAst.feature, opts, exprFindings);
  }
  if (parsedAst.unwanted) {
    parsedAst.unwanted = parseClauseBodies(parsedAst.unwanted, opts, exprFindings);
  }

  for (const finding of shell.findings) {
    structural.push(buildDiagnostic(finding, opts.mode));
  }
  for (const finding of exprFindings) {
    structural.push(buildDiagnostic(finding, opts.mode));
  }

  // Catalog matching fills the term match results; it must run after expression
  // parsing so the TermExpr leaves exist. It is pure, returning a new AST whose
  // system and term nodes carry their matches.
  const {
    ast: resolvedAst,
    references,
    diagnostics: catalogDiagnostics,
  } = resolveAndCollect(parsedAst, catalog, opts);

  // Split and lint the response; the AST gains its final responses through
  // construction rather than mutation.
  const { responses, diagnostics: responseDiagnostics } = lintResponses(resolvedAst.responses, opts);
  const ast: EarsAst = { ...resolvedAst, responses };

  const semantic: Diagnostic[] = [...catalogDiagnostics, ...responseDiagnostics];

  return { pattern: ast.pattern, ast, references, structural, semantic };
}

/**
 * Produce diagnostics for a requirement whose shell parse failed to recover an
 * AST.
 *
 * The frozen shell parser does not run a sentence-level parenthesis balance
 * check (the Go reference does, in `parseShell`), so an unbalanced group
 * surfaces only as a misleading `ears.missing_system` or `ears.no_match`. When
 * the raw text is actually unbalanced, that root cause is reported on its own.
 *
 * Otherwise the raw findings are mapped through, collapsing redundant
 * structural notes to their root cause so the output aligns with the fixture
 * corpus:
 * - When `ears.no_match` is present the whole text is unrecognized, so the
 *   narrower `ears.missing_shall` and `ears.missing_system` notes are dropped.
 * - When `ears.missing_shall` is present (without `ears.no_match`) there is no
 *   `shall` boundary, so a system boundary cannot be determined either and the
 *   redundant `ears.missing_system` is dropped.
 * - In guided mode a `lint.suspicious_text_shape` hint is added alongside
 *   `ears.no_match`, matching the Go reference's guided-mode behavior.
 */
function recoverFailedShell(
  text: string,
  findings: readonly RawFinding[],
  opts: ResolvedOptions,
): Diagnostic[] {
  const unbalanced = unbalancedParenFinding(text);
  if (unbalanced) {
    return [buildDiagnostic(unbalanced, opts.mode)];
  }

  const hasNoMatch = findings.some((finding) => finding.code === 'ears.no_match');
  const hasMissingShall = findings.some((finding) => finding.code === 'ears.missing_shall');
  let kept = findings;
  if (hasNoMatch) {
    kept = findings.filter(
      (finding) =>
        finding.code !== 'ears.missing_shall' && finding.code !== 'ears.missing_system',
    );
  } else if (hasMissingShall) {
    kept = findings.filter((finding) => finding.code !== 'ears.missing_system');
  }

  const diagnostics = kept.map((finding) => buildDiagnostic(finding, opts.mode));
  if (hasNoMatch && opts.mode === 'guided') {
    diagnostics.push(buildDiagnostic({ code: 'lint.suspicious_text_shape' }, opts.mode));
  }
  return diagnostics;
}

/**
 * Detect an unbalanced parenthesis in the raw requirement text and return a
 * matching `expr.unbalanced_parentheses` finding, or `undefined` when the text
 * is balanced. Ports the Go reference `balanceDiagnostics` scan: the first
 * stray closing parenthesis is reported at its position; an unclosed opening
 * run is reported over the whole text.
 */
function unbalancedParenFinding(text: string): RawFinding | undefined {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      if (depth === 0) {
        return { code: 'expr.unbalanced_parentheses', span: { start: i, end: i + 1 } };
      }
      depth--;
    }
  }
  if (depth > 0) {
    return { code: 'expr.unbalanced_parentheses', span: { start: 0, end: text.length } };
  }
  return undefined;
}

/**
 * Split and lint a shell requirement's single raw response.
 *
 * Splits on semicolons, drops empty parts, and returns both the final response
 * list and the response-level lint diagnostics. Pure: it neither reads nor
 * writes any AST, so the caller owns building the response list into the AST.
 */
function lintResponses(
  rawResponses: readonly string[],
  opts: ResolvedOptions,
): { responses: string[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const raw = rawResponses[0] ?? '';

  // A sentence break inside the response (a period followed by more text) means
  // the shell captured trailing prose after the requirement. Keep only the
  // first sentence as the response and flag the remainder as an unparsed tail.
  let body = raw;
  const sentenceBreak = raw.search(/\.\s+\S/);
  if (sentenceBreak >= 0) {
    body = raw.slice(0, sentenceBreak).trim();
    diagnostics.push(buildDiagnostic({ code: 'lint.unparsed_tail' }, opts.mode));
  }

  const parts = body
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '');

  const responses = parts.length > 0 ? parts : [body];

  if (parts.length > 1) {
    diagnostics.push(buildDiagnostic({ code: 'lint.multiple_responses' }, opts.mode));
  }

  for (const response of responses) {
    const lower = response.toLowerCase();
    for (const term of opts.vagueTerms) {
      const needle = term.trim().toLowerCase();
      if (needle !== '' && lower.includes(needle)) {
        diagnostics.push(
          buildDiagnostic({ code: 'lint.vague_response' }, opts.mode, { term: needle }),
        );
      }
    }
  }

  return { responses, diagnostics };
}

/**
 * Replace every {@link FreeTextExpr} in a clause node with the expression tree
 * produced by {@link parseClauseExpression}, preserving the surrounding
 * structure. The shell parser only ever emits free-text leaves, optionally
 * wrapped in an `and` when the same clause keyword appears more than once, so
 * this walk covers every shape the shell parser can produce.
 */
function parseClauseBodies(
  node: ClauseExpr | undefined,
  opts: ResolvedOptions,
  findings: RawFinding[],
): ClauseExpr | undefined {
  return node === undefined ? undefined : parseClauseNode(node, opts, findings);
}

/** Recurse over a defined clause node, replacing every free-text leaf. */
function parseClauseNode(
  node: ClauseExpr,
  opts: ResolvedOptions,
  findings: RawFinding[],
): ClauseExpr {
  if (node.kind === 'free-text') {
    // An empty clause body is already reported by the shell parser as
    // `ears.empty_clause`; re-parsing it would add a redundant
    // `expr.empty_subexpression`, so leave it as free text.
    if (node.text.trim() === '') {
      return node;
    }
    const baseOffset = node.span?.start ?? 0;
    const { expr, findings: exprFindings } = parseClauseExpression(node.text, baseOffset, {
      commaAsAnd: opts.commaAsAnd,
    });
    findings.push(...exprFindings);
    return expr;
  }
  if (node.kind === 'and' || node.kind === 'or') {
    return { ...node, items: node.items.map((item) => parseClauseNode(item, opts, findings)) };
  }
  if (node.kind === 'not' || node.kind === 'group') {
    return { ...node, item: parseClauseNode(node.item, opts, findings) };
  }
  return node;
}

/** Project a pipeline result onto the public {@link LintResult} shape. */
function toLintResult(id: string | undefined, pipeline: PipelineResult): LintResult {
  const diagnostics = sortDiagnostics(
    dedupeDiagnostics([...pipeline.structural, ...pipeline.semantic]),
  );
  const result: LintResult = {
    valid: computeValid(diagnostics),
    references: pipeline.references,
    diagnostics,
  };
  if (id !== undefined) {
    result.id = id;
  }
  if (pipeline.pattern !== undefined) {
    result.pattern = pipeline.pattern;
  }
  if (pipeline.ast !== undefined) {
    result.ast = pipeline.ast;
  }
  return result;
}
