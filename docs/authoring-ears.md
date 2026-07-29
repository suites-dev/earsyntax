# Authoring EARS by hand

This page is a practical guide to writing EARS requirements that pass `earsyntax validate`. It covers the six patterns, the clause-order rule, boolean expressions inside clauses, catalog matching, vague terms, and the diagnostics you are most likely to hit. Every example uses one domain, a billing service that processes payment webhooks, and every example below was validated with the CLI.

If you have not run the linter yet, start with the [quickstart](quickstart.md). For the machine-readable API, see the [API reference](api.md).

## The shape of a requirement

Every EARS requirement ends the same way: a system and one observable response joined by `shall`.

```text
The <system> shall <response>.
```

Optional clauses go in front of that tail to say when the behavior applies. There are four clause keywords, each mapping to one pattern. A requirement with no clause is the fifth pattern, and a requirement with more than one clause is the sixth. Keywords are case-insensitive, so `When`, `when`, and `WHEN` all parse; the examples here use the conventional capitalized form.

## The six patterns

### Ubiquitous: always-true behavior

Use `The <system> shall <response>` for behavior that always holds, with no guard.

```text
The billing service shall verify the HMAC signature of every incoming webhook.
The billing service shall retain payment receipts for seven years.
```

### State-driven: behavior during a state

Use `While <state>, ...` when the behavior applies only while a condition holds.

```text
While the payment provider is unavailable, the billing service shall queue retryable events.
While the account is in dunning, the billing service shall suppress new charge attempts.
```

### Event-driven: behavior triggered by an event

Use `When <trigger>, ...` for behavior that fires in response to an event.

```text
When a payment webhook is received, the billing service shall verify the HMAC signature.
When a refund is requested, the billing service shall issue a refund to the original payment method.
```

### Optional feature: behavior gated by a feature

Use `Where <feature>, ...` when the behavior exists only if a feature is present or enabled.

```text
Where dunning management is enabled, the billing service shall retry declined charges.
Where multi-currency support is enabled, the billing service shall convert amounts to the account currency.
```

### Unwanted behaviour: handling an error or exceptional condition

Use `If <condition>, then ...` for errors, invalid input, threats, and other unwanted conditions. The `then` is required: an `If` clause without it is an error (`ears.invalid_if_then_form`).

```text
If the HMAC signature is invalid, then the billing service shall reject the webhook.
If the payment is declined, then the billing service shall notify the account owner.
```

### Complex: more than one clause

Use more than one clause when the behavior needs several guards. A requirement with two or more clauses classifies as `complex`.

```text
While the payment provider is unavailable, when a payment webhook is received, the billing service shall queue the event for retry.
When a payment webhook is received, if the HMAC signature is invalid, then the billing service shall reject the webhook.
```

## Clause order

When a requirement uses more than one clause, the clauses must appear in this order:

```text
While  ->  Where  ->  When  ->  If  ->  the <system> shall <response>
```

A clause out of order is a structural error (`ears.invalid_clause_order`). `When ... if ... then ...` is valid, because `When` precedes `If`. `When ... while ...` is not, because `While` must come before `When`.

The article `the` on the system is stripped: `the billing service shall ...` yields the system `billing service`.

## Boolean expressions in clauses

The body of a `While`, `Where`, `When`, or `If` clause can be a boolean expression over free-text terms, using `and`, `or`, `not`, and parentheses.

```text
When a payment webhook is received or a refund is requested, the billing service shall write an audit log entry.
When a payment webhook is received and the account is active, the billing service shall process the payment.
If the signature is missing or the timestamp is stale, then the billing service shall discard the event.
Where (dunning management is enabled or manual retries are enabled) and the account is active, the billing service shall retry declined charges.
```

Precedence runs `not` tightest, then `and`, then `or`, so `a and b or c` groups as `(a and b) or c`. Parentheses override precedence. When you mix `and` and `or` at the same level without parentheses, the requirement still parses and stays valid, but the linter warns (`expr.operator_precedence_warning`) so you can make the grouping explicit if it is not obvious. Unbalanced parentheses, doubled operators such as `or or`, and empty groups are errors.

By default a comma ends a clause. Pass `--comma-as-and` to `validate` (or `commaAsAnd: true` in the API) to read unambiguous commas inside a clause body as `and`. The explicit `and` keyword works either way.

