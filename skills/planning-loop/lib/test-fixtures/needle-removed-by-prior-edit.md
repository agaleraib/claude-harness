# Fixture T — needle removed (or shifted out of section) by prior edit
# (Wave 5 Task 3 regression test)
#
# Expected: F1 lands; the buffer no longer contains F2's old_string at all
# because F1's old_string overlapped F2's old_string and the replacement
# text doesn't include it.  Phase 1b per-finding re-validation MUST detect
# the count==0 in the buffer and abort with reason `apply-failure` naming
# F2; live spec MUST be byte-identical.  Fixture must drive the real
# lib/auto-apply.sh.

## Round 3 — 2026-04-27 12:00:00

**Verdict:** needs-attention

```text
Findings:
- [high] F1: Tighten Constraint two and re-anchor the section
- [medium] F2: OMEGA-MARKER bullet wording is awkward
```

## Arbiter — 2026-04-27 12:01:00

**Routing:** 2 detail bullets → code-reviewer

### code-reviewer verdicts (detail)

**F1: load-bearing** — Tighten Constraint two and rewrite the trailing bullet so the section reads cleaner.
```json
{
  "section": "Constraints",
  "old_string": "- Constraint two: no third-party HTTP calls in the hot path.\n- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits.",
  "new_string": "- Constraint two: no third-party HTTP calls in the hot path.\n- A reworked anchor bullet replaces the prior OMEGA marker."
}
```

**F2: load-bearing** — Tighten the OMEGA-MARKER bullet.
```json
{
  "section": "Constraints",
  "old_string": "- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits.",
  "new_string": "- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits. (tightened by arbiter ruling)"
}
```
