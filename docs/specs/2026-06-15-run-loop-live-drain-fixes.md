# Spec: /run-loop issues — live multi-issue drain fixes (Wave 22)

**Date:** 2026-06-15
**Status:** drafted from the Wave 21 T6b live-run findings (2026-06-15) — ready for adversarial review
**Board wave:** Wave 22 · Phases 1–3 · Tasks 1–7 · Features F-015–F-021
**Predecessor:** `docs/specs/2026-06-14-run-loop-live-wiring.md` (Wave 21 — the "hands": pluggable backends, verify-gate, live driver, production composition root)

> **Board wave:** Wave 22 · Phases 1–3 · Tasks 1–7 · Features F-015–F-021
> _(Machine-readable map per AGENTS.md §"Plan & spec grammar". `Wave 22` is the board number; `Phase`/`Task` restart at 1 inside this spec. `F-0xx` is global/monotonic — Wave 21 reached F-014.)_

## Prior Work

Builds on: [/run-loop live wiring](2026-06-14-run-loop-live-wiring.md) (Wave 21) and the engine spec [/run-loop engine](2026-06-14-run-loop-engine.md) (Waves 18–20).

Assumes (inherited, unchanged):
- The frozen Phase-1 seams in `skills/_shared/loop/types.ts` (`WorkSource`/`Runner`/`PerItemProtocol`/`RunnerFactory`/`WorkItem`/`ItemResult`/`RunSummary`/`EngineDeps`) and `engine.ts`'s `runLoop`. **Additive-only — see the Hard constraints below.**
- The pluggable `dispatchAgent`/`dispatchReview` seams + backend registries (`dispatch/backends.ts`), the Codex/Claude implement adapters (`dispatch/implement.ts`), the Opus-API/OpenRouter/Codex review backends (`dispatch/review.ts`), the mechanical gate + verify-gate (`protocol/gate.ts`, `protocol/verify-gate.ts`), the `ShellGitCommitter` agent-edits/runner-commits model, the live driver (`run-loop-driver.ts`), and the production composition root (`run-loop-prod-deps.ts` + `run-loop-entry.ts`).
- The **already-built-but-unwired** pieces this wave activates: the readiness scheduler `scheduler/dag.ts` (`scheduleRun`, readiness = all blockers MERGED) and the durable terminal-transition state machine `providers/issue-provider.ts` (`TerminalTransitions.completeItem`/`relabelItem`/`escalateItem`) + `post-merge.ts`.

Changes (this spec overrides / extends Wave 21):
- The production drive (`run-loop-prod-deps.ts` `ProductionProtocol.run` + `buildIssuesProductionDeps`) currently pulls items in source order and crashes the whole loop on an unsupported lane; this spec makes it readiness-gated, crash-isolated, and (Task 6 scope decision) terminal-transition-wired.

## Implementation

**Recommended flow:** `/run-wave 22` → orchestrator dispatches T1–T4 + T6 (parallelizable; T4 after T3, T6 after T1–T3) → `/close-wave 22`, then operator runs T5 + the T7 dual-direction live re-drain on a worktree runner with creds re-provided.
**Reason:** 7 tasks; rank-4 parallelism (T1/T2/T3/T6 independent); partial completion is materially worse than no change (fixing one bug still leaves the loop crashing; the direction knob is needed for the direction-B acceptance) — wave-shaped with all-or-nothing merge semantics.
**Alternatives:** `/micro` per task + `/commit` between for the code tasks if the orchestrator is unavailable; T5/T7 are operator-gated either way.
**Implementation block written:** 2026-06-15

## Why this spec exists

