# CLI reference

`earsyntax` is the command-line facade for humans, scripts, and coding agents. It resolves paths, scaffolds work items, returns agent instructions, validates `.ears` files, reports status, and records human acceptance. It never derives requirements from prose; that is the coding agent's job. The normative JSON contract is in `docs/facade-api.md`; this page is the usage guide with a runnable example and expected output for every command.

Install and run through the package binary:

```bash
npx @earsyntax/cli <command> [options]
```

## Global options

These work on every command where they make sense:

| Option              | Effect                                                            |
| ------------------- | ----------------------------------------------------------------- |
| `--json`            | Emit the machine-readable facade response instead of pretty text. |
| `--no-color`        | Strip ANSI color from pretty output.                              |
| `--cwd <path>`      | Resolve the project from this directory instead of the process working directory. |
| `--config <path>`   | Use an explicit config file instead of `.earsyntax/config.json`.  |
| `--no-interactive`  | Never prompt; a step that would require confirmation is refused with exit 3. |

Every `--json` response shares a base shape: `{ version, command, ok, root?, next: [] }` plus command-specific keys. Paths are relative to the resolved project root (the directory containing `.earsyntax/`) unless you passed an absolute path.

## Exit codes

| Code | Meaning                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------- |
| `0`  | Completed with no error-severity diagnostic.                                                        |
| `1`  | Validation completed with at least one error diagnostic. Only `validate` returns `1`.               |
| `2`  | Usage, config, missing file, unparseable input, or work-item resolution error.                     |
| `3`  | Refused write, stale source, overwrite protection, or confirmation required in non-interactive mode. |

## `init`

Create `.earsyntax/` and, optionally, thin agent wrapper files. Refuses to overwrite an existing workspace without `--force` (exit 3).

```bash
earsyntax init
earsyntax init --tools claude,codex,cursor
earsyntax init --tools none --json
earsyntax init --force
```

Expected output (pretty):

```text
Initialized earsyntax in .earsyntax
  wrote .earsyntax/config.json
  wrote .earsyntax/work/.gitkeep
  tools: none
```

`--tools claude` writes `.claude/commands/earsyntax-{author,convert,repair}.md`; `codex` adds a marked section to `AGENTS.md`; `cursor` writes `.cursor/rules/earsyntax.mdc`. Each wrapper only points back at `earsyntax instructions` and `earsyntax validate`, so the rules live in one place.

## `doctor`

Read-only project health report. Never writes.

```bash
earsyntax doctor
earsyntax doctor --json
```

Expected output (pretty):

```text
  [ok] config: .earsyntax/config.json exists and parses.
  [ok] workDir: Work directory .earsyntax/work exists.
  [ok] version: earsyntax 0.1.0 supports facade contract 1.
```

With `--json`, each check is an entry in `checks`, and any non-passing check is mirrored into the base `diagnostics` array. `ok` is `true` unless a check produced an error.

## `version`

Report the installed version and, with `--features`, the capability map agents branch on.

```bash
earsyntax version
earsyntax version --features --json
```

Expected output (`--features --json`):

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

## `new`

Scaffold a work item. This prepares the directory an agent writes into; it never generates EARS content. Convert mode requires `--source <path>`, author mode requires `--prompt <text>`.

```bash
earsyntax new checkout-webhooks --source specs/checkout.md --mode convert --json
earsyntax new checkout-webhooks --prompt "Checkout webhooks validate signatures." --mode author --json
```

Expected output (convert, `--json`, hashes vary):

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
    "sourceHash": "sha256:...",
    "output": ".earsyntax/work/checkout-webhooks/requirements.ears"
  },
  "written": [
    ".earsyntax/work/checkout-webhooks/requirements.ears",
    ".earsyntax/work/checkout-webhooks/questions.md",
    ".earsyntax/work/checkout-webhooks/traceability.json",
    ".earsyntax/work/checkout-webhooks/manifest.json"
  ],
  "next": [
    {
      "command": "earsyntax instructions convert --work checkout-webhooks --json",
      "reason": "Give the coding agent the rules for writing the .ears file.",
      "forAgent": true
    }
  ]
}
```

Pass `--out <path>` to reserve a different output path, `--snapshot-source` to copy the source into the work directory, and `--force` to recreate an existing item (otherwise it refuses with exit 3).

## `list`

List work items, sorted by id. Filter with `--status <state>`.

```bash
earsyntax list
earsyntax list --status stale --json
```

Expected output (pretty):

```text
checkout-webhooks  valid
```

## `status`

Report one work item's computed state and next steps. With no slug it resolves the single work item when there is exactly one.

```bash
earsyntax status checkout-webhooks --json
```

Expected output (`--json`, hashes vary):

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
    "sourceHash": "sha256:...",
    "outputHash": "sha256:...",
    "acceptedHash": null,
    "stale": false
  },
  "next": [
    { "command": "earsyntax instructions review --work checkout-webhooks --json", "reason": "Prepare the human review summary.", "forAgent": true },
    { "command": "earsyntax accept checkout-webhooks", "reason": "Record acceptance after human approval.", "blocking": true }
  ]
}
```

