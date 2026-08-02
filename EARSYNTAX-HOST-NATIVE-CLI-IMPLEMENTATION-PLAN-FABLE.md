# Fable Orchestration Plan: Host-Native earsyntax CLI

This plan tells Fable how to coordinate many Claude Code agents to reshape
`earsyntax` into a host-native CLI for existing SDD frameworks.

The target product is not an `earsyntax` workspace manager. Existing tools
such as Kiro, Spec Kit, and OpenSpec own the specification lifecycle.
`earsyntax` owns deterministic EARS extraction, validation, explanation,
SARIF output, and agent instructions inside those host documents.

## Target Facade

The final alpha command surface is closed:

```bash
earsyntax validate <paths...|->
earsyntax extract <paths...|->
earsyntax instructions <author|convert|repair|review> --file <path>
earsyntax explain <diagnostic-id>
earsyntax profiles
earsyntax doctor
earsyntax init --agent <agents> --host <hosts>
earsyntax version --features
```

Global flags:

```bash
--profile <strict|ears-x|kiro|speckit|openspec>
--json
--sarif
--strict
--quiet
--cwd <dir>
```

Removed from the product surface:

```bash
earsyntax new
earsyntax list
earsyntax status
earsyntax show
earsyntax accept
earsyntax check
```

Those commands belong to the old stateful workspace model. Do not keep them
in help output, README examples, or new docs. If temporary compatibility code
is needed during the refactor, keep it internal and remove it before final
alpha acceptance.

## Non-Negotiable Rules

1. The core never calls an LLM.
2. Claude calls `earsyntax`; `earsyntax` never calls Claude.
3. No `.earsyntax/` workspace is created.
4. No work items, manifests, acceptance records, or project lifecycle.
5. No new lifecycle verbs beyond the target facade.
6. Diagnostic IDs are append-only and namespaced:
   - `EARS-E###` for errors
   - `EARS-W###` for warnings
   - deprecated aliases continue to resolve in `explain`
7. Profiles are data, not hard-coded conditionals scattered through parser
   logic.
8. Fixtures are the specification. A behavior without fixture coverage does
   not exist.
9. Docs and help examples must be executed against the built CLI before they
   are published.
10. The agentic demo must remain green, but it should become host-native.

## Fable's Job

Fable is the agent manager. Fable does not implement everything personally.
Fable owns:

- sequencing
- file ownership boundaries
- contract freeze
- merge order
- conflict resolution
- final conformance
- keeping agents from reintroducing workspace concepts

Fable should activate as many Claude Code agents as useful after the blocking
contract phase. Every agent must receive a narrow brief, a file ownership
range, expected tests, and the target facade above.

## Parallelization Model

Phase 0 is serial. Do not run implementation agents before Phase 0 lands.

After Phase 0, split agents by ownership boundaries:

```text
Wave 0: Contract freeze                  serial
Wave 1: Core contracts and registry       mostly parallel
Wave 2: Pipeline, CLI shell, profiles     parallel
Wave 3: Host adapters and renderers       parallel
Wave 4: Docs, demo, conformance           parallel with integration gates
Wave 5: Final hardening                   serial
```

Recommended worktree pattern:

```bash
git worktree add ../earsyntax-agent-contracts -b fable/contracts
git worktree add ../earsyntax-agent-pipeline -b fable/pipeline
git worktree add ../earsyntax-agent-cli -b fable/cli
git worktree add ../earsyntax-agent-profiles -b fable/profiles
git worktree add ../earsyntax-agent-init -b fable/init
git worktree add ../earsyntax-agent-docs -b fable/docs
```

Fable merges through one integration branch:

```bash
feat/host-native-cli
```

Agents should not share mutable files unless Fable explicitly sequences them.

## Phase 0: Contract Freeze

Single agent only.

### Agent 00: Contract Freeze Agent

Goal: freeze the target contracts before code movement starts.

Owns:

- `docs/contracts/findings.md`
- `docs/contracts/profile.md`
- `docs/refactor/inventory.md`
- `docs/refactor/host-native-facade.md`
- exported TypeScript contract types, if needed

Tasks:

1. Read current CLI source end to end.
2. Inventory every current command, flag, output shape, and workspace file.
3. Define findings model v1:

```ts
interface Findings {
  ok: boolean;
  summary: {
    files: number;
    requirements: number;
    valid: number;
    errors: number;
    warnings: number;
  };
  diagnostics: Diagnostic[];
}

interface Diagnostic {
  id: string;
  severity: 'error' | 'warning';
  file: string;
  line: number;
  col?: number;
  message: string;
  fix?: string;
  requirementId?: string;
}
```

4. Define profile schema v1:

```ts
interface Profile {
  name: 'strict' | 'ears-x' | 'kiro' | 'speckit' | 'openspec';
  notation: 'ears';
  dialect: {
    keywordCase: 'strict' | 'case-insensitive';
    allowLiteralSystemName: string[];
    commaAfterLeadingClause: 'required' | 'optional';
    allowStoryWrapper: boolean;
    allowFrameMetadata: boolean;
    allowProhibition: boolean;
  };
  locator: {
    documentKinds: string[];
    include: LocatorRule[];
    exclude: LocatorRule[];
    codeFences: 'ignore' | 'include';
  };
  severity: Record<string, 'error' | 'warning' | 'off'>;
  idFormat: {
    required: boolean;
    pattern?: string;
  };
}
```

5. Define final command output shapes for:
   - `validate --json`
   - `extract --json`
   - `instructions --json`
   - `explain --json`
   - `profiles --json`
   - `doctor --json`
   - `init --json`
   - `version --features --json`

6. State explicitly that old workspace commands are removed from the target
   alpha surface.

Acceptance gate:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Fable gate:

- No implementation phase starts until this contract is merged.
- Fable reviews the contracts for hidden workspace assumptions.

## Phase 1: Core Foundation

These agents can run in parallel after Phase 0.

### Agent 01: Diagnostic Registry Agent

Goal: migrate all diagnostics to the new append-only registry.

Owns:

- `packages/core/src/diagnostics*`
- `docs/diagnostics.md`
- `docs/contracts/findings.md` updates if needed
- `fixtures/diagnostics/**`

Tasks:

1. Create a registry with stable IDs:
   - `EARS-E###`
   - `EARS-W###`
2. Map every old diagnostic ID to a new ID.
3. Keep aliases resolvable for `explain`.
4. Add registry metadata:
   - title
   - severity
   - rationale
   - before example
   - after example
   - profile notes
5. Add tests that fail if an ID is removed, reused, or duplicated.

Outputs:

- registry module
- alias table
- coverage test for registry uniqueness

Acceptance gate:

```bash
pnpm --filter @earsyntax/core test
pnpm typecheck
```

### Agent 02: Findings Model Agent

Goal: make validation return one canonical findings model.

Owns:

- `packages/core/src/findings*`
- `packages/cli-contract/**`
- CLI contract fixtures

Tasks:

1. Implement shared `Findings` and `Diagnostic` types.
2. Convert existing parse/lint output into `Findings`.
3. Preserve useful old result detail only as optional command-specific data.
4. Ensure `ok` means no error diagnostics.
5. Ensure `--strict` can upgrade warnings to errors at the findings layer.

Acceptance gate:

```bash
pnpm --filter @earsyntax/cli-contract test
pnpm --filter @earsyntax/core test
```

### Agent 03: Profile Schema Agent

Goal: profiles are validated data files.

Owns:

- `packages/core/src/profiles*`
- `profiles/*.json` or `packages/core/src/profiles/*.ts`
- `docs/contracts/profile.md`
- `fixtures/profiles/schema/**`

Tasks:

1. Implement strict profile schema validation.
2. Reject unknown keys.
3. Load built-in profiles:
   - `strict`
   - `ears-x`
   - `kiro`
   - `speckit`
   - `openspec`
