# EARS JS Claude Code Agent Orchestration

This file is the operating brief for a Claude Code manager agent and the implementation agents it activates to build a Node.js and TypeScript toolkit for EARS, the Easy Approach to Requirements Syntax.

The intended outcome is a deterministic parser, linter, extractor, and CLI facade for EARS requirements. The facade lets any coding agent convert natural-language requirements into `.ears` files through a controlled loop: get instructions, write the artifact, validate it, repair it, and hand it to a human for review.

## Initiative Summary

Build an EARS toolkit for Node.js:

```text
@earsyntax/core       parser, AST, linter, diagnostics
@earsyntax/extract    Markdown, .ears, YAML, and JSON requirement extraction
@earsyntax/cli        CLI facade for humans, scripts, and coding agents
```

The first release must be deterministic. It must not use an LLM, fuzzy matching, network calls, or runtime-specific plugins in the parser core. Agentic conversion from prose to `.ears` happens in the coding agent, guided by CLI-provided instructions and checked by CLI validation.

## Source Anchors

Use these references when defining behavior:

| Source                                            | Use                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| https://alistairmavin.com/ears/                   | Canonical EARS pattern definitions and clause ordering principles.                                |
| https://pkg.go.dev/github.com/labeth/ears-lint-go | Practical Go reference for AST shape, diagnostics, catalog matching, and strict/guided behavior.  |
| https://github.com/XpycT/ears-spec-engine         | Useful TypeScript workflow inspiration, but not the parser core.                                  |
| https://github.github.com/spec-kit/               | Agentic SDD reference: spec, clarify, plan, checklist, tasks, analyze, implement, converge.       |
| https://openspec.dev/docs                         | CLI facade reference: setup, status, validate, instructions, JSON outputs for agents.             |
| https://kiro.dev/docs/specs/                      | Spec artifact reference: requirements, design, tasks, plus quick-spec mode.                       |
| https://github.com/dhruv-15-03/spec-kit-ears      | Prior EARS extension reference: author, lint, convert, traceability, additive artifact rules.     |
| `ears-research-claude.md`                         | Market, positioning, distribution, HN critique, and public-claim caveats. Not a parser authority. |

## Manager Prompt

Use this prompt for the Claude Code manager agent.

```text
You are the orchestration manager for the EARS JS initiative.

Goal:
Build a Node.js and TypeScript toolkit for EARS, the Easy Approach to Requirements Syntax. The first release must provide deterministic parsing, linting, diagnostics, extraction, and a CLI.

Primary references:
- Canonical EARS guide: https://alistairmavin.com/ears/
- Go parser/linter reference: https://pkg.go.dev/github.com/labeth/ears-lint-go
- TypeScript workflow inspiration: https://github.com/XpycT/ears-spec-engine
- Agentic SDD reference: https://github.github.com/spec-kit/
- CLI facade reference: https://openspec.dev/docs
- Spec artifact reference: https://kiro.dev/docs/specs/
- Prior EARS extension reference: https://github.com/dhruv-15-03/spec-kit-ears
- Local research brief: ears-research-claude.md

Important exclusion:
- Ignore xmidt-org/ears for this initiative. It is Event Async Routing Service, not Easy Approach to Requirements Syntax.

Your job:
1. Freeze the public contracts before parallel implementation starts.
2. Assign agents by ownership area.
3. Prevent agents from changing shared types, diagnostic codes, or fixture format without explicit manager approval.
4. Keep @earsyntax/core deterministic and runtime-independent.
5. Require every implementation agent to add tests with its code.
6. Integrate only after package-level tests pass.
7. Produce a release candidate with examples, docs, CLI verification, and an agent-facing spec-to-.ears loop.

Default constraints:
- Use TypeScript.
- Preserve source spans in parser output and diagnostics.
- Prefer small hand-written parsers over regex-only validation.
- Keep parser/linter behavior deterministic.
- Do not add LLM calls to @earsyntax/core.
- Do not make @earsyntax/core depend on the CLI, file system, editor APIs, or workflow packages.
- The CLI binary is `earsyntax`, shipped by `@earsyntax/cli` from `packages/cli`.
- Do not call the command `ears-lint`; linting is one command within the `earsyntax` facade.
- Semantic derivation from natural-language specs is performed by the external coding agent, not by deterministic core.
```

## Product Boundary

The project is not a Cucumber clone in v1.

The project parses and validates requirements like:

```text
When a payment webhook is received, the billing service shall verify the HMAC signature.
If the HMAC signature is invalid, then the billing service shall reject the webhook.
While the payment provider is unavailable, the billing service shall queue retryable events.
```

It returns structured results:

```json
{
  "valid": true,
  "pattern": "event-driven",
  "ast": {
    "pattern": "event-driven",
    "trigger": {
      "kind": "term",
      "text": "a payment webhook is received"
    },
    "system": {
      "raw": "billing service",
      "role": "system"
    },
    "responses": ["verify the HMAC signature"],
    "raw": "When a payment webhook is received, the billing service shall verify the HMAC signature."
  },
  "references": [],
  "diagnostics": []
}
```

The parser validates `.ears` files. It does not infer product intent from prose.

The CLI facade owns the workflow around parser validation:

```text
source spec markdown, PRD, issue, or prompt
  -> earsyntax instructions author|convert
  -> coding agent writes .ears
  -> earsyntax validate
  -> coding agent repairs
  -> earsyntax validate --strict
  -> human reviews
  -> earsyntax accept
```

Later packages may generate acceptance-test skeletons or spec-driven documents, but that is separate from the parser.

## Agentic Loop Boundary

Earsyntax must keep three responsibilities separate.

| Owner        | Responsibility                                                                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI facade   | Resolve paths, create work directories, return instructions, validate artifacts, report status, record acceptance, detect stale source hashes.                         |
| Coding agent | Read the natural-language source, decide which behaviors are requirements, write or repair `.ears` content, and surface questions when the source is ambiguous.        |
| Human        | Approve behavior, answer ambiguity questions, accept or reject generated `.ears`, and decide whether generated requirements should be copied into another spec system. |

The CLI must not pretend to understand the source spec semantically. It can inspect structure, hash files, extract existing EARS statements, validate EARS grammar, and provide conversion rules. The coding agent performs prose-to-EARS translation.

## Workflow Lessons From Other Tools

Use these observations when designing the facade.

| Tool            | Lesson for Earsyntax                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec Kit        | Agentic commands are workflow steps. Invocation differs by agent, so the durable contract must be files plus CLI output, not a slash-command name.                                    |
| OpenSpec        | Terminal commands should expose JSON for agents: `status`, `validate`, `instructions`, templates, and next steps. Human commands and agent commands can share a binary.               |
| Kiro            | Requirements, design, and tasks are separate artifacts. Quick paths are useful, but review gates matter when requirements quality matters.                                            |
| `spec-kit-ears` | Author, lint, and convert are the right user verbs. EARS artifacts should be additive and traceable, and unclear source text should become questions instead of guessed requirements. |

## Research Findings To Preserve

The local research brief `ears-research-claude.md` is a positioning and ecosystem input. It should shape roadmap and launch priorities, but it must not override the parser contract.

### Open Lane

The practical opportunity is a deterministic, git-friendly, CI-friendly EARS parser/linter/facade for JavaScript and TypeScript projects.

The research brief argues that the public EARS tooling ecosystem is fragmented:

- many prompt packs, agent skills, and small editor helpers
- enterprise requirements-quality tools with GUI or vendor workflows
- no obvious dominant JS/TS package that acts like `eslint` for `.ears`
- no official formal grammar published by Mavin's site

Treat this as the wedge:

```text
Earsyntax is ESLint for EARS requirements.
It is deterministic, offline, scriptable, and agent-agnostic.
```

