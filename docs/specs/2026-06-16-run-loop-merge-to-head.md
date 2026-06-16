# Spec: /run-loop — adopt the `merge-to-head` model + PR handoff for the HITL minority (Wave 23)

**Date:** 2026-06-16
**Status:** revised per a locked operator decision (simplify — drop the policy knob, add an always-on PR handoff + a persistent attention report) — ready for adversarial review
**Board wave:** Wave 23 · Phases 1–4 · Tasks 1–8 · Features F-022–F-029
**Predecessor:** `docs/specs/2026-06-15-run-loop-live-drain-fixes.md` (Wave 22 — the live-drain bug fixes + per-run backend-direction knob)

> **Board wave:** Wave 23 · Phases 1–4 · Tasks 1–8 · Features F-022–F-029
> _(Machine-readable map per AGENTS.md §"Plan & spec grammar". `Wave 23` is the board number; `Phase`/`Task` restart at 1 inside this spec. `F-0xx` is global/monotonic — Wave 22 reached F-021.)_

## Prior Work

Builds on: [/run-loop live-drain fixes](2026-06-15-run-loop-live-drain-fixes.md) (Wave 22), [/run-loop live wiring](2026-06-14-run-loop-live-wiring.md) (Wave 21), and the engine spec [/run-loop engine](2026-06-14-run-loop-engine.md) (Waves 18–20).

Assumes (inherited, unchanged):
- The frozen Phase-1 seams in `skills/_shared/loop/types.ts` (`WorkSource`/`Runner`/`PerItemProtocol`/`RunnerFactory`/`WorkItem`/`ItemResult`/`RunSummary`/`EngineDeps`) and `engine.ts`'s `runLoop`. **Additive-only — see Hard constraints.** This invariant held across Waves 18–22 (`types.ts`/`engine.ts` 0 lines changed) and holds here too.
- The Wave-22 composition layer: the `ProductionProtocol` (`run-loop-prod-deps.ts`), the `ReadinessGatedSource` (serial readiness sequencing already live), the env-gated `TerminalTransitionHook`, the `ShellGitCommitter` agent-edits/runner-commits model with the additive `diff()`/`dirty()` probes, the live driver (`run-loop-driver.ts`), the production composition root + entry (`run-loop-prod-deps.ts` + `run-loop-entry.ts`), and the per-run `--implement`/`--review` backend-direction knob.
- The `GhClient` seam (`skills/_shared/loop/gh-seam.ts`) — the single injected boundary for every real `gh` side effect. It is a Wave-19 seam (NOT a frozen Phase-1 interface), so the PR-open primitive this wave needs is an **additive method** on it.
- The **already-built-but-unwired** modules this wave dispositions: `merge/merge-contract.ts` (`MergeContract`, the full atomic-merge contract), `merge/run-lock.ts` (`acquireRunLock`), `post-merge.ts` (`PostMergeEffects`, `DownstreamEffects`), `classifier-reconcile.ts` (`reconcileReadiness`), and `scheduler/dag.ts` (`scheduleRun`).
- The sandcastle reference architecture captured in `sandcastle_mattpocock_architecture.md` (repo root), code-verified against `@ai-hero/sandcastle` 0.9.0 — the source for the `merge-to-head` model this wave adopts.

