# Wave 5 — CLOSED

- **Closed:** 2026-04-28
- **Merge commit:** `ec3f49b` — Merge Wave 5 — planning-loop trim remediation (regressions fixed)
- **Reconcile commit:** `6594373` — docs(plan): close Wave 5 — planning-loop trim regressions remediated
- **Post-merge fixes:** none (no smoke-fix detours; Task 8 was a live smoke that passed end-to-end pre-merge)
- **Pushed to origin:** yes — `d52a46e..6594373` to origin/master (20 commits)
- **Deploy:** no deploy hook configured (claude-harness is methodology + skills, no live deploy target)
- **Summary doc:** `docs/2026-04-28-claude-harness-wave5-summary.md`
- **Source spec:** `docs/specs/2026-04-28-planning-loop-trim-remediation.md`
- **Run log (Task 8 smoke):** `.harness-state/planning-loop/2026-04-28-wave5-smoke-test-revise-114421.md`

## Wave 5 commit chain (master after merge)

```
6594373 docs(plan): close Wave 5 — planning-loop trim regressions remediated
ec3f49b Merge Wave 5 — planning-loop trim remediation (regressions fixed)  [--no-ff merge]
  9b8a089 docs(wave5): Task 8 PASS — live smoke validated auto-apply end-to-end
  a1dee7f docs(wave5): ship summary file for downstream merge/close tooling
  35bb31a fix(planning-loop): Wave 5 Task 9 — restore mv errno capture (Major #9)
  c1b9a6a docs(planning-loop): Wave 5 Task 7 — fix Phase C cross-ref + audit refs (Major #7)
  0128604 fix(planning-loop): Wave 5 Task 6 — restore Open-Questions bullet shape (Major #6)
  0ce2155 fix(planning-loop): Wave 5 Task 5 — restore contracted audit-entry shape (Blocker #5)
  3c7c391 fix(planning-loop): Wave 5 Task 4 — move log-writability check to Phase 1a (Blocker #4)
  4cbc670 fix(planning-loop): Wave 5 Task 3 — restore Phase 1b per-finding re-validation (Blocker #3)
  bd6fa0a fix(planning-loop): Wave 5 Task 2 — restore log-hash re-check (Blocker #2)
  2669add test(planning-loop): Wave 5 Task 1 — rewire fixtures to call real lib/ scripts
  8e49357 docs(plan): add Wave 5 + Wave 6 — planning-loop trim remediation
  754f2ae docs(specs): planning-loop trim remediation — 14 tasks, 2 waves [cherry-pick from a95a1cf]
  9532e70 refactor(planning-loop): Phase C — trim rationale parentheticals      [pre-existing trim]
  6eb89a6 refactor(planning-loop): Phase B — compress frontmatter description   [pre-existing trim]
  32efeca refactor(planning-loop): Phase A — extract bash to lib/ + collapse 6f prose [pre-existing trim]
  28417ac docs(planning-loop): resolve trim-plan open questions                  [pre-existing trim]
  6dec688 docs(planning-loop): trim plan — bash → lib/, compress description    [pre-existing trim]
```

## Exit gate results (verbatim from plan.md)

- ✓ All Wave 1 (spec-internal) fixture additions/changes (Tasks 1-6) pass against real `lib/` scripts — no inline copy. (15 originals A-O + 5 Wave-5 additions P/Q/R/S/T = 20/20.)
- ✓ `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` exits 0 — `Total: 20  Pass: 20  Fail: 0`.
- ✓ `grep -c 'auto-apply\.sh' skills/planning-loop/lib/test-fixtures/run-fixtures.sh` returns 11 (was 0 — fixture-bypass anti-pattern resolved).
- ✓ One live `/planning-loop --revise` run completed end-to-end (Task 8 post-dispatch); auto-apply path fired; spec mutated via atomic rename; rich audit entry written; Open-Questions bullet appended in restored shape.
- ✓ Branch diff shows only the regression-fix lines + rewired runner — no out-of-scope drift.

## Open items carried forward

1. **NEW BUG (parked) — `/planning-loop` log-writer ↔ parser format mismatch.** `auto-apply.sh:161` requires `F1:` prefix Codex never emits; 15 fixtures pre-stamp it, masking the gap. SKILL.md Step 6e Clause 2 says "auto-derive position-ordered IDs" — code diverges from contract. See `parking_lot.md` 2026-04-28 entry + memory `project_planning_loop_log_writer_parser_gap.md`. Recommended fix: parser regex change.

2. **Wave 6 — Skill-creator alignment** is queued in plan.md and unticked. 3 tasks: carve `references/rules.md` (~80 lines), carve `references/codex-prompts.md` (~120 lines), add `evals/{evals,trigger-eval}.json`. Spec-internal Wave 2 in `docs/specs/2026-04-28-planning-loop-trim-remediation.md`. Dispatch via `/run-wave 6` when ready.

3. **Remote feature branch cleanup** — `origin/claude/analyze-planning-loop-tokens-TO8ld` still exists. Local branch deleted; remote could be cleaned up via `git push origin --delete claude/analyze-planning-loop-tokens-TO8ld` or left until repo cleanup. Cosmetic only.

## Next wave opening

Wave 6 — Planning-loop trim — skill-creator alignment. **Why this wave:** Closes 2 skill-creator divergences flagged 2026-04-28: SKILL.md is 741 lines (skill-creator's ideal cap is 500); no `evals/evals.json` or trigger-eval scaffolding.
