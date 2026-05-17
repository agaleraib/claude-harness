#!/usr/bin/env bash
# cowork-area-sync/lib/cowork-area-sync.sh — push ~/cowork/<area>/CLAUDE.md +
# ~/cowork/<area>/_area.md into every active project's
# .claude/desktop-knowledge/ bundle as `area-CLAUDE.md` + `area-meta.md`.
#
# Per docs/specs/2026-05-14-cowork-area-context.md Task 6 (Wave 15).
#
# Bash 3.2 compatible (macOS default). No associative arrays. Portable shasum.

set -uo pipefail

# ---------- portable helpers ----------
sha256_file() {
  local p="$1"
  if [ ! -f "$p" ]; then
    printf 'null'
    return 0
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum < "$p" | awk '{print $1}'
  else
    shasum -a 256 < "$p" | awk '{print $1}'
  fi
}

iso_now_filesafe() { date -u '+%Y-%m-%dT%H%M%SZ'; }
iso_now() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

# ---------- usage ----------
usage() {
  cat <<'USAGE'
cowork-area-sync — refresh area-level files in every active project's bundle.

USAGE:
  cowork-area-sync.sh <area> [--dry-run] [--root <dir>] [--receipt-root <dir>] [--help]

ARGS:
  <area>     Single path-safe segment matching ^[A-Za-z0-9][A-Za-z0-9_-]*$

FLAGS:
  --dry-run             Print planned actions, exit 0, zero filesystem mutation.
  --root <dir>          Cowork root (default ~/cowork).
  --receipt-root <dir>  Where to emit receipts + parent journal
                        (default <repo>/.harness-state or ~/.harness-state).
  --help                Print this usage and exit 0.

EXIT CODES:
  0  success
  2  argument / usage error
  6  ambiguous resume (≥2 in-progress parent journals)
  7  source-digest drift on resume (recorded != current sha256 of <area>/CLAUDE.md or _area.md)
  99 test hook fired (COWORK_AREA_SYNC_FAIL_AFTER_PROJECT=1)
USAGE
}

# Handle --help BEFORE any side effect per feedback_skill_help_branch_invariant.
for arg in "$@"; do
  case "$arg" in
    --help|-h) usage; exit 0 ;;
  esac
done

# ---------- arg parse ----------
AREA=""
ROOT=""
RECEIPT_ROOT=""
DRY_RUN=0
POSITIONAL=()

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --root) ROOT="$2"; shift 2 ;;
    --receipt-root) RECEIPT_ROOT="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    --*) echo "✗ unknown flag: $1" >&2; usage >&2; exit 2 ;;
    *) POSITIONAL+=("$1"); shift ;;
  esac
done

if [ "${#POSITIONAL[@]}" -ne 1 ]; then
  echo "✗ expected exactly one positional arg (<area>); got ${#POSITIONAL[@]}" >&2
  usage >&2
  exit 2
fi
AREA="${POSITIONAL[0]}"

# ---------- defaults ----------
[ -z "$ROOT" ] && ROOT="$HOME/cowork"
if [ -z "$RECEIPT_ROOT" ]; then
  if git rev-parse --show-toplevel >/dev/null 2>&1; then
    RECEIPT_ROOT="$(git rev-parse --show-toplevel)/.harness-state"
  else
    RECEIPT_ROOT="$HOME/.harness-state"
  fi
fi

# ---------- slug validation ----------
SLUG_RE='^[A-Za-z0-9][A-Za-z0-9_-]*$'
if ! [[ "$AREA" =~ $SLUG_RE ]]; then
  echo "✗ area must be a single path-safe segment matching ^[A-Za-z0-9][A-Za-z0-9_-]*\$ (got '$AREA')" >&2
  exit 2
fi

AREA_DIR="$ROOT/$AREA"
if [ ! -d "$AREA_DIR" ]; then
  echo "✗ area directory $AREA_DIR does not exist; nothing to sync" >&2
  exit 2
fi

AREA_CLAUDE_SRC="$AREA_DIR/CLAUDE.md"
AREA_META_SRC="$AREA_DIR/_area.md"

