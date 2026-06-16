---
wave_number: 22
slug: run-loop-live-drain-fixes
spec_path: docs/specs/2026-06-15-run-loop-live-drain-fixes.md
merge_sha: cb8d098
closed_at: 2026-06-16
---

# Wave 22 — /run-loop issues live-drain fixes (T6b verdict)

Fixes the four integration bugs the first real multi-issue `/run-loop issues` run (Wave 21
T6b, 2026-06-15) surfaced, wires an env-gated terminal transition, adds a per-run
backend-direction knob, and stages the deferred dual-direction live acceptance as an
operator-gated runbook. All fixes are **additive** — the frozen Phase-1 interfaces
(`types.ts` / `engine.ts`) changed **0 lines** (Waves 18–22 streak intact).

Executed by the orchestrator in **dry-run mode** (`model_routing` absent from
`.harness-profile` ⇒ all tasks ran on the session model; would-be routing logged with the
`[dry-run]` prefix to `.harness-state/orchestrator.{log,jsonl}`).

## Status

- **Deterministic portion (T1–T6 + T5 unit wiring): COMPLETE and green in the worktree.**
- **Live portion (T7 dual-direction drain + T5 live gh verification): DEFERRED — operator-gated.**

## Commits (one per task)

| Task | Feature | Commit | Subject |
|------|---------|--------|---------|
| T1 | F-015 | `6978339` | enforce blocked-by readiness in the issues drive (Bug 1) |
| T2 | F-016 | `fe49dc0` | crash-isolate unsupported/throwing lanes (Bug 2) |
| T3 | F-017 | `4cb57e6` | commit edits regardless of exit code + surface stderr (Bug 3) |
| T4 | F-018 | `fb110b7` | honest implement-failed bucket (Bug 4) |
| T5 | F-019 | `c2d25f3` | env-gated terminal transition for the AFK-merged path (Bug 5) |
| T6 | F-020 | `6985130` | per-run backend-direction knob (`--implement`/`--review`) |
| T7 | F-021 | `0eed00b` | dual-direction live re-drain runbook (DEFERRED) |
| fix | — | `949290b` | exactOptionalPropertyTypes — narrow implementDefault (tsc gate) |

Worktree HEAD: `949290b`. Branch: `worktree-agent-a89bb97562f08e5df`.

## What shipped (per bug)

- **Bug 1 (T1).** `ReadinessGatedSource` wraps the issues-mode `WorkSource` in the
  composition layer (`buildIssuesProductionDeps`). It yields blockers before blocked items
  and **withholds** a blocked item until its blockers are done — `nextReady()` returns
  `null` (drained-for-now) when nothing is currently ready, and the now-done blocker
  unblocks dependents on the next call. The frozen engine's seen-guard is honored (each
  item yielded at most once). `engine.ts` untouched.
- **Bug 2 (T2).** `ProductionProtocol.run` is now a try/catch boundary delegating to
  `runInner`; any throw (e.g. `UnsupportedContainerRunner`) is caught, recorded
  `failed` with the reason in the note (prefixed `implement-failed:`), the runner is torn
  down best-effort, and the loop continues. `runBackendAwarePreflight` gained an additive
  `containerLaneWired` option; when `false` it **refuses** sandcastle items (surfaced in
  the preview) instead of clearing them to a mid-run crash. `buildProductionDeps` reports
  `containerLaneWired` (false unless a real `ContainerRunner` seam is injected), threaded
  through `DriverDeps` + both entry `drive()` calls.
- **Bug 3 (T3).** `runInner` probes the working tree after dispatch and commits the agent's
  edits **even on a non-zero exit** (the codex read-only-`.git` case), then proceeds to the
  gate — the gate is the real arbiter of quality. `failed` only when the agent failed AND
  no commits resulted, with the **truncated codex stderr** in the note. `ShellGitCommitter`
  gained an additive `dirty()` probe (the `diff` precedent); `GitCommitter` interface
  untouched.
- **Bug 4 (T4).** Additive `implementFailed` counter + `recordImplementFailed` on
  `RunSummaryBuilder`/`RunSummaryReport` (NOT a frozen Phase-1 interface). `buildReport`
  routes a `failed` `ItemResult` by the machine-readable note prefix the protocol sets —
  `implement-failed:` (no gate ran) vs `gate-failed:` (gate ran red) — without widening
  `ItemResult`. `buildSummaryLines` prints both buckets.
