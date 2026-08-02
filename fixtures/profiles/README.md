# Profile fixtures

These fixtures are the executable definition of each built-in profile. A profile
is data (see `docs/contracts/profile.md`); its fixtures pin what that data means
for real host content: which lines a profile locates, which requirements it
accepts, and which diagnostics it emits on the requirements it rejects.

Each profile owns one directory under `fixtures/profiles/`. Within a directory,
the fixtures share a common layout so a single runner can drive every profile.

## Layout

For each profile there are three kinds of file:

| File                             | Purpose                                                                                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `<name>.ears` (or host document) | The input document. One requirement per line for `.ears`; the host's native document shape for markdown profiles.                                                                                                                          |
| `<name>.expected.json`           | The lint expectation for that document under the profile: findings summary plus a per-line list of the diagnostics the profile should emit.                                                                                                |
| `<name>.candidates.json`         | The extract expectation: the candidate list the profile's locator yields, in the `Candidate` field shape (`file`, `line`, `col`, `text`, `profile`, `locatorRuleId`, optional `requirementId`). Snapshot target for the `extract` command. |

A profile that draws a line between accept and reject (for example strict versus
ears-x on `shall not`) records both sides. Same-document, two-profile pairs use
a per-line `strict` / `ears-x` block inside one `*.expected.json` so one file
drives both sides of the ruling. Cross-profile summaries live in `matrix.json`.

### `matrix.json`

`matrix.json` at the root of `fixtures/profiles/` is the cross-profile summary.
Each row names a fixture and its expected `ok` result under each profile that
document targets, with a short note. It carries the superset invariant statement
and the strict-fail / profile-pass pairs at a glance; per-diagnostic detail
stays in each fixture's `*.expected.json`.

### Expectation and verification fields

Every `*.expected.json` line entry uses:

- `expect`: array of `{ id, code, severity }` the profile should emit for that
  line. Empty means the line is clean. `id` is the registry id
  (`EARS-E###` / `EARS-W###`); `code` is the dotted alias, included for
  readability.
- `ruling`: the `ES-D-###` decision from `GRAMMAR.md` the line witnesses, where
  one applies.
- `verification`: `verified-core-api` when the expectation was confirmed against
  `lintEars` in the current parser, or `pending-c4b` when it depends on a
  host-native grammar ruling not yet wired into the parser. Pending entries also
  carry a `currentBehavior` note describing what the parser does today, so the
  gap is explicit rather than silent.

## strict

`strict` is canonical Mavin EARS and the default profile. It locates every
non-empty line of `.ears` and plain-text files (`strict.every-line`), applies no
dialect tolerances, requires no id, and sets no severity overrides.

| Fixture               | What it pins                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `strict/valid.ears`   | One clean document across all six patterns (ubiquitous, state-driven `While`, event-driven `When`, optional-feature `Where`, unwanted-behaviour `If`-`then`, and two complex combinations: `While`+`When`, `Where`+`If`). Zero diagnostics.                                                                                                                                  |
| `strict/invalid.ears` | One violation per line, each mapped to the exact registry id and the `ES-D` ruling it breaks: keyword case (`EARS-E014`, ES-D-007), leading comma (`EARS-E015`, ES-D-001), prohibition (`EARS-E016`, ES-D-004), If without then (`EARS-E006`, ES-D-002), two triggers (`EARS-E005`, ES-D-003), pronoun system (`EARS-E008`, ES-D-005), double shall (`EARS-E009`, ES-D-008). |

`strict/valid.ears` is also the superset anchor: `matrix.json` asserts it
validates identically under ears-x.

## ears-x

`ears-x` is a strict superset. Every strict-valid requirement is ears-x-valid
unchanged; ears-x only adds tolerances (frame metadata, `[source:]` tags, and
`shall not` prohibition) and an optional `REQ-###` id shape. It uses the same
`every-line` locator over `.ears` and plain text.

| Fixture                      | What it pins                                                                                                                                                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ears-x/prohibition.ears`    | `shall not` prohibitions across ubiquitous, state-driven, and event-driven forms. Valid under ears-x (`allowProhibition`), rejected under strict with `EARS-E016`. The paired `*.expected.json` records both profile results per line. |
| `ears-x/frame-metadata.ears` | `REQ-###` frame ids and `[source: path:line]` tags. Valid under ears-x (`allowFrameMetadata`; ids match `idFormat.pattern` `^REQ-\d+$`), rejected under strict where the prefixed line matches no shell pattern (`EARS-E010`).         |

