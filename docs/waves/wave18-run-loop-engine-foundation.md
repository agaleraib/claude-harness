---
wave_number: 18
slug: run-loop-engine-foundation
spec_path: docs/specs/2026-06-14-run-loop-engine.md
merge_sha: 953987f
closed_at: 2026-06-14
---

# Wave 18 — /run-loop engine foundation (Phase 1)

Phase 1 of the `/run-loop` unattended wave/issue loop engine: the reusable core that
Waves 19/20 import. **Scope was Task 1 (engine skeleton + control loop) + Task 2
(Runner interface) ONLY.** Providers, per-item protocol, scheduler, safety guardrails,
and the `/run-loop` entry point are explicitly deferred to Waves 19/20. The point of
this wave was to freeze the shared interfaces correctly.

Module: `skills/_shared/loop/`. TypeScript, strict, no `any`.

## §Shipped

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 — Engine skeleton + control loop | `c4640f5` | `runLoop` control loop + frozen seams (`WorkSource`, `Runner`, `PerItemProtocol`, `RunnerFactory`, `WorkItem`, `ItemResult`, `RunSummary`) in `types.ts`; pure-function-of-injected-state engine in `engine.ts`; dry-run harness + `node:test` unit tests; zero-dependency toolchain (`package.json` `type:module`, `tsconfig.json` strict). |
| Task 2 — Runner interface (sandcastle + worktree) | `d3f1409` | `SandcastleRunner` (default) + `WorktreeRunner` over the frozen `Runner` interface; `DefaultRunnerFactory` selection via `resolveRunnerKind` (sandcastle-default); `preflightRunners` Docker-absent abort wired as the engine's optional `preflight` hook; runner dry-run harness + unit tests; module `README.md`. |

Files (module `skills/_shared/loop/`):
`types.ts`, `engine.ts`, `runners.ts`, `package.json`, `tsconfig.json`, `README.md`,
`test/stubs.ts`, `test/dry-run.ts`, `test/dry-run-runners.ts`, `test/engine.test.ts`,
`test/runners.test.ts`.

## §Wave 18 Exit Gate Results

Gate (verbatim): *"Task 1 + Task 2 Verify blocks both green. Engine is a pure function
of (work-source, git/issue state); Runner interface resolves sandcastle-default /
worktree-on-declaration and aborts cleanly when Docker is absent."*

| Gate clause | Result | Evidence |
|-------------|--------|----------|
| Task 1 Verify — dry-run harness: stub source (3 items, no deps) + no-op runner; visits all 3 in order, records 3 results, terminates on "drained"; re-run with 1 pre-marked done visits only 2 | **PASS** | `node test/dry-run.ts` → "run 1: visited 3 / recorded 3 / drained"; "run 2 (resume): visited 2 (item-2 pre-done) / drained". |
| Task 2 Verify — `runner: worktree` → worktree runner; no field → sandcastle; Docker stubbed absent + sandcastle item → abort at startup with a clear message | **PASS** | `node test/dry-run-runners.ts` → worktree→WorktreeRunner; unspecified→SandcastleRunner; Docker-absent abort message naming the offending item, zero items dispatched. |
| Engine is a pure function of (work-source, git/issue state) | **PASS** | `engine.ts` imports only `types.ts`; no work-source / runner / `gh` / `plan.md` strings; sole runner decision delegated to shared `resolveRunnerKind`. Idempotency/resume proven by the resume case + engine-level `isDone` skip test. Confirmed by code-reviewer (Task 1 review). |
| Runner resolves sandcastle-default / worktree-on-declaration | **PASS** | `resolveRunnerKind(item) = item.runner ?? 'sandcastle'`; `DefaultRunnerFactory` switches on the resolved kind; unit tests `runners.test.ts`. |
| Aborts cleanly when Docker is absent | **PASS** | `preflightRunners` throws `RunnerPreflightError` before any dispatch; engine awaits `preflight()` before the loop; `dispatched === 0` asserted. Worktree-only runs proceed with Docker absent. |
| Full unit suite | **PASS — 17/17** | `node --test test/*.test.ts` → tests 17, pass 17, fail 0. |
| TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | **PASS — 0 errors** | `tsc --noEmit` (ephemeral `typescript` install; module has no vendored toolchain). |
| No `any` types | **PASS** | grep for `: any` / `<any>` / `as any` across module source → none (only one `any` token, in a prose comment). |

**Exit gate: GREEN.** Both Verify blocks pass; all gate clauses satisfied.

## §Human-only TODOs

