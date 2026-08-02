# Public API reference

`@earsyntax/core` and `@earsyntax/extract` expose the deterministic parser,
linter, diagnostic registry, profile runtime, findings model, and host-native
pipeline for TypeScript users. This page enumerates the exported surface. For
worked examples of the four lint functions and the report serializers, see the
[API reference](api.md); for the extraction formats and the profile locators, see
the [input formats guide](input-formats.md).

Every function here is deterministic: no LLM calls, no network, no file system
access, no fuzzy matching. Diagnostics are stably sorted; batch and pipeline
order is preserved.

## `@earsyntax/core`

### Linting

```ts
import { lintEars, lintEarsBatch, parseEars, lintCatalogCoverage } from '@earsyntax/core';

function lintEars(text: string, catalog?: Catalog, options?: Options): LintResult;
function lintEarsBatch(
  items: RequirementInput[],
  catalog?: Catalog,
  options?: Options,
): LintResult[];
function parseEars(text: string, catalog?: Catalog, options?: Options): ParseResult;
function lintCatalogCoverage(
  items: RequirementInput[],
  catalog?: Catalog,
  options?: Options,
): Diagnostic[];
```

`lintEars` returns a full `LintResult` (`valid`, `pattern`, `ast`, `references`,
sorted `diagnostics`). `lintEarsBatch` returns one result per input in order, each
echoing its `id`. `parseEars` returns the lighter `ParseResult` (`pattern`, `ast`,
structural `diagnostics`) with no catalog references. `lintCatalogCoverage`
reports catalog entries no requirement references, as `catalog.term_unreferenced`
warnings in strict mode. `isStoryWrapperLine(line)` reports whether a line is a
user-story wrapper the host profiles skip.

### Dialect resolution

```ts
import { STRICT_DIALECT, resolveDialect } from '@earsyntax/core';
import type { ResolvedDialect } from '@earsyntax/core';

const STRICT_DIALECT: ResolvedDialect; // canonical EARS tolerances
function resolveDialect(options?: Options): ResolvedDialect; // merge a partial dialect over strict
```

`STRICT_DIALECT` is the default `lintEars`/`parseEars` apply. `resolveDialect`
merges a partial dialect over it, so the pipeline and profile layers share one
defaulting step.

### Diagnostic registry

```ts
import {
  DIAGNOSTIC_REGISTRY,
  resolveDiagnosticId,
  getDiagnosticEntry,
  idForCode,
} from '@earsyntax/core';
import type { DiagnosticRegistryEntry, RegistrySeverity } from '@earsyntax/core';

const DIAGNOSTIC_REGISTRY: readonly DiagnosticRegistryEntry[];
function resolveDiagnosticId(idOrAlias: string): string | undefined; // current id, or undefined
function getDiagnosticEntry(idOrAlias: string): DiagnosticRegistryEntry | undefined;
function idForCode(code: DiagnosticCode): string; // dotted code -> EARS-* id
```

The registry is the single source of truth for the id, alias, and default-severity
mapping. `resolveDiagnosticId` resolves current ids and deprecated dotted aliases
to the current `EARS-*` id; `idForCode` maps a legacy `DiagnosticCode` to its id.
This is the same table `earsyntax explain` and the findings layer read.

### Profiles

```ts
import {
  validateProfile,
  resolveProfile,
  diffProfile,
  summarizeProfiles,
  BUILTIN_PROFILES,
  BUILTIN_PROFILE_NAMES,
  KNOWN_DIAGNOSTIC_IDS,
  isKnownDiagnosticId,
} from '@earsyntax/core';

function validateProfile(input: unknown): ProfileValidationResult; // schema-check an untrusted profile
function resolveProfile(name: string): ResolveProfileResult; // built-in profile by name
function diffProfile(profile: Profile): ProfileDiff; // what one profile relaxes/adds
function summarizeProfiles(): ProfileDiff[]; // the `profiles` command data
```

`BUILTIN_PROFILES` is the record of built-in `Profile` objects (`strict`,
`ears-x`, `kiro`, `speckit`, `openspec`); `BUILTIN_PROFILE_NAMES` is their names
in order. `KNOWN_DIAGNOSTIC_IDS` and `isKnownDiagnosticId` gate a profile's
`severityOverrides` keys against the registry. Exported profile types:
`Profile`, `ProfileName`, `ProfileDialect`, `ProfileLocator`, `ProfileIdFormat`,
`LocatorRule`, `LocatorRuleKind`, `ListMarker`, `KeywordCase`,
`CommaAfterLeadingClause`, `CodeFences`, `SeverityLevel`, `ProfileValidationError`,
`ProfileValidationErrorCode`, `ProfileValidationResult`, `ResolveProfileResult`,
`UnknownProfileError`, `ProfileDiff`.

