/**
 * Built-in profiles as data for `@earsyntax/core`.
 *
 * Each profile is a plain const object conforming to profile schema v1
 * (`docs/contracts/profile.md`). There is no behavior here: adding a host means
 * adding a data object, not editing a parser conditional. Every object in this
 * module is validated by {@link validateProfile} in the profile test suite.
 *
 * These are sane, schema-valid first versions. The host profile agents (plan
 * Agents 09-12) refine the concrete locator patterns and severity maps against
 * fixture pairs; the shapes and the superset relationship they must preserve
 * are fixed here.
 *
 * Determinism note: pure data. No clock, file system, or network.
 */

import type { Profile, ProfileName } from './schema.js';

/**
 * `strict`: canonical Mavin EARS. The default profile. Locates every non-empty
 * line of `.ears` and plain-text files. No dialect tolerances, no id
 * requirement, no severity overrides.
 */
const STRICT: Profile = {
  name: 'strict',
  notation: 'ears',
  dialect: {
    keywordCase: 'strict',
    allowLiteralSystemName: [],
    commaAfterLeadingClause: 'required',
    allowStoryWrapper: false,
    allowFrameMetadata: false,
    allowProhibition: false,
  },
  locator: {
    documentKinds: ['ears', 'text'],
    include: [{ id: 'strict.every-line', kind: 'every-line' }],
    exclude: [],
    codeFences: 'ignore',
  },
  severity: {},
  idFormat: { required: false },
};

/**
 * `ears-x`: a strict superset. Every strict-valid requirement is ears-x-valid
 * unchanged; ears-x only adds tolerances (frame metadata, `[source:]` tags,
 * `shall not` prohibition) and an optional `REQ-###` id shape. Same every-line
 * locator over `.ears` and plain text.
 */
const EARS_X: Profile = {
  name: 'ears-x',
  notation: 'ears',
  dialect: {
    keywordCase: 'strict',
    allowLiteralSystemName: [],
    commaAfterLeadingClause: 'required',
    allowStoryWrapper: false,
    allowFrameMetadata: true,
    allowProhibition: true,
  },
  locator: {
    documentKinds: ['ears', 'text'],
    include: [{ id: 'ears-x.every-line', kind: 'every-line' }],
    exclude: [],
    codeFences: 'ignore',
  },
  severity: {},
  idFormat: { required: false, pattern: '^REQ-\\d+$' },
};

/**
 * `kiro`: EARS embedded in Kiro `requirements.md`. Relaxes casing, literal
 * system name, and the leading comma, and skips user-story wrapper lines as
 * frame content. Locates bullet and numbered list items under
 * `#### Acceptance Criteria` headings. Severity is tuned so Kiro house style
 * validates clean while the same document fails under strict.
 */
const KIRO: Profile = {
  name: 'kiro',
  notation: 'ears',
  dialect: {
    keywordCase: 'case-insensitive',
    allowLiteralSystemName: ['THE SYSTEM'],
    commaAfterLeadingClause: 'optional',
    allowStoryWrapper: true,
    allowFrameMetadata: false,
    allowProhibition: false,
  },
  locator: {
    documentKinds: ['markdown'],
    include: [
      {
        id: 'kiro.acceptance-criteria-item',
        kind: 'list-item',
        underHeading: '^acceptance criteria$',
        listMarker: 'any',
        note: 'Bullet and numbered items under #### Acceptance Criteria headings in requirements.md.',
      },
    ],
    exclude: [],
    codeFences: 'ignore',
  },
  severity: {
    'EARS-W011': 'off',
    'EARS-W014': 'off',
  },
  idFormat: { required: false },
};

/**
 * `speckit`: EARS in Spec Kit `specs/**\/spec.md`. Near-strict dialect. Differs
 * from strict mainly in its markdown locator: requirement sections are targeted
 * and design/background prose is excluded so narrative that merely opens with an
 * EARS keyword does not become a candidate.
 */
const SPECKIT: Profile = {
  name: 'speckit',
  notation: 'ears',
  dialect: {
    keywordCase: 'strict',
    allowLiteralSystemName: [],
    commaAfterLeadingClause: 'required',
    allowStoryWrapper: false,
    allowFrameMetadata: false,
    allowProhibition: false,
  },
  locator: {
    documentKinds: ['markdown'],
    include: [
      {
        id: 'speckit.requirements-section',
        kind: 'heading-section',
        headingPattern: '^(functional )?requirements$',
        note: 'Body lines of Requirements sections in specs/**/spec.md.',
      },
    ],
    exclude: [
      {
        id: 'speckit.non-requirement-section',
        kind: 'heading-section',
        headingPattern: '^(design|background|context|overview|non-goals?)$',
        note: 'Narrative sections that must not produce candidates.',
      },
    ],
    codeFences: 'ignore',
  },
  severity: {},
  idFormat: { required: false },
};

/**
 * `openspec`: EARS in OpenSpec specs and changes. Near-strict dialect. Locates
 * `### Requirement:` bodies and `#### Scenario:` blocks inside
 * `openspec/specs/**` and `openspec/changes/**`; non-requirement prose is
 * skipped by the block locator.
 */
const OPENSPEC: Profile = {
  name: 'openspec',
  notation: 'ears',
  dialect: {
    keywordCase: 'strict',
    allowLiteralSystemName: [],
    commaAfterLeadingClause: 'required',
    allowStoryWrapper: false,
    allowFrameMetadata: false,
    allowProhibition: false,
  },
  locator: {
    documentKinds: ['markdown'],
    include: [
      {
        id: 'openspec.requirement',
        kind: 'block',
        blockPrefix: '### Requirement:',
        note: 'Body lines of a ### Requirement: heading block.',
      },
      {
        id: 'openspec.scenario',
        kind: 'block',
        blockPrefix: '#### Scenario:',
        note: 'Body lines of a #### Scenario: heading block.',
      },
    ],
    exclude: [],
    codeFences: 'ignore',
  },
  severity: {},
  idFormat: { required: false },
};

/**
 * The built-in profiles keyed by name, in the frozen order `strict`, `ears-x`,
 * `kiro`, `speckit`, `openspec` (the order the `profiles` command renders).
 */
export const BUILTIN_PROFILES: Readonly<Record<ProfileName, Profile>> = {
  strict: STRICT,
  'ears-x': EARS_X,
  kiro: KIRO,
  speckit: SPECKIT,
  openspec: OPENSPEC,
};

/** The five built-in profile names in render order. */
export const BUILTIN_PROFILE_NAMES: readonly ProfileName[] = [
  'strict',
  'ears-x',
  'kiro',
  'speckit',
  'openspec',
];
