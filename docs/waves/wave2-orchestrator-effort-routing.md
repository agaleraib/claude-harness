---
wave_number: 2
slug: orchestrator-effort-routing
spec_path: docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md
merge_sha: 4753502
closed_at: 2026-04-25
---

# Wave 2 — claude-harness — orchestrator effort routing + logging contract

**Wave:** 2 (synthetic spec `/tmp/wave-2-20260425-142132.md`)
**Source spec:** `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md`
**Worktree:** `/Users/klorian/workspace/claude-harness/.claude/worktrees/agent-a1727684090154bff`
**Branch:** `worktree-agent-a1727684090154bff`
**Mode:** dry-run (no `model_routing` line in `.harness-profile`; orchestrator executed all 5 tasks itself on Opus 4.7 1M)
**Date:** 2026-04-25

## §Shipped

All five tasks edit a single file: `.claude/agents/orchestrator.md`. Sequential dependencies respected; one commit per task.

| Task | Commit | Title |
|------|--------|-------|
| 3 | `79b9ab9` | feat(orchestrator): add effort-augmented routing table + selection rules (Wave 2 Task 3) |
| 4 | `3e4ad14` | feat(orchestrator): parse per-task **Effort:** hint (Wave 2 Task 4) |
| 5 | `efb32a4` | feat(orchestrator): write §Logging Contract for Surface A + JSONL (Wave 2 Task 5) |
| 6 | `69081b3` | feat(orchestrator): pin task_id to {spec_basename}:{task_marker} (Wave 2 Task 6) |
| 7 | `92f87f3` | feat(orchestrator): generalize retry-escalation rung (Wave 2 Task 7) |

## §Wave 2 Exit Gate Results

Run inside the worktree (`/Users/klorian/workspace/claude-harness/.claude/worktrees/agent-a1727684090154bff`). All gates pass.

### Static gates

| # | Gate | Command | Output | Result |
|---|------|---------|--------|--------|
| 1 | Routing table present | `grep -c "\| Effort \|" .claude/agents/orchestrator.md` | `2` (table header row + Surface-coverage table also has Effort col) | PASS |
| 2 | JSONL surface referenced | `grep -c "orchestrator.jsonl" .claude/agents/orchestrator.md` | `3` | PASS |
| 3 | Per-task **Effort:** hint documented | `grep -c '\*\*Effort:\*\*' .claude/agents/orchestrator.md` | `3` | PASS |
| 4 | `override_source` field present | `grep -c "override_source" .claude/agents/orchestrator.md` | `6` | PASS |
| 5 | `retried_from` field present | `grep -c "retried_from" .claude/agents/orchestrator.md` | `5` | PASS |
| 6 | Generalized rung present | `grep -cE "low → medium\|medium → high\|high → xhigh" .claude/agents/orchestrator.md` | `6` (all three rungs explicitly enumerated) | PASS |
| 7 | Collapsed-duplicate rule absent | `grep -qv "stakes.level: high.*xhigh" .claude/agents/orchestrator.md` | exit 0 (zero literal matches; no separate stakes→xhigh rule) | PASS |
| 8 | Dead `tokenizer_note` field absent | `grep -q "tokenizer_note" .claude/agents/orchestrator.md` | exit 1 (zero matches) | PASS |

### Dry-run dispatch test

Picked `wave-2-20260425-142132.md:Task 3` as the dry-run subject. Created `.harness-state/` (gitignored) and wrote one line to each surface.

**Surface A line (printed + appended to `.harness-state/orchestrator.log`):**

```
[dry-run] would route to Opus @ high: architectural addition to routing guidelines (wave-2-20260425-142132.md:Task 3)
```

Matches the canonical shape `→ <task_id> → <Model> @ <effort>: <reason>` (with `[dry-run]` prefix per Step 1 / Step 5 of the updated prompt).

**Surface B line (appended to `.harness-state/orchestrator.jsonl`):**

```json
{"ts":"2026-04-25T14:33:37Z","session_id":"dryrun-wave2-20260425143337-92f87f3","task_id":"wave-2-20260425-142132.md:Task 3","task_shape":"spec-planning","model":"opus-4.7","effort":"high","status":"skipped","override_source":"default_rule","usage":null}
```

**JSON-parse exit code:**

```
$ python3 -c "import json,sys; lines=[json.loads(l) for l in open('.harness-state/orchestrator.jsonl')]; print('parsed', len(lines), 'line(s) OK')"
parsed 1 line(s) OK    # exit 0
```

**Required-field check (all 8 required fields populated, status=skipped):**

```
line 1: status=skipped missing=none
```

Required fields present: `ts`, `session_id`, `task_id`, `task_shape`, `model`, `effort`, `status`, `override_source`. Optional `usage` set to `null` per the contract ("orchestrator writes null today; /tokens will populate when telemetry arrives"). Optional `retried_from` correctly omitted on a non-retry line.

Dry-run dispatch test: **PASS**.

## §Human-only TODOs

The synthetic spec lists one human-only TODO. Surfaced here verbatim.

