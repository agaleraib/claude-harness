# Methodology — {{PROJECT_NAME}}

> This is your operating manual for this project. Read it when you're lost. Update it when the process genuinely changes.
>
> **Project type:** {{PROJECT_TYPE}}
> **Generated:** {{DATE}}
> **Source:** claude-harness

## The big picture

Every project moves through 4 phases. You don't have to finish phase 1 completely before starting phase 2, but you do have to **enter each phase deliberately** — not by accident.

<!-- IF NOT tooling -->
```
Architect → Code → Test → Deploy → (Operate)
    ↓         ↓      ↓       ↓          ↑
  spec     build   verify  ship    feature cycles restart here
```
<!-- END IF NOT tooling -->

<!-- IF tooling -->
```
Architect → Code → Test → (Operate)
    ↓         ↓      ↓        ↑
  spec     build   verify   change cycles restart here
```

> Tooling repos (methodology, harnesses, distributed skills) don't deploy — they're consumed by other projects via `setup-harness`. The Deploy phase is replaced by "publish" (git push to origin) which needs no gate.
<!-- END IF tooling -->

Each phase has an **entry gate**, **required artifacts**, and an **exit gate**. The gates are in `procedures/phase-N-<name>.md` — read them before entering a phase.

## The ritual hierarchy

Every piece of work lives inside a nested ritual:

```
PROJECT  (weeks-months)   → Architect → Code → Test → Deploy
  └── PHASE  (days-weeks)
       └── DAY SESSION  (hours)
            └── MICRO-SESSION  (30-90 min, one goal, one commit)
```

You open and close each level deliberately. Skipping the open or close is how drift happens.

## Daily flow (read this first, every morning)

1. **Open the day:** run `session-start`. Don't skip this, even if you "just want to fix one thing." It loads your profile, your plan, yesterday's exit note, and your parking lot. Sets today's ONE goal.

2. **Frame a work block:** run `micro`. Every work block has **one goal**, **one budget** (time-boxed or done-boxed, you pick), and ends with **one commit**. No open-ended work.

3. **When something surfaces mid-block:** run `park "<what>"`. Side-quests go to `parking_lot.md`. You stay on the current goal. The parking lot is committed to git — drift history is visible in `git log`.

4. **When the block ends:** commit (even WIP), note what moved, start the next `micro` or take a break.

5. **Close the day:** run `session-end`. Five-minute exit ritual: state of play, parking lot triage, tomorrow's first move. Writes `last_exit.md` so tomorrow's `session-start` can read it back to you.

**Miss any of these and you will drift.** The drift detector hook is on — it will tell you when a micro-session has run too long without a commit, or when the parking lot is growing faster than you're resolving. Take the signals seriously.

## Per-phase guide

### Phase 1 — Architect
**Purpose:** Understand what you're building and for whom. Write a spec an agent can execute against.

**Tools:**
- `project-init` (once, if `.harness-profile` is missing)
- `spec-planner` agent (writes `docs/specs/YYYY-MM-DD-<topic>.md`)
- `session-start`, `micro`, `park`, `session-end` (daily)

**Artifacts to create:**
- `docs/specs/YYYY-MM-DD-<topic>.md` — the spec
- `docs/architecture.md` — one-page overview of how the system fits together {{ARCH_REQUIRED_NOTE}}
- `docs/plan.md` — phase 1 task list from the spec's sprint contracts

**Exit gate:** Read `procedures/phase-1-architect.md`.

### Phase 2 — Code
**Purpose:** Build what the spec says, one sprint contract at a time.

**Tools:**
- Daily: `session-start` → `micro` → `park` → `session-end`
- `code-reviewer` agent after each phase-1 feature
<!-- IF webapp OR fullstack -->
- `generator` agent (optional) for sustained builds — reads the spec, builds in phases
<!-- END webapp OR fullstack -->

**Artifacts to create:**
- Working code matching the spec's phase 1
- Tests for happy path + error cases
- Incremental commits (one per micro-session)

**Exit gate:** Read `procedures/phase-2-code.md`.

### Phase 3 — Test
**Purpose:** Verify the code against the spec, criteria, and real usage. Adversarially.

