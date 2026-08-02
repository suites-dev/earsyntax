# CLI reference

`earsyntax` is the command-line facade for humans, scripts, and coding agents. It
locates EARS-shaped requirements inside host documents (Kiro, Spec Kit, OpenSpec,
plain `.ears`/text), parses and lints them deterministically, and reports stable
diagnostics as pretty text, JSON, or SARIF. It never derives requirements from
prose and never calls an LLM; that reasoning is the coding agent's job.

Run it through the package binary, no global install required:

```bash
npx @earsyntax/cli <command> [options]
```

The surface is eight commands, and it is closed:

| Command                                | Purpose                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `validate <paths...\|->`               | Locate, extract, parse, lint, and report findings. The only command that returns exit `1`. |
| `extract <paths...\|->`                | Print the requirement candidates the active profile locates, with positions.               |
| `instructions <mode> --file <path>`    | Return the deterministic rules an agent follows for one loop step.                         |
| `explain <diagnostic-id>`              | Explain one diagnostic id, with rationale and examples.                                    |
| `profiles`                             | List the built-in profiles and exactly what each one does.                                 |
| `doctor`                               | Detect hosts and agents in the repo and recommend commands.                                |
| `init --agent <agents> --host <hosts>` | Render managed agent-wrapper and host-integration files.                                   |
| `version --features`                   | Report the installed version and the capability map.                                       |

## Global options

| Flag               | Applies to                      | Meaning                                                                                                       |
| ------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `--profile <name>` | validate, extract, instructions | Select a built-in profile: `strict` (default), `ears-x`, `kiro`, `speckit`, `openspec`.                       |
| `--json`           | all                             | Emit the JSON envelope instead of pretty text.                                                                |
| `--sarif`          | validate only                   | Emit SARIF 2.1.0. Rejected on any other command with exit `2`.                                                |
| `--strict`         | validate                        | Upgrade warnings to errors at the findings layer.                                                             |
| `--quiet`          | all                             | Suppress non-essential pretty output; JSON is unaffected.                                                     |
| `--cwd <dir>`      | all                             | Directory used to resolve relative paths and detect the repo root. Defaults to the process working directory. |

`--profile` defaults to `strict`. `--json` and `--sarif` are mutually exclusive:
passing both is a usage error (exit `2`). There is no `--work`, `--source`,
`--out`, `--catalog`, `--mode`, or `--comma-as-and`; those were workspace or
library flags and are not part of the facade.

## Exit codes

| Code | Meaning                                                                                                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | Success, or a validate run with no error-severity finding.                                                                                                                              |
| `1`  | A validate run produced at least one error-severity finding. Only `validate` returns `1`.                                                                                               |
| `2`  | Usage or environment failure: bad flag, unknown profile, unknown diagnostic id, missing or unreadable path, `--sarif` on a non-validate command, `--from` on a non-author/convert mode. |

Scripts branch on these: `0` means the requirements are clean, `1` means they
failed validation, `2` means the command was called wrong or the environment is
broken.

## The JSON envelope

Every `--json` response is an envelope with base fields, then command-specific
keys, then `next`:

```ts
interface Envelope {
  version: string; // installed @earsyntax/cli version
  command: string; // "validate", "instructions repair", ...
  ok: boolean; // no error-severity finding and no usage error
  root?: string; // absolute repo root, when the command detects one
  // ...command-specific keys...
  diagnostics?: FacadeDiagnostic[]; // usage and environment notices, never lint findings
  next: NextAction[]; // always present; may be empty
}

interface FacadeDiagnostic {
  code: string; // "cli.unknown_profile", "cli.flag_not_allowed", ...
  severity: 'error' | 'warning';
  message: string;
  path?: string;
  line?: number;
}

interface NextAction {
  command: string; // a runnable earsyntax command
  reason: string;
  forAgent?: boolean; // true when an agent can run it without a human
}
```

