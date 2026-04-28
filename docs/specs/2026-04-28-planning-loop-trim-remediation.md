# Planning-loop trim remediation — restore dropped contracts and close skill-creator divergences

## Overview

The trim plan at `docs/2026-04-28-planning-loop-token-trim-plan.md` set out to cut SKILL.md token cost without touching behavior. Phase A (extraction to `lib/preflight.sh` + `lib/auto-apply.sh`), Phase B (frontmatter description), and Phase C (rationale parentheticals) shipped on branch `claude/analyze-planning-loop-tokens-TO8ld` (5 commits ahead of `master`). Code-reviewer flagged that Phase A's extraction silently dropped or weakened contract guarantees the trim plan itself listed as non-goals (Distribution invariants #2 and #3, Pre-condition #4 "fixtures must keep passing"). Separately, the now-741-line SKILL.md violates skill-creator's ≤500-line ideal, and there is no `evals/` scaffolding or description-optimization run.

This spec covers two distinct workstreams targeted at that branch (or a new branch off it — never `master` directly):

- **Workstream 1 (Wave 1) — Fix the regressions.** Re-bind the fixture runner to the real `lib/` scripts, restore the dropped log-hash re-check, restore Phase 1b per-finding re-validation, move log-writability back to pre-flight, restore the contracted audit-entry shape, and close four major issues. Non-negotiable to ship: the auto-apply path mutates the user's spec file based on these contracts.
- **Workstream 2 (Wave 2) — Close the 2 skill-creator divergences.** Push contract prose and arbiter prompts into `references/` so SKILL.md drops under 500 lines, and add `evals/evals.json` + `evals/trigger-eval.json` + (optionally) one description-optimization pass.

All work targets the branch under remediation. Do NOT plan changes to `master` directly.

**Branch under remediation:** `claude/analyze-planning-loop-tokens-TO8ld` (HEAD = `9532e70`, 5 commits ahead of master).

## Implementation

**Recommended flow:** `/run-wave 1` → commit Wave 1 → `/close-wave 1` → `/run-wave 2` → commit Wave 2 → `/close-wave 2`
**Reason:** 9 Wave-1 tasks are sequential (each later regression depends on the earlier `lib/` scripts being live and re-bound to fixtures); 3 Wave-2 tasks (rules.md carve-out, codex-prompts.md carve-out, evals scaffolding) are largely independent and can parallelize within the wave; substantive stakes on a load-bearing skill that mutates user specs justify the wave ceremony for rollback insurance.
**Alternatives:** Single `/run-wave 1` covering both workstreams — rejected: the workstreams have different ship gates (Workstream 1 is non-negotiable; Workstream 2 is a follow-up the user may defer), and conflating them blocks Wave 2 cancellation.
**Implementation block written:** 2026-04-28 (revised 2026-04-28 after resolving Open Questions Q1-Q4: Wave 2 dropped from 4→3 tasks; description-optimization run deferred to follow-up spec.)

## Prior Work

Builds on:
- `docs/2026-04-28-planning-loop-token-trim-plan.md` (the trim plan whose Phase A is being remediated)
- `docs/specs/2026-04-27-planning-loop-auto-apply-arbiter.md` (the spec that originally shipped the auto-apply path now under remediation)

Assumes:
- The Step 6e/6f contract (Rules 1–11, JSON edit-block Shapes A/B, audit-entry shape, abort-reason taxonomy, mixed-routing-aware unanimity) shipped on master in the auto-apply spec is the source of truth. Re-validation here re-aligns the branch's `lib/auto-apply.sh` with that contract; it does not redesign the contract.
- The 15-fixture suite (A–O) under `skills/planning-loop/lib/test-fixtures/` was the safety net the trim plan relied on. Workstream 1 makes that safety net actually load-bearing again.

Changes:
- Adds `references/` hierarchy and `evals/` scaffolding under `skills/planning-loop/`.
- Modifies `lib/auto-apply.sh` (5 regression fixes); modifies `lib/test-fixtures/run-fixtures.sh` to call the real lib scripts.
- Modifies SKILL.md — restores prose where regression-trigger required it (audit shape, Open-Questions bullet shape) and trims unrelated prose into `references/` (Wave 2 only).

## Goal

