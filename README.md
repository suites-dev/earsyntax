# earsyntax

**Deterministic EARS validation for humans, coding agents, and CI.**

`earsyntax` finds requirements where they already live, checks them against an explicit EARS profile, and returns stable diagnostics that people and automation can act on.

It works with plain requirement files, Kiro, Spec Kit, and OpenSpec.

**No new workspace. No hidden lifecycle. No LLM inside the validator.**

```bash
npx @earsyntax/cli validate "specs/**/spec.md" --profile speckit
```

```text
12/12 valid across 3 file(s), 0 error(s), 0 warning(s)
```

> [!WARNING]
> `earsyntax` is currently alpha. Node.js 22 or newer is required. Run `earsyntax version --features` to inspect the exact commands, profiles, hosts, agents, and output formats available in your build.

## Why earsyntax

Spec-driven development moves intent into explicit artifacts, but natural-language requirements are still difficult to validate consistently.

Humans can tolerate ambiguity. Coding agents and CI systems need a smaller, more constrained interface.

EARS, the Easy Approach to Requirements Syntax, provides a compact family of requirement patterns:

```text
The billing service shall verify the HMAC signature.

When a payment webhook arrives,
the billing service shall verify the HMAC signature.

While the payment provider is unavailable,
the billing service shall queue retryable events.

If the HMAC signature is invalid,
then the billing service shall reject the webhook.
```

`earsyntax` makes those patterns operational.

It can:

- locate requirement candidates inside existing host documents
- parse and lint EARS requirements
- apply explicit host and dialect profiles
- report stable diagnostic IDs
- emit human, JSON, and SARIF output
- provide deterministic authoring and repair instructions to coding agents
- install managed integrations for agents and SDD hosts
- act as a reproducible CI gate

It does **not** decide what a requirement should mean.

> Coding agents perform the language work.  
> `earsyntax` checks whether the result satisfies the declared grammar.

## How it works

```text
Kiro / Spec Kit / OpenSpec / plain files
                    ↓
          host-aware extraction
                    ↓
             EARS validation
                    ↓
        stable findings and exit code
                    ↓
       human or agent repairs the file
                    ↓
                  CI gate
```

The CLI is deterministic. Agents and host tools call `earsyntax`; `earsyntax` never calls them.

## Quick start

### Validate a plain EARS file

```bash
printf 'The billing service shall verify the HMAC signature.\n' \
  | npx @earsyntax/cli validate - --profile strict
```

```text
1/1 valid across 1 file(s), 0 error(s), 0 warning(s)
```

### Validate requirements in an SDD host

```bash
# Spec Kit
npx @earsyntax/cli validate "specs/**/spec.md" --profile speckit

# Kiro
npx @earsyntax/cli validate ".kiro/specs/**/requirements.md" --profile kiro

# OpenSpec
npx @earsyntax/cli validate \
  "openspec/specs/**/*.md" \
  "openspec/changes/**/*.md" \
  --profile openspec
```

### Install in a repository

```bash
npm install --save-dev @earsyntax/cli
```

Then call the local binary from package scripts, CI, or your package manager:

```bash
npx earsyntax validate "specs/**/spec.md" --profile speckit
```

## Choose a workflow

| Goal | Command | Result |
| --- | --- | --- |
| Validate a plain EARS file | `earsyntax validate requirements.ears --profile strict` | Human output and a CI-ready exit code |
| Validate Spec Kit requirements | `earsyntax validate "specs/**/spec.md" --profile speckit` | Findings for extracted requirement sections |
| Validate Kiro acceptance criteria | `earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro` | Findings for acceptance-criteria list items |
| Validate OpenSpec documents | `earsyntax validate "openspec/specs/**/*.md" "openspec/changes/**/*.md" --profile openspec` | Findings for requirement and scenario blocks |
| Inspect extraction | `earsyntax extract <paths...> --profile <name> --json` | Candidate locations, text, and locator rule IDs |
| Convert prose with an agent | `earsyntax instructions convert --file requirements.ears --from feature.md --profile strict --json` | Deterministic conversion rules and the next command |
| Repair findings with an agent | `earsyntax instructions repair --file requirements.ears --profile strict --json` | Diagnostic-specific repair instructions |
| Install integrations | `earsyntax init --agent claude,codex --host speckit` | Managed agent and host files, with no spec edits |
| Discover capabilities | `earsyntax version --features` | Machine-readable facade capabilities |

## EARS in one minute

EARS requirements name a system and the response it shall perform. Optional clauses describe the context in which that response applies.

### Ubiquitous

```text
The billing service shall verify the HMAC signature.
```

### Event-driven

```text
When a payment webhook arrives,
the billing service shall process the webhook.
```

### State-driven

```text
While the payment provider is unavailable,
the billing service shall queue retryable events.
```

### Optional feature

```text
Where dunning management is enabled,
the billing service shall retry declined charges.
```

### Unwanted behavior

```text
If the HMAC signature is invalid,
then the billing service shall reject the webhook.
```