### Findings

```ts
import { toFindings, defaultSeverityForId } from '@earsyntax/core';

function toFindings(input: FindingsInput, options?: ToFindingsOptions): Findings;
function defaultSeverityForId(id: string): FindingsSeverity;
```

`toFindings` assembles the frozen Findings model (the shape `earsyntax validate
--json` returns) from lint results, applying `--strict` and profile severity
overrides. Exported findings types: `Findings`, `FindingsDiagnostic`,
`FindingsInput`, `FindingsInputFile`, `FindingsInputItem`, `FindingsSeverity`,
`FindingsSummary`, `SeverityOverride`, `SeverityOverrides`, `ToFindingsOptions`.
The model is specified in [`docs/contracts/findings.md`](contracts/findings.md).

### Pipeline findings assembly

```ts
import { candidatesToFindings } from '@earsyntax/core';
import type {
  Candidate,
  CandidateFile,
  PipelineNotice,
  LintCandidatesOptions,
} from '@earsyntax/core';

function candidatesToFindings(
  files: readonly CandidateFile[],
  profile: Profile,
  options?: LintCandidatesOptions,
): Findings;
```

`candidatesToFindings` is the lint-and-assemble stage: it takes located candidates
and a profile and returns Findings. The locate and extract stages live in
`@earsyntax/extract`; `runPipeline` composes all of them.

## `@earsyntax/extract`

The host-native pipeline is the only extraction surface this package exposes.
Every stage is pure over the content strings the caller supplies; only the
caller (the CLI) reads files. The formats are documented in the
[input formats guide](input-formats.md).

### Host-native pipeline

```ts
import { extractCandidates, runPipeline, inferKind } from '@earsyntax/extract';
import type {
  DocumentKind,
  PipelineFile,
  ExtractCandidatesInput,
  ExtractCandidatesResult,
  RunPipelineInput,
  RunPipelineResult,
} from '@earsyntax/extract';

function extractCandidates(input: ExtractCandidatesInput): ExtractCandidatesResult; // locate only
function runPipeline(input: RunPipelineInput): RunPipelineResult; // locate + lint + findings
function inferKind(path: string): DocumentKind; // path -> document kind
```

`extractCandidates` locates the requirement candidates a profile selects (what
`earsyntax extract` prints). `runPipeline` runs the whole chain (locate, extract,
parse, lint, assemble findings) and returns `{ findings, notices }` (what
`earsyntax validate` returns). `Candidate` and `PipelineNotice` are re-exported
from core so callers need no separate import.

## Core types

All shapes are defined and documented in
[`packages/core/src/types.ts`](../packages/core/src/types.ts) and re-exported from
`@earsyntax/core`. The load-bearing ones:

| Type               | Role                                                                        |
| ------------------ | --------------------------------------------------------------------------- |
| `Mode`             | `'strict' \| 'guided'` linting strictness.                                  |
| `Pattern`          | The classified EARS shell pattern.                                          |
| `Options`          | `mode`, `commaAsAnd`, `vagueTerms`.                                         |
| `RequirementInput` | `{ id?, text, source? }` batch input item.                                  |
| `SourceLocation`   | `{ file?, line?, column? }` origin of a requirement.                        |
| `LintResult`       | Full lint output: `valid`, `pattern`, `ast`, `references`, `diagnostics`.   |
| `ParseResult`      | Parse-only output: `pattern`, `ast`, `diagnostics`.                         |
| `EarsAst`          | Parsed AST with optional `preconditions`, `trigger`, `feature`, `unwanted`. |
| `ClauseExpr`       | Discriminated union: `term`, `and`, `or`, `not`, `group`, `free-text`.      |
| `TermMatch`        | Result of matching one term against the catalog.                            |
| `ReferenceMatch`   | A catalog reference found in a requirement, with clause and span.           |
| `Diagnostic`       | `{ code, severity, message, span? }` with `code` typed as `DiagnosticCode`. |
| `DiagnosticCode`   | The frozen, append-only registry of dotted diagnostic codes.                |
| `Catalog`          | Grouped catalog of known domain terms.                                      |
| `CatalogEntry`     | `{ id, name, aliases? }`.                                                   |
| `CatalogRef`       | `{ group, id, name }` pointer to a matched entry.                           |
| `Span`             | `{ start, end }` half-open source offsets.                                  |
