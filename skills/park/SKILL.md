---
name: park
description: Log a side-quest to parking_lot.md without context-switching. Use whenever an issue, idea, or secondary task surfaces during a micro-session — instead of dropping your current goal to chase it. Pass --issue to promote the item directly to a labeled GitHub issue instead of the local parking lot.
argument-hint: "[--issue] \"description of the side-quest\""
---

# Park

Drift happens one side-quest at a time: you're working on A, you notice B, you dive into B, B reveals C, and three hours later A is untouched. This skill is the antidote.

When something surfaces that isn't your current micro-session's goal, **park it** — write one line, keep going.

`/park` is **local-first**: by default it appends to `parking_lot.md` and creates no issue. Pass `--issue` to promote the item straight to a tracked GitHub issue instead (Wave 20, Task 14) — see "§Promote mode (`--issue`)" below.

## Step 1: Verify parking lot exists

```bash
ls parking_lot.md 2>/dev/null
```

If missing, tell the user:

> No `parking_lot.md` found. Run `project-init` or create one manually. Parking lot is committed to git so drift history is visible.

## Step 1a: Detect `--issue` (promote mode)

Scan `$ARGUMENTS` for a leading `--issue` flag. If present, strip it from the arguments and follow **§Promote mode (`--issue`)** at the end of this skill INSTEAD of Steps 2–5. The remaining `$ARGUMENTS` text is the item description. Plain `/park "..."` (no flag) continues with Step 2 (local append).

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

> Tip: append `[auto-ok]` if this is a trivial mechanical fix you'd be happy for `/triage-parking` to ship as a draft PR. Append `[hold]` to lock it from triage entirely. Markers are opt-in, not prompted.

**Do NOT** interrupt the flow further. The point of parking is fast capture, not a second ritual.

## Rules

1. **Never trigger a context switch.** After parking, the user returns to the current micro-session. Do not suggest working on the parked item now.
2. **No editorial judgment.** Park what the user says, verbatim, even if it sounds small.
3. **Parking lot is committed to git.** Do not add it to `.gitignore`. Drift history is a feature — git log shows when and how often you parked items.
4. **Resolved items move to "Resolved" section at session-end**, not here. Park is append-only during a work block.
5. **Include the source micro-goal** — future you needs to know why this item was parked and what you were working on when it surfaced.
6. **`--issue` is mutually exclusive with the local append.** A promoted item creates one issue and does NOT append to `parking_lot.md` (no double-tracking). Plain `/park` never creates an issue.

## §Promote mode (`--issue`)

`/park --issue "<description>"` promotes the side-quest directly to a GitHub issue instead of the local parking lot. This is for items you already know belong on the tracker (not the fast local-capture default).

### P1. Resolve the readiness label via the shared classifier (Task 12)

Route the item through the shared AFK/HITL 4-gate classifier at `skills/_shared/classifier/classify.ts` to decide its readiness label. Derive the capability signals from the description:

- Does it need an unobtainable credential/access? → gate (1)
- Does it need an out-of-band action (vendor portal, phone call)? → gate (2)
- Does it hinge on an unspecified product/design judgment? → gate (3)
- Is it an irreversible production action? → gate (4)

Classify under the issue's intended runner (default `sandcastle` unless the item clearly needs host secrets/tools — then `worktree`). The classifier returns:

- `ready-for-agent` — no gate tripped → label `ready-for-agent`
- `ready-for-human` — any gate tripped → label `needs-triage` (a human refines it first)

Do NOT hand-assign the label — the classifier is the single source of truth so `/park --issue`, `/triage-parking`, and `/spec-planner` agree on the same verdict.

### P2. Create the issue

```bash
gh issue create \
  --title "<description, first ~72 chars>" \
  --body "$(cat <<'BODY'
<full description>

Promoted from /park (source micro: <current micro goal or "no active micro">).
Classifier verdict: <ready-for-agent | ready-for-human>; runner: <sandcastle | worktree>; gates: <tripped gates or "none">.
BODY
)" \
  --label "<ready-for-agent | needs-triage>"
```

### P3. Confirm

```
✅ Promoted to issue #<n>: "<description>"
Label: <ready-for-agent | needs-triage> (classifier: <reason>)
Did NOT append to parking_lot.md.
```

> NOTE: This is prose protocol. Do not create live `gh` issues from a CI gate / worktree dispatch — run the `gh issue create` only in a real operator session with `gh` credentials.
