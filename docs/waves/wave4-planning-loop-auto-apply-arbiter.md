---
wave_number: 4
slug: planning-loop-auto-apply-arbiter
spec_path: docs/specs/2026-04-27-planning-loop-auto-apply-arbiter.md
merge_sha: 5b29e9a
closed_at: 2026-04-27
---

# claude-harness — Wave 4 summary

**Generated:** 2026-04-27 16:45
**Worktree:** `/Users/klorian/workspace/claude-harness/.claude/worktrees/agent-ae98ef84124e437f4`
**Branch:** `worktree-agent-ae98ef84124e437f4`
**Spec:** `docs/specs/2026-04-27-planning-loop-auto-apply-arbiter.md`
**Routing mode:** dry-run (`.harness-profile` has no `model_routing` key) — all tasks executed on the orchestrator session (Opus 4.7); `.harness-state/orchestrator.jsonl` lines logged with `status: skipped` per the contract, then per-task `status: success` lines appended after each commit.

## §Shipped

| # | Commit | Task | Vertical | Description |
|---|--------|------|----------|-------------|
| 1 | `80c6bb3` | Task 1 | planning-loop, gitignore | Add Step 6e auto-apply preconditions block; add `*.autoapply-tmp` to `.gitignore` |
| 2 | `2776fde` | Task 2 | planning-loop | Add Step 6f auto-apply executor (Phase 1a validation + Phase 1b atomic-rename apply + audit append + post-rename-pre-audit exception) |
| 3 | `c447dea` | Task 3 | planning-loop, restore.sh | Branch Step 6 escalation path on auto-apply; new `#### Auto-apply receipt` block; preserve 4-option menu char-for-char; Phase 1c orphan-temp-file detect at Step 1 pre-flight; `lib/restore.sh` deletes active spec's `.autoapply-tmp` |
| 4 | `36d896b` | Task 4 | planning-loop, project-init | Rule #4 carve-out (2026-04-27); Rule #9 clarification referencing JSON edit-block contract (2026-04-27); new Rule #11 conjunctive precondition with all six clauses + "no partial-apply, ever"; Step 6.5b detail-arbiter prompt template adds the JSON edit-block instruction; usage block documents both opt-out surfaces; cross-skill `planning_loop:` block added to `skills/project-init/SKILL.md` `.harness-profile` template |
| 5 | `846cd1b` | Task 5 | planning-loop | 15 auto-apply test fixtures (A–O) under `skills/planning-loop/lib/test-fixtures/` + `synthetic-spec.md` target + bash 3.2-compatible `run-fixtures.sh` driver; all 15 pass |

Total: 5 commits, 5/5 tasks complete.

## §Wave 4 Exit Gate Results

Run from worktree HEAD `846cd1b` against working tree:

| # | Check | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| 1 | `grep -cF '### 6e. Auto-apply preconditions' skills/planning-loop/SKILL.md` | `1` | `1` | PASS |
| 2 | `grep -cF '### 6f. Auto-apply executor' skills/planning-loop/SKILL.md` | `1` | `1` | PASS |
| 3 | `grep -cF '*.autoapply-tmp' .gitignore` | `>= 1` | `1` | PASS |
| 4 | `grep -cF 'autoapply-tmp' skills/planning-loop/lib/restore.sh` | `>= 1` | `2` | PASS |
| 5 | `grep -cF 'PLANNING_LOOP_NO_AUTO_APPLY' skills/planning-loop/SKILL.md` | `>= 1` | `6` | PASS |
| 6 | `grep -cF 'planning_loop.auto_apply' skills/planning-loop/SKILL.md` | `>= 1` | `2` | PASS |
| 7 | `grep -cF 'planning_loop' skills/project-init/SKILL.md` | `>= 1` | `1` | PASS |
| 8 | `grep -cF 'Rule #11' skills/planning-loop/SKILL.md` | `>= 1` | `1` | PASS |
| 9 | `test -d skills/planning-loop/lib/test-fixtures` | exit 0 | exit 0 | PASS |
| 10 | `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` | exit 0 (15/15 PASS) | exit 0 (15/15 PASS) | PASS |

10 / 10 gate items pass. 0 deferred.

