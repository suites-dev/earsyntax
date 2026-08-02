# Findings model v1

The Findings model is the single canonical result that every findings-bearing
command returns. `validate` returns it directly. `extract`, `instructions`,
`explain`, `profiles`, `doctor`, `init`, and `version` embed or reference it
per `docs/refactor/host-native-facade.md`. SARIF is a projection of this model,
never a second pipeline.

This contract is frozen. Fields are append-only within contract version 1: new
optional fields may be added, existing fields are never renamed, retyped, or
removed without a contract version bump.

## Types

```ts
interface Findings {
  ok: boolean;
  summary: {
    files: number;
    requirements: number;
    valid: number;
    errors: number;
    warnings: number;
  };
  diagnostics: Diagnostic[];
}

interface Diagnostic {
  id: string;
  severity: 'error' | 'warning';
  file: string;
  line: number;
  col?: number;
  message: string;
  fix?: string;
  requirementId?: string;
}
```

## Field semantics

### `Findings`

| Field                  | Type           | Meaning                                                                                                                                   |
| ---------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `ok`                   | `boolean`      | `true` when zero diagnostics have severity `error` after all severity resolution (profile overrides and `--strict`). See "The `ok` rule". |
| `summary.files`        | `number`       | Count of source files the pipeline located and read. Stdin counts as one file.                                                            |
| `summary.requirements` | `number`       | Count of requirement candidates the extractor produced across all files.                                                                  |
| `summary.valid`        | `number`       | Count of requirements carrying no error-severity diagnostic. `valid <= requirements`.                                                     |
| `summary.errors`       | `number`       | Total count of diagnostics with effective severity `error`. Equal to `diagnostics.filter(d => d.severity === 'error').length`.            |
| `summary.warnings`     | `number`       | Total count of diagnostics with effective severity `warning`.                                                                             |
| `diagnostics`          | `Diagnostic[]` | Every finding across every file, in stable order (see "Ordering"). Always present; may be empty.                                          |

`summary.errors` and `summary.warnings` count effective severities, the same
values written to each `Diagnostic.severity`. There is no `info` severity in
the Findings model. `summary` has no `infos` field.

### `Diagnostic`

| Field           | Type                   | Meaning                                                                                                                                                                  |
| --------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`            | `string`               | The registry ID: `EARS-E###` or `EARS-W###`. The prefix reflects the registry's default severity, not necessarily the effective severity on this diagnostic (see below). |
| `severity`      | `'error' \| 'warning'` | The EFFECTIVE severity after profile severity overrides and `--strict`. This is what `ok` and the summary counts derive from.                                            |
| `file`          | `string`               | Path to the source file, relative to `--cwd` (POSIX separators), or `-` for stdin. Never absolute unless the caller passed an absolute path.                             |
| `line`          | `number`               | 1-based line in `file`, mapped back to the original host document position through every pipeline stage. Required.                                                       |
| `col`           | `number` (optional)    | 1-based column, when the finding maps to a specific column. Omitted when only line resolution is available.                                                              |
| `message`       | `string`               | One factual sentence describing the finding. Third-person, neutral. No fix instructions here; use `fix`.                                                                 |
| `fix`           | `string` (optional)    | One suggested remediation sentence, when the diagnostic has a deterministic repair hint. Omitted otherwise. Advisory only; the core never edits files.                   |
| `requirementId` | `string` (optional)    | The requirement's own ID (for example a `REQ-001` frame ID under `ears-x`), when the extractor found one. Distinct from the diagnostic `id`.                             |

## The `ok` rule

`ok` is `true` if and only if no diagnostic has effective severity `error`:

```ts
findings.ok === (findings.summary.errors === 0);
```

Effective severity is computed in this order, and `severity` on each emitted
`Diagnostic` already reflects the result:

1. Start from the registry default severity for the diagnostic's ID
   (`EARS-E###` defaults to `error`, `EARS-W###` defaults to `warning`).
2. Apply the active profile's `severity` override for that ID, if any
   (`error`, `warning`, or `off`). `off` drops the diagnostic entirely; it does
   not appear in `diagnostics` and is not counted.
