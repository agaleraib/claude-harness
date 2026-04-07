#!/bin/bash
# Git post-commit hook — updates Second Brain project with latest commit info.
# Global hook: applies to all repos via core.hooksPath.
#
# Dual-write:
#   - Always writes to SB_URL (production, default http://10.1.10.82:3001)
#   - Also writes to SB_DEV_URL if set (e.g., http://localhost:3001)
#
# Works silently — never blocks or slows down commits.
# Auth: set SB_HOOK_SECRET env var to match the server's SB_HOOK_SECRET.

SB_URL="${SB_URL:-http://10.1.10.82:3001}"
AUTH_HEADER=""
if [ -n "$SB_HOOK_SECRET" ]; then
  AUTH_HEADER="-H \"Authorization: Bearer $SB_HOOK_SECRET\""
fi

REPO=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null)
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
COMMIT=$(git rev-parse --short HEAD 2>/dev/null)
MESSAGE=$(git log -1 --pretty=%s 2>/dev/null)
DIFF_STAT=$(git diff --stat HEAD~1 HEAD 2>/dev/null | tail -1)

# Collect dirty files (uncommitted changes after this commit)
DIRTY=$(git status --porcelain 2>/dev/null | awk '{print $2}' | head -20)
DIRTY_JSON="[]"
if [ -n "$DIRTY" ]; then
  DIRTY_JSON=$(echo "$DIRTY" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip().split('\n')))" 2>/dev/null || echo "[]")
fi

PAYLOAD=$(cat <<EOF
{
  "repo": "$REPO",
  "branch": "$BRANCH",
  "commit": "$COMMIT",
  "message": $(echo "$MESSAGE" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))"),
  "dirtyFiles": $DIRTY_JSON,
  "diffStat": $(echo "$DIFF_STAT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))")
}
EOF
)

# Fire and forget — primary (production) write
eval curl -sf -X POST "${SB_URL}/api/projects/hook" \
  -H "Content-Type: application/json" \
  $AUTH_HEADER \
  -d "'$PAYLOAD'" > /dev/null 2>&1 &

# Optional secondary (dev) write — only if SB_DEV_URL is set
if [ -n "$SB_DEV_URL" ]; then
  eval curl -sf -X POST "${SB_DEV_URL}/api/projects/hook" \
    -H "Content-Type: application/json" \
    $AUTH_HEADER \
    -d "'$PAYLOAD'" > /dev/null 2>&1 &
fi

exit 0
