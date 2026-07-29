# Spec-to-EARS agent rules

This document is the canonical instruction body for coding agents that turn source specifications into `.ears` files. The `earsyntax instructions author|convert|repair|review --json` command returns these rules; the CLI JSON is the source of truth at runtime, and this file is the human-readable version of the same content.

Per-agent wrappers (a Claude Code command, a Cursor rule, an `AGENTS.md` section, a Kiro steering file) are thin pointers to the CLI commands. They must not fork or paraphrase these rules; they call `earsyntax instructions` and follow whatever it returns, so there is one place to change the rules.

The rules split cleanly by step: read the source, write only requirements, classify, split compounds, do not invent, raise questions, preserve traceability, repair from diagnostics, and review before accept.

## Read the source first

Before writing any `.ears`, read the full source artifact. Sources include a Spec Kit `spec.md`, an OpenSpec `proposal.md` or delta spec, a Kiro `requirements.md`, a PRD, an issue description, a design brief, or any user-supplied Markdown, YAML, JSON, or plain text.

While reading, identify:

- actors and users
- systems or components under requirement
- events that trigger behavior
- states during which behavior applies
- optional features or feature flags that gate behavior
- unwanted or error conditions
- observable system responses
- constraints that are genuinely requirements
- ambiguous statements that need human clarification

In `convert` mode the `instructions` response includes source excerpts with line numbers. Read the whole file anyway; the excerpts are a starting point, not the full source.

## Write only requirements

The `.ears` file contains one requirement per non-empty line and nothing else. No headings, no explanatory paragraphs, no prose. Explanation belongs in `traceability.json` and open items belong in `questions.md`.

Line format:

```text
REQ-001 [source: specs/checkout.md:7]: When a payment webhook is received, the billing service shall verify the HMAC signature.
```

Allowed metadata prefixes:

```text
REQ-001:
REQ-001 [source: path:line]:
REQ-001 [source: path:line-line]:
```

Give every requirement a stable ID such as `REQ-001`. Include a `[source: path:line]` reference whenever the source line is known; in `author` mode, where there is no source, use the bare `REQ-001:` prefix. The parser accepts bare requirement lines without any prefix, but agent-generated files should carry IDs and, in convert mode, source references.

## Classify each requirement

Use the narrowest EARS pattern that fits the source behavior. Do not force everything into `When`.

| Source shape                                                   | EARS pattern       | Template                                              |
| -------------------------------------------------------------- | ------------------ | ----------------------------------------------------- |
| Always-true system behavior                                    | Ubiquitous         | `The <system> shall <response>.`                      |
| Triggered by an event                                          | Event-driven       | `When <trigger>, the <system> shall <response>.`      |
| Applies only during a state                                    | State-driven       | `While <state>, the <system> shall <response>.`       |
| Applies only when a feature exists or is enabled               | Optional feature   | `Where <feature>, the <system> shall <response>.`     |
| Handles an error, invalid input, threat, or unwanted condition | Unwanted behaviour | `If <condition>, then the <system> shall <response>.` |
| Requires more than one shell clause                            | Complex            | `While ..., when ..., the <system> shall <response>.` |

Guidance:

- If behavior applies during maintenance mode, use `While`, not `When`.
- If behavior applies only with a feature enabled (for example enterprise SSO), use `Where`.
- If the source describes an invalid or exceptional condition, use `If ..., then ...`.
- Accepted clause order for complex requirements is `While* -> Where* -> When* -> If* -> the <system> shall <response>`.

## Split compound source text

Split a compound source requirement into separate EARS requirements when the response holds more than one observable obligation.

Source:

```text
When a webhook arrives, validate the signature, persist the event, and enqueue a job.
```

Generated:

```text
REQ-003 [source: specs/checkout.md:12]: When a webhook arrives, the billing service shall validate the signature.
REQ-004 [source: specs/checkout.md:12]: When a webhook arrives, the billing service shall persist the event.
REQ-005 [source: specs/checkout.md:12]: When a webhook arrives, the billing service shall enqueue a processing job.
```

