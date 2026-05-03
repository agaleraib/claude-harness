#!/usr/bin/env bash
# scan.sh — /harness-status executor.
#
# Read-only cross-repo scan driven by the path-only registry at
# ~/.config/harness/projects.yml (or the path in HARNESS_REGISTRY_PATH).
# Aggregates `git status --porcelain` + `git worktree list --porcelain`
# + best-effort docs/plan.md parse + .harness-profile read across every
# registered repo. Writes ONLY to the invoking repo's .harness-state/.
#
# Sources skills/_shared/lib/emit-receipt.sh for §3.0a reserve-then-mutate
# lifecycle and §4.2 receipt shape, with the Stage A no-op exemption per
# spec §5.4 (idempotency_key.trace.stage_a_exempt: true).
#
# Bash 3.2 compatible (macOS default shell): no associative arrays;
# sha256sum/shasum fallback inherited from emit-receipt.sh.
#
# Exit codes:
#   0  — success / partial-pre-conversion
#   1  — invoking repo's .harness-state/ unwritable, or terminal-write fail
#   2  — registry parse failed (failed receipt written)
#
# Usage:
#   bash skills/harness-status/lib/scan.sh [--group <name>] [--id <name>]

set -uo pipefail

# ----------------------------------------------------------------------------
# Arg parsing.
# ----------------------------------------------------------------------------
FILTER_GROUP=""
FILTER_ID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --group) shift; FILTER_GROUP="${1:?--group needs a value}" ;;
    --id)    shift; FILTER_ID="${1:?--id needs a value}" ;;
    -h|--help)
      grep '^# ' "${BASH_SOURCE[0]}" | sed 's/^# //'
      exit 0
      ;;
    *) echo "✗ unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

# ----------------------------------------------------------------------------
# Resolve invoking repo + helper.
# ----------------------------------------------------------------------------
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
HELPER="$REPO_ROOT/skills/_shared/lib/emit-receipt.sh"
if [[ ! -f "$HELPER" ]]; then
  echo "✗ /harness-status: shared helper missing at $HELPER" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$HELPER"

