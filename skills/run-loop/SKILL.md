---
name: run-loop
description: Drive plan.md waves OR gh issues end-to-end behind a mechanical gate as an unattended loop — the third harness execution lane alongside /run-wave→/close-wave. Use when the user types /run-loop, says "run the loop", "drain ready issues", "drive ready waves unattended", "run the AFK loop". Two modes — `/run-loop waves` (plan.md waves) and `/run-loop issues` (ready-for-agent gh issues). Risk-proportional auto-merge, AFK-frontier-first scheduling, host safety guardrails.
argument-hint: "waves|issues [--help]"
---

# Run Loop

`/run-loop` is the harness's **third execution lane**. Where `/run-wave` dispatches one wave and stops, and `/close-wave` merges it, `/run-loop` drives a *stream* of ready work — plan.md waves or `ready-for-agent` gh issues — end-to-end behind a mechanical gate, unattended, until the source drains or a termination cap fires.

The engine is the shared, frozen-interface module at `skills/_shared/loop/`: pull next ready item → resolve its runner → run the per-item mechanical gate (implement → exit gate → code-review → bounded auto-fix → file leftover findings → atomic merge) → record → repeat. It is a pure function of (work-source state, git/issue state), so **resume is just "run again."**

Name chosen over `/loop` — that is the Anthropic interval-scheduler built-in. `/run-loop` is consistent with `/run-wave`.

> **Status (as of Wave 20):** the engine, protocol, scheduler, providers, and safety *logic*
> are built and tested, and the `gh` adapter is real — but the **live execution path is not yet
> wired**. The runner adapters' `.run()` spawn no agent, `runGuardrailPreflight`/`runLoop` are
> not invoked from a driver, `DenylistHookProbe` has no concrete impl, and `RUN_LOOP_ENFORCE`
> (the env var the installed denylist hook gates on) is set nowhere. So this skill can read and
> relabel issues but **cannot drive real work end-to-end until Wave 21** (`docs/specs/2026-06-14-run-loop-live-wiring.md`)
> lands the concrete adapters + driver. The steps below describe the intended live flow.

**First — handle `--help` / `-h` / `help`** before any other parsing or side effects. If `$ARGUMENTS` is exactly one of those tokens (whitespace-trimmed, case-insensitive), print the usage block below and **exit immediately**. Do NOT read plan.md, do NOT call `gh`, do NOT create a worktree, do NOT establish any guardrail context, do NOT touch the working tree.

```
/run-loop — drive plan.md waves OR gh issues end-to-end behind the mechanical gate.

Usage:
  /run-loop waves        # drive ready docs/plan.md waves
  /run-loop issues       # drive ready-for-agent gh issues
  /run-loop --help       # print this and exit

Behavior:
  - Selects the work-source provider (wave / issue) and invokes the shared
    /run-loop engine: pull next ready item -> resolve runner -> per-item
    mechanical gate -> record -> repeat to termination.
  - Risk-proportional auto-merge: AFK-frontier-first; worktree/HITL items
    open a PR and await a human; secret-bearing worktree items are gated by
    egress + pre-approval + scoped creds (refused unattended without them).
  - Safety: the catastrophic-command denylist hook must be active before any
    worktree item runs; absent, those items are refused (sandcastle still runs).
  - Ends with a run summary: AFK-merged / HITL-waiting / blocked-on-human.
```

```bash
case "$(printf '%s' "$ARGUMENTS" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')" in
  --help|-h|help)
    # Print usage block and exit.
    exit 0
    ;;
  # No default arm: empty or non-help $ARGUMENTS must fall through to the skill body.
esac
```

After printing, return without further action.

## Step 1: Parse the work source

The first non-flag token of `$ARGUMENTS` selects the lane:

- `waves` → the **wave provider** (`skills/_shared/loop/providers/wave-provider.ts`): reads `docs/plan.md`, builds work items from ready `### Wave N` blocks, each block's `Runner:` line resolving the runner (default `sandcastle`).
- `issues` → the **issue provider** (`skills/_shared/loop/providers/issue-provider.ts`): reads `gh issue list --label ready-for-agent`, parses each issue's `## Blocked by` edges and `runner:<kind>` label.

An unknown or missing source is an error naming the valid set (`waves | issues`). The argument parsing + provider selection is implemented in `skills/_shared/loop/run-loop-entry.ts` (`parseRunLoopArgs`) — unit-tested, side-effect-free.