- **Bug 5 / scope (T5).** An optional `TerminalTransitionHook` on `ReadinessGatedSource`
  fires after a result is recorded. `buildTerminalTransitionHook` returns `undefined`
  unless `RUN_LOOP_TRANSITION_ISSUES=1`/`true`, so a default drive does **zero** GitHub
  mutation (local commits only). When enabled, a `completed` item runs `completeItem`
  (PR-link comment + close + terminal marker) and an `escalated` item `escalateItem`; the
  two-phase machine's existing markers make a re-drive idempotent. No `WorkSource` shape
  change.
- **Knob (T6).** `--implement <codex|claude>` / `--review <anthropic-api:opus-4.8|codex|openrouter:<model>>`
  parsed in `main()` (flag wins over env `RUN_LOOP_IMPLEMENT_BACKEND` /
  `RUN_LOOP_REVIEW_BACKEND`), validated **before any drive side effect** (implement via the
  new additive `validateImplementBackendId`, review via existing `parseReviewBackendId`).
  Unknown value ⇒ clean error + return (the drive never starts). `--help`/unknown-source
  still short-circuit first (knob not validated under `--help`). The resolved direction is
  threaded into `buildBackendConfigFromEnv` → `config.implementDefault`/`reviewDefault` and
  surfaced in the preview + `RUN_LOOP_USAGE`. `BackendConfig` shape unchanged. Egress
  unchanged + composes: `review=codex` local (no gate); external review still requires
  `RUN_LOOP_ALLOW_EXTERNAL_REVIEW=1`.

## Exit gate results

| Check | Result | Evidence |
|-------|--------|----------|
| `skills/_shared/loop/` tests green | **PASS** | 186 baseline → **212** pass / 0 fail (+26 regression/knob tests) |
| Strict `tsc` 0 errors | **PASS** | ephemeral `typescript@5.7.2 + @types/node@22`, `tsc --noEmit -p tsconfig.json` exit 0 |
| No `any` | **PASS** | grep over changed source files clean |
| Zero frozen Phase-1 interface change | **PASS** | `git diff c85c619..HEAD types.ts engine.ts` = **0 lines**; `BackendConfig` interface unchanged (only +15 additive lines = `validateImplementBackendId`); only additive `RunSummaryReport.implementFailed` field |
| Knob unit-proven | **PASS** | flag/env → `config.implementDefault`/`reviewDefault`; flag wins over env; unknown errors before any side effect; egress still gates `anthropic-api`/`openrouter`, not `codex` |
| Live dual-direction drain (A: codex→opus external; B: claude→codex local) | **DEFERRED** | operator-gated — see Human-only TODOs + runbook |

New tests added (26): `readiness-drive.test.ts` (4), `prod-deps.test.ts` (+13 across Bugs
2/3/4/5 + knob config), `run-loop-driver.test.ts` (+3: preflight refusal + summary
buckets), `implement-adapters.test.ts` (+1: `dirty()` probe), `termination.test.ts` (+2:
implement-failed bucket), `dispatch-backends.test.ts` (+2: knob validators),
`run-loop-entry.test.ts` (+4: knob validate-before-side-effect + `--help` precedence).

## Human-only TODOs (still open — operator-run; do NOT attempt from a session)

1. **T7 dual-direction live re-drain** (the T6b acceptance) against
   `agaleraib/quickbase-replacement` #2/#3 on a throwaway branch, BOTH directions. Procedure
   + captured-summaries template are in `skills/_shared/loop/test/live-test-runbook.md`
   (§"Wave 22 — dual-direction live re-drain"). Exact commands:
   - **Direction A:** `RUN_LOOP_ALLOW_EXTERNAL_REVIEW=1 node skills/_shared/loop/run-loop-entry.ts issues --implement codex --review anthropic-api:opus-4.8 --yes`
   - **Direction B:** `node skills/_shared/loop/run-loop-entry.ts issues --implement claude --review codex --yes`

   Needs live `gh` + backend auth (`~/.codex` OAuth, `ANTHROPIC_API_KEY` review-only,
   `OPENROUTER_API_KEY`) re-provided per run. Capture each printed summary into the runbook.
   Do NOT mutate quickbase-replacement from this worktree.
