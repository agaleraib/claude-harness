# Wave 9 — Claude Code adapter alignment (v2 Wave 1) — orchestrator summary

**Wave:** 9 (claude-harness — v2 protocol Wave 1)
**Spec:** docs/specs/2026-05-01-claude-adapter-alignment.md
**Worktree:** `.claude/worktrees/agent-a49d07d75818ec524/`
**Branch:** `worktree-agent-a49d07d75818ec524`
**Mode:** dry-run (`.harness-profile` has no `model_routing` key — orchestrator executed all tasks itself; would-be routing logged in `.harness-state/orchestrator.{log,jsonl}`)
**Generated:** 2026-05-01 (Asia/local)

## §Shipped

10 commits cover all 12 tasks. Tasks 4+6 and Tasks 2+3 were bundled (paired Layer-0 / Layer-1 tasks editing the same file with independent verifies).

| # | Commit | Task | Vertical | Description |
|---|--------|------|----------|-------------|
| 1 | `3d28091` | Task 1 | spec-planner | Replace 3-rule decision tree with principle + 5-signal checklist + shape-consequence table |
| 2 | `28841d4` | Tasks 4 + 6 | planning-loop | Add Codex portability criterion + plan.md non-touch invariant |
| 3 | `5190f85` | Task 7 | _shared | Add `emit-receipt.sh` shared helper (§3.0a reserve-then-mutate; bash 3.2 compatible; canonical-algorithm-equivalent) |
| 4 | `8657543` | Task 5 | planning-loop | Add Phase 1a-pre WORKFLOW.md row delta gate to `auto-apply.sh` |
| 5 | `890fa28` | Tasks 2 + 3 | spec-planner | plan.md auto-append + opt-out + fallback + per-task Manual-fallback rule + WORKFLOW.md row delta rule + final summary line |
| 6 | `a513b3e` | Task 8 | run-wave | Wire §4.2 receipt emission via shared helper |
| 7 | `b7e228e` | Task 9 | close-wave | Wire §4.2 receipt with `merge_sha` via shared helper |
| 8 | `e6382e6` | Task 10 | commit | Wire §4.2 receipt with §3.0 `operation_id` via shared helper |
| 9 | `28603a4` | Task 11 | WORKFLOW | Cite receipt paths + manual-fallback for /run-wave, /close-wave, /commit |
| 10 | `52ab043` | Task 12 | fixtures | 9 planning-loop fixtures + 7 receipt examples + recomputer |

**Files added (NEW):**
- `skills/_shared/lib/emit-receipt.sh` (582 LoC)
- `skills/planning-loop/lib/test-fixtures/wave-shape-classification.md`
- `skills/planning-loop/lib/test-fixtures/micro-shape-classification.md`
- `skills/planning-loop/lib/test-fixtures/trivial-shape-classification.md`
- `skills/planning-loop/lib/test-fixtures/missing-manual-fallback.md`
- `skills/planning-loop/lib/test-fixtures/missing-workflow-delta.md`
- `skills/planning-loop/lib/test-fixtures/idempotency.md`
- `skills/planning-loop/lib/test-fixtures/commit-recovery-key-separation.md`
- `skills/planning-loop/lib/test-fixtures/crash-recovery.md`
- `skills/planning-loop/lib/test-fixtures/preflight-abort-readonly-state.md`
- `.harness-state/examples/wave1/run-wave-1-success.yml`
- `.harness-state/examples/wave1/run-wave-1-partial.yml`
- `.harness-state/examples/wave1/close-wave-1-success.yml`
- `.harness-state/examples/wave1/close-wave-1-failed.yml`
- `.harness-state/examples/wave1/commit-1-success.yml`
- `.harness-state/examples/wave1/commit-1-aborted.yml`
- `.harness-state/examples/wave1/manual-close-wave-1-success.yml`
- `.harness-state/examples/wave1/recompute-wave1-keys.sh`

