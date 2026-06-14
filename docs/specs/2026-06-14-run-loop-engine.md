# `/run-loop` — unattended wave/issue loop engine

> **Board wave:** Wave 18 · Phase 1 · Tasks 1–2 · Features F-008
> **Board wave:** Wave 19 · Phases 2–4 · Tasks 3–9 (incl. 8a) · Features F-009–F-011
> **Board wave:** Wave 20 · Phases 5–7 · Tasks 10–18 (incl. 11a) · Features F-012–F-014
>
> _This spec spans three board waves by dependency layer (Phase 1 freezes the interfaces
> Waves 19/20 import); see `docs/plan.md`._

## Overview

The harness today drives work through a **two-step human-gated cycle**: `/run-wave`
dispatches the orchestrator into a worktree and *stops*; `/close-wave` runs the exit
gate, merges `--no-ff`, ticks `plan.md`, and writes a receipt. The separation is
deliberate — `/close-wave` exists because "exit-gate failure is a human judgment call."

This spec adds a **third lane that does not replace the first two**: an unattended loop
that drives many work items end-to-end without a human between each merge, replacing the
human judgment gate with a *mechanical* one (green tests + Verify + zero surviving
CRITICAL/HIGH review findings). It is "automated, batched `/close-wave`."

Two front-ends over one engine:

- **`/run-loop waves`** — loops over open `docs/plan.md` waves.
- **`/run-loop issues`** — loops over `ready-for-agent` GitHub issues.

Inspirations: **sandcastle** (mattpocock — sandboxed agent runs + branch-strategy
merge-back), **RALPH** (aihero.dev — same-prompt loop, one task per iteration, commit,
stop on completion/cap), and Matt Pocock's **engineering skills** (`/to-issues`,
`/to-prd`, `/triage` — GitHub-issue workflow with `ready-for-agent`/`ready-for-human`
triage roles). Those skills live in `~/.agents/skills/` and are **left untouched**.

### Non-goals

- **Not a replacement** for `/run-wave` or `/close-wave`. The supervised lane stays the
  default; `/run-loop` is opt-in for when the operator wants to walk away.
- **No stacked-PR dependency chains** in v1 (deferred; see Open Questions).
- **No secret injection into containers.** Waves needing live secrets run `worktree`, and
  secret-bearing worktree items are **not fully unattended** — they run under default-deny
  egress + per-item pre-approval + task-scoped creds (Task 11a). Fully-unattended
  secret-bearing host execution *without* egress containment is explicitly out of scope.
- **Not modifying** Matt Pocock's `/to-issues`/`/to-prd`/`/triage` skills.

### Design decisions (origin: `/grill-me` session, 2026-06-14)

The full decision log is captured below per phase. The load-bearing ones:

1. **One engine, pluggable work-source.** The work-source is the *only* axis that differs
   between waves and issues; the per-item protocol is identical.
2. **Swappable runner**, declared **per-wave at plan time** (not inferred). Default
   `sandcastle`; **secret-bearing waves are `worktree`-only**. Fail-safe (sandbox),
   never fail-open.
3. **Mechanical gate** replaces the human gate: never merge red; one auto-fix round then
   escalate; `code-review high` inline, `ultra` opt-in.
4. **4-gate capability test** decides HITL escalation, *runner-aware* — same task can be
   AFK on a `worktree` wave and HITL on a `sandcastle` wave. Replaces the over-conservative
   legacy "human TODO" heuristic (operator reports those are ~99% LM-doable).
5. **Risk-proportional auto-merge:** `sandcastle` waves auto-merge on a green PR;
   `worktree` (secret-bearing, host-running) waves open a PR and **wait for a human**.
6. **AFK-frontier-first scheduling** over the dependency DAG; HITL-blocked subtrees are
   deferred, not stacked. Every run is **instrumented** (AFK-merged / HITL-waiting /
   blocked-on-human counts) — that metric is the live verdict on whether the model works.

## Implementation

**Recommended flow:** Dispatch as a multi-task wave via `/run-wave 18` once this spec is
approved. Phases 1–4 (engine, providers, protocol, scheduler) are the critical path and
should land before any live test; Phases 5–7 (safety, integration, entry point + docs)
gate the *unattended* capability and must all land before the first AFK run.

**Reason:** larger surface (new engine + hook + skill edits across 4 existing skills),
real blast radius (auto-commit + auto-merge + host command execution), so it wants the
isolated-worktree + exit-gate discipline `/run-wave` provides.

**Alternatives considered:** (a) two independent skills sharing nothing — rejected, the
protocol is identical and the safety logic must live in exactly one place; (b)
RALPH-style bash loop — rejected, brittle and reimplements sandcastle's API; (c) full
auto-merge everywhere relying on revert — rejected in favor of risk-proportional (C).

**First live-test target:** `quickbase-replacement` issues #2 (`ready-for-agent`,
unblocked) then #3 (blocked by #2) via `/run-loop issues`.

## Requirements

### Phase 1: Shared loop engine + runner interface — F-008

The reusable core all front-ends sit on. Lives in `skills/_shared/loop/`.

#### Task 1: Engine skeleton + control loop

Single async control loop: pull next ready item from the work-source → resolve its runner
→ run the per-item protocol → record result → check termination → repeat. The loop is a
pure function of `(work-source state, git/issue state)` so it is **idempotent and
resumable** — "resume" is just "run again." No work-source-specific or runner-specific
logic lives here; both are injected.

