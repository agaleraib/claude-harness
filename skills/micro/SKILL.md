---
name: micro
description: Frame a focused micro-session — captures goal, budget (time or done-condition), and starts the work block. Run at the start of every 30-60 minute work block within a day session.
disable-model-invocation: true
argument-hint: "[\"goal description\"]"
---

# Micro-Session

A day session is made of micro-sessions. Each micro-session has **one goal**, **one budget**, and ends with **one commit**. No exceptions.

This skill frames the block so you can't drift inside it — the goal is written down, the budget is visible, and the end is well-defined.

## Step 1: Verify session is open

```bash
cat .harness-state/today_goal.md 2>/dev/null
```

If missing, stop:

> No session open. Run `session-start` first — micro-sessions happen inside a day session.

## Step 2: Capture the goal

If `$ARGUMENTS` is provided, use it as the goal. Otherwise, use `AskUserQuestion`:

> **What's the goal of this micro-session?**
>
> One sentence. Must be more specific than today's overall goal. Examples:
> - "Wire the /translate endpoint to the profile store"
> - "Fix the race condition in glossary-patcher"
> - "Get the first test passing for ProfileExtractionAgent"
>
> Not acceptable:
> - "Work on translation stuff" (too vague)
> - "Debug" (no target)

## Step 3: Choose budget style

Use `AskUserQuestion`:

> **How do you want to bound this block?**
>
> - **Time-boxed (30 min)** — explore, research, or spike something quickly
> - **Time-boxed (60 min)** — standard work block
> - **Done-boxed** — work until a specific condition is met (good for scoped tasks)
> - **Time-boxed (90 min)** — deep focused work (avoid > 90)

If done-boxed, follow up:

> **What's the specific done condition?**
>
> Must be verifiable. Examples: "all tests in profile-extraction.test.ts pass", "endpoint returns 200 with a valid response shape".

## Step 4: Write micro state

Write to `.harness-state/current_micro.md`:

```markdown
# Micro-session

**Goal:** [one sentence]
**Budget:** [time-boxed Nm | done-boxed: <condition>]
**Started:** [ISO timestamp]
**Parent goal:** [today's goal from today_goal.md]
**Commits at start:** [git rev-parse HEAD]
```

## Step 5: Print the frame

```
🎯 Micro-session open
Goal: [goal]
Budget: [budget]
Started: [HH:MM]

### Rules for this block
- Do NOT work on anything else. Side-quests go to `park`.
- Commit (even WIP) before ending.
- End the block with a one-line note on what moved.
```

## Step 6: (if budget is time-boxed) Set a soft timer reference

Print: `⏰ End of budget: ~[HH:MM + budget minutes]`.

This is advisory — no hard timer — but having the end time visible keeps it in mind.

## Rules

1. **One goal per micro-session.** Not "implement X and also fix Y". If two things need doing, two blocks.
2. **Budget is mandatory.** No open-ended blocks. Open-ended = drift.
3. **The goal must be more specific than today's goal.** If today's goal is "finish translation engine", a micro-goal of "finish translation engine" is invalid. Break it down.
4. **Side-quests during a block → `park`, not context switch.** The goal is to finish THIS block, not every issue you discover.
5. **Every micro-session ends with a commit.** Even if it's WIP. This is what makes the progress real and reversible.
6. **Ending a block without a commit is allowed only for exploratory/research blocks** — and you must note that explicitly in the exit note.
