# Claude Harness

A toolbox of optional skills, agents, and quality criteria for Claude Code. Use what helps, skip what doesn't.

## Quick Start

```bash
# Install to a project (auto-detects type)
/setup-harness

# Create project profile
/project-init
```

---

## Skills

### Setup

| Skill | What it does | Example |
|---|---|---|
| `setup-harness` | Installs harness files (criteria, agents, CLAUDE.md) into a project | `/setup-harness fullstack` |
| `project-init` | Creates `.harness-profile` — project metadata (audience, stakes, stack) | `/project-init` |

### Workflow

| Skill | What it does | Example |
|---|---|---|
| `session-start` | Loads project context, last exit note, parking lot. Asks for today's goal | `/session-start` |
| `session-end` | Checks pending commits, captures state, triages parking lot, saves to Second Brain | `/session-end` |
| `micro` | Frames a focused work block with one goal and time budget | `/micro "wire the /translate endpoint"` |
| `park` | Captures a side-quest to `parking_lot.md` without switching context | `/park "refactor the round loop"` |
| `commit` | Reviews staged changes, surfaces related parking lot items, commits, updates plan.md | `/commit` |

### Safety Checks

| Skill | What it does | Example |
|---|---|---|
| `deploy-check` | Validates env vars, secrets, rollback plan, monitoring before deploy | `/deploy-check` |
| `api-smoke-test` | Generates or runs curl/jq smoke tests against a live URL | `/api-smoke-test run http://localhost:3000` |
| `migration-check` | Reviews a DB migration for reversibility, locking, backfill safety | `/migration-check migrations/0042_add_email.sql` |
| `a11y-check` | Runs axe-core accessibility audit via Playwright | `/a11y-check http://localhost:3000` |

---

## Agents

Invoke by asking Claude to use them.

### `code-reviewer`

Adversarial code reviewer. Runs tests, checks types, finds real issues. Scores against `criteria/` rubrics if present. Not a polite rubber stamp.

```
"use the code-reviewer to review my changes"
"review src/lib/scheduler/ with the code-reviewer"
```

### `spec-planner`

Expands a rough idea into a full specification through discovery questions. Outputs an actionable spec to `docs/specs/`.

```
"use the spec-planner for the new billing dashboard"
```

### `project-tracker`

Saves session context (git state, files, specs, decisions) to Second Brain. Runs automatically at session-end. Can also be invoked manually.

```
"save this session with project-tracker"
"use project-tracker to backfill completed tasks from git history"
```

### `ui-evaluator` *(webapp/fullstack only)*

Tests a running app via Playwright. Takes screenshots, tests interactions, scores against criteria rubrics.

```
"use the ui-evaluator to test localhost:3000"
```

### `generator` *(webapp/fullstack only)*

Reads a spec and builds continuously — data layer, structure, functionality, polish. Commits working increments.

```
"use the generator to build from docs/specs/2026-04-02-dashboard.md"
```

---

## Skill Details

### `session-start`

Reads `.harness-profile`, last exit note, parking lot, and recent commits. Shows a context header and asks you to pick today's goal.

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

1. Checks for uncommitted changes — offers to run `/commit`
2. Shows session summary (commits, parking lot)
3. Asks how the day went (hit / partial / drifted / blocked)
4. Offers parking lot triage
5. Asks for tomorrow's first move
6. Writes exit note to `.harness-state/last_exit.md`
7. Runs project-tracker to save session to Second Brain

### `micro`

Frames a work block: one goal, one budget (10–90 min or done-condition). Side-quests go to `park`.

```
🎯 Micro-session open
Goal: wire the /translate endpoint to the profile store
Budget: 30m
Started: 14:22
⏰ End of budget: ~14:52
```

### `commit`

1. Checks staged changes
2. Scans parking lot for items related to staged files
3. If related items found — ask: resolve now or acknowledge?
4. Runs code-reviewer on staged diff
5. If issues found — **fix all / review individually / park all**
6. Commits
7. Updates `plan.md` if the commit moves a plan item forward

Max 2 re-review rounds to prevent loops. Parked items tagged `[code-review]`.

### `park`

Appends one line to `parking_lot.md` with date and source context. That's it — fast capture, no context switch.

```
- [2026-04-12] glossary-patcher returns undefined on empty input (source: micro — wire translate endpoint)
```

---

## Files

| File | Purpose |
|---|---|
| `.harness-profile` | Project metadata (type, audience, stakes, stack). Read by session-start |
| `parking_lot.md` | Side-quests and deferred issues. Append via `park`, triage at session-end |
| `plan.md` | Project plan. Written by spec-planner, updated by commit skill |
| `criteria/` | Quality rubrics used by code-reviewer and ui-evaluator |
| `procedures/api-security-checklist.md` | API security reference checklist |
| `.harness-state/last_exit.md` | Exit note from last session. Read by session-start |

### Criteria files

| File | Installed for |
|---|---|
| `code-architecture.md` | All projects |
| `data-integrity.md` | All except script/tooling |
| `frontend-ui-design.md` | Webapp, fullstack |
| `performance-accessibility.md` | Webapp, fullstack |
| `ux-user-flows.md` | Webapp, fullstack |

---

## Architecture

```
~/.claude/                          # User-level (all projects)
├── agents/
│   ├── code-reviewer.md
│   ├── spec-planner.md
│   └── project-tracker.md
├── skills/                         # Optional workflow skills
│   ├── session-start/
│   ├── session-end/
│   ├── micro/
│   ├── park/
│   ├── commit/
│   ├── project-init/
│   ├── deploy-check/
│   ├── api-smoke-test/
│   ├── migration-check/
│   └── a11y-check/

your-project/                       # Project-level
├── .claude/agents/
│   ├── ui-evaluator.md             # Webapp/fullstack only
│   └── generator.md                # Webapp/fullstack only
├── .harness-profile
├── parking_lot.md
├── criteria/
├── procedures/
└── CLAUDE.md
```

## License

MIT