2. **T5 live gh verification** — the unit test (fake `GhClient`) is in-scope and green; the
   LIVE check that `RUN_LOOP_TRANSITION_ISSUES=1` relabels/closes a real issue is operator-run.
3. **Live agent/review credentials** — a session cannot provision `ANTHROPIC_API_KEY` /
   `OPENROUTER_API_KEY` / codex OAuth.

## Cross-repo flags

- **`agaleraib/quickbase-replacement`** is the external acceptance target for T7. It was
  **NOT** touched by this wave — no clone, no branch, no issue mutation from the worktree.
  Direction B is the FIRST live exercise of `ClaudeImplementAdapter` + `CodexReviewBackend`
  (both previously spike/unit-only) — surfaced as a capability risk in §Open Questions.

## Deviations + frozen-interface-risk escalations

- **No frozen-interface escalation.** No task required touching
  `WorkSource`/`Runner`/`PerItemProtocol`/`WorkItem`/`ItemResult`/`RunSummary`/`EngineDeps`
  in `types.ts` or `runLoop` in `engine.ts`. All fixes landed in the composition root, the
  driver, the entry, `dispatch/`, and the additive `RunSummaryReport` field, exactly as the
  spec's Frozen-interface risk section predicted.
- **Minor deviation (T5 file list).** The spec listed `post-merge.ts` (import + wire) and a
  `post-merge.test.ts` addition for T5. The transition wiring was placed where the results
  actually flow — `ReadinessGatedSource.recordResult` in the composition layer, with the
  unit test in `prod-deps.test.ts` against a real `IssueWorkSource`/`TerminalTransitions`
  over the `GhStub` (the most faithful coverage). `post-merge.ts` (the board-tick/receipt
  side) was left untouched — its concern (plan.md tick + §4.2 receipts) is orthogonal to
  the issue terminal transition this task wires, and touching it would have been
  non-surgical. The T5 Verify (env-on transitions+closes; env-off zero mutation;
  idempotent) is fully met.
- **One self-correction (no retry-rung needed).** The first tsc run flagged TS2375 on the
  T6 `buildBackendConfigFromEnv` knob (an unsafe `as BackendConfig['implementDefault']` cast
  re-admitting `undefined` under `exactOptionalPropertyTypes`). Fixed by narrowing against
  `IMPLEMENT_BACKENDS` (`949290b`). All per-task `Verify` steps passed on the first run; this
  was an exit-gate tsc finding, fixed in place — no escalation rung was triggered.

## Open Questions (carried from the spec)

- **OQ-3 (RESOLVED — implemented).** Readiness "done" = **(blocker recorded `completed` THIS
  run) OR (blocker's issue carries a terminal state, via `inner.isDone()`)** — the **union**.
  Implemented in `ReadinessGatedSource.blockerDone`. This satisfies T1's fixture and the
  real-gh path, and makes T7's single-drive behavior correct: with transitions default-off,
  #2 completes locally (recorded-this-run arm) and unblocks #3 in the SAME drive, while a
  blocker that was closed out-of-band (issue-terminal arm) also counts. A non-`completed`
  result (failed/skipped) does NOT unblock dependents.
- **OQ-1 (out of scope, unchanged).** PR creation + merge-to-main is still out of scope —
  T5 wires the issue *transition* (relabel/PR-link comment/close), not a `git push` / PR
  open / merge. A true AFK merge-to-main is a follow-up.
- **OQ-2 (deferred).** Readiness re-evaluation cost: the gate consults `inner.isDone()` per
  candidate; for `issues` mode that is a `gh` read. `IssueWorkSource.isDone` reads comments
  per call — fine for the #2/#3 scale; a per-run cache is the lever for >~10 ready issues.
- **OQ-4 (deferred).** Codex non-zero-exit signature classification (benign vs real) — left
  for the first multi-item live run's exit-code distribution (T7).
- **OQ-5 (deferred to T7).** Direction B (`claude`→`codex`) is unproven live; the knob +
  selectors stand regardless — a disappointing live result is a capability finding, not an
  architecture one.
