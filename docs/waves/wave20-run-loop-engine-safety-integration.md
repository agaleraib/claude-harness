---
wave_number: 20
slug: run-loop-engine-safety-integration
spec_path: docs/specs/2026-06-14-run-loop-engine.md
merge_sha: 8c605fe
closed_at: 2026-06-14
---

# Wave 20 — /run-loop engine: safety guardrails + harness integration + entry point + docs

Final wave (Phases 5–7) of the `/run-loop` engine feature. Builds host safety guardrails
(T10/T11/T11a), harness integration (T12–T15), the `/run-loop` entry point + real `gh`
adapter (T16), tool-neutral docs (T17), and a deterministic stubbed-seam e2e harness (T18).
Built on the frozen Phase-1 interfaces from Waves 18/19 (merged). All frozen interfaces in
`skills/_shared/loop/types.ts` are **untouched** — additive-only honored (see §Deviations).

## §Shipped

| # | Commit | Task | Vertical | Description |
|---|--------|------|----------|-------------|
| 1 | `f458144` | T10 | Phase 5 safety | Catastrophic-command denylist matcher (PreToolUse backstop): universal + repo tier, command canonicalization, fail-closed on parse ambiguity, allowlist-leaning posture, weak-posture detection |
| 2 | `484789b` | T11 | Phase 5 safety | Worktree write-root confinement (lexical resolution catching `..` escapes) + OS write-guard seam + loop-start guardrail preflight (refuse-without-hook, pre-run snapshot, write-root posture) |
| 3 | `4dc91ed` | T11a | Phase 5 safety | Secret-bearing worktree in-run containment — controls (A) default-deny egress, (B) per-item pre-execution approval, (C) task-scoped credential injection; all host seams stubbable |
| 4 | `31eb906` | T12 | Phase 6 integration | Shared AFK/HITL 4-gate classifier (`skills/_shared/classifier/`), runner-aware; loop pickup-time reconciliation re-labels diverging issues + logs why |
| 5 | `7a825e6` | T13 | Phase 6 integration | Post-merge effects implementing the frozen `DownstreamEffects` seam: plan.md tick + §4.2 receipts, keyed by merge SHA, driven/repaired by outbox reconciliation |
| 6 | `a7cd64c` | T14 | Phase 6 integration | `/park --issue` promote + `/triage-parking` batch-promoter (Step 4b); both route labels through the T12 classifier (prose protocol) |
| 7 | `703b800` | T15 | Phase 6 integration | `/spec-planner` per-wave/task `Runner:` line via the T12 classifier + HITL-as-non-leaf lint (prose protocol) |
| 8 | `7938c55` | T16 | Phase 7 entry | `/run-loop` skill (`waves`/`issues`, `--help` short-circuit) + real `GhCliAdapter` implementing `getIssue` + `listByLabelAllStates` via an injected `CommandRunner` seam |
| 9 | `254de9d` | T17 | Phase 7 docs | AGENTS.md `## Loop protocol` tool-neutral section + CLAUDE.md invocation notes |
| 10 | `78fbc49` | T18 | Phase 7 e2e | Deterministic stubbed-seam e2e issue-loop harness (scaffolding only) |

Worktree branch: `worktree-agent-ae905846f736e3873`. `merge_sha`/`closed_at` left empty
for `/close-wave`.

## §Wave 20 Exit Gate Results

**As-run worktree gate — ALL GREEN.**

| Gate item | Result | Evidence |
|---|---|---|
| `node --test test/*.test.ts` all green (existing 79 + new) | ✅ PASS | 134 tests, 134 pass, 0 fail |
| Strict `tsc` 0 errors | ✅ PASS | `tsc --noEmit -p tsconfig.json` exit 0 (typescript@latest + @types/node, `--typeRoots`) |
| No `any` | ✅ PASS | grep over all new source + test files: no `: any` / `as any` / `<any>` |

Per-task Verify outcomes (each satisfied via its tests):

