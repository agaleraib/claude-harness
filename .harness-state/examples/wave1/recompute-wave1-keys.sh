#!/usr/bin/env bash
# recompute-wave1-keys.sh — validate the wave1 example receipts.
#
# Reuses the canonical algorithm from
# .harness-state/examples/recompute-keys.sh; for each receipt under
# .harness-state/examples/wave1/, recomputes both keys from the frozen
# trace and asserts byte-equality with the embedded values.
#
# Cross-adapter equality property: close-wave-1-success.yml +
# manual-close-wave-1-success.yml MUST share identical idempotency_key.value.
#
# Exit 0 on full agreement; exit 1 on any mismatch.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_RECOMPUTER="$SCRIPT_DIR/../recompute-keys.sh"

if [[ ! -f "$PARENT_RECOMPUTER" ]]; then
  echo "ERROR: parent recomputer missing: $PARENT_RECOMPUTER" >&2
  exit 2
fi

# Source the parent's helper functions by extracting the function bodies.
# We can't easily source it without triggering its main() entry, so we
# inline the same algorithm here. This script + the parent share the
# canonical algorithm by hand.

if command -v sha256sum >/dev/null 2>&1; then
  sha256_bin() { sha256sum | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  sha256_bin() { shasum -a 256 | awk '{print $1}'; }
else
  echo "ERROR: neither sha256sum nor shasum is available" >&2
  exit 1
fi

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

extract_top_field() {
  local file="$1" field="$2"
  awk -v f="$field" '
    BEGIN { found=0 }
    /^[[:space:]]/ { next }
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

recompute_operation_id() {
  local file="$1"
  local cmd wave_or_spec
  cmd=$(extract_trace_value "$file" command)
  wave_or_spec=$(extract_trace_value "$file" wave_id_or_spec_path)
  printf '%s' "$(printf '%s\n%s' "$cmd" "$wave_or_spec" | sha256_bin)"
}

main() {
  local fail=0
  local f
  echo "== recomputing wave1 keys from frozen trace blocks =="
  echo
  for f in "$SCRIPT_DIR"/run-wave-1-*.yml \
           "$SCRIPT_DIR"/close-wave-1-*.yml \
           "$SCRIPT_DIR"/commit-1-*.yml \
           "$SCRIPT_DIR"/manual-close-wave-1-*.yml; do
    [[ -f "$f" ]] || continue
    local embedded recomputed embedded_op recomputed_op
    embedded=$(extract_embedded_key "$f")
    recomputed=$(recompute_key "$f")
    embedded_op=$(extract_top_field "$f" operation_id)
    recomputed_op=$(recompute_operation_id "$f")
    printf '%s\n' "$(basename "$f")"
    printf '  idempotency_key embedded   = %s\n' "$embedded"
    printf '  idempotency_key recomputed = %s\n' "$recomputed"
    printf '  operation_id    embedded   = %s\n' "$embedded_op"
    printf '  operation_id    recomputed = %s\n' "$recomputed_op"
    if [[ "$embedded" != "$recomputed" ]]; then
      echo "  FAIL idempotency_key mismatch"
      fail=1
    else
      echo "  OK   idempotency_key"
    fi
    if [[ "$embedded_op" != "$recomputed_op" ]]; then
      echo "  FAIL operation_id mismatch"
      fail=1
    else
      echo "  OK   operation_id"
    fi
    echo
  done

  # Cross-adapter equality
  local manual_key claude_key
  manual_key=$(extract_embedded_key "$SCRIPT_DIR/manual-close-wave-1-success.yml")
  claude_key=$(extract_embedded_key "$SCRIPT_DIR/close-wave-1-success.yml")
  if [[ "$manual_key" != "$claude_key" ]]; then
    echo "FAIL: cross-adapter equality broken — manual key != claude key"
    echo "  manual: $manual_key"
    echo "  claude: $claude_key"
    fail=1
  else
    echo "OK   cross-adapter equality holds (manual-close-wave-1 == close-wave-1)"
  fi

  if [[ "$fail" -ne 0 ]]; then
    echo
    echo "== recompute-wave1-keys.sh: FAIL =="
    exit 1
  fi
  echo
  echo "== recompute-wave1-keys.sh: PASS =="
  exit 0
}

main "$@"