None. (Consistent with the synthetic spec's "Human-only TODOs: None identified.") All
work was LM-doable end-to-end.

One non-blocking operator action remains and is **not** a TODO for this wave — the
merge/close decision: per dispatch instructions, commits land in the worktree
(`worktree-agent-a945ab09c2652ceb3`) and the human decides whether to `--no-ff` merge
and tick `plan.md`. This file's `merge_sha`/`closed_at` frontmatter are left empty for
the close-wave step to stamp.

## §Open Questions

1. **Toolchain placement.** The module ships a zero-dependency, build-stepless setup
   relying on Node ≥24 native TypeScript type-stripping (`node --test`, `node *.ts`).
   `tsc` is not vendored — type-checking requires an ephemeral/global `typescript`.
   Open: should the harness add a repo-root `package.json` + dev `typescript` so
   `npm run typecheck` works out of the box for Waves 19/20, or keep the module
   dependency-free and rely on the operator's global `tsc`? (Profile says `runtime:
   none`, so no toolchain existed before this wave.)
2. **`Preflight` is an opaque `() => Promise<void>`** (engine stays agnostic). It is a
   trusted caller obligation that the preflight saw the same item set the loop will
   run — there's no engine-level cross-check. Correct seam for Phase 1; revisit if a
   later wave wants the engine to enforce preflight/scheduler item-set consistency.
3. **`SandcastleAdapter` and `WorktreeAdapter` are structurally identical today**
   (same four method signatures), kept as two names for documentation/divergence
   intent. Expected to diverge when the real container vs. host side effects land in a
   later wave; if they don't, collapse to one.

## §KB upsert suggestions

- **`run-loop-engine-design` memory** (`~/.claude/projects/.../memory/run-loop-engine-design.md`):
  append a status line — "Wave 18 (Phase 1) IMPLEMENTED in worktree: `skills/_shared/loop/`
  — frozen seams (`WorkSource`/`Runner`/`PerItemProtocol`/`RunnerFactory`) + `runLoop`
  control loop + sandcastle-default/worktree Runner selection + Docker-absent preflight
  abort. Zero-dep, Node native TS strip. Exit gate green (17/17 tests, strict tsc clean).
  Commits c4640f5 (T1), d3f1409 (T2). NOT YET MERGED — awaits human close-wave."
- **New fact worth capturing:** this repo (previously `runtime: none`, markdown+bash
  only) now contains its first TypeScript module; the chosen toolchain convention is
  Node ≥24 native type-stripping + `node:test`, no build step, `tsconfig.json` pinning
  strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. Future TS in the
  harness should follow this pattern unless a root toolchain is introduced (see Open
  Question 1).

## §Deviations from spec

1. **Added `EngineDeps.preflight` (optional) + a `Preflight` type to the frozen
   contract.** The spec describes the Docker-availability check as happening "at loop
   start" but the Phase-1 engine pulls items lazily via `nextReady()` and has no full
   item list up front. To keep the engine a pure function of injected state (Task 1's
   hard invariant) while still running a runner-aware startup check (Task 2), the check
   is injected as an optional `preflight()` hook the engine awaits before the loop. The
   engine stays agnostic of *what* is checked; `preflightRunners` (in `runners.ts`)
   supplies the sandcastle/Docker logic. This is additive to the frozen interface, not a
   change to any spec-named seam. Flagged because Waves 19/20 import `EngineDeps`.
2. **Real `sandcastle.run()` / Docker / git / worktree side effects are adapter-stubbed**
   (`SandcastleAdapter`/`WorktreeAdapter` injected). This is explicitly sanctioned by the
   spec ("The actual sandcastle.run()/docker calls may be thin/adapter-stubbed at this
   layer — what must be real and tested is the SELECTION + Docker-absent-abort logic").
   Recorded as a deviation only for visibility into where the real work lands later.
3. **Routing was dry-run, not dispatched.** `.harness-profile` has no `model_routing`
   key, so per the orchestrator contract this ran in dry-run mode: both tasks executed
   on the session model (Opus 4.8) rather than being dispatched to spawned subagents.
   Surface A lines were written to `.harness-state/orchestrator.log` and Surface B
   lines to `.harness-state/orchestrator.jsonl` with `status: skipped` (would-be:
   Opus @ xhigh for both). No effect on the shipped artifact.

## Baseline (tsc / test signal before / after)

| Signal | Before this wave | After this wave |
|--------|------------------|-----------------|
| TypeScript in repo | none (`.harness-profile`: `runtime: none`, languages `[markdown, bash]`) | `skills/_shared/loop/` module, strict |
| `tsc --noEmit` (module, strict + 2 extra flags) | N/A (no TS) | **0 errors** |
| Unit tests | none runnable | **17 pass / 0 fail** (`node --test`) |
| Dry-run harnesses | none | 2, both PASS (`dry-run.ts`, `dry-run-runners.ts`) |
| `any` types in module | N/A | **0** |

`.harness-profile` quality_bar flags `typecheck_blocking: false`, `test_required: false`
(set when the repo had no runtime). This wave nonetheless ran type-check and tests as a
hard gate, since the synthetic spec's Operating Rules mandate strict TS / no `any` and
the Verify blocks require a runnable harness + unit test.
