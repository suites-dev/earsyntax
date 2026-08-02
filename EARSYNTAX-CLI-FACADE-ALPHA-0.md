# Orchestration Brief: Align the earsyntax CLI to the Dual-Ring Facade

You are the orchestrator agent for a refactor of the earsyntax CLI. The CLI
today is sovereign-only: every command assumes an `.earsyntax/` workspace,
work items, and manifests. The target design splits the CLI into two rings —
a **stateless guest ring** that works in any repository with zero setup
(this is how Spec Kit, Kiro, and OpenSpec users will consume earsyntax), and
the existing **stateful project ring** for teams that adopt earsyntax as
their requirements home. Most future users will only ever touch ring 1.

Read this entire brief before dispatching any work. Phase 0 freezes
contracts that every later phase depends on; nothing may run in parallel
with Phase 0.

---

## 0. Prime directives (apply to every phase, every subagent)

1. **The core never calls an LLM.** Validation, extraction, parsing,
   linting, hashing, and gating are pure code. If a task seems to need
   model judgment, the design is wrong — stop and escalate.
2. **No new lifecycle verbs. Ever.** The command surface defined in §2 is
   closed. Do not add `plan`, `tasks`, `design`, `implement`, or any other
   orchestration verb, regardless of how natural it seems. Narrowness is
   the product position.
3. **Diagnostic IDs are append-only and namespaced.** All IDs use the
   `EARS-` prefix (`EARS-E###` errors, `EARS-W###` warnings). Existing
   unprefixed IDs get a one-time migration with an alias table; after that,
   never renumber, never reuse, never delete.
4. **Fixtures are the specification.** Every behavior change lands with
   fixture pairs (accepted / rejected) before or with the code. A profile
   or rule without fixtures on both sides of its line does not exist.
5. **Existing sovereign-mode behavior must not break.** The
   `agentic-loop-demo.sh` script is the compatibility oracle: it must run
   green at the end of every phase (updated in the same commit if flags
   change, with the change noted).
6. **Docs tell the truth.** Any example added to help text or docs must be
   executed against the built CLI in-session before commit.

## 1. Context: what exists and what changes

Existing surface (sovereign): `init --tools claude|none`, `new`,
`instructions <convert|author|repair|review> --work <id>`, `validate <file>
--source <f> --work <id>`, `status`, `list`, `show --artifact …`,
`accept <id> --by <name>`, `doctor`, `version --features`. State in
`.earsyntax/` (config.json, work/<id>/{manifest.json, requirements.ears,
questions.md, traceability.json, validation.json, validation.md}). Source
and output files content-hashed in manifests.

What the refactor delivers:

- Guest mode: `validate` (and `extract`, `doctor`, `explain`, `profiles`)
  run stateless against arbitrary host files — no workspace.
- Markdown extraction as a first-class pipeline stage: hosts embed EARS
  inside larger documents; there are no `.ears` files in guest repos.
- Profiles upgraded from dialects to **host adapters**: dialect + document
  schema + severity policy, one per host.
