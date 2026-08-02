# earsyntax

Deterministic EARS extraction, validation, and agent instructions for
requirements that already live in Kiro, Spec Kit, OpenSpec, or plain files.

```bash
npx @earsyntax/cli validate ".kiro/specs/**/requirements.md" --profile kiro
```

Successful output looks like:

```text
12/12 valid across 3 file(s), 0 error(s), 0 warning(s)
```

`earsyntax` formalizes Easy Approach to Requirements Syntax (EARS) as a
Node.js parser, linter, extractor, and CLI facade. It locates requirement
candidates, checks them against a named profile, reports stable diagnostic IDs,
and gives coding agents the exact rules they need to author, convert, repair,
or review EARS requirements.

The CLI is deterministic. It does not call an LLM, approve changes, create an
`earsyntax` workspace, or take ownership of your specification lifecycle.
Agents and host tools call `earsyntax`; `earsyntax` never calls them.

> [!WARNING]
> The public packages are alpha. The host-native facade is the intended command
> surface for this branch; run `earsyntax version --features` in a local build to
> see exactly which commands, profiles, agents, hosts, and output formats are
> available.

## Choose A Workflow

| Need                            | Start with                                                                                          | Result                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Validate a plain EARS file      | `earsyntax validate requirements.ears --profile strict`                                             | Human output and exit code for CI             |
| Validate Kiro requirements      | `earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro`                                | Findings against Kiro acceptance criteria     |
| Convert natural-language prose  | `earsyntax instructions convert --file requirements.ears --from feature.md --profile strict --json` | Agent rules for writing structured EARS       |
| Repair validation findings      | `earsyntax instructions repair --file requirements.ears --profile strict --json`                    | Per-diagnostic repair rules and next command  |
| Inspect host extraction         | `earsyntax extract ".kiro/specs/**/requirements.md" --profile kiro --json`                          | Candidate lines with locator rule IDs         |
| Install agent and host wrappers | `earsyntax init --agent claude --host kiro`                                                         | Managed wrapper and hook files, no spec edits |
| Discover capabilities           | `earsyntax version --features`                                                                      | Machine-readable facade capabilities          |

## Install

Node.js 22 or newer is required.

Run without a global install:

```bash
npx @earsyntax/cli validate requirements.ears --profile strict
```

Install in a repository:

```bash
npm install --save-dev @earsyntax/cli
```

Use the local binary from package scripts or through your package manager:

```bash
npx @earsyntax/cli version --features
```

## Validate Requirements

Plain EARS files use the `strict` profile. Each non-empty line is treated as one
requirement.

```bash
printf 'The billing service shall verify the HMAC signature.\n' \
  | npx @earsyntax/cli validate - --profile strict
```

```text
1/1 valid across 1 file(s), 0 error(s), 0 warning(s)
```

Host files use profiles that know where requirements live inside the host
document.

```bash
earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro
earsyntax validate "specs/**/spec.md" --profile speckit
earsyntax validate "openspec/specs/**/*.md" "openspec/changes/**/*.md" --profile openspec
```

Exit codes:

| Code | Meaning                                                                  |
| ---- | ------------------------------------------------------------------------ |
| `0`  | The command succeeded, and validation found no error diagnostics.        |
| `1`  | Validation completed and found at least one error diagnostic.            |
| `2`  | Usage or environment failure, such as a missing file or unknown profile. |

Warnings do not make `validate` return `1` unless `--strict` upgrades surviving
warnings to errors.

## Natural Language To EARS

The conversion loop is agentic, but the CLI contract is not agent-specific. The
developer supplies a source document and a target requirement file. The agent
asks `earsyntax` for rules, edits the target file, validates, and repeats until
the file is clean.

Example source:

```markdown
# Checkout webhooks

The billing service needs to process payment webhooks. It must verify the HMAC
signature on every webhook. When the payment provider is unavailable, retryable
events should be queued. Invalid signatures must be rejected.
```

Start the portable loop:

```bash
earsyntax instructions convert \
  --file requirements.ears \
  --from feature.md \
  --profile strict \
  --json
```

The response tells the agent to:

1. read `feature.md` as input and leave it unchanged
2. write EARS requirements into `requirements.ears`
3. choose the narrowest EARS pattern that fits each behavior
4. write one obligation per requirement
5. avoid inventing behavior that the source does not state
6. preserve the target file structure
7. run `earsyntax validate requirements.ears --profile strict --json`
8. repair and re-validate until no error diagnostics remain

The resulting file is ordinary EARS:

```text
The billing service shall verify the HMAC signature on every payment webhook.
When a payment webhook arrives, the billing service shall process the webhook.
While the payment provider is unavailable, the billing service shall queue retryable events.
If the HMAC signature is invalid, then the billing service shall reject the webhook.
```

Then validate it:

```bash
earsyntax validate requirements.ears --profile strict
```

```text
4/4 valid across 1 file(s), 0 error(s), 0 warning(s)
```