Do not frame v0.1 as a full requirements-management platform, a methodology, or an agentic IDE feature.

### Grammar-First Moat

The research brief's strongest technical recommendation is to publish a formal grammar as a product artifact.

For implementation, this means:

- `docs/grammar.md` is not optional polish; it is part of the product.
- the grammar should be written in a readable EBNF-like form before launch
- the test fixture corpus should be traceable to grammar rules
- unsupported edge cases should be documented as deliberate grammar choices
- future tree-sitter or language-server work should consume the same grammar decisions

The grammar does not need to be the only possible interpretation of EARS. It needs to be stable, documented, deterministic, and aligned with Mavin's public rules.

### Public Claim Policy

The research brief contains discovery claims that may change or conflict with local/internal verification. Before public docs, launch posts, README claims, or issue comments mention ecosystem status, the release agent must reverify:

- whether `labeth/ears-lint-go` is public and still available
- whether `XpycT/ears-spec-engine` or `ears-spec-engine` is public and still available
- current package names, stars, issues, and maintainer responses
- Spec Kit issue numbers, dates, and status
- Kiro, OpenSpec, StrictDoc, and related integration status

Internal implementation can still use reachable repos as references. Public messaging must not say "does not exist," "unclaimed," "first," or "only" unless those claims are freshly checked near release.

### Launch Positioning

If this becomes public, lead with determinism and reproducibility:

- zero LLM in parser/linter
- offline
- sub-second local CLI
- JSON output for agents
- CI exit codes
- source-to-`.ears` traceability
- stale-source detection
- a formal grammar and fixture corpus

Avoid leading with "spec-driven development" as a methodology. HN and practitioner audiences may hear that as waterfall. Better framing:

```text
Earsyntax is a deterministic lint gate for requirements text that teams and agents already write.
```

### Distribution Targets

Keep the first integrations lightweight and additive:

- Spec Kit: offer Earsyntax as the validator behind EARS-related commands or templates
- OpenSpec: provide an external validator/facade rather than a forked workflow
- Kiro: validate `.kiro/specs/**/requirements.md` or generated `.ears` files
- StrictDoc/Doorstop/sphinx-needs: position as a reusable grammar/linter engine
- Claude/Codex/Cursor: provide wrapper prompts or command files that call the same CLI facade

Do not make any integration a hard dependency of `@earsyntax/core` or `@earsyntax/cli`.

## Workspace Layout

Default Earsyntax work should be self-contained and tool-agnostic.

```text
.earsyntax/
  config.json
  work/
    checkout-webhooks/
      manifest.json
      source.md
      requirements.ears
      questions.md
      validation.json
      validation.md
      traceability.json
```

The source file is not copied by default unless the user passes `--snapshot-source`. `manifest.json` stores the source path, source hash, output path, status, timestamps, and acceptance metadata.

Recommended status states:

```text
missing -> scaffolded -> drafted -> invalid -> valid -> accepted -> stale
```

`stale` means the source hash changed after the last valid or accepted `.ears` file.

## Package Ownership

| Package              | Purpose                                                         | Depends On                               |
| -------------------- | --------------------------------------------------------------- | ---------------------------------------- |
| `@earsyntax/core`    | Parse, lint, classify, catalog-match, and produce diagnostics.  | None outside standard runtime libraries. |
| `@earsyntax/extract` | Extract EARS statements from common file formats.               | `@earsyntax/core` types only.            |
| `@earsyntax/cli`     | Provide the `earsyntax` facade for humans, scripts, and agents. | `@earsyntax/core`, `@earsyntax/extract`. |

## Shared Public API

The architect agent owns this API. Other agents may propose changes but must not commit incompatible changes without manager approval.

```ts
export function lintEars(text: string, catalog?: Catalog, options?: Options): LintResult;

export function lintEarsBatch(
  items: RequirementInput[],
  catalog?: Catalog,
  options?: Options,
): LintResult[];

export function parseEars(text: string, catalog?: Catalog, options?: Options): ParseResult;
```

Recommended types:

```ts
export type Mode = 'strict' | 'guided';

export type Pattern =
  | 'ubiquitous'
  | 'state-driven'
  | 'event-driven'
  | 'optional-feature'
  | 'unwanted-behaviour'
  | 'complex';

export interface Options {
  mode?: Mode;
  commaAsAnd?: boolean;
  vagueTerms?: string[];
}

export interface RequirementInput {
  id?: string;
  text: string;
  source?: SourceLocation;
}

export interface LintResult {
  id?: string;
  valid: boolean;
  pattern?: Pattern;
  ast?: EarsAst;
  references: ReferenceMatch[];
  diagnostics: Diagnostic[];
}

export interface ParseResult {
  pattern?: Pattern;
  ast?: EarsAst;
  diagnostics: Diagnostic[];
}

export interface EarsAst {
  pattern: Pattern;
  preconditions?: ClauseExpr;
  trigger?: ClauseExpr;
  feature?: ClauseExpr;
  unwanted?: ClauseExpr;
  system: TermMatch;
  responses: string[];
  raw: string;
}

export type ClauseExpr = TermExpr | AndExpr | OrExpr | NotExpr | GroupExpr | FreeTextExpr;

export interface TermExpr {
  kind: 'term';
  span?: Span;
  text: string;
  term?: TermMatch;
}

export interface AndExpr {
  kind: 'and';
  span?: Span;
  items: ClauseExpr[];
}

export interface OrExpr {
  kind: 'or';
  span?: Span;
  items: ClauseExpr[];
}

export interface NotExpr {
  kind: 'not';
  span?: Span;
  item: ClauseExpr;
}

export interface GroupExpr {
  kind: 'group';
  span?: Span;
  item: ClauseExpr;
}

export interface FreeTextExpr {
  kind: 'free-text';
  span?: Span;
  text: string;
}

export interface Span {
  start: number;
  end: number;
}
```

## Supported EARS Shell Patterns

The core parser must support these shell patterns in v1:

| Pattern            | Template                                                   |
| ------------------ | ---------------------------------------------------------- |
| Ubiquitous         | `The <system> shall <response>`                            |
| State-driven       | `While <expr>, the <system> shall <response>`              |
| Event-driven       | `When <expr>, the <system> shall <response>`               |
| Optional feature   | `Where <expr>, the <system> shall <response>`              |
| Unwanted behaviour | `If <expr>, then the <system> shall <response>`            |
| Complex            | Any supported combination with more than one shell clause. |

Default accepted shell clause order:

```text
While* -> Where* -> When* -> If* -> the <system> shall <response>
```

The parser should be case-insensitive for shell keywords:

```text
while
WHILE
While
The
THE
shall
SHALL
```

The formatter may choose a house style, but parsing must not require uppercase keywords.

## Clause Expression Grammar

Inside `While`, `Where`, `When`, and `If` clauses, support:

```text
A and B
A or B
not A
(A or B) and C
```

Precedence:

```text
not > and > or
```

Comma handling:

| Option              | Behavior                                                               |
| ------------------- | ---------------------------------------------------------------------- |
| `commaAsAnd: false` | A comma ends a shell clause only.                                      |
| `commaAsAnd: true`  | Commas inside clause bodies may be treated as `and` where unambiguous. |

## Catalog Matching

Catalog matching must be deterministic.

```ts
export interface Catalog {
  systems?: CatalogEntry[];
  actors?: CatalogEntry[];
  events?: CatalogEntry[];
  states?: CatalogEntry[];
  features?: CatalogEntry[];
  modes?: CatalogEntry[];
  conditions?: CatalogEntry[];
  dataTerms?: CatalogEntry[];
}

export interface CatalogEntry {
  id: string;
  name: string;
  aliases?: string[];
}
```

Match policy:

1. Exact canonical name.
2. Exact alias.
3. Ambiguous if more than one entry matches.
4. Unresolved if no entry matches.

