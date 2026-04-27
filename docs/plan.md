# claude-harness — plan

Navigator-style index. Each Wave block lists bullets pointing at vertical specs in `docs/specs/`. Sub-bullets define cherry-picked task scope (sub-bullets are authoritative; see `feedback_plan_md_sub_bullets_win.md`). Waves dispatch via `/run-wave N` into isolated worktrees; merging belongs to `/close-wave N`.

## Operating Rules for Execution

- Stage files explicitly — never `git add -A` / `git add .`
- `--no-ff` merges on all feature branches
- One wave per dispatch; human checkpoint between waves
- Sub-bullets are authoritative scope when they diverge from headers

---

### Wave 1 — `.harness-profile` model-pin schema

**Why this wave:** Ship the `model:` block, stakes-derived `effort_default`, optional `effort_cost_multiplier`, and project-init schema docs. Independently shippable — orchestrator still works without reading the block via the graceful-degradation ACs, so master stays green even if Wave 2 slips.

- [x] **V1 Harness Model Pin — profile schema** [spec](./specs/2026-04-19-harness-model-pin-and-effort-routing.md) — commits `0dbd852` (Task 1: `model:` block in `.harness-profile`), `6dc6e2a` (Task 2: project-init schema docs + template). Merge `4109de6`.
  - [x] Task 1 — Add `model:` block to `.harness-profile` (`0dbd852`)
  - [x] Task 2 — Update `project-init` skill schema docs (`6dc6e2a`)

**Wave 1 exit gate (PASS 2026-04-25, merge `4109de6`):**
- ✓ `yq '.model.primary' .harness-profile` returns `claude-opus-4-7`
- ✓ `yq '.model.fallback' .harness-profile` returns `claude-sonnet-4-6`
- ✓ `yq '.model.effort_default' .harness-profile` returns `high`
- ✓ `python -c "import yaml; yaml.safe_load(open('.harness-profile'))"` exits 0
- ✓ `grep -q tokenizer_note .harness-profile` returns non-zero (field removed/never added)
- ✓ `grep -q "stakes.level" skills/project-init/SKILL.md` matches (schema doc references the stakes mapping)
- ✓ `grep -q "effort_cost_multiplier" skills/project-init/SKILL.md` matches (optional hook documented)

Deviations: `effort_cost_multiplier` shipped as `{}` empty placeholder per spec recommendation (exercises ignored-if-absent path while keeping schema visible). Open: human-only TODO — manual `/project-init` scratch-dir verify.

---

### Wave 2 — Orchestrator effort routing + logging contract

**Why this wave:** Bulk of the work. Routing-table effort column, per-task hint parsing, generalized retry-escalation rung, human log format (Surface A), JSONL parallel log (Surface B), stable `task_id` in both. Depends on Wave 1 because orchestrator reads `effort_default` from the `model:` block.

- [x] **V1 Harness Model Pin — orchestrator routing + logging** [spec](./specs/2026-04-19-harness-model-pin-and-effort-routing.md) — commits `79b9ab9` (Task 3), `3e4ad14` (Task 4), `efb32a4` (Task 5), `69081b3` (Task 6), `92f87f3` (Task 7). Merge `4753502`.
  - [x] Task 3 — effort-augmented routing table + selection rules (`79b9ab9`)
  - [x] Task 4 — per-task `**Effort:**` hint parsing (`3e4ad14`)
  - [x] Task 5 — §Logging Contract Surface A + JSONL (`efb32a4`)
  - [x] Task 6 — stable `task_id = {spec_basename}:{task_marker}` (`69081b3`)
  - [x] Task 7 — generalized retry-escalation rung (`92f87f3`)

**Wave 2 exit gate (PASS 2026-04-25, merge `4753502`):**
- ✓ `grep -q "| Effort |" .claude/agents/orchestrator.md`
- ✓ `grep -q "orchestrator.jsonl" .claude/agents/orchestrator.md`
- ✓ `grep -q "\*\*Effort:\*\*" .claude/agents/orchestrator.md` (per-task hint documented)
- ✓ `grep -q "override_source" .claude/agents/orchestrator.md`
- ✓ `grep -q "retried_from" .claude/agents/orchestrator.md`
- ✓ `grep -qE "low → medium|medium → high|high → xhigh" .claude/agents/orchestrator.md` (generalized rung)
- ✓ `grep -qv "stakes.level: high.*xhigh" .claude/agents/orchestrator.md` (collapsed duplicate rule absent)
- ✓ `grep -q "tokenizer_note" .claude/agents/orchestrator.md` returns non-zero (dead field not referenced)
- ✓ Dry-run dispatch test: Surface A line printed; `.harness-state/orchestrator.jsonl` gained one JSON-parseable line with 8 required fields, `status: skipped`.