Do not split when the second phrase only qualifies the first response (for example "reject the webhook with a 400 status" is one obligation, not two). When you split, record all resulting IDs against the same source line in `traceability.json`.

## Do not invent behavior

Do not add behavior because it seems reasonable, common, secure, scalable, or useful. If the source does not state the behavior, the `.ears` file must not contain it.

Forbidden inventions:

- adding audit logging because security is mentioned
- adding retry behavior because webhooks are involved
- adding rate limits because the endpoint is public
- adding admin permissions because a dashboard is mentioned
- adding database persistence because a UI displays data

If missing behavior matters, write a question instead.

## Put ambiguity in questions

When source text is vague, conflicting, or underspecified, write a question to `questions.md` and record it in `traceability.json`. Do not invent a precise requirement to fill the gap.

Question format in `questions.md`:

```md
- [REQ?] Source `specs/checkout.md:19` says "notify the customer quickly." What channel should be used, and what is the time bound?
```

Ambiguity triggers:

- vague terms such as `fast`, `quickly`, `appropriate`, `user-friendly`, `robust`, `as needed`
- a missing actor or system
- a missing trigger
- a missing error response
- conflicting source statements
- an implementation detail with no observable behavior
- behavior that depends on product judgment

A question that blocks a requirement lists that requirement id under `blocksRequirements` in `traceability.json`. Blocking questions must be resolved by a human before acceptance.

## Preserve traceability

Maintain `traceability.json` for every generated requirement and question. It gives the human reviewer a way to judge whether the source was translated faithfully; it is not a substitute for validation.

```json
{
  "requirements": [
    {
      "id": "REQ-001",
      "source": {
        "path": "specs/checkout.md",
        "startLine": 7,
        "endLine": 8,
        "quote": "When a payment webhook is received, the billing service must verify the HMAC signature..."
      },
      "pattern": "event-driven",
      "confidence": "high",
      "notes": []
    }
  ],
  "questions": [
    {
      "source": { "path": "specs/checkout.md", "startLine": 19 },
      "question": "What notification channel should be used?",
      "blocksRequirements": ["REQ-008"]
    }
  ]
}
```

Rules:

- Every requirement id in the `.ears` file has a matching entry in `traceability.json`.
- Set `confidence` to `high`, `medium`, or `low`. Use `medium` or `low` for a translation the human should double-check (for example a source that used "should" rather than a firm obligation), and call those out in the review summary.
- In `author` mode leave the `source` object off requirement entries; there is no source line to cite.

## Repair from diagnostics

When `earsyntax validate --json` reports diagnostics, repair the `.ears` file by changing only what the diagnostics justify. The `instructions repair` response includes the exact diagnostics to address.

General repair rules:

- Preserve requirement IDs unless a duplicate-ID diagnostic requires a change.
- Preserve `[source: path:line]` references.
- Preserve the intended behavior.
- Do not delete a failing requirement to make validation pass.
- Do not weaken a requirement because its wording is harder to parse.
- If the intended behavior is unclear, write a question and leave a clear placeholder instead of guessing.
- Re-run `validate` after each repair pass and repeat until no error-severity diagnostics remain.

The table below maps every diagnostic code in the registry (see `docs/diagnostics.md`) to what to change. Error-severity codes must be fixed to reach a `valid` state; warning-severity codes do not block validity but the review summary reports them.

### `ears.*` shell structure

