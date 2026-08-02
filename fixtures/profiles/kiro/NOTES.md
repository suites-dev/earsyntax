# Kiro profile notes

Observed conventions of AWS Kiro's `requirements.md`, and exactly what the
`kiro` profile relaxes relative to strict. Sourced from the Kiro documentation
(kiro.dev/docs/specs) and its published requirements examples.

## Observed Kiro house style

- A `requirements.md` opens with `# Requirements Document`, an `## Introduction`
  paragraph, and a `## Requirements` section.
- Each requirement is a `### Requirement N` heading with a `**User Story:**`
  line in the form `As a <role>, I want <feature>, so that <benefit>`.
- Acceptance criteria live under a `#### Acceptance Criteria` heading as a
  numbered list.
- Criteria are written in EARS with all-caps keywords and the literal system
  name: `WHEN <event> THE SYSTEM SHALL <response>` for event-driven, and
  `IF <condition> THEN THE SYSTEM SHALL <response>` for unwanted behaviour.
  State-driven and optional-feature use `WHILE` and `WHERE` the same way.
- There is no comma after the leading clause; the keyword boundary is carried by
  the all-caps keyword and, for the `IF` form, the `THEN` keyword.
- The event-driven form has no `THEN`; only the unwanted-behaviour `IF` form
  does, which matches strict EARS structure once cased and comma-delimited.

## What the profile relaxes (and only this)

| Relaxation                           | Dialect field                            | Effect                                                                                                                                              |
| ------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Case-insensitive / all-caps keywords | `keywordCase: 'case-insensitive'`        | `WHEN`, `IF`, `WHILE`, `WHERE`, `THEN`, `SHALL` are accepted; strict requires `When`/`If`/`While`/`Where` and lowercase `shall` (else `EARS-E014`). |
| Literal `THE SYSTEM`                 | `allowLiteralSystemName: ['THE SYSTEM']` | `THE SYSTEM` is accepted as the system name; strict expects the canonical `the <system>` form.                                                      |
| Optional leading comma               | `commaAfterLeadingClause: 'optional'`    | `WHEN <event> THE SYSTEM ...` with no comma is accepted; strict requires the comma (else `EARS-E015`).                                              |
| User-story wrapper skipped           | `allowStoryWrapper: true`                | `As a ..., I want ..., so that ...` frame lines are non-requirement content, not parsed as EARS.                                                    |

## What the profile does NOT relax

- No frame metadata (`REQ-###`, `[source:]`): those are ears-x, not kiro.
- No prohibition (`shall not`): kiro keeps `EARS-E016` an error, same as strict.
- Locator is narrow: only list items under `#### Acceptance Criteria`. Prose and
  code fences never become candidates (`codeFences: 'ignore'`).

## Severity overrides

`EARS-W011` (unknown clause term) and `EARS-W014` (suspicious text shape) are set
to `off`. Kiro criteria use free-form domain vocabulary that a catalog will not
recognize, so these two warnings would otherwise fire against clean house-style
text. Without a catalog neither warning fires; the overrides matter only when a
catalog is supplied.
