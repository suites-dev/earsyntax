# Facade API reference

This is the normative reference for the `earsyntax` facade JSON contracts. Every command that supports `--json` returns a stable, camelCase object. Humans, scripts, and coding agents read these shapes; the CLI agent implements against them.

Golden examples live in `fixtures/facade/`. Where this document and a fixture disagree, the fixture is the value pinned for tests and this document is the description of intent; report the mismatch rather than guessing.

Related documents:

- `docs/agentic-loop.md` describes the loop and the work-item state machine.
- `docs/agent-rules.md` is the instruction body the `instructions` command returns.
- `docs/diagnostics.md` is the 29-code diagnostic registry validation emits.

## Conventions

- JSON keys are camelCase.
- Paths are relative to the resolved project root unless the caller supplied an absolute path. The root is the directory containing `.earsyntax/`, discovered by walking up from `--cwd` (default: process working directory).
- Timestamps are ISO 8601 in UTC with millisecond precision (for example `2026-07-28T10:00:00.000Z`).
- Source and output hashes are `sha256:` followed by 64 lowercase hex characters.
- Every `--json` response includes the base fields below, even on failure.

## Base response

Every `--json` command returns this shape.

```ts
interface FacadeResponse<T = unknown> {
  version: string;
  command: string;
  ok: boolean;
  root?: string;
  data?: T;
  diagnostics?: FacadeDiagnostic[];
  next: NextAction[];
}

interface NextAction {
  command: string;
  reason: string;
  blocking?: boolean;
  forAgent?: boolean;
}

interface FacadeDiagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  path?: string;
  line?: number;
}
```

Field descriptions:

| Field         | Description                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `version`     | The installed `@earsyntax/cli` package version, for example `0.1.0`.                                                                  |
| `command`     | The command that produced the response. Subcommands use a space, for example `instructions convert`.                                  |
| `ok`          | `true` when the command completed with no error-severity diagnostic. See each command for what counts as an error.                    |
| `root`        | The resolved project root as an absolute path. Present on commands that resolve a project.                                            |
| `data`        | Reserved generic payload. In v0.1 commands expose their payload through top-level convenience keys instead (see the note below).      |
| `diagnostics` | Facade-level diagnostics (config, path, or work-item problems). Distinct from the core linting `Diagnostic` inside a validate result. |
| `next`        | Ordered next actions. Always present; may be empty.                                                                                   |

`NextAction`:

| Field      | Description                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| `command`  | A runnable `earsyntax` command. Every value is a real command from this contract.                     |
| `reason`   | One factual sentence explaining why this action follows.                                              |
| `blocking` | `true` when the action requires a human decision (for example acceptance). Optional; default `false`. |
| `forAgent` | `true` when a coding agent can run the action without human input. Optional; default `false`.         |

[DECIDED] Convenience keys over `data`. The orchestration brief shows command payloads as top-level keys (`work`, `written`, `summary`, `results`) rather than nested under `data`. v0.1 follows the examples: each command adds its own top-level keys and leaves `data` unset. Rationale: it matches every example in the brief and keeps the JSON one level flatter for agents.

`FacadeDiagnostic.severity` may be `info`; the core linting registry emits only `error` and `warning` in v1, but facade-level notices (for example a missing optional tool file from `doctor`) may be `info`.

## Exit codes

Exit codes are uniform across commands.

| Code | Meaning                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------ |
| `0`  | The command completed and produced no error-severity diagnostic.                                             |
| `1`  | Validation completed and at least one error-severity diagnostic exists. Only `validate` returns `1`.         |
| `2`  | CLI usage, config, missing file, unparseable JSON/YAML, or work-item resolution error.                       |
| `3`  | Refused write, stale source, overwrite protection, or a human confirmation required in non-interactive mode. |

Per-command notes:

| Command        | `0`                          | `1`                     | `2`                                             | `3`                                                   |
| -------------- | ---------------------------- | ----------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| `init`         | Initialized or already valid | not used                | bad `--tools` value, unwritable root            | `.earsyntax/` exists and `--force` not passed         |
| `doctor`       | all checks pass or warn      | not used                | config unreadable                               | not used                                              |
| `version`      | always                       | not used                | not used                                        | not used                                              |
| `new`          | work item created            | not used                | bad slug, missing `--source` file, missing mode | work item exists and `--force` not passed             |
| `list`         | always                       | not used                | config unreadable                               | not used                                              |
| `status`       | work item resolved           | not used                | unknown work item                               | not used                                              |
| `instructions` | instructions returned        | not used                | unknown work item, unknown mode                 | not used                                              |
| `validate`     | no error diagnostics         | one or more error diags | missing file, bad glob, unreadable catalog      | source stale relative to a work item (see `validate`) |
| `accept`       | acceptance recorded          | not used                | unknown work item                               | status not `valid`, or source stale                   |
| `show`         | artifact resolved            | not used                | unknown work item, unknown artifact             | not used                                              |

