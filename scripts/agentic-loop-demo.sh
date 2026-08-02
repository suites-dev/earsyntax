#!/usr/bin/env bash
set -Eeuo pipefail

# Host-native agentic loop demo.
#
# Walks the earsyntax loop against a Kiro spec repo: detect the host, render the
# agent and host integration files, extract candidates, validate (and fail),
# repair the broken criterion, revalidate until clean, then emit SARIF for CI.
#
# Knobs:
#   PAUSE=0        skip the between-step pauses (default 1, pauses on a TTY)
#   RUN_CLAUDE=1   call Claude Code for the repair step (default 0, deterministic)
#   CLAUDE_BIN     the Claude binary to invoke (default: claude)
#   DEMO_DIR       reuse a specific temp dir instead of a fresh mktemp one

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"
CLI="$REPO_ROOT/packages/cli/bin/run.js"

TMP_PARENT="${TMPDIR:-/tmp}"
TMP_PARENT="${TMP_PARENT%/}"
# A caller-supplied DEMO_DIR is preserved on exit; a fresh mktemp one is removed.
DEMO_DIR_KEEP="${DEMO_DIR+1}"
DEMO_DIR="${DEMO_DIR:-$(mktemp -d "$TMP_PARENT/earsyntax-agentic-loop.XXXXXX")}"

SPEC_REL=".kiro/specs/checkout/requirements.md"
SPEC_GLOB=".kiro/specs/**/requirements.md"
SARIF_FILE="earsyntax.sarif"
PROFILE="kiro"

CLAUDE_BIN="${CLAUDE_BIN:-claude}"
PAUSE="${PAUSE:-1}"
RUN_CLAUDE="${RUN_CLAUDE:-0}"

# The single broken criterion (no `shall`, so EARS-E007) and its exact repair.
BROKEN_LINE='3. WHEN a shopper submits payment details THE SYSTEM creates a paid order and sends a confirmation email.'
FIXED_LINE='3. WHEN a shopper submits payment details THE SYSTEM SHALL create a paid order.'

