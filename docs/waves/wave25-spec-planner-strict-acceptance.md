---
wave_number: 25
slug: spec-planner-strict-acceptance
spec_path: docs/specs/2026-07-02-spec-planner-strict-acceptance.md
merge_sha: cdb80bb
closed_at: 2026-07-06
---

# Wave 25 — spec-planner strict acceptance-criteria discipline

Adds a third enforced discipline to `spec-planner` (acceptance-criteria strictness),
grounded in ONE shared deterministic scanner so there is a single definition of
"strict". Two enforcement layers: a spec-planner self-check (WARN, fail-open) + a
`<P>/<T> strict` summary-line field (Phase 1, F-037/F-038), and a scanner-wired
Codex reviewer criterion in `/planning-loop` (Phase 2, F-039). No mechanical abort.

- **Worktree:** `/Users/agalera/workspace/claude-harness/.claude/worktrees/agent-aa70af605fe0863fa`
- **Branch:** `worktree-agent-aa70af605fe0863fa`
- **Base commit:** `921dc3e`
- **Orchestrator mode:** DRY-RUN (`model_routing` key absent from `.harness-profile`) → all 6 tasks executed on the session model (Opus 4.8 1M); no subagent dispatch. Surface B logged `status: skipped`; Surface A recorded would-be routing. Audit trail: `.harness-state/orchestrator.log` + `.harness-state/orchestrator.jsonl` (gitignored by `.harness-state/*`).

## Shipped

| Commit | Task | Summary |
|--------|------|---------|
| `8cc779d` | infra | Import the untracked source spec into the worktree verbatim (identical SHA-256) so Task 3 Verify + the dogfood + the exit-gate git-clean check resolve. No spec content change. |
| `4664518` | Task 3 (F-039 core) | Shared scanner `skills/planning-loop/lib/acceptance-strictness.sh` implementing grammar clauses (a) SCOPE / (b) closed judgment lexicon / (c) mechanisms M1–M4 / (d) binding, pinned to `LC_ALL=C grep -E`. Output `strict=<P> total=<T>` + `sub-strict:` lines; exit always 0. `chmod +x`. |
| `430fd8b` | Task 1 + Task 2 (F-037/F-038) | `.claude/agents/spec-planner.md`: MANDATORY "Acceptance-criteria strictness self-check" subsection mirroring the scanner grammar in prose (WARN, never blocks) + Rule 15; and the `Acceptance criteria: <P>/<T> strict` final-summary-line field sourced from the scanner (with the `0/0` zero-bullet case). |
| `385d593` | Task 4 (F-039 Codex layer) | `codex-prompts.md`: `> **Acceptance-criteria strictness:**` reviewer criterion block (the awk extraction anchor) instructing Codex to return `needs-attention` on injected `sub-strict:` diagnostics. |
| `0d83280` | Task 5 (F-039 verification) | Eight `strict-*.md` fixtures + `acceptance-strictness-fixtures.sh` sub-runner (trailing `pass=N fail=M`) proving the grammar behaviorally; folding sub-block wired into `run-fixtures.sh` (`AS_RC` gates the suite exit). `chmod +x`. |
| `d8a84f7` | Task 6 (F-039 Codex wiring) | Two-subcommand FOLD helper `acceptance-review-focus.sh` (`--emit-focus` / `--emit-log`, composes the scanner internally) + SKILL.md Step 5b caller-guarded wiring + one codex-prompts sentence + `strict-review-focus-sample.md` + review-focus sub-block in `run-fixtures.sh` (`RF_RC` gates the suite exit). `chmod +x`. |

Per-task Verify results (all PASS): T1 `grep -c 'Acceptance-criteria strictness self-check'`=2 (≥1) AND `grep -Ec '^15\. '`=1 (==1); T2 summary-field grep=2 (≥1); T3 first line `strict=22 total=22` matches `^strict=[0-9]+ total=[0-9]+$`, exit 0; T4 awk block carries `sub-strict`+`needs-attention` (Portability excluded); T5 `run-fixtures.sh` exit 0 with acceptance-strictness 8/8; T6 both fold subcommands carry the exact sub-strict line (grep -F), SKILL.md greps 1/1/1, review-focus sub-block 4/4.

