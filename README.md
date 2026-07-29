# earsyntax

A deterministic parser, linter, extractor, and CLI for EARS requirements in Node.js and TypeScript.

Give it a requirement written in the Easy Approach to Requirements Syntax:

```text
When a payment webhook is received, the billing service shall verify the HMAC signature.
```

Lint it in code:

```ts
import { lintEars } from '@earsyntax/core';

const result = lintEars(
  'When a payment webhook is received, the billing service shall verify the HMAC signature.',
);
```

`result` is a structured object: the classified pattern, the parsed AST, catalog references, and a sorted list of diagnostics.

```json
{
  "valid": true,
  "references": [
    { "clause": "trigger", "text": "a payment webhook is received", "role": "event", "span": { "start": 5, "end": 34 } },
    { "clause": "system", "text": "billing service", "role": "system" }
  ],
  "diagnostics": [],
  "pattern": "event-driven",
  "ast": {
    "pattern": "event-driven",
    "system": { "raw": "billing service", "role": "system" },
    "responses": ["verify the HMAC signature"],
    "raw": "When a payment webhook is received, the billing service shall verify the HMAC signature.",
    "trigger": { "kind": "term", "text": "a payment webhook is received", "term": { "raw": "a payment webhook is received", "role": "event" }, "span": { "start": 5, "end": 34 } }
  }
}
```

Or lint a file from the command line. Validation exits `0` when every requirement is clean and `1` when any error diagnostic remains, so it works as a CI gate:

```bash
npx @earsyntax/cli validate requirements.ears
```

```text

3/3 valid, 0 errors, 0 warnings
```

## What EARS is

EARS, the Easy Approach to Requirements Syntax, is a small set of sentence templates for writing requirements that are unambiguous and testable. Each requirement names a system and one observable response, optionally guarded by a state, an event, an optional feature, or an unwanted condition. The patterns are documented at [alistairmavin.com/ears](https://alistairmavin.com/ears/).

This toolkit parses those templates and reports where a requirement departs from them. It is deterministic: for a given input it always returns the same result, with no LLM, no network, no file system access in the parser, and no fuzzy matching. The parser validates `.ears` grammar; it does not infer product intent from prose. Turning natural-language specifications into `.ears` is a separate job done by a coding agent through the CLI facade, and validated by the same parser.

## Packages

| Package                   | Purpose                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `@earsyntax/core`         | Parse, lint, classify, catalog-match, and produce diagnostics. No runtime dependencies.          |
| `@earsyntax/extract`      | Extract EARS requirements from `.ears`, Markdown, YAML, and JSON files. Depends on core types.   |
| `@earsyntax/cli-contract` | Shared report output contracts: the JSON report, SARIF 2.1.0, the pretty model, and exit codes.  |
| `@earsyntax/cli`          | The `earsyntax` command-line facade for humans, scripts, and coding agents.                      |

## Install

```bash
npm install @earsyntax/core
# or the extractor and CLI
npm install @earsyntax/extract
npm install --global @earsyntax/cli
```

The CLI also runs without a global install through `npx @earsyntax/cli <command>`. Node 22 or newer is required.

## Usage

Lint one requirement or a batch in code with `@earsyntax/core`:

```ts
import { lintEars, lintEarsBatch } from '@earsyntax/core';

const one = lintEars('The billing service shall verify the HMAC signature.');

const many = lintEarsBatch([
  { id: 'REQ-001', text: 'When a payment webhook is received, the billing service shall verify the HMAC signature.' },
  { id: 'REQ-002', text: 'If the HMAC signature is invalid, then the billing service shall reject the webhook.' },
]);
```

Validate files from the command line. `validate` reads `.ears`, Markdown, YAML, and JSON:

```bash
npx @earsyntax/cli validate "specs/**/*.ears"
npx @earsyntax/cli validate requirements.md --json
npx @earsyntax/cli validate requirements.ears --mode guided
```

The API reference is in [docs/api.md](docs/api.md), the full command reference in [docs/cli.md](docs/cli.md), the diagnostics registry in [docs/diagnostics.md](docs/diagnostics.md), and a five-minute walkthrough in [docs/quickstart.md](docs/quickstart.md). To learn how to write EARS by hand, see [docs/authoring-ears.md](docs/authoring-ears.md).

## The agentic loop in brief

A coding agent can convert a natural-language specification into a validated `.ears` file through the CLI facade. The CLI resolves paths and validates; the agent reads the source and writes requirements; a human accepts the result. The loop keeps those three responsibilities separate. See [docs/agentic-loop.md](docs/agentic-loop.md) for the state machine.

1. `earsyntax new <slug> --source <spec> --mode convert` scaffolds a work item and hashes the source.
2. `earsyntax instructions convert --work <slug>` returns the rules the agent follows for that step.
3. The agent reads the source and writes `.ears` requirements, one per line, with stable IDs.
4. `earsyntax validate <path> --work <slug>` checks the file and records the result on the work item.
5. `earsyntax instructions repair --work <slug>` returns targeted fixes when validation reports diagnostics; the agent repairs and re-validates until clean.
6. `earsyntax status <slug>` confirms the state and the next steps.
7. A human reviews and runs `earsyntax accept <slug>`. The CLI never accepts on the agent's behalf.

## Limitations

v0.1 is a deterministic parser, linter, and facade. It is intentionally narrow.

- No fuzzy or semantic catalog matching. Terms match by exact canonical name, then exact alias, then ambiguous, then unresolved.
- No LLM calls in `@earsyntax/core`. The parser and linter are pure and offline.
- Semantic derivation is not done by the CLI. Coding agents translate prose into `.ears`; the CLI only scaffolds, returns instructions, and validates. A human accepts the result; validation success and acceptance are two separate events.
- SARIF output is not exposed by the CLI yet. The SARIF 2.1.0 builder ships in `@earsyntax/cli-contract`, but `validate` emits pretty and JSON only. `version --features` reports `"sarif": false`.
- The `export` command is planned, not implemented in v0.1.

The full set of non-goals and the approved differences from the `ears-lint-go` reference are recorded in [docs/compatibility.md](docs/compatibility.md).