If validation fails, the JSON response includes a `next` action such as:

```json
{
  "command": "earsyntax instructions repair --file requirements.ears --profile strict --json",
  "reason": "Get repair rules for the reported diagnostics.",
  "forAgent": true
}
```

The CLI does not decide what the source means. The coding agent performs the
language work, and the CLI checks whether the result is valid EARS.

## EARS In One Minute

EARS is a small set of requirement templates. A requirement names a system and
the response it shall perform, optionally guarded by a state, event, optional
feature, unwanted condition, or a valid combination of those clauses.

```text
The billing service shall verify the HMAC signature.
When a payment webhook arrives, the billing service shall verify the HMAC signature.
While the payment provider is unavailable, the billing service shall queue retryable events.
Where dunning management is enabled, the billing service shall retry declined charges.
If the HMAC signature is invalid, then the billing service shall reject the webhook.
While the payment provider is unavailable, when a payment webhook arrives, the billing service shall queue retryable events.
```

The `strict` profile keeps to canonical EARS. Other profiles are explicit
adapters: every relaxation or extension is named in profile data and covered by
fixtures.

## Profiles

Profiles are closed built-ins. Each profile combines EARS dialect rules with the
host-document sections the CLI is allowed to scan.

| Profile    | Use it for                 | Locator                                                       |
| ---------- | -------------------------- | ------------------------------------------------------------- |
| `strict`   | Canonical EARS             | Every non-empty line in `.ears`, text, or stdin               |
| `ears-x`   | earsyntax extensions       | Same inputs as `strict`, plus frame metadata and prohibitions |
| `kiro`     | Kiro requirements          | List items under `#### Acceptance Criteria`                   |
| `speckit`  | Spec Kit specs             | Requirement sections in `specs/**/spec.md`                    |
| `openspec` | OpenSpec specs and changes | `### Requirement:` and `#### Scenario:` blocks                |

Render the exact profile behavior:

```bash
earsyntax profiles
```

Use `extract` when a profile does not validate the lines you expected:

```bash
earsyntax extract ".kiro/specs/**/requirements.md" --profile kiro --json
```

Example candidate:

```json
{
  "file": ".kiro/specs/checkout/requirements.md",
  "line": 18,
  "col": 3,
  "profile": "kiro",
  "locatorRuleId": "kiro.acceptance-criteria-item",
  "text": "When a payment webhook arrives, the billing service shall verify the signature."
}
```

## Agent And Host Setup

`init` installs integration files only. It does not create `.earsyntax/`, create
work items, edit requirement or spec documents, run validation as a side effect,
call an LLM, approve changes, or manage any workspace lifecycle.

```bash
earsyntax init --agent claude,codex --host kiro
```

It may write files like:

```text
.claude/commands/earsyntax-author.md
.claude/commands/earsyntax-convert.md
.claude/commands/earsyntax-repair.md
.claude/commands/earsyntax-review.md
AGENTS.md
.kiro/steering/earsyntax.md
.kiro/hooks/ears-validate.yaml
```

`init` is idempotent. Whole-file integrations are rendered deterministically.
Shared files use managed begin and end markers, so rerunning the same command
should produce no diff.

Supported agents:

| Agent     | Integration                                |
| --------- | ------------------------------------------ |
| `claude`  | `.claude/commands/earsyntax-*.md`          |
| `codex`   | Codex-specific managed `AGENTS.md` section |
| `cursor`  | `.cursor/rules/earsyntax.mdc`              |
| `copilot` | `.github/prompts/earsyntax.prompt.md`      |
| `gemini`  | Managed `GEMINI.md` section                |
| `generic` | Generic managed `AGENTS.md` section        |

Supported hosts:

| Host       | Files rendered                                                  | Validation command                                                   |
| ---------- | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| `kiro`     | `.kiro/steering/earsyntax.md`, `.kiro/hooks/ears-validate.yaml` | `earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro` |
| `speckit`  | `.specify/extensions/earsyntax.md`                              | `earsyntax validate "specs/**/spec.md" --profile speckit`            |
| `openspec` | Managed `AGENTS.md` validation section                          | `earsyntax validate "openspec/specs/**/*.md" --profile openspec`     |

For raw source-to-target conversion with `--from`, call
`earsyntax instructions author` or `earsyntax instructions convert` directly so
the agent can pass both the read-only source and the editable target file.

## Diagnostics And Output

Pretty output is optimized for humans:

```text
requirements.ears:2:1 EARS-E006 error The 'If' clause is missing the required 'then' boundary.
3/4 valid across 1 file(s), 1 error(s), 0 warning(s)
```

JSON output is the automation contract:

```bash
earsyntax validate requirements.ears --profile strict --json
```

SARIF is available for code-scanning systems:

```bash
earsyntax validate requirements.ears --profile strict --sarif > earsyntax.sarif
```

Explain any diagnostic by ID:

```bash
earsyntax explain EARS-E006
```

Diagnostic IDs are stable and namespaced:

