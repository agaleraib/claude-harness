---
name: cowork-area-sync
description: Refresh `.claude/desktop-knowledge/area-CLAUDE.md` + `area-meta.md` in every active project under `~/cowork/<area>/` so they mirror the current `~/cowork/<area>/CLAUDE.md` + `~/cowork/<area>/_area.md`. Skips closed/archived/missing-status projects. Per-project temp+rename writes + parent journal with `in-progress|complete|failed` status + resume on interruption.
---

# cowork-area-sync

One-way push from `~/cowork/<area>/CLAUDE.md` + `~/cowork/<area>/_area.md` into every active project's `.claude/desktop-knowledge/` bundle. Use after editing area-level files so Claude Desktop / claude.ai Projects see the updated context (Claude Code reads via parent-walk and doesn't need this).

## When to use

- You edited `~/cowork/<area>/CLAUDE.md` or `_area.md` and want existing project bundles refreshed.
- A source file was **deleted** and you want the matching `area-CLAUDE.md` / `area-meta.md` removed from active project bundles.
- A bundle is missing area-level files because the project was scaffolded before Wave 15 (`/cowork-area-sync` is the backfill path).

Does **NOT** mutate the source files themselves — the command is a one-way push, source → bundles. Closed / archived / missing-status projects are skipped (their bundle is left byte-identical).

## Invocation

```bash
/cowork-area-sync <area> [--dry-run]
```

Or directly:

```bash
bash skills/cowork-area-sync/lib/cowork-area-sync.sh <area> [--dry-run] [--root <dir>] [--receipt-root <dir>]
```

Flags:
- `--dry-run` — print the planned actions per active project + skip reasons per inactive project, exit 0, zero filesystem mutation.
- `--root <dir>` — cowork root (default `~/cowork`).
- `--receipt-root <dir>` — where to emit parent journal + per-project receipts (default `<repo>/.harness-state` if invoked from a repo, else `~/.harness-state`).
- `--help` — print usage and exit 0 (handled BEFORE any side effect per `feedback_skill_help_branch_invariant`).

`<area>` MUST match `^[A-Za-z0-9][A-Za-z0-9_-]*$`.

## Behavior

### Active-project selection (portable status parser)

Walks every directory at `<root>/<area>/<*>/` containing `_charter.md`. For each candidate, parses the first occurrence of the lifecycle status bullet emitted by the Wave 13 `_charter.md.tmpl:17` — a markdown bullet of the shape `- **status:** <value>`:

```
status=$(awk '/^- \*\*status:\*\*/{ for(i=1;i<=NF;i++) if($i=="**status:**"){print $(i+1); exit} }' "$CHARTER")
```

A project is processed iff `status == "active"`. Projects with `status: closed`, `status: archived`, missing `status:` field, or no `_charter.md` are **skipped** and recorded in the parent journal under `projects_skipped:` with `reason: inactive | missing-status | missing-charter`.

### Per-project sync logic

For each active project, handle both files symmetrically:
- If `<root>/<area>/CLAUDE.md` exists → copy to `<project>/.claude/desktop-knowledge/area-CLAUDE.md` (overwrite).
- If `<root>/<area>/_area.md` exists → copy to `<project>/.claude/desktop-knowledge/area-meta.md` (overwrite).
- If `<root>/<area>/CLAUDE.md` was **deleted** but `<project>/.claude/desktop-knowledge/area-CLAUDE.md` exists → remove the stale bundle copy.
- Same delete behavior for `_area.md` → `area-meta.md`.

### Per-project atomicity + receipts

Before any copy/delete on a project, write a **per-project started receipt** at `.harness-state/cowork-area-sync-<area>-<project>-<utc-iso>.started.yml` capturing `area_claude_before_sha256`, `area_meta_before_sha256`, planned `area_claude_action` + `area_meta_action`. Copies use temp+rename: write to `<project>/.claude/desktop-knowledge/.area-CLAUDE.md.tmp.$$` then `mv` to final path. Deletes use `rm -f` (already idempotent).

After both file operations complete for the project, capture `area_claude_after_sha256` + `area_meta_after_sha256`, write the terminal YAML, and rename the started receipt to `.harness-state/cowork-area-sync-<area>-<project>-<utc-iso>.yml` (drops `.started`).

### Parent journal