if { [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; } || [[ "${FORCE_COLOR:-0}" == "1" ]]; then
  BOLD=$'\033[1m'
  DIM=$'\033[2m'
  RED=$'\033[31m'
  GREEN=$'\033[32m'
  YELLOW=$'\033[33m'
  BLUE=$'\033[34m'
  MAGENTA=$'\033[35m'
  CYAN=$'\033[36m'
  RESET=$'\033[0m'
else
  BOLD=''
  DIM=''
  RED=''
  GREEN=''
  YELLOW=''
  BLUE=''
  MAGENTA=''
  CYAN=''
  RESET=''
fi

cleanup() {
  # Only remove a temp dir this run created; a caller-supplied DEMO_DIR is left.
  if [[ -z "${DEMO_DIR_KEEP:-}" && -n "${DEMO_DIR:-}" && -d "$DEMO_DIR" ]]; then
    rm -rf "$DEMO_DIR"
  fi
}
trap cleanup EXIT

pause_here() {
  if [[ "$PAUSE" == "0" || ! -t 0 ]]; then
    return 0
  fi

  printf "\n%sPress any key or Enter to continue...%s" "$DIM" "$RESET"
  IFS= read -rsn1 _ || true
  printf "\n"
}

section() {
  local title="$1"
  local detail="${2:-}"

  printf "\n%s%s%s\n" "$BOLD$CYAN" "$title" "$RESET"
  if [[ -n "$detail" ]]; then
    printf "%s%s%s\n" "$DIM" "$detail" "$RESET"
  fi
  pause_here
}

note() {
  printf "%s%s%s\n" "$DIM" "$1" "$RESET"
}

success() {
  printf "%s%s%s\n" "$GREEN" "$1" "$RESET"
}

warn() {
  printf "%s%s%s\n" "$YELLOW" "$1" "$RESET"
}

print_cmd() {
  printf "\n%s$ earsyntax" "$BLUE"
  for arg in "$@"; do
    printf " %q" "$arg"
  done
  printf "%s\n" "$RESET"
}

# Invoke the built CLI without a global install. Runs from the demo repo root so
# the relative Kiro paths and the printed commands are the ones a user would run.
earsyntax() {
  node "$CLI" "$@"
}

run_earsyntax() {
  print_cmd "$@"
  earsyntax "$@"
}

write_kiro_spec() {
  mkdir -p "$DEMO_DIR/.kiro/specs/checkout"
  cat >"$DEMO_DIR/$SPEC_REL" <<MD
# Requirements Document

## Introduction

Requirements for the checkout feature, written in the Kiro house style: all-caps
keywords, THE SYSTEM as the literal system name, and no comma after a leading
clause.

## Requirements

### Requirement 1

**User Story:** As a shopper, I want to pay for my cart, so that I can complete
my order.

#### Acceptance Criteria

1. WHEN a shopper submits valid payment details THE SYSTEM SHALL create a paid order.
2. IF the payment provider declines the charge THEN THE SYSTEM SHALL show a decline message.
$BROKEN_LINE
MD
}

# Deterministic repair: replace the exact broken criterion with its fixed form.
# Stands in for the agent edit when RUN_CLAUDE is not set. Exact-line awk match,
# so it touches nothing else and is portable across macOS and GNU userlands.
deterministic_repair() {
  local target="$DEMO_DIR/$SPEC_REL"
  awk -v old="$BROKEN_LINE" -v new="$FIXED_LINE" \
    '$0 == old { print new; next } { print }' "$target" >"$target.tmp"
  mv "$target.tmp" "$target"
}

# Try Claude Code for the repair; fall back to the deterministic edit.
run_repair() {
  local prompt="/earsyntax-repair $SPEC_REL --profile $PROFILE"

  printf "\n%s$ %q -p %q%s\n" "$MAGENTA" "$CLAUDE_BIN" "$prompt" "$RESET"
  if [[ "$RUN_CLAUDE" != "1" ]]; then
    warn "# skipped: set RUN_CLAUDE=1 to call Claude Code; applying the deterministic repair instead"
    deterministic_repair
    return 0
  fi

  if ! command -v "$CLAUDE_BIN" >/dev/null 2>&1; then
    warn "# Claude binary not found ($CLAUDE_BIN); applying the deterministic repair instead"
    deterministic_repair
    return 0
  fi

  note "# Claude Code is now in control inside the spec repo."
  ( cd "$DEMO_DIR" && "$CLAUDE_BIN" -p "$prompt" ) || \
    warn "# Claude Code exited nonzero; the revalidation loop will repair deterministically if needed"
}

# Validate the spec. Returns the CLI exit code without tripping set -e.
validate_spec() {
  print_cmd validate "$SPEC_GLOB" --profile "$PROFILE"
  local code=0
  earsyntax validate "$SPEC_GLOB" --profile "$PROFILE" || code=$?
  return "$code"
}

printf "%sHost-native earsyntax loop demo%s\n" "$BOLD$CYAN" "$RESET"
printf "Spec repo: %s%s%s\n" "$GREEN" "$DEMO_DIR" "$RESET"
printf "Repair mode: %s%s%s\n" "$MAGENTA" "$([[ "$RUN_CLAUDE" == "1" ]] && echo "Claude Code" || echo "deterministic")" "$RESET"
printf "Pauses: %s%s%s\n" "$YELLOW" "$([[ "$PAUSE" == "0" ]] && echo "off" || echo "on")" "$RESET"

write_kiro_spec
cd "$DEMO_DIR"

section "1. A Kiro spec repo" "The feature spec lives at $SPEC_REL. One acceptance criterion is missing its shall boundary."
note "$SPEC_REL"
cat "$SPEC_REL"

section "2. Detect the host" "doctor scans the repo, recognizes Kiro from .kiro/specs, and recommends commands."
run_earsyntax doctor

section "3. Render the integration files" "init writes the Claude slash commands and the Kiro steering plus validate hook. Idempotent."
run_earsyntax init --agent claude --host "$PROFILE"

section "4. Extract the candidates" "extract shows exactly which lines the Kiro profile treats as requirements."
run_earsyntax extract "$SPEC_GLOB" --profile "$PROFILE" --json

section "5. Validate (expected to fail)" "The third criterion has no shall, so validation reports EARS-E007 and exits 1."
if validate_spec; then
  warn "# unexpected: the spec validated clean before repair"
else
  note "# validation failed as expected (exit 1); moving to repair"
fi

section "6. Repair the broken criterion" "With RUN_CLAUDE=1 Claude Code runs /earsyntax-repair. Otherwise the deterministic edit fixes the line."
run_repair

section "7. Revalidate until clean" "Loop validate then repair until the spec passes, so a partial agent edit still converges."
attempt=1
max_attempts=3
while true; do
  note "# revalidation attempt $attempt"
  if validate_spec; then
    success "# spec is clean (exit 0)"
    break
  fi
  if [[ "$attempt" -ge "$max_attempts" ]]; then
    warn "# still failing after $attempt attempts; forcing the deterministic repair"
    deterministic_repair
    validate_spec
    success "# spec is clean (exit 0)"
    break
  fi
  warn "# still failing; repairing again"
  deterministic_repair
  attempt=$((attempt + 1))
done

section "8. Emit SARIF for CI" "The same validation writes a SARIF 2.1.0 log a code-scanning step can upload."
print_cmd validate "$SPEC_GLOB" --profile "$PROFILE" --sarif
earsyntax validate "$SPEC_GLOB" --profile "$PROFILE" --sarif >"$SARIF_FILE"
note "# wrote $SARIF_FILE ($(wc -c <"$SARIF_FILE" | tr -d ' ') bytes); first lines:"
head -n 12 "$SARIF_FILE"
note "..."
note "# CI step: upload $SARIF_FILE with github/codeql-action/upload-sarif so findings surface in the Security tab."

section "9. Wire it into CI" "One command gates every push; a nonzero exit fails the job."
note "earsyntax validate \"$SPEC_GLOB\" --profile $PROFILE --sarif > $SARIF_FILE"

echo
success "Demo complete. Spec repo: $DEMO_DIR"