`status` reports `stale` when the source changed after the last `valid` or `accepted` state, even though the stored status is still `valid` or `accepted`.

## `instructions`

Return the rules a coding agent follows for one loop step. Read-only. The modes are `author`, `convert`, `repair`, and `review`.

```bash
earsyntax instructions convert --work checkout-webhooks --json
earsyntax instructions repair --work checkout-webhooks --json
```

Expected output (convert, `--json`, abridged):

```json
{
  "version": "0.1.0",
  "command": "instructions convert",
  "ok": true,
  "root": "/repo",
  "mode": "convert",
  "work": { "id": "checkout-webhooks", "status": "scaffolded", "source": "specs/checkout.md", "output": "...", "questions": "...", "traceability": "..." },
  "rules": ["Read the full source before writing requirements.", "..."],
  "format": {
    "line": "REQ-001 [source: specs/checkout.md:7]: When a payment webhook is received, the billing service shall verify the HMAC signature.",
    "allowedPatterns": ["The <system> shall <response>.", "..."],
    "metadataPrefixes": ["REQ-001:", "REQ-001 [source: path:line]:", "REQ-001 [source: path:line-line]:"]
  },
  "source": { "path": "specs/checkout.md", "hash": "sha256:...", "excerpts": [{ "path": "specs/checkout.md", "startLine": 3, "endLine": 3, "text": "..." }] },
  "next": [
    { "command": "earsyntax validate .earsyntax/work/checkout-webhooks/requirements.ears --source specs/checkout.md --json", "reason": "Validate the generated .ears file once it is written.", "forAgent": true }
  ]
}
```

`author` mode omits the `source` block. `repair` mode adds a `diagnostics` array (read from the work item's last `validation.json`) listing what to fix. `review` mode returns review-summary rules and points `next` at reading questions and recording acceptance.

## `validate`

Validate `.ears` files deterministically. Reads `.ears`, Markdown, YAML, and JSON through `@earsyntax/extract`. Never writes source, never asks questions. This is the only command that returns exit `1`.

```bash
earsyntax validate .earsyntax/work/checkout-webhooks/requirements.ears --work checkout-webhooks --json
earsyntax validate "specs/**/*.ears" --catalog catalog.json --format json
earsyntax validate requirements.ears --mode guided --comma-as-and
```

Expected output (pretty, one file with one error):

```text
requirements.ears:2 error ears.invalid_if_then_form  If requirements must include a then boundary before the system response.

7/8 valid, 1 errors, 0 warnings
```

`--json` returns `{ summary, results, work?, stale?, next }`. `ok` is `false` and the exit code is `1` when `summary.errors > 0`. When the target is a work item (via `--work` or a path inside `.earsyntax/work/`), `validate` updates the manifest status to `valid` or `invalid`, writes `validation.json` and `validation.md`, and reports `stale` if the source drifted. A validated path under `.earsyntax/work/<slug>/` is treated as that work item automatically, so `--work` is optional when you validate a work item's own output path. Duplicate requirement IDs are reported as an error diagnostic in the base `diagnostics` array.

Options: `--source <path>` records the source for staleness, `--catalog <path>` supplies a term catalog, `--mode strict|guided`, and `--comma-as-and` treats unambiguous commas inside clause bodies as `and`.

## `accept`

Record that a human accepted the generated `.ears` file. The human gate.

```bash
earsyntax accept checkout-webhooks --by "omer" --json
```

Expected output (pretty):

```text
Accepted "checkout-webhooks" by omer.
```

`accept` refuses with exit `3` when the status is not `valid`, when the source is stale, or when the `.ears` file changed since it was validated. On success it writes an `accepted` block (`at`, `by`, `sourceHash`, `outputHash`) to the manifest and sets the status to `accepted`. It never edits the source or the `.ears` content.

## `show`

Resolve artifact paths or print artifact content. Read-only.

```bash
earsyntax show checkout-webhooks --json
earsyntax show checkout-webhooks --artifact questions --json
```

Without `--artifact`, the response lists resolved paths for every artifact. With `--artifact requirements|questions|traceability|validation|manifest`, it returns `{ path, exists, content }`, where `content` is the file text when it exists and `null` otherwise, so an agent needs no second read.

## The loop

The commands compose into one loop that keeps the CLI, the coding agent, and the human separate. See `docs/agentic-loop.md` for the state machine.

```bash
earsyntax new checkout-webhooks --source specs/checkout.md --mode convert --json
earsyntax instructions convert --work checkout-webhooks --json
# the agent writes .earsyntax/work/checkout-webhooks/requirements.ears
earsyntax validate .earsyntax/work/checkout-webhooks/requirements.ears --source specs/checkout.md --work checkout-webhooks --json
# if invalid:
earsyntax instructions repair --work checkout-webhooks --json
# repair and re-validate until clean, then:
earsyntax status checkout-webhooks --json
earsyntax instructions review --work checkout-webhooks --json
earsyntax accept checkout-webhooks --by "omer"
```