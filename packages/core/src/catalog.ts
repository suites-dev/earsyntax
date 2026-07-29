/**
 * Deterministic catalog term matching for `@earsyntax/core`.
 *
 * This module ports the matching behavior of the Go reference implementation
 * (`ears-lint-go/catalog_match.go` and `coverage.go`) to TypeScript. It answers
 * one question for a raw term: does it match a catalog entry by exact canonical
 * name, by exact alias, ambiguously (more than one entry), or not at all.
 *
 * Matching is strictly deterministic. There is no fuzzy or semantic matching:
 * only case-insensitive, whitespace-collapsed, punctuation-trimmed equality of
 * normalized keys. Candidate lists are stably ordered by group then id so the
 * same input always yields the same output.
 *
 * No-catalog mode: when no catalog is supplied, or the supplied catalog has no
 * entries in any group, matching is skipped. A term resolved in this mode is
 * neither matched nor unresolved (it carries only `raw` and `role`), matching
 * the frozen `TermMatch` contract in {@link ./types.js}. This differs from the
 * literal Go reference, which has no notion of an absent catalog and would mark
 * every term unresolved against an empty catalog. The behavior here follows the
 * TypeScript contract and the orchestration brief, where an absent-or-empty
 * catalog means "nothing to match against".
 */

import type {
  Catalog,
  CatalogEntry,
  CatalogRef,
  ClauseExpr,
  Diagnostic,
  DiagnosticCode,
  EarsAst,
  Mode,
  Options,
  ReferenceMatch,
  Severity,
  Span,
  TermMatch,
  TermRole,
} from './types.js';

/** Sentinel start offset used when a diagnostic or reference has no span. */
const NO_SPAN_START = (1 << 30) - 1;

/** Punctuation trimmed from the ends of each token during normalization. */
const TRIM_PUNCTUATION = /^[.,;:!?"'`]+|[.,;:!?"'`]+$/g;

/**
 * A single catalog match candidate: the resolved reference, the role of the
 * group it came from, and whether it matched via an alias.
 */
interface MatchCandidate {
  ref: CatalogRef;
  role: TermRole;
  viaAlias: boolean;
}

/** A catalog group paired with its group name and semantic role. */
interface GroupEntries {
  group: string;
  role: TermRole;
  entries: CatalogEntry[];
}

/**
 * The outcome of resolving a single raw term: the filled {@link TermMatch} and
 * the raw diagnostics produced while resolving it (unsorted, unmerged).
 */
export interface TermResolution {
  term: TermMatch;
  diagnostics: Diagnostic[];
}

/**
 * The outcome of resolving an entire requirement AST.
 *
 * `ast` is a new object: the resolver never mutates its input. `references`
 * lists every catalog reference found (in stable order) and `diagnostics`
 * holds the catalog diagnostics (stably sorted).
 */
export interface ResolveResult {
  ast: EarsAst;
  references: ReferenceMatch[];
  diagnostics: Diagnostic[];
}

/**
 * Normalize a term into its comparison key.
 *
 * Ports `normalizeKey` from the Go reference: trim, lowercase, split on any
 * whitespace run, trim leading and trailing punctuation from each token, then
 * rejoin with single spaces. Tokens that become empty after punctuation
 * trimming are preserved as empty (matching the Go `strings.Join` behavior),
 * so the key is a faithful, deterministic transform of the input.
 */
export function normalizeKey(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '') {
    return '';
  }
  const parts = trimmed.toLowerCase().split(/\s+/);
  return parts.map((part) => part.replace(TRIM_PUNCTUATION, '')).join(' ');
}

/**
 * Return `true` when there is nothing to match against: no catalog, or a
 * catalog whose every group is absent or empty. In this state the matcher
 * operates in no-catalog mode and skips matching entirely.
 */
export function isCatalogEmpty(catalog?: Catalog): boolean {
  if (!catalog) {
    return true;
  }
  const groups = [
    catalog.systems,
    catalog.actors,
    catalog.events,
    catalog.states,
    catalog.features,
    catalog.modes,
    catalog.conditions,
    catalog.dataTerms,
  ];
  return groups.every((group) => !group || group.length === 0);
}