`diagnostics` in the envelope carries usage and environment problems only. Lint
results live in a command's `findings` key and never appear in `diagnostics`.
The `findings` object is the frozen Findings model documented in
[`docs/contracts/findings.md`](contracts/findings.md).

## `validate <paths...|->`

Locate, extract, parse, and lint EARS in the given files (or stdin `-`) under the
active profile. Exit `0` when there are no error-severity findings, else `1`.

```bash
earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro
```

Pretty output points at each finding with `path:line:col id severity message`,
then a summary line:

```text
.kiro/specs/checkout/requirements.md:10:4 EARS-E006 error The 'If' clause is missing the required 'then' boundary.
.kiro/specs/checkout/requirements.md:10:4 EARS-E008 error The requirement is missing the system name before 'shall'.
2/3 valid across 1 file(s), 2 error(s), 0 warning(s)
```

The same run with `--json`:

```json
{
  "version": "0.0.1-alpha.0",
  "command": "validate",
  "ok": false,
  "findings": {
    "ok": false,
    "summary": { "files": 1, "requirements": 3, "valid": 2, "errors": 2, "warnings": 0 },
    "diagnostics": [
      {
        "id": "EARS-E006",
        "severity": "error",
        "file": ".kiro/specs/checkout/requirements.md",
        "line": 10,
        "col": 4,
        "message": "The 'If' clause is missing the required 'then' boundary."
      },
      {
        "id": "EARS-E008",
        "severity": "error",
        "file": ".kiro/specs/checkout/requirements.md",
        "line": 10,
        "col": 4,
        "message": "The requirement is missing the system name before 'shall'."
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

Read from stdin with `-`. Stdin is treated as plain text (every non-empty line is
a candidate), so it validates under any profile:

```bash
printf 'When a payment webhook arrives, the billing service shall verify the signature.\n' \
  | earsyntax validate - --profile strict
