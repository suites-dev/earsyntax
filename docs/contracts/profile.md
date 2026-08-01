# Profile schema v1

A profile is data, not code. It is a validated JSON/TS object that tells the
pipeline which host document regions to locate, which EARS dialect to accept,
and how to classify each diagnostic. Parser and linter logic never branch on a
profile name; they read these fields. Adding a host means adding a data file,
not editing parser conditionals.

This contract is frozen. The schema is closed: unknown keys are a validation
error, never silently ignored and never a silent extension point. New fields
are added by amending this contract with a version note, not by tolerating
extra keys.

## Type

```ts
interface Profile {
  name: 'strict' | 'ears-x' | 'kiro' | 'speckit' | 'openspec';
  notation: 'ears';
  dialect: {
    keywordCase: 'strict' | 'case-insensitive';
    allowLiteralSystemName: string[];
    commaAfterLeadingClause: 'required' | 'optional';
    allowStoryWrapper: boolean;
    allowFrameMetadata: boolean;
    allowProhibition: boolean;
  };
  locator: {
    documentKinds: string[];
    include: LocatorRule[];
    exclude: LocatorRule[];
    codeFences: 'ignore' | 'include';
  };
  severity: Record<string, 'error' | 'warning' | 'off'>;
  idFormat: {
    required: boolean;
    pattern?: string;
  };
}

interface LocatorRule {
  id: string;
  kind: 'every-line' | 'heading-section' | 'list-item' | 'block';
  heading?: string;
  listMarker?: 'bullet' | 'ordered' | 'any';
  note?: string;
}
```

`LocatorRule` is the unit the extractor reports as the matching rule for each
candidate (`extract` returns `locatorRuleId`). Its concrete field set is
finalized by the profile schema agent (plan Agent 03) and the host profile
agents (plan Agents 09-12); the `id` field and the four `kind` values are the
frozen part, because `extract` output and profile fixtures depend on them.

## Field semantics

### Top level

| Field | Meaning |
|---|---|
| `name` | The profile identity. One of the five closed names. There are no user-defined profile names in alpha. |
| `notation` | Always `'ears'`. Reserved so a future notation cannot be added by silently repurposing an existing profile. |
| `dialect` | Grammar tolerances the parser/linter apply. See below. |
| `locator` | Which regions of a host document become requirement candidates. See below. |
| `severity` | Per-ID severity overrides keyed by registry ID (`EARS-E###` / `EARS-W###`). |
| `idFormat` | Whether requirements must carry an ID and its shape. |

### `dialect`

| Field | Meaning |
|---|---|
| `keywordCase` | `strict`: EARS keywords must match canonical casing (`When`, `While`, `Where`, `If`, `shall`). `case-insensitive`: any casing, including all-caps (`WHEN`, `THE SYSTEM SHALL`). |
| `allowLiteralSystemName` | Literal system phrases accepted in place of `the <system>` (for example `["THE SYSTEM"]`). Empty means only the canonical `the <system>` form is valid. |
| `commaAfterLeadingClause` | `required`: a leading `When`/`While`/`Where`/`If` clause must be followed by a comma before the main clause. `optional`: the comma may be absent. |
| `allowStoryWrapper` | When `true`, user-story frame lines (for example `As a user, I want ...`) are treated as non-requirement frame content and skipped, not parsed as EARS. |
| `allowFrameMetadata` | When `true`, `REQ-###` frame IDs and `[source: path:line]` tags are accepted as metadata prefixes on a requirement line. |
| `allowProhibition` | When `true`, `shall not` is accepted as a prohibition kind. When `false`, `shall not` is rejected (canonical Mavin EARS has no prohibition template). |

### `locator`

| Field | Meaning |
|---|---|
| `documentKinds` | The file kinds this profile locates over, for example `['ears','text']` or `['markdown']`. Files of other kinds produce no candidates. |
| `include` | Ordered `LocatorRule`s that select candidate regions. A region matched by any include rule is a candidate unless an exclude rule removes it. |
| `exclude` | Ordered `LocatorRule`s that remove regions from the candidate set (for example design or background prose sections). |
| `codeFences` | `ignore`: fenced code blocks are never candidates (prevents false positives on code samples). `include`: fenced content is eligible. |

For `.ears` and plain-text documents the include set is the trivial
`every-line` rule: each non-empty line is a candidate. Markdown profiles use
`heading-section`, `list-item`, and `block` rules to target requirement
regions and to skip narrative prose that merely opens with an EARS keyword.

