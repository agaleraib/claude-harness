---
wave_number: 23
slug: run-loop-merge-to-head
spec_path: docs/specs/2026-06-16-run-loop-merge-to-head.md
merge_sha: 11733200f8d4af15536b8c0d0935d5582acb0324
closed_at: 2026-06-16T17:51:12Z
---

# Wave 23 — /run-loop adopt merge-to-head + HITL PR handoff + attention report

Replaces the loop's commit-in-place + synthetic `merged at <sha>` behavior (sandcastle's
least-isolated `head` strategy dressed up as a merge) with sandcastle's recommended
`merge-to-head`: per-item isolated temp branch off HEAD → gate → on GREEN host-side
`git merge` into HEAD + delete branch (no PR, no push, no human). The HITL minority
(conflict / red gate / reproduced review finding) gets its named branch pushed + a draft
PR opened, plus a persistent attention report. The mantra holds: auto-merge is the
default; a PR is **only** the exception handoff, never per-item.

Built on branch `wave-23-merge-to-head` (NOT merged to master — operator decides).

## §Shipped

| # | Commit | Task | Vertical | Description |
|---|--------|------|----------|-------------|
| 1 | `1768272` | — | docs | Spec (`2026-06-16-run-loop-merge-to-head.md`, F-022–F-029) + code-verified `sandcastle_mattpocock_architecture.md` (@ai-hero/sandcastle 0.9.0) + plan.md Wave 23 block |
| 2 | `72872da` | T1–T7 | loop | merge-to-head lifecycle on `ShellGitCommitter` (T1); `ProductionProtocol.runInner` merge-to-head + preserve-on-failure (T2); HITL handoff push + draft PR + no-remote fallback folded with escalate-on-conflict (T3); persistent attention report + driver pointer (T4); termination caps via a composing `WorkSource` wrapper (T5); real-git integration proof (T6); built-but-unwired module disposition + SKILL.md narrative (T7) |
| 3 | `a14974f` | T2/T3 (fix) | loop | Restore the integration branch + drop the empty temp branch on a throw-after-`createTempBranch` (found by the T8 live re-drain) + regression test |

(`6ee1d81`, the `OPENAI_API_KEY` codex env-strip, predates this wave and is already on master.)

## §Wave 23 Exit Gate Results

| Check | Result | Evidence |
|-------|--------|----------|
| `skills/_shared/loop/` tests green | **PASS** | `node --test` 240 pass / 0 fail (223 baseline + 17 new) |
| strict `tsc` 0 errors | **PASS** | `tsc --noEmit -p tsconfig.json` exit 0 (ephemeral typescript@5.7.2 + @types/node@22) |
| no `any` | **PASS** | `git diff` of changed source has no new `: any` / `as any` |
| zero frozen Phase-1 interface change | **PASS** | `git diff HEAD -- types.ts engine.ts` empty (0 lines); all additive in committer/protocol/composition/gh-seam layers |
| merge-to-head proven (real git) | **PASS** | T6 integration: GREEN drive advances HEAD + deletes the temp branch; RED drive preserves the branch + leaves HEAD unchanged + no-remote fallback writes copy-paste commands; conflict aborts + preserves (fake-committer) |
| HITL handoff (push + draft PR + fallback) | **PASS** (unit) | T3 tests: red-gate → push + draft PR + PR url in note + attention row; conflict → abort + `merge-conflict:` note; no-remote → fallback commands, no PR, no throw |
| termination caps honest | **PASS** | T5 tests: 25 items → stop at 20 (`iteration-cap`); 3 fails → `stall`; clean run → `drained` |
| live merge-to-head re-drain (T8) | **PASS (core), operator-gated** | See below |

### T8 live re-drain (quickbase-replacement #2/#3, throwaway branch `run-loop-t8-merge2head`)

Ran `node …/run-loop-entry.ts issues --yes` (codex implement + local-codex review, no
external key) on the Wave-23 branch, master untouched. Result:

- **#2 drained end-to-end via real merge-to-head:** `run-loop/issue-2` created off HEAD,
  codex implemented (8 files: distinct-values route + DB migration `0024i` + rollback +
  query lib + 2 test files + component/route edits), gate GREEN
  (`tests/typecheck/verify`), local-codex review 0 findings → **fast-forward `git merge`
  into the integration branch** (`HEAD = 4f3ed3f`, matches the run's reported merge SHA)
  → **temp branch deleted** (`git branch --list 'run-loop/*'` empty). NOT commit-in-place,
  NO synthetic note, NO push of HEAD, NO PR (happy path).
- **Attention report written:** `.harness-state/run-loop-2026-06-16-attention.md` —
  `1 items: 1 auto-merged ✓ · 0 need you ↓`. Run summary points at it.
- **#3 correctly refused at preflight** (sandcastle, no container lane).
- **Bug found + fixed:** #3 (refused at preflight but still pulled by the engine — the
  known Wave-22 "refused item still attempted" follow-up) threw at its sandcastle
  dispatch AFTER its temp branch was created, and the crash-isolation left the repo
  stranded on an empty `run-loop/issue-3`. Fixed in `a14974f` (restore branch + drop the
  empty temp branch on throw) + regression test. The stray empty branch was manually
  cleaned in the throwaway clone.

## §Human-only TODOs

- **T8 full live acceptance — capture in the runbook + a post-fix re-drain (optional).**
  The core T8 acceptance (real merge-to-head, branch delete, attention report) passed
  live above; the post-`a14974f` cleanup is unit-proven. An optional belt-and-suspenders
  re-drain on a fresh throwaway branch would re-confirm the #3 cleanup on real git. Needs
  live `gh` + codex sub auth (no `ANTHROPIC_API_KEY` for the local-review direction).
  Operator-gated (real repo run; a draft PR is opened on `quickbase-replacement` only if
  an item escalates).

## §Open Questions — answered, deferred, or unchanged

From the spec (`## Open questions`):
1. **Concurrency activation trigger** — unchanged/deferred; `MergeContract`/`run-lock`
   stay retired-until-concurrency (T7 status comments record this).
2. **Draft-PR body content** — minimal (item id + reason + branch) shipped in T3; enrich
   after a live HITL handoff. Unchanged.
3. **Temp-branch / stale-PR GC** — deferred; no auto-prune yet.
4. **Conflict realism in the serial case** — resolved: the guard is for mid-run external
   mutation / future concurrency; conflict path is unit-proven (fake committer). The
   real-git conflict case was not added (would require injecting an out-of-band HEAD
   advance mid-run); noted as a coverage gap, not a defect.
5. **Attention-report accumulation** — resolved: overwrite-per-run (the file is current
   state; `docs/waves/` is the history).

## §KB upsert suggestions

- `/run-loop` now uses sandcastle's **merge-to-head** (per-item `run-loop/<id>` branch →
  ff `git merge` into HEAD + delete on green; no PR on the happy path). Auto-merge is the
  default; a draft PR is opened ONLY for the HITL exception (conflict / red gate /
  reproduced review finding). The attention report lives at
  `.harness-state/run-loop-<date>-attention.md`.
- The `loop_merge_policy auto|pr` knob was never shipped — there is no per-repo "always
  PR" mode.
- **Operational:** the loop merges into the **currently-checked-out branch** of the
  target repo — run it from a throwaway/feature branch, never `main`.

## §Deviations from spec

- **T6 real-git conflict case not added** — the spec's T6 lists a conflict assertion in
  the integration test, but a real-git conflict requires an out-of-band HEAD advance
  mid-run that the test harness can't inject cleanly. The conflict path (abort + preserve
  + no-crash) is covered by the T3 fake-committer test instead. Net coverage is
  equivalent; flagged here for honesty (spec OQ-4).
- **One additional fix commit (`a14974f`)** beyond the 7 planned tasks — the
  throw-after-branch-create cleanup, discovered by the T8 live re-drain. Additive, no
  interface change.

## Baseline tests/tsc

- Tests: **223 → 240** (`node --test skills/_shared/loop/test/`), 0 fail.
- `tsc` errors: **0 → 0** (strict, ephemeral toolchain).
- Frozen Phase-1 interfaces (`types.ts` / `engine.ts`): **0 lines changed**.
