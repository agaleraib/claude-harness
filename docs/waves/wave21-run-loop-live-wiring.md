---
wave_number: 21
slug: run-loop-live-wiring
spec_path: docs/specs/2026-06-14-run-loop-live-wiring.md
merge_sha: null
closed_at: null
---

# Wave 21 — /run-loop live wiring (pluggable backends + cross-model review)

Waves 18–20 built the `/run-loop` engine, protocol, scheduler, and safety logic behind
injected seams with only test stubs. Wave 21 wires the **hands**: concrete pluggable
backend adapters + a live driver. The engine stayed FROZEN — all changes are additive
implementations behind the existing seams; `types.ts` and `engine.ts` are byte-for-byte
untouched.

**Mode note:** dispatched via the orchestrator in **dry-run** mode (`model_routing`
absent from `.harness-profile`), so all tasks executed on the current session model
(Opus 4.8). Surface-A routing previews were logged with `[dry-run]`; Surface-B JSONL
lines were written `status: skipped` for the routing decision and `status: success` per
task on verify pass. Logs: `.harness-state/orchestrator.{log,jsonl}` (gitignored).

## Commits per task

| Task | Commit | Summary |
|---|---|---|
| T1 — backend abstraction | `85e0f8f` | `dispatch/backends.ts` (Implement+Review backend ids, two registries, `loadBackendConfig`) + `dispatch/spawn.ts` (`spawnIgnoringStdin`, `stripClaudeMarkers`, injected `SpawnFn`) |
| T2 — implement adapters | `63f38fe` | `dispatch/implement.ts` — Codex (default) + Claude adapters, both lanes; agent-edits/runner-commits (`runImplementWithCommit` + `ShellGitCommitter`) |
| T3 — review backends | `40dccab` | `dispatch/review.ts` — Anthropic-API (opus-4.8 default) + OpenRouter + Codex reviewers; `dispatchReview` egress-policy downgrade-to-local |
| T4 — verify-gate | `541f0d9` | `protocol/verify-gate.ts` — reproduce-before-act, bounded fix, idempotent finding filing |
| T5 — live driver | `301ab06` | `run-loop-driver.ts` + `runEntry` — backend-aware preflight, preview, `--yes`, summary alongside frozen `RunSummary` |
| T6 — smoke + runbook | `c8559d6` | `test/smoke-clean-room.test.ts` (hermetic full-stack smoke) + `test/live-test-runbook.md` |

All six commits land on branch `worktree-agent-a13c00e285dbc906c` (HEAD `c8559d6`). Not
merged — the human decides whether to merge.

## Exit-gate results

| Check | Result | Evidence |
|---|---|---|
| `skills/_shared/loop/` tests stay green (134 + new) | **PASS** | `node --test test/*.test.ts` → **186 tests, 186 pass, 0 fail** (134 baseline + 52 new: T1 14, T2 7, T3 8, T4 5, T5 10, T6 1, + composition-root 7) |
| strict `tsc` 0 errors | **PASS** | `tsc --noEmit -p tsconfig.json` (typescript 5.7.2 + @types/node 22 via temp prefix) → exit 0, 0 errors |
| no `any` | **PASS** | grep for bare `any` across new source (`dispatch/`, `verify-gate.ts`, `run-loop-driver.ts`, `run-loop-prod-deps.ts`, `run-loop-entry.ts`) → none |
| no frozen Phase-1 interface change (additive only) | **PASS** | `git diff 55c782b..HEAD -- types.ts engine.ts` → 0 changed lines; all existing frozen protocol/gh/runner/termination/guardrail files untouched. The composition root (`run-loop-prod-deps.ts`) is NEW; `run-loop-entry.ts` is additive (+96, new `runProduction`/`main`/CLI shim only); `implement.ts` adds one additive `ShellGitCommitter.diff()` method (the `GitCommitter` interface is unchanged). |
| real `/run-loop issues` drain via the ACTUAL entry command (Codex implement + Opus-4.8 review + verify-gate), emits AFK/HITL/blocked summary | **PASS (live, actual entry command)** | A **production composition root** (`run-loop-prod-deps.ts` — `buildProductionDeps`/`buildIssuesProductionDeps`/`buildLocalCleanRoomDeps`) now assembles the real graph behind the frozen `EngineDeps`, and the entry **executable** (`run-loop-entry.ts`, runnable via `import.meta.main`) drives it. On **2026-06-15** the drain ran through the literal command `node skills/_shared/loop/run-loop-entry.ts issues --yes --repo <dir> --item-file <item.json>` (clean-room local path) against a throwaway repo with one ready item: **REAL `codex exec`** implemented `kebab.js`, the **runner committed** (agent left `.git` read-only — commit `5fd6c96` authored by the repo git user, NOT codex; base `ec86c17`), the exit gate ran real `node -e`/`node --check`/`test -f` → green, **REAL `anthropic-api:opus-4.8`** reviewed the diff (`backend=anthropic-api:opus-4.8`, 0 findings on a clean impl — Opus endpoint independently confirmed HTTP 200, model `claude-opus-4-8`), the verify-gate acted on nothing, and the green gate ⇒ AFK merge. No red merge; no Codex sandbox escape (only the requested file created). Evidence below. |