Wave 21 shipped the `/run-loop` hands and **passed a clean-room smoke** (single worktree item, no deps, Codex exited 0). The FIRST run against a real multi-issue repo (`agaleraib/quickbase-replacement` issues #2/#3, T6b, 2026-06-15) surfaced four integration bugs the smoke never exercised, plus one scope gap. Each is reproduced live and confirmed against the code below at file:line. None requires a frozen-interface change (verified — see Frozen-interface risk).

The exit gate is the deferred **T6b verdict**: a real `/run-loop issues` run drains #2 end-to-end (implement → runner-commits even on codex non-zero-with-edits → gate → Opus review → verify-gate → done/transition), **defers #3** until #2 is done, never crashes on an unsupported lane, and emits the AFK-merged / HITL-waiting / blocked summary.

## The bugs (grounded at file:line)

| # | Bug | Root cause (file:line) |
|---|---|---|
| 1 | **Blocked-by readiness not enforced in the drive.** #3 (`## Blocked by\n- #2`, #2 open) was previewed ready and processed FIRST. | `scheduler/dag.ts:134 scheduleRun` fully implements readiness (`allBlockersMerged`, dag.ts:122) + AFK-frontier + HITL deferral — but is imported by **no** drive module. `IssueWorkSource.nextReady` (`providers/issue-provider.ts:454`) yields the queue in source order, ignoring the parsed `blockedBy` (issue-provider.ts:119). `engine.ts:53` pulls `source.nextReady()` with no readiness check. |
| 2 | **Unsupported lane throws uncaught → whole loop crashes.** #3 had no `runner:` label ⇒ default `sandcastle` ⇒ `UnsupportedContainerRunner.run` throws; nothing catches it; process exits 1, no other item runs. | `run-loop-prod-deps.ts:121` throws; `ProductionProtocol.run` (run-loop-prod-deps.ts:241) has no per-item try/catch; `runLoop` (engine.ts:76) does not wrap `protocol.run`. The driver preflight CLEARS sandcastle items (`run-loop-driver.ts:80–82`) rather than refusing them when the container lane is unwired, so they detonate at dispatch. |
| 3 | **Non-zero codex exit DISCARDS real edits.** Codex produced a coherent 505-line, 6-file impl for #2 but exited non-zero ⇒ edits orphaned uncommitted, lost; codex stderr discarded so the WHY is invisible. | `CodexImplementAdapter.dispatch` sets `ok = (r.exitCode === 0)` (`dispatch/implement.ts:87`). `ProductionProtocol.run` returns `failed` at `run-loop-prod-deps.ts:253–256` **before** `commitAll` (line 257), so the working-tree edits are never committed and `result.stderr` is dropped. Likely trigger: codex's own post-edit git/commit attempt hits the read-only `.git` under `-s workspace-write` — the exact case "agent-edits/runner-commits" was meant to handle, but the runner only commits when the agent exits 0. |
| 4 | **Failure mis-bucketing.** An implement/commit failure is reported as `gate-failed` though the gate never ran. | `run-loop-prod-deps.ts:435` maps `case 'failed'` → `builder.recordGateFailed`. `RunSummaryReport` (`termination.ts:101`) has no implement-failed/aborted bucket. |
| 5 (scope) | **Terminal transition not wired into the drive.** A fully successful item never transitions its GitHub issue (no relabel / PR-link / close). | `IssueWorkSource.recordResult` only pushes to an in-memory array (`providers/issue-provider.ts:471`). `completeItem`/`relabelItem`/`escalateItem` (issue-provider.ts:187–199, the two-phase machine) and `post-merge.ts` are never called by `engine.ts` / `run-loop-driver.ts` / `run-loop-prod-deps.ts`. See the **Task 6 scope decision** + Open question 1. |

## Decisions (locked)

| Axis | Decision |
|---|---|
| Bug 1 fix locus | **Activate the existing `scheduleRun` scheduler in the production drive — do NOT change the engine.** `engine.ts` stays byte-for-byte frozen. The readiness gate lands in the issues-mode `WorkSource` composition (`buildIssuesProductionDeps`): the source yields items in readiness order and **defers** (returns `null` past) any item whose blockers are not all done this run. Readiness = blockers reaching a done/terminal state (issue closed or carrying a terminal marker), mirroring `scheduleRun`'s "all blockers merged" rule against issue state instead of git-merge state. |
| Bug 2 fix | **Both belt and suspenders.** (a) Per-item crash isolation: wrap the unsupported-lane / unexpected throw in `ProductionProtocol.run` so it records `status:'failed'` (skip-and-continue, matching the engine's stall-detection design) and surfaces the reason — never let one item's throw kill the loop. (b) Preflight refuses (not clears) sandcastle items when no real container runner is wired, so the operator sees the refusal in the preview instead of a mid-run detonation. The engine's frozen `runLoop` is **not** modified; isolation lives in the injected protocol. |
| Bug 3 fix | **Detect "edits present in the working tree" and commit-and-continue regardless of agent exit code, with a guard against masking genuine failures.** After dispatch: if the agent reports `ok` OR the working tree is dirty (uncommitted edits exist), run `commitAll` + `collectCommits`. If commits were produced, proceed to the gate (the gate is the real arbiter of quality — a bad impl fails there, not at the exit code). If the agent failed AND no edits/commits resulted, record `status:'failed'` with the truncated codex stderr in the note. This makes the gate authoritative and stops a cosmetic post-edit git error from discarding real work. |
| Bug 3 diagnostics | **Surface codex stderr (truncated) on any implement failure.** The adapter already captures `stdout`/`stderr` (`backends.ts:54–57`); thread a truncated stderr tail into the `ItemResult.note` and the trace log. Never log env. |
| Bug 4 fix | **Add a distinct implement-failed bucket** to `RunSummaryReport`/`RunSummaryBuilder` (additive field + recorder) and map `status:'failed'` to it when the gate never ran, vs `gate-failed` when the gate ran red. Disambiguate in `ProductionProtocol` by attaching a machine-readable reason to the `ItemResult.note` (e.g. prefix `implement-failed:` vs `gate-failed:`) so the report mapping is honest without widening `ItemResult` shape. |
| Bug 5 / Task 6 scope | **IN SCOPE for Wave 22 — terminal transition wired for the `completeItem` (merged-AFK) path, behind a default-off `RUN_LOOP_TRANSITION_ISSUES` gate** so the existing throwaway-branch live-test posture is preserved by default. A successful AFK merge calls `IssueWorkSource.terminalTransitions().completeItem` (or `post-merge.ts`) only when the gate env is set; otherwise the drive stays read-only on GitHub (local commits only), exactly as T6b ran. `escalateItem`/`relabelItem` wiring for the HITL/failed paths is also covered but the SAME gate governs all GitHub mutation. This makes a true end-to-end AFK drain possible while keeping every live test reversible by default. (See Open question 1 for the residual: PR creation/merge-to-main is still out of scope — the transition links a PR/marker, it does not open one.) |
| Backend-direction knob (new, Task 6) | **Per-run only, by explicit operator choice — additive.** Add `--implement <codex\|claude>` / `--review <anthropic-api:opus-4.8\|codex\|openrouter:<model>>` CLI flags (parsed in `run-loop-entry.ts main()` via the existing `flagValue()` helper) + env equivalents `RUN_LOOP_IMPLEMENT_BACKEND` / `RUN_LOOP_REVIEW_BACKEND` (**flag wins over env**), threaded into `buildBackendConfigFromEnv` so they land as `config.implementDefault` / `config.reviewDefault`. Validate implement against `IMPLEMENT_BACKENDS` (`['codex','claude']`) and review via the existing `parseReviewBackendId` grammar; **unknown value ⇒ clear error before any side effect** (mirror the `--help`/unknown-source short-circuit). The resolver already enforces per-RUN consistency (no per-item override ⇒ every item uses the run default), so the whole run uses one direction. **Composes with egress, does not bypass it:** `review=codex` is LOCAL ⇒ no egress gate; `review=anthropic-api`/`openrouter` are external ⇒ still require `allow_external_review` / `RUN_LOOP_ALLOW_EXTERNAL_REVIEW=1`. `BackendConfig` is NOT a frozen Phase-1 interface — additive. |
| Frozen interfaces | **Zero changes to `types.ts` / `engine.ts`.** All fixes land in `run-loop-prod-deps.ts`, the issues-mode source composition, `run-loop-driver.ts`, `run-loop-entry.ts`, `dispatch/backends.ts` (`buildBackendConfigFromEnv` knob threading), and `termination.ts` (additive field only). If any fix is found to require a frozen-interface change during build, **STOP and flag it loudly** with the specific interface (see Hard constraints). |
| Toolchain | Node ≥24 native type-stripping, `node:test`, no build step. The gate uses an ephemeral `typescript@5.7.2 + @types/node@22` install (mirror Wave 21). Strict tsc 0 errors, **no `any`**. |

## Hard constraints (the exit gate enforces these)

- **Frozen Phase-1 interfaces are additive-only.** `skills/_shared/loop/types.ts` and `engine.ts` MUST NOT change shape (Wave 18 froze them; Waves 19–21 honored it — `types.ts`/`engine.ts` 0 lines changed). `RunSummaryReport` (in `termination.ts`) is NOT a frozen Phase-1 interface and MAY gain an additive field (Bug 4). If a fix appears to need a frozen-interface change, flag it as a spec risk with the specific interface and STOP.
- TypeScript strict, **no `any`**. Ephemeral-tsc gate (no vendored tsc).
- **Existing 186 loop tests stay green.** Add the regression tests that would have caught each bug:
  - Bug 1: a blocked-sibling fixture (two issues, one `## Blocked by` the other) asserting the blocker runs first and the blocked item is deferred until the blocker is done.
  - Bug 2: an unsupported-lane item that must NOT crash the loop — the run completes, the item is `failed`/`skipped`, and a sibling still runs.
  - Bug 3: a non-zero-exit-with-edits case — the committer commits the working-tree edits and the item proceeds to the gate; a non-zero-exit-with-NO-edits case still records `failed` with stderr surfaced.

## Tasks

### Task 1: Enforce blocked-by readiness in the issues-mode drive (Bug 1, F-015)

Wire the existing `scheduleRun` (or an equivalent readiness predicate over issue state) into the `issues`-mode `WorkSource` composition so the drive only yields an item once all its `blockedBy` blockers are done, and processes blockers before blocked items. The engine is untouched; the readiness gate lives in the source/composition layer (`buildIssuesProductionDeps` + a readiness-aware wrapper around `IssueWorkSource.nextReady`, or a re-evaluating source that consults issue done-state).

- **Files:** `skills/_shared/loop/run-loop-prod-deps.ts`, `skills/_shared/loop/providers/issue-provider.ts` (readiness-order yield), `skills/_shared/loop/test/issue-provider.test.ts` (or a new `readiness-drive.test.ts`).
- **Depends on:** Nothing (the scheduler + parse already exist).
- **Runner:** sandcastle  # classifier: ready-for-agent; gates: none
- **Verify:** New `node --test` fixture: two work items A and B where B `blockedBy` A. With A not-done, `nextReady()` yields A first and does NOT yield B; after A is recorded done, a re-evaluation yields B. Assert the engine never processes B before A. (Fails before: source-order yield returns B first.)
- **Manual fallback:** Open `run-loop-prod-deps.ts` + `issue-provider.ts` in an editor; add the readiness check by hand following `scheduler/dag.ts`'s `allBlockersMerged` pattern; run `node --test skills/_shared/loop/test/` to confirm the new fixture passes; `git add` the touched files and commit.

### Task 2: Crash-isolate unsupported / throwing lanes — skip-and-continue + preflight refusal (Bug 2, F-016)

(a) Wrap the per-item work in `ProductionProtocol.run` so any throw (e.g. `UnsupportedContainerRunner`) is caught, recorded as `status:'failed'` with the reason in the note, the runner is torn down, and the loop continues with the next item. (b) Make the driver preflight **refuse** sandcastle items (surface a `PreflightRefusal`) when the container lane is the `UnsupportedContainerRunner`, instead of clearing them — so the operator sees it in the preview, not a mid-run crash.

- **Files:** `skills/_shared/loop/run-loop-prod-deps.ts` (try/catch in `ProductionProtocol.run`; signal the unwired-container case to the preflight), `skills/_shared/loop/run-loop-driver.ts` (`runBackendAwarePreflight` refuses unwired-sandcastle), `skills/_shared/loop/test/prod-deps.test.ts` + `skills/_shared/loop/test/run-loop-driver.test.ts`.
- **Depends on:** Nothing.
- **Runner:** sandcastle  # classifier: ready-for-agent; gates: none
- **Verify:** New `node --test`: a two-item run where item 1's lane throws at dispatch and item 2 is healthy → the loop completes, item 1 is `failed` (reason surfaced), item 2 is processed. Separately, `runBackendAwarePreflight` with an unwired container returns a refusal for a sandcastle item (was: cleared). (Fails before: the throw propagates out of `runLoop` and item 2 never runs.)
- **Manual fallback:** Edit `ProductionProtocol.run` to wrap its body in `try/catch` returning a `failed` `ItemResult`; edit `runBackendAwarePreflight` to push a refusal for sandcastle when the injected container is unsupported; run `node --test skills/_shared/loop/test/`; commit.

### Task 3: Commit-on-edits-regardless-of-exit-code + surface codex stderr (Bug 3, F-017)

In `ProductionProtocol.run`, after dispatch: detect working-tree edits (dirty tree) even when the agent exited non-zero; if edits exist, `commitAll` + `collectCommits` and proceed to the gate (the gate decides quality). Only record `failed` when the agent failed AND no commits resulted — with the truncated codex stderr threaded into the note + trace. Add a `ShellGitCommitter` "is the tree dirty?" probe (additive method on the structural committer type, like the existing `diff`) so no edits are silently discarded.

- **Files:** `skills/_shared/loop/run-loop-prod-deps.ts` (`ProductionProtocol.run` ordering + stderr surfacing), `skills/_shared/loop/dispatch/implement.ts` (`ShellGitCommitter` dirty-tree probe, additive — `GitCommitter` interface untouched), `skills/_shared/loop/test/prod-deps.test.ts` + `skills/_shared/loop/test/implement-adapters.test.ts`.
- **Depends on:** Nothing (composes with Task 2's try/catch but is independently shippable).
- **Runner:** sandcastle  # classifier: ready-for-agent; gates: none
- **Verify:** New `node --test` with a fake backend returning `{ok:false, exitCode:1, stderr:'index.lock: Operation not permitted'}` and a fake committer reporting a dirty tree + one commit → the protocol commits, runs the gate, and the item is NOT failed-at-implement. A second fake returning `ok:false` with a CLEAN tree / no commits → `failed`, note contains the truncated stderr. (Fails before: `result.ok===false` short-circuits to `failed` before `commitAll`.)
- **Manual fallback:** Edit `ProductionProtocol.run` to move the dirty-tree/commit step before the `!result.ok` early-return and gate the early-return on "no commits produced"; add a `dirty()`/`status` shell probe to `ShellGitCommitter`; run `node --test skills/_shared/loop/test/`; commit.

### Task 4: Honest failure bucketing — distinct implement-failed bucket (Bug 4, F-018)

Add an additive `implementFailed` counter + `recordImplementFailed` to `RunSummaryBuilder`/`RunSummaryReport` (NOT a frozen interface) and the summary print line. In `buildProductionDeps`'s result→report mapping, route a `failed` `ItemResult` to `implement-failed` when the gate never ran vs `gate-failed` when it ran red, disambiguated by a machine-readable note prefix set in `ProductionProtocol`.

- **Files:** `skills/_shared/loop/termination.ts` (additive field + recorder + report field), `skills/_shared/loop/run-loop-prod-deps.ts` (mapping + note prefix), `skills/_shared/loop/run-loop-driver.ts` (`buildSummaryLines` prints the new bucket), `skills/_shared/loop/test/termination.test.ts` + `skills/_shared/loop/test/run-loop-driver.test.ts`.
- **Depends on:** Task 3 (the note prefix it routes on is set there) — sequence after T3.
- **Runner:** sandcastle  # classifier: ready-for-agent; gates: none
- **Verify:** New `node --test`: an implement-failed `ItemResult` (note prefix `implement-failed:`) increments `implementFailed`, not `gateFailed`; a gate-red `ItemResult` increments `gateFailed`. `buildSummaryLines` prints both buckets. `tsc` confirms `RunSummary`/`ItemResult` frozen shapes are unchanged (only `RunSummaryReport` gained a field). (Fails before: `case 'failed'` always calls `recordGateFailed`.)
- **Manual fallback:** Add the field + recorder to `RunSummaryBuilder`/`RunSummaryReport`; edit the `switch` in `buildProductionDeps`'s `buildReport`; add the print line; run `node --test`; commit.

### Task 5: Wire terminal transition for the merged-AFK path, env-gated (Bug 5 / scope, F-019)

Wire `IssueWorkSource.terminalTransitions().completeItem` (and the `escalateItem`/`relabelItem` siblings for the escalated/HITL outcomes, via `post-merge.ts`) into the issues-mode drive so a successful AFK merge transitions its GitHub issue — **only when `RUN_LOOP_TRANSITION_ISSUES=1`**. Default off ⇒ the drive stays GitHub-read-only (local commits only), preserving the reversible throwaway-branch posture T6b ran under. `recordResult` (or a post-merge step the driver owns) invokes the two-phase machine; idempotency is already guaranteed by the existing terminal-marker checks.

- **Files:** `skills/_shared/loop/run-loop-prod-deps.ts` (invoke the transition on `completed`/`escalated` when gated), `skills/_shared/loop/post-merge.ts` (import + wire), `skills/_shared/loop/providers/issue-provider.ts` (expose what the driver needs — no shape change to `WorkSource`), `skills/_shared/loop/test/post-merge.test.ts` + `skills/_shared/loop/test/prod-deps.test.ts`.
- **Depends on:** Tasks 1–4 (the drive must produce honest `completed` results first).
- **Runner:** worktree  # classifier: ready-for-human; gates: out-of-band-action (live `gh` issue mutation against a real repo is the only true verification)
- **Verify:** New `node --test` with a fake `GhClient`: a `completed` item with `RUN_LOOP_TRANSITION_ISSUES=1` calls `completeItem` (PR-link comment + close + terminal marker); with the env unset, NO gh mutation occurs. Idempotent: a second drive over the same item is a no-op (existing marker). (Fails before: `recordResult` only pushes to an array.) Live verification is the Task 6 gate.
- **Manual fallback:** Edit `run-loop-prod-deps.ts` to call `source.terminalTransitions().completeItem(...)` on a `completed` result behind an `process.env.RUN_LOOP_TRANSITION_ISSUES === '1'` guard; wire `post-merge.ts`; run `node --test skills/_shared/loop/test/`; commit. Live check: against a throwaway issue, set the env, run the entry, and confirm via `gh issue view` the label swap + close landed.

### Task 6: Per-run backend-direction knob — `--implement` / `--review` flags + env (F-020)

Add an operator-facing per-run knob to set the backend direction (today it is hardcoded to `codex` → `anthropic-api:opus-4.8` because `buildBackendConfigFromEnv` passes no profile to `loadBackendConfig`, so both defaults are `undefined`). Additive: CLI flags `--implement <codex|claude>` and `--review <anthropic-api:opus-4.8|codex|openrouter:<model>>` parsed in `run-loop-entry.ts main()` (reuse the existing `flagValue()` helper, same as `--repo`/`--item-file`), plus env equivalents `RUN_LOOP_IMPLEMENT_BACKEND` / `RUN_LOOP_REVIEW_BACKEND` (**flag wins over env**). Thread both into `buildBackendConfigFromEnv` so they land as `config.implementDefault` / `config.reviewDefault`. Validate implement against `IMPLEMENT_BACKENDS`; validate review via the existing `parseReviewBackendId` grammar (`anthropic-api:<model>` / `openrouter:<model>` / `codex`). An unknown value errors cleanly BEFORE any side effect (mirror the `--help`/unknown-source short-circuit). The preview line already prints `implement=… review=…` (`run-loop-driver.ts:114`) — confirm it reflects the chosen direction; surface the resolved direction in the preview and `--help`. The egress policy is unchanged and composes: `review=codex` is local (no gate); `review=anthropic-api`/`openrouter` still require `allow_external_review` / `RUN_LOOP_ALLOW_EXTERNAL_REVIEW=1`.

- **Files:** `skills/_shared/loop/run-loop-entry.ts` (parse `--implement`/`--review` in `main()`; thread to `runProduction`; extend `RUN_LOOP_USAGE`), `skills/_shared/loop/run-loop-prod-deps.ts` (`buildBackendConfigFromEnv` reads the two env vars + accepts the parsed overrides), `skills/_shared/loop/dispatch/backends.ts` (only if a tiny additive validation helper is cleaner here — `loadBackendConfig`/`parseReviewBackendId` already exist; **do not change `BackendConfig` shape**), `skills/_shared/loop/test/run-loop-entry.test.ts` + `skills/_shared/loop/test/prod-deps.test.ts` + `skills/_shared/loop/test/dispatch-backends.test.ts`.
- **Depends on:** Nothing (independent of T1–T5; composes with all of them).
- **Runner:** sandcastle  # classifier: ready-for-agent; gates: none
- **Verify:** New `node --test`: `--implement claude --review codex` → `config.implementDefault==='claude'`, `config.reviewDefault==='codex'`; env-only `RUN_LOOP_IMPLEMENT_BACKEND=claude` → same; flag-AND-env → flag wins. Unknown `--implement gpt5` / `--review bogus:x` → a clear error printed BEFORE any drive side effect (assert no `drive`/`runProduction` call). With external review off (no allow flag), `--review anthropic-api:opus-4.8` downgrades/refuses to local with a logged reason while `--review codex` runs ungated. The preview line reflects the chosen direction. (Fails before: no flags/env exist; defaults are hardcoded.)
- **Manual fallback:** Edit `run-loop-entry.ts main()` to read `flagValue('--implement')`/`flagValue('--review')` + the two env vars (flag||env), validate against `IMPLEMENT_BACKENDS` / `parseReviewBackendId`, print an error + return on invalid; pass the resolved pair through `runProduction` into `buildBackendConfigFromEnv`; add the two lines to `RUN_LOOP_USAGE`; run `node --test skills/_shared/loop/test/`; commit.

### Task 7: Dual-direction live re-drain of quickbase-replacement #2/#3 — the deferred T6b verdict (F-021)

Re-run `/run-loop issues` against `agaleraib/quickbase-replacement` (#2 ready, #3 `## Blocked by #2`) end-to-end on a throwaway branch in **BOTH backend directions** and capture each AFK-merged / HITL-waiting / blocked summary. This is the acceptance run — operator-gated (live `gh` + backend auth; keys re-provided per run, never stored).

- **Direction A (default):** `--implement codex --review anthropic-api:opus-4.8` (external review ⇒ needs `RUN_LOOP_ALLOW_EXTERNAL_REVIEW=1`) — the existing acceptance.
- **Direction B (reverse):** `--implement claude --review codex` — Opus/Claude implements, codex adversarially reviews. **Honest caveats:** `ClaudeImplementAdapter` is spike-validated but never live-run; `CodexReviewBackend` is unit-tested but never live-run; `implement=claude` is metered at full Claude API rates post-2026-06-15 (deliberate, not the cheap default). Direction B is **local review (no egress gate)** — no external-review flag needed.

- **Files:** `skills/_shared/loop/test/live-test-runbook.md` (Wave 22 dual-direction procedure + both captured summaries), `docs/waves/wave22-*.md` (close-wave receipt).
- **Depends on:** Tasks 1–6 (Direction B requires the Task 6 knob).
- **Runner:** worktree  # classifier: ready-for-human; gates: unobtainable-credential (live backend + gh creds), out-of-band-action (real repo run), irreversible-prod-action (only if `RUN_LOOP_TRANSITION_ISSUES=1`; default-off keeps it reversible)
- **Verify:** Each direction's real run drains **#2 end-to-end** (implement → runner commits EVEN on a non-zero-with-edits agent exit → exit gate green → review → verify-gate → done/transition), **defers #3** until #2 is done, does NOT crash on any unsupported lane, and emits the AFK-merged / HITL-waiting / blocked summary with an honest implement-failed bucket. Direction A uses Codex implement + Opus review (external, allow-flag on); Direction B uses Claude implement + codex review (local, no allow-flag) — its FIRST live proof of `ClaudeImplementAdapter` + `CodexReviewBackend`. No red merge; no sandbox escape. (Fails before: #3 ran first, the loop crashed on the sandcastle lane, #2's edits were discarded on a non-zero exit, and there was no way to select Direction B.)
- **Manual fallback:** Follow `live-test-runbook.md`: clone quickbase-replacement, branch throwaway, source keys into `process.env` only. Direction A: `RUN_LOOP_ALLOW_EXTERNAL_REVIEW=1 node skills/_shared/loop/run-loop-entry.ts issues --implement codex --review anthropic-api:opus-4.8 --yes`. Direction B: `node skills/_shared/loop/run-loop-entry.ts issues --implement claude --review codex --yes`. Eyeball each printed summary against the four expectations, paste both into the runbook + wave receipt. No LLM tool required to run the entry or read the summaries.

## Exit gate

`skills/_shared/loop/` tests stay green (186 baseline + the new regression tests for Bugs 1–4 + the backend-direction-knob tests); strict `tsc` 0 errors; no `any`; **zero frozen Phase-1 interface change** (`types.ts` / `engine.ts` 0 lines; only additive impls + an additive `RunSummaryReport` field; `BackendConfig` shape unchanged). The backend-direction knob is unit-proven: `--implement`/`--review` flags + env set `config.implementDefault`/`reviewDefault`, flag wins over env, an unknown value errors before any side effect, and the egress policy still gates `anthropic-api`/`openrouter` (not `codex`). A real `/run-loop issues` run against `agaleraib/quickbase-replacement` (#2 ready, #3 `## Blocked by #2`), in **both backend directions**:
- **Direction A** (`--implement codex --review anthropic-api:opus-4.8`, external review allowed) AND **Direction B** (`--implement claude --review codex`, local review) each drain **#2 end-to-end** — implement → **runner-commits even on a non-zero-with-edits agent exit** → gate → review → verify-gate → done/transition;
- **defer #3** until #2 reaches a done state;
- do **NOT crash** on any unsupported lane (skip-and-continue or preflight-refuse);
- emit the **AFK-merged / HITL-waiting / blocked** summary with an honest implement-failed bucket.
Direction B is the first live proof of `ClaudeImplementAdapter` + `CodexReviewBackend` (both previously only spike/unit-validated).

## Frozen-interface risk

**No frozen-interface change is required** (verified): every fix lands in `run-loop-prod-deps.ts`, the issues-mode source composition, `run-loop-driver.ts`, and `termination.ts` (additive field — not a Phase-1 frozen interface). Specifically: Bug 1 activates the existing `scheduleRun`/readiness logic in the composition layer, leaving `engine.ts`'s `runLoop` and the `WorkSource` interface shape untouched (the readiness-order yield is an implementation detail of the source). Bug 2's crash isolation lives in the injected `ProductionProtocol`, not in `runLoop`. Bug 3 adds an additive method on the concrete `ShellGitCommitter` (the `diff` precedent), leaving the `GitCommitter` interface untouched. Bug 4 touches only `RunSummaryReport`. The Task 6 backend-direction knob is additive too: it sets the existing `config.implementDefault`/`config.reviewDefault` fields via new flags/env and reuses the existing `loadBackendConfig`/`parseReviewBackendId` validators — `BackendConfig` (not a frozen Phase-1 interface anyway) keeps its shape. **If any task is found mid-build to require touching `WorkSource`/`Runner`/`PerItemProtocol`/`WorkItem`/`ItemResult`/`RunSummary`/`EngineDeps` in `types.ts` or `runLoop` in `engine.ts`, STOP and escalate** — the constraint is load-bearing (it is the whole reason Waves 18–21 stayed composable).

## Open questions

| # | Question | Impact | Decision needed by |
|---|----------|--------|-------------------|
| 1 | **PR creation + merge-to-main is still out of scope.** Task 5 wires the issue *transition* (relabel/PR-link/close) but the drive still does no `git push` / no PR open / no merge-to-main — `completeItem`'s "PR-link" is a comment, not a created PR. A true AFK merge-to-main needs a push+PR+merge step. Wave 22 or a follow-up? | Whether the AFK drain is "merged to a real branch" or "committed locally + issue transitioned". | Before any non-throwaway live run. |
| 2 | **Readiness re-evaluation cost.** Bug 1's fix re-checks blocker done-state as the drive progresses. For `issues` mode this is a `gh` read per re-eval; the engine pulls lazily, so a naive re-eval per `nextReady` could be O(n²) gh calls. Cache per run vs re-read? | Live `gh` rate-limit / latency on large issue queues. | Before a run with >~10 ready issues. |
| 3 | **"Done" definition for blocked-by readiness.** Wave 21's scheduler uses "all blockers MERGED" (git). For `issues` mode with `RUN_LOOP_TRANSITION_ISSUES` default-off, a blocker that was AFK-merged locally never transitions its issue → it reads as "not done" by issue state. Should readiness key on the in-run `recordResult` (item completed this run) OR issue terminal state OR both? | Whether #3 unblocks after #2 in a SINGLE drive when transitions are off. | Task 1 build time (the fixture pins it). |
| 4 | **Codex non-zero-exit signature.** Bug 3 commits on "edits present regardless of exit code". If codex exits non-zero for a *real* reason (partial edit, internal error) we may commit a broken half-impl that then fails the gate — correct (gate is truth) but noisy. Do we want to additionally classify known-benign codex exit signatures (e.g. the read-only-`.git` commit attempt) to keep the implement-failed bucket clean? | Summary honesty / noise on the implement-failed bucket. | After the first multi-item live run shows the real exit-code distribution. |
| 5 | **Direction B is unproven live.** `ClaudeImplementAdapter` (spike-only) and `CodexReviewBackend` (unit-only) get their FIRST live run in Task 7 Direction B. If `implement=claude` headless quality or codex-as-reviewer signal disappoints, the *knob and selectors* still stand (the failure is capability, not architecture) — but the "cross-model adversarial review is a config choice" claim needs the live result to back it. | Whether Direction B is a recommended config or a documented-but-discouraged option. | After the Task 7 dual-direction run. |

**Settled by this revision (no longer open):** per-run-vs-per-issue backend direction — it is **per-run only, by explicit operator choice** (`--implement`/`--review` flags / env). The resolver already enforces per-RUN consistency (no per-item override path is exposed), so a single run uses one direction end-to-end. Per-item direction is explicitly out of scope.

## Proposed `### Wave 22` plan.md block (for the operator to paste into `## Next` — NOT written by this spec)

```markdown
### Wave 22 — /run-loop issues live-drain fixes (T6b verdict)

- depends-on: Wave 21 merged (✓ 8461197); live backend + gh creds re-provided per run; quickbase-replacement #2/#3 seeded
- spec: docs/specs/2026-06-15-run-loop-live-drain-fixes.md
- done-when: a real `/run-loop issues` run drains #2 end-to-end (implement → runner-commits even on a non-zero-with-edits agent exit → gate → review → verify-gate → done/transition) in BOTH backend directions (A: codex→opus-4.8 external; B: claude→codex local), defers #3 until #2 is done, never crashes on an unsupported lane, emits the AFK/HITL/blocked summary with an honest implement-failed bucket; 186 baseline tests + new regression tests + knob tests green; strict tsc 0; no `any`; zero frozen Phase-1 interface change
- next-concrete-action: Dispatch Task 1 (activate the readiness scheduler in the issues-mode drive)

**Why this wave:** Wave 21's clean-room smoke passed but the first real multi-issue run (T6b, 2026-06-15) found four integration bugs — readiness not enforced, unsupported lane crashes the loop, non-zero codex exit discards real edits, failure mis-bucketed — plus an unwired terminal transition. This wave fixes them, adds a per-run backend-direction knob, and re-runs the deferred T6b acceptance in both directions.

**Tasks (7):** T1 (readiness gate in the issues drive, Bug 1), T2 (crash-isolate unsupported lanes, Bug 2), T3 (commit-on-edits-regardless-of-exit + surface stderr, Bug 3), T4 (honest implement-failed bucket, Bug 4), T5 (env-gated terminal transition, Bug 5/scope), T6 (per-run `--implement`/`--review` backend-direction knob), T7 (dual-direction live #2/#3 re-drain — the T6b verdict). T1–T4 + T6 are independent + parallelizable; T4 sequences after T3; T5 after T1–T4; T7 after T1–T6.

**Exit gate:** the spec's `## Exit gate` — real `/run-loop issues` drains #2 in both directions, defers #3, no lane crash, honest AFK/HITL/blocked summary, knob unit-proven (flag/env → config, flag-wins, unknown errors before side effects, egress still gates external review); tests green; tsc 0; no `any`; zero frozen-interface change.

**Estimate:** ~0.5–1 operator-day (5 code tasks + 1 wiring + 1 operator-gated dual-direction live run).
- Runner: worktree   # T5/T7 mutate live gh (env-gated) + need host creds; T1–T4 + T6 are sandcastle-able
```

**HITL-as-non-leaf check:** T7 (Runner: worktree / ready-for-human) is a DAG **leaf** (nothing depends on it) — no HITL-as-non-leaf warning. T5 (worktree / ready-for-human) gates only T7 (1 downstream) — under the ≥3 threshold, no warning.