### Combined state and event

```text
While the payment provider is unavailable,
when a payment webhook arrives,
the billing service shall queue retryable events.
```

The `strict` profile follows canonical EARS. Other profiles are explicit adapters. Every extension or relaxation is named in profile data and covered by fixtures.

## Profiles

A profile defines two things:

1. the EARS dialect to validate
2. the sections of a host document that `earsyntax` is allowed to scan

| Profile | Intended use | Candidate locator |
| --- | --- | --- |
| `strict` | Canonical EARS | Every non-empty line in `.ears`, text, or stdin |
| `ears-x` | Named `earsyntax` extensions | Plain inputs, plus frame metadata and prohibitions |
| `kiro` | Kiro requirements | List items under `#### Acceptance Criteria` |
| `speckit` | Spec Kit specs | Requirement sections in `specs/**/spec.md` |
| `openspec` | OpenSpec specs and changes | `### Requirement:` and `#### Scenario:` blocks |

Inspect the exact built-in profile behavior:

```bash
earsyntax profiles
```

When validation does not find the lines you expected, inspect extraction directly:

```bash
earsyntax extract ".kiro/specs/**/requirements.md" \
  --profile kiro \
  --json
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

## The agentic loop

`earsyntax` is designed to be called by coding agents without making the validator probabilistic.

A typical conversion loop looks like this:

```text
natural-language source, read only
                 ↓
       agent requests instructions
                 ↓
       agent writes EARS target
                 ↓
      earsyntax validates target
                 ↓
 stable diagnostics and next action
                 ↓
        agent repairs and retries
```

Start the loop:

```bash
earsyntax instructions convert \
  --file requirements.ears \
  --from feature.md \
  --profile strict \
  --json
```

The response tells the agent to:

1. treat the source as read-only
2. write requirements only into the target
3. choose the narrowest EARS pattern that fits
4. write one obligation per requirement
5. avoid inventing behavior not present in the source
6. preserve the target file structure
7. validate the result
8. repair diagnostics until the file is clean

Then run:

```bash
earsyntax validate requirements.ears --profile strict --json
```

When validation fails, the response can provide the next deterministic action:

```json
{
  "command": "earsyntax instructions repair --file requirements.ears --profile strict --json",
  "reason": "Get repair rules for the reported diagnostics.",
  "forAgent": true
}
```

### Instruction modes

| Mode | Agent responsibility |
| --- | --- |
| `author` | Add new EARS requirements to an existing host section or target file |
| `convert` | Convert read-only natural-language source material into EARS |
| `repair` | Fix diagnostics returned by `validate` |
| `review` | Summarize status, changed requirements, and open questions without editing |

`author` and `convert` can use `--from <source>` to identify a read-only source document.

> [!IMPORTANT]
> The agent may author or repair text. The validator remains deterministic. `earsyntax` does not infer intent, approve requirements, or silently change the specification lifecycle.

## Agent and host setup

Install managed integrations without creating a proprietary workspace:

```bash
earsyntax init --agent claude,codex --host speckit
```

Depending on the selected integrations, `init` may write files such as:

```text
.claude/commands/earsyntax-author.md
.claude/commands/earsyntax-convert.md
.claude/commands/earsyntax-repair.md
.claude/commands/earsyntax-review.md
AGENTS.md
.specify/extensions/earsyntax.md
```

Supported agent targets include:

- Claude
- Codex
- Cursor
- GitHub Copilot
- Gemini
- generic `AGENTS.md` consumers

Supported host targets include:

- Kiro
- Spec Kit
- OpenSpec

`init` is idempotent. Whole-file integrations are rendered deterministically. Shared files use managed begin and end markers, so rerunning the same setup should produce no diff.

`init` does not:

- create `.earsyntax/`
- create work items
- edit requirements or specs
- run validation as a side effect
- call an LLM
- approve changes
- manage a workspace lifecycle

## Diagnostics and automation

Pretty output is optimized for humans:

```text
requirements.ears:2:1 EARS-E006 error The 'If' clause is missing the required 'then' boundary.
3/4 valid across 1 file(s), 1 error(s), 0 warning(s)
```

Diagnostic IDs are stable and namespaced:

| Prefix | Meaning |
| --- | --- |
| `EARS-E###` | Error diagnostics that can make validation fail |
| `EARS-W###` | Warning diagnostics that keep a requirement valid by default |

Explain any diagnostic:

```bash
earsyntax explain EARS-E006
```

### JSON

JSON is the automation contract:

```bash
earsyntax validate requirements.ears --profile strict --json
```

Use it in:

- coding-agent repair loops
- custom CI checks
- editor integrations
- host adapters
- repository tooling

### SARIF

SARIF is available for code-scanning systems:

```bash
earsyntax validate requirements.ears \
  --profile strict \
  --sarif > earsyntax.sarif
```

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | The command succeeded and validation found no error diagnostics |
| `1` | Validation completed and found at least one error diagnostic |
| `2` | Usage or environment failure, such as a missing file or unknown profile |

