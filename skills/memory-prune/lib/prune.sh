#!/usr/bin/env bash
# memory-prune/lib/prune.sh — cap-management for ~/.claude/memory/*.md.
#
# Dry-run by default; `--apply` mutates with temp-rename + byte-exact-backup
# + journal + canonical receipt. Per docs/specs/2026-05-13-memory-system-redesign.md
# Phase 2 Task 4.
#
# Bash 3.2 compatible (macOS default). No associative arrays. SHA-256 via
# `shasum -a 256` (stock macOS) or `sha256sum` (GNU coreutils).

set -uo pipefail

# ---------- portable helpers ----------
sha256_file() {
  local p="$1"
  [ -f "$p" ] || { echo "MISSING"; return 0; }
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum < "$p" | awk '{print $1}'
  else
    shasum -a 256 < "$p" | awk '{print $1}'
  fi
}

iso_now() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
iso_now_filesafe() { date -u '+%Y-%m-%dT%H%M%SZ'; }
iso_now_date() { date -u '+%Y-%m-%d'; }

usage() {
  cat <<'USAGE'
memory-prune — cap-management for ~/.claude/memory/*.md.

USAGE:
  prune.sh [--root <dir>] [--apply] [--receipt-root <dir>] [--no-receipt] [--help]

FLAGS:
  --root <dir>          Root to prune (default ~/.claude/memory). Skips archive/ and feedback/ subdirs.
  --apply               Mutate state. Without this flag the skill is read-only.
  --receipt-root <dir>  Where to write the canonical receipt + journal (default <repo>/.harness-state).
  --no-receipt          Test-only: skip receipt + journal emission.
  --help                Print this usage and exit 0.

DEFAULT: dry-run summary; nothing mutated; nothing written.

USAGE
}

# ---------- arg parse ----------
ROOT="$HOME/.claude/memory"
APPLY=0
RECEIPT_ROOT=""
NO_RECEIPT=0

# Handle --help BEFORE any side effect per feedback_skill_help_branch_invariant.
for arg in "$@"; do
  case "$arg" in
    --help|-h)
      usage
      exit 0
      ;;
  esac
done

while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    --apply) APPLY=1; shift ;;
    --receipt-root) RECEIPT_ROOT="$2"; shift 2 ;;
    --no-receipt) NO_RECEIPT=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "✗ unknown arg: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [ ! -d "$ROOT" ]; then
  echo "✗ --root does not exist: $ROOT" >&2
  exit 2
fi

# Resolve receipt root.
if [ -z "$RECEIPT_ROOT" ]; then
  if git rev-parse --show-toplevel >/dev/null 2>&1; then
    RECEIPT_ROOT="$(git rev-parse --show-toplevel)/.harness-state"
  else
    RECEIPT_ROOT="$HOME/.harness-state"
  fi
fi

mkdir -p "$RECEIPT_ROOT" 2>/dev/null || true

# ---------- scan ----------
# Top-level *.md files only (no archive/ or feedback/ descent).
OVER_CAP_FILES=()
LONG_LINE_REPORT=""
ALL_TOPLEVEL=()
while IFS= read -r f; do
  [ -f "$f" ] || continue
  ALL_TOPLEVEL+=("$f")
  bn="$(basename "$f")"
  size="$(wc -c < "$f" | tr -d ' ')"
  cap=5120
  [ "$bn" = "USER.md" ] && cap=1024
  if [ "$size" -gt "$cap" ]; then
    OVER_CAP_FILES+=("$f|$size|$cap")
  fi
  # Long-line check: any line over 150 bytes.
  long_lines="$(awk 'length > 150 {print NR ":" length}' "$f")"
  if [ -n "$long_lines" ]; then
    LONG_LINE_REPORT="$LONG_LINE_REPORT\n  $f:\n$(printf '%s' "$long_lines" | sed 's/^/    /')"
  fi
done < <(find "$ROOT" -maxdepth 1 -type f -name '*.md' 2>/dev/null)

# ---------- summary ----------
echo "memory-prune: scanned $ROOT"
echo "  files: ${#ALL_TOPLEVEL[@]}"
echo "  over-cap: ${#OVER_CAP_FILES[@]}"
if [ "${#OVER_CAP_FILES[@]}" -gt 0 ]; then
  for entry in "${OVER_CAP_FILES[@]}"; do
    f="${entry%%|*}"; rest="${entry#*|}"
    size="${rest%%|*}"; cap="${rest##*|}"
    echo "    - $(basename "$f"): $size bytes (cap $cap)"
  done
fi
if [ -n "$LONG_LINE_REPORT" ]; then
  printf '  lines >150 bytes:%b\n' "$LONG_LINE_REPORT"
fi

# Nothing to do?
if [ "${#OVER_CAP_FILES[@]}" -eq 0 ]; then
  echo "  no files over cap — nothing to prune"
  if [ "$APPLY" -eq 1 ] && [ "$NO_RECEIPT" -eq 0 ]; then
    # Still emit a success receipt with zero affected files for audit-trail symmetry.
    :
  else
    exit 0
  fi
fi

# Dry-run exit.
if [ "$APPLY" -eq 0 ]; then
  echo "  (dry-run) run with --apply to mutate"
  exit 0
fi

# ---------- apply ----------
# For each over-cap file: identify candidate lines (vanished-topic-link pointers
# preferred; falls back to oldest = top-of-file bullet lines until under cap),
# write .new (file minus candidates), append candidates to archive/prune-<date>.md,
# record journal + canonical receipt.

ARCHIVE_DEST="$ROOT/archive/prune-$(iso_now_date).md"
mkdir -p "$(dirname "$ARCHIVE_DEST")" 2>/dev/null

# Initialize archive file with header if it doesn't exist.
if [ ! -f "$ARCHIVE_DEST" ]; then
  {
    echo "# memory-prune archive — $(iso_now_date)"
    echo ""
    echo "Lines pruned by \`/memory-prune --apply\`. Source files restored byte-exact via"
    echo "\`git cat-file -p <source_blob_sha>\` (sha in companion journal line)."
    echo ""
  } > "$ARCHIVE_DEST"
fi

JOURNAL="$RECEIPT_ROOT/memory-prune.jsonl"
OP_TS="$(iso_now)"
OP_ID="memory-prune:$OP_TS"
mutated_count=0

for entry in "${OVER_CAP_FILES[@]}"; do
  f="${entry%%|*}"; rest="${entry#*|}"
  cap="${rest##*|}"
  # 1. blob-backup BEFORE mutation
  blob_sha="$(git hash-object -w "$f" 2>/dev/null || echo "")"
  if [ -z "$blob_sha" ]; then
    # Outside a git repo — write the backup blob to RECEIPT_ROOT/blobs/ instead.
    mkdir -p "$RECEIPT_ROOT/blobs"
    blob_sha="$(sha256_file "$f")"
    cp "$f" "$RECEIPT_ROOT/blobs/$blob_sha"
  fi
  src_sha_before="$(sha256_file "$f")"

  # 2. Build the trimmed file.
  TMPF="$f.new"
  PRUNED_LINES="$(mktemp)"
  : > "$PRUNED_LINES"

  # Strategy: read entire file, separate "header" (non-bullet) and "bullets" (- […])
  # Then drop bullets whose linked feedback file does not exist OR (failing that)
  # drop oldest bullets (top-to-bottom) until size ≤ cap.

  # Step A: split header vs bullets — but preserve original order across both.
  # A line is a "bullet" if it starts with "- " (any bullet, with or without [link]).
  # Vanished-pointer logic only fires on bullets that match /^- \[.*\]\(feedback\//.
  awk -v f="$f" -v root="$ROOT" '
    BEGIN { in_bullets = 0 }
    {
      if ($0 ~ /^- /) { print "BULLET\t" NR "\t" $0 }
      else { print "HEADER\t" NR "\t" $0 }
    }
  ' "$f" > "$TMPF.tagged"

  # Step B: identify vanished-pointer bullets first.
  # Look for "feedback/<slug>.md" pattern and check existence.
  VANISHED="$(mktemp)"; : > "$VANISHED"
  while IFS=$'\t' read -r kind nr line; do
    [ "$kind" = "BULLET" ] || continue
    # Extract slug from the (feedback/<slug>.md) part.
    slug_path="$(echo "$line" | sed -nE 's|.*\(feedback/([^)]+)\.md\).*|\1|p')"
    if [ -n "$slug_path" ]; then
      if [ ! -f "$ROOT/feedback/$slug_path.md" ]; then
        printf '%s\n' "$nr" >> "$VANISHED"
      fi
    fi
  done < "$TMPF.tagged"

  # Step C: compute initial size, then drop bullets until under cap.
  # Drop order: vanished-pointer NRs first, then oldest (smallest NR) bullets.
  cur_size="$(wc -c < "$f" | tr -d ' ')"

  # Build the drop-set as a sorted-unique list of NRs we plan to remove.
  DROP_NRS="$(mktemp)"; : > "$DROP_NRS"
  if [ -s "$VANISHED" ]; then
    sort -n "$VANISHED" > "$DROP_NRS"
  fi

  # Estimate effect of dropping the vanished bullets.
  if [ -s "$DROP_NRS" ]; then
    vanished_bytes="$(awk -v drop_file="$DROP_NRS" '
      BEGIN {
        while ((getline l < drop_file) > 0) drop[l] = 1
      }
      { if (FNR in drop) bytes += length($0) + 1 }
      END { print bytes + 0 }
    ' "$f")"
    cur_size=$((cur_size - vanished_bytes))
  fi

  # If still over cap, add bullets oldest-first.
  if [ "$cur_size" -gt "$cap" ]; then
    # Iterate bullets in NR order; skip ones already in DROP_NRS; add until under cap.
    while IFS=$'\t' read -r kind nr line; do
      [ "$kind" = "BULLET" ] || continue
      # Skip if already in DROP_NRS
      if [ -s "$DROP_NRS" ] && grep -qx "$nr" "$DROP_NRS"; then continue; fi
      # Add this NR
      printf '%s\n' "$nr" >> "$DROP_NRS"
      line_bytes=$(( ${#line} + 1 ))
      cur_size=$((cur_size - line_bytes))
      [ "$cur_size" -le "$cap" ] && break
    done < "$TMPF.tagged"
  fi

  # Step D: write .new = original minus DROP_NRS; collect dropped to PRUNED_LINES.
  if [ -s "$DROP_NRS" ]; then
    sort -n -u "$DROP_NRS" -o "$DROP_NRS"
    awk -v drop_file="$DROP_NRS" -v keep_file="$TMPF" -v drop_lines_file="$PRUNED_LINES" '
      BEGIN {
        while ((getline l < drop_file) > 0) drop[l] = 1
      }
      {
        if (FNR in drop) print > drop_lines_file
        else print > keep_file
      }
    ' "$f"
  else
    # Nothing to drop — but we know file was over cap. Just copy as-is.
    cp "$f" "$TMPF"
  fi

  # 3. atomic rename
  mv "$TMPF" "$f"
  rm -f "$TMPF.tagged" "$VANISHED" "$DROP_NRS"

  dest_sha="$(sha256_file "$f")"

  # 4. append pruned lines to archive
  if [ -s "$PRUNED_LINES" ]; then
    {
      echo ""
      echo "## From \`$(basename "$f")\` (pruned $(iso_now))"
      cat "$PRUNED_LINES"
    } >> "$ARCHIVE_DEST"
  fi
  rm -f "$PRUNED_LINES"

  # 5. journal line
  if [ "$NO_RECEIPT" -eq 0 ]; then
    printf '{"op_id":"%s","action":"prune","source_path":"%s","dest_path":"%s","source_sha256":"%s","source_blob_sha":"%s","dest_sha256":"%s","ts":"%s"}\n' \
      "$OP_ID" "$f" "$ARCHIVE_DEST" "$src_sha_before" "$blob_sha" "$dest_sha" "$(iso_now)" \
      >> "$JOURNAL"
  fi
  mutated_count=$((mutated_count + 1))
done

# 6. canonical receipt via emit-receipt.sh
if [ "$NO_RECEIPT" -eq 0 ]; then
  # Resolve the helper relative to this script.
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  HELPER="$SCRIPT_DIR/../../_shared/lib/emit-receipt.sh"
  if [ ! -f "$HELPER" ]; then
    echo "  ⚠ emit-receipt helper missing at $HELPER; skipping canonical receipt"
  else
    # Export vars for the sub-bash to read (positional-arg passing was fragile
    # with quoted multi-line YAML body and 5 args + an env var).
    # Content-digest input must be stable across re-runs with identical state.
    # The journal is mutated by this very run, so using it as the input would
    # invalidate idempotency-key equality. Instead, hash the FINAL (post-mutation)
    # FEEDBACK.md state — that IS the content-derived input the run produced.
    #
    # Path stability: emit_receipt_init's sorted_inputs is "<path>:<digest>";
    # using a receipt-root-relative path would make the key vary with fixture
    # location. We use a fixed sentinel filename "memory-prune.input-digest"
    # (basename only) by chdir'ing into a per-run temp dir.
    INPUT_DIGEST_DIR="$(mktemp -d)"
    INPUT_DIGEST_FILE="$INPUT_DIGEST_DIR/memory-prune.input-digest"
    {
      for entry in "${OVER_CAP_FILES[@]}"; do
        f="${entry%%|*}"
        # Write only basename + content sha (path-agnostic).
        printf '%s:%s\n' "$(basename "$f")" "$(sha256_file "$f")"
      done | sort
    } > "$INPUT_DIGEST_FILE"
    export HELPER JOURNAL ARCHIVE_DEST INPUT_DIGEST_FILE INPUT_DIGEST_DIR mutated_count
    export EMIT_RECEIPT_TEST_HARNESS_STATE_DIR="$RECEIPT_ROOT"
    # cd into INPUT_DIGEST_DIR so emit_receipt_init records the input as the
    # bare basename — sorted_inputs becomes "memory-prune.input-digest:<sha>",
    # which is stable across fixtures regardless of mktemp dir choice.
    bash <<'RECEIPT_EOF' || echo "  ⚠ receipt emission failed (non-fatal)"
set -uo pipefail
cd "$INPUT_DIGEST_DIR"
source "$HELPER"
emit_receipt_init "memory-prune" "-" "memory-prune.input-digest"
PREFLIGHT=$(emit_receipt_preflight) || exit 1
case "$PREFLIGHT" in
  PROCEED) ;;
  NOOP*) echo "Stage A no-op: $PREFLIGHT"; exit 0 ;;
  *) echo "✗ unexpected preflight: $PREFLIGHT"; exit 1 ;;
esac
emit_receipt_started
VERIF_BODY="    - cmd: \"memory-prune --apply\"
      exit_code: 0
      summary: \"pruned ${mutated_count} over-cap file(s); journal at ${JOURNAL}\""
emit_receipt_terminal success "$VERIF_BODY" "$ARCHIVE_DEST" "$JOURNAL"
echo "memory-prune receipt: $(emit_receipt_get_path)"
RECEIPT_EOF
    rm -rf "$INPUT_DIGEST_DIR"
  fi
fi

echo "memory-prune: applied; mutated $mutated_count file(s); archive at $ARCHIVE_DEST"
