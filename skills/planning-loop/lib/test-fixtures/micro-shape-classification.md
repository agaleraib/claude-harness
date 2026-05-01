# Fixture micro-shape-classification — micro-shaped spec; clean auto-apply (success)
# Expected: success — receipt printed; spec mutated; ## Auto-apply — entry.
#
# v2 Wave 1 fixture (docs/specs/2026-05-01-claude-adapter-alignment.md §4.1).
# Demonstrates: a micro-shaped spec (all 5 signals FALSE; ≥2 tasks).
# /spec-planner leaves plan.md untouched; user runs /micro per task with
# /commit between. Auto-apply pipeline still operates correctly on
# micro-shaped specs.

## Round 3 — 2026-05-01 14:05:00

**Verdict:** needs-attention

```text
Findings:
- [low] F1: Micro-shape note missing from Constraints
```

## Arbiter — 2026-05-01 14:06:00

**Routing:** 1 detail bullets → code-reviewer

### code-reviewer verdicts (detail)

**F1: load-bearing** — Add a micro-shape note to Constraints.
```json
{
  "section": "Constraints",
  "old_string": "- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits.",
  "new_string": "- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits. (micro-shape: 0/5 signals true)"
}
```