**Live-run verbatim evidence (2026-06-15, ACTUAL entry command — real Codex + real Opus-4.8):**
- entry command: `node skills/_shared/loop/run-loop-entry.ts issues --yes --repo <dir> --item-file <item.json>` (with `RUN_LOOP_ALLOW_EXTERNAL_REVIEW=1` to opt the clean-room into the external Opus reviewer)
- preview line: `clean-room-1: runner=worktree implement=codex review=anthropic-api:opus-4.8`
- throwaway repo base commit: `ec86c17` · implement+merge commit (runner-authored): `5fd6c96` ("feat: clean-room-1 (/run-loop)", `kebab.js` + the seeded `item.json`)
- trace: `implement: codex ok; runner produced 1 commit(s): 5fd6c96…` · `gate: green=true checks={"tests":true,"typecheck":true,"verify":true}` · `review: backend=anthropic-api:opus-4.8 findings=0` · `verify-gate: triaged=0 advisory=0 escalate=false` · `merge: AFK-merged clean-room-1 at 5fd6c96…`
- run summary: `merged-afk: 1 · opened-awaiting-human: 0 · deferred-blocked: 0 · escalated: 0 · gate-failed: 0 · stop-reason: drained · visited(1): clean-room-1`

This drain ran through committed production code (the composition root + entry executable) — **not** a `/tmp` harness. The earlier 2026-06-15 T6(a) run (via a /tmp harness, commits `e4bd3d8`/`b68289c`, slugify, 3 Opus findings) is superseded by this actual-entry-command run; both are genuine. Keys were sourced into `process.env` only; no key value was printed, logged, or committed.

**Egress note:** external review (Opus/OpenRouter) is default-deny per the data-egress policy — the diff stays local and review downgrades to the local Codex reviewer unless a repo opts in via `.harness-profile` or the explicit env gate `RUN_LOOP_ALLOW_EXTERNAL_REVIEW=1`. The first clean-room drain (without the gate) correctly downgraded to `backend=codex`; the gated re-run used real Opus-4.8.

## DEFERRED items (live-credential / Docker / cross-repo dependent)

- **T6(a) clean-room live drain** — ✅ **DONE 2026-06-15** via the **actual entry command**
  (`node skills/_shared/loop/run-loop-entry.ts issues --yes …`) driving the committed
  production composition root (`run-loop-prod-deps.ts`) — real `codex exec` + real
  `anthropic-api:opus-4.8`; see the exit-gate evidence above. The composition-root
  follow-up is **closed** (the real graph is now committed and reachable from the entry
  executable, not just a /tmp harness).
- **T2 container-lane auth sub-clause** — "a container run authenticates on the mounted
  token and produces a commit visible on the host" needs Docker (up) + the Codex OAuth
  token mounted into the container image. The `ContainerRunner` seam is in place and
  unit-asserted; the live container run is an operator step.
- **T6(b) quickbase-replacement #2/#3 cross-repo live test** — separate repo; needs live
  `gh` creds there, a seeded `.harness-profile`, live backend auth. Operator-run; NOT
  attempted from this worktree.

## Human-only TODOs still open (surfaced, not attempted)

1. **Live agent/review credentials** — `ANTHROPIC_API_KEY` (review-only),
   `OPENROUTER_API_KEY`, ChatGPT OAuth (`~/.codex`, present). The code reads these from
   env / `.harness-profile`; a session cannot provision them. **Provided by the operator
   on 2026-06-15 for the T6(a) live run** (Anthropic + OpenRouter keys, sourced from a
   local `.env` into `process.env` only — never logged or committed; Anthropic returned
   200 on `claude-opus-4-8`). The standing requirement persists: any FUTURE live run
   (e.g. a `/run-loop issues` drain or T6b) must re-provide these in the environment;
   they are not stored in the repo.
2. **T6(b) quickbase-replacement live cross-repo test** — operator-run; preconditions in
   the runbook.
3. **Docker daemon** — up in this environment, but the sandcastle-lane container image +
   mount wiring is an operator step. Docker-absent ⇒ sandcastle items abort cleanly
   (proven: T2 reuses `preflightRunners`).
4. **Global denylist hook install** — the Claude-backend worktree confinement relies on
   the Wave-20 `PreToolUse` denylist hook + `RUN_LOOP_ENFORCE=1` in the operator's global
   `~/.claude/settings.json`. The driver's backend-aware preflight REFUSES a Claude
   worktree item when the hook is absent (and does NOT refuse a Codex item — its native
   sandbox is the boundary). Installing the hook is an operator action.

## Deviations from spec (and why)

- **T3/T4 built additively atop pre-existing protocol files.** `protocol/gate.ts`,
  `protocol/review.ts`, `protocol/findings-filer.ts`, and `safety/guardrails.ts` already
  existed from Waves 19–20. T4's verify-gate is a NEW module (`protocol/verify-gate.ts`)
  that consumes the existing `GateRunner`/`runExitGate` rather than rewriting them, and
  files findings idempotently via a stable marker (the pre-existing `fileLeftoverFindings`
  was non-idempotent; the verify-gate path needed idempotency, so a separate idempotent
  filer was added rather than mutating the frozen one). No frozen signature changed.
- **`RunSummaryReport` returned alongside the frozen `RunSummary`** (not by widening it) —
  this follows the Wave-19/20 carry-forward decision documented in `run-loop-entry.ts`,
  honoring the "no frozen Phase-1 interface change" exit-gate clause.
- **Live drain DEFERRED rather than run** — the spec explicitly instructs satisfying the
  deterministic portion via stubs/fakes and marking the live drain DEFERRED when
  credentials are absent; `ANTHROPIC_API_KEY` is absent.

## Cross-repo flags

- No incoming symlinks: no `skills/<x>` is itself a symlink (the documented bug case) —
  clean. All Wave 21 files are regular in-repo files; none is a symlink reaching outside
  the repo. `skills/` ships OUT to `~/.claude/skills/` by convention (expected; outgoing).
- quickbase-replacement (T6b target) was NOT touched.

## Worktree + branch

- Worktree: `/Users/agalera/workspace/claude-harness/.claude/worktrees/agent-a13c00e285dbc906c`
- Branch: `worktree-agent-a13c00e285dbc906c`
- HEAD: `c8559d6`
- Base (pre-wave): `55c782b`
