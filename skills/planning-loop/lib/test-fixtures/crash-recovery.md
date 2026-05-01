# Fixture crash-recovery — §4.7 audit-trail invariant (success)
# Expected: success — receipt printed; spec mutated.
#
# v2 Wave 1 fixture (docs/specs/2026-05-01-claude-adapter-alignment.md §4.7).
# Demonstrates: §3.0a crash-recovery invariant:
#   - SIGTERM during a wave-executor command → terminal
#     `aborted-on-ambiguity` (Stage-B-resumable per schema; not failed).
#   - Re-running the same operation finds the prior receipt by
#     operation_id, sets retry_of via Stage B, proceeds with fresh work.
#   - Companion: clean non-zero exit (no signal) writes status=failed;
#     re-running produces a fresh `started` receipt with NO retry_of
#     chain (failed is terminal per schema, NOT Stage-B-resumable).
#
# The fixture log exercises a clean auto-apply path; the crash-recovery
# property is captured at build time by:
#   1. .harness-state/examples/wave1/commit-1-aborted.yml — example
#      receipt with status=aborted-on-ambiguity (signal exit shape).
#   2. .harness-state/examples/wave1/close-wave-1-failed.yml — example
#      receipt with status=failed (clean non-zero exit shape).
#   3. emit-receipt.sh's EXIT trap implementation — installed by
#      emit_receipt_started; rewrites started receipts at exit; cause
#      driven by EMIT_RECEIPT__TRAP_CAUSE env var (default
#      aborted-on-ambiguity per §3.0a).

## Round 3 — 2026-05-01 14:35:00

**Verdict:** needs-attention

```text
Findings:
- [low] F1: Crash-recovery note missing from Constraints
```

## Arbiter — 2026-05-01 14:36:00

**Routing:** 1 detail bullets → code-reviewer

### code-reviewer verdicts (detail)

**F1: load-bearing** — Append a crash-recovery note.
```json
{
  "section": "Constraints",
  "old_string": "- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits.",
  "new_string": "- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits. (crash-recovery: §4.7 trap EXIT)"
}
```
