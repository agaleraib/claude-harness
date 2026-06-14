# Spec: /run-loop live wiring — from stubbed seams to a runnable lane

**Date:** 2026-06-14
**Status:** draft (follow-up to `docs/specs/2026-06-14-run-loop-engine.md`)
**Board wave:** Wave 21 (single wave)

## Why this spec exists

Waves 18–20 built the `/run-loop` engine, protocol, scheduler, and safety logic — the
**brain** — with every real side effect behind an injected seam. Those seams currently have
**only test stubs**: nothing calls `runLoop()` with production dependencies, `runGuardrailPreflight`
is never invoked, `DenylistHookProbe` has no concrete implementation, the runner adapters'
`.run()` methods spawn no agent, and `RUN_LOOP_ENFORCE` (the env var the installed denylist hook
gates on) is set nowhere. So `/run-loop issues` can read/relabel issues (the `gh` adapter is real)
but **cannot drive real work end-to-end today.**

This wave builds the **hands**: concrete adapters for the existing seams + a live driver that
assembles them and runs the loop. It changes **no frozen Phase-1 interface** — it implements
them. The verdict for "done" is a real `/run-loop issues` run that drains at least one sandcastle
issue end-to-end and emits the AFK-merged / HITL-waiting / blocked-on-human summary.

## Scope (what exists vs what this wave adds)

| Seam (interface, shipped) | Today | Wave 21 |
|---|---|---|
| `GhClient` (`gh-adapter.ts`) | ✅ real | (reuse) |
| `WorkSource` providers (wave/issue) | ✅ real parse logic | (reuse) |
| `runLoop()` / scheduler / protocol logic | ✅ tested | (reuse) |
| `SandcastleAdapter` / `WorktreeAdapter` `.run()` | ⚠️ stub | **T1** concrete agent dispatch |
| `GateRunner`, review/auto-fix, `findings-filer` gh seam | ⚠️ stub | **T2** concrete mechanical-gate execution |
| `DenylistHookProbe`, `SnapshotStore`, `WriteGuard` | ⚠️ interface only | **T3** concrete + `RUN_LOOP_ENFORCE` export |
| egress mechanism, `ApprovalStore`, `CredentialProvider` | ⚠️ interface only | **T4** concrete secret-bearing host adapters |
| entry-point invoking `runGuardrailPreflight` + `runLoop` | ❌ comment only | **T5** the live driver |
| live run against a real repo | ❌ (T18 was stubbed) | **T6** real smoke + quickbase-replacement #2/#3 |

## Tasks

### Task 1: Concrete runner adapters — real agent dispatch (keystone — DECIDED)

**Dispatch mechanism (grill 2026-06-14, decided — resolves OQ1):** the loop is **node-driven**
(keep the tested `runLoop` TS engine), and the runner re-enters an agent by **shelling out to a
headless `claude -p` subprocess** — NOT the harness `Agent` tool. Rationale: `runLoop` is a pure
node function, and the `Agent` tool is a Claude-Code in-session primitive unreachable from a node
process (and maximally Claude-coupled, which the tool-neutral contract forbids). Precedent +
the CLAUDECODE-unset-to-nest gotcha already live in `skills/skill-creator/scripts/run_eval.py`.
This also vindicates the Wave 20 safety design: a headless child carries no session permission
prompts, so the global PreToolUse denylist hook + `RUN_LOOP_ENFORCE` (T3) ARE the backstop.

Implement `SandcastleAdapter` and `WorktreeAdapter` (`runners.ts` seams) with real side effects:
- `prepare(item)`: sandcastle = start the container; worktree = `git worktree add .claude/worktrees/agent-<id>/` off the current head.
- `run(item, prompt)`: dispatch the agent via a single shared **`dispatchAgent(prompt, {cwd, env})`**
  helper (the one swap-point — see the agnosticism punt in OQ1) that shells to `claude -p` with
  `CLAUDECODE` unset so it nests cleanly. For worktree items, `env` includes `RUN_LOOP_ENFORCE=1`
  (T3) and the item's task-scoped secrets (T4); for sandcastle items it runs inside the container.