Ship a planning-loop skill on `claude/analyze-planning-loop-tokens-TO8ld` that:
1. Preserves every behavior contract that existed on `master` pre-trim (audit-entry shape, log-hash re-check, Phase 1b per-finding re-validation, pre-flight log-writability, errno capture, Open-Questions bullet shape, Phase C cross-ref accuracy).
2. Has fixtures that exercise the real `lib/preflight.sh` and `lib/auto-apply.sh` (regressions surface, not bypassed).
3. Has been validated by at least one live `/planning-loop --revise` end-to-end run before the branch is merged.
4. SKILL.md ≤ ~540 lines after Tasks 10-11 (skill-creator §"Anatomy of a Skill" — 500 is the soft cap, "feel free to go longer if needed" allowance applies; rationale: audit-entry shape, JSON Shapes A/B, and Open-Questions bullet shape stay inline as load-bearing on the auto-apply hot path).
5. Has `evals/evals.json` + `evals/trigger-eval.json` per skill-creator §"Test Cases" + §"Description Optimization".

## Non-goals

- Redesigning the auto-apply contract, the abort-reason taxonomy, or the precondition rules. The contract from the 2026-04-27 spec is preserved verbatim; we are aligning code with it, not changing it.
- Extending auto-apply scope (heading edits, partial-apply, multi-section edits).
- Changing the `/planning-loop` invocation surface or argument parsing.
- Touching `master` directly — every commit lands on `claude/analyze-planning-loop-tokens-TO8ld` (or a branch off it that merges back into it).
- Running the description-optimization loop is **deferred to a follow-up spec** (see Out of scope). Eval scaffolding (`evals/evals.json`, `evals/trigger-eval.json`) ships in Wave 2 (Task 12); the optimizer run does not.

## Tasks

Workstream 1 (Wave 1) tasks are ordered: Blocker #1 first (it gates verification of every other regression — without real fixture coverage, "passes" doesn't mean what it says), then the four other blockers, then four majors. Workstream 2 (Wave 2) follows after Wave 1 is merged.

### Wave 1 — Fix regressions (single-track, sequential)