```

```text
1/1 valid across 1 file(s), 0 error(s), 0 warning(s)
```

`--strict` upgrades every warning to an error at the findings layer, so a file
with only warnings exits `1`. `--sarif` replaces stdout with a SARIF 2.1.0 log
(see below); the exit code stays findings-driven.

### Profiles and Markdown blindness

`strict` and `ears-x` locate over `.ears` and plain-text files only: they read
every non-empty line. They do not know Markdown structure, so validating a `.md`
file under `strict` finds zero candidates and reports a clean run:

```bash
earsyntax validate ".kiro/specs/**/requirements.md" --profile strict --json
```

```json
{
  "version": "0.0.1-alpha.0",
  "command": "validate",
  "ok": true,
  "findings": {
    "ok": true,
    "summary": { "files": 1, "requirements": 0, "valid": 0, "errors": 0, "warnings": 0 },
    "diagnostics": []
  },
  "next": []
}
```

This is intended behavior, not a bug: EARS requirements in Markdown live inside
host structure (acceptance-criteria lists, requirement sections), and locating
them is what the host profiles (`kiro`, `speckit`, `openspec`) exist for. Use a
host profile to validate a host document; use `strict` for `.ears`, text, and
stdin. See [profiles](#profiles) and [input formats](input-formats.md).

### SARIF output

```bash
earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro --sarif > earsyntax.sarif
```

`--sarif` emits a SARIF 2.1.0 log (not the envelope). Each diagnostic id becomes
a `rule` in `tool.driver.rules`, and each finding becomes a `result` with a
`physicalLocation`. Abridged:

```json
{
  "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
  "version": "2.1.0",
  "runs": [
    {
      "tool": {
        "driver": {
          "name": "earsyntax",
          "rules": [
            {
              "id": "EARS-E006",
              "shortDescription": { "text": "Malformed If/then unwanted-behaviour form" },
              "fullDescription": { "text": "An If clause is missing its required then boundary." },
              "helpUri": "docs/diagnostics.md#ears-e006",
              "defaultConfiguration": { "level": "error" }
            }
          ]
        }
      },
      "results": [
        {
          "ruleId": "EARS-E006",
          "ruleIndex": 0,
          "level": "error",
          "message": { "text": "The 'If' clause is missing the required 'then' boundary." },
          "locations": [
            {
              "physicalLocation": {
                "artifactLocation": { "uri": ".kiro/specs/checkout/requirements.md" },
                "region": { "startLine": 10, "startColumn": 4 }
              }
            }
          ]
        }
      ]
    }
  ]
}
```

## `extract <paths...|->`

Print the requirement candidates the active profile's locator finds, with source
positions and the matching locator rule. This is the debugging surface for
profiles: it does not lint, so it never returns exit `1`.

```bash
earsyntax extract ".kiro/specs/**/requirements.md" --profile kiro --json
```

```json
{
  "version": "0.0.1-alpha.0",
  "command": "extract",
  "ok": true,
  "summary": { "files": 1, "candidates": 3 },
  "candidates": [
    {
      "file": ".kiro/specs/checkout/requirements.md",
      "line": 9,
      "col": 4,
      "text": "WHEN a payment webhook arrives THE SYSTEM SHALL verify the signature",
      "profile": "kiro",
      "locatorRuleId": "kiro.acceptance-criteria-item"
    }
  ]
}
```

Each `Candidate` is `{ file, line, col?, text, profile, locatorRuleId, requirementId? }`.
`col` and `requirementId` are omitted when unknown. `locatorRuleId` traces the
candidate back to the profile rule that selected it, so `extract` explains why a
line was or was not picked up.

## `instructions <author|convert|repair|review> --file <path> [--from <source>]`

Return the deterministic rules a coding agent follows for one loop step against a
host file. Read-only: the CLI returns rules and (for `repair`/`review`) findings;
it never edits, never converts content, and never calls an LLM. The human mirror
of this rule text is [agent-rules.md](agent-rules.md).

```bash
earsyntax instructions repair --file ".kiro/specs/checkout/requirements.md" --profile kiro --json
```

```json
{
  "version": "0.0.1-alpha.0",
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
    "Change only what the reported findings justify; leave passing requirements untouched.",
    "EARS-E006: Add the missing then: If <condition>, then the <system> shall <response>.",
    "EARS-E008: Insert the system name before shall: the <system> shall <response>.",
    "Edit only the host file, in place, and preserve the surrounding document structure."
  ],
  "editPolicy": {
    "editableFile": ".kiro/specs/checkout/requirements.md",
    "preserveStructure": true
  },
  "outputPolicy": "edit-in-place",
  "findings": {
    "ok": false,
    "summary": { "files": 1, "requirements": 3, "valid": 2, "errors": 2, "warnings": 0 },
    "diagnostics": []
  },
  "next": [
    {
      "command": "earsyntax validate .kiro/specs/checkout/requirements.md --profile kiro --json",
      "reason": "Validate the host file after editing and repeat until no error-severity finding remains.",
      "forAgent": true
    }
  ]
}
```

The payload keys are `mode`, `file`, `profile`, optional `sourceFile`, `locator`,
`dialect`, `rules`, `editPolicy`, `outputPolicy` (always `"edit-in-place"`),
optional `findings`, and `next`. The four modes differ:

| Mode      | `findings` | `rules` focus                                                                 |
| --------- | ---------- | ----------------------------------------------------------------------------- |
| `author`  | no         | Write new EARS requirements into the host file's requirements region.         |
| `convert` | no         | Rewrite natural-language requirements already in the file into EARS in place. |
| `repair`  | yes        | Change only what the findings justify, keyed to their ids.                    |
| `review`  | yes        | Produce a human review summary; never approve, accept, or merge.              |

### `--from <source>`

`--from <source>` is valid only with `author` and `convert`; using it with
`repair` or `review` is a usage error (exit `2`):

```bash
earsyntax instructions repair --file x.md --from y.md --profile kiro
```

```text
error instructions.from_not_allowed: The --from source is only valid with author and convert, not repair.
```

It names a natural-language spec the agent reads as input while writing EARS into
`--file`. The CLI never reads or transforms `<source>` itself; it points the agent
at it. When present, the response adds `sourceFile` and `sourcePolicy: "read-only"`,
and `rules` gains entries directing the agent to read from the source, write into
`--file`, and leave the source unchanged.

## `explain <diagnostic-id>`

Full write-up of one diagnostic. Resolves current ids and deprecated dotted
aliases. No profile needed; exit `0` on a known id, `2` on an unknown one.

```bash
earsyntax explain EARS-E006
```

```text
EARS-E006  error  Malformed If/then unwanted-behaviour form

