# Fixture missing-manual-fallback — needs-attention with no JSON edit (menu)
# Expected: menu — auto-apply aborts to validation-failure (no JSON block);
# verdict is needs-attention citing the missing fallback. Spec byte-identical.
#
# v2 Wave 1 fixture (docs/specs/2026-05-01-claude-adapter-alignment.md §4.2).
# Demonstrates: Codex's portability criterion fires when an implementation
# task is missing its `Manual fallback:` sub-bullet. The arbiter classifies
# the finding load-bearing but does NOT emit a JSON edit block (the fix is
# spec-author-authored, not mechanical), so auto-apply aborts to the menu.

## Round 3 — 2026-05-01 14:15:00

**Verdict:** needs-attention

```text
Findings:
- [high] F1: Task 3 has no `Manual fallback:` sub-bullet — fails the portability criterion (v2 protocol §"Manual is primary"). Spec hard-requires Claude Code as the only execution path.
```

## Arbiter — 2026-05-01 14:16:00

**Routing:** 1 detail bullets → code-reviewer

### code-reviewer verdicts (detail)

**F1: load-bearing** — The Manual fallback bullet is genuinely missing; the spec is non-portable. Adding it requires the spec author's judgment about how a human would complete the task with git + editor + gh; arbiter does NOT mechanize this fix. No JSON block emitted; falls through to the 4-option menu so the user can address it.
