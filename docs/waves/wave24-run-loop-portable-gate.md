---
wave_number: 24
slug: run-loop-portable-gate
spec_path: docs/specs/2026-06-16-run-loop-portable-gate.md
merge_sha: TBD
closed_at: TBD
---

# Wave 24 — /run-loop portable exit gate (repo-resolved + fail-safe)

Makes the `/run-loop` exit gate **repo-resolved** (the target repo declares its checks in a
`.harness-profile` `gate:` block) and **fail-safe** (no resolvable gate ⇒ refuse the run / red
the item — never merge blind). Fixes the motivating defect: the live `ShellGateRunner` ran zero
commands and returned green, so the loop merged blind and the verify-gate could never reproduce a
finding. Scope: Tasks 1–6 (AFK/worktree). Task 7 (live re-validation) is HUMAN-ONLY — see §Human-only TODOs.

## §Shipped

| # | Commit | Task | Vertical | Description |
|---|--------|------|----------|-------------|
| 1 | `8feb7e0` | T1 (F-030) | `run-loop-prod-deps.ts` | `RepoGateConfig` type + `buildGateConfigFromEnv(env)` (argv-JSON vs `*_SHELL`, Decision 7); threaded into `ShellGateRunner` ctor + the `gate:` factory; exposed on `ProductionDeps`; wired into the issues builder. 14 tests. |
| 2 | `e9b172b` | T2 (F-031) | `run-loop-prod-deps.ts` | Fail-safe three-way rule (Decision 3) via `runFailSafeGate`: no gate ⇒ `gate-unconfigured`; configError ⇒ `gate-config-error`; partial ⇒ absent sub-check passes. Verify-gate reproducer uses the same fail-safe gate (heal). 6 tests. |
| 3 | `d643f34` | T3 (F-032) | `run-loop-driver.ts` + `run-loop-entry.ts` | Preflight refuses a run with no resolvable gate (refuse-before-work) + the one-line fix; threaded `prod.gateConfig` → driver → both `drive()` call sites; item-gate items exempt. 8 tests. |
| 4 | `bbaf7c5` | T4 (F-033) | `dispatch/implement.ts` + `run-loop-prod-deps.ts` | `mergeToHead` → `git merge --ff-only`; non-FF escalation skips `abortMerge`; `abortMerge` defensively guarded (probe `MERGE_HEAD`); net-new `discardWorktreeChanges` (`reset --hard` + `clean -fd`, NO `-x`) wraps every gate execution. 12 tests (incl. 3 real-git gate-leak regressions); 2 committer-argv tests updated. |
| 5 | `8ea7dfd` | T5 (F-034) | `test/verify-gate-heal.test.ts` | Regression proving the verify-gate heals: a reddening finding reproduces (→ escalation); a non-reddening finding stays advisory; guard + control. Test-only. 4 tests. |
| 6 | `0241946` | T6 (F-035) | `skills/run-loop/SKILL.md` + `AGENTS.md` | Documents the `gate:` block, both encoding forms, the mix-is-an-error rule, the fail-safe contract, the `--ff-only` merge guard, and the new-repo on-ramp checklist. Doc-only. |

Branch: `worktree-agent-a2653b50edc2d8649` (worktree `/Users/agalera/workspace/claude-harness/.claude/worktrees/agent-a2653b50edc2d8649`). Not merged — the human decides.