- **Live JSONL telemetry validation.** The exit gate's dry-run dispatch test produced ONE JSONL line. A human should run a non-dry-run dispatch (any small task with `model_routing: on`) post-merge and confirm:
  - The Surface A console output matches the spec (`→ <task_id> → <Model> @ <effort>: <reason>`)
  - `.harness-state/orchestrator.jsonl` accumulates additional lines (append, not overwrite)
  - `task_id` matches `{spec_basename}:{task_marker}` exactly
  - At least one retry path (force a deliberately-failing task) emits a `retried` JSONL line with `retried_from` populated correctly

The orchestrator prompt now wires this behavior, but the only true validation is a real subagent dispatch with `model_routing: on`. That requires `.harness-profile` to flip to `model_routing: on` and a willing target task — owner decision.

## §Open Questions

The synthetic spec asks whether OQ#1 (per-agent override map) and OQ#3 (effort in spec-planner output) are constrained or answered by the new `**Effort:**` hint affordance, and notes OQ#4 untouched.

- **OQ#1 (per-agent override map):** **Partially answered.** The new `**Effort:**` hint is a per-task override channel that lives in spec bodies — it does not require a separate per-agent override map in `.harness-profile`. If the original OQ#1 was about "how do specific tasks override the default routing without editing the harness profile," that's now solved via the hint. If OQ#1 was specifically about per-*agent* defaults (e.g. "code-reviewer always at xhigh"), the hint does NOT cover that — that would still need a profile-level affordance. Recommend the human review OQ#1's exact framing.
- **OQ#3 (effort in spec-planner output):** **Constrained.** The `**Effort:**` hint defines the in-spec format spec-planner should emit. Spec-planner can now produce `**Effort:** xhigh` lines next to `**Verify:**` for tasks where the planner has high confidence in the effort tier; absent the hint, the orchestrator falls through to the default selection rules. Spec-planner does not need its own routing logic — it just authors the hint when it has signal. (No spec-planner changes were needed in Wave 2; that's a follow-on for the planner's prompt.)
- **OQ#4:** Untouched by Wave 2.

## §KB upsert suggestions

claude-harness has no graph KB — per `/close-wave` Step 7 clarification, save-worthy facts go to file-based auto-memory in the close-wave flow, not here. No KB upserts from this wave.

Notable facts that may warrant auto-memory entries during `/close-wave`:

- Orchestrator routing now has two surfaces (A: human, B: JSONL) with stable `task_id`. Future skills that consume orchestrator output should read `.harness-state/orchestrator.jsonl`, not the legacy log shape.
- The retry rung is `low → medium → high → xhigh → promote-model → stop`, generalized; no special-cases for starting effort.
- `**Effort:**` is the new per-task hint field for spec authors who want to override default routing for a single task.

## §Deviations from spec

- **Task 5 — JSONL schema location.** The synthetic spec allowed either inlining the JSONL schema verbatim **or** linking to `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md` §Logging Contract. **Decision: inlined.** Reasons:
  1. Keeps the agent prompt self-contained (no external file dep at runtime).
  2. Robust against future reorganization of the source spec file.
  3. Other tasks in the wave (Task 6's `task_id` definition, Task 7's retry-line shape) reference Surface A / Surface B inline; matching scope keeps the prompt internally consistent.

  Trade-off: the orchestrator prompt grew from 208 lines to 382 lines. This is acceptable for a runtime contract with cross-cutting references.

- **Step 9 phase-complete table updated.** The spec did not explicitly require touching the Step 9 example table, but it was hard-coding ordinal `Task 1 / Task 2 / Task 3` markers — directly contradicting Task 6's stable `task_id` convention. Updated the example to `<spec>.md:Task N` shape and added an `Effort` column to keep the prompt internally consistent. Recorded here for transparency.

- **Bottom-of-file `Rules` section item 3 updated.** Originally read "One retry, then ask. Promote to opus once on failure." That contradicted Task 7's generalized rung. Updated to "One rung per failure" with a pointer to Step 6. Out-of-scope for any single task but necessary for prompt consistency.

No cross-repo flags. The single edited file (`.claude/agents/orchestrator.md`) is symlinked OUT to `~/.claude/agents/orchestrator.md` (this repo as harness upstream — expected pattern, not a gotcha). No file in the wave points OUT to another active working tree.

## §Baseline metric

| Metric | Before (master `13ed67e`) | After (Wave 2 tip `92f87f3`) | Delta |
|--------|---------------------------|------------------------------|-------|
| `orchestrator.md` line count | 208 | 382 | +174 |
| Major sections (`##` headings) | 10 | 10 | 0 |
| Subsections (`###` headings) | 4 | 8 | +4 |
| Files modified | — | 1 (`.claude/agents/orchestrator.md`) | — |
| Commits | — | 5 | — |

**New `###` subsections added (4):**
1. `### Routing table (model + effort)` — Step 4
2. `### Default effort selection rules` — Step 4
3. `### Per-task effort hint (opt-in)` — Step 2
4. `### Stable task_id convention` — Step 2

Plus extensive rework inside existing subsections (`### Log the decision` and `### Surface coverage by orchestrator state` under Step 8; `### Retry-escalation rung (generalized)` cases A/B/C under Step 6).

## Cross-repo flags

None. The orchestrator file is symlinked OUT to `~/.claude/agents/orchestrator.md` (claude-harness is the upstream); changes propagate to all consumer projects on merge to master. This is the expected propagation pattern, not a cross-repo concern requiring flag.
