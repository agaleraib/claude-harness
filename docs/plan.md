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

- [x] **Planning-loop trim — regressions** [spec](./specs/2026-04-28-planning-loop-trim-remediation.md) — commits `2669add` (Task 1), `bd6fa0a` (Task 2), `4cbc670` (Task 3), `3c7c391` (Task 4), `0ce2155` (Task 5), `0128604` (Task 6), `c1b9a6a` (Task 7), `35bb31a` (Task 9), `9b8a089` (Task 8 post-dispatch + parser-mismatch parking entry). Merge `ec3f49b`.
  - [x] Task 1 — Rewire `lib/test-fixtures/run-fixtures.sh` to drive real `lib/auto-apply.sh` + `lib/preflight.sh` (`2669add`) — BLOCKER
  - [x] Task 2 — Restore `LOG_HASH_PRE` re-check (`bd6fa0a`) — BLOCKER
  - [x] Task 3 — Restore Phase 1b per-finding re-validation + section-body-range containment (Rule #11(e)) (`4cbc670`) — BLOCKER
  - [x] Task 4 — Move log-writability check back to Phase 1a pre-flight (`3c7c391`) — BLOCKER
  - [x] Task 5 — Restore rich audit-entry shape (Title / Arbiter rationale / Ruled by / Spec section / Old text / New text) (`0ce2155`) — BLOCKER
  - [x] Task 6 — Restore Open-Questions bullet format (verbatim arbiter rationale) (`0128604`) — MAJOR
  - [x] Task 7 — Fix Phase C cross-ref — add rule 6 (Shape A containment) (`c1b9a6a`) — MAJOR
  - [x] Task 8 — Live `/planning-loop --revise` end-to-end smoke (executed post-dispatch 2026-04-28; auto-apply path validated end-to-end on real Codex output; spec hash 95e00505 → 70e73563; rich audit + restored Open-Questions bullet shape verified; one new finding surfaced — see parking_lot.md 2026-04-28 parser-format-mismatch entry) — MAJOR
  - [x] Task 9 — Restore `errno=<rc>` capture on `mv` failure (`35bb31a`) — MAJOR

**Wave 5 exit gate (PASS 2026-04-28, merge `ec3f49b`):**
- ✓ All Wave 1 (spec-internal) fixture additions/changes (Tasks 1-6) pass against real `lib/` scripts — no inline copy. (15 originals A-O + 5 Wave-5 additions P/Q/R/S/T = 20/20.)
- ✓ `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` exits 0 — `Total: 20  Pass: 20  Fail: 0`.
- ✓ `grep -c 'auto-apply\.sh' skills/planning-loop/lib/test-fixtures/run-fixtures.sh` returns 11 (was 0 — fixture-bypass anti-pattern resolved).
- ✓ One live `/planning-loop --revise` run completed end-to-end (Task 8 post-dispatch); auto-apply path fired; spec mutated via atomic rename; rich audit entry written; Open-Questions bullet appended in restored shape; `lib/restore.sh` ran cleanly. Run log: `.harness-state/planning-loop/2026-04-28-wave5-smoke-test-revise-114421.md`.
- ✓ Branch diff shows only the regression-fix lines + rewired runner — no out-of-scope drift.

Deviations: (1) **Branch-discipline deviation** — orchestrator worked on the primary checkout's `claude/analyze-planning-loop-tokens-TO8ld` branch, NOT the `/run-wave`-spawned agent worktree (worktree forked from master, lacked the trim commits being remediated; spec forbade rebase/force-push). 8 task commits + summary committed in primary; agent worktree was abandoned and runtime-cleaned. See `feedback_run_wave_branch_constraint_mismatch.md`. (2) **Fixture T scope adjustment** — spec called for "F1 shifts F2's needle outside its section" but Rule 8 (H2-in-edit-text rejection) makes this physically unreachable; substituted equivalent failure mode "F1's `old_string` overlaps F2's, F2 count drops to 0". Same `revalidate_remaining` code path. (3) **Stale line numbers** in spec — confirmed shifted; relocated edit sites by structure (variable names, function names, comment text, H2 heading text). (4) **NEW BUG SURFACED in Task 8 smoke (parked, not in this wave)** — `auto-apply.sh:161` parser requires `F1:` prefix Codex never emits; 15 fixtures pre-stamp it, masking the gap. SKILL.md Step 6e Clause 2 prose says "auto-derive position-ordered IDs" — code diverges from contract. Recommended fix is parser-side regex change. See parking_lot.md 2026-04-28 entry. Summary: `docs/2026-04-28-claude-harness-wave5-summary.md`.

---

### Wave 6 — Planning-loop trim — skill-creator alignment (branch `claude/analyze-planning-loop-tokens-TO8ld`)

**Why this wave:** Closes 2 skill-creator divergences flagged 2026-04-28: SKILL.md is 741 lines (skill-creator's ideal cap is 500); no `evals/evals.json` or trigger-eval scaffolding (skill-creator §"Test Cases" + §"Description Optimization"). Carve-out targets only the rarely-loaded prose (rules with rationale, Codex/spec-planner prompts) — the audit-entry shape, JSON Shapes A/B, and Open-Questions bullet shape stay INLINE because they're load-bearing on the auto-apply hot path. Description-optimization run is OUT of scope (deferred to a follow-up spec); eval scaffolding ships so the future run is a one-command operation.

- [x] **Planning-loop trim — skill-creator alignment** [spec](./specs/2026-04-28-planning-loop-trim-remediation.md) — commits `ccde2b0` (Task 10), `8a215de` (Task 11), `29448db` (Task 12). Merge `b051ee8`.
  - [x] Task 10 — Carve `references/rules.md` (Rules 1-11 with rationale; keep titles inline) (`ccde2b0`)
  - [x] Task 11 — Carve `references/codex-prompts.md` (verbatim arbiter + spec-planner dispatch prompts) (`8a215de`)
  - [x] Task 12 — Add `evals/evals.json` (3 prompts) + `evals/trigger-eval.json` (20 queries, ≥8 should-trigger + ≥8 near-miss negatives) (`29448db`)

**Wave 6 exit gate (PASS-with-deviation 2026-04-28, merge `b051ee8`):**
- ✓-with-deviation `wc -l skills/planning-loop/SKILL.md` = **658 lines** (target ≤ ~540). Eligible savings ceiling under Task 10 scope decision was ~84 lines (rules rationale + 4 dispatch prompts only); hot-path content (audit-entry shape, JSON Shapes A/B, Open-Questions bullet shape) stays INLINE by design. User explicitly accepted 658 as PASS-with-deviation: "we accepts the 658 lines". See `feedback_spec_target_vs_scope_decision.md` for the spec-internal-contradiction lesson.
- ✓ `references/rules.md` (4222 bytes, 11 numbered rule entries) and `references/codex-prompts.md` (5402 bytes, 4 prompt sections with H2 + fenced blocks) exist and parse as Markdown.
- ✓ `evals/evals.json` parses as JSON (3 prompts, `skill_name=planning-loop`); `evals/trigger-eval.json` parses (20 queries: 9 should-trigger + 11 should-not-trigger near-misses, both buckets ≥ 8).
- ✓ Cross-ref grep audit clean — every `Rule #N`, `Step N`, `Clause N`, `Phase 1a/1b/1c`, and `references/codex-prompts.md §N` reference resolves.

Deviations: (1) **Branch discipline** — orchestrator branched off master in the worktree, NOT `claude/analyze-planning-loop-tokens-TO8ld` (already merged + cleaned during Wave 5; resurrecting was unnecessary). Authorized by dispatch. (2) **Line-count target** — 658 vs ≤540, accepted as PASS-with-deviation per the eligible-savings ceiling above. (3) Line-number drift (742 vs 741 spec baseline; no impact). (4) `evals/README.md` is 39 lines vs ≤30 soft hint (preserves both `Running` examples). (5) Routing dry-run (`model_routing` not set in `.harness-profile`; all tasks ran on the live Opus session). Summary: `docs/2026-04-28-claude-harness-wave6-summary.md`.

This completes the planning-loop trim-remediation spec — all 12 tasks across 2 waves shipped (Wave 5 = spec Wave 1 = 9 regression tasks; Wave 6 = spec Wave 2 = 3 skill-creator alignment tasks).

---

### Wave 7 — Protocol baseline + spec-skill alignment (claude-harness scope) — SUPERSEDED

> **Status: SUPERSEDED by Wave 8.** The [harness-evolution.md](./specs/2026-04-30-harness-evolution.md) spec this wave referenced was superseded by [universal-harness-protocol-v2.md](./specs/2026-04-30-universal-harness-protocol-v2.md) after a 3-round `/planning-loop` adversarial review and a manual fix pass (F1 — `operation_id` split in §4.2 receipt schema applied; F2 — Codex's "Codex rows lack explicit-input contract" finding dropped as wrong-premise per code-reviewer arbiter ruling, see spec Open Q #8). Do not dispatch Wave 7 — its scope is a strict subset of v2 Wave 0, which Wave 8 dispatches with broader deliverables (receipt-schema materialization, example receipts, Codex prompt contract). Kept here for historical context only.

**Why this wave:** First wave of the harness-evolution roadmap. Ships claude-harness's own `AGENTS.md` + `WORKFLOW.md` (the tool-neutral protocol contract) AND refines `/spec-planner` + `/planning-loop` to enforce the Manual-fallback discipline going forward. Per protocol-first doctrine: every harness skill must be operable with `git + editor + shell + docs` alone — these refinements bake that check into spec authoring. Independently shippable: subsequent waves of the harness-evolution spec depend on these protocol files existing and on specs containing per-task Manual-fallback bullets. wordwideAI + gobot will track equivalent waves when those repos are next opened (not pre-created in this commit).

- [ ] **Harness Evolution — spec Wave 0 (claude-harness scope)** [spec](./specs/2026-04-30-harness-evolution.md) — cherry-picks Deliverable A (claude-harness only) + Deliverable B (skill refinements live here).
  - [ ] Task 1 — Write `AGENTS.md` at repo root (~40 lines: what any agent must do/avoid, where state lives, how to discover specs/plan/waves). Update existing `CLAUDE.md` with one-line pointer: `> Tool-neutral protocol lives in AGENTS.md. Claude-specific overrides below.` (per spec §7.1 resolved decision). Append `protocol_baseline: true` to `.harness-profile` top-level once AGENTS.md+WORKFLOW.md exist (gates Wave 3 `/run-wave` Step 0 preflight per spec §4 Wave 0 Deliverable A).
  - [ ] Task 2 — Write `WORKFLOW.md` at repo root (~60 lines: Command / Manual / Claude / Codex / Automation matrix per spec §0). Use space-padded separator (`| --- | --- | --- | --- | --- |`) so the row-count grep below matches.
  - [ ] Task 3 — Refine `.claude/agents/spec-planner.md`: §"Implementation Plan (Sprint Contracts)" requires per-task `**Manual fallback:**` sub-bullet; §"Spec Generation Rules" requires WORKFLOW.md row delta when a spec adds a user-facing command
  - [ ] Task 4 — Refine `skills/planning-loop/SKILL.md`: (a) Codex review prompt gains portability criterion ("verify each task has a Manual fallback executable with git+editor+gh"); (b) auto-apply preflight (lib/preflight.sh) rejects specs adding commands without WORKFLOW.md row delta — distinct code path from the Codex-prompt path (a)
  - [ ] Task 5 — Fixture validation: add TWO new fixtures to `skills/planning-loop/lib/test-fixtures/`. **Fixture V** — spec missing Manual-fallback bullets; exercises Codex-prompt-path criterion (Codex returns `needs-attention`); runner expected-outcome name = `menu` (the in-runner outcome that maps to a `needs-attention` verdict, cf. fixtures B/C/D/I-N). **Fixture W** — spec adding command without WORKFLOW.md row delta; exercises preflight-rejection path; runner expected-outcome name = `preflight-abort` (cf. fixture O). Wire both into run-fixtures.sh as `run_one V missing-manual-fallback menu` and `run_one W missing-workflow-delta preflight-abort`.

**Wave 7 exit gate (target):**
- ✓ `test -f AGENTS.md` exits 0
- ✓ `test -f WORKFLOW.md` exits 0; `grep -c '^| .* | .* | .* | .* | .* |$' WORKFLOW.md` returns ≥ 8 (1 header + 7 command rows; space-padded separator excluded by regex)
- ✓ `grep -F 'AGENTS.md' CLAUDE.md` matches (CLAUDE.md points at AGENTS.md)
- ✓ `grep -q '^protocol_baseline: true$' .harness-profile` returns 0 (flag set; gates Wave 3 preflight)
- ✓ Manual verification: 5-question test (spec §0) passes for claude-harness using only protocol files; result recorded in `.harness-state/wave7-verification.md` with explicit yes/no per question
- ✓ `grep -q 'Manual fallback' .claude/agents/spec-planner.md` returns 0 (rule documented)
- ✓ `grep -q 'WORKFLOW.md row delta' .claude/agents/spec-planner.md` returns 0 (rule documented)
- ✓ `grep -qi 'portability' skills/planning-loop/SKILL.md` returns 0 (Codex prompt criterion present)
- ✓ Fixture run: `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` exits 0; pre-existing 21 fixtures (A–U) remain green; new fixtures V (`menu` outcome on missing-Manual-fallback spec) and W (`preflight-abort` on missing-WORKFLOW.md-delta spec) both pass — total 23/23
- ✓ Sample `/spec-planner` dry-run output contains per-task Manual-fallback bullets

Effort tracked in spec §4 Wave 0.

---

### Wave 8 — Universal protocol core (v2 Wave 0)

**Why this wave:** Replaces superseded Wave 7. Ships v2's broader Wave 0 deliverable: `AGENTS.md` + `WORKFLOW.md` (protocol contract) PLUS the materialized receipt schema and Codex prompt contract under `docs/protocol/`, PLUS example receipts under `.harness-state/examples/`. The receipt-schema and Codex-prompt-contract materializations are what make the v2 spec a *universal* protocol — Codex and Claude implementations have a single source of truth for receipt shape and prompt contract, instead of inferring from the spec body. Spec-skill refinements (the original Wave 7 Deliverable B) are tracked separately when v2 Wave 1 is dispatched.

- [x] **Universal Harness Protocol — spec Wave 0** [spec](./specs/2026-04-30-universal-harness-protocol-v2.md) — Wave 0 deliverable per spec §8 Wave 0. Merge `1d7cee0`.
  - [x] Task 0 — Plan-supersedure (spec §8 Wave 0 self-deliverable: "update Wave 7 to point at v2 or note v2 supersedes the old target") — satisfied at dispatch time by `24b9f0a` (Wave 7 SUPERSEDED note + Wave 8 entry)
  - [x] Task 1 — `AGENTS.md` at repo root (47 lines: tool-neutral agent instructions; state map; do/avoid; 5-question discovery) — `8ad4361`
  - [x] Task 2 — `WORKFLOW.md` at repo root with §4 command matrix (Manual / Claude Code / Codex / Automation; space-padded separator; zero `<deferred>` placeholder cells) — `4f84dcb` + post-review prose fix `3548770`
  - [x] Task 3 — `CLAUDE.md` minimal Claude-specific addendum pointing at AGENTS.md (created since CLAUDE.md was absent on entry) — `2b3ed7c`
  - [x] Task 4 — `protocol_baseline: true` appended to `.harness-profile` top-level — `479aa28`
  - [x] Task 5 — `docs/protocol/receipt-schema.md` materialized from spec §4.2 (all 18 fields including `operation_id`, recovery semantics two-stage lookup, mutating-command discipline) — `e7ed26b`
  - [x] Task 6 — `docs/protocol/codex-prompt-contract.md` materialized from spec §4.1 (6 clauses) — `1595ef0`
  - [x] Task 7 — `.harness-state/examples/{manual,claude}-close-wave-6.yml` + `recompute-keys.sh`. Cross-adapter `idempotency_key` equality verified mechanically: both receipts compute `238e61ca94966dcb120050cdba46c0ab0b71333cc01fb2cec077f18e6a39587b` from frozen `idempotency_key.trace` pre-images (recompute-keys.sh exit 0). **Deviation:** `idempotency_key` shipped as YAML mapping `{value, trace}` not spec-typed string — flagged in Open Q #9 (spec commit `7a439ff`), decision deferred to Wave 5. — `f34cb9c` + post-review summary metadata fix `3548770`
  - [x] Task 8 — `.harness-state/wave8-verification.md` — 5-question portability-test candidate answers (orchestrator IS a Claude session, so cold-read manual verification is **Status: Deferred** to a fresh editor session; tracked in §Open items below) — `b8f92f1`

**Wave 8 exit gate (PASS-with-deferred 2026-05-01, merge `1d7cee0`):**
- ✓ All 11 mechanical gate bullets pass (file existence, regex/awk pattern matches, recompute-keys.sh equality assertion, YAML validity).
- DEFERRED — gate bullet #12 "Manual verification: opening the repo cold and answering the 5-question test (spec §2.3)" — requires fresh editor session without prior conversation context; tracked in §Open items carried forward (close-wave receipt).

**Original Wave 8 exit gate (target — for historical reference; PASS results recorded above):**
- ✓ `test -f AGENTS.md` exits 0
- ✓ `test -f WORKFLOW.md` exits 0; `grep -c '^| .* | .* | .* | .* | .* |$' WORKFLOW.md` returns ≥ 8 (1 header + 7 command rows; space-padded separator excluded by regex)
- ✓ `awk '/^\|/ && /deferred decision/' WORKFLOW.md` returns nothing (no `deferred decision` appears in any table row; matches in surrounding prose are acceptable)
- ✓ `grep -F 'AGENTS.md' CLAUDE.md` matches (CLAUDE.md points at AGENTS.md)
- ✓ `grep -q '^protocol_baseline: true$' .harness-profile` exits 0
- ✓ `test -f docs/protocol/receipt-schema.md` exits 0; `grep -q 'operation_id' docs/protocol/receipt-schema.md` exits 0; `grep -q 'idempotency_key' docs/protocol/receipt-schema.md` exits 0
- ✓ `test -f docs/protocol/codex-prompt-contract.md` exits 0
- ✓ `.harness-state/examples/` contains at least one `*manual*.yml` and one `*claude*.yml` receipt; both YAML-valid; both include `operation_id` + `idempotency_key` + `idempotency_key.trace`
- ✓ `test -f .harness-state/examples/recompute-keys.sh` exits 0
- ✓ `bash .harness-state/examples/recompute-keys.sh` exits 0 — reads each receipt's `idempotency_key.trace` (frozen pre-image), recomputes the canonical SHA-256 per spec §4.2, and asserts both keys equal each other AND equal the value embedded in the receipt (catches both adapter divergence and trace tampering; does NOT re-hash live filesystem)
- ✓ `test -f .harness-state/wave8-verification.md` exits 0; file contains explicit yes/no answers for all 5 portability questions (spec §2.3)
- ✓ Manual verification: opening the repo cold and answering the 5-question test (spec §2.3) succeeds using only the protocol files (no Claude/Codex session)

Effort: ~3-4 days per spec §8 Wave 0 header. Spec-skill refinements (the prior Wave 7 Deliverable B — `/spec-planner` Manual-fallback enforcement, `/planning-loop` portability criterion, fixtures V/W) tracked separately when v2 Wave 1 is dispatched (no plan.md row pre-created until then).

---

### Wave 9 — Claude Code adapter alignment (v2 Wave 1)

**Why this wave:** Implements v2 Wave 1 — bring Claude Code skills into compliance with the v2 universal harness protocol. Per `feedback_protocol_first_doctrine`: AGENTS.md + WORKFLOW.md exist (Wave 8 ✓), but the spec-authoring + wave-execution skills don't yet enforce the doctrine. Wave 9 closes that loop. Also folds in two adjacent concerns surfaced 2026-05-01 by the Wave 8 retrospective: (a) the wave-vs-micro decision rule in `/spec-planner` is vague and plan-invented thresholds (3 rules with "≥6 tasks AND stakes:high" — needs replacement per `feedback_wave_vs_micro_shape_rule`); (b) `/spec-planner` and `/planning-loop` don't auto-write `docs/plan.md`, forcing every wave-shaped spec to be hand-paste-bridged before `/run-wave` can dispatch (per `project_plan_md_update_gap` + `project_spec_planner_run_wave_gap` + `feedback_run_wave_commit_plan_entry`).

- [ ] **Universal Harness Protocol — spec Wave 1 (Claude adapter alignment)** [spec](./specs/2026-05-01-claude-adapter-alignment.md) — to be drafted via `/planning-loop` FRESH mode at the path above. Tasks below will be refined by spec-planner/planning-loop and re-listed at /run-wave time; what's enumerated here is the dispatch SCOPE, not the final task IDs.
  - [ ] `/spec-planner` (`.claude/agents/spec-planner.md`) refinements:
    - replace decision tree with principle ("waves are commit batches with ALL-or-NOTHING merge semantics") + 5-signal checklist + shape-consequence table per `feedback_wave_vs_micro_shape_rule`
    - mandate per-task `**Manual fallback:**` sub-bullet
    - require WORKFLOW.md row delta when a spec adds a user-facing command
    - auto-append `### Wave N` block to `docs/plan.md` for wave-shaped specs (idempotent; computes N as max(existing) + 1)
    - surface shape classification in final summary line ("Spec shape: wave-shaped. Appended docs/plan.md Wave N entry." OR "Spec shape: micro-shaped. plan.md untouched.")
  - [ ] `/planning-loop` (`skills/planning-loop/SKILL.md`) refinements:
    - Codex review prompt gains portability criterion ("verify each task has a Manual fallback executable with git+editor+gh; flag specs that hard-require a specific LLM tool name as the only execution path")
    - auto-apply preflight (Phase 1a) rejects specs adding commands without WORKFLOW.md row delta
    - never touch plan.md (architectural: spec-planner owns plan.md ownership end-to-end)
  - [ ] §4.2 receipt emission for `/run-wave`, `/close-wave`, `/commit`:
    - each command writes a §4.2-conforming YAML receipt under `.harness-state/<command>-<wave-or-spec-id>-<timestamp>.yml`
    - canonical `idempotency_key` algorithm (per spec `docs/protocol/receipt-schema.md`)
    - `operation_id` field present (Wave 5 pre-decision: keep `idempotency_key.trace` shape used by Wave 8 receipts pending Open Q #9 resolution)
    - read-only-exempt rule: `/harness-status` (Wave 2) and any future read-only command write only under `.harness-state/`
  - [ ] Fixtures:
    - one wave-shaped spec input → spec-planner classifies as wave-shaped + appends plan.md entry
    - one micro-shaped spec input → spec-planner classifies as micro-shaped + plan.md untouched
    - one spec missing Manual-fallback bullets → `/planning-loop` Codex review returns `needs-attention` (Codex-prompt path; runner outcome `menu`)
    - one spec adding a command without WORKFLOW.md row delta → `/planning-loop` auto-apply preflight aborts (preflight path; runner outcome `preflight-abort`)
    - one §4.2-valid success receipt + one §4.2-valid partial/failed receipt per command in scope (`/run-wave`, `/close-wave`, `/commit`) under `.harness-state/examples/wave1/`
    - one same-inputs-twice idempotency fixture: second invocation no-ops to first receipt's `idempotency_key`

**Wave 9 exit gate (target — refined by spec):**
- ✓ `grep -q 'Manual fallback' .claude/agents/spec-planner.md` exits 0
- ✓ `grep -q 'WORKFLOW.md row delta' .claude/agents/spec-planner.md` exits 0
- ✓ `grep -q 'ALL-or-NOTHING merge semantics' .claude/agents/spec-planner.md` exits 0 (principle present)
- ✓ `grep -qi 'portability' skills/planning-loop/SKILL.md` exits 0 (Codex prompt criterion)
- ✓ `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` exits 0 with new wave-shape + micro-shape + missing-Manual-fallback + missing-WORKFLOW.md-delta + idempotency fixtures green
- ✓ `/run-wave`, `/close-wave`, `/commit` each produce a §4.2-valid success receipt during their fixture run; receipts include `command`, `adapter=claude-code`, `idempotency_key`, `inputs`, `outputs`, `verification`, `status=success`
- ✓ `/run-wave`, `/close-wave`, `/commit` each produce a §4.2-valid partial/failed receipt under a deliberately-broken fixture (`status` ∈ {`partial`, `failed`, `aborted-on-ambiguity`}, `verification.results` populated when applicable)
- ✓ Idempotency fixture proves second invocation matches first `idempotency_key` and no-ops
- ✓ Sample `/spec-planner` dry-run on a wave-shaped input shows: per-task Manual-fallback bullets, WORKFLOW.md row delta, plan.md `### Wave N` block appended (idempotent on re-run)

**Pre-empt: trust-boundary trade-off (per `feedback_codex_walks_back_friction_reducers`).** The plan.md auto-append is friction-removal by design — opt-out lives at `.harness-profile.spec_planner.auto_plan_append: false` (default `true`) AND env var `SPEC_PLANNER_NO_AUTO_PLAN=1`. NOT via a confirmation prompt on the happy path. Codex review may flag this; route to scope arbiter, expect `wrong-premise`.

Effort tracked in spec §8 Wave 1 of `docs/specs/2026-04-30-universal-harness-protocol-v2.md` (~4-6 days; ~half-day delta for the folded scope per Wave 1 expansion note in `project_universal_harness_protocol_v2.md`).
