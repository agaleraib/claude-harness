---
name: new-cowork
description: Scaffold a cowork project at `~/cowork/<area>/<project>/` with `CLAUDE.md` + `_charter.md` + `_automations.md` + `.claude/desktop-knowledge/` bundle (5 files — README.md, USER.md symlink, FEEDBACK.md symlink, workspace-CLAUDE.md copy, mcp-config-snippet.json). Refuses on existing folder; emits canonical receipt + journal + PROJECTS.md row append. Sources operator profile from `~/.claude/memory/USER.md` (Wave 11 shared root).
---

# new-cowork

Operator-facing scaffold for new cowork projects. Ships the minimal folder shape that works in Claude Code, Claude Desktop, and on claude.ai via the shared `~/.claude/memory/` root introduced in Wave 11.

## When to use

- You're starting a new bounded engagement (audit, research project, ad-hoc workspace) that lives under `~/cowork/<area>/<project>/` rather than `~/workspace/<repo>/`.
- The shared user-global memory root at `~/.claude/memory/` is initialized (Wave 11 has shipped). The skill refuses if `USER.md` is missing.

Does **NOT** scaffold numbered phase folders (`00-inbox/`, …). Per gobot pivot §2 "Phase 0 reality": those earn their way in.

## Invocation

```bash
/new-cowork <area> <project>
```

Or directly:

```bash
bash skills/new-cowork/lib/new-cowork.sh <area> <project> [flags]
```

Flags:
- `--root <dir>` — cowork root (default `~/cowork`).
- `--memory-root <dir>` — shared memory root (default `~/.claude/memory`). Used as the source of `USER.md` / `FEEDBACK.md` symlinks and as the `PROJECTS.md` mutation target.
- `--receipt-root <dir>` — where to emit receipt + journal (default `<calling-repo>/.harness-state` if invoked from a repo, else `~/.harness-state`). No bespoke locations under `~/.claude/memory/.<x>-receipts/`.
- `--help` — print usage and exit 0 (handled BEFORE any side effect per `feedback_skill_help_branch_invariant`).

Both `<area>` and `<project>` MUST match `^[A-Za-z0-9][A-Za-z0-9_-]*$` (no `/`, no `..`, no whitespace, no leading `-`, no shell-sensitive characters).

## Behavior (11 steps)

1. Refuse if `<root>/<area>/<project>/` already exists (no overwrite — operator picks a new name or `rm -rf` first).
2. `mkdir -p <root>/<area>/<project>/.claude/desktop-knowledge/`.
3. Seed `CLAUDE.md` from template — persona = "operator working on `<project>` in `<area>` area"; scope = files under the project root; no `bun test` / no deploy permissions.
4. Seed `_charter.md` with `kind:` default `project`, `opened_at: <today>`, `closes_at:` empty, "## Open questions" empty.
5. Seed `_automations.md` empty with header row only.
6. Write `.claude/desktop-knowledge/README.md` with operator drag-into-Project instructions + no-programmatic-API caveat.
7. `ln -s <memory-root>/USER.md .claude/desktop-knowledge/USER.md` (relative symlink).
8. `ln -s <memory-root>/FEEDBACK.md .claude/desktop-knowledge/FEEDBACK.md` (relative symlink).
9. `cp CLAUDE.md .claude/desktop-knowledge/workspace-CLAUDE.md` (copy, NOT symlink — Desktop Project Knowledge symlink-following is unreliable for the persona file).
10. Write `.claude/desktop-knowledge/mcp-config-snippet.json` with filesystem-MCP allowlist scoping Desktop to the project path + `<memory-root>/`.
11. Print operator-next-steps: cd into the folder, edit `_charter.md`, optionally `git init`, optionally drag the bundle into Claude Desktop.

## Receipt + journal lifecycle (NORMATIVE)

Per `docs/protocol/receipt-schema.md` and `docs/specs/2026-05-13-memory-system-redesign.md` Constraints block:

- `operation_id = sha256_hex("new-cowork\n<area>/<project>")` — command-subject extension (the spec's F1 rule). Two invocations with different `<area>`/`<project>` arguments hold distinct operation identities even from byte-identical filesystem state.
- `idempotency_key = sha256_hex("new-cowork\n<area>/<project>\n<input-content-digest>")` where input-content-digest covers the sorted `<path>:<sha256-of-bytes>` set of inputs (templates + USER.md + FEEDBACK.md + PROJECTS.md). **Timestamps MUST NOT influence the key.**
- **Stage 1 no-op:** if a prior `status=success` receipt exists with the matching `idempotency_key`, the skill returns the existing receipt path and exits 0 without re-executing (per receipt-schema.md §"Recovery semantics" Stage 1). This means a repeat invocation against an unchanged state is idempotent-refuse-via-receipt, NOT re-scaffolding.
- Before any PROJECTS.md mutation: `BLOB_SHA=$(git hash-object -w <memory-root>/PROJECTS.md)` captures pre-edit bytes into the local git object store for byte-exact rollback.
- Journal at `<receipt-root>/new-cowork.jsonl` (append-only): one JSON line per invocation with `{op_id, area, project, scaffold_path, files_created, projects_md_row_added, projects_md_blob_sha_before, ts}`.
- Receipt at `<receipt-root>/new-cowork-<area>-<project>-<utc-iso>.yml` per the canonical schema (every NORMATIVE field). `stage_a_exempt` MUST be absent or false (this is a mutating command).

## Error / edge cases

- Folder already exists (Stage 1 idempotency miss — different inputs) → exit non-zero with `already exists`; no receipt or journal entry written.
- `<memory-root>/USER.md` missing → exit 1 with `shared root not initialized; run Wave 1 first`; no scaffold, no receipt.
- `<area>` or `<project>` fails the path-safe slug regex `^[A-Za-z0-9][A-Za-z0-9_-]*$` → exit non-zero with `<area|project> must be a single path-safe segment`.
- `realpath <root>/<area>/<project>/` escapes the configured cowork root (symlink shenanigans) → exit non-zero with `scaffold path escapes cowork root`.
- `git hash-object -w PROJECTS.md` returns non-zero (no git context, missing PROJECTS.md, etc.) → abort BEFORE mutation; `rm -rf <scaffold_path>` rollback; write `status=aborted-on-ambiguity` receipt.
- PROJECTS.md row append fails (e.g. file locked, duplicate `id`) → `rm -rf <scaffold_path>` rollback; journal records rollback; exit non-zero.

## Rollback

Within the local `gc.pruneExpire` window (default 2 weeks):

```bash
# Scaffold rollback (byte-exact — the folder didn't exist pre-command):
rm -rf <scaffold_path>

# PROJECTS.md rollback (byte-exact via git blob):
BLOB_SHA=<from journal projects_md_blob_sha_before>
git cat-file -p "$BLOB_SHA" > <memory-root>/PROJECTS.md

# Tombstone the journal line (append-only — do NOT delete the original):
printf '{"op_id":"<op_id>","action":"rollback","ts":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> <receipt-root>/new-cowork.jsonl
```

## See also

- `docs/specs/2026-05-13-memory-system-redesign.md` (Phase 3; Task 11)
- `docs/protocol/receipt-schema.md` (canonical receipt fields + idempotency_key derivation)
- `skills/_shared/lib/emit-receipt.sh` (canonical receipt helper)
- `feedback_skill_help_branch_invariant` (handle `--help` before side effects)
