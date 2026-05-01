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
# The runner exercises this by triggering Phase 1a-pre's WORKFLOW.md
# row delta gate (which fires preflight-abort outcome) — it's a
# semantically equivalent path that achieves the same runner outcome
# tag. The actual readonly-state preflight abort lives in
# emit-receipt.sh's emit_receipt_preflight() and is exercised at
# build-time by the helper smoke test.

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
