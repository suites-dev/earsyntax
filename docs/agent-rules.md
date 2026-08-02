# Agent rules

This document is the human-readable mirror of the rules the
`earsyntax instructions <author|convert|repair|review> --file <path> --json`
command returns. The CLI JSON is the source of truth at runtime; this page is the
same content in prose so a person can read it without running the command. The
rules are deterministic data: no clock, no file system, no network, no LLM. The
same mode, profile, and findings always yield the same rule text.

The rules are agent-agnostic. Per-agent wrappers (a Claude Code command, a Cursor
rule, an `AGENTS.md` section, a Kiro steering file) are thin pointers that call
`earsyntax instructions` and follow whatever it returns, so the rules live in one
place and never fork.

Every mode edits the host document in place, at the region the active profile's
locator describes. There is no workspace, no `.ears` side file, no traceability
file, and no acceptance step. Human review happens in the host workflow.

## What each mode tells you to do

The `instructions` response opens with mode-specific rules.

### `author`

Write new EARS requirements into a host file that has none yet, or add to the ones
it has.

- Write new EARS requirements into the requirements region of the host file that
  the locator describes, and nowhere else.
- If that region does not exist yet, create it following the host document
  convention; add no prose or headings beyond it.

### `convert`

Rewrite natural-language requirements already present in the host file.

- Rewrite the natural-language requirements already in the host file requirements
  region into EARS form, in place.
- Preserve each requirement's original intent; change wording only to reach a
  canonical EARS shape.

### `repair`

Fix the findings a `validate` run reported.

- Change only what the reported findings justify; leave passing requirements
  untouched.
- Work through the findings by id using the guidance below, then re-run validation
  and repeat until no error-severity finding remains.
- Do not delete a failing requirement to make validation pass, and do not weaken a
  requirement because it is harder to parse.

### `review`

Summarize the located requirements for a human. This mode never changes the file.

- This review is read-only: describe the state of the located requirements and
  make no change to the host file.
- Summarize how many requirements were reviewed, how they distribute across the
  EARS patterns, and every finding grouped by severity.
- Report the validation status and what a human must resolve before the
  requirements are ready, and leave that decision to the human.

## Reading a `--from` source

`author` and `convert` accept `--from <source>`, a natural-language spec the agent
reads as input while writing EARS into the host file. When it is present, three
more rules apply:

- Read the requirement content from the source file; it is your input to
  understand, not something to modify.
- Write the resulting EARS requirements into the host file at the region the
  locator describes.
- Leave the source file unchanged.

The CLI never reads or transforms the source itself. Reading and understanding it
is the agent's job.

## Choosing a pattern

The writing modes (`author` and `convert`) share the EARS authoring guidance
below. Start by choosing the narrowest pattern that fits the behavior.

- Choose the narrowest EARS pattern that fits the behaviour; do not force
  everything into When.
- Use While for behaviour active during a state, Where for behaviour gated by an
  optional feature, and If ..., then ... for behaviour handling an error or other
  unwanted condition.
- Use the ubiquitous form for behaviour that is always active with no trigger or
  state.

| Behavior in the source                  | Pattern            | Template                                                                                        |
| --------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| Always active, no trigger or state      | Ubiquitous         | `The <system> shall <response>.`                                                                |
| Triggered by an event                   | Event-driven       | `When <trigger>, the <system> shall <response>.`                                                |
| Active during a state                   | State-driven       | `While <state>, the <system> shall <response>.`                                                 |
| Gated by an optional feature            | Optional feature   | `Where <feature>, the <system> shall <response>.`                                               |
| Handling an error or unwanted condition | Unwanted behaviour | `If <condition>, then the <system> shall <response>.`                                           |
| Needs more than one leading clause      | Complex            | order clauses as While, then Where, then When, then If, before `the <system> shall <response>`. |

## One obligation per requirement

- Write one requirement per statement, each with exactly one shall stating a
  single obligation.
- When a statement carries several obligations, split it into separate
  requirements; do not split a phrase that only qualifies the response.

For example, "validate the signature, persist the event, and enqueue a job"
becomes three requirements, but "reject the webhook with a 400 status" stays one,
because the status only qualifies the single obligation.

## Do not invent behavior

- Write only behaviour the source states; do not add logging, retries, rate
  limits, persistence, or permissions it does not require.
- When behaviour is missing, vague, or conflicting, leave it out and flag it for a
  human rather than guessing a precise requirement.

If missing behavior matters, note the gap for a human. Do not fill it with a
plausible-sounding requirement the source never stated.

## Edit policy

The writing modes close with one rule, and every mode carries an `editPolicy`
naming the single editable file:

