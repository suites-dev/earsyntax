# Current CLI inventory

This is a frozen snapshot of the `earsyntax` CLI as it exists on branch
`feat/earsyntax-toolkit` before the host-native refactor. Later agents cite
line numbers here instead of re-reading the source. It records every command,
flag, output shape, and workspace file, with call sites.

It is a description of what exists now, not a target. The target surface is
`docs/refactor/host-native-facade.md`. The final section lists what the
host-native refactor removes.

## Package layout

| Package | Role |
|---|---|
| `@earsyntax/core` | Parser, linter, diagnostics, catalog matching. Pure, no I/O, no LLM. (`packages/core/src/`) |
| `@earsyntax/extract` | Turns `.ears`, Markdown, YAML, JSON files into `RequirementInput`. Only `extractFromFile` touches disk. (`packages/extract/src/`) |
| `@earsyntax/cli-contract` | Report projections: JSON report, SARIF, pretty, exit codes, diagnostic registry descriptions. Pure serializers, no I/O, no argv. (`packages/cli-contract/src/`) |
| `@earsyntax/cli` | Command dispatcher and the workspace-backed command handlers. (`packages/cli/src/`) |

Note: `@earsyntax/cli-contract` already contains a `JsonReport`, a `SarifLog`
builder, an exit-code helper, and a `DIAGNOSTIC_DESCRIPTIONS` registry keyed by
the 29-code `DiagnosticCode` union. The CLI does not currently consume these
projections; `validate` builds its own `ValidationResult[]` shape directly. See
the findings contract for how these converge.

## The dispatcher

`packages/cli/src/cli.ts`.

- `run(argv, options)` (`cli.ts:63`) is the entry point. It returns an exit
  code and never calls `process.exit`.
- Bare invocation or `--help` / `-h` prints usage text (`cli.ts:71-74`).
  Bare invocation returns exit `2`; `--help` returns `0`.
- `--version` / `-v` dispatches to the `version` command (`cli.ts:75-77`).
- `dispatch()` (`cli.ts:82`) parses args, resolves globals, resolves `cwd`,
  builds the emitter, and routes to a handler in the `COMMANDS` map
  (`cli.ts:37-48`).
- Unknown commands throw `cli.unknown_command` (exit `2`) (`cli.ts:96-100`).
- Caught `CliError`s are rendered as a base response and the carried exit code
  is returned; anything else becomes `cli.internal_error` (exit `2`)
  (`cli.ts:105-118`).
- `commandLabel()` (`cli.ts:51`) makes `instructions` report as
  `instructions <mode>`.
- `usageText()` (`cli.ts:121`) lists all ten commands and the global options.

`COMMANDS` map (`cli.ts:37-48`): `init`, `doctor`, `version`, `new`, `list`,
`status`, `instructions`, `validate`, `accept`, `show`. Ten commands.

## Argument parsing

`packages/cli/src/args.ts`.

- `parseArgs(argv)` (`args.ts:40`) produces `{ positionals, booleans, values }`.
  Understands `--flag`, `--flag value`, `--flag=value`, `--no-flag`, and `--`
  (everything after is positional).
- Value-taking flags are declared in `VALUE_FLAGS` (`args.ts:16-30`): `cwd`,
  `config`, `tools`, `mode`, `source`, `prompt`, `out`, `by`, `work`,
  `catalog`, `format`, `artifact`, `status`. Every other `--flag` is boolean.
- `resolveGlobals(args)` (`args.ts:106`) extracts globals: `json`
  (`--json`), `color` (`!--no-color`), `interactive` (`!--no-interactive`),
  `cwd`, `config`.

There is no `--profile`, `--strict`, `--sarif`, or `--quiet` today.

## Global options (current)

| Flag | Type | Meaning | Site |
|---|---|---|---|
| `--json` | boolean | Emit JSON instead of pretty text. | `args.ts:108` |
| `--no-color` | boolean | Disable ANSI color in pretty output. | `args.ts:109` |
| `--no-interactive` | boolean | Non-interactive mode. | `args.ts:110` |
| `--cwd <dir>` | value | Working directory to resolve from. | `args.ts:111` |
| `--config <path>` | value | Explicit config path override. | `args.ts:112` |

## Base response shape

