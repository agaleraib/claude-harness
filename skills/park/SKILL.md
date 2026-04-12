---
name: park
description: Log a side-quest to parking_lot.md without context-switching. Use whenever an issue, idea, or secondary task surfaces during a micro-session — instead of dropping your current goal to chase it.
argument-hint: "\"description of the side-quest\""
---

# Park

Drift happens one side-quest at a time: you're working on A, you notice B, you dive into B, B reveals C, and three hours later A is untouched. This skill is the antidote.

When something surfaces that isn't your current micro-session's goal, **park it** — write one line, keep going.

## Step 1: Verify parking lot exists

```bash
ls parking_lot.md 2>/dev/null
```

If missing, tell the user:

> No `parking_lot.md` found. Run `project-init` or create one manually. Parking lot is committed to git so drift history is visible.

## Step 2: Capture the item

The description comes from `$ARGUMENTS`. If empty, use `AskUserQuestion`:

> **What do you want to park?**
>
> One line. Examples:
> - "Refactor translation-engine.ts — the round loop is hard to read"
> - "Investigate why glossary-patcher returns undefined on empty input"
> - "Add retry logic to Anthropic SDK calls"

## Step 3: Determine source micro-goal

```bash
cat .harness-state/current_micro.md 2>/dev/null
```

Extract the current micro-session goal. If no micro-session is active, mark source as "no active micro".

## Step 4: Append to parking_lot.md

Append to the "Open" section with this format:

```markdown
- [YYYY-MM-DD] <description> (source: <current micro goal or "no active micro">)
```

Use the Edit tool to insert after the `## Open` heading, preserving any existing items.

## Step 5: Confirm and return

Print a short confirmation:

```
✅ Parked: "<description>"
Source: <micro goal>

Still working on: <current micro goal>
Parking lot now has <N> open items.
```

**If the count is now >= 5**, add a soft warning:

> ⚠️ Parking lot has [N] open items. Consider triaging at session-end — some of these may need to be promoted to today's goal or resolved.

**Do NOT** interrupt the flow further. The point of parking is fast capture, not a second ritual.

## Rules

1. **Never trigger a context switch.** After parking, the user returns to the current micro-session. Do not suggest working on the parked item now.
2. **No editorial judgment.** Park what the user says, verbatim, even if it sounds small.
3. **Parking lot is committed to git.** Do not add it to `.gitignore`. Drift history is a feature — git log shows when and how often you parked items.
4. **Resolved items move to "Resolved" section at session-end**, not here. Park is append-only during a work block.
5. **Include the source micro-goal** — future you needs to know why this item was parked and what you were working on when it surfaced.
