#!/usr/bin/env bash
# preflight.sh — REVISE-mode pre-flight for /planning-loop.
#
# Runs the full Step 1 REVISE-mode pre-flight pipeline:
#   1.  Leftover state detection (.git/planning-loop-park/state.json)
#   2.  Orphan stash detection (defense-in-depth for missing state.json)
#   1c. Orphan auto-apply temp-file detection (Phase 1c)
#   2.  Working-tree classification (PORCELAIN_OTHER)
#   3.  Auto-park unrelated changes via single named stash + state.json journal
#
# Usage:
#   bash "$HOME/.claude/skills/planning-loop/lib/preflight.sh" "<SPEC_PATH>"
#
# Exit codes:
#   0  — pre-flight passed; tree is auto-parked (or already clean) and journaled
#   1  — abort with recovery instructions printed; SKILL.md should exit
#
# Side effects on success:
#   - Writes .git/planning-loop-park/state.json with parked=true|false
#   - Writes .git/planning-loop-park/README.md
#   - On parked=true: creates a git stash named "planning-loop park <ts>"
set -uo pipefail

SPEC_PATH="${1:-}"
if [[ -z "$SPEC_PATH" ]]; then
  echo "✗ preflight.sh: SPEC_PATH (argv[1]) is required" >&2
  exit 1
fi

LEFTOVER_STATE=".git/planning-loop-park/state.json"

# 1. Leftover state detection.
if [[ -f "$LEFTOVER_STATE" ]]; then
  STASH_MSG="$(jq -r .stash_message "$LEFTOVER_STATE" 2>/dev/null || echo unknown)"
  PARK_TIME="$(jq -r .park_time "$LEFTOVER_STATE" 2>/dev/null || echo unknown)"
  SIDE_COPY="$(jq -r .side_copy "$LEFTOVER_STATE" 2>/dev/null || echo unknown)"
  echo "✗ /planning-loop detected leftover parked state from a previous run."
  echo
  echo "  Parked at:  $PARK_TIME"
  echo "  Stash msg:  $STASH_MSG"
  echo "  Side copy:  $SIDE_COPY (may exist; will be removed on restore)"
  echo
  echo "  Recover with:"
  echo '    bash "$HOME/.claude/skills/planning-loop/lib/restore.sh"'
  echo
  echo "  Or, if you've already manually recovered, delete the state dir:"
  echo "    rm -rf .git/planning-loop-park"
  exit 1
fi

# 2. Orphan stash detection (defense-in-depth — state.json could have been
#    lost while the stash remains).
ORPHAN_STASH="$(git stash list --format='%gd %s' 2>/dev/null | grep -E ' planning-loop park ' | head -1 || true)"
if [[ -n "$ORPHAN_STASH" ]]; then
  echo "✗ /planning-loop detected an orphan stash from a previous run:"
  echo "    $ORPHAN_STASH"
  echo
  echo "  Pop it (\`git stash pop <ref>\`) or drop it (\`git stash drop <ref>\`), then re-run."
  exit 1
fi

# 1c. Orphan auto-apply temp-file detection (Phase 1c).
ORPHAN_DIRS=( "docs/specs" )
PARENT_DIR="$(dirname "$SPEC_PATH")"
case " ${ORPHAN_DIRS[*]} " in
  *" $PARENT_DIR "*) : ;;
  *) ORPHAN_DIRS+=( "$PARENT_DIR" ) ;;
esac

ORPHAN_TMP=""
for d in "${ORPHAN_DIRS[@]}"; do
  [[ -d "$d" ]] || continue
  while IFS= read -r f; do
    ORPHAN_TMP="$f"
    break 2
  done < <(find "$d" -maxdepth 1 -name '*.autoapply-tmp' -print 2>/dev/null)
done