[DECIDED] Only `validate` returns exit `1`. Exit `1` means "error diagnostics exist", which is a linting outcome. Other commands surface problems as exit `2` (resolution) or `3` (refusal), never `1`. Rationale: keeps `1` a reliable signal that requirements failed validation, which is what scripts branch on.

[DECIDED] `validate` on stale work. When `validate` runs with `--source` against a work item whose source hash no longer matches the manifest, validation of the `.ears` file still runs and reports linting results, and the response sets `stale: true`. The exit code stays driven by diagnostics (`0` or `1`); staleness alone does not force exit `3` on `validate`. Rationale: staleness is a warning about drift, not a parse failure; `accept` is the gate that refuses stale work with exit `3`.

## `init`

Initialize `.earsyntax/` and optional agent wrapper files.

Top-level keys beyond the base:

| Key       | Type       | Description                                                       |
| --------- | ---------- | ----------------------------------------------------------------- |
| `written` | `string[]` | Every path written, relative to root. Empty when nothing changed. |
| `tools`   | `string[]` | Tool wrappers written, for example `["claude", "codex"]`.         |

```json
{
  "version": "0.1.0",
  "command": "init",
  "ok": true,
  "root": "/repo",
  "written": [".earsyntax/config.json", ".earsyntax/work/.gitkeep"],
  "tools": ["claude", "codex"],
  "next": [
    {
      "command": "earsyntax new checkout-webhooks --source specs/checkout.md --json",
      "reason": "Create a work item for a source spec.",
      "forAgent": true
    }
  ]
}
```

`init` refuses to overwrite an existing `.earsyntax/` without `--force` and returns exit `3` in that case.

## `doctor`

Read-only project health report. Never writes.

Top-level keys beyond the base:

| Key      | Type            | Description                                                          |
| -------- | --------------- | -------------------------------------------------------------------- |
| `checks` | `DoctorCheck[]` | One entry per health check, each with `name`, `ok`, and a `message`. |

[DECIDED] `checks` shape. The brief lists the checks doctor performs but not a JSON field. v0.1 returns `checks: { name: string; ok: boolean; severity: 'error'|'warning'|'info'; message: string }[]`, and mirrors any non-passing check into the base `diagnostics` array. Rationale: agents can read one array (`diagnostics`) for problems while humans get the full ordered checklist in `checks`.

Checks performed: `.earsyntax/config.json` exists and parses; the configured work directory exists; the package version supports the requested facade features; referenced sources still exist; accepted work items are not stale; configured tool wrapper files are present. A failed check is a `FacadeDiagnostic`; `ok` is `true` only when no check produced an `error`.

## `version`

Expose installed capabilities. Never resolves a project, so `root` may be absent.

Top-level keys beyond the base:

| Key        | Type     | Description                                              |
| ---------- | -------- | -------------------------------------------------------- |
| `features` | `object` | Capability map for agents to branch on without guessing. |

```json
{
  "version": "0.1.0",
  "command": "version",
  "ok": true,
  "features": {
    "facade": 1,
    "workItems": true,
    "instructions": ["author", "convert", "repair", "review"],
    "inputFormats": [".ears", "markdown", "yaml", "json"],
    "outputFormats": ["pretty", "json"],
    "sarif": false
  },
  "next": []
}
```

`features.facade` is an integer facade contract version. It increments only on a breaking change to these shapes.

## `new`

Create a work item. Does not generate EARS content; it prepares the directory the agent writes into.

Top-level keys beyond the base:

| Key       | Type          | Description                           |
| --------- | ------------- | ------------------------------------- |
| `work`    | `WorkSummary` | The created work item summary.        |
| `written` | `string[]`    | Every path written, relative to root. |

```json
{
  "version": "0.1.0",
  "command": "new",
  "ok": true,
  "root": "/repo",
  "work": {
    "id": "checkout-webhooks",
    "mode": "convert",
    "status": "scaffolded",
    "source": "specs/checkout.md",
    "sourceHash": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    "output": ".earsyntax/work/checkout-webhooks/requirements.ears"
  },
  "written": [
    ".earsyntax/work/checkout-webhooks/manifest.json",
    ".earsyntax/work/checkout-webhooks/requirements.ears",
    ".earsyntax/work/checkout-webhooks/questions.md",
    ".earsyntax/work/checkout-webhooks/traceability.json"
  ],
  "next": [
    {
      "command": "earsyntax instructions convert --work checkout-webhooks --json",
      "reason": "Give the coding agent rules for writing the .ears file.",
      "forAgent": true
    }
  ]
}
```