# ----------------------------------------------------------------------------
# SHA-256 utility (mirror emit-receipt's selection so this script is
# self-contained when invoked outside the helper's sourced context).
# ----------------------------------------------------------------------------
if command -v sha256sum >/dev/null 2>&1; then
  hs_sha256() { sha256sum | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  hs_sha256() { shasum -a 256 | awk '{print $1}'; }
else
  echo "✗ /harness-status: neither sha256sum nor shasum available" >&2
  exit 1
fi
hs_sha256_of_file() {
  if [[ -f "$1" ]]; then hs_sha256 < "$1"; else printf 'MISSING'; fi
}
hs_sha256_of_string() { printf '%s' "$1" | hs_sha256; }

# ----------------------------------------------------------------------------
# Post-write Stage A no-op exemption applicator.
# Rewrites the just-written receipt so:
#   - idempotency_key.value uses the timestamp-salted formula per §5.4
#   - idempotency_key.trace gains stage_a_exempt: true
# Defined up-front so the registry-not-found / failed-validation branches
# below can call it before the main loop.
# ----------------------------------------------------------------------------
hs_apply_stage_a_exemption_to_receipt() {
  local receipt
  receipt="$(emit_receipt_get_path)"
  if [[ -z "$receipt" || ! -f "$receipt" ]]; then
    echo "WARN: cannot find receipt to apply stage_a_exempt; helper may have failed" >&2
    return 0
  fi
  local op_id
  op_id="$(emit_receipt_compute_operation_id)"
  local registry_digest
  registry_digest="$(hs_sha256_of_file "$REGISTRY_PATH")"
  local ts_for_key
  ts_for_key="${EMIT_RECEIPT_TEST_PIN_TIMESTAMP:-$TS}"
  local new_value
  new_value="$(hs_sha256_of_string "$op_id"$'\n'"$ts_for_key"$'\n'"$registry_digest")"

  local tmp="${receipt}.exempt-tmp"
  awk -v new_value="$new_value" '
    BEGIN { in_ik=0; in_trace=0; injected=0 }
    /^idempotency_key:/ { in_ik=1; print; next }
    in_ik && /^[[:alnum:]_]+:/ && !/^idempotency_key:/ { in_ik=0; in_trace=0 }
    in_ik && /^  value:/ {
      print "  value: " new_value
      next
    }
    in_ik && /^  trace:/ { print; in_trace=1; next }
    in_trace && /^  [[:alnum:]_]/ && !/^  trace:/ {
      if (!injected) { print "    stage_a_exempt: true"; injected=1 }
      in_trace=0
    }
    { print }
    END {
      if (in_trace && !injected) print "    stage_a_exempt: true"
    }
  ' "$receipt" > "$tmp" && mv -f "$tmp" "$receipt"
}

# ----------------------------------------------------------------------------
# Resolve registry path. Friendly behavior on missing.
# ----------------------------------------------------------------------------
REGISTRY_PATH="${HARNESS_REGISTRY_PATH:-$HOME/.config/harness/projects.yml}"

TS="$(date -u '+%Y-%m-%dT%H%M%SZ')"
SUMMARY_MD="$REPO_ROOT/.harness-state/harness-status-$TS.md"
SUMMARY_JSON="$REPO_ROOT/.harness-state/harness-status-$TS.json"

mkdir -p "$REPO_ROOT/.harness-state" 2>/dev/null || {
  echo "✗ /harness-status: cannot create .harness-state/ in $REPO_ROOT" >&2
  exit 1
}
# Probe writability up-front so the receipt helper doesn't have to.
probe="$REPO_ROOT/.harness-state/.harness-status-probe.$$"
if ! ( : > "$probe" ) 2>/dev/null; then
  echo "✗ /harness-status: .harness-state/ in $REPO_ROOT is not writable" >&2
  exit 1
fi
rm -f "$probe" 2>/dev/null

# ----------------------------------------------------------------------------
# Registry-not-found path: friendly stderr + minimal receipt + summary.
# ----------------------------------------------------------------------------
if [[ ! -f "$REGISTRY_PATH" ]]; then
  echo "registry not found at $REGISTRY_PATH; create it per skills/harness-status/SKILL.md §Bootstrapping the registry" >&2
  {
    printf '# Harness status — %s\n\n' "$TS"
    printf 'Registry: %s (NOT FOUND)\n\n' "$REGISTRY_PATH"
    printf 'no projects registered\n'
  } > "$SUMMARY_MD"
  printf '[]\n' > "$SUMMARY_JSON"

  emit_receipt_init harness-status "-" "$REGISTRY_PATH"
  PREFLIGHT="$(emit_receipt_preflight)"
  case "$PREFLIGHT" in
    PROCEED) emit_receipt_started || exit 1 ;;
    NOOP*)
      # Stage A would short-circuit; but harness-status is exempt. The helper
      # check is structural; we override here by writing a fresh receipt.
      emit_receipt_started || exit 1
      ;;
    *) exit 1 ;;
  esac
  rel_md="${SUMMARY_MD#$REPO_ROOT/}"
  rel_json="${SUMMARY_JSON#$REPO_ROOT/}"
  VERIFICATION_YAML="    - cmd: \"test -f $REGISTRY_PATH\"
      exit_code: 1
      summary: \"registry not found; emitted no-projects-registered summary\""
  emit_receipt_terminal success "$VERIFICATION_YAML" "$rel_md" "$rel_json" || exit 1

  # Stage A exemption: rewrite idempotency_key.value to timestamp-salted form +
  # add stage_a_exempt: true to trace. Done by post-processing the receipt YAML
  # written by emit-receipt (which doesn't natively support the exemption).
  hs_apply_stage_a_exemption_to_receipt
  exit 0
fi

# ----------------------------------------------------------------------------
# Registry parser (bash 3.2-compatible YAML extraction; not a full parser, but
# enforces the v2 §5 disallow list and unique-id / absolute-path checks).
# ----------------------------------------------------------------------------
hs_parse_registry() {
  local file="$1"
  awk '
    BEGIN { in_proj=0; idx=-1; have=0 }
    /^projects:[[:space:]]*$/ { in_proj=1; next }
    !in_proj { next }
    /^[^[:space:]-]/ && !/^projects:/ { in_proj=0; next }
    /^[[:space:]]*-[[:space:]]+id:[[:space:]]/ {
      idx++
      sub(/^[[:space:]]*-[[:space:]]+id:[[:space:]]*/, "")
      sub(/[[:space:]]*$/, "")
      gsub(/^"|"$/, "")
      print idx "\tid\t" $0
      have=1
      next
    }
    /^[[:space:]]+[[:alnum:]_]+:[[:space:]]/ && have {
      key=$0
      sub(/^[[:space:]]+/, "", key)
      val=key
      sub(/^[[:alnum:]_]+:[[:space:]]*/, "", val)
      sub(/[[:space:]]*$/, "", val)
      gsub(/^"|"$/, "", val)
      sub(/:.*/, "", key)
      print idx "\t" key "\t" val
    }
  ' "$file"
}