## §Wave 24 Exit Gate Results

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | Full test suite green; report before/after | **PASS** | 240 (Wave 23 close) → **279** (`node --test skills/_shared/loop/test/*.test.ts` → tests 279, pass 279, fail 0). +39 new (14 gate-config T1, 6 T2, 8 T3, 7 net T4 [12 new − incl. updates], 4 T5). |
| 2 | Strict tsc 0 errors | **PASS** | `tsc --noEmit -p skills/_shared/loop/tsconfig.json` → exit 0, 0 errors (run via a temp `typescript@5.7.2` + `@types/node@22` install with `--typeRoots`; the repo ships no toolchain — see §Deviations). |
| 3 | No `any` | **PASS** | `git diff 1f70ba3 -- skills/_shared/loop/` shows no `: any` / `<any>` / `as any` in production code; the two `any`-substring hits are the English word "any" in test strings. |
| 4 | Zero frozen-interface change | **PASS** | `git diff --stat 1f70ba3 -- types.ts engine.ts` → empty (0 lines changed). Fail-safe surface is structural (`FailSafeGateRunner`); `discardWorktreeChanges` is structural on `ShellGitCommitterLike`. |
| 5 | Fail-safe three-way rule holds (T2/T3) | **PASS** | no-gate ⇒ preflight-refuse (T3 `drive REFUSES…`) + per-item RED (T2 `NO gate configured ⇒ gate-unconfigured`); partial ⇒ sub-check passes (T1 `empty JSON array … partial gate`, T2 `tests-only … merges`); configError ⇒ RED/refuse (T2 `configError ⇒ gate-config-error`, T3 `configError ⇒ refused`). |
| 6 | Verify-gate heals (T5) | **PASS** | T5 reddening finding reproduces → escalation; non-reddening stays advisory; control (empty config) refused/red before the reproduce path (review never runs). All 4 T5 tests green. |
| 7 | Docs deliverable present (T6) | **PASS** | grep confirms in `SKILL.md`: `gate:` block, both forms (`RUN_LOOP_GATE_TESTS` + `_SHELL`), mix-is-an-error, fail-safe contract, `ff-only`/`fast-forward`, the new-repo checklist (`### Adopt /run-loop on a new repo`); `AGENTS.md` loop note states repo-resolved + fail-safe + fast-forward-only. |

DEFERRED: none of gates 1–7. T7 (live re-validation) is out of scope (human-only) — not a gate check.

## §Human-only TODOs

**T7 (F-036) — Live re-validation on quickbase-replacement WITH a gate configured.** Runner: worktree / HITL (ready-for-human). Gates: unobtainable-credential (live `gh` + codex + Anthropic creds on the host), out-of-band-action (real repo run + live merge/draft-PR). DAG leaf. Depends on: Task 3, Task 4, Task 6.

Operator-gated live proof: configure a `gate:` block in `quickbase-replacement/.harness-profile`; then prove:
1. the gate actually runs on a green item before merging;
2. a red change is NOT merged (escalated/draft-PR, HEAD untouched, worktree clean);
3. an unconfigured repo is refused at preflight with the fix line;
4. the verify-gate is live (≥1 Opus finding reproduces-and-drives-a-fix or is correctly logged advisory);
5. the merge resolves as a fast-forward (best-effort divergence check: advance HEAD externally and confirm `--ff-only` escalates with a `non-fast-forward` note, no crash).

Record outcomes + real merge SHA + refusal preview + FF trace line + attention report in the wave receipt + runbook. Not attempted by this dispatch (needs live credentials + a real repo run).

## §Open Questions

OQ resolution per the spec ("ALL DESIGN DECISIONS ARE LOCKED — operator-confirmed via /grill-me 2026-06-16"):

- **OQ1 + OQ5 → resolved into Decisions** (Decision 2 gate-is-repo-resolved; Decision 7 gate command encoding). Implemented verbatim across T1 (`8feb7e0`) + T2 (`e9b172b`). No open question remains.
- **OQ2/OQ3/OQ4 → accepted/deferred** per the locked plan. No pre-implementation decision surfaced during the build that required reopening any of them.
- **Unchanged:** the `merge/merge-contract.ts` + `merge/run-lock.ts` RETIRED-until-concurrency disposition (Wave 23) — Wave 24 deliberately does NOT wire them; the serial `--ff-only` merge needs no run-lock/CAS. (T2 + T4 commit notes.)

No NEW open questions raised by the implementation.

## §KB upsert suggestions