- Edit only the host file, in place, and preserve the surrounding document
  structure.

The `editPolicy` object is `{ editableFile, preserveStructure: true }`, and
`outputPolicy` is always `"edit-in-place"`. When `--from` is set, the source file
is explicitly not editable.

## Diagnostic-to-fix guidance

In `repair` mode the response appends one fix rule per reported diagnostic id, in
first-seen order. The full mapping the CLI draws from is below; only the ids
present in a run are emitted. Each finding may also carry its own `fix` string.

### Structural errors (`EARS-E###`)

| Id          | Fix                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| `EARS-E001` | Use the specific canonical system name so it matches exactly one catalog entry.                         |
| `EARS-E002` | Use the catalog canonical system name, or confirm the system with the catalog owner.                    |
| `EARS-E003` | Fill the empty leading clause body, or remove the clause if it was accidental.                          |
| `EARS-E004` | Add the response after shall, or flag a question if the source states none.                             |
| `EARS-E005` | Reorder the leading clauses to While, then Where, then When, then If, before the system shall response. |
| `EARS-E006` | Add the missing then: `If <condition>, then the <system> shall <response>.`                             |
| `EARS-E007` | Add a single shall response boundary stating one obligation.                                            |
| `EARS-E008` | Insert the system name before shall: `the <system> shall <response>.`                                   |
| `EARS-E009` | Split into separate requirements, one shall each.                                                       |
| `EARS-E010` | Rewrite the line into a canonical EARS template, or move it out of the requirements region.             |
| `EARS-E011` | Remove the empty group or supply the missing operand in the clause expression.                          |
| `EARS-E012` | Fix the malformed operator run (for example a trailing and or a leading or).                            |
| `EARS-E013` | Balance the parentheses in the clause expression.                                                       |
| `EARS-E014` | Match the EARS keyword casing the profile requires.                                                     |
| `EARS-E015` | Add the comma after the leading clause: `When <trigger>, the <system> shall <response>.`                |
| `EARS-E016` | Restate the prohibition as a positive obligation, or use a profile that allows shall not.               |

### Warnings (`EARS-W###`)

| Id          | Fix                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `EARS-W001` | Use the specific canonical event name.                                                                                          |
| `EARS-W002` | Use the canonical event name, or add the event to the catalog if it is correct.                                                 |
| `EARS-W003` | Use the specific canonical feature name.                                                                                        |
| `EARS-W004` | Use the canonical feature name, or add the feature to the catalog if it is correct.                                             |
| `EARS-W005` | Use the specific canonical state name.                                                                                          |
| `EARS-W006` | Use the canonical state name, or add the state to the catalog if it is correct.                                                 |
| `EARS-W007` | Add a requirement that uses the cataloged term if one is missing, or note the gap; do not invent behaviour to satisfy coverage. |
| `EARS-W008` | Disambiguate the term so it matches one catalog entry, or use the canonical name.                                               |
| `EARS-W009` | Align the unresolved term in the clause with the catalog.                                                                       |
| `EARS-W010` | Add parentheses to the mixed and/or expression to make grouping explicit.                                                       |
| `EARS-W011` | Align the clause term with a catalog entry, or add the term to the catalog if it is correct.                                    |
| `EARS-W012` | Prefer the canonical catalog name over the matched alias.                                                                       |
| `EARS-W013` | Split the semicolon-joined responses into separate requirements.                                                                |
| `EARS-W014` | Rewrite the sentence into a clean EARS template.                                                                                |
| `EARS-W015` | Move the trailing text into the requirement or remove it.                                                                       |
| `EARS-W016` | Replace the vague term with an observable, bounded response, or flag a question if the bound is unknown.                        |

Every id resolves in `earsyntax explain <id>`, which gives the meaning, rationale,
and a corrected example. The full registry, including severity by profile, is in
[the diagnostics reference](diagnostics.md).

## The dialect the rules assume

Each `instructions` response also carries the active profile's `dialect`: the
grammar tolerances the agent may rely on. For the `kiro` profile, for example,
keyword case is case-insensitive, a comma after a leading clause is optional, the
literal `THE SYSTEM` is an allowed system name, and user-story wrappers are
allowed. Write to the dialect the response reports, not to a fixed assumption; a
stricter profile allows less. See [profiles](input-formats.md#profiles) for what
each profile relaxes.

## No approval, ever

The rules never tell an agent to approve, accept, or merge, and never reference a
workspace, work item, or manifest. `review` mode produces a summary and reports
what a human must resolve; it leaves the decision to the human. Acceptance lives
in the host workflow: pull request review, Kiro review, Spec Kit review, or
OpenSpec change review.