- `collectCommits(item)`: enumerate the commits the agent produced (`git log base..head`).
- `teardown(item)`: sandcastle = stop/remove container; worktree = `git worktree remove`.

Sandcastle requires Docker/Podman present — reuse `preflightRunners` Docker-absent abort.
Worktree runs on the host (host env + injected secrets per T4).

**Verify:** Against a throwaway local repo, a sandcastle item's `run()` dispatches an agent that
makes a commit, `collectCommits` returns it, `teardown` removes the workspace. A worktree item
creates and removes a real `.claude/worktrees/agent-<id>/`. Docker-absent ⇒ sandcastle items abort
cleanly while the harness reports why. The dispatch goes through the single `dispatchAgent` helper
(asserted: one invocation site), and a worktree dispatch's env carries `RUN_LOOP_ENFORCE=1`.

### Task 2: Concrete mechanical-gate execution (GateRunner + review + findings)

Wire the per-item protocol's injected seams to real commands:
- `GateRunner`: run the item's exit gate in its workspace — tests + typecheck + the item's
  `Verify`/acceptance checks — returning `GateResult` (red blocks merge, no short-circuit).
- review + bounded auto-fix: invoke `/code-review` (inline `high`; `ultra` only on a per-item
  opt-in flag), auto-fix CRITICAL+HIGH one round, then escalate.
- `fileLeftoverFindings`: file MED/LOW as gh issues via the **real** `GhClient` (the seam exists;
  wire the live adapter), labeled `from:code-review` + the source item's label.

**Verify:** A fixture item with a deliberately failing test produces a red `GateResult` and is NOT
merged. A green item with one HIGH review finding is auto-fixed then merged; a MED finding becomes a
real `from:code-review` gh issue. Re-running files no duplicate (idempotent).

### Task 3: Concrete safety adapters + `RUN_LOOP_ENFORCE` export

- `DenylistHookProbe.isActive()`: detect the catastrophic-command PreToolUse hook is installed and
  firing — parse `~/.claude/settings.json` for the `loop-denylist` PreToolUse entry (the bridge
  installed as a Wave-20 human TODO). Return false ⇒ the preflight refuses worktree items.
- **Export `RUN_LOOP_ENFORCE=1` into the worktree-agent environment** (T1's `run()` for worktree
  items) so the installed hook actually enforces. Without this the hook fail-opens and the denylist
  backstop never fires — the specific gap that prompted this wave. (Sandcastle items don't need it;
  the container is their boundary.)
- `SnapshotStore.create()`: real `git tag`/`stash` of `master` before the first worktree merge.
- `WriteGuard`: OS-level write-root guard where supported (`sandbox-exec` macOS), else advisory +
  `advisory-write-root` warning (Open Question 4 from the engine spec).

**Verify:** With the hook present in `~/.claude/settings.json`, `isActive()` is true and a worktree
item runs with `RUN_LOOP_ENFORCE=1` in its env (asserted) so a catastrophic command is blocked.
With the hook absent, `isActive()` is false and worktree items are refused while sandcastle drains.
A pre-run snapshot ref is created before the first worktree merge.

### Task 4: Concrete secret-bearing host adapters (controls A–C)

- egress mechanism: real default-deny egress context (`sandbox-exec` egress profile macOS / netns +
  filter Linux); no OS mechanism ⇒ refuse `egress-unenforceable` (never open egress with live secrets).
- `ApprovalStore`: the per-item pre-execution approval token — a `loop:approved-for-execution` gh
  label/marker the operator sets; absent ⇒ `awaiting-pre-approval`, agent never invoked.
- `CredentialProvider`: inject only the item's declared `secrets:` (scoped/short-lived where the
  provider supports it), never the whole `.env.local`.

**Verify:** Integration test (host-seam stubbed where CI can't run real `sandbox-exec`, but the
adapter exercised on a supporting host): no allowlist ⇒ only loopback reachable; unapproved item
deferred `awaiting-pre-approval`; only declared secrets present in the agent env; no-egress-mechanism
host ⇒ `egress-unenforceable`.

### Task 5: The live driver — assemble deps and run