None. No task touched cron, MCP, schema, infra, or a data-flow boundary. The work is contained to the `/run-loop` composition/driver layer (`run-loop-prod-deps.ts`, `run-loop-driver.ts`, `dispatch/implement.ts`, `run-loop-entry.ts`), its tests, and two docs (`SKILL.md`, `AGENTS.md`). The new `RUN_LOOP_GATE_*` env surface is documented in SKILL.md (the canonical reference) — no separate KB entry needed.

## §Deviations from spec

1. **tsc invocation.** The spec's literal command `npx -y -p typescript@5.7.2 -p @types/node@22 tsc --noEmit -p …` failed in this environment with `TS2688: Cannot find type definition file for 'node'` — npx's transient package layout was not on tsc's `typeRoots`. Resolved equivalently by installing `typescript@5.7.2` + `@types/node@22` into a temp dir and running `tsc … --typeRoots <tmp>/node_modules/@types`. Same compiler, same version, same strict tsconfig, **exit 0**. No change to `tsconfig.json`.
2. **The "merge conflict" existing test renamed to "non-fast-forward".** Under `--ff-only` (Mechanism A) a `!merge.ok` is always a non-fast-forward, never a started 3-way merge — so the existing `T3: a merge conflict aborts…` test (which asserted `abortMerge` IS called + a `merge-conflict:` note) was updated to `T4: a non-fast-forward merge escalates… does NOT abort` (asserts zero `abortMerge`, `non-fast-forward:` note). This is the intended contract flip the spec calls for; the attention-row reason stays `merge-conflict` (the existing `AttentionRow` enum was not widened — a frozen-surface-minimizing choice).
3. **Two committer-argv tests updated (implement-adapters.test.ts).** `mergeToHead` now issues `merge --ff-only <branch>` and `abortMerge` now probes `MERGE_HEAD` before aborting; the two argv-assertion tests were updated to the new argv. Behavioral, intended.
4. **Stale line numbers.** The spec's cited line numbers (`:222-224`, `:266`, `:383`, `:411`, `:430-438`, `:255-262`, etc.) were treated as approximate anchors; the actual edits landed at the corresponding logical sites in the worktree copies (the file had drifted since the spec was written). All sites named in the spec were addressed.
5. **Mechanism B wrap location.** The spec says wrap EVERY `runExitGate` invocation (`:383` AND `:411`) in `try/finally`. Both invocations route through the single `runFailSafeGate` helper, so the `try/finally` + `discardWorktreeChanges` lives there once — one chokepoint covering both the per-item gate and the verify-gate reproducer. Net effect is identical to two separate wraps; expressed more narrowly.
6. **No `.harness-profile` `gate:` block added to THIS repo.** T6 is doc-only (SKILL.md + AGENTS.md) per the spec's Files list. Seeding a target repo's `.harness-profile` `gate:` block is a human-only / per-repo action (mirrors the existing `loop_denylist:`/`loop_allowlist:` human-only TODOs).

**Cross-repo flags:** none. `skills/run-loop/SKILL.md` and `AGENTS.md` are regular files in this repo (the skills symlink is OUTBOUND from `~/.claude/skills/`, not inbound); no edited file is a symlink reaching outside the repo.

## Baseline tsc/test counts (before → after)

- **tsc:** 0 → 0 errors (strict, `skills/_shared/loop/tsconfig.json`).
- **tests:** 240 (Wave 23 close baseline) → **279** (+39: 14 T1 `gate-config.test.ts`, 6 T2 + 12 T4 + the relabeled non-FF test in `prod-deps.test.ts`, 8 T3 in `run-loop-driver.test.ts`, 4 T5 in `verify-gate-heal.test.ts`; 2 existing committer-argv tests in `implement-adapters.test.ts` updated in place, not added).
- **Frozen Phase-1 interfaces:** `types.ts` 0 lines changed, `engine.ts` 0 lines changed, `runLoop` unchanged.
