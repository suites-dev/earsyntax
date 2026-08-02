# Input Formats

`@earsyntax/extract` turns the files people actually write into requirement
candidates that `@earsyntax/core` lints. It supports four formats: `.ears`,
Markdown, YAML, and JSON. The host-native pipeline (`extractCandidates`,
`runPipeline`) is the only extraction surface this package exposes; a profile
decides which regions of a document become candidates, and every stage is a
pure function of the content string. Only the caller (the CLI) reads files.

```ts
import { extractCandidates } from '@earsyntax/extract';
import { BUILTIN_PROFILES } from '@earsyntax/core';

const md =
  '- REQ-001: When a payment webhook is received, the billing service shall verify the HMAC signature.';
const { candidates, notices } = extractCandidates({
  files: [{ path: '.kiro/specs/checkout/requirements.md', content: md }],
  profile: BUILTIN_PROFILES.kiro,
});
// candidates[0] === {
//   file: '.kiro/specs/checkout/requirements.md',
//   line: 1,
//   col: 3,
//   text: 'When a payment webhook is received, the billing service shall verify the HMAC signature.',
//   profile: 'kiro',
//   locatorRuleId: 'kiro.acceptance-criteria',
//   requirementId: 'REQ-001',
// }
```

This package locates and extracts requirements only. It never lints them or
parses EARS grammar; `runPipeline` hands the extracted text to
`@earsyntax/core` for that.

## `.ears`

One requirement per non-empty line. A line may start with an `ID:` prefix.
Lines whose first non-whitespace character is `#` are comments, and blank lines
are skipped. Line numbers are preserved across skipped lines.

```text
# Billing webhook requirements
REQ-001: When a payment webhook is received, the billing service shall verify the HMAC signature.
REQ-002: If the HMAC signature is invalid, then the billing service shall reject the webhook.
```

Under the `strict` and `ears-x` profiles this is the every-line locator rule:
every non-empty, non-comment line becomes a candidate, with `col` at the line
start.

### Metadata prefix

Agent-generated `.ears` files may carry a source reference in the prefix. Three
forms are accepted:

```text
REQ-001: When a payment webhook is received, the billing service shall verify the HMAC signature.
REQ-001 [source: specs/checkout.md:14]: When a payment webhook is received, the billing service shall verify the HMAC signature.
REQ-002 [source: specs/checkout.md:12-14]: If the HMAC signature is invalid, then the billing service shall reject the webhook.
```

Under a profile whose dialect sets `allowFrameMetadata` (`ears-x`), the `ID:`
and `[source: ...]` segment stay in the candidate's `text` and `col` stays at
the line start; only `requirementId` is lifted. The linter strips the frame
prefix at parse time, so the reported position stays at the physical line and
column where the text sits. Under a profile that does not allow frame metadata
(for example `strict`), a leading `REQ-001:` is left untouched in the text and
the linter reports it.

## Markdown

The Markdown locator reads requirements from headings, list items, and
`blockPrefix` blocks, as the active profile's locator rules declare; see
[Host-native pipeline](#host-native-pipeline) below. Prose paragraphs and
fenced code blocks (both ` ``` ` and `~~~`) are skipped unless the profile sets
`locator.codeFences` to `include`.

### Bullet and numbered lists

Bullets (`-`, `*`, `+`) and numbered items (`1.`, `1)`) each become one
candidate, honoring the profile's `listMarker` and `underHeading` filters. A
markdown bold requirement label (`- **FR-001**: <sentence>`) is host
formatting, not part of the EARS sentence: the locator strips both the list
marker and the `**FR-001**:` label, sets `requirementId` to `FR-001`, and puts
`col` at the first character of the sentence.

```md
- **FR-001**: When a payment webhook is received, the billing service shall verify the HMAC signature.
- If the HMAC signature is invalid, then the billing service shall reject the webhook.
```

The first item extracts with `requirementId: 'FR-001'`; the second has no id.

## YAML

A top-level `requirements` sequence, each entry with a `text` field and an
optional `id`.

```yaml
requirements:
  - id: REQ-001
    text: When a payment webhook is received, the billing service shall verify the HMAC signature.
  - text: The billing service shall retain receipts for seven years.
```

The first entry extracts with `requirementId: 'REQ-001'`; the second is kept
even though it has no id. Source lines are a best-effort lookup: the extractor
locates each entry's id or text in the raw document. Malformed YAML, a missing
`requirements` key, or an entry without a non-empty string `text` are reported
as a `PipelineNotice` (`extract.malformed_yaml`) rather than thrown; malformed
YAML stops extraction for that file, while a single bad entry is skipped and
the others are still returned.

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

As with YAML, missing ids are tolerated, source lines are located by searching
the raw document, and malformed JSON or the wrong top-level shape is reported
as an `extract.malformed_json` notice rather than thrown.

## Host-native pipeline

Two entry points cover the pipeline:

```ts
import { extractCandidates, runPipeline } from '@earsyntax/extract';
import { BUILTIN_PROFILES } from '@earsyntax/core';

// Locate candidates only (what `extract` prints).
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
