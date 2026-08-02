# Authoring EARS by hand

This page is a practical guide to writing EARS requirements that pass
`earsyntax validate`. It covers the six patterns, the clause-order rule, boolean
expressions inside clauses, vague terms, and the diagnostics you are most likely
to hit. Every example uses one domain, a billing service that processes payment
webhooks, and every CLI example below was validated with the built CLI.

The examples validate `.ears` files under the default `strict` profile, which
reads every non-empty line as a candidate. If you have not run the linter yet,
start with the [quickstart](quickstart.md). For the machine-readable API, see the
[API reference](api.md).

## The shape of a requirement

Every EARS requirement ends the same way: a system and one observable response
joined by `shall`.

```text
The <system> shall <response>.
```

Optional clauses go in front of that tail to say when the behavior applies. There
are four clause keywords, each mapping to one pattern. A requirement with no
clause is the fifth pattern, and a requirement with more than one clause is the
sixth. Under `strict`, keywords are matched in their canonical capitalized form;
host profiles such as `kiro` relax keyword case. The examples here use the
conventional capitalized form.

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

Use `Where <feature>, ...` when the behavior exists only if a feature is present
or enabled.

```text
Where dunning management is enabled, the billing service shall retry declined charges.
Where multi-currency support is enabled, the billing service shall convert amounts to the account currency.
```

### Unwanted behaviour: handling an error or exceptional condition

Use `If <condition>, then ...` for errors, invalid input, threats, and other
unwanted conditions. The `then` is required: an `If` clause without it is an error
(`EARS-E006`).

```text
If the HMAC signature is invalid, then the billing service shall reject the webhook.
If the payment is declined, then the billing service shall notify the account owner.
```

### Complex: more than one clause

Use more than one clause when the behavior needs several guards. A requirement
with two or more clauses classifies as `complex`.

```text
While the payment provider is unavailable, when a payment webhook is received, the billing service shall queue the event for retry.
When a payment webhook is received, if the HMAC signature is invalid, then the billing service shall reject the webhook.
```

The five clean requirements above (one per pattern) validate cleanly:

```bash
earsyntax validate requirements.ears --profile strict
```

```text
5/5 valid across 1 file(s), 0 error(s), 0 warning(s)
```

## Clause order

When a requirement uses more than one clause, the clauses must appear in this
order:

```text
While  ->  Where  ->  When  ->  If  ->  the <system> shall <response>
```

A clause out of order is a structural error (`EARS-E005`). `When ... if ... then
...` is valid, because `When` precedes `If`. `When ... while ...` is not, because
`While` must come before `When`:

```text
When a payment webhook is received, while the account is active, the billing service shall process the payment.
```

```text
requirements.ears:1:1 EARS-E005 error The shell clauses appear in an unsupported order.
0/1 valid across 1 file(s), 1 error(s), 0 warning(s)
```

The article `the` on the system is stripped: `the billing service shall ...`
yields the system `billing service`.

## Boolean expressions in clauses

The body of a `While`, `Where`, `When`, or `If` clause can be a boolean expression
over free-text terms, using `and`, `or`, `not`, and parentheses.

```text
When a payment webhook is received or a refund is requested, the billing service shall write an audit log entry.
When a payment webhook is received and the account is active, the billing service shall process the payment.
If the signature is missing or the timestamp is stale, then the billing service shall discard the event.
Where (dunning management is enabled or manual retries are enabled) and the account is active, the billing service shall retry declined charges.
```

Precedence runs `not` tightest, then `and`, then `or`, so `a and b or c` groups as
`(a and b) or c`. Parentheses override precedence. When you mix `and` and `or` at
the same level without parentheses, the requirement still parses and stays valid,
but the linter warns (`EARS-W010`) so you can make the grouping explicit:

```text
When a payment webhook is received and the account is active or a refund is requested, the billing service shall write an audit log entry.
```

```text
requirements.ears:1:1 EARS-W010 warning The clause expression mixes 'and' and 'or' without grouping; add parentheses to make precedence explicit.
1/1 valid across 1 file(s), 0 error(s), 1 warning(s)
```