### `severity`

A partial map from registry ID to `error` / `warning` / `off`. Absent IDs keep
their registry default. `off` drops the diagnostic before it reaches the
Findings model (see `docs/contracts/findings.md`, "The `ok` rule"). This is the
only mechanism that changes a diagnostic's default classification per profile;
severity is never hard-coded in the linter.

### `idFormat`

| Field | Meaning |
|---|---|
| `required` | When `true`, a requirement without an ID is a finding. When `false`, IDs are optional. |
| `pattern` | Optional regular expression a present ID must match (for example `^REQ-\d+$`). Applied whether or not `required` is `true`. |

## Validation rules

1. Unknown top-level keys, or unknown keys inside `dialect`, `locator`, or
   `idFormat`, are a validation error.
2. `name` must be one of the five closed values. `notation` must be `'ears'`.
3. Enumerated fields (`keywordCase`, `commaAfterLeadingClause`, `codeFences`,
   severity values, `LocatorRule.kind`) must be one of their listed values.
4. `severity` keys must be resolvable registry IDs (current `EARS-E###` /
   `EARS-W###` IDs; deprecated aliases are not accepted as override keys).
5. A malformed profile is an environment failure: exit `2` (see the facade
   contract), never a lint result.

## Built-in profiles (intended settings)

These are the intended settings at a summary level. Exact `severity` maps and
the concrete `LocatorRule` sets are finalized by the profile schema agent
(plan Agent 03) and the host profile agents (plan Agents 09-12), with fixtures
on both sides of every line, and by the profile detail in
`EARSYNTAX-CLI-FACADE-ALPHA-0.md`. `strict` is the default when no `--profile`
is passed.

| Field | `strict` | `ears-x` | `kiro` | `speckit` | `openspec` |
|---|---|---|---|---|---|
| `keywordCase` | strict | strict | case-insensitive | strict | strict |
| `allowLiteralSystemName` | `[]` | `[]` | `["THE SYSTEM"]` | `[]` | `[]` |
| `commaAfterLeadingClause` | required | required | optional | required | required |
| `allowStoryWrapper` | false | false | true | false | false |
| `allowFrameMetadata` | false | true | false | false | false |
| `allowProhibition` | false | true | false | false | false |
| `locator.documentKinds` | `['ears','text']` | `['ears','text']` | `['markdown']` | `['markdown']` | `['markdown']` |
| `locator.codeFences` | ignore | ignore | ignore | ignore | ignore |
| `idFormat.required` | false | false | false | false | false |
| `idFormat.pattern` | (none) | `^REQ-\d+$` | (none) | (none) | (none) |

Locator targets, per profile:

- `strict`, `ears-x`: the trivial `every-line` rule over `.ears` and plain
  text. No Markdown extraction.
- `kiro`: bullet and numbered list items under `#### Acceptance Criteria`
  headings in `requirements.md`; user-story wrapper lines skipped as frame
  content; guards against prose false positives.
- `speckit`: requirements sections in `specs/**/spec.md`; design and background
  prose excluded; narrative that opens with an EARS keyword but parses to
  nothing must not become a candidate.
- `openspec`: `### Requirement:` bodies and `#### Scenario:` blocks inside
  `openspec/specs/**` and `openspec/changes/**`; delta-aware path conventions;
  non-requirement prose skipped.

Relationship between profiles:

- `ears-x` is a strict superset. Every `strict`-valid requirement is
  `ears-x`-valid unchanged; `ears-x` only adds tolerances (frame metadata,
  `[source:]` tags, prohibition).
- `kiro` relaxes casing, literal system name, and the leading comma, and skips
  story wrappers. Its severity map is tuned so Kiro house style validates clean
  under `kiro` while the same document fails under `strict`.
- `speckit` and `openspec` are near-strict dialects that differ from `strict`
  mainly in their Markdown locator, not their grammar.

## Non-goals

- Profiles do not carry workspace, manifest, acceptance, or lifecycle
  configuration. No `.earsyntax/` concept appears in a profile.
- Profiles never trigger an LLM call. Locating, extracting, parsing, and
  linting under any profile are pure deterministic code.
- Profile descriptions shown by the `profiles` command are rendered from this
  data, not hand-written, so they cannot drift from the settings above.
