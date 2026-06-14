---
wave_number: 19
slug: run-loop-engine-core
spec_path: docs/specs/2026-06-14-run-loop-engine.md
merge_sha: eede94b
closed_at: 2026-06-14
---

# Wave 19 — /run-loop engine: Phases 2–4 core (providers + protocol + scheduler)

Phases 2–4 of the `/run-loop` engine, built against the FROZEN Phase 1 (Wave 18)
interfaces at `skills/_shared/loop/` (`WorkSource`, `Runner`, `PerItemProtocol`,
`RunnerFactory`, `WorkItem`, `ItemResult`, `RunSummary`, `EngineDeps`, `runLoop`).
Scope = T3, T4, T5, T6, T7, T8, T8a, T9. Phases 5–7 (safety, integration, entry
skill) are Wave 20 and were NOT built. Dispatched in dry-run mode (`model_routing`
absent from `.harness-profile`) — all tasks executed on the session model (Opus
4.8) with would-be routing logged to `.harness-state/orchestrator.{log,jsonl}`.

## §Shipped

Commits land in worktree `worktree-agent-aafaa311d6d15ad3c` (branch
`worktree-agent-aafaa311d6d15ad3c`), NOT merged. Base = `02f894f`.

| Task | Description | Commit | Files (new) | Verify |
|------|-------------|--------|-------------|--------|
| T3 | Wave provider (plan.md WorkSource) | `60aef53` | `providers/wave-provider.ts` + test | ✅ Pass |
| T4 | Issue provider + durable two-phase terminal state machine | `7814590` | `gh-seam.ts`, `state-journal.ts`, `providers/issue-provider.ts`, `test/gh-stub.ts` + test | ✅ Pass |
| T5 | Per-item protocol — implement → exit gate (hard blocker) | `56fc047` | `protocol/gate.ts`, `protocol/per-item.ts` + test | ✅ Pass |
| T6 | Code-review + bounded auto-fix | `32b831a` | `protocol/review.ts` (+ per-item wiring) + test | ✅ Pass |
| T7 | Leftover findings → issues | `aa87fbe` | `protocol/findings-filer.ts` (+ per-item wiring) + test | ✅ Pass |
| T8 | DAG readiness + AFK-frontier-first scheduling | `a6c224b` | `scheduler/dag.ts` + test | ✅ Pass |
| T8a | Concurrency + atomic-merge contract (hard blocker) | `7aa638f` | `merge/run-lock.ts`, `merge/merge-contract.ts` + test | ✅ Pass |
| T9 | Failure handling + termination + run summary | `b45a4d7` | `termination.ts`, `failure-handler.ts` (+ issue-provider escalate hardening) + test | ✅ Pass |

All external effects (gh, /code-review, runner container/git execution, lock file,
journals) are behind injected seams and stubbed; every Verify passes with no live
GitHub, no Docker, no network. Files staged explicitly per commit (no `git add -A`).

## §Wave 19 Exit Gate Results

Gate text (verbatim): *"Each listed task's Verify block (T3–T9 + 8a) passes. … The
full module test suite (`node --test test/*.test.ts`) is green, strict `tsc` 0
errors (ephemeral install), no `any`."*

| Gate clause | Command | Result |
|-------------|---------|--------|
| Per-task Verify (T3–T9 + 8a) | `node --test test/<task>.test.ts` | ✅ All pass (see table above) |
| Full module test suite green | `node --test test/*.test.ts` | ✅ **79 tests, 79 pass, 0 fail** (0 skipped) |
| Strict tsc 0 errors (ephemeral install) | `tsc --noEmit -p tsconfig.json` (ephemeral `typescript` + `@types/node`) | ✅ **exit 0, 0 errors** |
| No `any` | grep of source/test for `any` in type position | ✅ **0 `any` types** (all "any" occurrences are prose in comments; `tsconfig` pins `strict` + `noImplicitAny`) |

