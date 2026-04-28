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

- [x] **Planning-loop auto-apply arbiter** [spec](./specs/2026-04-27-planning-loop-auto-apply-arbiter.md) — commits `80c6bb3` (Task 1), `2776fde` (Task 2), `c447dea` (Task 3), `36d896b` (Task 4), `846cd1b` (Task 5). Merge `5b29e9a`.
  - [x] Task 1 — Add Step 6e (auto-apply preconditions) + `*.autoapply-tmp` to `.gitignore` (`80c6bb3`)
  - [x] Task 2 — Add Step 6f (executor: validate → pre-hash → recheck → in-memory apply → temp-file → atomic rename → audit append) (`2776fde`)
  - [x] Task 3 — Branch Step 6 escalation, add output template, add Phase 1c orphan-temp-file detection at Step 1 pre-flight, update `lib/restore.sh` to clean stale `.autoapply-tmp` files (`c447dea`)
  - [x] Task 4 — Update Rules #4/#9, add Rule #11; add JSON-edit-block requirement to Step 6.5b arbiter prompt; document opt-out (env var + profile key); one-bullet schema-doc add to `skills/project-init/SKILL.md` (`36d896b`)
  - [x] Task 5 — Create `skills/planning-loop/lib/test-fixtures/` + bash driver + 15 fixtures (A-O: happy path, 4 abort reasons, both edit shapes, opt-out paths, hash-mismatch, orphan recovery, simulated log-append-fail) (`846cd1b`)

**Wave 4 exit gate (PASS 2026-04-27, merge `5b29e9a`):**
- ✓ `grep -cF '### 6e. Auto-apply preconditions' skills/planning-loop/SKILL.md` returns 1
- ✓ `grep -cF '### 6f. Auto-apply executor' skills/planning-loop/SKILL.md` returns 1
- ✓ `grep -cF '*.autoapply-tmp' .gitignore` returns >= 1
- ✓ `grep -cF 'autoapply-tmp' skills/planning-loop/lib/restore.sh` returns >= 1
- ✓ `grep -cF 'PLANNING_LOOP_NO_AUTO_APPLY' skills/planning-loop/SKILL.md` returns >= 1
- ✓ `grep -cF 'planning_loop.auto_apply' skills/planning-loop/SKILL.md` returns >= 1
- ✓ `grep -cF 'planning_loop' skills/project-init/SKILL.md` returns >= 1
- ✓ `grep -cF 'Rule #11' skills/planning-loop/SKILL.md` returns >= 1
- ✓ `test -d skills/planning-loop/lib/test-fixtures` exits 0
- ✓ `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` exits 0 (15/15 fixtures pass)

Deviations: (1) plan.md ↔ spec path divergence resolved at close-time — orchestrator followed spec paths (`skills/planning-loop/lib/test-fixtures/`, `run-fixtures.sh`) per sub-bullets-win convention; this exit-gate now reflects the spec paths. (2) Worktree pre-existed at older base `cbc2046`; orchestrator ran `git merge --ff-only master` to `e6f653a` before Task 1. (3) Bash 3.2 driver shim — macOS bash lacks associative arrays; driver uses dynamic var names + `eval`. (4) Test-only env var `PLANNING_LOOP_TEST_PIN_SPEC_HASH_PRE` — Fixture L only; production path never reads it. Summary: `docs/2026-04-27-claude-harness-wave4-summary.md`.

---

### Wave 5 — Planning-loop trim — fix regressions (branch `claude/analyze-planning-loop-tokens-TO8ld`)

**Why this wave:** The 2026-04-28 token-trim refactor (5 commits on `claude/analyze-planning-loop-tokens-TO8ld`) silently dropped 5 contract guarantees + 4 detail-level guarantees the trim plan listed as non-goals. Code-reviewer DO-NOT-SHIP'd the branch. Wave 5 restores each regression with fixture coverage that actually drives `lib/auto-apply.sh` (current fixtures re-implement the logic in the runner — "15/15 pass" was meaningless). Sequential single-track because every later task's verify depends on real fixture coverage existing (Task 1).

