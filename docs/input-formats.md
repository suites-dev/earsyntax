# Input Formats

`@earsyntax/extract` turns the files people actually write into the
`RequirementInput` shape that `@earsyntax/core` lints. It supports four formats:
`.ears`, Markdown, YAML, and JSON. Every extractor is a pure function of its
input string, returns items in document order, and records a 1-based source
line for each requirement.

```ts
import { extractFromContent } from '@earsyntax/extract';

const md =
  '- REQ-001: When a payment webhook is received, the billing service shall verify the HMAC signature.';
const { items, errors } = extractFromContent(md, 'requirements.md');
// items[0] === {
//   id: 'REQ-001',
//   text: 'When a payment webhook is received, the billing service shall verify the HMAC signature.',
//   source: { file: 'requirements.md', line: 1 },
// }
```

This package extracts requirements only. It never lints them or parses EARS
grammar; pass the extracted `items` to `@earsyntax/core` for that.

## What every extractor returns

Each extractor returns an `ExtractResult`:

```ts
interface ExtractResult {
  items: RequirementInput[]; // in document order
  errors: ExtractError[]; // empty on a clean extraction
}

interface ExtractError {
  message: string;
  file?: string;
  line?: number;
}
```

Extraction is tolerant. A malformed file or a single bad entry produces an
`ExtractError` rather than a thrown exception, and the good entries around it
are still returned. IDs are always optional: when a source provides one it is
lifted into `item.id`, otherwise the item carries `text` and `source` only.

## `.ears`

One requirement per non-empty line. A line may start with an `ID:` prefix.
Lines whose first non-whitespace character is `#` are comments, and blank lines
are skipped. Line numbers are preserved across skipped lines.

```text
# Billing webhook requirements
REQ-001: When a payment webhook is received, the billing service shall verify the HMAC signature.
REQ-002: If the HMAC signature is invalid, then the billing service shall reject the webhook.
```

```ts
import { extractEars } from '@earsyntax/extract';

const { items } = extractEars(content, 'billing.ears');
// items[0].id === 'REQ-001'
// items[0].source === { file: 'billing.ears', line: 2 }
```

A colon inside the requirement text is not mistaken for an ID prefix, because an
ID cannot contain spaces. `When the report is ready, the billing service shall
emit: a summary.` extracts with no `id` and its full text intact.

### Metadata prefix

Agent-generated `.ears` files may carry a source reference in the prefix. Three
forms are accepted:

```text
REQ-001: When a payment webhook is received, the billing service shall verify the HMAC signature.
REQ-001 [source: specs/checkout.md:14]: When a payment webhook is received, the billing service shall verify the HMAC signature.
REQ-002 [source: specs/checkout.md:12-14]: If the HMAC signature is invalid, then the billing service shall reject the webhook.
```

The id and the `[source: ...]` segment are stripped from the text before it is
handed to the linter, so the requirement classifies correctly. When a
`[source: path:line]` reference is present it becomes the item's source
location, overriding the physical `.ears` file and line:

```ts
const line =
  'REQ-001 [source: specs/checkout.md:14]: When a payment webhook is received, the billing service shall verify the HMAC signature.';
const { items } = extractEars(line, 'requirements.ears');
// items[0] === {
//   id: 'REQ-001',
//   text: 'When a payment webhook is received, the billing service shall verify the HMAC signature.',
//   source: { file: 'specs/checkout.md', line: 14 },
// }
```

For a `line-line` range the start line is used. Because `SourceLocation` holds a
single file and line, the physical `.ears` position is not retained separately
once a declared reference is present. A malformed `[source: ...]` segment (one
that does not parse as `path:line`) is stripped from the text, the id is still
extracted, and the source falls back to the physical `.ears` file and line.

## Markdown

The Markdown extractor reads requirements from three structures and ignores
everything else. Prose paragraphs, headings, and fenced code blocks (both
` ``` ` and `~~~`) are skipped entirely.

### Bullet and numbered lists

Bullets (`-`, `*`, `+`) and numbered items (`1.`, `1)`) each become one
requirement. The same metadata prefix as `.ears` applies inside the item: a bare
`REQ-001:` id, or `REQ-001 [source: path:line]:` with a declared source
reference that becomes the item's source location.

```md
- REQ-001: When a payment webhook is received, the billing service shall verify the HMAC signature.
- If the HMAC signature is invalid, then the billing service shall reject the webhook.