**Tools:**
- `code-reviewer` agent (scores all applicable `criteria/` rubrics)
<!-- IF webapp OR fullstack -->
- `ui-evaluator` agent (Playwright-driven adversarial UI test)
- `a11y-check` skill (axe-core audit of key screens)
<!-- END webapp OR fullstack -->
<!-- IF backend OR webapp OR fullstack -->
- `api-smoke-test` skill (end-to-end curl/jq flow against live URL)
<!-- END backend OR webapp OR fullstack -->
- `procedures/api-security-checklist.md` (if `audience.data_sensitivity ≠ none`)
- `migration-check` skill (if DB schema changed)

**Artifacts to create:**
- Test reports under `docs/reports/`
- Bug fixes (with regression tests added)

**Exit gate:** Read `procedures/phase-3-test.md`.

<!-- IF NOT tooling -->
### Phase 4 — Deploy
**Purpose:** Get the app in front of real users safely.

**Tools:**
- `deploy-check` skill (env vars, secrets, rollback plan, smoke test, monitoring)
- `api-smoke-test` skill (run against live URL after deploy)
- `migration-check` skill (if production DB schema change)

**Artifacts to create:**
- `docs/deployment.md` or `docs/runbook.md` with rollback plan
- `scripts/smoke.sh` (smoke test that runs against any `BASE_URL`)
- `README.md` updated with deploy instructions + live URL
- Error tracking + uptime check configured

**Exit gate:** Read `procedures/phase-4-deploy.md`.
<!-- END IF NOT tooling -->

## Roadmap drift check

Every 14 days, `session-start` will auto-trigger `pivot-check` if `docs/plan.md` hasn't been touched. This catches roadmap-scale drift — when the project direction changed but the plan/spec/architecture didn't catch up.

You can also run `pivot-check` manually anytime you feel like the docs don't match reality.

## Key files in this project

| File | Purpose | Hand-edit? |
|---|---|---|
| `.harness-profile` | Project DNA — audience, stakes, quality bar, stack | Yes, YAML |
| `.harness-state/` | Session state — today's goal, last exit note, drift counters | No, managed by skills |
| `parking_lot.md` | Side-quests logged during work, committed to git | Only via `park` skill |
| `docs/specs/` | Dated specs from spec-planner | Yes, but carefully |
| `docs/architecture.md` | Single-page system overview | Yes |
| `docs/plan.md` | Current phase task list | Yes |
| `procedures/` | Phase checklists + security checklist | Yes, but consider upstream |
| `criteria/` | Scoring rubrics for code-reviewer and ui-evaluator | Yes |

## Common situations

**"I want to start working but don't know where to begin."**
→ Run `session-start`. It will read yesterday's exit note and tell you exactly where to pick up.

**"I have an idea but nothing written down."**
→ You're in Architect phase. Run `spec-planner` to turn the idea into a dated spec.

**"I'm deep in a refactor that wasn't planned."**
→ Stop. Either: (a) this is part of the current micro-session's goal, or (b) it's a side-quest — `park` it and return to the goal.

**"I want to deploy but I'm not sure if I'm ready."**
→ Run `deploy-check`. It validates env, secrets, rollback, smoke test, monitoring. Blocks hard-fails.

**"The plan doesn't describe what I'm actually building anymore."**
→ Run `pivot-check`. It routes you to "refresh docs" or "archive plan + re-plan" based on scale.

**"I keep getting drift warnings and don't know what to do."**
→ Three options: commit WIP + start a fresh `micro` with a narrower goal, promote a parking-lot item, or `session-end` and come back tomorrow with a clearer head.

## Philosophy (short version)

- **Spec before code.** Vague intent = wasted work.
- **One goal at a time.** Micro-sessions enforce this.
- **Park don't chase.** Side-quests go to the parking lot.
- **Gates are real.** Don't cross without the exit checklist green.
- **Drift is the enemy.** Catch it early, at all three scales (micro, day, roadmap).
- **Commit often.** Every micro ends with a commit, even WIP.
- **Test adversarially.** The goal of Test is to find problems, not confirm.
- **Rollback or it didn't ship.** No deploy without a way back.

## When to update this file

Only update `methodology.md` when your actual process changes — not every time you tweak a skill. This file is the story of how this project works, not a changelog.
