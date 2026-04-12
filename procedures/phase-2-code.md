# Phase 2 — Code

> Purpose: Build what the spec says, one sprint contract at a time, committing each working increment.
>
> Rule: You implement against the spec, not against your memory of the spec. If you're tempted to deviate, pause, update the spec explicitly, then continue — never silent drift.

## Entry gate (must be true to enter)

- [ ] Phase 1 (Architect) exit gate fully green
- [ ] `.harness-state/current_phase` = `Code`
- [ ] `docs/specs/YYYY-MM-DD-<topic>.md` exists and is approved
- [ ] `docs/plan.md` (or workstream plan) has phase-1 sprint contracts with Files / Depends-on / Verify filled in
- [ ] Dev environment runs cleanly (`bun run dev`, `npm run dev`, `python -m <app>`, whatever your stack uses)

## Required tools

| Tool | When | Why |
|---|---|---|
| `session-start` | Every session opening | Loads profile + plan + last exit note, sets today's goal |
| `micro` | Every work block (30-90 min) | Frames one goal + budget + commit |
| `park` | Whenever a side-quest surfaces | Prevents drift — log it, don't chase it |
| `session-end` | Every session closing | Writes exit note, triages parking lot, sets tomorrow's starter |
| `generator` agent | Web apps only, for sustained builds | Reads spec, builds in phases (data → structure → functionality → polish) |
| `code-reviewer` agent | After each phase-1 feature | Runs tests + typecheck + lint, scores against `criteria/` rubrics |

## Required artifacts (must exist to exit)

- [ ] All phase-1 sprint contracts marked complete in `docs/plan.md`
- [ ] For each completed task, the Verify condition actually runs green (not just "looks done")
- [ ] Typecheck passes: `bun run typecheck` / `tsc --noEmit` / equivalent
- [ ] Lint passes: project-defined lint command
- [ ] Tests exist for phase-1 features (not 100% coverage, but the happy path + 1 error case per feature minimum)
- [ ] Tests pass: `bun test` / `npm test` / equivalent
- [ ] `git log` shows incremental commits — if you ended up with one giant commit, something went wrong in the micro loop

## Exit gate (must be true to move to Test phase)

- [ ] Every phase-1 acceptance criterion from the spec is verified against the running code (read them, check them, don't assume)
- [ ] Code-reviewer agent has been run and scored each relevant `criteria/` rubric ≥ 6/10 on all dimensions
- [ ] No uncommitted changes (or a deliberate WIP commit exists)
- [ ] Parking lot items accumulated during Code phase are triaged — either resolved, promoted to phase-2, or explicitly deferred
- [ ] Write `.harness-state/current_phase` = `Test`

## Daily discipline

This is where drift lives. The protections:

1. **Every day opens with `session-start`** — no exceptions, even if you "just want to quickly fix one thing"
2. **Every work block is a `micro`** — one goal, one budget, one commit
3. **Every side-quest goes to `park`** — not into the current file, not into your head, into `parking_lot.md`
4. **Every day closes with `session-end`** — exit note + triage + tomorrow's starter
5. **The drift detector is ON** — if it fires, take it seriously; don't ignore past 2 signals

## Common pitfalls

1. **"Just one more thing"** — you finish the micro goal, notice an issue, dive in without framing a new micro. That's drift. Frame a new micro or park it.
2. **Not running Verify** — you "know it works." Verify is there for a reason. Run it.
3. **Silent spec drift** — you decide the spec was wrong and just build something else. Stop. Update the spec, re-read it, then continue. This creates a paper trail.
4. **Giant end-of-day commits** — means you didn't commit during micro-sessions. Next day, commit discipline goes in the micro rules.
5. **Skipping code-reviewer because "it's obvious it's fine"** — the adversarial review exists because you're biased toward your own work.
6. **Letting parking lot grow unchecked** — if it's over 5 items, triage happens at session-end, not "when I have time" (which is never).

## What this phase does NOT do

- End-to-end system verification (that's Test)
- Security audit (that's Test, via `procedures/api-security-checklist.md` where applicable)
- Deployment setup (Deploy)
- Performance benchmarking (Test)

## Transition to Test phase

When the exit gate is green:

1. Commit the final phase-1 state with a clear message
2. Write `.harness-state/current_phase` = `Test`
3. `session-end` with tomorrow's starter: "Run code-reviewer against full spec, kick off Test phase"
