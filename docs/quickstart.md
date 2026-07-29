# Quickstart

This page takes you from an empty directory to a clean `earsyntax validate` in about five minutes, then shows the same result through the work-item loop a coding agent uses. Every command and its output below was captured from a real run.

You need Node 22 or newer. No global install is required; `npx` fetches the CLI on first use.

## Validate a file in five minutes

### 1. Write three requirements

Create `requirements.ears` with one requirement per line:

```text
When a payment webhook is received, the billing service shall verify the HMAC signature.
If the HMAC signature is invalid, the billing service shall reject the webhook.
While the payment provider is unavailable, the billing service shall queue retryable events.
```

### 2. Validate

```bash
npx @earsyntax/cli validate requirements.ears
```

Line 2 is missing the `then` boundary that an `If ... then` requirement needs, so validation reports one error and exits `1`:

```text
requirements.ears:2 error ears.invalid_if_then_form  The 'If' clause is missing the required 'then' boundary.

2/3 valid, 1 errors, 0 warnings
```

### 3. Read the diagnostic

The line format is `file:line severity code message`. Here the code is `ears.invalid_if_then_form`, and the message names the fix: an `If` clause needs a `then` before the system response. The [diagnostics reference](diagnostics.md) documents every code and its severity.

### 4. Fix and re-validate

Add `then` to line 2:

```text
If the HMAC signature is invalid, then the billing service shall reject the webhook.
```

Validate again:

```bash
npx @earsyntax/cli validate requirements.ears
```

```text

3/3 valid, 0 errors, 0 warnings
```

The exit code is now `0`. That is the CI signal: `0` means every requirement is clean, `1` means at least one error diagnostic remains.

### Strict and guided modes

By default `validate` runs in `strict` mode, where structural defects are errors. In `guided` mode the same defects are downgraded to warnings, so a partly-formed file still exits `0`:

```bash
npx @earsyntax/cli validate requirements.ears --mode guided
```

Guided mode is useful while drafting; keep strict mode in CI.

## The work-item loop

The commands above validate a file you already wrote. The work-item loop is the fuller path a coding agent follows to convert a source specification into a validated `.ears` file. The CLI scaffolds and validates, the agent writes requirements, and a human accepts. See [the agentic loop](agentic-loop.md) for the state machine and [the agent rules](agent-rules.md) for what the agent is told to do.

The run below uses [`specs/checkout.md`](../specs/checkout.md) as the source.

### 1. Initialize the workspace

```bash
earsyntax init --tools none
```

```text
Initialized earsyntax in .earsyntax
  wrote .earsyntax/config.json
  wrote .earsyntax/work/.gitkeep
  tools: none
```

### 2. Create a work item

```bash
earsyntax new checkout-webhooks --source specs/checkout.md --mode convert
```

```text
Created work item "checkout-webhooks" (convert, scaffolded).
  wrote .earsyntax/work/checkout-webhooks/requirements.ears
  wrote .earsyntax/work/checkout-webhooks/questions.md
  wrote .earsyntax/work/checkout-webhooks/traceability.json
  wrote .earsyntax/work/checkout-webhooks/manifest.json
```

`new` does not generate requirements. It hashes the source, reserves the output path, and writes empty artifacts. The status is `scaffolded`.

### 3. Get the conversion rules

```bash
earsyntax instructions convert --work checkout-webhooks
```

```text
instructions convert for "checkout-webhooks"
  - Read the full source before writing requirements.
  - Write only EARS requirements in the .ears output file.
  - Use one requirement per non-empty line.
  - Give every requirement a stable ID such as REQ-001.
  - Preserve source traceability with a [source: path:line] prefix when the source line is known.
  - Use the narrowest EARS pattern that fits the source behavior.
  - Do not invent behavior that is not stated in the source.
  - Do not hide ambiguity inside vague wording.
  - Split compound behavior into separate requirements when the response holds more than one observable obligation.
  - Write unclear behavior to questions.md instead of guessing a precise requirement.
  - Maintain traceability.json for every generated requirement and question.
  - Do not edit the source spec unless the user explicitly asks.
```

With `--json` the same response carries source excerpts and a `next` action pointing at `validate`. The JSON contract is in [the facade API reference](facade-api.md).

### 4. Write the requirements

The agent reads the source and writes `.earsyntax/work/checkout-webhooks/requirements.ears`. Converting `specs/checkout.md` gives:

```text
REQ-001 [source: specs/checkout.md:7]: When a payment webhook is received, the billing service shall verify the HMAC signature.
REQ-002 [source: specs/checkout.md:10]: If the HMAC signature is invalid, then the billing service shall reject the webhook.
REQ-003 [source: specs/checkout.md:12]: When a webhook arrives, the billing service shall validate the signature.
REQ-004 [source: specs/checkout.md:12]: When a webhook arrives, the billing service shall persist the event.
REQ-005 [source: specs/checkout.md:12]: When a webhook arrives, the billing service shall enqueue a processing job.
REQ-006 [source: specs/checkout.md:15]: While the payment provider is unavailable, the billing service shall retry queued events.
REQ-007 [source: specs/checkout.md:17]: Where dunning management is enabled, the billing service shall retry declined charges.
```

The compound sentence on lines 12 to 13 of the source ("validate the signature, persist the event, and enqueue a processing job") became three separate requirements, REQ-003 through REQ-005. The declined-payment behavior on line 19 uses the vague term "quickly", so the agent raises a question in `questions.md` rather than inventing a channel and a time bound.

### 5. Validate the work item

```bash
earsyntax validate .earsyntax/work/checkout-webhooks/requirements.ears --source specs/checkout.md --work checkout-webhooks
```

```text

7/7 valid, 0 errors, 0 warnings
```

Because the target is a work item, `validate` records the result on the manifest and moves the status to `valid`. Had it reported errors, `earsyntax instructions repair --work checkout-webhooks` would return the diagnostics to fix, and you would repair and re-validate until clean.

### 6. Confirm the state

```bash
earsyntax status checkout-webhooks
```

```text
checkout-webhooks: valid (convert)
  source: specs/checkout.md
  output: .earsyntax/work/checkout-webhooks/requirements.ears
```

### 7. Accept

Acceptance is a human decision, and the CLI enforces it: `accept` refuses unless the status is `valid`, the source is unchanged since validation, and the `.ears` file is unchanged since validation.

```bash
earsyntax accept checkout-webhooks --by "omer"
```

```text
Accepted "checkout-webhooks" by omer.
```

The work item is now `accepted`, with the accepting user and the source and output hashes recorded in the manifest. If the source later changes, `status` reports the item as `stale`, and the loop runs again against the new source.

## Next steps

- [Author EARS by hand](authoring-ears.md): the six patterns, clause order, and common diagnostics.
- [API reference](api.md): `lintEars`, `lintEarsBatch`, `parseEars`, and `lintCatalogCoverage`.
- [CLI reference](cli.md): every command, its flags, and its output.
