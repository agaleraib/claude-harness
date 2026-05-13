#!/usr/bin/env bash
# shared-root-init/lib/init.sh — atomic init of ~/.claude/memory/.
#
# Implements the Wave 11 / 2026-05-13-memory-system-redesign spec's
# atomic-root guarantee (Codex round-2 finding [medium]):
#
#   1. Refuse-on-partial gate (fail-fast if ~/.claude/memory exists).
#   2. Build staging tree at ~/.claude/.staging-shared-root-<ts>/.
#   3. Write durable receipt under .harness-state/ BEFORE any user-global mutation.
#   4. Append journal line {action: staging-built}.
#   5. Single rename(2) ~/.claude/.staging-shared-root-<ts> → ~/.claude/memory.
#   6. Append journal line {action: committed}.
#   7. Update receipt {status: success, completed_at}.
#
# Test-only interruption hook (verifies atomic-root invariant):
#   SHARED_ROOT_INIT_KILL_AFTER_STAGING=1  OR  --kill-after-staging
#       → `kill -KILL $$` after step 4 (BEFORE the rename).
#
# Test-only sandbox: honors $HOME for ~ resolution; pass HOME=<dir> to verify
# refuse-on-partial without polluting the real ~/.claude/.
#
# Bash 3.2 compatible (macOS default). No associative arrays. SHA-256 via
# `shasum -a 256` (stock macOS) or `sha256sum` (GNU coreutils).

set -uo pipefail

# ---------- portable helpers ----------
sha256_hex() {
  # stdin → lowercase hex sha256, no trailing newline, no filename suffix
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print $1}'
  else
    echo "✗ neither sha256sum nor shasum found" >&2
    return 1
  fi
}

sha256_file() {
  # $1 path → lowercase hex sha256
  local p="$1"
  if [ ! -f "$p" ]; then echo "MISSING"; return 0; fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum < "$p" | awk '{print $1}'
  else
    shasum -a 256 < "$p" | awk '{print $1}'
  fi
}

utc_iso() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
utc_stamp() { date -u +"%Y%m%dT%H%M%SZ"; }