# Current source digests (null if absent — source missing means delete from bundles).
SRC_CLAUDE_SHA="$(sha256_file "$AREA_CLAUDE_SRC")"
SRC_META_SHA="$(sha256_file "$AREA_META_SRC")"

mkdir -p "$RECEIPT_ROOT" 2>/dev/null

# ---------- resume discovery ----------
# Glob the parent-journal name shape (NOT per-project receipts; those contain
# <project> between <area> and <utc-iso>).
JOURNAL_GLOB="$RECEIPT_ROOT/cowork-area-sync-$AREA-"*".journal.yml"
IN_PROGRESS_JOURNALS=()
# shellcheck disable=SC2206
for jrn in $JOURNAL_GLOB; do
  [ -f "$jrn" ] || continue
  jstatus="$(awk '/^status:/{print $2; exit}' "$jrn" 2>/dev/null || echo "")"
  if [ "$jstatus" = "in-progress" ]; then
    IN_PROGRESS_JOURNALS+=("$jrn")
  fi
done

# ≥2 in-progress → ambiguous-resume refusal, exit 6, zero mutation.
if [ "${#IN_PROGRESS_JOURNALS[@]}" -ge 2 ]; then
  echo "✗ ambiguous resume: ≥2 parent journals with status: in-progress" >&2
  for j in "${IN_PROGRESS_JOURNALS[@]}"; do
    echo "  - $j" >&2
  done
  echo "  Inspect each; finalize one to status: complete or status: failed, or remove the stale journal." >&2
  exit 6
fi

# Pick session id: adopt in-progress journal's <utc-iso>, else mint fresh.
RESUMING=0
SESSION_ISO=""
PARENT_JOURNAL=""
if [ "${#IN_PROGRESS_JOURNALS[@]}" -eq 1 ]; then
  PARENT_JOURNAL="${IN_PROGRESS_JOURNALS[0]}"
  # Extract <utc-iso> from filename: cowork-area-sync-<area>-<utc-iso>.journal.yml
  base="${PARENT_JOURNAL##*/}"
  base="${base#cowork-area-sync-$AREA-}"
  SESSION_ISO="${base%.journal.yml}"
  RESUMING=1
  # F6: source-digest drift check on resume. Compare recorded source digests
  # in the in-progress journal against current source files. Refuse on drift.
  RECORDED_CLAUDE_SHA="$(awk '/^area_claude_source_sha256:/{print $2; exit}' "$PARENT_JOURNAL" 2>/dev/null || echo "")"
  RECORDED_META_SHA="$(awk '/^area_meta_source_sha256:/{print $2; exit}' "$PARENT_JOURNAL" 2>/dev/null || echo "")"
  if [ "$RECORDED_CLAUDE_SHA" != "$SRC_CLAUDE_SHA" ] || [ "$RECORDED_META_SHA" != "$SRC_META_SHA" ]; then
    echo "✗ source-digest drift on resume — refusing to mix source states" >&2
    echo "  area_claude_source_sha256: recorded=$RECORDED_CLAUDE_SHA current=$SRC_CLAUDE_SHA" >&2
    echo "  area_meta_source_sha256:   recorded=$RECORDED_META_SHA current=$SRC_META_SHA" >&2
    echo "  Decide: revert the source files to match the journal, OR finalize the journal (edit status: to failed) and start fresh." >&2
    echo "  Journal: $PARENT_JOURNAL" >&2
    exit 7
  fi
else
  SESSION_ISO="$(iso_now_filesafe)"
  PARENT_JOURNAL="$RECEIPT_ROOT/cowork-area-sync-$AREA-$SESSION_ISO.journal.yml"
fi

# ---------- enumerate projects + classify by lifecycle status ----------
PLANNED=()
SKIPPED_PATHS=()
SKIPPED_REASONS=()

