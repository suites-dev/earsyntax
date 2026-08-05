#!/usr/bin/env bash
set -Eeuo pipefail

# Full CLI e2e for the host-native earsyntax facade.
#
# This script uses the built binary, not TypeScript source. It walks the business
# loop a developer and coding agent use:
#   natural-language intent -> agent instructions -> host spec -> extract ->
#   validate -> repair instructions -> agent edit -> validate clean -> SARIF.
#
# Defaults are CI-safe and deterministic. Set RUN_CLAUDE=1 to let Claude Code
# perform the repair step locally; if Claude is unavailable or leaves the file
# failing, the deterministic repair keeps the e2e reproducible.

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"
CLI="$REPO_ROOT/packages/cli/bin/run.js"

TMP_PARENT="${TMPDIR:-/tmp}"
TMP_PARENT="${TMP_PARENT%/}"
WORK_DIR="$(mktemp -d "$TMP_PARENT/earsyntax-cli-e2e.XXXXXX")"

PROFILE="kiro"
SPEC_REL=".kiro/specs/checkout/requirements.md"
SOURCE_REL="docs/checkout-intent.md"
SARIF_REL="earsyntax.sarif"

BROKEN_LINE='3. WHEN a shopper submits payment details THE SYSTEM creates a paid order and sends a confirmation email.'
FIXED_LINE='3. WHEN a shopper submits payment details THE SYSTEM SHALL create a paid order.'

RUN_CLAUDE="${RUN_CLAUDE:-0}"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"

