# Agentic loop

This document describes how any coding agent derives `.ears` files from source specifications using the `earsyntax` facade. The loop is tool-agnostic: it works with Claude Code, Cursor, Codex, Kiro, or a plain shell script, because the durable contract is files plus CLI JSON, not any one agent's command names.

Three parties have separate responsibilities, and the loop keeps them separate.

| Party        | Responsibility                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| CLI facade   | Resolve paths, scaffold work directories, return instructions, validate `.ears`, report status, record acceptance, detect stale sources. |
| Coding agent | Read the source, decide which behaviors are requirements, write and repair `.ears`, and raise questions when the source is unclear.      |
| Human        | Approve behavior, answer questions, and accept or reject the generated `.ears`.                                                          |

The CLI never interprets the source semantically. The agent never accepts its own work. Validation success and human acceptance are two different events.

## The loop at a glance

```text
earsyntax new        -> scaffold a work item (choose author or convert mode)
earsyntax instructions -> get the rules for the current step
   (agent writes or repairs the .ears file)
earsyntax validate   -> check the .ears file, deterministically
   (repeat instructions repair + validate until clean)
earsyntax status     -> confirm state and next steps
earsyntax instructions review -> build a human review summary
   (human reviews)
earsyntax accept     -> record human acceptance
```

Every JSON response ends with a `next` array, so an agent can walk the loop by following `next[].command` without hard-coding the sequence. Actions with `forAgent: true` are safe for the agent to run; actions with `blocking: true` require a human.

## Work-item state machine

A work item moves through these states. The state lives in `manifest.json` as `status`.

```text
missing -> scaffolded -> drafted -> invalid -> valid -> accepted
                            ^          |         |          |
                            |          v         |          |
                            +---------- (repair) |          |
                                                 v          v
                                              stale <----- stale
```

### States

| State        | Meaning                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `missing`    | No manifest exists for the queried id. Reported by `status`; never stored.                                        |
| `scaffolded` | `earsyntax new` created the directory and empty artifacts. No requirements written yet.                           |
| `drafted`    | The `.ears` file has content but has not passed a clean validation.                                               |
| `invalid`    | The last `validate` produced at least one error-severity diagnostic.                                              |
| `valid`      | The last `validate` produced no error diagnostics. Eligible for review and acceptance.                            |
| `accepted`   | A human accepted the `.ears` file. `accepted` metadata and hashes are recorded.                                   |
| `stale`      | The source hash changed after the last `valid` or `accepted` state. The `.ears` may no longer reflect the source. |

### Transitions

Each transition names the command or event that triggers it.

| From         | To           | Trigger                                                                                                                                                  |
| ------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missing`    | `scaffolded` | `earsyntax new <slug>` creates the manifest and artifact files.                                                                                          |
| `scaffolded` | `drafted`    | The next `validate` observes a non-empty `.ears` output. (The agent writing the file is not a CLI event; the state advances when the CLI next reads it.) |
| `drafted`    | `invalid`    | `earsyntax validate` produces at least one error-severity diagnostic.                                                                                    |
| `drafted`    | `valid`      | `earsyntax validate` produces no error-severity diagnostic.                                                                                              |
| `invalid`    | `invalid`    | `earsyntax validate` still finds error diagnostics after a repair pass.                                                                                  |
| `invalid`    | `valid`      | `earsyntax validate` finds no error diagnostics after a repair pass.                                                                                     |
| `valid`      | `invalid`    | A later `validate` (for example after an edit) finds error diagnostics again.                                                                            |
| `valid`      | `accepted`   | `earsyntax accept <slug>` after a human approves. Refused unless status is `valid` and the source is not stale.                                          |
| `valid`      | `stale`      | The source content hash no longer matches the hash recorded at the `valid` transition.                                                                   |
| `accepted`   | `stale`      | The source content hash no longer matches `accepted.sourceHash`.                                                                                         |
| `stale`      | `drafted`    | Re-running the loop (`instructions convert`, rewrite, `validate`) against the changed source.                                                            |

[DECIDED] `drafted` is CLI-observed, not agent-signaled. The CLI has no hook that fires when the agent writes the file, so `scaffolded` advances to `drafted`, `valid`, or `invalid` at the next `validate`. `status` reports `scaffolded` until then. Rationale: the CLI only changes state on its own commands; it does not watch the filesystem.

### Staleness

`stale` is computed, not stored as a terminal decision. On every `status`, `doctor`, and work-item `validate`, the CLI hashes the current source content and compares it to the hash recorded at the last `valid` or `accepted` transition:

- If the item is `valid` and the source hash differs from the valid-time hash, the reported status is `stale`.
- If the item is `accepted` and the source hash differs from `accepted.sourceHash`, the reported status is `stale`.
- A `stale` item is not silently repaired. The agent re-enters the loop against the new source; a human accepts again.

Staleness does not block `validate` from linting the `.ears` file, but it does block `accept`, which refuses stale work with exit `3`.

## Mode one: convert from an existing source

Use `convert` when a Markdown spec, PRD, issue, or requirements document already exists.

```bash
# 1. Scaffold. Hashes the source, reserves the output path.
earsyntax new checkout-webhooks --source specs/checkout.md --mode convert --json
# -> status: scaffolded

