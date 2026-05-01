# Fixture wave-shape-classification — wave-shaped spec; clean auto-apply (success)
# Expected: success — receipt printed; spec mutated; ## Auto-apply — entry.
#
# v2 Wave 1 fixture (docs/specs/2026-05-01-claude-adapter-alignment.md §4.1).
# Demonstrates: a wave-shaped spec (parallelism rank ≥2 in any layer)
# that triggers the auto-append + run-wave/close-wave flow per the
# /spec-planner shape-consequence table. Auto-apply pipeline still
# operates correctly on wave-shaped specs.
#
# Note: classification semantics are captured in the synthetic spec's
# prose context; the runner asserts the mechanical auto-apply outcome.

## Round 3 — 2026-05-01 14:00:00

**Verdict:** needs-attention

```text
Findings:
- [high] F1: Cold-start behavior is undefined
- [medium] F2: OMEGA-MARKER bullet wording is awkward
```

## Arbiter — 2026-05-01 14:01:00

**Routing:** 2 detail bullets → code-reviewer

### code-reviewer verdicts (detail)

**F1: wrong-premise** — Cold-start is genuinely out of envelope for this wave-shaped spec; document in Open Questions per the auto-apply pipeline.

**F2: load-bearing** — The wording in Constraints needs a wave-shape note appended.
```json
{
  "section": "Constraints",
  "old_string": "- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits.",
  "new_string": "- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits. (wave-shape: parallelism rank 2)"
}
```
