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

### Write a spec that builds on an existing one

Use when extending or adding to a feature that already has a spec.

```
Use the spec-planner — I want to add [new capability] to [existing feature].
Build on docs/specs/<existing-spec>.md
```

Spec-planner reads the existing spec and includes a Prior Work section linking what the new spec builds on, assumes, and changes.

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

### Security audit on changed files

Use before deploying code that touches auth, payments, or user data.

```
Review all files changed in the last 5 commits for security issues:
1. SQL injection, XSS, command injection
2. Hardcoded secrets or API keys
3. Missing auth checks on new endpoints
4. Sensitive data in logs or error messages
5. CORS misconfiguration
Reference procedures/api-security-checklist.md if it exists.
```

---

## Architecture & Planning

### Map a codebase you've never seen

Use when starting work in an unfamiliar project or module.

```
Give me a 2-minute orientation of this codebase:
1. What's the tech stack? (read package.json, tsconfig, etc.)
2. What's the directory structure? (top 2 levels)
3. Where's the entry point?
4. Where do API routes live?
5. Where are the tests?
6. Any obvious patterns (MVC, feature folders, monorepo)?
Keep it under 30 lines.
```

### Dependency health check

Use periodically or before major upgrades.

```
Check the health of this project's dependencies:
1. List any with known vulnerabilities (npm audit / pip audit)
2. Flag packages that are 2+ major versions behind
3. Identify unused dependencies (installed but not imported)
4. Flag any that are deprecated or unmaintained
Present as a table: package | current | latest | status | action needed
```

### Find dead code

Use when the codebase feels bloated.

```
Find likely dead code in this project:
1. Exported functions/components that are never imported elsewhere
2. Files that nothing imports
3. Routes or endpoints with no references
4. Feature flags or config that are always on/off
Don't flag test files, type definitions, or entry points.
List each with the file path and why you think it's dead.
```

---

## Debugging

### Investigate a failing test

Use when a test fails and the cause isn't obvious.

```
[test name] is failing. Investigate:
1. Run the test and show the full error
2. Read the test to understand what it expects
3. Read the code it tests
4. Identify the mismatch — is the test wrong or the code wrong?
5. Propose a fix but don't apply it yet — let me decide
```

### Trace a bug from symptom to cause

Use when you have a symptom but no idea where to look.

```
I'm seeing [describe symptom]. Help me trace it:
1. What code paths could produce this behavior?
2. Add temporary logging to narrow it down (show me where)
3. Check git blame — did this area change recently?
4. Check for similar issues in the parking lot or git history
Don't fix anything yet — just find the root cause.
```

---

## Database

### Review a migration before running it

Use as a lightweight alternative to `/migration-check` for quick assessments.

```
Review this migration file before I run it:
1. Is it reversible? (does it have a rollback/down?)
2. Will it lock any tables? For how long on a [N]-row table?
3. Are defaults safe for existing rows?
4. Any data loss risk?
5. Should I run it during low traffic?
```

### Generate seed data

Use when you need realistic test data.

```
Generate seed data for [describe tables/entities]:
1. Create [N] realistic records (not "test123" garbage)
2. Respect foreign key relationships
3. Include edge cases: nulls where allowed, max-length strings, unicode
4. Output as SQL INSERT statements (or JSON if for an API)
5. Include a comment explaining what each edge case tests
```

---

## Git

### Untangle a messy branch

Use when a branch has accumulated unrelated changes.

```
This branch has gotten messy. Help me untangle it:
1. Show all commits since diverging from master
2. Group them by topic (what they actually change)
3. Suggest how to split into clean PRs or commits
4. Flag any commits that should have gone to a different branch
Don't rewrite history yet — just give me the plan.
```

### Write a changelog from commits

Use before releases or when summarizing a sprint.

```
Generate a changelog from commits between [ref] and HEAD:
1. Group by: features, fixes, refactors, docs
2. Write user-facing descriptions (not commit messages)
3. Skip chore/merge commits
4. Note any breaking changes
Format as markdown ready to paste into a release.
```
