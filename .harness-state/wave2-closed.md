# Wave 2 — CLOSED

- **Closed:** 2026-04-25
- **Spec:** `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md`
- **Plan navigator:** `docs/plan.md`
- **Wave 2 commits (worktree, merged):**
  - `79b9ab9` — feat(orchestrator): effort-augmented routing table + selection rules (Task 3)
  - `3e4ad14` — feat(orchestrator): per-task `**Effort:**` hint parsing (Task 4)
  - `efb32a4` — feat(orchestrator): §Logging Contract Surface A + JSONL (Task 5)
  - `69081b3` — feat(orchestrator): stable `task_id = {spec_basename}:{task_marker}` (Task 6)
  - `92f87f3` — feat(orchestrator): generalize retry-escalation rung (Task 7)
  - `0e1645e` — docs: Wave 2 summary file
- **Merge commit:** `4753502` (--no-ff)
  - Three-way merge cleanly preserved master's `13ed67e` (close-wave Step 7 clarification) — worktree's merge-base was `341d1d6`, missed the clarification commit; only master modified that file, so master's edit won.
- **Reconcile commit:** `f417732` (plan.md ticks + spec checklist mirror)
- **Carried-over commit:** `13ed67e` — `docs(close-wave): clarify Step 7 — graph KB vs file-based auto-memory`. Committed before /run-wave 2 dispatch; pushed in this same close.
- **Post-merge fixes:** none (no smoke detour required)
- **Pushed to origin:** yes — `origin/master` at `f417732`
- **Deploy:** no deploy hook configured
- **Summary doc:** `docs/2026-04-25-claude-harness-wave2-summary.md`
- **Exit gate:** all 8 static checks + dry-run dispatch test PASS, annotated in `docs/plan.md` Wave 2 row
- **File diff:** `.claude/agents/orchestrator.md` 208 → 382 lines. Symlinked to `~/.claude/agents/orchestrator.md` (this repo as upstream); changes propagate globally on next orchestrator dispatch in any repo.
- **Next wave opening:** `### Wave 3 — README + cross-reference` (Tasks 8–9, docs-only). Dispatch with `/run-wave 3`.

## Open items carried forward

- **Deferred human-only TODO:** Live JSONL telemetry validation. Run a non-dry-run orchestrator dispatch and confirm: Surface A console line shape; `.harness-state/orchestrator.jsonl` accumulates lines via append; `task_id` matches `{spec_basename}:{task_marker}`; force a deliberately-failing task to verify a `retried` JSONL line with populated `retried_from`. Non-blocking; future micro.

## Open Questions still open

- **OQ#1** — per-agent effort override map. Partially constrained by Task 4's per-task `**Effort:**` hint affordance (a workaround that may render OQ#1 unnecessary), but not formally resolved.
- **OQ#3** — effort in spec-planner output. Same — Task 4's hint creates an opt-in path that doesn't require spec-planner to pre-assign effort. OQ remains open as "should it become opt-out instead?"
- **OQ#4** — model.primary updater. Untouched.

## Spec deviations recorded

1. **Task 5 inlined JSONL schema** rather than linking to spec's §Logging Contract. Spec allowed either; chose inline for prompt self-containment.
2. **Step 9 phase-complete example table updated** (out-of-scope correctness fix). Old example used hard-coded `Task 1/2/3` ordinals that contradicted Task 6's stable `task_id` convention. Replaced with `<spec>.md:Task N` shape + Effort column. Self-consistency fix inside the same agent prompt.
3. **Bottom-of-file `Rules` item 3 updated** to "One rung per failure" (out-of-scope correctness fix). Old "promote to opus once" contradicted Task 7's generalized rung. Self-consistency fix inside the same agent prompt.

## /close-wave skill bug surfaced (worth fixing)

**Step 0c, Step 8 in-step machine check, and Step 11a all use awk range pattern:**

```bash
awk "/^### Wave $wave_number/,/^### Wave /" docs/plan.md | grep "^- \[ \]"
```

Both delimiters match the heading itself, so awk's range starts AND ends on the same line — returning a 1-line range with NO Wave-N task bullets. The skill silently passes the unticked-check even when tasks remain open.

**Workaround used:** sed with explicit next-wave delimiter:

```bash
sed -n '/^### Wave 2/,/^### Wave 3/p' docs/plan.md | grep "^- \[ \]" | grep -v "Deferred"
```

Future fix: replace awk with sed across all three checks, OR change awk pattern to `/^### Wave $wave_number/,/^### Wave [^$wave_number]/` (or similar that doesn't re-match the start delimiter).