for proj_dir in "$AREA_DIR"/*/; do
  [ -d "$proj_dir" ] || continue
  proj_dir="${proj_dir%/}"
  proj_name="${proj_dir##*/}"
  CHARTER="$proj_dir/_charter.md"
  if [ ! -f "$CHARTER" ]; then
    SKIPPED_PATHS+=("$proj_dir")
    SKIPPED_REASONS+=("missing-charter")
    continue
  fi
  # Portable awk status parser — matches markdown bullet `- **status:** <value>`
  # emitted by skills/new-cowork/templates/_charter.md.tmpl:17.
  status="$(awk '/^- \*\*status:\*\*/{ for(i=1;i<=NF;i++) if($i=="**status:**"){print $(i+1); exit} }' "$CHARTER" 2>/dev/null || echo "")"
  if [ -z "$status" ]; then
    SKIPPED_PATHS+=("$proj_dir")
    SKIPPED_REASONS+=("missing-status")
    continue
  fi
  if [ "$status" != "active" ]; then
    SKIPPED_PATHS+=("$proj_dir")
    SKIPPED_REASONS+=("inactive")
    continue
  fi
  PLANNED+=("$proj_name")
done

# ---------- dry-run: print plan, exit 0 ----------
if [ "$DRY_RUN" -eq 1 ]; then
  echo "DRY RUN — no filesystem mutation."
  echo "Area:    $AREA_DIR"
  echo "Source:  CLAUDE.md=$SRC_CLAUDE_SHA  _area.md=$SRC_META_SHA"
  echo ""
  echo "Active projects (would sync):"
  if [ "${#PLANNED[@]}" -eq 0 ]; then
    echo "  (none)"
  else
    for p in "${PLANNED[@]}"; do
      echo "  - $p"
      bdir="$AREA_DIR/$p/.claude/desktop-knowledge"
      cur_a="$(sha256_file "$bdir/area-CLAUDE.md")"
      cur_m="$(sha256_file "$bdir/area-meta.md")"
      # Determine planned action per file.
      if [ "$SRC_CLAUDE_SHA" = "null" ]; then
        act_a="$([ "$cur_a" = "null" ] && echo noop || echo delete)"
      else
        act_a="$([ "$cur_a" = "$SRC_CLAUDE_SHA" ] && echo noop || echo copy)"
      fi
      if [ "$SRC_META_SHA" = "null" ]; then
        act_m="$([ "$cur_m" = "null" ] && echo noop || echo delete)"
      else
        act_m="$([ "$cur_m" = "$SRC_META_SHA" ] && echo noop || echo copy)"
      fi
      echo "      area_claude_action: $act_a (before=$cur_a)"
      echo "      area_meta_action:   $act_m (before=$cur_m)"
    done
  fi
  echo ""
  echo "Skipped projects:"
  if [ "${#SKIPPED_PATHS[@]}" -eq 0 ]; then
    echo "  (none)"
  else
    i=0
    while [ "$i" -lt "${#SKIPPED_PATHS[@]}" ]; do
      echo "  - ${SKIPPED_PATHS[$i]}  reason: ${SKIPPED_REASONS[$i]}"
      i=$((i+1))
    done
  fi
  exit 0
fi

# ---------- write / rewrite parent journal (in-progress) ----------
write_parent_journal() {
  local jstatus="$1"
  local tmp="$PARENT_JOURNAL.tmp"
  {
    printf 'started_at: %s\n' "$SESSION_ISO"
    printf 'area: %s\n' "$AREA"
    printf 'area_claude_source_sha256: %s\n' "$SRC_CLAUDE_SHA"
    printf 'area_meta_source_sha256: %s\n' "$SRC_META_SHA"
    printf 'projects_planned:\n'
    if [ "${#PLANNED[@]}" -eq 0 ]; then
      printf '  []\n'
    else
      for p in "${PLANNED[@]}"; do printf '  - %s\n' "$p"; done
    fi
    printf 'projects_completed:\n'
    if [ "${#COMPLETED[@]}" -eq 0 ]; then
      printf '  []\n'
    else
      for p in "${COMPLETED[@]}"; do printf '  - %s\n' "$p"; done
    fi
    printf 'projects_skipped:\n'
    if [ "${#SKIPPED_PATHS[@]}" -eq 0 ]; then
      printf '  []\n'
    else
      i=0
      while [ "$i" -lt "${#SKIPPED_PATHS[@]}" ]; do
        printf '  - { path: "%s", reason: %s }\n' "${SKIPPED_PATHS[$i]}" "${SKIPPED_REASONS[$i]}"
        i=$((i+1))
      done
    fi
    printf 'status: %s\n' "$jstatus"
  } > "$tmp" || return 1
  mv "$tmp" "$PARENT_JOURNAL"
}