4. Add `resolveProfile(name)` API.
5. Add profile-diff data for `profiles` command.

Acceptance gate:

```bash
pnpm --filter @earsyntax/core test
pnpm typecheck
```

### Agent 04: Grammar/Profile Semantics Agent

Goal: reconcile parser behavior with strict and `ears-x`.

Owns:

- parser grammar files
- linter grammar decisions
- `fixtures/valid/**`
- `fixtures/invalid/**`
- profile-specific grammar fixtures

Tasks:

1. Make `strict` match canonical EARS:
   - comma required after leading `When`, `While`, `Where`, `If`
   - `If <condition>, then ...` required
   - `then` forbidden outside unwanted behavior
   - max one `When`
   - exact `the <system>` system form
   - pronoun system references rejected
   - strict keyword casing
   - one requirement per line/sentence
   - `shall not` rejected
2. Make `ears-x` a strict superset:
   - allow `REQ-###`
   - allow `[source: path:line]`
   - allow `shall not` as prohibition
3. Ensure Complex is first-class in parser, docs, and CLI feature output.
4. Add fixture pairs for every grammar decision.

Acceptance gate:

```bash
pnpm --filter @earsyntax/core test
pnpm --filter @earsyntax/cli test
```

## Phase 2: Stateless Pipeline And Commands

These agents run in parallel, but Agent 05 defines APIs that Agents 06 and 07
consume. Fable should merge Agent 05 first.

### Agent 05: Locate Extract Parse Lint Pipeline Agent

Goal: create the host-native validation pipeline.

Owns:

- `packages/core/src/pipeline*`
- `packages/extract/**`
- pipeline fixtures

Pipeline:

```text
locate host document regions
extract candidate requirement text with source position
parse EARS sentence
lint parsed requirement
return findings
```

Tasks:

1. Support file paths, globs, and stdin.
2. Preserve original `file:line:col` through all stages.
3. Treat `.ears` and plain text as trivial every-line extraction.
4. Let profiles control Markdown section/list/code-fence behavior.
5. Ensure prose that looks vaguely EARS-like can be skipped by locator rules
   rather than turned into false parser errors.

Acceptance gate:

```bash
echo 'When a payment webhook arrives, the billing service shall verify the signature.' | node packages/cli/bin/run.js validate -
pnpm --filter @earsyntax/extract test
pnpm --filter @earsyntax/core test
```

### Agent 06: Validate Command Agent

Goal: make `validate` work without any workspace.

Owns:

- `packages/cli/src/commands/validate.ts`
- validate CLI tests
- validate fixtures

Tasks:

1. Remove workspace requirement.
2. Accept multiple paths.
3. Accept globs.
4. Accept `-` for stdin.
5. Add `--profile`.
6. Add `--strict`.
7. Preserve exit codes:
   - `0` success or no error findings
   - `1` error findings
   - `2` usage/environment failure
8. Support `--json`.
9. Leave `--sarif` stubbed only if SARIF agent has not merged yet, but the
   final branch must implement it.

Acceptance gate:

```bash
node packages/cli/bin/run.js validate fixtures/demo/valid-only.ears --profile ears-x
node packages/cli/bin/run.js validate does-not-exist.ears --json
printf 'When x, the y shall z.\n' | node packages/cli/bin/run.js validate - --json
pnpm --filter @earsyntax/cli test
```

### Agent 07: Extract Command Agent

Goal: expose the locator/extractor output.

Owns:

- `packages/cli/src/commands/extract.ts`
- extract CLI tests
- extract snapshots

Tasks:

1. Add `extract <paths...|->`.
2. Return candidates with:
   - file
   - line
   - col
   - text
   - profile
   - locator rule ID
3. Support `--json`.
4. Support profile-specific Markdown locators.
5. Add snapshot fixtures per host profile.

Acceptance gate:

```bash
node packages/cli/bin/run.js extract fixtures/profiles/kiro/requirements.md --profile kiro --json
pnpm --filter @earsyntax/cli test
```

