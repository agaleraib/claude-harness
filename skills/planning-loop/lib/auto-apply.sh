#!/usr/bin/env bash
# auto-apply.sh — Step 6e + 6f executor for /planning-loop.
#
# Reads round-3 finding IDs + arbiter verdicts from $LOG_PATH, runs Phase 1a
# validation, then Phase 1b apply via temp-file + atomic rename. Writes the
# appropriate audit/abort entry back to $LOG_PATH on every exit path.
#
# Usage:
#   bash "$HOME/.claude/skills/planning-loop/lib/auto-apply.sh" "<SPEC_PATH>" "<LOG_PATH>"
#
# Output:
#   stdout: AUTOAPPLY_OUTCOME — one of
#     success | menu-validation-failure | menu-opt-out | menu-hash-mismatch
#     | menu-apply-failure | menu-audit-failure
#   stderr: human-readable abort reason on any abort path
#
# Exit codes:
#   0  — success (auto-apply landed; audit appended)
#   1  — abort to menu (aborted entry appended)
#   2  — hard error (missing args, missing files, no SHA-256 utility, etc.)
#
# Test hooks (do NOT use in production):
#   PLANNING_LOOP_TEST_PIN_SPEC_HASH_PRE — pin SPEC_HASH_PRE to a fixed value
#       for the external-mutation race-window test.
#   PLANNING_LOOP_TEST_PIN_LOG_HASH_PRE — pin LOG_HASH_PRE to a fixed value
#       for the log-hash mismatch fixture (Wave 5 Task 2).
#   PLANNING_LOOP_TEST_FORCE_MV_FAIL — force the atomic-rename mv to return
#       non-zero so the apply-failure errno-capture path can be exercised
#       (Wave 5 Task 9).
set -uo pipefail

SPEC="${1:-}"
LOG="${2:-}"
if [[ -z "$SPEC" || -z "$LOG" ]]; then
  echo "✗ auto-apply.sh: SPEC_PATH (argv[1]) and LOG_PATH (argv[2]) are required" >&2
  exit 2
fi
if [[ ! -f "$SPEC" ]]; then
  echo "✗ auto-apply.sh: spec file not found: $SPEC" >&2
  exit 2
fi
if [[ ! -f "$LOG" ]]; then
  echo "✗ auto-apply.sh: log file not found: $LOG" >&2
  exit 2
fi

# Probe SHA-256 utility.
if command -v sha256sum >/dev/null 2>&1; then
  HASHER='sha256sum'
elif command -v shasum >/dev/null 2>&1; then
  HASHER='shasum -a 256'
else
  echo "✗ auto-apply.sh: neither sha256sum nor shasum is available" >&2
  exit 2
fi

hash_of() { $HASHER "$1" | awk '{print $1}'; }

AUTOAPPLY_OUTCOME=""
ABORT_REASON=""
ABORT_DETAIL=""

append_abort() {
  local reason="$1" fid="$2" detail="$3"
  ABORT_REASON="$reason"; ABORT_DETAIL="$detail"
  printf '\n## Auto-apply aborted — %s\n\nReason: %s\nFailed finding: %s\nDetail: %s\n\nFalling through to 4-option menu.\n' \
    "$(date '+%Y-%m-%d %H:%M:%S')" "$reason" "$fid" "$detail" >> "$LOG" 2>/dev/null || true
}

emit_outcome() {
  local outcome="$1"
  AUTOAPPLY_OUTCOME="$outcome"
  echo "$outcome"
  if [[ "$outcome" != "success" ]]; then
    echo "abort: ${ABORT_REASON:-unknown}${ABORT_DETAIL:+ — $ABORT_DETAIL}" >&2
  fi
}

