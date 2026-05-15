# Wave 9 — CLOSED

- **Closed:** 2026-05-01
- **Merge commit:** `a5c844b` — Wave 9: Claude Code adapter alignment (v2 Wave 1)
- **Reconcile commit:** `af19192` — docs(plan): close Wave 9 + reconcile OQs
- **Post-merge fixes:** none (Codex review fixes `0ec37dd`, `fd5a972`, `ec23025` were pre-merge inside the worktree, folded into `a5c844b`)
- **Pushed to origin:** yes — `origin/master = af19192`
- **Deploy:** no deploy hook configured (claude-harness ships skills via outgoing symlinks, not a runtime deploy). Cross-repo `skills/_shared/` consumer-side symlink created in Step 6: `/Users/klorian/.claude/skills/_shared -> /Users/klorian/workspace/claude-harness/skills/_shared`.
- **Summary doc:** `docs/2026-05-01-claude-harness-wave9-summary.md`
- **Spec:** `docs/specs/2026-05-01-claude-adapter-alignment.md` (622 lines, master `406c0fe`)
- **Cross-adapter idempotency_key equality (Wave 1 protocol portability proof):** `b408b9172128d7a254025695fa66b0b8b93eb77e5300eb0aff00d0ff3986d53f` byte-stable between `manual-close-wave-1-success.yml` and `close-wave-1-success.yml`. Wave 8 canonical key `238e61ca…39587b` also still PASS — no regression.
- **Fixture suite:** 44/44 PASS (15 auto-apply A–O + 9 Wave-1 V1–V9 + W2 + 14 emit-receipt mechanical + 5 receipt-example recomputers).
- **Codex review applied:** between `/run-wave` and `/close-wave`; caught 3 BLOCKERs + 3 MAJORs + 1 MINOR after orchestrator self-verification PASS; all closed inside the worktree pre-merge.
- **Next wave opening:** plan.md ends at Wave 9. Next wave (v2 Wave 2 — `/archive-plan` + `/harness-status`) is in spec §8 of `docs/specs/2026-04-30-universal-harness-protocol-v2.md` but no plan.md entry exists yet — `/spec-planner` writes it on next dispatch.
- **Open items carried forward:**
  - OQ #3 — wave-shape signal #5 measurement (deferred per spec; revisit when this skill ships to a multi-dev consumer repo)
  - OQ #6 — orphan-started 60-min staleness constant (deferred per spec; document the constant in SKILL bodies; revisit if any consumer repo's dispatch routinely exceeds 60 min)
  - OQ #7 — preflight free-disk-space check (out of scope per spec; writability probe inherently catches disk-full)
  - OQ #8 — `.recovery-needed` marker file format (deferred per spec; one-line text is sufficient for manual-recovery audience)
- **Receipt itself:** the `/close-wave 9` invocation that produced this file ran without emit-receipt.sh wiring (the helper landed in the same wave; first /close-wave to use it ships next wave).