### Agent 08: CLI Shell Cleanup Agent

Goal: align command dispatcher, help, flags, and exit code behavior.

Owns:

- `packages/cli/src/cli.ts`
- `packages/cli/src/args.ts`
- help/version fixtures

Tasks:

1. Add commands:
   - `extract`
   - `explain`
   - `profiles`
2. Remove old commands from help:
   - `new`
   - `list`
   - `status`
   - `show`
   - `accept`
   - `check`
3. Keep compatibility code only if Fable explicitly approves, but do not
   document it.
4. Add global `--profile`, `--strict`, `--quiet`.
5. Restrict `--sarif` to `validate`.
6. Update `version --features`.

Acceptance gate:

```bash
node packages/cli/bin/run.js --help
node packages/cli/bin/run.js version --features --json
pnpm --filter @earsyntax/cli test
```

## Phase 3: Host Profiles

Run these agents in parallel after profile schema and pipeline APIs merge.
Each host agent owns its fixture directory.

### Agent 09: Strict And ears-x Profile Agent

Goal: implement base profiles.

Owns:

- strict profile data
- ears-x profile data
- `fixtures/profiles/strict/**`
- `fixtures/profiles/ears-x/**`

Tasks:

1. `strict` accepts canonical Mavin EARS only.
2. `ears-x` accepts strict plus:
   - `REQ-###` frame metadata
   - `[source: path:line]`
   - prohibition via `shall not`
3. Every strict-valid requirement is `ears-x` valid unchanged.
4. Add strict-fail / ears-x-pass fixture pairs.

Acceptance gate:

```bash
node packages/cli/bin/run.js validate fixtures/profiles/strict/valid.ears --profile strict
node packages/cli/bin/run.js validate fixtures/profiles/ears-x/prohibition.ears --profile ears-x
node packages/cli/bin/run.js validate fixtures/profiles/ears-x/prohibition.ears --profile strict --json
```

### Agent 10: Kiro Profile Agent

Goal: validate EARS embedded in Kiro `requirements.md`.

Owns:

- Kiro profile data
- `fixtures/profiles/kiro/**`
- Kiro docs notes

Profile behavior:

- case-insensitive/all-caps keywords
- literal `THE SYSTEM` allowed
- comma after leading clause optional
- user-story wrapper lines skipped as frame content
- `#### Acceptance Criteria` sections are locator anchors
- list items under acceptance criteria are candidate requirements

Tasks:

1. Create real-world-shaped Kiro fixture.
2. Add one clean-under-kiro / fail-under-strict fixture.
3. Add one false-positive guard fixture that extracts no requirements.
4. Snapshot `extract` output.

Acceptance gate:

```bash
node packages/cli/bin/run.js extract fixtures/profiles/kiro/requirements.md --profile kiro --json
node packages/cli/bin/run.js validate fixtures/profiles/kiro/requirements.md --profile kiro
node packages/cli/bin/run.js validate fixtures/profiles/kiro/requirements.md --profile strict --json
```

### Agent 11: Spec Kit Profile Agent

Goal: validate EARS in Spec Kit-style `specs/**/spec.md`.

Owns:

- Spec Kit profile data
- `fixtures/profiles/speckit/**`
- Spec Kit docs notes

Profile behavior:

- near-strict dialect
- locator targets requirements sections in `specs/**/spec.md`
- prose under design/background sections is skipped
- narrative Markdown that starts with EARS keywords but is not a requirement
  must not become a false positive

Tasks:

1. Create Spec Kit fixture with requirements section.
2. Create strict failure pair if Spec Kit syntax needs relaxation.
3. Create locator skip fixture.
4. Snapshot `extract` output.

Acceptance gate:

```bash
node packages/cli/bin/run.js validate fixtures/profiles/speckit/spec.md --profile speckit
node packages/cli/bin/run.js extract fixtures/profiles/speckit/spec.md --profile speckit --json
```

### Agent 12: OpenSpec Profile Agent

