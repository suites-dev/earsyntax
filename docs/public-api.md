# Public API Reference

`@earsyntax/core` exposes a small, frozen surface. Every type is defined in `packages/core/src/types.ts` and re-exported from the package root. The functions below are the entire public API for v0.1.

```ts
import {
  lintEars,
  lintEarsBatch,
  parseEars,
  lintCatalogCoverage,
} from '@earsyntax/core';
```

## Determinism guarantees

The core is deterministic by contract. For a given input it always returns the same result.

- No LLM calls.
- No network access.
- No file system access.
- No fuzzy or semantic matching (catalog matching is exact name, then exact alias).
- Diagnostics are stably sorted by span, then code, then message, then severity.
- `lintEarsBatch` preserves input order: result `i` corresponds to input `i`.
- `valid` is derived only from severity: `false` when any diagnostic is an `error`, otherwise `true`.

## `lintEars`

```ts
function lintEars(text: string, catalog?: Catalog, options?: Options): LintResult;
```

Lints a single requirement and returns a complete `LintResult` with `valid`, `pattern`, `ast`, `references`, and sorted `diagnostics`.

### Example

```ts
const catalog = {
  systems: [{ id: 'SYS-BILLING', name: 'billing service' }],
  events: [{ id: 'EVT-WEBHOOK', name: 'a payment webhook is received' }],
};

const result = lintEars(
  'When a payment webhook is received, the billing service shall verify the HMAC signature.',
  catalog,
  { mode: 'strict' },
);
```

The billing-webhook example from the orchestration brief produces:

```json
{
  "valid": true,
  "pattern": "event-driven",
  "ast": {
    "pattern": "event-driven",
    "trigger": {
      "kind": "term",
      "text": "a payment webhook is received"
    },
    "system": {
      "raw": "billing service",
      "role": "system"
    },
    "responses": ["verify the HMAC signature"],
    "raw": "When a payment webhook is received, the billing service shall verify the HMAC signature."
  },
  "references": [],
  "diagnostics": []
}
```

## `lintEarsBatch`

```ts
function lintEarsBatch(
  items: RequirementInput[],
  catalog?: Catalog,
  options?: Options,
): LintResult[];
```

Lints many requirements at once. Returns one `LintResult` per input item, in the same order, each echoing the input `id`.

### Example

```ts
const results = lintEarsBatch(
  [
    { id: 'REQ-001', text: 'When a payment webhook is received, the billing service shall verify the HMAC signature.' },
    { id: 'REQ-002', text: 'If the HMAC signature is invalid, then the billing service shall reject the webhook.' },
  ],
  catalog,
  { mode: 'strict' },
);

// results[0].id === 'REQ-001', results[1].id === 'REQ-002'
```

## `parseEars`

```ts
function parseEars(text: string, catalog?: Catalog, options?: Options): ParseResult;
```

Parses a requirement without full linting. Returns the classified `pattern`, the parsed `ast`, and structural `diagnostics`. It does not return catalog `references` or lint-level findings.

### Example

```ts
const parsed = parseEars(
  'While the payment provider is unavailable, the billing service shall queue retryable events.',
);

// parsed.pattern === 'state-driven'
// parsed.ast.preconditions describes "the payment provider is unavailable"
```

## `lintCatalogCoverage`

```ts
function lintCatalogCoverage(
  items: RequirementInput[],
  catalog?: Catalog,
  options?: Options,
): Diagnostic[];
```

Reports catalog entries that no requirement text references. Emits `catalog.term_unreferenced` warnings, and only when `mode` is `strict`. Returns a stably sorted list of diagnostics (empty in guided mode or when every entry is referenced).

### Example

```ts
const diagnostics = lintCatalogCoverage(
  [{ id: 'REQ-001', text: 'When a payment webhook is received, the billing service shall verify the HMAC signature.' }],
  {
    systems: [
      { id: 'SYS-BILLING', name: 'billing service' },
      { id: 'SYS-LEDGER', name: 'ledger service' },
    ],
  },
  { mode: 'strict' },
);
```

Since the ledger service is never mentioned, the result contains one diagnostic:

```json
[
  {
    "code": "catalog.term_unreferenced",
    "severity": "warning",
    "message": "catalog systems term \"ledger service\" (SYS-LEDGER) is not referenced by any requirement text"
  }
]
```

## Types

All shapes are defined and documented in `packages/core/src/types.ts` and re-exported from `@earsyntax/core`. The load-bearing ones:

| Type             | Role                                                                        |
| ---------------- | --------------------------------------------------------------------------- |
| `Mode`           | `'strict' \| 'guided'` linting strictness.                                  |
| `Pattern`        | The classified EARS shell pattern.                                          |
| `Options`        | `mode`, `commaAsAnd`, `vagueTerms`.                                         |
| `RequirementInput` | `{ id?, text, source? }` batch input item.                                |
| `SourceLocation` | `{ file?, line?, column? }` origin of a requirement.                        |
| `LintResult`     | Full lint output: `valid`, `pattern`, `ast`, `references`, `diagnostics`.   |
| `ParseResult`    | Parse-only output: `pattern`, `ast`, `diagnostics`.                         |
| `EarsAst`        | Parsed AST with optional `preconditions`, `trigger`, `feature`, `unwanted`. |
| `ClauseExpr`     | Discriminated union: `term`, `and`, `or`, `not`, `group`, `free-text`.      |
| `TermMatch`      | Result of matching one term against the catalog.                            |
| `ReferenceMatch` | A catalog reference found in a requirement, with clause and span.           |
| `Diagnostic`     | `{ code, severity, message, span? }` with `code` typed as `DiagnosticCode`. |
| `DiagnosticCode` | The frozen, append-only registry of diagnostic codes.                       |
| `Catalog`        | Grouped catalog of known domain terms.                                      |
| `CatalogEntry`   | `{ id, name, aliases? }`.                                                    |
| `CatalogRef`     | `{ group, id, name }` pointer to a matched entry.                           |
| `Span`           | `{ start, end }` half-open source offsets.                                  |
