# earsyntax

**Deterministic EARS extraction, validation, and agent instructions for requirements that already live in Kiro, Spec Kit, OpenSpec, or plain files.**

`earsyntax` locates requirement candidates, validates them against an explicit profile, and returns stable diagnostics for humans, coding agents, and CI.

> [!WARNING]
> `earsyntax` is currently alpha. Node.js 22 or newer is required. Run `earsyntax version --features` to inspect the exact commands, profiles, agents, hosts, and output formats available in your build.

## What EARS checks

EARS is the Easy Approach to Requirements Syntax: a small set of sentence patterns for writing requirements as explicit system obligations.

Valid EARS requirements name the system and the response it shall perform. In plain files, write each requirement on one line:

```text
The billing service shall verify the HMAC signature.

When a payment webhook arrives, the billing service shall verify the HMAC signature.

If the HMAC signature is invalid, then the billing service shall reject the webhook.
```

This is not structurally valid under `strict` because it does not name a bounded `shall` obligation:

```text
Payments should be handled quickly.
```

## Run this first

This command does not depend on repository files or a host-specific layout:

```bash
printf 'The billing service shall verify the HMAC signature.\n' \
  | npx @earsyntax/cli validate - --profile strict
```

Expected output:

```text
1/1 valid across 1 file(s), 0 error(s), 0 warning(s)
```

> [!NOTE]
> A clean result means the extracted requirements are structurally valid under the selected profile. It does not mean they are semantically complete, mutually consistent, approved, or implemented correctly.

## Install

The npm package is named `@earsyntax/cli`. It installs a binary named `earsyntax`.

Before installing, invoke the package directly:

```bash
npx @earsyntax/cli version --features
```

Install it in a repository:

```bash
npm install --save-dev @earsyntax/cli
```

After installation, invoke the local binary through your package manager:

```bash
npx earsyntax version --features
```

The rest of this README uses `earsyntax` as the binary name. Prefix it with `npx`, `pnpm exec`, or the equivalent for your package manager when needed.

## Contract

### What earsyntax does

- extracts requirement candidates from supported files and host documents
- validates candidates against a named EARS profile
- reports stable diagnostic IDs
- emits human-readable, JSON, and SARIF output
- provides deterministic authoring, conversion, repair, and review instructions for agents
- installs managed integrations for supported agents and SDD hosts
- returns stable exit codes for CI

### What earsyntax does not do

- call an LLM
- infer natural-language intent
- decide whether a requirement is correct or complete
- detect semantic contradictions between otherwise valid requirements
- approve changes
- create an `.earsyntax/` workspace
- edit specifications during `init`
- prove that an implementation satisfies a requirement

Agents and host tools call `earsyntax`; `earsyntax` never calls them.

## What extraction means

Extraction is the read-only step before validation. `earsyntax` selects candidate requirement text from supported files, then validates only those candidates.

It does not rewrite prose, call an LLM, or move requirements between files. Use `extract` when a validation run finds too few, too many, or surprising candidates:

```bash
earsyntax extract ".kiro/specs/**/requirements.md" \
  --profile kiro \
  --json
```

`validate` and `extract` use the same locator rules, so extraction output explains exactly what validation is checking.

## Choose your input

`--profile` controls extraction and validation. `--host` is only used by `init` to render host integration files.

| You have        | Requirements stay in                            | Validate with        | Init with         |
| --------------- | ----------------------------------------------- | -------------------- | ----------------- |
| Plain EARS/text | `requirements.ears`, `.txt`, or stdin           | `--profile strict`   | no host required  |
| EARS extensions | `requirements.ears`, `.txt`, or stdin           | `--profile ears-x`   | no host required  |
| Kiro            | `.kiro/specs/**/requirements.md`                | `--profile kiro`     | `--host kiro`     |
| Spec Kit        | `specs/**/spec.md`                              | `--profile speckit`  | `--host speckit`  |
| OpenSpec        | `openspec/specs/**/*.md`, `openspec/changes/**` | `--profile openspec` | `--host openspec` |

## Requirements can evolve