Goal: validate EARS in OpenSpec specs and changes.

Owns:

- OpenSpec profile data
- `fixtures/profiles/openspec/**`
- OpenSpec docs notes

Profile behavior:

- locator targets:
  - `openspec/specs/**`
  - `openspec/changes/**`
  - `### Requirement:` bodies
  - `#### Scenario:` blocks
- delta-aware path conventions documented
- non-requirement prose skipped

Tasks:

1. Create OpenSpec spec fixture.
2. Create OpenSpec change fixture.
3. Create strict failure pair if profile relaxes syntax.
4. Create false-positive guard.
5. Snapshot `extract` output.

Acceptance gate:

```bash
node packages/cli/bin/run.js validate fixtures/profiles/openspec/change.md --profile openspec
node packages/cli/bin/run.js extract fixtures/profiles/openspec/change.md --profile openspec --json
```

## Phase 4: Agent Instructions And Init

These agents can run in parallel after the command shell and profile runtime
are in place.

### Agent 13: Instructions Command Agent

Goal: make the agent loop work against host files.

Owns:

- `packages/cli/src/commands/instructions.ts`
- `packages/cli/src/rules.ts`
- instruction fixtures

Command:

```bash
earsyntax instructions <author|convert|repair|review> --file <path> --profile <name> --json
```

Response must include:

- mode
- file path
- profile name
- profile locator summary
- dialect constraints
- edit policy
- output policy: edit the host file in place
- diagnostics for repair/review modes
- next command

Repair flow:

```bash
earsyntax validate <path> --profile <name> --json
earsyntax instructions repair --file <path> --profile <name> --json
# agent edits only <path>
earsyntax validate <path> --profile <name> --json
```

Author/convert flow:

- `author`: use a prompt or existing host section if the file has a marked
  empty requirements area.
- `convert`: transform natural-language requirements already present in the
  host file into EARS-shaped requirements in place.
- The CLI returns rules; it does not perform semantic conversion.

Acceptance gate:

```bash
node packages/cli/bin/run.js instructions repair --file fixtures/profiles/kiro/requirements.md --profile kiro --json
pnpm --filter @earsyntax/cli test
```

### Agent 14: Init Renderer Agent

Goal: implement integration init.

Owns:

- `packages/cli/src/commands/init.ts`
- renderer modules
- renderer snapshots

Command:

```bash
earsyntax init --agent claude,codex,cursor,copilot,gemini,generic --host kiro,speckit,openspec
```

Aliases:

```bash
earsyntax init --tools claude
```

`--tools` is deprecated. It should work, emit a warning, and not appear in
help.

`init` must not:

- create `.earsyntax/`
- create work items
- edit existing requirement/spec documents
- run validation as a side effect
- call an LLM

`init` must:

1. Detect the repo root from `--cwd`.
2. Validate requested agents and hosts.
3. Render managed files only.
4. Use begin/end markers for files that may already exist.
5. Be idempotent. Running the same command twice should produce no diff.
6. Return exact JSON:

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

Renderer matrix:

| Agent     | Files                                                                                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claude`  | `.claude/commands/earsyntax-author.md`, `.claude/commands/earsyntax-convert.md`, `.claude/commands/earsyntax-repair.md`, `.claude/commands/earsyntax-review.md` |
| `codex`   | managed `AGENTS.md` section                                                                                                                                     |
| `cursor`  | `.cursor/rules/earsyntax.mdc`                                                                                                                                   |
| `copilot` | `.github/prompts/earsyntax.prompt.md`                                                                                                                           |
| `gemini`  | managed `GEMINI.md` section                                                                                                                                     |
| `generic` | managed `AGENTS.md` section                                                                                                                                     |

Host renderer matrix:

| Host       | Files                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------- |
| `kiro`     | `.kiro/steering/earsyntax.md`, `.kiro/hooks/ears-validate.yaml`                                    |
| `speckit`  | Spec Kit extension command files, plus managed instructions if the framework supports them locally |
| `openspec` | managed `AGENTS.md` section with OpenSpec validation commands                                      |

Every wrapper must be thin:

```text
Run earsyntax instructions <phase> --file <path> --profile <host> --json.
Follow the returned rules exactly.
Edit only the host file.
Run earsyntax validate <path> --profile <host> --json.
Repeat until clean.
Do not approve, accept, or merge.
```

Acceptance gate:

```bash
node packages/cli/bin/run.js init --agent claude --host kiro --cwd <tmp> --json
node packages/cli/bin/run.js init --agent claude --host kiro --cwd <tmp> --json
git diff --exit-code <tmp-copy-or-snapshot>
pnpm --filter @earsyntax/cli test
```

### Agent 15: Doctor Command Agent

Goal: make `doctor` useful in existing SDD repos.

Owns:

- `packages/cli/src/commands/doctor.ts`
- detection tests
- fixtures for fake host repos

Doctor detects:

- `.kiro/specs/`
- `.kiro/steering/`
- `.kiro/hooks/`
- `specs/**/spec.md`
- `.specify/`
- `openspec/`
- `.claude/`
- `AGENTS.md`
- `.cursor/`
- `.github/prompts/`
- `GEMINI.md`

Output should recommend exact commands:

```bash
earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro
earsyntax init --agent claude --host kiro
```

Acceptance gate:

```bash
node packages/cli/bin/run.js doctor --cwd fixtures/host-repos/kiro --json
pnpm --filter @earsyntax/cli test
```

## Phase 5: Explainability And Outputs

### Agent 16: Explain Command Agent

Goal: every diagnostic has a human-readable explanation.

Owns:

- `packages/cli/src/commands/explain.ts`
- `docs/explain/*.md` or registry snippets
- explain tests

Command:

```bash
earsyntax explain EARS-E001
earsyntax explain ears.missing_shall
```

Tasks:

1. Resolve current IDs.
2. Resolve deprecated aliases.
3. Print deprecation note when alias is used.
4. Include:
   - meaning
   - rationale
   - bad example
   - good example
   - profile notes
5. Add a test that every registry ID has an explanation.
6. Add a test that every example in explanations validates as claimed.

Acceptance gate:

```bash
node packages/cli/bin/run.js explain EARS-E001
pnpm --filter @earsyntax/cli test
```

### Agent 17: Profiles Command Agent

Goal: expose profile data without hand-written drift.

Owns:

- `packages/cli/src/commands/profiles.ts`
- profile output fixtures

Tasks:

1. Render built-in profiles from profile data.
2. For each profile, list:
   - what it locates
   - what it relaxes
   - what it adds
   - severity overrides
3. Support `--json`.

Acceptance gate:

```bash
node packages/cli/bin/run.js profiles
node packages/cli/bin/run.js profiles --json
```

### Agent 18: SARIF Agent

Goal: make `validate --sarif` work from the findings model.

Owns:

- SARIF emitter module
- CLI `--sarif` integration
- SARIF fixtures

Tasks:

1. Project `Findings` to SARIF 2.1.0.
2. Use registry metadata for SARIF rules.
3. Populate:
   - rule ID
   - short description
   - help URI or docs anchor
   - file locations
4. Validate SARIF schema in tests.
5. Ensure `--sarif` and `--json` are mutually exclusive or define a clear
   precedence.

Acceptance gate:

```bash
node packages/cli/bin/run.js validate fixtures/profiles/kiro/requirements.md --profile kiro --sarif
pnpm --filter @earsyntax/cli test
```

## Phase 6: Docs, Demo, And CI

These can run in parallel after most command behavior exists.

### Agent 19: README And CLI Docs Agent

Goal: make docs match the host-native CLI.

Owns:

- `README.md`
- `docs/quickstart.md`
- `docs/cli.md`
- `docs/input-formats.md`
- `docs/agent-rules.md`

Tasks:

1. First README screen shows host-native usage:

```bash
earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro
```

2. Remove workspace-first flow.
3. Remove `new`, `list`, `status`, `show`, `accept`.
4. Document `init` as integration setup, not project setup.
5. Add CI example with SARIF.
6. Mark unsupported/planned behavior honestly.
7. Execute every command example before declaring done.

Acceptance gate:

```bash
node packages/cli/bin/run.js --help
node packages/cli/bin/run.js version --features --json
pnpm format:check
```

### Agent 20: Host-Native Demo Agent

Goal: replace the current workspace demo with a host-native demo.

Owns:

- `scripts/agentic-loop-demo.sh`
- demo fixtures if needed

Demo should show:

1. Write a Kiro-style `requirements.md`.
2. Run `earsyntax doctor`.
3. Run `earsyntax init --agent claude --host kiro`.
4. Run `earsyntax extract`.
5. Run `earsyntax validate` and fail.
6. Call Claude:

```bash
claude -p "/earsyntax-repair .kiro/specs/checkout/requirements.md --profile kiro"
```

7. Revalidate until clean.
8. Show SARIF output.
9. Finish with CI command suggestion.

Rules:

- Keep colors and pauses.
- Keep `RUN_CLAUDE=1`.
- Keep deterministic fallback.
- Remove `.earsyntax/` work-item assumptions.

Acceptance gate:

```bash
PAUSE=0 scripts/agentic-loop-demo.sh
RUN_CLAUDE=0 PAUSE=0 scripts/agentic-loop-demo.sh
```

### Agent 21: Conformance Target Agent

Goal: create one command that proves the alpha facade.

Owns:

- root package scripts
- conformance tests
- fixture snapshot tests

Add:

```bash
pnpm conformance
```

It should run:

- build
- typecheck
- unit tests
- CLI command smoke tests
- profile fixture matrix
- explain coverage
- SARIF schema validation
- help text forbidden-command check
- demo no-pause smoke test

Acceptance gate:

```bash
pnpm conformance
```

## Phase 7: Integration And Hardening

Fable should run this phase mostly serially.

### Agent 22: Integration Auditor

Goal: find contradictions after all branches merge.

Owns no files initially. Reads everything.

Audit checklist:

- `--help` contains only target commands.
- `version --features --json` reports all profiles and outputs.
- no `.earsyntax/` path appears in new docs, tests, help, or demo except in
  migration notes if Fable intentionally keeps them.
- no command examples use removed verbs.
- `strict` and `ears-x` behavior align with grammar brief.
- `instructions` never tells an agent to approve or accept.
- `init` is idempotent.
- `validate` works in an empty directory.
- `extract` source positions are stable.
- SARIF uses registry IDs.
- profile descriptions come from profile data.

Acceptance gate:

```bash
pnpm conformance
git grep -n ".earsyntax\\|earsyntax new\\|earsyntax accept\\|earsyntax status\\|earsyntax show\\|earsyntax list"
```

Fable decides whether any matches are legitimate migration references.

### Agent 23: Final Fix Agent

Goal: handle small cross-cutting defects found by the integration auditor.

Rules:

- No refactors.
- No new commands.
- No new profiles.
- Fix only acceptance-gate failures.

Acceptance gate:

```bash
pnpm conformance
pnpm format:check
git status -sb
```

## Developer Lifecycle After Implementation

Kiro example:

```bash
earsyntax doctor
earsyntax init --agent claude --host kiro
earsyntax extract ".kiro/specs/**/requirements.md" --profile kiro
earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro
```

If validation fails:

```bash
claude -p "/earsyntax-repair .kiro/specs/checkout/requirements.md --profile kiro"
earsyntax validate ".kiro/specs/checkout/requirements.md" --profile kiro
```

CI:

```bash
earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro --sarif > earsyntax.sarif
```

Human approval happens in the normal host workflow: PR review, Kiro review,
Spec Kit review, or OpenSpec change review. `earsyntax` does not record
acceptance.

## Agent Lifecycle After Implementation

The agent receives a host file path and profile.

1. Inspect profile and diagnostics:

```bash
earsyntax validate <path> --profile <host> --json
```

2. Fetch phase instructions:

```bash
earsyntax instructions repair --file <path> --profile <host> --json
```

3. Edit only the host file.
4. Preserve surrounding host document structure.
5. Re-run validation:

```bash
earsyntax validate <path> --profile <host> --json
```

6. Repeat until clean.
7. Present a review summary:
   - changed lines
   - requirements repaired
   - diagnostics resolved
   - unresolved ambiguity
   - validation command and result

The agent must not call `accept`, create `.earsyntax/`, or invent behavior.

## File Ownership Map

Use this to reduce conflicts:

| Area                   | Primary Agent |
| ---------------------- | ------------- |
| contracts docs         | Agent 00      |
| diagnostic registry    | Agent 01      |
| findings model         | Agent 02      |
| profile schema/runtime | Agent 03      |
| parser semantics       | Agent 04      |
| pipeline/extract core  | Agent 05      |
| validate command       | Agent 06      |
| extract command        | Agent 07      |
| CLI dispatcher/help    | Agent 08      |
| strict/ears-x profiles | Agent 09      |
| Kiro profile           | Agent 10      |
| Spec Kit profile       | Agent 11      |
| OpenSpec profile       | Agent 12      |
| instructions command   | Agent 13      |
| init renderers         | Agent 14      |
| doctor                 | Agent 15      |
| explain                | Agent 16      |
| profiles command       | Agent 17      |
| SARIF                  | Agent 18      |
| README/docs            | Agent 19      |
| demo script            | Agent 20      |
| conformance target     | Agent 21      |
| integration audit      | Agent 22      |
| final fixes            | Agent 23      |

## Merge Order

Fable should merge in this order:

1. Agent 00
2. Agents 01, 02, 03
3. Agent 04
4. Agent 05
5. Agents 06, 07, 08
6. Agents 09, 10, 11, 12
7. Agents 13, 14, 15
8. Agents 16, 17, 18
9. Agents 19, 20, 21
10. Agent 22
11. Agent 23

Run the relevant gate after each merge group. If a group fails, Fable stops
parallel intake and assigns a focused fix agent.

## Claude Agent Prompt Template

Fable can launch each Claude Code agent with this shape:

```text
You are Agent <number>: <name>.

