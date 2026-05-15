# Wave 3 — CLOSED

- **Closed:** 2026-04-25
- **Spec:** `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md` — **NOW FULLY SHIPPED** (all 9 tasks [x] across 3 waves)
- **Plan navigator:** `docs/plan.md`
- **Wave 3 commits (worktree, merged):**
  - `e6d6617` — docs(readme): add effort-dimension sentence to orchestrator section (Task 8)
  - `d250bfa` — docs(readme): link orchestrator section to .claude/agents/orchestrator.md (Task 9)
  - `b556c28` — docs(wave3): ship summary file
- **Merge commit:** `146908c` (--no-ff, no conflicts; merge-base was current master HEAD `f417732`)
- **Reconcile commit:** `191897a` (plan.md ticks + spec checklist mirror)
- **Post-merge fixes:** none
- **Pushed to origin:** yes — `origin/master` at `191897a`
- **Deploy:** no deploy hook configured
- **Summary doc:** `docs/2026-04-25-claude-harness-wave3-summary.md`
- **Exit gate:** all 3 checks PASS, annotated in `docs/plan.md` Wave 3 row
- **README diff:** single hunk `@@ -446,6 +446,8 @@`, +2 lines, confined to §"orchestrator (Universal)" (lines 408–469). Multi-agent coordination block + line 932 "~500 tokens at startup" untouched as required.
- **Next:** model-pin spec complete. No Wave 4. Future work: `/run-wave 1` of any new spec.

## Open items carried forward (from earlier waves, NOT introduced by Wave 3)

- **Wave 1 deferred TODO:** Run `/project-init` on a scratch directory and confirm the emitted profile has the `model:` block with stakes-matched `effort_default`. Non-blocking.
- **Wave 2 deferred TODO:** Live JSONL telemetry validation. Run a non-dry-run orchestrator dispatch and confirm Surface A console line shape, JSONL append behavior, exact `task_id`, and a real retry path producing `status: retried` with populated `retried_from`. Non-blocking.

## Open Questions still open

- **OQ#1** — per-agent effort override map. Partially constrained by Task 4's per-task `**Effort:**` hint affordance.
- **OQ#3** — effort in spec-planner output. Same partial constraint.
- **OQ#4** — model.primary updater (who bumps the pin when next Anthropic model ships). Untouched.

## Spec deviations (Wave 3)

1. Used spec's recommended verbatim wording for the effort sentence — allowed by spec.
2. Link placement: follow-on sentence inside the same paragraph as the effort sentence (spec hinted "follow-on or parenthetical"; chose follow-on).
3. Orchestrator flagged Wave 3's `grep -nA 2 "orchestrator (Universal)"` exit-gate window is too narrow — the new sentence sits ~41 lines below the heading. Treated as PASS under intent (the actual content checks pass via `grep -n "effort"` and the diff hunk inspection). Worth fixing in future wave-spec authoring: use `grep -A 50` or anchor to the bullet list rather than the section heading.

## Spec-shipped summary (across all 3 waves)

| Wave | Merge | Tasks | Highlight |
|------|-------|-------|-----------|
| 1 | `4109de6` | T1, T2 | `.harness-profile model:` block + project-init schema docs |
| 2 | `4753502` | T3–T7 | orchestrator routing-table effort column, per-task `**Effort:**` hint, §Logging Contract (Surface A + JSONL), stable `task_id`, generalized retry rung |
| 3 | `146908c` | T8, T9 | README §"orchestrator (Universal)" effort sentence + relative link |

Three SB `/tokens` forward-compat tracks landed (JSONL log schema, stable `task_id`, optional `effort_cost_multiplier`). 10 design-review gaps closed. Two manual verify TODOs deferred for any future micro-session.
