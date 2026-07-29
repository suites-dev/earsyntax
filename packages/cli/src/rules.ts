/**
 * The instruction bodies the `instructions` command returns, embedded as data.
 *
 * These arrays are the canonical rule text from `docs/agent-rules.md`. They are
 * embedded here, not read from `docs/` at runtime, so the published binary
 * carries its own contract. The CLI JSON is the source of truth agents read;
 * the doc is the human-readable mirror of the same content.
 */

import type { InstructionMode } from './mode.js';

/** The five allowed EARS line templates, constant across all modes. */
export const ALLOWED_PATTERNS = [
  'The <system> shall <response>.',
  'When <trigger>, the <system> shall <response>.',
  'While <state>, the <system> shall <response>.',
  'Where <feature>, the <system> shall <response>.',
  'If <condition>, then the <system> shall <response>.',
];

/** The metadata prefixes an agent may put in front of a requirement line. */
export const METADATA_PREFIXES = [
  'REQ-001:',
  'REQ-001 [source: path:line]:',
  'REQ-001 [source: path:line-line]:',
];

const AUTHOR_RULES = [
  'Treat the prompt as the only source of behavior; do not add requirements it does not state.',
  'Write only EARS requirements in the .ears output file.',
  'Use one requirement per non-empty line.',
  'Give every requirement a stable ID such as REQ-001.',
  'Use the narrowest EARS pattern that fits the described behavior.',
  'Do not invent behavior that seems reasonable, secure, or common but is absent from the prompt.',
  'Do not hide ambiguity inside vague wording.',
  'Split compound behavior into separate requirements when the response holds more than one observable obligation.',
  'Write unclear behavior to questions.md instead of guessing a precise requirement.',
  'Record each generated requirement in traceability.json; author-mode requirements have no source line, so leave the source object empty and set confidence.',
];

const CONVERT_RULES = [
  'Read the full source before writing requirements.',
  'Write only EARS requirements in the .ears output file.',
  'Use one requirement per non-empty line.',
  'Give every requirement a stable ID such as REQ-001.',
  'Preserve source traceability with a [source: path:line] prefix when the source line is known.',
  'Use the narrowest EARS pattern that fits the source behavior.',
  'Do not invent behavior that is not stated in the source.',
  'Do not hide ambiguity inside vague wording.',
  'Split compound behavior into separate requirements when the response holds more than one observable obligation.',
  'Write unclear behavior to questions.md instead of guessing a precise requirement.',
  'Maintain traceability.json for every generated requirement and question.',
  'Do not edit the source spec unless the user explicitly asks.',
];

const REPAIR_RULES = [
  'Change only what the diagnostics justify; leave passing requirements untouched.',
  'Preserve requirement IDs unless a duplicate-ID diagnostic forces a change.',
  'Preserve the [source: path:line] references on repaired lines.',
  'Preserve the intended behavior; do not weaken a requirement because it is harder to parse.',
  'Do not delete a failing requirement to make validation pass.',
  'For ears.invalid_if_then_form, add the missing then boundary: If <condition>, then the <system> shall <response>.',
  'For lint.vague_response, replace the vague term with an observable, bounded response, or raise a question in questions.md if the bound is unknown.',
  'If the intended behavior is unclear, write a question and leave a clear placeholder instead of guessing.',
  'Update traceability.json if an ID or source reference changes.',
];

const REVIEW_RULES = [
  "Present a review summary before recommending acceptance; do not accept on the human's behalf.",
  'Report how many requirements were generated and the distribution across the six EARS patterns.',
  'List every unresolved question in questions.md and the requirements each one blocks.',
  'State the validation status and the exact command that produced it.',
  'Call out source lines translated with medium or low confidence.',
  'Call out any source behavior that was intentionally not converted, with the reason.',
  'Recommend acceptance only when validation is clean and no blocking questions remain.',
];

/** The rule array for a given instruction mode. */
export function rulesFor(mode: InstructionMode): string[] {
  switch (mode) {
    case 'author':
      return [...AUTHOR_RULES];
    case 'convert':
      return [...CONVERT_RULES];
    case 'repair':
      return [...REPAIR_RULES];
    case 'review':
      return [...REVIEW_RULES];
  }
}

/** A representative example line for a mode, using the work item's source path. */
export function exampleLine(mode: InstructionMode, sourcePath?: string): string {
  const src = sourcePath ?? 'specs/source.md';
  switch (mode) {
    case 'author':
      return 'REQ-001: When a payment webhook is received, the billing service shall verify the HMAC signature.';
    case 'convert':
    case 'review':
      return `REQ-001 [source: ${src}:7]: When a payment webhook is received, the billing service shall verify the HMAC signature.`;
    case 'repair':
      return `REQ-002 [source: ${src}:10]: If the HMAC signature is invalid, then the billing service shall reject the webhook.`;
  }
}
