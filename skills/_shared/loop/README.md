# `/run-loop` engine — shared core (`skills/_shared/loop/`)

Phase 1 foundation of the `/run-loop` unattended wave/issue loop engine
(spec: `docs/specs/2026-06-14-run-loop-engine.md`). **Waves 18 (this) only ships the
engine skeleton + Runner interface.** Providers, the per-item mechanical protocol,
the scheduler, and the safety guardrails land in Waves 19/20 and **import the
interfaces frozen here** — treat `types.ts` as a stable contract.

## What's here

| File | Role |
|------|------|
| `types.ts` | **Frozen seams.** `WorkSource`, `Runner`, `PerItemProtocol`, `RunnerFactory`, `WorkItem`, `ItemResult`, `RunSummary`, `EngineDeps`, `Preflight`, and the `resolveRunnerKind` (sandcastle-default) helper. |
| `engine.ts` | The control loop (`runLoop`). Pure function of injected seams. |
| `runners.ts` | Task 2: `SandcastleRunner` (default) + `WorktreeRunner`, the `DefaultRunnerFactory` (selection), and `preflightRunners` (Docker-absent abort). |
| `test/` | Stubs, two runnable dry-run harnesses, and `node:test` unit tests. |

## Design invariant (Task 1)

The engine is a **pure function of `(work-source state, git/issue state)`**: no
work-source-specific or runner-specific logic lives in `engine.ts`. Everything —
the work source, the runner factory, the per-item protocol, and the startup
preflight — is **injected** via `EngineDeps`. Because the engine only ever asks the
source for the *next ready, not-yet-done* item and records results back, **"resume"
is just "run again"**: a re-run skips items the source reports done.

## Runner selection (Task 2)

`resolveRunnerKind(item)` returns `item.runner ?? 'sandcastle'` — **sandcastle is the
default**; `worktree` is used only when explicitly declared. The
`DefaultRunnerFactory` maps the resolved kind to a concrete `Runner`. The real
container / worktree side effects are delegated to injected **adapters**
(`SandcastleAdapter`, `WorktreeAdapter`) — thin stubs at this layer so selection +
abort logic are unit-testable with no Docker, git, or filesystem. The real adapters
arrive in a later wave.

`preflightRunners(items, probe)` is wired as the engine's `preflight` hook. It checks
the container engine (Docker/Podman) **at loop start**; if any item resolves to
sandcastle while the engine is unavailable, it throws `RunnerPreflightError` naming
the offending items and the loop aborts before dispatching anything. Worktree-only
runs proceed even with Docker absent.

## Toolchain

Zero dependencies. **Node ≥24 strips TypeScript types natively** (`node --test`,
`node test/*.ts`) — no build step. `package.json` sets `"type": "module"`;
`tsconfig.json` pins `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
for `tsc --noEmit` in any checkout that has `typescript` installed.

## Verify

```sh
cd skills/_shared/loop
node test/dry-run.ts            # Task 1: visits 3 items, then 2 on resume
node test/dry-run-runners.ts    # Task 2: worktree/sandcastle selection + Docker-absent abort
node --test test/*.test.ts      # full unit suite
```