if { [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; } || [[ "${FORCE_COLOR:-0}" == "1" ]]; then
  BOLD=$'\033[1m'
  DIM=$'\033[2m'
  RED=$'\033[31m'
  GREEN=$'\033[32m'
  BLUE=$'\033[34m'
  MAGENTA=$'\033[35m'
  RESET=$'\033[0m'
else
  BOLD=''
  DIM=''
  RED=''
  GREEN=''
  BLUE=''
  MAGENTA=''
  RESET=''
fi

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

section() {
  printf "\n%s%s%s\n" "$BOLD$BLUE" "$1" "$RESET"
}

pass() {
  printf "%sok%s %s\n" "$GREEN" "$RESET" "$1"
}

fail() {
  printf "%serror%s %s\n" "$RED" "$RESET" "$1" >&2
  exit 1
}

print_cmd() {
  printf "%s$ earsyntax" "$DIM"
  for arg in "$@"; do
    printf " %q" "$arg"
  done
  printf "%s\n" "$RESET"
}

earsyntax() {
  (cd "$WORK_DIR" && node "$CLI" "$@")
}

run_expect() {
  local expected="$1"
  local outfile="$2"
  shift 2

  print_cmd "$@"
  local code=0
  set +e
  earsyntax "$@" >"$outfile" 2>&1
  code=$?
  set -e

  if [[ "$code" != "$expected" ]]; then
    cat "$outfile" >&2
    fail "expected exit $expected, got $code for: earsyntax $*"
  fi
}

assert_json() {
  local file="$1"
  local script="$2"
  node -e "const fs = require('node:fs'); const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); ${script}" "$file"
}

assert_contains() {
  local file="$1"
  local needle="$2"
  if ! grep -F -- "$needle" "$file" >/dev/null; then
    cat "$file" >&2
    fail "expected $file to contain: $needle"
  fi
}

write_intent() {
  mkdir -p "$WORK_DIR/docs"
  cat >"$WORK_DIR/$SOURCE_REL" <<'MD'
# Checkout payment intent

Checkout must verify payment webhooks before creating paid orders.
Declined charges must stay unpaid and show a useful message to the shopper.
The implementation must not create duplicate paid orders when the provider
retries the same webhook.
MD
}

write_agent_authored_spec() {
  mkdir -p "$WORK_DIR/.kiro/specs/checkout"
  cat >"$WORK_DIR/$SPEC_REL" <<MD
# Requirements Document

## Introduction

Checkout payment requirements converted from the natural-language intent.

## Requirements

### Requirement 1

**User Story:** As a shopper, I want checkout to handle payment webhooks, so that
paid orders are created only after the provider confirms payment.

#### Acceptance Criteria

1. WHEN the payment provider confirms a valid payment THE SYSTEM SHALL create a paid order.
2. IF the payment provider declines the charge THEN THE SYSTEM SHALL keep the order unpaid.
$BROKEN_LINE
MD
}

deterministic_repair() {
  local target="$WORK_DIR/$SPEC_REL"
  awk -v old="$BROKEN_LINE" -v new="$FIXED_LINE" \
    '$0 == old { print new; next } { print }' "$target" >"$target.tmp"
  mv "$target.tmp" "$target"
}

maybe_claude_repair() {
  if [[ "$RUN_CLAUDE" != "1" ]]; then
    deterministic_repair
    return 0
  fi

  if ! command -v "$CLAUDE_BIN" >/dev/null 2>&1; then
    printf "%sClaude Code not found; using deterministic repair.%s\n" "$DIM" "$RESET"
    deterministic_repair
    return 0
  fi

  printf "%s$ %q -p %q%s\n" "$MAGENTA" "$CLAUDE_BIN" "/earsyntax-repair $SPEC_REL --profile $PROFILE" "$RESET"
  (cd "$WORK_DIR" && "$CLAUDE_BIN" -p "/earsyntax-repair $SPEC_REL --profile $PROFILE") || true
  deterministic_repair
}

if [[ ! -f "$REPO_ROOT/packages/cli/dist/cli.js" ]]; then
  fail "packages/cli/dist/cli.js is missing. Run pnpm build before scripts/cli-e2e.sh."
fi

printf "%sEarsyntax CLI e2e%s\n" "$BOLD$BLUE" "$RESET"
printf "work dir: %s%s%s\n" "$GREEN" "$WORK_DIR" "$RESET"

section "1. Validate stdin in an empty repo"
stdin_out="$WORK_DIR/stdin.txt"
printf 'The billing service shall verify the HMAC signature.\n' | run_expect 0 "$stdin_out" validate - --profile strict
assert_contains "$stdin_out" '1/1 valid across 1 file(s), 0 error(s), 0 warning(s)'
pass "stdin validation works without an init workspace"

section "2. Start from natural-language intent"
write_intent
test -f "$WORK_DIR/$SOURCE_REL" || fail "intent file was not created"
pass "natural-language intent exists at $SOURCE_REL"

section "3. Ask the facade for authoring instructions"
author_json="$WORK_DIR/author.json"
run_expect 0 "$author_json" instructions author --file "$SPEC_REL" --from "$SOURCE_REL" --profile "$PROFILE" --json
assert_json "$author_json" "if (data.command !== 'instructions author') throw new Error('wrong command'); if (data.sourcePolicy !== 'read-only') throw new Error('source must be read-only'); if (data.editPolicy.editableFile !== '$SPEC_REL') throw new Error('wrong editable file');"
pass "author instructions identify the editable host file and read-only source"

section "4. Simulate the agent-authored host spec"
write_agent_authored_spec
test -f "$WORK_DIR/$SPEC_REL" || fail "host spec was not created"
pass "agent wrote a Kiro requirements file"

section "5. Detect host and render integrations"
doctor_json="$WORK_DIR/doctor.json"
run_expect 0 "$doctor_json" doctor --json
assert_json "$doctor_json" "if (!data.detected.hosts.some((entry) => entry.host === 'kiro')) throw new Error('kiro host not detected');"

init_json="$WORK_DIR/init.json"
run_expect 0 "$init_json" init --agent claude,codex --host "$PROFILE" --json
assert_json "$init_json" "if (!data.written.includes('AGENTS.md')) throw new Error('AGENTS.md not written'); if (!data.written.includes('.claude/commands/earsyntax-repair.md')) throw new Error('Claude repair command not written');"

init_again_json="$WORK_DIR/init-again.json"
run_expect 0 "$init_again_json" init --agent claude,codex --host "$PROFILE" --json
assert_json "$init_again_json" "if (data.written.length !== 0) throw new Error('init is not idempotent'); if (data.skipped.length === 0) throw new Error('expected skipped files');"
if [[ -d "$WORK_DIR/.earsyntax" ]]; then
  fail "init created .earsyntax, which is forbidden"
fi
pass "doctor and init are host-native and idempotent"

section "6. Extract validation scope"
extract_json="$WORK_DIR/extract.json"
run_expect 0 "$extract_json" extract "$SPEC_REL" --profile "$PROFILE" --json
assert_json "$extract_json" "if (data.candidates.length !== 3) throw new Error('expected 3 candidates'); if (!data.candidates.every((entry) => entry.locatorRuleId === 'kiro.acceptance-criteria-item')) throw new Error('wrong locator rule');"
pass "extract shows exactly the Kiro acceptance criteria"

section "7. Validate, fail, and request repair instructions"
invalid_json="$WORK_DIR/invalid.json"
run_expect 1 "$invalid_json" validate "$SPEC_REL" --profile "$PROFILE" --json
assert_json "$invalid_json" "if (data.ok !== false) throw new Error('invalid spec should fail'); if (data.findings.summary.errors < 1) throw new Error('expected errors'); if (!data.next[0].command.includes('instructions repair')) throw new Error('missing repair next action');"

repair_json="$WORK_DIR/repair.json"
run_expect 0 "$repair_json" instructions repair --file "$SPEC_REL" --profile "$PROFILE" --json
assert_json "$repair_json" "if (!data.rules.join('\\n').includes('EARS-E007')) throw new Error('repair rules should mention EARS-E007');"
pass "validate gives the agent the next repair command"

section "8. Repair and revalidate clean"
maybe_claude_repair
clean_json="$WORK_DIR/clean.json"
run_expect 0 "$clean_json" validate "$SPEC_REL" --profile "$PROFILE" --json
assert_json "$clean_json" "if (data.ok !== true) throw new Error('clean spec should pass'); if (data.findings.summary.errors !== 0) throw new Error('expected no errors');"
pass "the loop converges to a clean .ears-compatible requirements set"

section "9. Gate warnings under strict mode"
warning_file="$WORK_DIR/warning.ears"
printf 'The system shall respond appropriately.\n' >"$warning_file"
warning_json="$WORK_DIR/warning.json"
run_expect 0 "$warning_json" validate warning.ears --profile strict --json
assert_json "$warning_json" "if (data.findings.summary.warnings !== 1) throw new Error('expected warning');"

warning_strict_json="$WORK_DIR/warning-strict.json"
run_expect 1 "$warning_strict_json" validate warning.ears --profile strict --strict --json
assert_json "$warning_strict_json" "if (data.findings.summary.errors !== 1) throw new Error('expected strict warning upgrade');"
pass "warning-only findings can become CI failures"

section "10. Emit SARIF and discover capabilities"
sarif_file="$WORK_DIR/$SARIF_REL"
run_expect 1 "$sarif_file" validate warning.ears --profile strict --strict --sarif
assert_json "$sarif_file" "if (data.version !== '2.1.0') throw new Error('not SARIF 2.1.0'); if (!Array.isArray(data.runs) || data.runs.length !== 1) throw new Error('missing SARIF run');"

profiles_json="$WORK_DIR/profiles.json"
run_expect 0 "$profiles_json" profiles --json
assert_json "$profiles_json" "if (data.profiles.length !== 5) throw new Error('expected five profiles');"

version_json="$WORK_DIR/version.json"
run_expect 0 "$version_json" version --features --json
assert_json "$version_json" "if (!data.features.commands.includes('validate')) throw new Error('missing validate feature'); if (data.features.commands.includes('new')) throw new Error('workspace command leaked');"

explain_json="$WORK_DIR/explain.json"
run_expect 0 "$explain_json" explain EARS-E007 --json
assert_json "$explain_json" "if (data.id !== 'EARS-E007') throw new Error('wrong diagnostic');"
pass "SARIF, profiles, version, and explain work through the binary"

printf "\n%sCLI e2e complete%s\n" "$BOLD$GREEN" "$RESET"