Driver output:
```
PASS  Fixture A (all-unanimous-mechanical) — outcome=success
PASS  Fixture B (one-disagreement) — outcome=menu-validation-failure
PASS  Fixture C (non-mechanical-load-bearing) — outcome=menu-validation-failure
PASS  Fixture D (mixed-defer) — outcome=menu-validation-failure
PASS  Fixture E (json-block-multimatch) — outcome=menu-validation-failure
PASS  Fixture F (json-block-zero-match) — outcome=menu-validation-failure
PASS  Fixture G (insert-after-shape) — outcome=success
PASS  Fixture H (simulated-log-append-fail) — outcome=success
PASS  Fixture I (section-mismatch) — outcome=menu-validation-failure
PASS  Fixture J (match-outside-section) — outcome=menu-validation-failure
PASS  Fixture K (edit-text-contains-h2) — outcome=menu-validation-failure
PASS  Fixture L (external-mutation) — outcome=menu-hash-mismatch
PASS  Fixture M (opt-out-env-var) — outcome=menu-opt-out
PASS  Fixture N (opt-out-profile) — outcome=menu-opt-out
PASS  Fixture O (orphan-tmp-startup) — outcome=preflight-abort
Total: 15   Pass: 15   Fail: 0
```

## §Human-only TODOs

None identified for this wave (verbatim from dispatch). All work was attempted.

