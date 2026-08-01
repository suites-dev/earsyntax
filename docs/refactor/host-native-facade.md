# Host-native facade (frozen)

This is the frozen command surface for the host-native `earsyntax` CLI. It is
the target the implementation agents build against. Where it conflicts with
`EARSYNTAX-CLI-FACADE-ALPHA-0.md`, this document wins: the `.earsyntax/`
workspace, work items, manifests, acceptance, and the `new`/`list`/`status`/
`show`/`accept`/`check` commands are removed, not preserved as a second ring.

`earsyntax` owns deterministic EARS extraction, validation, explanation, SARIF
output, and agent instructions inside host documents (Kiro, Spec Kit, OpenSpec,
and plain `.ears`/text). It never owns a specification lifecycle. The core
never calls an LLM; Claude calls `earsyntax`, never the reverse.

## Command surface

```bash
earsyntax validate <paths...|->
earsyntax extract <paths...|->
earsyntax instructions <author|convert|repair|review> --file <path> [--from <source>]
earsyntax explain <diagnostic-id>
earsyntax profiles
earsyntax doctor
earsyntax init --agent <agents> --host <hosts>
earsyntax version --features
```

Eight commands. The surface is closed. No command outside this list may be
added.

## Global flags

| Flag | Applies to | Meaning |
|---|---|---|
| `--profile <name>` | validate, extract, instructions | Select a built-in profile: `strict` (default), `ears-x`, `kiro`, `speckit`, `openspec`. |
| `--json` | all | Emit the JSON contract instead of pretty text. |
| `--sarif` | validate only | Emit SARIF 2.1.0 (projection of the findings model). Rejected on any other command with exit `2`. |
| `--strict` | validate (and repair/review instructions that embed findings) | Upgrade warnings to errors at the findings layer (see `docs/contracts/findings.md`). |
| `--quiet` | all | Suppress pretty non-essential output; JSON output is unaffected. |
| `--cwd <dir>` | all | Directory to resolve relative paths and detect the repo root from. Defaults to the process working directory. |

`--profile` defaults to `strict`. `--sarif` and `--json` are mutually
exclusive; passing both is a usage error (exit `2`). There is no `--work`,
`--source` (as a validate flag), `--out`, `--by`, `--artifact`, `--config`, or
`--mode`: all were workspace or lifecycle flags and are removed.

## Exit codes (frozen)

| Code | Meaning |
|---|---|
| `0` | Success, or a findings run with no error-severity findings. |
| `1` | A findings run produced at least one error-severity finding. `validate` is the command that returns `1`. |
| `2` | Usage or environment failure: bad flag, unknown profile, unknown diagnostic id, missing path, unreadable file, `--sarif` on a non-validate command, `--from` on a non-author/convert mode. |

Exit code `3` is removed. It existed only for workspace refusals (overwrite
protection over managed state, the acceptance gate, stale-source refusal). With
no managed workspace there is nothing to refuse in that sense, so the codes are
`0`, `1`, `2` only. `init` writes managed files idempotently and reports
conflicts in its JSON (`skipped`, `warnings`), not via exit `3`.

## Response envelope

Every `--json` response is an envelope with base fields, then command-specific
keys, then `next`:

```ts
interface Envelope {
  version: string;              // installed @earsyntax/cli package version
  command: string;              // "validate", "instructions author", ...
  ok: boolean;                  // no error-severity finding and no usage error
  root?: string;               // absolute repo root, when the command detects one
  // ...command-specific keys...
  diagnostics?: FacadeDiagnostic[]; // environment/usage notices, NOT lint findings
  next: NextAction[];           // always present; may be empty
}

interface FacadeDiagnostic {
  code: string;                 // "cli.unknown_profile", "validate.missing_file", ...
  severity: 'error' | 'warning';
  message: string;
  path?: string;
  line?: number;
}

interface NextAction {
  command: string;              // a runnable earsyntax command
  reason: string;
  forAgent?: boolean;
}
```

`diagnostics` here is the facade-level channel for usage and environment
problems, distinct from the lint findings that live in a command's `findings`
key. Lint results are never placed in `diagnostics`. Base key order:
`version`, `command`, `ok`, `root?`, command keys, `diagnostics?`, `next`.

