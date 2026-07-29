# EARS Grammar Matrix

This document is the implementation grammar for `@earsyntax/core`. It converts the canonical EARS references into a precise set of rules the shell parser and expression parser implement. It is derived from the specification, not from any existing implementation. Where a rule can fail, the table names the exact [diagnostic code](../packages/core/src/types.ts) the parser emits.

The fixtures under `fixtures/valid/` and `fixtures/invalid/` are the executable form of this document. Every rule here has at least one fixture; every fixture asserts a rule here.

Sources:

- Canonical EARS patterns: https://alistairmavin.com/ears/
- AST and diagnostic shapes: `packages/core/src/types.ts`
- Fixture format: `fixtures/schema.md`

## Shell patterns

A requirement is a single sentence built from zero or more optional shell clauses followed by a mandatory system-and-response tail. The parser classifies the sentence into one of six patterns.

| Pattern              | Template                                          | Keyword    | AST clause field | Example                                                                                              |
| -------------------- | ------------------------------------------------- | ---------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| `ubiquitous`         | `The <system> shall <response>`                   | none       | none             | The billing service shall verify the HMAC signature.                                                 |
| `state-driven`       | `While <expr>, the <system> shall <response>`     | `While`    | `preconditions`  | While the payment provider is unavailable, the billing service shall queue retryable events.         |
| `event-driven`       | `When <expr>, the <system> shall <response>`      | `When`     | `trigger`        | When a payment webhook is received, the billing service shall verify the HMAC signature.             |
| `optional-feature`   | `Where <expr>, the <system> shall <response>`     | `Where`    | `feature`        | Where dunning management is enabled, the billing service shall retry declined charges.               |
| `unwanted-behaviour` | `If <expr>, then the <system> shall <response>`   | `If`/`then`| `unwanted`       | If the HMAC signature is invalid, then the billing service shall reject the webhook.                 |
| `complex`            | any supported combination of more than one clause | mixed      | multiple         | While the payment provider is available, when a payment webhook is received, the billing service shall verify the HMAC signature. |

Classification rule: a requirement with exactly one shell clause takes that clause's pattern. A requirement with more than one shell clause is `complex`. A requirement with no shell clause is `ubiquitous`.

The keyword-to-field mapping is one to one: `While` fills `preconditions`, `When` fills `trigger`, `Where` fills `feature`, and `If` fills `unwanted`. In a `complex` requirement each present clause fills its own field.

## Clause order

The only accepted order of shell clauses is:

```text
While* -> Where* -> When* -> If* -> the <system> shall <response>
```

A clause that appears out of this order is a structural error.

| Rule                                            | Result  | Diagnostic                    |
| ----------------------------------------------- | ------- | ----------------------------- |
| Clauses appear in the accepted order            | parses  | none                          |
| A `While` clause follows a `When` clause        | invalid | `ears.invalid_clause_order`   |
| A `Where` clause follows a `When` or `If` clause | invalid | `ears.invalid_clause_order`   |
| Any clause follows an `If` clause                | invalid | `ears.invalid_clause_order`   |

`When` followed by `If` is a valid order and produces a `complex` requirement (fixture `valid/complex-when-if.json`). `When` followed by `While` is not (fixture `invalid/invalid-clause-order.json`).

## System and response tail

Every requirement must end with a system and a `shall` response. The subject article `the` is stripped from the system: `the billing service shall ...` yields `system.raw = "billing service"`.

| Rule                                                          | Result  | Diagnostic            |
| ------------------------------------------------------------- | ------- | --------------------- |
| Exactly one shell-level `shall` separates system and response | parses  | none                  |
| No `shall` present                                            | invalid | `ears.missing_shall`  |
| More than one shell-level `shall`                             | invalid | `ears.multiple_shall` |
| System segment before `shall` is empty                        | invalid | `ears.missing_system` |
| Response segment after `shall` is empty                       | invalid | `ears.empty_response` |
| Sentence matches no shell shape at all                        | invalid | `ears.no_match`       |

The `If ... then ...` form is special: the `then` boundary is required. An `If` clause with no `then` before the system is `ears.invalid_if_then_form` (fixture `invalid/if-without-then.json`), not `ears.invalid_clause_order`.

### Responses

The response is the text after `shall`. Responses are split on semicolons into `ast.responses` in source order. A response containing more than one semicolon-separated phrase also raises a warning.

