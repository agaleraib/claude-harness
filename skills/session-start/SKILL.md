---
name: session-start
description: Open a coding day. Reads .harness-profile, current plan, parking lot, last exit note; sets today's primary goal. Run at the start of every session before any work.
---

# Session Start

Open a new coding session with full context. This is the **first thing you do** each day (or each time you sit down to work). It prevents starting sessions blind and drifting within minutes.

## Step 1: Read the profile

```bash
cat .harness-profile 2>/dev/null
```

If no `.harness-profile` exists, stop and tell the user:

> No `.harness-profile` found. Run `project-init` first — I need to know what kind of project this is before starting a session.

Parse the YAML and extract:
- `project.name`, `project.type`, `project.description`
- `stakes.level`
- `audience.kind`, `audience.data_sensitivity`
- `methodology.drift_sensitivity`, `methodology.phase_gates`
- `workstreams.active` (if present)

## Step 2: Read current state

In parallel:

```bash
git fetch origin --prune --quiet 2>/dev/null         # sync remote refs (catches schedule-pushed branches)
cat .harness-state/last_exit.md 2>/dev/null          # exit note from last session
cat .harness-state/current_phase 2>/dev/null         # Architect|Code|Test|Deploy
cat parking_lot.md 2>/dev/null                        # open side-quests
ls docs/specs/*.md 2>/dev/null | tail -3              # most recent specs
stat -f "%Sm" docs/architecture.md 2>/dev/null        # freshness of architecture doc
stat -f "%Sm" docs/plan.md 2>/dev/null                # freshness of plan
git log --oneline -10                                 # recent commits
git status --short                                    # current working state
```

The `git fetch` is intentional — it ensures branches pushed by automated routines (e.g. the Anthropic-reviews scheduler) are visible locally without moving master. Skip silently if there's no `origin` remote or no network.

## Step 3: Inject the context reminder

Print a 6-line header that will frame the entire session:

```
## Session context — [project.name] ([project.type])
**Stakes:** [stakes.level] — [stakes.why short]
**Audience:** [audience.kind], data: [audience.data_sensitivity]
**Current phase:** [current_phase or "Architect"]
**Open parking lot items:** [count]
**Last session ended:** [timestamp of last_exit.md, or "no prior session"]
```

This header is the profile's purpose — it makes the stakes visible on every open.

## Step 4: Pivot check (roadmap-drift detection)

If `docs/plan.md` mtime > `methodology.pivot_check_auto_days` days old (default 14):

> ⚠️ Your plan.md hasn't been touched in [N] days. Is it still current, or did the project direction change?
>
> Options:
> - **Still current** — skip check
> - **Needs update** — I'll summarize recent commits vs the plan and flag drift
> - **Project pivoted** — trigger `pivot-check` skill to re-plan formally

If architecture.md exists and is similarly stale, include in the same warning.

## Step 5: Show the last exit note

If `.harness-state/last_exit.md` exists, print it verbatim under a `### Where you left off` heading. This is what the user wrote when closing the last session — it's their own voice telling them what to do next.

If no last_exit.md, say:

> No exit note from last session. Consider running `session-end` when closing sessions — future-you will thank you.

## Step 6: Show parking lot

Parse `parking_lot.md`. Count items in "Open" section.

If >0: print them as a numbered list under `### Parking lot (open)`.

If >5: warn:

> You have [N] open parking-lot items. Consider triaging before starting new work — either resolve them, promote one to today's goal, or accept and move on.

## Step 7: Anthropic-reviews PRs awaiting triage (optional)

Only runs if BOTH conditions hold:
- `test -d anthropic-reviews` — the project uses the Anthropic-posts review routine
- `command -v gh` — the GitHub CLI is installed and authenticated

If either is false, skip this step silently — no header, no warning.

If both are true:

```bash
gh pr list --label anthropic-review --state open --json number,title,createdAt,url 2>/dev/null
```

If the count is 0, skip this step silently (the routine produces noise only when there's something to triage).

If count > 0, print under `### Anthropic-reviews PRs awaiting triage`:

```
- PR #N: "[title]" (opened YYYY-MM-DD) — [url]
- PR #M: "[title]" (opened YYYY-MM-DD) — [url]
...
```

If count > 3, add a soft warning:

> [N] open suggestion PRs queued. Consider triaging some today before the queue grows. Triage convention: `anthropic-reviews/README.md`.

This step is read-only — never auto-merge, auto-close, or modify PRs. The user decides what to do with them in Step 8.

## Step 8: Set today's primary goal

Build the options list dynamically based on available state:

- **Always include:** "Something else (describe it)"
- **If `last_exit.md` has a `Tomorrow's first move:` line:** include "Continue where I left off: `<next move from exit note>`" as the first option
- **If `parking_lot.md` has open items:** include "Work a parking-lot item: `<first open item>`" as an option
- **If Step 7 found open Anthropic-reviews PRs:** include "Triage Anthropic-reviews PR #N: `<title of oldest open>`" as an option. If selected, today's goal is triage (PR comments + Status updates per `anthropic-reviews/README.md`) — implementation of any approved suggestion is a follow-up micro-session, not the same goal.
- **If `current_phase = Architect`:** include "Exploratory / research (no fixed goal — Architect only)"
- **If `workstreams.mode = multi`:** prepend a workstream picker question first — "Which workstream is today's focus?" — and scope the goal to that workstream

Use `AskUserQuestion`:

> **What is today's ONE primary goal?**
>
> Based on your open parking lot, last exit note, and current phase, what's the single most important thing to move forward today?
>
> [dynamically-built options from rules above]

If "Something else", follow up with a free-text question for the goal.

Write the answer to `.harness-state/today_goal.md`:

```markdown
# Today's goal — [YYYY-MM-DD]

**Goal:** [one sentence]
**Phase:** [current]
**Set at:** [timestamp]
```

Also initialize the drift-detector's session baselines:

```bash
# Parking lot baseline (for detecting growth during session)
grep -cE '^- \[' parking_lot.md 2>/dev/null > .harness-state/parking_baseline || echo 0 > .harness-state/parking_baseline

# Reset drift signal counter
echo 0 > .harness-state/drift_ignores_today

# Record starting commit so session-end can list commits made this session
git rev-parse HEAD 2>/dev/null > .harness-state/session_start_commit || true
```

## Step 9: Remind of the ritual

Final output:

```
✅ Session open. Today's goal: "[goal]"

### Next steps
- Start a focused block: `micro` (frames goal + budget, starts work)
- Side-quest appears: `park "<description>"` (append to parking lot, stay on track)
- End of day: `session-end` (exit ritual, writes last_exit.md)

### Your safety rails
- Drift detector is ON, sensitivity: [drift_sensitivity]
- Phase gates: [phase_gates]
- Parking lot is committed to git (history lives in git log)
```

## Rules

1. **Never skip this skill.** Every session starts here. If you're tempted to dive into code, run this first.
2. **Read-only except for `today_goal.md`.** Don't modify profile, plan, or parking lot from here.
3. **Respect "exploratory / research" goal** — but only in Architect phase. In Code/Test/Deploy phases, exploration without a goal is drift.
4. **If profile is missing, stop.** Do not write a fallback profile — force the user to run `project-init` properly.
5. **Keep the header short** — 6 lines max. The profile reminder must be skimmable, not a wall of text.