3. Apply `--strict`: every remaining `warning` is upgraded to `error`.

`--strict` upgrades warnings to errors AT THE FINDINGS LAYER. It does not
re-run the parser or linter and does not change which diagnostics are produced;
it only reclassifies the severity of already-produced warnings. A profile
`severity` override of `off` wins over `--strict` (an `off` diagnostic is never
produced, so there is nothing for `--strict` to upgrade).

Consequences:

- An `EARS-W###` diagnostic can carry `severity: 'error'` after `--strict` or a
  profile override. The ID prefix is the default classification, not a runtime
  guarantee.
- An `EARS-E###` diagnostic always carries `severity: 'error'` unless a profile
  override downgrades it to `warning` or `off`.
- Reading the ID prefix tells you the default; reading `severity` tells you the
  effective classification for this run.

## SARIF is a projection

The SARIF emitter consumes a `Findings` value and maps it to SARIF 2.1.0. It
does not lint, parse, or re-derive anything:

- One SARIF `result` per `Diagnostic`.
- `result.ruleId` = `Diagnostic.id`.
- `result.level` = `error` for `severity: 'error'`, `warning` for
  `severity: 'warning'`. There is no `note` level because the Findings model
  has no `info` severity.
- `result.message.text` = `Diagnostic.message`.
- `result.locations[0].physicalLocation`: `artifactLocation.uri` =
  `Diagnostic.file`; `region.startLine` = `Diagnostic.line`;
  `region.startColumn` = `Diagnostic.col` when present.
- Rule metadata (`shortDescription`, `helpUri`) comes from the diagnostic
  registry, one `reportingDescriptor` per registry ID, sorted by ID.

Because SARIF is downstream of `Findings`, `--strict` and profile overrides are
already baked into `severity` before projection: SARIF levels match the
effective severities with no additional logic.

## Ordering

`diagnostics` is stably sorted so identical input always serializes identically:

1. `file`, by code-unit order (input file order is preserved when the caller
   passes files; globs are expanded in sorted order upstream).
2. `line`, ascending.
3. `col`, ascending; diagnostics without `col` sort after those with `col` on
   the same line.
4. `id`, by code-unit order.
5. `message`, by code-unit order.

## JSON emission and field order

When a command serializes a `Findings` value (for example `validate --json`),
keys are constructed in this fixed order so output is byte-stable:

`Findings`:

1. `ok`
2. `summary`
3. `diagnostics`

`summary` (always all five keys, always present):

1. `files`
2. `requirements`
3. `valid`
4. `errors`
5. `warnings`

Each `Diagnostic`, optional keys included only when present, always in this
position:

1. `id`
2. `severity`
3. `file`
4. `line`
5. `col` (optional)
6. `message`
7. `fix` (optional)
8. `requirementId` (optional)

Serialization is 2-space indented. The command envelope that carries the
Findings (base fields `version`, `command`, `ok`, plus `findings`) is specified
in `docs/refactor/host-native-facade.md`; this document fixes only the
`Findings` object itself.

## Relationship to the current code

The current CLI does not emit this model. `validate` today builds a
`ValidationResult[]` shape (`packages/cli/src/facade-types.ts:110-119`) with
`references`, `ast`, and core `Diagnostic` objects keyed by the old
`DiagnosticCode` union. The current `@earsyntax/cli-contract` `JsonReport`
(`packages/cli-contract/src/json-report.ts`) is a separate projection with an
`infos` count and `span` offsets.

Findings v1 replaces both as the canonical result:

- `Diagnostic.id` is the new `EARS-E###` / `EARS-W###` ID, not the old dotted
  code. The migration table is in `docs/refactor/host-native-facade.md`.
- Positions are `file` + `line` (+ `col`), mapped to the original host
  document, replacing the character `span` offsets that only made sense for
  single-requirement input.
- There is no `references`, `ast`, `pattern`, or `infos` in the Findings model.
  A command MAY expose parser detail (pattern, AST) as its own optional
  command-specific data, but that data is not part of the frozen Findings
  contract and `ok` never depends on it.
- `summary` gains `valid` (count of clean requirements) and drops `infos`.
