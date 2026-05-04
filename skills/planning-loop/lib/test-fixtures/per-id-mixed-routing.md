# Fixture X — per-ID mixed routing (F1 detail-only, F2 mixed)
# Expected: receipt printed; spec mutated; `## Auto-apply —` entry in log.
#
# Surfaces 2026-05-04 bug: pre-fix auto-apply.sh:300-313 globally set
# has_mixed=1 whenever the routing line contained "mixed", then required
# BOTH arbiter rulings for every Fi in EXPECTED. With F1 (detail-only)
# carrying only a CR ruling — correct per SKILL.md §"Mixed-routing-aware
# completeness" — pre-fix would false-abort with `mixed-routing-incomplete`.
#
# Post-fix: per-finding parse extracts ROUTE_F1=detail / ROUTE_F2=mixed;
# only F2 requires both rulings (which it has); auto-apply proceeds to apply
# F2's load-bearing edit. F1's wrong-premise drops to Open Questions.

## Round 3 — 2026-05-04 09:00:00

**Verdict:** needs-attention

```text
Findings:
- [high] F1: Cold-start behavior is undefined
- [medium] F2: OMEGA-MARKER bullet wording is awkward
```

## Arbiter — 2026-05-04 09:01:00

**Routing:** F1 (detail) → code-reviewer | F2 (mixed) → both arbiters

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

### Plan agent verdicts (scope)

**F2: load-bearing** — Scope is correct as written; the detail edit captures the substance.
