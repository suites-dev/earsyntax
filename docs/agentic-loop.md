# Agentic loop

This document describes how any coding agent uses the `earsyntax` facade to write,
convert, and repair EARS requirements inside host documents. The loop is
tool-agnostic: it works with Claude Code, Cursor, Codex, Kiro, or a plain shell
script, because the durable contract is the host files plus the CLI's JSON, not
any one agent's command names. There is no `earsyntax` workspace, no work item,
and no acceptance record; the agent edits the host's own requirement files in
place.

Three parties have separate responsibilities, and the loop keeps them separate.

| Party        | Responsibility                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CLI facade   | Locate requirements in host files, return instructions, validate deterministically, report findings and next actions. Never edits, never calls an LLM. |
| Coding agent | Read the source, decide which behaviors are requirements, write and repair EARS in the host file, and flag ambiguity for a human.                      |
| Human        | Review the resulting requirements in the host workflow (pull request, Kiro, Spec Kit, or OpenSpec review) and decide whether they are ready.           |

The CLI never interprets a source spec semantically. The agent never approves,
accepts, or merges its own work. Validation success and human approval are two
different events, and the CLI produces only the first.

## The loop at a glance

```text
earsyntax instructions <mode> --file <path>  -> get the rules for this step
   (agent edits the host file in place)
earsyntax validate <path>                    -> check the file, deterministically
   (repeat instructions repair + validate until no error-severity finding remains)
```

Every JSON response ends with a `next` array, so an agent walks the loop by
following `next[].command` without hard-coding the sequence. Actions marked
`forAgent: true` are safe for the agent to run on its own. The response never
tells the agent to approve, accept, or merge, and never references a workspace.

## The four modes

Each `instructions` mode covers one kind of step against a host file. Pick the
mode that matches the task.

| Mode      | When to use it                                                       | Reads findings |
| --------- | -------------------------------------------------------------------- | -------------- |
| `author`  | Write new EARS requirements into a host file's requirements region.  | no             |
| `convert` | Rewrite natural-language requirements already in the file into EARS. | no             |
| `repair`  | Fix the findings a `validate` run reported.                          | yes            |
| `review`  | Summarize the located requirements for a human. Never approves.      | yes            |

`author` and `convert` also accept `--from <source>`, naming a natural-language
spec the agent reads as input while writing EARS into `--file`. The CLI points at
the source; it never reads or transforms it. See
[the CLI reference](cli.md#--from-source).

## The repair loop, step by step

The most common loop is repair: something failed validation, and the agent fixes
it. The example uses a Kiro `requirements.md`, but the shape holds for any
profile.

### 1. Validate and read the findings

```bash
earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro --json
```

```json
{
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

The `next` action tells the agent exactly which command to run.

### 2. Get the repair rules

```bash
earsyntax instructions repair --file ".kiro/specs/checkout/requirements.md" --profile kiro --json
```

The response embeds the same findings plus a `rules` array with one entry per
reported id, drawn from the diagnostic-to-fix guidance in
[agent-rules.md](agent-rules.md):

```json
{
  "mode": "repair",
  "rules": [
    "Change only what the reported findings justify; leave passing requirements untouched.",
    "EARS-E006: Add the missing then: If <condition>, then the <system> shall <response>.",
    "Edit only the host file, in place, and preserve the surrounding document structure."
  ],
  "editPolicy": {
    "editableFile": ".kiro/specs/checkout/requirements.md",
    "preserveStructure": true
  },
  "outputPolicy": "edit-in-place"
}
```

### 3. Edit the host file in place

The agent changes only what the findings justify, in the file `editPolicy`
names, preserving the surrounding document structure. It does not delete a failing
requirement to make validation pass, and does not weaken a requirement because it
is harder to parse.

### 4. Re-validate until clean

```bash
earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro
```

```text
3/3 valid across 1 file(s), 0 error(s), 0 warning(s)
```

Exit code `0`. The loop repeats step 1 through step 4 until `validate` reports no
error-severity finding. Warnings do not block a clean exit, but a `review` pass
surfaces them so a human can decide whether they matter.

## Authoring and converting

`author` and `convert` follow the same shape without a preceding findings run: get
the rules, edit the host file, then validate. In `author` mode the agent writes
new EARS requirements into the requirements region the profile's locator
describes. In `convert` mode it rewrites natural-language requirements already in
the file into EARS in place, preserving each requirement's intent.

```bash
# Write new requirements, reading a PRD as input.
earsyntax instructions author --file ".kiro/specs/checkout/requirements.md" --from prd.md --profile kiro --json
# agent reads prd.md, writes EARS into requirements.md, leaves prd.md unchanged
earsyntax validate ".kiro/specs/checkout/requirements.md" --profile kiro
```

Both modes carry the shared authoring rules: choose the narrowest EARS pattern,
write one obligation per requirement, split compounds, and do not invent behavior
the source does not state. Those rules are documented in full in
[agent-rules.md](agent-rules.md).

## What the loop does not do

- It does not maintain a workspace, work item, manifest, or acceptance record.
- It does not track source staleness or hash sources; the host's own version
  control does that.
- It does not accept, approve, or merge. The `review` mode produces a summary for
  a human and stops there.
- It does not call an LLM from the CLI. The agent calls `earsyntax`, never the
  reverse.

## Convergence

The repair sub-loop (`instructions repair`, then `validate`) repeats until
`validate` reports no error-severity finding. The agent must not force convergence
by deleting failing requirements or weakening wording; when the intended behavior
is unclear, it leaves the requirement out and flags the gap for a human rather
than guessing. The rules for this are in [agent-rules.md](agent-rules.md).
