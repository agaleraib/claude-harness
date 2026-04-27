# Fixture K — new_string contains a line starting with `## Foo`
# Expected: menu printed; abort entry citing H2-in-edit-text; spec byte-identical.

## Round 3 — 2026-04-27 12:00:00

**Verdict:** needs-attention

```text
Findings:
- [high] F1: Edit text would inject an H2 heading
```

## Arbiter — 2026-04-27 12:01:00

**Routing:** 1 detail bullet → code-reviewer

### code-reviewer verdicts (detail)

**F1: load-bearing** — Tighten by inserting a fake heading (which the contract MUST reject).
```json
{
  "section": "Constraints",
  "old_string": "- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits.",
  "new_string": "- The OMEGA-MARKER bullet.\n## Foo\nThis would break Markdown structure."
}
```