No fuzzy matching in v1.

## Diagnostic Codes

The diagnostics agent owns the registry. These codes are the initial shared set.

| Code                               | Meaning                                                             |
| ---------------------------------- | ------------------------------------------------------------------- |
| `ears.no_match`                    | The text does not match any supported EARS shell.                   |
| `ears.invalid_clause_order`        | Shell clauses appear in an unsupported order.                       |
| `ears.missing_system`              | The system name is absent or empty.                                 |
| `ears.missing_shall`               | The requirement does not contain a valid `shall` response boundary. |
| `ears.multiple_shall`              | The requirement contains more than one shell-level `shall`.         |
| `ears.invalid_if_then_form`        | An `If` clause is missing the required `then` boundary.             |
| `ears.empty_clause`                | A `While`, `Where`, `When`, or `If` clause body is empty.           |
| `ears.empty_response`              | The response after `shall` is empty.                                |
| `expr.unbalanced_parentheses`      | Parentheses in a clause expression are not balanced.                |
| `expr.invalid_operator_sequence`   | Operators such as `and`, `or`, or `not` are malformed.              |
| `expr.empty_subexpression`         | A grouped expression or operator operand is empty.                  |
| `expr.operator_precedence_warning` | A mixed `and` and `or` expression may need parentheses.             |
| `expr.unknown_term`                | A clause term cannot be matched to the expected catalog role.       |
| `expr.ambiguous_term`              | A clause term matches more than one catalog entry.                  |
| `catalog.system_unresolved`        | The system name does not match a known system.                      |
| `catalog.system_ambiguous`         | The system name matches more than one known system.                 |
| `catalog.state_unresolved`         | A state term is unknown.                                            |
| `catalog.event_unresolved`         | An event term is unknown.                                           |
| `catalog.feature_unresolved`       | A feature term is unknown.                                          |
| `lint.multiple_responses`          | The response contains multiple semicolon-separated responses.       |
| `lint.vague_response`              | The response contains a configured vague term.                      |
| `lint.unparsed_tail`               | Text remains after the parsed requirement.                          |
| `lint.alias_used`                  | A catalog alias matched, but canonical naming is preferred.         |
| `lint.suspicious_text_shape`       | The sentence shape is likely accidental or malformed.               |

Severity rules:

| Mode     | Behavior                                                                          |
| -------- | --------------------------------------------------------------------------------- |
| `strict` | Structural parse failures and unresolved systems are errors.                      |
| `guided` | Structural parse failures may be warnings where partial AST recovery is possible. |

`valid` is `false` if any diagnostic has severity `error`; otherwise `true`.

## Input Formats

The extractor package must support common authoring locations.

### `.ears`

One requirement per non-empty line:

```text
REQ-001: When a payment webhook is received, the billing service shall verify the HMAC signature.
REQ-002: If the HMAC signature is invalid, then the billing service shall reject the webhook.
```

### Markdown

Support bullets, numbered lists, and tables:

```md
- REQ-001: When a payment webhook is received, the billing service shall verify the HMAC signature.
- REQ-002: If the HMAC signature is invalid, then the billing service shall reject the webhook.
```

```md
| ID      | Requirement                                                                              |
| ------- | ---------------------------------------------------------------------------------------- |
| REQ-001 | When a payment webhook is received, the billing service shall verify the HMAC signature. |
```

### YAML

```yaml
requirements:
  - id: REQ-001
    text: When a payment webhook is received, the billing service shall verify the HMAC signature.
```

### JSON

```json
{
  "requirements": [
    {
      "id": "REQ-001",
      "text": "When a payment webhook is received, the billing service shall verify the HMAC signature."
    }
  ]
}
```

## CLI Facade Contract

The CLI agent owns the `earsyntax` binary. This is the stable facade that humans, scripts, and agent-specific wrappers use.

The package is:

```text
packages/cli
@earsyntax/cli
```

The binary is:

```bash
earsyntax
```

Do not expose `ears-lint` as the primary command. Linting and validation are subcommands of `earsyntax`.

### Facade Principles

1. Every agent-compatible command supports `--json`.
2. Every JSON response includes `version`, `command`, `ok`, and `next`.
3. Commands that write files state every written path in JSON.
4. Commands that inspect or validate never modify files.
5. `instructions` commands are read-only.
6. `validate` is deterministic and never asks questions.
7. Agent wrappers are thin: they call `earsyntax instructions`, write files, then call `earsyntax validate`.
8. The CLI never silently overwrites a human-edited `.ears` file.
9. The CLI never edits the source spec by default.
10. Acceptance records source hashes so changed specs become `stale`.

### Global Options

These options should work where they make sense:

```bash
earsyntax <command> --json
earsyntax <command> --no-color
earsyntax <command> --cwd <path>
earsyntax <command> --config <path>
earsyntax <command> --no-interactive
```

### Command Summary

| Command                  | Purpose                                                         | Agent-Compatible |
| ------------------------ | --------------------------------------------------------------- | ---------------- |
| `earsyntax init`         | Initialize `.earsyntax/` and optional agent command/rule files. | Yes              |
| `earsyntax doctor`       | Read-only project health report.                                | Yes              |
| `earsyntax version`      | Version and feature discovery.                                  | Yes              |
| `earsyntax new`          | Create a work item for a source spec or prompt.                 | Yes              |
| `earsyntax list`         | List EARS work items.                                           | Yes              |
| `earsyntax status`       | Show one work item's state and next steps.                      | Yes              |
| `earsyntax instructions` | Return the exact rules an agent should follow for a step.       | Yes              |
| `earsyntax validate`     | Validate `.ears` files and emit diagnostics.                    | Yes              |
| `earsyntax accept`       | Mark a valid `.ears` artifact as human-accepted.                | Partly           |
| `earsyntax show`         | Show resolved artifact paths or content.                        | Yes              |
| `earsyntax export`       | Export accepted `.ears` to another representation.              | Later            |

### `earsyntax init`

Initialize Earsyntax in the current project.

```bash
earsyntax init
earsyntax init --tools claude,codex,cursor
earsyntax init --tools none --json
earsyntax init --force
```

Expected writes:

```text
.earsyntax/config.json
.earsyntax/work/.gitkeep
```

Optional tool writes:

```text
.claude/commands/earsyntax-author.md
.claude/commands/earsyntax-convert.md
.claude/commands/earsyntax-repair.md
AGENTS.md section or tool-specific equivalent
```

Tool support is a convenience layer. The workflow must still work when `--tools none` is used.

