---
name: commit
description: Commit protocol — reviews staged changes, surfaces related parking lot items, lets you fix or park issues, updates plan.md if the commit moves a plan item forward.
argument-hint: "[commit message override]"
---

# Commit

A commit protocol that reviews before committing, keeps the parking lot honest, and updates the plan.

## Step 1: Check staged changes

```bash
git diff --cached --stat
```

If nothing is staged, check for unstaged changes:

```bash
git status --short
```

If there are unstaged changes, use `AskUserQuestion`:

> Nothing is staged. Want me to show unstaged changes so you can pick what to stage?

If the working tree is completely clean, stop:

> Nothing to commit — working tree is clean.

## Step 2: Check parking lot for related items

```bash
cat parking_lot.md 2>/dev/null
```

Get the list of files being committed:

```bash
git diff --cached --name-only
```

Scan the parking lot's Open section for items that reference any of the staged files, directories, or closely related functionality. Use your judgment — an item about "translation-engine.ts" is related if you're committing changes to `translation-engine.ts` or `translate.test.ts`.

If related items are found, use `AskUserQuestion`:

> These parking lot items look related to what you're committing:
>
> 1. [item text]
> 2. [item text]
>
> What do you want to do?
>
> - **Resolve now** — fix these before committing
> - **Acknowledge and continue** — commit anyway, items stay parked

If "Resolve now": fix the issues, re-stage, then restart from Step 2.

## Step 3: Run code-reviewer

Invoke the `code-reviewer` agent on the staged diff. Pass it only the staged changes:

```bash
git diff --cached
```

The code-reviewer will run tests, check types, and report findings.

## Step 4: Handle review findings

If the code-reviewer reports no issues, skip to Step 5.

If issues are found, present them numbered and use `AskUserQuestion`:

> Code review found [N] issues:
>
> 1. [severity] [description]
> 2. [severity] [description]
> ...
>
> What do you want to do?
>
> - **Fix all** — fix every issue, re-stage, re-review
> - **Review individually** — go through each one, decide fix or park
> - **Park all** — park everything to parking_lot.md, commit as-is

### Fix all

Fix all reported issues. Re-stage changed files. Go back to Step 3 (re-review).

### Review individually

For each issue, use `AskUserQuestion`:

> **Issue [N]:** [severity] — [description]
> File: [file:line]
>
> - **Fix now** — fix this issue
> - **Park** — add to parking lot, move on

After going through all issues:
- Fix the ones marked "fix now", re-stage
- Park the ones marked "park" (append to parking_lot.md Open section with today's date and `source: commit review`)
- If any were fixed, go back to Step 3 (re-review the fixes only)

### Park all

For each issue, append to `parking_lot.md`:

```
- [YYYY-MM-DD] [code-review] [description] — [file:line] (source: commit review)
```

Continue to Step 5.

## Step 5: Commit

Draft a commit message from the staged changes. Follow the repo's existing commit style (check `git log --oneline -5`).

If `$ARGUMENTS` was provided, use that as the commit message instead of generating one.

```bash
git commit -m "<message>

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Step 6: Update plan.md (if applicable)

```bash
cat docs/plan.md 2>/dev/null || cat plan.md 2>/dev/null
```

If no plan.md exists, skip this step entirely.

If plan.md exists, compare the committed changes against the plan's items. If the commit clearly completes or advances a plan item:

- Mark the item as done (e.g., `~~item~~` or `[x] item`)
- Add a brief note with the commit hash: `(done in abc1234)`

If the commit doesn't relate to any plan item, don't touch plan.md. Typo fixes, refactors, and chores don't need plan updates.

Use `AskUserQuestion` to confirm before editing:

> This commit looks like it completes: **"[plan item text]"**
>
> Want me to mark it done in plan.md?
>
> - **Yes** — mark done with commit hash
> - **No** — leave plan.md unchanged

## Step 7: Update spec task checklist (if applicable)

If Step 6 identified a plan.md item and the plan entry references a spec file (e.g., `docs/specs/2026-04-12-editorial-memory.md`), read that spec file and check for task checklists (`- [ ] Task N`).

If the completed plan item corresponds to a phase in the spec (e.g., "Phase 1 complete"), mark all tasks in that phase as done:

```
- [ ] Task 1: ...  →  - [x] Task 1: ... (done in abc1234)
```

Use `AskUserQuestion` to confirm which tasks to mark:

> Plan.md says Phase 1 of `editorial-memory.md` is complete. These spec tasks look done:
>
> 1. [ ] Task 1 — description
> 2. [ ] Task 2 — description
> ...
>
> - **Mark all done** — check off all Phase 1 tasks
> - **Let me pick** — go through individually
> - **Skip** — leave spec unchanged

If no spec file is referenced in the plan entry, skip this step.

## Rules

1. **Never skip the review.** The whole point is that every commit gets a second look.
2. **Don't loop forever.** Re-review happens at most twice. After two rounds, commit with remaining issues parked.
3. **Parking is not failure.** It's a deliberate decision to defer. No guilt, no nagging.
4. **plan.md updates are optional.** Only touch it when a plan item clearly moved. When in doubt, don't.
5. **Spec updates follow plan.md.** Only check spec tasks when a plan item was just marked done. Don't scan specs independently.
6. **Respect the user's commit message.** If they pass one via arguments, use it. Don't rewrite it.
