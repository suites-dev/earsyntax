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
