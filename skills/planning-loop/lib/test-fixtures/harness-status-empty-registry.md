# Fixture harness-status-empty-registry — registry exists but no projects

**Skill under test:** `/harness-status`
**Driver:** `skills/planning-loop/lib/test-fixtures/wave2-fixtures.sh` (function `fx_harness_status_empty_registry`)
**Asserts:** empty registry → success receipt + empty summary; stage_a_exempt: true still applied

## Contract

Set up a registry containing only `projects: []` (empty list). Run scan.sh.

**Pass conditions:**
- Exit code 0.
- Summary `.md` says "no projects registered" or equivalent.
- JSON snapshot is `[]`.
- Receipt has `status: success`, `inputs: [<registry path>]`, `outputs: [<summary md>, <summary json>]`.
- Receipt's `idempotency_key.trace.stage_a_exempt: true` (exemption applies even to empty-registry runs).

Per spec acceptance: "empty registry → receipt is still written, with `inputs: [<resolved registry path>]` ... The exemption still applies — empty-registry receipts also carry `stage_a_exempt: true`."