`packages/cli/src/response.ts`, `packages/cli/src/facade-types.ts`.

`buildResponse(init, extra)` (`response.ts:27`) emits keys in this fixed order:

1. `version` (from `CLI_VERSION`, `version.ts:34`)
2. `command`
3. `ok`
4. `root` (only when defined)
5. command-specific convenience keys (spread from `extra`)
6. `diagnostics` (only when non-empty)
7. `next` (always, defaults to `[]`)

`FacadeResponse` (`facade-types.ts:36-46`), `FacadeDiagnostic`
(`facade-types.ts:19-25`), `NextAction` (`facade-types.ts:28-33`).

`FacadeDiagnostic`: `{ code, severity: 'error'|'warning'|'info', message,
path?, line? }`. This is the facade-level diagnostic (config, path, work-item
problems), distinct from the core `Diagnostic` embedded inside a validate
result. `serialize()` (`response.ts:43`) is `JSON.stringify(response, null, 2)`,
no trailing newline added by serialize; `emit()` (`response.ts:55`) appends the
newline.

## Commands

### `init`

`packages/cli/src/commands/init.ts`. Handler `initCommand` (`init.ts:61`).

- Positional: none.
- Flags: `--tools <list|none>` (`init.ts:64`), `--force` (`init.ts:63`).
- `resolveTools()` (`init.ts:23`) parses the comma list; validates against
  `KNOWN_TOOLS` = `{claude, codex, cursor}` (`tool-wrappers.ts:98`); throws
  `init.bad_tools` (exit `2`) on unknown.
- Refuses if `.earsyntax/` exists without `--force`: `init.exists` (exit `3`)
  (`init.ts:67-72`).
- Refuses to overwrite a wrapper file (except `AGENTS.md`) without `--force`:
  `init.wrapper_exists` (exit `3`) (`init.ts:81-88`).
- Writes: `.earsyntax/config.json` (`init.ts:100`), `.earsyntax/work/.gitkeep`
  (`init.ts:101`), plus tool wrapper files (`init.ts:104-113`). `AGENTS.md` is
  merged via marker section, not clobbered (`mergeAgentsFile`, `init.ts:46`).
- Output keys: `written: string[]`, `tools: string[]` (`init.ts:128`).
- `next`: single action pointing at `earsyntax new <slug> --source ... --json`
  (`init.ts:119-126`).
- Exit `0` on success.

### `doctor`

`packages/cli/src/commands/doctor.ts`. Handler `doctorCommand` (`doctor.ts:27`).

- Requires a workspace: `requireRoot()` (`doctor.ts:28`) throws
  `project.not_initialized` (exit `2`) if no `.earsyntax/`.
- Loads config: `loadConfig()` (`doctor.ts:30`); `config.unreadable` /
  `config.invalid` (exit `2`).
- Runs a fixed checklist (`doctor.ts:32-99`): `config`, `workDir`, `version`,
  per-work-item `source:<slug>` and `stale:<slug>`, per-tool
  `tool:<wrapper-path>`.
- Output keys: `checks: { name, ok, severity, message }[]`, plus non-passing
  checks mirrored into base `diagnostics` (`doctor.ts:101-114`).
- `ok` is true unless a check has severity `error` (`doctor.ts:109`).
- Always returns exit `0` (`doctor.ts:120`); `hasError` only affects `ok`.

### `version`

`packages/cli/src/commands/version.ts`. Handler `versionCommand`
(`version.ts:12`).

- Flags: `--features` (pretty output detail only; JSON always carries features).
- Never resolves a project; `root` absent.
- Output key: `features` = `FEATURES` (`version.ts:14`).
- `FEATURES` (`version.ts:50-59`): `{ facade: 1, workItems: true,
  instructions: ['author','convert','repair','review'], inputFormats:
  ['.ears','markdown','yaml','json'], outputFormats: ['pretty','json'],
  sarif: false }`.
- `CLI_VERSION` read from package.json at runtime (`version.ts:13-34`), falls
  back to `0.1.0`.
- Exit `0`.

### `new`

`packages/cli/src/commands/new.ts`. Handler `newCommand` (`new.ts:77`).

- Positional: `<slug>` (validated by `SLUG_RE`, `new.ts:20`); bad slug throws
  `new.bad_slug` (exit `2`).