- **T10** ✅ — `test/denylist.test.ts` (13 tests): rm -rf outside-worktree blocked; force-push master blocked; in-worktree edit allowed; repo `loop_denylist` entry blocked; bypass cases (aliased/absolute `/bin/rm`, quote-obfuscated `r''m`, script-file fail-closed, `../../` path variant) all block; allowlist posture blocks non-allowlisted command; weak-posture flagged.
- **T11** ✅ — `test/write-root.test.ts` (10 tests): non-shell Write to `/tmp/x` denied; `../` escape denied; in-worktree + `.harness-state/` allowed; shell redirect caught by hook layer; OS-guard → os-level posture, no-guard → advisory; hook-absent refuses worktree item while sandcastle runs; pre-run snapshot ref created.
- **T11a** ✅ — `test/egress.test.ts` (9 tests): no allowlist ⇒ only loopback, git remote denied; allowlisted host reachable + non-allowlisted fails same run; git-remote-allowlisted residual note; `egress-unenforceable` when no mechanism; `awaiting-pre-approval` (creds never resolved) → dispatch with token; only declared secrets injected (undeclared `.env.local` key absent); malformed allowlist ⇒ `egress-config-invalid`.
- **T12** ✅ — `test/classifier.test.ts` (6 tests): same task AFK under worktree, HITL under sandcastle; each of the 4 gates independently forces HITL; pre-labeled `ready-for-agent` tripping gate (1) re-labeled `ready-for-human` + logged; agreeing label is a no-op.
- **T13** ✅ — `test/post-merge.test.ts` (4 tests): AFK merge ticks+ships row + per-item receipt; re-run idempotent; run-summary receipt written once; merged-but-unticked outbox record repaired on reconcile, idempotently.
- **T14** ✅ — prose protocol in `skills/park/SKILL.md` + `skills/triage-parking/SKILL.md`: `/park --issue` documented to create one labeled issue + NOT append to parking_lot.md; plain `/park` appends locally + no issue; `/triage-parking` Step 4b batch-promotes `[promote]`-marked items routing labels through the classifier. (gh side effects are human/live-session only; not run in CI per spec NOTE.)
- **T15** ✅ — prose protocol in `.claude/agents/spec-planner.md`: per-wave/task `Runner:` line via the classifier; HITL-as-non-leaf lint warning when a worktree/HITL wave gates ≥3 downstream waves.
- **T16** ✅ — `test/run-loop-entry.test.ts` (10 tests): `--help`/`-h`/`help` short-circuit (even with a source present); `waves`/`issues` select the source; unknown source errors with the valid set; missing source errors; `GhCliAdapter.getIssue` argv + label/state parsing + null-on-absent; `listByLabelAllStates` `--state all --label`; `createIssue` URL→number parse.
- **T17** ✅ — AGENTS.md has `## Loop protocol`; tool-neutral (no Claude/Anthropic/PreToolUse/`.claude/` terms in the section body); the 5-question portability answers all live on disk (plan.md / tracker / docs/waves / receipts / WORKFLOW.md). Verified via grep.
- **T18** ✅ — `test/e2e-issue-loop.test.ts` (3 tests): #2 merges via the mechanical gate, #3 defers until #2 MERGED then becomes a ready AFK candidate, run summary emits AFK-merged=2/awaiting-human=0/deferred-blocked=1; negative control asserts catastrophic commands ARE blocked (so "no denylist violation" is a real guarantee); a RED final gate on the merge commit prevents the merge (board untouched, no receipt).

**Hard gate — "denylist hook + egress enforcement installed before the first unattended
worktree run"**: satisfied at the **code level** (T10/T11/T11a refuse-without-guardrails
logic + tests). The actual global hook install + external `.harness-profile` seed +
live run are Human-only TODOs (below), NOT a worktree gate, per the spec.

## §Human-only TODOs

These were explicitly out of scope for the worktree dispatch (touch the operator's global
config / an external repo / live `gh`). Surfaced verbatim for the operator:

1. **Install the T10 denylist PreToolUse hook globally** in `~/.claude/settings.json`. The
   matcher logic ships from `skills/_shared/loop/safety/denylist.ts` (and the write-root
   path delegation from `safety/write-root.ts`); wiring it as a `PreToolUse` hook that
   shells out to this matcher is an operator action outside this repo. Until installed,
   `/run-loop` refuses worktree items (sandcastle items still drain).
2. **Seed `quickbase-replacement`'s `.harness-profile`** with `loop_denylist:` entries
   (`supabase db reset` et al.), plus optionally `loop_allowlist:` (to leave weak-posture)
   and `worktree_egress_allowlist:` for any secret-bearing worktree item. Cross-repo write
   to an external repo.
3. **Run the T18 live e2e test** — `/run-loop issues` against `quickbase-replacement`
   issues #2/#3 with live `gh` — and capture the AFK-merged / HITL-waiting /
   blocked-on-human run summary as the workability verdict. Requires TODOs 1 and 2 first.
   This is the real verdict on whether risk-proportional scheduling (Option C) works live;
   the in-CI T18 harness is the deterministic proxy, not a substitute.

## §Open Questions — answered, deferred, or unchanged

