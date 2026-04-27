# Fixture J — old_string is unique in spec but falls outside the named section
# Expected: menu printed; abort entry citing match-outside-section; spec byte-identical.

## Round 3 — 2026-04-27 12:00:00

**Verdict:** needs-attention

```text
Findings:
- [high] F1: Wrong section claimed for unique anchor
```

## Arbiter — 2026-04-27 12:01:00

**Routing:** 1 detail bullet → code-reviewer

### code-reviewer verdicts (detail)

**F1: load-bearing** — ALPHA-MARKER appears once in the spec but in Overview, not Constraints.
```json
{
  "section": "Constraints",
  "old_string": "ALPHA-MARKER",
  "new_string": "ALPHA-MARKER (changed)"
}
```