/**
 * Build the full ordered list of catalog groups, substituting an empty array
 * for any group the catalog omits.
 */
function allGroups(catalog: Catalog): GroupEntries[] {
  return [
    { group: 'systems', role: 'system', entries: catalog.systems ?? [] },
    { group: 'actors', role: 'actor', entries: catalog.actors ?? [] },
    { group: 'events', role: 'event', entries: catalog.events ?? [] },
    { group: 'states', role: 'state', entries: catalog.states ?? [] },
    { group: 'features', role: 'feature', entries: catalog.features ?? [] },
    { group: 'modes', role: 'mode', entries: catalog.modes ?? [] },
    { group: 'conditions', role: 'condition', entries: catalog.conditions ?? [] },
    { group: 'dataTerms', role: 'data-term', entries: catalog.dataTerms ?? [] },
  ];
}

/**
 * Select which catalog groups a term of the given role may match, in the same
 * priority order as the Go reference `allowedGroups`. The final candidate order
 * is fixed later by a stable sort on group then id, so this ordering only
 * affects which groups are searched, not the reported order.
 */
function allowedGroups(role: TermRole, all: GroupEntries[]): GroupEntries[] {
  // Index legend: 0 systems, 1 actors, 2 events, 3 states, 4 features,
  // 5 modes, 6 conditions, 7 dataTerms.
  if (role === 'system') {
    return [all[0]];
  }
  if (role === 'feature') {
    return [all[4], all[5], all[6], all[7]];
  }
  if (role === 'event') {
    return [all[2], all[6], all[3], all[5], all[1], all[4], all[7]];
  }
  if (role === 'state') {
    return [all[3], all[6], all[5], all[7], all[1], all[2], all[4]];
  }
  return all;
}

/**
 * Find every catalog entry a raw term matches, across the groups allowed for
 * its role. Exact canonical name matches are recorded first; an entry is also
 * checked against its aliases, but only when its canonical name did not match
 * (mirroring the Go `continue`). Duplicate entries are removed.
 */
export function findMatches(raw: string, requestedRole: TermRole, catalog: Catalog): MatchCandidate[] {
  const key = normalizeKey(raw);
  if (key === '') {
    return [];
  }
  const groups = allowedGroups(requestedRole, allGroups(catalog));
  const matches: MatchCandidate[] = [];
  for (const group of groups) {
    for (const entry of group.entries) {
      if (normalizeKey(entry.name) === key) {
        matches.push({
          ref: { group: group.group, id: entry.id, name: entry.name },
          role: group.role,
          viaAlias: false,
        });
        continue;
      }
      for (const alias of entry.aliases ?? []) {
        if (normalizeKey(alias) === key) {
          matches.push({
            ref: { group: group.group, id: entry.id, name: entry.name },
            role: group.role,
            viaAlias: true,
          });
          break;
        }
      }
    }
  }
  return dedupeMatches(matches);
}