In agentic development, a requirement is not a one-shot blueprint. It is a versioned intent artifact that can change as implementation, review, and new information expose gaps or ambiguity.

`earsyntax` gives that loop a deterministic checkpoint. Agents may author, convert, or repair requirements, but the CLI only validates their structure under a declared profile. It does not infer intent, approve semantics, or verify the implementation.

## Common workflows

| Need                           | Start with                                                                                  | Result                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Validate a plain EARS file     | `earsyntax validate requirements.ears --profile strict`                                     | Human output and a CI-ready exit code               |
| Validate Kiro requirements     | `earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro`                        | Findings for extracted acceptance-criteria items    |
| Validate Spec Kit requirements | `earsyntax validate "specs/**/spec.md" --profile speckit`                                   | Findings for extracted requirement lines            |
| Validate OpenSpec requirements | `earsyntax validate "openspec/specs/**/*.md" "openspec/changes/**/*.md" --profile openspec` | Findings only for EARS-shaped candidates            |
| Inspect extraction             | `earsyntax extract <paths...> --profile <name> --json`                                      | Candidate locations, text, and locator rule IDs     |
| Convert prose with an agent    | `earsyntax instructions convert --file <target> --from <source> --profile <name> --json`    | Deterministic conversion rules and the next command |
| Repair findings with an agent  | `earsyntax instructions repair --file <target> --profile <name> --json`                     | Diagnostic-specific repair rules                    |
| Install integrations           | `earsyntax init --agent claude,codex --host speckit`                                        | Managed integration files, with no spec edits       |
| Discover capabilities          | `earsyntax version --features`                                                              | Machine-readable facade capabilities                |

## Agent and host setup

`init` installs managed integration files. It does not create `.earsyntax/`, edit specs, validate as a side effect, or call an LLM.

For example:

```bash
earsyntax init --agent codex --host kiro
```

May write or update:

```text
AGENTS.md
.kiro/steering/earsyntax.md
.kiro/hooks/ears-validate.yaml
```

Supported `--agent` values:

| Agent value        | Managed files                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `claude`           | `.claude/commands/earsyntax-author.md`, `earsyntax-convert.md`, `earsyntax-repair.md`, `earsyntax-review.md` |
| `codex`, `generic` | Managed `AGENTS.md` section                                                                                  |
| `cursor`           | `.cursor/rules/earsyntax.mdc`                                                                                |
| `copilot`          | `.github/prompts/earsyntax.prompt.md`                                                                        |
| `gemini`           | Managed `GEMINI.md` section                                                                                  |

Supported `--host` values:

| Host value | Managed files                                                   |
| ---------- | --------------------------------------------------------------- |
| `kiro`     | `.kiro/steering/earsyntax.md`, `.kiro/hooks/ears-validate.yaml` |
| `speckit`  | `.specify/extensions/earsyntax.md`                              |
| `openspec` | Managed `AGENTS.md` section with OpenSpec validation commands   |

Rerunning the same `init` command is idempotent: unchanged managed files are skipped.

## Profiles

Profiles are closed built-ins. Each profile combines a dialect with rules for locating candidates inside a host document.

Use `strict` for plain `.ears` or text files. Use `ears-x` only when you want named extensions such as `shall not`. Use host profiles for Markdown owned by Kiro, Spec Kit, or OpenSpec.

| Profile    | Dialect                                                                 | Candidate location                                                                                                              |
| ---------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `strict`   | Canonical EARS. Prohibitions such as `shall not` are not accepted.      | Every non-empty, non-comment line in `.ears`, text, or stdin                                                                    |
| `ears-x`   | Named `earsyntax` extensions, including prohibitions and frame metadata | The same plain inputs as `strict`                                                                                               |
| `kiro`     | Kiro-oriented EARS                                                      | List items under an `Acceptance Criteria` heading                                                                               |
| `speckit`  | Spec Kit-oriented EARS                                                  | Requirement sections in `specs/**/spec.md`                                                                                      |
| `openspec` | OpenSpec-oriented EARS                                                  | Scans `### Requirement:` and `#### Scenario:` sections, but returns only EARS-shaped lines. Ordinary Gherkin steps are skipped. |