# Initialize COMPLETED. On resume, re-read from existing journal to preserve
# the list of already-completed projects from the prior partial run.
COMPLETED=()
if [ "$RESUMING" -eq 1 ] && [ -f "$PARENT_JOURNAL" ]; then
  # Parse projects_completed list — naive line-by-line; assumes one entry per line.
  in_completed=0
  while IFS= read -r line; do
    case "$line" in
      projects_completed:*) in_completed=1; continue ;;
      projects_skipped:*|status:*|started_at:*|area:*|area_*) in_completed=0 ;;
    esac
    if [ "$in_completed" -eq 1 ]; then
      case "$line" in
        "  - "*)
          val="${line#  - }"
          COMPLETED+=("$val")
          ;;
        "  []") : ;;
      esac
    fi
  done < "$PARENT_JOURNAL"
fi

write_parent_journal "in-progress" || {
  echo "✗ failed to write parent journal at $PARENT_JOURNAL" >&2
  exit 2
}

# ---------- per-project sync ----------
project_already_done() {
  local proj="$1"
  local terminal="$RECEIPT_ROOT/cowork-area-sync-$AREA-$proj-$SESSION_ISO.yml"
  [ -f "$terminal" ]
}

is_completed_member() {
  local p="$1" c
  # Bash 3.2 + `set -u` guard: empty-array expansion under -u errors. Use
  # the `${arr[@]:+...}` idiom to skip the loop body when COMPLETED is empty.
  for c in ${COMPLETED[@]+"${COMPLETED[@]}"}; do
    [ "$c" = "$p" ] && return 0
  done
  return 1
}

