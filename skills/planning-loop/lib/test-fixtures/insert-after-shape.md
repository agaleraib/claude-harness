# Fixture G — Shape B (insert_after) success path
# Expected: receipt printed; inserted text appears immediately after anchor.

## Round 3 — 2026-04-27 12:00:00

**Verdict:** needs-attention

```text
Findings:
- [medium] F1: Need a third Constraints bullet
```

## Arbiter — 2026-04-27 12:01:00

**Routing:** 1 detail bullet → code-reviewer

### code-reviewer verdicts (detail)

**F1: load-bearing** — Add a third constraint.
```json
{
  "section": "Constraints",
  "insert_after": "- Constraint two: no third-party HTTP calls in the hot path.",
  "new_string": "\n- Constraint three (inserted by arbiter ruling): no synchronous disk I/O during request handling."
}
```