- Flags: `--mode convert|author` (`new.ts:40`), `--source <path>`,
  `--prompt <text>`, `--out <path>` (`new.ts:122`), `--snapshot-source`
  (`new.ts:114`), `--force` (`new.ts:90`).
- Mode resolution (`resolveMode`, `new.ts:39`): convert requires `--source`
  (`new.missing_source`), author requires `--prompt` (`new.missing_prompt`),
  neither present throws `new.missing_mode`; bad `--mode` throws `new.bad_mode`.
  All exit `2`.
- Refuses existing work item without `--force`: `new.exists` (exit `3`)
  (`new.ts:93-98`).
- Reads and hashes the source for convert mode (`new.ts:104-120`);
  `new.source_unreadable` (exit `2`).
- Writes the work item: manifest, empty `requirements.ears`, `questions.md`,
  `traceability.json` (`new.ts:159-170`).
- Output keys: `work`, `written: string[]` (`new.ts:187`).
- `next` from `nextForStatus(slug, 'scaffolded', source)` (`new.ts:185`).
- Exit `0`.

### `list`

`packages/cli/src/commands/list.ts`. Handler `listCommand` (`list.ts:14`).

- Requires a workspace (`requireRoot`, `list.ts:15`).
- Flags: `--status <state>` filters by reported status (`list.ts:17`).
- Output key: `items: WorkSummary[]`, sorted by id (`list.ts:19-25`).
- Exit `0`.

### `status`

`packages/cli/src/commands/status.ts`. Handler `statusCommand` (`status.ts:35`).

- Requires a workspace (`requireRoot`, `status.ts:36`).
- Positional: `[<slug>]`. With no slug, resolves the single work item if there
  is exactly one; otherwise `status.no_work` or `status.ambiguous` (exit `2`)
  (`resolveSlug`, `status.ts:15-33`).
- Unknown item: `work.unknown` (exit `2`) via `requireManifest`.
- Output key: `work` with computed staleness (`status.ts:42-52`).
- `next` from `nextForStatus` (`status.ts:59`).
- Exit `0`.

### `instructions`

`packages/cli/src/commands/instructions.ts`. Handler `instructionsCommand`
(`instructions.ts:76`).

- Positional: `<mode>` = `author|convert|repair|review` (validated by
  `requireInstructionMode`, `mode.ts:13`); bad mode throws
  `instructions.unknown_mode` (exit `2`).
- Flag: `--work <id>` REQUIRED (`instructions.ts:78-81`); missing throws
  `instructions.missing_work` (exit `2`).
- Requires a workspace (`requireRoot`, `instructions.ts:83`) and a manifest.
- Convert mode adds `source` block with excerpts (`instructions.ts:92-101`);
  repair mode adds `diagnostics` read from the work item's last
  `validation.json` (`readRepairDiagnostics`, `instructions.ts:51`).
- Output keys: `mode`, `work` (WorkSummary), `rules` (from `rulesFor`,
  `rules.ts:79`), `format: { line, allowedPatterns, metadataPrefixes }`,
  optional `source`, optional `diagnostics` (`instructions.ts:105-116`).
- `next`: review mode points at `show ... --artifact questions` and
  `accept` (blocking); other modes point at `validate` (`instructions.ts:118-148`).
- Exit `0`.

Rule bodies live in `packages/cli/src/rules.ts`: `ALLOWED_PATTERNS`
(`rules.ts:13`, five templates), `METADATA_PREFIXES` (`rules.ts:22`),
`AUTHOR_RULES`, `CONVERT_RULES`, `REPAIR_RULES`, `REVIEW_RULES`
(`rules.ts:28-76`), `exampleLine()` (`rules.ts:93`).

### `validate`

`packages/cli/src/commands/validate.ts`. Handler `validateCommand`
(`validate.ts:115`).

- Positionals: `<files|globs...>`; none throws `validate.no_files` (exit `2`)
  (`validate.ts:117-119`).
- Flags: `--work <id>` (workspace recording, `validate.ts:121`), `--catalog
  <path>` (`validate.ts:129`), `--mode strict|guided` (`buildOptions`,
  `validate.ts:70`), `--comma-as-and` (`validate.ts:77`).