Mode selection: `--mode convert` requires `--source <path>`; `--mode author` requires `--prompt <text>`. The default output path is `.earsyntax/work/<slug>/requirements.ears`, overridable with `--out`. The source file is not copied unless `--snapshot-source` is passed, in which case the copy path is recorded in the manifest `source.snapshotPath`. `new` refuses to clobber an existing work item without `--force` and returns exit `3`.

## Work manifest

`new` creates this file; later commands update it. It is the durable state of a work item and lives at `.earsyntax/work/<slug>/manifest.json`.

```ts
type WorkMode = 'author' | 'convert';

type WorkStatus = 'missing' | 'scaffolded' | 'drafted' | 'invalid' | 'valid' | 'accepted' | 'stale';

interface WorkManifest {
  schemaVersion: 1;
  id: string;
  mode: WorkMode;
  status: WorkStatus;
  source?: {
    path?: string;
    hash?: string;
    kind: 'markdown' | 'yaml' | 'json' | 'text' | 'prompt';
    snapshotPath?: string;
  };
  prompt?: string;
  output: {
    path: string;
    hash?: string;
  };
  artifacts: {
    questions: string;
    traceability: string;
    validationJson: string;
    validationMarkdown: string;
  };
  createdAt: string;
  updatedAt: string;
  accepted?: {
    at: string;
    by?: string;
    sourceHash?: string;
    outputHash: string;
  };
}
```

Notes on state:

- `status` is the state machine value. Its transitions are specified in `docs/agentic-loop.md`.
- `source.hash` is the hash of the source content at the last command that read it. `stale` is detected by comparing the current source hash to the hash recorded at the last `valid` or `accepted` transition.
- `output.hash` is the hash of the `.ears` content at the last validation. It lets `accept` detect a `.ears` file edited after validation.
- `missing` never appears in a stored manifest; it is the reported status when a queried work item has no manifest.

## `list`

List work items. Supports `--status <state>` to filter.

Top-level keys beyond the base:

| Key     | Type            | Description                 |
| ------- | --------------- | --------------------------- |
| `items` | `WorkSummary[]` | Work items, sorted by `id`. |

## `status`

Report one work item's state and next steps.

Top-level keys beyond the base:

| Key    | Type     | Description                    |
| ------ | -------- | ------------------------------ |
| `work` | `object` | Work item state (shape below). |

```json
{
  "version": "0.1.0",
  "command": "status",
  "ok": true,
  "root": "/repo",
  "work": {
    "id": "checkout-webhooks",
    "status": "valid",
    "mode": "convert",
    "source": "specs/checkout.md",
    "output": ".earsyntax/work/checkout-webhooks/requirements.ears",
    "sourceHash": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    "outputHash": "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    "acceptedHash": null,
    "stale": false
  },
  "next": [
    {
      "command": "earsyntax instructions review --work checkout-webhooks --json",
      "reason": "Prepare the human review summary.",
      "forAgent": true
    },
    {
      "command": "earsyntax accept checkout-webhooks",
      "reason": "Record acceptance after human approval.",
      "blocking": true
    }
  ]
}
```

`acceptedHash` is the `accepted.outputHash` from the manifest, or `null` when the item was never accepted. `stale` is the computed staleness flag. `next` reflects the current state: a `scaffolded` item points at `instructions`, an `invalid` item points at `validate` then `instructions repair`, a `valid` item points at review and accept, a `stale` item points at re-running `instructions convert`.

## `instructions`

Return the rules a coding agent follows for one step. Read-only. The four modes are `author`, `convert`, `repair`, and `review`.

```ts
interface InstructionResponse {
  work: WorkSummary;
  mode: 'author' | 'convert' | 'repair' | 'review';
  rules: string[];
  format: {
    line: string;
    allowedPatterns: string[];
    metadataPrefixes: string[];
  };
  source?: {
    path?: string;
    hash?: string;
    excerpts?: SourceExcerpt[];
  };
  diagnostics?: FacadeDiagnostic[];
  next: NextAction[];
}

interface WorkSummary {
  id: string;
  status: WorkStatus;
  source?: string;
  output: string;
  questions: string;
  traceability: string;
}

interface SourceExcerpt {
  path: string;
  startLine: number;
  endLine: number;
  text: string;
}
```

