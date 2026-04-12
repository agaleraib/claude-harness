#!/usr/bin/env bash
# drift-detector.sh — Session drift signal check (Stop hook)
#
# Fires on Claude Code Stop events. Reads .harness-profile + .harness-state/
# and emits drift warnings when signals are tripped. Soft by default;
# escalates to hard (exit 2, blocking next tool use until addressed) after
# 2 prior signals in the same session.
#
# Install (wired by setup-harness into project's .claude/settings.json):
#
#   {
#     "hooks": {
#       "Stop": [{
#         "matcher": "",
#         "hooks": [{
#           "type": "command",
#           "command": "bash ~/.claude/harness/scripts/drift-detector.sh"
#         }]
#       }]
#     }
#   }
#
# Required session state (written by session-start, cleared by session-end):
#   .harness-state/today_goal.md          — session is open
#   .harness-state/parking_baseline       — parking_lot.md count at session-start
#   .harness-state/drift_ignores_today    — count of drift signals issued this session
#   .harness-state/current_micro.md       — active micro-session (optional)

set -uo pipefail

# ---- Guards: only run when harness context is present ----
[ -f .harness-profile ] || exit 0
[ -d .harness-state ] || exit 0
[ -f .harness-state/today_goal.md ] || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# ---- Read drift sensitivity ----
sensitivity=$(awk -F: '/^[[:space:]]*drift_sensitivity:/ {gsub(/[[:space:]]/, "", $2); print $2; exit}' .harness-profile 2>/dev/null)
sensitivity=${sensitivity:-medium}

case "$sensitivity" in
  low)    commit_gap_threshold=90; park_growth_threshold=5 ;;
  high)   commit_gap_threshold=45; park_growth_threshold=2 ;;
  *)      commit_gap_threshold=60; park_growth_threshold=3 ;;  # medium / default
esac

# ---- Signal 1: micro-session commit gap ----
signals=()
current_goal=""
micro_gap_min=0

if [ -f .harness-state/current_micro.md ]; then
  current_goal=$(awk -F'\\*\\*Goal:\\*\\*' '/\*\*Goal:\*\*/ {print $2; exit}' .harness-state/current_micro.md | sed 's/^[[:space:]]*//')
  micro_start_iso=$(awk -F'\\*\\*Started:\\*\\*' '/\*\*Started:\*\*/ {print $2; exit}' .harness-state/current_micro.md | sed 's/^[[:space:]]*//')

  if [ -n "${micro_start_iso:-}" ]; then
    # BSD date (macOS) first, fall back to GNU date
    micro_start_ts=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${micro_start_iso%+*}" +%s 2>/dev/null \
                 || date -d "$micro_start_iso" +%s 2>/dev/null \
                 || echo 0)
    if [ "$micro_start_ts" -gt 0 ]; then
      now=$(date +%s)
      micro_gap_min=$(( (now - micro_start_ts) / 60 ))

      # Check if any commits happened since the micro started
      commits_since_micro=$(git log --since="@${micro_start_ts}" --oneline 2>/dev/null | wc -l | tr -d ' ')

      if [ "$micro_gap_min" -gt "$commit_gap_threshold" ] && [ "$commits_since_micro" -eq 0 ]; then
        signals+=("⏰ Micro-session running ${micro_gap_min}m with no commits (threshold ${commit_gap_threshold}m).")
      fi
    fi
  fi
fi

# ---- Signal 2: parking lot growth ----
if [ -f parking_lot.md ]; then
  park_current=$(grep -cE '^- \[' parking_lot.md 2>/dev/null | tr -d ' ' || echo 0)
  park_baseline=0
  [ -f .harness-state/parking_baseline ] && park_baseline=$(cat .harness-state/parking_baseline)
  park_delta=$(( park_current - park_baseline ))

  if [ "$park_delta" -ge "$park_growth_threshold" ]; then
    signals+=("📌 Parking lot grew by ${park_delta} items this session (threshold ${park_growth_threshold}). Side-quests are accumulating faster than resolving.")
  fi
fi

# ---- No signals: clean exit ----
[ ${#signals[@]} -eq 0 ] && exit 0

# ---- Read ignore count ----
ignores=0
ignore_file=.harness-state/drift_ignores_today
[ -f "$ignore_file" ] && ignores=$(cat "$ignore_file" 2>/dev/null || echo 0)

# ---- Emit warning on stderr (Claude Code surfaces stderr from hooks) ----
{
  echo ""
  echo "⚠️  DRIFT DETECTOR"
  if [ -n "$current_goal" ]; then
    echo "Current goal: \"$current_goal\""
  fi
  for s in "${signals[@]}"; do
    echo "  • $s"
  done
  echo ""
  if [ "$ignores" -ge 2 ]; then
    echo "🛑 Third drift signal this session. Recommended actions:"
    echo "   • Commit WIP and start a fresh \`micro\` block with a narrower goal"
    echo "   • Promote a parking-lot item to be the new focus"
    echo "   • Run \`session-end\` to close out cleanly"
    echo ""
    echo "Blocking further tool use until you acknowledge or address this."
  else
    echo "Options: stay on goal / \`park\` the distraction / \`session-end\` to close out."
    echo "(Signal $((ignores + 1))/3 — will block after 3)"
  fi
  echo ""
} >&2

# ---- Persist increment ----
echo $((ignores + 1)) > "$ignore_file"

# ---- Exit 2 = hard block, exit 0 = advisory ----
if [ "$ignores" -ge 2 ]; then
  exit 2
fi
exit 0