Changes (this spec overrides / extends Wave 22):
- Today the production drive **commits in place** on the repo cwd (`buildIssuesProductionDeps`'s `cwdFor: () => repoCwd`; `ProductionProtocol.runInner` `commitAll(cwd, …)` directly on HEAD; the "merge" is a synthetic `merged at <sha>` note at `run-loop-prod-deps.ts:394–396` that records the current HEAD SHA without any branch/merge step). This is sandcastle's **least-isolated `head` strategy** dressed up as a merge. Wave 23 replaces it with sandcastle's recommended **`merge-to-head`**: per-item isolated temp branch off HEAD → agent edits there → runner commits → mechanical gate → **on GREEN, host-side `git merge` the temp branch into HEAD** (fast-forward in the serial case) → delete the temp branch. An item that needs a human (conflict / red gate / escalated review) gets a **predictable-named branch pushed + a draft PR opened**, and its row in a **persistent attention report** — so nothing is lost and the next step is always obvious.

## Why this spec exists (the mantra — do not violate)

`/run-loop` is the **third lane**: an unattended loop that drives many items end-to-end with **NO human between merges**, replacing the human judgment gate with a **mechanical** one (green tests + Verify + zero surviving CRITICAL/HIGH review findings). It is "automated, batched `/close-wave`." **HITL is the rare exception, never the default. Forcing a PR per item is explicitly REJECTED — it breaks the loop's reason to exist.**

The motivating defect: the loop's current "merge" is a no-op label over commit-in-place. A failed or escalated item's commits land directly on HEAD (sandcastle's `head` strategy — explicitly rejected for isolated providers, `sandcastle_mattpocock_architecture.md` §2). There is no per-item isolation, and when an item DOES need a human, the operator has no tidy to-do list — the work is just stuck on a local tree. Wave 23 fixes both: per-item isolation via `merge-to-head`, and a **boring, minimal HITL handoff** — for the rare item that can't auto-merge, the loop pushes a predictably-named branch, opens a draft PR, and writes a one-glance attention report. The happy path (most items) is unchanged: gate green → auto-merge to HEAD, no PR, no human.

## Design decisions (locked — operator-confirmed)

| # | Axis | Decision |
|---|------|----------|
| 1 | **Happy path: merge-to-head, no human** | An item that passes the mechanical gate is **auto-merged to HEAD** (host-side `git merge` of its temp branch, fast-forward in the serial case), then the temp branch is deleted. **No PR, no `git push`, no human.** This is most items. Replaces the synthetic `merged at <sha>` commit-in-place behavior (`run-loop-prod-deps.ts:394–396`). The merge is a host-side `git` op through the committer seam (additive method, the `diff()`/`dirty()` precedent) — frozen `runLoop`/`types.ts` untouched. |
| 2 | **Per-item isolation** | Each item works on an isolated temp branch off current HEAD with a **predictable name** (`run-loop/issue-<n>` for issues, `run-loop/<item-id>` otherwise). A non-green item's commits live **only** on that branch and **never touch HEAD**. The branch is **preserved** (not deleted) for the HITL handoff. Only a green, no-escalation item's branch is merged-then-deleted. |
| 3 | **HITL handoff = the loop opens a draft PR** | When an item needs a human — **merge conflict**, **red gate** (failed checks), or a **reproduced/escalated review finding** — the loop: keeps the predictable-named branch, **pushes it**, and **opens a draft PR** via the injected `GhClient` seam (additive `createPullRequest`/`openDraftPr` method). The operator's next step is just "open the PR link, review, merge/close" — **no local git**. This is the ONLY place a PR is created, and only for the HITL minority. The result records the PR url in its note. |
| 4 | **No per-repo PR mode — the policy knob is GONE** | There is **no** `loop_merge_policy: auto\|pr` knob (the old Wave-23-draft T4 is **deleted**). Auto-merge is THE default for every repo; a PR is created ONLY as the exception handoff for a HITL item (D3). This removes the scariest open question (real-PR-vs-hand-a-branch) — it is now always "open a real draft PR for the HITL minority." |
| 5 | **Persistent attention report** | Every run writes `.harness-state/run-loop-<date>-attention.md` and the run summary points at it. It is a short to-do list that **survives the terminal session**: a header line (`N items: X auto-merged ✓ · Y need you ↓`) and, per need-you item, the **reason** (MERGE CONFLICT / FAILED CHECK / REVIEW FINDING), the **branch name**, the **PR link**, and a one-line next step. Format mirrors the operator-approved preview (see §"Attention report format"). |
| 6 | **Graceful no-remote fallback** | If there is no git remote or no `gh` creds (the clean-room / throwaway integration test), the PR step (D3) degrades to: **preserve the predictable-named branch locally + write the exact copy-paste git/gh commands into the attention report** (e.g. `git push -u origin run-loop/issue-2 && gh pr create --draft …`) instead of erroring. The run does **not** fail. PR creation goes through the injected `GhClient` seam, so tests never hit live GitHub. |
| 7 | **escalate-on-conflict: abort + preserve + handoff + continue** | If the auto-merge `git merge` conflicts (only possible under concurrency or an external push/operator commit — impossible in the pure serial fast-forward case), the loop: `git merge --abort` (HEAD untouched), preserves the branch, runs the D3 handoff (push + draft PR), records `status:'escalated'` with a `merge-conflict:`-prefixed note + the PR url, defers dependents (un-yielded by `ReadinessGatedSource`), and **continues the loop** (skip-and-continue). **Does NOT crash** — improving on sandcastle's hard-failure-stops-the-run weakness (`sandcastle_mattpocock_architecture.md` §6). Distinct from the verify-gate escalation note (`merge-conflict:` = "can't integrate now" vs "code is wrong"). |
| 8 | **Termination caps enforced in the live drive** | The iteration cap (default 20) + stall-after-3 exist in `termination.ts` but the frozen `runLoop` only stops on `drained`. Wire the cap check in the composition layer (additive, NOT by editing `engine.ts`): a `WorkSource` wrapper composing with `ReadinessGatedSource` consults `shouldStop` and returns `null` from `nextReady()` once a cap/stall hits, threading the real `RunStopReason` into the printed `RunSummaryReport` (the Wave-21 "alongside the frozen RunSummary" precedent). |

## Attention report format

```
# /run-loop — needs your attention (<date>)
4 items: 2 auto-merged ✓ · 2 need you ↓

## #2 distinct-values — MERGE CONFLICT
   Branch pushed, PR opened: <url>
   → open the link, resolve, click Merge
```

Each need-you item is one `##` block: `## <id> <short-title> — <REASON>` then the branch+PR line and a `→ <one-line next step>`. The no-remote fallback (D6) replaces the "Branch pushed, PR opened: <url>" line with the exact copy-paste commands. Auto-merged items are counted in the header but not listed (nothing to do).

## Hard constraints (the exit gate enforces these)

- **Zero change to the frozen Phase-1 interfaces.** `skills/_shared/loop/types.ts` and `engine.ts` MUST NOT change shape (Wave 18 froze them; Waves 19–22 honored it — 0 lines changed). The merge-to-head + handoff + report logic lives in the **committer/protocol/composition layer**, not the engine. Additive methods on concrete impls (`ShellGitCommitter.createTempBranch()/mergeToHead()/abortMerge()/deleteBranch()/pushBranch()`, via the structural `ShellGitCommitterLike` like the existing `diff?`/`dirty?` probes) and an additive `GhClient` PR-open method are allowed; the frozen interfaces are not touched. If any task is found mid-build to require touching `WorkSource`/`Runner`/`PerItemProtocol`/`WorkItem`/`ItemResult`/`RunSummary`/`EngineDeps` in `types.ts` or `runLoop` in `engine.ts`, **STOP and flag it loudly** with the specific interface.
- TypeScript strict, **no `any`**. Toolchain: Node ≥24 native type-stripping, `node:test`, no build step; strict `tsc` 0 errors via ephemeral `typescript@5.7.2` + `@types/node@22` (mirror Waves 21–22; no vendored tsc).
- **Baseline is 223 tests** (operator-confirmed via `npm test` — supersedes plan.md's 212 snapshot at `cb8d098`). Every task needs unit tests via injected `SpawnFn`/`GitCommitter`/`GhClient` seams — **NO real git/network in unit tests.** The existing throwaway-repo integration test is the place for real-git proof of the merge-to-head lifecycle (fast-forward merge, conflict abort, preserved branch) AND the no-remote attention-report fallback.
- **Don't log secrets/env** (the existing adapters never do — `truncateStderr` surfaces stderr tails, never env; keep that posture).

## Scope discipline

**IN scope (this wave):** merge-to-head isolation + auto-merge on green (D1/D2); the always-on PR handoff for the HITL minority — push + draft PR via `GhClient` (D3); the persistent attention report + summary pointer (D5); the no-remote fallback to copy-paste commands (D6); `escalate-on-conflict` abort + preserve + handoff + skip-and-continue (D7); termination-cap enforcement in the drive (D8); and the **module-disposition task** (Task 7) that decides per built-but-unwired module WIRE-vs-RETIRE and fixes the SKILL.md/spec narrative.

**OUT of scope (stated explicitly):**
- The **container/sandcastle lane** (separate Docker + auth effort) — `UnsupportedContainerRunner` stays; sandcastle items are still preflight-refused (Wave-22 Bug 2). Merge-to-head here is the **worktree/host** lane only.
- The full **Wave-20 secret-containment envelope** (default-deny egress / per-item pre-approval / scoped creds) — Codex's native sandbox is the default-lane boundary; the envelope is **deferred**.
- **A per-repo "always PR" policy mode** — deleted (D4). The loop never PRs the happy-path majority.
- **`git push` of merged work** — the happy-path merge is local-to-HEAD only. The ONLY push is the HITL handoff branch (D3), and that pushes the unmerged temp branch, never HEAD.
- **Auto-merging the PR** — the loop opens a *draft* PR and stops; merging/closing it is the human's step.

**On the merge-contract run-lock:** pure-serial merge-to-head does **NOT** need the `MergeContract`/`run-lock.ts` machinery — the lock + base-SHA CAS precondition only become necessary IF/WHEN items merge **concurrently** (`sandcastle_mattpocock_architecture.md` §5). Task 7 records: wire the minimal `git merge` + abort-on-conflict now (D1/D7) and treat the full `MergeContract`/`run-lock` as **retired-until-concurrency** (kept in-tree, narrative states it activates only for concurrent merges).

## Implementation

**Recommended flow:** `/run-wave 23` → orchestrator dispatches T1 first, then T2/T3/T4 (after T1) + T6/T7 (independent) → `/close-wave 23`, then the operator runs T5 + T8 (the live merge-to-head + handoff re-drain) on a worktree runner with creds re-provided.
**Reason:** 8 tasks; rank-3 parallelism (T1 unblocks T2/T3/T4/T6; T5/T7 independent); partial completion is materially worse than no change (a half-adopted merge-to-head leaves the loop committing-in-place on some paths and merging on others, and a handoff without a report loses items) — wave-shaped with all-or-nothing merge semantics.
**Alternatives:** `/micro` per task + `/commit` between for the code tasks if the orchestrator is unavailable; T5/T8 are operator-gated either way.
**Implementation block written:** 2026-06-16

## Requirements

### Phase 1: Merge-to-head lifecycle + HITL handoff (worktree lane)

#### Task 1: Temp-branch lifecycle on the committer (F-022)

Add the merge-to-head git primitives to `ShellGitCommitter` as **additive concrete methods** (structural `ShellGitCommitterLike`, like `diff?`/`dirty?`): `createTempBranch(cwd, name)` (create + checkout a predictable-named branch off current HEAD), `mergeToHead(cwd, branch)` (`git merge` the branch into the host's current branch, fast-forward where possible; a non-zero exit surfaces as a typed conflict result, NOT a raw throw), `abortMerge(cwd)` (`git merge --abort`), `deleteBranch(cwd, branch)` (`git branch -D`), and `pushBranch(cwd, branch)` (`git push -u <remote> <branch>`; a missing-remote/no-creds failure surfaces as a typed result so the caller can fall back, NOT a crash). The `GitCommitter` interface is **not** widened. All real git goes through the injected `SpawnFn`.

- **Files:** `skills/_shared/loop/dispatch/implement.ts` (`ShellGitCommitter` additive methods + the `ShellGitCommitterLike` structural type in `run-loop-prod-deps.ts` if a new method needs surfacing), `skills/_shared/loop/test/implement-adapters.test.ts`.
- **Depends on:** Nothing.
- **Runner:** sandcastle  # classifier: ready-for-agent; gates: none
- **Verify:** New `node --test` with a fake `SpawnFn` recording git invocations: `createTempBranch(cwd,'run-loop/issue-2')` issues `git checkout -b run-loop/issue-2`; `mergeToHead` issues `git merge <branch>` and a non-zero merge exit returns a typed conflict (not a throw); `abortMerge` issues `git merge --abort`; `deleteBranch` issues `git branch -D <branch>`; `pushBranch` issues `git push -u …` and a non-zero push (no remote) returns a typed failure, not a throw. (Fails before: these methods don't exist on `ShellGitCommitter`.)
- **Manual fallback:** Open `implement.ts`; add the five methods to `ShellGitCommitter` following the existing `dirty()`/`diff()` shape (shell `git` via the spawn seam; return typed `{ok:false}` for the expected merge-conflict / push-no-remote cases rather than throwing); add fake-spawn assertions to `implement-adapters.test.ts`; run `node --test skills/_shared/loop/test/`; `git add` the two files and commit.

#### Task 2: Protocol drives merge-to-head on green + preserve-named-branch otherwise (F-023)

Rewire `ProductionProtocol.runInner` (`run-loop-prod-deps.ts:304`) so the per-item lifecycle is: prepare → **create the predictable-named temp branch off HEAD** (`run-loop/issue-<n>` / `run-loop/<item-id>`) → agent edits → runner commits **on the temp branch** → exit gate → review → verify-gate → **on GREEN + no escalation, `mergeToHead` + `deleteBranch`** (record `completed` with the real merge SHA, NOT the synthetic `merged at <sha>`). On a red gate / implement-failure / verify-gate escalation: **leave the named branch in place** (no merge, no delete) and record `failed`/`escalated` with the branch name in the note — the HITL handoff (Task 3) consumes it. HEAD only ever advances via `mergeToHead`. Replaces the commit-in-place + synthetic-merge behavior at `run-loop-prod-deps.ts:328–396`.

- **Files:** `skills/_shared/loop/run-loop-prod-deps.ts` (`ProductionProtocol.runInner` lifecycle + branch-name helper + the `ShellGitCommitterLike` probes), `skills/_shared/loop/test/prod-deps.test.ts`.
- **Depends on:** Task 1.
- **Runner:** sandcastle  # classifier: ready-for-agent; gates: none
- **Verify:** New `node --test` with a fake committer recording calls + a fake gate/review: a GREEN item calls `createTempBranch`→`mergeToHead`→`deleteBranch` and the `completed` note carries the merge SHA; a RED-gate item calls `createTempBranch` but **never** `mergeToHead`/`deleteBranch` (branch preserved) and the note names `run-loop/<id>`; an escalated item likewise preserves the branch. Assert HEAD is never mutated on a non-green item. (Fails before: `runInner` commits on cwd directly and emits the synthetic `merged at <sha>`.)
- **Manual fallback:** Edit `runInner` to create the named temp branch before the agent step, move `mergeToHead`+`deleteBranch` into the GREEN tail (replacing the synthetic `head()` note), and have the RED/escalated returns carry the preserved branch name; add the call-order assertions to `prod-deps.test.ts`; run `node --test`; commit.

#### Task 3: HITL handoff — push + draft PR (with no-remote fallback) folded with escalate-on-conflict (F-024)

For every non-green outcome (red gate, escalated review finding, OR a merge conflict), run the HITL handoff: `pushBranch` the preserved named branch and open a **draft PR** via the injected `GhClient` additive `createPullRequest`/`openDraftPr` method, then record the PR url in the `ItemResult.note`. On a **merge conflict** specifically: first `abortMerge` (HEAD untouched), tag the note `merge-conflict:` (distinct from the verify-gate escalation note), then do the same handoff. If `pushBranch` or the PR-open fails because there is **no remote / no creds** (D6), degrade gracefully: keep the branch locally and stash the exact copy-paste commands for the attention report — do NOT crash. The loop continues to the next item (skip-and-continue); a conflicted item's dependents stay un-yielded by `ReadinessGatedSource`. The run never crashes (improving on sandcastle's hard-failure behavior).

- **Files:** `skills/_shared/loop/run-loop-prod-deps.ts` (conflict abort + the handoff call in `runInner`; note prefixes + PR url), `skills/_shared/loop/gh-seam.ts` (additive `createPullRequest`/`openDraftPr` method — `GhClient` is a Wave-19 seam, not frozen), `skills/_shared/loop/gh-adapter.ts` (the real `gh pr create --draft` impl), `skills/_shared/loop/test/prod-deps.test.ts` + `skills/_shared/loop/test/gh-adapter.test.ts`.
- **Depends on:** Task 2.
- **Runner:** sandcastle  # classifier: ready-for-agent; gates: none
- **Verify:** New `node --test` with a fake committer + a recording fake `GhClient`: a RED-gate item → `pushBranch` is called, the fake `GhClient` records one draft-PR open for `run-loop/<id>`, and the `failed` note carries the returned PR url; a conflict item → `abortMerge` is called (no `deleteBranch`), the note is `merge-conflict:` + the PR url, and a second healthy item in the same run still processes (loop continued). No-remote case: the fake `pushBranch` returns a typed failure → no PR open is attempted, the result instead carries the copy-paste-command payload, and the run does not throw. (Fails before: no handoff/conflict path; a merge throw would propagate out of `runInner` and get mis-bucketed as `implement-failed`.)
- **Manual fallback:** Add `createPullRequest`/`openDraftPr` to the `GhClient` interface + the `gh pr create --draft` adapter impl; in `runInner`, wrap `mergeToHead` to detect conflict→`abortMerge`, then for every non-green outcome call `pushBranch`+PR-open (guarded by a typed-failure check that falls back to copy-paste commands); thread the PR url / fallback payload into the note; add the fake-GhClient + no-remote tests; run `node --test`; commit.

#### Task 4: Persistent attention report writer + summary pointer (F-025)

Add an attention-report writer: at run end, write `.harness-state/run-loop-<date>-attention.md` in the §"Attention report format" shape — a header (`N items: X auto-merged ✓ · Y need-you ↓`) and one `##` block per need-you item (reason + branch + PR url, or the no-remote copy-paste commands + one-line next step). The driver's printed run summary gains a final line pointing at the file path. The writer is an injected file-sink seam so unit tests assert the rendered markdown without touching disk. The file is written even when there are zero need-you items (header only) so the operator always has the latest state.

- **Files:** `skills/_shared/loop/run-loop-attention-report.ts` (new — the renderer + file-sink seam), `skills/_shared/loop/run-loop-driver.ts` (call the writer at run end + add the summary pointer line), `skills/_shared/loop/run-loop-prod-deps.ts` (thread the per-item handoff data into the report rows), `skills/_shared/loop/test/run-loop-attention-report.test.ts` + `skills/_shared/loop/test/run-loop-driver.test.ts`.
- **Depends on:** Task 3 (the report rows come from the handoff results).
- **Runner:** sandcastle  # classifier: ready-for-agent; gates: none
- **Verify:** New `node --test`: given a run with 2 completed + 1 merge-conflict (PR url) + 1 red-gate (no-remote fallback), the renderer produces the exact header `4 items: 2 auto-merged ✓ · 2 need you ↓`, a `## … — MERGE CONFLICT` block with the PR url + `→` next step, and a `## … — FAILED CHECK` block with the copy-paste commands; the file-sink is called once with path matching `.harness-state/run-loop-*-attention.md`; the driver summary prints a pointer to that path. A zero-need-you run still writes the header-only file. (Fails before: no attention report exists.)
- **Manual fallback:** Create `run-loop-attention-report.ts` with a pure `renderAttentionReport(rows): string` + a `write(path, body)` sink; call it from the driver at run end and print the path; thread the handoff rows from the prod-deps results; add the renderer + driver tests; run `node --test`; commit.

### Phase 2: Termination caps in the drive

#### Task 5: Enforce iteration cap + stall in the composition layer (F-026)

Wire `termination.ts`'s `shouldStop`/`recordOutcome`/`DEFAULT_TERMINATION` into a `WorkSource` wrapper composing with `ReadinessGatedSource`: track `RunProgress` across `recordResult`, and once a cap (iteration ≥ 20) or stall (3 consecutive gate-fails) hits, `nextReady()` returns `null` — the frozen `runLoop` stops as `drained`, while the **real** `RunStopReason` (`iteration-cap` / `stall`) is threaded into the printed `RunSummaryReport.stopReason`. `engine.ts` is **not** modified.

- **Files:** `skills/_shared/loop/run-loop-prod-deps.ts` (the termination-aware source wrapper + thread the real stop reason into `buildReport`), `skills/_shared/loop/test/prod-deps.test.ts` (or a new `termination-drive.test.ts`).
- **Depends on:** Nothing (composes with T1–T4; independently shippable).
- **Runner:** sandcastle  # classifier: ready-for-agent; gates: none
- **Verify:** New `node --test`: 25 ready items with the default cap stop after exactly 20 visited with `stopReason: iteration-cap`; 3 consecutive `gate-failed`/`implement-failed` results stop after 3 with `stopReason: stall` and no 4th attempt; a clean small run reports `drained`. Assert `engine.ts` byte-unchanged (the wrapper returns `null`; the engine sees `drained`). (Fails before: the drive never consults `shouldStop`.)
- **Manual fallback:** Add a `TerminationGatedSource` wrapping the readiness source; fold each outcome via `recordOutcome` in `recordResult`, check `shouldStop` in `nextReady` and return `null` when it fires (stashing the reason); thread the reason into `buildReport`'s `build(reason)`; add the cap/stall tests; run `node --test`; commit.

### Phase 3: Module disposition + docs

#### Task 6: Live merge-to-head + no-remote-handoff proof in the throwaway-repo integration test (F-027)

Extend the existing throwaway-repo integration test (real git, no network) to prove: a GREEN item's temp branch is fast-forward merged into HEAD and deleted (HEAD advances); a forced-RED item's named branch is preserved + HEAD unchanged, AND — since the throwaway repo has no remote — the **no-remote fallback (D6)** fires, writing copy-paste commands into the attention report rather than erroring; a forced merge-conflict aborts cleanly and preserves the branch without crashing. This is the real-git arbiter the unit-fakes stand in for.

- **Files:** `skills/_shared/loop/test/<existing throwaway-repo integration test>.test.ts` (extend; identify via `grep -l 'mkdtemp\|throwaway\|git init' skills/_shared/loop/test/`).
- **Depends on:** Tasks 1–4.
- **Runner:** sandcastle  # classifier: ready-for-agent; gates: none
- **Verify:** `node --test` on the integration file: after a GREEN drive, `git rev-parse HEAD` differs from the pre-run HEAD and `git branch --list 'run-loop/*'` is empty; after a RED drive, HEAD equals the pre-run HEAD, the `run-loop/*` branch still exists, and the written attention report contains the copy-paste `git push`/`gh pr create` commands (no-remote fallback, no throw); the conflict case ends with HEAD unchanged, branch preserved, exit 0. (Fails before: the integration test only exercises commit-in-place.)
- **Manual fallback:** Open the integration test; add a green-merge case (HEAD advanced + branch deleted), a red case (HEAD unchanged + branch preserved + report has copy-paste commands), and a conflict case (advance HEAD out-of-band, drive a conflicting item, assert abort + preserve + no throw); run `node --test`; commit.

#### Task 7: Built-but-unwired module disposition + narrative reconciliation (F-028)

Decide, per built-but-unwired module, WIRE-vs-RETIRE and update `skills/run-loop/SKILL.md` + this spec's narrative so docs stop claiming behavior the code lacks. Dispositions (locked): **`scheduler/dag.ts`** — RETIRE/defer (serial `ReadinessGatedSource` is the chosen sequencing; mark deferred-until-parallel-execution). **`merge/merge-contract.ts` + `merge/run-lock.ts`** — RETIRE-until-concurrency (pure-serial merge-to-head needs no lock/CAS; keep in-tree, narrative states it activates only for concurrent merges). **`post-merge.ts`** — keep; note it's the close-wave tick/receipt path still env-gated behind transitions (per Wave 22); state WIRE-behind-the-existing-gate vs leave-for-later. **`classifier-reconcile.ts`** — keep; note it's the pickup-time relabel path called when transitions are enabled. Each module gets a one-line status comment; SKILL.md gets a "module status" subsection AND its behavioral description updated to the merge-to-head + PR-handoff + attention-report model (NO commit-in-place / synthetic-merge language, NO policy-knob language).

- **Files:** `skills/run-loop/SKILL.md` (module-status subsection + the merge-to-head/handoff/report description replacing commit-in-place + any policy-knob language), `skills/_shared/loop/scheduler/dag.ts` + `skills/_shared/loop/merge/merge-contract.ts` + `skills/_shared/loop/merge/run-lock.ts` + `skills/_shared/loop/post-merge.ts` + `skills/_shared/loop/classifier-reconcile.ts` (one-line status comment each).
- **Depends on:** Nothing (doc/comment sweep; do after the code tasks land so the description matches reality).
- **Runner:** sandcastle  # classifier: ready-for-agent; gates: none
- **Verify:** `grep -c 'module status\|RETIRE\|deferred-until\|merge-to-head\|attention' skills/run-loop/SKILL.md` ≥1 for each disposition/feature keyword; each of the five modules carries a status comment (`grep -l 'status:' skills/_shared/loop/scheduler/dag.ts skills/_shared/loop/merge/*.ts skills/_shared/loop/post-merge.ts skills/_shared/loop/classifier-reconcile.ts` returns all five); SKILL.md has NO remaining "commit in place"/synthetic-merge/`loop_merge_policy` language (`grep -iE 'commit.in.place|merged at <sha>|loop_merge_policy' skills/run-loop/SKILL.md` empty). (Fails before: SKILL.md describes the synthetic merge; modules carry no disposition.)
- **Manual fallback:** Edit `SKILL.md` to add the "module status" subsection and replace commit-in-place/policy-knob language with the merge-to-head + PR-handoff + attention-report lifecycle; add a one-line `// status: …` comment atop each of the five modules; run the grep checks; `git add` the touched files and commit. No LLM tool required.

### Phase 4: Live acceptance (operator-gated)

#### Task 8: Live merge-to-head + handoff re-drain of quickbase-replacement #2/#3 (F-029)

Re-run `/run-loop issues` against `agaleraib/quickbase-replacement` (#2 ready, #3 `## Blocked by #2`) on a throwaway branch and confirm: #2's work lands on `run-loop/issue-2`, gates GREEN, **fast-forward merges into HEAD**, branch deleted; #3 branches off the merged HEAD and drains; nothing commits-in-place; if anything escalates (conflict / red gate / review finding), the loop pushes the named branch + opens a draft PR and the run writes the attention report with the PR link. Operator-gated (live `gh` + backend auth; keys re-provided per run, never stored).

- **Files:** `skills/_shared/loop/test/live-test-runbook.md` (Wave 23 merge-to-head + handoff procedure + captured summary + attention-report excerpt), `docs/waves/wave23-*.md` (close-wave receipt).
- **Depends on:** Tasks 1–7.
- **Runner:** worktree  # classifier: ready-for-human; gates: unobtainable-credential (live backend + gh creds), out-of-band-action (real repo run + live draft-PR open), irreversible-prod-action (only if `RUN_LOOP_TRANSITION_ISSUES=1`; default-off keeps it reversible)
- **Verify:** The real run drains #2 end-to-end with a **real `git merge`** advancing HEAD (the trace shows a merge SHA + a deleted `run-loop/issue-2` branch, not a synthetic `merged at <sha>`), defers #3 until #2 is merged, then drains #3 off the merged HEAD, never commits in place; any escalated item shows a pushed `run-loop/issue-<n>` branch + an opened draft PR url; the run writes `.harness-state/run-loop-<date>-attention.md` and the summary points at it. No red merge lands; no push of HEAD. (Fails before: the live drive commits in place with the synthetic merge note and has no handoff/report.)
- **Manual fallback:** Follow `live-test-runbook.md`: clone quickbase-replacement, branch throwaway, source keys into `process.env` only, run `RUN_LOOP_ALLOW_EXTERNAL_REVIEW=1 node skills/_shared/loop/run-loop-entry.ts issues --implement codex --review anthropic-api:opus-4.8 --yes`; inspect `git log --graph` + `git branch --list 'run-loop/*'` + any `gh pr list --draft` + `cat .harness-state/run-loop-*-attention.md` to confirm merge/delete + handoff + report; paste the summary + report excerpt into the runbook + wave receipt. No LLM tool required.

### WORKFLOW.md row delta

No new user-facing command is added. Task 7 edits the **existing** `/run-loop` skill's narrative (`skills/run-loop/SKILL.md`, shipped Wave 20 Task 16) to describe merge-to-head + the PR handoff + the attention report — it does not introduce a new command, slash command, or subagent invocation. The `/run-loop` row is unchanged:

| Protocol command | Manual | Claude Code | Codex prompt contract | Automation |
|---|---|---|---|---|
| /run-loop | `node skills/_shared/loop/run-loop-entry.ts <waves\|issues> [--yes]` | `/run-loop waves` \| `/run-loop issues` | unchanged | unchanged |

## Exit gate

`skills/_shared/loop/` tests stay green (the **223** baseline + the new merge-to-head / handoff / no-remote-fallback / attention-report / termination-cap regression tests); strict `tsc` 0 errors; **no `any`**; **zero frozen Phase-1 interface change** (`types.ts` / `engine.ts` 0 lines; only additive concrete committer methods, an additive `GhClient` PR-open method, a new attention-report module, and additive composition-layer wrappers). The model is proven: the throwaway-repo integration test shows a real fast-forward `git merge` advancing HEAD + temp-branch deletion on GREEN, a preserved named branch + unchanged HEAD on RED with the **no-remote fallback** writing copy-paste commands into the report, and a clean `git merge --abort` + preserved branch + no-crash on conflict. The HITL handoff pushes the named branch + opens a draft PR via the `GhClient` seam (fake in tests). Every run writes `.harness-state/run-loop-<date>-attention.md` (header + per-need-you-item reason/branch/PR/next-step) and the summary points at it. Termination caps (iteration 20 / stall 3) stop the drive with the honest `RunStopReason`. There is **no** `loop_merge_policy` knob. The live re-drain (operator-gated, Task 8) drains #2→merge-to-HEAD→#3 with a real merge SHA + deleted branch, opens a draft PR for any escalated item, and writes the attention report — no commit-in-place, no HEAD push, no red merge.

## Frozen-interface risk

**No frozen-interface change is required** (verified against the live code): the temp-branch + push lifecycle is additive concrete methods on `ShellGitCommitter` (the `dirty()`/`diff()` precedent, surfaced via the existing structural `ShellGitCommitterLike`); the PR-open is an additive method on the `GhClient` Wave-19 seam (NOT a frozen Phase-1 interface); the merge-to-head + conflict + handoff logic lives entirely in `ProductionProtocol.runInner` (an injected `PerItemProtocol` impl, not the engine); the attention report is a new module + a driver call; the termination-cap enforcement is a composing `WorkSource` wrapper that returns `null` (the frozen `runLoop` still only ever sees a `drained` source — `engine.ts:54`). **If any task is found mid-build to require touching `WorkSource`/`Runner`/`PerItemProtocol`/`WorkItem`/`ItemResult`/`RunSummary`/`EngineDeps` in `types.ts` or `runLoop` in `engine.ts`, STOP and escalate** — the constraint is load-bearing (it is why Waves 18–22 stayed composable).

## Open questions

| # | Question | Impact | Decision needed by |
|---|----------|--------|-------------------|
| 1 | **Concurrency activation trigger.** This wave keeps `MergeContract`/`run-lock.ts` retired-until-concurrency. What concretely flips the loop into concurrent-merge mode (a `--concurrency N` flag? a profile key?), and does that re-introduce the named-`branch` strategy for true fan-out (`sandcastle_mattpocock_architecture.md` §5)? | Whether the retired modules ever wire, and under what entry-point change. | Before any concurrent-merge run. |
| 2 | **Draft-PR body content.** D3 opens a draft PR — what goes in the body? Just the item title + reason + the loop trace tail, or a richer template (failing checks, the review finding text)? Start minimal (title + reason + branch) and enrich after the first live handoff. | Operator's review ergonomics on the PR page. | After the first live HITL handoff (Task 8). |
| 3 | **Temp-branch / stale-PR garbage collection.** Preserved/pushed `run-loop/issue-<n>` branches + their draft PRs accumulate if the operator resolves out-of-band. Auto-prune on a later successful re-drive of the same item, or leave for the operator / a `/run-loop --gc` sweep? | Repo branch + PR clutter on a long-running loop. | After the first multi-run live session shows the accumulation rate. |
| 4 | **Conflict realism in the serial case.** D7's conflict path is only reachable under concurrency (OQ-1) or an external push/operator commit mid-run. Keep it as the mid-run-external-mutation guard (resolved: yes) — but is it worth an integration test that simulates an out-of-band HEAD advance, or is the unit-fake conflict enough? | Whether Task 6's conflict case is load-bearing now. | Resolved: keep the guard; Task 6 simulates the out-of-band advance. |
| 5 | **Attention-report accumulation / naming.** One file per `<date>` — multiple runs the same day overwrite or append? Overwrite gives "latest state" (simplest, matches the to-do-list intent); append risks a stale pile. Default: overwrite per run (the file is the current state, not a log). | Whether the operator sees the latest or a growing history. | Resolved: overwrite per run; the wave receipt / `docs/waves/` is the history. |

## Proposed `### Wave 23` plan.md block

_(Auto-appended by `/spec-planner` to `docs/plan.md` `## Next`.)_

```markdown
### Wave 23 — /run-loop adopt merge-to-head + PR handoff + attention report

- depends-on: Wave 22 merged (✓ cb8d098); live backend + gh creds re-provided per run for T8; quickbase-replacement #2/#3 seeded
- spec: docs/specs/2026-06-16-run-loop-merge-to-head.md
- done-when: happy path = gate green → auto-merge to HEAD (per-item predictable-named temp branch off HEAD → gate → on GREEN host-side `git merge` + delete branch; no PR, no human); the HITL minority (conflict / red gate / escalated review) gets its named branch pushed + a draft PR opened via the GhClient seam, with a graceful no-remote fallback to copy-paste commands; every run writes a persistent `.harness-state/run-loop-<date>-attention.md` to-do list (N auto-merged ✓ · M need you ↓, each need-you item = reason + branch + PR link + next step) and the summary points at it; escalate-on-conflict aborts + preserves + hands off + continues (no crash); NO loop_merge_policy knob; termination caps (iter 20 / stall 3) stop the drive with an honest stop reason; built-but-unwired modules dispositioned in SKILL.md; throwaway-repo integration test proves real merge/abort/preserve + the no-remote report fallback; 223 baseline + new tests green; tsc 0; no `any`; zero frozen Phase-1 interface change; a live #2→merge→#3 re-drain shows a real merge SHA + deleted branch (+ a draft PR for any escalation)
- next-concrete-action: Dispatch Task 1 (temp-branch lifecycle on ShellGitCommitter)
- Runner: worktree   # classifier: ready-for-human; T8 mutates live gh (draft PR + env-gated transition) + needs host creds; T1–T7 are sandcastle-able

**Tasks (8):** T1 (temp-branch + push lifecycle on the committer), T2 (protocol drives merge-to-head on green + preserve-named-branch otherwise), T3 (HITL handoff push + draft PR + no-remote fallback, folded with escalate-on-conflict), T4 (persistent attention report writer + summary pointer), T5 (termination caps in the drive), T6 (merge-to-head + no-remote-handoff proof in the throwaway-repo integration test), T7 (built-but-unwired module disposition + SKILL.md narrative), T8 (live merge-to-head + handoff re-drain of #2/#3). T1 unblocks T2/T3/T4/T6; T5/T7 independent; T8 after T1–T7.

**Exit gate:** the spec's `## Exit gate`.

**Estimate:** ~0.5–1 operator-day (6 code/doc tasks + 1 operator-gated live re-drain).
```

**HITL-as-non-leaf check:** T8 (Runner: worktree / ready-for-human) is a DAG **leaf** (nothing depends on it) — no HITL-as-non-leaf warning. Every other task is `Runner: sandcastle` / ready-for-agent. No warning.