Inspect the exact built-in profile definitions:

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

### Host shapes

Kiro extracts list items under an `Acceptance Criteria` heading:

```md
#### Acceptance Criteria

- WHEN a payment webhook arrives THE SYSTEM SHALL verify the signature.
```

Spec Kit extracts requirement lines from requirement sections and strips bold `FR-###` labels:

```md
## Requirements

### Functional Requirements

- **FR-001**: The billing service shall verify the HMAC signature.
```

OpenSpec extracts EARS-shaped statements under `### Requirement:`. Ordinary Gherkin scenario steps are skipped:

```md
### Requirement: Payment webhooks

The billing service shall verify the HMAC signature.

#### Scenario: Valid webhook

- **WHEN** a webhook arrives
- **THEN** it is accepted
```

## Agent loop

The CLI never invokes a coding agent. Your agent, wrapper, or script calls `earsyntax`, gives the returned instructions to the agent, and validates the edited file.

### Wire the loop

1. Ask for `author` or `convert` instructions with `--file <target>` and, when there is separate source material, `--from <source>`.
2. Give the JSON response and source material to the agent.
3. The agent edits only `editPolicy.editableFile`.
4. Run the `next[0].command`, normally `earsyntax validate <target> --profile <name> --json`.
5. If validation exits `0`, stop automatic repair and send the result for human review.
6. If validation exits `1`, run `earsyntax instructions repair --file <target> --profile <name> --json`.
7. `instructions repair` reads `--file`, reruns validation internally, embeds the current findings, and returns repair rules.
8. If any step exits `2`, stop and fix the usage or environment problem.

Humans remain responsible for intent, ambiguity, tradeoffs, and approval. Agents may restructure requirements to satisfy the selected grammar, but they should not invent behavior.

### File roles

| Mode                                  | Editable target | Read-only source | Notes                                                                      |
| ------------------------------------- | --------------- | ---------------- | -------------------------------------------------------------------------- |
| `author --file target`                | `target`        | none             | Add new requirements directly into the target file                         |
| `author --file target --from source`  | `target`        | `source`         | Read source material, then add requirements into target                    |
| `convert --file target`               | `target`        | none             | Rewrite natural-language requirements already in target; target must exist |
| `convert --file target --from source` | `target`        | `source`         | Convert source material into EARS in target                                |
| `repair --file target`                | `target`        | none             | Recompute findings from target and return diagnostic-specific repair rules |
| `review --file target`                | none            | `target`         | Recompute findings and summarize without editing                           |

`--from` is valid only with `author` and `convert`. The CLI records the source path for the agent; it does not read or transform the source file.

### Host-native example: Kiro

Assume product intent exists in `docs/checkout-intent.md` and the editable Kiro target is `.kiro/specs/checkout/requirements.md`.

Ask for conversion instructions:

```bash
earsyntax instructions convert \
  --file ".kiro/specs/checkout/requirements.md" \
  --from "docs/checkout-intent.md" \
  --profile kiro \
  --json
```

To add new requirements from the same source instead of rewriting existing prose, use `author`:

```bash
earsyntax instructions author \
  --file ".kiro/specs/checkout/requirements.md" \
  --from "docs/checkout-intent.md" \
  --profile kiro \
  --json
```

Abridged response:

```json
{
  "version": "<installed-version>",
  "command": "instructions convert",
  "ok": true,
  "mode": "convert",
  "file": ".kiro/specs/checkout/requirements.md",
  "profile": "kiro",
  "sourceFile": "docs/checkout-intent.md",
  "sourcePolicy": "read-only",
  "locator": {
    "summary": "Bullet and numbered items under Acceptance Criteria headings"
  },
  "rules": [
    "Choose the narrowest EARS pattern that preserves the stated behavior.",
    "Write one obligation per requirement.",
    "Do not invent behavior that the source does not state."
  ],
  "editPolicy": {
    "editableFile": ".kiro/specs/checkout/requirements.md",
    "preserveStructure": true
  },
  "outputPolicy": "edit-in-place",
  "next": [
    {
      "command": "earsyntax validate .kiro/specs/checkout/requirements.md --profile kiro --json",
      "forAgent": true
    }
  ]
}
```