1. REQ-003 [source: specs/checkout.md:20]: The billing service shall retain receipts for seven years.
```

The first item extracts as `id: 'REQ-001'`; the second has no id; the third
carries `id: 'REQ-003'` with `source: { file: 'specs/checkout.md', line: 20 }`.

### Tables

GFM pipe tables are supported in two forms. A table with `ID` and `Requirement`
columns takes the id from the `ID` column:

```md
| ID      | Requirement                                                                              |
| ------- | ---------------------------------------------------------------------------------------- |
| REQ-001 | When a payment webhook is received, the billing service shall verify the HMAC signature. |
| REQ-002 | If the HMAC signature is invalid, then the billing service shall reject the webhook.     |
```

A single-column requirement table also works, and an `ID:` prefix inside a cell
is lifted just like in a bullet:

```md
| Requirement                                                   |
| ------------------------------------------------------------- |
| REQ-001: The billing service shall verify the HMAC signature. |
| The billing service shall reject invalid webhooks.            |
```

Column headers are matched case-insensitively. `ID` selects the id column;
`Requirement`, `Requirements`, `Text`, or `Statement` selects the text column.
A table needs a separator row (`| --- |`) with a header row directly above it;
pipe lines without one are treated as prose and ignored.

## YAML

A top-level `requirements` sequence, each entry with a `text` field and an
optional `id`.

```yaml
requirements:
  - id: REQ-001
    text: When a payment webhook is received, the billing service shall verify the HMAC signature.
  - text: The billing service shall retain receipts for seven years.
```

```ts
import { extractYaml } from '@earsyntax/extract';

const { items, errors } = extractYaml(content, 'requirements.yaml');
```

The first entry extracts with `id: 'REQ-001'`; the second is kept even though it
has no id. Source lines are a best-effort lookup: the extractor locates each
entry's id or text in the raw document.

Malformed YAML, a missing `requirements` key, or an entry without a non-empty
string `text` are reported in `errors`. Malformed YAML stops extraction; a
single bad entry is skipped while the others are still returned.

```ts
// requirements:
//   - id: REQ-001
//     text: "unterminated
// errors[0].message === 'Malformed YAML: ...'
// errors[0].line   === 3
```

## JSON

An object with a `requirements` array, each entry with a `text` field and an
optional `id`.

```json
{
  "requirements": [
    {
      "id": "REQ-001",
      "text": "When a payment webhook is received, the billing service shall verify the HMAC signature."
    },
    {
      "text": "The billing service shall retain receipts for seven years."
    }
  ]
}
```

```ts
import { extractJson } from '@earsyntax/extract';

const { items, errors } = extractJson(content, 'requirements.json');
```

As with YAML, missing ids are tolerated, source lines are located by searching
the raw document, and malformed JSON or the wrong top-level shape is reported in
`errors` rather than thrown.

## Dispatch by extension

`extractFromContent` picks the right extractor from a file name's extension and
records that name as each item's source file:

| Extension          | Extractor         |
| ------------------ | ----------------- |
| `.ears`            | `extractEars`     |
| `.md`, `.markdown` | `extractMarkdown` |
| `.yaml`, `.yml`    | `extractYaml`     |
| `.json`            | `extractJson`     |

An unsupported extension returns no items and a single `ExtractError`.

```ts
import { extractFromContent, extractFromFile } from '@earsyntax/extract';

// From a string you already hold:
const result = extractFromContent(content, 'requirements.md');

// Or read from disk. This is the only function in the package that touches
// the file system; a read failure is reported in `errors`, not thrown.
const fromDisk = extractFromFile('specs/requirements.yaml');
```

## Host-native pipeline

The `extractEars`/`extractMarkdown`/`extractYaml`/`extractJson` functions above
are the non-profile surface: they read every list item, table row, and structured
entry regardless of context. The host-native commands (`validate`, `extract`)
use a profile-driven pipeline instead, so a profile controls which regions of a
host document become requirement candidates.

Two entry points cover the pipeline:

```ts
import { extractCandidates, runPipeline } from '@earsyntax/extract';
import { BUILTIN_PROFILES } from '@earsyntax/core';

// Stage 1-2 only: locate candidates (what `extract` prints).
const { candidates, notices } = extractCandidates({
  files: [{ path: '.kiro/specs/checkout/requirements.md', content }],
  profile: BUILTIN_PROFILES.kiro,
});

