#!/usr/bin/env bash
# recompute-keys.sh — deterministic cross-adapter key validator
#
# Reads each receipt's idempotency_key.trace (FROZEN pre-image), recomputes
# the canonical SHA-256 chain per spec §4.2 of
# docs/specs/2026-04-30-universal-harness-protocol-v2.md, and asserts:
#   1. embedded idempotency_key.value == recomputed key (per receipt)
#   2. both receipts' idempotency_key.value values are equal (cross-adapter)
#
# Does NOT re-hash any live filesystem path. Trace is the frozen pre-image
# per spec §4.2 "at the time work starts."
#
# Exit 0 on full agreement; exit 1 with diff message on any mismatch.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Pick the SHA-256 binary that's available
if command -v sha256sum >/dev/null 2>&1; then
  sha256_bin() { sha256sum | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  sha256_bin() { shasum -a 256 | awk '{print $1}'; }
else
  echo "ERROR: neither sha256sum nor shasum is available" >&2
  exit 1
fi

# extract_trace_value <receipt> <field>
# Returns the value of `idempotency_key.trace.<field>` for scalar string fields
# (command, wave_id_or_spec_path, input_content_digest). Strips inline comments
# and leading/trailing whitespace and surrounding quotes.
extract_trace_value() {
  local file="$1" field="$2"
  awk -v f="$field" '
    /^idempotency_key:/ { in_ik=1; next }
    in_ik && /^[[:alnum:]_]+:/ && !/^idempotency_key:/ { in_ik=0 }
    in_ik && /^  trace:/ { in_trace=1; next }
    in_trace && /^  [[:alnum:]_]/ && !/^  trace:/ { in_trace=0 }
    in_trace && $0 ~ "^    "f":" {
      sub("^    "f":[[:space:]]*", "")
      sub("[[:space:]]*$", "")
      gsub(/^"|"$/, "")
      print
      exit
    }
  ' "$file"
}

# extract_sorted_inputs <receipt>
# Returns the literal "<path>:<digest>" entries under
# idempotency_key.trace.sorted_inputs, one per line, in file order
# (which is the lexicographic order at receipt-write time per spec §4.2).
extract_sorted_inputs() {
  local file="$1"
  awk '
    /^idempotency_key:/ { in_ik=1; next }
    in_ik && /^[[:alnum:]_]+:/ && !/^idempotency_key:/ { in_ik=0 }
    in_ik && /^  trace:/ { in_trace=1; next }
    in_trace && /^  [[:alnum:]_]/ && !/^  trace:/ { in_trace=0 }
    in_trace && /^    sorted_inputs:/ { in_si=1; next }
    in_si && /^    [[:alnum:]_]/ && !/^    sorted_inputs:/ { in_si=0 }
    in_si && /^      - / {
      line=$0
      sub("^      - ", "", line)
      gsub(/^"|"$/, "", line)
      print line
    }
  ' "$file"
}

# extract_embedded_key <receipt>
# Returns idempotency_key.value (the precomputed key embedded in the receipt).
extract_embedded_key() {
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

# recompute_key <receipt>
# Parses trace, reconstructs the joined input-digest pre-image, computes
# the inner SHA-256 (input_content_digest), then computes the outer
# SHA-256 over <command>\n<wave_id>\n<input_content_digest>.
#
# Also asserts the trace's recorded input_content_digest matches what
# we recompute from sorted_inputs — that catches trace-tampering where
# someone edits sorted_inputs without updating the inner digest.
recompute_key() {
  local file="$1"
  local cmd wave_or_spec recorded_inner inputs_joined recomputed_inner outer_pre recomputed_key

  cmd=$(extract_trace_value "$file" command)
  wave_or_spec=$(extract_trace_value "$file" wave_id_or_spec_path)
  recorded_inner=$(extract_trace_value "$file" input_content_digest)

  if [[ -z "$cmd" || -z "$wave_or_spec" || -z "$recorded_inner" ]]; then
    echo "ERROR: $file — missing trace.command / wave_id_or_spec_path / input_content_digest" >&2
    return 1
  fi

  # Build joined inputs string: "<path>:<digest>" lines joined by single LF, no trailing newline
  inputs_joined=$(extract_sorted_inputs "$file" | awk 'BEGIN{first=1} {if(first){printf "%s",$0; first=0} else {printf "\n%s",$0}}')

  if [[ -z "$inputs_joined" ]]; then
    echo "ERROR: $file — trace.sorted_inputs is empty" >&2
    return 1
  fi

  recomputed_inner=$(printf '%s' "$inputs_joined" | sha256_bin)

  if [[ "$recomputed_inner" != "$recorded_inner" ]]; then
    echo "MISMATCH ($file): trace.input_content_digest tampered" >&2
    echo "  recorded:   $recorded_inner" >&2
    echo "  recomputed: $recomputed_inner" >&2
    return 1
  fi

  outer_pre=$(printf '%s\n%s\n%s' "$cmd" "$wave_or_spec" "$recomputed_inner")
  recomputed_key=$(printf '%s' "$outer_pre" | sha256_bin)

  printf '%s' "$recomputed_key"
}

main() {
  local manual_receipt="$SCRIPT_DIR/manual-close-wave-6.yml"
  local claude_receipt="$SCRIPT_DIR/claude-close-wave-6.yml"

  for f in "$manual_receipt" "$claude_receipt"; do
    if [[ ! -f "$f" ]]; then
      echo "ERROR: missing receipt $f" >&2
      exit 1
    fi
  done

  echo "== recomputing keys from frozen trace blocks =="
  echo

  local manual_embedded manual_recomputed claude_embedded claude_recomputed
  manual_embedded=$(extract_embedded_key "$manual_receipt")
  claude_embedded=$(extract_embedded_key "$claude_receipt")
  manual_recomputed=$(recompute_key "$manual_receipt")
  claude_recomputed=$(recompute_key "$claude_receipt")

  printf 'manual  embedded   = %s\n' "$manual_embedded"
  printf 'manual  recomputed = %s\n' "$manual_recomputed"
  printf 'claude  embedded   = %s\n' "$claude_embedded"
  printf 'claude  recomputed = %s\n' "$claude_recomputed"
  echo

  local fail=0

  if [[ "$manual_embedded" != "$manual_recomputed" ]]; then
    echo "FAIL: manual receipt embedded key != recomputed key"
    fail=1
  else
    echo "OK:   manual receipt embedded key == recomputed key"
  fi

  if [[ "$claude_embedded" != "$claude_recomputed" ]]; then
    echo "FAIL: claude receipt embedded key != recomputed key"
    fail=1
  else
    echo "OK:   claude receipt embedded key == recomputed key"
  fi

  if [[ "$manual_embedded" != "$claude_embedded" ]]; then
    echo "FAIL: cross-adapter equality broken — manual key != claude key"
    echo "  manual: $manual_embedded"
    echo "  claude: $claude_embedded"
    fail=1
  else
    echo "OK:   cross-adapter equality holds (manual key == claude key)"
  fi

  if [[ "$fail" -ne 0 ]]; then
    echo
    echo "== recompute-keys.sh: FAIL =="
    exit 1
  fi

  echo
  echo "== recompute-keys.sh: PASS =="
  exit 0
}

main "$@"