`FacadeDiagnostic.severity` is `error` or `warning` only; the `info` level from
the old contract is dropped.

## Per-command JSON contracts

### `validate <paths...|->`

Locate, extract, parse, and lint EARS in the given files (or stdin `-`) under
the active profile. Returns the frozen Findings model in `findings`. Exit `0`
when `findings.ok`, else `1`.

```json
{
  "version": "0.0.0",
  "command": "validate",
  "ok": false,
  "findings": {
    "ok": false,
    "summary": { "files": 1, "requirements": 3, "valid": 2, "errors": 1, "warnings": 0 },
    "diagnostics": [
      {
        "id": "EARS-E006",
        "severity": "error",
        "file": ".kiro/specs/checkout/requirements.md",
        "line": 12,
        "message": "An If clause is missing its required then boundary.",
        "fix": "Write: If <condition>, then the <system> shall <response>.",
        "requirementId": "REQ-003"
      }
    ]
  },
  "next": [
    {
      "command": "earsyntax instructions repair --file .kiro/specs/checkout/requirements.md --profile kiro --json",
      "reason": "Get repair rules for the reported diagnostics.",
      "forAgent": true
    }
  ]
}
```

The `findings` object is exactly `docs/contracts/findings.md`. `--sarif`
replaces the entire stdout with a SARIF 2.1.0 log (not the envelope); exit code
is still findings-driven.

### `extract <paths...|->`

Print the requirement candidates the active profile's locator finds, with
source positions and the matching locator rule. Debugging surface for profiles.
Does not lint, so it carries no findings and returns exit `0` unless there is an
environment error.

```json
{
  "version": "0.0.0",
  "command": "extract",
  "ok": true,
  "summary": { "files": 1, "candidates": 2 },
  "candidates": [
    {
      "file": ".kiro/specs/checkout/requirements.md",
      "line": 10,
      "col": 3,
      "text": "WHEN a payment webhook arrives THE SYSTEM SHALL verify the signature",
      "profile": "kiro",
      "locatorRuleId": "kiro.acceptance-criteria-item",
      "requirementId": "REQ-001"
    }
  ],
  "next": []
}
```

`Candidate`: `{ file, line, col?, text, profile, locatorRuleId, requirementId? }`.
`col` and `requirementId` are omitted when unknown. Field order is fixed as
listed.

### `instructions <author|convert|repair|review> --file <path> [--from <source>]`

Return the deterministic rules an agent follows for one loop step against a host
file. Read-only: the CLI returns rules and (for repair/review) findings; it
never edits, never converts content semantically, never calls an LLM.

```json
{
  "version": "0.0.0",
  "command": "instructions repair",
  "ok": true,
  "mode": "repair",
  "file": ".kiro/specs/checkout/requirements.md",
  "profile": "kiro",
  "locator": {
    "documentKinds": ["markdown"],
    "summary": "Bullet and numbered items under #### Acceptance Criteria headings in requirements.md."
  },
  "dialect": {
    "keywordCase": "case-insensitive",
    "commaAfterLeadingClause": "optional",
    "allowLiteralSystemName": ["THE SYSTEM"],
    "allowStoryWrapper": true,
    "allowFrameMetadata": false,
    "allowProhibition": false
  },
  "rules": [
    "Change only what the diagnostics justify; leave passing requirements untouched.",
    "Edit only the host file; preserve surrounding document structure."
  ],
  "editPolicy": {
    "editableFile": ".kiro/specs/checkout/requirements.md",
    "preserveStructure": true
  },
  "outputPolicy": "edit-in-place",
  "findings": {
    "ok": false,
    "summary": { "files": 1, "requirements": 3, "valid": 2, "errors": 1, "warnings": 0 },
    "diagnostics": [
      {
        "id": "EARS-E006",
        "severity": "error",
        "file": ".kiro/specs/checkout/requirements.md",
        "line": 12,
        "message": "An If clause is missing its required then boundary."
      }
    ]
  },
  "next": [
    {
      "command": "earsyntax validate .kiro/specs/checkout/requirements.md --profile kiro --json",
      "reason": "Re-validate after applying the repairs and repeat until clean.",
      "forAgent": true
    }
  ]
}
```

