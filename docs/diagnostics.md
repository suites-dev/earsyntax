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

## Public ids and deprecated aliases

Every diagnostic carries a stable public id: `EARS-E###` for defaults in the error band, `EARS-W###` for defaults in the warning band. The registry that owns these ids, their metadata, and the alias mapping is `packages/core/src/registry.ts`; the frozen migration table lives in `docs/refactor/host-native-facade.md` and `fixtures/diagnostics/migration-table.json`.

The dotted codes below (`ears.no_match`, `expr.unknown_term`, and so on) are the raw codes the parser and catalog matcher still emit internally, and they remain resolvable forever as deprecated aliases: `earsyntax explain ears.missing_shall` resolves to `EARS-E007`. New tools should key on the `EARS-*` id. The mapping is append-only: ids are never renumbered, reused, or deleted.

The `E`/`W` band is the default severity. A profile severity override or `--strict` can change the effective severity a diagnostic carries in a findings result without changing its id (see `docs/contracts/findings.md`). The `strict`/`guided` columns below describe the legacy core mode model; the `strict` column is the default band the id inherits.

## Code registry

Codes are grouped by prefix. The `ID` column is the primary public identifier; the `Deprecated alias` column is the old dotted code. "strict"/"guided" columns show the legacy per-mode severity.

### `ears.*` shell structure

These report defects in the outer EARS sentence shape. All are mode-dependent. `EARS-E014`, `EARS-E015`, and `EARS-E016` were introduced by the host-native grammar work and have no legacy code they migrate from. A relaxing dialect suppresses them: the `kiro` profile relaxes keyword case (`EARS-E014`) and the leading comma (`EARS-E015`), and the `ears-x` profile legalizes prohibition (`EARS-E016`).

| ID          | Deprecated alias               | Meaning                                                     | strict  | guided    | Example trigger                                                     |
| ----------- | ------------------------------ | ----------------------------------------------------------- | ------- | --------- | ------------------------------------------------------------------- |
| `EARS-E010` | `ears.no_match`                | The text does not match any supported EARS shell pattern.   | `error` | `warning` | `quick brown fox`                                                   |
| `EARS-E005` | `ears.invalid_clause_order`    | Shell clauses appear in an unsupported order.               | `error` | `warning` | `When the timer fires, while idle, the system shall reset.`         |
| `EARS-E008` | `ears.missing_system`          | The system name before `shall` is absent or empty.          | `error` | `warning` | `When the timer fires, shall reset.`                                |
| `EARS-E007` | `ears.missing_shall`           | The requirement has no single `shall` response boundary.    | `error` | `warning` | `The system resets the timer.`                                      |
| `EARS-E009` | `ears.multiple_shall`          | The requirement contains more than one shell-level `shall`. | `error` | `warning` | `The system shall reset and shall log the event.`                   |
| `EARS-E006` | `ears.invalid_if_then_form`    | An `If` clause is missing its required `then` boundary.     | `error` | `warning` | `If the signature is invalid, the system shall reject the webhook.` |
| `EARS-E003` | `ears.empty_clause`            | A `While`, `Where`, `When`, or `If` clause body is empty.   | `error` | `warning` | `When , the system shall reset.`                                    |
| `EARS-E004` | `ears.empty_response`          | The response after `shall` is empty.                        | `error` | `warning` | `The system shall .`                                                |
| `EARS-E014` | `ears.keyword_case`            | A keyword violates strict canonical casing.                 | `error` | `warning` | `when the timer fires, the system Shall reset.`                     |
| `EARS-E015` | `ears.missing_leading_comma`   | A leading clause is not comma-delimited where required.     | `error` | `warning` | `When the timer fires the system shall reset.`                      |
| `EARS-E016` | `ears.prohibition_not_allowed` | `shall not` is used where the dialect forbids prohibition.  | `error` | `warning` | `The system shall not log the payment token.`                       |

### `expr.*` clause expressions

These report defects inside the boolean-like body of a clause. The three structural failures are mode-dependent; the term and precedence codes are always warnings.

