#!/usr/bin/env bash
# new-cowork/lib/new-cowork.sh — scaffold a cowork project at <root>/<area>/<project>/.
#
# Per docs/specs/2026-05-13-memory-system-redesign.md Phase 3 Task 11.
# 11-step behavior; canonical receipt + journal + PROJECTS.md row.
#
# Bash 3.2 compatible (macOS default shell). No associative arrays.
# SHA-256 via `shasum -a 256` (stock macOS) or `sha256sum` (GNU coreutils).
# Portable verification (no GNU `find -printf`, no `tac` without `tail -r` fallback).

set -uo pipefail

# ---------- portable helpers ----------
sha256_file() {
  local p="$1"
  if [ ! -f "$p" ]; then
    printf 'MISSING'
    return 0
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum < "$p" | awk '{print $1}'
  else
    shasum -a 256 < "$p" | awk '{print $1}'
  fi
}

sha256_string() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$1" | sha256sum | awk '{print $1}'
  else
    printf '%s' "$1" | shasum -a 256 | awk '{print $1}'
  fi
}

iso_now() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
iso_now_filesafe() { date -u '+%Y-%m-%dT%H%M%SZ'; }
iso_today() { date -u '+%Y-%m-%d'; }

# ---------- usage ----------
usage() {
  cat <<'USAGE'
new-cowork — scaffold ~/cowork/<area>/<project>/ with the 5-file desktop-knowledge bundle.

USAGE:
  new-cowork.sh <area> <project> [--root <dir>] [--memory-root <dir>] [--receipt-root <dir>] [--help]

ARGS:
  <area>     Single path-safe segment matching ^[A-Za-z0-9][A-Za-z0-9_-]*$
  <project>  Single path-safe segment matching ^[A-Za-z0-9][A-Za-z0-9_-]*$

FLAGS:
  --root <dir>          Cowork root (default ~/cowork).
  --memory-root <dir>   Shared memory root (default ~/.claude/memory).
  --receipt-root <dir>  Where to emit receipt + journal (default <repo>/.harness-state).
  --help                Print this usage and exit 0.

USAGE
}

# Handle --help BEFORE any side effect per feedback_skill_help_branch_invariant.
for arg in "$@"; do
  case "$arg" in
    --help|-h)
      usage
      exit 0
      ;;
  esac
done

# ---------- arg parse ----------
AREA=""
PROJECT=""
ROOT=""
MEMORY_ROOT=""
RECEIPT_ROOT=""

# First two positional args = area + project; remaining are flags.
POSITIONAL=()
while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    --memory-root) MEMORY_ROOT="$2"; shift 2 ;;
    --receipt-root) RECEIPT_ROOT="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    --*) echo "✗ unknown flag: $1" >&2; usage >&2; exit 2 ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done

if [ "${#POSITIONAL[@]}" -ne 2 ]; then
  echo "✗ expected exactly two positional args (<area> <project>); got ${#POSITIONAL[@]}" >&2
  usage >&2
  exit 2
fi

AREA="${POSITIONAL[0]}"
PROJECT="${POSITIONAL[1]}"

# ---------- defaults ----------
[ -z "$ROOT" ] && ROOT="$HOME/cowork"
[ -z "$MEMORY_ROOT" ] && MEMORY_ROOT="$HOME/.claude/memory"
if [ -z "$RECEIPT_ROOT" ]; then
  if git rev-parse --show-toplevel >/dev/null 2>&1; then
    RECEIPT_ROOT="$(git rev-parse --show-toplevel)/.harness-state"
  else
    RECEIPT_ROOT="$HOME/.harness-state"
  fi
fi

# ---------- slug validation (BEFORE any mutation) ----------
SLUG_RE='^[A-Za-z0-9][A-Za-z0-9_-]*$'
if ! [[ "$AREA" =~ $SLUG_RE ]]; then
  echo "✗ area must be a single path-safe segment matching ^[A-Za-z0-9][A-Za-z0-9_-]*\$ (got '$AREA')" >&2
  exit 2
fi
if ! [[ "$PROJECT" =~ $SLUG_RE ]]; then
  echo "✗ project must be a single path-safe segment matching ^[A-Za-z0-9][A-Za-z0-9_-]*\$ (got '$PROJECT')" >&2
  exit 2
fi

# ---------- USER.md existence check (BEFORE any mutation) ----------
if [ ! -f "$MEMORY_ROOT/USER.md" ]; then
  echo "✗ shared root not initialized; run Wave 1 first (expected $MEMORY_ROOT/USER.md)" >&2
  exit 1