- **`RunSummary.stopReason` widen-vs-return-alongside (constraint #3) — ANSWERED: return
  `RunSummaryReport` alongside; do NOT widen the frozen type.** The frozen
  `RunSummary.stopReason` stays `StopReason = 'drained'`, untouched. Rationale: widening the
  `StopReason` *union* alone would be type-additive, but the loop's real output needs the
  richer metric *fields* (`mergedAfk` / `openedAwaitingHuman` / `deferredBlockedOnHuman` /
  `escalated` / `gateFailed` / `deepestBlockedSubtree`) that the frozen `RunSummary`
  interface does not carry — adding those fields would mutate the frozen interface shape and
  break additive-only. Wave 19's T9 already built the richer `RunSummaryReport` +
  `RunStopReason` for exactly this; the T16 entry point surfaces `RunSummaryReport`
  alongside the frozen `RunSummary`, keeping every Phase-1 interface byte-for-byte intact.
  Documented in `skills/_shared/loop/run-loop-entry.ts` header.
- **OQ6 (git remote in egress allowlist) — unchanged / honored.** The git remote is NOT
  auto-allowed for secret-bearing worktree items; it is reachable only when explicitly
  listed in `worktree_egress_allowlist:`, and the residual risk is surfaced as
  `git-remote-allowlisted` in the run summary (T11a control A).
- **OQ8 (git-remote egress phase-split: network-isolated agent + post-agent push) —
  DEFERRED.** T11a implements the allowlist-or-refuse posture and surfaces the residual
  risk; the preferred network-isolated-then-push split is left as a future enhancement (the
  egress seam is structured to allow it — a separate post-agent push phase would establish
  no-remote egress during the agent run, then push outside the restricted context). Not
  implemented this wave; no interface blocks it.
- **OQ1–5, 7 — unchanged** by this wave (addressed in Waves 18/19 or not in Phase 5–7 scope).

## §KB upsert suggestions

The loop touches the hooks/MCP/infra surface — facts worth upserting to memory:

- **Node native type-stripping forbids TS parameter properties.** `node --test *.ts` under
  Node 25 strip-only mode throws `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` on
  `constructor(private readonly x: T)`. Use explicit field declarations + assignment in the
  constructor body. (Hit twice this wave in test stubs.) The whole `skills/_shared/loop/`
  module already follows this; new contributors will trip on it.
- **tsc verification recipe for the zero-dep loop module.** There is no vendored tsc. Verify
  via a temp env: `npm i --no-save typescript@latest @types/node@latest` in a scratch dir,
  then `tsc --noEmit -p skills/_shared/loop/tsconfig.json --typeRoots <scratch>/node_modules/@types`.
  `npx -p typescript -p @types/node tsc` does NOT expose `@types/node` to the `types`
  resolution — the `--typeRoots` flag is required.
- **A second ESM TS module under `skills/_shared/` needs its own `package.json` with
  `"type": "module"`.** The new `skills/_shared/classifier/` tripped TS1287 (CommonJS +
  `verbatimModuleSyntax`) until a `package.json` with `"type": "module"` was added — same
  pattern as `skills/_shared/loop/package.json`.
- **The denylist hook is a backstop, not a boundary** (Phase 5 threat model). Worktree runs
  the agent in the host environment; the OS is not the security boundary. Honest
  residual-risk surfacing (`weak-posture`, `advisory-write-root`, `git-remote-allowlisted`,
  `egress-unenforceable`) in the run summary is a requirement, not optional.

## §Deviations from spec

- **No frozen-interface changes.** Every Phase-1 frozen interface in
  `skills/_shared/loop/types.ts` (`WorkSource`/`Runner`/`PerItemProtocol`/`RunnerFactory`/
  `WorkItem`/`ItemResult`/`RunSummary`) is **byte-for-byte untouched**. The
  `RunSummary.stopReason` question was resolved by returning `RunSummaryReport` alongside
  (see §Open Questions), explicitly to avoid mutating the frozen type. No breaking change
  was needed; nothing to flag.
- **Stale `Files:` path for T15 — corrected.** The spec's T15 `Files:` line named
  `skills/spec-planner/SKILL.md`. No such file exists; `/spec-planner` is a **subagent**
  defined at `.claude/agents/spec-planner.md`. Edited the real file. Flagged in the T15
  commit message and here.
- **T10/T11/T11a module placement.** Safety code lives under a new
  `skills/_shared/loop/safety/` subdir (`denylist.ts`, `write-root.ts`, `egress.ts`,
  `guardrails.ts`) rather than spread across `runners.ts`/`engine.ts`, matching the
  module's existing one-subdir-per-concern convention (`merge/`, `scheduler/`, `protocol/`,
  `providers/`). The spec's `Files:` lines named `runners.ts`/`engine.ts`; the seam-based
  split is functionally equivalent and additive (no existing file's exports changed).
- **T12 module placement.** The shared classifier lives at `skills/_shared/classifier/`
  (pure, zero loop deps, independently shareable by `/spec-planner`); the loop-side
  reconciliation wiring is `skills/_shared/loop/classifier-reconcile.ts`. The spec said
  "New module under `skills/_shared/`" — satisfied; the pure/wiring split keeps the
  classifier free of loop internals.
- **T18 is scaffolding-only by design** (explicit spec SCOPE LIMIT). The in-CI harness
  exercises the full path against stubbed seams; the live run + global-hook install +
  external `.harness-profile` write are Human-only TODOs, not a worktree gate.
- **No stale line numbers** otherwise encountered.

## Baseline metric

| Metric | Before (Wave 19 merged) | After (Wave 20) | Δ |
|---|---|---|---|
| `skills/_shared/loop/` test count | 79 | 134 | +55 |
| `node --test` pass / fail | 79 / 0 | 134 / 0 | +55 / 0 |
| strict `tsc` errors | 0 | 0 | 0 |
| `any` occurrences (new files) | — | 0 | 0 |

New Wave-20 tests by file: denylist 13, write-root 10, egress 9, classifier 6,
post-merge 4, run-loop-entry 10, e2e-issue-loop 3 = **55 test cases** across 7 files
(13+10+9+6+4+10+3 = 55, matching the +55 suite delta exactly).