Out of scope follow-ups the orchestrator deliberately did NOT do (per the spec and the dispatch instructions):
- No merge to master (worktree-only by design — the human decides whether to merge).
- No edit to `docs/plan.md` Wave 4 row (worktree-only by design).
- No `git push` (matches every prior Wave's flow).

## §Open Questions — answered, deferred, or unchanged

The spec lists 8 Open Questions in `docs/specs/2026-04-27-planning-loop-auto-apply-arbiter.md`. None were answered or modified by Wave 4 execution (Wave 4 is the implementation, not the spec). Their statuses, restated:

- **#1** (bundled diff in receipt) — UNCHANGED (deferred to v4 polish).
- **#2** (JSON-block + extra prose handling) — UNCHANGED (MVP rule documented in spec: JSON contract is authoritative; prose ignored). Answer is implicit in the implementation: the validator extracts the first ```json block and ignores everything else in the recommendation body.
- **#3** (Phase 1c scope) — IMPLEMENTED as the spec's MVP answer (`docs/specs` plus `--revise <path>` parent dir). See `skills/planning-loop/SKILL.md` Step 1's "1c. Orphan auto-apply temp-file detection".
- **#4** (driver script — bash-only) — IMPLEMENTED as bash-only with bash 3.2 compat (macOS shipped bash). Reuse decision documented inline in `run-fixtures.sh` header.
- **#5** (`jq` documented dependency) — UNCHANGED (deferred — fail-closed behavior is in place: missing `jq` aborts validation as `validation-failure`).
- **#6** (audit-first/rename-second) — UNCHANGED (post-rename-pre-audit window is the documented exception; v4 TODO).
- **#7** (`/project-init` schema ownership) — IMPLEMENTED. `skills/project-init/SKILL.md` template gains the commented-out `planning_loop:` block paralleling existing `triage_parking:` opt-in. Coordination done in this wave.
- **#8** (concurrent-writer race window) — UNCHANGED. Spec's documented stance (single-actor envelope, SHA-256 hash recheck as mitigation) is preserved verbatim. Both arbiters ruled wrong-premise per the spec; no implementation change required.

## §KB upsert suggestions

The wave touched:
- A skill (`/planning-loop`) — yes, KB entry `project_planning_loop_skill.md` should gain a "v3 (auto-apply) shipped 2026-04-27 — 5 tasks, 5 commits in worktree-agent-ae98ef84124e437f4; 15-fixture regression suite passes" line after merge. The spec's Cross-references section flags this explicitly.
- A schema (`.harness-profile` `planning_loop.auto_apply`) — yes, KB entry `project_harness_profile_model_block.md` (or a new `project_harness_profile_planning_loop_block.md`) should record the new top-level `planning_loop:` block, default `auto_apply: true`, env-var precedence semantics, and that `/project-init` owns the schema doc per the established convention.

No data-flow, cron, MCP, or infra changes in this wave. KB upserts are documentation-grade only.

## §Deviations from spec

**1. plan.md ↔ spec path divergence (orchestrator followed spec).** The dispatch's MANDATORY-summary item #6 flagged this verbatim. Confirmed:
- `docs/plan.md` Wave 4 exit gate cites `skills/planning-loop/test-fixtures/` and `run-all.sh`.
- `docs/specs/2026-04-27-planning-loop-auto-apply-arbiter.md` Phase 3 cites `skills/planning-loop/lib/test-fixtures/` and `run-fixtures.sh`.
- Per "Sub-bullets are authoritative scope when they diverge from headers" + "follow spec paths" guidance in the dispatch, the orchestrator placed fixtures under `skills/planning-loop/lib/test-fixtures/` and named the driver `run-fixtures.sh`.
- **Recommended follow-up:** during plan.md tick-off, fix the Wave 4 row exit-gate paths to match the spec (`skills/planning-loop/lib/test-fixtures/run-fixtures.sh` and `skills/planning-loop/lib/test-fixtures/`). One-line `sed` on the master copy of `docs/plan.md`.

**2. `cbc2046 → e6f653a` worktree fast-forward before Task 1.** The worktree was created from an older snapshot commit (`cbc2046`) and was missing all of `skills/planning-loop/`, `skills/triage-parking/`, the spec file itself, and 13 unrelated commits. Without the skill files in the working tree no edits would have been possible. The orchestrator ran `git merge --ff-only master` to bring the worktree to master HEAD `e6f653a` before starting Task 1. This was a fast-forward only (no merge commit, no diverging history) and is the standard `/run-wave` precondition (worktree should be at-or-near master HEAD). Documented here as a procedural deviation since /run-wave normally creates a fresh worktree at master HEAD; this worktree pre-existed and was stale.

**3. Bash 3.2 compatibility shim in driver.** macOS ships `bash 3.2.57`, which lacks associative arrays (`local -A`). The driver implements its `VERDICTS_BY_ID` and edit-metadata maps via dynamic variable names + `eval` (`V_CR_F1`, `V_PLAN_F1`, `EK_F1`, etc.). This is a faithful translation of the spec's pseudocode (the spec uses associative-array notation purely for prose clarity); behavior is unchanged. Documented inline in the driver and called out here so future maintainers don't try to "modernize" without verifying the bash version on macOS.

**4. Test hook env var `PLANNING_LOOP_TEST_PIN_SPEC_HASH_PRE`.** Fixture L (external-mutation) needs to inject a spec mutation between Phase 1a's hash capture and Phase 1b's re-check. Since the driver runs Phase 1a and Phase 1b within a single function call (no real subprocess gap), Fixture L pre-records the pre-mutation hash, mutates the spec, and then runs the executor with `PLANNING_LOOP_TEST_PIN_SPEC_HASH_PRE` set so the executor uses the pinned pre-hash for the mismatch comparison. The hook is **only** read by the test driver — production `/planning-loop` invocations never see it. Documented as a comment in `run_autoapply()`.

## §Baseline grep counts (before / after)

Counts taken from worktree HEAD before any Task 1 work, vs. HEAD after Task 5:

| File | Pattern | Before | After | Δ |
|------|---------|--------|-------|---|
| `.gitignore` | `*.autoapply-tmp` | 0 | 1 | +1 |
| `skills/planning-loop/SKILL.md` | `Auto-apply preconditions` | 0 | 1 | +1 |
| `skills/planning-loop/SKILL.md` | `### 6e.` | 0 | 1 | +1 |
| `skills/planning-loop/SKILL.md` | `### 6f.` | 0 | 1 | +1 |
| `skills/planning-loop/SKILL.md` | `PLANNING_LOOP_NO_AUTO_APPLY` | 0 | 6 | +6 |
| `skills/planning-loop/SKILL.md` | `planning_loop.auto_apply` | 0 | 2 | +2 |
| `skills/planning-loop/SKILL.md` | `Rule #11` | 0 | 1 | +1 |
| `skills/planning-loop/SKILL.md` | `(Carve-out added 2026-04-27.)` | 0 | 1 | +1 |
| `skills/planning-loop/SKILL.md` | `(Clarification added 2026-04-27)` | 0 | 1 | +1 |
| `skills/planning-loop/SKILL.md` | `no partial-apply, ever` | 0 | 1 | +1 |
| `skills/planning-loop/lib/restore.sh` | `autoapply-tmp` | 0 | 2 | +2 |
| `skills/project-init/SKILL.md` | `planning_loop` | 0 | 1 | +1 |
| `skills/planning-loop/lib/test-fixtures/` | (directory exists) | no | yes | +1 dir |

Total file count delta: 17 added (15 fixtures + synthetic-spec + driver), 4 modified (`SKILL.md` planning-loop, `SKILL.md` project-init, `restore.sh`, `.gitignore`).

## Post-execution context for the merger

- Branch `worktree-agent-ae98ef84124e437f4` is 5 commits ahead of master (`e6f653a..846cd1b`).
- Working tree is clean (`git status` returns empty).
- The `--no-ff` merge from master should pull all 5 commits in order; commit messages follow the existing harness convention (`feat(...)`, `test(...)` prefixes, "Wave 4 Task N" body line, Co-Authored-By).
- The summary file you are reading lives at `docs/2026-04-27-claude-harness-wave4-summary.md` per the dispatch's mandatory-output instruction; it should land in the merge or be discarded by the close-wave step (consistent with the Wave 1/2/3 summary handling).

End of summary.
