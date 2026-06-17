---
name: run-loop
description: Drive plan.md waves OR gh issues end-to-end behind a mechanical gate as an unattended loop — the third harness execution lane alongside /run-wave→/close-wave. Use when the user types /run-loop, says "run the loop", "drain ready issues", "drive ready waves unattended", "run the AFK loop". Two modes — `/run-loop waves` (plan.md waves) and `/run-loop issues` (ready-for-agent gh issues). Risk-proportional auto-merge, AFK-frontier-first scheduling, host safety guardrails.
argument-hint: "waves|issues [--help]"
---

# Run Loop

`/run-loop` is the harness's **third execution lane**. Where `/run-wave` dispatches one wave and stops, and `/close-wave` merges it, `/run-loop` drives a *stream* of ready work — plan.md waves or `ready-for-agent` gh issues — end-to-end behind a mechanical gate, unattended, until the source drains or a termination cap fires.

The engine is the shared, frozen-interface module at `skills/_shared/loop/`: pull next ready item → resolve its runner → run the per-item mechanical gate (implement → exit gate → code-review → bounded auto-fix → file leftover findings → atomic merge) → record → repeat. It is a pure function of (work-source state, git/issue state), so **resume is just "run again."**

Name chosen over `/loop` — that is the Anthropic interval-scheduler built-in. `/run-loop` is consistent with `/run-wave`.

> **Status (as of Wave 21 — LIVE):** the live execution path is wired. A production
> composition root (`skills/_shared/loop/run-loop-prod-deps.ts`) assembles the real graph —
> Codex/Claude implement adapters (agent edits, runner commits), Opus-API/OpenRouter/Codex
> review backends, the verify-gate, and the `GhCliAdapter` for `issues` mode — behind the
> frozen `EngineDeps` seam, and the entry **executable** (`run-loop-entry.ts`) drives it via
> the backend-aware preflight → preview (`--yes` bypass) → `runLoop` → run-summary path. A live
> clean-room drain (real `codex exec` implement + real `anthropic-api:opus-4.8` review +
> verify-gate) was completed on 2026-06-15 (see `docs/waves/wave21-run-loop-live-wiring.md`).
>
> **Live invocation (the SKILL body shells to this):**
> ```bash
> # issues mode — drains ready-for-agent gh issues in the current repo:
> node skills/_shared/loop/run-loop-entry.ts issues --yes
> # clean-room local drive against a throwaway repo (no gh, one JSON item):
> node skills/_shared/loop/run-loop-entry.ts issues --yes --repo <dir> --item-file <item.json>
> ```
> API keys come from the environment (`ANTHROPIC_API_KEY` review-only, `OPENROUTER_API_KEY`)
> and are never logged. External review (Opus/OpenRouter) requires opt-in via the per-repo
> egress policy or the explicit env gate `RUN_LOOP_ALLOW_EXTERNAL_REVIEW=1`; otherwise the
> review downgrades to the local Codex reviewer (the diff stays local). Still operator-gated:
> the Claude-backend worktree lane needs the denylist hook + `RUN_LOOP_ENFORCE=1` installed in
> global settings (the Codex default lane relies on its native sandbox and needs no hook); the
> sandcastle container lane and the cross-repo live test remain operator steps.

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

Hand the selected provider + per-item protocol + runner factory to the shared engine (`runLoop`). Dependent items are sequenced **serially** by `ReadinessGatedSource`: a blocked item is withheld until its blockers are recorded done this run, so item B branches off item A's already-merged HEAD (sandcastle's serial-off-HEAD model — see `sandcastle_mattpocock_architecture.md`). Termination caps (iteration 20 / stall-after-3) are enforced by a composing `WorkSource` wrapper.

