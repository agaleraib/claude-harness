# Fixture P — log-hash mismatch (Wave 5 Task 2 regression test)
# Expected: abort with reason `log-hash-mismatch`; spec byte-identical.
# Failure is injected by the test driver via PLANNING_LOOP_TEST_PIN_LOG_HASH_PRE
# (pinned to a value that cannot match the actual log SHA-256). The auto-apply
# helper captures LOG_HASH_PRE in Phase 1a, then re-checks against
# LOG_HASH_NOW in Phase 1b — when the pin is set, the values differ and the
# helper aborts before any spec mutation.

## Round 3 — 2026-04-27 12:00:00

**Verdict:** needs-attention

```text
Findings:
- [high] F1: Cold-start behavior is undefined
- [medium] F2: OMEGA-MARKER bullet wording is awkward
```

## Arbiter — 2026-04-27 12:01:00

**Routing:** 2 detail bullets → code-reviewer

### code-reviewer verdicts (detail)

**F1: wrong-premise** — The cold-start question is genuinely out of envelope; document in Open Questions.

**F2: load-bearing** — The wording is fine but should be tightened.
```json
{
  "section": "Constraints",
  "old_string": "- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits.",
  "new_string": "- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits. (tightened by arbiter ruling)"
}
```
