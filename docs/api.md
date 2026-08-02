# API reference

`@earsyntax/core` is the deterministic parser and linter at the center of the toolkit. This page documents its four public functions, the option and catalog shapes they take, and the guarantees they hold to. It also covers one example each for `@earsyntax/extract` and `@earsyntax/cli-contract`. Every example below was run against the built packages, and the JSON is the captured output.

For the exact type definitions, see [`packages/core/src/types.ts`](../packages/core/src/types.ts) and the [public API reference](public-api.md). To write EARS by hand, see the [authoring guide](authoring-ears.md).

```ts
import { lintEars, lintEarsBatch, parseEars, lintCatalogCoverage } from '@earsyntax/core';
```

## Determinism guarantees

The core is deterministic by contract. For a given input it always returns the same result.

- No LLM calls, no network access, no file system access.
- No fuzzy or semantic matching. Catalog matching is exact canonical name, then exact alias.
- Diagnostics are stably sorted by span start, then span end, then code, then message, then severity.
- `lintEarsBatch` preserves input order: result `i` corresponds to input `i`, and echoes its `id`.
- `valid` is derived only from severity: `false` when any diagnostic is an `error`, otherwise `true`.

## `lintEars`

```ts
function lintEars(text: string, catalog?: Catalog, options?: Options): LintResult;
```

Lints a single requirement and returns a complete `LintResult`: `valid`, the classified `pattern`, the parsed `ast`, catalog `references`, and stably sorted `diagnostics`.

### Without a catalog

```ts
lintEars(
  'When a payment webhook is received, the billing service shall verify the HMAC signature.',
);
```

```json
{
  "valid": true,
  "references": [
    {
      "clause": "trigger",
      "text": "a payment webhook is received",
      "role": "event",
      "span": { "start": 5, "end": 34 }
    },
    { "clause": "system", "text": "billing service", "role": "system" }
  ],
  "diagnostics": [],
  "pattern": "event-driven",
  "ast": {
    "pattern": "event-driven",
    "system": { "raw": "billing service", "role": "system" },
    "responses": ["verify the HMAC signature"],
    "raw": "When a payment webhook is received, the billing service shall verify the HMAC signature.",
    "trigger": {
      "kind": "term",
      "text": "a payment webhook is received",
      "term": { "raw": "a payment webhook is received", "role": "event" },
      "span": { "start": 5, "end": 34 }
    }
  }
}
```

Without a catalog, each `references` entry and each `term` carries the raw text and role, but no `matched` pointer: with nothing to match against, terms are neither resolved nor unresolved.

### With a catalog

```ts
const catalog = {
  systems: [{ id: 'SYS-BILLING', name: 'billing service' }],
  events: [{ id: 'EVT-WEBHOOK', name: 'a payment webhook is received' }],
};

lintEars(
  'When a payment webhook is received, the billing service shall verify the HMAC signature.',
  catalog,
  { mode: 'strict' },
);
```

With the catalog supplied, matched terms carry a `matched` pointer to the catalog entry. The system reference becomes:

```json
{
  "clause": "system",
  "text": "billing service",
  "role": "system",
  "matched": { "group": "systems", "id": "SYS-BILLING", "name": "billing service" }
}
```

and the trigger's `term` gains `"matched": { "group": "events", "id": "EVT-WEBHOOK", "name": "a payment webhook is received" }`. The requirement stays `valid: true` with no diagnostics.

## `lintEarsBatch`

```ts
function lintEarsBatch(
  items: RequirementInput[],
  catalog?: Catalog,
  options?: Options,
): LintResult[];
```

Lints many requirements at once. Returns one `LintResult` per input item, in the same order, each echoing the input `id`.

```ts
lintEarsBatch([
  {
    id: 'REQ-001',
    text: 'When a payment webhook is received, the billing service shall verify the HMAC signature.',
  },
  {
    id: 'REQ-002',
    text: 'If the HMAC signature is invalid, then the billing service shall reject the webhook.',
  },
]);
```

The results preserve order and id:

```json
[
  { "id": "REQ-001", "valid": true, "pattern": "event-driven" },
  { "id": "REQ-002", "valid": true, "pattern": "unwanted-behaviour" }
]
```

Each full result also carries `references`, `diagnostics`, and `ast`, shown trimmed here.

## `parseEars`

```ts
function parseEars(text: string, catalog?: Catalog, options?: Options): ParseResult;
```

Parses a requirement without full linting. Returns the classified `pattern`, the parsed `ast`, and structural `diagnostics`. It does not return catalog `references` or lint-level findings, so it is the lighter surface when you only need the shape.

