# Claude Harness — Toolbox Reference

Everything here is optional. Use what helps, skip what doesn't.

---

## Setup Tools

### `setup-harness`

Installs harness files (criteria, agents, CLAUDE.md) into a project. Auto-detects project type or accepts one as argument.

**When to use:** Once, when starting a new project or adding harness to an existing one.

```
/setup-harness fullstack
/setup-harness          # auto-detects type
```

### `project-init`

Creates `.harness-profile` — a YAML file capturing your project's audience, stakes, quality bar, and stack. Other tools (like `session-start`) read this for context.

**When to use:** Once per project, right after `setup-harness`.

```
/project-init
/project-init --force   # regenerate an existing profile
```

**Output:** `.harness-profile` in project root.

---

## Workflow Tools

### `session-start`

Loads project context at the start of a work session: reads your profile, last exit note, parking lot, recent commits. Asks you to pick today's goal.

**When to use:** Beginning of a coding day or when sitting down to work after a break.

```
/session-start
```

**Example output:**
```
## Session context — finflow-deck (fullstack)
Stakes: high — B2B financial product
Last session ended: 2026-04-11
Open parking lot items: 3

### Where you left off
> Tomorrow's first move: wire the /translate endpoint
```

### `session-end`

Captures what you did, what's unfinished, and what to do next. Writes `last_exit.md` so the next `session-start` can pick up where you left off.

**When to use:** End of a coding day, before closing the laptop.

```
/session-end
```

### `micro`

Frames a focused work block with one goal and a time budget. Keeps you from drifting into side-quests.

**When to use:** When starting a chunk of work and you want focus. Good for 10–60 minute blocks.

```
/micro "wire the /translate endpoint to the profile store"
/micro                  # asks you for the goal interactively
```

**Example frame:**
```
🎯 Micro-session open
Goal: wire the /translate endpoint to the profile store
Budget: 30m
Started: 14:22

Rules for this block:
- Side-quests go to park
- Commit before ending
```

### `park`

Captures a side-quest or unplanned issue to `parking_lot.md` without switching context. One line, keep going.

**When to use:** Anytime you notice something that isn't your current task — a bug, a refactor idea, a question to investigate later.

```
/park "glossary-patcher returns undefined on empty input"
/park "add retry logic to Anthropic SDK calls"
/park                   # asks you interactively
```

**Output:** One line appended to `parking_lot.md`:
```
- [2026-04-12] glossary-patcher returns undefined on empty input (source: micro — wire translate endpoint)
```

---

## Safety Check Tools

### `deploy-check`

Validates deployment readiness: env vars, secrets, rollback plan, smoke test, monitoring. Catches the things you forget at 5pm on a Friday.

**When to use:** Before any production deploy.

```
/deploy-check
```

**What it checks:**
- Required env vars are set (not placeholders)
- No hardcoded secrets in code
- Rollback plan exists
- Smoke test script exists and is runnable
- Monitoring/alerting is configured

### `api-smoke-test`

Generates or runs a curl/jq-based bash script that tests your API's critical paths against a live URL.

**When to use:** After deploying, or when you want a quick end-to-end sanity check.

```
/api-smoke-test generate            # creates the smoke test script
/api-smoke-test run http://localhost:3000  # runs it against a URL
```

### `migration-check`

Reviews a database migration file for safety: reversibility, concurrent-write safety, backfill behavior, index locking.

**When to use:** Before running any schema change in production.

```
/migration-check migrations/0042_add_user_email.sql
/migration-check       # asks which file to check
```

**What it checks:**
- Is the migration reversible (has a down/rollback)?
- Will it lock tables under concurrent writes?
- Are backfills safe for large tables?
- Are new indexes created concurrently?

### `a11y-check`

Runs an accessibility audit using axe-core via Playwright. Flags WCAG violations on your pages.

**When to use:** For webapp/fullstack projects, after building UI features.

```
/a11y-check http://localhost:3000
/a11y-check http://localhost:3000/dashboard,http://localhost:3000/settings
```

---

## Agents

Agents are invoked by asking Claude to use them, not via slash commands.

### `code-reviewer`

Adversarial code reviewer. Runs tests, checks types, finds real issues. Not a polite rubber stamp.

**When to use:** After implementing a feature, fixing a bug, or before committing.

```
"use the code-reviewer to review my changes"
"review this PR with the code-reviewer"
```

### `spec-planner`

Product planner that expands a rough idea into a full specification through discovery questions. Outputs an actionable spec a coding agent can build from.

**When to use:** When starting a new feature or module — before writing any code.

```
"use the spec-planner for the new billing dashboard"
"plan out the notification system with spec-planner"
```

### `project-tracker`

Saves the current session's context (git state, files touched, specs, decisions) to Second Brain for later resumption.

**When to use:** Before commits when meaningful work was done, or when switching between projects.

```
"save this session with project-tracker"
"track this work before I switch to the other repo"
```

---

## Files

### `.harness-profile`

YAML file in project root. Captures project metadata: type, audience, stakes, quality bar, stack. Read by `session-start` for context injection.

### `parking_lot.md`

Plain markdown file tracking side-quests and unplanned issues. Append-only during work (via `park`), triage at end of day. Committed to git so history is visible.

### `criteria/`

Quality rubrics used by the `code-reviewer` agent to score code. Installed per project type:

| File | Installed for |
|---|---|
| `code-architecture.md` | All projects |
| `data-integrity.md` | All except script/tooling |
| `frontend-ui-design.md` | Webapp, fullstack |
| `performance-accessibility.md` | Webapp, fullstack |
| `ux-user-flows.md` | Webapp, fullstack |

### `procedures/api-security-checklist.md`

Standalone security checklist for API projects. Reference doc, not enforced.
