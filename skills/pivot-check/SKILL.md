---
name: pivot-check
description: Reconcile the spec + architecture + plan against what the code actually does now. Detects roadmap-scale drift — when the project pivoted but docs never caught up. Run manually anytime, auto-triggered at 14-day plan staleness.
disable-model-invocation: true
---

# Pivot Check

Roadmap drift is silent: the code keeps changing, the spec stays the same, and one day you realize `docs/plan.md` describes a system that no longer exists. This skill catches that before it becomes an archived plan.md with no replacement.

It asks three questions:
1. **Does the spec still describe what's being built?**
2. **Does the plan still describe what's being worked on?**
3. **Does the architecture doc still describe how the code fits together?**

If any answer is "no", you're in a pivot — and the skill helps you decide whether to update the docs or formally re-plan.

## Step 1: Gather inputs

Read in parallel:

```bash
ls -la docs/specs/ 2>/dev/null | tail -5                  # most recent specs
cat docs/plan.md 2>/dev/null | head -30                   # current plan
cat docs/architecture.md 2>/dev/null | head -50           # current arch
stat -f "%Sm" docs/plan.md 2>/dev/null                    # plan mtime
stat -f "%Sm" docs/architecture.md 2>/dev/null            # arch mtime
git log --since="14 days ago" --oneline                   # recent commits
git diff --stat HEAD~30..HEAD 2>/dev/null | tail -20      # files churned in last 30 commits
cat .harness-profile 2>/dev/null                          # for context
```

If any of these files are missing, note it and continue with what's available.

## Step 2: Staleness report

Compute days-since-touched for each doc:

| Doc | Last touched | Days |
|---|---|---:|
| `docs/plan.md` | [mtime] | [N] |
| `docs/architecture.md` | [mtime] | [N] |
| Most recent spec | [mtime] | [N] |

Mark 🟢 if <7 days, 🟡 if 7-14 days, 🔴 if >14 days.

## Step 3: Churn vs docs

Identify the files changed most in the last 30 commits. For each, ask: is this file's area described in the current spec + architecture?

Example reasoning:
- If `src/engine/translation-pipeline.ts` has 12 commits in the last 30 but `docs/specs/` mentions no pipeline changes → drift signal
- If `src/api/routes/analytics.ts` is new but `architecture.md` has no analytics service → drift signal

Write findings as:

```
### Churn vs docs

- `src/engine/translation-pipeline.ts` (12 commits) — ⚠️  not described in any dated spec
- `src/api/routes/analytics.ts` (new file, 5 commits) — ⚠️  architecture.md has no analytics section
- `src/pipeline/glossary-patcher.ts` (8 commits) — ✅  covered by docs/specs/2026-03-15-glossary.md
```

## Step 4: Ask the user to classify

Use `AskUserQuestion`:

> **Does the current documentation still describe what you're building?**
>
> I found [N] files with heavy churn that don't appear in your specs or architecture. Classify the situation:
>
> - **On track** — docs are current, the churn is normal implementation detail → no action
> - **Needs doc refresh** — same project direction, just docs need updating → update specs/architecture to match
> - **Partial pivot** — one subsystem changed direction, others didn't → write a new dated spec for the pivoted area, leave the rest
> - **Full pivot** — project direction changed meaningfully → archive the current plan, write a new one via `spec-planner`
> - **Can't tell** — I need to read the code first → exit, investigate, run pivot-check again

## Step 5: Handle each outcome

### On track
Print: `✅ No pivot detected. Specs and architecture reflect current state.`
Touch `docs/plan.md` so the next staleness check resets:
```bash
touch docs/plan.md
```
Done.

### Needs doc refresh
Walk the user through:
1. Which file/section to update (list the highest-churn areas)
2. Ask if they want to do it themselves or have you draft the update (Claude can edit specs/architecture based on code reading)
3. After updates, commit as a single "docs: refresh after code churn" commit.

### Partial pivot
1. Identify the pivoted subsystem (from the churn list + user confirmation)
2. Suggest writing a new dated spec: `docs/specs/YYYY-MM-DD-<subsystem>-pivot.md`
3. Offer to invoke `spec-planner` for just that subsystem

### Full pivot
This is the heavy case and the reason this skill exists.

1. Archive the current plan:
   ```bash
   mv docs/plan.md docs/plan.archived-$(date +%Y-%m-%d).md
   ```
2. Print a pivot record template to add to `docs/plan.archived-*.md`:
   ```markdown
   # plan.md — archived on [YYYY-MM-DD]

   **Reason for pivot:** [user's explanation]
   **Superseded by:** [new spec filename, TBD after spec-planner runs]

   Original plan content follows:
   ---
   [original content preserved]
   ```
3. Tell the user: **"Run `spec-planner` now to write the new plan. I'll wait."**
4. After they run it, offer to update `docs/architecture.md` to match the new direction.
5. Commit the archive + new spec + updated arch in a single "pivot: [direction]" commit.

### Can't tell
Print: `Exit pivot-check, investigate the code, run pivot-check again when you have a clearer picture.`

## Step 6: Reset staleness counter

Regardless of outcome (except "can't tell"):

```bash
touch docs/plan.md  # resets the 14-day auto-trigger
```

## Step 7: Log the check

Append to `.harness-state/pivot-log.md`:

```markdown
- [YYYY-MM-DD] pivot-check: [outcome] — [1-line reason]
```

This gives future-you a history of when drift was detected and what the call was.

## Auto-trigger contract

`session-start` invokes this skill automatically when `docs/plan.md` hasn't been touched in `methodology.pivot_check_auto_days` days (default 14). The user can skip the auto-trigger ("still current, just touch it") but the skill still runs to verify.

## Rules

1. **Pivot check does not auto-fix.** It detects and routes; the user decides and the user writes.
2. **A pivot is not a failure.** Projects pivot all the time — the failure is when the pivot happens and the docs don't catch up.
3. **Full pivot = archive + new spec.** Don't edit the old plan in place; archive it so git history preserves what used to be true.
4. **Reset staleness on every check.** Even "on track" should touch plan.md so the auto-trigger resets.
5. **Don't skip the churn report.** Reading the diff stat is what makes this skill actually useful vs. "are the docs up to date? (yes/no)".