## Wave 25 Exit Gate Results

| # | Gate item | Result | Evidence |
|---|-----------|--------|----------|
| 1 | All 6 task Verify blocks pass | ✅ PASS | T1–T6 all PASS (per-task table above; re-run clean at gate time). |
| 2 | `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` exits 0 with the acceptance-strictness + review-focus sub-blocks PASS; no pre-existing sub-block regressed | ✅ PASS | Exit 0. Combined **71/71**: auto-apply 33/33, emit-receipt 14/14, wave2 12/12 (all unchanged) + acceptance-strictness **8/8** + acceptance-review-focus **4/4**. |
| 3 | The spec's F-037/F-038/F-039 acceptance criteria hold | ✅ PASS (21/22 literal; 22/22 substantive) | F-037 6/6, F-038 3/3, F-039 12/13 literal. The one non-match is **F-039.1's literal Verify regex only** — `^strict=([0-9]+) total=\1$` uses an ERE backreference that this machine's `grep` (**ugrep 7.5.0**) rejects; GNU grep accepts it. The substantive criterion (all-clean **P==T, zero sub-strict**) holds: scanner prints `strict=3 total=3`, and Task 5's fixture asserts the exact string `strict=3 total=3` (backreference-free). See §Deviations #5. |
| 4 | Dogfood: scanner reports every acceptance bullet strict (zero `sub-strict:`) | ✅ PASS | `bash skills/planning-loop/lib/acceptance-strictness.sh docs/specs/2026-07-02-spec-planner-strict-acceptance.md` → `strict=22 total=22`, 0 `sub-strict:` lines, exit 0. |
| 5 | `git status` clean after all commits; the two new `.sh` helpers are `chmod +x` | ✅ PASS | `git status --porcelain` empty. `acceptance-strictness.sh` and `acceptance-review-focus.sh` both `-rwxr-xr-x`. |

## Human-only TODOs

**None.** Every task in this wave was a pure code/markdown edit (per the dispatch note). The only outstanding human action is the wave-level merge decision (see below) — that is a `/close-wave` responsibility, not a task TODO.

- The worktree branch `worktree-agent-aa70af605fe0863fa` is ready for review/merge. `docs/plan.md` state on master is intentionally untouched — the human decides whether to merge, then `/close-wave 25` ticks the board.

## Open Questions

- **OQ1 (spec) — DEFERRED.** "Should the closed judgment lexicon (b) be sourced from a shared file so `criteria/` rubrics and this scanner stay in sync, rather than inlined in `acceptance-strictness.sh`?" This wave inlines the lexicon in the scanner (single source of truth for the grammar), exactly as the spec designed; the spec itself flags OQ1 as "can defer to a follow-up". No drift observed in this wave. Status: **open, deferred to a follow-up** — no code decision was forced here.
- **OQ2 (spec) — out of scope for this wave.** "Should the Codex reviewer criterion be gated behind a `.harness-profile` opt-in for projects that deliberately allow prose criteria?" Not addressed; relevant "before wide `setup-harness` distribution". Status: **open.**

## KB upsert suggestions

1. **ugrep-vs-GNU-grep portability in Verify commands.** This machine's `grep` is ugrep 7.5.0, which rejects ERE backreferences (`\1`) that GNU grep accepts as an extension. Harness Verify commands / acceptance-criterion checks should avoid ERE backreferences — prefer an exact-string fixture (as Task 5 does) or a numeric parse for equality checks like `P == T`. Candidate for a portability note in the spec-authoring / acceptance-criteria guidance.
2. **"One deterministic definition, mirrored + wired" pattern.** The strict-acceptance grammar lives once in `acceptance-strictness.sh`; spec-planner mirrors it in prose; `/planning-loop` injects its `sub-strict:` output verbatim through a fixture-proven FOLD helper. Reusable shape for any "semantic judgment we want one canonical, testable definition of".
3. **Orchestrator dry-run precedent.** With `model_routing` absent from `.harness-profile`, the orchestrator built a full 6-task wave on a single model while still recording would-be routing (Surface A) and `status: skipped` (Surface B). Confirms dry-run is a usable guided-executor lane; worth noting as the default when a repo hasn't opted into routing.