**Merge model — `merge-to-head`, fast-forward-only (Wave 23 + Wave 24).** Each item works on an isolated, predictably-named temp branch off HEAD (`run-loop/issue-<n>` / `run-loop/<item-id>`); the agent edits there, the runner commits on the branch, and the mechanical gate runs. **The per-item gate IS the merge gate**: the temp branch is cut off HEAD and, in the strictly-serial drive, the gated tree == the merged tree — so on a GREEN gate with no surviving escalation the loop **auto-merges the branch into HEAD via `git merge --ff-only`** and deletes the branch (**no PR, no `git push`, no human, no re-gate**). The merge is fast-forward-**only**: if HEAD diverged since the branch was cut (an external commit), `--ff-only` exits without starting a merge, and the item is **escalated** (`non-fast-forward: HEAD moved since the gated tree was cut; refusing to merge an un-gated tree`) rather than synthesizing an un-gated 3-way merge. A non-green item's commits stay on its branch and **never touch HEAD**. Every gate execution's working-tree byproducts are **discarded between items** (`git reset --hard HEAD` + `git clean -fd`, NO `-x` — so ignored `.env`/`node_modules` are never deleted and ignored build caches never leak into a commit).

**HITL handoff (the rare exception).** When an item needs a human — a red gate, a reproduced review finding, or a non-fast-forward divergence (HEAD untouched; the loop does **not** `git merge --abort`, because `--ff-only` never started a merge) — the loop preserves the named branch, **pushes it, and opens a draft PR** via the `GhClient` seam, then **continues** (skip-and-continue; it never crashes). If there is no remote / no `gh` creds it falls back to writing the exact copy-paste `git push`/`gh pr create` commands. Either way, every run writes a persistent **attention report** at `.harness-state/run-loop-<date>-attention.md` (`N auto-merged ✓ · M need you ↓`, each need-you item = reason + branch + PR link / commands + next step) and the run summary points at it — so nothing is lost.

### The repo-resolved gate (Wave 24) — the `.harness-profile` `gate:` block

`/run-loop` replaces the human merge gate with a MECHANICAL one (green tests + Verify + zero surviving CRITICAL/HIGH review findings). That mechanical gate is the entire reason it is safe to walk away — **a gate that fails OPEN is worse than no gate.** So the gate is **repo-resolved** and **fail-safe**: the TARGET repo declares the checks `/run-loop` must run, and a repo with no resolvable gate is **refused** rather than merged blind.

**Where the checks come from.** The target repo declares them in its `.harness-profile` under a `gate:` block. The SKILL reads that block and exports the checks as `RUN_LOOP_GATE_*` env vars before invoking the engine (the engine itself is **zero-dep** — it does NOT parse YAML; it only reads env). Same wiring channel as `RUN_LOOP_IMPLEMENT_BACKEND` etc.

```yaml
# .harness-profile (in the TARGET repo)
gate:
  tests:     ["npm", "test"]          # a YAML LIST  → argv form (run with NO shell)
  typecheck: ["npx", "tsc", "--noEmit"]
  verify:    "npm run build && npm run smoke"   # a SCALAR string → shell form (run via sh -c)
```

**Two encoding forms (Decision 7 — NO shell sniffing).** Each check is encoded in exactly ONE of two explicit forms; `/run-loop` never guesses based on whether a value "looks like" it has shell metacharacters:

| Form | `.harness-profile` value | Exported env | How it runs |
|---|---|---|---|
| **argv** | a YAML **list** of strings | `RUN_LOOP_GATE_TESTS=["npm","test"]` (a JSON array) | spawned directly, **NO shell** (`argv[0]` + args; no re-tokenization) |
| **shell** | a YAML **scalar** string | `RUN_LOOP_GATE_TESTS_SHELL="npm test && tsc -p ."` | spawned `sh -c "<value>"` (use this when you need `&&`, pipes, globs, env expansion) |

The same three keys take the same suffixes: `RUN_LOOP_GATE_TESTS` / `_TYPECHECK` / `_VERIFY` (argv) and their `*_SHELL` siblings (shell).

- **Quoting.** Argv form is a JSON array — each token is one element (`["bash","-lc","echo hi"]` runs `bash -lc "echo hi"` with no re-splitting). Shell form is a single scalar handed verbatim to `sh -c`.
- **Mixing both forms for one check is a config error.** Declaring, e.g., both `RUN_LOOP_GATE_TESTS` and `RUN_LOOP_GATE_TESTS_SHELL` is refused (named) — `/run-loop` never silently picks one.
- **A present-but-empty value** (`""` or `[]`) **omits that check** — a legitimate **partial gate** (e.g. tests-only). An absent sub-check passes, but ONLY when a gate is otherwise configured.

**The fail-safe contract (Decision 3 — the three-way rule).**