Meaning
  An If clause is missing its required then boundary.

Rationale
  Canonical EARS requires 'If <condition>, then the <system> shall <response>.' Without the then boundary the unwanted-behaviour form is incomplete.

Bad
  If the signature is invalid, the system shall reject the webhook.

Good
  If the signature is invalid, then the system shall reject the webhook.

Profiles
  Error by default under every built-in profile. --strict has no further effect on an error; only an explicit profile severity override can change its effective severity.
```

With `--json` the same content is structured as `{ id, requestedId, severity,
title, meaning, rationale, badExample, goodExample, profileNotes }`. When the
requested id was a deprecated alias, the response also carries `alias: true` and
a `deprecationNote`, while `id` holds the resolved current id:

```bash
earsyntax explain ears.invalid_if_then_form --json
```

```json
{
  "version": "0.0.1-alpha.0",
  "command": "explain",
  "ok": true,
  "id": "EARS-E006",
  "requestedId": "ears.invalid_if_then_form",
  "alias": true,
  "deprecationNote": "ears.invalid_if_then_form is a deprecated alias for EARS-E006.",
  "severity": "error",
  "title": "Malformed If/then unwanted-behaviour form",
  "meaning": "An If clause is missing its required then boundary.",
  "next": []
}
```

An unknown id fails with exit `2` and suggests near matches:

```text
error explain.unknown_id: Unknown diagnostic id "NOPE". Did you mean EARS-E001, EARS-E002, EARS-E003?
```

## `profiles`

List the built-in profiles, rendered from profile data so the descriptions
cannot drift. Exit `0`.

```bash
earsyntax profiles --json
```

```json
{
  "version": "0.0.1-alpha.0",
  "command": "profiles",
  "ok": true,
  "profiles": [
    {
      "name": "strict",
      "locates": "every non-empty line in ears, text files.",
      "relaxes": [],
      "adds": [],
      "severityOverrides": {}
    },
    {
      "name": "ears-x",
      "locates": "every non-empty line in ears, text files.",
      "relaxes": [],
      "adds": ["frame metadata", "prohibition (shall not)", "id format (^REQ-\\d+$)"],
      "severityOverrides": {}
    },
    {
      "name": "kiro",
      "locates": "list items under /^acceptance criteria$/ in markdown files.",
      "relaxes": [
        "keyword case",
        "leading comma",
        "literal system name (THE SYSTEM)",
        "user-story wrappers"
      ],
      "adds": [],
      "severityOverrides": { "EARS-W011": "off", "EARS-W014": "off" }
    },
    {
      "name": "speckit",
      "locates": "sections matching /^(functional )?requirements$/ in markdown files.",
      "relaxes": [],
      "adds": [],
      "severityOverrides": {}
    },
    {
      "name": "openspec",
      "locates": "### Requirement: blocks and #### Scenario: blocks in markdown files.",
      "relaxes": [],
      "adds": [],
      "severityOverrides": {}
    }
  ],
  "next": []
}
```

Each `ProfileSummary` is `{ name, locates, relaxes, adds, severityOverrides }`,
one per built-in profile, in the order `strict`, `ears-x`, `kiro`, `speckit`,
`openspec`.

## `doctor`

Detect host frameworks and agent integrations in the repo at `--cwd`, and
recommend exact commands. Works with no setup. Exit `0`.

```bash
earsyntax doctor
```

```text
Repo: /repo

