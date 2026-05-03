# Fixture harness-status-stage-a-exempt — load-bearing Stage A no-op exemption

**Skill under test:** `/harness-status`
**Driver:** `skills/planning-loop/lib/test-fixtures/wave2-fixtures.sh` (function `fx_harness_status_stage_a_exempt`)
**Asserts:** two consecutive runs with frozen state produce DIFFERENT `idempotency_key.value`; git-state-only change is reflected in second summary

## Contract

This is the load-bearing assertion proving the Stage A exemption is wired correctly per spec §5.4 / `docs/protocol/receipt-schema.md`.

### Part 1: Two consecutive runs with frozen state

Set up a registry pointing at one `git init`'d sandbox repo. Run scan.sh once; capture the receipt's `idempotency_key.value`. Sleep 1 second. Run scan.sh again with no changes anywhere; capture the second receipt's `idempotency_key.value`.

**Pass conditions:**
- Both receipts have `idempotency_key.trace.stage_a_exempt: true`.
- The two `idempotency_key.value` strings are **DIFFERENT** byte-for-byte (timestamp differs).
- Both runs exit 0.

This is the inverse of every other command's idempotency assertion. The exemption explicitly causes the receipt's outer key to differ across invocations — even when input file contents are unchanged — because git state lives outside the receipt input file set.

### Part 2: Git-state-only change reflected in second summary

After Part 1, modify the sandbox repo's working tree (e.g., `touch new-file.txt`). Run scan.sh a third time.

**Pass conditions:**
- The third summary `.md` contains `dirty (1 files)` for the sandbox repo (whereas runs 1 and 2 said `clean`).
- The third receipt's `idempotency_key.value` differs from runs 1 and 2.
- Exit code 0.

This proves the exemption avoids stale-snapshot no-ops: a git-state-only change is reflected in the summary rather than short-circuiting on a prior `success` receipt with matching file inputs.

### Part 3: recompute-keys.sh special case

The Wave 2 recompute script (`.harness-state/examples/wave2/recompute-wave2-keys.sh`) handles `/harness-status` receipts as a special case: instead of asserting `idempotency_key.value` recomputes to the original value, it asserts `stage_a_exempt: true` is present in the trace AND that `value` matches the timestamp-salted formula given the receipt's own `started_at` field.

**Pass condition:** `bash .harness-state/examples/wave2/recompute-wave2-keys.sh` exit 0 with the per-receipt special-case logic applied to all `harness-status-*.yml` examples.