# Helpers that read dynamic per-finding variables (bash 3.2 has no associative
# arrays — match run-fixtures.sh).
get_v_cr()   { eval "printf '%s' \"\${V_CR_${1}:-}\""; }
get_v_plan() { eval "printf '%s' \"\${V_PLAN_${1}:-}\""; }
get_body()   { eval "printf '%s' \"\${FB_${1}:-}\""; }
get_title()  { eval "printf '%s' \"\${TITLE_${1}:-}\""; }

# Verbatim arbiter rationale for a finding. Prefers the inline rationale
# captured from the `**Fn: <verdict>** — <rationale>` line; falls back to the
# first non-empty body line.
first_rationale_line() {
  local fid="$1"
  local rat
  rat="$(eval "printf '%s' \"\${RAT_${fid}:-}\"")"
  if [[ -n "$rat" ]]; then
    printf '%s' "$rat"
  else
    get_body "$fid" | awk 'NF{print; exit}'
  fi
}

# Comma-joined list of arbiters that produced a verdict for a finding.
ruled_by() {
  local fid="$1"
  local cr_v pl_v
  cr_v="$(get_v_cr "$fid")"
  pl_v="$(get_v_plan "$fid")"
  if [[ -n "$cr_v" && -n "$pl_v" ]]; then
    printf 'code-reviewer + Plan'
  elif [[ -n "$cr_v" ]]; then
    printf 'code-reviewer'
  elif [[ -n "$pl_v" ]]; then
    printf 'Plan'
  fi
}

# ----- 6e Clause 1: opt-out check (env var precedence > profile key) ------
AUTO_APPLY=true
if [[ -n "${PLANNING_LOOP_NO_AUTO_APPLY:-}" ]]; then
  AUTO_APPLY=false
elif [[ -f .harness-profile ]] && grep -qE '^[[:space:]]*planning_loop:' .harness-profile; then
  if awk '
    /^[[:space:]]*planning_loop:[[:space:]]*$/ {in_blk=1; next}
    in_blk==1 && /^[^[:space:]]/ {in_blk=0}
    in_blk==1 && /^[[:space:]]+auto_apply:[[:space:]]*false[[:space:]]*$/ {found=1; exit}
    END {exit !found}
  ' .harness-profile; then
    AUTO_APPLY=false
  fi
fi
if [[ "$AUTO_APPLY" == "false" ]]; then
  append_abort "opt-out-set" "n/a" "PLANNING_LOOP_NO_AUTO_APPLY=1 set or planning_loop.auto_apply=false in .harness-profile"
  emit_outcome "menu-opt-out"
  exit 1
fi

# ----- 6f Phase 1a: capture pre-validation hashes ------------------------
if [[ -n "${PLANNING_LOOP_TEST_PIN_SPEC_HASH_PRE:-}" ]]; then
  SPEC_HASH_PRE="$PLANNING_LOOP_TEST_PIN_SPEC_HASH_PRE"
else
  SPEC_HASH_PRE="$(hash_of "$SPEC")"
fi
LOG_HASH_PRE=""
if [[ -n "${PLANNING_LOOP_TEST_PIN_LOG_HASH_PRE:-}" ]]; then
  LOG_HASH_PRE="$PLANNING_LOOP_TEST_PIN_LOG_HASH_PRE"
elif [[ -f "$LOG" ]]; then
  LOG_HASH_PRE="$(hash_of "$LOG")"
fi

