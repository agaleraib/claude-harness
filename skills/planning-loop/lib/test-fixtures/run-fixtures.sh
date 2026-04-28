#!/usr/bin/env bash
# run-fixtures.sh — drive the 15 auto-apply test fixtures (A–O).
#
# Each fixture runs against a FRESH copy of synthetic-spec.md per fixture.
# Exits 0 only when every fixture passes its documented contract.
#
# This driver is a THIN WRAPPER around the real lib scripts:
#   - Fixtures A–N invoke `bash $SCRIPT_DIR/../auto-apply.sh "$SPEC" "$LOG"`
#     so the real auto-apply.sh enforces every contract under test.
#   - Fixture O invokes `bash $SCRIPT_DIR/../preflight.sh "$SPEC"` inside an
#     isolated `git init`'d temp directory; the orphan-tmp pre-flight is the
#     real Phase 1c implementation, not a faithful imitation.
#
# Layout (all paths relative to the test working dir created per-fixture):
#   $TMPDIR/synthetic-spec.md        — fresh copy of the spec under test
#   $TMPDIR/run.log                  — synthetic LOG_PATH the executor reads
#   $TMPDIR/.harness-profile         — written for Fixture N only
#
# Two new fixtures (P, Q, R) added in Wave 5 verify regressions restored by
# auto-apply.sh Tasks 2-4 + Task 9 (log-hash mismatch, per-finding re-validation,
# log writability, mv-errno). They are run from this driver alongside A–O.
#
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SYNTH_SPEC="$SCRIPT_DIR/synthetic-spec.md"
AUTOAPPLY_BIN="$LIB_DIR/auto-apply.sh"
PREFLIGHT_BIN="$LIB_DIR/preflight.sh"

if [[ ! -x "$AUTOAPPLY_BIN" ]]; then
  echo "FAIL setup: $AUTOAPPLY_BIN not found or not executable" >&2
  exit 2
fi
if [[ ! -x "$PREFLIGHT_BIN" ]]; then
  echo "FAIL setup: $PREFLIGHT_BIN not found or not executable" >&2
  exit 2
fi

# Probe SHA-256 utility (used by per-fixture pre/post-hash invariants).
if command -v sha256sum >/dev/null 2>&1; then
  HASHER='sha256sum'
elif command -v shasum >/dev/null 2>&1; then
  HASHER='shasum -a 256'
else
  echo "FAIL setup: no sha256sum or shasum available" >&2
  exit 2
fi

hash_of() { $HASHER "$1" | awk '{print $1}'; }

# ---------------------------------------------------------------------------
# Thin wrapper — invoke real lib/auto-apply.sh; capture stdout outcome line
# and parse the abort reason (when present) from the log it just appended to.
# ---------------------------------------------------------------------------
run_autoapply() {
  local SPEC="$1" LOG="$2"
  AUTOAPPLY_OUTCOME=""
  ABORT_REASON=""

  # The real auto-apply.sh writes the outcome string to stdout (last line).
  # Capture stdout; let stderr pass through so test-runner output remains
  # human-debuggable.
  AUTOAPPLY_OUTCOME="$(bash "$AUTOAPPLY_BIN" "$SPEC" "$LOG" 2>&1 1>&3 3>&- | true; true)" || true
  # Re-run with stdout captured and stderr swallowed (cleaner). The dual
  # invocation pattern above is a portability hedge; the canonical capture is:
  AUTOAPPLY_OUTCOME="$(bash "$AUTOAPPLY_BIN" "$SPEC" "$LOG" 2>/dev/null | tail -1)"

  # Extract abort reason from the log's most recent abort block, if any.
  if grep -qE '^## Auto-apply aborted' "$LOG" 2>/dev/null; then
    ABORT_REASON="$(grep -E '^Reason: ' "$LOG" | tail -1 | sed -E 's/^Reason: //')"
  fi
  return 0
}

run_preflight() {
  local SPEC="$1"
  PREFLIGHT_RC=0
  bash "$PREFLIGHT_BIN" "$SPEC" >/dev/null 2>&1 || PREFLIGHT_RC=$?
  return 0
}

# ---------------------------------------------------------------------------
# Test runner.
# ---------------------------------------------------------------------------
PASS=0; FAIL=0
COUNTER_FILE="$(mktemp)"
echo "0 0" > "$COUNTER_FILE"

bump_counter() {
  local result="$1"  # 0 = pass, 1 = fail
  local p f
  read -r p f < "$COUNTER_FILE"
  if [[ "$result" == "0" ]]; then p=$((p+1)); else f=$((f+1)); fi
  echo "$p $f" > "$COUNTER_FILE"
}