- [ ] **Task 1 (Blocker #1): Rewire fixtures to call real `lib/` scripts.**
  - **Files:**
    - `skills/planning-loop/lib/test-fixtures/run-fixtures.sh` (rewrite the in-line `run_autoapply()` to a thin wrapper that invokes `bash "$SCRIPT_DIR/../auto-apply.sh" "$SPEC" "$LOG"`; do the same for any preflight-side fixture coverage).
    - `skills/planning-loop/lib/test-fixtures/synthetic-spec.md` (no change expected; verify spec is fresh-copied per fixture).
  - **Depends on:** Nothing.
  - **Verify:**
    - `grep -c 'auto-apply\.sh' skills/planning-loop/lib/test-fixtures/run-fixtures.sh` returns ≥ 1 (was 0).
    - `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` runs and the runner output explicitly references `auto-apply.sh` invocations (e.g. via `set -x` traces or runner echoes). Failure mode is now "real bug" not "runner agreed with itself".
    - Document any fixture that fails after rewiring as a finding for Tasks 2-9 (expected; this is the point).

- [ ] **Task 2 (Blocker #2): Restore log-hash re-check.**
  - **Files:**
    - `skills/planning-loop/lib/auto-apply.sh` (currently captures `LOG_HASH_PRE` at line ~106 but never re-validates).
  - **Depends on:** Task 1.
  - **Verify:**
    - Add a fixture (or extend an existing one) that mutates `$LOG` between Phase 1a and Phase 1b. Expected outcome: abort with `log-hash-mismatch`. Fixture must call the real `lib/auto-apply.sh`.
    - `grep -nE 'LOG_HASH_NOW|log-hash-mismatch' skills/planning-loop/lib/auto-apply.sh` shows the re-check site.
    - SKILL.md Clause 6 + ~line 568 still describe both pre/post hashes — confirm wording matches code.

- [ ] **Task 3 (Blocker #3): Restore Phase 1b per-finding re-validation.**
  - **Files:**
    - `skills/planning-loop/lib/auto-apply.sh` (the apply loop around line 420-440 — extend the per-finding edit step to (a) re-check substring count for every *remaining* finding's needle in the in-progress buffer, (b) re-check section-body-range containment).
  - **Depends on:** Task 2.
  - **Verify:**
    - New fixture: two findings where applying F1 introduces a duplicate of F2's `old_string`. Expected: abort with `apply-failure` naming F2; live spec byte-identical to pre-apply state.
    - New fixture: two findings where applying F1 shifts F2's section body so F2's needle now falls outside its section. Expected: abort with `apply-failure` naming F2.
    - Both fixtures must drive the real `lib/auto-apply.sh` (Task 1 unblocks this).
    - SKILL.md Clause 5 rule 11 (Phase 1b table row "Re-validate after each edit") matches code behavior.

- [ ] **Task 4 (Blocker #4): Move log-writability check back to pre-flight.**
  - **Files:**
    - `skills/planning-loop/lib/auto-apply.sh` (currently the explicit comment at lines ~373-380 says "$LOG writability is NOT pre-checked here" — delete that comment and add the check; old contract was check #9 in Phase 1a).
  - **Depends on:** Task 3.
  - **Verify:**
    - New fixture: `chmod 444` on `$LOG` before invoking. Expected: abort with `validation-failure` and detail naming the unwritable log; **spec MUST be byte-identical** to pre-apply state (no rename should have happened). Today's code mutates the spec, then discovers the unwritable log post-rename — wrong.
    - SKILL.md Phase 1a check table row #14 (or similar) added for "log writable" with reason `validation-failure`.

- [ ] **Task 5 (Blocker #5): Restore contracted audit-entry shape.**
  - **Files:**
    - `skills/planning-loop/lib/auto-apply.sh` (around lines 454-470 — the `### Applied` block. Currently emits `- **F1** [load-bearing]`; restore the rich per-finding bullet shape from SKILL.md lines 586-611).
  - **Depends on:** Task 4.
  - **Verify:**
    - Fixture: success-path run produces audit entry containing all of: `Title:`, `Arbiter rationale (verbatim):`, `Ruled by:`, `Spec section touched:`, `Old text (verbatim):` (Shape A) or `Anchor (verbatim):` (Shape B), `New text (verbatim):` / `Inserted text (verbatim):`.
    - Audit-entry shape is a Distribution invariant #3 ("API to the log file") — any consumer of the log can rely on the rich shape.
    - Confirm wrong-premise findings still produce `[wrong-premise → Open Questions]` with `Title`, `Arbiter rationale (verbatim)`, `Ruled by`, `Spec section touched: ## Open Questions`.

- [ ] **Task 6 (Major #6): Restore Open-Questions bullet format.**
  - **Files:**
    - `skills/planning-loop/lib/auto-apply.sh` (lines 404-405 — `bullet="- [auto-applied $fid] (arbiter: $body_first)"` → restore the contracted shape).
  - **Depends on:** Task 5.
  - **Verify:**
    - Fixture covering wrong-premise → Open Questions append produces a bullet matching `^- \[<short title>\] \(auto-applied <YYYY-MM-DD HH:MM:SS> from /planning-loop arbiter ruling: .+\)$`.
    - SKILL.md Step 6f Phase 1b "Wrong-premise → Open Questions append" prose matches.

- [ ] **Task 7 (Major #7): Fix Phase C cross-ref omission of Rule 6.**
  - **Files:**
    - `skills/planning-loop/SKILL.md` (around line 486 — "(rules 4, 7, 8)" cross-reference — either add rule 6 or amend the surrounding promise of Phase C to match what's listed).
  - **Depends on:** Task 6.
  - **Verify:**
    - Rule 6 (Shape A containment) is either listed in the cross-ref or deliberately excluded with a one-line note.
    - `grep -nE 'rules [0-9, ]+' skills/planning-loop/SKILL.md` — every cross-ref enumerates rules whose numbers exist in the rules table.
    - **Cross-ref audit step** (per Risks): scan the whole file for any `rules \d` or `Clause \d` reference and confirm each target exists.

- [ ] **Task 8 (Major #8): One live end-to-end `/planning-loop` smoke run.**
  - **Files:**
    - No file changes if smoke succeeds. If it surfaces issues, those are added as Wave-1 sub-tasks.
    - Save the run log under `.harness-state/planning-loop/` (already standard).
  - **Depends on:** Task 7 (all earlier regressions fixed).
  - **Verify:**
    - Pick or write a small synthetic spec with at least one mechanical finding pre-injected (e.g. an obvious typo in a Constraints line; a missing acceptance bullet that will draw a Codex `needs-attention`). Run `/planning-loop --revise <synthetic-spec>` to cap. If arbiters return unanimous load-bearing with valid Shape A JSON, auto-apply triggers; verify the receipt prints, the spec is mutated, the audit entry has the rich shape from Task 5, and `git diff` on the spec is non-empty.
    - If arbiters return non-unanimous or `defer/nice-to-have`, the menu prints and the spec is byte-identical — also a valid pass.
    - **No fixture-only verification accepted for this task** — the point is to exercise the live agent dispatch surfaces (spec-planner round-2+, Codex review, arbiter dispatch) that fixtures cannot.

- [ ] **Task 9 (Major #9): Restore `mv` errno capture.**
  - **Files:**
    - `skills/planning-loop/lib/auto-apply.sh` (lines 444-449 — `append_abort "apply-failure" "n/a" "atomic rename failed"` → capture `$?` from the failed `mv` and include `errno=<rc>` per SKILL.md ~line 581).
  - **Depends on:** Task 8.
  - **Verify:**
    - Fixture: make spec parent dir read-only after Phase 1a but before atomic rename (or use a test-only env hook that forces `mv` to fail). Abort entry's Detail line contains `errno=<rc>` with a non-zero numeric.
    - SKILL.md Step 6f Phase 1b step 4 prose matches.

### Wave 2 — Skill-creator alignment (largely independent, can parallelize)

Note: the original draft included a `references/contract.md` carve-out. That carve-out was dropped 2026-04-28 (resolved Q4): the audit-entry shape, JSON Shapes A/B, and Open-Questions bullet shape are load-bearing on the auto-apply hot path and stay INLINE in SKILL.md. Only Rules 1-11 (with rationale) and the Codex/spec-planner prompts move to `references/`. Three Wave 2 tasks remain (rules, prompts, evals scaffolding).

- [ ] **Task 10 (Gap A.1): Carve out `references/rules.md` (rules 1-11 with rationale).**
  - **Files:**
    - `skills/planning-loop/references/rules.md` (new) — Rules 1-11 verbatim with full rationale paragraphs.
    - `skills/planning-loop/SKILL.md` (replace the `## Rules (load-bearing)` rationale prose with a one-line pointer plus a numbered bullet list of rule titles only — keep the 11 titles inline so the model still sees them in context, but move the rationale paragraphs out).
  - **Scope decision (encoded 2026-04-28, resolved Q4):** keep the audit-entry shape, Shape A/B JSON contracts, and Open-Questions bullet shape INLINE in SKILL.md. They're load-bearing on the auto-apply hot path — every cap-reached run with unanimous mechanical findings exercises them, so forcing the model to load `references/contract.md` to know the shape would add an extra read on the most-used path. Only rules-with-rationale (this task) and Codex/spec-planner prompts (Task 11) move to `references/`. Skill-creator's 500-line cap is "ideal" with explicit "feel free to go longer if needed" allowance — the goal is hierarchy (rarely-loaded vs always-needed-on-hot-path), not absolute line count.
  - **Estimated savings:** ~80 lines (rule rationale paragraphs).
  - **Depends on:** Wave 1 merged (rules cross-reference the post-Task-5 audit-entry shape).
  - **Verify:**
    - `wc -l skills/planning-loop/SKILL.md` decreases by ~80 lines (target after this task: ~660).
    - All 11 rule numbers + titles still present in SKILL.md (titles only).
    - Every cross-ref in SKILL.md and `lib/*.sh` of the form "(see Rule #N)" still resolves.
    - **Cross-ref grep audit:** `grep -nE 'rule [0-9]+|step [0-9]+|clause [0-9]+|phase [a-z0-9]+' skills/planning-loop/SKILL.md` — every cited Rule / Step / Clause / Phase number must resolve to a still-present heading in SKILL.md or to a `references/*.md` pointer present in SKILL.md.

- [ ] **Task 11 (Gap A.2): Carve out `references/codex-prompts.md`.**
  - **Files:**
    - `skills/planning-loop/references/codex-prompts.md` (new) — verbatim detail-arbiter (`code-reviewer`) and scope-arbiter (`Plan`) prompts + the round-1 / round-2+ spec-planner dispatch prompts.
    - `skills/planning-loop/SKILL.md` (replace those four prompt blocks with one-line pointers + a 1-sentence summary of when each runs).
  - **Estimated savings:** ~120 lines.
  - **Depends on:** Task 10 (parallel-safe in practice — the prompt blocks are an independent SKILL.md section — but ordering simplifies merge).
  - **Verify:**
    - `wc -l skills/planning-loop/SKILL.md` ≤ ~540 (target: 741 → ~540 after Tasks 10+11; slightly over the 500 soft cap but inside skill-creator's "feel free to go longer if needed" allowance, with zero late-load on the auto-apply path).
    - The four prompts appear verbatim in `references/codex-prompts.md` and the SKILL.md pointers explicitly say "load this file before dispatching".
    - One live end-to-end `/planning-loop` run (or one fixture run that exercises the dispatch path indirectly) — confirm the model still reaches the prompt text via the pointer.
    - **Cross-ref grep audit:** `grep -nE 'rule [0-9]+|step [0-9]+|clause [0-9]+|phase [a-z0-9]+' skills/planning-loop/SKILL.md` — every cited Rule / Step / Clause / Phase number must resolve to a still-present heading in SKILL.md or to a `references/*.md` pointer present in SKILL.md.

- [ ] **Task 12 (Gap B.1): Add `evals/evals.json` + `evals/trigger-eval.json`.**
  - **Files:**
    - `skills/planning-loop/evals/evals.json` (new) — 3 prompts: (a) FRESH mode realistic prose blob (e.g. "team standup digest CLI..."), (b) REVISE mode existing spec at a real path, (c) edge case e.g. corrupted `.harness-state/planning-loop/state.json` from a crashed prior run. Schema per skill-creator §"Test Cases".
    - `skills/planning-loop/evals/trigger-eval.json` (new) — 20 queries, 8-10 should-trigger + 8-10 should-not-trigger near-misses (per skill-creator §"Description Optimization" guidance).
    - `skills/planning-loop/evals/README.md` (optional, ≤30 lines) explaining how `evals/` differs from `lib/test-fixtures/` (one is skill-creator-style integration prompts, the other is bash unit tests).
  - **Depends on:** Wave 2 Tasks 10-11 ideally, but parallel-safe since these files don't touch SKILL.md.
  - **Verify:**
    - `evals/evals.json` parses as JSON and matches the skill-creator schema.
    - `evals/trigger-eval.json` parses as JSON, has ≥ 8 should-trigger and ≥ 8 should-not-trigger.
    - At least one negative trigger query is a near-miss (e.g. "review my spec for typos" — adjacent to /planning-loop but should NOT trigger; /planning-loop is for adversarial review-loop iteration, not spell-check).
    - Future runs of `python -m scripts.run_loop` (deferred to a follow-up spec — see Out of scope) can fire against this scaffolding as a one-command operation whenever the user opts in.

## Risks

1. **Re-binding fixtures to lib scripts may surface latent bugs not in code-reviewer's list.** Task 1 is intentionally a discovery step — running real `lib/auto-apply.sh` against the 15 fixtures will likely turn up issues the inline `run_autoapply()` masked (e.g. variable-scope leaks, environment dependencies the inline copy did not have). **Mitigation:** treat any new fixture failures as Wave-1 sub-tasks with their own Verify; do not paper over them by editing fixtures to match buggy code.
2. **Wave 2 hierarchy refactor (Tasks 10-12) risks the same cross-ref breakage Phase C produced.** Moving prose into `references/` without auditing every internal pointer will leave dangling `(see ...)` references. **Mitigation:** every Wave 2 task's Verify includes a cross-ref audit step. Add a `grep -nE '\(see (Rule|Clause|Step|Phase) #?\d'` sweep to each task's verification.
3. **Audit-entry shape regression (Blocker #5) is silently consumed by anyone who reads the log.** No internal consumer reads it today, but the trim plan's Distribution invariant #3 calls it out as an API. Restoring shape after callers may have built around the truncated form is a future risk. **Mitigation:** none currently needed (no known consumers); call out in commit message.
4. **End-to-end smoke (Task 8) may take 10-30 minutes per run + nontrivial Codex/spec-planner token cost.** **Mitigation:** keep the synthetic spec small; Task 8 is one run, not a sweep.
5. **Description-optimization is deferred to a follow-up spec** (see Out of scope). The eval scaffolding (Task 12) makes the future run a one-command operation, but the run itself is not part of this remediation. **Mitigation:** none needed within this spec — the deferred work is bounded to its own spec when the user opts in.

## Verification

Per-task Verify blocks above are the primary gates. Wave-level exit criteria:

**Wave 1 exit gate (all must hold to merge):**
- All Wave 1 fixture additions/changes (Tasks 1-6) pass against real `lib/` scripts — no inline copy. (Tasks 7 and 9 are SKILL.md / abort-detail edits with no new fixtures; Task 8 is the live end-to-end smoke.)
- `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` exits 0.
- One live `/planning-loop --revise` run completed end-to-end (Task 8); receipt or menu printed; no spec mutated without audit entry.
- `git diff master..HEAD -- skills/planning-loop/` shows only the regression-fix lines + the rewired fixture runner; no other unintended drift.

**Wave 2 exit gate:**
- `wc -l skills/planning-loop/SKILL.md` ≤ ~540 (target after Tasks 10+11; the audit-entry shape, JSON Shapes A/B, and Open-Questions bullet shape stay inline by design — see Task 10 scope decision).
- `references/rules.md` and `references/codex-prompts.md` exist and parse as Markdown.
- `evals/evals.json` and `evals/trigger-eval.json` exist and parse as JSON.
- Cross-ref audit grep finds zero broken `(see ...)` references in `skills/planning-loop/SKILL.md`.

## Open Questions

All Open Questions resolved 2026-04-28. See decisions in Constraints, Out of scope, and Tasks 10-11.

## Out of scope

- Modifying `lib/restore.sh` or `lib/preflight.sh` beyond what's required for Tasks 1-9 (preflight only changes if a fixture surfaces a real bug there).
- Adding new auto-apply features (heading edits, multi-section edits, partial-apply).
- Touching `master` directly. Every commit lands on `claude/analyze-planning-loop-tokens-TO8ld` or a branch off it.
- Generalizing the cross-ref audit into a reusable lint (Open Question #3 — defer).
- **Task 14 (description-optimization run via `python -m scripts.run_loop`) — deferred to a follow-up spec.** Tasks 10-12's eval scaffolding stays in Wave 2 so the future optimizer run is a one-command operation against existing files. All four trigger phrases (`/planning-loop`, "plan and adversarially review X", "iterate this spec to LGTM", "have Codex stress-test this plan") are already preserved in the current description; triggering still works. Description-optimization is fitness improvement, not functionality preservation.
- Renaming the skill or changing the `/planning-loop` argument surface.

## Constraints

- **Branch discipline:** all work targets `claude/analyze-planning-loop-tokens-TO8ld`. Task 1's first action is `git checkout claude/analyze-planning-loop-tokens-TO8ld`. Confirm with `git rev-parse --abbrev-ref HEAD` before any edits.
- **Wave 1 ships as a new 6th commit (or 5 per-blocker commits) on `claude/analyze-planning-loop-tokens-TO8ld`. NO rebase, NO force-push.** Rationale: preserves Phase A/B/C audit trail and keeps regression-restoration commits reviewable in isolation. Rebase would force-push and rewrite the 5 existing phase-A/B/C commits — if a conflict in `auto-apply.sh` drops a Phase A change, the regressions re-emerge silently and the audit trail is gone. Squashing/rebasing-at-merge can happen later but only AFTER fixtures actually drive the lib scripts.
- **Fixture-first verification:** Task 1 is non-negotiable as task #1. Every later regression's fixture must drive the real `lib/` scripts. No "fixtures pass" claim is accepted without a `grep` showing the fixture invokes `auto-apply.sh` or `preflight.sh`.
- **No partial-apply on the contract regressions.** Tasks 2-5 each restore a specific contracted behavior; do not weaken the restored shape because a fixture is awkward to write — write the fixture.
- **macOS bash 3.2 compat.** `lib/auto-apply.sh` uses `eval` + dynamic var names because bash 3.2 has no associative arrays. Keep that pattern; do not rewrite to `declare -A`.
- **Distribution invariants from the trim plan still hold:** absolute paths to lib/ scripts only; contracts in SKILL.md or `references/`, mechanism in `lib/`; audit-entry shape is the API; fixtures must keep passing after every phase.