- [ ] **Planning-loop trim — regressions** [spec](./specs/2026-04-28-planning-loop-trim-remediation.md) — branch `claude/analyze-planning-loop-tokens-TO8ld` (no rebase, no force-push; Wave 5 ships as a 6th commit or 5 per-blocker commits per spec Constraints)
  - [ ] Task 1 — Rewire `lib/test-fixtures/run-fixtures.sh` to drive real `lib/auto-apply.sh` + `lib/preflight.sh` (gates Tasks 2-9) — BLOCKER
  - [ ] Task 2 — Restore `LOG_HASH_PRE` re-check at `auto-apply.sh:106-109` — BLOCKER
  - [ ] Task 3 — Restore Phase 1b per-finding re-validation + section-body-range containment at `auto-apply.sh:420-440` (Rule #11(e)) — BLOCKER
  - [ ] Task 4 — Move log-writability check back to Phase 1a pre-flight at `auto-apply.sh:373-380` — BLOCKER
  - [ ] Task 5 — Restore rich audit-entry shape (Title / Arbiter rationale / Ruled by / Spec section / Old text / New text) at `auto-apply.sh:454-470` — BLOCKER
  - [ ] Task 6 — Restore Open-Questions bullet format at `auto-apply.sh:404-405` (verbatim arbiter rationale) — MAJOR
  - [ ] Task 7 — Fix Phase C cross-ref at `SKILL.md:486` — add rule 6 (Shape A containment) — MAJOR
  - [ ] Task 8 — Live `/planning-loop --revise` end-to-end smoke against synthetic spec with at least one mechanical finding — MAJOR
  - [ ] Task 9 — Restore `errno=<rc>` capture on `mv` failure at `auto-apply.sh:444-449` — MAJOR

**Wave 5 exit gate:**
- All Wave 1 (spec-internal) fixture additions/changes (Tasks 1-6) pass against real `lib/` scripts — no inline copy.
- `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` exits 0.
- `grep -c 'auto-apply\.sh' skills/planning-loop/lib/test-fixtures/run-fixtures.sh` returns ≥ 1 (was 0 — fixture-bypass anti-pattern).
- One live `/planning-loop --revise` run completed end-to-end (Task 8); receipt or menu printed; no spec mutated without audit entry.
- `git diff master..HEAD -- skills/planning-loop/` shows only the regression-fix lines + the rewired fixture runner.

---

### Wave 6 — Planning-loop trim — skill-creator alignment (branch `claude/analyze-planning-loop-tokens-TO8ld`)

**Why this wave:** Closes 2 skill-creator divergences flagged 2026-04-28: SKILL.md is 741 lines (skill-creator's ideal cap is 500); no `evals/evals.json` or trigger-eval scaffolding (skill-creator §"Test Cases" + §"Description Optimization"). Carve-out targets only the rarely-loaded prose (rules with rationale, Codex/spec-planner prompts) — the audit-entry shape, JSON Shapes A/B, and Open-Questions bullet shape stay INLINE because they're load-bearing on the auto-apply hot path. Description-optimization run is OUT of scope (deferred to a follow-up spec); eval scaffolding ships so the future run is a one-command operation.

- [ ] **Planning-loop trim — skill-creator alignment** [spec](./specs/2026-04-28-planning-loop-trim-remediation.md) — branch `claude/analyze-planning-loop-tokens-TO8ld`
  - [ ] Task 10 — Carve `references/rules.md` (Rules 1-11 with rationale; keep titles inline)
  - [ ] Task 11 — Carve `references/codex-prompts.md` (verbatim arbiter + spec-planner dispatch prompts)
  - [ ] Task 12 — Add `evals/evals.json` (3 prompts) + `evals/trigger-eval.json` (20 queries, ≥8 should-trigger + ≥8 near-miss negatives)

**Wave 6 exit gate:**
- `wc -l skills/planning-loop/SKILL.md` ≤ ~540 (target after Tasks 10+11; audit-entry shape, JSON Shapes A/B, and Open-Questions bullet shape stay inline by design — see spec Task 10 scope decision).
- `references/rules.md` and `references/codex-prompts.md` exist and parse as Markdown.
- `evals/evals.json` and `evals/trigger-eval.json` exist and parse as JSON.
- Cross-ref audit grep finds zero broken `(see ...)` references in `skills/planning-loop/SKILL.md`.