Unbalanced parentheses (`EARS-E013`), doubled operators such as `or or`
(`EARS-E012`), and empty groups (`EARS-E011`) are errors. By default a comma ends
a clause; the library `commaAsAnd` option reads unambiguous commas inside a clause
body as `and`, but the explicit `and` keyword works either way. See the
[API reference](api.md#options) for the library options.

## Prohibitions

Canonical EARS states positive obligations. A `shall not` prohibition is an error
under `strict` (`EARS-E016`):

```text
The billing service shall not store raw card numbers.
```

```text
requirements.ears:1:1 EARS-E016 error The 'shall not' prohibition form is not allowed by this dialect.
0/1 valid across 1 file(s), 1 error(s), 0 warning(s)
```

The `ears-x` profile legalizes prohibitions through its `allowProhibition`
dialect, so the same line validates under `--profile ears-x`. Restate the
prohibition as a positive obligation, or switch to a profile that allows it.

## Catalog matching

A catalog is an optional list of the domain terms you consider canonical: systems,
events, states, features, and more. Supplying one lets the linter check the system
and clause terms against it, exact match first, then alias, then ambiguous or
unresolved. There is no fuzzy or semantic matching. Catalog matching is a library
capability of `@earsyntax/core`, not a facade flag; the CLI validates against the
active profile's dialect and does not take a catalog. To lint with a catalog, call
`lintEars` or `lintEarsBatch` directly. See the
[API reference](api.md#catalog) for the catalog shape and matching rules.

## Vague terms

A response that hedges instead of stating an observable obligation gets a warning
(`EARS-W016`). The default vague terms are `appropriate`, `sufficient`, and
`as needed`:

```text
The billing service shall retry failed charges as needed.
```

```text
requirements.ears:1:1 EARS-W016 warning The response contains the vague term "as needed".
1/1 valid across 1 file(s), 0 error(s), 1 warning(s)
```

Vague terms do not fail validation. They flag a requirement a reader cannot turn
into a test. Replace the vague term with a bounded, observable response, or raise
the gap for a human if you do not yet know the bound. The library `vagueTerms`
option replaces the default list.

## Common diagnostics and fixes

These are the diagnostics you meet most often while authoring. In `strict` the
structural codes are errors; the style codes are warnings. The
[diagnostics reference](diagnostics.md) documents every code and its severity,
and `earsyntax explain <id>` gives the rationale and a corrected example for one.

| Id          | What it means                                  | Fix                                                                 |
| ----------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| `EARS-E007` | No single `shall` response boundary.           | State one obligation with `shall`: `the billing service shall ...`. |
| `EARS-E008` | No system name before `shall`.                 | Name the system: `... the billing service shall ...`.               |
| `EARS-E006` | An `If` clause has no `then`.                  | Add `then`: `If <condition>, then the <system> shall <response>.`   |
| `EARS-E009` | More than one `shall` in the sentence.         | Split into separate requirements, one obligation each.              |
| `EARS-E005` | Clauses are out of order.                      | Reorder to `While -> Where -> When -> If`.                          |
| `EARS-W013` | Semicolon-joined responses in one requirement. | Split into separate requirements.                                   |
| `EARS-W016` | The response contains a vague term.            | Replace it with an observable, bounded response.                    |
| `EARS-W010` | Mixed `and`/`or` without parentheses.          | Add parentheses to make the grouping explicit.                      |

The four lines below each fail with a different structural error:

```text
The billing service verifies the HMAC signature.
When a payment webhook is received, shall verify the HMAC signature.
If the HMAC signature is invalid, the billing service shall reject the webhook.
The billing service shall queue events and shall log the event.
```

```text
requirements.ears:1:1 EARS-E007 error The requirement does not contain exactly one 'shall' response boundary.
requirements.ears:2:1 EARS-E008 error The requirement is missing the system name before 'shall'.
requirements.ears:3:1 EARS-E006 error The 'If' clause is missing the required 'then' boundary.
requirements.ears:4:1 EARS-E009 error The requirement contains more than one shell-level 'shall'.
0/4 valid across 1 file(s), 4 error(s), 0 warning(s)
```

Line 1 states the behavior in the present tense with no `shall`; add the `shall`
boundary. Line 2 dropped the system; name it. Line 3 is missing `then`; add it.
Line 4 packs two obligations into one sentence; split them into two requirements.

## Next steps

- [Diagnostics reference](diagnostics.md): every code, its severity, and an
  example trigger.
- [Grammar matrix](grammar.md): the exact rules the parser implements, with
  fixtures.
- [API reference](api.md): lint the same requirements from TypeScript, with a
  catalog and options.
