#!/usr/bin/env bash
# emit-receipt.sh — shared receipt-emission helper for Wave-1 protocol commands.
#
# Implements the §3.0a reserve-then-mutate lifecycle from
# docs/specs/2026-05-01-claude-adapter-alignment.md and the canonical
# idempotency_key + operation_id derivation from
# docs/protocol/receipt-schema.md.
#
# Sourced by skills/run-wave/SKILL.md, skills/close-wave/SKILL.md,
# skills/commit/SKILL.md. Each command sources this file then calls the
# public functions in order:
#
#     source "$HARNESS_REPO/skills/_shared/lib/emit-receipt.sh"
#     emit_receipt_init <command> <wave_id_or_spec_path_or_dash> <input1> <input2> ...
#     emit_receipt_preflight              # aborts non-zero on .harness-state/ unwritable; checks Stage A no-op
#     emit_receipt_started                # writes status: started receipt + installs trap
#     # ... command does its work ...
#     emit_receipt_terminal success "<verification_results_yaml>" "<output1>" "<output2>" ...
#     # OR on partial / aborted-on-ambiguity / failed:
#     emit_receipt_terminal partial "<verification_results_yaml>" "<output1>" ...
#
# Public functions:
#   emit_receipt_init <command> <wave_or_spec> <input...>
#   emit_receipt_preflight                          # → may exit 0 (no-op'd via Stage A) or signal proceed
#   emit_receipt_started
#   emit_receipt_terminal <status> <verification_yaml> <output...>
#   emit_receipt_compute_idempotency_key            # returns hex string on stdout
#   emit_receipt_compute_operation_id               # returns hex string on stdout
#
# Bash 3.2 compatibility (macOS default shell): no associative arrays — uses
# eval + dynamic var names per `reference_bash_compat_patterns`. SHA-256 via
# `sha256sum` if available, else `shasum -a 256`. Portable trap EXIT.
#
# Test hooks (NOT for production):
#   EMIT_RECEIPT_TEST_PIN_TIMESTAMP        — pin started_at/completed_at
#   EMIT_RECEIPT_TEST_FORCE_TERMINAL_FAIL  — force terminal-write to fail
#                                            (covers .recovery-needed marker path)
#   EMIT_RECEIPT_TEST_HARNESS_STATE_DIR    — override .harness-state/ resolution
#                                            (per-fixture isolation)

set -uo pipefail

# -----------------------------------------------------------------------------
# Internal state — uses dynamic vars instead of associative arrays.
# -----------------------------------------------------------------------------

EMIT_RECEIPT__COMMAND=""
EMIT_RECEIPT__WAVE_OR_SPEC=""           # wave_id, spec_path, or literal "-"
EMIT_RECEIPT__SPEC_PATH=""              # repo-relative spec path (set via emit_receipt_set_spec_path)
EMIT_RECEIPT__WAVE_ID_OVERRIDE=""       # numeric wave_id for /commit advancing plan.md (set via emit_receipt_set_wave_id)
EMIT_RECEIPT__MERGE_SHA=""              # populated by close-wave callers via emit_receipt_set_merge_sha
EMIT_RECEIPT__INPUTS=()                 # array of input paths (sorted at started-write time)
EMIT_RECEIPT__OUTPUTS=()                # array of output paths (populated at terminal-write)
EMIT_RECEIPT__RECEIPT_PATH=""           # full path to .harness-state/<command>-<slug>-<ts>.yml
EMIT_RECEIPT__RECEIPT_ID=""
EMIT_RECEIPT__OPERATION_ID=""
EMIT_RECEIPT__IDEMPOTENCY_KEY=""        # outer SHA-256
EMIT_RECEIPT__INPUT_CONTENT_DIGEST=""   # inner SHA-256 (over sorted_inputs)
EMIT_RECEIPT__SORTED_INPUTS=()          # array of "<path>:<digest>" strings, lex-sorted
EMIT_RECEIPT__STARTED_AT=""
EMIT_RECEIPT__RETRY_OF=""               # set by Stage B when prior partial/aborted matches
EMIT_RECEIPT__TRAP_INSTALLED=0
EMIT_RECEIPT__TERMINAL_WRITTEN=0
EMIT_RECEIPT__HARNESS_STATE_DIR=""

# -----------------------------------------------------------------------------
# SHA-256 utility selection (bash 3.2 compatible).
# -----------------------------------------------------------------------------

