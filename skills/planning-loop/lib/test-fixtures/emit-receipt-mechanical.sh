#!/usr/bin/env bash
# emit-receipt-mechanical.sh — mechanical assertions for the §4.5/§4.7/§4.8
# acceptance criteria of docs/specs/2026-05-01-claude-adapter-alignment.md.
#
# Driven by run-fixtures.sh after the auto-apply A–U + V1–V7 + W1–W2 fixtures.
# Replaces the prose-only documentation fixtures (idempotency.md,
# crash-recovery.md, preflight-abort-readonly-state.md) with executable
# assertions that exercise skills/_shared/lib/emit-receipt.sh end-to-end.
#
# Exits 0 only when all three §-criteria pass.
#
# Bash 3.2 compatible (macOS default shell).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Resolve the repo root by walking up to the directory that contains
# skills/_shared/lib/emit-receipt.sh (works whether the runner is invoked
# from the worktree, master, or a global symlink).
HARNESS_LIB="$(cd "$SCRIPT_DIR/../../../.." && pwd)/skills/_shared/lib/emit-receipt.sh"
if [[ ! -f "$HARNESS_LIB" ]]; then
  echo "FAIL setup: $HARNESS_LIB not found" >&2
  exit 2
fi

# Counters live in a temp file so subshell-driven note_* writes are visible
# in the parent shell at summary time (bash 3.2 — no built-in IPC).
COUNTER_FILE="$(mktemp)"
echo "0 0" > "$COUNTER_FILE"

note_pass() {
  printf '  PASS  %s\n' "$1"
  local p f
  read -r p f < "$COUNTER_FILE"
  echo "$((p + 1)) $f" > "$COUNTER_FILE"
}
note_fail() {
  printf '  FAIL  %s\n' "$1"
  local p f
  read -r p f < "$COUNTER_FILE"
  echo "$p $((f + 1))" > "$COUNTER_FILE"
}

