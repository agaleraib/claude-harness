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

**Tooling** is for repos that distribute skills, agents, procedures, or methodology to other projects (meta-repos like claude-harness itself). They have no runtime app but still benefit from session discipline and pivot-check.

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

### Tooling gets:

```bash
mkdir -p criteria
cp -n ~/.claude/harness/criteria/code-architecture.md criteria/
```

- Only `criteria/code-architecture.md` (no data-integrity — tooling repos have no runtime data)
- No `data-integrity.md`, no UI agents, no MCP
- **Still gets** procedures/ (subset — see Step 3c), methodology.md, and drift hook — unlike script
- **Self-install safeguard:** if the target directory is `~/.claude/harness/` (this very repo), use `cp -n` everywhere so the skill is a no-op on files that already exist (which is the whole source directory)

## Step 3b: Install universal workflow skills (user-level)

The methodology skills apply across every project. Install them user-level if missing:

**Layer 1 — session discipline (every project):**
- `project-init` — one-time profile setup
- `session-start` — open a coding day
- `micro` — frame a focused work block
- `park` — log a side-quest without derailing
- `session-end` — exit ritual

**Layer 2 — stage skills (invoke per phase as needed):**
- `deploy-check` — Deploy-phase readiness validation
- `api-smoke-test` — end-to-end curl/jq smoke test
- `migration-check` — DB migration safety
- `a11y-check` — axe-core a11y audit
- `pivot-check` — roadmap drift detection

Install loop:

```bash
mkdir -p ~/.claude/skills
for skill in project-init session-start micro park session-end \
             deploy-check api-smoke-test migration-check a11y-check pivot-check; do
  if [ ! -f ~/.claude/skills/$skill/SKILL.md ]; then
    mkdir -p ~/.claude/skills/$skill
    cp ~/.claude/harness/skills/$skill/SKILL.md ~/.claude/skills/$skill/
  fi
done
```

If the files already exist, skip them (user may have customized). Never overwrite user-level skills silently.

## Step 3c: Install procedures/ (project-level reference docs)

Phase checklists and security checklist are reference documents used by phase gates. Copy the full `procedures/` directory into the project so phase gates can reference them without depending on harness source path:

```bash
mkdir -p procedures
cp -n ~/.claude/harness/procedures/phase-*.md procedures/
cp -n ~/.claude/harness/procedures/api-security-checklist.md procedures/
cp -n ~/.claude/harness/procedures/cheatsheet.md procedures/
```