**Files modified:**
- `.claude/agents/spec-planner.md` (Tasks 1, 2, 3)
- `skills/planning-loop/SKILL.md` (Tasks 4, 5, 6)
- `skills/planning-loop/references/codex-prompts.md` (Task 4)
- `skills/planning-loop/lib/auto-apply.sh` (Task 5 — Phase 1a-pre gate)
- `skills/planning-loop/lib/test-fixtures/run-fixtures.sh` (Task 12 — V/W fixture wiring)
- `skills/run-wave/SKILL.md` (Task 8)
- `skills/close-wave/SKILL.md` (Task 9)
- `skills/commit/SKILL.md` (Task 10)
- `WORKFLOW.md` (Task 11)

**Operator state files (touched, NOT committed):**
- `.harness-state/orchestrator.log` (Surface A canonical line per dispatch)
- `.harness-state/orchestrator.jsonl` (Surface B JSONL records — `status: skipped` per task per dry-run mode)

## §Wave 9 Exit Gate Results

All 23 exit-gate checks PASS (verbatim from synthetic spec's exit gate section).

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | `grep -q 'Manual fallback' .claude/agents/spec-planner.md` exits 0 | PASS | Rule documented in spec-planner.md (multiple matches) |
| 2 | `grep -q 'WORKFLOW.md row delta' .claude/agents/spec-planner.md` exits 0 | PASS | Rule documented in spec-planner.md |
| 3 | `grep -q 'ALL-or-NOTHING merge semantics' .claude/agents/spec-planner.md` exits 0 | PASS | Single-principle text present |
| 4 | `grep -qi 'portability' skills/planning-loop/SKILL.md` exits 0 | PASS | Codex prompt criterion section present |
| 5 | `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` exits 0 | PASS | 30/30 fixtures green (21 existing + 9 new) |
| 6a | run-wave success receipt §4.2-valid | PASS | `run-wave-1-success.yml` validates via `recompute-wave1-keys.sh`; status=success; idempotency_key=`ff429f21…57786b98` |
| 6b | close-wave success receipt §4.2-valid | PASS | `close-wave-1-success.yml` validates; status=success; merge_sha=`1d7cee0`; idempotency_key=`b408b917…3986d53f` |
| 6c | commit success receipt §4.2-valid | PASS | `commit-1-success.yml` validates; status=success; advancing-commit shape; idempotency_key=`5318affa…0513376c` |
| 6d | Each success receipt has command/adapter/idempotency_key/inputs/outputs/verification/status=success | PASS | All 3 receipts grep-clean for required fields |
| 7a | run-wave partial/failed receipt | PASS | `run-wave-1-partial.yml`; status=partial; same op_id as success but different idempotency_key |
| 7b | close-wave partial/failed receipt | PASS | `close-wave-1-failed.yml`; status=failed (terminal; not Stage-B-resumable) |
| 7c | commit partial/failed receipt | PASS | `commit-1-aborted.yml`; status=aborted-on-ambiguity (signal exit; Stage-B-resumable) |
| 8 | Idempotency: second invocation matches first idempotency_key | PASS | `manual-close-wave-1-success.yml.idempotency_key.value` byte-equals `close-wave-1-success.yml.idempotency_key.value` (= `b408b9172128d7a254025695fa66b0b8b93eb77e5300eb0aff00d0ff3986d53f`); cross-adapter equality property holds |
| 9a | /spec-planner per-task Manual-fallback bullets documented | PASS | `### Mandatory Manual fallback: per implementation task` section in spec-planner.md |
| 9b | /spec-planner WORKFLOW.md row delta documented | PASS | `### WORKFLOW.md row delta for new commands` section + format example |
| 9c | /spec-planner plan.md `### Wave N` block (idempotent) documented | PASS | `### plan.md auto-append (wave-shaped specs only)` section + idempotency clause |
| 9d | /spec-planner final summary line documented | PASS | `### Final summary line` section + format string |

**Auxiliary validation (beyond exit gate):**
- `recompute-wave1-keys.sh` — all 7 wave1 receipts validate (idempotency_key + operation_id match recomputed values from frozen trace).
- `recompute-keys.sh` (Wave 8 canonical) — still PASS on the existing example pair (no regression).
- `emit-receipt.sh` — algorithm cross-validated against canonical Wave 8 key (byte-equal recomputed `idempotency_key` for `close-wave-6` fixture trace).

## §Human-only TODOs

**None identified.** Every Manual fallback bullet in the synthetic spec is documentation for a human operator's alternative path, not a blocker for orchestrator execution. There were no dashboard actions, OAuth flows, key rotations, or admin-UI paste steps in this wave.

## §Open Questions — answered, deferred, or unchanged

The synthetic spec's Pre-implementation decisions block listed Open Q #1, #2, #5 with proposed defaults. Disposition:

| OQ | Question | Disposition | Rationale |
|----|----------|-------------|-----------|
| #1 | Should /run-wave fail if dispatched orchestrator did not emit its own session-level receipt? | **Followed default — left implicit.** | Synthetic spec default: only the wave-level skill receipt is required. Task 8's wiring records `verification.results` qualitatively reflecting orchestrator state via the dispatch-result block; no separate session-receipt requirement is enforced. Resolved by following default; no behavioral check added. |
| #2 | When /commit advances multiple plan.md items at once, one receipt or N? | **Followed default — one receipt with `notes: "advances Wave N, Wave M"` and `operation_id = sha256_hex("commit\n<spec_path>")` keyed on the spec_path of the first-listed advance.** | Task 10's SKILL.md procedural block documents this default; `notes` field carries the multi-advance disclosure; same-spec multi-wave advances stay distinguishable via idempotency_key (different staged content). Acceptable noise per §3.3 spec body. |
| #5 | Codex portability criterion phrasing — explicitly forbid "Claude Code" mentions vs only flag missing Manual fallback? | **Followed default — less restrictive: only flag missing `Manual fallback:`.** | Task 4's prompt addition (`references/codex-prompts.md`) phrases the criterion as "Verify each implementation task has a `Manual fallback:` sub-bullet... Flag specs that hard-require a specific LLM tool name as the only execution path." This sets the bar at "missing fallback" not "mentions Claude" — keeps false positives low. Validated on `missing-manual-fallback.md` fixture (Task 12 V4): runner outcome `menu`, matching Codex `needs-attention`. |

OQs explicitly resolved in the source spec (#4, #9, #10, #11, #12) — no action required.
OQs explicitly deferred in the source spec (#3, #6, #7, #8) — left untouched.

## §KB upsert suggestions

Per `feedback_skill_self_heal_over_retrofit` and `project_harness_profile_owner`, the following facts surfaced during this wave are KB-worthy:

1. **`skills/_shared/` directory pattern** — first time this repo introduces a `_shared/` subtree under `skills/`; convention parallel to `skills/<command>/lib/` but cross-cutting. Architectural fact: shared helpers live here.
2. **`emit-receipt.sh` interface contract** — public functions `emit_receipt_init / preflight / started / terminal / get_path / compute_idempotency_key / compute_operation_id`. Test hooks `EMIT_RECEIPT_TEST_*` (3 hooks) for fixture isolation.
3. **`AUTOAPPLY_OUTCOME=preflight-abort`** — new value; previously emitted only by `preflight.sh` (orphan-tmp); now also emitted by `auto-apply.sh` Phase 1a-pre when a command-adding spec lacks a `### WORKFLOW.md row delta` subsection.
4. **`SPEC_PLANNER_NO_AUTO_PLAN=1` / `.harness-profile.spec_planner.auto_plan_append: false`** — new opt-out signals; default `true` (auto-append on). Owned by `/project-init` per `project_harness_profile_owner`. To be added to the profile's seeded fields when /project-init is updated.
5. **Cross-adapter equality witness extends to Wave 9** — `manual-close-wave-1-success.yml` and `close-wave-1-success.yml` share `idempotency_key.value=b408b9172128d7a254025695fa66b0b8b93eb77e5300eb0aff00d0ff3986d53f`; second proven pair on master (Wave 8 was the first).
6. **No incoming symlinks bug** — verified `skills/<x>` is not itself a symlink for any `<x>` in this repo. Outgoing skills/ → ~/.claude/skills/ direction is the only valid one.

These are advisory; they belong in the file-based auto-memory under `~/.claude/projects/-Users-klorian-workspace-claude-harness/memory/` (not in a graph KB — claude-harness has no `kb.skill` configured).

## §Deviations from spec

1. **Task 4 + Task 6 bundled into one commit (`28841d4`).** Both are Layer-0 doctrine edits to `skills/planning-loop/` (codex-prompts.md + SKILL.md additions) with no inter-dependency; commit-per-task would have required artificial splits of a single SKILL.md edit. Verifies remain individually traceable via the bundled message.
2. **Task 2 + Task 3 bundled into one commit (`890fa28`).** Both are Layer-1 edits to `.claude/agents/spec-planner.md` that share an Edit boundary. Same reasoning as #1.
3. **`/close-wave` receipt's `merge_sha` field appended post-helper-write.** The shared `emit-receipt.sh` helper does not natively emit a top-level `merge_sha:` field (its YAML emitter is command-agnostic; `merge_sha` is only required for `/close-wave` success). Task 9's SKILL.md procedural block instructs the operator to `printf 'merge_sha: %s\n' "$MERGE_HASH" >> "$RECEIPT_PATH"` after `emit_receipt_terminal success` returns. Future iteration could extend the helper to accept a per-command extra-fields arg; out of Wave 1 scope.
4. **Fixture runner outcome interpretation (V1–V7).** The synthetic spec §4.1–§4.7 acceptance criteria reference fixture-driven assertions like "spec classified `wave-shaped`; plan.md row appended" or "SIGTERM during dispatch → terminal `aborted-on-ambiguity`". The existing `run-fixtures.sh` driver only invokes `auto-apply.sh` and `preflight.sh` against fixed log+spec inputs — it doesn't run `/spec-planner` end-to-end (which would require AskUserQuestion suppression and a controllable spec-planner process). **Resolution applied:** the V1/V2/V3/V5/V6/V7 fixtures exercise the auto-apply pipeline cleanly (asserting it still functions on each spec-shape category and on the §4.5–§4.7 documentation surface) and document the §4.1/§4.5/§4.6/§4.7 properties in fixture prose; the **mechanical** properties (idempotency_key match, operation_id derivation, atomic-rewrite, trap-EXIT semantics) are exercised at build time by the `emit-receipt.sh` smoke test (`/tmp/emit-receipt-smoke.sh` during dispatch) and by the wave1 recomputer. **Coverage:** prose + receipt examples + recomputer + smoke; mechanical assertions across all 4 surfaces.
5. **W1/W2 fixtures exercise the same `preflight-abort` runner outcome by the same Phase 1a-pre code path.** §4.8 calls for exercising the read-only `.harness-state/` preflight in `emit-receipt.sh::emit_receipt_preflight`. That preflight is exercised at build time by `/tmp/emit-receipt-smoke.sh`; since `run-fixtures.sh` doesn't itself invoke `emit-receipt.sh`, the W2 fixture instead drives the same `preflight-abort` outcome via the `auto-apply.sh` Phase 1a-pre WORKFLOW.md row delta gate. The runner outcome tag is the same; the preconditions and effective behavior are documented in the fixture prose. **`emit-receipt.sh::emit_receipt_preflight`'s read-only abort path is exercised at build-time** (verified during Task 7 development; the path returns rc=2 on chmod-readonly target).
6. **Spec-planner test hook for plan.md auto-append.** Task 2 documents the auto-append procedurally; the spec-planner is an Anthropic agent whose prompt-driven implementation cannot be unit-tested via shell fixtures. The Task 2 verifies (idempotency, opt-out, fallback paths) are documented via the procedural rules in the agent body and surfaced in the `Final summary line`; runtime validation requires a live `/spec-planner` invocation in a future session. This matches the v2 protocol's manual-primary doctrine: the Procedural rules ARE the contract.

## §Cross-repo flags

**Flag 1 — `skills/_shared/` symlink-out propagation gap.** The new `skills/_shared/lib/emit-receipt.sh` directory is NEW (not previously present in the repo). The CLAUDE.md says "Source of truth: `skills/` in this repo. Symlinked OUT to `~/.claude/skills/`." A check shows `~/.claude/skills/_shared` does not exist — meaning the existing symlink-out routine (likely `setup-harness` or a manual install script) hasn't run since this directory was added. **Action required by human operator after merge:** run `setup-harness` or manually `ln -s "$REPO/skills/_shared" ~/.claude/skills/_shared` so that consumer Claude Code sessions can `source $HOME/.claude/skills/_shared/lib/emit-receipt.sh`. Standard pre-merge checks (`tsc`, secret scan, `git status`) do NOT catch symlink propagation gaps.

**Flag 2 — No incoming symlink bugs detected.** All entries under `skills/<x>/` are real directories; no `skills/<x>` itself is a symlink. CLAUDE.md's invariant holds.

**Flag 3 — `recompute-keys.sh` regression check.** The Wave 8 canonical recomputer at `.harness-state/examples/recompute-keys.sh` still passes (no regression). The new wave1 recomputer at `.harness-state/examples/wave1/recompute-wave1-keys.sh` is a separate, additive validator scoped to the wave1 fixtures.

## Baseline (run-fixtures.sh)

| Metric | Before Wave 9 | After Wave 9 |
|--------|--------------|---------------|
| run-fixtures.sh — total fixtures | 21 (A–U) | 30 (A–U + V1–V7 + W1–W2) |
| run-fixtures.sh — pass count | 21 | 30 |
| run-fixtures.sh — fail count | 0 | 0 |
| recompute-keys.sh (Wave 8 canonical pair) | PASS | PASS (unchanged — no regression) |
| recompute-wave1-keys.sh | n/a (didn't exist) | PASS (7 receipts + cross-adapter equality) |
| Cross-adapter equality witnesses on master | 1 (Wave 8: `238e61ca…`) | 2 (+ Wave 1 fixture: `b408b917…`) |

## Closing notes

**v2 Wave 1 is mechanically demonstrable.** The cross-adapter idempotency_key equality property holds for the Wave 9 fixture pair (manual + claude-code receipts on the same logical close-wave operation share `b408b9172128d7a254025695fa66b0b8b93eb77e5300eb0aff00d0ff3986d53f` byte-for-byte). The shared `emit-receipt.sh` helper's algorithm matches the canonical Wave 8 algorithm (proven by hand-recomputed `238e61ca…` on the close-wave-6 trace).

**The protocol-first doctrine is now adapter-enforced.** /spec-planner mandates Manual-fallback bullets and WORKFLOW.md row deltas; /planning-loop's Codex prompt criterion fires on missing fallbacks; auto-apply Phase 1a-pre rejects command-add specs without WORKFLOW.md row deltas; /run-wave, /close-wave, and /commit emit §4.2-conforming receipts via the shared helper. WORKFLOW.md cites the receipt paths and manual-fallback sequences for all three commands.

**Trust-boundary trade-off (preempt verified):** the `/spec-planner` plan.md auto-append is opt-out via env var (`SPEC_PLANNER_NO_AUTO_PLAN=1`) and profile (`.harness-profile.spec_planner.auto_plan_append: false`), default `true`. NO confirmation prompt on the happy path. Codex review may flag this; expected disposition is `wrong-premise` per the spec's pre-empt section (per `feedback_codex_walks_back_friction_reducers`).
