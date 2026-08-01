# OpenSpec profile fixtures: notes

These fixtures exercise the `openspec` built-in profile
(`packages/core/src/profiles/builtins.ts`). They cover a base capability spec, a
change delta, and a false-positive guard, plus author-derived extraction
snapshots.

## OpenSpec conventions modeled

OpenSpec (https://github.com/Fission-AI/OpenSpec) stores specs as plain
Markdown. The two document families this profile locates over:

- **Base specs**: `openspec/specs/<capability>/spec.md`. Layout: `# Title`, a
  `## Purpose` section, optional narrative sections (for example
  `## Command Syntax` with fenced examples), then `## Requirements` holding one
  or more `### Requirement: <name>` blocks. Each requirement block opens with a
  single requirement statement, followed by one or more `#### Scenario: <name>`
  blocks written as Gherkin steps (`- **WHEN**`, `- **THEN**`, `- **AND**`).
- **Change deltas**: `openspec/changes/<change>/specs/<capability>/spec.md`.
  Same `### Requirement:` / `#### Scenario:` shape, but grouped under H2 delta
  headers: `## ADDED Requirements`, `## MODIFIED Requirements`,
  `## REMOVED Requirements`.

`spec.md`, `change.md`, and `project.md` in this directory are flattened stand-ins
for those paths (the fixtures live at the profile root for test simplicity; the
real path conventions are what the locator's `documentKinds` and downstream path
matching key off).

## Locator rationale

The profile uses two `block` locator rules (see `docs/contracts/profile.md`,
"LocatorRule"):

| Rule id | `blockPrefix` | Purpose |
|---|---|---|
| `openspec.requirement` | `### Requirement:` | Carries the one EARS requirement statement per requirement. |
| `openspec.scenario` | `#### Scenario:` | Retained per the profile contract; contributes candidates only if a stray EARS-shaped line appears inside a scenario. |

Candidate selection for a located block is its **first EARS-shaped body line** (a
line beginning with `When` / `While` / `Where` / `If`, or matching the
ubiquitous `The <system> shall ...` form). This is the crux of the
scenario-extraction decision below.

Because OpenSpec nests `#### Scenario:` (H4) inside `### Requirement:` (H3), the
scenario block region is a subset of the requirement block region. In a
well-formed OpenSpec document the requirement rule (listed first) claims the one
statement line, and the scenario rule adds nothing. The scenario rule is kept
because the profile contract lists scenario blocks as locator targets and as a
defensive net for a canonical requirement line mistakenly written inside a
scenario body.

Fenced code blocks are ignored (`codeFences: 'ignore'`), so the `## Command
Syntax` and `## Example` fences never produce candidates.

## Scenario-extraction decision

**Decision: scenario Gherkin steps are frame content and produce zero
candidates.** An OpenSpec scenario is a Gherkin trigger/outcome pair
(`- **WHEN** ...`, `- **THEN** ...`, `- **AND** ...`). These are not canonical
EARS sentences: the `- **WHEN**` bullet is a fragment, and the `- **THEN**`
outcome is written in present tense without `shall`. Reconstructing an EARS
event-driven requirement from a WHEN/THEN pair would require inserting `shall`
and rewriting tense, which is not deterministic and is out of scope. Treating the
raw Gherkin bullets as candidates would produce false positives under every EARS
dialect. The "first EARS-shaped body line" rule therefore skips them: a scenario
block has no EARS-shaped line, so it yields no candidate. This mirrors how the
`kiro` profile skips user-story wrapper lines as frame content.

The `openspec.scenario` locator rule is still present (the contract lists
scenario blocks as targets). It only ever fires if an author writes a literal
canonical requirement line inside a scenario body; standard Gherkin steps never
trigger it.

## Delta path conventions

Extraction is **delta-section-agnostic**. `## ADDED Requirements`,
`## MODIFIED Requirements`, and `## REMOVED Requirements` are H2 organizational
headers, not locator targets. The `openspec.requirement` block rule fires on
every `### Requirement:` block regardless of which delta section contains it, so:

- ADDED requirements are candidates (new statements to validate).
- MODIFIED requirements are candidates (the revised statement is validated).
- REMOVED requirements are candidates too (the block still carries a statement
  line). `change.md` includes a REMOVED block with no scenario to confirm the
  block rule does not depend on a trailing scenario.

Delta-awareness lives in the path conventions (`openspec/changes/**` vs
`openspec/specs/**`), not in the markdown locator: the locator does not parse
ADDED/MODIFIED/REMOVED semantics; a consumer that cares about delta status reads
it from the H2 header, while EARS validation runs uniformly on every requirement
statement.

## Dialect: no relaxation vs strict

The `openspec` dialect is identical to `strict`
(`keywordCase: 'strict'`, `allowLiteralSystemName: []`,
`commaAfterLeadingClause: 'required'`, no story wrapper, frame metadata, or
prohibition). It differs from `strict` only in the markdown locator and
`documentKinds: ['markdown']`. **No dialect relaxation is needed, so there is no
strict-failure pair for this profile.** Under the `strict` profile the same
`.md` files locate nothing at all (`strict.documentKinds` is `['ears','text']`),
so running these fixtures under `strict` yields an empty result rather than a set
of grammar failures. The openspec/strict difference is purely locator plus
document kind, exactly as `docs/contracts/profile.md` states for the near-strict
profiles.

Caveat on `SHALL` vs `shall`: real OpenSpec house style often writes requirement
statements with RFC-2119 uppercase `SHALL` (`The system SHALL ...`). Under the
frozen `openspec` dialect (`keywordCase: 'strict'`) the canonical lowercase
`shall` is required, so these fixtures use lowercase `shall` to validate clean. A
project that writes uppercase `SHALL` under the `openspec` profile would raise a
keyword-casing finding once the dialect layer is wired; that is expected and
correct for a near-strict profile.

## Expected-diagnostics matrix

| Fixture | Profile | Candidates | Expected findings |
|---|---|---|---|
| `spec.md` | `openspec` | 5 (one per `### Requirement:`) | clean (zero findings) |
| `change.md` | `openspec` | 4 (2 ADDED, 1 MODIFIED, 1 REMOVED) | clean (zero findings) |
| `project.md` | `openspec` | 0 | clean, and no candidate is located |
| `spec.md` / `change.md` | `strict` | 0 (markdown not in `strict.documentKinds`) | empty result, no findings |

There is no strict-failure fixture because the dialect is not relaxed (see
above). All extracted candidate statements were checked clean against the base
linter (`lintEars`); see the verification note.

## Verification status

- **Verified now**: every extracted candidate statement in `spec.candidates.json`
  and `change.candidates.json` lints clean under `@earsyntax/core`'s `lintEars`
  (base strict Mavin grammar). The built-in `openspec` profile validates under
  `validateProfile`, and `pnpm build`/`pnpm test` stay green.
- **Pending-verification**: the extraction snapshots (`file`/`line`/`col`/`text`/
  `locatorRuleId`) are author-derived. The profile-driven locator/extractor and
  the dialect layer (keyword casing, comma, etc.) are not yet wired into
  `@earsyntax/core`, so the `extract` command output cannot be diffed against
  these snapshots yet. When the extractor lands, these files are the expected
  output for `extract fixtures/profiles/openspec/spec.md --profile openspec`
  and the change equivalent.