## Catalog matching

A catalog is an optional list of the domain terms you consider canonical: systems, events, states, features, and more. When you supply one, the linter checks the system and clause terms against it. Matching is exact: canonical name first, then alias, then ambiguous if more than one entry matches, then unresolved if none does. There is no fuzzy or semantic matching.

Given this catalog:

```json
{
  "systems": [
    { "id": "SYS-BILLING", "name": "billing service", "aliases": ["billing", "BFF"] }
  ]
}
```

validating these two lines in strict mode:

```text
The BFF shall verify the HMAC signature.
The reconciliation engine shall verify the HMAC signature.
```

produces:

```text
cat.ears:1 warning lint.alias_used  alias used instead of canonical term
cat.ears:2 error catalog.system_unresolved  unresolved catalog term

1/2 valid, 1 errors, 1 warnings
```

`BFF` matched through an alias, so the linter accepts it but warns that `billing service` is the canonical name. `reconciliation engine` matched no entry, and an unresolved system is an error in strict mode. In guided mode both stay warnings. Unresolved states, events, and features are always warnings, never errors. Pass a catalog to the CLI with `--catalog <path>`.

## Vague terms

A response that hedges instead of stating an observable obligation gets a warning (`lint.vague_response`). The default vague terms are `appropriate`, `sufficient`, and `as needed`; configure the list through `Options.vagueTerms`.

```text
The billing service shall retry failed charges as needed.
```

```text
warn.ears:1 warning lint.vague_response  The response contains the vague term "as needed".
```

Vague terms do not fail validation. They flag a requirement that a reader cannot turn into a test. Replace the vague term with a bounded, observable response, or raise a question if you do not yet know the bound.

## Common diagnostics and fixes

These are the diagnostics you meet most often while authoring. In strict mode the structural codes are errors; the style codes are always warnings. The [diagnostics reference](diagnostics.md) documents all 29 codes and their severity in each mode.

| Code                        | What it means                                          | Fix                                                                      |
| --------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `ears.missing_shall`        | No single `shall` response boundary.                   | State one obligation with `shall`: `the billing service shall ...`.      |
| `ears.missing_system`       | No system name before `shall`.                         | Name the system: `... the billing service shall ...`.                    |
| `ears.invalid_if_then_form` | An `If` clause has no `then`.                          | Add `then`: `If <condition>, then the <system> shall <response>.`        |
| `ears.multiple_shall`       | More than one `shall` in the sentence.                 | Split into separate requirements, one obligation each.                   |
| `ears.invalid_clause_order` | Clauses are out of order.                              | Reorder to `While -> Where -> When -> If`.                               |
| `lint.multiple_responses`   | Semicolon-joined responses in one requirement.         | Split into separate requirements.                                        |
| `lint.vague_response`       | The response contains a configured vague term.         | Replace it with an observable, bounded response.                         |
| `expr.operator_precedence_warning` | Mixed `and`/`or` without parentheses.           | Add parentheses to make the grouping explicit.                           |

For example, these four lines each fail with a different structural error:

```text
The billing service verifies the HMAC signature.
When a payment webhook is received, shall verify the HMAC signature.
If the HMAC signature is invalid, the billing service shall reject the webhook.
The billing service shall queue events and shall log the event.
```

```text
err.ears:1 error ears.missing_shall  The requirement does not contain exactly one 'shall' response boundary.
err.ears:2 error ears.missing_system  The requirement is missing the system name before 'shall'.
err.ears:3 error ears.invalid_if_then_form  The 'If' clause is missing the required 'then' boundary.
err.ears:4 error ears.multiple_shall  The requirement contains more than one shell-level 'shall'.

0/4 valid, 4 errors, 0 warnings
```

Line 1 states the behavior in the present tense with no `shall`; add the `shall` boundary. Line 2 dropped the system; name it. Line 3 is missing `then`; add it. Line 4 packs two obligations into one sentence; split them into two requirements.

## Next steps

- [Diagnostics reference](diagnostics.md): every code, its severity by mode, and an example trigger.
- [Grammar matrix](grammar.md): the exact rules the parser implements, with fixtures.
- [API reference](api.md): lint the same requirements from TypeScript.