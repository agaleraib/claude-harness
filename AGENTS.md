# AGENTS.md

Tool-neutral protocol contract for any agent (LLM or human) operating on this repo.

## What this repo is

`claude-harness` is a meta-harness: it ships protocol files, skills, and agents that consumer projects symlink in (via `setup-harness`). It is not an application — it is the operating system for spec-driven work across other repos.

## Where state lives

- `docs/specs/` — durable technical specs (`YYYY-MM-DD-<topic>.md`).
- `docs/plan.md` — active board (`## Now` / `## Next` / `## Blocked` / `## Recently Shipped` per spec §6 of `docs/specs/2026-04-30-universal-harness-protocol-v2.md`).
- `docs/waves/` — shipped wave summaries (one file per closed wave).
- `.harness-state/` — receipts and logs (machine-readable; per-receipt schema in `docs/protocol/receipt-schema.md`).
- `criteria/` — quality rubrics consulted by code-reviewer and skill-creator.
- `parking_lot.md` — deferred work and side-quests.
- `WORKFLOW.md` — command-form matrix (Manual / Claude Code / Codex / Automation).

## What to do

1. Read `WORKFLOW.md` first to choose an execution path for the command at hand.
2. Stage files explicitly (`git add <path>`) — never `git add -A` or `git add .`.
3. Emit a receipt under `.harness-state/<command>-<wave-or-spec-id>-<timestamp>.yml` shaped per `docs/protocol/receipt-schema.md` for any command that mutates state.
4. Stop on ambiguity — write a partial-completion receipt rather than guess.
5. Treat `docs/specs/` as durable intent. Treat `docs/plan.md` as the active board.

## What to avoid

