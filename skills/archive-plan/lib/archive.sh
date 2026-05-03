#!/usr/bin/env bash
# archive.sh — /archive-plan executor.
#
# Compacts `## Recently Shipped` in docs/plan.md by removing rows older than
# KEEP_LAST (default 3). Idempotent (Stage A no-op on identical input via
# idempotency_key). Verifies each archived row's docs/waves/wave<N>-<slug>.md
# exists BEFORE any plan.md mutation; aborts on missing wave file.
# Atomic temp+rename for the plan.md write.
#
# Sources skills/_shared/lib/emit-receipt.sh for §3.0a reserve-then-mutate
# lifecycle. Bash 3.2 compatible (no associative arrays; sha256sum/shasum
# fallback; portable trap EXIT).
#
# Exit codes:
#   0  — success (mutation, no-op success, or partial dry-run)
#   1  — failure (e.g., disk error during atomic write)
#   2  — preflight abort (e.g., .harness-state/ unwritable; aborted-on-ambiguity
#        like missing-wave-file or malformed plan.md)
#
# Usage:
#   bash skills/archive-plan/lib/archive.sh [--dry-run] [--keep-last N] [--plan PATH]
#
# The --plan flag is for fixture isolation; production callers omit it and
# the script defaults to "$(git rev-parse --show-toplevel)/docs/plan.md".

set -uo pipefail

# ----------------------------------------------------------------------------
# Arg parsing.
# ----------------------------------------------------------------------------
DRY_RUN=0
KEEP_LAST=3
PLAN_PATH=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)    DRY_RUN=1 ;;
    --keep-last)  shift; KEEP_LAST="${1:?--keep-last needs a value}" ;;
    --plan)       shift; PLAN_PATH="${1:?--plan needs a value}" ;;
    -h|--help)
      grep '^# ' "${BASH_SOURCE[0]}" | sed 's/^# //'
      exit 0
      ;;
    *) echo "✗ unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done
[[ -n "${ARCHIVE_PLAN_DRY_RUN:-}" ]] && DRY_RUN=1

# ----------------------------------------------------------------------------
# Resolve repo + plan path.
# ----------------------------------------------------------------------------
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
if [[ -z "$PLAN_PATH" ]]; then
  PLAN_PATH="$REPO_ROOT/docs/plan.md"
fi

if [[ ! -f "$PLAN_PATH" ]]; then
  echo "✗ /archive-plan: $PLAN_PATH not found" >&2
  exit 2
fi