- With `--work`, requires a workspace (`requireRoot`); without, uses
  `findRoot(cwd) ?? cwd` so it runs outside a workspace too (`validate.ts:122`).
- `expandFiles()` (`validate.ts:31`): literal paths must exist
  (`validate.missing_file`, exit `2`); globs expand via `globSync`, sorted.
- Extraction via `extractFromFile` (`validate.ts:136`); unreadable file with
  errors throws `validate.unreadable` (exit `2`).
- Lint via `lintEarsBatch` (`validate.ts:144`).
- Facade-level duplicate-ID check emits `facade.duplicate_id` error diagnostics
  (`validate.ts:166-183`).
- Output keys: `summary { files, requirements, valid, errors, warnings }`,
  `results: ValidationResult[]`, optional `work` + `stale` when validating a
  work item (`validate.ts:201-225`).
- `ValidationResult` (`facade-types.ts:110-119`): `{ id?, file, line?, valid,
  pattern?, ast?, references, diagnostics }`. `diagnostics` are core
  `Diagnostic` objects, `references` are `ReferenceMatch[]`.
- Work-item integration (`updateWorkItem`, `validate.ts:248`) writes
  `manifest.json`, `validation.json`, `validation.md` and computes staleness.
- `ok` is `errors === 0`; exit `0` when ok, `1` otherwise (`validate.ts:244`).
  This is the ONLY command that returns exit `1`.
- `next` on failure: `earsyntax instructions repair ... --json`
  (`validate.ts:227-235`).

### `accept`

`packages/cli/src/commands/accept.ts`. Handler `acceptCommand` (`accept.ts:16`).

- Requires a workspace (`requireRoot`, `accept.ts:17`).
- Positional: `<slug>`; missing throws `accept.missing_slug` (exit `2`).
- Flag: `--by <name>` (`accept.ts:52`).
- Refusals, all exit `3`: `accept.not_valid` (status not valid),
  `accept.stale` (source drifted), `accept.output_missing`,
  `accept.output_changed` (`accept.ts:26-50`).
- Writes the `accepted` block to the manifest and sets status `accepted`
  (`accept.ts:52-61`).
- Output key: `work` including `accepted` (`accept.ts:63-70`).
- Exit `0`.

### `show`

`packages/cli/src/commands/show.ts`. Handler `showCommand` (`show.ts:20`).

- Requires a workspace (`requireRoot`, `show.ts:21`).
- Positional: `<slug>`; missing throws `show.missing_slug` (exit `2`).
- Flag: `--artifact requirements|questions|traceability|validation|manifest`
  (`show.ts:38`); unknown throws `show.unknown_artifact` (exit `2`).
- With `--artifact`: output key `artifact { path, exists, content }`
  (`show.ts:56`). Without: output key `work` with all resolved paths
  (`show.ts:62-73`).
- Exit `0`.

## Exit codes (current)

`docs/facade-api.md:77-105`, `errors.ts`.

| Code | Meaning | Site |
|---|---|---|
| `0` | Completed, no error-severity diagnostic. | all handlers |
| `1` | Error diagnostics present. Only `validate`. | `validate.ts:244` |
| `2` | Usage, config, missing file, unparseable input, work-item resolution. | `usageError`, `errors.ts:31` |
| `3` | Refused write, stale source, overwrite protection, human confirmation. | `refusalError`, `errors.ts:40` |

## Workspace files (`.earsyntax/`)

Written and read by the workspace commands. `packages/cli/src/workspace.ts`,
`packages/cli/src/project.ts`.

| Path | Written by | Read by | Shape |
|---|---|---|---|
| `.earsyntax/config.json` | `init` (`init.ts:100`) | `loadConfig` (`project.ts:60`), every workspace command | `{ version, workDir, tools[] }` (`project.ts:14-20`) |
| `.earsyntax/work/.gitkeep` | `init` (`init.ts:101`) | none | empty |
| `.earsyntax/work/<slug>/manifest.json` | `new`, `validate`, `accept` (`workspace.ts:66`) | `readManifest` (`workspace.ts:43`) | `WorkManifest` (`facade-types.ts:59-89`) |
| `.earsyntax/work/<slug>/requirements.ears` | `new` (empty), agent-authored | `validate`, `show` | EARS text |
| `.earsyntax/work/<slug>/questions.md` | `new` (template) | `show` | Markdown |
| `.earsyntax/work/<slug>/traceability.json` | `new` (template) | `show` | `{ requirements[], questions[] }` |
| `.earsyntax/work/<slug>/validation.json` | `validate` (`validate.ts:273`) | `instructions repair` (`instructions.ts:51`), `show` | `{ summary, results }` |
| `.earsyntax/work/<slug>/validation.md` | `validate` (`validate.ts:274`) | none | Markdown |