- `init` split into `--agent` (where to write agent wrappers) and `--host`
  (which framework's documents to target). `--tools` becomes a deprecated
  alias for `--agent`.
- `instructions` gains `--file <path>` so the repair protocol travels into
  guest repos that have no work items.
- SARIF output alongside JSON.
- `explain <id>` command.
- `accept` git-anchored; new `check` command for cross-artifact drift.

## 2. Target facade (frozen — implement exactly this)

### Ring 1 — stateless (no workspace required)

| Command                   | Behavior                                                                                                                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validate <paths…>`       | Locate → extract → parse → lint EARS in the given files. Accepts globs and `-` (stdin). Works with or without a workspace; workspace only adds manifest recording when `--work` is passed.                                              |
| `extract <paths…>`        | Print the requirement candidates the active profile locates, with `file:line` positions and the locator rule that matched. Debugging surface for profiles.                                                                              |
| `explain <diagnostic-id>` | Full write-up of one diagnostic: meaning, rationale (with EARS ruleset citation), before/after example. Examples executed at build time.                                                                                                |
| `profiles`                | List available profiles; for each, exactly what it relaxes/adds relative to `strict`.                                                                                                                                                   |
| `doctor`                  | Environment + host/agent detection. In a guest repo: detect `.kiro/specs/`, `specs/**/spec.md`, `openspec/`, `.claude/`, `AGENTS.md`, `.cursor/` and print the exact suggested `init`/`validate` invocation. Works without a workspace. |
| `version [--features]`    | Unchanged.                                                                                                                                                                                                                              |

Global flags (all commands): `--profile <name>`, `--json`, `--sarif`
(validate only), `--strict` (warnings → errors), `--quiet`, `--cwd <dir>`.

Exit codes (frozen): `0` valid / success; `1` findings (errors present);
`2` usage or environment failure (bad path, malformed workspace, unknown
profile). `0`/`1` are gate results; `2` means the invocation is wrong.

### Ring 2 — project mode (requires `.earsyntax/`)

| Command                                                               | Behavior                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init [--agent <a>[,<a>…]] [--host <h>[,<h>…]]`                       | Create workspace; render agent wrappers and host adapters (§5). `--tools` kept as deprecated alias for `--agent` with a warning.                                                                                                              |
| `new <id> --source <f> --mode convert` / `--prompt "…" --mode author` | Unchanged.                                                                                                                                                                                                                                    |
| `instructions <phase> (--work <id> \| --file <path>)`                 | Unchanged protocol; `--file` renders the same payload against a bare file (no manifest paths, output-in-place semantics).                                                                                                                     |
| `validate … --work <id>`                                              | Ring-1 validator + manifest recording.                                                                                                                                                                                                        |
| `status <id>` / `list` / `show <id> --artifact …`                     | Unchanged.                                                                                                                                                                                                                                    |
| `accept <id> --by <name>`                                             | Git-anchored: `--by` defaults from `git config user.name <user.email>`; refuse if the work item's files are dirty/untracked; record HEAD SHA + output hash in the manifest. `--no-git` escape hatch for non-repo use, recorded as unanchored. |
| `check`                                                               | Cross-artifact drift gate (§7). Distinct from `validate`: `validate` is per-file grammar; `check` is workspace consistency.                                                                                                                   |

## 3. Phase 0 — freeze contracts (blocking; single agent)

Deliverables, in one PR, before anything else starts:

1. **Findings model v1** (`docs/contracts/findings.md` + a TypeScript type
   exported from core): `{ ok, summary{files, requirements, valid, errors,
warnings}, diagnostics[{ id, severity, file, line, col?, message, fix?,
requirementId? }], work? }`. The existing passing-run JSON shape is
   grandfathered; `diagnostics[]` is additive. SARIF is a projection of
   this model, never a second pipeline.
2. **Diagnostic registry migration**: every existing ID mapped to its
   `EARS-`-prefixed successor in an alias table; old IDs still resolve in
   `explain` with a deprecation note. Registry file gains a header comment
   stating the append-only rule.
3. **Profile schema v1** (`docs/contracts/profile.md`): a profile is data,
   not code — `{ name, notation: "ears", dialect{…}, locator{…},
severity{…}, idFormat{…} }`. Dialect options minimally: keyword case
   policy, literal system-name allowances (`THE SYSTEM`), comma-optional,
   story-wrapper skip. Locator: markdown selector rules (heading patterns,
   block types, list-item filters, code-fence policy). Severity: per-ID
   overrides (error/warn/off). Unknown keys are a validation error — no
   silent extension.
4. **Inventory**: read the current CLI end to end; produce
   `docs/refactor/inventory.md` listing every command, flag, output shape,
   and workspace file with its call sites. Later phases cite this instead
   of re-reading the world.

Gate: contracts merged; `agentic-loop-demo.sh` still green (nothing
behavioral changed yet).

## 4. Phase 1 — engine split and guest-mode validate

- Extract the pipeline into a workspace-free core library with four
  stages: **locate** (profile locator over the document) → **extract**
  (candidate requirement strings with source positions) → **parse**
  (grammar) → **lint** (rules). For `.ears` files, locate/extract is the
  trivial every-line locator. All diagnostics map positions back to the
  original `file:line`.
- `validate` accepts multiple paths, globs, and stdin; drops the hard
  requirement on `--work`/workspace. When `--work` is present, behavior is
  exactly today's (validate + record).
- `extract` command exposes stage 2 output.
- `doctor` runs workspace-free; detection table per §2.

Gate: `echo 'When a payment webhook arrives, the billing service shall
verify the signature.' | earsyntax validate -` returns ok in an empty
directory; demo script green; fixtures for multi-file/glob/stdin runs.

## 5. Phase 2 — profiles as host adapters

Ship four profiles as data files conforming to the schema, each with a
fixture directory (`fixtures/profiles/<name>/`) containing real-world-shaped
documents:

- **`strict`** (default): canonical Mavin ruleset; `.ears` and plain-text
  locators only.
- **`ears-x`**: strict superset — REQ-### frame, `[source:]` tags,
  prohibition kind, reserved timing qualifiers. (Today's sovereign
  behavior becomes `ears-x`; sovereign commands default to it.)
- **`kiro`**: dialect (case-insensitive/all-caps keywords, `THE SYSTEM`,
  optional comma, user-story wrapper lines skipped as frame content);
  locator (bullet/numbered acceptance-criteria lines under
  `#### Acceptance Criteria` headings in `requirements.md`); severity
  tuned so Kiro's house style validates clean.
- **`speckit`**: locator for `specs/**/spec.md` (EARS-shaped sentences in
  requirements sections; ignore prose that opens with EARS keywords but
  parses as nothing — extraction must not false-positive on narrative
  markdown); dialect near-strict.
- **`openspec`**: locator for `### Requirement:` bodies and
  `#### Scenario:` blocks inside `openspec/changes/**` and
  `openspec/specs/**`; delta-aware path conventions documented.

Each profile's fixture set includes at least one document that validates
clean under its host profile and fails under `strict`, and one the locator
must _skip entirely_ (prose false-positive guard).

Gate: `earsyntax validate fixtures/profiles/kiro/requirements.md --profile
kiro` clean; same file under `--profile strict` fails with dialect
diagnostics; `extract` output on each fixture matches a committed snapshot.

## 6. Phase 3 — outputs and explainability

- **SARIF emitter** (`--sarif`): projection of findings model v1; rule
  metadata (id, shortDescription, helpUri to the docs anchor) populated
  from the registry; verified by uploading a sample run to a scratch
  GitHub repo and confirming PR annotations render on the correct lines.
- **`explain`**: renders from the registry + a per-ID markdown snippet
  directory; every snippet's before/after example executed in-session by a
  test that runs `validate` on both sides.
- **`profiles`**: renders from profile data files — no hand-written
  descriptions that can drift.

Gate: SARIF validates against the 2.1.0 schema; `explain` covers 100% of
registry IDs (test enumerates the registry); demo script green.

## 7. Phase 4 — ring-2 upgrades

- **`instructions --file <path>`**: same protocol payload as `--work`,
  with output paths replaced by in-place file semantics and no manifest
  section. The wrapper files rendered in §8 use `--file` in guest repos.
- **`accept` git anchoring** per §2. Manifest gains
  `acceptance: { by, email?, at, headSha?, outputHash, anchored }`.
- **`check`**: workspace-wide, exit-code-gated. Verifies: (a) every
  manifest source hash matches the file on disk (else: stale conversion);
  (b) every accepted work item's recorded output hash matches the current
  artifact (else: stale acceptance); (c) every `[source: path:line]` tag
  resolves into the hashed source; (d) traceability.json recomputes
  identically from the `.ears` file (agent-written matrix is a courtesy;
  the CLI's recomputation is the truth). `--json` output follows the
  findings model with `EARS-C###` check-diagnostic IDs (new registry
  section, same append-only rule).

Gate: fixture workspace with one fresh, one source-drifted, and one
acceptance-stale item produces exactly the expected three-way `check`
report; demo script extended with a `check` step and green.

## 8. Phase 5 — init renderers and deprecations

- `init --agent claude|codex|cursor|copilot|gemini|generic` (comma list)
  renders wrapper files: `.claude/commands/earsyntax-*.md`; `AGENTS.md`
  managed section (codex + generic); `.cursor/rules/earsyntax.mdc`;
  `.github/prompts/earsyntax.prompt.md`; `GEMINI.md` managed section.
  Every wrapper body is a thin pointer: fetch
  `earsyntax instructions <phase> --json` (with `--file` in guest mode)
  and follow it. No protocol content is duplicated into wrappers.
- `init --host speckit|kiro|openspec` renders host adapters:
  Spec Kit extension command files; `.kiro/hooks/ears-validate.yaml` +
  steering file; OpenSpec `AGENTS.md` block — each invoking ring-1
  `validate` with the matching `--profile`.
- Managed sections use begin/end markers and are idempotent on re-run.
- `--tools` prints a deprecation warning, maps to `--agent`, and is
  removed from help text.
- `doctor` suggestions updated to emit the new two-flag invocation.

Gate: running each renderer twice is a no-op the second time; a matrix
test renders every agent × host combination into a temp dir and snapshots
it; demo script updated (`init --agent claude`) and green.

## 9. Phase 6 — conformance and docs sync

- Full-suite run; registry/explain/fixture coverage checks from earlier
  gates re-run as one conformance target (`npm run conformance`).
- README updated: guest-mode quick start becomes the first example
  (validate a Kiro `requirements.md` in one line, no init); command
  reference table replaced with §2; CI section gains the SARIF upload
  step; `--tools` references removed.
- `docs/refactor/CHANGES.md`: every behavioral delta, one line each, for
  the human reviewer.

Final acceptance checklist (all must hold):

- Ring-1 commands run in an empty directory with no workspace, correct
  exit codes.
- `validate` on each host-profile fixture: clean under its profile,
  correctly failing under `strict`.
- SARIF renders PR annotations on correct lines (evidence: screenshot or
  check-run link in the PR description).
- `explain` resolves every registry ID including deprecated aliases.
- `accept` refuses on a dirty tree; records SHA when clean; `--no-git`
  records unanchored.
- `check` distinguishes fresh / source-drifted / acceptance-stale.
- `agentic-loop-demo.sh` green end-to-end.
- Zero occurrences of new lifecycle verbs in the command tree.
- No LLM call anywhere in core (grep-audited: no fetch to model endpoints,
  no SDK imports).

## 10. Sequencing and parallelism

Phase 0 is serial and blocking. Phases 1→2→3 are sequential (each consumes
the previous phase's contract). Phase 4 may run in parallel with Phase 3
once Phase 1 lands (it touches ring 2 only). Phase 5 requires Phases 2 and 4. Phase 6 is serial and last. If any phase discovers a contract gap,
amend the contract doc first, in its own commit, with a one-line rationale
— never patch around it silently.