sync_one_project() {
  local proj="$1"
  local proj_dir="$AREA_DIR/$proj"
  local bundle_dir="$proj_dir/.claude/desktop-knowledge"

  # Idempotent skip: terminal receipt already exists for this session.
  if project_already_done "$proj"; then
    return 0
  fi

  if [ ! -d "$bundle_dir" ]; then
    # Active project without a bundle — pre-Wave-13 scaffold or partial install.
    # Treat as missing-bundle skip; record in journal-level skipped list later.
    return 0
  fi

  local started="$RECEIPT_ROOT/cowork-area-sync-$AREA-$proj-$SESSION_ISO.started.yml"
  local terminal="$RECEIPT_ROOT/cowork-area-sync-$AREA-$proj-$SESSION_ISO.yml"

  local before_claude before_meta
  before_claude="$(sha256_file "$bundle_dir/area-CLAUDE.md")"
  before_meta="$(sha256_file "$bundle_dir/area-meta.md")"

  # Decide actions (copy/delete/noop) per file based on source presence.
  local action_claude action_meta
  if [ "$SRC_CLAUDE_SHA" = "null" ]; then
    if [ "$before_claude" = "null" ]; then action_claude="noop"
    else action_claude="delete"; fi
  else
    if [ "$before_claude" = "$SRC_CLAUDE_SHA" ]; then action_claude="noop"
    else action_claude="copy"; fi
  fi
  if [ "$SRC_META_SHA" = "null" ]; then
    if [ "$before_meta" = "null" ]; then action_meta="noop"
    else action_meta="delete"; fi
  else
    if [ "$before_meta" = "$SRC_META_SHA" ]; then action_meta="noop"
    else action_meta="copy"; fi
  fi

  # Write started receipt FIRST (atomic via temp+rename — bash 3.2 compatible).
  {
    printf 'command: cowork-area-sync\n'
    printf 'area: %s\n' "$AREA"
    printf 'project: %s\n' "$proj"
    printf 'area_claude_before_sha256: %s\n' "$before_claude"
    printf 'area_claude_planned_action: %s\n' "$action_claude"
    printf 'area_meta_before_sha256: %s\n' "$before_meta"
    printf 'area_meta_planned_action: %s\n' "$action_meta"
    printf 'started_at: "%s"\n' "$(iso_now)"
    printf 'status: started\n'
  } > "$started.tmp" || return 1
  mv "$started.tmp" "$started" || return 1

  # Apply CLAUDE.md action.
  case "$action_claude" in
    copy)
      local tmpc="$bundle_dir/.area-CLAUDE.md.tmp.$$"
      cp "$AREA_CLAUDE_SRC" "$tmpc" || return 1
      mv "$tmpc" "$bundle_dir/area-CLAUDE.md" || { rm -f "$tmpc" 2>/dev/null; return 1; }
      ;;
    delete) rm -f "$bundle_dir/area-CLAUDE.md" 2>/dev/null || true ;;
    noop) : ;;
  esac

  # Apply _area.md action.
  case "$action_meta" in
    copy)
      local tmpm="$bundle_dir/.area-meta.md.tmp.$$"
      cp "$AREA_META_SRC" "$tmpm" || return 1
      mv "$tmpm" "$bundle_dir/area-meta.md" || { rm -f "$tmpm" 2>/dev/null; return 1; }
      ;;
    delete) rm -f "$bundle_dir/area-meta.md" 2>/dev/null || true ;;
    noop) : ;;
  esac

  # Capture after digests.
  local after_claude after_meta
  after_claude="$(sha256_file "$bundle_dir/area-CLAUDE.md")"
  after_meta="$(sha256_file "$bundle_dir/area-meta.md")"

  # Write terminal receipt (matches §Per-project receipt schema verbatim).
  {
    printf 'command: cowork-area-sync\n'
    printf 'area: %s\n' "$AREA"
    printf 'project: %s\n' "$proj"
    printf 'area_claude_before_sha256: %s\n' "$before_claude"
    printf 'area_claude_after_sha256: %s\n' "$after_claude"
    printf 'area_claude_action: %s\n' "$action_claude"
    printf 'area_meta_before_sha256: %s\n' "$before_meta"
    printf 'area_meta_after_sha256: %s\n' "$after_meta"
    printf 'area_meta_action: %s\n' "$action_meta"
    printf 'session_id: %s\n' "$SESSION_ISO"
    printf 'started_at: "%s"\n' "$(awk '/^started_at:/{print $2; exit}' "$started" | tr -d '"')"
    printf 'completed_at: "%s"\n' "$(iso_now)"
    printf 'status: success\n'
  } > "$terminal.tmp" || return 1
  mv "$terminal.tmp" "$terminal" || return 1
  # Drop the started sidecar (terminal-rename pattern).
  rm -f "$started" 2>/dev/null || true

  return 0
}

# Iterate planned projects.
for proj in ${PLANNED[@]+"${PLANNED[@]}"}; do
  if is_completed_member "$proj"; then
    continue
  fi
  if ! sync_one_project "$proj"; then
    echo "✗ sync failed for project: $proj" >&2
    # Leave parent journal status: in-progress for resume on next invocation.
    exit 2
  fi
  COMPLETED+=("$proj")
  # Update parent journal incrementally so a crash mid-loop leaves a recoverable
  # state (in-progress + completed list updated).
  write_parent_journal "in-progress" || true

  # Test hook: simulate a crash after first project's terminal receipt is
  # written so the resume path is verifiable.
  if [ "${COWORK_AREA_SYNC_FAIL_AFTER_PROJECT:-0}" = "1" ]; then
    echo "✗ COWORK_AREA_SYNC_FAIL_AFTER_PROJECT=1 (test hook) — failing after first project" >&2
    exit 99
  fi
done

# Finalize parent journal to status: complete.
write_parent_journal "complete" || {
  echo "✗ failed to finalize parent journal" >&2
  exit 2
}

echo "✓ cowork-area-sync $AREA — synced ${#COMPLETED[@]} active project(s), skipped ${#SKIPPED_PATHS[@]}"
echo "Parent journal: $PARENT_JOURNAL"
exit 0
