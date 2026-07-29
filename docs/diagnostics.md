# Diagnostics reference

Every finding `@earsyntax/core` reports is a `Diagnostic`:

```ts
interface Diagnostic {
  code: DiagnosticCode; // one of the codes registered below
  severity: 'error' | 'warning' | 'info';
  message: string; // one factual sentence
  span?: Span; // half-open [start, end) offsets, when known
}
```

The parser and catalog matcher discover raw findings (a code and, when known, a span). The diagnostics module assigns each finding its severity and message, sorts the set into a stable order, and derives the result's `valid` flag.

## Severity by mode

Severity depends on the finding's code and the active mode.

| Class                                    | `strict`  | `guided`  |
| ---------------------------------------- | --------- | --------- |
| Structural shell and expression failures | `error`   | `warning` |
| Unresolved or ambiguous `system` term    | `error`   | `warning` |
| All other codes                          | `warning` | `warning` |

`strict` treats structural defects and unknown or ambiguous systems as errors. `guided` downgrades those to warnings, on the basis that the parser can usually still recover a partial AST. Every other code (non-system catalog terms, expression term warnings, and the `lint.*` codes) is always a warning, regardless of mode.

`valid` is `false` when any diagnostic has severity `error`, and `true` otherwise. `warning` and `info` never affect validity. The toolkit emits no `info` diagnostics in v1; the level is reserved for future use.

## Code registry

Codes are grouped by prefix. "Severity" columns show the value in each mode.

### `ears.*` shell structure

These report defects in the outer EARS sentence shape. All are mode-dependent.

| Code                        | Meaning                                                     | strict  | guided    | Example trigger                                                     |
| --------------------------- | ----------------------------------------------------------- | ------- | --------- | ------------------------------------------------------------------- |
| `ears.no_match`             | The text does not match any supported EARS shell pattern.   | `error` | `warning` | `The quick brown fox.`                                              |
| `ears.invalid_clause_order` | Shell clauses appear in an unsupported order.               | `error` | `warning` | `When the timer fires, while idle, the system shall reset.`         |
| `ears.missing_system`       | The system name before `shall` is absent or empty.          | `error` | `warning` | `When the timer fires, shall reset.`                                |
| `ears.missing_shall`        | The requirement has no single `shall` response boundary.    | `error` | `warning` | `The system resets the timer.`                                      |
| `ears.multiple_shall`       | The requirement contains more than one shell-level `shall`. | `error` | `warning` | `The system shall reset and shall log the event.`                   |
| `ears.invalid_if_then_form` | An `If` clause is missing its required `then` boundary.     | `error` | `warning` | `If the signature is invalid, the system shall reject the webhook.` |
| `ears.empty_clause`         | A `While`, `Where`, `When`, or `If` clause body is empty.   | `error` | `warning` | `When , the system shall reset.`                                    |
| `ears.empty_response`       | The response after `shall` is empty.                        | `error` | `warning` | `The system shall .`                                                |

### `expr.*` clause expressions

These report defects inside the boolean-like body of a clause. The three structural failures are mode-dependent; the term and precedence codes are always warnings.

| Code                               | Meaning                                                | strict    | guided    | Example trigger                                      |
| ---------------------------------- | ------------------------------------------------------ | --------- | --------- | ---------------------------------------------------- |
| `expr.unbalanced_parentheses`      | Parentheses in a clause expression are not balanced.   | `error`   | `warning` | `When (A and B, the system shall reset.`             |
| `expr.invalid_operator_sequence`   | Operators such as `and`, `or`, or `not` are malformed. | `error`   | `warning` | `While A or or B, the system shall reset.`           |
| `expr.empty_subexpression`         | A grouped expression or operator operand is empty.     | `error`   | `warning` | `While A and (), the system shall reset.`            |
| `expr.operator_precedence_warning` | A mixed `and`/`or` expression may need parentheses.    | `warning` | `warning` | `While A and B or C, the system shall reset.`        |
| `expr.unknown_term`                | A clause term matches no catalog entry for its role.   | `warning` | `warning` | A `When` term absent from the catalog.               |
| `expr.ambiguous_term`              | A clause term matches more than one catalog entry.     | `warning` | `warning` | A term whose name collides across catalog groups.    |
| `expr.mixed_unresolved_terms`      | One clause mixes resolved and unresolved terms.        | `warning` | `warning` | `While A and B` where `A` resolves and `B` does not. |

