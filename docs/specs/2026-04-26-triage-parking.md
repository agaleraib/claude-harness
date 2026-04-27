# /triage-parking — Universal parking-lot triage skill

**Status:** spec
**Type:** new skill, ships universally via `/setup-harness`
**Owner:** Albert (solo)

## Problem

Parking lots in claude-harness-installed repos (claude-harness itself, wordwideAI, gobot) accumulate side-quest items captured by `/park` during micro-sessions. Items range from trivial chores ("rename foo to bar") to substantive design questions ("redesign alias ownership"). Triaging them by hand is the kind of routine sweep the user already does manually — a strong "promote to routine" signal.

Naive auto-fixing is wrong: most items are *deliberately deferred decisions*, not just code chores. Auto-shipping PRs for everything would steal decisions, leak secrets (one current item is a 🔑 leaked API key), and produce PR spam.

## Goal

A universal `/triage-parking` skill that classifies parking-lot items, archives stale ones, opens at most one bundled draft PR for explicitly-opted-in trivial items, and produces a triage log. **Triage-only by default. Never auto-merges. Per-repo opt-in.**

## Non-goals

- Not a fix-everything loop
- Not scheduled in v1 (on-demand only — earn the schedule by proving value)
- Not a replacement for `/micro` or `/spec-planner`
- Does not depend on `/apply-anthropic-reviews` (that skill is claude-harness-local; this one is universal)
- Does not auto-merge PRs (ever, in any version)

## Design

### Invocation

```
/triage-parking
```

No arguments in v1.

### Pre-flight gates (all must pass or skill bails with explanation)

1. `parking_lot.md` exists at repo root
2. `.harness-profile` exists and contains `triage_parking.enabled: true`
3. Working tree is clean (no uncommitted changes — won't risk colliding with in-flight work)
4. Current branch is the repo's main/master branch (don't run on feature branches)

If any gate fails, print the reason and exit 0. Don't write to triage-log.

### Step 1: Read parking_lot.md

Parse `## Open` section into structured items: `{date, description, source, markers}`.

Markers detected from description:
- `[auto-ok]` — opt-in for auto-fix
- `[hold]` — explicit "do not touch"

### Step 2: Classify each item

For each open item, assign exactly one bucket using the inlined rubric below.

**Skip (no action, leave in Open):**
- Description matches `/key|secret|credential|token|password/i` (security — human only)
- Has `[hold]` marker
- `source:` field matches the active micro-goal in `.harness-state/current_micro.md` (in-flight collision)

**Archive (move to `## Archived`):**
- Item date >90 days old AND no `[auto-ok]` marker AND no activity referencing it in last 30 commits

**Substantive (flag for human, leave in Open):**
- Description contains `investigate|consider|explore|design|document|review whether|may not be|should we|maybe|could`
- Description references architectural change (>1 file impact stated, or words like "refactor", "redesign", "migration")
- No `[auto-ok]` marker

**Modest (queue for `/micro`, leave in Open with `[queued]` marker appended):**
- Single concrete action ("add retry logic", "fix grep fallback") but spans >1 file or >20 LOC estimated
- No `[auto-ok]` marker
- Append `[queued YYYY-MM-DD]` to the item line in parking_lot.md so future runs skip it

**Trivial-auto-ok (eligible for draft PR):**
- Has explicit `[auto-ok]` marker (user opted this specific item in)
- Imperative phrasing ("rename X", "remove Y", "add Z fallback")
- Estimated single-file, <20 LOC change

### Step 3: Cap and select

From the trivial-auto-ok bucket, take **at most 3 items** for this run. If more exist, leave the rest for the next invocation. **Max 1 draft PR per run** containing all selected items.

If zero trivial-auto-ok items: skip Step 4 entirely and go straight to Step 5 (log + report).

### Step 4: Worktree, fix, gate, draft PR

1. Create a temp worktree from main: `git worktree add ../triage-<YYYY-MM-DD> -b triage/parking-<YYYY-MM-DD>`
2. For each selected item: make the change in the worktree. If any item turns out to be more complex than the trivial heuristic predicted (touches >1 file, requires >20 LOC, breaks tests), **abort that item only** — leave it in parking_lot.md, do not include in PR
3. Run `quality_gate.command` from `.harness-profile` (e.g., `npm test && npm run typecheck`)
4. If gate fails → discard worktree, leave all selected items in parking_lot.md, log the failure, exit 0
5. If gate passes → commit (one commit per item, conventional commit style), push branch, open draft PR titled `chore(parking): triage <N> items YYYY-MM-DD`
6. PR body: bulleted list of resolved items with their original parking_lot date + source
7. Move resolved items from `## Open` to `## Resolved` in parking_lot.md **on the PR branch** (so the parking-lot diff is part of the PR, not a separate commit on main)
8. Clean up worktree