```ts
parseEars(
  'While the payment provider is unavailable, the billing service shall queue retryable events.',
);
```

```json
{
  "diagnostics": [],
  "pattern": "state-driven",
  "ast": {
    "pattern": "state-driven",
    "system": { "raw": "billing service", "role": "system" },
    "responses": ["queue retryable events"],
    "raw": "While the payment provider is unavailable, the billing service shall queue retryable events.",
    "preconditions": {
      "kind": "term",
      "text": "the payment provider is unavailable",
      "term": { "raw": "the payment provider is unavailable", "role": "state" },
      "span": { "start": 6, "end": 41 }
    }
  }
}
```

The `While` clause body fills `ast.preconditions`. `When` fills `trigger`, `Where` fills `feature`, and `If` fills `unwanted`.

## `lintCatalogCoverage`

```ts
function lintCatalogCoverage(
  items: RequirementInput[],
  catalog?: Catalog,
  options?: Options,
): Diagnostic[];
```

Reports catalog entries that no requirement text references. Emits `catalog.term_unreferenced` warnings, and only when `mode` is `strict`. Returns a stably sorted list of diagnostics: empty in guided mode, or when every entry is referenced.

```ts
lintCatalogCoverage(
  [
    {
      id: 'REQ-001',
      text: 'When a payment webhook is received, the billing service shall verify the HMAC signature.',
    },
  ],
  {
    systems: [
      { id: 'SYS-BILLING', name: 'billing service' },
      { id: 'SYS-LEDGER', name: 'ledger service' },
    ],
  },
  { mode: 'strict' },
);
```

The ledger service is never mentioned, so the result contains one diagnostic:

```json
[
  {
    "code": "catalog.term_unreferenced",
    "severity": "warning",
    "message": "catalog systems term \"ledger service\" (SYS-LEDGER) is not referenced by any requirement text"
  }
]
```

## Options

```ts
interface Options {
  mode?: Mode; // 'strict' | 'guided'; default 'strict'
  commaAsAnd?: boolean; // default false
  vagueTerms?: string[]; // default ['appropriate', 'sufficient', 'as needed']
}
```

### strict vs guided

`mode` defaults to `strict`. In strict mode, structural shell and expression failures and an unresolved or ambiguous system are errors, so they set `valid: false`. In guided mode those same defects are downgraded to warnings where a partial AST can still be recovered, so the requirement stays `valid: true`. Every other code, the non-system catalog terms and all `lint.*` codes, is a warning in both modes. The exact mapping is in the [diagnostics reference](diagnostics.md).

`commaAsAnd` reads unambiguous commas inside a clause body as `and`; by default a comma ends a clause. `vagueTerms` replaces the default list that triggers `lint.vague_response` in a response.

## Catalog

```ts
interface Catalog {
  systems?: CatalogEntry[];
  actors?: CatalogEntry[];
  events?: CatalogEntry[];
  states?: CatalogEntry[];
  features?: CatalogEntry[];
  modes?: CatalogEntry[];
  conditions?: CatalogEntry[];
  dataTerms?: CatalogEntry[];
}

interface CatalogEntry {
  id: string;
  name: string;
  aliases?: string[];
}
```

Every group is optional. Matching is deterministic: exact canonical name, then exact alias, then ambiguous when more than one entry matches, then unresolved when none does. An absent or empty catalog means matching is skipped, and terms carry no `matched` pointer.

## `@earsyntax/extract`

`@earsyntax/extract` turns files people write into the `RequirementInput` shape core lints. It supports `.ears`, Markdown, YAML, and JSON, and never lints or parses EARS grammar itself. See the [input formats guide](input-formats.md) for every format.

`extractFromContent` dispatches on the file name's extension:

```ts
import { extractFromContent } from '@earsyntax/extract';

const md = [
  '# Billing requirements',
  '',
  '- REQ-001: When a payment webhook is received, the billing service shall verify the HMAC signature.',
  '- If the HMAC signature is invalid, then the billing service shall reject the webhook.',
].join('\n');

const { items, errors } = extractFromContent(md, 'requirements.md');
```

```json
{
  "items": [
    {
      "id": "REQ-001",
      "text": "When a payment webhook is received, the billing service shall verify the HMAC signature.",
      "source": { "file": "requirements.md", "line": 3 }
    },
    {
      "text": "If the HMAC signature is invalid, then the billing service shall reject the webhook.",
      "source": { "file": "requirements.md", "line": 4 }
    }
  ],
  "errors": []
}
```