The agent edits the target, then validates it:

```bash
earsyntax validate \
  ".kiro/specs/checkout/requirements.md" \
  --profile kiro \
  --json
```

When validation fails, request repair instructions:

```bash
earsyntax instructions repair \
  --file ".kiro/specs/checkout/requirements.md" \
  --profile kiro \
  --json
```

The same loop works with plain files, Spec Kit, and OpenSpec. The profile controls both the accepted dialect and where candidates may be extracted.

### Instruction modes

| Mode      | Agent responsibility                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| `author`  | Add new EARS requirements to an existing target                                                                 |
| `convert` | Rewrite natural-language requirements in `--file` into EARS; with `--from`, treat the source as read-only input |
| `repair`  | Fix diagnostics returned by `validate`                                                                          |
| `review`  | Summarize status and open questions without editing                                                             |

`author` and `convert` may use `--from <source>` to identify a read-only source document.

## Diagnostics and automation

Pretty output is optimized for humans:

```text
requirements.ears:2:1 EARS-E006 error The 'If' clause is missing the required 'then' boundary.
3/4 valid across 1 file(s), 1 error(s), 0 warning(s)
```

Explain a diagnostic:

```bash
earsyntax explain EARS-E006
```

JSON is the automation contract:

```bash
earsyntax validate requirements.ears --profile strict --json
```

SARIF is available from `validate`:

```bash
earsyntax validate requirements.ears \
  --profile strict \
  --sarif > earsyntax.sarif
```

Exit codes:

| Code | Meaning                                                      |
| ---- | ------------------------------------------------------------ |
| `0`  | Command succeeded and validation found no error diagnostics  |
| `1`  | Validation completed and found at least one error diagnostic |
| `2`  | Usage or environment failure                                 |

Warnings do not return `1` unless `validate --strict` upgrades surviving warnings to errors.

## Command-scoped options

Options belong to commands rather than to one universal flag set.

| Command                         | Relevant options                                                          |
| ------------------------------- | ------------------------------------------------------------------------- |
| `validate`                      | `--profile`, `--json`, `--sarif`, `--strict`, `--quiet`, `--cwd`          |
| `extract`                       | `--profile`, `--json`, `--quiet`, `--cwd`                                 |
| `instructions`                  | `--file`, `--from`, `--profile`, `--strict`, `--json`, `--quiet`, `--cwd` |
| `init`                          | `--agent`, `--host`, `--cwd`                                              |
| `version`                       | `--features`, `--json`                                                    |
| `doctor`, `explain`, `profiles` | `--json`, `--quiet`, `--cwd`                                              |

`--json`, `--quiet`, and `--cwd` are the broadly shared facade options. Other flags are command-specific.

## CI

Example for Kiro requirements:

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

      - name: Validate Kiro requirements
        run: npx earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro
```

Use `--json` when another tool consumes findings. Use `--sarif` for code-scanning integrations.

## Library API

`@earsyntax/core` exposes the deterministic parser and linter:

```ts
import { lintEars } from "@earsyntax/core";

const result = lintEars(
  "When a payment webhook arrives, the billing service shall verify the signature.",
);

console.log(result.valid);
console.log(result.pattern);
```

Packages:

| Package                   | Role                                                    |
| ------------------------- | ------------------------------------------------------- |
| `@earsyntax/cli`          | Public command facade and `earsyntax` binary            |
| `@earsyntax/core`         | Parser, linter, diagnostics, findings, and profile data |
| `@earsyntax/extract`      | Candidate extraction and host-aware validation pipeline |
| `@earsyntax/cli-contract` | Shared JSON, exit-code, findings, and SARIF contracts   |

## Documentation

- [Agentic loop](docs/agentic-loop.md)
- [CLI reference](docs/cli.md)
- [Diagnostics](docs/diagnostics.md)
- [Grammar](docs/grammar.md)
- [Input formats](docs/input-formats.md)
- [Library API](docs/api.md)
- [Facade API](docs/facade-api.md)

## Development

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm --filter @earsyntax/cli test
pnpm format:check
```

## License

Apache-2.0