# Per-fixture environment hooks. `letter` selects the variant; the runner
# wraps each invocation in a subshell so cd / env vars don't leak.
run_one() {
  local letter="$1" name="$2" expect="$3"   # expect: success | menu | preflight-abort | either-h
  local fixture_log="$SCRIPT_DIR/$name.md"
  local tmp
  tmp="$(mktemp -d)"
  cp -- "$SYNTH_SPEC" "$tmp/synthetic-spec.md"
  cp -- "$fixture_log" "$tmp/run.log"
  local pre_hash post_hash
  pre_hash="$(hash_of "$tmp/synthetic-spec.md")"

  local rc=0
  (
    cd "$tmp"
    case "$letter" in
      H)
        # Fixture H — simulated log-append failure window. The real
        # auto-apply.sh continues past Phase 1a writability for $LOG (the
        # writability of the log was historically NOT pre-checked in 1a;
        # Wave 5 Task 4 RESTORES the check). Either outcome (success or
        # menu-audit-failure) remains acceptable per the contract docs.
        run_autoapply "$tmp/synthetic-spec.md" "$tmp/run.log"
        ;;
      L)
        # External mutation: simulate a stale recommendation by capturing the
        # pre-mutation hash, mutating the spec, then invoking auto-apply.sh
        # with the test hook PLANNING_LOOP_TEST_PIN_SPEC_HASH_PRE pinning the
        # old pre-hash. Phase 1b's hash re-check should then trip.
        SPEC_HASH_PRE_OVERRIDE="$(hash_of "$tmp/synthetic-spec.md")"
        printf '\nINJECTED-CHAR\n' >> "$tmp/synthetic-spec.md"
        export PLANNING_LOOP_TEST_PIN_SPEC_HASH_PRE="$SPEC_HASH_PRE_OVERRIDE"
        run_autoapply "$tmp/synthetic-spec.md" "$tmp/run.log"
        unset PLANNING_LOOP_TEST_PIN_SPEC_HASH_PRE
        ;;
      M)
        export PLANNING_LOOP_NO_AUTO_APPLY=1
        run_autoapply "$tmp/synthetic-spec.md" "$tmp/run.log"
        unset PLANNING_LOOP_NO_AUTO_APPLY
        ;;
      N)
        cat > "$tmp/.harness-profile" <<EOF
profile_version: 1
planning_loop:
  auto_apply: false