Payload keys: `mode`, `file`, `profile`, optional `sourceFile` (see `--from`),
`locator`, `dialect`, `rules`, `editPolicy`, `outputPolicy` (always
`"edit-in-place"`), optional `findings`, `next`.

Per-mode content:

| Mode | `findings` present | `rules` focus |
|---|---|---|
| `author` | no | Write new EARS requirements into the host file's requirements region only. |
| `convert` | no | Rewrite natural-language requirements already in the host file into EARS in place. |
| `repair` | yes | Change only what the diagnostics justify, keyed to their ids. |
| `review` | yes | Produce a human review summary; never approve, accept, or merge. |

The instruction body never tells an agent to approve, accept, or merge, and
never references a workspace, work item, or manifest.

#### `--from <source>` semantics

`--from <source>` is valid only with `instructions author` and
`instructions convert`; using it with `repair` or `review` is a usage error
(exit `2`). It names a natural-language spec file the agent reads as input while
writing EARS requirements into the host file at `--file`, following the
profile's locator for where requirements belong.

The CLI only returns rules describing this flow. It never reads, parses, or
transforms `<source>` content semantically and never calls an LLM. Reading and
understanding `<source>` is the agent's job; `earsyntax` just points at it.

When `--from` is present, the response adds and changes:

- `sourceFile: string` is set to the `<source>` path (optional field, absent
  otherwise).
- `sourcePolicy: "read-only"` is set, stating the agent must not modify
  `<source>`.
- `rules` gains entries directing the agent to read requirement content from
  `sourceFile`, write EARS into `--file` per the locator, and leave `sourceFile`
  unchanged.
- `editPolicy.editableFile` remains `--file`; `sourceFile` is explicitly not
  editable.

### `explain <diagnostic-id>`

Full write-up of one diagnostic. Resolves current ids and deprecated aliases.
No profile needed; exit `0` on a known id, `2` on an unknown one.

```json
{
  "version": "0.0.0",
  "command": "explain",
  "ok": true,
  "id": "EARS-E006",
  "requestedId": "ears.invalid_if_then_form",
  "alias": true,
  "deprecationNote": "ears.invalid_if_then_form is a deprecated alias for EARS-E006.",
  "severity": "error",
  "title": "Malformed If/then unwanted-behaviour form",
  "meaning": "An If clause is missing its required then boundary.",
  "rationale": "Canonical EARS requires 'If <condition>, then the <system> shall <response>.'",
  "badExample": "If the signature is invalid, the system shall reject the webhook.",
  "goodExample": "If the signature is invalid, then the system shall reject the webhook.",
  "profileNotes": "Errors under strict, ears-x, speckit, openspec. Under kiro, ...",
  "next": []
}
```

`requestedId` echoes what the user typed. `alias` is `true` and
`deprecationNote` is present only when the requested id was a deprecated alias;
`id` always holds the resolved current id. `severity` is the registry default
severity for the id.

### `profiles`

List the built-in profiles, rendered from profile data so descriptions cannot
drift. Exit `0`.

```json
{
  "version": "0.0.0",
  "command": "profiles",
  "ok": true,
  "profiles": [
    {
      "name": "kiro",
      "locates": "Acceptance-criteria list items in Kiro requirements.md.",
      "relaxes": ["keyword case", "leading comma", "literal THE SYSTEM", "user-story wrappers"],
      "adds": [],
      "severityOverrides": { "EARS-W011": "off" }
    }
  ],
  "next": []
}
```

`ProfileSummary`: `{ name, locates, relaxes, adds, severityOverrides }`, one per
built-in profile, in the order `strict`, `ears-x`, `kiro`, `speckit`,
`openspec`.

### `doctor`

Detect host frameworks and agent integrations in the repo at `--cwd`, and
recommend exact commands. Works with no workspace. Exit `0`.

