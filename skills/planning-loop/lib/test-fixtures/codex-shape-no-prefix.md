# Fixture U — round-3 in real-Codex bullet shape (no F-prefix)
# Verifies the parser auto-derives F1, F2 by document order per SKILL.md
# Step 6e Clause 2. Fixtures A-T (20 prior fixtures) all pre-stamp `F1:`/`F2:`,
# which masked a parser/log-writer divergence surfaced by Wave 5 Task 8 smoke.
# Expected: same outcome as Fixture A (auto-apply success path) because the
# auto-derivation should treat these bullets identically to A's.

## Round 3 — 2026-04-28 12:00:00

**Verdict:** needs-attention

```text
Findings:
- [high] Cold-start behavior is undefined
- [medium] OMEGA-MARKER bullet wording is awkward
```

## Arbiter — 2026-04-28 12:01:00

**Routing:** 2 detail bullets → code-reviewer

### code-reviewer verdicts (detail)

**F1: wrong-premise** — The cold-start question is genuinely out of envelope; document in Open Questions.

**F2: load-bearing** — The wording is fine but should be tightened.
```json
{
  "section": "Constraints",
  "old_string": "- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits.",
  "new_string": "- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits. (tightened by arbiter ruling)"
}
```
