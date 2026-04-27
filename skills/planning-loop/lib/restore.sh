#!/usr/bin/env bash
# Restore state parked by /planning-loop. Idempotent — safe to call when no
# parked state exists. Called at every exit point (success, error, interrupt).
#
# Exit codes:
#   0  — nothing to restore, or restore succeeded
#   1  — restore attempted but failed; state.json left in place for human recovery
set -euo pipefail

STATE_FILE=".git/planning-loop-park/state.json"

if [[ ! -f "$STATE_FILE" ]]; then
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "✗ jq not found; cannot parse $STATE_FILE — restore manually:" >&2
  echo "    git stash list  # find stash named 'planning-loop park *'" >&2
  echo "    git stash pop <ref>" >&2
  echo "    rm -rf .git/planning-loop-park" >&2
  exit 1
fi

PARKED="$(jq -r '.parked // false' "$STATE_FILE")"
SIDE_COPY="$(jq -r '.side_copy // empty' "$STATE_FILE")"
STASH_MSG="$(jq -r '.stash_message // empty' "$STATE_FILE")"

# 1. Drop the side-path copy if it exists — it's an ephemeral artifact.
if [[ -n "$SIDE_COPY" && -f "$SIDE_COPY" ]]; then
  rm -f "$SIDE_COPY"
fi

# 2. Pop the stash if one was created.
if [[ "$PARKED" == "true" && -n "$STASH_MSG" ]]; then
  STASH_REF="$(git stash list --format='%gd %s' | awk -v msg=" $STASH_MSG" '$0 ~ msg {print $1; exit}')"
  if [[ -z "$STASH_REF" ]]; then
    echo "⚠ Could not find stash matching '$STASH_MSG' — already popped?" >&2
    echo "  Leaving $STATE_FILE in place; inspect 'git stash list' and either pop manually or drop the state dir." >&2
    exit 1
  fi
  if ! git stash pop --quiet "$STASH_REF"; then
    echo "✗ git stash pop $STASH_REF failed (likely conflicts)." >&2
    echo "  Leaving $STATE_FILE in place. Resolve conflicts, then 'rm -rf .git/planning-loop-park' when clean." >&2
    exit 1
  fi
fi

# 3. Drop the state directory.
rm -rf .git/planning-loop-park

echo "✓ /planning-loop parked state restored."