## kiro

`kiro` validates EARS embedded in a Kiro `requirements.md`. It relaxes casing to
case-insensitive, accepts the literal `THE SYSTEM` as the system name, makes the
leading-clause comma optional, and skips user-story wrapper lines as frame
content. Its locator targets bullet and numbered list items under a
`#### Acceptance Criteria` heading (`kiro.acceptance-criteria-item`), ignores
code fences, and sets `EARS-W011` and `EARS-W014` to `off` so Kiro's free-form
domain text stays clean when a catalog is supplied. The host document keeps its
realistic name (`requirements.md`, `design.md`); its sidecars follow the uniform
`<name>.expected.json` / `<name>.candidates.json` convention above.

| Fixture                             | What it pins                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kiro/requirements.md`              | A real-world-shaped Kiro spec: three requirements, each a user story plus a `#### Acceptance Criteria` numbered list, in Kiro house style (all-caps `WHEN`/`IF`/`WHILE`/`WHERE`/`THEN`/`SHALL`, literal `THE SYSTEM`, no leading comma). Covers event-driven, unwanted-behaviour, state-driven, optional-feature, and ubiquitous forms. Clean under kiro; fails under strict.                                                                                    |
| `kiro/requirements.expected.json`   | Per-criterion, two-profile expectation (per-line `kiro` / `strict` block). `kiro` is `ok: true` with empty `expect` on every line; `strict` is `ok: false` with `EARS-E014` (casing, ES-D-007) plus `EARS-E015` (missing leading comma, ES-D-001) for rows with a leading clause, and `EARS-E014` alone for the ubiquitous row. Carries the top-level `verification: pending-c4b` and `currentBehavior` note: the parser does not yet consume the dialect block. |
| `kiro/requirements.candidates.json` | The nine candidates the kiro locator yields from `requirements.md`, in the Candidate shape (`file`/`line`/`col`/`text`/`profile`/`locatorRuleId`). Snapshot target for `extract`; the `col` and marker-stripping conventions are documented in the file, pending reconciliation with the extractor (W2-pipeline).                                                                                                                                                |
| `kiro/design.md`                    | False-positive guard: a Kiro-shaped design document with EARS keywords in narrative prose and in a fenced code block, and no `#### Acceptance Criteria` heading.                                                                                                                                                                                                                                                                                                 |
| `kiro/design.candidates.json`       | Asserts the guard yields zero candidates: no Acceptance Criteria heading to anchor the list-item rule, and `codeFences: ignore` removes the fenced requirement-looking lines.                                                                                                                                                                                                                                                                                    |
| `kiro/NOTES.md`                     | Observed Kiro conventions (sourced from kiro.dev docs) and exactly what the profile relaxes relative to strict.                                                                                                                                                                                                                                                                                                                                                  |

## speckit

`speckit` validates EARS embedded in a Spec Kit `specs/**/spec.md`. Its dialect
is byte-for-byte `strict`: no casing, literal-system-name, leading-comma,
story-wrapper, frame-metadata, or prohibition relaxation. The profile differs
from strict only in its markdown locator. The include rule is a
`heading-section` on `^(functional )?requirements$` (`speckit.requirements-section`),
matching both `## Requirements` and `### Functional Requirements`; the exclude
rule (`speckit.non-requirement-section`) drops sibling prose subsections
(`### Key Entities`, design, background, and similar) that Spec Kit nests inside
or beside the Requirements section. Code fences are ignored and no `idFormat`
pattern is set; the `FR-###` label is treated as list-item structure the
extractor strips, not as a grammar tolerance (see `speckit/NOTES.md`). The host
documents keep their realistic names (`spec.md`, `plan.md`); their sidecars
follow the uniform `<name>.candidates.json` / `<name>.expected.json` convention
above.