**Verify:** A dry-run harness invokes the engine with a stub work-source (3 fake items, no
deps) and a stub runner that no-ops; the loop visits all 3 in order, records 3 results,
and terminates on "drained." Re-running with one item pre-marked done visits only 2.

#### Task 2: Runner interface (`sandcastle` + `worktree`)

Define a `Runner` interface: `prepare()` (create isolated workspace), `exec(prompt)` (run
the agent), `collectCommits()`, `teardown()`. Two implementations:
- `sandcastle` — `sandcastle.run()` into a Docker/Podman container, `merge-to-head`/named
  branch strategy. **Default.**
- `worktree` — `.claude/worktrees/agent-<id>/`, no container, native host env + secrets.

The engine selects the implementation from the item's declared runner (Phase 2), defaulting
to `sandcastle` when unspecified. Sandcastle availability (Docker running) is checked at
loop start; if absent, the loop refuses to start `sandcastle` items and says so.

**Verify:** Unit test: given an item with `runner: worktree`, the engine instantiates the
worktree runner; given no runner field, it instantiates sandcastle; with Docker stubbed
absent and a sandcastle item present, the loop aborts at startup with a clear message.

### Phase 2: Work-source providers — F-009

#### Task 3: Wave provider (`plan.md`)

Reads `docs/plan.md`, extracts open `### Wave N` blocks and their items, follows spec
links, and exposes each as a loop item carrying: id, the synthetic wave-spec (reuse
`/run-wave`'s Step 4–6 parsing), the **exit gate** verbatim, the declared **runner**
(`Runner:` line on the wave block, default sandcastle), and the **`Blocked by`** edges.

**Verify:** Given a fixture `plan.md` with 2 waves (one `Runner: worktree`, one
unspecified) where wave B is `Blocked by` wave A, the provider yields 2 items with correct
runners (worktree, sandcastle) and a single A→B dependency edge.

#### Task 4: Issue provider (`gh`)

Reads `gh issue list --label ready-for-agent`, parses each issue's `## Blocked by` section
into edges and its `runner:*` label into the runner (default sandcastle), and exposes the
issue body as the work item. The provider implements the **single terminal transition**
contract used by Task 9, modeled as a **durable two-phase state machine** so a crash at any
boundary never strands an issue outside both the AFK and the human queues.

It MUST expose exactly three mutually-exclusive terminal operations on a source issue —
`completeItem`, `escalateItem`, `relabelItem`. Each executes the **same ordered, crash-safe
sequence**:

1. **Begin (durable intent first).** Write a `transition-started` marker recording the
   intended terminal state (`run-loop:<run-id>:<item-id>:transition-started:<target-state>`,
   as a marker comment **and** a `transitioning` label on the source issue). This is written
   **BEFORE** the `ready-for-agent` label is touched, so the issue always carries either
   `ready-for-agent` (transition not yet begun) or `transitioning` (transition in flight) —
   never neither.
2. **Leave the ready queue.** Remove the `ready-for-agent` label.
3. **State-specific effect.** `completeItem` closes the issue and links the PR;
   `escalateItem` adds `ready-for-human`; `relabelItem` swaps the readiness label (Task 12
   reconciliation).
4. **Commit (terminal marker last).** Write the terminal idempotency key
   (`run-loop:<run-id>:<item-id>:<terminal-state>`) as a marker comment **and** remove the
   `transitioning` label. The presence of the terminal marker (and absence of
   `transitioning`) is the durable "this transition completed" signal Task 9 relies on.

Each operation first checks for an existing terminal marker and is a **no-op** if found, so
reruns after a crash never re-fire. The invariant the queues depend on: a source issue is
always in **exactly one** of {`ready-for-agent` present (untouched), `transitioning` present
(in-flight, reconcilable), terminal marker present (done)} — it can never be in none of them.

**Durable effect record (step 3 must be replayable, not just step 4).** The terminal marker
(step 4) is written *after* the state-specific effect, so a crash between steps 3 and 4 must
not re-fire the effect on resume. Before performing the step-3 effect, the operation appends
an effect-intent record to a durable per-item effect log
(`.harness-state/run-loop-transitions.jsonl`, keyed by `<item-id>:<target-state>`, run-id as
metadata only); immediately after the effect succeeds it stamps that record with the
created-resource ids (escalation-issue number, PR-link comment id, close confirmation). On
resume, reconciliation reads this record first: if it carries result ids, step 3 is
**skipped** (the escalation issue / PR-link comment already exists — never created a second
time) and reconciliation proceeds straight to step 4. Deterministic marker comments (carrying
the `<item-id>:<target-state>` key) are the cross-check so the record and ground truth cannot
diverge. This mirrors the Task 8a outbox (intent-before / result-after, keyed durably rather
than by an in-memory flag) and is what makes "re-run step 3" genuinely idempotent rather than
merely asserted to be.

**Startup reconciliation (resume).** At loop start the provider scans for any issue carrying
a `transitioning` label or `transition-started` marker **without** the matching terminal
marker — an incomplete transition (a crash between steps 1 and 4). It **resumes** each such
transition to completion idempotently from whatever step it reached: re-running steps 2–4 is
safe because each is independently checked (label-removal is a no-op if already removed; the
state effect is skipped when the durable effect record already carries its result ids, per the
"Durable effect record" rule above; terminal-marker write is the no-op-on-exists commit). Only
after reconciliation drains does the provider yield fresh `ready-for-agent` items.

The provider never re-yields an issue that carries a terminal marker, nor one mid-transition
(it goes to reconciliation, not the ready scan).

**Verify:** Against a fixture set of 3 issues (#A unblocked, #B blocked by #A, #C with
`runner:worktree`), the provider yields 3 items with correct edges and runners. Calling
`completeItem` writes the `transition-started` marker + `transitioning` label *before*
removing `ready-for-agent`, then posts a single PR link comment, closes the issue, writes
the terminal marker, and removes `transitioning` (verified against a `gh` stub recording the
call order). Calling `escalateItem` ends with `ready-for-human` present and `ready-for-agent`
absent. Re-invoking any terminal operation with an existing terminal marker is a no-op (zero
additional `gh` mutations). **Crash-after-label-removal-before-marker test:** kill the
provider between step 2 (`ready-for-agent` removed) and step 4 (terminal marker written) —
on rerun, startup reconciliation finds the `transitioning` issue, resumes the transition, and
the issue ends in exactly one terminal state (verified: terminal marker present,
`transitioning` removed, no duplicate state effect). **Crash-after-transition-started-before-label-removal
test:** kill between step 1 and step 2 — on rerun reconciliation resumes from step 2 and
completes; the issue is never left in the ready scan with a dangling `transition-started`
marker. An issue carrying a terminal marker is not re-yielded; an issue mid-transition is
routed to reconciliation, not the ready scan.

### Phase 3: Per-item mechanical protocol — F-010

The gate that replaces human judgment. Identical for every item regardless of source.

#### Task 5: Implement → exit gate (hard blocker)

Run the item in its runner; then run the exit gate (tests + typecheck + the item's
`Verify`/acceptance criteria). **Never proceed to merge on a red gate.** If the agent
cannot make the gate green within the iteration, the item fails (→ Task 9 handling).

**Verify:** An item whose tests are forced red never reaches the merge step; the result is
recorded `gate-failed`. An item with a green gate proceeds.

#### Task 6: Code-review + bounded auto-fix

Run `/code-review` on the diff (`high` inline; `ultra` only if the item declares
`review: ultra`). Auto-fix all CRITICAL + HIGH findings, then **re-review exactly once**.
If CRITICAL/HIGH **survive** the re-review, stop auto-fixing and escalate the item to human
(→ Task 9). MEDIUM/LOW findings are never auto-fixed.

**Verify:** Item with one HIGH finding that the fix resolves → passes after one re-review.
Item with a HIGH finding that persists after the fix → escalated, not merged, not
infinite-looped (re-review called exactly once).

#### Task 7: Leftover findings → issues

Every MEDIUM/LOW finding (and any surviving-but-non-blocking note) is filed as a GitHub
issue, labeled `from:code-review` + the source item's label, so nothing is silently
dropped.

**Verify:** Two MEDIUM findings produce two `gh` issues with the correct labels and a
back-reference to the item (verified against a `gh` stub); zero findings produce zero
issues.

### Phase 4: Scheduler + instrumentation — F-011

#### Task 8: DAG readiness + AFK-frontier-first scheduling

Build the dependency DAG from the provider's edges. **Readiness = all blockers MERGED**
(not merely attempted) — required because a fresh sandcastle container builds from `head`.
Schedule greedily: drain every item whose entire ancestry is AFK-or-merged first; when a
ready `worktree`/HITL item is reached, open its PR, mark `awaiting-human`, and **continue**
with other ready AFK items. Defer any item under a HITL ancestor to a `blocked-on-human`
set; do not attempt it this run. **No stacked branches.**

**Verify:** Fixture DAG A(sandcastle)→B(sandcastle), C(worktree)→D(sandcastle). One run
merges A then B (AFK cascade), opens C's PR as awaiting-human, and defers D as
blocked-on-human (never attempted). After C is externally merged, a second run drains D.

#### Task 8a: Concurrency + atomic-merge contract (HARD BLOCKER for any AFK merge)

The engine's "resume = run again" idempotency claim (Task 1) only holds if no other loop
or operator can mutate git/work-source state between an item's gate and its merge. This
task makes the auto-merge path atomic against stale heads and concurrent loop runs.

The contract, enforced for **every** AFK auto-merge (sandcastle path) before the merge
lands:

1. **Repo-level run lock.** At loop start, acquire an exclusive advisory lock
   (`.harness-state/run-loop.lock`, containing run-id + PID + start timestamp). If a live
   lock is held by another run, refuse to start (clear message naming the holder). A stale
   lock (holder PID dead) may be reclaimed with a logged warning. Release on termination
   (including crash paths, via trap).
2. **Per-item claim.** Before dispatch, atomically claim the item — for issues, write the
   non-terminal idempotency marker (Task 4) acting as a claim; for waves, record the claim
   in `.harness-state/`. Two loops (or a loop reclaiming a stale lock) MUST NOT both pick
   the same ready item.
3. **Record base SHA.** Capture the merge-target `head` SHA at the moment the item is
   dispatched.
4. **Rebase/merge current head before the final gate.** Immediately before the gate that
   authorizes merge, fetch and integrate the *current* target head onto the item's branch.
   If the target head advanced past the recorded base SHA, the integration happens on the
   new head — the gate runs against what will actually be merged, never against stale
   state.
5. **Final gate rerun on the exact commit to be merged.** Rerun the full mechanical gate
   (tests + Verify + zero surviving CRITICAL/HIGH) on the post-integration commit. A green
   earlier gate is **not** sufficient to merge if integration changed the tree.
6. **Single durable commit point = the merge SHA; everything downstream reconciles to it.**
   The git merge, the GitHub issue marker, the `plan.md` tick, and the `.harness-state`
   receipts are **separate persistence systems and cannot share one critical section** — so
   the contract does **not** claim cross-system atomicity. Instead:
   - Perform the merge with a base-SHA precondition (e.g. `--ff-only` onto the
     recorded-then-refetched head, or equivalent compare-and-swap on the remote ref); if the
     precondition fails (head moved again during the gate), abort this item's merge, re-queue
     it for the next readiness pass, and log `head-raced`. **The merge commit landing on the
     remote target is the one and only commit point** — before it, the item is uncompleted;
     after it, the item is completed regardless of what downstream bookkeeping has run yet.
   - **Outbox, keyed by the merge commit SHA.** *Before* attempting the merge, append an
     intent record to a durable outbox (`.harness-state/run-loop-outbox.jsonl`) carrying
     `{item-id, branch, recorded-base-SHA, intended-merge}`; *immediately after* a successful
     merge, stamp that record with the resulting `merge-commit-SHA`. The outbox record — not
     an in-memory flag — is what links a landed merge to its pending bookkeeping.
   - **Then** perform the downstream effects idempotently, each keyed by the merge SHA: write
     the terminal idempotency key (Task 4), tick `plan.md` and write receipts (Task 13). Each
     is individually idempotent (no-op if its keyed marker already exists).

7. **Startup reconciliation (detect-and-repair the post-merge boundaries).** Because steps in
   (6) span systems, a crash can land between any pair. At loop start, before scheduling, the
   engine reconciles the outbox against ground truth:
   - **merged-but-unmarked** (outbox has a `merge-commit-SHA` but the issue terminal marker /
     `plan.md` tick / receipt is missing): the merge already happened — finish the downstream
     effects idempotently (write marker, tick, receipt) and close the outbox record.
   - **intent-but-unmerged** (outbox intent exists with no `merge-commit-SHA`, and the target
     head does **not** contain a merge of the item's branch): the merge never landed — discard
     the intent and re-queue the item for a fresh readiness pass (re-runs steps 1–6).
   - **marked-but-unticked** (terminal marker present but `plan.md`/receipt incomplete): finish
     the board/receipt update idempotently.
   Reconciliation MUST be safe to run repeatedly; every repair is keyed by the merge SHA or
   the item idempotency key so it can never double-apply.

This contract is a hard blocker: an AFK item that cannot satisfy it is never merged; it is
re-queued or escalated, never merged against stale state. Completion is defined by the merge
SHA landing, and all cross-system bookkeeping is brought into agreement with it by
reconciliation rather than by a (impossible) shared critical section.

**Verify:** (a) With a held live lock, a second `/run-loop` invocation refuses to start and
names the holder. (b) Concurrency test: two engine instances pointed at the same ready item
result in exactly one claim winning; the loser sees the claim and skips. (c) Stale-head
test: an item passes its first gate, then the target head is advanced externally before
merge; the engine re-integrates, **reruns the gate** on the new commit, and only merges with
the base-SHA precondition satisfied — if the head races again during the rerun, the merge
aborts with `head-raced` and the item is re-queued (no merge lands). (d) Crash test: kill
the loop mid-gate; on rerun the claim/marker is detected and the item is not double-merged.
(e) **Post-merge crash-recovery (one case per boundary), all keyed by the merge SHA:**
(e1) *merged-but-unmarked* — land the merge, then kill before the issue terminal marker is
written; on rerun, outbox reconciliation finds the stamped `merge-commit-SHA`, writes the
marker/tick/receipt idempotently, and does **not** re-merge (the branch is already in head).
(e2) *intent-but-unmerged* — kill after the outbox intent is appended but before the merge
lands; on rerun the item is re-queued and re-run from step 1 (no phantom completion, no
duplicate intent). (e3) *marked-but-unticked* — land the merge and write the marker, then
kill before `plan.md` tick / receipt; on rerun reconciliation finishes the board/receipt
update idempotently. Running reconciliation twice on any of (e1)–(e3) produces no additional
mutations.

#### Task 9: Failure handling + termination + run summary

Skip-and-continue on item failure. A failed item undergoes the **single terminal
transition** for failure via the provider's `escalateItem` (Task 4) — i.e. the durable
two-phase machine: `transition-started` marker (+ `transitioning` label) written **first**,
then `ready-for-agent` removed, then exactly one `ready-for-human` escalation issue created
and linked, then the terminal failure marker (`run-loop:<run-id>:<item-id>:escalated`)
written and `transitioning` cleared. Because intent is durable before the label moves, a
crash at any boundary leaves the issue in `transitioning` (never in neither queue), and
Task 4's startup reconciliation resumes it to exactly one escalation. The original failed
issue is relabeled/closed-and-linked — it is never left in the ready queue, and never
stranded outside both queues. The escalation is idempotent: if the terminal failure marker
already exists, the loop detects the terminal state and does **not** create a second
escalation issue or re-dispatch the item. For wave items (no gh issue), the equivalent
two-phase markers (`transition-started` then `escalated`) are written to `.harness-state/`
and the wave row is left un-ticked with a logged escalation pointer.

This closes the resume/duplicate gap: on a rerun after a gate failure or crash, the
provider (Task 4) routes a `transitioning` item to reconciliation and will not re-yield an
item carrying a terminal failure marker, and the loop's pre-dispatch check (Task 8a claim)
detects it — so the same source item is never picked twice and no duplicate human-escalation
issue is produced.

**Stall detection:** stop the whole loop after 3 consecutive gate failures. **Termination**
on first of: work-source drained / iteration cap (default 20) / stall / token-budget
exhausted / optional wall-clock cap. Emit a **run summary**: items merged-AFK,
opened-and-awaiting-human, deferred-blocked-on-human, deepest blocked subtree depth, and
stop reason. This metric is a hard requirement — it is how we judge whether
risk-proportional scheduling is workable in practice.

**Verify:** A run with 3 consecutive forced failures stops with reason `stall` after
exactly 3 attempts. A clean run emits a summary with non-zero `merged-afk` and the correct
stop reason. Iteration cap of 2 stops after 2 successful items even if more are ready.
**Resume test:** force an item to gate-fail (it is escalated, `ready-for-agent` removed,
one escalation issue created, failure marker written), then rerun the loop — the failed
item is not re-picked, no second escalation issue is created, and the run summary reflects
zero re-attempts of that item. **Crash-during-escalation tests (both boundaries):** (i) kill
the loop after `ready-for-agent` is removed but **before** the terminal failure marker is
written; on rerun, startup reconciliation (Task 4) finds the `transitioning` item and
resolves it to exactly one escalation issue (not zero, not two) — the item is never left
outside both queues. (ii) kill the loop after the escalation issue exists but before
`transitioning` is cleared / the terminal marker is written; on rerun reconciliation
completes the commit step idempotently and no second escalation issue is created.

### Phase 5: Safety — host guardrails + caps — F-012

**Threat model + residual-risk statement (read first).** The `worktree` runner exists by
deliberate design for **secret-bearing waves that cannot run in a container** (live creds,
host tooling the sandbox lacks). It runs the agent in the native host environment, so unlike
the `sandcastle` runner the OS itself is **not** the security boundary. We do **not** claim
full OS isolation for `worktree` — that would be dishonest.

**The merge gate is not a secret-exfiltration boundary.** The human PR gate protects the
*merge*; it does nothing to stop a prompted, confused, or hijacked agent from reading live
credentials and sending them over the network **during** the unattended run. Because the
stated product goal is an *unattended* loop, an unattended worktree run with live secrets and
open network egress is a real trust boundary, not a caveat — it would mean the most sensitive
tasks run with the weakest containment. v1 therefore makes secret-bearing worktree items
**not fully unattended**, enforced by three controls (Task 11a):

- **(A) Default-deny outbound egress during worktree runs.** A worktree item touching secrets
  runs with outbound network egress **denied by default**; only an operator-declared
  allowlist of hosts (`worktree_egress_allowlist:` in `.harness-profile`) may be reached. No
  allowlist ⇒ no egress (loopback + the declared git remote only). This is the primary
  in-run exfiltration control.
- **(B) Per-item operator pre-approval BEFORE execution.** A secret-bearing worktree item is
  **not dispatched unattended**: the loop pauses and requires explicit operator approval
  *before* the agent runs (not merely before merge). Unapproved secret-bearing worktree items
  are deferred, never executed in the operator's absence.
- **(C) Task-scoped ephemeral credentials, not the full `.env.local`.** The runner injects
  only the credentials the item declares it needs (scoped/short-lived where the provider
  supports it), never the whole secret file.

On top of those, the prior defense-in-depth layers still apply and worktree items are **never
auto-merged** (always a human-gated PR, Task 8): (1) **write-root confinement** (Task 11);
(2) **allowlist-leaning execution posture** + **catastrophic-command denylist hook** as a
backstop (Task 10); (3) the **human PR gate**; (4) a **pre-run snapshot** for recoverability
(Task 11).

**Residual risk that remains and is accepted:** even with (A)–(C), a sufficiently creative
non-shell file operation, an unlisted destructive command, or exfiltration *to an
allowlisted host* can still occur inside the worktree write roots before the human PR gate
catches it; the denylist is a backstop, not a containment boundary. **Explicitly out of
scope for v1:** fully-unattended, secret-bearing host execution **without** egress
containment — that combination is not offered. Operators who cannot accept the remaining
residual risk must not declare `worktree` waves and should keep all work on `sandcastle`
(container-isolated).

#### Task 10: Catastrophic-command denylist hook + worktree execution posture (HARD PREREQUISITE)

A `PreToolUse` hook (installed globally via `~/.claude/settings.json`, sourced from
`claude-harness`) that fires **regardless of permission mode** and blocks: `rm -rf` of
paths outside the active worktree, force-push to `master`/`main`, `git reset --hard`
across branches, prod-deploy commands, destructive DB statements, `curl | sh`. Denylist is
**layered**: a universal tier (versioned in the hook) + a repo tier read from the target
repo's `.harness-profile` (`loop_denylist:` block).

Because a string denylist cannot enumerate every bypass (alternate syntax, scripts,
aliases, path variants, non-shell file tools), the hook is **not** the confinement boundary
— it is a backstop layer. The hook's matcher MUST therefore: (a) normalize/canonicalize the
command (resolve `PATH`, strip quoting, expand obvious aliases) before matching, not match
raw substrings only; (b) cover **non-shell tool calls** (direct `Write`/`Edit`/file ops) by
delegating their path checks to the Task 11 write-root confinement, not by string matching;
(c) **fail closed** on parse ambiguity — if the hook cannot confidently parse a command, it
**blocks** it under the worktree runner rather than allowing through. The worktree runner
additionally runs with an **allowlist-leaning posture**: an operator-declarable
`loop_allowlist:` of command prefixes in `.harness-profile`; when set, the worktree runner
permits only allowlisted command families (plus read-only ops) and blocks the rest. When
no allowlist is declared, the denylist-only mode applies and the loop logs a `weak-posture`
warning into the run summary so the operator sees that confinement is denylist-only.

**Verify:** With the hook active: `rm -rf /tmp/outside-worktree` is blocked and
`git push --force origin master` is blocked; an in-worktree edit is allowed; a repo-local
`loop_denylist:` entry (`supabase db reset`) is blocked only in that repo. **Bypass-oriented
cases (all must block under the worktree runner):** (1) an aliased/relative-path form of a
denied command (`/bin/rm -rf ../outside`, `r''m -rf ../outside`); (2) the same destructive
effect via a script file (`bash ./wipe.sh` whose body does `rm -rf ..`) — verified via
fail-closed parse-ambiguity blocking or allowlist denial, with the test asserting the
*effect* is prevented (target path untouched), not merely that one string matched; (3) a
non-shell `Write`/`Edit` targeting a path outside the worktree write root is blocked by the
Task 11 confinement; (4) a path variant escaping the worktree (`../../etc/...`) is blocked.
With a `loop_allowlist:` declared, a non-allowlisted command is blocked even though it is
not on the denylist. With no allowlist declared, the run summary contains the `weak-posture`
warning.

#### Task 11: Worktree write-root confinement + refuse-without-guardrails + snapshot

At loop start, if any pending item resolves to the `worktree` runner, the loop verifies the
denylist hook is installed/active; if not, it **refuses to start those items** (sandcastle
items may still run — the container is their boundary). For *secret-bearing* worktree items
this pre-flight additionally enforces Task 11a's egress + pre-approval gates before any such
item is dispatched.

**Write-root confinement (enforceable, not just stated).** The worktree runner launches the
agent with its process working directory set to the worktree dir and an **explicit set of
allowed write roots** = `{the worktree dir, .harness-state/ for that run}`. Writes outside
those roots — by shell command, by non-shell `Write`/`Edit`, or by any tool — are denied at
the layer that can actually see the target path: the PreToolUse hook (Task 10) for tool
calls, plus, where the host supports it, an OS-level guard (e.g. a restricted-write sandbox
profile / `sandbox-exec` on macOS, or a bind-mounted read-only host root on Linux) declared
in `.harness-profile` (`worktree_write_guard:`). When no OS-level guard is available on the
host, confinement falls back to the hook + allowlist layer only, and the loop logs that the
write-root guard is **advisory, not OS-enforced** in the run summary (honest residual-risk
surfacing per the Phase 5 statement). The loop also takes a pre-run `master` snapshot
(tag/stash) so a bad merge or host write is recoverable with one `git reset`.

**Verify:** With the hook absent, a run containing a `worktree` item aborts those items with
a clear message while still draining `sandcastle` items. A worktree agent attempting a write
outside its allowed roots (both a shell `> /tmp/x` form and a non-shell `Write` to
`/tmp/x`) is denied and the target is untouched. With `worktree_write_guard:` declared and
supported, the OS-level guard denies an out-of-root write even if the hook is bypassed; with
no guard available, the run summary states write-root confinement is advisory-only. A
pre-run snapshot ref is created before the first worktree merge.

#### Task 11a: Secret-bearing worktree in-run containment — egress deny + pre-approval + scoped creds (HARD PREREQUISITE for any secret-bearing worktree item)

Implements controls (A)–(C) from the Phase 5 threat-model statement. An item is
**secret-bearing** if it resolves to the `worktree` runner **and** declares any credential
need (a `secrets:` list on the wave/issue, or any injected credential). The loop classifies
each worktree item at pickup; the three controls below gate execution of secret-bearing
worktree items only (non-secret worktree items keep the Task 10/11 posture).

- **(A) Default-deny outbound egress.** Before dispatching a secret-bearing worktree item,
  the runner establishes an egress-restricted execution context: outbound network is denied
  except to hosts in `.harness-profile` `worktree_egress_allowlist:` plus loopback. The git
  remote is **not** auto-allowed for secret-bearing items: because the common remote
  (`github.com`) doubles as a general API host the agent holds `gh`/git credentials for,
  blanket-allowing it would let the agent push to an arbitrary branch/fork, open issues, or
  upload release artifacts — defeating control (A)'s purpose. If the item genuinely needs to
  reach the remote during execution, the operator must list that exact host in
  `worktree_egress_allowlist:` (an explicit, operator-trusted decision per Open Question 6),
  and the residual risk that the same host exposes API/token-based exfil is surfaced in the
  run summary as `git-remote-allowlisted`. (Where the design can avoid it, prefer running the
  agent network-isolated and performing `git push` in a separate post-agent phase — see Open
  Question 8.) Enforcement uses the strongest mechanism the host supports
  (per-process firewall / `sandbox-exec` egress profile on macOS, network namespace +
  filter on Linux); where **no** OS-level egress mechanism is available, the loop **refuses
  to run the secret-bearing worktree item unattended** and logs `egress-unenforceable`
  (it does not silently fall back to open network with live secrets).
- **(B) Per-item pre-execution approval.** The loop does not dispatch a secret-bearing
  worktree item without an explicit operator approval token recorded *before* execution
  (e.g. a `loop:approved-for-execution` marker the operator sets, distinct from PR-merge
  approval). Absent approval, the item is deferred to the `blocked-on-human` set and the run
  summary reports it as `awaiting-pre-approval` — it is never executed in the operator's
  absence.
- **(C) Task-scoped credential injection.** The runner injects only the credentials the item
  declares in `secrets:` (scoped/short-lived where the credential provider supports issuing
  them), never the entire `.env.local`. An item declaring no secrets gets none.

**Acceptance criteria (hard thresholds — all must pass):**
- [ ] A secret-bearing worktree item with no `worktree_egress_allowlist:` can reach only
      loopback; an attempted connection to any other host — **including the git remote** — is
      denied (verified by the connection failing, not just a logged warning). The git remote
      is reachable during execution only when explicitly listed in `worktree_egress_allowlist:`.
- [ ] A connection to an allowlisted host succeeds; a connection to a non-allowlisted host
      fails, in the same run.
- [ ] On a host with no OS-level egress mechanism available, the secret-bearing worktree
      item is **not** executed unattended; the run aborts that item with `egress-unenforceable`
      (sandcastle and non-secret items still run).
- [ ] A secret-bearing worktree item without the pre-execution approval token is deferred
      (`awaiting-pre-approval` in the run summary) and its agent is never invoked.
- [ ] With the approval token present, the same item is dispatched.
- [ ] The runner injects only the item's declared `secrets:` entries; a credential present in
      `.env.local` but not declared is absent from the agent's environment (verified by the
      agent process env not containing the undeclared key).
- [ ] Error case: a malformed `worktree_egress_allowlist:` (unparseable host) → the item is
      refused (`egress-config-invalid`), not run with open egress.

**Verify:** Integration test against a secret-bearing worktree fixture item: (1) with no
allowlist, outbound requests to a non-allowlisted host **and to the git remote** both fail
(only loopback succeeds); adding the git remote to `worktree_egress_allowlist:` makes it
reachable and the run summary reports `git-remote-allowlisted`; (2) without the approval token the agent is never invoked and the summary
shows `awaiting-pre-approval`; with the token it runs; (3) the dispatched agent's environment
contains exactly the declared `secrets:` keys and not an undeclared `.env.local` key; (4) on
a stubbed host reporting no egress mechanism, the item aborts `egress-unenforceable` while a
sandcastle item in the same run completes.

### Phase 6: Integration with the harness — F-013, F-014

#### Task 12: Shared AFK/HITL classifier module (F-013)

A single module (`skills/_shared/`) implementing the **4-gate capability test**: escalate to
human only if the item requires (1) an unobtainable credential/access, (2) an out-of-band
action, (3) an unspecified product/design judgment, or (4) an irreversible prod action —
**runner-aware** (a `worktree` item has secrets/tools a `sandcastle` item lacks). Called by
`/spec-planner` at plan time *and* by the loop at pickup time; the loop **reconciles** an
issue's existing `ready-for-agent`/`ready-for-human` label against the test once the runner
is known, re-labeling and logging why on divergence. Matt's `/to-issues` label is an
initial hint only.

**Verify:** The same task fixture classifies AFK under `worktree` and HITL under
`sandcastle`. An issue pre-labeled `ready-for-agent` whose task trips gate (1) under its
resolved runner is re-labeled `ready-for-human` with a logged reason.

#### Task 13: Reuse `/close-wave` tick-off + §4.2 receipts (F-014)

On an AFK merge, the loop performs `/close-wave`'s `plan.md` tick (`[ ]`→`[x]`, move to
`## Recently Shipped`) and writes a §4.2 receipt + journal entry per item, plus one
run-level summary receipt. These are the **downstream, post-merge effects** of Task 8a step 6
— each keyed by the merge commit SHA and individually idempotent — so they are driven (or
repaired) by Task 8a's outbox reconciliation, never by an in-memory completion flag. No
parallel/duplicate state machine — the board stays the single source of truth and is brought
into agreement with the merge SHA by reconciliation.

