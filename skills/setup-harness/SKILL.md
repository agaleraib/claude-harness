---
name: setup-harness
description: Set up Claude Code harness (agents, criteria, CLAUDE.md) for the current project. Detects project type automatically or accepts a type argument. Use when starting a new project or adding harness to an existing one.
disable-model-invocation: true
argument-hint: "[backend|webapp|fullstack|script|auto]"
---

# Setup Harness

Install the right agents, criteria, and CLAUDE.md for the current project directory.

**Harness source:** `~/.claude/harness/` (cloned from `agaleraib/claude-harness`)

## Step 1: Detect or Ask Project Type

If `$ARGUMENTS` is provided and is one of `backend`, `webapp`, `fullstack`, `script`, or `auto`, use that. Otherwise, detect automatically.

### Auto-detection rules

Examine the current working directory for these signals:

| Signal | Detected Type |
|---|---|
| `next.config.*`, `nuxt.config.*`, `vite.config.*`, `svelte.config.*`, `angular.json` | **webapp** |
| `package.json` with `react`, `vue`, `svelte`, `angular` in dependencies | **webapp** |
| `src/` with `.tsx`/`.jsx` files | **webapp** |
| `package.json` with NO frontend framework + has `express`, `fastify`, `hono`, `koa` | **backend** |
| `requirements.txt`, `pyproject.toml`, `Cargo.toml`, `go.mod` (no frontend signals) | **backend** |
| Both frontend framework AND backend framework detected | **fullstack** |
| Single `.py`, `.ts`, `.sh` file or `scripts/` directory, no `src/` | **script** |
| `plan.md` or `docs/plan.md` exists (new project with spec, nothing built yet) | Ask the user |

If detection is ambiguous, use `AskUserQuestion` to confirm:

> I detected [signals]. This looks like a **[type]** project. Is that right, or would you classify it differently?
> 
> - **backend** — API, service, bot, CLI tool, data pipeline (no browser UI)
> - **webapp** — Web application with a user interface (React, Next.js, Vue, etc.)
> - **fullstack** — Both backend API and frontend UI in the same repo
> - **script** — Small utility, automation, or one-off script

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

These are universal — every project benefits from code quality and data integrity rubrics.

### Backend additionally gets:

Nothing extra. The user-level agents (code-reviewer, spec-planner in `~/.claude/agents/`) handle everything. Backend projects stay lean.

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

Only `criteria/code-architecture.md`. No data-integrity (overkill for scripts), no agents, no MCP.

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

## Step 6: Install Global Git Hook

Check if the post-commit hook is installed:

```bash
ls ~/.git-hooks/post-commit 2>/dev/null
git config --global core.hooksPath 2>/dev/null
```

If missing, install it:

```bash
mkdir -p ~/.git-hooks
cp ~/.claude/harness/scripts/git-post-commit.sh ~/.git-hooks/post-commit
chmod +x ~/.git-hooks/post-commit
git config --global core.hooksPath ~/.git-hooks
```

**What this does:** Every `git commit` in any repo automatically updates the matching Second Brain project — commit hash, dirty files, and task completion via commit message matching. Runs silently in the background, never slows down commits.

**Warning:** Setting `core.hooksPath` means per-repo `.git/hooks/` are ignored. If any repo has custom hooks there, inform the user before proceeding.

## Step 7: Update Harness Source

Check if the local harness is outdated:

```bash
cd ~/.claude/harness && git fetch origin && git log HEAD..origin/master --oneline 2>/dev/null
```

If there are new commits, inform the user:

> Your harness source is behind by X commits. Run `cd ~/.claude/harness && git pull` to update.

## Step 7: Summary

Report what was installed:

```
## Harness Setup Complete

**Project type:** [type]
**Directory:** [cwd]

### Installed:
- criteria/code-architecture.md
- criteria/data-integrity.md
- [any additional files]

### Already available (user-level):
- ~/.claude/agents/code-reviewer.md — "use the code-reviewer to check my changes"
- ~/.claude/agents/spec-planner.md — "use the spec-planner for [feature idea]"
- ~/.claude/agents/project-tracker.md — runs proactively before commits

### Automation:
- Global post-commit hook — updates Second Brain on every commit
- Project-tracker agent — captures specs, plans, session notes proactively

### Quick start:
- Review and edit CLAUDE.md to add project-specific conventions
- After coding: "use the code-reviewer to review this"
- Before new features: "use the spec-planner"
[- For UI work: "use the ui-evaluator to test localhost:3000"  (webapp/fullstack only)]
[- For sustained builds: "use the generator to build from the spec"  (webapp/fullstack only)]
```
