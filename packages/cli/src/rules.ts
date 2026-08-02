/**
 * The deterministic instruction data the `instructions` command returns.
 *
 * `earsyntax instructions <author|convert|repair|review>` hands a coding agent
 * the rules for one loop step against a host file. Those rules are pure data:
 * no clock, no file system, no network, no LLM, and no timestamps. The same
 * mode, profile, and findings always yield the same rule text, so the output is
 * reproducible and diffable.
 *
 * The content is adapted from `docs/agent-rules.md`, keeping the EARS authoring
 * and repair guidance (pattern selection, canonical templates, one obligation
 * per requirement, do-not-invent, diagnostic-to-fix hints) and dropping the
 * retired workspace flow (`.ears` files, `traceability.json`, `questions.md`,
 * and the acceptance gate). The rules describe editing the host document in
 * place, per the active profile's locator.
 *
 * The instruction body never tells an agent to approve, accept, or merge, and
 * never references a workspace, work item, or manifest.
 */

import type { Findings, Profile, ProfileDialect } from '@earsyntax/core';

/** The four instruction modes, in their frozen order. */
export const INSTRUCTION_MODES = ['author', 'convert', 'repair', 'review'] as const;

/** One instruction mode. */
export type InstructionMode = (typeof INSTRUCTION_MODES)[number];

/** Whether `value` is a known instruction mode. */
export function isInstructionMode(value: string): value is InstructionMode {
  return (INSTRUCTION_MODES as readonly string[]).includes(value);
}

/** Only `author` and `convert` may read a `--from` source. */
export function modeAcceptsSource(mode: InstructionMode): boolean {
  return mode === 'author' || mode === 'convert';
}

/** The locator payload: the document kinds the profile locates and a generated summary. */
export interface LocatorPayload {
  documentKinds: string[];
  summary: string;
}

/** The dialect payload: the profile's grammar tolerances, in the facade key order. */
export interface DialectPayload {
  keywordCase: ProfileDialect['keywordCase'];
  commaAfterLeadingClause: ProfileDialect['commaAfterLeadingClause'];
  allowLiteralSystemName: string[];
  allowStoryWrapper: boolean;
  allowFrameMetadata: boolean;
  allowProhibition: boolean;
}

/** A fallback sentence for a locator rule that carries no `note`, mentioning the file kinds. */
function fallbackRuleSentence(rule: Profile['locator']['include'][number], kinds: string): string {
  switch (rule.kind) {
    case 'every-line':
      return `Every non-empty line of ${kinds} files.`;
    case 'heading-section':
      return rule.headingPattern
        ? `Body lines of sections matching /${rule.headingPattern}/ in ${kinds} files.`
        : `Body lines of headed sections in ${kinds} files.`;
    case 'list-item':
      return rule.underHeading
        ? `List items under headings matching /${rule.underHeading}/ in ${kinds} files.`
        : `List items in ${kinds} files.`;
    case 'block':
      return rule.blockPrefix
        ? `${rule.blockPrefix} blocks in ${kinds} files.`
        : `Prefixed blocks in ${kinds} files.`;
    default:
      return `Located regions in ${kinds} files.`;
  }
}

/**
 * Build the locator payload from profile data.
 *
 * The summary is generated from the include rules: each rule's authored `note`
 * when present (the profiles carry human-readable notes for their markdown
 * locators), otherwise a fallback sentence derived from the rule's kind and the
 * document kinds. Nothing here is hand-written per profile, so the summary
 * cannot drift from the profile object.
 */
export function buildLocator(profile: Profile): LocatorPayload {
  const kinds = profile.locator.documentKinds.join(', ');
  const includes = profile.locator.include;
  const summary =
    includes.length === 0
      ? `No requirement regions are located in ${kinds} files.`
      : includes.map((rule) => rule.note ?? fallbackRuleSentence(rule, kinds)).join(' ');
  return { documentKinds: [...profile.locator.documentKinds], summary };
}

/** Build the dialect payload from profile data, in the facade key order. */
export function buildDialect(profile: Profile): DialectPayload {
  const dialect = profile.dialect;
  return {
    keywordCase: dialect.keywordCase,
    commaAfterLeadingClause: dialect.commaAfterLeadingClause,
    allowLiteralSystemName: [...dialect.allowLiteralSystemName],
    allowStoryWrapper: dialect.allowStoryWrapper,
    allowFrameMetadata: dialect.allowFrameMetadata,
    allowProhibition: dialect.allowProhibition,
  };
}