# -----------------------------------------------------------------------------
# §4.5 — Idempotency fixture
#
# Spec §4.5 acceptance criteria:
#   - Same inputs → identical idempotency_key.value byte-for-byte.
#   - Identical operation_id byte-for-byte.
#   - Second invocation no-ops to the first receipt (does not create a new file).
# -----------------------------------------------------------------------------
echo "== §4.5 Idempotency fixture =="
(
  TMP=$(mktemp -d)
  export EMIT_RECEIPT_TEST_HARNESS_STATE_DIR="$TMP"
  export EMIT_RECEIPT_TEST_PIN_TIMESTAMP="2026-05-01T180000Z"
  echo "fixture-content-A" > "$TMP/in.txt"

  # First invocation.
  source "$HARNESS_LIB"
  emit_receipt_init run-wave "11" "$TMP/in.txt"
  emit_receipt_set_spec_path "docs/specs/fixture-test.md"
  PREFLIGHT="$(emit_receipt_preflight)"
  if [[ "$PREFLIGHT" != "PROCEED" ]]; then
    echo "  SETUP FAIL: first preflight not PROCEED: $PREFLIGHT"
    rm -rf "$TMP"; exit 1
  fi
  emit_receipt_started
  FIRST_KEY=$(emit_receipt_compute_idempotency_key)
  FIRST_OPID=$(emit_receipt_compute_operation_id)
  emit_receipt_terminal success "" "$TMP/out1"
  FIRST_RECEIPT_COUNT=$(find "$TMP" -maxdepth 1 -name '*.yml' -type f | wc -l | tr -d ' ')

  # Second invocation, identical inputs.
  emit_receipt_init run-wave "11" "$TMP/in.txt"
  emit_receipt_set_spec_path "docs/specs/fixture-test.md"
  SECOND_KEY=$(emit_receipt_compute_idempotency_key)
  SECOND_OPID=$(emit_receipt_compute_operation_id)
  PREFLIGHT2="$(emit_receipt_preflight)"
  SECOND_RECEIPT_COUNT=$(find "$TMP" -maxdepth 1 -name '*.yml' -type f | wc -l | tr -d ' ')

  rc=0
  if [[ "$FIRST_KEY" == "$SECOND_KEY" ]]; then
    note_pass "idempotency_key byte-equal across invocations"
  else
    note_fail "idempotency_key MISMATCH: first=$FIRST_KEY second=$SECOND_KEY"
    rc=1
  fi
  if [[ "$FIRST_OPID" == "$SECOND_OPID" ]]; then
    note_pass "operation_id byte-equal across invocations"
  else
    note_fail "operation_id MISMATCH: first=$FIRST_OPID second=$SECOND_OPID"
    rc=1
  fi
  if [[ "$PREFLIGHT2" == NOOP* ]]; then
    note_pass "second invocation Stage-A no-ops"
  else
    note_fail "second invocation should NOOP, got: $PREFLIGHT2"
    rc=1
  fi
  if [[ "$FIRST_RECEIPT_COUNT" == "$SECOND_RECEIPT_COUNT" ]]; then
    note_pass "no new receipt file on second invocation"
  else
    note_fail "receipt count grew: first=$FIRST_RECEIPT_COUNT second=$SECOND_RECEIPT_COUNT"
    rc=1
  fi

  # Recompute the embedded key from trace; must match.
  RECEIPT=$(find "$TMP" -maxdepth 1 -name '*.yml' -type f | head -1)
  EMBEDDED=$(awk '
    /^idempotency_key:/ { in_ik=1; next }
    in_ik && /^[[:alnum:]_]+:/ && !/^idempotency_key:/ { in_ik=0 }
    in_ik && /^  value:/ { sub("^  value:[[:space:]]*", ""); print; exit }
  ' "$RECEIPT")
  if [[ "$EMBEDDED" == "$FIRST_KEY" ]]; then
    note_pass "embedded idempotency_key.value matches recomputed"
  else
    note_fail "embedded key mismatch: embedded=$EMBEDDED computed=$FIRST_KEY"
    rc=1
  fi

  rm -rf "$TMP"
  exit $rc
)
RC=$?
if [[ "$RC" -ne 0 ]]; then FAIL=$((FAIL + 1)); fi
echo

# -----------------------------------------------------------------------------
# §4.7 — Crash-recovery fixture
#
# Spec §4.7 acceptance criteria:
#   - SIGTERM mid-flight → receipt has status=aborted-on-ambiguity.
#   - No orphan .tmp files remain.
#   - Re-running same operation chains retry_of via Stage B.
#   - Companion: clean non-zero exit writes failed; re-run does NOT chain
#     retry_of (failed is terminal per schema).
# -----------------------------------------------------------------------------
echo "== §4.7 Crash-recovery fixture =="
(
  TMP=$(mktemp -d)
  export EMIT_RECEIPT_TEST_HARNESS_STATE_DIR="$TMP"

  # --- Sub-case 1: SIGTERM-equivalent — trap-driven aborted-on-ambiguity. ---
  # We can't easily SIGTERM the current process synchronously; the trap
  # handler is exercised by sourcing the helper, calling started, then
  # invoking the trap handler directly with a non-zero rc to mimic an exit.
  # This proves the same code path that a real SIGTERM would drive.
  bash -c '
    set -uo pipefail
    export EMIT_RECEIPT_TEST_HARNESS_STATE_DIR="'"$TMP"'"
    export EMIT_RECEIPT_TEST_PIN_TIMESTAMP="2026-05-01T190000Z"
    source "'"$HARNESS_LIB"'"
    emit_receipt_init run-wave "12" /tmp/nonexistent
    PREFLIGHT="$(emit_receipt_preflight)"
    emit_receipt_started
    # Default trap cause = aborted-on-ambiguity (signal default).
    # Force exit non-zero, trap fires.
    exit 143
  '
  RC1=$?
  RECEIPT1=$(find "$TMP" -maxdepth 1 -name 'run-wave-12-*.yml' -type f | head -1)
  if [[ -n "$RECEIPT1" ]]; then
    STATUS1=$(grep '^status:' "$RECEIPT1" | head -1 | sed 's/^status: *//')
    if [[ "$STATUS1" == "aborted-on-ambiguity" ]]; then
      note_pass "trap-driven exit yields status=aborted-on-ambiguity"
    else
      note_fail "expected aborted-on-ambiguity, got '$STATUS1'"
    fi
  else
    note_fail "no terminal receipt produced for crash sub-case 1"
  fi
  TMP_LEFTOVERS=$(find "$TMP" -maxdepth 1 -name '*.tmp' -type f | wc -l | tr -d ' ')
  if [[ "$TMP_LEFTOVERS" == "0" ]]; then
    note_pass "no orphan .tmp receipt files"
  else
    note_fail "$TMP_LEFTOVERS orphan .tmp files remain"
  fi

  # --- Sub-case 2: Re-run after aborted-on-ambiguity chains retry_of (Stage B). ---
  source "$HARNESS_LIB"
  export EMIT_RECEIPT_TEST_PIN_TIMESTAMP="2026-05-01T190100Z"
  emit_receipt_init run-wave "12" /tmp/nonexistent
  PREFLIGHT="$(emit_receipt_preflight)"
  emit_receipt_started
  FRESH_RECEIPT=$(emit_receipt_get_path)
  emit_receipt_terminal success "" "/tmp/done"
  RETRY_OF=$(grep '^retry_of:' "$FRESH_RECEIPT" 2>/dev/null | sed 's/^retry_of: *//')
  if [[ -n "$RETRY_OF" ]]; then
    note_pass "Stage B chains retry_of after aborted-on-ambiguity (=$RETRY_OF)"
  else
    note_fail "expected retry_of on Stage-B-resumed run, got empty"
  fi

  rm -rf "$TMP"
)

# --- Sub-case 3: Clean non-zero exit produces failed (terminal). ---
(
  TMP=$(mktemp -d)
  export EMIT_RECEIPT_TEST_HARNESS_STATE_DIR="$TMP"
  bash -c '
    set -uo pipefail
    export EMIT_RECEIPT_TEST_HARNESS_STATE_DIR="'"$TMP"'"
    export EMIT_RECEIPT_TEST_PIN_TIMESTAMP="2026-05-01T191500Z"
    source "'"$HARNESS_LIB"'"
    emit_receipt_init close-wave "13" /tmp/nonexistent2
    PREFLIGHT="$(emit_receipt_preflight)"
    emit_receipt_started
    # Caller sets cause=failed before non-zero exit (clean non-zero per spec).
    EMIT_RECEIPT__TRAP_CAUSE=failed
    exit 1
  '
  RECEIPT2=$(find "$TMP" -maxdepth 1 -name 'close-wave-13-*.yml' -type f | head -1)
  if [[ -n "$RECEIPT2" ]]; then
    STATUS2=$(grep '^status:' "$RECEIPT2" | head -1 | sed 's/^status: *//')
    if [[ "$STATUS2" == "failed" ]]; then
      note_pass "clean non-zero with TRAP_CAUSE=failed yields status=failed"
    else
      note_fail "expected failed, got '$STATUS2'"
    fi
  else
    note_fail "no terminal receipt produced for crash sub-case 3"
  fi

  # --- Sub-case 4: Re-run after failed does NOT chain retry_of. ---
  source "$HARNESS_LIB"
  export EMIT_RECEIPT_TEST_PIN_TIMESTAMP="2026-05-01T191600Z"
  emit_receipt_init close-wave "13" /tmp/nonexistent2
  PREFLIGHT="$(emit_receipt_preflight)"
  emit_receipt_started
  FRESH_RECEIPT=$(emit_receipt_get_path)
  emit_receipt_terminal success "" "/tmp/done"
  RETRY_OF2=$(grep '^retry_of:' "$FRESH_RECEIPT" 2>/dev/null | sed 's/^retry_of: *//')
  if [[ -z "$RETRY_OF2" ]]; then
    note_pass "no retry_of chained after terminal failed"
  else
    note_fail "expected no retry_of after failed, got '$RETRY_OF2'"
  fi

  rm -rf "$TMP"
)
echo

# -----------------------------------------------------------------------------
# §4.8 — Preflight-abort fixture (read-only .harness-state/)
#
# Spec §4.8 acceptance criteria:
#   - Read-only .harness-state/ → preflight aborts BEFORE any side effect
#     for /run-wave, /close-wave, /commit equivalents.
#   - Non-zero exit (2 = preflight rc).
#   - No receipt file written.
# -----------------------------------------------------------------------------
echo "== §4.8 Preflight-abort fixture (read-only .harness-state/) =="
(
  TMP=$(mktemp -d)
  RO_DIR="$TMP/state"
  mkdir -p "$RO_DIR"
  chmod 0500 "$RO_DIR"   # read+exec only — write blocked
  export EMIT_RECEIPT_TEST_HARNESS_STATE_DIR="$RO_DIR"

  rc=0
  for cmd in run-wave close-wave commit; do
    source "$HARNESS_LIB"
    EMIT_RECEIPT__TRAP_INSTALLED=0  # reset between sub-cases
    EMIT_RECEIPT__TERMINAL_WRITTEN=0
    trap - EXIT
    emit_receipt_init "$cmd" "14" /tmp/nonexistent3
    PREFLIGHT="$(emit_receipt_preflight 2>/dev/null)"
    PRE_RC=$?
    if [[ "$PRE_RC" == "2" ]]; then
      note_pass "$cmd preflight aborts with rc=2 on read-only .harness-state/"
    else
      note_fail "$cmd preflight should rc=2, got $PRE_RC (output: $PREFLIGHT)"
      rc=1
    fi
  done

  RECEIPT_COUNT=$(find "$RO_DIR" -maxdepth 1 -name '*.yml' -type f 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$RECEIPT_COUNT" == "0" ]]; then
    note_pass "no receipt files written under read-only .harness-state/"
  else
    note_fail "$RECEIPT_COUNT receipt files leaked into read-only .harness-state/"
    rc=1
  fi

  chmod 0700 "$RO_DIR"
  rm -rf "$TMP"
  exit $rc
)
RC4=$?
if [[ "$RC4" -ne 0 ]]; then FAIL=$((FAIL + 1)); fi
echo

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
read -r PASS FAIL < "$COUNTER_FILE"
rm -f "$COUNTER_FILE"
echo "----------------------------------------"
echo "emit-receipt mechanical fixtures: pass=$PASS fail=$FAIL"
if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi
exit 0
