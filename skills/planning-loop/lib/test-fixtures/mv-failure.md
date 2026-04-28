# Fixture R — mv-failure (Wave 5 Task 9 regression test)
# Expected: abort with reason `apply-failure` and Detail containing
# `errno=<non-zero numeric>`. Spec MUST be byte-identical (atomic rename
# never landed). Failure is injected via PLANNING_LOOP_TEST_FORCE_MV_FAIL=1.

## Round 3 — 2026-04-27 12:00:00

**Verdict:** needs-attention

```text
Findings:
- [medium] F1: OMEGA-MARKER bullet wording is awkward
```

## Arbiter — 2026-04-27 12:01:00

**Routing:** 1 detail bullet → code-reviewer

### code-reviewer verdicts (detail)

**F1: load-bearing** — The wording is fine but should be tightened.
```json
{
  "section": "Constraints",
  "old_string": "- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits.",
  "new_string": "- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits. (tightened by arbiter ruling)"
}
```