Hosts:
  kiro       .kiro/specs/             (profile kiro)

Recommended commands:
  earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro
  earsyntax init --agent claude --host kiro
```

With `--json`, detection lands in `detected.hosts` and `detected.agents`, and
every recommendation is a runnable command in `next`:

```json
{
  "version": "0.0.1-alpha.0",
  "command": "doctor",
  "ok": true,
  "root": "/repo",
  "detected": {
    "hosts": [{ "host": "kiro", "evidence": ".kiro/specs/", "profile": "kiro" }],
    "agents": []
  },
  "next": [
    {
      "command": "earsyntax validate \".kiro/specs/**/requirements.md\" --profile kiro",
      "reason": "Validate Kiro requirements with the Kiro profile.",
      "forAgent": true
    },
    {
      "command": "earsyntax init --agent claude --host kiro",
      "reason": "Render integration files for the detected hosts and agents.",
      "forAgent": true
    }
  ]
}
```

Detection markers include `.kiro/specs/`, `.kiro/steering/`, `.kiro/hooks/`,
`specs/**/spec.md`, `.specify/`, `openspec/`, `.claude/`, `AGENTS.md`, `.cursor/`,
`.github/prompts/`, and `GEMINI.md`.

## `init --agent <agents> --host <hosts>`

Render managed agent-wrapper and host-integration files. It does not create a
workspace, does not edit requirement documents, does not validate as a side
effect, and does not call an LLM. It is idempotent: running the same command
twice produces no diff.

```bash
earsyntax init --agent claude --host kiro --json
```

```json
{
  "version": "0.0.1-alpha.0",
  "command": "init",
  "ok": true,
  "root": "/repo",
  "agents": ["claude"],
  "hosts": ["kiro"],
  "written": [".claude/commands/earsyntax-author.md", ".claude/commands/earsyntax-repair.md"],
  "updated": [],
  "skipped": [],
  "warnings": [],
  "next": [
    {
      "command": "earsyntax validate \".kiro/specs/**/requirements.md\" --profile kiro",
      "reason": "Validate kiro requirements with the kiro profile."
    }
  ]
}
```

`--agent` accepts a comma list of `claude`, `codex`, `cursor`, `copilot`,
`gemini`, `generic`. `--host` accepts a comma list of `kiro`, `speckit`,
`openspec`. The response reports `written` (newly created files), `updated`
(files whose managed section changed), `skipped` (files already up to date, which
is how a second run reports a no-op), and `warnings` (non-fatal notices). Files
that may already exist use managed begin/end markers, so only the managed section
is touched.

## `version --features`

Report the installed version and capability map. Never resolves a repo, so `root`
is absent. Exit `0`.

```bash
earsyntax version --features --json
```

```json
{
  "version": "0.0.1-alpha.0",
  "command": "version",
  "ok": true,
  "features": {
    "facade": 1,
    "commands": [
      "validate",
      "extract",
      "instructions",
      "explain",
      "profiles",
      "doctor",
      "init",
      "version"
    ],
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

`features.facade` is the integer facade contract version; it increments only on a
breaking change to these shapes. An agent reads `features` to discover the closed
surface without guessing.

## The repair loop

The commands compose into one loop that keeps the CLI, the agent, and the human
separate. `validate` reports findings, `instructions repair` returns the rules to
fix them, the agent edits the host file, and `validate` runs again until clean.
See [the agentic loop](agentic-loop.md) for the full walk-through.

```bash
earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro --json
# agent reads the findings, then:
earsyntax instructions repair --file .kiro/specs/checkout/requirements.md --profile kiro --json
# agent edits the host file in place, then re-validates until exit 0
earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro
```

The agent never approves, accepts, or merges. Human review stays in the host
workflow: pull request review, Kiro review, Spec Kit review, or OpenSpec change
review.
