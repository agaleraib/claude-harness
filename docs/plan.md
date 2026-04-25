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

- [ ] **V1 Harness Model Pin — profile schema** [spec](./specs/2026-04-19-harness-model-pin-and-effort-routing.md)
  - Task 1 — Add `model:` block to `.harness-profile`
  - Task 2 — Update `project-init` skill schema docs

**Wave 1 exit gate:**
- `yq '.model.primary' .harness-profile` returns `claude-opus-4-7`
- `yq '.model.fallback' .harness-profile` returns `claude-sonnet-4-6`
- `yq '.model.effort_default' .harness-profile` returns `high`
- `python -c "import yaml; yaml.safe_load(open('.harness-profile'))"` exits 0
- `grep -q tokenizer_note .harness-profile` returns non-zero (field removed/never added)
- `grep -q "stakes.level" skills/project-init/SKILL.md` matches (schema doc references the stakes mapping)
- `grep -q "effort_cost_multiplier" skills/project-init/SKILL.md` matches (optional hook documented)

---

### Wave 2 — Orchestrator effort routing + logging contract

**Why this wave:** Bulk of the work. Routing-table effort column, per-task hint parsing, generalized retry-escalation rung, human log format (Surface A), JSONL parallel log (Surface B), stable `task_id` in both. Depends on Wave 1 because orchestrator reads `effort_default` from the `model:` block.

- [ ] **V1 Harness Model Pin — orchestrator routing + logging** [spec](./specs/2026-04-19-harness-model-pin-and-effort-routing.md)
  - Task 3 — Add effort-augmented routing table + selection rules to `orchestrator.md`
  - Task 4 — Add per-task `**Effort:**` hint parsing
  - Task 5 — Write the §Logging Contract (Surface A + Surface B)
  - Task 6 — Implement stable `task_id` convention
  - Task 7 — Generalize the retry-escalation rung

**Wave 2 exit gate:**
- `grep -q "| Effort |" .claude/agents/orchestrator.md`
- `grep -q "orchestrator.jsonl" .claude/agents/orchestrator.md`
- `grep -q "\*\*Effort:\*\*" .claude/agents/orchestrator.md` (per-task hint documented)
- `grep -q "override_source" .claude/agents/orchestrator.md`
- `grep -q "retried_from" .claude/agents/orchestrator.md`
- `grep -qE "low → medium|medium → high|high → xhigh" .claude/agents/orchestrator.md` (generalized rung)
- `grep -qv "stakes.level: high.*xhigh" .claude/agents/orchestrator.md` (collapsed duplicate rule absent)
- `grep -q "tokenizer_note" .claude/agents/orchestrator.md` returns non-zero (dead field not referenced)
- Dry-run dispatch of any existing spec task: human log line matches Surface A shape; `.harness-state/orchestrator.jsonl` gains one new line parseable as JSON with all required fields populated.

---

### Wave 3 — README + cross-reference

**Why this wave:** Docs-only. Independently shippable after Wave 2. Kept separate so a doc typo can be fixed without touching agent prompts or profile schema — rollback isolation matches the change shape.

- [ ] **V1 Harness Model Pin — README sync** [spec](./specs/2026-04-19-harness-model-pin-and-effort-routing.md)
  - Task 8 — Update README §"orchestrator (Universal)" with the effort-dimension sentence
  - Task 9 — Add relative-path cross-reference from README to `.claude/agents/orchestrator.md`

**Wave 3 exit gate:**
- `grep -nA 2 "orchestrator (Universal)" README.md` shows the effort-dimension sentence with all four effort values and the `stakes.level` derivation mentioned.
- `grep -q "\.claude/agents/orchestrator\.md" README.md` returns 0 (link exists).
- `git diff master -- README.md` touches only the orchestrator section (no drift elsewhere).