| Code                        | What to change                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `ears.no_match`             | The line is not an EARS requirement. Rewrite it into one of the allowed templates, or move the text out of the `.ears` file. |
| `ears.invalid_clause_order` | Reorder shell clauses to `While -> Where -> When -> If -> the <system> shall <response>`.                            |
| `ears.missing_system`       | Insert the system name before `shall`: `the <system> shall ...`.                                                    |
| `ears.missing_shall`        | Add a single `shall` response boundary. A requirement must state one obligation with `shall`.                       |
| `ears.multiple_shall`       | Split into separate requirements, one `shall` each, following the compound-splitting rule.                          |
| `ears.invalid_if_then_form` | Add the missing `then`: `If <condition>, then the <system> shall <response>.`                                       |
| `ears.empty_clause`         | Fill the empty `While`/`Where`/`When`/`If` clause body, or remove the clause if it was accidental.                  |
| `ears.empty_response`       | Add the response after `shall`, or raise a question if the source does not state one.                               |

### `expr.*` clause expressions

| Code                               | What to change                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `expr.unbalanced_parentheses`      | Balance the parentheses in the clause expression.                                                     |
| `expr.invalid_operator_sequence`   | Fix the malformed operator run (for example `A or or B`, a trailing `and`, a leading `or`).           |
| `expr.empty_subexpression`         | Remove the empty group or supply the missing operand (for example `A and ()`).                        |
| `expr.operator_precedence_warning` | Warning. Add parentheses to a mixed `and`/`or` expression to make grouping explicit if intent is unclear. |
| `expr.unknown_term`                | Warning. Align the clause term with a catalog entry, or add the term to the catalog if it is correct. |
| `expr.ambiguous_term`              | Warning. Disambiguate the term so it matches one catalog entry, or use the canonical name.            |
| `expr.mixed_unresolved_terms`      | Warning. One clause mixes resolved and unresolved terms; align the unresolved term with the catalog.  |

### `catalog.*` term matching

| Code                         | What to change                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `catalog.system_unresolved`  | Error in strict mode. Use the catalog's canonical system name, or confirm the system with the catalog owner. |
| `catalog.system_ambiguous`   | Error in strict mode. Use the specific canonical system name so it matches exactly one entry.           |
| `catalog.state_unresolved`   | Warning. Use the canonical state name, or add the state to the catalog if it is correct.                |
| `catalog.state_ambiguous`    | Warning. Use the specific canonical state name.                                                         |
| `catalog.event_unresolved`   | Warning. Use the canonical event name, or add the event to the catalog if it is correct.                |
| `catalog.event_ambiguous`    | Warning. Use the specific canonical event name.                                                         |
| `catalog.feature_unresolved` | Warning. Use the canonical feature name, or add the feature to the catalog if it is correct.            |
| `catalog.feature_ambiguous`  | Warning. Use the specific canonical feature name.                                                        |
| `catalog.term_unreferenced`  | Warning (coverage). A cataloged term is never referenced. Add a requirement that uses it if one is missing, or note the gap; do not invent behavior to satisfy coverage. |

### `lint.*` style advice

| Code                         | What to change                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `lint.multiple_responses`    | Warning. The response holds several semicolon-joined responses. Split into separate requirements.      |
| `lint.vague_response`        | Warning. Replace the vague term with an observable, bounded response, or raise a question if the bound is unknown. |
| `lint.unparsed_tail`         | Warning. Text remains after the parsed requirement. Move it into the requirement or remove it.         |
| `lint.alias_used`            | Warning. A catalog alias matched. Prefer the canonical name.                                           |
| `lint.suspicious_text_shape` | Warning. The sentence shape looks accidental. Rewrite it into a clean EARS template.                   |

## Review before accept

Before `earsyntax accept`, produce a review summary. Acceptance is a human decision; the agent presents evidence and may recommend, but never accepts.

The summary states:

- how many requirements were generated
- the distribution across the six EARS patterns
- every unresolved question and the requirements each one blocks
- the validation status and the command that produced it
- source lines translated with medium or low confidence
- any source behavior intentionally not converted, with the reason

Recommend acceptance only when validation is clean (no error diagnostics) and no blocking questions remain. If either condition fails, say so and point at the next step (repair, or a human answer to a question) instead of recommending acceptance.