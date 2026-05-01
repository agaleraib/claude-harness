# CLAUDE.md

> Tool-neutral protocol lives in AGENTS.md. Claude-specific overrides below.

## Claude-specific notes

This repo's tool-neutral contract is `AGENTS.md`. Read that first — it defines protocol artifacts, what state lives where, what to do, what to avoid, and the 5-question portability test from spec §2.3 of `docs/specs/2026-04-30-universal-harness-protocol-v2.md`.

The notes below apply only when a Claude Code session is the executor. Anthropic-specific behavior, skill invocations (`/spec-planner`, `/run-wave`, `/close-wave`, `/commit`, `/planning-loop`, `/triage-parking`, etc.), and Claude Code harness conventions (`.claude/`, `~/.claude/skills/`, `.harness-state/orchestrator.{log,jsonl}`) are layered on top of the tool-neutral protocol — they do not replace it.

## Skills directory layout

- Source of truth: `skills/` in this repo.
- Symlinked OUT to `~/.claude/skills/` (claude-harness ships skills to the user's global Claude Code config).
- No incoming symlinks expected. If `skills/<x>` is itself a symlink, that's a bug — flag it.

## Per-skill behavioral notes

Skill bodies live in `skills/<skill>/SKILL.md`. The skills index is best read by listing `skills/` directly; treat individual SKILL.md files as the source of truth for command behavior.

## When in doubt

When a Claude-specific override conflicts with `AGENTS.md`, the conflict is itself a signal that AGENTS.md needs to be updated (or that the Claude override is overreaching). Default to AGENTS.md and surface the conflict.