```
/run-loop foo
✗ /run-loop: unknown work source "foo". Valid sources: waves | issues
```

## Step 2: Establish the gh adapter (issues mode)

For `issues` mode, construct the real `gh` adapter (`skills/_shared/loop/gh-adapter.ts` `GhCliAdapter`), which implements the `GhClient` seam — including `getIssue` + `listByLabelAllStates` (declared in Wave 19, implemented here). It wraps the `gh` CLI through an injected `CommandRunner` seam (real impl: `execFile('gh', argv)`), so the argv construction + JSON parsing are testable without live GitHub.

## Step 3: Loop-start guardrail preflight (HARD gate before any worktree item)

Before the first item runs, run the guardrail preflight (`skills/_shared/loop/safety/guardrails.ts`):

1. If any pending item resolves to the `worktree` runner, verify the **catastrophic-command denylist PreToolUse hook** (`skills/_shared/loop/safety/denylist.ts`) is active. If absent, **refuse those worktree items** (sandcastle items still drain — the container is their boundary).
2. Take a pre-run `master` snapshot so a bad merge/host write is reset-recoverable.
3. Resolve the write-root posture (OS-enforced vs advisory) and record `weak-posture` / `advisory-write-root` warnings into the run summary.
4. For **secret-bearing** worktree items (worktree runner + declared `secrets:`), enforce controls (A) default-deny egress, (B) per-item pre-execution approval, (C) task-scoped credential injection. Items lacking approval defer to `blocked-on-human` (`awaiting-pre-approval`); items on a host with no egress mechanism are refused (`egress-unenforceable`); they are never run unattended.

## Step 4: Drive the engine

Hand the selected provider + per-item protocol + runner factory to the shared engine (`runLoop`). The scheduler (`skills/_shared/loop/scheduler/dag.ts`) classifies items AFK-frontier-first: drain every item whose entire ancestry is AFK-or-merged; a ready `worktree`/HITL item opens a PR and is marked awaiting-human while the run continues with other AFK items; items under an un-merged HITL ancestor defer to `blocked-on-human`.

Auto-merges go through the atomic-merge contract (`skills/_shared/loop/merge/merge-contract.ts`): run lock → per-item claim → base-SHA record → rebase-onto-head → **final gate rerun on the exact merge commit** → ff-only/CAS merge → outbox-keyed downstream effects. Post-merge, `skills/_shared/loop/post-merge.ts` ticks `plan.md` (`[ ]`→`[x]` + Recently Shipped) and writes §4.2 receipts, idempotently keyed by the merge SHA.

## Step 5: Run summary

The loop ends with a summary — the HARD requirement. Because the frozen `RunSummary.stopReason` was not widened (Wave 19 carry-forward #3), the entry point surfaces the richer `RunSummaryReport` (`skills/_shared/loop/termination.ts`) **alongside** the frozen `RunSummary`. The summary reports the AFK-merged / HITL-waiting / blocked-on-human metric, plus any residual-risk warnings (`weak-posture`, `advisory-write-root`, `git-remote-allowlisted`).

## Rules

1. **`--help` short-circuits before any side effect.** No plan.md read, no `gh`, no worktree, no guardrail context.
2. **The denylist hook is a hard gate for worktree items.** Absent ⇒ refuse worktree items; sandcastle items still drain.
3. **Secret-bearing worktree items are never run unattended without controls (A)-(C).** No egress mechanism / no pre-approval ⇒ deferred, not executed.
4. **Risk-proportional merge.** Only sandcastle AFK items with all blockers merged auto-merge; worktree/HITL items open a PR and await a human.
5. **Resume is re-run.** The loop is idempotent: done items are skipped, mid-transition issues are reconciled, merged-but-unticked rows are repaired.
6. **The board is the single source of truth.** No parallel state machine — post-merge effects are reconciliation-driven, keyed by merge SHA.

## Human-only TODOs (NOT performed by this skill / a worktree dispatch)

- Installing the denylist PreToolUse hook into the operator's global `~/.claude/settings.json`.
- Seeding an external repo's `.harness-profile` with `loop_denylist:` / `loop_allowlist:` / `worktree_egress_allowlist:` entries.
- Running the live loop against an external repo with live `gh` credentials.