/** Pattern-selection decision guidance, shared by every writing mode. */
const PATTERN_SELECTION: readonly string[] = [
  'Choose the narrowest EARS pattern that fits the behaviour; do not force everything into When.',
  'Use While for behaviour active during a state, Where for behaviour gated by an optional feature, and If ..., then ... for behaviour handling an error or other unwanted condition.',
  'Use the ubiquitous form for behaviour that is always active with no trigger or state.',
];

/** The six canonical EARS templates, one rule each. */
const CANONICAL_TEMPLATES: readonly string[] = [
  'Ubiquitous template: The <system> shall <response>.',
  'Event-driven template: When <trigger>, the <system> shall <response>.',
  'State-driven template: While <state>, the <system> shall <response>.',
  'Optional-feature template: Where <feature>, the <system> shall <response>.',
  'Unwanted-behaviour template: If <condition>, then the <system> shall <response>.',
  'Complex template: order leading clauses as While, then Where, then When, then If, before the <system> shall <response>.',
];

/** One obligation per requirement and compound-splitting guidance. */
const COMPOUND_RULES: readonly string[] = [
  'Write one requirement per statement, each with exactly one shall stating a single obligation.',
  'When a statement carries several obligations, split it into separate requirements; do not split a phrase that only qualifies the response.',
];

/** The do-not-invent guardrails. */
const DO_NOT_INVENT: readonly string[] = [
  'Write only behaviour the source states; do not add logging, retries, rate limits, persistence, or permissions it does not require.',
  'When behaviour is missing, vague, or conflicting, leave it out and flag it for a human rather than guessing a precise requirement.',
];

/** The closing edit rule for the writing modes. */
const EDIT_RULE =
  'Edit only the host file, in place, and preserve the surrounding document structure.';

/** Per-mode opening rules describing what to do to the host file. */
const MODE_INTRO: Record<InstructionMode, readonly string[]> = {
  author: [
    'Write new EARS requirements into the requirements region of the host file that the locator describes, and nowhere else.',
    'If that region does not exist yet, create it following the host document convention; add no prose or headings beyond it.',
  ],
  convert: [
    'Rewrite the natural-language requirements already in the host file requirements region into EARS form, in place.',
    'Preserve each requirement original intent; change wording only to reach a canonical EARS shape.',
  ],
  repair: [
    'Change only what the reported findings justify; leave passing requirements untouched.',
    'Work through the findings by id using the guidance below, then re-run validation and repeat until no error-severity finding remains.',
    'Do not delete a failing requirement to make validation pass, and do not weaken a requirement because it is harder to parse.',
  ],
  review: [
    'This review is read-only: describe the state of the located requirements and make no change to the host file.',
    'Summarize how many requirements were reviewed, how they distribute across the EARS patterns, and every finding grouped by severity.',
    'Report the validation status and what a human must resolve before the requirements are ready, and leave that decision to the human.',
  ],
};

/** Rules added when `--from <source>` points at an input spec (author and convert only). */
const FROM_RULES: readonly string[] = [
  'Read the requirement content from the source file; it is your input to understand, not something to modify.',
  'Write the resulting EARS requirements into the host file at the region the locator describes.',
  'Leave the source file unchanged.',
];

/**
 * Concise repair guidance keyed by current diagnostic id.
 *
 * Adapted from the `docs/diagnostics.md` fix tables. Only ids present in a
 * repair run are emitted, so the rules stay keyed to the findings actually
 * reported. An id absent from this map still appears in the embedded findings
 * (each finding may carry its own `fix`); the map is a compact per-id summary,
 * not the sole source of remediation.
 *
 * The catalog-term entries below (EARS-W001 through EARS-W012) and any
 * `expr.*` term codes only ever surface when the pipeline runs with a catalog
 * supplied. The CLI has no `--catalog` flag today, so `earsyntax` never
 * triggers them; they stay in this map because library callers can pass a
 * catalog into the pipeline directly and still want the fix guidance.
 */