Warnings do not return `1` unless `--strict` upgrades surviving warnings to errors.

## CI

Use `validate` as a repository gate:

```yaml
name: requirements

on:
  pull_request:
  push:
    branches: [main]

jobs:
  ears:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Validate Spec Kit requirements
        run: npx earsyntax validate "specs/**/spec.md" --profile speckit
```

Use JSON or SARIF when another system consumes the findings:

```bash
earsyntax validate "specs/**/spec.md" --profile speckit --json

earsyntax validate "specs/**/spec.md" \
  --profile speckit \
  --sarif > earsyntax.sarif
```

## CLI reference

| Command | Purpose |
| --- | --- |
| `validate <paths...>` | Locate, extract, parse, lint, and report findings |
| `extract <paths...>` | Show requirement candidates found by the selected profile |
| `instructions <mode> --file <path>` | Return deterministic rules for an agent-loop step |
| `explain <diagnostic-id>` | Explain a diagnostic with examples and repair guidance |
| `profiles` | List built-in profiles and their exact behavior |
| `doctor` | Detect host and agent setup, then recommend commands |
| `init --agent <agents> --host <hosts>` | Install managed agent and host integration files |
| `version --features` | Print package and facade capabilities |

Global options:

| Option | Meaning |
| --- | --- |
| `--profile <name>` | Select `strict`, `ears-x`, `kiro`, `speckit`, or `openspec` |
| `--json` | Emit the facade JSON envelope |
| `--sarif` | Emit SARIF from `validate` |
| `--strict` | Treat surviving warnings as validation errors |
| `--quiet` | Suppress pretty output where supported |
| `--cwd <dir>` | Resolve paths and globs from another working directory |

## Design principles

### Deterministic core

The parser, extraction pipeline, profiles, diagnostics, and CLI do not call an LLM.

### Host-native adoption

Requirements stay in Kiro, Spec Kit, OpenSpec, or ordinary files. `earsyntax` does not introduce a competing workspace or lifecycle.

### Explicit profiles

Host extraction rules and grammar differences are visible, named, and testable.

### One automation contract

Humans get readable diagnostics. Agents get JSON. Code-scanning systems get SARIF. CI gets stable exit codes.

### Agents are consumers, not oracles

Agents may author, convert, repair, and review. The CLI checks structure. Humans remain responsible for intent.

## Library API

`@earsyntax/core` exposes the deterministic parser, linter, profile data, diagnostics, and findings helpers:

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

Additional packages:

| Package | Responsibility |
| --- | --- |
| `@earsyntax/cli` | Public command facade |
| `@earsyntax/core` | Parser, linter, diagnostics, findings, and profile data |
| `@earsyntax/extract` | Candidate extraction from text, Markdown, YAML, and JSON |
| `@earsyntax/cli-contract` | Shared JSON, findings, exit-code, and SARIF contracts |

## From valid intent to runtime proof

`earsyntax` validates how a requirement is expressed. It does not prove that a running system implements it.

For selected requirements, a runtime verification tool such as Suites Blackbox can provide the next gate:

```text
human-authored requirement
          ↓
validated EARS structure
          ↓
human-reviewed proof binding
          ↓
executable system scenario
          ↓
runtime boundary evidence
          ↓
deterministic verification result
```

The boundary remains explicit:

- `earsyntax` validates requirement structure
- a human decides which requirements need system-level proof
- a human authors or ratifies the mapping to concrete runtime effects
- Blackbox executes the system and verifies the observed evidence

For example, `earsyntax` can validate:

```text
If the user does not exist,
then the subscription service shall not initiate payment.
```

It does not automatically decide that “initiate payment” maps to:

```yaml
forbids:
  - boundary: http
    op: POST
    key: /v1/payment_intents
```

That proof binding remains human-authored or human-ratified.

## Status and limits

Current boundaries are intentional:

- deterministic parsing, extraction, linting, and reporting only
- no semantic contradiction checking
- no natural-language intent inference in the CLI
- no LLM calls from the core, extraction, contracts, or CLI packages
- no `.earsyntax/` workspace lifecycle
- no CLI acceptance or approval command
- no hidden host-specific behavior outside explicit profiles

`earsyntax` checks whether a requirement is structurally valid under a declared profile.

It does not decide:

- whether the requirement is correct
- whether the requirement is complete
- whether two valid requirements contradict one another
- whether the implementation satisfies the requirement
- whether a human should approve the change

## Development

Install dependencies:

```bash
pnpm install
```

Run the repository checks:

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm --filter @earsyntax/cli test
pnpm format:check
```

## Documentation

- [Agentic loop](docs/agentic-loop.md)
- [CLI reference](docs/cli.md)
- [Diagnostics](docs/diagnostics.md)
- [Grammar](docs/grammar.md)
- [Input formats](docs/input-formats.md)
- [Library API](docs/api.md)
- [Facade API](docs/facade-api.md)

## License

Apache-2.0
