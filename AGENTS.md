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

## How to discover next action

Use the 5-question portability test from spec §2.3 of `docs/specs/2026-04-30-universal-harness-protocol-v2.md`:

1. What is active? → `docs/plan.md ## Now`
2. What is blocked? → `docs/plan.md ## Blocked`
3. What was shipped? → `docs/waves/`
4. What verifies this? → spec exit gate + `.harness-state/` receipt
5. What do I do next? → `WORKFLOW.md`

If any answer requires the original Claude/Codex session, the harness is coupled too tightly — fix the protocol files, not the session.

Tool-specific overrides (Claude-specific behavior, Codex-specific prompts) live in `CLAUDE.md` and future `.codex/` adapters respectively. This file stays neutral.