### Step 5: Triage log

Append one line to `.harness-state/triage-log.md` (create file with header if missing):

```
2026-04-26: 11 reviewed | 2 auto→PR#42 | 1 modest queued | 5 substantive | 2 archived | 1 skipped(secret)
```

Always write this line, even on no-op runs. This is how the user sees what the routine is doing on their behalf.

### Step 6: Report to user

Print the triage-log line plus:
- PR URL if one was opened
- Names/dates of the 5 most-recent items in each non-empty bucket (so user can sanity-check classifications)
- One-line next-action suggestion if substantive count >5: "Substantive backlog at N — consider a triage-parking session-end ritual to promote or close them"

## Skill file location

`claude-harness/skills/triage-parking/SKILL.md`

Symlinked into `~/.claude/skills/triage-parking` so it's available globally and propagates via `/setup-harness` to new repos.

## .harness-profile addition

`/setup-harness` adds this block to new profiles (commented out by default):

```yaml
# triage_parking:
#   enabled: false  # set to true to allow /triage-parking to open draft PRs
```

Existing profiles in wordwideAI and gobot remain untouched until the user manually opts in.

## /park skill update

Update `claude-harness/skills/park/SKILL.md` Step 5 confirmation to mention markers:

> Tip: append `[auto-ok]` if this is a trivial mechanical fix you'd be happy for `/triage-parking` to ship as a draft PR. Append `[hold]` to lock it from triage entirely.

This is the only change to `/park` — markers are opt-in, not prompted.

## Rollout

1. Build skill in claude-harness on a feature branch
2. Test against claude-harness's own parking_lot.md (set `triage_parking.enabled: true` in this repo's profile first)
3. Verify dry-run classifies the existing 11 items correctly:
   - 🔑 API key item → skipped (secret)
   - "Document branches vs worktrees" → substantive (contains "document")
   - "session-start parking_baseline init fails" → modest (concrete bug, single file likely)
   - Most others → substantive (contain "consider", "investigate", design judgment)
   - Expected trivial-auto-ok count: 0 (no items currently have the marker — that's correct, marker is new)
4. Manually add `[auto-ok]` to one item, re-run, verify draft PR opens cleanly
5. Merge to master; symlink picks up automatically
6. Document in README under "Skills" section

## Tasks

| # | Task | Effort | Notes |
|---|------|--------|-------|
| 1 | Create `skills/triage-parking/SKILL.md` with steps 1–6 above | medium | sonnet |
| 2 | Update `skills/park/SKILL.md` Step 5 with marker tip | trivial | haiku |
| 3 | Update `skills/setup-harness/SKILL.md` to seed commented `triage_parking:` block in new profiles | trivial | haiku |
| 4 | Add `triage_parking.enabled: true` to claude-harness's own `.harness-profile` for self-testing | trivial | manual |
| 5 | Dry-run skill against claude-harness parking_lot.md, verify classifications match expectations in spec | small | manual |
| 6 | Add `[auto-ok]` to one suitable item (candidate: grep fallback bug, line 20), re-run, confirm draft PR | small | manual |
| 7 | README: add `/triage-parking` to skills section with one-line description | trivial | haiku |

## Verify

- Skill exits cleanly on a repo without `parking_lot.md`
- Skill exits cleanly on a repo without `triage_parking.enabled` in profile
- Skill never opens a PR when working tree is dirty
- Secret-bearing items never appear in any PR diff
- `.harness-state/triage-log.md` line is appended on every run, including no-ops
- Worktree is cleaned up even on quality-gate failure
- PR is always `--draft`

## Open questions parked for v2

- Should the skill be schedulable via `/loop` or remote cron? (Need 2-3 manual runs first to see if it earns it)
- Should the rubric be extracted to `docs/classification-rubric.md` and shared with `/apply-anthropic-reviews`? (Yes if a third skill needs it; not yet)
- Should `/session-end` call `/triage-parking` automatically when parking_lot has >5 items? (Tempting but violates "lean rituals over automation" — skip)