| ID          | Deprecated alias                   | Meaning                                                | strict    | guided    | Example trigger                                      |
| ----------- | ---------------------------------- | ------------------------------------------------------ | --------- | --------- | ---------------------------------------------------- |
| `EARS-E013` | `expr.unbalanced_parentheses`      | Parentheses in a clause expression are not balanced.   | `error`   | `warning` | `When (A and B, the system shall reset.`             |
| `EARS-E012` | `expr.invalid_operator_sequence`   | Operators such as `and`, `or`, or `not` are malformed. | `error`   | `warning` | `While A or or B, the system shall reset.`           |
| `EARS-E011` | `expr.empty_subexpression`         | A grouped expression or operator operand is empty.     | `error`   | `warning` | `While A and (), the system shall reset.`            |
| `EARS-W010` | `expr.operator_precedence_warning` | A mixed `and`/`or` expression may need parentheses.    | `warning` | `warning` | `While A and B or C, the system shall reset.`        |
| `EARS-W011` | `expr.unknown_term`                | A clause term matches no catalog entry for its role.   | `warning` | `warning` | A `When` term absent from the catalog.               |
| `EARS-W008` | `expr.ambiguous_term`              | A clause term matches more than one catalog entry.     | `warning` | `warning` | A term whose name collides across catalog groups.    |
| `EARS-W009` | `expr.mixed_unresolved_terms`      | One clause mixes resolved and unresolved terms.        | `warning` | `warning` | `While A and B` where `A` resolves and `B` does not. |

### `catalog.*` term matching

The `system` role is mode-dependent (an unknown or ambiguous system is a hard error in strict mode). The `state`, `event`, and `feature` roles, and the coverage check, are always warnings.

| ID          | Deprecated alias             | Meaning                                                       | strict    | guided    | Example trigger                                                |
| ----------- | ---------------------------- | ------------------------------------------------------------- | --------- | --------- | -------------------------------------------------------------- |
| `EARS-E002` | `catalog.system_unresolved`  | The system name matches no known system.                      | `error`   | `warning` | `The invoicing engine shall ...` when only `BFF` is cataloged. |
| `EARS-E001` | `catalog.system_ambiguous`   | The system name matches more than one known system.           | `error`   | `warning` | A system name that two catalog entries share.                  |
| `EARS-W006` | `catalog.state_unresolved`   | A state term matches no known state.                          | `warning` | `warning` | `While the queue is draining, ...` with no such state.         |
| `EARS-W005` | `catalog.state_ambiguous`    | A state term matches more than one known state.               | `warning` | `warning` | A state name two entries share.                                |
| `EARS-W002` | `catalog.event_unresolved`   | An event term matches no known event.                         | `warning` | `warning` | `When a refund is requested, ...` with no such event.          |
| `EARS-W001` | `catalog.event_ambiguous`    | An event term matches more than one known event.              | `warning` | `warning` | An event name two entries share.                               |
| `EARS-W004` | `catalog.feature_unresolved` | A feature term matches no known feature.                      | `warning` | `warning` | `Where retries are enabled, ...` with no such feature.         |
| `EARS-W003` | `catalog.feature_ambiguous`  | A feature term matches more than one known feature.           | `warning` | `warning` | A feature name two entries share.                              |
| `EARS-W007` | `catalog.term_unreferenced`  | A cataloged term is never referenced by any requirement text. | `warning` | `warning` | A cataloged event no requirement mentions (coverage check).    |

### `lint.*` style advice

Stylistic findings that never affect validity. All are always warnings.

| ID          | Deprecated alias             | Meaning                                                   | strict    | guided    | Example trigger                                          |
| ----------- | ---------------------------- | --------------------------------------------------------- | --------- | --------- | -------------------------------------------------------- |
| `EARS-W013` | `lint.multiple_responses`    | The response holds several semicolon-joined responses.    | `warning` | `warning` | `The system shall log the event; notify the operator.`   |
| `EARS-W016` | `lint.vague_response`        | The response contains a configured vague term.            | `warning` | `warning` | `The system shall respond as needed.`                    |
| `EARS-W015` | `lint.unparsed_tail`         | Text remains after the parsed requirement.                | `warning` | `warning` | Trailing tokens the expression parser could not consume. |
| `EARS-W012` | `lint.alias_used`            | A catalog alias matched; the canonical name is preferred. | `warning` | `warning` | `db` matching a `Postgres` entry via an alias.           |
| `EARS-W014` | `lint.suspicious_text_shape` | The sentence shape is likely accidental or malformed.     | `warning` | `warning` | Legacy guided mode only; strict reports `EARS-E010`.     |

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