The response carries `InstructionResponse` fields as top-level keys alongside the base fields, so the object shape is `{ version, command, ok, root, mode, work, rules, format, source?, diagnostics?, next }`.

Per-mode content:

| Mode      | `source` present            | `diagnostics` present        | `rules` focus                                                   |
| --------- | --------------------------- | ---------------------------- | --------------------------------------------------------------- |
| `author`  | no (prompt-based work item) | no                           | Author from the prompt only; do not invent behavior.            |
| `convert` | yes (path, hash, excerpts)  | no                           | Convert the source; preserve traceability; split compounds.     |
| `repair`  | yes when the item has one   | yes (the diagnostics to fix) | Change only what the diagnostics justify; keyed to codes.       |
| `review`  | yes when the item has one   | no                           | Produce a human review summary; recommend accept only if clean. |

The full rule text is specified in `docs/agent-rules.md`. The `command` field is `instructions <mode>` (for example `instructions convert`). Fixtures: `fixtures/facade/instructions-*.json`.

## `validate`

Validate `.ears` files deterministically. Never writes, never asks questions. This is the only command that returns exit `1`.

```ts
interface ValidationResponse {
  summary: {
    files: number;
    requirements: number;
    valid: number;
    errors: number;
    warnings: number;
  };
  results: ValidationResult[];
  work?: WorkSummary;
  stale?: boolean;
  next: NextAction[];
}

interface ValidationResult {
  id?: string;
  file: string;
  line?: number;
  valid: boolean;
  pattern?: Pattern;
  ast?: EarsAst;
  references: ReferenceMatch[];
  diagnostics: Diagnostic[];
}
```

The response carries these as top-level keys alongside the base fields. `ok` is `false` when `summary.errors > 0`, and the exit code is `1` in that case. `work` and `stale` are present only when validation ran against a work item (via `--work` or a path inside `.earsyntax/work/`). The `diagnostics` inside each `ValidationResult` are core linting `Diagnostic` objects (see `docs/diagnostics.md`), not `FacadeDiagnostic` objects. Fixture: `fixtures/facade/validate.response.json`.

## `accept`

Record that a human accepted the generated `.ears` file. This is the human gate.

Top-level keys beyond the base:

| Key    | Type     | Description                                |
| ------ | -------- | ------------------------------------------ |
| `work` | `object` | Updated work summary including `accepted`. |

Rules, each a refusal with exit `3` when violated:

- Refuse if the current status is not `valid`.
- Refuse if the source hash is stale relative to the recorded valid hash.
- Refuse if the `.ears` output hash changed since the last validation (the file was edited after it was validated).

On success it writes the `accepted` block to `manifest.json` and sets status to `accepted`. It never modifies the source spec or the `.ears` content. `--by <name>` records who accepted.

[DECIDED] `accept` is `Partly` agent-compatible, per the command summary. It has a `--json` shape and can be scripted, but the brief classifies acceptance as a human decision, so `next` actions that lead to `accept` carry `blocking: true` and never `forAgent: true`.

## `show`

Resolve artifact paths or print artifact content. Read-only.

Selectors: `--artifact requirements | questions | traceability | validation | manifest`. Without `--artifact`, `show` returns resolved paths for every artifact.

Top-level keys beyond the base:

| Key        | Type     | Description                                                          |
| ---------- | -------- | -------------------------------------------------------------------- |
| `work`     | `object` | Work summary with resolved artifact paths.                           |
| `artifact` | `object` | Present when `--artifact` selects one: `{ path, exists, content? }`. |

[DECIDED] `show` content inclusion. With `--json` and a single `--artifact`, the response includes the artifact `content` as a string when the file exists and is UTF-8 text; binary or missing files set `content` to `null` and `exists` accordingly. Rationale: agents reading `questions` or `validation` in a loop should not need a second file read.

## `export`

Planned, not implemented in v0.1. Documented in the orchestration brief for forward reference only. It does not appear in `version.features` until shipped.

## Stability guarantees

- The base fields (`version`, `command`, `ok`, `next`) are present on every `--json` response and do not change shape within a facade contract version.
- `features.facade` is the contract version. Field removals or renames increment it.
- New optional keys may be added within a contract version; consumers must ignore unknown keys.
- `next[].command` values are always runnable `earsyntax` commands from this contract.
- Diagnostic codes inside validation results come from the frozen 29-code registry and are append-only.
