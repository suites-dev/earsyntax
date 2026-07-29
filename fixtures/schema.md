# Fixture Schema

Fixtures are the source-of-truth examples for the EARS toolkit. Each fixture file is a single JSON object describing one requirement, the options it is linted under, an optional catalog, and the expected result. Grammar, parser, catalog, and compatibility agents all read and write against this shape.

## File layout

- One JSON object per file.
- Valid fixtures live under `fixtures/valid/` (and `fixtures/canonical/`).
- Invalid fixtures live under `fixtures/invalid/`.
- Compatibility fixtures live under `fixtures/compatibility/` (and `fixtures/ears-lint-go-parity/`).

## Object shape

```json
{
  "id": "REQ-001",
  "text": "When a payment webhook is received, the billing service shall verify the HMAC signature.",
  "options": {
    "mode": "strict",
    "commaAsAnd": false,
    "vagueTerms": ["appropriate", "sufficient", "as needed"]
  },
  "catalog": {
    "systems": [{ "id": "SYS-BILLING", "name": "billing service" }],
    "events": [{ "id": "EVT-WEBHOOK", "name": "a payment webhook is received" }]
  },
  "expected": {
    "valid": true,
    "pattern": "event-driven",
    "diagnostics": [],
    "ast": {
      "pattern": "event-driven",
      "system": { "raw": "billing service", "role": "system" }
    },
    "responses": ["verify the HMAC signature"]
  }
}
```

### Top-level fields

| Field      | Type                       | Required | Meaning                                                              |
| ---------- | -------------------------- | -------- | -------------------------------------------------------------------- |
| `id`       | `string`                   | yes      | Stable fixture identifier, echoed into `LintResult.id`.              |
| `text`     | `string`                   | yes      | The raw requirement text passed to `lintEars`.                       |
| `options`  | `object`                   | no       | Subset of `Options`. Omitted fields fall back to library defaults.   |
| `catalog`  | `Catalog`                  | no       | Catalog passed to the linter. Omit for catalog-free fixtures.        |
| `expected` | `object`                   | yes      | The assertions the fixture makes about the result.                   |

### `options`

A partial `Options` object. Any field may be omitted; omitted fields use the library defaults (`mode: "strict"`, `commaAsAnd: false`, `vagueTerms: ["appropriate", "sufficient", "as needed"]`).

| Field        | Type       | Meaning                                            |
| ------------ | ---------- | -------------------------------------------------- |
| `mode`       | `Mode`     | `"strict"` or `"guided"`.                          |
| `commaAsAnd` | `boolean`  | Treat unambiguous clause-body commas as `and`.     |
| `vagueTerms` | `string[]` | Terms flagged when they appear in a response.      |

### `catalog`

A full `Catalog` object as defined in `packages/core/src/types.ts`. Only the groups a fixture needs must be present.

### `expected`

| Field         | Type              | Required | Meaning                                                                    |
| ------------- | ----------------- | -------- | -------------------------------------------------------------------------- |
| `valid`       | `boolean`         | yes      | Expected `LintResult.valid`.                                               |
| `pattern`     | `Pattern`         | no       | Expected classified pattern. Assert only when the fixture parses.          |
| `diagnostics` | `Diagnostic[]`    | yes      | Expected diagnostics. May be empty. See matching semantics below.          |
| `ast`         | partial `EarsAst` | no       | Selected AST fields to assert. Compared as a subset. See below.            |
| `responses`   | `string[]`        | no       | Expected `ast.responses`. Convenience alias for `ast.responses`.           |

Each entry in `expected.diagnostics` is a partial `Diagnostic`:

```json
{ "code": "ears.missing_shall", "severity": "error", "span": { "start": 0, "end": 12 } }
```

| Field      | Type             | Required | Meaning                                        |
| ---------- | ---------------- | -------- | ---------------------------------------------- |
| `code`     | `DiagnosticCode` | yes      | The registered diagnostic code.                |
| `severity` | `Severity`       | yes      | `"error"`, `"warning"`, or `"info"`.           |
| `span`     | `Span`           | no       | Asserted only when present. See below.         |

## Matching semantics

The runner compares an actual `LintResult` against `expected` using these rules. They are exact and load-bearing; fixture authors and runner implementers must follow them identically.

### `valid`

Compared for strict equality against `LintResult.valid`.

### `pattern`

When present, compared for strict equality against `LintResult.pattern`. When absent, `pattern` is not asserted.

### `diagnostics` (exact code + severity multiset)

The actual and expected diagnostics are compared as a **multiset of `(code, severity)` pairs**:

- Order does not matter.
- Every expected pair must appear in the actual set, and every actual pair must appear in the expected set (no missing, no extra).
- Duplicates count: two expected `lint.vague_response` warnings require exactly two actual ones.

`message` is never compared (messages are owned by the diagnostics agent and may change).

### `span` on a diagnostic (asserted only when present)

For a given expected diagnostic entry:

- If the entry has no `span`, span is not asserted for that diagnostic.
- If the entry has a `span`, the matched actual diagnostic must carry an exactly equal `span` (`start` and `end` both equal).

Span assertion is opt-in per diagnostic so most fixtures stay resilient to offset churn while representative fixtures can pin exact offsets.

### `ast` (subset match)

`expected.ast` is compared against `LintResult.ast` as a **recursive subset**:

- Only keys present in `expected.ast` are checked; keys absent from `expected.ast` are ignored.
- Nested objects are compared by the same subset rule.
- Arrays are compared element by element, in order, using the subset rule per element; the actual array must have at least as many elements as the expected array, and only the first `expected.length` elements are checked.
- Primitive leaves are compared for strict equality.

This lets a fixture assert, for example, only `ast.pattern` and `ast.system.role` without spelling out the entire tree.

### `responses`

When present, compared for strict equality (ordered, element-by-element) against `LintResult.ast.responses`. Equivalent to asserting `ast.responses`; provided as a convenience for response-splitting fixtures.

## Determinism

Because the linter is deterministic (no LLM, no network, no file system, stable diagnostic sort, preserved batch order), every fixture must produce the same result on every run. A fixture whose expectations depend on run order or environment is invalid.