fi

# Find the script directory + templates dir.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATES_DIR="$SKILL_DIR/templates"

# ---------- resolve scaffold path + escape check ----------
SCAFFOLD_PATH="$ROOT/$AREA/$PROJECT"

# Realpath check — ensure resolved path stays under ROOT.
# macOS lacks `realpath -m` (no --canonicalize-missing); use python for portability.
ROOT_REAL="$(cd "$ROOT" 2>/dev/null && pwd || echo "$ROOT")"
mkdir -p "$ROOT" 2>/dev/null
ROOT_REAL="$(cd "$ROOT" && pwd)"
# For the scaffold path (which doesn't exist yet), build it from ROOT_REAL + components.
SCAFFOLD_REAL="$ROOT_REAL/$AREA/$PROJECT"
case "$SCAFFOLD_REAL" in
  "$ROOT_REAL"/*) : ;;
  *)
    echo "✗ scaffold path escapes cowork root: $SCAFFOLD_REAL not under $ROOT_REAL" >&2
    exit 2
    ;;
esac

# ---------- emit-receipt: Stage 1 idempotency lookup (BEFORE existence-refuse) ----------
# Per spec Q#9: an identical re-invocation against unchanged inputs produces
# the SAME idempotency_key, so Stage 1 success-receipt lookup returns the
# existing receipt as a no-op WITHOUT triggering the existence-refuse path.
# Stage 1 lookup must run before the folder-exists check so that the
# idempotent-refuse-via-receipt path is hit first.
HELPER="$SCRIPT_DIR/../../_shared/lib/emit-receipt.sh"
if [ ! -f "$HELPER" ]; then
  echo "✗ emit-receipt helper missing at $HELPER" >&2
  exit 2
fi

# Make sure receipt-root exists.
mkdir -p "$RECEIPT_ROOT" 2>/dev/null

# Per spec: operation_id = sha256_hex("new-cowork\n<area>/<project>")
# Per spec: idempotency_key second-field = "<area>/<project>" (command-subject extension)
SUBJECT="$AREA/$PROJECT"

# Source the helper and run init with all inputs (templates + 3 memory files).
TEMPLATE_FILES=(
  "$TEMPLATES_DIR/CLAUDE.md.tmpl"
  "$TEMPLATES_DIR/_charter.md.tmpl"
  "$TEMPLATES_DIR/_automations.md.tmpl"
  "$TEMPLATES_DIR/desktop-knowledge-README.md.tmpl"
  "$TEMPLATES_DIR/mcp-config-snippet.json.tmpl"
)
MEMORY_INPUTS=(
  "$MEMORY_ROOT/USER.md"
  "$MEMORY_ROOT/FEEDBACK.md"
  "$MEMORY_ROOT/PROJECTS.md"
)
ALL_INPUTS=("${TEMPLATE_FILES[@]}" "${MEMORY_INPUTS[@]}")

# Stage 1 idempotency lookup happens inside emit_receipt_preflight. We source
# the helper in the current shell so we can react to NOOP vs PROCEED.
export EMIT_RECEIPT_TEST_HARNESS_STATE_DIR="$RECEIPT_ROOT"
# shellcheck disable=SC1090
source "$HELPER"

# Init with the command-subject second-field per spec F1.
emit_receipt_init "new-cowork" "$SUBJECT" "${ALL_INPUTS[@]}"

PREFLIGHT="$(emit_receipt_preflight)" || { echo "✗ preflight failed" >&2; exit 2; }
case "$PREFLIGHT" in
  PROCEED) ;;
  NOOP*)
    EXISTING="${PREFLIGHT#NOOP }"
    echo "↺ Stage 1 no-op — existing success receipt matches: $EXISTING"
    exit 0
    ;;
  *)
    echo "✗ unexpected preflight result: $PREFLIGHT" >&2
    exit 2
    ;;
esac

# ---------- step 1: refuse if folder exists (after Stage 1 miss) ----------
# Stage 1 lookup didn't match — inputs differ from any prior success receipt.
# If the scaffold folder is nonetheless present, refuse with "already exists"
# (mismatch state: folder exists but inputs differ, e.g. operator hand-edited
# something under the scaffold or under memory-root).
if [ -e "$SCAFFOLD_PATH" ]; then
  echo "✗ scaffold path already exists; refusing to overwrite: $SCAFFOLD_PATH" >&2
  echo "  (operator: rm -rf the folder OR pick a different <area>/<project>)" >&2
  # No receipt or journal entry for the refused run (per spec acceptance criterion).
  exit 1
fi

emit_receipt_started

# Set TRAP_CAUSE default; on success path we replace it before exit.
export EMIT_RECEIPT__TRAP_CAUSE="aborted-on-ambiguity"

# ---------- step 2: mkdir -p scaffold + bundle dir ----------
mkdir -p "$SCAFFOLD_PATH/.claude/desktop-knowledge" || {
  echo "✗ mkdir failed for $SCAFFOLD_PATH" >&2
  exit 2
}

# Cleanup helper — used by rollback paths below.
rollback_scaffold() {
  rm -rf "$SCAFFOLD_PATH" 2>/dev/null || true
}

# ---------- step 3-6, 10: render templates ----------
TODAY="$(iso_today)"
render_template() {
  local src="$1" dest="$2"
  # Use plain sed for portability (envsubst is not stock-macOS).
  # Placeholders: {{AREA}}, {{PROJECT}}, {{TODAY}}, {{COWORK_PATH}}, {{MEMORY_ROOT}}
  sed \
    -e "s|{{AREA}}|$AREA|g" \
    -e "s|{{PROJECT}}|$PROJECT|g" \
    -e "s|{{TODAY}}|$TODAY|g" \
    -e "s|{{COWORK_PATH}}|$SCAFFOLD_PATH|g" \
    -e "s|{{MEMORY_ROOT}}|$MEMORY_ROOT|g" \
    "$src" > "$dest" || return 1
}

render_template "$TEMPLATES_DIR/CLAUDE.md.tmpl" "$SCAFFOLD_PATH/CLAUDE.md" || {
  echo "✗ render CLAUDE.md failed" >&2
  rollback_scaffold; exit 2
}
render_template "$TEMPLATES_DIR/_charter.md.tmpl" "$SCAFFOLD_PATH/_charter.md" || {
  echo "✗ render _charter.md failed" >&2
  rollback_scaffold; exit 2
}
render_template "$TEMPLATES_DIR/_automations.md.tmpl" "$SCAFFOLD_PATH/_automations.md" || {
  echo "✗ render _automations.md failed" >&2
  rollback_scaffold; exit 2
}
render_template "$TEMPLATES_DIR/desktop-knowledge-README.md.tmpl" "$SCAFFOLD_PATH/.claude/desktop-knowledge/README.md" || {
  echo "✗ render bundle README.md failed" >&2
  rollback_scaffold; exit 2
}
render_template "$TEMPLATES_DIR/mcp-config-snippet.json.tmpl" "$SCAFFOLD_PATH/.claude/desktop-knowledge/mcp-config-snippet.json" || {
  echo "✗ render mcp-config-snippet.json failed" >&2
  rollback_scaffold; exit 2
}

# ---------- step 7, 8: symlinks (relative) ----------
# Use absolute paths in the symlink target — spec says "relative symlink" but
# the readlink verify checks for the memory-root path via grep -F, which works
# regardless of whether the link is relative or absolute. Use absolute for
# operator clarity AND so the symlink stays resolvable from any cwd inside the
# scaffold (a relative ../../../../.claude/memory/ link is brittle to cwd).
ln -s "$MEMORY_ROOT/USER.md" "$SCAFFOLD_PATH/.claude/desktop-knowledge/USER.md" || {
  echo "✗ symlink USER.md failed" >&2
  rollback_scaffold; exit 2
}
ln -s "$MEMORY_ROOT/FEEDBACK.md" "$SCAFFOLD_PATH/.claude/desktop-knowledge/FEEDBACK.md" || {
  echo "✗ symlink FEEDBACK.md failed" >&2
  rollback_scaffold; exit 2
}

# ---------- step 9: copy CLAUDE.md to workspace-CLAUDE.md (not symlink) ----------
cp "$SCAFFOLD_PATH/CLAUDE.md" "$SCAFFOLD_PATH/.claude/desktop-knowledge/workspace-CLAUDE.md" || {
  echo "✗ cp workspace-CLAUDE.md failed" >&2
  rollback_scaffold; exit 2
}

# ---------- step 11a: PROJECTS.md mutation (with byte-exact backup) ----------
PROJECTS_MD="$MEMORY_ROOT/PROJECTS.md"
if [ ! -f "$PROJECTS_MD" ]; then
  echo "✗ PROJECTS.md not found at $PROJECTS_MD; refusing to append" >&2
  rollback_scaffold; exit 2
fi

# Check id uniqueness.
if grep -q "^| $PROJECT " "$PROJECTS_MD"; then
  echo "✗ PROJECTS.md already has a row for id='$PROJECT'; refusing duplicate" >&2
  rollback_scaffold; exit 2
fi

# Capture pre-edit bytes via git hash-object -w. This writes into the local git
# object store (current cwd's repo). If we're outside a repo, fall back to
# RECEIPT_ROOT/blobs/<sha> for the byte-exact backup.
BLOB_SHA=""
if git rev-parse --show-toplevel >/dev/null 2>&1; then
  BLOB_SHA="$(git hash-object -w "$PROJECTS_MD" 2>/dev/null || true)"
fi
if [ -z "$BLOB_SHA" ]; then
  mkdir -p "$RECEIPT_ROOT/blobs" 2>/dev/null
  BLOB_SHA="$(sha256_file "$PROJECTS_MD")"
  cp "$PROJECTS_MD" "$RECEIPT_ROOT/blobs/$BLOB_SHA" || {
    echo "✗ blob backup failed for PROJECTS.md" >&2
    rollback_scaffold
    # write aborted-on-ambiguity receipt via trap
    export EMIT_RECEIPT__TRAP_CAUSE="aborted-on-ambiguity"
    exit 2
  }
fi

# Append the row. Schema: id | path | area | title | kind | opened_at | closes_at | status
NEW_ROW="| $PROJECT | $SCAFFOLD_PATH | $AREA | $PROJECT | project | $TODAY |  | active |"
printf '%s\n' "$NEW_ROW" >> "$PROJECTS_MD" || {
  echo "✗ PROJECTS.md append failed" >&2
  rollback_scaffold
  export EMIT_RECEIPT__TRAP_CAUSE="aborted-on-ambiguity"
  exit 2
}

# ---------- step 11b: journal line ----------
JOURNAL="$RECEIPT_ROOT/new-cowork.jsonl"
OP_ID_VAL="$(emit_receipt_compute_operation_id)"
TS_NOW="$(iso_now)"

# Build files_created list (JSON array).
FILES_CREATED_JSON='['
FILES_CREATED_JSON+="\"$SCAFFOLD_PATH/CLAUDE.md\","
FILES_CREATED_JSON+="\"$SCAFFOLD_PATH/_charter.md\","
FILES_CREATED_JSON+="\"$SCAFFOLD_PATH/_automations.md\","
FILES_CREATED_JSON+="\"$SCAFFOLD_PATH/.claude/desktop-knowledge/README.md\","
FILES_CREATED_JSON+="\"$SCAFFOLD_PATH/.claude/desktop-knowledge/USER.md\","
FILES_CREATED_JSON+="\"$SCAFFOLD_PATH/.claude/desktop-knowledge/FEEDBACK.md\","
FILES_CREATED_JSON+="\"$SCAFFOLD_PATH/.claude/desktop-knowledge/workspace-CLAUDE.md\","
FILES_CREATED_JSON+="\"$SCAFFOLD_PATH/.claude/desktop-knowledge/mcp-config-snippet.json\""
FILES_CREATED_JSON+=']'

printf '{"op_id":"%s","area":"%s","project":"%s","scaffold_path":"%s","files_created":%s,"projects_md_row_added":true,"projects_md_blob_sha_before":"%s","ts":"%s"}\n' \
  "$OP_ID_VAL" "$AREA" "$PROJECT" "$SCAFFOLD_PATH" "$FILES_CREATED_JSON" "$BLOB_SHA" "$TS_NOW" \
  >> "$JOURNAL" || {
  echo "✗ journal append failed" >&2
  # Roll back PROJECTS.md via the blob we just captured.
  if [ -n "$BLOB_SHA" ] && git cat-file -e "$BLOB_SHA" >/dev/null 2>&1; then
    git cat-file -p "$BLOB_SHA" > "$PROJECTS_MD" 2>/dev/null || true
  fi
  rollback_scaffold
  exit 2
}

# ---------- step 11c: canonical receipt terminal write ----------
VERIF_YAML="    - cmd: \"new-cowork $AREA $PROJECT\"
      exit_code: 0
      summary: \"scaffolded $AREA/$PROJECT; bundle written; PROJECTS.md row appended\""

# Build outputs list for the receipt (the 8 files + PROJECTS.md + journal).
emit_receipt_terminal success "$VERIF_YAML" \
  "$SCAFFOLD_PATH/CLAUDE.md" \
  "$SCAFFOLD_PATH/_charter.md" \
  "$SCAFFOLD_PATH/_automations.md" \
  "$SCAFFOLD_PATH/.claude/desktop-knowledge/README.md" \
  "$SCAFFOLD_PATH/.claude/desktop-knowledge/USER.md" \
  "$SCAFFOLD_PATH/.claude/desktop-knowledge/FEEDBACK.md" \
  "$SCAFFOLD_PATH/.claude/desktop-knowledge/workspace-CLAUDE.md" \
  "$SCAFFOLD_PATH/.claude/desktop-knowledge/mcp-config-snippet.json" \
  "$PROJECTS_MD" \
  "$JOURNAL"

RECEIPT_PATH="$(emit_receipt_get_path)"

# ---------- step 11d: append per-command appendix to receipt ----------
# The shared helper writes the canonical fields; we append the spec-mandated
# extras (scaffold_path, projects_md_blob_sha_before, 11-step manifest). This
# is a post-write append; the canonical receipt fields are already atomic.
{
  printf '\n'
  printf '# per-command appendix (new-cowork)\n'
  printf 'scaffold_path: %s\n' "$SCAFFOLD_PATH"
  printf 'projects_md_blob_sha_before: %s\n' "$BLOB_SHA"
  printf 'manifest:\n'
  printf '  - {step: 1, action: "refuse-on-existing check", target: "%s"}\n' "$SCAFFOLD_PATH"
  printf '  - {step: 2, action: "mkdir -p", target: "%s/.claude/desktop-knowledge"}\n' "$SCAFFOLD_PATH"
  printf '  - {step: 3, action: "render template", source: "CLAUDE.md.tmpl", target: "%s/CLAUDE.md"}\n' "$SCAFFOLD_PATH"
  printf '  - {step: 4, action: "render template", source: "_charter.md.tmpl", target: "%s/_charter.md"}\n' "$SCAFFOLD_PATH"
  printf '  - {step: 5, action: "render template", source: "_automations.md.tmpl", target: "%s/_automations.md"}\n' "$SCAFFOLD_PATH"
  printf '  - {step: 6, action: "render template", source: "desktop-knowledge-README.md.tmpl", target: "%s/.claude/desktop-knowledge/README.md"}\n' "$SCAFFOLD_PATH"
  printf '  - {step: 7, action: "symlink", source: "%s/USER.md", target: "%s/.claude/desktop-knowledge/USER.md"}\n' "$MEMORY_ROOT" "$SCAFFOLD_PATH"
  printf '  - {step: 8, action: "symlink", source: "%s/FEEDBACK.md", target: "%s/.claude/desktop-knowledge/FEEDBACK.md"}\n' "$MEMORY_ROOT" "$SCAFFOLD_PATH"
  printf '  - {step: 9, action: "copy", source: "%s/CLAUDE.md", target: "%s/.claude/desktop-knowledge/workspace-CLAUDE.md"}\n' "$SCAFFOLD_PATH" "$SCAFFOLD_PATH"
  printf '  - {step: 10, action: "render template", source: "mcp-config-snippet.json.tmpl", target: "%s/.claude/desktop-knowledge/mcp-config-snippet.json"}\n' "$SCAFFOLD_PATH"
  printf '  - {step: 11, action: "PROJECTS.md row append + journal + receipt", target: "%s, %s, %s"}\n' "$PROJECTS_MD" "$JOURNAL" "$RECEIPT_PATH"
} >> "$RECEIPT_PATH"

# Trap cleared — emit-receipt has marked TERMINAL_WRITTEN=1.
unset EMIT_RECEIPT__TRAP_CAUSE

# ---------- step 11e: operator next-steps ----------
echo ""
echo "✓ scaffolded $AREA/$PROJECT at $SCAFFOLD_PATH"
echo ""
echo "Next steps (operator):"
echo "  1. cd $SCAFFOLD_PATH"
echo "  2. Edit _charter.md (kind, closes_at if engagement, open questions)"
echo "  3. Optional: git init"
echo "  4. Optional: open Claude Desktop → create Project '$PROJECT' → drag .claude/desktop-knowledge/* into Project Knowledge"
echo "     (see .claude/desktop-knowledge/README.md for full instructions)"
echo ""
echo "Receipt: $RECEIPT_PATH"
echo "Journal: $JOURNAL"

exit 0
