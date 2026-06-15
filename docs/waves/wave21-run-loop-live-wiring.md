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
| `skills/_shared/loop/` tests stay green (134 + new) | **PASS** | `node --test test/*.test.ts` → 179 tests, 179 pass, 0 fail (134 baseline + 45 new: T1 14, T2 7, T3 8, T4 5, T5 10, T6 1) |
| strict `tsc` 0 errors | **PASS** | `tsc --noEmit -p tsconfig.json` (typescript 5.7.2 + @types/node 22 via temp prefix) → exit 0, 0 errors |
| no `any` | **PASS** | grep for bare `any` across new source (`dispatch/`, `verify-gate.ts`, `run-loop-driver.ts`) → none |
| no frozen Phase-1 interface change (additive only) | **PASS** | `git diff 55c782b..HEAD -- types.ts engine.ts` → 0 changed lines; all existing protocol/gh/runner/termination/guardrail files untouched; `run-loop-entry.ts` +31 (new `runEntry` export only, no existing export modified) |
| real end-to-end drain (Codex implement + Opus review + verify-gate), emits AFK/HITL/blocked summary | **PASS (T6a clean-room live)** | Run on **2026-06-15** with operator-provided review keys. **REAL `codex exec -s workspace-write`** implemented one item (`slugify.js`) against a throwaway repo; the **runner committed** (agent left `.git` read-only — commit `b68289c` authored by the repo's git user, NOT codex; base `e4bd3d8`). The exit gate ran real tests+typecheck+verify → green. **REAL `anthropic-api:opus-4.8`** reviewed the actual diff and returned 3 structured findings (1 MEDIUM, 2 LOW). The verify-gate attempted all 3 as reproductions against the gate; **none reproduced → all advisory, fixer-calls=0, escalate=false, issues-filed=0 (no raw review assertion acted on)**. Green gate + no escalation ⇒ AFK merge. Run summary: `merged-afk: 1 / opened-awaiting-human: 0 / deferred-blocked: 0 / escalated: 0 / gate-failed: 0 / stop-reason: drained`. No red merge; no Codex sandbox escape (only the requested file created). Evidence below. |

**T6(a) live-run verbatim evidence (2026-06-15, real Codex + real Opus-4.8):**
- throwaway repo base commit: `e4bd3d8` · implement+merge commit (runner-authored): `b68289c` ("feat: slugify (clean-room live smoke)", `slugify.js` only, +9 lines)
- preview line: `clean-room-1: runner=worktree implement=codex review=anthropic-api:opus-4.8`
- review backend actually invoked: `anthropic-api` (model `claude-opus-4-8`, 3 findings)
- verify-gate trace: `triaged=3 reproduce-attempts=3 fixer-calls=0 advisory=3 escalate=false issues-filed=0`
- run summary: `merged-afk: 1 · opened-awaiting-human: 0 · deferred-blocked: 0 · stop-reason: drained · visited(1): clean-room-1`

The live run assembled the **real production graph** from the Wave 21 modules (`defaultSpawn` → `CodexImplementAdapter`; `ShellGitCommitter`; `runExitGate`; a `fetch`-backed `HttpClient` → `AnthropicReviewBackend`; `dispatchReview`; `runVerifyGate`; the driver's `buildPreview`/`buildSummaryLines` + `RunSummaryBuilder`) — i.e. the same path `/run-loop issues --yes` is intended to drive once a production composition root is wired into the skill body. Keys were sourced into `process.env` only; no key value was printed, logged, or committed.

**Still open (separate from the T6a PASS above):** the live drain via the **`/run-loop` skill itself** still needs a production composition root in the skill body that assembles these real adapters into `drive()` (Wave 21 built + tested the pieces and the driver against injected deps; it did not add the skill-level wiring that builds the real graph). The T6a harness proves the graph runs live; wiring it behind the skill is a follow-up. And **T6(b)** (quickbase-replacement cross-repo) remains operator-gated.

## DEFERRED items (live-credential / Docker / cross-repo dependent)

- **T6(a) clean-room live drain** — ✅ **DONE 2026-06-15** (real `codex exec` + real
  `anthropic-api:opus-4.8`); see the exit-gate evidence above. Wiring the same real graph
  behind the `/run-loop` skill body (a production composition root) is the remaining
  follow-up — the harness proved the graph; the skill-level assembly is not yet built.
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