`WorkManifest` fields (`facade-types.ts:59-89`): `schemaVersion`, `id`, `mode`,
`status`, `source?{path,hash,kind,snapshotPath?}`, `prompt?`,
`output{path,hash?}`, `artifacts{questions,traceability,validationJson,
validationMarkdown}`, `createdAt`, `updatedAt`,
`accepted?{at,by?,sourceHash?,outputHash}`.

`WorkStatus` (`facade-types.ts:52-53`): `missing | scaffolded | drafted |
invalid | valid | accepted | stale`.

Staleness is computed from content hashes (`workspace.ts:124-143`), never
stored. Hashing: `hashContent` in `packages/cli/src/hash.ts` (`sha256:` +
64 hex).

## Diagnostic registry (current, 29 codes)

`packages/core/src/types.ts:191-228` defines the `DiagnosticCode` union.
`packages/cli-contract/src/diagnostic-registry.ts:19-57` maps each to a
one-line description. `docs/diagnostics.md` documents severity by mode.

Groups: `ears.*` (8), `expr.*` (7), `catalog.*` (9), `lint.*` (5). Total 29.
The full list and its new-ID migration is in
`docs/refactor/host-native-facade.md`.

Strict-mode severities (`docs/diagnostics.md:20-89`): the 8 `ears.*`, the 3
structural `expr.*` (`unbalanced_parentheses`, `invalid_operator_sequence`,
`empty_subexpression`), and the 2 `catalog.system_*` are `error`. The other 16
codes are `warning` in every mode. Total 13 error, 16 warning.

## Removed by the host-native refactor

The host-native plan (`EARSYNTAX-HOST-NATIVE-CLI-IMPLEMENTATION-PLAN-FABLE.md`
lines 37-51) removes these from the product surface entirely. They are not kept
as a second ring; the older dual-ring iteration
(`EARSYNTAX-CLI-FACADE-ALPHA-0.md`) is superseded here.

Removed commands:

- `new` (`packages/cli/src/commands/new.ts`)
- `list` (`packages/cli/src/commands/list.ts`)
- `status` (`packages/cli/src/commands/status.ts`)
- `show` (`packages/cli/src/commands/show.ts`)
- `accept` (`packages/cli/src/commands/accept.ts`)
- `check` (planned in the dual-ring doc; never built; not to be built)

Removed workspace, in its entirety:

- The `.earsyntax/` directory and everything under it: `config.json`,
  `work/<slug>/` and all its artifacts (manifest, requirements.ears,
  questions.md, traceability.json, validation.json, validation.md).
- All concepts tied to it: work items, manifests, `WorkStatus` /
  `WorkManifest` / `WorkSummary`, acceptance records, source/output content
  hashing for staleness, the `stale` computation, project-root discovery by
  walking up to `.earsyntax/`.

Removed flags (tied to the workspace): `--work`, `--source` (as a validate
flag), `--out`, `--snapshot-source`, `--by`, `--artifact`, `--status`,
`--config`, `--mode` (replaced by profiles), `--comma-as-and` (folded into
profile dialect), `--tools` (deprecated alias of `--agent`, hidden from help),
`--no-interactive`.

Exit code `3` is removed with the workspace: with no refusals to make (no
overwrite protection over managed state, no acceptance gate), the only codes
are `0`, `1`, `2`.

Modules that become dead or are rewritten: `workspace.ts`, `hash.ts`,
`next-actions.ts` (work-item lifecycle), the `WorkManifest` / `WorkStatus` /
`WorkSummary` types in `facade-types.ts`, the work-item branch of
`validate.ts`, and `project.ts` root discovery (replaced by `--cwd` repo-root
detection that does not require `.earsyntax/`).
