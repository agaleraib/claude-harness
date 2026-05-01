# Fixture preflight-abort-readonly-state — read-only .harness-state/ aborts (preflight-abort)
# Expected: preflight-abort — auto-apply.sh aborts before any side effect
# when .harness-state/ is unwritable. Spec byte-identical.
#
# v2 Wave 1 fixture (docs/specs/2026-05-01-claude-adapter-alignment.md §4.8).
# Demonstrates: when .harness-state/ is chmod'd read-only, /run-wave,
# /close-wave, and /commit each abort BEFORE any underlying side effect.
# No worktree, no merge, no commit; clear stderr error citing
# .harness-state/ write failure.
#
# AUTO-APPLY-LAYER property: this fixture log triggers Phase 1a-pre's
# WORKFLOW.md row delta gate (a semantically-equivalent preflight-abort
# code path) so the auto-apply runner outcome tag matches.
# EMIT-RECEIPT-LAYER property: §4.8 acceptance criteria (chmod 0500 on
# .harness-state/ → preflight rc=2 for /run-wave, /close-wave, /commit;
# no receipt files written) are mechanically asserted by
# `emit-receipt-mechanical.sh` (invoked by run-fixtures.sh after the
# auto-apply fixtures). All three command preflights plus the
# zero-receipts assertion must pass for §4.8 to be satisfied.

## Round 3 — 2026-05-01 14:40:00

**Verdict:** needs-attention

```text
Findings:
- [high] F1: spec adds /readonly-fixture-command but no WORKFLOW.md row delta
```

## Arbiter — 2026-05-01 14:41:00

**Routing:** 1 detail bullets → code-reviewer

### code-reviewer verdicts (detail)

**F1: load-bearing** — WORKFLOW.md row delta is missing for /readonly-fixture-command. Phase 1a-pre will abort before this verdict reaches the apply path.