```json
{
  "version": "0.0.0",
  "command": "doctor",
  "ok": true,
  "root": "/repo",
  "detected": {
    "hosts": [
      { "host": "kiro", "evidence": ".kiro/specs/", "profile": "kiro" }
    ],
    "agents": [
      { "agent": "claude", "evidence": ".claude/" }
    ]
  },
  "next": [
    {
      "command": "earsyntax validate \".kiro/specs/**/requirements.md\" --profile kiro",
      "reason": "Validate Kiro requirements with the Kiro profile.",
      "forAgent": true
    },
    {
      "command": "earsyntax init --agent claude --host kiro",
      "reason": "Render Kiro and Claude integration files.",
      "forAgent": true
    }
  ]
}
```

Detection markers include `.kiro/specs/`, `.kiro/steering/`, `.kiro/hooks/`,
`specs/**/spec.md`, `.specify/`, `openspec/`, `.claude/`, `AGENTS.md`,
`.cursor/`, `.github/prompts/`, `GEMINI.md`. Recommendations are runnable
`earsyntax` commands in `next`.

### `init --agent <agents> --host <hosts>`

Render managed agent-wrapper and host-integration files. Idempotent: running the
same command twice produces no diff. It does not create `.earsyntax/`, work
items, or edit requirement/spec documents, does not validate as a side effect,
and does not call an LLM.

The `--json` output is exactly (verbatim from the plan, lines 741-760):

```json
{
  "version": "0.0.0",
  "command": "init",
  "ok": true,
  "root": "/repo",
  "agents": ["claude"],
  "hosts": ["kiro"],
  "written": [".claude/commands/earsyntax-repair.md"],
  "updated": [],
  "skipped": [],
  "warnings": [],
  "next": [
    {
      "command": "earsyntax validate \".kiro/specs/**/requirements.md\" --profile kiro",
      "reason": "Validate Kiro requirements with the Kiro profile."
    }
  ]
}
```

`--agent` accepts a comma list of `claude`, `codex`, `cursor`, `copilot`,
`gemini`, `generic`. `--host` accepts a comma list of `kiro`, `speckit`,
`openspec`. `--tools` is a deprecated alias for `--agent`: it works, emits a
warning into `warnings`, and does not appear in help. `written` lists newly
created files, `updated` files whose managed section changed, `skipped` files
already up to date (this is how a second run reports a no-op), `warnings`
non-fatal notices.

### `version --features`

Report the installed version and capability map. Never resolves a repo, so
`root` is absent. Exit `0`.

```json
{
  "version": "0.0.0",
  "command": "version",
  "ok": true,
  "features": {
    "facade": 1,
    "commands": ["validate", "extract", "instructions", "explain", "profiles", "doctor", "init", "version"],
    "profiles": ["strict", "ears-x", "kiro", "speckit", "openspec"],
    "instructions": ["author", "convert", "repair", "review"],
    "hosts": ["kiro", "speckit", "openspec"],
    "agents": ["claude", "codex", "cursor", "copilot", "gemini", "generic"],
    "inputFormats": ["ears", "text", "markdown", "yaml", "json"],
    "outputFormats": ["pretty", "json", "sarif"],
    "sarif": true
  },
  "next": []
}
```

`features.workItems` is gone. `features.sarif` is now `true`, and `profiles`,
`hosts`, `agents`, and `commands` are reported so agents can discover the closed
surface without guessing.

## Diagnostic id migration table

Every one of the 29 codes in `packages/core/src/types.ts` `DiagnosticCode`
(lines 191-228) is assigned a stable `EARS-E###` or `EARS-W###` id. Errors get
`E001+`, warnings get `W001+`, assigned alphabetically by old code within each
severity, using the current strict-mode severity from `docs/diagnostics.md`
(structural `ears.*`, the three structural `expr.*`, and the two
`catalog.system_*` are errors; the other 16 codes are warnings).

Old ids remain resolvable forever as deprecated aliases in `explain`. The
mapping is append-only: never renumber, never reuse a retired number, never
delete an id. A new diagnostic takes the next free number in its severity band.

### Errors: 13 codes (`EARS-E001`-`EARS-E013`)