# ----- 6e Clause 2: parse round-3 finding IDs -----------------------------
EXPECTED=()
in_round3=0; in_text=0
while IFS= read -r line; do
  if [[ "$line" =~ ^\#\#[[:space:]]+Round[[:space:]]3[[:space:]] ]]; then
    in_round3=1; continue
  fi
  if [[ $in_round3 -eq 1 && "$line" =~ ^\#\#[[:space:]] ]]; then
    in_round3=0
  fi
  if [[ $in_round3 -eq 1 ]]; then
    if [[ "$line" =~ ^\`\`\`text$ ]]; then in_text=1; continue; fi
    if [[ $in_text -eq 1 && "$line" =~ ^\`\`\`$ ]]; then in_text=0; continue; fi
    if [[ $in_text -eq 1 && "$line" =~ ^-[[:space:]]\[(low|medium|high)\][[:space:]](F[0-9]+):[[:space:]](.*)$ ]]; then
      _fid="${BASH_REMATCH[2]}"
      _title="${BASH_REMATCH[3]}"
      EXPECTED+=( "$_fid" )
      # Store title via printf -v to avoid eval-escaping pitfalls (bash 3.2 has
      # printf -v).
      printf -v "TITLE_${_fid}" '%s' "$_title"
    fi
  fi
done < "$LOG"

if [[ ${#EXPECTED[@]} -eq 0 ]]; then
  append_abort "log-parse-failure" "n/a" "no round-3 findings parsed from $LOG"
  emit_outcome "menu-validation-failure"
  exit 1
fi

# ----- 6e Clause 2: parse arbiter verdicts --------------------------------
for fid in "${EXPECTED[@]}"; do
  eval "V_CR_${fid}=''"
  eval "V_PLAN_${fid}=''"
  eval "FB_${fid}=''"
done

in_arb=0; cur_arb=""; cur_fid=""; cur_verdict=""
body_buf=""
while IFS= read -r line; do
  if [[ "$line" =~ ^\#\#[[:space:]]+Arbiter[[:space:]] ]]; then
    in_arb=1; continue
  fi
  if [[ $in_arb -eq 1 && "$line" =~ ^\#\#[[:space:]] && ! "$line" =~ ^\#\#\#[[:space:]] ]]; then
    in_arb=0
    if [[ -n "$cur_fid" ]]; then
      eval "FB_${cur_fid}+=\$body_buf"
      body_buf=""
    fi
  fi
  if [[ $in_arb -eq 1 ]]; then
    if [[ "$line" =~ ^\#\#\#[[:space:]]code-reviewer[[:space:]]verdicts ]]; then
      cur_arb="cr"; continue
    fi
    if [[ "$line" =~ ^\#\#\#[[:space:]]Plan[[:space:]]agent[[:space:]]verdicts ]]; then
      cur_arb="plan"; continue
    fi
    if [[ "$line" =~ ^\*\*(F[0-9]+):[[:space:]](load-bearing|wrong-premise|nice-to-have|defer)\*\*([[:space:]]+—[[:space:]]+(.+))?[[:space:]]*$ ]]; then
      if [[ -n "$cur_fid" ]]; then
        eval "FB_${cur_fid}+=\$body_buf"
        body_buf=""
      fi
      cur_fid="${BASH_REMATCH[1]}"
      cur_verdict="${BASH_REMATCH[2]}"
      # Capture the inline rationale (text after `— `) when present so the
      # audit-entry's `Arbiter rationale (verbatim)` line has a value even
      # when the body has no leading prose paragraph.
      cur_rationale="${BASH_REMATCH[4]:-}"
      if [[ -n "$cur_rationale" ]]; then
        # Prefer code-reviewer's rationale when both arbiters supplied one;
        # fall through to Plan only when code-reviewer didn't rule.
        existing_rat="$(eval "printf '%s' \"\${RAT_${cur_fid}:-}\"")"
        if [[ -z "$existing_rat" || "$cur_arb" == "cr" ]]; then
          printf -v "RAT_${cur_fid}" '%s' "$cur_rationale"
        fi
      fi
      if [[ "$cur_arb" == "cr" ]]; then
        eval "V_CR_${cur_fid}=\$cur_verdict"
      elif [[ "$cur_arb" == "plan" ]]; then
        eval "V_PLAN_${cur_fid}=\$cur_verdict"
      fi
      continue
    fi
    if [[ -n "$cur_fid" ]]; then
      body_buf+="$line"$'\n'
    fi
  fi
done < "$LOG"
if [[ -n "$cur_fid" ]]; then
  eval "FB_${cur_fid}+=\$body_buf"
fi

# Verdict-id-mismatch / verdict-missing checks.
for fid in "${EXPECTED[@]}"; do
  cr_v="$(get_v_cr "$fid")"
  pl_v="$(get_v_plan "$fid")"
  if [[ -z "$cr_v$pl_v" ]]; then
    append_abort "verdict-missing" "$fid" "expected $fid has no arbiter verdict"
    emit_outcome "menu-validation-failure"
    exit 1
  fi
done

# Mixed-routing-aware completeness.
routing_line="$(grep -E '^\*\*Routing:\*\*' "$LOG" | head -1 || true)"
has_mixed=0
if printf '%s' "$routing_line" | grep -qiE 'mixed'; then
  has_mixed=1
fi
if [[ $has_mixed -eq 1 ]]; then
  for fid in "${EXPECTED[@]}"; do
    if [[ -z "$(get_v_cr "$fid")" || -z "$(get_v_plan "$fid")" ]]; then
      append_abort "mixed-routing-incomplete" "$fid" "mixed-routed $fid lacks one arbiter ruling"
      emit_outcome "menu-validation-failure"
      exit 1
    fi
  done
fi

# Per-finding agreement.
for fid in "${EXPECTED[@]}"; do
  cr="$(get_v_cr "$fid")"; pl="$(get_v_plan "$fid")"
  if [[ -n "$cr" && -n "$pl" && "$cr" != "$pl" ]]; then
    append_abort "validation-failure" "$fid" "split verdict on $fid: code-reviewer=$cr Plan=$pl"
    emit_outcome "menu-validation-failure"
    exit 1
  fi
done

# ----- 6e Clause 3: verdict whitelist (no defer, no nice-to-have) ---------
for fid in "${EXPECTED[@]}"; do
  v="$(get_v_cr "$fid")"
  [[ -z "$v" ]] && v="$(get_v_plan "$fid")"
  case "$v" in
    load-bearing|wrong-premise) ;;
    defer|nice-to-have)
      append_abort "validation-failure" "$fid" "$fid verdict is $v (no defer/nice-to-have allowed)"
      emit_outcome "menu-validation-failure"
      exit 1
      ;;
    *)
      append_abort "validation-failure" "$fid" "$fid has unrecognized verdict $v"
      emit_outcome "menu-validation-failure"
      exit 1
      ;;
  esac
done

# ----- Per-finding validation (Phase 1a remainder) -----------------------
for fid in "${EXPECTED[@]}"; do
  eval "EK_${fid}=''"
  eval "ES_${fid}=''"
  eval "EO_${fid}=''"
  eval "EN_${fid}=''"
  eval "EI_${fid}=''"
  eval "FV_${fid}=''"
done

for fid in "${EXPECTED[@]}"; do
  v="$(get_v_cr "$fid")"
  [[ -z "$v" ]] && v="$(get_v_plan "$fid")"
  eval "FV_${fid}=\$v"
  if [[ "$v" != "load-bearing" ]]; then
    continue
  fi
  body="$(get_body "$fid")"
  # Non-mechanical pre-filter (case-insensitive wordlist).
  if printf '%s' "$body" | grep -qiE '\b(redesign|rethink|reconsider|restructure|scope-change|envelope|architecture)\b'; then
    append_abort "validation-failure" "$fid" "$fid recommendation hits non-mechanical pre-filter wordlist"
    emit_outcome "menu-validation-failure"
    exit 1
  fi
  # Extract the first ```json fenced block.
  json_block="$(printf '%s' "$body" | awk '
    /^```json$/ {in_blk=1; next}
    in_blk==1 && /^```$/ {exit}
    in_blk==1 {print}
  ')"
  if [[ -z "$json_block" ]]; then
    append_abort "validation-failure" "$fid" "$fid has no fenced JSON block"
    emit_outcome "menu-validation-failure"
    exit 1
  fi
  if ! command -v jq >/dev/null 2>&1; then
    append_abort "validation-failure" "$fid" "jq not available; treating $fid JSON as unparseable"
    emit_outcome "menu-validation-failure"
    exit 1
  fi
  if ! printf '%s' "$json_block" | jq . >/dev/null 2>&1; then
    append_abort "validation-failure" "$fid" "$fid JSON block unparseable"
    emit_outcome "menu-validation-failure"
    exit 1
  fi
  section="$(printf '%s' "$json_block" | jq -r '.section // empty')"
  old_str="$(printf '%s' "$json_block" | jq -r '.old_string // empty')"
  new_str="$(printf '%s' "$json_block" | jq -r '.new_string // empty')"
  insert_after="$(printf '%s' "$json_block" | jq -r '.insert_after // empty')"

  if [[ -z "$section" || -z "$new_str" ]]; then
    append_abort "validation-failure" "$fid" "$fid missing required section or new_string"
    emit_outcome "menu-validation-failure"
    exit 1
  fi
  # Shape A xor Shape B.
  if [[ -n "$old_str" && -n "$insert_after" ]]; then
    append_abort "validation-failure" "$fid" "$fid has both old_string and insert_after"
    emit_outcome "menu-validation-failure"
    exit 1
  fi
  if [[ -z "$old_str" && -z "$insert_after" ]]; then
    append_abort "validation-failure" "$fid" "$fid has neither old_string nor insert_after"
    emit_outcome "menu-validation-failure"
    exit 1
  fi

  # Resolve H2 section uniqueness.
  section_count="$(awk -v s="$section" 'BEGIN{c=0} $0 ~ "^## "s"$" {c++} END{print c}' "$SPEC")"
  if [[ "$section_count" != "1" ]]; then
    append_abort "validation-failure" "$fid" "$fid section \"$section\" matches $section_count times in spec"
    emit_outcome "menu-validation-failure"
    exit 1
  fi
  # Compute section body line range.
  sec_start="$(awk -v s="$section" '$0 ~ "^## "s"$" {print NR; exit}' "$SPEC")"
  sec_end="$(awk -v start="$sec_start" 'NR > start && /^## / {print NR-1; exit}' "$SPEC")"
  if [[ -z "$sec_end" ]]; then
    sec_end="$(wc -l < "$SPEC")"
  fi
  body_start=$((sec_start + 1))
  body_text="$(awk -v a="$body_start" -v b="$sec_end" 'NR>=a && NR<=b' "$SPEC")"

  # Substring-count check (literal substring, not line-grep).
  if [[ -n "$old_str" ]]; then
    needle="$old_str"; kind="A"
  else
    needle="$insert_after"; kind="B"
  fi
  total_count="$(printf '%s' "$needle" | python3 -c '
import sys
needle = sys.stdin.read()
data = open(sys.argv[1]).read()
print(data.count(needle))
' "$SPEC")"
  section_count_substr="$(printf '%s' "$needle" | python3 -c '
import sys
needle = sys.stdin.read()
body = sys.argv[1]
print(body.count(needle))
' "$body_text")"

  if [[ "$total_count" != "1" ]]; then
    append_abort "validation-failure" "$fid" "$fid needle matches $total_count times in spec (need exactly 1)"
    emit_outcome "menu-validation-failure"
    exit 1
  fi
  if [[ "$section_count_substr" != "1" ]]; then
    append_abort "validation-failure" "$fid" "$fid needle match falls outside section \"$section\" body range"
    emit_outcome "menu-validation-failure"
    exit 1
  fi

  # H2-in-edit-text rejection.
  for field in "$old_str" "$insert_after" "$new_str"; do
    [[ -z "$field" ]] && continue
    if printf '%s' "$field" | grep -qE '^## '; then
      append_abort "validation-failure" "$fid" "$fid edit text contains line starting with '## '"
      emit_outcome "menu-validation-failure"
      exit 1
    fi
  done

  eval "EK_${fid}=\$kind"
  eval "ES_${fid}=\$section"
  eval "EO_${fid}=\$old_str"
  eval "EN_${fid}=\$new_str"
  eval "EI_${fid}=\$insert_after"
done

# Writability checks (Phase 1a — performed BEFORE any spec mutation so an
# unwritable log fails fast and the live spec stays byte-identical).
if [[ ! -w "$SPEC" || ! -w "$(dirname "$SPEC")" ]]; then
  append_abort "validation-failure" "n/a" "spec or its parent dir not writable"
  emit_outcome "menu-validation-failure"
  exit 1
fi
if [[ ! -w "$LOG" ]]; then
  append_abort "validation-failure" "n/a" "log not writable: $LOG"
  emit_outcome "menu-validation-failure"
  exit 1
fi

# ----- 6f Phase 1b: hash re-check ---------------------------------------
SPEC_HASH_NOW="$(hash_of "$SPEC")"
if [[ "$SPEC_HASH_NOW" != "$SPEC_HASH_PRE" ]]; then
  rm -f "${SPEC}.autoapply-tmp" 2>/dev/null || true
  append_abort "hash-mismatch" "n/a" \
    "spec SHA-256 changed between validation and apply (external mutation): pre=${SPEC_HASH_PRE:0:8} now=${SPEC_HASH_NOW:0:8}"
  emit_outcome "menu-hash-mismatch"
  exit 1
fi
# Log-hash re-check (Clause 6 — same check for $LOG_PATH if LOG_HASH_PRE was recorded).
if [[ -n "$LOG_HASH_PRE" ]]; then
  LOG_HASH_NOW="$(hash_of "$LOG")"
  if [[ "$LOG_HASH_NOW" != "$LOG_HASH_PRE" ]]; then
    rm -f "${SPEC}.autoapply-tmp" 2>/dev/null || true
    append_abort "log-hash-mismatch" "n/a" \
      "log SHA-256 changed between validation and apply (external mutation): pre=${LOG_HASH_PRE:0:8} now=${LOG_HASH_NOW:0:8}"
    emit_outcome "menu-hash-mismatch"
    exit 1
  fi
fi

# ----- Apply edits to a temp buffer (.autoapply-tmp) --------------------
cp -- "$SPEC" "${SPEC}.autoapply-tmp"

# Build a parallel index of (fid, kind, section, needle) for every load-bearing
# finding so the post-apply re-validation pass can re-check remaining findings'
# needles against the in-progress buffer (substring count + section-body
# containment). Wrong-premise findings have no needle and skip re-validation.
NEEDLE_FIDS=()
for fid in "${EXPECTED[@]}"; do
  eval "v=\$FV_${fid}"
  if [[ "$v" == "load-bearing" ]]; then
    NEEDLE_FIDS+=( "$fid" )
  fi
done

# Per-finding re-validate: substring count + section-body containment for every
# remaining needle in the in-progress buffer. Aborts with apply-failure naming
# the first remaining FID whose needle is no longer uniquely inside its section
# body.  Inputs (env-passed): BUF (path to in-progress buffer), START_IDX (index
# in EXPECTED of the just-applied edit), and FV/EK/ES/EO/EI tables.
revalidate_remaining() {
  local applied_idx="$1"
  local i j fid_i kind_i sec_i needle_i
  i=$((applied_idx + 1))
  while [[ $i -lt ${#EXPECTED[@]} ]]; do
    fid_i="${EXPECTED[$i]}"
    eval "v_i=\$FV_${fid_i}"
    if [[ "$v_i" != "load-bearing" ]]; then
      i=$((i + 1)); continue
    fi
    eval "kind_i=\$EK_${fid_i}"
    eval "sec_i=\$ES_${fid_i}"
    if [[ "$kind_i" == "A" ]]; then
      eval "needle_i=\$EO_${fid_i}"
    else
      eval "needle_i=\$EI_${fid_i}"
    fi
    # Use Python to check (a) total occurrences in the buffer == 1 and
    # (b) the one occurrence falls inside the section body range.
    if ! REVAL_OUT="$(BUF="${SPEC}.autoapply-tmp" SEC="$sec_i" NEEDLE="$needle_i" python3 - <<'PYEOF'
import os, sys, re
buf_path = os.environ['BUF']
section = os.environ['SEC']
needle = os.environ['NEEDLE']
data = open(buf_path).read()
total = data.count(needle)
if total != 1:
    print(f"needle matches {total} times in buffer (need exactly 1)")
    sys.exit(11)
# Section body range = lines between the unique '^## <section>$' and the next '^## '.
lines = data.split("\n")
sec_re = re.compile(r"^## " + re.escape(section) + r"$")
sec_idx = None
for idx, line in enumerate(lines):
    if sec_re.match(line):
        if sec_idx is not None:
            print(f"section \"{section}\" matches multiple times in buffer")
            sys.exit(12)
        sec_idx = idx
if sec_idx is None:
    print(f"section \"{section}\" no longer present in buffer")
    sys.exit(13)
end_idx = len(lines)
for idx in range(sec_idx + 1, len(lines)):
    if lines[idx].startswith("## "):
        end_idx = idx; break
body = "\n".join(lines[sec_idx + 1:end_idx])
if body.count(needle) != 1:
    print(f"needle no longer falls inside section \"{section}\" body range")
    sys.exit(14)
print("ok")
PYEOF
)"; then
      rm -f "${SPEC}.autoapply-tmp"
      append_abort "apply-failure" "$fid_i" "$fid_i re-validation against in-progress buffer failed: $REVAL_OUT"
      emit_outcome "menu-apply-failure"
      exit 1
    fi
    i=$((i + 1))
  done
}

idx=0
for fid in "${EXPECTED[@]}"; do
  eval "v=\$FV_${fid}"
  if [[ "$v" == "wrong-premise" ]]; then
    # Append a bullet to ## Open Questions (or fallback heading or new section).
    if grep -qE '^##[[:space:]]+[Oo]pen [Qq]uestions' "${SPEC}.autoapply-tmp"; then
      oq_start="$(awk '/^##[[:space:]]+[Oo]pen [Qq]uestions/ {print NR; exit}' "${SPEC}.autoapply-tmp")"
      oq_end="$(awk -v start="$oq_start" 'NR > start && /^## / {print NR-1; exit}' "${SPEC}.autoapply-tmp")"
      if [[ -z "$oq_end" ]]; then
        oq_end="$(wc -l < "${SPEC}.autoapply-tmp")"
      fi
      body_first="$(get_body "$fid" | head -1)"
      bullet="- [auto-applied $fid] (arbiter: $body_first)"
      awk -v line="$oq_end" -v bullet="$bullet" '
        NR == line {print; print bullet; next}
        {print}
      ' "${SPEC}.autoapply-tmp" > "${SPEC}.autoapply-tmp.work" \
        && mv "${SPEC}.autoapply-tmp.work" "${SPEC}.autoapply-tmp"
    else
      printf '\n## Open Questions\n\n- [auto-applied %s]\n' "$fid" >> "${SPEC}.autoapply-tmp"
    fi
  else
    # Load-bearing: Shape A or B.
    eval "kind=\$EK_${fid}"
    eval "old=\$EO_${fid}"
    eval "new=\$EN_${fid}"
    eval "insert=\$EI_${fid}"
    python3 - "${SPEC}.autoapply-tmp" "$kind" "$old" "$insert" "$new" <<'PYEOF' || {
import sys
path, kind, old, insert, new = sys.argv[1:6]
data = open(path).read()
if kind == "A":
    if data.count(old) != 1:
        sys.exit(11)
    data = data.replace(old, new, 1)
else:  # B
    if data.count(insert) != 1:
        sys.exit(12)
    idx = data.find(insert) + len(insert)
    data = data[:idx] + new + data[idx:]
open(path, "w").write(data)
PYEOF
      rm -f "${SPEC}.autoapply-tmp"
      append_abort "apply-failure" "$fid" "$fid mid-apply edit failed (re-validation against in-progress buffer)"
      emit_outcome "menu-apply-failure"
      exit 1
    }
  fi
  # Phase 1b per-finding re-validation: every remaining load-bearing finding's
  # needle must still match exactly once AND fall inside its section body in
  # the in-progress buffer.  Wrong-premise findings have no needle and skip.
  revalidate_remaining "$idx"
  idx=$((idx + 1))
done

# Atomic rename.
if ! mv "${SPEC}.autoapply-tmp" "$SPEC"; then
  rm -f "${SPEC}.autoapply-tmp" 2>/dev/null || true
  append_abort "apply-failure" "n/a" "atomic rename failed"
  emit_outcome "menu-apply-failure"
  exit 1
fi

# Audit append.
SPEC_HASH_POST="$(hash_of "$SPEC")"
ts="$(date '+%Y-%m-%d %H:%M:%S')"
entry="$(cat <<EOF

## Auto-apply — $ts

Preconditions: unanimous=true, mechanical=true, no-defer-or-nice=true, all-edits-validated=true, spec-hash-stable=true, opt-out-not-set=true.
Spec SHA-256 (pre-apply): $SPEC_HASH_PRE
Spec SHA-256 (post-apply): $SPEC_HASH_POST

### Applied
EOF
)"
for fid in "${EXPECTED[@]}"; do
  eval "v=\$FV_${fid}"
  fid_title="$(get_title "$fid")"
  fid_rationale="$(first_rationale_line "$fid")"
  fid_ruler="$(ruled_by "$fid")"
  if [[ "$v" == "wrong-premise" ]]; then
    entry+=$'\n'"- **$fid** [wrong-premise → Open Questions]"
    entry+=$'\n'"  - Title: $fid_title"
    entry+=$'\n'"  - Arbiter rationale (verbatim): $fid_rationale"
    entry+=$'\n'"  - Ruled by: $fid_ruler"
    entry+=$'\n'"  - Spec section touched: \`## Open Questions\`"
  else
    eval "kind=\$EK_${fid}"
    eval "section=\$ES_${fid}"
    eval "old=\$EO_${fid}"
    eval "new=\$EN_${fid}"
    eval "insert=\$EI_${fid}"
    if [[ "$kind" == "A" ]]; then
      entry+=$'\n'"- **$fid** [load-bearing → spec edit (Shape A)]"
      entry+=$'\n'"  - Title: $fid_title"
      entry+=$'\n'"  - Arbiter rationale (verbatim): $fid_rationale"
      entry+=$'\n'"  - Ruled by: $fid_ruler"
      entry+=$'\n'"  - Spec section touched: \`$section\`"
      entry+=$'\n'"  - Old text (verbatim): $old"
      entry+=$'\n'"  - New text (verbatim): $new"
    else
      entry+=$'\n'"- **$fid** [load-bearing → spec edit (Shape B insert-after)]"
      entry+=$'\n'"  - Title: $fid_title"
      entry+=$'\n'"  - Arbiter rationale (verbatim): $fid_rationale"
      entry+=$'\n'"  - Ruled by: $fid_ruler"
      entry+=$'\n'"  - Spec section touched: \`$section\`"
      entry+=$'\n'"  - Anchor (verbatim): $insert"
      entry+=$'\n'"  - Inserted text (verbatim): $new"
    fi
  fi
done
entry+=$'\n'

if ! printf '%s' "$entry" >> "$LOG" 2>/dev/null; then
  echo "⚠ /planning-loop auto-apply: spec WAS modified at $SPEC but audit append to $LOG failed." >&2
  echo "  Inspect via: git diff $SPEC" >&2
  emit_outcome "menu-audit-failure"
  exit 1
fi

emit_outcome "success"
exit 0