## Deviations from spec

1. **Preliminary infra commit (`8cc779d`).** The source spec was untracked in the main working tree and therefore absent from the worktree. It was copied in verbatim (byte-identical SHA-256 `9e50aed…`) and committed so Task 3's Verify, the dogfood, and the exit-gate git-clean check resolve. This is *not* a spec-content change ("do not modify the spec" honored) — it only brings the unchanged artifact under version control in the worktree.
2. **Task 1 + Task 2 combined into one commit (`430fd8b`).** Both edit the same file (`.claude/agents/spec-planner.md`) and T2 depends on T1. Each task's Verify was checked independently and both pass; the commit message attributes both. All other tasks are separate per-task commits.
3. **SKILL.md Step 5b uses the full installed path in the helper calls, not the `$HELPER` shorthand.** The spec's illustrative snippet (source-spec lines 119–125) writes `bash "$HELPER" --emit-focus …`, but F-039's binding acceptance criterion (line 143) and the Constraints (line 149) require the literal `"$HOME/.claude/skills/planning-loop/lib/acceptance-review-focus.sh" --emit-focus` / `--emit-log` to be greppable. Resolved the internal tension in favor of the binding grep: kept the `HELPER=…` assignment + `if [[ -x "$HELPER" ]]` guard (fail-open) AND wrote the full path in both calls. All three greps pass; semantics are identical (`HELPER` == that path).
4. **Per-task commits are plain explicit-stage `git commit`s, not the full `/commit` skill.** Dry-run mode has no subagent lane for `/commit`'s code-reviewer, and the dispatch operating rules forbid editing `docs/plan.md` state (which `/commit` would attempt). Files were staged explicitly (never `git add -A`/`.`), matching the repo convention; the wave's Verify + fixture suite provide the correctness gate.
5. **F-039.1 literal Verify regex incompatible with this host's `grep` (ugrep).** `^strict=([0-9]+) total=\1$` relies on a backreference that ugrep 7.5.0 rejects. This is an environment/portability observation about the acceptance-criterion's own Verify *command*, **not** a scanner bug or a spec-content defect: the dogfood is clean (0 sub-strict), the scanner uses no backreferences and passes 100% under ugrep, and the substantive P==T requirement is proven by Task 5's exact-string fixture. Flagged (not silently "fixed" per the dogfood note). See KB #1.
6. **Orchestrator ran in DRY-RUN mode.** `.harness-profile` has no `model_routing` key, so per the orchestrator contract all tasks executed on the session model (Opus 4.8 1M) with no subagent spawning; the routing table in the run is advisory. Surface A/B logs written accordingly.

## Baseline (fixture pass/fail before/after)

| Sub-block | Before wave (master `921dc3e`) | After wave (this worktree) |
|-----------|-------------------------------|----------------------------|
| Auto-apply | 33 pass / 0 fail | 33 pass / 0 fail (unchanged) |
| emit-receipt mechanical | 14 pass / 0 fail | 14 pass / 0 fail (unchanged) |
| Wave 2 (/archive-plan + /harness-status) | 12 pass / 0 fail | 12 pass / 0 fail (unchanged) |
| **acceptance-strictness (new)** | — (did not exist) | **8 pass / 0 fail** |
| **acceptance-review-focus (new)** | — (did not exist) | **4 pass / 0 fail** |
| **Combined total** | **59 pass / 0 fail** | **71 pass / 0 fail** |

`run-fixtures.sh` exit code: 0 before, 0 after. Net delta: **+12 assertions** (8 scanner + 4 fold), zero regressions. Master's `run-fixtures.sh` contains 0 `AS_RC`/`RF_RC`/new-sub-block markers (confirmed via `git show 921dc3e:…`), so the before-total of 59 is the sum of the three unchanged sub-blocks.
