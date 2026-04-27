# Fixture N — opt-out via .harness-profile planning_loop.auto_apply: false
# Driver places a synthetic .harness-profile in the test cwd.
# Expected: menu printed; abort entry with reason opt-out-set;
# spec byte-identical to pre-run state.

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

**F1: wrong-premise** — Out of envelope.

**F2: load-bearing** — Tighten.
```json
{
  "section": "Constraints",
  "old_string": "- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits.",
  "new_string": "- The OMEGA-MARKER bullet (tightened by Fixture N run — should never apply)."
}
```