**Verify:** After a fixture AFK wave merges, its `plan.md` row is ticked and moved to
Recently Shipped, and a per-item receipt + a run-summary receipt exist in `.harness-state/`
with valid idempotency keys. Re-running is a no-op on the already-ticked row. A *merged-but-
unticked* fixture (merge SHA in the outbox, row still `[ ]`) is repaired to ticked + receipt
on the next reconciliation pass, idempotently.

#### Task 14: `/park` opt-in promote + `/triage-parking` batch-promoter (F-014)

`/park` stays local-first (writes `parking_lot.md`) but gains a `--issue` flag that promotes
the item directly to a `ready-for-agent` (or `needs-triage`) GitHub issue. `/triage-parking`
gains a batch path that bulk-creates issues from operator-marked substantive items, routing
each through the shared classifier (Task 12) for its `ready-for-agent`/`ready-for-human`
label.

**Verify:** `/park --issue "X"` creates one labeled gh issue and does *not* append to
`parking_lot.md`. Plain `/park "Y"` appends locally and creates no issue. A
`/triage-parking` batch run promotes 2 marked items to issues with classifier-assigned
labels.

#### Task 15: `/spec-planner` emits the per-wave `Runner:` field

`/spec-planner` adds a `Runner:` line (`sandcastle` | `worktree`) to each wave/task it
authors, calling the shared classifier (Task 12), and **lints** for HITL-as-non-leaf:
warn when a `worktree`/HITL wave gates a large downstream subtree ("HITL waves should be
DAG leaves").

**Verify:** A planned wave with a secret-bearing task is authored `Runner: worktree`; a
plan where a worktree wave blocks ≥3 downstream waves emits the leaf-lint warning.

### Phase 7: Entry point + documentation — F-008 (front-end)

#### Task 16: `/run-loop` skill (single entry, source arg)

`skills/run-loop/SKILL.md` — `/run-loop waves` and `/run-loop issues` as thin front-ends
selecting the work-source provider and invoking the shared engine. `--help` short-circuits
before any side effect (match `/run-wave`'s convention). Name chosen over `/loop` (taken by
the Anthropic interval-scheduler built-in) for consistency with `/run-wave`.

**Verify:** `/run-loop --help` prints usage and exits with no side effects. `/run-loop
waves` selects the wave provider; `/run-loop issues` selects the issue provider; an unknown
source argument errors with the valid set.

#### Task 17: AGENTS.md `## Loop protocol` section (tool-neutral)

Document the loop as a tool-neutral protocol: the per-item gate sequence, runner selection
rules, risk-proportional auto-merge, scheduler semantics, termination/safety, and the
relationship to `/run-wave`/`/close-wave`. Claude-specific invocation notes go in CLAUDE.md.

**Verify:** AGENTS.md has a `## Loop protocol` section; it passes the 5-question portability
test from spec §2.3 of the universal-harness-protocol-v2 spec (no Claude-only assumptions in
the tool-neutral text).

#### Task 18: End-to-end live test on `quickbase-replacement`

Point `/run-loop issues` at `quickbase-replacement` (after seeding its `.harness-profile`
`loop_denylist:` with `supabase db reset` et al.). Issue #2 is `ready-for-agent` + unblocked;
#3 is blocked by #2. Capture the run summary as the workability verdict.

**Verify:** A run merges/PRs #2's work behind the mechanical gate, correctly defers or
proceeds on #3 per the readiness rule, and emits a run summary with the AFK/HITL/blocked
metric. No denylist violation occurs; no red merge lands.

## Open questions

1. **Stacked branches (deferred).** If live runs show HITL waves blocking the majority of
   the DAG (the risk the operator flagged), revisit stacked-PR support to let AFK dependents
   build on unmerged HITL branches. v1 measures first (Task 9 metric), then decides.
2. **Token-budget default.** Per-run token ceiling value is TBD; start unset (cap by
   iteration count) and calibrate from the first live runs.
3. **`ultra` review cost.** Whether any wave should force `review: ultra` by default, or
   keep it strictly opt-in, pending observed escape rate of `high` inline review.
4. **Worktree OS-level write guard portability.** Task 11's `worktree_write_guard:` relies
   on host support (`sandbox-exec` on macOS, bind-mount/namespace on Linux). The portable
   subset across both hosts is not yet pinned; until it is, worktree write-root confinement
   on unsupported hosts is advisory (hook + allowlist only) and the residual risk in the
   Phase 5 statement applies. Not a Phase-1 blocker — sandcastle (container-isolated) is the
   default and worktree items are human-PR-gated regardless.
5. **Accepted residual risk on worktree (not a bug — a documented tradeoff).** Codex round 1
   flagged that the worktree guardrails are a denylist, not OS confinement. We do not remove
   the worktree runner or claim full isolation: it deliberately exists for secret-bearing
   waves that cannot run in a container, and is bounded by write-root confinement + the
   human PR gate + a recoverable snapshot (Phase 5 statement). The remaining in-worktree
   residual risk is accepted by design; operators who cannot accept it must keep all work on
   `sandcastle`.
6. **In-run secret exfiltration on worktree (round 2 finding — what v1 enforces vs defers).**
   v1 **enforces**, as requirements (Task 11a): default-deny outbound egress, per-item
   pre-execution operator approval, and task-scoped credential injection for secret-bearing
   worktree items — so the merge gate is no longer the only line of defense and
   fully-unattended secret-bearing host execution *without* egress containment is **out of
   scope**. v1 **defers / accepts**: (a) exfiltration to an *allowlisted* host (the allowlist
   is operator-trusted by definition); (b) covert side-channels below the egress filter's
   granularity; (c) the portability gap below.
7. **Egress-enforcement mechanism portability.** Task 11a control (A) relies on host support
   (`sandbox-exec` egress profile on macOS, network namespace + filter on Linux). The portable
   subset is not yet pinned; until it is, a host lacking any OS-level egress mechanism causes
   the loop to **refuse** the secret-bearing worktree item (`egress-unenforceable`) rather than
   run it with open egress — this is fail-safe, not a Phase-1 blocker (sandcastle is the
   default; non-secret worktree items are unaffected).
8. **Git-remote egress phase-split (round 3 finding — narrow fix applied, deeper refinement
   deferred).** Round 3 flagged that auto-allowing the git remote leaves an exfil hole because
   `github.com` doubles as an API host. v1 **applies** the narrow fix: the git remote is no
   longer auto-allowed for secret-bearing items — it must be explicitly listed in
   `worktree_egress_allowlist:`, with the residual API-exfil risk surfaced as
   `git-remote-allowlisted` (Task 11a control (A)). v1 **defers** the deeper refinement:
   running the agent fully network-isolated and performing `git push` in a separate
   credential-scoped post-agent phase (so the remote is never reachable while the agent is
   live), or pinning egress to the git transport path with no usable REST/GraphQL token.
   **Not pursued:** the broader challenge "don't run secret-bearing worktree items unattended
   at all" was ruled *wrong-premise* by the scope arbiter — that envelope already shrank via
   controls (A)/(B)/(C) (pre-execution approval + default-deny egress + scoped creds), so the
   class of work it would exclude is not run fully unattended today.