/** Remove duplicate candidates by group and id, keeping the first occurrence. */
function dedupeMatches(matches: MatchCandidate[]): MatchCandidate[] {
  const seen = new Set<string>();
  const out: MatchCandidate[] = [];
  for (const candidate of matches) {
    const key = `${candidate.ref.group}:${candidate.ref.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

/** Order candidates deterministically by group, then id. */
function sortCandidates(matches: MatchCandidate[]): void {
  matches.sort((a, b) => {
    if (a.ref.group !== b.ref.group) {
      return a.ref.group < b.ref.group ? -1 : 1;
    }
    if (a.ref.id !== b.ref.id) {
      return a.ref.id < b.ref.id ? -1 : 1;
    }
    return 0;
  });
}

/** `guided` downgrades system errors to warnings; `strict` keeps them errors. */
function severityByMode(mode: Mode): Severity {
  return mode === 'guided' ? 'warning' : 'error';
}

/**
 * Severity for a catalog `unresolved` or `ambiguous` diagnostic: mode-driven
 * for the system role (error in strict, warning in guided), always a warning
 * for every other role.
 */
function roleSeverity(role: TermRole, mode: Mode): Severity {
  return role === 'system' ? severityByMode(mode) : 'warning';
}

/**
 * Build the `catalog.<role>_<suffix>` diagnostic code for a role. The cast is
 * safe: this is only ever called with the system, state, event, or feature
 * roles, which are the only roles clauses assign, and each has a registered
 * code family in {@link DiagnosticCode}.
 */
function catalogCode(role: TermRole, suffix: 'unresolved' | 'ambiguous'): DiagnosticCode {
  const key = role.replace(/-/g, '_');
  return `catalog.${key}_${suffix}` as DiagnosticCode;
}

/** Construct a diagnostic, attaching the span only when one is known. */
function makeDiagnostic(
  code: DiagnosticCode,
  severity: Severity,
  message: string,
  span?: Span,
): Diagnostic {
  return span ? { code, severity, message, span } : { code, severity, message };
}

/**
 * Resolve a single raw term against the catalog under a requested role.
 *
 * Returns the filled {@link TermMatch} plus the raw diagnostics the match
 * produced. Exactly one outcome applies: a single `matched` entry (with an
 * `lint.alias_used` warning when matched via an alias), a non-empty `ambiguous`
 * list, or `unresolved`. In no-catalog mode the term is returned untouched
 * beyond its `raw` and `role`, with no diagnostics.
 */
export function resolveTerm(
  raw: string,
  requestedRole: TermRole,
  catalog: Catalog | undefined,
  mode: Mode,
  span?: Span,
): TermResolution {
  const term: TermMatch = { raw, role: requestedRole };
  const diagnostics: Diagnostic[] = [];

  if (!catalog || isCatalogEmpty(catalog)) {
    return { term, diagnostics };
  }

  const matches = findMatches(raw, requestedRole, catalog);
  sortCandidates(matches);

  if (matches.length === 1) {
    const match = matches[0];
    term.role = match.role;
    term.matched = match.ref;
    if (match.viaAlias) {
      term.viaAlias = true;
      diagnostics.push(
        makeDiagnostic('lint.alias_used', 'warning', 'alias used instead of canonical term', span),
      );
    }
    return { term, diagnostics };
  }

  if (matches.length > 1) {
    term.ambiguous = matches.map((match) => match.ref);
    // The system term reports only its catalog code; the expr.* term codes are
    // reserved for terms inside clause expressions (intentional deviation from
    // Go, which emits both for every role).
    if (requestedRole !== 'system') {
      diagnostics.push(
        makeDiagnostic('expr.ambiguous_term', 'warning', 'ambiguous catalog term in expression', span),
      );
    }
    diagnostics.push(
      makeDiagnostic(
        catalogCode(requestedRole, 'ambiguous'),
        roleSeverity(requestedRole, mode),
        'ambiguous catalog term match',
        span,
      ),
    );
    return { term, diagnostics };
  }

  term.unresolved = true;
  // See the ambiguous branch: the system term omits the expr.* term code.
  if (requestedRole !== 'system') {
    diagnostics.push(
      makeDiagnostic('expr.unknown_term', 'warning', 'unknown term in expression', span),
    );
  }
  diagnostics.push(
    makeDiagnostic(
      catalogCode(requestedRole, 'unresolved'),
      roleSeverity(requestedRole, mode),
      'unresolved catalog term',
      span,
    ),
  );
  return { term, diagnostics };
}

/** Build a reference match from a resolved term, omitting empty optionals. */
function makeReference(clause: string, term: TermMatch, span?: Span): ReferenceMatch {
  const reference: ReferenceMatch = { clause, text: term.raw, role: term.role };
  if (term.matched) {
    reference.matched = term.matched;
  }
  if (term.ambiguous) {
    reference.ambiguous = term.ambiguous;
  }
  if (term.unresolved) {
    reference.unresolved = true;
  }
  if (term.viaAlias) {
    reference.viaAlias = true;
  }
  if (span) {
    reference.span = span;
  }
  return reference;
}

/** Return a copy of a clause node with its span attached, when one is known. */
function withSpan<T extends ClauseExpr>(node: T, span?: Span): T {
  return span ? { ...node, span } : node;
}

/**
 * Resolve every term in a clause expression, returning a new expression tree
 * with each term node's match result filled and one {@link ReferenceMatch} per
 * term. The input tree is never mutated.
 *
 * When the clause mixes resolved and unresolved terms an
 * `expr.mixed_unresolved_terms` warning is added, spanning the whole clause.
 */
function resolveExpr(
  clauseName: string,
  expr: ClauseExpr,
  role: TermRole,
  catalog: Catalog | undefined,
  mode: Mode,
): { node: ClauseExpr; references: ReferenceMatch[]; diagnostics: Diagnostic[] } {
  const references: ReferenceMatch[] = [];
  const diagnostics: Diagnostic[] = [];
  let resolvedCount = 0;
  let unresolvedCount = 0;

  const rebuild = (node: ClauseExpr): ClauseExpr => {
    if (node.kind === 'term') {
      const { term, diagnostics: termDiagnostics } = resolveTerm(
        node.text,
        role,
        catalog,
        mode,
        node.span,
      );
      diagnostics.push(...termDiagnostics);
      if (term.matched) {
        resolvedCount += 1;
      }
      if (term.unresolved) {
        unresolvedCount += 1;
      }
      references.push(makeReference(clauseName, term, node.span));
      return withSpan({ kind: 'term', text: node.text, term }, node.span);
    }
    if (node.kind === 'not') {
      return withSpan({ kind: 'not', item: rebuild(node.item) }, node.span);
    }
    if (node.kind === 'group') {
      return withSpan({ kind: 'group', item: rebuild(node.item) }, node.span);
    }
    if (node.kind === 'and') {
      return withSpan({ kind: 'and', items: node.items.map(rebuild) }, node.span);
    }
    if (node.kind === 'or') {
      return withSpan({ kind: 'or', items: node.items.map(rebuild) }, node.span);
    }
    return withSpan({ kind: 'free-text', text: node.text }, node.span);
  };

  const node = rebuild(expr);

  if (resolvedCount > 0 && unresolvedCount > 0) {
    diagnostics.push(
      makeDiagnostic(
        'expr.mixed_unresolved_terms',
        'warning',
        'expression mixes resolved and unresolved terms',
        expr.span,
      ),
    );
  }

  return { node, references, diagnostics };
}

/** Stable sort of references by span start, then clause, then text. */
function sortReferences(references: ReferenceMatch[]): ReferenceMatch[] {
  const out = [...references];
  out.sort((a, b) => {
    const aStart = a.span ? a.span.start : NO_SPAN_START;
    const bStart = b.span ? b.span.start : NO_SPAN_START;
    if (aStart !== bStart) {
      return aStart - bStart;
    }
    if (a.clause !== b.clause) {
      return a.clause < b.clause ? -1 : 1;
    }
    if (a.text !== b.text) {
      return a.text < b.text ? -1 : 1;
    }
    return 0;
  });
  return out;
}

/** Stable sort of diagnostics by span start, then code, then message, then severity. */
function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const out = [...diagnostics];
  out.sort((a, b) => {
    const aStart = a.span ? a.span.start : NO_SPAN_START;
    const bStart = b.span ? b.span.start : NO_SPAN_START;
    if (aStart !== bStart) {
      return aStart - bStart;
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
  });
  return out;
}

/**
 * Resolve every catalog reference in a requirement AST.
 *
 * Pure: the input AST is never mutated. Returns a new {@link EarsAst} whose
 * `system` and clause term nodes carry their match results, plus every
 * reference found (stably ordered) and the catalog diagnostics (stably sorted).
 *
 * Clause roles follow the Go reference: preconditions are states, triggers are
 * events, features are features. The `unwanted` (If) clause, which the frozen
 * TypeScript AST carries as a distinct field, is resolved under the event role,
 * matching the Go `roleForClause` mapping for If clauses. It is a no-op when
 * the field is absent.
 */
export function resolveAndCollect(
  ast: EarsAst,
  catalog: Catalog | undefined,
  options?: Options,
): ResolveResult {
  const mode: Mode = options?.mode ?? 'strict';
  const references: ReferenceMatch[] = [];
  const diagnostics: Diagnostic[] = [];

  const systemResolution = resolveTerm(ast.system.raw, 'system', catalog, mode);
  diagnostics.push(...systemResolution.diagnostics);
  references.push(makeReference('system', systemResolution.term));

  const resolveClause = (
    name: string,
    expr: ClauseExpr | undefined,
    role: TermRole,
  ): ClauseExpr | undefined => {
    if (!expr) {
      return undefined;
    }
    const result = resolveExpr(name, expr, role, catalog, mode);
    references.push(...result.references);
    diagnostics.push(...result.diagnostics);
    return result.node;
  };

  const preconditions = resolveClause('preconditions', ast.preconditions, 'state');
  const trigger = resolveClause('trigger', ast.trigger, 'event');
  const feature = resolveClause('feature', ast.feature, 'feature');
  const unwanted = resolveClause('unwanted', ast.unwanted, 'event');

  const nextAst: EarsAst = {
    pattern: ast.pattern,
    system: systemResolution.term,
    responses: ast.responses,
    raw: ast.raw,
    ...(preconditions ? { preconditions } : {}),
    ...(trigger ? { trigger } : {}),
    ...(feature ? { feature } : {}),
    ...(unwanted ? { unwanted } : {}),
  };

  return {
    ast: nextAst,
    references: sortReferences(references),
    diagnostics: sortDiagnostics(diagnostics),
  };
}

/**
 * Report catalog entries no requirement text references.
 *
 * Ports the Go coverage lint. Emits a `catalog.term_unreferenced` warning for
 * each entry whose canonical name and none of its aliases appear as a whole
 * phrase (case-insensitive, on non-alphanumeric boundaries) in any of the
 * supplied requirement texts. Coverage runs only in strict mode and only when
 * at least one text is supplied; otherwise it returns an empty list.
 */
export function catalogCoverageDiagnostics(
  texts: string[],
  catalog: Catalog | undefined,
  options?: Options,
): Diagnostic[] {
  const mode: Mode = options?.mode ?? 'strict';
  if (!catalog || texts.length === 0 || mode !== 'strict') {
    return [];
  }

  const lowered = texts.map((text) => text.trim().toLowerCase());
  const out: Diagnostic[] = [];

  const add = (group: string, entries?: CatalogEntry[]): void => {
    for (const entry of entries ?? []) {
      const id = entry.id.trim();
      const name = entry.name.trim();
      if (id === '' || name === '') {
        continue;
      }
      if (catalogEntryCovered(lowered, entry)) {
        continue;
      }
      out.push({
        code: 'catalog.term_unreferenced',
        severity: 'warning',
        message: `catalog ${group} term "${name}" (${id}) is not referenced by any requirement text`,
      });
    }
  };

  add('systems', catalog.systems);
  add('actors', catalog.actors);
  add('events', catalog.events);
  add('states', catalog.states);
  add('features', catalog.features);
  add('modes', catalog.modes);
  add('conditions', catalog.conditions);
  add('dataTerms', catalog.dataTerms);

  return sortDiagnostics(out);
}

/** `true` when the entry's name or any alias appears as a phrase in any text. */
function catalogEntryCovered(texts: string[], entry: CatalogEntry): boolean {
  const candidates = [entry.name.trim(), ...(entry.aliases ?? [])];
  for (const candidate of candidates) {
    const term = candidate.trim().toLowerCase();
    if (term === '') {
      continue;
    }
    for (const text of texts) {
      if (containsPhrase(text, term)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * `true` when `phrase` occurs in `text` bounded by non-alphanumeric characters
 * (or string edges) on both sides. Both arguments are expected already
 * lowercased. Ports the Go `containsPhrase` scan.
 */
function containsPhrase(text: string, phrase: string): boolean {
  if (text === '' || phrase === '') {
    return false;
  }
  let from = 0;
  for (;;) {
    const index = text.indexOf(phrase, from);
    if (index < 0) {
      return false;
    }
    const end = index + phrase.length;
    if (phraseBoundary(text, index - 1) && phraseBoundary(text, end)) {
      return true;
    }
    from = end;
    if (from >= text.length) {
      return false;
    }
  }
}

/** A position is a phrase boundary when it is off the string or non-alphanumeric. */
function phraseBoundary(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) {
    return true;
  }
  const code = text.charCodeAt(index);
  const isLower = code >= 97 && code <= 122; // a-z
  const isDigit = code >= 48 && code <= 57; // 0-9
  return !(isLower || isDigit);
}