Goal:
<one paragraph>

Read first:
- EARSYNTAX-HOST-NATIVE-CLI-IMPLEMENTATION-PLAN-FABLE.md
- EARSYNTAX-CLI-FACADE-ALPHA-0.md
- GRAMMAR-AGENT-BRIEF-FABLE.md when parser/profile behavior is involved
- relevant source files for your ownership area

Hard rules:
- Do not add commands outside the target facade.
- Do not create .earsyntax workspace behavior.
- Do not call an LLM from core or CLI.
- Add fixtures with behavior changes.
- Keep diagnostics in the EARS-E### / EARS-W### registry.

Owned files:
<paths>

Deliverables:
<specific outputs>

Verification:
<commands>

Stop and report if:
- the contract is ambiguous
- another agent owns the file you need
- parser behavior conflicts with the grammar brief
- implementing your task requires reviving workspace mode
```

## Final Alpha Acceptance

The refactor is complete only when all hold:

```bash
pnpm conformance
node packages/cli/bin/run.js --help
node packages/cli/bin/run.js version --features --json
PAUSE=0 scripts/agentic-loop-demo.sh
```

Manual checks:

- Empty-directory validation works.
- Stdin validation works.
- Kiro fixture validates clean under `kiro` and fails under `strict`.
- Spec Kit fixture validates under `speckit`.
- OpenSpec fixture validates under `openspec`.
- `extract` snapshots show correct source positions.
- `explain` resolves every registry ID and deprecated alias.
- `init` renders agent and host integration files idempotently.
- `validate --sarif` emits schema-valid SARIF.
- No public doc or help text advertises removed workspace commands.
