# Claude Code Harness

A lean agent harness for Claude Code, designed for Opus 4.6's native capabilities. Inspired by [Anthropic's harness design research](https://www.anthropic.com/engineering/harness-design-long-running-apps) and adapted based on their [best practices documentation](https://code.claude.com/docs/en/best-practices).

## Philosophy

> *"Every component in a harness encodes an assumption about what the model can't do on its own, and those assumptions are worth stress testing."*
> — Anthropic Engineering

Opus 4.6 plans carefully, sustains long tasks, debugs effectively, and follows conventions without step-by-step instructions. This harness **doesn't tell the model HOW to think** — it tells the model **WHAT to check against**.

### What This Is
- Adversarial evaluation agents that catch what self-assessment misses
- Scoring rubrics that define measurable quality standards
- A spec-planner that ensures requirements are clear before coding starts

### What This Is NOT
- Process enforcement skills (Opus 4.6 plans and debugs natively)
- Step-by-step checklists loaded into every session
- Elaborate workflow orchestration that fights the model's reasoning

### Why Not Superpowers / Heavy Skill Systems?

Research and production experience show that heavy instruction systems degrade Opus 4.6 performance:

- **Context bloat**: 22k+ tokens of skills loaded at startup = 11% of context consumed before any work begins ([GitHub Issue #190](https://github.com/obra/superpowers/issues/190))
- **Instruction ignoring**: Opus 4.6 systematically ignores CLAUDE.md and skills under load ([#23936](https://github.com/anthropics/claude-code/issues/23936), [#28158](https://github.com/anthropics/claude-code/issues/28158))
- **Negative ROI on process skills**: AGENTbench research (arXiv:2602.11988) found LLM-generated context files *decreased* success rates
- **Anthropic's own conclusion**: With Opus 4.6, they removed sprint decomposition, reduced evaluator rounds, and simplified the generator — scaffolding that was essential for earlier models became counterproductive

**This harness keeps context overhead under 500 tokens at session start** (agent descriptions only). Full agent content loads only when invoked.

---

## Architecture

```
~/.claude/                          # User-level (ALL projects)
├── agents/
│   ├── code-reviewer.md            # Adversarial code reviewer (tests + types + review)
│   ├── project-tracker.md          # Save/resume sessions via Second Brain
│   └── spec-planner.md             # Discovery-based specification writer
│
your-project/                       # Project-level (specific projects)
├── .claude/
│   └── agents/
│       ├── ui-evaluator.md         # Playwright-based UI testing (web apps only)
│       └── generator.md            # Sustained builder (web apps only)
├── criteria/                       # Quality rubrics (choose per project)
│   ├── code-architecture.md        # ALL projects
│   ├── data-integrity.md           # ALL projects
│   ├── frontend-ui-design.md       # Web apps only
│   ├── performance-accessibility.md # Web apps only
│   └── ux-user-flows.md            # Web apps only
├── scripts/
│   └── git-post-commit.sh          # Global post-commit hook for Second Brain
├── CLAUDE.md                       # Build commands + non-obvious conventions
└── .mcp.json                       # Playwright MCP (web apps only)
```

### Scope Rules

| Agent | Location | Available In |
|---|---|---|
| **code-reviewer** | `~/.claude/agents/` | Every project, always |
| **spec-planner** | `~/.claude/agents/` | Every project, always |
| **project-tracker** | `~/.claude/agents/` | Every project, always |
| **ui-evaluator** | `<project>/.claude/agents/` | That project only |
| **generator** | `<project>/.claude/agents/` | That project only |

Criteria files live per-project because quality dimensions differ (a cron job doesn't need UI design rubrics).

---

## Agents

### code-reviewer (Universal)

**What it does:** Runs tests, checks types, reviews code adversarially. Scores against `criteria/` if present.

**When to use:** After implementing a feature, fixing a bug, or before committing. Works on any code — backend, frontend, scripts, infrastructure.

**How to invoke:**
```
Use the code-reviewer to review my changes
```
Or more specifically:
```
Use the code-reviewer to review src/lib/scheduler/ — I refactored the job runner
```

**What it does NOT do:** Fix code. It reports problems with enough specificity that fixes are obvious.

---

### spec-planner (Universal)

**What it does:** Interviews you about your idea (1-3 rounds of questions), then writes a detailed spec with testable requirements, data model, build phases, and explicit out-of-scope section.

**When to use:** Before starting any non-trivial feature or module. If the diff would be more than ~50 lines, spec it first.

**How to invoke:**
```
Use the spec-planner — I want to add a webhook notification system
```

**Output:** Writes spec to `docs/specs/YYYY-MM-DD-<topic>.md`.

**What it does NOT do:** Write code or implementation plans. It defines WHAT to build, not HOW.

---

### project-tracker (Universal, Proactive)

**What it does:** Saves the current Claude Code session as a project in Second Brain for later resumption. Auto-gathers git state, recent commits, files changed, specs, and plan content. Creates or updates the project with branch/workstream tracking.

**When it runs:** Proactively — before commits when meaningful work was done (new features, bug fixes, spec changes). No manual invocation needed. Can also be invoked explicitly.

**How it works:**
- **CREATE mode** (new repo, no project in SB): Gathers context, asks for project name + priority (only questions it asks), creates the project via SB API with repo and branch linked, saves spec/plan content, creates tasks from plan files
- **UPDATE mode** (project exists for this repo): Refreshes the branch's context snapshot, marks completed tasks, adds a session note — all silently, no questions asked

**Communication:** Direct HTTP calls to the Second Brain API (`curl`). No MCP dependency — works in any repo without special configuration.

**Complementary automation:** A global git `post-commit` hook (`~/.git-hooks/post-commit`) handles updates outside Claude Code sessions — manual commits, cron snapshots, other tools. It updates commit hash, dirty files, and auto-completes tasks by matching commit messages. The agent and hook write to the same API and don't conflict.

**Prerequisites:**
- Second Brain API reachable (default: `http://10.1.10.82:3001`, override with `SB_URL` env var)
- A git repository (the agent reads branch, commits, and diff)

**What it does NOT do:** Fix code or make decisions. It only records state.

---

### ui-evaluator (Web Apps Only)

**What it does:** Launches Playwright, navigates your running app, takes screenshots, tests every interaction, and scores against all `criteria/` rubrics. Reports with specific evidence (hex values, pixel measurements, viewport sizes).

**When to use:** After the generator completes a build, or after you've made significant UI changes.

**Prerequisites:**
- A running dev server (typically `localhost:3000`)
- Playwright MCP configured in `.mcp.json`
- Criteria files in `criteria/`

**How to invoke:**
```
Use the ui-evaluator to test the app running on localhost:3000
```

**What it does NOT do:** Fix code. It's the critic, not the fixer.

---

### generator (Web Apps Only)

**What it does:** Reads a spec from `docs/specs/` or `docs/plan.md` and builds continuously — data layer first, then structure, then functionality, then polish. Commits working increments. Iterates on evaluator feedback.

**When to use:** For sustained multi-feature web app builds where you want the full plan → build → evaluate loop.

**How to invoke:**
```
Use the generator to implement the spec in docs/specs/2026-04-02-dashboard.md
```

---

## Criteria

Criteria files define what "good" means with specific, scorable dimensions. The evaluator and code-reviewer use these as their grading rubric.

### For ALL Projects

| File | What It Scores | Key Dimensions |
|---|---|---|
| `code-architecture.md` | Code quality | Structure, Maintainability, Patterns, Type Safety |
| `data-integrity.md` | Data correctness | Data Modeling (1.5x), Error Handling (1.5x), Consistency, Validation |

### For Web App Projects (add these)

| File | What It Scores | Key Dimensions |
|---|---|---|
| `frontend-ui-design.md` | Visual quality | Design Quality (2x), Originality (2x), Craft, Functionality |
| `performance-accessibility.md` | Speed & a11y | Load Perf, Runtime Perf, Semantic HTML, Responsive |
| `ux-user-flows.md` | User experience | Task Completion (1.5x), Info Architecture (1.5x), Product Depth (1.5x), Feedback, Onboarding |

### Hard Fail Thresholds

Every criteria file defines hard fails — if ANY dimension scores 3 or below, the entire category fails regardless of the weighted average. Some criteria have stricter thresholds (e.g., Data Consistency at 4 or below also fails).

---

## Setup

### 1. Install User-Level Agents (once, applies everywhere)

```bash
# Copy the universal agents to your user config
cp .claude/agents/code-reviewer.md ~/.claude/agents/
cp .claude/agents/spec-planner.md ~/.claude/agents/
cp .claude/agents/project-tracker.md ~/.claude/agents/
```

That's it. These agents are now available in every Claude Code session across all your projects.

### 2. Set Up a New Project

**For a backend/API/script project:**

```bash
cd your-project

# Add criteria (pick what applies)
mkdir -p criteria
cp /path/to/claude-harness/criteria/code-architecture.md criteria/
cp /path/to/claude-harness/criteria/data-integrity.md criteria/

# Write a lean CLAUDE.md (see examples/backend-project/)
# Include: build commands, test commands, non-obvious conventions
# Keep under 200 lines. Under 50 is better.
```

No project-level agents needed — the user-level code-reviewer and spec-planner handle everything.

**For a web application project:**

```bash
cd your-project

# Add all criteria
mkdir -p criteria .claude/agents
cp /path/to/claude-harness/criteria/*.md criteria/

# Add UI-specific agents
cp /path/to/claude-harness/.claude/agents/ui-evaluator.md .claude/agents/
cp /path/to/claude-harness/.claude/agents/generator.md .claude/agents/

# Add Playwright MCP
cat > .mcp.json << 'EOF'
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
EOF

# Write a lean CLAUDE.md (see examples/web-app-project/)
```

### 3. Write Your CLAUDE.md

Follow [Anthropic's guidelines](https://code.claude.com/docs/en/best-practices):

```markdown
# Project Name

## Build & Test
bun run build
bun test

## Conventions
- TypeScript strict. No `any`.
- [Only rules Claude can't figure out from reading the code]

## Verification
After changes: `bun run build && bun test`
```

**Rules for CLAUDE.md:**
- Under 200 lines. Under 50 is better.
- Only include what Claude would get wrong without the instruction
- If Claude already does it correctly, delete the rule
- Treat it like code: prune regularly

---

## Workflows

### Workflow A: Quick Feature (any project)

```
You:   "Add retry logic to the webhook sender"
Claude: [implements it using native planning + execution]
You:   "Use the code-reviewer to check this"
Claude: [spawns code-reviewer subagent, runs tests, reviews, reports]
You:   [fix any issues, commit]
```

**Total context overhead: ~200 tokens** (code-reviewer description). Full agent loads only when invoked.

### Workflow B: New Module (any project)

```
You:   "Use the spec-planner — I want to add a rate limiter"
Claude: [spec-planner asks 2-6 questions, writes spec]
You:   [review spec, approve]
You:   "Implement the spec in docs/specs/2026-04-02-rate-limiter.md"
Claude: [implements from spec]
You:   "Use the code-reviewer to check this"
Claude: [adversarial review with scoring]
```

### Workflow C: Full Web App Build (UI projects only)

```
You:   "Use the spec-planner for the analytics dashboard"
Claude: [discovery → spec → docs/specs/]
You:   "Use the generator to build phase 1 from the spec"
Claude: [sustained implementation, commits incrementally]
You:   "Use the ui-evaluator to test localhost:3000"
Claude: [Playwright testing, screenshots, scoring against all criteria]
You:   "Fix the critical issues from the evaluation"
Claude: [implements fixes]
You:   "Evaluate again"
Claude: [re-scores, verifies fixes]
```

---

## Adapting Criteria for Your Domain

The criteria files are starting points. Adapt them to your domain:

**Financial applications (FinFlow):**
- Add data density and chart readability to frontend criteria
- Add regulatory compliance to data integrity
- Add multi-language/white-label to UX criteria

**Infrastructure tools (monitoring dashboards):**
- Add real-time update performance to frontend criteria
- Add alerting accuracy to data integrity

**API services:**
- Skip all frontend criteria
- Add API contract compliance to code architecture
- Add rate limiting and auth to data integrity

---

## Session Hygiene

The harness gives you better agents and criteria, but how you **manage sessions** determines whether Opus 4.6 performs at its best or degrades into confused loops. These practices come directly from [Anthropic's best practices](https://code.claude.com/docs/en/best-practices) and production experience.

### The One Rule

> **Context is your most precious resource.** Everything else follows from this.

Claude's performance degrades as context fills. At 0-20% usage, output is reliable. Past 60%, retrieval starts failing and instructions get lost. The status line (`ctx: 42% used`) tells you where you are.

### Practices

| Practice | When | Why |
|---|---|---|
| **`/clear` between tasks** | After finishing a feature, before starting something unrelated | Resets context completely. Single biggest quality improvement. |
| **`/compact Focus on [X]`** | When you can't clear but context is growing | Summarizes old context while preserving what matters. |
| **Two corrections → `/clear`** | After correcting Claude twice on the same issue | Failed approaches pollute context. Start fresh with a better prompt that includes what you learned. |
| **`/rename` your sessions** | When starting meaningful work | `claude --resume` shows session names. "oauth-migration" beats "session-47". |
| **Use subagents for research** | When Claude needs to read many files | Research in a subagent returns a summary. Direct exploration fills YOUR context with file contents. |
| **`/btw` for side questions** | Quick questions mid-task | Answer appears in overlay, never enters conversation history. Zero context cost. |

### Permission Mode

Use **auto mode** to eliminate permission prompts without compromising safety:

```json
// In ~/.claude/settings.json
{
  "permissions": {
    "mode": "auto",
    "allow": ["Bash(*)", "Read(*)", "Write(*)", "Edit(*)", "Glob(*)", "Grep(*)"]
  }
}
```

Auto mode uses a classifier to approve routine actions and block risky ones (scope escalation, unknown infrastructure, hostile-content-driven actions). Your explicit allowlist acts as a fast path — the classifier only evaluates actions not already permitted.

For unattended builds: `claude --permission-mode auto -p "fix all lint errors"`. Auto mode aborts if the classifier repeatedly blocks actions, since there's no user to fall back to.

### Hooks (Deterministic Automation)

Unlike CLAUDE.md instructions (which Opus 4.6 can ignore under load), hooks **always fire**:

```json
// In ~/.claude/settings.json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "if [ -f tsconfig.json ]; then npx tsc --noEmit --pretty 2>&1 | tail -20; fi"
          }
        ]
      }
    ]
  }
}
```

This runs `tsc --noEmit` after every file edit in TypeScript projects. Claude sees type errors immediately without being told to check. Other high-value hooks:

| Hook | Trigger | What It Does |
|---|---|---|
| Type-check after edit | `PostToolUse` on `Edit\|Write` | Catches type errors instantly |
| Lint before commit | `PreToolUse` on `Bash(git commit*)` | Prevents committing lint failures |
| Format after edit | `PostToolUse` on `Edit\|Write` | Auto-formats with prettier/biome |

**Rule of thumb:** If you find yourself writing "always run X after Y" in CLAUDE.md, convert it to a hook instead. Hooks are guaranteed; CLAUDE.md instructions are advisory.

#### Global Git Post-Commit Hook

A git `post-commit` hook at `~/.git-hooks/post-commit` updates Second Brain automatically on every commit across all repos:

- Updates the project's last commit hash and message
- Reports dirty worktree state (uncommitted files)
- Auto-completes tasks by fuzzy-matching commit messages against pending task titles
- Creates branch records for new branches automatically

**Setup:**
```bash
# Set global hooks path (once)
git config --global core.hooksPath ~/.git-hooks

# Install the hook
mkdir -p ~/.git-hooks
cp scripts/git-post-commit.sh ~/.git-hooks/post-commit
chmod +x ~/.git-hooks/post-commit
```

The hook fires on every `git commit` in any repo. If the repo name doesn't match a project in SB, it silently does nothing. It runs `curl` in the background so it never slows down commits.

### Status Line

Track context usage in real time:

```json
// In ~/.claude/settings.json
{
  "statusLine": {
    "type": "command",
    "command": "input=$(cat); used=$(echo \"$input\" | jq -r '.context_window.used_percentage // empty'); remaining=$(echo \"$input\" | jq -r '.context_window.remaining_percentage // empty'); if [ -n \"$used\" ]; then printf \"ctx: %.0f%% used (%.0f%% left)\" \"$used\" \"$remaining\"; else printf \"ctx: waiting...\"; fi"
  }
}
```

Shows `ctx: 42% used (58% left)` in your terminal. When you see it climbing past 50%, consider `/compact` or `/clear`.

### Anti-Patterns

| Pattern | Problem | Fix |
|---|---|---|
| **Kitchen sink session** | Start with one task, ask something unrelated, go back | `/clear` between unrelated tasks |
| **Correction spiral** | Correct → still wrong → correct again → context full of failures | After 2 corrections: `/clear` + better initial prompt |
| **Infinite exploration** | "Investigate X" without scoping it. Claude reads 100 files. | Scope narrowly or use subagents |
| **Bloated CLAUDE.md** | 500+ lines, half outdated. Claude ignores most of it. | Keep under 200 lines. Under 50 is better. |
| **Trust-then-verify gap** | Claude produces plausible code that fails edge cases | Always provide verification: tests, build, screenshots |

---

## Git Branching Guide

### When to Branch vs Work on Master

> **If you'll finish it in this session → master. If it'll span sessions or could break things → branch.**

| Situation | Strategy | Why |
|---|---|---|
| Small fix (typo, config, one-file bug) | **Master** | Done in one commit, no risk |
| Cron job tweak, registry update | **Master** | Contained change, easy to verify |
| Multi-session feature | **Branch** | Protects master from half-done work |
| Risky refactor | **Branch** | Easy rollback if it goes wrong |
| Parallel experiments | **Branch** | Try two approaches without conflicts |
| Generator agent building for hours | **Branch** | Review before merging to master |
| Multiple agents working simultaneously | **Branch per agent** | Prevents stepping on each other |

### Branch Naming

```bash
feat/board-v2           # New feature
fix/reconciliation-dup  # Bug fix
refactor/scheduler      # Restructuring
experiment/qwen3-eval   # Throwaway experiment
```

### Branch Lifecycle

```bash
# 1. Create from up-to-date master
git checkout master
git pull
git checkout -b feat/my-feature

# 2. Work, commit incrementally
# ... make changes ...
git add src/specific-file.ts
git commit -m "feat: add webhook retry logic"

# 3. Keep in sync (if branch lives more than a day)
git merge master              # or: git rebase master

# 4. Merge back with --no-ff (preserves history)
git checkout master
git merge --no-ff feat/my-feature

# 5. Clean up
git branch -d feat/my-feature
```

**Critical rule:** Always merge with `--no-ff`. Fast-forward merges lose branch history and make rollbacks harder.

### Git Worktrees (Parallel Sessions)

Worktrees let you have the same repo checked out in **multiple directories simultaneously** — each with its own branch. This is essential when:

- You want to **run Claude Code in parallel** on different features (each session needs its own directory)
- The **generator agent** is building for hours and you want to keep coding something else
- You want to keep a **dev server running** on master while working on a branch
- A **scheduled Claude agent** is working on one task while you work on another

```bash
# Create a worktree for a feature
git worktree add ../myproject-feat-X feat/X

# Work in it (separate directory, separate Claude session)
cd ../myproject-feat-X
claude

# When done, merge from the main directory
cd ../myproject
git merge --no-ff feat/X

# Clean up
git worktree remove ../myproject-feat-X
```

Each worktree is a full working copy with its own `.claude/agents/` and `criteria/` — the harness works in worktrees automatically.

### Safety Rules

These rules exist because of a [real incident](https://github.com/agaleraib/claude-harness#philosophy) where 174 files were accidentally deleted during a git operation:

1. **Never let a branch diverge 50+ commits from master.** Merge to master frequently.
2. **Check master freshness before branching.** If master is days behind, merge current work first.
3. **Always `--no-ff` merges.** Preserves history, makes rollbacks possible.
4. **Never `git add -A` or `git add .`** Stage specific files by name.
5. **Pre-push deletion check.** If more than 10 files are deleted in the diff, stop and verify:
   ```bash
   git diff origin/master --stat | grep "delete" | wc -l
   ```

### Decision Flowchart

```
Will I finish this in one session?
├── Yes → Is it risky? (refactor, schema change, breaking API)
│   ├── No  → Work on master
│   └── Yes → Branch (easy rollback)
└── No → Branch
    └── Will I need Claude Code running in parallel?
        ├── No  → Regular branch (same directory)
        └── Yes → Git worktree (separate directory)
```

---

## What This Replaces

| Before (Superpowers + heavy CLAUDE.md) | After (this harness) |
|---|---|
| 22k tokens at startup | ~500 tokens at startup |
| 14 skills loaded every session | 2 agent descriptions (loaded on demand) |
| Process enforcement skills | Opus 4.6 plans/debugs natively |
| Polite code reviewer | Adversarial reviewer that runs tests |
| No design quality standards | 5 weighted scoring rubrics |
| Brainstorming → writing-plans → executing-plans | spec-planner → build → code-reviewer |
| Skills telling model how to think | Criteria telling model what to check |

---

## References

- [Harness Design for Long-Running Apps](https://www.anthropic.com/engineering/harness-design-long-running-apps) — Anthropic Engineering
- [Best Practices for Claude Code](https://code.claude.com/docs/en/best-practices) — Claude Code Docs
- [Extend Claude Code](https://code.claude.com/docs/en/features-overview) — Skills, Subagents, Hooks overview
- [Custom Subagents](https://code.claude.com/docs/en/sub-agents) — Agent definition reference
- [Skills](https://code.claude.com/docs/en/skills) — Skill system reference
- [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) — "Start simple, add complexity only when needed"
- [Context Window Visualization](https://code.claude.com/docs/en/context-window) — Understanding what consumes your context

## License

MIT