# 2. Get the convert rules and source excerpts.
earsyntax instructions convert --work checkout-webhooks --json

# 3. The agent reads specs/checkout.md in full, then writes:
#    .earsyntax/work/checkout-webhooks/requirements.ears
#    and maintains questions.md and traceability.json.

# 4. Validate.
earsyntax validate .earsyntax/work/checkout-webhooks/requirements.ears --source specs/checkout.md --json
# -> status: invalid or valid

# 5. If invalid, get targeted repair rules, fix, and re-validate.
earsyntax instructions repair --work checkout-webhooks --json
earsyntax validate .earsyntax/work/checkout-webhooks/requirements.ears --source specs/checkout.md --json
# repeat until no error diagnostics -> status: valid

# 6. Confirm state.
earsyntax status checkout-webhooks --json

# 7. Build the human review summary.
earsyntax instructions review --work checkout-webhooks --json

# 8. Human gate. A person reviews and, if satisfied, accepts.
earsyntax accept checkout-webhooks --by "omer"
# -> status: accepted
```

## Mode two: author from a prompt

Use `author` when there is no source document, only a brief or prompt. The loop is identical except that step 1 supplies a prompt and step 2 requests author rules. There is no `source` block in the instructions and no source excerpts; traceability records requirements without source lines.

```bash
earsyntax new checkout-webhooks \
  --prompt "Checkout webhooks must validate signatures and record successful payments." \
  --mode author --json
# -> status: scaffolded

earsyntax instructions author --work checkout-webhooks --json
# agent writes requirements.ears from the prompt only

earsyntax validate .earsyntax/work/checkout-webhooks/requirements.ears --json
# repair loop, status, review, accept as in convert mode
```

Because there is no source file, an author-mode item never becomes `stale` from source drift. It can still move `valid -> invalid` if the `.ears` file is edited and re-validated.

## Human gates

Two points in the loop require a human, and the CLI enforces both.

1. Answering questions. When the agent writes questions to `questions.md`, those questions block the requirements listed in `traceability.json` under `blocksRequirements`. The review summary surfaces them. A human answers before acceptance.
2. Acceptance. `earsyntax accept` refuses unless the status is `valid`, the source is not stale, and the `.ears` file is unchanged since validation. The agent may recommend acceptance, but only a human runs it. Every `next` action that leads to acceptance is marked `blocking: true` and never `forAgent: true`.

The CLI never accepts on the agent's behalf and never edits the source spec.

## Convergence

The repair sub-loop (`instructions repair` then `validate`) repeats until `validate` reports no error-severity diagnostics. The agent must not force convergence by deleting failing requirements or weakening wording; if the intended behavior is unclear, it writes a question and leaves a clear placeholder. The rules for this are in `docs/agent-rules.md`. Warnings (for example `lint.vague_response`) do not block a `valid` state, but the review summary reports them so the human can decide whether they matter.
