# Fixture S — needle duplicated by prior edit (Wave 5 Task 3 regression test)
# Expected: F1 lands; F2's substring count in the in-progress buffer grows to
# 2 because F1's new_string introduces another OMEGA-MARKER occurrence.
# Phase 1b per-finding re-validation MUST detect this and abort with reason
# `apply-failure` naming F2; live spec MUST be byte-identical (atomic mv never
# fired).  Fixture must drive the real lib/auto-apply.sh.

## Round 3 — 2026-04-27 12:00:00

**Verdict:** needs-attention

```text
Findings:
- [high] F1: ALPHA-MARKER prose should explicitly cite OMEGA-MARKER
- [medium] F2: OMEGA-MARKER bullet wording is awkward
```

## Arbiter — 2026-04-27 12:01:00

**Routing:** 2 detail bullets → code-reviewer

### code-reviewer verdicts (detail)

**F1: load-bearing** — Cite the constraint anchor explicitly via a verbatim duplicate of the bullet text.
```json
{
  "section": "Overview",
  "old_string": "The phrase ALPHA-MARKER appears\nexactly once in the Overview section.",
  "new_string": "The phrase ALPHA-MARKER appears\nexactly once in the Overview section.\nFor reference:\n- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits."
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