| Fixture                        | What it pins                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `speckit/spec.md`              | A real-Spec-Kit-shaped feature spec: full section layout (User Scenarios, Requirements, Key Entities, Success Criteria, Assumptions) with five `- **FR-###**:` items in adopted-EARS house style, one per template (ubiquitous, event-driven, state-driven, optional-feature, unwanted-behaviour). Clean under speckit; identical verdict under strict.     |
| `speckit/spec.candidates.json` | The five candidates the speckit locator yields from `spec.md`, in the `Candidate` shape (`file`/`line`/`col`/`text`/`profile`/`locatorRuleId`/`requirementId`). Also records `skippedButKeywordOpening`: narrative lines that open with `When`/`While`/`Where`/`If` and one Key Entities bullet, each with why it is not a candidate. Pending-verification. |
| `speckit/spec.expected.json`   | The lint expectation: `spec.md` and `plan.md` both clean under speckit, plus a `strictDelta` block stating that no clean-under-speckit / fail-under-strict pair applies because no grammar field is relaxed. Pending-verification.                                                                                                                          |
| `speckit/plan.md`              | Locator skip fixture: a Spec Kit `plan.md` with no Requirements heading. Contains keyword-opening narrative and one fully strict-valid EARS sentence in Phase 0, none of which is under a requirements heading.                                                                                                                                             |
| `speckit/plan.candidates.json` | Asserts the skip fixture yields zero candidates and lists the keyword-opening decoys that are correctly ignored. Pending-verification.                                                                                                                                                                                                                      |
| `speckit/NOTES.md`             | Observed Spec Kit conventions (sourced from `github/spec-kit`), the locator rationale, and the strict-grammar / FR-label decision.                                                                                                                                                                                                                          |

## openspec

`openspec` validates EARS embedded in OpenSpec specs and change deltas. Its
dialect is byte-for-byte `strict`: no casing, literal-system-name, leading-comma,
story-wrapper, frame-metadata, or prohibition relaxation. The profile differs
from strict only in its markdown locator and `documentKinds: ['markdown']`. Two
`block` rules locate requirements: `openspec.requirement` on `### Requirement:`
carries the one EARS statement per requirement, and `openspec.scenario` on
`#### Scenario:` is retained per contract but yields no candidate for standard
Gherkin `- **WHEN**/**THEN**/**AND**` steps. A block's candidate is its first
EARS-shaped body line, so scenario steps are frame content. Code fences are
ignored and no `idFormat` pattern is set. Extraction is delta-section-agnostic:
`## ADDED`/`## MODIFIED`/`## REMOVED` are H2 organizational headers, not locator
targets. The openspec directory uses its own descriptive file set, listed here.

| Fixture                            | What it pins                                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openspec/spec.md`                 | A real-OpenSpec-shaped base capability spec (`openspec/specs/<capability>/spec.md`): `## Purpose`, a `## Command Syntax` fence, and five `### Requirement:` blocks with Gherkin scenarios, one per template (ubiquitous, event-driven, state-driven, optional-feature, unwanted-behaviour). Clean under openspec. |
| `openspec/change.md`               | A change delta (`openspec/changes/<change>/specs/<capability>/spec.md`) with `## ADDED`, `## MODIFIED`, and `## REMOVED` sections, demonstrating delta-section-agnostic extraction. Clean under openspec.                                                                                                         |
| `openspec/spec.candidates.json`    | The five candidates the openspec locator yields from `spec.md`, in the `Candidate` shape (`file`/`line`/`col`/`text`/`profile`/`locatorRuleId`). Pending-verification (extractor not yet wired); candidate statements confirmed clean against `lintEars`.                                                         |
| `openspec/change.candidates.json`  | The four candidates from `change.md` (2 ADDED, 1 MODIFIED, 1 REMOVED), same shape. Pending-verification; candidate statements confirmed clean against `lintEars`.                                                                                                                                                 |
| `openspec/project.md`              | False-positive guard: an `openspec/project.md`-shaped context document with keyword-opening prose and a fenced block, and no `### Requirement:` / `#### Scenario:` heading.                                                                                                                                       |
| `openspec/project.candidates.json` | Asserts the guard yields zero candidates: no requirement or scenario block opens, so the block locator has nothing to target. Lists the `keywordOpeningDecoys` that are correctly ignored.                                                                                                                        |
| `openspec/NOTES.md`                | Observed OpenSpec conventions (sourced from `Fission-AI/OpenSpec`), the locator rationale, the scenario-extraction decision, delta path conventions, the `SHALL`/`shall` caveat, and the no-relaxation / no-strict-pair statement.                                                                                |
