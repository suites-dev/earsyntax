/**
 * `earsyntax explain <diagnostic-id>` — full write-up of one diagnostic.
 *
 * Resolves a current `EARS-*` id or a deprecated dotted alias against the frozen
 * {@link DIAGNOSTIC_REGISTRY} in `@earsyntax/core` and renders that entry's
 * metadata. The registry is the single source of truth: this module never holds
 * its own copy of any explanation text, it only projects registry fields onto
 * the JSON envelope and a pretty rendering. When the requested id resolves via a
 * deprecated alias, the response carries `alias: true` and a `deprecationNote`.
 *
 * No profile is needed and no repo is resolved. Exit `0` on a known id, `2` on a
 * usage error (no id, more than one id, or an unknown id). An unknown id carries
 * the nearest known ids as a suggestion, computed with a dependency-free edit
 * distance over the registry ids and their aliases.
 */

import { DIAGNOSTIC_REGISTRY, type DiagnosticRegistryEntry } from '@earsyntax/core';
import type { Painter } from '../color.js';
import type { CommandContext, CommandResult } from '../context.js';
import type { FacadeDiagnostic } from '../facade-types.js';
import { buildResponse } from '../response.js';

/** A registry entry resolved from user input, with whether the match was via a deprecated alias. */
interface ResolvedEntry {
  entry: DiagnosticRegistryEntry;
  /** `true` when the requested string matched the entry's deprecated old code, not its current id. */
  viaAlias: boolean;
}

/**
 * Case-insensitive lookup from a requested id or alias to its registry entry.
 * Built once from the frozen registry: each entry is indexed under both its
 * current id and its deprecated old code (upper-cased so `ears-e006` and
 * `EARS.MISSING_SHALL` still resolve). Ids and dotted old codes never collide
 * under upper-casing, so one flat map is unambiguous.
 */
const INDEX: ReadonlyMap<string, ResolvedEntry> = (() => {
  const index = new Map<string, ResolvedEntry>();
  for (const entry of DIAGNOSTIC_REGISTRY) {
    index.set(entry.id.toUpperCase(), { entry, viaAlias: false });
    index.set(entry.oldCode.toUpperCase(), { entry, viaAlias: true });
  }
  return index;
})();

/** Resolve a requested id or deprecated alias to its entry, or `undefined` when nothing matches. */
function resolveEntry(requested: string): ResolvedEntry | undefined {
  return INDEX.get(requested.toUpperCase());
}

/**
 * Levenshtein edit distance between two strings, computed with a single rolling
 * row so it allocates O(n) not O(n*m). Dependency-free; used only to rank
 * suggestions for an unknown id.
 */
function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return row[b.length];
}

/**
 * The nearest known current ids to an unrecognized request, best first. Each
 * entry is scored by the smaller edit distance between the request and either
 * its current id or its old code, so `ears.missing_shal` still points at
 * `EARS-E007`. Deterministic: ties break by ascending id. Returns at most three.
 */
function suggestIds(requested: string): string[] {
  const needle = requested.toUpperCase();
  const scored = DIAGNOSTIC_REGISTRY.map((entry) => ({
    id: entry.id,
    distance: Math.min(
      editDistance(needle, entry.id.toUpperCase()),
      editDistance(needle, entry.oldCode.toUpperCase()),
    ),
  }));
  scored.sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id));
  return scored.slice(0, 3).map((candidate) => candidate.id);
}

/** Build an exit-2 usage result carrying one facade diagnostic and a matching pretty line. */
function usageResult(code: string, message: string): CommandResult {
  const diagnostic: FacadeDiagnostic = { code, severity: 'error', message };
  const response = buildResponse({
    command: 'explain',
    ok: false,
    diagnostics: [diagnostic],
    next: [],
  });
  return { response, pretty: `error ${code}: ${message}`, exitCode: 2 };
}

/** The deprecation note shown when a request resolved through a deprecated alias. */
function deprecationNote(requestedId: string, currentId: string): string {
  return `${requestedId} is a deprecated alias for ${currentId}.`;
}

/** Render the explanation as human text, labels apart from data, colored via the painter. */
function prettyExplain(
  entry: DiagnosticRegistryEntry,
  requestedId: string,
  viaAlias: boolean,
  painter: Painter,
): string {
  const severityColor = entry.defaultSeverity === 'error' ? 'red' : 'yellow';
  const heading = `${painter.paint('bold', entry.id)}  ${painter.paint(severityColor, entry.defaultSeverity)}  ${entry.title}`;
  const lines = [heading];
  if (viaAlias) {
    lines.push(painter.paint('dim', `resolved from deprecated alias ${requestedId}`));
  }
  const section = (label: string, body: string): void => {
    lines.push('', painter.paint('cyan', label), `  ${body}`);
  };
  section('Meaning', entry.meaning);
  section('Rationale', entry.rationale);
  section('Bad', entry.badExample);
  section('Good', entry.goodExample);
  section('Profiles', entry.profileNotes);
  return lines.join('\n');
}

/**
 * The `explain` command handler. Reads the single positional diagnostic id,
 * resolves it against the registry (current id or deprecated alias), and returns
 * the write-up as a {@link CommandResult}; the dispatcher performs the single
 * write. `--quiet` blanks the pretty rendering, leaving JSON output untouched.
 */
export function explainCommand(context: CommandContext): CommandResult {
  const { positionals } = context.args;
  if (positionals.length === 0 || positionals[0].trim() === '') {
    return usageResult('explain.missing_id', 'Provide a diagnostic id, for example EARS-E006.');
  }
  if (positionals.length > 1) {
    return usageResult('explain.too_many_args', 'Explain takes exactly one diagnostic id.');
  }

  const requestedId = positionals[0].trim();
  const resolved = resolveEntry(requestedId);
  if (resolved === undefined) {
    const suggestions = suggestIds(requestedId);
    return usageResult(
      'explain.unknown_id',
      `Unknown diagnostic id "${requestedId}". Did you mean ${suggestions.join(', ')}?`,
    );
  }

  const { entry, viaAlias } = resolved;
  const response = buildResponse(
    { command: 'explain', ok: true, next: [] },
    {
      id: entry.id,
      requestedId,
      ...(viaAlias ? { alias: true, deprecationNote: deprecationNote(requestedId, entry.id) } : {}),
      severity: entry.defaultSeverity,
      title: entry.title,
      meaning: entry.meaning,
      rationale: entry.rationale,
      badExample: entry.badExample,
      goodExample: entry.goodExample,
      profileNotes: entry.profileNotes,
    },
  );

  const pretty = context.global.quiet
    ? ''
    : prettyExplain(entry, requestedId, viaAlias, context.emitter.painter);
  return { response, pretty, exitCode: 0 };
}
