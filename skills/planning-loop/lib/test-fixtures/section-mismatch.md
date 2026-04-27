# Fixture I — section field doesn't match any H2 in spec
# Expected: menu printed; abort entry citing missing section; spec byte-identical.

## Round 3 — 2026-04-27 12:00:00

**Verdict:** needs-attention

```text
Findings:
- [high] F1: Misnamed section
```

## Arbiter — 2026-04-27 12:01:00

**Routing:** 1 detail bullet → code-reviewer

### code-reviewer verdicts (detail)

**F1: load-bearing** — Edit the wrong-named section.
```json
{
  "section": "NonexistentSectionFoo",
  "old_string": "- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits.",
  "new_string": "irrelevant"
}
```