if command -v sha256sum >/dev/null 2>&1; then
  emit_receipt_sha256() { sha256sum | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  emit_receipt_sha256() { shasum -a 256 | awk '{print $1}'; }
else
  echo "✗ emit-receipt.sh: neither sha256sum nor shasum is available" >&2
  return 1 2>/dev/null || exit 1
fi

emit_receipt_sha256_of_string() {
  printf '%s' "$1" | emit_receipt_sha256
}

emit_receipt_sha256_of_file() {
  if [[ -f "$1" ]]; then
    emit_receipt_sha256 < "$1"
  else
    printf 'MISSING'
  fi
}

# -----------------------------------------------------------------------------
# emit_receipt_init <command> <wave_or_spec> <input1> <input2> ...
#
# Records command, wave/spec key, and inputs. Resolves .harness-state/ dir.
# Computes operation_id immediately (deterministic from command + wave_or_spec
# only). Computes idempotency_key after sorting inputs and hashing each file's
# raw bytes per docs/protocol/receipt-schema.md.
# -----------------------------------------------------------------------------
emit_receipt_init() {
  if [[ $# -lt 2 ]]; then
    echo "✗ emit_receipt_init: requires <command> <wave_or_spec> [<inputs>...]" >&2
    return 2
  fi

  EMIT_RECEIPT__COMMAND="$1"
  EMIT_RECEIPT__WAVE_OR_SPEC="$2"
  shift 2
  EMIT_RECEIPT__INPUTS=()
  while [[ $# -gt 0 ]]; do
    EMIT_RECEIPT__INPUTS+=("$1")
    shift
  done
  # Reset per-init optional fields. Callers that need them invoke the
  # public setters after emit_receipt_init returns.
  EMIT_RECEIPT__SPEC_PATH=""
  EMIT_RECEIPT__WAVE_ID_OVERRIDE=""
  EMIT_RECEIPT__MERGE_SHA=""
  EMIT_RECEIPT__RETRY_OF=""
  EMIT_RECEIPT__TERMINAL_WRITTEN=0

  # Resolve .harness-state/ directory (test hook overrides repo root).
  if [[ -n "${EMIT_RECEIPT_TEST_HARNESS_STATE_DIR:-}" ]]; then
    EMIT_RECEIPT__HARNESS_STATE_DIR="$EMIT_RECEIPT_TEST_HARNESS_STATE_DIR"
  else
    local repo_root
    repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
    EMIT_RECEIPT__HARNESS_STATE_DIR="$repo_root/.harness-state"
  fi

  # Compute operation_id per §3.0 / docs/protocol/receipt-schema.md:
  # operation_id = sha256_hex("<command>\n<wave_id-or-spec_path-or-'-'>")
  EMIT_RECEIPT__OPERATION_ID="$(emit_receipt_sha256_of_string \
    "$(printf '%s\n%s' "$EMIT_RECEIPT__COMMAND" "$EMIT_RECEIPT__WAVE_OR_SPEC")")"

  # Compute sorted_inputs ("<path>:<digest>" lexicographic by path).
  EMIT_RECEIPT__SORTED_INPUTS=()
  if [[ ${#EMIT_RECEIPT__INPUTS[@]} -gt 0 ]]; then
    local tmp
    tmp="$(mktemp)" || return 1
    local p digest
    for p in "${EMIT_RECEIPT__INPUTS[@]}"; do
      digest="$(emit_receipt_sha256_of_file "$p")"
      printf '%s:%s\n' "$p" "$digest" >> "$tmp"
    done
    # Lex-sort by full "<path>:<digest>" line; path-prefix means this is path-sorted.
    local sorted
    sorted="$(LC_ALL=C sort "$tmp")"
    rm -f "$tmp"
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      EMIT_RECEIPT__SORTED_INPUTS+=("$line")
    done <<< "$sorted"
  fi

  # Compute input_content_digest = sha256(joined sorted_inputs lines, LF-separated).
  local joined=""
  local first=1
  local entry
  for entry in "${EMIT_RECEIPT__SORTED_INPUTS[@]}"; do
    if [[ "$first" -eq 1 ]]; then
      joined="$entry"
      first=0
    else
      joined="$joined"$'\n'"$entry"
    fi
  done
  if [[ -z "$joined" ]]; then
    EMIT_RECEIPT__INPUT_CONTENT_DIGEST="$(emit_receipt_sha256_of_string '')"
  else
    EMIT_RECEIPT__INPUT_CONTENT_DIGEST="$(emit_receipt_sha256_of_string "$joined")"
  fi

  # Compute outer idempotency_key = sha256("<command>\n<wave_or_spec>\n<input_content_digest>").
  EMIT_RECEIPT__IDEMPOTENCY_KEY="$(emit_receipt_sha256_of_string \
    "$(printf '%s\n%s\n%s' "$EMIT_RECEIPT__COMMAND" \
                            "$EMIT_RECEIPT__WAVE_OR_SPEC" \
                            "$EMIT_RECEIPT__INPUT_CONTENT_DIGEST")")"

  return 0
}

# -----------------------------------------------------------------------------
# emit_receipt_preflight
#
# 1. Verifies $EMIT_RECEIPT__HARNESS_STATE_DIR exists, is a directory, is writable.
#    Probe write+delete; abort with non-zero exit if not.
# 2. Stage A: scans for status=success AND idempotency_key.value == current.
#    If hit → prints existing receipt path, exits 0 from caller via emit_receipt_no_op.
# 3. Stage B: scans for status ∈ {partial, aborted-on-ambiguity} AND
#    operation_id matching. Sets EMIT_RECEIPT__RETRY_OF on hit.
#
# Outputs to stdout exactly one of:
#     PROCEED               — caller continues with started-receipt write
#     NOOP <path>           — caller short-circuits (Stage A success match)
# Returns:
#     0  — proceed or noop (caller must check stdout)
#     2  — preflight abort (.harness-state/ unwritable)
# -----------------------------------------------------------------------------
emit_receipt_preflight() {
  local dir="$EMIT_RECEIPT__HARNESS_STATE_DIR"

  # 1. Preflight: dir exists, is a directory, is writable.
  if [[ ! -e "$dir" ]]; then
    if ! mkdir -p "$dir" 2>/dev/null; then
      echo "✗ emit-receipt: cannot create .harness-state/ at $dir" >&2
      return 2
    fi
  fi
  if [[ ! -d "$dir" ]]; then
    echo "✗ emit-receipt: $dir exists but is not a directory" >&2
    return 2
  fi
  local probe="$dir/.emit-receipt-probe.$$"
  if ! ( : > "$probe" ) 2>/dev/null; then
    echo "✗ emit-receipt: $dir is not writable (preflight probe failed)" >&2
    return 2
  fi
  rm -f "$probe" 2>/dev/null || true

  # 2. Stage A — success no-op via idempotency_key match.
  local existing
  existing="$(emit_receipt__find_success_match "$dir" \
    "$EMIT_RECEIPT__IDEMPOTENCY_KEY")"
  if [[ -n "$existing" ]]; then
    printf 'NOOP %s\n' "$existing"
    return 0
  fi

  # Stage B + orphan-started lookup (§3.0a / §Phase 5) — note these run in
  # this subshell when callers do `PREFLIGHT="$(emit_receipt_preflight)"`,
  # so any RETRY_OF assignment here would be discarded. Persist the result
  # by writing it to a sidecar file under .harness-state/ keyed on
  # operation_id; emit_receipt_started reads it back in the caller's shell.
  local sidecar
  sidecar="$dir/.emit-receipt-retry-of.$$"
  : > "$sidecar" 2>/dev/null || true

  local prior
  prior="$(emit_receipt__find_partial_match "$dir" \
    "$EMIT_RECEIPT__OPERATION_ID")"
  if [[ -n "$prior" ]]; then
    emit_receipt__extract_yaml_field "$prior" receipt_id > "$sidecar" 2>/dev/null
  else
    # 3b. Orphan-started 60-minute recovery rule (spec §Phase 5).
    # When SIGKILL or host crash prevents the trap from rewriting a `started`
    # receipt, the next run finds it stuck at status=started. Per the spec
    # rule, an orphan `started` receipt older than 60 minutes is treated as
    # `aborted-on-ambiguity` for `retry_of` chaining purposes (resumable,
    # schema-aligned). This runs only when Stage B above didn't already
    # match — a fresh partial/aborted is preferred over an old started orphan.
    local orphan
    orphan="$(emit_receipt__find_orphan_started "$dir" \
      "$EMIT_RECEIPT__OPERATION_ID")"
    if [[ -n "$orphan" ]]; then
      emit_receipt__extract_yaml_field "$orphan" receipt_id > "$sidecar" 2>/dev/null
    fi
  fi

  printf 'PROCEED\n'
  return 0
}

# -----------------------------------------------------------------------------
# Sidecar reader — invoked by emit_receipt_started in the caller's shell to
# pick up RETRY_OF computed during the preflight subshell. The sidecar file
# is written by emit_receipt_preflight under $HARNESS_STATE_DIR keyed on PID.
# -----------------------------------------------------------------------------
emit_receipt__load_retry_of_sidecar() {
  local sidecar="$EMIT_RECEIPT__HARNESS_STATE_DIR/.emit-receipt-retry-of.$$"
  if [[ -f "$sidecar" ]]; then
    local val
    val="$(head -1 "$sidecar" 2>/dev/null)"
    val="${val%$'\n'}"
    if [[ -n "$val" ]]; then
      EMIT_RECEIPT__RETRY_OF="$val"
    fi
    rm -f "$sidecar" 2>/dev/null || true
  fi
}

# -----------------------------------------------------------------------------
# Orphan-started scanner (spec §Phase 5 — 60-minute recovery rule).
# Returns the most-recent matching `started` receipt whose mtime is older
# than 60 minutes AND whose operation_id matches the current invocation.
# Bash 3.2 compatible: uses stat -f / stat -c fallback for portability.
# -----------------------------------------------------------------------------
emit_receipt__find_orphan_started() {
  local dir="$1" opid="$2"
  local now cutoff_seconds=3600
  if [[ -n "${EMIT_RECEIPT_TEST_ORPHAN_CUTOFF_SECONDS:-}" ]]; then
    cutoff_seconds="$EMIT_RECEIPT_TEST_ORPHAN_CUTOFF_SECONDS"
  fi
  now="$(date -u +%s)"
  local newest_match=""
  local newest_mtime=0
  local f
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    [[ -f "$f" ]] || continue
    local rstatus
    rstatus="$(emit_receipt__extract_yaml_field "$f" status)"
    [[ "$rstatus" == "started" ]] || continue
    local rop
    rop="$(emit_receipt__extract_yaml_field "$f" operation_id)"
    [[ "$rop" == "$opid" ]] || continue
    local m
    m="$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0)"
    local age=$(( now - m ))
    if [[ "$age" -lt "$cutoff_seconds" ]]; then
      continue   # not yet aged out — leave for the live process to finish
    fi
    if [[ "$m" -gt "$newest_mtime" ]]; then
      newest_mtime="$m"
      newest_match="$f"
    fi
  done < <(find "$dir" -maxdepth 1 -type f -name '*.yml' 2>/dev/null)
  printf '%s' "$newest_match"
}

# -----------------------------------------------------------------------------
# Stage A scanner — find a success receipt with matching idempotency_key.value.
# Failed receipts are NEVER eligible for success-no-op (terminal per schema).
# -----------------------------------------------------------------------------
emit_receipt__find_success_match() {
  local dir="$1" key="$2"
  local f
  # bash 3.2 portable: use `find` instead of `shopt -s nullglob` + globs.
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    [[ -f "$f" ]] || continue
    local rstatus
    rstatus="$(emit_receipt__extract_yaml_field "$f" status)"
    [[ "$rstatus" == "success" ]] || continue
    local rkey
    rkey="$(emit_receipt__extract_idempotency_key_value "$f")"
    if [[ "$rkey" == "$key" ]]; then
      printf '%s' "$f"
      return 0
    fi
  done < <(find "$dir" -maxdepth 1 -type f -name '*.yml' 2>/dev/null)
  printf ''
}

# -----------------------------------------------------------------------------
# Stage B scanner — find a partial / aborted-on-ambiguity receipt with matching
# operation_id. `failed` is intentionally excluded (terminal per schema; not
# Stage-B-resumable). Returns most-recent matching path on stdout (lex order
# falls back to file modification time as tiebreaker).
# -----------------------------------------------------------------------------
emit_receipt__find_partial_match() {
  local dir="$1" opid="$2"
  local newest_match=""
  local newest_mtime=0
  local f
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    [[ -f "$f" ]] || continue
    local rstatus
    rstatus="$(emit_receipt__extract_yaml_field "$f" status)"
    case "$rstatus" in
      partial|aborted-on-ambiguity) ;;
      *) continue ;;
    esac
    local rop
    rop="$(emit_receipt__extract_yaml_field "$f" operation_id)"
    if [[ "$rop" == "$opid" ]]; then
      # Use mtime via stat; portable across macOS/Linux via two attempts.
      local m
      m="$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0)"
      if [[ "$m" -gt "$newest_mtime" ]]; then
        newest_mtime="$m"
        newest_match="$f"
      fi
    fi
  done < <(find "$dir" -maxdepth 1 -type f -name '*.yml' 2>/dev/null)
  printf '%s' "$newest_match"
}

# -----------------------------------------------------------------------------
# Tiny YAML extractor — top-level scalar fields ONLY. No nested lookups.
# Strips inline comments + leading/trailing whitespace + surrounding quotes.
# Used for status, operation_id, receipt_id.
# -----------------------------------------------------------------------------
emit_receipt__extract_yaml_field() {
  local file="$1" field="$2"
  awk -v f="$field" '
    BEGIN { found=0 }
    /^[[:space:]]/ { next }                      # skip indented (nested) lines
    $0 ~ "^"f":" {
      sub("^"f":[[:space:]]*", "")
      sub("[[:space:]]*$", "")
      gsub(/^"|"$/, "")
      print
      found=1
      exit
    }
  ' "$file"
}

# -----------------------------------------------------------------------------
# Extract idempotency_key.value (nested under idempotency_key:).
# Mirrors the parser in .harness-state/examples/recompute-keys.sh.
# -----------------------------------------------------------------------------
emit_receipt__extract_idempotency_key_value() {
  local file="$1"
  awk '
    /^idempotency_key:/ { in_ik=1; next }
    in_ik && /^[[:alnum:]_]+:/ && !/^idempotency_key:/ { in_ik=0 }
    in_ik && /^  value:/ {
      sub("^  value:[[:space:]]*", "")
      sub("[[:space:]]*$", "")
      gsub(/^"|"$/, "")
      print
      exit
    }
  ' "$file"
}

# -----------------------------------------------------------------------------
# Slug helper — squashes a wave/spec key into a path-safe slug.
# -----------------------------------------------------------------------------
emit_receipt__slug() {
  local raw="$1"
  if [[ "$raw" == "-" || -z "$raw" ]]; then
    printf 'noop'
    return
  fi
  # Strip docs/specs/ prefix and .md suffix; replace path separators with dashes.
  local slug="$raw"
  slug="${slug#docs/specs/}"
  slug="${slug%.md}"
  slug="${slug//\//-}"
  slug="${slug//[^A-Za-z0-9._-]/-}"
  printf '%s' "$slug"
}

# -----------------------------------------------------------------------------
# emit_receipt_started
#
# Writes the started receipt to .harness-state/<command>-<slug>-<ts>.yml.
# Installs trap EXIT to cover signals/abnormal-termination by atomically
# rewriting the receipt as `aborted-on-ambiguity` if status is still `started`.
#
# trap EXIT logic:
#   - signal exits / orchestrator-ambiguity-stop → status: aborted-on-ambiguity
#     (Stage-B-resumable per schema; the safe default when cause is unclear)
#   - clean non-zero exits from underlying command → status: failed
#     (terminal per schema; NOT Stage-B-resumable)
# The cause is passed via the EMIT_RECEIPT__TRAP_CAUSE env var (set by callers
# before exit when they know the cause); default is "aborted-on-ambiguity".
# -----------------------------------------------------------------------------
emit_receipt_started() {
  # Pick up RETRY_OF from the preflight sidecar (preflight runs in a subshell
  # via $(...), so its var assignments don't survive — see Stage B comment).
  emit_receipt__load_retry_of_sidecar

  local ts
  if [[ -n "${EMIT_RECEIPT_TEST_PIN_TIMESTAMP:-}" ]]; then
    ts="$EMIT_RECEIPT_TEST_PIN_TIMESTAMP"
  else
    ts="$(date -u '+%Y-%m-%dT%H%M%SZ')"
  fi
  EMIT_RECEIPT__STARTED_AT="$ts"

  local slug
  slug="$(emit_receipt__slug "$EMIT_RECEIPT__WAVE_OR_SPEC")"
  local base_id="$EMIT_RECEIPT__COMMAND-$slug-$ts"
  EMIT_RECEIPT__RECEIPT_ID="$base_id"
  EMIT_RECEIPT__RECEIPT_PATH="$EMIT_RECEIPT__HARNESS_STATE_DIR/$EMIT_RECEIPT__RECEIPT_ID.yml"

  # MAJOR 1 fix: reserve the receipt path with an EXCLUSIVE-CREATE first
  # (`set -C; : > "$path"`). If two same-second concurrent invocations land
  # on the same path, the second one gets EEXIST and we bump the receipt_id
  # suffix `-2`, `-3`, ... up to a small bound. This prevents `mv -f` in
  # emit_receipt__write_atomic from silently clobbering a peer receipt.
  # Bash 3.2 compatible (`set -C` is POSIX).
  local n=1 reserved=0
  while [[ "$n" -le 32 ]]; do
    if ( set -C; : > "$EMIT_RECEIPT__RECEIPT_PATH" ) 2>/dev/null; then
      reserved=1
      break
    fi
    n=$((n + 1))
    EMIT_RECEIPT__RECEIPT_ID="$base_id-$n"
    EMIT_RECEIPT__RECEIPT_PATH="$EMIT_RECEIPT__HARNESS_STATE_DIR/$EMIT_RECEIPT__RECEIPT_ID.yml"
  done
  if [[ "$reserved" -ne 1 ]]; then
    echo "✗ emit-receipt: receipt-path reservation exhausted 32 retries at $base_id" >&2
    return 1
  fi
  # Reservation succeeded. Now write the started YAML via the atomic helper;
  # the empty placeholder file we just created is overwritten by mv -f.
  emit_receipt__write_atomic "$EMIT_RECEIPT__RECEIPT_PATH" started "" || return 1

  if [[ "$EMIT_RECEIPT__TRAP_INSTALLED" -ne 1 ]]; then
    # Save any prior trap so we don't clobber callers; this is the simple form
    # — real callers can install a richer trap before sourcing this file.
    trap 'emit_receipt__trap_handler' EXIT
    EMIT_RECEIPT__TRAP_INSTALLED=1
  fi

  return 0
}

emit_receipt__trap_handler() {
  local rc=$?
  if [[ "$EMIT_RECEIPT__TERMINAL_WRITTEN" -eq 1 ]]; then
    return $rc
  fi
  if [[ -z "$EMIT_RECEIPT__RECEIPT_PATH" || ! -f "$EMIT_RECEIPT__RECEIPT_PATH" ]]; then
    return $rc
  fi
  # Decide terminal status: explicit cause via EMIT_RECEIPT__TRAP_CAUSE,
  # else default to aborted-on-ambiguity (signal default per §3.0a).
  local cause="${EMIT_RECEIPT__TRAP_CAUSE:-aborted-on-ambiguity}"
  case "$cause" in
    failed|aborted-on-ambiguity|partial) ;;
    *) cause="aborted-on-ambiguity" ;;
  esac
  emit_receipt__write_atomic "$EMIT_RECEIPT__RECEIPT_PATH" "$cause" \
    "  - cmd: \"trap-handler\"
    exit_code: $rc
    summary: \"caught $cause via EXIT trap\"" || \
    emit_receipt__write_recovery_marker
  return $rc
}

emit_receipt__write_recovery_marker() {
  local marker="$EMIT_RECEIPT__RECEIPT_PATH.recovery-needed"
  printf '%s — terminal-write failed; receipt at %s needs manual rewrite\n' \
    "$EMIT_RECEIPT__RECEIPT_ID" "$EMIT_RECEIPT__RECEIPT_PATH" \
    > "$marker" 2>/dev/null || true
}

# -----------------------------------------------------------------------------
# emit_receipt_terminal <status> <verification_results_yaml> <output1> <output2> ...
#
# <status> ∈ {success, partial, failed, aborted-on-ambiguity}.
# <verification_results_yaml> is YAML for the verification.results list (the
# block under "results:"); pass empty string for read-only commands.
# Outputs are appended to the outputs list.
#
# Atomic rewrite: write to <path>.tmp then mv -f.
# -----------------------------------------------------------------------------
emit_receipt_terminal() {
  if [[ $# -lt 1 ]]; then
    echo "✗ emit_receipt_terminal: requires <status> [verification_yaml] [outputs...]" >&2
    return 2
  fi
  local status="$1"
  local verification_yaml="${2:-}"
  shift
  [[ $# -gt 0 ]] && shift
  EMIT_RECEIPT__OUTPUTS=()
  while [[ $# -gt 0 ]]; do
    EMIT_RECEIPT__OUTPUTS+=("$1")
    shift
  done

  case "$status" in
    success|partial|failed|aborted-on-ambiguity) ;;
    *)
      echo "✗ emit_receipt_terminal: invalid status '$status'" >&2
      return 2
      ;;
  esac

  emit_receipt__write_atomic "$EMIT_RECEIPT__RECEIPT_PATH" "$status" \
    "$verification_yaml" || {
      emit_receipt__write_recovery_marker
      return 1
    }

  EMIT_RECEIPT__TERMINAL_WRITTEN=1
  return 0
}

# -----------------------------------------------------------------------------
# Internal: write receipt YAML atomically (tmp + mv -f).
#
# Test hook EMIT_RECEIPT_TEST_FORCE_TERMINAL_FAIL forces the rename to fail
# (covers the .recovery-needed marker fixture). Started-receipt writes are
# NOT covered by the hook.
# -----------------------------------------------------------------------------
emit_receipt__write_atomic() {
  local path="$1" rstatus="$2" verification_yaml="$3"
  local tmp="$path.tmp"

  {
    printf 'receipt_id: %s\n' "$EMIT_RECEIPT__RECEIPT_ID"
    printf 'command: %s\n' "$EMIT_RECEIPT__COMMAND"
    printf 'adapter: claude-code\n'
    case "$EMIT_RECEIPT__COMMAND" in
      run-wave|close-wave)
        # wave_id slot is the wave number for run-wave/close-wave.
        printf 'wave_id: "%s"\n' "$EMIT_RECEIPT__WAVE_OR_SPEC"
        ;;
      commit)
        # wave_id is numeric string when the commit advances a plan.md row
        # (caller passed it via emit_receipt_set_wave_id), else null.
        if [[ -n "$EMIT_RECEIPT__WAVE_ID_OVERRIDE" ]]; then
          printf 'wave_id: "%s"\n' "$EMIT_RECEIPT__WAVE_ID_OVERRIDE"
        else
          printf 'wave_id: null\n'
        fi
        ;;
    esac
    # spec_path: required for spec-related commands per spec §3 data model.
    # Sourced from emit_receipt_set_spec_path (run-wave / close-wave / commit
    # advancing plan.md). Falls back to wave_or_spec when that slot itself is
    # already a docs/specs/ path (back-compat for any caller that hasn't
    # adopted the setter yet).
    if [[ -n "$EMIT_RECEIPT__SPEC_PATH" ]]; then
      printf 'spec_path: %s\n' "$EMIT_RECEIPT__SPEC_PATH"
    elif [[ "$EMIT_RECEIPT__WAVE_OR_SPEC" =~ ^docs/specs/ ]]; then
      printf 'spec_path: %s\n' "$EMIT_RECEIPT__WAVE_OR_SPEC"
    fi
    printf 'inputs:\n'
    if [[ ${#EMIT_RECEIPT__INPUTS[@]} -eq 0 ]]; then
      printf '  []\n'
    else
      local p
      for p in "${EMIT_RECEIPT__INPUTS[@]}"; do
        printf '  - %s\n' "$p"
      done
    fi
    printf 'outputs:\n'
    if [[ ${#EMIT_RECEIPT__OUTPUTS[@]} -eq 0 ]]; then
      printf '  []\n'
    else
      local o
      for o in "${EMIT_RECEIPT__OUTPUTS[@]}"; do
        printf '  - %s\n' "$o"
      done
    fi
    printf 'verification:\n'
    printf '  commands: []\n'
    printf '  results:\n'
    if [[ -z "$verification_yaml" ]]; then
      printf '    []\n'
    else
      printf '%s\n' "$verification_yaml"
    fi
    printf 'started_at: "%s"\n' "$EMIT_RECEIPT__STARTED_AT"
    if [[ "$rstatus" == "success" ]]; then
      local completed_ts
      if [[ -n "${EMIT_RECEIPT_TEST_PIN_TIMESTAMP:-}" ]]; then
        completed_ts="$EMIT_RECEIPT_TEST_PIN_TIMESTAMP"
      else
        completed_ts="$(date -u '+%Y-%m-%dT%H%M%SZ')"
      fi
      printf 'completed_at: "%s"\n' "$completed_ts"
    fi
    printf 'status: %s\n' "$rstatus"
    # merge_sha: emitted as part of the SAME atomic write when caller has
    # set it via emit_receipt_set_merge_sha (close-wave success path). Per
    # spec §3.0a the merge_sha must be present in the single terminal-write
    # YAML; appending later with `>>` would violate atomicity.
    if [[ -n "$EMIT_RECEIPT__MERGE_SHA" && "$rstatus" == "success" ]]; then
      printf 'merge_sha: %s\n' "$EMIT_RECEIPT__MERGE_SHA"
    fi
    printf 'operation_id: %s\n' "$EMIT_RECEIPT__OPERATION_ID"
    printf 'idempotency_key:\n'
    printf '  value: %s\n' "$EMIT_RECEIPT__IDEMPOTENCY_KEY"
    printf '  trace:\n'
    printf '    command: %s\n' "$EMIT_RECEIPT__COMMAND"
    printf '    wave_id_or_spec_path: "%s"\n' "$EMIT_RECEIPT__WAVE_OR_SPEC"
    printf '    sorted_inputs:\n'
    if [[ ${#EMIT_RECEIPT__SORTED_INPUTS[@]} -eq 0 ]]; then
      printf '      []\n'
    else
      local entry
      for entry in "${EMIT_RECEIPT__SORTED_INPUTS[@]}"; do
        printf '      - "%s"\n' "$entry"
      done
    fi
    printf '    input_content_digest: %s\n' "$EMIT_RECEIPT__INPUT_CONTENT_DIGEST"
    if [[ -n "$EMIT_RECEIPT__RETRY_OF" ]]; then
      printf 'retry_of: %s\n' "$EMIT_RECEIPT__RETRY_OF"
    fi
  } > "$tmp" 2>/dev/null || return 1

  if [[ -n "${EMIT_RECEIPT_TEST_FORCE_TERMINAL_FAIL:-}" && "$rstatus" != "started" ]]; then
    rm -f "$tmp" 2>/dev/null
    return 1
  fi

  mv -f "$tmp" "$path" 2>/dev/null || return 1
  return 0
}

# -----------------------------------------------------------------------------
# Public introspection helpers — used by callers' verification blocks.
# -----------------------------------------------------------------------------
emit_receipt_compute_idempotency_key() { printf '%s' "$EMIT_RECEIPT__IDEMPOTENCY_KEY"; }
emit_receipt_compute_operation_id()    { printf '%s' "$EMIT_RECEIPT__OPERATION_ID"; }
emit_receipt_get_path()                { printf '%s' "$EMIT_RECEIPT__RECEIPT_PATH"; }
emit_receipt_get_retry_of()            { printf '%s' "$EMIT_RECEIPT__RETRY_OF"; }

# -----------------------------------------------------------------------------
# Public setters — invoked between emit_receipt_init and emit_receipt_started
# (or before emit_receipt_terminal). They populate the YAML's spec_path,
# wave_id (commit advancing plan.md), and merge_sha (close-wave success)
# fields so the helper writes them in the SAME atomic write as the rest of
# the receipt body. Per-init values are reset on every emit_receipt_init.
# -----------------------------------------------------------------------------
emit_receipt_set_spec_path() {
  EMIT_RECEIPT__SPEC_PATH="${1:-}"
}
emit_receipt_set_wave_id() {
  # Numeric wave_id for /commit when it advances a plan.md row.
  EMIT_RECEIPT__WAVE_ID_OVERRIDE="${1:-}"
}
emit_receipt_set_merge_sha() {
  # Used by /close-wave on success-path terminal write.
  EMIT_RECEIPT__MERGE_SHA="${1:-}"
}

# -----------------------------------------------------------------------------
# Bash 3.2 compatibility check — invoked when sourced.
# Refuses to run on shells without `printf` / `awk` / `mv` / `mktemp`.
# -----------------------------------------------------------------------------
for _emit_receipt_dep in printf awk mv mktemp; do
  if ! command -v "$_emit_receipt_dep" >/dev/null 2>&1; then
    echo "✗ emit-receipt.sh: missing required dependency '$_emit_receipt_dep'" >&2
    return 1 2>/dev/null || exit 1
  fi
done
unset _emit_receipt_dep
