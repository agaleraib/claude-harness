---
name: session-end
description: Close a coding day — checks for pending commits, captures state of play, triages parking lot, writes exit note, saves session to Second Brain via project-tracker.
---

# Session End

Close the session cleanly so next time you can pick up without guessing where you left off.

## Step 1: Check for pending commits

```bash
git status --short
git diff --cached --stat
```

If there are staged or unstaged changes:

Use `AskUserQuestion`:

> You have uncommitted changes:
> [file list]
>
> - **Commit now** — run the `commit` skill (review + commit)
> - **Leave as-is** — close session with dirty tree (next session-start will see it)

If "Commit now", invoke the `commit` skill and wait for it to complete before continuing.

## Step 2: Gather state

Read in parallel:

```bash
cat .harness-state/today_goal.md 2>/dev/null
cat .harness-state/current_micro.md 2>/dev/null
git log --oneline $(cat .harness-state/session_start_commit 2>/dev/null || echo HEAD~20)..HEAD
cat parking_lot.md 2>/dev/null
```

If no `today_goal.md` exists (no session-start was run), that's fine — still close out what you can.

## Step 3: Show session summary

```
## Session summary — [YYYY-MM-DD]

**Today's goal:** [from today_goal.md, or "no goal set"]

**Commits this session:** [N]
[list short commit titles]

**Parking lot:** [N open items]
```

## Step 4: State of play

Use `AskUserQuestion`:

> **How did today go?**
>
> - **Goal hit** — did what I set out to do
> - **Partial** — made progress but didn't finish
> - **Drifted** — ended up elsewhere
> - **Blocked** — couldn't make progress

If "Partial" or "Drifted", follow up for a 1-sentence note.
If "Blocked", follow up for the blocker in 1 sentence.

## Step 5: Parking lot triage

If parking_lot.md has open items, use `AskUserQuestion`:

> **Triage parking lot?** [N open items]
>
> - **Yes, walk me through them** — show each, ask keep/resolve/promote/delete
> - **Skip** — triage next time

If "Yes", loop through each open item:

> Item: "[description]"
> - **Keep** — leave open
> - **Resolve** — move to Resolved (ask for 1-line outcome)
> - **Promote** — make this tomorrow's goal
> - **Delete** — no longer relevant

## Step 6: Tomorrow's starter

Use `AskUserQuestion`:

> **What should future-you do first tomorrow?**
>
> - Continue: "[inferred from current work]"
> - Start the promoted parking lot item (if any)
> - Something else (describe it)

## Step 7: Write exit note

Write to `.harness-state/last_exit.md`:

```markdown
# Exit note — [YYYY-MM-DD]

**Today's goal:** [goal]
**Outcome:** [hit | partial | drifted | blocked]
**Where I ended:** [1-sentence state]

**Parking lot triaged:** [yes/no]
**Tomorrow's first move:** [sentence]

## Commits this session
[short commit list]
```

## Step 8: Run project-tracker

Invoke the `project-tracker` agent to save this session's context to Second Brain. Pass it the exit note content, commit list, and any specs or plans that changed.

This is automatic — don't ask the user. The session summary is already gathered, just save it.

## Step 9: Clean up session state

```bash
rm -f .harness-state/current_micro.md
rm -f .harness-state/today_goal.md
rm -f .harness-state/session_start_commit
# Keep: last_exit.md (read by next session-start)
```

## Step 10: Close

```
✅ Session closed — [YYYY-MM-DD]
Session saved to Second Brain.
Tomorrow's first move: "[next move]"
```

## Rules

1. **Pending commits check is first.** Don't close with uncommitted work without the user knowing.
2. **Project-tracker runs automatically.** No prompt needed — the user chose to save sessions.
3. **Parking triage is optional.** Ask, but respect "skip."
4. **Tomorrow's move is one sentence.** Not a plan — just the first action.
5. **Always write last_exit.md.** Even for bad sessions.