- Don't `git add -A` or `git add .` — it sweeps in secrets and unrelated work.
- Don't merge feature branches without `--no-ff` — it loses history.
- Don't write durable state outside the protocol artifacts above (no `~/.tmp_state`, no untracked sidecars).
- Don't invent state when inputs are missing — stop and surface.
- Don't bypass the receipt schema. Adapter divergence on receipt shape breaks cross-tool replay.
- Don't bake dynamic content (timestamps, build IDs, absolute paths, per-session counters) into static prompt files (`CLAUDE.md`, `AGENTS.md`, any `SKILL.md`). Per [Anthropic's prompt-caching guidance](https://claude.com/blog/lessons-from-building-claude-code-prompt-caching-is-everything), prefix-instability invalidates the conversation-wide cache. Use runtime injection (Claude Code's `system-reminder`, hook output, or a fresh-read of `.harness-state/`) for anything that changes session-to-session.

## Memory

The shared user-global memory root lives at `~/.claude/memory/` and contains six entities:

- `~/.claude/memory/USER.md` — operator profile, ≤1KB, human-written only.
- `~/.claude/memory/FEEDBACK.md` — validated-pattern index, ≤5KB hard cap, `/memory-prune` writes + humans may append.
- `~/.claude/memory/REFERENCES.md` — external resource pointers (URLs, doc locations, install commands), ≤2KB, human-written.
- `~/.claude/memory/PROJECTS.md` — registry of repos + cowork projects (one row per), ≤4KB, human-written.
- `~/.claude/memory/archive/` — resolved or stale entries, unlimited size but **never auto-loaded**.
- `~/.claude/memory/feedback/` — per-pattern detail files referenced from FEEDBACK.md; the dir is never auto-loaded as a whole, only the FEEDBACK.md index is.

### Memory protocol (imperative)

1. Memory directories are pre-loaded at session-start — use them. The shared root at `~/.claude/memory/` is read-only for sessions; treat its contents as canonical operator-curated state. The per-tool auto-memory dir (Claude Code: `~/.claude/projects/<encoded-cwd>/memory/`) is the AI-write surface.
2. As you make progress, record status / decisions / new facts to the per-tool auto-memory dir immediately. Don't batch until end-of-session.
3. **ASSUME INTERRUPTION:** context may compact or reset at any time, and the next session inherits only what's on disk. Unrecorded facts are lost. When in doubt, save.
4. Prefer editing existing memory files (Edit tool) over creating new ones. Rename or delete entries that are no longer relevant. New-file sprawl is a worse failure mode than a stale paragraph.
5. Promotion to the shared root is **manual** via `/memory-prune` (move + frontmatter stamp, not copy). Don't try to short-cut this from a session — the operator owns shared-root mutation.

Caps and line budgets are enforced as conventions, not blocking hooks: `~/.claude/memory/FEEDBACK.md` MUST stay ≤5KB hard cap, and every line in `~/.claude/memory/*.md` (excluding `archive/`) MUST stay ≤150 chars. `/memory-prune` writes FEEDBACK.md; humans may append. `USER.md`, `REFERENCES.md`, and `PROJECTS.md` are human-written only. Over-cap files are surfaced as warnings by `/session-start` and as nudges by `/session-end`, never as blocks.

Promotion from per-tool auto-memory into the shared root is **move + frontmatter stamp, not copy**. When an insight reproduced in a tool-specific auto-memory directory generalizes across projects, promotion to `~/.claude/memory/feedback/<slug>.md` carries a frontmatter `originCwd:` (and `originSessionId:` where the source tool records one) preserving the provenance link. The source file is deleted after the move so duplicate basenames in two per-cwd dirs is a bug, not a feature; promotion is the fix. No auto-promotion hook exists — operator triage is required.

`~/.claude/memory/archive/` is **never auto-loaded** by any tool. It is the append-only audit trail for resolved or stale entries pruned out of the live indexes. Adapters MUST NOT pull `archive/` contents into a session context window. Recovery from the archive is a manual `cp` or `git show` by the operator.

Domain glossaries that a project develops live in `<project-root>/CONTEXT.md`. The format conventions (one-sentence definitions, `_Avoid_:` alias list, relationship lines, flagged ambiguities, ≤5KB before splitting into `CONTEXT-MAP.md`) are documented in the `mattpocock-skills-verdict` memory; AGENTS.md is not the format spec.

## Cross-surface consumption

The **data layer** is portable markdown. Anything with filesystem access — Claude Code, Claude Desktop with the Filesystem MCP wired, claude.ai web with a remote-MCP bridge, plain `cat` from a terminal — reads the shared user-global root at `~/.claude/memory/*` and each project's `CLAUDE.md` directly. No format is tool-specific; no piece of state is gated behind a runtime API. The 5-question portability test from spec §2.3 of `docs/specs/2026-04-30-universal-harness-protocol-v2.md` holds because the answers live in files on disk, not in a session's working memory.

The **auto-load layer** is Claude-Code-specific and stays Claude-Code-specific. Claude Code session-start injection reads per-cwd `MEMORY.md`, project `CLAUDE.md`, and the shared root via a hook the other surfaces do not run. Claude Desktop and claude.ai reach the same data layer through one of two paths: (a) the Filesystem MCP exposing `~/.claude/memory/` + the project root as Project Knowledge sources (Desktop only — requires manual MCP config); or (b) a one-time UI drag of the project's `.claude/desktop-knowledge/` bundle into Project Knowledge (Desktop and web). Both paths produce read access to the same bytes Claude Code sees; neither replaces Claude Code's auto-load hook.

The `.claude/desktop-knowledge/` bundle scaffolded by `/new-cowork` inside each cowork project is the explicit cross-surface bridge. It contains 5 files by default: `README.md` (operator drag instructions + caveats), `USER.md` (symlink → `~/.claude/memory/USER.md`), `FEEDBACK.md` (symlink → `~/.claude/memory/FEEDBACK.md`), `workspace-CLAUDE.md` (copy of the project's own `CLAUDE.md` — Desktop symlink-following is unreliable for the persona file), and `mcp-config-snippet.json` (filesystem-MCP allowlist scoping Desktop to the project + memory root). When `/new-cowork` runs with `--area-context=create` (Wave 15), the bundle grows to **7 files**: two additional bytes-exact copies — `area-CLAUDE.md` (from `~/cowork/<area>/CLAUDE.md`) and `area-meta.md` (from `~/cowork/<area>/_area.md`) — propagate area-level persona/collaborators/style to Desktop and claude.ai, which don't parent-walk. After editing the source area files, run `/cowork-area-sync <area>` to refresh every active project's bundle (closed/archived/missing-status projects are skipped and left byte-identical). There is **no programmatic Project-creation API** for Claude Desktop or claude.ai as of 2026-05-13, so initial Project setup is irreducibly a one-time operator UI drag. Refresh cadence varies by surface: live via MCP for Filesystem-wired Desktop; re-drag-after-edit for upload-only flows. See `skills/new-cowork/templates/desktop-knowledge-README.md.tmpl` for the operator instructions that ship in each scaffolded project.

## How to discover next action

Use the 5-question portability test from spec §2.3 of `docs/specs/2026-04-30-universal-harness-protocol-v2.md`:

1. What is active? → `docs/plan.md ## Now`
2. What is blocked? → `docs/plan.md ## Blocked`
3. What was shipped? → `docs/waves/`
4. What verifies this? → spec exit gate + `.harness-state/` receipt
5. What do I do next? → `WORKFLOW.md`

If any answer requires the original Claude/Codex session, the harness is coupled too tightly — fix the protocol files, not the session.

Tool-specific overrides (Claude-specific behavior, Codex-specific prompts) live in `CLAUDE.md` and future `.codex/` adapters respectively. This file stays neutral.
