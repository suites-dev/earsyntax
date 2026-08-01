/**
 * Shared helpers used across the extractors. Not part of the public API.
 */

/**
 * A declared source reference lifted from a `[source: path:line]` metadata
 * segment. `line` is the start line when the segment carries a `line-line`
 * range.
 */
export interface SourceRef {
  /** The declared source path (for example `specs/checkout.md`). */
  file: string;
  /** The declared 1-based line, or the start line of a `line-line` range. */
  line: number;
}

/**
 * A requirement text split into an optional leading id, an optional declared
 * source reference, and the remaining text with the metadata prefix removed.
 */
export interface SplitId {
  /** The extracted identifier, or `undefined` when no id prefix was present. */
  id: string | undefined;
  /**
   * The declared source reference from a `[source: path:line]` segment, or
   * `undefined` when absent or malformed.
   */
  ref: SourceRef | undefined;
  /** The requirement text with any leading metadata prefix removed. */
  text: string;
}

/**
 * Matches a leading metadata prefix and captures the requirement text.
 *
 * Accepts the forms from the orchestration brief:
 *
 * - `REQ-001: <text>`
 * - `REQ-001 [source: path:line]: <text>`
 * - `REQ-001 [source: path:line-line]: <text>`
 *
 * Group 1 is the identifier, tightened to a requirement-ID shape rather than any
 * word: an uppercase letter followed by uppercase letters, digits, dots,
 * underscores, or hyphens, with a leading lookahead requiring at least one digit
 * or hyphen somewhere in the token. This admits `REQ-001`, `US-3`, and `ABC001`
 * while rejecting Title-case or all-caps prose labels: `Note:` and `Summary:`
 * are not ids (lowercase letters), and `THE SYSTEM SHALL:` never reaches the
 * colon as one token. Group 2 is the optional bracketed segment, captured as an
 * opaque blob and validated separately by {@link SOURCE_REF}; a malformed
 * bracket is still stripped from the text. Group 3 is the requirement text.
 *
 * Because the identifier cannot contain spaces, a normal requirement such as
 * `When a payment ...` never matches: the first token `When` is followed by
 * neither a bracket nor a colon.
 */
const ID_PREFIX = /^((?=[A-Z0-9._-]*[0-9-])[A-Z][A-Z0-9._-]*)(?:\s*(\[[^\]]*\]))?\s*:\s*(\S.*)$/;

/**
 * Parses the bracketed metadata blob into a {@link SourceRef}. Matches
 * `[source: path:line]` and `[source: path:line-line]`. A non-matching blob is
 * treated as malformed and yields no reference.
 */
const SOURCE_REF = /^\[source:\s*(.+?):(\d+)(?:-\d+)?\s*\]$/;

/**
 * Split a raw requirement string into an optional leading id, an optional
 * declared source reference, and its text.
 *
 * When no metadata prefix is present the whole trimmed string is returned as
 * `text` with no `id` and no `ref`. A malformed `[source: ...]` segment (one
 * that does not parse as `path:line`) is stripped from the text; the id is
 * still extracted and `ref` is `undefined`.
 */
export function splitId(raw: string): SplitId {
  const trimmed = raw.trim();
  const match = ID_PREFIX.exec(trimmed);
  if (!match) {
    return { id: undefined, ref: undefined, text: trimmed };
  }

  const id = match[1];
  // Optional capture group: `string` per the type checker, but `undefined` at
  // runtime when the bracket segment is absent. A truthy check covers both.
  const bracket = match[2];
  const text = match[3].trim();

  let ref: SourceRef | undefined;
  if (bracket) {
    const refMatch = SOURCE_REF.exec(bracket);
    if (refMatch) {
      ref = { file: refMatch[1].trim(), line: Number(refMatch[2]) };
    }
  }

  return { id, ref, text };
}

/**
 * Read the `requirements` array from a parsed structured document.
 *
 * Shared by the YAML and JSON extractors: both expect a top-level object/mapping
 * with a `requirements` array/sequence. Returns the array when present, or
 * `undefined` when the top level is not an object or `requirements` is not an
 * array. This is the single definition of the accepted top-level shape.
 *
 * @param parsed The value returned by `JSON.parse` or `jsYaml.load`.
 * @returns The requirements array, or `undefined` when the shape is wrong.
 */
export function readRequirementsArray(parsed: unknown): unknown[] | undefined {
  if (typeof parsed !== 'object' || parsed === null) {
    return undefined;
  }
  const requirements = (parsed as Record<string, unknown>).requirements;
  return Array.isArray(requirements) ? requirements : undefined;
}