The heading is ignored, the first bullet's `REQ-001:` prefix becomes the item `id`, and the second bullet keeps its text with no id. Pass the `items` to `lintEarsBatch` to lint them. `extractFromFile` reads from disk instead of a string and is the only function in the package that touches the file system.

### Host-native pipeline

The `extractFromContent`/`extractEars`/`extractMarkdown`/`extractYaml`/`extractJson` functions above are the non-profile surface: they read every list item, table row, and structured entry. The host-native pipeline is profile-driven, so a profile controls which regions of a host document become candidates. Two entry points cover it:

```ts
import { extractCandidates, runPipeline } from '@earsyntax/extract';
import { BUILTIN_PROFILES } from '@earsyntax/core';

// Stage 1-2 only: locate candidates (what `earsyntax extract` prints).
const { candidates, notices } = extractCandidates({
  files: [{ path: '.kiro/specs/checkout/requirements.md', content }],
  profile: BUILTIN_PROFILES.kiro,
});

// The whole pipeline: locate, extract, parse, lint, assemble findings.
const { findings } = runPipeline({
  files: [{ path: 'requirements.ears', content, kind: 'ears' }],
  profile: BUILTIN_PROFILES.strict,
  strict: false,
});
```

`inferKind(path)` returns the `DocumentKind` a bare path maps to. The pipeline, profiles, and candidate shapes are documented end to end in the [input formats guide](input-formats.md) and enumerated in the [public API reference](public-api.md).

## `@earsyntax/cli-contract`

`@earsyntax/cli-contract` holds the report serializers so external tools can render
linting results the way the CLI does, without depending on the CLI binary. It is
pure data and serializers: no I/O, no argument parsing. It works from two shapes:
a `ReportInput` (files of `{ input, result }` items) for terminal rendering, and a
`Findings` object (from `@earsyntax/core` or `@earsyntax/extract`) for JSON, SARIF,
and the exit code.

### Terminal model from a `ReportInput`

Collect one item per requirement, group them by file, and pass the array to
`buildPrettyModel`:

```ts
import { lintEars } from '@earsyntax/core';
import { buildPrettyModel } from '@earsyntax/cli-contract';

const inputs = [
  {
    id: 'REQ-001',
    text: 'When a payment webhook is received, the billing service shall verify the HMAC signature.',
    source: { file: 'requirements.ears', line: 1 },
  },
  {
    id: 'REQ-002',
    text: 'If the HMAC signature is invalid, the billing service shall reject the webhook.',
    source: { file: 'requirements.ears', line: 2 },
  },
];

const model = buildPrettyModel([
  {
    path: 'requirements.ears',
    items: inputs.map((input) => ({ input, result: lintEars(input.text) })),
  },
]);

// model.summary === { files: 1, requirements: 2, errors: 1, warnings: 0, infos: 0, valid: false }
```

### Findings, SARIF, and the exit code

The findings-based serializers take a `Findings` object. Get one from
`runPipeline` (`@earsyntax/extract`) or `toFindings`/`candidatesToFindings`
(`@earsyntax/core`):

```ts
import { BUILTIN_PROFILES } from '@earsyntax/core';
import { runPipeline } from '@earsyntax/extract';
import { buildSarifLog, exitCodeForFindings, serializeFindings } from '@earsyntax/cli-contract';

const { findings } = runPipeline({
  files: [{ path: 'requirements.ears', content, kind: 'ears' }],
  profile: BUILTIN_PROFILES.strict,
  strict: false,
});

exitCodeForFindings(findings); // 1, because the file has an error-severity finding
const sarif = buildSarifLog(findings); // SARIF 2.1.0 log; each id becomes a rule
serializeFindings(findings); // byte-stable JSON string of the canonical findings
```

For the `If`-without-`then` line above, `findings.diagnostics[0]` is
`{ id: 'EARS-E006', severity: 'error', file: 'requirements.ears', line: 1, col: 1, message: "The 'If' clause is missing the required 'then' boundary." }`,
and the SARIF log carries a matching `EARS-E006` rule and result. The package also
exports `serializeSarifLog`, `canonicalizeFindings`, the `EXIT_OK`/`EXIT_LINT_ERRORS`/`EXIT_USAGE`
constants, and `DIAGNOSTIC_CODES`/`DIAGNOSTIC_DESCRIPTIONS`. This is the same
projection the CLI uses; `earsyntax validate --sarif` and `--json` are thin
wrappers over these serializers.