`cp -n` = no-clobber (don't overwrite existing files). If the project already has customized procedures, leave them alone.

**Script projects skip procedures/** — phase gates are overkill for one-off scripts.

**Tooling projects get a subset:**

```bash
mkdir -p procedures
cp -n ~/.claude/harness/procedures/phase-1-architect.md procedures/
cp -n ~/.claude/harness/procedures/phase-2-code.md procedures/
cp -n ~/.claude/harness/procedures/phase-3-test.md procedures/
cp -n ~/.claude/harness/procedures/cheatsheet.md procedures/
# Tooling SKIPS: phase-4-deploy.md, api-security-checklist.md (no runtime to deploy or secure)
```

## Step 3d: Generate docs/methodology.md (per-project operating manual)

The methodology template is at `~/.claude/harness/procedures/methodology-template.md`. It contains the 4-phase guide, daily flow, and key-file reference. Customize it for this project type by substituting placeholders and stripping conditional sections.

```bash
mkdir -p docs
```

Read the template and produce `docs/methodology.md` with these substitutions:

| Placeholder | Replacement |
|---|---|
| `{{PROJECT_NAME}}` | Project name (from package.json, pyproject.toml, or directory basename) |
| `{{PROJECT_TYPE}}` | `backend` \| `webapp` \| `fullstack` \| `script` |
| `{{DATE}}` | Today's date in YYYY-MM-DD |
| `{{ARCH_REQUIRED_NOTE}}` | Empty string for backend/webapp/fullstack; `(optional for script projects)` for script |

**Strip conditional sections:**

The template has HTML-comment markers like `<!-- IF webapp OR fullstack -->` ... `<!-- END webapp OR fullstack -->`. Process them:

- `<!-- IF webapp OR fullstack -->` — keep the enclosed content only if type ∈ {webapp, fullstack}
- `<!-- IF backend OR webapp OR fullstack -->` — keep only if type ∈ {backend, webapp, fullstack}
- Any other `IF <condition>` — evaluate against project type and keep/strip accordingly

After substitution + stripping, write the result to `docs/methodology.md`. **Only create it if it doesn't already exist** — never overwrite a user-customized methodology doc without asking.

**Script projects** get a simpler methodology (since they skip Deploy phase and have no UI/API/DB). You may either generate a minimal version or skip this step entirely for scripts — recommended: skip.

**Tooling projects** get a 3-phase methodology (Architect → Code → Test, no Deploy). The template has conditional markers `<!-- IF NOT tooling -->` around Deploy-phase content that get stripped for this type.

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

## Step 5b: Wire drift-detector hook into project settings.json

The drift detector fires on Claude Code `Stop` events (end of each turn), checks session state, and prompts when drift signals are tripped. Wire it into the project's `.claude/settings.json`:

```bash
mkdir -p .claude
```

**Case 1: `.claude/settings.json` does not exist** — create it:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/harness/scripts/drift-detector.sh"
          }
        ]
      }
    ]
  }
}
```

**Case 2: `.claude/settings.json` exists** — merge carefully. If it has `hooks.Stop`, APPEND a new entry to the Stop array; do NOT replace existing hooks. If it has `hooks` but no `Stop`, add the Stop key. Use `jq` if available:

```bash
if command -v jq >/dev/null 2>&1; then
  tmp=$(mktemp)
  jq '.hooks.Stop = ((.hooks.Stop // []) + [{
    "matcher": "",
    "hooks": [{ "type": "command", "command": "bash ~/.claude/harness/scripts/drift-detector.sh" }]
  }])' .claude/settings.json > "$tmp" && mv "$tmp" .claude/settings.json
else
  echo "⚠️  jq not installed — showing you the JSON to merge manually:"
  # print the snippet above and tell the user to add it to .claude/settings.json
fi
```

**Script projects skip the drift hook** — no phase gates, no session rituals, so no signals to detect.

**Tooling projects get the drift hook** — methodology repos absolutely need pivot-check and session discipline. Profile defaults to `drift_sensitivity: low` and `pivot_check_auto_days: 30` (methodology changes slowly).

Check if the hook is already wired (idempotent):

```bash
grep -q "drift-detector.sh" .claude/settings.json 2>/dev/null && echo "Drift hook already wired"
```

## Step 6: Verify Global Git Hook (first-time only)

The global post-commit hook is installed once and applies to all repos automatically. Only check if it's missing:

```bash
git config --global core.hooksPath 2>/dev/null
```

If empty, this is a first-time setup — install it:

```bash
mkdir -p ~/.git-hooks
cp ~/.claude/harness/scripts/git-post-commit.sh ~/.git-hooks/post-commit
chmod +x ~/.git-hooks/post-commit
git config --global core.hooksPath ~/.git-hooks
```

If already set, skip this step entirely. The hook is global — no per-project action needed.

## Step 7: Update Harness Source

Check if the local harness is outdated:

```bash
cd ~/.claude/harness && git fetch origin && git log HEAD..origin/master --oneline 2>/dev/null
```

If there are new commits, inform the user:

> Your harness source is behind by X commits. Run `cd ~/.claude/harness && git pull` to update.

## Step 8: Summary

Report what was installed:

```
## Harness Setup Complete

**Project type:** [type]  (one of: backend | webapp | fullstack | script | tooling)
**Directory:** [cwd]

### Installed (project-level):
- criteria/code-architecture.md
- criteria/data-integrity.md
- procedures/ (phase checklists + api-security-checklist)   [skipped for script]
- docs/methodology.md (per-project operating manual)        [skipped for script]
- .claude/settings.json (drift-detector hook wired)          [skipped for script]
- [any additional type-specific files — ui-evaluator, generator, .mcp.json with playwright]

### Installed (user-level, first-time only):
- ~/.claude/agents/code-reviewer.md
- ~/.claude/agents/spec-planner.md
- ~/.claude/agents/project-tracker.md
- ~/.claude/skills/project-init/ — one-time profile setup
- ~/.claude/skills/session-start/ — open a coding day
- ~/.claude/skills/micro/ — frame a focused work block
- ~/.claude/skills/park/ — log a side-quest without derailing
- ~/.claude/skills/session-end/ — exit ritual, writes next session's starter
- ~/.claude/skills/deploy-check/ — Deploy-phase readiness validation
- ~/.claude/skills/api-smoke-test/ — end-to-end curl/jq smoke test
- ~/.claude/skills/migration-check/ — DB migration safety
- ~/.claude/skills/a11y-check/ — axe-core a11y audit (webapp/fullstack only)
- ~/.claude/skills/pivot-check/ — roadmap drift detection

### Automation:
- Global post-commit hook — updates Second Brain on every commit
- Drift-detector hook — fires on every Claude Code Stop event   [skipped for script]
- Project-tracker agent — captures specs, plans, session notes proactively

### Next step — RUN THIS NOW:

👉 **`project-init`** — writes `.harness-profile` with audience/stakes/quality bar/stack.
   Without the profile, session-start and drift-detector won't activate.

### After that — your daily flow:
- Morning: `session-start` → pick today's ONE goal
- During work: `micro` (open block) → work → commit → repeat
- Side-quests surface: `park "<what>"` → keep going
- End of day: `session-end` → exit ritual, writes tomorrow's starter

### Reference tools (invoke when needed):
- Code review: "use the code-reviewer to review this"
- New feature spec: "use the spec-planner"
[- UI testing: "use the ui-evaluator to test localhost:3000"  (webapp/fullstack only)]
[- Sustained builds: "use the generator to build from the spec"  (webapp/fullstack only)]
```
