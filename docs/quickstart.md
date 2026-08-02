# Quickstart

This page takes you from zero to a clean `earsyntax validate` two ways: a
guest-mode check that needs no setup, and the host-native loop that validates and
repairs requirements inside a Kiro spec. Every command and its output below was
captured from a real run.

You need Node 22 or newer. No global install is required; `npx` fetches the CLI on
first use.

## Guest mode: validate a requirement with zero setup

You do not need a project, a config file, or an install to validate EARS. Pipe a
line into `validate -` and the CLI reads stdin as plain text:

```bash
printf 'The billing service shall verify the HMAC signature of every incoming webhook.\n' \
  | npx @earsyntax/cli validate - --profile strict
```

```text
1/1 valid across 1 file(s), 0 error(s), 0 warning(s)
```

The exit code is `0`. Now feed it a broken requirement, an `If` clause with no
`then`:

```bash
printf 'If the HMAC signature is invalid, the billing service shall reject the webhook.\n' \
  | npx @earsyntax/cli validate - --profile strict
```

```text
-:1:1 EARS-E006 error The 'If' clause is missing the required 'then' boundary.
0/1 valid across 1 file(s), 0 error(s), 0 warning(s)
```

The line format is `path:line:col id severity message`; here `-` is stdin. The
exit code is `1`, the signal CI branches on: `0` means every requirement is clean,
`1` means at least one error diagnostic remains. Run `earsyntax explain EARS-E006`
for the rationale and a corrected example.

The same guest check works on a file:

```bash
npx @earsyntax/cli validate requirements.ears --profile strict
```

## Host-native loop: validate and repair a Kiro spec

The guest check validates one line. The host-native loop is the fuller path: point
`earsyntax` at the specification files a team already keeps, let it locate the EARS
requirements inside them, and repair what fails. The example below uses a Kiro
`requirements.md`, but the shape is the same for Spec Kit and OpenSpec with their
own profiles.

### 1. Detect what is in the repo

`doctor` reads the working directory and reports the hosts and agents it finds,
with the exact commands to run next. It never writes.

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

### 2. Install integration files

`init` renders thin wrapper files that point coding agents and host hooks back at
the CLI. It does not create a workspace or edit any spec.

```bash
earsyntax init --agent claude --host kiro
```

It writes files such as `.claude/commands/earsyntax-repair.md` and
`.kiro/steering/earsyntax.md`. Running it again produces no diff; see
[init in the CLI reference](cli.md#init---agent-agents---host-hosts) for the full
`written`/`updated`/`skipped` report.

### 3. See what the profile locates

Before validating, `extract` shows exactly which lines the `kiro` profile treats
as requirements. This is the debugging surface when a file does not validate the
way you expect.

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

The `kiro` profile located the acceptance-criteria list items and ignored the
heading, the user story, and the surrounding prose.

### 4. Validate

```bash
earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro
```

For a spec whose second criterion is written `IF the signature is invalid THE
SYSTEM SHALL reject the webhook` (no `then`), validation reports:

```text
.kiro/specs/checkout/requirements.md:10:4 EARS-E006 error The 'If' clause is missing the required 'then' boundary.
.kiro/specs/checkout/requirements.md:10:4 EARS-E008 error The requirement is missing the system name before 'shall'.
2/3 valid across 1 file(s), 2 error(s), 0 warning(s)
```

Exit code `1`. The `kiro` profile relaxes keyword case and the literal `THE
SYSTEM`, so those are accepted; the missing `then` is not, because it breaks the
unwanted-behaviour form.

### 5. Get the repair rules

`instructions repair` returns the deterministic rules for fixing exactly the
reported findings, keyed by id. It reads the file and returns rules; it never
edits.

```bash
earsyntax instructions repair --file ".kiro/specs/checkout/requirements.md" --profile kiro --json
```

The `rules` array includes one entry per reported id:

```json
{
  "mode": "repair",
  "rules": [
    "Change only what the reported findings justify; leave passing requirements untouched.",
    "EARS-E006: Add the missing then: If <condition>, then the <system> shall <response>.",
    "EARS-E008: Insert the system name before shall: the <system> shall <response>.",
    "Edit only the host file, in place, and preserve the surrounding document structure."
  ],
  "next": [
    {
      "command": "earsyntax validate .kiro/specs/checkout/requirements.md --profile kiro --json",
      "reason": "Validate the host file after editing and repeat until no error-severity finding remains.",
      "forAgent": true
    }
  ]
}
```

### 6. Edit the host file and re-validate

Apply the fix in the spec. Adding `, then` to the second criterion resolves both
findings at once, because the corrected line parses as a well-formed
unwanted-behaviour requirement:

```diff
-2. IF the signature is invalid THE SYSTEM SHALL reject the webhook
+2. IF the signature is invalid, THEN THE SYSTEM SHALL reject the webhook
```

Validate again:

```bash
earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro
```

```text
3/3 valid across 1 file(s), 0 error(s), 0 warning(s)
```

Exit code `0`. That is the loop: `validate`, read `instructions repair`, edit the
host file, re-validate until clean. A coding agent runs the same steps by
following each response's `next` action. The CLI never approves or merges; human
review stays in the host workflow (pull request, Kiro, Spec Kit, or OpenSpec
review).

## Next steps

- [Author EARS by hand](authoring-ears.md): the six patterns, clause order, and
  the diagnostics you are most likely to hit.
- [The agentic loop](agentic-loop.md): the full validate-and-repair loop and how
  the CLI, agent, and human stay separate.
- [CLI reference](cli.md): every command, its flags, exit codes, and JSON
  envelope.
- [Profiles and input formats](input-formats.md): what each profile locates in a
  host document.
