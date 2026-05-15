# Wave 1 — CLOSED

- **Closed:** 2026-04-25
- **Spec:** `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md`
- **Plan navigator:** `docs/plan.md` (committed `7c41533`)
- **Wave 1 commits (worktree, merged):**
  - `0dbd852` — feat(harness-profile): add `model:` block with stakes-derived `effort_default`
  - `6dc6e2a` — docs(project-init): document `model:` block schema + emit in template
  - `5f9f72c` — docs(wave-1): summary file
- **Merge commit:** `4109de6` (--no-ff, no conflicts)
- **Reconcile commit:** `341d1d6` (plan.md ticks + spec checklist mirror)
- **Post-merge fixes:** none (no smoke detour required)
- **Pushed to origin:** yes — `origin/master` at `341d1d6`
- **Deploy:** no deploy hook configured (`.harness-profile` has no `deploy.command`)
- **Summary doc:** `docs/2026-04-25-claude-harness-wave1-summary.md`
- **Exit gate:** all 7 checks PASS, annotated in `docs/plan.md` Wave 1 row
- **Next wave opening:** `### Wave 2 — Orchestrator effort routing + logging contract` (Tasks 3–7). Dispatch with `/run-wave 2`.

## Open items carried forward

- **Deferred human-only TODO:** Manual `/project-init` scratch-dir verify — confirm a fresh `/project-init` emits a `.harness-profile` with the `model:` block whose `effort_default` matches the stakes the user answered (low→medium, medium→high, high→xhigh). Non-blocking.

## Open Questions still open (Wave 2/post-Wave)

- OQ#1 — per-agent effort override map (post-Wave decision)
- OQ#3 — JSONL log schema + stable `task_id` (Wave 2 forward-compat)
- OQ#4 — README/setup-harness doc sync (Wave 3)

## KB upserts

- ✓ `project_harness_profile_model_block.md` — `.harness-profile model:` block schema indexed in MEMORY.md
