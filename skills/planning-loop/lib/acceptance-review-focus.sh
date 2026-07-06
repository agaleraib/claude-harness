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
#       imperative strictness HEADER, then the strictness block.
#   --emit-log <spec>
#       prints the round-log entry: the same strictness block under a
#       "FOCUS — acceptance-criteria strictness (auto-generated, do not edit):"
#       header.
#
# The reviewer FOCUS must carry the INSTRUCTION, not just the data. The bare
# `sub-strict:` lines are diagnostics; the rule that tells Codex what to DO with
# them lives in references/codex-prompts.md, which the review companion may not
# read. So --emit-focus injects a short imperative header (STRICTNESS_HEADER)
# right after the base focus and around the block, telling Codex to return
# `needs-attention` for each `sub-strict:` line and NOT to invent findings when
# everything is strict. --emit-log keeps its existing header-only format.
#
# The "strictness block" is the verbatim `^sub-strict:` lines from the scanner,
# or the single sentinel line `all acceptance criteria are strict` when the
# scanner reports none. The block is always self-contained — the raw scanner
# `strict=<P> total=<T>` line is never echoed into the review path.
#
# Fail-open distinction:
#   - Scanner genuinely ABSENT (partial install; the caller-side
#     `[[ -x "$HELPER" ]]` guard in SKILL.md Step 5b is the PRIMARY fail-open,
#     this is the secondary path): --emit-focus echoes the base focus unchanged
#     (nothing appended) and --emit-log emits a no-op line.
#   - Scanner PRESENT but errors at RUNTIME (grep matcher could not run → the
#     scanner exits non-zero, see acceptance-strictness.sh): do NOT fail open to
#     the "all strict" sentinel. Surface that diagnostics are unavailable so the
#     absence of findings is never mistaken for a clean, fully-strict spec.
#
# Bash 3.2 compatible (macOS default shell).
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCANNER="$SCRIPT_DIR/acceptance-strictness.sh"

# Imperative header injected into the reviewer FOCUS so Codex acts on the
# diagnostics even when it never reads references/codex-prompts.md.
STRICTNESS_HEADER='ACCEPTANCE-CRITERIA STRICTNESS — for EACH `sub-strict:` line below, that acceptance criterion is not machine-verifiable; return `needs-attention` and cite it. If the block reads "all acceptance criteria are strict", do NOT invent strictness findings.'

# run_scanner <spec> — runs the scanner, capturing stdout in SCANNER_OUT and its
# exit code in SCANNER_RC. Exit 0 = clean scan; non-zero = matcher RUNTIME error
# (never a normal outcome — the scanner is exit-0 on any well-formed input).
SCANNER_OUT=""
SCANNER_RC=0
run_scanner() {
  SCANNER_OUT="$(bash "$SCANNER" "$1" 2>/dev/null)"
  SCANNER_RC=$?
}

# emit_block_body — prints the strictness block (verbatim `^sub-strict:` lines,
# or the all-strict sentinel) from a CLEAN SCANNER_OUT (SCANNER_RC == 0).
emit_block_body() {
  local sub
  sub="$(printf '%s\n' "$SCANNER_OUT" | grep -E '^sub-strict:' || true)"
  if [[ -n "$sub" ]]; then
    printf '%s\n' "$sub"
  else
    printf '%s\n' "all acceptance criteria are strict"
  fi
}

CMD="${1:-}"
case "$CMD" in
  --emit-focus)
    BASE="${2:-}"
    SPEC="${3:-}"
    printf '%s\n' "$BASE"                            # base focus verbatim, first
    if [[ -x "$SCANNER" ]]; then
      run_scanner "$SPEC"
      if [[ "$SCANNER_RC" -ne 0 ]]; then
        # Scanner RUNTIME error — surface it; do NOT emit the all-strict sentinel.
        printf '%s\n' "ACCEPTANCE-CRITERIA STRICTNESS — scanner error (exit ${SCANNER_RC}); strictness diagnostics unavailable, review acceptance criteria by hand."
      else
        printf '%s\n' "$STRICTNESS_HEADER"           # inject the INSTRUCTION, then the data
        emit_block_body
      fi
    fi                                               # scanner absent → base focus unchanged
    ;;
  --emit-log)
    SPEC="${2:-}"
    printf '%s\n' "FOCUS — acceptance-criteria strictness (auto-generated, do not edit):"
    if [[ -x "$SCANNER" ]]; then
      run_scanner "$SPEC"
      if [[ "$SCANNER_RC" -ne 0 ]]; then
        printf '%s\n' "(scanner error (exit ${SCANNER_RC}) — strictness diagnostics unavailable)"
      else
        emit_block_body
      fi
    else
      printf '%s\n' "(scanner unavailable — strictness diagnostics skipped)"
    fi
    ;;
  *)
    echo "usage: acceptance-review-focus.sh --emit-focus <base-focus> <spec> | --emit-log <spec>" >&2
    ;;
esac
exit 0