| New id | Old code |
|---|---|
| `EARS-E001` | `catalog.system_ambiguous` |
| `EARS-E002` | `catalog.system_unresolved` |
| `EARS-E003` | `ears.empty_clause` |
| `EARS-E004` | `ears.empty_response` |
| `EARS-E005` | `ears.invalid_clause_order` |
| `EARS-E006` | `ears.invalid_if_then_form` |
| `EARS-E007` | `ears.missing_shall` |
| `EARS-E008` | `ears.missing_system` |
| `EARS-E009` | `ears.multiple_shall` |
| `EARS-E010` | `ears.no_match` |
| `EARS-E011` | `expr.empty_subexpression` |
| `EARS-E012` | `expr.invalid_operator_sequence` |
| `EARS-E013` | `expr.unbalanced_parentheses` |

### Introduced by the host-native grammar: 3 error codes (`EARS-E014`-`EARS-E016`)

These are not part of the original 29-code migration. The host-native grammar
work added them; each has no legacy code it replaces, but its dotted form
registers as a deprecated alias like every other code. All three default to
`error` and resolve as errors in strict mode.

| New id | Dotted code | Introduced by |
|---|---|---|
| `EARS-E014` | `ears.keyword_case` | host-native grammar |
| `EARS-E015` | `ears.missing_leading_comma` | host-native grammar |
| `EARS-E016` | `ears.prohibition_not_allowed` | host-native grammar |

The `kiro` profile relaxes keyword case (`EARS-E014`) and the leading comma
(`EARS-E015`) through its dialect; the `ears-x` profile legalizes prohibition
(`EARS-E016`) through `allowProhibition`.

### Warnings: 16 codes (`EARS-W001`-`EARS-W016`)

| New id | Old code |
|---|---|
| `EARS-W001` | `catalog.event_ambiguous` |
| `EARS-W002` | `catalog.event_unresolved` |
| `EARS-W003` | `catalog.feature_ambiguous` |
| `EARS-W004` | `catalog.feature_unresolved` |
| `EARS-W005` | `catalog.state_ambiguous` |
| `EARS-W006` | `catalog.state_unresolved` |
| `EARS-W007` | `catalog.term_unreferenced` |
| `EARS-W008` | `expr.ambiguous_term` |
| `EARS-W009` | `expr.mixed_unresolved_terms` |
| `EARS-W010` | `expr.operator_precedence_warning` |
| `EARS-W011` | `expr.unknown_term` |
| `EARS-W012` | `lint.alias_used` |
| `EARS-W013` | `lint.multiple_responses` |
| `EARS-W014` | `lint.suspicious_text_shape` |
| `EARS-W015` | `lint.unparsed_tail` |
| `EARS-W016` | `lint.vague_response` |

13 errors + 16 warnings = 29 ids in the original migration, one per old code, no
gaps. The host-native grammar work then appended `EARS-E014`-`EARS-E016` (see
above), bringing the registry to 32 ids.

Notes:

- The `E`/`W` band is the DEFAULT severity. A profile `severity` override or
  `--strict` can change the effective severity a given diagnostic carries in a
  Findings result without changing its id (see `docs/contracts/findings.md`).
- The old `guided` mode (which downgraded strict errors to warnings) is gone;
  its behavior is now expressed as profile severity overrides, not a global
  mode flag. The migration band still reflects strict-mode severity.
- Aliases resolve in `explain` only. A profile's `severity` map keys on current
  `EARS-*` ids, not aliases.

## Removed commands and banned verbs

Removed from the product surface entirely (not kept, not hidden, not a second
ring): `new`, `list`, `status`, `show`, `accept`, `check`. They do not appear in
help, README, docs, or `next` actions. The `.earsyntax/` workspace and every
concept tied to it (work items, manifests, acceptance records, staleness
hashing) is removed; see `docs/refactor/inventory.md` for the full list.

No lifecycle or orchestration verb may ever be added. Permanently banned:
`plan`, `tasks`, `design`, `implement`, and any other specification-lifecycle
verb. Existing SDD tools own the lifecycle; `earsyntax` owns deterministic EARS
work inside their documents. Narrowness is the product position, not a
temporary limitation.
