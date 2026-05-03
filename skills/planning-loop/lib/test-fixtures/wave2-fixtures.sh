#!/usr/bin/env bash
# wave2-fixtures.sh — exercise /archive-plan + /harness-status fixtures.
#
# Each fixture sets up an isolated test environment under mktemp, drives
# the real archive.sh / scan.sh helper, and asserts the contract documented
# in the corresponding fixture .md file. Pass/fail count is printed as
# `Wave 2 fixtures: pass=N fail=M` on the final line for run-fixtures.sh
# to aggregate.
#
# Bash 3.2 compatible (no associative arrays, no process substitution where
# avoidable). SHA-256 via sha256sum / shasum fallback.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
ARCHIVE_BIN="$REPO_ROOT/skills/archive-plan/lib/archive.sh"
SCAN_BIN="$REPO_ROOT/skills/harness-status/lib/scan.sh"

if [[ ! -x "$ARCHIVE_BIN" ]]; then
  echo "FAIL setup: $ARCHIVE_BIN not found or not executable" >&2
  echo "Wave 2 fixtures: pass=0 fail=1"
  exit 1
fi
if [[ ! -x "$SCAN_BIN" ]]; then
  echo "FAIL setup: $SCAN_BIN not found or not executable" >&2
  echo "Wave 2 fixtures: pass=0 fail=1"
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  fx_sha() { sha256sum | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  fx_sha() { shasum -a 256 | awk '{print $1}'; }
else
  echo "FAIL setup: no sha256sum or shasum" >&2
  echo "Wave 2 fixtures: pass=0 fail=1"
  exit 1
fi
fx_sha_of_file() { fx_sha < "$1"; }

PASS=0
FAIL=0

fx_make_plan_repo() {
  local rows="$1"
  local missing="$2"
  local tmp
  tmp="$(mktemp -d)"
  mkdir -p "$tmp/docs/waves" "$tmp/.harness-state" "$tmp/skills/_shared/lib" "$tmp/skills/archive-plan/lib"
  {
    printf '# test plan\n\n'
    printf '## Now\n\n(none)\n\n'
    printf '## Next\n\n(none)\n\n'
    printf '## Blocked\n\n(none)\n\n'
    printf '## Recently Shipped\n\n'
    # Newest first (matches real plan.md convention — close-wave prepends).
    local i="$rows"
    while [[ "$i" -ge 1 ]]; do
      printf -- '- [x] Wave %s - test wave %s -> docs/waves/wave%s-test.md (sha%s)\n' "$i" "$i" "$i" "$i"
      i=$((i - 1))
    done
  } > "$tmp/docs/plan.md"
  local i=1
  while [[ "$i" -le "$rows" ]]; do
    if [[ -z "$missing" || "$i" != "$missing" ]]; then
      cat > "$tmp/docs/waves/wave${i}-test.md" <<EOF
---
wave_number: $i
slug: test
spec_path: docs/specs/test.md
merge_sha: sha$i
closed_at: 2026-05-03
---

# Wave $i test
EOF
    fi
    i=$((i + 1))
  done
  ln -s "$REPO_ROOT/skills/_shared/lib/emit-receipt.sh" "$tmp/skills/_shared/lib/emit-receipt.sh"
  ln -s "$ARCHIVE_BIN" "$tmp/skills/archive-plan/lib/archive.sh"
  ( cd "$tmp" && git init -q && git add -A && git -c user.email=fx@test -c user.name=fx commit -q -m initial ) >/dev/null 2>&1
  printf '%s' "$tmp"
}

fx_make_scan_repo() {
  local tmp
  tmp="$(mktemp -d)"
  mkdir -p "$tmp/skills/_shared/lib" "$tmp/skills/harness-status/lib" "$tmp/.harness-state"
  ln -s "$REPO_ROOT/skills/_shared/lib/emit-receipt.sh" "$tmp/skills/_shared/lib/emit-receipt.sh"
  ln -s "$SCAN_BIN" "$tmp/skills/harness-status/lib/scan.sh"
  ( cd "$tmp" && git init -q && git -c user.email=fx@test -c user.name=fx commit -q --allow-empty -m initial ) >/dev/null 2>&1
  printf '%s' "$tmp"
}

bump() {
  if [[ "$1" -eq 0 ]]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi
}

fx_archive_plan_normal_run() {
  local tmp
  tmp="$(fx_make_plan_repo 5 "")"
  ( cd "$tmp" && bash skills/archive-plan/lib/archive.sh ) > "$tmp/run.out" 2> "$tmp/run.err"
  local rc=$?
  local recently_count
  recently_count=$(awk '/^## Recently Shipped/{f=1; next} f && /^## /{f=0} f' "$tmp/docs/plan.md" | grep -c '^- \[x\] ' || true)
  local receipt
  receipt=$(ls "$tmp/.harness-state"/archive-plan-*.yml 2>/dev/null | head -1)
  local status=""
  [[ -n "$receipt" ]] && status=$(awk '/^status:/{print $2; exit}' "$receipt")
  if [[ "$rc" -eq 0 && "$recently_count" -eq 3 && "$status" == "success" ]]; then
    echo "PASS  archive-plan-normal-run (mutation; 5→3 rows; status=success)"
    rm -rf "$tmp"; return 0
  else
    echo "FAIL  archive-plan-normal-run (rc=$rc, count=$recently_count, status=$status)"
    cat "$tmp/run.err" >&2; rm -rf "$tmp"; return 1
  fi
}

fx_archive_plan_dry_run() {
  local tmp
  tmp="$(fx_make_plan_repo 5 "")"
  local pre_sha
  pre_sha=$(fx_sha_of_file "$tmp/docs/plan.md")
  ( cd "$tmp" && bash skills/archive-plan/lib/archive.sh --dry-run ) > "$tmp/run.out" 2> "$tmp/run.err"
  local rc=$?
  local post_sha
  post_sha=$(fx_sha_of_file "$tmp/docs/plan.md")
  local receipt
  receipt=$(ls "$tmp/.harness-state"/archive-plan-*.yml 2>/dev/null | head -1)
  local status=""
  [[ -n "$receipt" ]] && status=$(awk '/^status:/{print $2; exit}' "$receipt")
  local diff_present=0
  grep -q '^----- diff begins -----' "$tmp/run.out" && diff_present=1
  if [[ "$rc" -eq 0 && "$pre_sha" == "$post_sha" && "$status" == "partial" && "$diff_present" -eq 1 ]]; then
    echo "PASS  archive-plan-dry-run (byte-identical; status=partial; diff printed)"
    rm -rf "$tmp"; return 0
  else
    echo "FAIL  archive-plan-dry-run (rc=$rc; pre_sha=$pre_sha post_sha=$post_sha; status=$status; diff=$diff_present)"
    cat "$tmp/run.err" >&2; rm -rf "$tmp"; return 1
  fi
}

fx_archive_plan_idempotency() {
  local tmp
  tmp="$(fx_make_plan_repo 5 "")"
  ( cd "$tmp" && bash skills/archive-plan/lib/archive.sh ) > "$tmp/run1.out" 2> "$tmp/run1.err"
  local rc1=$?
  local count_after_1
  count_after_1=$(ls "$tmp/.harness-state"/archive-plan-*.yml 2>/dev/null | wc -l | tr -d ' ')
  ( cd "$tmp" && bash skills/archive-plan/lib/archive.sh ) > "$tmp/run2.out" 2> "$tmp/run2.err"
  local rc2=$?
  local count_after_2
  count_after_2=$(ls "$tmp/.harness-state"/archive-plan-*.yml 2>/dev/null | wc -l | tr -d ' ')
  local rows_2
  rows_2=$(awk '/^## Recently Shipped/{f=1; next} f && /^## /{f=0} f' "$tmp/docs/plan.md" | grep -c '^- \[x\] ' || true)
  if [[ "$rc1" -eq 0 && "$rc2" -eq 0 && "$rows_2" -eq 3 ]]; then
    echo "PASS  archive-plan-idempotency (rc1=0; rc2=0; final rows=3; receipt count $count_after_1 → $count_after_2)"
    rm -rf "$tmp"; return 0
  else
    echo "FAIL  archive-plan-idempotency (rc1=$rc1, rc2=$rc2, rows_2=$rows_2)"
    cat "$tmp/run2.err" >&2; rm -rf "$tmp"; return 1
  fi
}

fx_archive_plan_missing_wave_file() {
  local tmp
  tmp="$(fx_make_plan_repo 5 "2")"
  local pre_sha
  pre_sha=$(fx_sha_of_file "$tmp/docs/plan.md")
  ( cd "$tmp" && bash skills/archive-plan/lib/archive.sh ) > "$tmp/run.out" 2> "$tmp/run.err"
  local rc=$?
  local post_sha
  post_sha=$(fx_sha_of_file "$tmp/docs/plan.md")
  local receipt
  receipt=$(ls "$tmp/.harness-state"/archive-plan-*.yml 2>/dev/null | head -1)
  local status=""
  [[ -n "$receipt" ]] && status=$(awk '/^status:/{print $2; exit}' "$receipt")
  if [[ "$rc" -ne 0 && "$pre_sha" == "$post_sha" && "$status" == "aborted-on-ambiguity" ]]; then
    echo "PASS  archive-plan-missing-wave-file (rc=$rc; byte-identical; status=aborted-on-ambiguity)"
    rm -rf "$tmp"; return 0
  else
    echo "FAIL  archive-plan-missing-wave-file (rc=$rc; pre_sha=$pre_sha post_sha=$post_sha; status=$status)"
    cat "$tmp/run.err" >&2; rm -rf "$tmp"; return 1
  fi
}

fx_archive_plan_atomic_rename() {
  local tmp
  tmp="$(fx_make_plan_repo 5 "")"
  local pre_sha
  pre_sha=$(fx_sha_of_file "$tmp/docs/plan.md")
  ( cd "$tmp" && ARCHIVE_PLAN_TEST_FORCE_MV_FAIL=1 bash skills/archive-plan/lib/archive.sh ) > "$tmp/run.out" 2> "$tmp/run.err"
  local rc=$?
  local post_sha
  post_sha=$(fx_sha_of_file "$tmp/docs/plan.md")
  if [[ "$rc" -ne 0 && "$pre_sha" == "$post_sha" ]]; then
    echo "PASS  archive-plan-atomic-rename (rc=$rc; plan.md byte-identical pre/post)"
    rm -rf "$tmp"; return 0
  else
    echo "FAIL  archive-plan-atomic-rename (rc=$rc; pre_sha=$pre_sha post_sha=$post_sha)"
    cat "$tmp/run.err" >&2; rm -rf "$tmp"; return 1
  fi
}

fx_run_scan() {
  local invoking_dir="$1"; shift
  local registry_path="$1"; shift
  ( cd "$invoking_dir" && HARNESS_REGISTRY_PATH="$registry_path" bash skills/harness-status/lib/scan.sh "$@" ) > "$invoking_dir/scan.out" 2> "$invoking_dir/scan.err"
}

fx_capture_repo_state() {
  local repo="$1"
  local snapshot="$2"
  {
    printf 'HEAD=%s\n' "$(git -C "$repo" rev-parse HEAD 2>/dev/null || echo none)"
    printf 'INDEX=%s\n' "$(fx_sha_of_file "$repo/.git/index" 2>/dev/null || echo none)"
    printf 'GITHEAD=%s\n' "$(fx_sha_of_file "$repo/.git/HEAD" 2>/dev/null || echo none)"
    printf 'STATUS=%s\n' "$(GIT_OPTIONAL_LOCKS=0 git -C "$repo" --no-optional-locks status --porcelain 2>/dev/null | fx_sha)"
  } > "$snapshot"
}

fx_harness_status_readonly() {
  local invoke
  invoke="$(fx_make_scan_repo)"
  local sandbox
  sandbox="$(mktemp -d)"
  ( cd "$sandbox" && git init -q && touch a.txt && git add a.txt && git -c user.email=fx@test -c user.name=fx commit -q -m a ) >/dev/null
  local registry="$invoke/registry.yml"
  cat > "$registry" <<EOF
projects:
  - id: sandbox
    path: $sandbox
    group: test
EOF
  local pre="$invoke/pre.snap" post="$invoke/post.snap"
  fx_capture_repo_state "$sandbox" "$pre"
  fx_run_scan "$invoke" "$registry"
  local rc=$?
  fx_capture_repo_state "$sandbox" "$post"
  if [[ "$rc" -eq 0 ]] && diff -q "$pre" "$post" >/dev/null 2>&1; then
    echo "PASS  harness-status-readonly-invariant (HEAD/index/HEAD-file/status all byte-identical)"
    rm -rf "$invoke" "$sandbox"; return 0
  else
    echo "FAIL  harness-status-readonly-invariant (rc=$rc)"
    diff "$pre" "$post" >&2 || true
    cat "$invoke/scan.err" >&2 || true
    rm -rf "$invoke" "$sandbox"; return 1
  fi
}

fx_harness_status_pre_conversion() {
  local invoke
  invoke="$(fx_make_scan_repo)"
  local v2_repo old_repo
  v2_repo="$(mktemp -d)"; old_repo="$(mktemp -d)"
  ( cd "$v2_repo" && git init -q && mkdir -p docs && printf '## Now\n\n### Wave 1\n- spec: docs/specs/test.md\n\n## Next\n## Blocked\n## Recently Shipped\n' > docs/plan.md && git add docs && git -c user.email=fx@test -c user.name=fx commit -q -m a ) >/dev/null
  ( cd "$old_repo" && git init -q && mkdir -p docs && printf '# old plan\n\n## Wave 1\n- task one\n' > docs/plan.md && git add docs && git -c user.email=fx@test -c user.name=fx commit -q -m a ) >/dev/null
  local registry="$invoke/registry.yml"
  cat > "$registry" <<EOF
projects:
  - id: v2-shape
    path: $v2_repo
    group: test
  - id: pre-v2
    path: $old_repo
    group: test
EOF
  fx_run_scan "$invoke" "$registry"
  local rc=$?
  local md
  md=$(ls "$invoke/.harness-state"/harness-status-*.md 2>/dev/null | head -1)
  if [[ "$rc" -eq 0 && -n "$md" ]] && grep -qF '(pre-v2 plan format; skipped)' "$md"; then
    echo "PASS  harness-status-pre-conversion-repo (annotation present; scan continued)"
    rm -rf "$invoke" "$v2_repo" "$old_repo"; return 0
  else
    echo "FAIL  harness-status-pre-conversion-repo (rc=$rc; md=$md)"
    [[ -f "$md" ]] && cat "$md" >&2
    cat "$invoke/scan.err" >&2 || true
    rm -rf "$invoke" "$v2_repo" "$old_repo"; return 1
  fi
}

fx_harness_status_missing_repo() {
  local invoke
  invoke="$(fx_make_scan_repo)"
  local real
  real="$(mktemp -d)"
  ( cd "$real" && git init -q && touch a.txt && git add a.txt && git -c user.email=fx@test -c user.name=fx commit -q -m a ) >/dev/null
  local missing="/tmp/no-such-repo-fx-$$"
  local registry="$invoke/registry.yml"
  cat > "$registry" <<EOF
projects:
  - id: real
    path: $real
    group: test
  - id: gone
    path: $missing
    group: test
EOF
  fx_run_scan "$invoke" "$registry"
  local rc=$?
  local md
  md=$(ls "$invoke/.harness-state"/harness-status-*.md 2>/dev/null | head -1)
  if [[ "$rc" -eq 0 && -n "$md" ]] && grep -qF "(repo path missing on disk: $missing)" "$md"; then
    echo "PASS  harness-status-missing-repo (annotation present; scan continued; rc=0)"
    rm -rf "$invoke" "$real"; return 0
  else
    echo "FAIL  harness-status-missing-repo (rc=$rc)"
    [[ -f "$md" ]] && cat "$md" >&2
    cat "$invoke/scan.err" >&2 || true
    rm -rf "$invoke" "$real"; return 1
  fi
}

fx_harness_status_empty_registry() {
  local invoke
  invoke="$(fx_make_scan_repo)"
  local registry="$invoke/registry.yml"
  printf 'projects: []\n' > "$registry"
  fx_run_scan "$invoke" "$registry"
  local rc=$?
  local receipt
  receipt=$(ls "$invoke/.harness-state"/harness-status-*.yml 2>/dev/null | head -1)
  local exempt=0
  [[ -n "$receipt" ]] && grep -qF 'stage_a_exempt: true' "$receipt" && exempt=1
  if [[ "$rc" -eq 0 && "$exempt" -eq 1 ]]; then
    echo "PASS  harness-status-empty-registry (rc=0; stage_a_exempt:true present)"
    rm -rf "$invoke"; return 0
  else
    echo "FAIL  harness-status-empty-registry (rc=$rc; exempt=$exempt)"
    [[ -f "$receipt" ]] && cat "$receipt" >&2 || true
    cat "$invoke/scan.err" >&2 || true
    rm -rf "$invoke"; return 1
  fi
}

fx_harness_status_malformed_registry() {
  local invoke
  invoke="$(fx_make_scan_repo)"
  local registry="$invoke/registry.yml"
  cat > "$registry" <<'EOF'
projects:
  - id: dup
    path: /tmp/a
  - id: dup
    path: /tmp/b
EOF
  fx_run_scan "$invoke" "$registry"
  local rc=$?
  local receipt
  receipt=$(ls "$invoke/.harness-state"/harness-status-*.yml 2>/dev/null | head -1)
  local status=""
  [[ -n "$receipt" ]] && status=$(awk '/^status:/{print $2; exit}' "$receipt")
  if [[ "$rc" -ne 0 && "$status" == "failed" ]]; then
    echo "PASS  harness-status-malformed-registry (rc=$rc; status=failed)"
    rm -rf "$invoke"; return 0
  else
    echo "FAIL  harness-status-malformed-registry (rc=$rc; status=$status)"
    cat "$invoke/scan.err" >&2 || true
    rm -rf "$invoke"; return 1
  fi
}

fx_harness_status_disallowed_field() {
  local invoke
  invoke="$(fx_make_scan_repo)"
  local registry="$invoke/registry.yml"
  cat > "$registry" <<'EOF'
projects:
  - id: bad
    path: /tmp/bad
    quality_gate: bunx tsc --noEmit
EOF
  fx_run_scan "$invoke" "$registry"
  local rc=$?
  if [[ "$rc" -ne 0 ]] && grep -qE 'quality_gate.*disallowed|disallowed.*quality_gate' "$invoke/scan.err"; then
    echo "PASS  harness-status-disallowed-field (rc=$rc; stderr cites quality_gate disallow)"
    rm -rf "$invoke"; return 0
  else
    echo "FAIL  harness-status-disallowed-field (rc=$rc)"
    cat "$invoke/scan.err" >&2 || true
    rm -rf "$invoke"; return 1
  fi
}

fx_harness_status_stage_a_exempt() {
  local invoke
  invoke="$(fx_make_scan_repo)"
  local sandbox
  sandbox="$(mktemp -d)"
  ( cd "$sandbox" && git init -q && touch a.txt && git add a.txt && git -c user.email=fx@test -c user.name=fx commit -q -m a ) >/dev/null
  local registry="$invoke/registry.yml"
  cat > "$registry" <<EOF
projects:
  - id: sandbox
    path: $sandbox
    group: test
EOF
  fx_run_scan "$invoke" "$registry"
  local rc1=$?
  local rcpt1=$(ls "$invoke/.harness-state"/harness-status-*.yml 2>/dev/null | tail -1)
  local key1=""
  [[ -n "$rcpt1" ]] && key1=$(awk '/^idempotency_key:/{f=1; next} f && /^  value:/{print $2; exit}' "$rcpt1")
  sleep 1
  fx_run_scan "$invoke" "$registry"
  local rc2=$?
  local rcpt2=$(ls -t "$invoke/.harness-state"/harness-status-*.yml 2>/dev/null | head -1)
  local key2=""
  [[ -n "$rcpt2" ]] && key2=$(awk '/^idempotency_key:/{f=1; next} f && /^  value:/{print $2; exit}' "$rcpt2")
  local exempt1=0 exempt2=0
  grep -qF 'stage_a_exempt: true' "$rcpt1" 2>/dev/null && exempt1=1
  grep -qF 'stage_a_exempt: true' "$rcpt2" 2>/dev/null && exempt2=1
  touch "$sandbox/uncommitted.txt"
  sleep 1
  fx_run_scan "$invoke" "$registry"
  local rc3=$?
  local md3=$(ls -t "$invoke/.harness-state"/harness-status-*.md 2>/dev/null | head -1)
  local dirty_seen=0
  [[ -f "$md3" ]] && grep -qF 'dirty (1 files)' "$md3" && dirty_seen=1

  local ok=1 reason=""
  [[ "$rc1" -eq 0 && "$rc2" -eq 0 && "$rc3" -eq 0 ]] || { ok=0; reason="$reason; non-zero rc (1=$rc1 2=$rc2 3=$rc3)"; }
  [[ "$exempt1" -eq 1 && "$exempt2" -eq 1 ]] || { ok=0; reason="$reason; stage_a_exempt missing (1=$exempt1 2=$exempt2)"; }
  [[ -n "$key1" && -n "$key2" && "$key1" != "$key2" ]] || { ok=0; reason="$reason; keys identical (k1=$key1 k2=$key2)"; }
  [[ "$dirty_seen" -eq 1 ]] || { ok=0; reason="$reason; run 3 did not see git-state change ('dirty (1 files)' missing)"; }

  if [[ "$ok" -eq 1 ]]; then
    echo "PASS  harness-status-stage-a-exempt (frozen-state runs differ; git-state change reflected)"
    rm -rf "$invoke" "$sandbox"; return 0
  else
    echo "FAIL  harness-status-stage-a-exempt — $reason"
    rm -rf "$invoke" "$sandbox"; return 1
  fi
}

echo "== Wave 2 fixtures (/archive-plan + /harness-status) =="

fx_archive_plan_normal_run;       bump $?
fx_archive_plan_dry_run;          bump $?
fx_archive_plan_idempotency;      bump $?
fx_archive_plan_missing_wave_file; bump $?
fx_archive_plan_atomic_rename;    bump $?
fx_harness_status_readonly;       bump $?
fx_harness_status_pre_conversion; bump $?
fx_harness_status_missing_repo;   bump $?
fx_harness_status_empty_registry; bump $?
fx_harness_status_malformed_registry; bump $?
fx_harness_status_disallowed_field;   bump $?
fx_harness_status_stage_a_exempt;     bump $?

echo
echo "Wave 2 fixtures: pass=$PASS fail=$FAIL"
exit $FAIL
