# Fixture idempotency — same logical operation, identical idempotency_key (success)
# Expected: success — receipt printed; spec mutated; ## Auto-apply — entry.
#
# v2 Wave 1 fixture (docs/specs/2026-05-01-claude-adapter-alignment.md §4.5).
# Demonstrates: an auto-apply run on a spec; the second invocation on the
# same logical operation (same inputs, same arbiter verdict) computes a
# byte-identical idempotency_key and operation_id. The receipt would
# be the same; subsequent invocations no-op via Stage A.
#
# (run-fixtures.sh runs each fixture once in a fresh tmp directory, so
# the idempotency property here is documented in the fixture's prose
# context — not mechanically asserted via double-invocation. The
# emit-receipt.sh smoke test in /tmp covers double-invocation Stage A
# during build-time validation.)

## Round 3 — 2026-05-01 14:25:00

**Verdict:** needs-attention

```text
Findings:
- [low] F1: Idempotency note missing from Constraints
```

## Arbiter — 2026-05-01 14:26:00

**Routing:** 1 detail bullets → code-reviewer

### code-reviewer verdicts (detail)

**F1: load-bearing** — Append an idempotency note.
```json
{
  "section": "Constraints",
  "old_string": "- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits.",
  "new_string": "- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits. (idempotency: same inputs → same key)"
}
```
