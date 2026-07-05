#!/usr/bin/env bash
# acceptance-review-focus.sh — the deterministic FOLD boundary for the
# acceptance-criteria strictness diagnostics injected into /planning-loop's
# Codex adversarial-review dispatch (Wave 25, F-039, Finding 2).
#
# It composes the single-source-of-truth scanner acceptance-strictness.sh
# INTERNALLY (same lib/ dir) and never re-implements the grammar. Because the
# FOLD lives here, both folds are fixture-testable byte-for-byte.
#
# Two subcommands, exit code ALWAYS 0:
#   --emit-focus "<base-focus>" <spec>
#       prints the FINAL Codex focus string: <base-focus> verbatim, then the
#       strictness block.
#   --emit-log <spec>
#       prints the round-log entry: the same strictness block under a
#       "FOCUS — acceptance-criteria strictness (auto-generated, do not edit):"
#       header.
#
# The "strictness block" is the verbatim `^sub-strict:` lines from the scanner,
# or the single sentinel line `all acceptance criteria are strict` when the
# scanner reports none. The block is always self-contained — the raw scanner
# `strict=<P> total=<T>` line is never echoed into the review path.
#
# Partial-install degradation (the caller-side `[[ -x "$HELPER" ]]` guard in
# SKILL.md Step 5b is the PRIMARY fail-open; this is the secondary path when the
# helper is present but its internal scanner is not): --emit-focus echoes the
# base focus unchanged (nothing appended) and --emit-log emits a no-op line.
#
# Bash 3.2 compatible (macOS default shell).
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCANNER="$SCRIPT_DIR/acceptance-strictness.sh"

# Prints the strictness block to stdout when the scanner is available; returns 1
# (printing nothing) when the scanner is missing/non-executable so each caller
# can degrade in its own documented way.
emit_strictness_block() {
  local spec="$1" sub
  [[ -x "$SCANNER" ]] || return 1
  sub="$(bash "$SCANNER" "$spec" 2>/dev/null | grep -E '^sub-strict:' || true)"
  if [[ -n "$sub" ]]; then
    printf '%s\n' "$sub"
  else
    printf '%s\n' "all acceptance criteria are strict"
  fi
  return 0
}

CMD="${1:-}"
case "$CMD" in
  --emit-focus)
    BASE="${2:-}"
    SPEC="${3:-}"
    printf '%s\n' "$BASE"
    emit_strictness_block "$SPEC" || true          # scanner missing → base focus unchanged
    ;;
  --emit-log)
    SPEC="${2:-}"
    printf '%s\n' "FOCUS — acceptance-criteria strictness (auto-generated, do not edit):"
    emit_strictness_block "$SPEC" \
      || printf '%s\n' "(scanner unavailable — strictness diagnostics skipped)"
    ;;
  *)
    echo "usage: acceptance-review-focus.sh --emit-focus <base-focus> <spec> | --emit-log <spec>" >&2
    ;;
esac
exit 0
