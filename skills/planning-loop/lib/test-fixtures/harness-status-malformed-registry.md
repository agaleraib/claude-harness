# Fixture harness-status-malformed-registry — failed receipt + non-zero exit

**Skill under test:** `/harness-status`
**Driver:** `skills/planning-loop/lib/test-fixtures/wave2-fixtures.sh` (function `fx_harness_status_malformed_registry`)
**Asserts:** registry with duplicate `id` → status: failed, exit != 0

## Contract

Set up a registry containing two entries with the same `id` value (e.g., both `id: claude-harness`). Run scan.sh.

**Pass conditions:**
- Exit code != 0 (specifically 2 for registry validation failure per scan.sh exit codes).
- A receipt with `status: failed`.
- Stderr cites the duplicate `id` error.
- No summary `.md` or `.json` file with content (or empty/aborted summary).
- Receipt's `idempotency_key.trace.stage_a_exempt: true` (exemption applies to all `/harness-status` receipts).
