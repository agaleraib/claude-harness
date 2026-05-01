# Fixture commit-recovery-key-separation — §4.6 separation property (success)
# Expected: success — receipt printed; spec mutated.
#
# v2 Wave 1 fixture (docs/specs/2026-05-01-claude-adapter-alignment.md §4.6).
# Demonstrates: §3.0a + §4.6 recovery-key separation:
#   - Two no-advance commits on the same branch share operation_id =
#     sha256_hex("commit\n-") but have DIFFERENT idempotency_key
#     because their staged-content digests differ.
#   - Stage A success-lookup uses idempotency_key, not operation_id, so
#     the second commit does NOT no-op against the first.
#   - Mutated content (same paths, different bytes) likewise produces
#     a different idempotency_key and never short-circuits.
#
# The fixture log itself just exercises a clean auto-apply path; the
# §4.6 property is captured at build time by:
#   1. Receipt examples under .harness-state/examples/wave1/:
#      - commit-1-success.yml (advancing — operation_id keyed on spec_path)
#      - commit-1-aborted.yml (no-advance — operation_id keyed on "-")
#   2. The recompute-wave1-keys.sh validator confirms each receipt's
#      idempotency_key is computed correctly from its trace.
#   3. The emit-receipt.sh smoke test confirms Stage A vs B routing.

## Round 3 — 2026-05-01 14:30:00

**Verdict:** needs-attention

```text
Findings:
- [low] F1: Recovery-key separation note missing from Constraints
```

## Arbiter — 2026-05-01 14:31:00

**Routing:** 1 detail bullets → code-reviewer

### code-reviewer verdicts (detail)

**F1: load-bearing** — Append a recovery-key note.
```json
{
  "section": "Constraints",
  "old_string": "- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits.",
  "new_string": "- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits. (recovery-key separation: §4.6)"
}
```
