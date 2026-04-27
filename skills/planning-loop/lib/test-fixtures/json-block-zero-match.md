# Fixture F — JSON block valid but old_string matches 0 times in spec
# Expected: menu printed; abort entry; spec byte-identical.

## Round 3 — 2026-04-27 12:00:00

**Verdict:** needs-attention

```text
Findings:
- [high] F1: Stale recommendation
```

## Arbiter — 2026-04-27 12:01:00

**Routing:** 1 detail bullet → code-reviewer

### code-reviewer verdicts (detail)

**F1: load-bearing** — Replace text that no longer exists in the spec.
```json
{
  "section": "Constraints",
  "old_string": "this exact text never appears anywhere in the synthetic-spec",
  "new_string": "irrelevant"
}
```
