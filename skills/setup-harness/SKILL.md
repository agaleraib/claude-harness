---
name: setup-harness
description: Set up Claude Code harness (agents, criteria, CLAUDE.md) for the current project. Detects project type automatically or accepts a type argument. Use when starting a new project or adding harness to an existing one.
argument-hint: "[backend|webapp|fullstack|script|auto]"
---

# Setup Harness

Install the right agents, criteria, and CLAUDE.md for the current project directory.

**Harness source:** `~/.claude/harness/` (cloned from `agaleraib/claude-harness`)

## Step 1: Detect or Ask Project Type

If `$ARGUMENTS` is provided and is one of `backend`, `webapp`, `fullstack`, `script`, `tooling`, or `auto`, use that. Otherwise, detect automatically.

### Auto-detection rules

Examine the current working directory for these signals, **in order** — the first match wins:

| # | Signal | Detected Type |
|---|---|---|
| 1 | Top-level `skills/` OR `procedures/` OR `.claude/agents/` **AND** no `package.json` with app dependencies AND no `src/` with app code | **tooling** |
| 2 | `next.config.*`, `nuxt.config.*`, `vite.config.*`, `svelte.config.*`, `angular.json` | **webapp** |
| 3 | `package.json` with `react`, `vue`, `svelte`, `angular` in dependencies | **webapp** |
| 4 | `src/` with `.tsx`/`.jsx` files | **webapp** |
| 5 | `package.json` with NO frontend framework + has `express`, `fastify`, `hono`, `koa` | **backend** |
| 6 | `requirements.txt`, `pyproject.toml`, `Cargo.toml`, `go.mod` (no frontend signals) | **backend** |
| 7 | Both frontend framework AND backend framework detected | **fullstack** |
| 8 | Single `.py`, `.ts`, `.sh` file or `scripts/` directory, no `src/`, no tooling signals | **script** |
| 9 | `plan.md` or `docs/plan.md` exists (new project with spec, nothing built yet) | Ask the user |

If detection is ambiguous, use `AskUserQuestion` to confirm:

> I detected [signals]. This looks like a **[type]** project. Is that right, or would you classify it differently?
> 
> - **backend** — API, service, bot, CLI tool, data pipeline (no browser UI)
> - **webapp** — Web application with a user interface (React, Next.js, Vue, etc.)
> - **fullstack** — Both backend API and frontend UI in the same repo
> - **script** — Small utility, automation, or one-off script
> - **tooling** — Harness / methodology repo (distributes skills/agents/procedures to other projects)

## Step 2: Check What Already Exists

Before copying anything, check what's already in place:

```bash
ls -la criteria/ 2>/dev/null
ls -la .claude/agents/ 2>/dev/null
ls -la CLAUDE.md 2>/dev/null
ls -la .mcp.json 2>/dev/null
```

If files already exist, ask before overwriting:

> These harness files already exist:
> - `criteria/code-architecture.md`
> - `CLAUDE.md`
> 
> Should I overwrite them, skip them, or merge (add missing pieces only)?

## Step 3: Install Based on Type

### All types get:

```bash
mkdir -p criteria
cp ~/.claude/harness/criteria/code-architecture.md criteria/
cp ~/.claude/harness/criteria/data-integrity.md criteria/
```

### Backend additionally gets:

Nothing extra. The user-level agents (code-reviewer, spec-planner in `~/.claude/agents/`) handle everything.

### Webapp additionally gets:

```bash
mkdir -p .claude/agents
cp ~/.claude/harness/.claude/agents/ui-evaluator.md .claude/agents/
cp ~/.claude/harness/.claude/agents/generator.md .claude/agents/
cp ~/.claude/harness/criteria/frontend-ui-design.md criteria/
cp ~/.claude/harness/criteria/performance-accessibility.md criteria/
cp ~/.claude/harness/criteria/ux-user-flows.md criteria/
```

Also create `.mcp.json` with Playwright if it doesn't exist:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

If `.mcp.json` already exists, MERGE the playwright server into it — don't overwrite existing servers.

### Fullstack gets everything webapp gets.

### Script gets:

Only `criteria/code-architecture.md`. No data-integrity, no agents, no MCP.

### Tooling gets:

Only `criteria/code-architecture.md` (`cp -n` to avoid overwriting source).

## Step 3b: Install procedures (project-level)

```bash
mkdir -p procedures
cp -n ~/.claude/harness/procedures/api-security-checklist.md procedures/
```

**Script and tooling projects skip this.**

## Step 3c: Install user-level skills (if missing)

Skills are optional tools the user can invoke when they want structure:

```bash
mkdir -p ~/.claude/skills
for skill in project-init session-start micro park session-end \
             deploy-check api-smoke-test migration-check a11y-check; do
  if [ ! -f ~/.claude/skills/$skill/SKILL.md ]; then
    mkdir -p ~/.claude/skills/$skill
    cp ~/.claude/harness/skills/$skill/SKILL.md ~/.claude/skills/$skill/
  fi
done
```

Never overwrite existing user-level skills — the user may have customized them.

## Step 4: Generate CLAUDE.md

If `CLAUDE.md` doesn't exist (or user chose to overwrite), generate a lean one based on detected stack.

**Detection:**

| File | Stack Signal |
|---|---|
| `bun.lockb`, `bunfig.toml` | Bun runtime |
| `package-lock.json` | npm |
| `pnpm-lock.yaml` | pnpm |
| `yarn.lock` | Yarn |
| `requirements.txt`, `pyproject.toml` | Python |
| `Cargo.toml` | Rust |
| `go.mod` | Go |
| `tsconfig.json` | TypeScript |
| `next.config.*` | Next.js |
| `package.json` scripts | Extract build/test/lint commands |

Read `package.json` (or equivalent) to extract actual build, test, and lint commands. Do NOT guess — use what the project actually has.

**Template (adapt based on stack):**

```markdown
# [Project Name from package.json or directory name]

## Build & Test
[Actual commands from package.json scripts or detected build tool]

## Conventions
- [Only rules Claude would get wrong without being told]
- [Framework-specific gotchas if any]

## Verification
After changes: `[build command] && [test command]`
```

**CLAUDE.md rules:**
- Under 50 lines for most projects
- Only include what Claude can't figure out from reading the code
- No self-evident rules like "write clean code"
- Include build/test commands (Claude can't always guess these)

## Step 5: Verify User-Level Agents

Check that the universal agents are installed:

```bash
ls ~/.claude/agents/code-reviewer.md 2>/dev/null
ls ~/.claude/agents/spec-planner.md 2>/dev/null
ls ~/.claude/agents/project-tracker.md 2>/dev/null
```

If missing, install them:

```bash
mkdir -p ~/.claude/agents
cp ~/.claude/harness/.claude/agents/code-reviewer.md ~/.claude/agents/
cp ~/.claude/harness/.claude/agents/spec-planner.md ~/.claude/agents/
cp ~/.claude/harness/.claude/agents/project-tracker.md ~/.claude/agents/
```

## Step 6: Verify Global Git Hook (first-time only)

```bash
git config --global core.hooksPath 2>/dev/null
```

If empty and `~/.claude/harness/scripts/git-post-commit.sh` exists, install it:

```bash
mkdir -p ~/.git-hooks
cp ~/.claude/harness/scripts/git-post-commit.sh ~/.git-hooks/post-commit
chmod +x ~/.git-hooks/post-commit
git config --global core.hooksPath ~/.git-hooks
```

If already set, skip entirely.

## Step 7: Update Harness Source

```bash
cd ~/.claude/harness && git fetch origin && git log HEAD..origin/master --oneline 2>/dev/null
```

If behind, inform the user:

> Your harness source is behind by X commits. Run `cd ~/.claude/harness && git pull` to update.

## Step 8: Summary

```
## Harness Setup Complete

**Project type:** [type]
**Directory:** [cwd]

### Installed (project-level):
- criteria/ (quality rubrics)
- procedures/api-security-checklist.md  [if not script/tooling]
- CLAUDE.md (build/test/conventions)
- [webapp/fullstack: .claude/agents/ui-evaluator.md, generator.md, .mcp.json, extra criteria]

### Installed (user-level, if missing):
- ~/.claude/agents/ (code-reviewer, spec-planner, project-tracker)
- ~/.claude/skills/ (session-start, session-end, micro, park, project-init, deploy-check, api-smoke-test, migration-check, a11y-check)

### Next step:
👉 **`project-init`** — writes `.harness-profile` with audience/stakes/quality bar/stack.

### Available tools (use when you want them):
- `session-start` — context injection at start of day
- `micro` — frame a focused work block
- `park` — capture side-quests without derailing
- `session-end` — exit notes for future-you
- `deploy-check`, `api-smoke-test`, `migration-check`, `a11y-check` — safety checks
- Code review: "use the code-reviewer to review this"
- New feature spec: "use the spec-planner"
[- UI testing: "use the ui-evaluator"  (webapp/fullstack only)]
[- Sustained builds: "use the generator"  (webapp/fullstack only)]
```