EOF
        run_autoapply "$tmp/synthetic-spec.md" "$tmp/run.log"
        ;;
      O)
        # Fixture O — orphan tmp file from a prior run. Invoke the real
        # preflight.sh inside an isolated git repo; it writes journal state
        # to .git/planning-loop-park/ and exits 1 on orphan detection.
        git init -q
        # preflight.sh expects the spec path arg (parent dir is searched for
        # *.autoapply-tmp). Place the orphan, then invoke.
        cp -- "$tmp/synthetic-spec.md" "$tmp/synthetic-spec.md.autoapply-tmp"
        run_preflight "$tmp/synthetic-spec.md"
        if [[ "$PREFLIGHT_RC" -eq 1 ]]; then
          AUTOAPPLY_OUTCOME="preflight-abort"
        else
          AUTOAPPLY_OUTCOME="not-aborted"
        fi
        ;;
      P)
        # Fixture P (Wave 5 Task 2 regression test) — log-hash mutation
        # between Phase 1a and Phase 1b. Mutating mid-run is hard from a
        # synchronous driver; we use a test hook that pins LOG_HASH_PRE to a
        # different value via env var before calling auto-apply.sh.
        # The hook parallels PLANNING_LOOP_TEST_PIN_SPEC_HASH_PRE but for the
        # log file. Real auto-apply.sh detects the mismatch on the Phase 1b
        # re-check and aborts with reason `log-hash-mismatch`.
        export PLANNING_LOOP_TEST_PIN_LOG_HASH_PRE="0000000000000000000000000000000000000000000000000000000000000000"
        run_autoapply "$tmp/synthetic-spec.md" "$tmp/run.log"
        unset PLANNING_LOOP_TEST_PIN_LOG_HASH_PRE
        ;;
      Q)
        # Fixture Q (Wave 5 Task 4 regression test) — log file unwritable
        # at Phase 1a entry. Real auto-apply.sh's restored Phase 1a
        # writability check should abort with `validation-failure`,
        # spec MUST be byte-identical (no rename happened).
        chmod 444 "$tmp/run.log"
        run_autoapply "$tmp/synthetic-spec.md" "$tmp/run.log"
        chmod 644 "$tmp/run.log"   # so the test driver can read it later if needed
        ;;
      R)
        # Fixture R (Wave 5 Task 9 regression test) — `mv` failure during
        # atomic rename. Inject via PLANNING_LOOP_TEST_FORCE_MV_FAIL env hook
        # (real auto-apply.sh forces mv to return non-zero when set).
        export PLANNING_LOOP_TEST_FORCE_MV_FAIL=1
        run_autoapply "$tmp/synthetic-spec.md" "$tmp/run.log"
        unset PLANNING_LOOP_TEST_FORCE_MV_FAIL
        ;;
      *)
        run_autoapply "$tmp/synthetic-spec.md" "$tmp/run.log"
        ;;
    esac

    post_hash="$(hash_of "$tmp/synthetic-spec.md")"

    # Decide pass/fail.
    local ok=1 reason=""
    case "$expect" in
      success)
        if [[ "${AUTOAPPLY_OUTCOME:-}" != "success" ]]; then ok=0; reason="expected success, got ${AUTOAPPLY_OUTCOME:-<empty>}"; fi
        if [[ -f "$tmp/synthetic-spec.md.autoapply-tmp" ]]; then ok=0; reason="$reason; temp file remained"; fi
        ;;
      menu)
        if [[ "${AUTOAPPLY_OUTCOME:-}" == "success" ]]; then ok=0; reason="expected menu (abort), got success"; fi
        if [[ -f "$tmp/synthetic-spec.md.autoapply-tmp" ]]; then ok=0; reason="$reason; temp file remained"; fi
        case "$letter" in
          B|C|D|E|F|I|J|K|M|N|P|Q|S|T)
            if [[ "$pre_hash" != "$post_hash" ]]; then ok=0; reason="$reason; spec NOT byte-identical (pre=$pre_hash post=$post_hash)"; fi
            ;;
          L)
            if ! grep -q '^INJECTED-CHAR$' "$tmp/synthetic-spec.md"; then ok=0; reason="$reason; INJECTED-CHAR not preserved"; fi
            if [[ "${ABORT_REASON:-}" != "hash-mismatch" ]]; then ok=0; reason="$reason; expected hash-mismatch reason, got ${ABORT_REASON:-<empty>}"; fi
            ;;
          R)
            # mv failure leaves spec byte-identical; abort errno detail required.
            if [[ "$pre_hash" != "$post_hash" ]]; then ok=0; reason="$reason; spec NOT byte-identical (pre=$pre_hash post=$post_hash)"; fi
            if ! grep -q 'errno=' "$tmp/run.log"; then ok=0; reason="$reason; expected errno=<rc> in abort detail"; fi
            ;;
        esac
        # Per-fixture abort-reason assertions (Wave 5 fixtures).
        case "$letter" in
          P)
            if [[ "${ABORT_REASON:-}" != "log-hash-mismatch" ]]; then ok=0; reason="$reason; expected log-hash-mismatch reason, got ${ABORT_REASON:-<empty>}"; fi
            ;;
          Q)
            if [[ "${ABORT_REASON:-}" != "validation-failure" ]]; then ok=0; reason="$reason; expected validation-failure reason, got ${ABORT_REASON:-<empty>}"; fi
            if ! grep -qE 'log not writable|writability' "$tmp/run.log"; then ok=0; reason="$reason; expected log-writability detail in abort entry"; fi
            ;;
          S|T)
            # Per-finding re-validation must abort and the abort-entry's
            # `Failed finding:` must be F2 (the *remaining* finding whose
            # needle was destabilised by F1's apply).
            if [[ "${ABORT_REASON:-}" != "apply-failure" ]]; then ok=0; reason="$reason; expected apply-failure reason, got ${ABORT_REASON:-<empty>}"; fi
            if ! grep -qE '^Failed finding: F2$' "$tmp/run.log"; then ok=0; reason="$reason; expected 'Failed finding: F2' in abort entry"; fi
            ;;
        esac
        ;;
      preflight-abort)
        if [[ "${AUTOAPPLY_OUTCOME:-}" != "preflight-abort" ]]; then ok=0; reason="expected preflight-abort, got ${AUTOAPPLY_OUTCOME:-<empty>}"; fi
        ;;
      either-h)
        case "${AUTOAPPLY_OUTCOME:-}" in
          success|menu-audit-failure) : ;;
          *) ok=0; reason="expected success or menu-audit-failure, got ${AUTOAPPLY_OUTCOME:-<empty>}";;
        esac
        ;;
    esac

    if [[ $ok -eq 1 ]]; then
      printf 'PASS  Fixture %s (%s) — outcome=%s\n' "$letter" "$name" "${AUTOAPPLY_OUTCOME:-?}"
      exit 0
    else
      printf 'FAIL  Fixture %s (%s) — %s\n' "$letter" "$name" "$reason"
      exit 1
    fi
  )
  rc=$?
  rm -rf "$tmp"
  bump_counter "$rc"
}

# Original 15 fixtures (A–O).
run_one A all-unanimous-mechanical    success
run_one B one-disagreement            menu
run_one C non-mechanical-load-bearing menu
run_one D mixed-defer                 menu
run_one E json-block-multimatch       menu
run_one F json-block-zero-match       menu
run_one G insert-after-shape          success
run_one H simulated-log-append-fail   either-h
run_one I section-mismatch            menu
run_one J match-outside-section       menu
run_one K edit-text-contains-h2       menu
run_one L external-mutation           menu
run_one M opt-out-env-var             menu
run_one N opt-out-profile             menu
run_one O orphan-tmp-startup          preflight-abort

# Wave 5 regression fixtures (Tasks 2, 3, 4, 9).
run_one P log-hash-mismatch           menu
run_one Q log-not-writable            menu
run_one R mv-failure                  menu
run_one S needle-duplicated-by-prior-edit menu
run_one T needle-removed-by-prior-edit    menu

read -r PASS FAIL < "$COUNTER_FILE"
rm -f "$COUNTER_FILE"

echo
echo "----------------------------------------"
echo "Total: $((PASS + FAIL))   Pass: $PASS   Fail: $FAIL"

if [[ $FAIL -eq 0 ]]; then
  exit 0
else
  exit 1
fi