Deviations: (1) Task 5 inlined JSONL schema vs linking — spec allowed either; (2) Step 9 phase-complete example table updated to use `<spec>.md:Task N` shape (out-of-scope correctness fix, keeps prompt internally consistent with Task 6); (3) bottom-of-file Rules item 3 changed to "One rung per failure" (out-of-scope correctness fix, keeps prompt internally consistent with Task 7). Open: human-only TODO — live JSONL telemetry validation post-merge (non-dry-run dispatch + retry path).

---

### Wave 3 — README + cross-reference

**Why this wave:** Docs-only. Independently shippable after Wave 2. Kept separate so a doc typo can be fixed without touching agent prompts or profile schema — rollback isolation matches the change shape.

- [x] **V1 Harness Model Pin — README sync** [spec](./specs/2026-04-19-harness-model-pin-and-effort-routing.md) — commits `e6d6617` (Task 8: effort sentence), `d250bfa` (Task 9: relative link). Merge `146908c`.
  - [x] Task 8 — Update README §"orchestrator (Universal)" with the effort-dimension sentence (`e6d6617`)
  - [x] Task 9 — Add relative-path cross-reference from README to `.claude/agents/orchestrator.md` (`d250bfa`)

**Wave 3 exit gate (PASS 2026-04-25, merge `146908c`):**
- ✓ `grep -nA 2 "orchestrator (Universal)" README.md` — note: the `-A 2` window is too narrow (sentence sits ~41 lines below heading); intent met via `grep -n "effort"` and the diff hunk content.
- ✓ `grep -q "\.claude/agents/orchestrator\.md" README.md` returns 0 (link exists).
- ✓ `git diff master -- README.md` touches only the §"orchestrator (Universal)" section (single hunk `@@ -446,6 +446,8 @@`, +2 lines).

This completes the model-pin spec — all 9 tasks across 3 waves shipped.

---

### Wave 4 — `/planning-loop` auto-apply arbiter

**Why this wave:** Single-skill change — `/planning-loop` Step 6 escalation gains an auto-apply branch that edits `$SPEC_PATH` in place when round-3 arbiter rulings are unanimous and mechanical, instead of printing the 4-option menu. All 5 tasks ship together: Tasks 1-3 (skill body) don't function without Task 4's rule updates, and Task 5 (15 fixtures) is the regression coverage that gates merge. Task 4 includes a one-bullet schema-doc add to `skills/project-init/SKILL.md` for the new `planning_loop.auto_apply` profile key — coordinated cross-skill edit, not a separate workstream.

- [ ] **Planning-loop auto-apply arbiter** [spec](./specs/2026-04-27-planning-loop-auto-apply-arbiter.md) — auto-apply branch on Step 6 escalation when arbiter rulings are unanimous + mechanical; carve-out for Rule #4 at cap-reached; opt-out via env var + `.harness-profile.planning_loop.auto_apply`.
  - [ ] Task 1 — Add Step 6e (auto-apply preconditions) + `*.autoapply-tmp` to `.gitignore`
  - [ ] Task 2 — Add Step 6f (executor: validate → pre-hash → recheck → in-memory apply → temp-file → atomic rename → audit append)
  - [ ] Task 3 — Branch Step 6 escalation, add output template, add Phase 1c orphan-temp-file detection at Step 1 pre-flight, update `lib/restore.sh` to clean stale `.autoapply-tmp` files
  - [ ] Task 4 — Update Rules #4/#9, add Rule #11; add JSON-edit-block requirement to Step 6.5b arbiter prompt; document opt-out (env var + profile key); one-bullet schema-doc add to `skills/project-init/SKILL.md`
  - [ ] Task 5 — Create `skills/planning-loop/test-fixtures/` + bash driver + 15 fixtures (A-O: happy path, 4 abort reasons, both edit shapes, opt-out paths, hash-mismatch, orphan recovery, simulated log-append-fail)

**Wave 4 exit gate (PENDING):**
- `grep -cF '### 6e. Auto-apply preconditions' skills/planning-loop/SKILL.md` returns 1
- `grep -cF '### 6f. Auto-apply executor' skills/planning-loop/SKILL.md` returns 1
- `grep -cF '*.autoapply-tmp' .gitignore` returns >= 1
- `grep -cF 'autoapply-tmp' lib/restore.sh` returns >= 1
- `grep -cF 'PLANNING_LOOP_NO_AUTO_APPLY' skills/planning-loop/SKILL.md` returns >= 1
- `grep -cF 'planning_loop.auto_apply' skills/planning-loop/SKILL.md` returns >= 1
- `grep -cF 'planning_loop' skills/project-init/SKILL.md` returns >= 1
- `grep -cF 'Rule #11' skills/planning-loop/SKILL.md` returns >= 1
- `test -d skills/planning-loop/test-fixtures` exits 0
- `bash skills/planning-loop/test-fixtures/run-all.sh` exits 0
