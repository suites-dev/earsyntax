# Spec Kit profile notes

Observed conventions from GitHub Spec Kit (`github/spec-kit`, `templates/spec-template.md`)
and the design decisions behind the `speckit` profile and these fixtures.

## Spec Kit document shape

A Spec Kit feature lives in `specs/<###-feature-name>/` and holds several
markdown files. Only `spec.md` carries requirements; `plan.md` and `research.md`
are narrative planning documents.

`spec.md` has a fixed section layout (heading levels reproduced exactly):

- `# Feature Specification: <name>` with `**Feature Branch**`, `**Created**`,
  `**Status**`, `**Input**` metadata lines.
- `## User Scenarios & Testing *(mandatory)*` containing `### User Story N`
  blocks (plain-language journeys, `**Acceptance Scenarios**` in
  Given/When/Then form) and an `### Edge Cases` list.
- `## Requirements *(mandatory)*` containing `### Functional Requirements`
  (the requirement list) and an optional `### Key Entities` subsection.
- `## Success Criteria *(mandatory)*` with `### Measurable Outcomes` (`SC-###`).
- `## Assumptions`.

The upstream template writes functional requirements as
`- **FR-###**: System MUST <capability>`. Teams adopting EARS keep the
`- **FR-###**:` label and the bullet-list structure but write the requirement
body in EARS form (`the system shall ...`) instead of the loose "System MUST"
placeholder. The fixture `spec.md` reflects that adopted-EARS house style: five
`FR-###` items, one for each EARS template.

## Locator rationale

The include rule is a `heading-section` on `^(functional )?requirements$`. It
matches both `## Requirements` and `### Functional Requirements`, which is
deliberate: some Spec Kit specs put the FR list directly under `## Requirements`
and some nest it under `### Functional Requirements`. Matching either heading
locates the FR bullets in both layouts.

Matching `## Requirements` means the section body also spans the nested
`### Key Entities` subsection (a section body runs to the next heading of equal
or higher level). Key Entities bullets use the same `- **Label**: text` shape as
requirements but are not EARS. The exclude rule
(`^(design|background|context|overview|non-goals?|key entities|success criteria|assumptions)$`)
removes them, so `- **Workspace**: ...` never becomes a candidate.

Narrative that opens with an EARS keyword is handled two ways:

1. Prose in `## User Scenarios & Testing`, `### Edge Cases`, and the planning
   documents is simply never under a Requirements heading, so the include rule
   does not reach it. The fixture places `When ...`, `While ...`, `Where ...`,
   and `If ...` sentences at the start of narrative lines to prove they are not
   located (see `spec.candidates.json` -> `skippedButKeywordOpening`).
2. Non-requirement bullets that DO fall inside the Requirements section body
   (Key Entities) are removed by the exclude rule.

`plan.md` is the locator skip fixture: it has no Requirements heading at all, so
`extract` reports zero candidates even though it contains a fully strict-valid
EARS sentence in its Phase 0 narrative (`The system shall reuse ...`). This is
the strongest false-positive guard: a real requirement sentence in the wrong
document is still correctly ignored.

## Dialect decision: strict grammar, FR ids are structure not grammar

`speckit` keeps every dialect field identical to `strict`. The consequences:

- `allowFrameMetadata` stays `false`. The `FR-###` label is markdown list-item
  structure, so the extractor strips the leading `- ` marker and the
  `**FR-###**: ` label and hands the parser the bare EARS sentence. The
  frame-metadata form that ears-x accepts (`REQ-### the system shall ...`,
  `[source: path:line]`) remains a strict error under speckit; FR labels are not
  that mechanism.
- No `idFormat.pattern` is set. Enforcing `^FR-\d+$` was considered and
  rejected: `idFormat.required` is `false` for Spec Kit (a spec may hold a
  requirement without an FR label), and a malformed label is better surfaced as
  an extractor concern than folded into dialect validation. Keeping `idFormat`
  empty preserves the contract's "speckit differs from strict only in its
  locator" guarantee.

Because no grammar field is relaxed, there is no clean-under-speckit /
fail-under-strict pair. The plan's Agent 11 task 2 ("create strict failure pair
IF Spec Kit syntax needs relaxation") does not apply: Spec Kit syntax, once the
FR label is treated as list structure, is plain strict EARS. This is stated
explicitly in `spec.expected.json` -> `strictDelta.applicable = false`.

## Verification status

The extractor and the markdown-profile linter wiring are not implemented yet
(plan Agents 05-08). Every `*.expected.json` here is authored against the frozen
profile schema and the locator semantics in `docs/contracts/profile.md`, and is
marked `pendingVerification: true`. Line and column numbers are computed from the
current fixture text; `col` is the 1-based column where the EARS sentence begins
after the stripped `- **FR-###**: ` prefix (15 for a 3-digit FR label). Column
semantics should be re-confirmed against the extractor once it lands.
