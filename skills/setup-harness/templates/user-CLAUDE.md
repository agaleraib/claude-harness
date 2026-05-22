# Universal Conventions

> Reference template shipped by claude-harness `/setup-harness` Step 5.
> This file is auto-loaded into every Claude Code session on this machine.
> Edit freely — operator-owned after install.

## Code Style
- TypeScript strict mode. No `any` types.
- Stage files explicitly — never `git add -A` or `git add .`
- Merge with `--no-ff` to preserve history.

## Verification
- Run type-check and tests after code changes before claiming done.
- If build/test commands aren't obvious, check package.json or equivalent first.

## Quality
- When `criteria/` directory exists in the project, the code-reviewer agent scores against those rubrics.
- Specs go in `docs/specs/YYYY-MM-DD-<topic>.md`.

## Surgical Changes
- Touch only what the task requires. Don't refactor adjacent code, reformat, or delete pre-existing dead code unless asked. Match existing style. The test: every changed line should trace to the request.

## Context Efficiency
- Keep responses concise. Don't summarize what was just done.
- Use subagents for research that would read many files.

## Auto-memory visibility
- When you Write/Edit a per-cwd auto-memory file under `~/.claude/projects/<encoded-cwd>/memory/`, emit a visible one-line note in chat **before** the tool call: `[memory:<type>] <slug> — <one-line summary>`.
- One announcement per logical memory file (the `MEMORY.md` index update is bookkeeping — don't announce it separately).
- The operator should be able to scan the conversation and see exactly what was persisted, without diffing the directory.

## Memory protocol (imperative)
> Single source of truth: `AGENTS.md` §Memory → "Memory protocol (imperative)" in the claude-harness repo. The 5 rules below are a mirror — if they drift from AGENTS.md, AGENTS.md wins.

1. Memory directories are pre-loaded at session-start — use them. The shared root at `~/.claude/memory/` is read-only for sessions; treat its contents as canonical operator-curated state. The per-tool auto-memory dir (Claude Code: `~/.claude/projects/<encoded-cwd>/memory/`) is the AI-write surface.
2. As you make progress, record status / decisions / new facts to the per-tool auto-memory dir immediately. Don't batch until end-of-session.
3. **ASSUME INTERRUPTION:** context may compact or reset at any time, and the next session inherits only what's on disk. Unrecorded facts are lost. When in doubt, save.
4. Prefer editing existing memory files (Edit tool) over creating new ones. Rename or delete entries that are no longer relevant. New-file sprawl is a worse failure mode than a stale paragraph.
5. Promotion to the shared root is **manual** via `/memory-prune` (move + frontmatter stamp, not copy). Don't try to short-cut this from a session — the operator owns shared-root mutation.
