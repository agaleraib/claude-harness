---
name: session-end
description: Close a coding day with an exit ritual. Captures state of play, triages parking lot, writes last_exit.md for tomorrow's session-start to read. Run before closing the laptop.
---

# Session End

Sessions that close without a ritual are sessions you can't resume cleanly. This skill forces the exit — 5 minutes that save 30 tomorrow morning.

The ritual has three parts: **state of play**, **parking lot triage**, **tomorrow's starter**. None are optional.

## Step 1: Verify session is open

```bash
cat .harness-state/today_goal.md 2>/dev/null
```

If missing, tell the user:

> No session open (no today_goal.md found). Nothing to close.
>
> If you worked today without running `session-start`, that's a drift-by-default — consider running the full flow tomorrow.

## Step 2: Gather state automatically

Read in parallel:

```bash
cat .harness-state/today_goal.md             # today's goal
cat .harness-state/current_micro.md 2>/dev/null  # last micro if any
git log --oneline $(cat .harness-state/session_start_commit 2>/dev/null || echo HEAD~20)..HEAD
git status --short                            # uncommitted changes
cat parking_lot.md                            # all parking lot items
```

## Step 3: Show the session summary

Print a compact summary for the user to review:

```
## Session summary — [YYYY-MM-DD]

**Today's goal:** [from today_goal.md]

**Commits this session:** [N]
[list short commit titles]

**Uncommitted changes:** [N files]
[short list, or "clean"]

**Parking lot:**
- Open: [N items]
- Resolved this session: [N items moved during session]
```

## Step 4: Part 1 — State of play

Use `AskUserQuestion`:

> **How did today go against the goal?**
>
> - **Goal hit** — did what I set out to do
> - **Partial** — made progress but didn't finish
> - **Drifted** — ended up elsewhere
> - **Blocked** — couldn't make progress due to a blocker

If "Partial" or "Drifted", follow up for a 1-sentence "where did I actually end up" note.

If "Blocked", follow up for "what's the blocker" in 1 sentence.

## Step 5: Part 2 — Parking lot triage

If parking_lot.md has open items, use `AskUserQuestion`:

> **Triage parking lot?** [N open items]
>
> - **Yes, walk me through them** — I'll show each open item and ask keep/resolve/promote
> - **Quick — just show the count** — skip per-item triage
> - **Skip** — triage tomorrow

If "Yes", loop through each open item and ask:

> Item: "[description]"
> - **Keep** — leave in Open section
> - **Resolve** — move to Resolved (ask for 1-line outcome note)
> - **Promote** — this should be tomorrow's primary goal instead
> - **Delete** — no longer relevant, remove entirely

## Step 6: Part 3 — Tomorrow's starter

Use `AskUserQuestion`:

> **What should future-you do first tomorrow?**
>
> This is the single sentence your next `session-start` will read back to you. Make it actionable.
>
> - Continue: "[inferred from current_micro or today_goal]"
> - Start the promoted parking lot item (if any were promoted)
> - Something else (describe it)
> - "Decide tomorrow" — only if truly blocked or at a natural inflection point

## Step 7: Write `last_exit.md`

Write to `.harness-state/last_exit.md` (overwriting any previous):

```markdown
# Exit note — [YYYY-MM-DD HH:MM]

**Today's goal:** [goal]
**Outcome:** [hit | partial | drifted | blocked]
**Where I ended:** [1-sentence state]
[if blocked: **Blocker:** [description]]

**Parking lot triaged:** [yes/no], [N resolved, N promoted, N deleted]
**Tomorrow's first move:** [sentence]

## Commits this session
[short commit list]

## Uncommitted changes at close
[file list or "clean"]
```

## Step 8: Write `session_summary.json` for project-tracker

Also write a machine-readable summary to `.harness-state/last_session.json`:

```json
{
  "date": "YYYY-MM-DD",
  "goal": "...",
  "outcome": "hit|partial|drifted|blocked",
  "commits": [{"hash": "...", "subject": "..."}],
  "parking_lot_delta": {"resolved": N, "promoted": N, "deleted": N},
  "next_move": "..."
}
```

This file is what `project-tracker` reads on next commit to sync session state to Second Brain.

## Step 9: Prompt for commit if dirty

If `git status --short` shows uncommitted changes:

> You have [N] uncommitted files. Session-end is a good time to commit WIP. Want me to show the diff and help stage + commit, or leave it?
>
> - **Commit WIP** — I'll show the diff and draft a commit message
> - **Leave it** — ending with dirty tree (next session-start will see it)

Do NOT force a commit. Advisory only — user decision matches #5 enforcement rule (prompted, not blocking).

## Step 10: Clean up transient session state

Remove state files that are session-scoped so the next `session-start` begins fresh:

```bash
rm -f .harness-state/current_micro.md       # no active micro after close
rm -f .harness-state/drift_ignores_today    # reset drift signal counter
rm -f .harness-state/today_goal.md          # next session-start writes a new one
rm -f .harness-state/session_start_commit   # next session sets its own baseline
# Keep: last_exit.md, last_session.json, parking_baseline (refreshed on next session-start)
```

## Step 11: Final confirmation

```
✅ Session closed — [YYYY-MM-DD HH:MM]
Exit note: .harness-state/last_exit.md

Tomorrow's first move: "[next move]"

Have a good one. Run `session-start` when you're back.
```

## Rules

1. **Do not skip parts.** State of play + parking triage prompt + tomorrow's starter. All three.
2. **Parking lot triage prompt is mandatory, but the user can choose "Skip"** — asking is required, triaging itself is not.
3. **Always write `last_exit.md`.** Even if the session was drifted or blocked — especially then.
4. **Tomorrow's move is one sentence, not a plan.** If it's longer than 20 words, it's probably a new goal and belongs in `session-start`, not here.
5. **Do not force commits.** Prompt is advisory. The user decided (question #5 answer) that session-end should not block commits.
6. **This skill writes state, it does not sync to Second Brain.** That's project-tracker's job — it reads `last_session.json` on next commit.
