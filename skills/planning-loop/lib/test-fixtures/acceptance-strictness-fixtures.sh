#!/usr/bin/env bash
# acceptance-strictness-fixtures.sh — behavioral assertions for the shared
# scanner skills/planning-loop/lib/acceptance-strictness.sh (Wave 25, F-039).
#
# Driven by run-fixtures.sh as a folding sub-block (mirrors the
# emit-receipt-mechanical.sh pattern): emits per-fixture PASS/FAIL and a
# trailing `pass=N fail=M` summary line the parent parses and folds into the
# suite total. Exit 0 only when every fixture's scanner contract holds.
#
# Each assertion runs the REAL scanner against a REAL .md fixture — the grammar
# is proven behaviorally here, not by grepping prose.
#
# Bash 3.2 compatible (macOS default shell).
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCANNER="$(cd "$SCRIPT_DIR/.." && pwd)/acceptance-strictness.sh"
FIX_DIR="$SCRIPT_DIR"

if [[ ! -x "$SCANNER" ]]; then
  echo "FAIL setup: $SCANNER not found or not executable" >&2
  echo "acceptance-strictness fixtures: pass=0 fail=1"
  exit 1
fi

PASS=0
FAIL=0
note_pass() { printf '  PASS  %s\n' "$1"; PASS=$((PASS + 1)); }
note_fail() { printf '  FAIL  %s\n' "$1"; FAIL=$((FAIL + 1)); }

# assert_scan <fixture.md> <expected-first-line> <expected-substrict-count> [expected-reason]
#   - asserts scanner exit 0, exact first line, exact sub-strict line count,
#     and (when given) that a `^sub-strict: <reason> ::` line is present.
assert_scan() {
  local fx="$1" expfirst="$2" expsub="$3" expreason="${4:-}"
  local out rc first subcount ok why
  out="$(bash "$SCANNER" "$FIX_DIR/$fx" 2>/dev/null)"
  rc=$?
  first="$(printf '%s\n' "$out" | head -1)"
  subcount="$(printf '%s\n' "$out" | grep -c '^sub-strict:')"

  ok=1; why=""
  [[ "$rc" -eq 0 ]]              || { ok=0; why="$why exit=$rc(!=0);"; }
  [[ "$first" == "$expfirst" ]]  || { ok=0; why="$why first='$first'(want '$expfirst');"; }
  [[ "$subcount" -eq "$expsub" ]] || { ok=0; why="$why sub-strict count=$subcount(want $expsub);"; }
  if [[ -n "$expreason" ]]; then
    printf '%s\n' "$out" | grep -Eq "^sub-strict: $expreason :: " \
      || { ok=0; why="$why missing '^sub-strict: $expreason ::';"; }
  fi

  if [[ $ok -eq 1 ]]; then
    note_pass "$fx -> $expfirst${expreason:+, reason=$expreason}, sub-strict=$expsub"
  else
    note_fail "$fx —$why"
  fi
}

echo "== acceptance-strictness scanner fixtures (Wave 25 — F-039) =="

# all-clean: every scoped bullet strict, P == T, zero sub-strict.
assert_scan strict-all-clean.md            "strict=3 total=3" 0
# mechanisms-each: M1–M4 each bind standalone, 4/4, zero sub-strict.
assert_scan strict-mechanisms-each.md      "strict=4 total=4" 0
# word-boundary-edge: cleanup/fastener → no-mechanism (NOT unbound-judgment), 0/1.
assert_scan strict-word-boundary-edge.md   "strict=0 total=1" 1 no-mechanism
# incidental bare-phrase span does not rescue a vague bullet → unbound-judgment, 0/1.
assert_scan strict-incidental-span-darkmode.md "strict=0 total=1" 1 unbound-judgment
# command-shaped span binds a judgment bullet → 1/1, zero sub-strict.
assert_scan strict-command-span-binds.md   "strict=1 total=1" 0
# mixed counts: 2 strict, exactly one sub-strict → 2/3.
assert_scan strict-mixed-counts.md         "strict=2 total=3" 1
# task checkbox out of any open acceptance block → total=0.
assert_scan strict-task-checkbox-immune.md "strict=0 total=0" 0
# no acceptance-criteria marker → 0/0, exit 0 (no crash).
assert_scan strict-no-requirements.md      "strict=0 total=0" 0

# missing/unreadable spec path → RUNTIME error (exit 3), NO strict= on stdout.
# Guards the input-read fail-open path: an unreadable file must NOT report a
# clean empty scan (which the fold would turn into the all-strict sentinel).
missing_out="$(bash "$SCANNER" "$FIX_DIR/does-not-exist-$$.md" 2>/dev/null)"
missing_rc=$?
missing_strict="$(printf '%s\n' "$missing_out" | grep -c '^strict=')"
if [[ "$missing_rc" -eq 3 && "$missing_strict" -eq 0 ]]; then
  note_pass "missing spec path -> exit 3, no strict= (no fail-open)"
else
  note_fail "missing spec path — exit=$missing_rc(want 3), strict-lines=$missing_strict(want 0)"
fi

echo "----------------------------------------"
echo "acceptance-strictness fixtures: pass=$PASS fail=$FAIL"
[[ "$FAIL" -eq 0 ]] || exit 1
exit 0