# ---------- locate the harness repo root ----------
# Resolve from this script's location, NOT cwd — script is symlinked into
# ~/.claude/skills/shared-root-init/lib/init.sh.
SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
# Resolve symlinks portably (no readlink -f on stock macOS)
while [ -L "$SCRIPT_PATH" ]; do
  LINK=$(readlink "$SCRIPT_PATH")
  case "$LINK" in
    /*) SCRIPT_PATH="$LINK" ;;
    *)  SCRIPT_PATH="$(dirname "$SCRIPT_PATH")/$LINK" ;;
  esac
done
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
HARNESS_STATE="$REPO_ROOT/.harness-state"
JOURNAL="$HARNESS_STATE/shared-root-init.jsonl"
mkdir -p "$HARNESS_STATE"

# ---------- argument parsing ----------
KILL_AFTER_STAGING=0
if [ "${SHARED_ROOT_INIT_KILL_AFTER_STAGING:-0}" = "1" ]; then
  KILL_AFTER_STAGING=1
fi
for arg in "$@"; do
  case "$arg" in
    --kill-after-staging) KILL_AFTER_STAGING=1 ;;
    --help|-h)
      cat <<'HELP'
shared-root-init — atomic init of ~/.claude/memory/

Usage:
  bash skills/shared-root-init/lib/init.sh [--kill-after-staging] [--help]

Test-only env vars:
  SHARED_ROOT_INIT_KILL_AFTER_STAGING=1    Equivalent to --kill-after-staging.
  HOME=<dir>                                Override ~ resolution for sandbox.

Exit codes:
  0   = atomic rename committed, shared root ready
  1   = refused-on-partial-existing (target already exists)
  137 = test-only kill-after-staging (BEFORE the rename)

See skills/shared-root-init/SKILL.md for full behavior.
HELP
      exit 0
      ;;
    *)
      echo "✗ unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

# ---------- compute the target path and operation_id ----------
HOME_BASE="${HOME:-$(getent passwd "$(id -u)" 2>/dev/null | awk -F: '{print $6}')}"
TARGET="$HOME_BASE/.claude/memory"
CLAUDE_DIR="$HOME_BASE/.claude"

# Canonical operation_id from receipt-schema.md §"Operation_id derivation":
#   operation_id = sha256_hex( "shared-root-init\n2026-05-13-memory-system-redesign" )
COMMAND="shared-root-init"
SPEC_TAG="2026-05-13-memory-system-redesign"
OP_ID=$(printf "%s\n%s" "$COMMAND" "$SPEC_TAG" | sha256_hex)

TS_FILE=$(utc_stamp)
RECEIPT="$HARNESS_STATE/shared-root-init-${SPEC_TAG}-${TS_FILE}.yml"

# ---------- step 1: refuse-on-partial gate ----------
if [ -e "$TARGET" ]; then
  TS=$(utc_iso)
  # Build expected-tree fixture for diff (just structure, not seeded content)
  DIFF_OUT=$(mktemp -d)
  mkdir -p "$DIFF_OUT/archive" "$DIFF_OUT/feedback"
  touch "$DIFF_OUT/USER.md" "$DIFF_OUT/FEEDBACK.md" "$DIFF_OUT/REFERENCES.md" "$DIFF_OUT/PROJECTS.md"

  echo "✗ refused-on-partial-existing: $TARGET already exists." >&2
  echo "Expected tree:" >&2
  ls -R "$DIFF_OUT" >&2
  echo "" >&2
  echo "Live tree:" >&2
  ls -R "$TARGET" >&2 2>/dev/null || true
  echo "" >&2
  echo "Recursive diff (expected ← → live):" >&2
  diff -r "$DIFF_OUT" "$TARGET" >&2 2>&1 || true
  rm -rf "$DIFF_OUT"

  # Journal line
  printf '{"op_id":"shared-root-init:%s","action":"refused-on-partial-existing","target_path":"%s","ts":"%s"}\n' \
    "$SPEC_TAG" "$TARGET" "$TS" >> "$JOURNAL"
  exit 1
fi

# ---------- step 2: build staging tree ----------
STAGING="$CLAUDE_DIR/.staging-shared-root-${TS_FILE}"
mkdir -p "$CLAUDE_DIR"
mkdir -p "$STAGING/archive" "$STAGING/feedback"

# Seed files. Lines kept ≤150 chars per spec.
cat > "$STAGING/USER.md" <<'EOF'
# User profile

Operator preferences, identity, and cross-project conventions. Auto-loaded on session start. Human-written only (≤1KB target).
EOF

cat > "$STAGING/FEEDBACK.md" <<'EOF'
# Validated patterns (index)

Pointers to `feedback/<slug>.md` detail files. Hard cap 5KB. Each entry ≤150 chars. `/memory-prune` writes; humans append-ok.

| slug | added | summary |
|---|---|---|
EOF

cat > "$STAGING/REFERENCES.md" <<'EOF'
# External references

External resource pointers (URLs, doc locations, install commands). Human-written only. Hard cap 2KB.

- (none yet)
EOF

cat > "$STAGING/PROJECTS.md" <<'EOF'
# Projects registry

One row per repo / cowork project. Schema mirrors gobot `projects` table. Hard cap 4KB. Human-written only.

| id | path | area | title | kind | opened_at | closes_at | status |
|---|---|---|---|---|---|---|---|
| claude-harness | ~/workspace/claude-harness |  | claude-harness | repo | 2026-04-11 |  | active |
EOF

# ---------- step 3: write durable receipt (BEFORE the atomic rename) ----------
# Compute idempotency_key per receipt-schema.md §"Canonical idempotency_key derivation":
#   command=shared-root-init
#   wave_or_spec=2026-05-13-memory-system-redesign (spec_path stub since no wave_id)
#   inputs sorted lexicographically — but inputs are the STAGED files (content-derived)
INPUTS_SORTED="staging/PROJECTS.md staging/REFERENCES.md staging/USER.md staging/FEEDBACK.md"
INPUT_DIGEST_BUF=""
# Sort lex order
for f in FEEDBACK.md PROJECTS.md REFERENCES.md USER.md; do
  D=$(sha256_file "$STAGING/$f")
  if [ -z "$INPUT_DIGEST_BUF" ]; then
    INPUT_DIGEST_BUF="staging/$f:$D"
  else
    INPUT_DIGEST_BUF="$INPUT_DIGEST_BUF
staging/$f:$D"
  fi
done
INPUT_CONTENT_DIGEST=$(printf "%s" "$INPUT_DIGEST_BUF" | sha256_hex)
KEY_BUF=$(printf "%s\n%s\n%s" "$COMMAND" "$SPEC_TAG" "$INPUT_CONTENT_DIGEST")
IDEMPOTENCY_KEY=$(printf "%s" "$KEY_BUF" | sha256_hex)
STARTED_AT=$(utc_iso)
RECEIPT_ID="${COMMAND}-${SPEC_TAG}-${TS_FILE}"

cat > "$RECEIPT" <<EOF
# Canonical receipt — per docs/protocol/receipt-schema.md.
# Written BEFORE the atomic rename per Codex round-2 finding [medium]
# (atomic-root guarantee) — durable on disk regardless of any kill -9 after this point.

receipt_id: "$RECEIPT_ID"
command: "$COMMAND"
adapter: "claude-code"
wave_id: null
spec_path: "docs/specs/2026-05-13-memory-system-redesign.md"
inputs:
  - "skills/shared-root-init/lib/init.sh"
outputs:
  - "~/.claude/memory/USER.md"
  - "~/.claude/memory/FEEDBACK.md"
  - "~/.claude/memory/REFERENCES.md"
  - "~/.claude/memory/PROJECTS.md"
  - "~/.claude/memory/archive/"
  - "~/.claude/memory/feedback/"
verification:
  commands:
    - "test -d ~/.claude/memory && test -d ~/.claude/memory/archive && test -d ~/.claude/memory/feedback"
    - "test -f ~/.claude/memory/USER.md && test -f ~/.claude/memory/FEEDBACK.md"
    - "test -f ~/.claude/memory/REFERENCES.md && test -f ~/.claude/memory/PROJECTS.md"
    - "awk 'length > 150 {print FILENAME\":\"NR; exit 1}' ~/.claude/memory/*.md"
  results: []
started_at: "$STARTED_AT"
completed_at: null
status: partial
idempotency_key:
  value: "$IDEMPOTENCY_KEY"
  trace:
    command: "$COMMAND"
    wave_id_or_spec_path: "$SPEC_TAG"
    sorted_inputs:
      - "staging/FEEDBACK.md"
      - "staging/PROJECTS.md"
      - "staging/REFERENCES.md"
      - "staging/USER.md"
    input_content_digest: "$INPUT_CONTENT_DIGEST"
operation_id: "$OP_ID"
notes: "Atomic-root staging dir: $STAGING; rename pending."
EOF

# ---------- step 4: journal staging-built ----------
TS=$(utc_iso)
printf '{"op_id":"shared-root-init:%s","action":"staging-built","staging_path":"%s","target_path":"%s","ts":"%s"}\n' \
  "$SPEC_TAG" "$STAGING" "$TARGET" "$TS" >> "$JOURNAL"

# ---------- test-only kill hook (BEFORE atomic rename) ----------
if [ "$KILL_AFTER_STAGING" = "1" ]; then
  echo "✗ TEST-ONLY: killing self after staging build, before atomic rename." >&2
  echo "  Staging dir: $STAGING" >&2
  echo "  Receipt: $RECEIPT (status: partial)" >&2
  kill -KILL $$
  # unreachable
  exit 137
fi

# ---------- step 5: atomic rename (single rename(2) syscall) ----------
mv "$STAGING" "$TARGET"

# ---------- step 6: journal committed ----------
TS=$(utc_iso)
printf '{"op_id":"shared-root-init:%s","action":"committed","target_path":"%s","ts":"%s"}\n' \
  "$SPEC_TAG" "$TARGET" "$TS" >> "$JOURNAL"

# ---------- step 7: update receipt status: success + completed_at ----------
# Portable in-place edit: sed on macOS needs -i ''; GNU sed needs -i.
COMPLETED_AT=$(utc_iso)
if sed --version >/dev/null 2>&1; then
  # GNU sed
  sed -i -e "s|^status: partial|status: success|" "$RECEIPT"
  sed -i -e "s|^completed_at: null|completed_at: \"$COMPLETED_AT\"|" "$RECEIPT"
  sed -i -e "s|^notes: \"Atomic-root staging dir.*|notes: \"Atomic-root rename committed at $COMPLETED_AT.\"|" "$RECEIPT"
else
  # BSD/macOS sed
  sed -i '' -e "s|^status: partial|status: success|" "$RECEIPT"
  sed -i '' -e "s|^completed_at: null|completed_at: \"$COMPLETED_AT\"|" "$RECEIPT"
  sed -i '' -e "s|^notes: \"Atomic-root staging dir.*|notes: \"Atomic-root rename committed at $COMPLETED_AT.\"|" "$RECEIPT"
fi

echo "✓ shared-root-init committed: $TARGET"
echo "  Receipt: $RECEIPT (status: success)"
echo "  Journal: $JOURNAL"
exit 0