### `catalog.*` term matching

The `system` role is mode-dependent (an unknown or ambiguous system is a hard error in strict mode). The `state`, `event`, and `feature` roles, and the coverage check, are always warnings.

| Code                         | Meaning                                                       | strict    | guided    | Example trigger                                                  |
| ---------------------------- | ------------------------------------------------------------- | --------- | --------- | ---------------------------------------------------------------- |
| `catalog.system_unresolved`  | The system name matches no known system.                      | `error`   | `warning` | `The invoicing engine shall ...` when only `BFF` is cataloged.   |
| `catalog.system_ambiguous`   | The system name matches more than one known system.           | `error`   | `warning` | A system name that two catalog entries share.                    |
| `catalog.state_unresolved`   | A state term matches no known state.                          | `warning` | `warning` | `While the queue is draining, ...` with no such state.           |
| `catalog.state_ambiguous`    | A state term matches more than one known state.               | `warning` | `warning` | A state name two entries share.                                  |
| `catalog.event_unresolved`   | An event term matches no known event.                         | `warning` | `warning` | `When a refund is requested, ...` with no such event.            |
| `catalog.event_ambiguous`    | An event term matches more than one known event.              | `warning` | `warning` | An event name two entries share.                                 |
| `catalog.feature_unresolved` | A feature term matches no known feature.                      | `warning` | `warning` | `Where retries are enabled, ...` with no such feature.           |
| `catalog.feature_ambiguous`  | A feature term matches more than one known feature.           | `warning` | `warning` | A feature name two entries share.                                |
| `catalog.term_unreferenced`  | A cataloged term is never referenced by any requirement text. | `warning` | `warning` | A `payment-http` entry no requirement mentions (coverage check). |

### `lint.*` style advice

Stylistic findings that never affect validity. All are always warnings.

| Code                         | Meaning                                                   | strict    | guided    | Example trigger                                          |
| ---------------------------- | --------------------------------------------------------- | --------- | --------- | -------------------------------------------------------- |
| `lint.multiple_responses`    | The response holds several semicolon-joined responses.    | `warning` | `warning` | `The system shall log the event; notify the operator.`   |
| `lint.vague_response`        | The response contains a configured vague term.            | `warning` | `warning` | `The system shall respond as needed.`                    |
| `lint.unparsed_tail`         | Text remains after the parsed requirement.                | `warning` | `warning` | Trailing tokens the expression parser could not consume. |
| `lint.alias_used`            | A catalog alias matched; the canonical name is preferred. | `warning` | `warning` | `db` matching a `Postgres` entry via an alias.           |
| `lint.suspicious_text_shape` | The sentence shape is likely accidental or malformed.     | `warning` | `warning` | Guided-mode text that resembles no EARS shell.           |

## Ordering

`sortDiagnostics` returns a stably sorted copy without mutating its input. The order is:

1. Span start, ascending. Diagnostics without a span sort last.
2. Span end, ascending.
3. Code, by code-unit order.
4. Message, by code-unit order.
5. Severity, by code-unit order.

The order is fully determined by the diagnostics themselves, so repeated runs on the same requirement always produce the same sequence. This refines the `ears-lint-go` reference, which orders only by span start before its code, message, and severity fallbacks; adding span end as a secondary key removes the last dependence on insertion order.

## Deduplication

A parser can report the same finding more than once for one input (for example `ears.missing_shall` from a pre-check and again at parse time, with the same span). `dedupeDiagnostics` removes exact duplicates, keyed by code, span start and end, severity, and message. Because the message carries any interpolated term or clause, two findings that share a code and span but describe different terms stay distinct.

The helper keeps the first occurrence and preserves relative order, so its output is deterministic for a given input. It composes with `sortDiagnostics` in either order; the sorted, deduplicated set is identical either way.