Per-task Verify breakdown:
- **T3:** 2-wave fixture (one `Runner: worktree`, one unspecified, B `Blocked by` A) → 2 items, runners [worktree, sandcastle], single A→B edge. ✅
- **T4:** 3-issue edges+runners; completeItem call-order (transition-started + transitioning BEFORE ready-for-agent removal → PR link → close → terminal marker → clear transitioning); escalateItem end state; terminal no-op (0 mutations); both crash-resume scenarios (step2→step4; step1→step2) resolve to exactly one terminal state, no double effect. ✅
- **T5:** forced-red tests/typecheck/verify → `gate-failed`, never merged; green gate proceeds. ✅
- **T6:** one HIGH resolved by fix → clean after one re-review; persisting HIGH → escalated, re-review called EXACTLY once (no infinite loop). ✅
- **T7:** two findings → two gh issues with `from:code-review` + source label + back-reference; zero findings → zero issues. ✅
- **T8:** A(sandcastle)→B, C(worktree)→D — first run AFK-cascades A then B, opens C awaiting-human, defers D blocked-on-human (never attempted); second run after C merged externally drains D. ✅
- **T8a:** (a) live-lock refusal names holder + stale reclaim; (b) one claim wins under contention; (c) integrate→rerun-gate→ff-only, head-race→abort/re-queue, red final gate never merges; (d) kill mid-gate not double-merged; (e1/e2/e3) reconciliation idempotent (twice = no extra mutations). ✅
- **T9:** 3 forced failures → `stall` after exactly 3; clean run summary non-zero `merged-afk` + correct stop reason; iteration cap 2 → stop after 2; resume not re-picked / no second escalation; crash-during-escalation (i) and (ii) → exactly one escalation. ✅

## Baseline (before → after)

| Metric | Before (Wave 18, `02f894f`) | After (Wave 19) |
|--------|------------------------------|------------------|
| Module tests (`node --test test/*.test.ts`) | 17 pass / 0 fail | **79 pass / 0 fail** (+62) |
| Strict tsc (ephemeral) | 0 errors | **0 errors** |
| `any` types | 0 | **0** |
| Source files under `skills/_shared/loop/` | 4 (`types/engine/runners` + README) | 17 (+13 new modules) |

