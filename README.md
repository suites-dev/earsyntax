# earsyntax

Deterministic EARS validation for requirements inside Kiro, Spec Kit,
OpenSpec, and plain requirement files.

```bash
npx @earsyntax/cli validate ".kiro/specs/**/requirements.md" --profile kiro
```

Nothing to install and no setup: `npx` fetches the CLI, and `validate` runs in
guest mode against the files already in the repo. A run reports each finding, then
a summary line (numbers illustrative):

```text
12/12 valid across 3 file(s), 0 error(s), 1 warning(s)
```

`earsyntax` is a host-native facade for the Easy Approach to Requirements
Syntax. It locates EARS-shaped requirements in the specification files teams
already use, extracts the candidate lines, parses them deterministically, and
reports stable diagnostics for humans, CI, and coding agents.

This README describes the host-native alpha facade being implemented on this
branch. The public command surface is intentionally narrow and does not include
an `earsyntax` project workspace.

## What It Does

`earsyntax` runs a deterministic pipeline:

```text
locate host document sections
extract candidate requirements with source positions
parse EARS syntax
lint requirement quality rules
emit findings for terminal, JSON, or SARIF
```

It does not call an LLM. Coding agents call `earsyntax`; `earsyntax` never
calls coding agents.

Use it to:

- validate EARS requirements embedded in existing SDD documents
- inspect which lines a host profile extracts
- explain diagnostics with examples and rationale
- install thin agent wrappers for Claude Code, Codex, Cursor, Copilot, Gemini,
  or generic agent files
- emit CI findings as JSON or SARIF

## Supported Profiles

Profiles define both syntax dialect and host-document extraction rules.

| Profile    | Use it for                 | What it reads                                           |
| ---------- | -------------------------- | ------------------------------------------------------- |
| `strict`   | Canonical EARS validation  | `.ears`, plain EARS text, stdin                         |
| `ears-x`   | earsyntax extensions       | strict plus frame metadata, prohibitions, REQ-id format |
| `kiro`     | Kiro specs                 | `.kiro/specs/**/requirements.md`                        |
| `speckit`  | Spec Kit specs             | `specs/**/spec.md`                                      |
| `openspec` | OpenSpec specs and changes | `openspec/specs/**`, `openspec/changes/**`              |

Run `profiles` to see exactly what each profile locates, relaxes, adds, and
changes by severity:

```bash
npx @earsyntax/cli profiles
```

## Install

Use the CLI without installing it globally:

```bash
npx @earsyntax/cli validate requirements.ears --profile strict
```

Or install it in a repository:

```bash
npm install --save-dev @earsyntax/cli
```

Node.js 22 or newer is required.

## Validate Existing Specs

Kiro:

```bash
earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro
```

Spec Kit:

```bash
earsyntax validate "specs/**/spec.md" --profile speckit
```

OpenSpec:

```bash
earsyntax validate "openspec/{specs,changes}/**/*.md" --profile openspec
```

Plain EARS:

```bash
earsyntax validate requirements.ears --profile strict
```

Stdin:

```bash
printf 'When a payment webhook arrives, the billing service shall verify the signature.\n' \
  | earsyntax validate - --profile strict
```

Exit codes:

| Code | Meaning                                                                 |
| ---- | ----------------------------------------------------------------------- |
| `0`  | command succeeded, and validation found no error diagnostics            |
| `1`  | validation completed and found error diagnostics                        |
| `2`  | usage or environment failure, such as a missing file or unknown profile |

## Inspect Extraction

Use `extract` when a Markdown host file does not validate the way you expect.
It prints the candidate requirements the active profile found, with source
positions and locator rule IDs.

```bash
earsyntax extract ".kiro/specs/**/requirements.md" --profile kiro --json
```

Example candidate:

```json
{
  "file": ".kiro/specs/checkout/requirements.md",
  "line": 9,
  "col": 4,
  "text": "WHEN a payment webhook arrives THE SYSTEM SHALL verify the signature",
  "profile": "kiro",
  "locatorRuleId": "kiro.acceptance-criteria-item"
}
```

## Repair With Claude Code

Install host and agent integration files:

```bash
earsyntax init --agent claude --host kiro
```

Then ask Claude Code to repair a host spec file:

```bash
claude -p "/earsyntax-repair .kiro/specs/checkout/requirements.md --profile kiro"
```

The wrapper tells Claude Code to:

1. run `earsyntax instructions repair --file <path> --profile <profile> --json`
2. follow the returned rules exactly
3. edit only the host spec file
4. run `earsyntax validate <path> --profile <profile> --json`
5. repeat until validation is clean
6. report unresolved ambiguity for human review

The agent does not approve, accept, or merge anything. Human review stays in
the host workflow: pull request review, Kiro review, Spec Kit review, or
OpenSpec change review.

## How Init Works

`init` installs integration files. It does not create an `earsyntax` project.

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

