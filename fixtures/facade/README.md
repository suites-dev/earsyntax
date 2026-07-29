# Facade fixtures

Golden JSON examples for the `earsyntax` facade contracts. The CLI agent tests its output against these files. They are documents, not code: each pins the exact shape of one contract so that a change in CLI output that drifts from the contract shows up as a fixture diff.

All fixtures use one running example, the `checkout-webhooks` work item converted from `specs/checkout.md`. Values that would otherwise vary by run are fixed so the fixtures are deterministic:

- Source hash (version 1): `sha256:1111...1111`
- Output hash: `sha256:2222...2222`
- Source hash (version 2, the changed source that triggers `stale`): `sha256:3333...3333`
- Timestamps are fixed ISO 8601 UTC values on 2026-07-28.

The normative field descriptions live in `docs/facade-api.md`. The loop and state machine live in `docs/agentic-loop.md`. The instruction bodies live in `docs/agent-rules.md`.

## Manifests

Each manifest pins the `WorkManifest` shape at one `WorkStatus` state. They share one id and progress through the loop.

| File                       | Pins                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `scaffolded.manifest.json` | State right after `earsyntax new`: source hashed, output path reserved, no output hash, no acceptance.  |
| `valid.manifest.json`      | State after a clean `earsyntax validate`: output hash recorded, status `valid`, no acceptance yet.      |
| `accepted.manifest.json`   | State after `earsyntax accept`: an `accepted` block with `at`, `by`, `sourceHash`, and `outputHash`.    |
| `stale.manifest.json`      | Source hash changed after acceptance: `source.hash` differs from `accepted.sourceHash`, status `stale`. |

## Instruction responses

Each pins the `instructions <mode> --json` response for one mode. Every `next[]` entry is a real `earsyntax` command from the facade contract.

| File                        | Pins                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `instructions-author.json`  | Author mode: no `source` block, rules forbid inventing behavior beyond the prompt.                                |
| `instructions-convert.json` | Convert mode: a `source` block with hash and excerpts, full convert rule set.                                     |
| `instructions-repair.json`  | Repair mode: a `diagnostics` array the repair must address, rules keyed to the reported codes.                    |
| `instructions-review.json`  | Review mode: review-summary rules, `next[]` points at reading questions and recording acceptance.                 |

## Other responses

| File                     | Pins                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `traceability.json`      | The `TraceabilityFile` shape: requirement traces with source lines and confidence, plus a blocking question. |
| `validate.response.json` | A `validate --json` response with one error result, one warning result, and a `work` summary; `ok` is false. |
| `status.response.json`   | A `status --json` response for a `valid` work item, with review and accept as next actions.                 |