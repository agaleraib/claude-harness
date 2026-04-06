#!/bin/bash
# Git post-commit hook — updates Second Brain project with latest commit info.
# Install: ln -sf "$(pwd)/scripts/git-post-commit.sh" .git/hooks/post-commit
#
# Works silently — never blocks or slows down commits.

SB_URL="${SB_URL:-http://10.1.10.82:3001}"

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

# Fire and forget — don't block the commit
curl -sf -X POST "${SB_URL}/api/projects/hook" \
  -H "Content-Type: application/json" \
  -d "$(cat <<EOF
{
  "repo": "$REPO",
  "branch": "$BRANCH",
  "commit": "$COMMIT",
  "message": $(echo "$MESSAGE" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))"),
  "dirtyFiles": $DIRTY_JSON,
  "diffStat": $(echo "$DIFF_STAT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))")
}
EOF
)" > /dev/null 2>&1 &

exit 0