| Rule                                       | Result | Diagnostic                | Severity |
| ------------------------------------------ | ------ | ------------------------- | -------- |
| Single response phrase                     | parses | none                      | -        |
| Two or more semicolon-separated phrases    | parses | `lint.multiple_responses` | warning  |
| Response contains a configured vague term  | parses | `lint.vague_response`     | warning  |
| Text remains after the parsed requirement  | parses | `lint.unparsed_tail`      | warning  |

Default vague terms are `appropriate`, `sufficient`, and `as needed`, configurable through `Options.vagueTerms`.

## Clause expression grammar

Inside `While`, `Where`, `When`, and `If` clauses the body is a boolean-like expression over free-text terms.

```text
expr    := or
or      := and ( "or" and )*
and     := not ( "and" not )*
not     := "not" not | atom
atom    := "(" expr ")" | term
term    := one or more words that are not an operator or parenthesis
```

Precedence, from tightest to loosest:

```text
not > and > or
```

So `a and b or c` parses as `(a and b) or c`, and `not a and b` parses as `(not a) and b`. Parentheses override precedence: `(a or b) and c`.

The AST node kinds are `term`, `and`, `or`, `not`, `group`, and `free-text`, defined in `packages/core/src/types.ts`. A clause body that cannot be parsed as an expression is kept verbatim as `free-text`.

| Rule                                                        | Result  | Diagnostic                         | Severity |
| ----------------------------------------------------------- | ------- | ---------------------------------- | -------- |
| Well-formed expression                                      | parses  | none                               | -        |
| Mixed `and` and `or` at the same level, no parentheses      | parses  | `expr.operator_precedence_warning` | warning  |
| Unbalanced parentheses                                      | invalid | `expr.unbalanced_parentheses`      | error    |
| Dangling or doubled operator (`a and`, `a or or b`)         | invalid | `expr.invalid_operator_sequence`   | error    |
| Empty group or empty operand (`()`, `a and ()`)             | invalid | `expr.empty_subexpression`         | error    |

The precedence warning is not an error: the expression still parses (`(a and b) or c`), the requirement stays valid, and the warning only suggests adding parentheses (fixture `valid/expr-precedence-warning.json`).

## Comma handling

A comma normally ends a shell clause. The `commaAsAnd` option changes how commas inside a clause body are read.

| Option              | Behavior                                                                              | Fixture                              |
| ------------------- | ------------------------------------------------------------------------------------- | ------------------------------------ |
| `commaAsAnd: false` (default) | A comma ends the current shell clause. Commas are not conjunctions.         | `valid/expr-and-keyword-comma-off.json` |
| `commaAsAnd: true`  | Commas inside a clause body may be read as `and` where the split is unambiguous.       | `valid/expr-comma-as-and.json`       |

The explicit `and` keyword works under both settings; it does not depend on `commaAsAnd`.

## Case-insensitivity

Shell keywords and the `shall` boundary are matched case-insensitively. The parser accepts `while`, `WHILE`, and `While` equally, and likewise for `when`, `where`, `if`, `then`, `the`, and `shall`. Term text keeps its original casing.

| Input keyword casing                        | Result | Fixture                                  |
| ------------------------------------------- | ------ | ---------------------------------------- |
| lowercase (`when ...`)                      | parses | `valid/case-insensitive-when-lower.json` |
| uppercase (`WHEN ... THE ... SHALL ...`)    | parses | `valid/case-insensitive-when-upper.json` |
| uppercase `IF ... THEN ...`                 | parses | `valid/case-insensitive-if-then-upper.json` |
| mixed (`While ... SHALL ...`)               | parses | `valid/case-insensitive-while-mixed.json` |

Parsing never requires an uppercase house style. A formatter may still choose one.

## Catalog matching

When a `Catalog` is supplied, the system term and clause terms are matched against it deterministically: exact canonical name, then exact alias, then ambiguous (more than one entry matches), then unresolved (no entry matches). No fuzzy or semantic matching is performed. Full matching behavior is owned by the catalog agent; the codes below are the ones this corpus pins.

| Rule                                                | Result  | Diagnostic                  | Severity          |
| --------------------------------------------------- | ------- | --------------------------- | ----------------- |
| System matched by canonical name                    | parses  | none                        | -                 |
| System matched by alias                             | parses  | `lint.alias_used`           | warning           |
| System matches no catalog entry (strict mode)       | invalid | `catalog.system_unresolved` | error             |
| System matches more than one catalog entry          | invalid | `catalog.system_ambiguous`  | error             |

Per the severity rules, an unresolved or ambiguous system is an error in `strict` mode. The `guided` mode may downgrade recoverable structural failures to warnings.

## Edge-case matrix