Path: `.harness-state/cowork-area-sync-<area>-<utc-iso>.journal.yml`. Contains:

```yaml
started_at: <utc-iso>
area: <area>
area_claude_source_sha256: <hex|null>
area_meta_source_sha256: <hex|null>
projects_planned: [...]
projects_completed: [...]
projects_skipped:
  - { path: <p>, reason: inactive|missing-status|missing-charter }
status: in-progress | complete | failed
```

### Resume behavior

Each invocation first globs `.harness-state/cowork-area-sync-<area>-*.journal.yml` (the parent-journal name shape; per-project receipts contain `<project>` between `<area>` and `<utc-iso>` and don't match). For each match, parses `status:`:

- **0 matches with `status: in-progress`** → fresh run. Mint a new `<utc-iso>` and write a new parent journal with `status: in-progress`.
- **Exactly 1 match with `status: in-progress`** → resume that session. Adopt its `<utc-iso>` as the session id for all per-project receipts written in this invocation.
- **≥2 matches with `status: in-progress`** → refuse with **exit code 6** and an error message listing every conflicting journal path. The operator must inspect and either finalize one (edit `status:` to `complete` or `failed`) or remove a stale journal before re-running. **Zero filesystem mutation.**

Within a session (adopted in-progress journal), skip projects whose terminal receipt `cowork-area-sync-<area>-<project>-<adopted-utc-iso>.yml` already exists. A `.started.yml` receipt without a matching terminal receipt is treated as the resume boundary: re-process that project (idempotent — same source state produces same digests).

Journals with `status: failed` are ignored by discovery — they are terminal records, not resumable.

### Source-digest drift check (Wave 15 F6)

On resume, recompute `area_claude_source_sha256` + `area_meta_source_sha256` from the current source files and compare against the recorded digests in the parent journal. If they differ, refuse with **exit 7** and a message naming both digest pairs (recorded vs. current) for both files. The operator must decide: complete the existing in-progress run by reverting the source files, or finalize the journal (edit `status:` to `failed` or remove) and start fresh against the new sources.

### Per-project terminal receipt schema

YAML keys (per spec line 230):

```yaml
command: cowork-area-sync
area: <area>
project: <project>
area_claude_before_sha256: <hex|null>
area_claude_after_sha256: <hex|null>
area_claude_action: copy|delete|noop
area_meta_before_sha256: <hex|null>
area_meta_after_sha256: <hex|null>
area_meta_action: copy|delete|noop
```

Conforms to `docs/protocol/receipt-schema.md` shape — same Wave 13 idempotency-key / operation-id derivation pattern as `/new-cowork`.

## Exit codes

- `0` — success: every active project has a terminal receipt; parent journal `status: complete`.
- `2` — argument / usage error (bad slug, missing required value, etc.).
- `4` — non-interactive shell required an explicit flag (reserved — currently unused, parallels `/new-cowork`).
- `5` — reserved (`/new-cowork` uses this for `--area-context=require` miss).
- `6` — **ambiguous resume**: ≥2 parent journals have `status: in-progress`. Zero filesystem mutation.
- `7` — **source-digest drift on resume**: the in-progress journal's recorded source digests don't match the current source files. Zero filesystem mutation.
- `99` — test hook fired (`COWORK_AREA_SYNC_FAIL_AFTER_PROJECT=1`).

## Adapter install notes (Claude-specific, optional)

For Claude Code users, an opportunistic symlink at `~/.claude/skills/cowork-area-sync` → repo path makes the skill discoverable via `/cowork-area-sync`. Create with:

```bash
ln -s "$(pwd)/skills/cowork-area-sync" ~/.claude/skills/cowork-area-sync
```

This is **NOT a required file** and its absence does not block the exit gate. The portable deliverable is the repo-local script + WORKFLOW row. Other surfaces (Codex, manual, generic shell) invoke `bash skills/cowork-area-sync/lib/cowork-area-sync.sh <area>` directly.

## See also

- `docs/specs/2026-05-14-cowork-area-context.md` (this command's design spec; Task 6)
- `skills/new-cowork/SKILL.md` (sibling — scaffolds area files initially)
- `docs/protocol/receipt-schema.md` (canonical receipt fields)
- `WORKFLOW.md` `/cowork-area-sync` row + verbatim Codex prompt contract