1. **No gate configured at all** (no `gate:` block, no item descriptor) ⇒ the run is **refused at preflight** (before any agent dispatch) AND each item is **RED** per-item — `/run-loop` never merges a repo whose checks it cannot run. The refusal carries the fix: *"Add a `gate:` block (tests/typecheck/verify) to the target repo's `.harness-profile`."*
2. **Gate configured but a sub-check empty** ⇒ that sub-check **passes** (the partial-gate case above).
3. **Gate configured but misconfigured** (mix-is-an-error, invalid JSON) ⇒ **RED → escalate** (fails closed).

Because the merge is fast-forward-only, the per-item gate IS the merge gate — and because the gate is fail-safe, a never-configured gate can never reach the merge.

### Adopt `/run-loop` on a new repo — the on-ramp checklist

1. **Add a `gate:` block** to that repo's `.harness-profile` (`tests:` / `typecheck:` / `verify:`, in either encoding form above). Without it, `/run-loop` refuses the run.
2. **Authenticate `gh` against that repo** (`gh auth status` from the repo) — `issues` mode reads/labels issues and opens the HITL draft PRs through it.
3. **Label issues `ready-for-agent`** and declare `blocked-by` edges between dependent issues (the serial `ReadinessGatedSource` withholds a blocked item until its blockers are done this run).
4. **Confirm the agent + review credentials are available** — `codex` on PATH (the default implement + local-fallback review backend), and the review key (`ANTHROPIC_API_KEY` for the Opus reviewer, gated behind `RUN_LOOP_ALLOW_EXTERNAL_REVIEW=1`; otherwise review stays local on Codex).

### Module status (built-but-unwired disposition, Wave 23)

| Module | Status |
|---|---|
| `scheduler/dag.ts` | **RETIRED-deferred** — serial `ReadinessGatedSource` is the live sequencing; the AFK-frontier DAG is deferred-until-parallel-execution. |
| `merge/merge-contract.ts` + `merge/run-lock.ts` | **RETIRED-until-concurrency** — serial merge-to-head needs no run-lock/CAS; these activate only for concurrent merges. |
| `post-merge.ts` | **KEEP** — the plan.md-tick / §4.2-receipt path; wire behind the `RUN_LOOP_TRANSITION_ISSUES` gate for waves-mode post-merge effects. |
| `classifier-reconcile.ts` | **KEEP** — the pickup-time AFK/HITL relabel path; runs when issue transitions are enabled. |

## Step 5: Run summary

The loop ends with a summary — the HARD requirement. Because the frozen `RunSummary.stopReason` was not widened (Wave 19 carry-forward #3), the entry point surfaces the richer `RunSummaryReport` (`skills/_shared/loop/termination.ts`) **alongside** the frozen `RunSummary`. The summary reports the AFK-merged / HITL-waiting / blocked-on-human metric, plus any residual-risk warnings (`weak-posture`, `advisory-write-root`, `git-remote-allowlisted`).

## Rules

1. **`--help` short-circuits before any side effect.** No plan.md read, no `gh`, no worktree, no guardrail context.
2. **The denylist hook is a hard gate for worktree items.** Absent ⇒ refuse worktree items; sandcastle items still drain.
3. **Secret-bearing worktree items are never run unattended without controls (A)-(C).** No egress mechanism / no pre-approval ⇒ deferred, not executed.
4. **Auto-merge by default; PR only for the HITL exception.** Every gate-green item auto-merges to HEAD (merge-to-head) with no PR and no human — that is the loop's reason to exist. A PR is opened ONLY for an item that genuinely needs a human (merge conflict, red gate, or a reproduced review finding), as the handoff; it is never the per-item default.
5. **Resume is re-run.** The loop is idempotent: done items are skipped, mid-transition issues are reconciled, merged-but-unticked rows are repaired.
6. **The board is the single source of truth.** No parallel state machine — post-merge effects are reconciliation-driven, keyed by merge SHA.

## Human-only TODOs (NOT performed by this skill / a worktree dispatch)

- Installing the denylist PreToolUse hook into the operator's global `~/.claude/settings.json`.
- Seeding an external repo's `.harness-profile` with `loop_denylist:` / `loop_allowlist:` / `worktree_egress_allowlist:` entries.
- Running the live loop against an external repo with live `gh` credentials.