`run-loop-entry.ts` (or a new `run-loop-driver.ts` it delegates to) builds the production
`EngineDeps` (real provider + protocol + `DefaultRunnerFactory` with T1 adapters) and `GuardrailDeps`
(T3/T4 adapters), runs `runGuardrailPreflight(pendingItems, deps)` first, then `runLoop(deps)`, and
prints the `RunSummaryReport` alongside the frozen `RunSummary` (Wave 19 carry-forward #3). Provides a
real `CommandRunner` (`execFile('gh', argv)`) to the `gh` adapter. `/run-loop --help` still
short-circuits before any of this.

**Pre-run preview (grill 2026-06-14, decided).** Before dispatching the first item in an unattended
run, the driver prints the resolved plan — "N ready items, here's the order + each item's runner" —
and requires a confirm to proceed. This is a sanity gate against pointing the loop at the wrong queue
(not a spend control — account-level usage limits own spend). A `--yes` / non-interactive flag bypasses
it for cron/truly-unattended use. **No loop-level spend cap** (operator owns spend via the backend's
account limits); the Wave 19 iteration cap (default 20) remains the only loop-side blast-radius bound —
recommend a low explicit cap (e.g. 3–5) for the first live runs.

**Verify:** `/run-loop issues` on a repo with one ready sandcastle issue drives it read → implement →
gate → review → merge → `plan.md`/issue tick and prints a run summary with AFK-merged=1. `/run-loop
--help` still does nothing else. `runGuardrailPreflight` is provably invoked before the first item.
The pre-run preview lists the ready items and is bypassed by `--yes`.

### Task 6: Real smoke + the deferred T18 live test

Run `/run-loop issues` end-to-end against (a) a throwaway local repo for a clean-room smoke, then
(b) the deferred **quickbase-replacement #2/#3** live test (after the operator seeds its
`.harness-profile loop_denylist:` — Wave 20 human TODO #2). Capture the AFK-merged / HITL-waiting /
blocked-on-human run summary as the Option-C workability verdict.

**Verify:** A live run merges/PRs #2's work behind the mechanical gate, defers #3 until #2 is merged,
emits the run-summary metric, and no denylist violation / no red merge occurs.

## Exit gate

`skills/_shared/loop/` tests stay green (existing 134 + new); strict `tsc` 0 errors; no `any`. A real
`/run-loop issues` run drains ≥1 sandcastle issue end-to-end and emits the AFK/HITL/blocked summary
(T5/T6). The denylist hook is verified active with `RUN_LOOP_ENFORCE=1` for a worktree item (T3). No
frozen Phase-1 interface changes (additive impls only) — flag loudly if one is forced.

## Open questions

1. **Agent dispatch mechanism (T1) — RESOLVED (grill 2026-06-14).** Node-driven loop +
   headless `claude -p` subprocess, via a single `dispatchAgent` helper. The harness `Agent` tool
   was rejected (unreachable from a node process; maximally Claude-coupled). See T1.
2. **Backend agnosticism — PUNTED to a future wave (grill 2026-06-14, option iii).** AGENTS.md L3
   promises the loop is tool-neutral, but v1 ships a **Claude-only** reference dispatcher (`claude -p`
   hard-wired in `dispatchAgent`). Rationale: sandcastle is backend-neutral for free (the container is
   the boundary), but the worktree confinement layer (PreToolUse denylist hook + `RUN_LOOP_ENFORCE`)
   is built on Claude-Code primitives that don't port — designing a Codex safety story speculatively
   isn't worth it pre-adoption. A future wave adopting another backend (e.g. Codex) would need both a
   per-backend dispatch adapter (swap `dispatchAgent`) AND a per-backend confinement adapter. T5/T-docs
   must note this in AGENTS.md (tool-neutral in contract; Claude-only reference dispatcher in v1).
3. **Sandcastle dependency.** Real sandcastle needs Docker/Podman; if absent on the host, the lane
   degrades to worktree-only — confirm the operator's runtime before the live test.
4. **Egress/write-guard portability** (carried from engine-spec OQ 4 & 7) — `sandbox-exec` macOS vs
   netns Linux; the portable subset is still unpinned. Advisory fallback + honest run-summary
   warnings remain the v1 posture.
