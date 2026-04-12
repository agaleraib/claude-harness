# Reusable Prompts

Refined prompts for common tasks. Copy-paste ready.

---

## Spec Management

### Reconcile specs against git history

Use when spec task checklists are out of date — tasks were implemented but never checked off.

```
Review all specs in docs/specs/ and mark completed tasks based on git history
and current codebase state. For each spec:
1. Read the task checklist
2. Check if the code/files referenced by each task exist and work
3. Cross-reference with git log for relevant commits
4. Mark done tasks as [x] with the commit hash
5. Report what you changed
```

### Backfill plan.md from existing commits

Use when plan.md is stale and commits have been made outside the `/commit` skill.

```
Read plan.md and compare it against recent git history. For each unchecked
plan item, check if there are commits that complete it. Show me what looks
done and let me confirm before marking anything.
```

### Compare specs to decide build order

Use via spec-planner comparison mode.

```
Use the spec-planner to compare these specs and tell me which to build first:
- docs/specs/<spec-a>.md
- docs/specs/<spec-b>.md
```

---

## Session Management

### Resume after a long break

Use when returning to a project after days/weeks away and session-start doesn't have enough context.

```
I'm returning to this project after a break. Help me get oriented:
1. Read the last exit note (.harness-state/last_exit.md)
2. Show git log for the last 2 weeks
3. Read plan.md and flag what's done vs pending
4. Read parking_lot.md and flag anything stale
5. Recommend what to work on today
```

### Triage a large parking lot

Use when parking lot has 10+ items and needs a cleanup pass.

```
Read parking_lot.md. For each open item, tell me:
- Is it still relevant? (check if the code/file it references still exists)
- Is it already fixed? (check git log for related commits)
- Should it be promoted to a plan.md item?
Present as a table so I can make quick keep/resolve/delete decisions.
```

---

## Code Quality

### Deep review before merge

Use for thorough review of a feature branch before merging to master.

```
Review all commits on this branch vs master. For each changed file:
1. Run the code-reviewer
2. Check for TODO/FIXME/HACK comments left behind
3. Verify tests exist for new functionality
4. Flag any files changed but not covered by tests
Give me a merge readiness score and list of blockers.
```

### Refactor assessment

Use when considering whether a refactor is worth doing.

```
I'm thinking about refactoring [describe area]. Before I start:
1. How many files/functions would be affected?
2. What tests cover this area?
3. What's the risk of breaking something?
4. Estimate: is this a 30-min cleanup or a multi-session project?
Give me a go/no-go recommendation.
```