// The whole pipeline: locate, extract, parse, lint, assemble findings.
const { findings, notices: pipelineNotices } = runPipeline({
  files: [{ path: '-', content, kind: 'text' }],
  profile: BUILTIN_PROFILES.strict,
  strict: false,
});
```

A `PipelineFile` is `{ path, content, kind? }`. When `kind` is omitted it is
inferred from the path extension (`.ears`, `.md`/`.markdown`, `.yaml`/`.yml`,
`.json`, anything else `text`). Pass `path: '-'` for stdin content.

### Candidates and positions

Each `Candidate` is
`{ file, line, col?, text, profile, locatorRuleId, requirementId? }`. `line` and
`col` are 1-based and point at the original host document: `col` is the column of
the requirement text's first character, past any list marker or stripped bold
label. `locatorRuleId` is the id of the profile `LocatorRule` that selected the
candidate, so `extract` output can be traced back to the profile.
`requirementId` is the requirement's own id when the locator found one.

### Document-kind gating

For the text-family kinds (`ears`, `text`, `markdown`) a file produces
candidates only when its kind is listed in the profile's
`locator.documentKinds`. Validating a Markdown file under `strict` (which locates
over `ears`/`text`) yields no candidates rather than a parse error. YAML and
JSON are structured requirement lists: no built-in profile declares them in
`documentKinds`, so they are extracted profile-agnostically and their candidates
carry a synthetic `locatorRuleId` of `structured.yaml` or `structured.json`. The
active dialect still applies when their text is linted.

### Requirement ids under the pipeline

Two id conventions apply, and they are handled differently on purpose:

- A markdown bold requirement label (`- **FR-001**: <sentence>`) is host
  formatting, not part of the EARS sentence. The locator strips both the list
  marker and the `**FR-001**:` label, sets `requirementId` to `FR-001`, and puts
  `col` at the first character of the sentence. Speckit and Kiro use this form.
- An `ears-x` frame prefix (`REQ-001:` and an optional `[source: path:line]`
  tag) is retained in the candidate `text`, with `col` at the line start. Only
  `requirementId` is lifted. The linter strips the frame prefix at parse time
  under `allowFrameMetadata`, so the extractor must not move the reported
  position: findings point at the physical line and column where the text sits.
  This differs from the non-profile `extractEars`, which removes the prefix from
  `text` and lets a `[source: ...]` reference override the item's source
  location.

Under a profile that allows neither (for example `strict`), a leading `REQ-001:`
is left untouched in the text and the linter reports it.

### Never throws

The pipeline never throws on malformed input. A bad YAML/JSON document or an
unsupported kind produces zero candidates plus a `PipelineNotice`
(`{ code, severity, message, file?, line? }`). Notices are the environment
channel, distinct from lint findings; the CLI surfaces them as facade-level
diagnostics, never inside the frozen Findings model.

## Profiles

A profile decides which regions of a document become requirement candidates and
which grammar tolerances apply when they are linted. The `earsyntax validate`,
`extract`, and `instructions` commands take `--profile <name>`; it defaults to
`strict`. Run `earsyntax profiles --json` for the exact, data-rendered summary;
the table below is the same information in prose.

| Profile    | Locates                                                   | Document kinds | Notable relaxations and additions                                                                                                  |
| ---------- | --------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `strict`   | Every non-empty line.                                     | `ears`, `text` | None. Canonical EARS only.                                                                                                         |
| `ears-x`   | Every non-empty line.                                     | `ears`, `text` | Adds frame metadata, `shall not` prohibition, and a `^REQ-\d+$` id format.                                                         |
| `kiro`     | List items under an `Acceptance Criteria` heading.        | `markdown`     | Relaxes keyword case, the leading comma, the literal `THE SYSTEM`, and user-story wrappers. Turns off `EARS-W011` and `EARS-W014`. |
| `speckit`  | Body of sections matching `^(functional )?requirements$`. | `markdown`     | None beyond the locator.                                                                                                           |
| `openspec` | `### Requirement:` blocks and `#### Scenario:` blocks.    | `markdown`     | None beyond the locator.                                                                                                           |

### Markdown blindness under strict

`strict` and `ears-x` declare `documentKinds` of `ears` and `text` only. A
Markdown file's kind is inferred as `markdown`, which is not in that list, so
validating a `.md` file under `strict` produces zero candidates and a clean run,
not a parse error:

```bash
earsyntax validate ".kiro/specs/**/requirements.md" --profile strict --json
# findings.summary.requirements === 0, ok === true
```

This is intended. EARS requirements inside Markdown live in host structure
(acceptance-criteria lists, requirement sections), and locating them is exactly
what the host profiles (`kiro`, `speckit`, `openspec`) do. Use `strict` for
`.ears`, plain text, and stdin; use a host profile for a host document.

### Structured formats are profile-agnostic

YAML and JSON are structured requirement lists, so no built-in profile declares
them in `documentKinds`. They are extracted regardless of the active profile,
and their candidates carry a synthetic `locatorRuleId` of `structured.yaml` or
`structured.json`. The active profile's dialect still applies when the extracted
text is linted. For example, a YAML file validated under `kiro` still yields its
requirement candidates and lints them with the `kiro` dialect.
