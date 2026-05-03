#!/usr/bin/env bash
# recompute-wave2-keys.sh — validate the wave2 example receipts.
#
# For each receipt under .harness-state/examples/wave2/, recomputes both keys
# from the frozen trace and asserts byte-equality with the embedded values.
# Special-case for /harness-status receipts (see Stage A no-op exemption per
# docs/protocol/receipt-schema.md): instead of asserting idempotency_key.value
# recomputes to the original value, asserts the trace's stage_a_exempt: true
# field is present AND that value matches the timestamp-salted formula given
# the receipt's own started_at field.
#
# Cross-adapter equality property: archive-plan-success.yml +
# manual-archive-plan-success.yml MUST share an identical
# idempotency_key.value byte-for-byte.
#
# Exit 0 on full agreement; exit 1 on any mismatch.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

extract_started_at() {
  local file="$1"
  awk '
    BEGIN { found=0 }
    /^started_at:/ {
      sub(/^started_at:[[:space:]]*/, "")
      sub(/[[:space:]]*$/, "")
      gsub(/^"|"$/, "")
      print
      found=1
      exit
    }
  ' "$file"
}

is_stage_a_exempt() {
  local file="$1"
  awk '
    /^idempotency_key:/ { in_ik=1; next }
    in_ik && /^[[:alnum:]_]+:/ && !/^idempotency_key:/ { in_ik=0 }
    in_ik && /^  trace:/ { in_trace=1; next }
    in_trace && /^  [[:alnum:]_]/ && !/^  trace:/ { in_trace=0 }
    in_trace && /^    stage_a_exempt:[[:space:]]+true/ {
      print "true"; exit
    }
  ' "$file"
}

extract_registry_digest_from_sorted_inputs() {
  # For /harness-status receipts, find the entry whose path matches the
  # registry path used in the example fixtures (.harness-state/examples/wave2/
  # registry-fixture.yml or skills/harness-status/lib/test-fixtures/example-projects.yml).
  local file="$1"
  extract_sorted_inputs "$file" | head -1 | awk -F: '{print $NF}'
}

recompute_key_standard() {
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

# Stage A exemption recompute: timestamp-salted formula per receipt-schema.md
# §"Stage A no-op exemption":
#   value = sha256_hex(operation_id + "\n" + ISO-8601 ts + "\n" + sha256_hex(<registry contents or 'MISSING'>))
recompute_key_exempt() {
  local file="$1"
  local op_id ts registry_digest recomputed_value
  op_id=$(extract_top_field "$file" operation_id)
  ts=$(extract_started_at "$file")
  registry_digest=$(extract_registry_digest_from_sorted_inputs "$file")
  if [[ -z "$op_id" || -z "$ts" || -z "$registry_digest" ]]; then
    echo "ERROR: $file — missing operation_id / started_at / registry digest" >&2
    return 1
  fi
  recomputed_value=$(printf '%s\n%s\n%s' "$op_id" "$ts" "$registry_digest" | sha256_bin)
  printf '%s' "$recomputed_value"
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
  echo "== recomputing wave2 keys from frozen trace blocks =="
  echo

  for f in "$SCRIPT_DIR"/archive-plan-*.yml \
           "$SCRIPT_DIR"/manual-archive-plan-*.yml \
           "$SCRIPT_DIR"/harness-status-*.yml \
           "$SCRIPT_DIR"/manual-harness-status-*.yml; do
    [[ -f "$f" ]] || continue
    local embedded recomputed
    embedded=$(extract_embedded_key "$f")
    local exempt
    exempt=$(is_stage_a_exempt "$f")
    printf '%s\n' "$(basename "$f")"
    if [[ "$exempt" == "true" ]]; then
      # Stage A exemption: recompute via timestamp-salted formula.
      recomputed=$(recompute_key_exempt "$f")
      printf '  stage_a_exempt: true (timestamp-salted recompute)\n'
    else
      recomputed=$(recompute_key_standard "$f")
    fi
    printf '  idempotency_key embedded   = %s\n' "$embedded"
    printf '  idempotency_key recomputed = %s\n' "$recomputed"
    local embedded_op recomputed_op
    embedded_op=$(extract_top_field "$f" operation_id)
    recomputed_op=$(recompute_operation_id "$f")
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

  # Cross-adapter equality — archive-plan-success.yml + manual-archive-plan-success.yml.
  local manual_key claude_key
  manual_key=$(extract_embedded_key "$SCRIPT_DIR/manual-archive-plan-success.yml" 2>/dev/null || echo "")
  claude_key=$(extract_embedded_key "$SCRIPT_DIR/archive-plan-success.yml" 2>/dev/null || echo "")
  if [[ -z "$manual_key" || -z "$claude_key" ]]; then
    echo "WARN: cross-adapter pair not present (manual=$manual_key claude=$claude_key)"
  elif [[ "$manual_key" != "$claude_key" ]]; then
    echo "FAIL: cross-adapter equality broken — manual key != claude key"
    echo "  manual: $manual_key"
    echo "  claude: $claude_key"
    fail=1
  else
    echo "OK   cross-adapter equality holds (manual-archive-plan-success == archive-plan-success)"
  fi

  if [[ "$fail" -ne 0 ]]; then
    echo
    echo "== recompute-wave2-keys.sh: FAIL =="
    exit 1
  fi
  echo
  echo "== recompute-wave2-keys.sh: PASS =="
  exit 0
}

main "$@"