| Prefix      | Meaning                                                        |
| ----------- | -------------------------------------------------------------- |
| `EARS-E###` | Error diagnostics that can make validation fail                |
| `EARS-W###` | Warning diagnostics that keep the requirement valid by default |

## CI

Use `validate` as the gate:

```bash
earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro
```

Use JSON or SARIF when another tool consumes the findings:

```bash
earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro --json
earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro --sarif > earsyntax.sarif
```

## CLI Reference

The facade has eight commands:

| Command                                | Purpose                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `validate <paths...>`                  | Locate, extract, parse, lint, and report findings. Accepts files, globs, or stdin with `-`.       |
| `extract <paths...>`                   | Show requirement candidates found by the active profile. Accepts files, globs, or stdin with `-`. |
| `instructions <mode> --file <path>`    | Return deterministic rules for an agent loop step.                                                |
| `explain <diagnostic-id>`              | Explain one diagnostic with examples and repair guidance.                                         |
| `profiles`                             | List built-in profiles and their exact behavior.                                                  |
| `doctor`                               | Detect host and agent setup and recommend commands.                                               |
| `init --agent <agents> --host <hosts>` | Install managed host and agent integration files.                                                 |
| `version --features`                   | Print package and facade capabilities.                                                            |

Global options:

| Option             | Meaning                                                       |
| ------------------ | ------------------------------------------------------------- |
| `--profile <name>` | Select `strict`, `ears-x`, `kiro`, `speckit`, or `openspec`.  |
| `--json`           | Emit the facade JSON envelope.                                |
| `--sarif`          | Emit SARIF from `validate`. Mutually exclusive with `--json`. |
| `--strict`         | Treat surviving warnings as validation errors.                |
| `--quiet`          | Suppress pretty output where supported.                       |
| `--cwd <dir>`      | Resolve paths and globs from another working directory.       |

Instruction modes:

| Mode      | Agent job                                                                              |
| --------- | -------------------------------------------------------------------------------------- |
| `author`  | Write new EARS requirements into an existing host document section or target file.     |
| `convert` | Convert natural-language requirement prose into EARS.                                  |
| `repair`  | Fix diagnostics returned by `validate`.                                                |
| `review`  | Summarize validation status, changed requirements, and open questions without editing. |

`author` and `convert` may also use `--from <source>` to point the agent at a
read-only natural-language source file.

## Library API

`@earsyntax/core` exposes the deterministic parser, linter, profile data,
diagnostic registry, and findings helpers for TypeScript users.

```ts
import {
  lintEars,
  lintEarsBatch,
  parseEars,
  resolveProfile,
  summarizeProfiles,
  toFindings,
} from '@earsyntax/core';

const result = lintEars(
  'When a payment webhook arrives, the billing service shall verify the signature.',
);

const profile = resolveProfile('strict');

console.log(result.valid);
console.log(result.pattern);
console.log(profile.ok ? profile.profile.name : profile.error.message);
```

`@earsyntax/extract` owns host-aware extraction and the validation pipeline.
`@earsyntax/cli-contract` owns the shared findings and SARIF output contracts.

## Packages

| Package                   | Role                                                                     |
| ------------------------- | ------------------------------------------------------------------------ |
| `@earsyntax/cli`          | Public command facade.                                                   |
| `@earsyntax/core`         | Parser, linter, diagnostics, findings, and profile data.                 |
| `@earsyntax/extract`      | Candidate extraction from `.ears`, text, Markdown, YAML, and JSON files. |
| `@earsyntax/cli-contract` | Shared JSON, findings, exit-code, and SARIF contracts.                   |

## Development

Install dependencies with the repository package manager:

```bash
pnpm install
```

Useful checks:

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm --filter @earsyntax/cli test
pnpm format:check
```

## Status And Limits

Current boundaries:

- deterministic parsing, extraction, linting, and reporting only
- no semantic contradiction checking
- no natural-language intent inference in the CLI
- no LLM calls from core, extraction, contracts, or CLI packages
- no `.earsyntax/` workspace lifecycle
- no CLI acceptance command
- no hidden host-specific behavior outside profiles

Useful docs:

- [docs/agentic-loop.md](docs/agentic-loop.md)
- [docs/api.md](docs/api.md)
- [docs/cli.md](docs/cli.md)
- [docs/diagnostics.md](docs/diagnostics.md)
- [docs/facade-api.md](docs/facade-api.md)
- [docs/grammar.md](docs/grammar.md)
- [docs/input-formats.md](docs/input-formats.md)

Design references:

- [EARSYNTAX-HOST-NATIVE-CLI-IMPLEMENTATION-PLAN-FABLE.md](EARSYNTAX-HOST-NATIVE-CLI-IMPLEMENTATION-PLAN-FABLE.md)
- [GRAMMAR-AGENT-BRIEF-FABLE.md](GRAMMAR-AGENT-BRIEF-FABLE.md)

The packages declare Apache-2.0 in their package manifests.