Every row is backed by a fixture in `fixtures/invalid/` (errors) or `fixtures/valid/` (warnings). Fixtures assert the multiset of `(code, severity)` pairs exactly, so a parser that emits an extra or missing diagnostic fails the fixture.

| Edge case                                          | Example                                                                                  | Diagnostic                         | Fixture                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------- |
| No `shall`                                         | The billing service verifies the HMAC signature.                                         | `ears.missing_shall`               | `invalid/missing-shall.json`                  |
| Doubled `shall`                                    | ... the billing service shall shall queue retryable events.                              | `ears.multiple_shall`              | `invalid/multiple-shall.json`                 |
| Missing system                                     | When a payment webhook is received, shall verify the HMAC signature.                     | `ears.missing_system`              | `invalid/missing-system.json`                 |
| Empty response                                     | The billing service shall .                                                              | `ears.empty_response`              | `invalid/empty-response.json`                 |
| Empty clause                                       | When , the billing service shall verify the HMAC signature.                              | `ears.empty_clause`                | `invalid/empty-clause.json`                   |
| `If` without `then`                                | If the HMAC signature is invalid, the billing service shall reject the webhook.          | `ears.invalid_if_then_form`        | `invalid/if-without-then.json`                |
| Wrong clause order                                 | When a payment webhook is received, while the payment provider is available, ...         | `ears.invalid_clause_order`        | `invalid/invalid-clause-order.json`           |
| Not an EARS sentence                               | Payment webhooks are important for billing accuracy.                                     | `ears.no_match`                    | `invalid/no-match.json`                       |
| Unbalanced parentheses                             | While (the payment provider is available and the retry queue is not full, ...            | `expr.unbalanced_parentheses`      | `invalid/unbalanced-parentheses.json`         |
| Doubled operator                                   | When a payment webhook is received or or a refund is requested, ...                      | `expr.invalid_operator_sequence`   | `invalid/invalid-operator-sequence.json`      |
| Dangling operator before clause end                | While the payment provider is available and, when a payment webhook is received, ...     | `expr.invalid_operator_sequence`   | `invalid/invalid-operator-sequence-trailing-and.json` |
| Empty subexpression                                | When a payment webhook is received and (), ...                                           | `expr.empty_subexpression`         | `invalid/empty-subexpression.json`            |
| Unresolved system (strict)                         | The reconciliation engine shall verify the HMAC signature. (catalog present)             | `catalog.system_unresolved`        | `invalid/catalog-system-unresolved.json`      |
| Ambiguous system                                   | The BFF shall verify the HMAC signature. (two entries alias `BFF`)                       | `catalog.system_ambiguous`         | `invalid/catalog-system-ambiguous.json`       |
| Alias used (warning)                               | The BFF shall verify the HMAC signature. (one entry aliases `BFF`)                       | `lint.alias_used`                  | `valid/lint-alias-used.json`                  |
| Vague response (warning)                           | The billing service shall retry failed charges as needed.                                | `lint.vague_response`              | `valid/lint-vague-response.json`              |
| Multiple responses (warning)                       | The billing service shall verify the HMAC signature; reject invalid webhooks.            | `lint.multiple_responses`          | `valid/lint-multiple-responses.json`          |
| Unparsed tail (warning)                            | The billing service shall verify the HMAC signature. Additional operator notes follow here. | `lint.unparsed_tail`            | `valid/lint-unparsed-tail.json`               |
| Precedence warning                                 | When a payment webhook is received and a refund is requested or a chargeback is received, ... | `expr.operator_precedence_warning` | `valid/expr-precedence-warning.json`       |

## Validity rule

`LintResult.valid` is derived only from severity: it is `false` when any diagnostic has severity `error`, and `true` otherwise. Warnings and info diagnostics never change validity. This is why the warning fixtures in the matrix above live under `fixtures/valid/` with `valid: true`.

## Guided mode

`Options.mode` defaults to `strict`. In `guided` mode the linter recovers a partial AST where it can and downgrades the recoverable structural and expression errors to `warning`, so the requirement stays `valid: true`. The downgraded codes are:

- all `ears.*` structural codes,
- `expr.unbalanced_parentheses`, `expr.invalid_operator_sequence`, `expr.empty_subexpression`,
- `catalog.system_unresolved`, `catalog.system_ambiguous`.

Every other code keeps its `strict`-mode severity. The `fixtures/valid/guided-*.json` set pairs a representative structural or expression fixture with `mode: "guided"` and asserts the same code at `warning` with `valid: true`.