# Compute relative path once. Used in receipts + stderr msgs throughout.
case "$PLAN_PATH" in
  "$REPO_ROOT"/*) PLAN_REL="${PLAN_PATH#$REPO_ROOT/}" ;;
  /*)             PLAN_REL="$PLAN_PATH" ;;
  *)              PLAN_REL="$PLAN_PATH" ;;
esac

# ----------------------------------------------------------------------------
# Source shared receipt helper.
# ----------------------------------------------------------------------------
HELPER="$REPO_ROOT/skills/_shared/lib/emit-receipt.sh"
if [[ ! -f "$HELPER" ]]; then
  echo "✗ /archive-plan: shared helper missing at $HELPER" >&2
  exit 2
fi
# shellcheck disable=SC1090
source "$HELPER"

# ----------------------------------------------------------------------------
# Step 1: Identify rows to remove. `## Recently Shipped` rows are one-line
# entries `- [x] Wave N - <title> -> docs/waves/wave<N>-<slug>.md (<sha>)`.
# By convention (close-wave prepends), the newest is first; we keep the first
# KEEP_LAST and target the rest for removal.
# ----------------------------------------------------------------------------
RS_LINENO_START=0
RS_LINENO_END=0  # last line OF section content (inclusive)
RS_ROWS=()       # array of "<lineno>:<line>"
RS_REMOVE_LINENOS=()
WAVE_FILES=()    # paths referenced by rows being removed

# Bash 3.2: read line-by-line, capture lineno of `## Recently Shipped` heading
# AND the next `## ` heading boundary (or EOF).
lineno=0
in_rs=0
while IFS= read -r line; do
  lineno=$((lineno + 1))
  if [[ "$line" == '## Recently Shipped' ]]; then
    in_rs=1
    RS_LINENO_START=$lineno
    continue
  fi
  if [[ "$in_rs" -eq 1 && "$line" =~ ^\#\#[[:space:]] ]]; then
    in_rs=0
    RS_LINENO_END=$((lineno - 1))
    break
  fi
  if [[ "$in_rs" -eq 1 ]]; then
    if [[ "$line" =~ ^-[[:space:]]\[x\][[:space:]] ]]; then
      RS_ROWS+=("$lineno:$line")
    fi
    RS_LINENO_END=$lineno
  fi
done < "$PLAN_PATH"

if [[ "$RS_LINENO_START" -eq 0 ]]; then
  echo "✗ /archive-plan: \`## Recently Shipped\` heading not found in $PLAN_PATH" >&2
  exit 2
fi

ROW_COUNT=${#RS_ROWS[@]}
if [[ "$ROW_COUNT" -le "$KEEP_LAST" ]]; then
  # Nothing to do. Initialize helper, run preflight, write success-with-no-op
  # receipt (outputs: []). Distinct from Stage A no-op because we still write
  # a fresh receipt — recording that the operation ran and had nothing to do.
  emit_receipt_init archive-plan "-" "$PLAN_REL"
  PREFLIGHT="$(emit_receipt_preflight)"
  case "$PREFLIGHT" in
    PROCEED)
      emit_receipt_started || exit 1
      VERIFICATION_YAML="    - cmd: \"git diff --stat $PLAN_REL\"
      exit_code: 0
      summary: \"## Recently Shipped has $ROW_COUNT rows ≤ keep_last=$KEEP_LAST; no mutation needed\""
      emit_receipt_terminal success "$VERIFICATION_YAML" || exit 1
      echo "/archive-plan: ## Recently Shipped has $ROW_COUNT rows ≤ keep_last=$KEEP_LAST; no rows removed."
      exit 0
      ;;
    NOOP*)
      echo "$PREFLIGHT" >&2
      exit 0
      ;;
    *)
      exit 2
      ;;
  esac
fi

# Number of rows to remove = ROW_COUNT - KEEP_LAST. Remove from the BOTTOM
# (oldest entries) — RS_ROWS is in document order; tail of array is oldest
# by convention. KEEP_LAST is the first entries.
REMOVE_COUNT=$((ROW_COUNT - KEEP_LAST))

# Indices to remove: ROW_COUNT-REMOVE_COUNT .. ROW_COUNT-1 (the last
# REMOVE_COUNT entries in the array). Iterate, parse out wave-file path.
i=$KEEP_LAST
while [[ "$i" -lt "$ROW_COUNT" ]]; do
  entry="${RS_ROWS[$i]}"
  ln="${entry%%:*}"
  body="${entry#*:}"
  # Match "-> docs/waves/<file>" — extract path token after `-> `.
  if [[ "$body" =~ -\>[[:space:]]+(docs/waves/[A-Za-z0-9._/-]+\.md) ]]; then
    wave_path_rel="${BASH_REMATCH[1]}"
    wave_path_abs="$REPO_ROOT/$wave_path_rel"
    if [[ ! -f "$wave_path_abs" ]]; then
      echo "✗ /archive-plan: row points at missing wave file: $wave_path_rel" >&2
      echo "    aborted-on-ambiguity — refuse to remove a row when the canonical archive is missing." >&2
      # Init helper + emit aborted-on-ambiguity receipt (reserve-then-trap path).
      emit_receipt_init archive-plan "-" "$PLAN_REL" "$wave_path_rel"
      PREFLIGHT="$(emit_receipt_preflight)"
      case "$PREFLIGHT" in
        PROCEED) emit_receipt_started || exit 2 ;;
        NOOP*)   echo "$PREFLIGHT" >&2; exit 0 ;;
        *)       exit 2 ;;
      esac
      VERIFICATION_YAML="    - cmd: \"test -f $wave_path_rel\"
      exit_code: 1
      summary: \"missing wave archive file referenced by ## Recently Shipped row at line $ln\""
      emit_receipt_terminal aborted-on-ambiguity "$VERIFICATION_YAML" || exit 1
      exit 2
    fi
    WAVE_FILES+=("$wave_path_rel")
    RS_REMOVE_LINENOS+=("$ln")
  else
    echo "✗ /archive-plan: malformed ## Recently Shipped row at line $ln: $body" >&2
    echo "    aborted-on-ambiguity — expected '- [x] Wave N - <title> -> docs/waves/wave<N>-<slug>.md (<sha>)'" >&2
    emit_receipt_init archive-plan "-" "$PLAN_REL"
    PREFLIGHT="$(emit_receipt_preflight)"
    case "$PREFLIGHT" in
      PROCEED) emit_receipt_started || exit 2 ;;
      NOOP*)   echo "$PREFLIGHT" >&2; exit 0 ;;
      *)       exit 2 ;;
    esac
    VERIFICATION_YAML="    - cmd: \"awk 'NR==$ln'\"
      exit_code: 1
      summary: \"malformed row at line $ln (missing -> docs/waves/ link)\""
    emit_receipt_terminal aborted-on-ambiguity "$VERIFICATION_YAML" || exit 1
    exit 2
  fi
  i=$((i + 1))
done

# ----------------------------------------------------------------------------
# Step 2: Init helper + preflight (Stage A no-op short-circuit happens here).
# PLAN_REL was computed earlier (relative-to-REPO_ROOT, falls back to abs).
# ----------------------------------------------------------------------------
emit_receipt_init archive-plan "-" "$PLAN_REL" "${WAVE_FILES[@]}"

PREFLIGHT="$(emit_receipt_preflight)"
case "$PREFLIGHT" in
  PROCEED)
    emit_receipt_started || exit 1
    ;;
  NOOP*)
    echo "$PREFLIGHT" >&2
    echo "/archive-plan: nothing to do — plan.md + wave files already match a prior success receipt." >&2
    exit 0
    ;;
  *)
    exit 2
    ;;
esac

# ----------------------------------------------------------------------------
# Step 3: Compute new plan.md text in memory. Walk file, skipping lines whose
# lineno is in RS_REMOVE_LINENOS.
# ----------------------------------------------------------------------------
TMP_PLAN="$PLAN_PATH.tmp"
remove_set="$(printf ' %s ' "${RS_REMOVE_LINENOS[@]}")"

ln=0
{
  while IFS= read -r line; do
    ln=$((ln + 1))
    case "$remove_set" in
      *" $ln "*) ;;  # skip
      *)         printf '%s\n' "$line" ;;
    esac
  done < "$PLAN_PATH"
  # Preserve trailing newline state — if the original ends without a newline,
  # so does the new file. POSIX-portable trick: tail -c1 + LC_ALL=C check.
} > "$TMP_PLAN.work" 2>/dev/null || {
  rm -f "$TMP_PLAN.work" 2>/dev/null
  echo "✗ /archive-plan: failed to write temp plan.md.tmp.work" >&2
  exit 1
}

# Compare end-of-file newline behavior. If the new file has a trailing
# newline (printf '%s\n' adds one) but the original didn't, strip it.
orig_last=$(tail -c1 "$PLAN_PATH" 2>/dev/null | od -An -c | tr -d ' ')
new_last=$(tail -c1 "$TMP_PLAN.work" 2>/dev/null | od -An -c | tr -d ' ')
if [[ "$orig_last" != '\n' && "$new_last" == '\n' ]]; then
  # Strip trailing newline. Portable via dd.
  sz=$(wc -c < "$TMP_PLAN.work" | tr -d ' ')
  if [[ "$sz" -gt 0 ]]; then
    dd if="$TMP_PLAN.work" of="$TMP_PLAN.work.fixed" bs=1 count=$((sz - 1)) 2>/dev/null
    mv -f "$TMP_PLAN.work.fixed" "$TMP_PLAN.work"
  fi
fi

# ----------------------------------------------------------------------------
# Step 4 (DRY-RUN BRANCH): print diff, write partial receipt, NO mutation.
# ----------------------------------------------------------------------------
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "/archive-plan: dry-run — would remove $REMOVE_COUNT rows from ## Recently Shipped"
  echo "----- diff begins -----"
  diff -u "$PLAN_PATH" "$TMP_PLAN.work" || true
  echo "----- diff ends -----"
  rm -f "$TMP_PLAN.work" 2>/dev/null
  VERIFICATION_YAML="    - cmd: \"git diff $PLAN_REL\"
      exit_code: 0
      summary: \"dry-run preview only; no mutation\""
  emit_receipt_terminal partial "$VERIFICATION_YAML" || exit 1
  exit 0
fi

# ----------------------------------------------------------------------------
# Step 5: Atomic rename. Test hook ARCHIVE_PLAN_TEST_FORCE_MV_FAIL forces
# the rename to fail (covers atomic-rename safety fixture).
# ----------------------------------------------------------------------------
mv -f "$TMP_PLAN.work" "$PLAN_PATH.tmp" 2>/dev/null || {
  rm -f "$TMP_PLAN.work" 2>/dev/null
  echo "✗ /archive-plan: failed to rename .tmp.work → .tmp" >&2
  EMIT_RECEIPT__TRAP_CAUSE=failed
  exit 1
}

if [[ -n "${ARCHIVE_PLAN_TEST_FORCE_MV_FAIL:-}" ]]; then
  rm -f "$PLAN_PATH.tmp" 2>/dev/null
  echo "✗ /archive-plan: forced mv failure (test hook)" >&2
  EMIT_RECEIPT__TRAP_CAUSE=failed
  exit 1
fi

mv -f "$PLAN_PATH.tmp" "$PLAN_PATH" 2>/dev/null || {
  echo "✗ /archive-plan: atomic rename to $PLAN_PATH failed" >&2
  EMIT_RECEIPT__TRAP_CAUSE=failed
  exit 1
}

# ----------------------------------------------------------------------------
# Step 6: Terminal receipt — success.
# ----------------------------------------------------------------------------
VERIFICATION_YAML="    - cmd: \"git diff --stat $PLAN_REL\"
      exit_code: 0
      summary: \"$REMOVE_COUNT row(s) removed from ## Recently Shipped; ${#WAVE_FILES[@]} wave file(s) verified present\""
emit_receipt_terminal success "$VERIFICATION_YAML" "$PLAN_REL" || exit 1

echo "/archive-plan: archived $REMOVE_COUNT row(s) from ## Recently Shipped (kept newest $KEEP_LAST)."
exit 0
