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

Caps and line budgets are enforced as conventions, not blocking hooks: `~/.claude/memory/FEEDBACK.md` MUST stay ≤5KB hard cap, and every line in `~/.claude/memory/*.md` (excluding `archive/`) MUST stay ≤150 chars. `/memory-prune` writes FEEDBACK.md; humans may append. `USER.md`, `REFERENCES.md`, and `PROJECTS.md` are human-written only. Over-cap files are surfaced as warnings by `/session-start` and as nudges by `/session-end`, never as blocks.

Promotion from per-tool auto-memory into the shared root is **move + frontmatter stamp, not copy**. When an insight reproduced in a tool-specific auto-memory directory generalizes across projects, promotion to `~/.claude/memory/feedback/<slug>.md` carries a frontmatter `originCwd:` (and `originSessionId:` where the source tool records one) preserving the provenance link. The source file is deleted after the move so duplicate basenames in two per-cwd dirs is a bug, not a feature; promotion is the fix. No auto-promotion hook exists — operator triage is required.

`~/.claude/memory/archive/` is **never auto-loaded** by any tool. It is the append-only audit trail for resolved or stale entries pruned out of the live indexes. Adapters MUST NOT pull `archive/` contents into a session context window. Recovery from the archive is a manual `cp` or `git show` by the operator.

Domain glossaries that a project develops live in `<project-root>/CONTEXT.md`. The format conventions (one-sentence definitions, `_Avoid_:` alias list, relationship lines, flagged ambiguities, ≤5KB before splitting into `CONTEXT-MAP.md`) are documented in the `mattpocock-skills-verdict` memory; AGENTS.md is not the format spec.

## How to discover next action

Use the 5-question portability test from spec §2.3 of `docs/specs/2026-04-30-universal-harness-protocol-v2.md`:

1. What is active? → `docs/plan.md ## Now`
2. What is blocked? → `docs/plan.md ## Blocked`
3. What was shipped? → `docs/waves/`
4. What verifies this? → spec exit gate + `.harness-state/` receipt
5. What do I do next? → `WORKFLOW.md`

If any answer requires the original Claude/Codex session, the harness is coupled too tightly — fix the protocol files, not the session.

Tool-specific overrides (Claude-specific behavior, Codex-specific prompts) live in `CLAUDE.md` and future `.codex/` adapters respectively. This file stays neutral.
