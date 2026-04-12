# Methodology — claude-harness

> This is your operating manual for this project. Read it when you're lost. Update it when the process genuinely changes.
>
> **Project type:** tooling
> **Generated:** 2026-04-11
> **Source:** claude-harness (self — this repo IS the harness)

## The big picture

Every project moves through phases. You don't have to finish phase 1 completely before starting phase 2, but you do have to **enter each phase deliberately** — not by accident.

```
Architect → Code → Test → (Operate)
    ↓         ↓      ↓        ↑
  spec     build   verify   change cycles restart here
```

> Tooling repos (methodology, harnesses, distributed skills) don't deploy — they're consumed by other projects via `setup-harness`. The Deploy phase is replaced by "publish" (git push to origin) which needs no gate.

Each phase has an **entry gate**, **required artifacts**, and an **exit gate**. The gates are in `procedures/phase-N-<name>.md` — read them before entering a phase.

## The ritual hierarchy

Every piece of work lives inside a nested ritual:

```
PROJECT  (weeks-months)   → Architect → Code → Test
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

**Miss any of these and you will drift.** The drift detector hook is on (low sensitivity for this repo — methodology changes slowly). Take the signals seriously.

## Per-phase guide

### Phase 1 — Architect
**Purpose:** Understand what you're building and for whom. Write a spec an agent can execute against.

**Tools:**
- `project-init` (once, already done for this repo)
- `spec-planner` agent (writes `docs/specs/YYYY-MM-DD-<topic>.md`)
- `session-start`, `micro`, `park`, `session-end` (daily)

**Artifacts to create:**
- `docs/specs/YYYY-MM-DD-<topic>.md` — the spec for any new skill, procedure, or workflow change
- `docs/architecture.md` — one-page overview of how the harness fits together
- `docs/plan.md` — phase-1 task list for the current initiative

**Exit gate:** Read `procedures/phase-1-architect.md`.

### Phase 2 — Code
**Purpose:** Build what the spec says — for this repo, that means editing/adding skill files, agents, procedures, scripts.

**Tools:**
- Daily: `session-start` → `micro` → `park` → `session-end`
- `code-reviewer` agent after each significant change (even for markdown-heavy repos, it still catches inconsistencies)

**Artifacts to create:**
- New or modified skill files under `skills/<name>/SKILL.md`
- New or modified agent files under `.claude/agents/<name>.md`
- New or modified procedure checklists under `procedures/`
- New or modified scripts under `scripts/`
- Incremental commits (one per micro-session)

**Exit gate:** Read `procedures/phase-2-code.md`.

### Phase 3 — Test
**Purpose:** Verify the changes make sense end-to-end. For a tooling repo, "test" means:
1. The skill/agent files are syntactically valid (frontmatter parses, markdown renders)
2. The logic makes sense when read by a fresh agent
3. Running the skill mentally or in a throwaway project produces the intended result

**Tools:**
- `code-reviewer` agent — scores against `criteria/code-architecture.md`
- **Dogfooding:** install the modified harness in a throwaway project and walk the flow
- **Cross-read:** have another Claude instance read the new skill file and tell you what it thinks it does — if the answer doesn't match intent, the skill is unclear

**Artifacts to create:**
- Test notes in `docs/reports/` (optional)
- Fixes for anything surfaced

**Exit gate:** Read `procedures/phase-3-test.md`.

### After Phase 3: Publish

For tooling repos, "publishing" is just `git push`. There's no Deploy phase gate — the change lands in the repo and next time someone runs `cd ~/.claude/harness && git pull` they pick it up.

**One exception:** if a change is backwards-incompatible (renamed skill, removed agent, changed profile schema), write a one-liner in `docs/CHANGELOG.md` or commit message so consumers know what to update.

## Roadmap drift check

Every **30 days** (tooling projects change slowly), `session-start` will auto-trigger `pivot-check` if `docs/plan.md` hasn't been touched. For the harness repo, this catches drift between `docs/methodology.md` + actual skill files — e.g., the methodology claims a skill exists that you deleted, or vice versa.

You can also run `pivot-check` manually anytime.

## Key files in this project

| File | Purpose | Hand-edit? |
|---|---|---|
| `.harness-profile` | Project DNA — the harness is `tooling` type, drives its own drift hook | Yes, YAML |
| `.harness-state/` | Session state — today's goal, last exit note, drift counters | No, managed by skills |
| `parking_lot.md` | Side-quests logged during work, committed to git | Only via `park` skill |
| `docs/specs/` | Dated specs for new skills/agents/procedures | Yes, but carefully |
| `docs/architecture.md` | Single-page overview of the harness itself | Yes |
| `docs/plan.md` | Current initiative's task list | Yes |
| `docs/methodology.md` | THIS FILE — the operating manual | Yes, but rarely |
| `procedures/` | Phase checklists + cheatsheet (no phase-4 for tooling) | Yes, but consider upstream |
| `criteria/` | Scoring rubrics for code-reviewer | Yes |
| `skills/` | The distributable skills (Layer 1 + Layer 2) | Yes — this is the source of truth |
| `.claude/agents/` | The distributable agents | Yes |
| `scripts/drift-detector.sh` | The Stop hook script wired into all consuming projects | Yes, test carefully |

## Common situations

**"I want to start working but don't know where to begin."**
→ Run `session-start`. It will read yesterday's exit note and tell you exactly where to pick up.

**"I have an idea for a new skill."**
→ You're in Architect phase. Run `spec-planner` to turn the idea into a dated spec before writing the SKILL.md.

**"I'm deep in a refactor that wasn't planned."**
→ Stop. Either: (a) this is part of the current micro-session's goal, or (b) it's a side-quest — `park` it and return to the goal.

**"The methodology doesn't describe the code anymore."**
→ Run `pivot-check`. For this repo specifically, it reconciles `docs/methodology.md` against the actual skill/agent files.

**"I keep getting drift warnings and don't know what to do."**
→ Three options: commit WIP + start a fresh `micro` with a narrower goal, promote a parking-lot item, or `session-end` and come back tomorrow.

## Philosophy (short version)

- **Spec before code.** Vague intent = wasted work.
- **One goal at a time.** Micro-sessions enforce this.
- **Park don't chase.** Side-quests go to the parking lot.
- **Gates are real.** Don't cross without the exit checklist green.
- **Drift is the enemy.** Catch it early, at all three scales (micro, day, roadmap).
- **Commit often.** Every micro ends with a commit, even WIP.
- **Test adversarially** — especially for this repo, where a broken skill breaks every project that installs from it.
- **Dogfood.** Use the methodology on itself. If a ritual feels wrong here, it'll feel wrong everywhere else too.

## When to update this file

Only update `methodology.md` when your actual process changes — not every time you tweak a skill. This file is the story of how this project works, not a changelog.