JSON shape:

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
      "reason": "Create a work item for a source spec"
    }
  ]
}
```

### `earsyntax doctor`

Report project health without making changes.

```bash
earsyntax doctor
earsyntax doctor --json
```

Checks:

- `.earsyntax/config.json` exists and parses
- configured work directory exists
- package version supports the requested facade features
- referenced sources still exist
- accepted work items are not stale
- tool wrapper files are present if configured

### `earsyntax version`

Expose installed capabilities for scripts and agents.

```bash
earsyntax version
earsyntax version --features
earsyntax version --features --json
```

Feature JSON should let an agent choose a supported path without guessing:

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

### `earsyntax new`

Create a work item. This command does not generate EARS content. It prepares the place where the agent will write it.

Convert an existing source spec:

```bash
earsyntax new checkout-webhooks --source specs/checkout.md --mode convert --json
```

Author from a prompt:

```bash
earsyntax new checkout-webhooks --prompt "Checkout webhooks must validate signatures and record successful payments." --mode author --json
```

Use an explicit output path:

```bash
earsyntax new checkout-webhooks --source .kiro/specs/checkout/requirements.md --out .kiro/specs/checkout/requirements.ears --json
```

Default output:

```text
.earsyntax/work/<slug>/requirements.ears
```

Default work item files:

```text
.earsyntax/work/<slug>/manifest.json
.earsyntax/work/<slug>/requirements.ears
.earsyntax/work/<slug>/questions.md
.earsyntax/work/<slug>/traceability.json
```

JSON shape:

```json
{
  "version": "0.1.0",
  "command": "new",
  "ok": true,
  "work": {
    "id": "checkout-webhooks",
    "mode": "convert",
    "status": "scaffolded",
    "source": "specs/checkout.md",
    "sourceHash": "sha256:...",
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
      "reason": "Give the coding agent rules for writing the .ears file"
    }
  ]
}
```

### `earsyntax instructions`

Return agent-facing instructions. This is the key facade command.

```bash
earsyntax instructions author --work checkout-webhooks --json
earsyntax instructions convert --work checkout-webhooks --json
earsyntax instructions repair --work checkout-webhooks --json
earsyntax instructions review --work checkout-webhooks --json
```

Instruction modes:

| Mode      | Use                                                        |
| --------- | ---------------------------------------------------------- |
| `author`  | Turn a prompt or brief into a first `.ears` draft.         |
| `convert` | Convert an existing Markdown/spec/PRD source into `.ears`. |
| `repair`  | Repair a `.ears` file after validation diagnostics.        |
| `review`  | Produce a human review checklist for a valid `.ears` file. |

JSON shape:

```json
{
  "version": "0.1.0",
  "command": "instructions convert",
  "ok": true,
  "work": {
    "id": "checkout-webhooks",
    "source": "specs/checkout.md",
    "output": ".earsyntax/work/checkout-webhooks/requirements.ears",
    "questions": ".earsyntax/work/checkout-webhooks/questions.md",
    "traceability": ".earsyntax/work/checkout-webhooks/traceability.json"
  },
  "rules": [
    "Read the source before writing requirements.",
    "Write only EARS requirements in the .ears output file.",
    "Use one requirement per line.",
    "Give every requirement a stable ID.",
    "Preserve source traceability with source file and line references when possible.",
    "Do not invent behavior that is not present in the source.",
    "Do not hide ambiguity inside vague wording.",
    "Split compound behavior into separate requirements.",
    "Use questions.md for unclear behavior instead of guessing.",
    "Do not edit the source spec unless the user explicitly asks."
  ],
  "format": {
    "line": "REQ-001 [source: specs/checkout.md:14]: When <trigger>, the <system> shall <response>.",
    "allowedPatterns": [
      "The <system> shall <response>.",
      "When <trigger>, the <system> shall <response>.",
      "While <state>, the <system> shall <response>.",
      "Where <feature>, the <system> shall <response>.",
      "If <condition>, then the <system> shall <response>."
    ]
  },
  "next": [
    {
      "command": "earsyntax validate .earsyntax/work/checkout-webhooks/requirements.ears --source specs/checkout.md --json",
      "reason": "Validate the generated .ears file"
    }
  ]
}
```

### `earsyntax validate`

Validate `.ears` files deterministically.

```bash
earsyntax validate .earsyntax/work/checkout-webhooks/requirements.ears
earsyntax validate .earsyntax/work/checkout-webhooks/requirements.ears --source specs/checkout.md --json
earsyntax validate "specs/**/*.ears" --catalog catalog.json --format json
earsyntax validate "specs/**/*.ears" --format sarif
earsyntax validate requirements.ears --mode guided
earsyntax validate requirements.ears --mode strict
earsyntax validate requirements.ears --comma-as-and
```

Validation responsibilities:

- parse EARS shell syntax
- parse clause expressions
- apply catalog matching when a catalog is supplied
- validate stable IDs
- validate optional source references
- detect vague terms
- detect multiple responses
- detect source-hash staleness when run against a work item
- emit diagnostics and next steps

JSON shape:

```json
{
  "version": "0.1.0",
  "command": "validate",
  "ok": false,
  "summary": {
    "files": 1,
    "requirements": 7,
    "valid": 5,
    "errors": 2,
    "warnings": 1
  },
  "results": [
    {
      "id": "REQ-002",
      "file": ".earsyntax/work/checkout-webhooks/requirements.ears",
      "line": 2,
      "valid": false,
      "pattern": "unwanted-behaviour",
      "diagnostics": [
        {
          "code": "ears.invalid_if_then_form",
          "severity": "error",
          "message": "If requirements must include a then boundary before the system response.",
          "span": { "start": 0, "end": 42 }
        }
      ]
    }
  ],
  "next": [
    {
      "command": "earsyntax instructions repair --work checkout-webhooks --json",
      "reason": "Give the coding agent targeted repair rules"
    }
  ]
}
```

### `earsyntax status`

Show the state of a work item.

```bash
earsyntax status
earsyntax status checkout-webhooks
earsyntax status checkout-webhooks --json
```

JSON shape:

```json
{
  "version": "0.1.0",
  "command": "status",
  "ok": true,
  "work": {
    "id": "checkout-webhooks",
    "status": "valid",
    "source": "specs/checkout.md",
    "output": ".earsyntax/work/checkout-webhooks/requirements.ears",
    "sourceHash": "sha256:...",
    "acceptedHash": null,
    "stale": false
  },
  "next": [
    {
      "command": "earsyntax instructions review --work checkout-webhooks --json",
      "reason": "Prepare human review"
    },
    {
      "command": "earsyntax accept checkout-webhooks",
      "reason": "Record acceptance after human approval"
    }
  ]
}
```

### `earsyntax accept`

Record that a human accepted the generated `.ears` file.

```bash
earsyntax accept checkout-webhooks
earsyntax accept checkout-webhooks --by "omer" --json
```

Rules:

- refuse if current status is not `valid`
- refuse if the source hash is stale
- write acceptance metadata to `manifest.json`
- do not modify the source spec
- do not modify the `.ears` content

### `earsyntax show`

Resolve paths or print content.

```bash
earsyntax show checkout-webhooks --json
earsyntax show checkout-webhooks --artifact requirements
earsyntax show checkout-webhooks --artifact questions
earsyntax show checkout-webhooks --artifact validation --json
```

### `earsyntax list`

List work items.

```bash
earsyntax list
earsyntax list --json
earsyntax list --status stale --json
```

### `earsyntax export`

Planned, not required for v0.1. Export accepted `.ears` into other systems without making those systems dependencies of core.

Potential forms:

```bash
earsyntax export checkout-webhooks --format markdown
earsyntax export checkout-webhooks --format json
earsyntax export checkout-webhooks --format speckit
earsyntax export checkout-webhooks --format openspec
earsyntax export checkout-webhooks --format kiro
```

### Exit Codes

| Code | Meaning                                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------------- |
| `0`  | Command completed and no error diagnostics were produced.                                                  |
| `1`  | Validation completed and at least one error diagnostic exists.                                             |
| `2`  | CLI usage, config, missing file, unparseable JSON/YAML, or work item resolution error.                     |
| `3`  | Refused write, stale source, overwrite protection, or human confirmation required in non-interactive mode. |

### Agentic Conversion Loop

Agent-specific slash commands or skills should be wrappers around this sequence:

```bash
earsyntax new checkout-webhooks --source specs/checkout.md --mode convert --json
earsyntax instructions convert --work checkout-webhooks --json
# agent writes .earsyntax/work/checkout-webhooks/requirements.ears
earsyntax validate .earsyntax/work/checkout-webhooks/requirements.ears --source specs/checkout.md --json
# if invalid:
earsyntax instructions repair --work checkout-webhooks --json
# agent repairs and reruns validate until clean
earsyntax status checkout-webhooks --json
```

The loop ends with a human review and explicit acceptance:

```bash
earsyntax instructions review --work checkout-webhooks --json
earsyntax accept checkout-webhooks
```

## Facade Data Contracts

All facade JSON should be stable, camelCase, and path-explicit. Paths are relative to the resolved project root unless an absolute path was supplied.

### Base Response

Every `--json` command returns this shape:

```ts
export interface FacadeResponse<T = unknown> {
  version: string;
  command: string;
  ok: boolean;
  root?: string;
  data?: T;
  diagnostics?: FacadeDiagnostic[];
  next: NextAction[];
}

