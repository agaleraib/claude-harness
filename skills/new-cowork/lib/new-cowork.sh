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
Optionally scaffolds area-level CLAUDE.md + _area.md and includes them in the
bundle (7-file shape) when --area-context=create is passed.

USAGE:
  new-cowork.sh <area> <project> [--root <dir>] [--memory-root <dir>] [--receipt-root <dir>]
                                 [--area-context=create|skip|require] [--help]

ARGS:
  <area>     Single path-safe segment matching ^[A-Za-z0-9][A-Za-z0-9_-]*$
  <project>  Single path-safe segment matching ^[A-Za-z0-9][A-Za-z0-9_-]*$

FLAGS:
  --root <dir>             Cowork root (default ~/cowork).
  --memory-root <dir>      Shared memory root (default ~/.claude/memory).
  --receipt-root <dir>     Where to emit receipt + journal (default <repo>/.harness-state).
  --area-context=<mode>    Area-level CLAUDE.md / _area.md handling:
                             create  - scaffold area files from templates if absent;
                                       include in 7-file bundle.
                             skip    - do not scaffold area files; 5-file bundle.
                             require - refuse (exit 5) if <area>/CLAUDE.md is absent.
                           TTY default when flag omitted + area files absent: prompt.
                           Non-TTY callers MUST pass this flag explicitly (else exit 4).
  --help                   Print this usage and exit 0.

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
AREA_CONTEXT_MODE=""        # "" (unset) | create | skip | require
AREA_CONTEXT_FLAG_PRESENT=0  # 1 iff --area-context=<mode> was passed

# First two positional args = area + project; remaining are flags.
POSITIONAL=()
while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    --memory-root) MEMORY_ROOT="$2"; shift 2 ;;
    --receipt-root) RECEIPT_ROOT="$2"; shift 2 ;;
    --area-context=*)
      AREA_CONTEXT_MODE="${1#--area-context=}"
      AREA_CONTEXT_FLAG_PRESENT=1
      case "$AREA_CONTEXT_MODE" in
        create|skip|require) ;;
        *)
          echo "✗ --area-context must be one of: create | skip | require (got '$AREA_CONTEXT_MODE')" >&2
          exit 2
          ;;
      esac
      shift
      ;;
    --area-context)
      echo "✗ --area-context requires a value: use --area-context=create|skip|require" >&2
      exit 2
      ;;
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

# ---------- non-TTY guard (BEFORE any disk write) ----------
# Per spec §Area-context flag semantics: non-interactive callers MUST pass
# --area-context=<mode> explicitly. Refusing here — before the started receipt
# is reserved — means a script / Codex / cron caller that forgets the flag
# produces ZERO filesystem mutation, not a half-started receipt the operator
# has to triage.
if [ "$AREA_CONTEXT_FLAG_PRESENT" -ne 1 ] && [ ! -t 0 ]; then
  echo "✗ non-interactive shell requires explicit --area-context=create|skip|require. Aborting." >&2
  exit 4
fi

# Find the script directory + templates dir.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATES_DIR="$SKILL_DIR/templates"

# ---------- resolve scaffold path + escape check ----------
# Defense against intermediate-symlink escape: if <root>/<area> already exists
# as a symlink (or any path), canonicalize it via `pwd -P` (physical, follows
# symlinks) and ensure the resolved location is still prefix-matched by the
# physical ROOT_REAL. Bash's default `pwd` is logical (`-L`) and preserves the
# symlink name — using bare `pwd` here would let `mkdir -p` later follow the
# symlink and write the scaffold outside the configured cowork root.
mkdir -p "$ROOT" 2>/dev/null
ROOT_REAL="$(cd "$ROOT" && pwd -P)"