export const FIX_BY_ID: Readonly<Record<string, string>> = {
  'EARS-E001': 'Use the specific canonical system name so it matches exactly one catalog entry.',
  'EARS-E002':
    'Use the catalog canonical system name, or confirm the system with the catalog owner.',
  'EARS-E003': 'Fill the empty leading clause body, or remove the clause if it was accidental.',
  'EARS-E004': 'Add the response after shall, or flag a question if the source states none.',
  'EARS-E005':
    'Reorder the leading clauses to While, then Where, then When, then If, before the system shall response.',
  'EARS-E006': 'Add the missing then: If <condition>, then the <system> shall <response>.',
  'EARS-E007': 'Add a single shall response boundary stating one obligation.',
  'EARS-E008': 'Insert the system name before shall: the <system> shall <response>.',
  'EARS-E009': 'Split into separate requirements, one shall each.',
  'EARS-E010':
    'Rewrite the line into a canonical EARS template, or move it out of the requirements region.',
  'EARS-E011': 'Remove the empty group or supply the missing operand in the clause expression.',
  'EARS-E012': 'Fix the malformed operator run (for example a trailing and or a leading or).',
  'EARS-E013': 'Balance the parentheses in the clause expression.',
  'EARS-E014': 'Match the EARS keyword casing the profile requires.',
  'EARS-E015':
    'Add the comma after the leading clause: When <trigger>, the <system> shall <response>.',
  'EARS-E016':
    'Restate the prohibition as a positive obligation, or use a profile that allows shall not.',
  'EARS-W001': 'Use the specific canonical event name.',
  'EARS-W002': 'Use the canonical event name, or add the event to the catalog if it is correct.',
  'EARS-W003': 'Use the specific canonical feature name.',
  'EARS-W004':
    'Use the canonical feature name, or add the feature to the catalog if it is correct.',
  'EARS-W005': 'Use the specific canonical state name.',
  'EARS-W006': 'Use the canonical state name, or add the state to the catalog if it is correct.',
  'EARS-W007':
    'Add a requirement that uses the cataloged term if one is missing, or note the gap; do not invent behaviour to satisfy coverage.',
  'EARS-W008': 'Disambiguate the term so it matches one catalog entry, or use the canonical name.',
  'EARS-W009': 'Align the unresolved term in the clause with the catalog.',
  'EARS-W010': 'Add parentheses to the mixed and/or expression to make grouping explicit.',
  'EARS-W011':
    'Align the clause term with a catalog entry, or add the term to the catalog if it is correct.',
  'EARS-W012': 'Prefer the canonical catalog name over the matched alias.',
  'EARS-W013': 'Split the semicolon-joined responses into separate requirements.',
  'EARS-W014': 'Rewrite the sentence into a clean EARS template.',
  'EARS-W015': 'Move the trailing text into the requirement or remove it.',
  'EARS-W016':
    'Replace the vague term with an observable, bounded response, or flag a question if the bound is unknown.',
};

/** Per-id fix rules for the diagnostics a repair run reports, in first-seen order, deduped. */
function diagnosticFixRules(findings: Findings | undefined): string[] {
  if (findings === undefined) {
    return [];
  }
  const seen = new Set<string>();
  const rules: string[] = [];
  for (const diagnostic of findings.diagnostics) {
    if (seen.has(diagnostic.id)) {
      continue;
    }
    seen.add(diagnostic.id);
    if (Object.hasOwn(FIX_BY_ID, diagnostic.id)) {
      rules.push(`${diagnostic.id}: ${FIX_BY_ID[diagnostic.id]}`);
    }
  }
  return rules;
}

/** Inputs that shape the rule text beyond the mode. */
export interface BuildRulesInput {
  /** The active instruction mode. */
  mode: InstructionMode;
  /** Whether a `--from` source is present (author and convert only). */
  hasSource: boolean;
  /** The findings a repair run addresses; drives the per-id fix rules. Absent otherwise. */
  findings?: Findings;
}

/**
 * Build the ordered rule strings for one instruction step.
 *
 * The list is deterministic: mode intro, then (for author and convert with a
 * source) the read-from-source rules, then the shared EARS authoring guidance
 * for the writing modes, then the mode-specific tail. Repair appends per-id fix
 * rules for the findings it carries; review lists the canonical templates so the
 * agent can classify the pattern distribution it reports.
 */
export function buildRules(input: BuildRulesInput): string[] {
  const { mode, hasSource, findings } = input;
  const rules: string[] = [...MODE_INTRO[mode]];

  if (hasSource && modeAcceptsSource(mode)) {
    rules.push(...FROM_RULES);
  }

  if (mode === 'author' || mode === 'convert') {
    rules.push(
      ...PATTERN_SELECTION,
      ...CANONICAL_TEMPLATES,
      ...COMPOUND_RULES,
      ...DO_NOT_INVENT,
      EDIT_RULE,
    );
  }

  if (mode === 'repair') {
    rules.push(...diagnosticFixRules(findings), EDIT_RULE);
  }

  if (mode === 'review') {
    rules.push(...CANONICAL_TEMPLATES);
  }

  return rules;
}