`init` is idempotent. Files that may already exist use managed begin and end
markers, so rerunning the same command should produce no diff.

Supported agents:

| Agent     | Integration                           |
| --------- | ------------------------------------- |
| `claude`  | `.claude/commands/earsyntax-*.md`     |
| `codex`   | managed `AGENTS.md` section           |
| `cursor`  | `.cursor/rules/earsyntax.mdc`         |
| `copilot` | `.github/prompts/earsyntax.prompt.md` |
| `gemini`  | managed `GEMINI.md` section           |
| `generic` | managed `AGENTS.md` section           |

Supported hosts:

| Host       | Integration                                         |
| ---------- | --------------------------------------------------- |
| `kiro`     | Kiro steering and validation hook files             |
| `speckit`  | Spec Kit command or instruction files               |
| `openspec` | OpenSpec agent instructions and validation commands |

## CI

Use `validate` as the gate:

```bash
earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro
```

Emit SARIF for code-scanning integrations:

```bash
earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro --sarif > earsyntax.sarif
```

Upload the SARIF to GitHub code scanning so findings surface on the pull request.
`validate` exits `1` when it finds an error, so gate the job on it and still
upload the report:

```yaml
name: earsyntax
on: [pull_request]
jobs:
  ears:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Validate EARS requirements
        run: npx @earsyntax/cli validate ".kiro/specs/**/requirements.md" --profile kiro --sarif > earsyntax.sarif
      - name: Upload SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: earsyntax.sarif
```

Use JSON when another tool consumes the findings:

```bash
earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro --json
```

## CLI Reference

| Command                                | Purpose                                                 |
| -------------------------------------- | ------------------------------------------------------- |
| `validate <paths...\|->`               | Locate, extract, parse, lint, and report findings       |
| `extract <paths...\|->`                | Show requirement candidates found by the active profile |
| `instructions <mode> --file <path>`    | Return rules for one agent loop step                    |
| `explain <diagnostic-id>`              | Explain one diagnostic with examples                    |
| `profiles`                             | List built-in profiles and their exact behavior         |
| `doctor`                               | Detect host and agent setup and suggest commands        |
| `init --agent <agents> --host <hosts>` | Install host and agent integration files                |
| `version --features`                   | Print package and facade capabilities                   |

Eight commands, and the surface is closed. See the [CLI reference](docs/cli.md)
for flags, exit codes, and the JSON envelope per command.

Instruction modes:

| Mode      | Agent job                                                               |
| --------- | ----------------------------------------------------------------------- |
| `author`  | Write new EARS requirements into a host document's requirements region  |
| `convert` | Rewrite natural-language requirements in a host file into EARS in place |
| `repair`  | Fix the findings returned by `validate`                                 |
| `review`  | Summarize the located requirements for a human; never approve or accept |

## Library API

`@earsyntax/core` exposes the parser, linter, profile runtime, diagnostic
registry, and findings model for TypeScript users.

```ts
import { lintEars } from '@earsyntax/core';

const result = lintEars(
  'When a payment webhook arrives, the billing service shall verify the signature.',
);

console.log(result.valid);
console.log(result.pattern);
console.log(result.diagnostics);
```

For batch or host-document workflows, prefer the CLI unless you need direct
embedding inside another tool.

## EARS In One Minute

EARS, the Easy Approach to Requirements Syntax, is a small set of templates
for requirements. A requirement names a system and the response it shall
perform, optionally guarded by a state, event, optional feature, unwanted
condition, or a combination of those clauses.

Examples:

```text
The billing service shall verify the HMAC signature of every incoming webhook.
When a payment webhook arrives, the billing service shall verify the HMAC signature.
While the payment provider is unavailable, the billing service shall queue retryable events.
Where dunning management is enabled, the billing service shall retry declined charges.
If the HMAC signature is invalid, then the billing service shall reject the webhook.
```

`strict` keeps to canonical EARS. Host profiles are explicit adapters: every
relaxation or extension must be named by the profile and covered by fixtures.

## Status And Limits

The host-native CLI is the alpha target for this branch.

Boundaries:

- deterministic parsing and linting only
- no semantic contradiction checking
- no natural-language intent inference in the CLI
- no LLM calls from core or CLI
- no `earsyntax` workspace lifecycle
- no CLI acceptance command
- no hidden host-specific behavior outside profiles

The maintained design briefs in this repository are:

- [EARSYNTAX-CLI-FACADE-ALPHA-0.md](EARSYNTAX-CLI-FACADE-ALPHA-0.md)
- [EARSYNTAX-HOST-NATIVE-CLI-IMPLEMENTATION-PLAN-FABLE.md](EARSYNTAX-HOST-NATIVE-CLI-IMPLEMENTATION-PLAN-FABLE.md)
- [GRAMMAR-AGENT-BRIEF-FABLE.md](GRAMMAR-AGENT-BRIEF-FABLE.md)