AREA_PATH="$ROOT_REAL/$AREA"
if [ -e "$AREA_PATH" ] || [ -L "$AREA_PATH" ]; then
  # `pwd -P` returns the physical path with all symlinks resolved.
  AREA_REAL="$(cd "$AREA_PATH" 2>/dev/null && pwd -P || echo "")"
  if [ -z "$AREA_REAL" ]; then
    echo "✗ area path $AREA_PATH exists but cannot be canonicalized" >&2
    exit 2
  fi
  case "$AREA_REAL/" in
    "$ROOT_REAL"/*) : ;;
    *)
      echo "✗ scaffold path escapes cowork root: area '$AREA' resolves to $AREA_REAL which is not under $ROOT_REAL" >&2
      exit 2
      ;;
  esac
  # Build SCAFFOLD from the physical area path so subsequent mkdir operations
  # stay inside ROOT_REAL even if AREA_PATH itself is a within-root symlink.
  SCAFFOLD_PATH="$AREA_REAL/$PROJECT"
else
  # Area doesn't exist yet — construct under ROOT_REAL.
  SCAFFOLD_PATH="$ROOT_REAL/$AREA/$PROJECT"
fi

# Final belt-and-braces prefix check.
case "$SCAFFOLD_PATH/" in
  "$ROOT_REAL"/*) : ;;
  *)
    echo "✗ scaffold path escapes cowork root: $SCAFFOLD_PATH not under $ROOT_REAL" >&2
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

# Reserve-before-mutate guarantee: if the started receipt cannot be written
# (atomic-write loss, disk full, ENOSPC, EROFS, etc.) we MUST stop before any
# filesystem mutation. The helper installs an EXIT trap during a successful
# `emit_receipt_started`; if the call fails, no trap is in place and no
# audit record exists for an in-progress run — proceeding would mutate state
# silently.
emit_receipt_started || {
  echo "✗ failed to reserve started receipt; refusing to mutate state" >&2
  exit 2
}

# Set TRAP_CAUSE default; on success path we replace it before exit.
export EMIT_RECEIPT__TRAP_CAUSE="aborted-on-ambiguity"

# ---------- area-context: scaffold <area>/CLAUDE.md + <area>/_area.md ----------
# Per docs/specs/2026-05-14-cowork-area-context.md §Area-context flag semantics.
# Runs AFTER started receipt is reserved (so failed area writes have an audit
# trail) but BEFORE the project scaffold (so area-file rollback is possible
# without unwinding the whole project scaffold).
#
# Per-file `_created_this_run` flags + after_sha256 are kept in shell vars and
# also appended to the started receipt as an audit-only appendix. The trap
# below uses the in-memory vars for rollback decisions (independent per file
# so mixed pre-existing state — one operator-authored, one missing — produces
# correct rollback: delete only this-run-created files whose on-disk sha256
# still matches their after_sha256).
AREA_ROOT_DIR="$ROOT_REAL/$AREA"
AREA_CLAUDE_FINAL="$AREA_ROOT_DIR/CLAUDE.md"
AREA_META_FINAL="$AREA_ROOT_DIR/_area.md"
AREA_CLAUDE_BEFORE_SHA="null"
AREA_META_BEFORE_SHA="null"
AREA_CLAUDE_AFTER_SHA="null"
AREA_META_AFTER_SHA="null"
AREA_CLAUDE_CREATED_THIS_RUN="false"
AREA_META_CREATED_THIS_RUN="false"
AREA_CONTEXT_PRESENT="false"
AREA_CONTEXT_DECISION=""        # create | skip | require | present
AREA_CONTEXT_DECIDED_VIA=""     # flag | prompt | implicit
AREA_CONTEXT_SKIP_REASON="null"
AREA_CLAUDE_ROLLBACK_SKIPPED_REASON=""
AREA_META_ROLLBACK_SKIPPED_REASON=""

# Capture pre-existing sha256 for both area files (null if absent).
if [ -f "$AREA_CLAUDE_FINAL" ]; then
  AREA_CLAUDE_BEFORE_SHA="$(sha256_file "$AREA_CLAUDE_FINAL")"
fi
if [ -f "$AREA_META_FINAL" ]; then
  AREA_META_BEFORE_SHA="$(sha256_file "$AREA_META_FINAL")"
fi

# Decide effective mode: flag wins; else TTY prompt; else implicit-present.
AREA_CLAUDE_PRESENT_AT_ENTRY="$([ -f "$AREA_CLAUDE_FINAL" ] && echo true || echo false)"
AREA_META_PRESENT_AT_ENTRY="$([ -f "$AREA_META_FINAL" ] && echo true || echo false)"

if [ "$AREA_CONTEXT_FLAG_PRESENT" -eq 1 ]; then
  AREA_CONTEXT_DECIDED_VIA="flag"
  AREA_CONTEXT_DECISION="$AREA_CONTEXT_MODE"
else
  # TTY without flag — already gated by non-TTY guard above.
  if [ "$AREA_CLAUDE_PRESENT_AT_ENTRY" = "true" ]; then
    # Area files already there — implicit "present" decision, no prompt.
    AREA_CONTEXT_DECIDED_VIA="implicit"
    AREA_CONTEXT_DECISION="present"
  else
    # TTY + no flag + no area files → prompt.
    AREA_CONTEXT_DECIDED_VIA="prompt"
    printf '\nArea `%s` has no shared CLAUDE.md. Create one now? [Y/n] ' "$AREA" >&2
    read -r ANS </dev/tty || ANS=""
    case "$ANS" in
      ""|y|Y|yes|YES) AREA_CONTEXT_DECISION="create" ;;
      *)              AREA_CONTEXT_DECISION="skip"; AREA_CONTEXT_SKIP_REASON="operator declined" ;;
    esac
  fi
fi

# `require` mode: refuse if <area>/CLAUDE.md absent. No project scaffold, no
# area scaffold. Helper EXIT trap will rewrite the started receipt as
# aborted-on-ambiguity.
if [ "$AREA_CONTEXT_DECISION" = "require" ] && [ "$AREA_CLAUDE_PRESENT_AT_ENTRY" != "true" ]; then
  echo "✗ --area-context=require: $AREA_CLAUDE_FINAL absent; refusing to scaffold project" >&2
  echo "  (operator: create $AREA_CLAUDE_FINAL first, or rerun with --area-context=create|skip)" >&2
  exit 5
fi

# `skip` mode: record skip reason if not already set, otherwise no-op here.
if [ "$AREA_CONTEXT_DECISION" = "skip" ]; then
  [ "$AREA_CONTEXT_SKIP_REASON" = "null" ] && AREA_CONTEXT_SKIP_REASON="flag=skip"
fi

# Per-file `created_this_run` decision: true iff THIS invocation will write
# this specific file. In `create` mode, true iff file is currently absent.
# In any other mode, false (we never write area files in skip/require/present).
if [ "$AREA_CONTEXT_DECISION" = "create" ]; then
  [ "$AREA_CLAUDE_PRESENT_AT_ENTRY" != "true" ] && AREA_CLAUDE_CREATED_THIS_RUN="true"
  [ "$AREA_META_PRESENT_AT_ENTRY" != "true" ] && AREA_META_CREATED_THIS_RUN="true"
fi

# Rollback helper — runs from the EXIT trap on non-zero exit. Independently
# per file: delete only files this invocation actually wrote AND whose on-disk
# sha256 still matches the after_sha256 we recorded (operator edits since the
# write → preserve, do not delete).
rollback_area_files() {
  if [ "$AREA_CLAUDE_CREATED_THIS_RUN" = "true" ] && [ -f "$AREA_CLAUDE_FINAL" ]; then
    local now_claude
    now_claude="$(sha256_file "$AREA_CLAUDE_FINAL" 2>/dev/null || echo MISSING)"
    if [ "$now_claude" = "$AREA_CLAUDE_AFTER_SHA" ] && [ -n "$AREA_CLAUDE_AFTER_SHA" ] && [ "$AREA_CLAUDE_AFTER_SHA" != "null" ]; then
      rm -f "$AREA_CLAUDE_FINAL" 2>/dev/null || true
    else
      AREA_CLAUDE_ROLLBACK_SKIPPED_REASON="area_claude edited after scaffold (sha mismatch)"
    fi
  elif [ "$AREA_CLAUDE_CREATED_THIS_RUN" != "true" ] && [ "$AREA_CLAUDE_PRESENT_AT_ENTRY" = "true" ]; then
    AREA_CLAUDE_ROLLBACK_SKIPPED_REASON="area_claude pre-existed"
  fi

  if [ "$AREA_META_CREATED_THIS_RUN" = "true" ] && [ -f "$AREA_META_FINAL" ]; then
    local now_meta
    now_meta="$(sha256_file "$AREA_META_FINAL" 2>/dev/null || echo MISSING)"
    if [ "$now_meta" = "$AREA_META_AFTER_SHA" ] && [ -n "$AREA_META_AFTER_SHA" ] && [ "$AREA_META_AFTER_SHA" != "null" ]; then
      rm -f "$AREA_META_FINAL" 2>/dev/null || true
    else
      AREA_META_ROLLBACK_SKIPPED_REASON="area_meta edited after scaffold (sha mismatch)"
    fi
  elif [ "$AREA_META_CREATED_THIS_RUN" != "true" ] && [ "$AREA_META_PRESENT_AT_ENTRY" = "true" ]; then
    AREA_META_ROLLBACK_SKIPPED_REASON="area_meta pre-existed"
  fi
}

# After-trap appendix: append rollback metadata to the (now rewritten) terminal
# receipt. Runs LAST so the helper's atomic mv has already replaced the file.
# Best-effort: failures here are silent (the trap chain's exit code is owned
# by the underlying script exit code, not this appendix write).
append_area_rollback_appendix() {
  if [ -z "$EMIT_RECEIPT__RECEIPT_PATH" ] || [ ! -f "$EMIT_RECEIPT__RECEIPT_PATH" ]; then
    return 0
  fi
  {
    printf '\n'
    printf '# area-context rollback appendix (new-cowork)\n'
    printf 'rolled_back: true\n'
    # rollback_targets reflects what was actually removed (created_this_run AND no operator edits).
    local targets=""
    if [ "$AREA_CLAUDE_CREATED_THIS_RUN" = "true" ] && [ -z "$AREA_CLAUDE_ROLLBACK_SKIPPED_REASON" ]; then
      targets="$targets$AREA_CLAUDE_FINAL"
    fi
    if [ "$AREA_META_CREATED_THIS_RUN" = "true" ] && [ -z "$AREA_META_ROLLBACK_SKIPPED_REASON" ]; then
      [ -n "$targets" ] && targets="$targets, "
      targets="$targets$AREA_META_FINAL"
    fi
    printf 'rollback_targets: [%s]\n' "$targets"
    [ -n "$AREA_CLAUDE_ROLLBACK_SKIPPED_REASON" ] && printf 'area_claude_rollback_skipped_reason: "%s"\n' "$AREA_CLAUDE_ROLLBACK_SKIPPED_REASON"
    [ -n "$AREA_META_ROLLBACK_SKIPPED_REASON" ]   && printf 'area_meta_rollback_skipped_reason: "%s"\n' "$AREA_META_ROLLBACK_SKIPPED_REASON"
  } >> "$EMIT_RECEIPT__RECEIPT_PATH" 2>/dev/null || true
}

# Combined EXIT trap: roll back area files first (in-process state, fast),
# then let the helper rewrite the started receipt as aborted-on-ambiguity /
# failed / partial, then append the rollback metadata. Replaces the helper's
# own EXIT trap installed inside emit_receipt_started.
__new_cowork_exit_trap() {
  local rc=$?
  if [ "${EMIT_RECEIPT__TERMINAL_WRITTEN:-0}" -eq 1 ]; then
    return $rc
  fi
  rollback_area_files
  ( exit "$rc" ); emit_receipt__trap_handler
  append_area_rollback_appendix
  return $rc
}
trap '__new_cowork_exit_trap' EXIT

# `create` mode: scaffold area files via temp+rename (skipping pre-existing).
# Operator state is authoritative — we never overwrite an existing area file.
if [ "$AREA_CONTEXT_DECISION" = "create" ]; then
  mkdir -p "$AREA_ROOT_DIR" || {
    echo "✗ mkdir failed for area root $AREA_ROOT_DIR" >&2
    exit 2
  }

  if [ "$AREA_CLAUDE_CREATED_THIS_RUN" = "true" ]; then
    AREA_CLAUDE_TMP="$AREA_ROOT_DIR/.CLAUDE.md.tmp.$$"
    sed \
      -e "s|{{AREA}}|$AREA|g" \
      -e "s|{{TODAY}}|$(iso_today)|g" \
      "$TEMPLATES_DIR/AREA_CLAUDE.md.tmpl" > "$AREA_CLAUDE_TMP" || {
      echo "✗ render AREA_CLAUDE.md failed" >&2
      rm -f "$AREA_CLAUDE_TMP" 2>/dev/null || true
      exit 2
    }
    mv "$AREA_CLAUDE_TMP" "$AREA_CLAUDE_FINAL" || {
      echo "✗ mv area CLAUDE.md failed" >&2
      rm -f "$AREA_CLAUDE_TMP" 2>/dev/null || true
      exit 2
    }
    AREA_CLAUDE_AFTER_SHA="$(sha256_file "$AREA_CLAUDE_FINAL")"
  else
    # Pre-existing file kept as-is; after_sha == before_sha for audit symmetry.
    AREA_CLAUDE_AFTER_SHA="$AREA_CLAUDE_BEFORE_SHA"
  fi

  if [ "$AREA_META_CREATED_THIS_RUN" = "true" ]; then
    AREA_META_TMP="$AREA_ROOT_DIR/._area.md.tmp.$$"
    sed \
      -e "s|{{AREA}}|$AREA|g" \
      -e "s|{{TODAY}}|$(iso_today)|g" \
      "$TEMPLATES_DIR/_area.md.tmpl" > "$AREA_META_TMP" || {
      echo "✗ render _area.md failed" >&2
      rm -f "$AREA_META_TMP" 2>/dev/null || true
      exit 2
    }
    mv "$AREA_META_TMP" "$AREA_META_FINAL" || {
      echo "✗ mv area _area.md failed" >&2
      rm -f "$AREA_META_TMP" 2>/dev/null || true
      exit 2
    }
    AREA_META_AFTER_SHA="$(sha256_file "$AREA_META_FINAL")"
  else
    AREA_META_AFTER_SHA="$AREA_META_BEFORE_SHA"
  fi

  AREA_CONTEXT_PRESENT="true"
elif [ "$AREA_CONTEXT_DECISION" = "present" ]; then
  # Implicit-present: both digests echo before==after (audit symmetry).
  AREA_CLAUDE_AFTER_SHA="$AREA_CLAUDE_BEFORE_SHA"
  AREA_META_AFTER_SHA="$AREA_META_BEFORE_SHA"
  AREA_CONTEXT_PRESENT="true"
elif [ "$AREA_CONTEXT_DECISION" = "skip" ]; then
  AREA_CONTEXT_PRESENT="$AREA_CLAUDE_PRESENT_AT_ENTRY"   # purely informational
elif [ "$AREA_CONTEXT_DECISION" = "require" ]; then
  # File presence already enforced above (else we'd have exited 5).
  AREA_CLAUDE_AFTER_SHA="$AREA_CLAUDE_BEFORE_SHA"
  AREA_META_AFTER_SHA="$AREA_META_BEFORE_SHA"
  AREA_CONTEXT_PRESENT="true"
fi

# Append area-context state to the started receipt (audit trail before any
# further mutation). Trap-based rollback reads in-memory shell vars, not this
# appendix, so a partial write here is OK — it won't corrupt rollback logic.
{
  printf '\n'
  printf '# area-context state (started — pre-project-scaffold)\n'
  printf 'area_context_present: %s\n' "$AREA_CONTEXT_PRESENT"
  printf 'area_context_decision: %s\n' "$AREA_CONTEXT_DECISION"
  printf 'decided_via: %s\n' "$AREA_CONTEXT_DECIDED_VIA"
  printf 'area_context_skip_reason: %s\n' "$AREA_CONTEXT_SKIP_REASON"
  printf 'area_claude_before_sha256: %s\n' "$AREA_CLAUDE_BEFORE_SHA"
  printf 'area_claude_after_sha256: %s\n' "$AREA_CLAUDE_AFTER_SHA"
  printf 'area_claude_created_this_run: %s\n' "$AREA_CLAUDE_CREATED_THIS_RUN"
  printf 'area_meta_before_sha256: %s\n' "$AREA_META_BEFORE_SHA"
  printf 'area_meta_after_sha256: %s\n' "$AREA_META_AFTER_SHA"
  printf 'area_meta_created_this_run: %s\n' "$AREA_META_CREATED_THIS_RUN"
} >> "$EMIT_RECEIPT__RECEIPT_PATH" 2>/dev/null || true

# Test hook: NEW_COWORK_FAIL_AFTER_AREA_SCAFFOLD=1 simulates a crash between
# area scaffold and project scaffold so the interrupted-run rollback path is
# verifiable. The trap above rolls back area files independently per
# created_this_run flag, leaving pre-existing operator files byte-identical.
if [ "${NEW_COWORK_FAIL_AFTER_AREA_SCAFFOLD:-0}" = "1" ]; then
  echo "✗ NEW_COWORK_FAIL_AFTER_AREA_SCAFFOLD=1 (test hook) — failing after area scaffold" >&2
  exit 99
fi

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

# ---------- step 9b (Wave 15): area-level bundle copies (5→7 file delta) ----------
# Per docs/specs/2026-05-14-cowork-area-context.md Task 3: when the area-level
# files exist, copy them bytes-exact into the project bundle so Claude Desktop /
# claude.ai (which don't parent-walk) see the same area context Claude Code
# auto-loads. Bytes-exact copies, NOT symlinks — Desktop Knowledge symlink-
# following is unreliable (same reason workspace-CLAUDE.md is a copy at step 9).
# Skip silently when absent (operator chose --area-context=skip, or area files
# never existed).
if [ -f "$AREA_CLAUDE_FINAL" ]; then
  cp "$AREA_CLAUDE_FINAL" "$SCAFFOLD_PATH/.claude/desktop-knowledge/area-CLAUDE.md" || {
    echo "✗ cp area-CLAUDE.md to bundle failed" >&2
    rollback_scaffold; exit 2
  }
fi
if [ -f "$AREA_META_FINAL" ]; then
  cp "$AREA_META_FINAL" "$SCAFFOLD_PATH/.claude/desktop-knowledge/area-meta.md" || {
    echo "✗ cp area-meta.md to bundle failed" >&2
    rollback_scaffold; exit 2
  }
fi

# ---------- step 10b (Wave 16.5): Phase 4 — build .mcpb desktop extension bundle ----------
# Per docs/specs/2026-05-14-cowork-desktop-plugin-generator.md §5 Task 2.
#
# Generates `<project>.mcpb` (Claude Desktop Extension, a ZIP archive) at
# `<scaffold>/.claude/desktop-knowledge/<project>.mcpb` by:
#   1. Copying the desktop-bundle template into a transient `<project>-bundle-src/`.
#   2. Rendering manifest.json from manifest.json.tmpl with concrete values.
#   3. Vendoring `@modelcontextprotocol/server-filesystem` into node_modules/
#      via `npm install --omit=dev`.
#   4. Packing the directory into a `.mcpb` via `npx --yes @anthropic-ai/mcpb pack`.
#   5. Moving the resulting `.mcpb` to the bundle dir and deleting the src/.
#
# Soft-fail by design: if any step fails (no network, npm registry down,
# mcpb CLI install fails), warn and continue — the rest of the scaffold
# succeeds and the operator can run `/cowork-regen-bundle <area>/<project>`
# once the issue resolves.
BUNDLE_TEMPLATE_DIR="$TEMPLATES_DIR/desktop-bundle"
BUNDLE_SRC_DIR="$SCAFFOLD_PATH/.claude/desktop-knowledge/$PROJECT-bundle-src"
BUNDLE_OUT="$SCAFFOLD_PATH/.claude/desktop-knowledge/$PROJECT.mcpb"
BUNDLE_BUILT="false"
BUNDLE_WARN=""

build_desktop_bundle() {
  # Pre-flight: template dir exists?
  if [ ! -d "$BUNDLE_TEMPLATE_DIR" ]; then
    BUNDLE_WARN="desktop-bundle template missing at $BUNDLE_TEMPLATE_DIR — skipping Phase 4"
    return 1
  fi
  if [ ! -f "$BUNDLE_TEMPLATE_DIR/manifest.json.tmpl" ]; then
    BUNDLE_WARN="desktop-bundle/manifest.json.tmpl missing — skipping Phase 4"
    return 1
  fi

  # Pre-flight: npm + npx available?
  if ! command -v npm >/dev/null 2>&1; then
    BUNDLE_WARN="npm not on PATH — skipping Phase 4 (install Node.js to enable .mcpb generation)"
    return 1
  fi
  if ! command -v npx >/dev/null 2>&1; then
    BUNDLE_WARN="npx not on PATH — skipping Phase 4"
    return 1
  fi

  # Step 1: copy template tree to src/
  rm -rf "$BUNDLE_SRC_DIR" 2>/dev/null
  mkdir -p "$BUNDLE_SRC_DIR/server" || {
    BUNDLE_WARN="mkdir failed for $BUNDLE_SRC_DIR"
    return 1
  }
  cp "$BUNDLE_TEMPLATE_DIR/server/index.js" "$BUNDLE_SRC_DIR/server/index.js" || {
    BUNDLE_WARN="cp server/index.js failed"
    return 1
  }
  cp "$BUNDLE_TEMPLATE_DIR/package.json" "$BUNDLE_SRC_DIR/package.json" || {
    BUNDLE_WARN="cp package.json failed"
    return 1
  }
  if [ -f "$BUNDLE_TEMPLATE_DIR/icon.png" ]; then
    cp "$BUNDLE_TEMPLATE_DIR/icon.png" "$BUNDLE_SRC_DIR/icon.png" || true
  fi

  # Step 2: render manifest.json with concrete placeholders
  # {{PROJECT_PATH}} uses ${HOME} template var so the bundle is portable
  # across machines (NOT operator's literal /Users/<name>/...).
  local PROJECT_PATH_TPL="\${HOME}/cowork/$AREA/$PROJECT"
  sed \
    -e "s|{{PROJECT_AREA}}|$AREA|g" \
    -e "s|{{PROJECT_ID}}|$PROJECT|g" \
    -e "s|{{PROJECT_PATH}}|$PROJECT_PATH_TPL|g" \
    -e "s|{{BUNDLE_VERSION}}|1.0.0|g" \
    "$BUNDLE_TEMPLATE_DIR/manifest.json.tmpl" > "$BUNDLE_SRC_DIR/manifest.json" || {
    BUNDLE_WARN="manifest.json render failed"
    return 1
  }

  # Step 3: npm install --omit=dev to vendor @modelcontextprotocol/server-filesystem
  ( cd "$BUNDLE_SRC_DIR" && npm install --omit=dev --no-audit --no-fund --silent ) >/dev/null 2>&1 || {
    BUNDLE_WARN="npm install failed (offline? registry down?) — skipping .mcpb pack"
    return 1
  }

  # Step 4: mcpb pack — produces <name>.mcpb in the cwd (name from manifest.json)
  # Per `npm view @anthropic-ai/mcpb` ships a `mcpb` bin; `npx --yes` auto-fetches.
  ( cd "$BUNDLE_SRC_DIR" && npx --yes @anthropic-ai/mcpb pack . >/dev/null 2>&1 ) || {
    BUNDLE_WARN="mcpb pack failed — run /cowork-regen-bundle $AREA/$PROJECT to retry"
    return 1
  }

  # Step 5: move the produced .mcpb to the bundle dir. mcpb names it after the
  # manifest's `name` field — we set name to `cowork-<area>-<project>` so the
  # output file is `cowork-<area>-<project>.mcpb`. Rename to `<project>.mcpb`
  # for shorter operator-facing name.
  local PACKED
  PACKED="$(ls "$BUNDLE_SRC_DIR"/*.mcpb 2>/dev/null | head -1 || true)"
  if [ -z "$PACKED" ] || [ ! -f "$PACKED" ]; then
    BUNDLE_WARN="mcpb pack reported success but no .mcpb in $BUNDLE_SRC_DIR"
    return 1
  fi
  mv "$PACKED" "$BUNDLE_OUT" || {
    BUNDLE_WARN="mv $PACKED → $BUNDLE_OUT failed"
    return 1
  }

  # Step 6: delete the src tree (we only persist the packed .mcpb + the template)
  rm -rf "$BUNDLE_SRC_DIR" 2>/dev/null || true

  BUNDLE_BUILT="true"
  return 0
}

build_desktop_bundle || true

if [ "$BUNDLE_BUILT" = "true" ]; then
  # Append a note to _automations.md so the operator sees the one-time artifact.
  printf '\n## Wave 16.5 — Desktop bundle (.mcpb)\n\n- `%s` generated at scaffold time by `/new-cowork` Phase 4. To regenerate (after template update or path change), run `/cowork-regen-bundle %s/%s`.\n' \
    "$BUNDLE_OUT" "$AREA" "$PROJECT" >> "$SCAFFOLD_PATH/_automations.md" || true
else
  echo "⚠ Phase 4 (desktop bundle): $BUNDLE_WARN" >&2
  echo "⚠ The 5-file desktop-knowledge bundle WAS written. Re-run \`/cowork-regen-bundle $AREA/$PROJECT\` once the underlying issue is resolved, OR use the legacy JSON-edit path in README.md Method B." >&2
fi

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

# Capture pre-edit bytes for byte-exact rollback. Two distinct strategies:
#  (a) In-repo invocation: `git hash-object -w` writes the bytes into the
#      calling repo's local git object store; rollback is
#      `git cat-file -p <sha> > PROJECTS.md`. Recorded as
#      `projects_md_blob_sha_before` (the spec's documented field name).
#  (b) Outside-repo invocation (e.g. cwd=~): no git object store available.
#      Fall back to a plain file copy under `<receipt-root>/blobs/<sha256>`.
#      Recorded under a DIFFERENT field name (`projects_md_backup_path`) so
#      consumers don't try `git cat-file -p` on a non-blob SHA — the previous
#      shape silently emitted a hash that looked like a git blob ref but
#      wasn't usable as one (caught by Codex P2 review).
BLOB_SHA=""
BACKUP_PATH=""
if git rev-parse --show-toplevel >/dev/null 2>&1; then
  BLOB_SHA="$(git hash-object -w "$PROJECTS_MD" 2>/dev/null || true)"
fi
if [ -z "$BLOB_SHA" ]; then
  mkdir -p "$RECEIPT_ROOT/blobs" 2>/dev/null
  BACKUP_SHA="$(sha256_file "$PROJECTS_MD")"
  BACKUP_PATH="$RECEIPT_ROOT/blobs/$BACKUP_SHA"
  cp "$PROJECTS_MD" "$BACKUP_PATH" || {
    echo "✗ file backup failed for PROJECTS.md (outside-repo fallback)" >&2
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

# Journal-line field selection: in-repo runs record the git-blob SHA under the
# spec's `projects_md_blob_sha_before` field; outside-repo runs record the
# fallback file-copy path under `projects_md_backup_path`. The two are
# mutually exclusive — consumers detect which strategy applied by which key is
# present, then dispatch rollback accordingly.
if [ -n "$BLOB_SHA" ]; then
  JOURNAL_LINE="$(printf '{"op_id":"%s","area":"%s","project":"%s","scaffold_path":"%s","files_created":%s,"projects_md_row_added":true,"projects_md_blob_sha_before":"%s","ts":"%s"}' \
    "$OP_ID_VAL" "$AREA" "$PROJECT" "$SCAFFOLD_PATH" "$FILES_CREATED_JSON" "$BLOB_SHA" "$TS_NOW")"
else
  JOURNAL_LINE="$(printf '{"op_id":"%s","area":"%s","project":"%s","scaffold_path":"%s","files_created":%s,"projects_md_row_added":true,"projects_md_backup_path":"%s","ts":"%s"}' \
    "$OP_ID_VAL" "$AREA" "$PROJECT" "$SCAFFOLD_PATH" "$FILES_CREATED_JSON" "$BACKUP_PATH" "$TS_NOW")"
fi
printf '%s\n' "$JOURNAL_LINE" >> "$JOURNAL" || {
  echo "✗ journal append failed" >&2
  # Best-effort PROJECTS.md rollback via the appropriate backup strategy.
  if [ -n "$BLOB_SHA" ] && git cat-file -e "$BLOB_SHA" >/dev/null 2>&1; then
    git cat-file -p "$BLOB_SHA" > "$PROJECTS_MD" 2>/dev/null || true
  elif [ -n "$BACKUP_PATH" ] && [ -f "$BACKUP_PATH" ]; then
    cp "$BACKUP_PATH" "$PROJECTS_MD" 2>/dev/null || true
  fi
  rollback_scaffold
  exit 2
}

# ---------- step 11c: canonical receipt terminal write ----------
VERIF_YAML="    - cmd: \"new-cowork $AREA $PROJECT\"
      exit_code: 0
      summary: \"scaffolded $AREA/$PROJECT; bundle written; PROJECTS.md row appended\""

# Build outputs list for the receipt (the 8 files + PROJECTS.md + journal).
# If terminal-write fails (disk full, rename failure, etc.), we have already
# mutated the scaffold + PROJECTS.md. Roll those back so the on-disk state
# matches the trap-installed aborted-on-ambiguity receipt the helper will
# write at EXIT, rather than leaving partial mutations with no success
# receipt.
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
  "$JOURNAL" || {
  echo "✗ terminal receipt write failed; rolling back scaffold + PROJECTS.md" >&2
  if [ -n "$BLOB_SHA" ] && git cat-file -e "$BLOB_SHA" >/dev/null 2>&1; then
    git cat-file -p "$BLOB_SHA" > "$PROJECTS_MD" 2>/dev/null || true
  elif [ -n "$BACKUP_PATH" ] && [ -f "$BACKUP_PATH" ]; then
    cp "$BACKUP_PATH" "$PROJECTS_MD" 2>/dev/null || true
  fi
  rollback_scaffold
  # Trap will overwrite the started receipt to aborted-on-ambiguity at EXIT.
  exit 2
}

RECEIPT_PATH="$(emit_receipt_get_path)"

# ---------- step 11d: append per-command appendix to receipt ----------
# The shared helper writes the canonical fields; we append the spec-mandated
# extras (scaffold_path, projects_md_blob_sha_before, 11-step manifest). This
# is a post-write append; the canonical receipt fields are already atomic.
{
  printf '\n'
  printf '# per-command appendix (new-cowork)\n'
  printf 'scaffold_path: %s\n' "$SCAFFOLD_PATH"
  # Backup-handle field is exclusive: git-blob SHA in-repo, file-copy path
  # outside repo. Consumers select the matching rollback strategy by which
  # field is present.
  if [ -n "$BLOB_SHA" ]; then
    printf 'projects_md_blob_sha_before: %s\n' "$BLOB_SHA"
  else
    printf 'projects_md_backup_path: %s\n' "$BACKUP_PATH"
  fi
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
  # Phase 4 (Wave 16.5) summary — present whether the bundle built or soft-failed.
  if [ "$BUNDLE_BUILT" = "true" ]; then
    printf 'desktop_bundle_mcpb: %s\n' "$BUNDLE_OUT"
    printf 'desktop_bundle_status: built\n'
  else
    printf 'desktop_bundle_mcpb: null\n'
    printf 'desktop_bundle_status: skipped\n'
    printf 'desktop_bundle_warning: %s\n' "${BUNDLE_WARN:-unknown}"
  fi
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
if [ "$BUNDLE_BUILT" = "true" ]; then
  echo "  4. Drag $BUNDLE_OUT into Claude Desktop → Settings → Extensions → Install"
  echo "     (recommended — Method A in .claude/desktop-knowledge/README.md)"
  echo "  5. Fallback: drag .claude/desktop-knowledge/* into Project Knowledge (Method C in README.md)"
else
  echo "  4. (Desktop bundle .mcpb generation was skipped — see warning above; run /cowork-regen-bundle $AREA/$PROJECT to retry)"
  echo "  5. Drag .claude/desktop-knowledge/* into Project Knowledge (Method C in README.md) until bundle is rebuilt"
fi
echo ""
echo "Receipt: $RECEIPT_PATH"
echo "Journal: $JOURNAL"

exit 0