if [[ -n "$ORPHAN_TMP" ]]; then
  ORPHAN_SPEC="${ORPHAN_TMP%.autoapply-tmp}"
  ORPHAN_MTIME="$(stat -f '%Sm' "$ORPHAN_TMP" 2>/dev/null || stat -c '%y' "$ORPHAN_TMP" 2>/dev/null || echo 'unknown')"
  echo "✗ /planning-loop detected an orphan auto-apply temp file from a previous run:" >&2
  echo "    Path:   $ORPHAN_TMP" >&2
  echo "    mtime:  $ORPHAN_MTIME" >&2
  echo "" >&2
  echo "  Inspect via:" >&2
  echo "    diff $ORPHAN_SPEC $ORPHAN_TMP" >&2
  echo "" >&2
  echo "  Then either delete the orphan (discard the planned auto-apply):" >&2
  echo "    rm $ORPHAN_TMP" >&2
  echo "  Or replace the spec with it (accept the planned auto-apply):" >&2
  echo "    mv $ORPHAN_TMP $ORPHAN_SPEC" >&2
  echo "" >&2
  echo "  /planning-loop will not auto-clean and will not auto-restore — you decide." >&2
  RECENT_LOG="$(ls -t .harness-state/planning-loop/*.md 2>/dev/null | head -1 || true)"
  if [[ -n "$RECENT_LOG" ]]; then
    printf '\n## Auto-apply aborted — %s\n\nReason: orphan-tmp-detected\nDetail: orphan %s detected from prior run\n\nFalling through to abort.\n' \
      "$(date '+%Y-%m-%d %H:%M:%S')" "$ORPHAN_TMP" >> "$RECENT_LOG" 2>/dev/null || true
  fi
  exit 1
fi

# 2. Working-tree classification.
PORCELAIN_OTHER="$(git status --porcelain | grep -v -F " ${SPEC_PATH}$" || true)"

mkdir -p .git/planning-loop-park

if [[ -n "$PORCELAIN_OTHER" ]]; then
  # 3. Auto-park unrelated changes.
  TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
  STASH_MSG="planning-loop park $TIMESTAMP"
  PARK_TIME="$(date '+%Y-%m-%d %H:%M:%S')"

  EXCLUSIONS=( ':(exclude)'"$SPEC_PATH" ':(exclude)docs/specs/_REVIEW-*' )
  SKILL_REAL="$(realpath "$HOME/.claude/skills/planning-loop" 2>/dev/null || true)"
  REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [[ -n "$SKILL_REAL" && -n "$REPO_ROOT" && "$SKILL_REAL" == "$REPO_ROOT"/* ]]; then
    SKILL_REL="${SKILL_REAL#$REPO_ROOT/}"
    EXCLUSIONS+=( ':(exclude)'"$SKILL_REL" )
  fi

  git stash push -u -m "$STASH_MSG" -- "${EXCLUSIONS[@]}"

  if ! git stash list --format='%gd %s' | grep -F " $STASH_MSG" >/dev/null; then
    echo "✗ git stash push reported success but no matching stash found." >&2
    echo "  Aborting before writing state journal. Working tree may be partially modified." >&2
    exit 1
  fi

  cat > "$LEFTOVER_STATE" <<EOF
{
  "parked": true,
  "stash_message": "$STASH_MSG",
  "park_time": "$PARK_TIME",
  "spec_path": "$SPEC_PATH",
  "side_copy": "docs/specs/_REVIEW-$(basename "$SPEC_PATH")"
}
EOF

  cat > .git/planning-loop-park/README.md <<'EOF'
# planning-loop park

This directory journals state for /planning-loop's auto-park. If you're seeing
this without an active /planning-loop run, the previous run was interrupted.

To restore: `bash "$HOME/.claude/skills/planning-loop/lib/restore.sh"`
To abandon: `rm -rf .git/planning-loop-park` (and inspect `git stash list` for
            stashes named `planning-loop park *`)
EOF

  echo "✓ Auto-parked unrelated working-tree changes (stash: $STASH_MSG)."
  echo "  Will be restored on any exit (success, error, or interrupt)."
else
  # Tree already clean except for $SPEC_PATH — write state.json with parked=false.
  cat > "$LEFTOVER_STATE" <<EOF
{
  "parked": false,
  "park_time": "$(date '+%Y-%m-%d %H:%M:%S')",
  "spec_path": "$SPEC_PATH",
  "side_copy": "docs/specs/_REVIEW-$(basename "$SPEC_PATH")"
}
EOF

  cat > .git/planning-loop-park/README.md <<'EOF'
# planning-loop park

This directory journals state for /planning-loop's auto-park. If you're seeing
this without an active /planning-loop run, the previous run was interrupted.

To restore: `bash "$HOME/.claude/skills/planning-loop/lib/restore.sh"`
To abandon: `rm -rf .git/planning-loop-park` (and inspect `git stash list` for
            stashes named `planning-loop park *`)
EOF
fi

exit 0