Note: the ephemeral typecheck requires BOTH `typescript` and `@types/node`
installed into one prefix (the module's `tsconfig` sets `"types": ["node"]`).
`npx -p typescript -p @types/node` puts them in separate sandboxes and fails with
`TS2688: Cannot find type definition file for 'node'`. Verified instead via
`npm install --prefix <tmp> typescript @types/node` then
`<tmp>/node_modules/.bin/tsc --noEmit -p tsconfig.json --typeRoots <tmp>/node_modules/@types`.

## §Human-only TODOs

None. The synthetic spec's "Human-only TODOs" section reads "None identified," and
nothing in T3–T9 required a human-only action — all seams were stub-testable.

## §Open Questions

1. **plan.md wave grammar vs engine grammar.** T3 parses BOTH the engine grammar
   (`Runner:` / `Blocked by: Wave N`) and this repo's actual plan.md grammar
   (`depends-on: Wave N`, no `Runner:` line). The current plan.md format (H3
   `### Wave N`, bullet `depends-on:`/`spec:`) has no `Runner:` line, so every real
   wave currently defaults to sandcastle. Confirm whether `/spec-planner` should
   start emitting a `Runner:` line on wave blocks (Wave 20 T15 touches the
   `/spec-planner` Runner field) so wave items can declare worktree.
2. **Per-item claim store for WAVE items (T8a step 2).** The `ClaimStore` seam is
   defined and tested; the concrete wave-claim file under `.harness-state/` (vs the
   issue's non-terminal marker) is a Wave 20 integration detail. The interface is
   frozen here; the disk-backed impl is not.
3. **Engine integration (Phase 6).** T5–T9 build the per-item protocol, scheduler,
   merge contract, and termination as composable units against the frozen seams,
   but the `runLoop` engine is NOT yet rewired to call the scheduler + merge
   contract + termination controller end-to-end — that is Wave 20 Phase 6 (T12/T13).
   This wave delivers the parts; the orchestrating wiring is deliberately deferred.

## §KB upsert suggestions

- **Node strip-only type-stripping forbids TS parameter properties.** Node ≥24
  native type-stripping (`node --test *.ts`, no build) throws
  `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX: TypeScript parameter property is not
  supported in strip-only mode` on `constructor(private readonly x: T)`. Use
  explicit field declarations + assignment in the constructor body. (Hit once in a
  test; fixed.) Worth a KB note for any zero-build TS module in this repo.
- **Ephemeral tsc needs `typescript` + `@types/node` in ONE prefix.** When a
  module's tsconfig sets `"types": ["node"]`, `npx -p typescript -p @types/node tsc`
  fails (separate sandboxes). Install both into one temp prefix and pass
  `--typeRoots <prefix>/node_modules/@types`. Worth folding into the Wave 18
  toolchain note so future waves don't rediscover it.
- **Crash-safe terminal effects need a deterministic cross-check for
  non-deterministic resources.** A journal "intent → stamp resultIds" pattern has a
  crash window between the side effect and the stamp. For deterministic effects
  (close, label, comment-with-key) detect-and-skip against observable state. For the
  ONE non-deterministic effect (createIssue), embed a deterministic marker in the
  created resource's body and scan for it on resume. This is the pattern that made
  T4 + T9 escalation idempotent under crash.

## §Deviations from spec

**Additive changes to the FROZEN Phase 1 interfaces: NONE.** No field was added to
`WorkSource`, `Runner`, `PerItemProtocol`, `RunnerFactory`, `WorkItem`,
`ItemResult`, `RunSummary`, `EngineDeps`, or `runLoop`, and none was modified. All
Wave 19 modules IMPORT the frozen `types.ts` unchanged and build against it.
`WorkItem`'s existing open `[key: string]: unknown` payload absorbed every
provider-specific field (`syntheticSpec`, `exitGate`, `issueNumber`, `body`,
`sourceLabel`, `review`, `waveNumber`) with no interface edit — exactly as the
frozen design intended. **Wave 20 imports the Phase 1 interfaces unchanged.**

Other deviations (none affect the frozen surface):

1. **New `GhClient` seam (`gh-seam.ts`) — Wave 19 surface, not Phase 1.** Defines
   the injected gh boundary used by T4/T7/T8a. During T4/T9 it grew two read
   methods beyond the initial sketch: `getIssue(n)` (single issue regardless of
   open/closed — needed so a label check after `closeIssue` still sees the live
   label set) and `listByLabelAllStates(label)` (`--state all`, needed so startup
   reconciliation finds a `transitioning` issue that its own effect already closed,
   and so escalation idempotency can scan ready-for-human issues). This is a NEW
   Wave 19 interface, not a frozen Phase 1 one — but Wave 20's real `gh` adapter
   must implement all of `GhClient` including these two reads. **Flagged for Wave 20.**

2. **`StopReason` is NOT extended on the frozen `RunSummary`.** The frozen
   `RunSummary.stopReason` is the Phase-1 `'drained'` literal only. Rather than widen
   the frozen type, T9 introduces a SEPARATE `RunStopReason`
   (`drained | iteration-cap | stall | token-budget | wall-clock`) and a separate
   `RunSummaryReport` in `termination.ts`. Wave 20's engine wiring (Phase 6) must
   decide whether to (a) widen the frozen `RunSummary.stopReason` + `RunSummary`
   shape to carry the richer summary, or (b) return `RunSummaryReport` alongside the
   frozen `RunSummary`. **This is a deliberate non-change to the frozen interface,
   flagged so Wave 20 makes the call rather than inheriting a silent widening.**

3. **`ItemResult.status` mapping.** The protocol's richer `Disposition`
   (`gate-failed`, `review-escalated`, `ready-to-merge`, `completed`) collapses to
   the frozen four-value `ItemResult.status` via `toItemResult`: `gate-failed →
   failed`, `review-escalated → escalated`, `ready-to-merge` (standalone, no merge
   wired) → `escalated` so it is never silently dropped, `completed → completed`.
   Wave 20's Phase 6 merge wiring replaces the standalone `ready-to-merge → escalated`
   fallback with a real merge → `completed`.

4. **T9 hardened T4's `escalateItem` effect (same commit `b45a4d7` touches
   `issue-provider.ts`).** Added a deterministic escalation-marker in the escalation
   issue body + a ready-for-human scan so a crash between `createIssue` and the
   journal stamp never double-creates. This is additive *behavior* on the T4 escalate
   path; NO interface changed. Covered by T9's crash tests (i)/(ii).

5. **T8a claims no cross-system atomicity** (per spec): the merge SHA is the single
   durable commit point; gh marker / plan.md tick / receipts are separate systems
   reconciled idempotently by merge SHA. The `DownstreamEffects` seam bundles them;
   the concrete plan.md-tick + receipt writers are Wave 20 (T13).