export interface NextAction {
  command: string;
  reason: string;
  blocking?: boolean;
  forAgent?: boolean;
}

export interface FacadeDiagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  path?: string;
  line?: number;
}
```

Command-specific examples may also expose top-level convenience keys such as `work`, `written`, `summary`, and `results`, but the base fields must always exist.

### Work Manifest

`earsyntax new` creates and later commands update this manifest:

```ts
export type WorkMode = 'author' | 'convert';

export type WorkStatus =
  'missing' | 'scaffolded' | 'drafted' | 'invalid' | 'valid' | 'accepted' | 'stale';

export interface WorkManifest {
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

### Instruction Response

`earsyntax instructions <mode> --json` returns:

```ts
export interface InstructionResponse {
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

export interface WorkSummary {
  id: string;
  status: WorkStatus;
  source?: string;
  output: string;
  questions: string;
  traceability: string;
}

export interface SourceExcerpt {
  path: string;
  startLine: number;
  endLine: number;
  text: string;
}
```

### Validation Response

`earsyntax validate --json` returns:

```ts
export interface ValidationResponse {
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

export interface ValidationResult {
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

### Traceability Contract

Agents maintain traceability; the CLI validates only structure and references when possible.

```ts
export interface TraceabilityFile {
  requirements: RequirementTrace[];
  questions: QuestionTrace[];
}

export interface RequirementTrace {
  id: string;
  source?: {
    path: string;
    startLine?: number;
    endLine?: number;
    quote?: string;
  };
  pattern?: Pattern;
  confidence?: 'high' | 'medium' | 'low';
  notes?: string[];
}

export interface QuestionTrace {
  source?: {
    path: string;
    startLine?: number;
    endLine?: number;
  };
  question: string;
  blocksRequirements?: string[];
}
```

## Spec-To-EARS Agent Rules

These rules are what `earsyntax instructions author|convert|repair|review` should return to coding agents. Agent-specific command files may summarize them, but the CLI JSON is the source of truth.

### Read The Source First

Before writing `.ears`, the agent must read the full source artifact:

- Spec Kit `spec.md`
- OpenSpec `proposal.md`, delta specs, or `spec.md`
- Kiro `requirements.md`
- PRD Markdown
- issue description
- design brief
- any user-supplied Markdown, YAML, JSON, or plain text

The agent must identify:

- actors and users
- systems or components under requirement
- events that trigger behavior
- states where behavior applies
- optional features or feature flags
- unwanted or error conditions
- observable system responses
- constraints that are genuinely requirements
- ambiguous source statements that require human clarification

### Write Only Requirements

The `.ears` file should contain one requirement per non-empty line. No explanatory paragraphs belong in the `.ears` file.

Use this line format:

```text
REQ-001 [source: specs/checkout.md:14]: When a payment webhook is received, the billing service shall verify the HMAC signature.
```

Allowed metadata prefix:

```text
REQ-001:
REQ-001 [source: path:line]:
REQ-001 [source: path:line-line]:
```

The parser must accept bare requirement lines without metadata, but agent-generated `.ears` files should include stable IDs and source references whenever possible.

### Classify Each Requirement

Use the narrowest EARS pattern that fits the source behavior.

| Source Shape                                                   | EARS Pattern       | Template                                              |
| -------------------------------------------------------------- | ------------------ | ----------------------------------------------------- |
| Always true system behavior                                    | Ubiquitous         | `The <system> shall <response>.`                      |
| Triggered by an event                                          | Event-driven       | `When <trigger>, the <system> shall <response>.`      |
| Applies only during a state                                    | State-driven       | `While <state>, the <system> shall <response>.`       |
| Applies only when a feature exists or is enabled               | Optional feature   | `Where <feature>, the <system> shall <response>.`     |
| Handles an error, invalid input, threat, or unwanted condition | Unwanted behaviour | `If <condition>, then the <system> shall <response>.` |
| Requires multiple shell clauses                                | Complex            | `While ..., when ..., the <system> shall ...`         |

Do not force everything into `When`. If the source says behavior applies during maintenance mode, use `While`. If the source says behavior applies only with enterprise SSO enabled, use `Where`. If the source describes an invalid or exceptional condition, use `If ..., then`.

### Split Compound Source Text

Split compound source requirements into separate EARS requirements when the response contains more than one observable obligation.

Source:

```text
When a webhook arrives, validate the signature, persist the event, and enqueue a job.
```

Generated:

```text
REQ-001 [source: specs/checkout.md:12]: When a webhook arrives, the billing service shall validate the signature.
REQ-002 [source: specs/checkout.md:12]: When a webhook arrives, the billing service shall persist the event.
REQ-003 [source: specs/checkout.md:12]: When a webhook arrives, the billing service shall enqueue a processing job.
```

Do not split when the second phrase is only a qualifier of the first response.

### Do Not Invent Behavior

The agent must not add behavior because it seems reasonable, common, secure, scalable, or useful. If the source does not state the behavior, the `.ears` file should not contain it.

Examples of forbidden inventions:

- adding audit logging because security is mentioned
- adding retry behavior because webhooks are involved
- adding rate limits because the endpoint is public
- adding admin permissions because a dashboard is mentioned
- adding database persistence because a UI displays data

If the missing behavior matters, write a question.

### Put Ambiguity In Questions

When source text is vague, conflicting, or underspecified, the agent must write questions to `questions.md`, not invent a precise requirement.

Question format:

```md
- [REQ?] Source `specs/checkout.md:18` says "notify the customer quickly." What channel should be used, and what is the time bound?
```

Ambiguity triggers:

- vague terms such as `fast`, `quickly`, `appropriate`, `user-friendly`, `robust`, `as needed`
- missing actor or system
- missing trigger
- missing error response
- conflicting source statements
- implementation detail without observable behavior
- behavior that depends on product judgment

### Preserve Traceability

The agent should maintain `traceability.json` for generated requirements.

```json
{
  "requirements": [
    {
      "id": "REQ-001",
      "source": {
        "path": "specs/checkout.md",
        "startLine": 12,
        "endLine": 12,
        "quote": "When a webhook arrives, validate the signature..."
      },
      "pattern": "event-driven",
      "confidence": "high",
      "notes": []
    }
  ],
  "questions": [
    {
      "source": {
        "path": "specs/checkout.md",
        "startLine": 18
      },
      "question": "What notification channel should be used?",
      "blocksRequirements": ["REQ-007"]
    }
  ]
}
```

Traceability is not a substitute for validation. It gives the human reviewer a way to decide whether the agent faithfully translated the source.

### Repair From Diagnostics

When `earsyntax validate --json` returns diagnostics, the agent must repair the `.ears` file by changing only what the diagnostics justify.

Repair rules:

- preserve requirement IDs unless the duplicate ID diagnostic requires a change
- preserve source references
- preserve the intended behavior
- do not delete failing requirements to make validation pass
- do not weaken a requirement because the wording is harder to parse
- if the intended behavior is unclear, write a question and leave a clear placeholder instead of guessing

### Review Before Accept

Before `earsyntax accept`, the agent should present a review summary:

- how many requirements were generated
- pattern distribution
- unresolved questions
- validation status
- source lines with low-confidence translation
- any behavior that was intentionally not converted

Acceptance is a human decision. Agents can recommend acceptance only when validation is clean and no blocking questions remain.

## Agent Roster

The manager activates agents in this order unless a dependency forces a change.

### 1. Architect Agent

Mission: Freeze the shared contracts and package boundaries.

Owns:

- package graph
- public TypeScript types
- exported API names
- fixture schema
- compatibility policy
- versioning policy

Must not:

- implement parser internals before contracts are reviewed
- add runtime dependencies to `@earsyntax/core`

Deliverables:

- `packages/core/src/types.ts`
- `packages/core/src/index.ts`
- `fixtures/schema.md`
- `docs/public-api.md`

Acceptance:

- all downstream agents can implement against the types without inventing new public shapes
- example JSON output is included
- manager approves API freeze

### 2. Grammar Agent

Mission: Convert EARS references into a formal implementation matrix.

Owns:

- accepted shell patterns
- clause order rules
- strict and guided parsing examples
- invalid example catalog
- edge-case matrix

Must not:

- implement production parser code
- create new patterns without marking them experimental

Deliverables:

- `fixtures/valid/*.json`
- `fixtures/invalid/*.json`
- `docs/grammar.md`

Acceptance:

- every canonical Mavin pattern has at least three valid examples
- unwanted behaviour has first-class examples
- complex requirements include multi-clause examples
- invalid fixtures name expected diagnostic codes

### 3. Shell Parser Agent

Mission: Implement the outer EARS sentence parser.

Owns:

- shell tokenization
- clause boundary detection
- pattern classification
- system and response extraction
- shell-level spans

Must not:

- parse boolean internals beyond passing clause text to the expression parser
- perform catalog matching
- emit diagnostics not registered by the diagnostics agent

Deliverables:

- `packages/core/src/shell-parser.ts`
- shell parser tests

Acceptance:

- parses all supported shell patterns
- classifies complex requirements correctly
- preserves spans for clauses, system, and response
- catches missing `shall`, multiple `shall`, missing system, empty response, and invalid `If ... then ...`

### 4. Expression Parser Agent

Mission: Parse boolean-like expressions inside EARS clauses.

Owns:

- expression tokenizer
- `not`, `and`, `or`, and parentheses
- expression AST
- expression spans
- precedence diagnostics

Must not:

- classify EARS shell patterns
- perform system parsing
- perform file extraction

Deliverables:

- `packages/core/src/expression-parser.ts`
- expression parser tests

Acceptance:

- implements `not > and > or`
- handles parenthesized groups
- reports unbalanced parentheses
- reports invalid operator sequences
- preserves spans for terms and groups

### 5. Catalog Agent

Mission: Implement deterministic term matching.

Owns:

- catalog normalization
- exact name matching
- exact alias matching
- ambiguous and unresolved references
- role-specific matching helpers

Must not:

- add fuzzy matching
- add semantic matching
- change catalog type names without architect approval

Deliverables:

- `packages/core/src/catalog.ts`
- catalog tests

Acceptance:

- exact canonical matches win
- exact alias matches are identified as aliases
- ambiguous matches list all candidates
- unresolved terms produce deterministic results
- diagnostics are stable across repeated runs

### 6. Diagnostics Agent

Mission: Own diagnostic construction, severity, ordering, and messages.

Owns:

- diagnostic code registry
- strict/guided severity mapping
- stable diagnostic sorting
- diagnostic helper functions
- message wording

Must not:

- couple diagnostics to CLI output
- remove a diagnostic code used by fixtures without manager approval

Deliverables:

- `packages/core/src/diagnostics.ts`
- `docs/diagnostics.md`
- diagnostic tests

Acceptance:

- diagnostics sort by span, code, message, and severity
- `valid` is derived only from error severity
- strict/guided behavior is covered by tests
- every emitted code is documented

### 7. Core Integration Agent

Mission: Connect shell parsing, expression parsing, catalog matching, and diagnostics into the public API.

Owns:

- `lintEars`
- `lintEarsBatch`
- `parseEars`
- default options
- response splitting
- vague-term linting

Must not:

- change parser internals without the owning agent
- add CLI or file-system concerns to core

Deliverables:

- `packages/core/src/lint.ts`
- `packages/core/src/options.ts`
- integration tests

Acceptance:

- `lintEars` returns complete `LintResult`
- `lintEarsBatch` preserves input order
- default vague terms are configurable
- semicolon-separated responses are split and flagged
- no external calls or nondeterministic behavior

### 8. Extractor Agent

Mission: Extract requirement inputs from files people actually write.

Owns:

- `.ears` extractor
- Markdown bullet/list/table extractor
- YAML extractor
- JSON extractor
- source location metadata

Must not:

- lint extracted statements directly
- duplicate parser behavior

Deliverables:

- `packages/extract/src/index.ts`
- extractor tests
- `docs/input-formats.md`

Acceptance:

- extracts IDs and text from supported formats
- preserves source file and line information
- ignores non-requirement prose safely
- reports malformed structured files clearly

### 9. Agentic Facade Agent

Mission: Define the tool-agnostic loop that lets any coding agent derive `.ears` files from source specs.

Owns:

- `earsyntax instructions author`
- `earsyntax instructions convert`
- `earsyntax instructions repair`
- `earsyntax instructions review`
- work item status model
- manifest schema
- traceability schema
- source-to-EARS rules
- agent wrapper contracts

Must not:

- implement semantic prose-to-EARS conversion inside deterministic CLI code
- require Claude, Codex, Cursor, Kiro, or any single agent runtime
- let generated artifacts overwrite source specs by default
- blur human acceptance with validation success

Deliverables:

- `docs/agentic-loop.md`
- `docs/facade-api.md`
- `docs/agent-rules.md`
- manifest and traceability fixture examples
- instruction JSON fixtures

Acceptance:

- a generic coding agent can follow `earsyntax instructions convert --json` without additional hidden context
- instructions clearly separate source reading, `.ears` writing, validation, repair, questions, and review
- source hash and stale-state behavior are specified
- every instruction response includes next commands
- agent-specific slash commands can be implemented as thin wrappers

### 10. CLI Agent

Mission: Build the user-facing command-line tool.

Owns:

- argument parsing
- glob/file loading
- catalog loading
- `earsyntax` binary wiring
- work item file operations
- pretty, JSON, and later SARIF output
- exit codes
- config file discovery
- `init`, `doctor`, `version`, `new`, `list`, `status`, `instructions`, `validate`, `accept`, `show`

Must not:

- reimplement parser rules
- hide core diagnostics
- expose `ears-lint` as the primary binary
- mutate source specs unless the user explicitly requests a write

Deliverables:

- `packages/cli/src/cli.ts`
- CLI tests
- `docs/cli.md`
- `docs/facade-api.md`

Acceptance:

- supports `.ears`, Markdown, YAML, and JSON inputs through `@earsyntax/extract`
- exits `1` when core reports any error
- exits `2` on CLI usage or file errors
- exits `3` for refused writes, stale source, overwrite protection, or confirmation required
- `earsyntax instructions convert --json` returns a complete agent contract
- `earsyntax new` creates a work item without generating semantic requirements
- `earsyntax accept` refuses invalid or stale work
- JSON output is stable
- SARIF output is planned but not required for the first facade milestone

### 11. Compatibility Agent

Mission: Build the fixture corpus and compare selected behavior against `ears-lint-go`.

Owns:

- golden fixtures
- AST snapshots
- diagnostic snapshots
- compatibility notes

Must not:

- force bug-for-bug compatibility where the manager has chosen a different policy

Deliverables:

- `fixtures/canonical`
- `fixtures/ears-lint-go-parity`
- `docs/compatibility.md`

Acceptance:

- every fixture has expected pattern and diagnostics
- known deviations from `ears-lint-go` are documented
- spans are tested for representative examples

### 12. Documentation Agent

Mission: Produce practical docs that make the toolkit usable.

Owns:

- README
- quickstart
- API reference examples
- CLI examples
- authoring guide
- agentic loop guide
- source-to-EARS conversion examples

Must not:

- document planned features as shipped
- invent commands or flags

Deliverables:

- `README.md`
- `docs/quickstart.md`
- `docs/authoring-ears.md`
- `docs/api.md`

Acceptance:

- first screen shows a working example
- each command has expected output
- limitations are explicit
- docs match implemented flags and exports
- docs explain that agents perform semantic derivation and the CLI validates it

### 13. Spec Workflow Agent

Mission: Build optional workflow helpers inspired by `ears-spec-engine`.

Owns:

- requirement document model
- ambiguity analysis
- simple conflict heuristics
- design/task skeleton helpers
- dependency wave analysis

Must not:

- merge spec workflow into `@earsyntax/core`
- require LLM access
- claim semantic correctness from heuristic checks

Deliverables:

- `packages/spec/src/index.ts`
- spec workflow tests
- `docs/spec-workflow.md`

Acceptance:

- consumes `@earsyntax/core` results
- works without network or model calls
- labels conflict and completeness checks as heuristics
- keeps requirement parsing delegated to core

### 14. Release Agent

Mission: Prepare the repository for a v0.1 release candidate.

Owns:

- package metadata
- build scripts
- type declarations
- changelog
- release checklist
- npm dry-run
- facade capability report
- public-claim audit
- launch positioning notes

Must not:

- change parser behavior during release hardening
- broaden v0.1 scope to include semantic conversion inside the CLI
- publish ecosystem claims from `ears-research-claude.md` without fresh verification

Deliverables:

- package manifests
- release notes
- `docs/release.md`
- `earsyntax version --features --json` fixture
- `docs/grammar.md` launch-ready grammar summary
- `docs/public-claims-audit.md`

Acceptance:

- package dry-runs pass
- public exports are intentional
- tests, type-checks, and lint pass
- release notes include limitations and known gaps
- release notes explicitly state that coding agents perform semantic derivation and Earsyntax validates artifacts
- public docs avoid "first," "only," "unclaimed," and "does not exist" claims unless freshly verified
- launch copy frames Earsyntax as a deterministic linter/facade, not a methodology

## Execution Phases

### Phase 0: Repository Setup

Manager tasks:

1. Choose monorepo tooling.
2. Create packages.
3. Add TypeScript, linting, test runner, and formatting.
4. Add fixture directories.
5. Open tracking issues or task files for each agent.

Recommended structure:

```text
packages/
  core/
    src/
    test/
  extract/
    src/
    test/
  cli/
    src/
    test/
fixtures/
  canonical/
  invalid/
  compatibility/
docs/
```

### Phase 1: Contract Freeze

Agents active:

- Architect Agent
- Grammar Agent
- Diagnostics Agent

Exit criteria:

- public API approved
- diagnostic code registry approved
- fixture schema approved
- grammar matrix approved

### Phase 2: Parallel Core Implementation

Agents active:

- Shell Parser Agent
- Expression Parser Agent
- Catalog Agent
- Diagnostics Agent

Exit criteria:

- package-local tests pass
- each agent has fixtures
- no shared API drift

### Phase 3: Core Integration

Agents active:

- Core Integration Agent
- Compatibility Agent

Exit criteria:

- `lintEars` and `lintEarsBatch` work end to end
- canonical fixtures pass
- invalid fixtures produce expected diagnostics
- spans are stable

### Phase 4: Agentic Facade

Agents active:

- Agentic Facade Agent
- CLI Agent
- Documentation Agent

Exit criteria:

- `earsyntax` is the only primary binary name
- `earsyntax new` creates work items
- `earsyntax instructions author|convert|repair|review --json` returns complete agent contracts
- `earsyntax status --json` reports work item state and next commands
- work item manifests record source path, output path, source hash, status, and acceptance metadata
- agent rules for writing `.ears` from source specs are documented

### Phase 5: User Surfaces

Agents active:

- Extractor Agent
- CLI Agent
- Documentation Agent

Exit criteria:

- CLI can validate real files
- Markdown, `.ears`, YAML, and JSON extraction works
- README and quickstart are accurate
- quickstart demonstrates source Markdown to `.ears` through the agent loop

### Phase 6: Release Candidate

Agents active:

- Release Agent
- Manager Agent

Exit criteria:

- tests pass
- type-check passes
- lint passes
- package dry-runs pass
- examples run
- known limitations are documented

## Dependency Graph

```text
Architect
  -> Grammar
  -> Diagnostics
  -> Shell Parser
  -> Expression Parser
  -> Catalog
  -> Core Integration
  -> Extractor
  -> Agentic Facade
  -> CLI
  -> Documentation
  -> Release

Compatibility starts after Grammar and continues through Core Integration.
The Agentic Facade starts after the core result shapes are stable and can proceed before every CLI subcommand is implemented.
```

## Manager Coordination Rules

The manager must enforce these rules:

1. One agent owns each file family.
2. Shared types are frozen after Phase 1.
3. Diagnostic codes are append-only after fixtures depend on them.
4. Every implementation task includes tests.
5. Core code cannot depend on CLI, file system, editor APIs, network calls, or LLM calls.
6. The CLI facade can depend on core and extract, but core cannot depend on the facade.
7. Fixtures are source-of-truth examples, not incidental tests.
8. Agents may propose a contract change, but the manager must approve and broadcast it.
9. Integration happens through pull requests or controlled patch batches.
10. Release hardening may fix bugs, but must not broaden scope.
11. Agent-specific wrappers must be thin wrappers over `earsyntax instructions` and `earsyntax validate`.
12. Generated `.ears` files are not accepted until a human approves them.

## Agent Handoff Template

Each agent must return this at handoff:

```md
## Handoff: <Agent Name>

### Completed

- ...

### Files Changed

- ...

### Tests Added

- ...

### Verification

- Command: `...`
- Result: ...

### Public Contract Changes

- None

### Open Questions

- ...

### Known Risks

- ...
```

## Manager Status Template

The manager should maintain this status after each phase:

```md
# EARS JS Initiative Status

## Current Phase

Phase N: ...

## Green

- ...

## Blocked

- ...

## Contract Changes

- ...

## Next Agent Assignments

- ...

## Verification

- ...
```

## Sub-Agent Prompt Template

Use this template when activating an implementation agent.

```text
You are the <Agent Name> for the EARS JS initiative.

Read first:
- This orchestration file.
- The public types in packages/core/src/types.ts.
- The fixture schema.
- Your package README or task brief.

Your mission:
<mission>

You own:
<files or behavior>

You must not:
<boundaries>

Implementation requirements:
- Keep behavior deterministic.
- Preserve source spans where your code touches parsed text.
- Add focused tests with your implementation.
- Do not change public API types or diagnostic codes without manager approval.
- Keep changes scoped to your ownership area.

Before handoff:
- Run package-local tests.
- Run type-check if available.
- Update fixtures or docs only when they describe implemented behavior.
- Return the standard handoff report.
```

## First-Week Work Plan

Day 1:

- Manager creates repository/package skeleton.
- Architect freezes types and exports.
- Grammar agent writes canonical and invalid fixture matrix.
- Diagnostics agent publishes diagnostic registry.
- Agentic Facade agent freezes the work item manifest, instruction JSON, and traceability JSON shapes.

Day 2:

- Shell parser starts implementation.
- Expression parser starts implementation.
- Catalog agent starts deterministic matcher.
- Compatibility agent starts fixture snapshots.
- CLI agent fixes the package facade around `@earsyntax/cli`, `packages/cli`, and the `earsyntax` binary.

Day 3:

- Core integration agent connects parser pieces.
- Diagnostics agent verifies severity and ordering.
- Grammar agent fills edge cases from failures.
- Agentic Facade agent writes the source-to-EARS instruction fixtures for author, convert, repair, and review.

Day 4:

- Extractor agent adds `.ears`, Markdown, YAML, and JSON input support.
- CLI agent builds `new`, `instructions`, `status`, `validate`, and JSON output.
- Documentation agent writes quickstart against real examples.

Day 5:

- Compatibility pass.
- Span accuracy pass.
- CLI facade fixture pass.
- Agent loop dry run: source Markdown to `.ears`, validation, repair, status, and acceptance refusal/acceptance.
- Release agent prepares package dry-runs.
- Manager cuts v0.1 release candidate checklist.

## Test Matrix

Required test groups:

| Group                     | Examples                                                                     |
| ------------------------- | ---------------------------------------------------------------------------- |
| Canonical valid shells    | one fixture for each EARS pattern                                            |
| Case-insensitive keywords | `when`, `WHEN`, `When`                                                       |
| Clause order              | valid and invalid complex ordering                                           |
| If/then                   | valid unwanted behaviour and invalid missing `then`                          |
| Missing parts             | missing system, missing `shall`, empty response                              |
| Expression precedence     | `not A and B or C`                                                           |
| Parentheses               | `(A or B) and C`, unbalanced groups                                          |
| Catalog matching          | exact, alias, ambiguous, unresolved                                          |
| Diagnostics               | code, severity, span, stable sort                                            |
| Batch API                 | order preserved                                                              |
| Extractors                | `.ears`, Markdown list, Markdown table, YAML, JSON                           |
| Work items                | manifest create/read/update, source hash, stale state                        |
| Instructions              | author, convert, repair, review JSON contracts                               |
| Agent loop                | source Markdown -> scaffold -> instructions -> `.ears` -> validate -> status |
| Questions                 | questions file path and blocking question reporting                          |
| Traceability              | generated requirement maps back to source path and line                      |
| CLI                       | binary name, exit codes, JSON output, refused writes                         |
| Acceptance                | refuses invalid, refuses stale, records accepted hash                        |

## Compatibility Policy

Match `ears-lint-go` where it aligns with the project goals:

- AST-level shell pattern classification
- boolean clause expression parsing
- deterministic catalog matching
- strict/guided mode concept
- stable diagnostics
- response splitting by semicolon

Intentional differences are allowed when documented:

- TypeScript naming may use `optional-feature` consistently instead of `optional`.
- The parser should accept canonical mixed-case EARS, not only uppercase house style.
- Unwanted behaviour must be first-class even if a workflow package collapses it into complex requirements.
- Workflow-level `WITHIN` support should be optional or experimental unless added to core grammar deliberately.

## Definition Of Done

The v0.1 release candidate is done when:

1. `@earsyntax/core` parses all canonical EARS patterns.
2. `@earsyntax/core` returns stable AST, references, diagnostics, and validity.
3. Strict and guided modes are implemented.
4. Clause expressions support `not`, `and`, `or`, and parentheses.
5. Catalog matching is deterministic and tested.
6. Extractors support `.ears`, Markdown, YAML, and JSON.
7. `@earsyntax/cli` ships the `earsyntax` binary from `packages/cli`.
8. CLI supports `init`, `doctor`, `version`, `new`, `list`, `status`, `instructions`, `validate`, `accept`, and `show`.
9. CLI supports pretty and JSON output.
10. CLI exit codes are documented and tested.
11. `earsyntax instructions author|convert|repair|review --json` returns complete agent-facing contracts.
12. The source-to-`.ears` loop is documented and covered by fixtures.
13. Work item status supports `missing`, `scaffolded`, `drafted`, `invalid`, `valid`, `accepted`, and `stale`.
14. Acceptance refuses invalid or stale work and records source/output hashes.
15. Docs include a quickstart, API example, CLI facade example, input format guide, diagnostics reference, grammar summary, agentic loop guide, and limitations.
16. Public-claim audit is complete for ecosystem, competitor, and integration claims.
17. All tests and type-checks pass.

## Explicit Non-Goals For v0.1

- No Cucumber-compatible runner.
- No automatic step definition binding.
- No fuzzy or semantic catalog matching.
- No LLM calls inside core parsing or linting.
- No claim that heuristic conflict detection proves semantic consistency.
- No editor extension.
- No requirements-management SaaS integration.
- No automatic mutation of source specs.
- No automatic human acceptance.
- No hard dependency on Spec Kit, OpenSpec, Kiro, Claude, Codex, Cursor, or any specific agent.

## Addendum: Mid-Flight Decisions (2026-07-28)

Decisions made during implementation that amend the brief above.

### Packages

The package set is four, not three:

| Package                   | Purpose                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `@earsyntax/core`         | Parser, linter, diagnostics. Unchanged.                                                                        |
| `@earsyntax/extract`      | File extraction. Unchanged.                                                                                    |
| `@earsyntax/cli-contract` | Shared report output contracts: JSON report v1, SARIF 2.1.0, pretty model, exit codes. Facade-neutral, no I/O. |
| `@earsyntax/cli`          | Command-line tool. Depends on core, extract, cli-contract.                                                     |

### CLI facade

- Invocation model is `npx @earsyntax/cli <command>`. The bin entry is `earsyntax`; the name `ears-lint` is retired.
- RESOLVED: the command surface is now specified in full by the "CLI Facade Contract" section above (init, doctor, version, new, list, status, instructions, validate, accept, show; exit codes 0/1/2/3). SARIF output ships in `@earsyntax/cli-contract` already and is exposed by the CLI when the facade milestone allows.

### Scope additions

- Go extras included in v0.1: `lintCatalogCoverage` public API, `expr.mixed_unresolved_terms`, `catalog.term_unreferenced`.
- The diagnostic registry is 29 codes (24 from the table above, 2 Go extras, 3 generated ambiguous variants: `catalog.state_ambiguous`, `catalog.event_ambiguous`, `catalog.feature_ambiguous`).
- New deliverable: an agent-agnostic "spec-to-ears" skill. One canonical instruction body plus thin per-agent adapters (Claude Code skill/command, Cursor rules, Copilot prompt, Kiro steering, root AGENTS.md fallback). The loop: read source spec, extract one obligation per line, classify against the six patterns, write `.ears` with stable REQ IDs and canonical catalog names, run the linter, fix by diagnostic code, converge on exit 0.

### Approved deviations from ears-lint-go

Documented in full in `docs/compatibility.md`.

1. Spans are UTF-16 code unit offsets (JS string indices); Go uses UTF-8 bytes.
2. `If` clause bodies map to a dedicated `ast.unwanted` field; Go folds them into `trigger`.
3. The system term emits only `catalog.system_unresolved`/`catalog.system_ambiguous`; Go also emits `expr.unknown_term`/`expr.ambiguous_term` for it.
4. Exact duplicate diagnostics (same code, span, severity, message) are deduplicated; Go can emit duplicates.
5. Specific structural codes replace blanket `ears.no_match` where the failure is identifiable; `ears.no_match` is reserved for genuinely unstructured text.
6. `ears.empty_clause` and `ears.empty_response` are emitted (Go does not check these); both mode-dependent.
7. Clause order `When ... If ... then` is valid complex per the order rule `While* -> Where* -> When* -> If*`; Go flags it invalid.
8. Empty and undefined catalogs both mean no-catalog mode (matching skipped); Go resolves against the empty struct.
9. Diagnostic sort adds span end as a secondary key for insertion-order independence.
10. Responses keep Go behavior: trailing period stripped, semicolon split at lint level.

### Security

`eslint-config-prettier` is pinned to exact `10.1.8`; the `^10.0.1` range could resolve to the compromised `10.1.6`/`10.1.7` releases.