# ----------------------------------------------------------------------------
# Validate registry. Disallow list per v2 §5.
# Returns 0 on valid; 1 on parse-fail; assigns global PROJ_* arrays.
# ----------------------------------------------------------------------------
hs_validate_registry() {
  local file="$1"
  PROJ_COUNT=0
  PROJ_IDS=()
  PROJ_PATHS=()
  PROJ_GROUPS=()

  local DISALLOW=" main_branch plan_path waves_path quality_gate tracker_team deploy_command protected_paths "
  declare -i seen_ids=0
  local idx="" key="" val=""
  local last_idx="-1"
  local cur_id="" cur_path="" cur_group=""
  local id_table=":"   # :id1:id2: lookup
  local err_count=0

  while IFS=$'\t' read -r idx key val; do
    [[ -z "$idx" ]] && continue
    if [[ "$idx" != "$last_idx" ]]; then
      # Flush previous entry.
      if [[ "$last_idx" != "-1" ]]; then
        if [[ -z "$cur_id" || -z "$cur_path" ]]; then
          echo "✗ registry entry $last_idx: missing required field (id and/or path)" >&2
          err_count=$((err_count + 1))
        else
          case "$id_table" in *":$cur_id:"*)
            echo "✗ registry: duplicate id '$cur_id'" >&2
            err_count=$((err_count + 1));;
          esac
          id_table="$id_table$cur_id:"
          case "$cur_path" in /*) ;; *)
            echo "✗ registry entry id=$cur_id: path '$cur_path' is not absolute" >&2
            err_count=$((err_count + 1));;
          esac
          PROJ_IDS+=("$cur_id")
          PROJ_PATHS+=("$cur_path")
          PROJ_GROUPS+=("$cur_group")
          PROJ_COUNT=$((PROJ_COUNT + 1))
        fi
      fi
      cur_id=""; cur_path=""; cur_group=""
      last_idx="$idx"
    fi
    case "$key" in
      id)    cur_id="$val" ;;
      path)  cur_path="$val" ;;
      group) cur_group="$val" ;;
      *)
        case "$DISALLOW" in *" $key "*)
          echo "✗ registry entry $idx: disallowed field '$key' (per v2 §5 disallow list)" >&2
          err_count=$((err_count + 1));;
        *)
          echo "✗ registry entry $idx: unknown field '$key' (allowed: id, path, group)" >&2
          err_count=$((err_count + 1));;
        esac
        ;;
    esac
  done < <(hs_parse_registry "$file")
  # Flush last entry.
  if [[ "$last_idx" != "-1" && -n "$cur_id" && -n "$cur_path" ]]; then
    case "$id_table" in *":$cur_id:"*)
      echo "✗ registry: duplicate id '$cur_id'" >&2
      err_count=$((err_count + 1));;
    esac
    case "$cur_path" in /*) ;; *)
      echo "✗ registry entry id=$cur_id: path '$cur_path' is not absolute" >&2
      err_count=$((err_count + 1));;
    esac
    PROJ_IDS+=("$cur_id")
    PROJ_PATHS+=("$cur_path")
    PROJ_GROUPS+=("$cur_group")
    PROJ_COUNT=$((PROJ_COUNT + 1))
  fi
  if [[ "$err_count" -gt 0 ]]; then
    return 1
  fi
  return 0
}

if ! hs_validate_registry "$REGISTRY_PATH"; then
  echo "✗ /harness-status: registry $REGISTRY_PATH failed validation; emitting failed receipt" >&2
  emit_receipt_init harness-status "-" "$REGISTRY_PATH"
  PREFLIGHT="$(emit_receipt_preflight)"
  case "$PREFLIGHT" in
    PROCEED) emit_receipt_started || exit 2 ;;
    NOOP*)   emit_receipt_started || exit 2 ;;  # exempt
    *)       exit 1 ;;
  esac
  VERIFICATION_YAML="    - cmd: \"hs_validate_registry $REGISTRY_PATH\"
      exit_code: 1
      summary: \"registry validation failed; see stderr for details\""
  emit_receipt_terminal failed "$VERIFICATION_YAML" || exit 1
  hs_apply_stage_a_exemption_to_receipt
  exit 2
fi

# ----------------------------------------------------------------------------
# Per-repo scan loop.
# ----------------------------------------------------------------------------
RECEIPT_INPUTS=("$REGISTRY_PATH")
JSON_ENTRIES=()
MD_BLOCKS=()
REACHABLE=0
MISSING=0

i=0
while [[ "$i" -lt "$PROJ_COUNT" ]]; do
  pid="${PROJ_IDS[$i]}"
  ppath="${PROJ_PATHS[$i]}"
  pgroup="${PROJ_GROUPS[$i]}"

  # Apply --group / --id filters.
  if [[ -n "$FILTER_ID" && "$pid" != "$FILTER_ID" ]]; then
    i=$((i + 1)); continue
  fi
  if [[ -n "$FILTER_GROUP" && "$pgroup" != "$FILTER_GROUP" ]]; then
    i=$((i + 1)); continue
  fi

  block_header="## $pid"
  [[ -n "$pgroup" ]] && block_header="$block_header (group: $pgroup)"
  block="$block_header"$'\n'"- path: $ppath"

  if [[ ! -d "$ppath/.git" && ! -e "$ppath" ]]; then
    block="$block"$'\n'"- (repo path missing on disk: $ppath)"
    MD_BLOCKS+=("$block")
    JSON_ENTRIES+=("{\"id\":\"$pid\",\"path\":\"$ppath\",\"group\":\"$pgroup\",\"missing\":true}")
    MISSING=$((MISSING + 1))
    i=$((i + 1)); continue
  fi
  if [[ ! -d "$ppath/.git" ]]; then
    block="$block"$'\n'"- (repo path missing on disk: $ppath)"
    MD_BLOCKS+=("$block")
    JSON_ENTRIES+=("{\"id\":\"$pid\",\"path\":\"$ppath\",\"group\":\"$pgroup\",\"missing\":true}")
    MISSING=$((MISSING + 1))
    i=$((i + 1)); continue
  fi

  REACHABLE=$((REACHABLE + 1))

  # Read-only git operations with --no-optional-locks (or env equivalent).
  branch="$(GIT_OPTIONAL_LOCKS=0 git -C "$ppath" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  status_lines="$(GIT_OPTIONAL_LOCKS=0 git -C "$ppath" --no-optional-locks status --porcelain 2>/dev/null || true)"
  worktree_lines="$(GIT_OPTIONAL_LOCKS=0 git -C "$ppath" --no-optional-locks worktree list --porcelain 2>/dev/null || true)"

  dirty_count=0
  if [[ -n "$status_lines" ]]; then
    dirty_count="$(printf '%s\n' "$status_lines" | grep -c '^' || true)"
  fi
  if [[ "$dirty_count" -eq 0 ]]; then
    wt_status="clean"
  else
    wt_status="dirty ($dirty_count files)"
  fi

  worktree_count=0
  if [[ -n "$worktree_lines" ]]; then
    worktree_count="$(printf '%s\n' "$worktree_lines" | grep -c '^worktree ' || true)"
  fi

  block="$block"$'\n'"- branch: $branch"$'\n'"- working tree: $wt_status"$'\n'"- worktrees: $worktree_count"

  # docs/plan.md best-effort.
  plan_path="$ppath/docs/plan.md"
  plan_now=""
  plan_blocked=""
  plan_last=""
  if [[ -f "$plan_path" ]]; then
    RECEIPT_INPUTS+=("$plan_path")
    if grep -qE '^## (Now|Blocked|Recently Shipped)$' "$plan_path"; then
      plan_now="$(awk '/^## Now/,/^## /' "$plan_path" | sed '1d;$d' | head -10)"
      plan_blocked="$(awk '/^## Blocked/,/^## /' "$plan_path" | sed '1d;$d' | head -10)"
      plan_last="$(awk '/^## Recently Shipped/,/^## /' "$plan_path" | grep -E '^- \[x\] ' | head -1)"
      block="$block"$'\n'"- ## Now:"
      if [[ -n "$plan_now" ]]; then
        block="$block"$'\n'"$(printf '%s\n' "$plan_now" | sed 's/^/  /')"
      else
        block="$block"$'\n'"  (empty)"
      fi
      if [[ -n "$plan_blocked" ]]; then
        block="$block"$'\n'"- ## Blocked:"$'\n'"$(printf '%s\n' "$plan_blocked" | sed 's/^/  /')"
      else
        block="$block"$'\n'"- ## Blocked: none"
      fi
      if [[ -n "$plan_last" ]]; then
        block="$block"$'\n'"- last shipped: $plan_last"
      fi
    else
      block="$block"$'\n'"- (pre-v2 plan format; skipped)"
    fi
  else
    block="$block"$'\n'"- (plan.md not found)"
  fi

  # .harness-profile read.
  profile_path="$ppath/.harness-profile"
  if [[ -f "$profile_path" ]]; then
    RECEIPT_INPUTS+=("$profile_path")
    # Best-effort YAML check; if it doesn't have profile_version field, treat
    # as malformed for status purposes (the spec mandates this field).
    if ! grep -qE '^profile_version:' "$profile_path"; then
      block="$block"$'\n'"- (harness-profile malformed; skipped)"
    fi
  fi

  MD_BLOCKS+=("$block")
  json="{\"id\":\"$pid\",\"path\":\"$ppath\",\"group\":\"$pgroup\",\"branch\":\"$branch\",\"working_tree\":\"$wt_status\",\"worktrees\":$worktree_count,\"missing\":false}"
  JSON_ENTRIES+=("$json")
  i=$((i + 1))
done

# ----------------------------------------------------------------------------
# Write summary Markdown + JSON.
# ----------------------------------------------------------------------------
{
  printf '# Harness status — %s\n\n' "$TS"
  printf 'Registry: %s (%s projects)\n\n' "$REGISTRY_PATH" "$PROJ_COUNT"
  if [[ "${#MD_BLOCKS[@]:-0}" -gt 0 ]]; then
    for blk in "${MD_BLOCKS[@]}"; do
      printf '%s\n\n' "$blk"
    done
  else
    printf 'no projects registered\n\n'
  fi
  printf -- '---\nTotal: %s registered, %s reachable, %s missing\n' \
    "$PROJ_COUNT" "$REACHABLE" "$MISSING"
} > "$SUMMARY_MD"

{
  printf '['
  first=1
  if [[ "${#JSON_ENTRIES[@]:-0}" -gt 0 ]]; then
  for j in "${JSON_ENTRIES[@]}"; do
    if [[ "$first" -eq 1 ]]; then
      first=0
    else
      printf ','
    fi
    printf '%s' "$j"
  done
  fi
  printf ']\n'
} > "$SUMMARY_JSON"

# ----------------------------------------------------------------------------
# Emit §4.2 receipt with Stage A no-op exemption.
# ----------------------------------------------------------------------------
emit_receipt_init harness-status "-" "${RECEIPT_INPUTS[@]}"
PREFLIGHT="$(emit_receipt_preflight)"
case "$PREFLIGHT" in
  PROCEED) emit_receipt_started || exit 1 ;;
  NOOP*)
    # Exempt from Stage A: even if helper detected a content match on
    # idempotency_key, we still execute a fresh scan and write a fresh
    # receipt with timestamp-salted key. The summary + JSON were already
    # written above; we just need to emit a fresh started+terminal pair.
    emit_receipt_started || exit 1
    ;;
  *) exit 1 ;;
esac

rel_md="${SUMMARY_MD#$REPO_ROOT/}"
rel_json="${SUMMARY_JSON#$REPO_ROOT/}"

# verification.commands list per §5.4 — git-status + git-worktree-list (run per scanned repo).
VERIFICATION_YAML="    - cmd: \"git --no-optional-locks status --porcelain\"
      exit_code: 0
      summary: \"$REACHABLE repo(s) scanned read-only; $MISSING missing on disk\"
    - cmd: \"git --no-optional-locks worktree list --porcelain\"
      exit_code: 0
      summary: \"per-scanned-repo worktree enumeration aggregated into summary.md\""

status="success"
if [[ "$MISSING" -gt 0 && "$REACHABLE" -gt 0 ]]; then
  status="partial"
fi
emit_receipt_terminal "$status" "$VERIFICATION_YAML" "$rel_md" "$rel_json" || exit 1

# (Stage A no-op exemption applicator declared up-front near sha256 helpers.)
hs_apply_stage_a_exemption_to_receipt

echo "/harness-status: scanned $REACHABLE/$PROJ_COUNT registered repos; summary at $rel_md"
exit 0
