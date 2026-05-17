---
name: new-cowork
description: Scaffold a cowork project at `~/cowork/<area>/<project>/` with `CLAUDE.md` + `_charter.md` + `_automations.md` + `.claude/desktop-knowledge/` bundle (5 files — README.md, USER.md symlink, FEEDBACK.md symlink, workspace-CLAUDE.md copy, mcp-config-snippet.json) + (Wave 15) optional area-level CLAUDE.md + _area.md when `--area-context=create` is passed, growing the bundle to 7 files (adds area-CLAUDE.md + area-meta.md) + (Wave 16.5) a Phase 4 `<project>.mcpb` Claude Desktop Extension generated alongside. Refuses on existing folder; emits canonical receipt + journal + PROJECTS.md row append. Sources operator profile from `~/.claude/memory/USER.md` (Wave 11 shared root).
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
- `--area-context=create|skip|require` — area-level CLAUDE.md / _area.md handling (Wave 15). `create` scaffolds area files from templates if absent and adds them to the bundle (5→7 file delta). `skip` no-ops the area scaffold; 5-file bundle. `require` exits 5 if `<area>/CLAUDE.md` is absent (CI / automation hard precondition). TTY default when flag omitted + area files absent: prompt. Non-TTY callers MUST pass the flag explicitly (else exit 4 with zero filesystem mutation).
- `--help` — print usage and exit 0 (handled BEFORE any side effect per `feedback_skill_help_branch_invariant`).

Both `<area>` and `<project>` MUST match `^[A-Za-z0-9][A-Za-z0-9_-]*$` (no `/`, no `..`, no whitespace, no leading `-`, no shell-sensitive characters).

## Behavior (11 steps + Phase 4)

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
11. Print operator-next-steps: cd into the folder, edit `_charter.md`, optionally `git init`, install the `.mcpb` from step 12, fallback drag the bundle into Claude Desktop.

### Phase 4 (step 12 — Wave 16.5) — build `<project>.mcpb` Claude Desktop Extension

After step 10 completes (5-file desktop-knowledge bundle written) and before step 11a (PROJECTS.md mutation), Phase 4 generates a per-project Claude Desktop Extension bundle.

**Mechanism:**
1. Copy `templates/desktop-bundle/` → `<scaffold>/.claude/desktop-knowledge/<project>-bundle-src/`.
2. Render `manifest.json.tmpl` with `{{PROJECT_AREA}}` → `<area>`, `{{PROJECT_ID}}` → `<project>`, `{{PROJECT_PATH}}` → `${HOME}/cowork/<area>/<project>` (note: `${HOME}` template var — NOT operator's literal `/Users/<name>/...`; this keeps the bundle portable across machines), `{{BUNDLE_VERSION}}` → `1.0.0`. Output: `<bundle-src>/manifest.json`.
3. `cd <bundle-src> && npm install --omit=dev --no-audit --no-fund` vendors `@modelcontextprotocol/server-filesystem` (pinned, no `^` range) into `node_modules/`.
4. `cd <bundle-src> && npx --yes @anthropic-ai/mcpb pack .` produces `<name>.mcpb` (named after manifest's `name` field — `cowork-<area>-<project>`).
5. Rename / move the packed bundle to `<scaffold>/.claude/desktop-knowledge/<project>.mcpb`.
6. `rm -rf <bundle-src>/` (only persist the packed `.mcpb` + the template — vendored deps + `node_modules/` are NOT committed; reproducible from template at any time).
7. Append a `## Wave 16.5 — Desktop bundle (.mcpb)` line to `_automations.md` recording the bundle path.

**Soft-fail policy:** If step 3 (npm install) or step 4 (mcpb pack) fails (no network, npm registry down, missing toolchain), Phase 4 emits a warning and the rest of the scaffold succeeds. The receipt records `desktop_bundle_status: skipped` + the warning text. Operator can run `/cowork-regen-bundle <area>/<project>` once the underlying issue resolves.

**Auto-install of `@anthropic-ai/mcpb` CLI:** the skill uses `npx --yes` so the CLI is fetched on-demand if not globally installed. No `npm install -g @anthropic-ai/mcpb` required.

**Operator install (post-scaffold):** drag the resulting `<project>.mcpb` into Claude Desktop → Settings → Extensions → Install. See `.claude/desktop-knowledge/README.md` Method A for the full flow.

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

## Area-level context

(Wave 15) When `--area-context=create` is passed, the skill scaffolds two area-level files at `~/cowork/<area>/` from `templates/AREA_CLAUDE.md.tmpl` + `templates/_area.md.tmpl`:

- `<area>/CLAUDE.md` — persona, collaborators table, writing-style block, research sources. Inherited by every project under `<area>/` via Claude Code's parent-walk auto-load.
- `<area>/_area.md` — structured area metadata (YAML frontmatter: collaborators with email/role/preference/alias, canonical sources).

These files are also **copied bytes-exact** into the project's bundle as `area-CLAUDE.md` and `area-meta.md`, growing the bundle from 5 files to 7 (because Claude Desktop / claude.ai don't parent-walk — they only see what's in Project Knowledge). When the operator later edits `<area>/CLAUDE.md` or `_area.md`, run `/cowork-area-sync <area>` to refresh every active project's bundle.

**Idempotency invariant unchanged.** Area-file content does NOT enter the project's `idempotency_key` — the Wave 13 input set (templates + USER.md + FEEDBACK.md + PROJECTS.md) is preserved. Editing `<area>/CLAUDE.md` between two identical `/new-cowork <area> <project>` invocations does not invalidate the Stage 1 no-op. Area-content propagation is owned by `/cowork-area-sync`, not `/new-cowork`.

**Per-file rollback.** A failed run (e.g. test hook `NEW_COWORK_FAIL_AFTER_AREA_SCAFFOLD=1`, or a crash between area scaffold and project scaffold) rolls back only the area files THIS invocation created (per-file `area_claude_created_this_run` / `area_meta_created_this_run` booleans + sha256 match check). Pre-existing operator-authored area files are left byte-identical. The terminal receipt records `rolled_back: true` + per-file `area_*_rollback_skipped_reason` for files left in place.

Full design + edge cases: [docs/specs/2026-05-14-cowork-area-context.md](../../docs/specs/2026-05-14-cowork-area-context.md).

## See also

- `docs/specs/2026-05-13-memory-system-redesign.md` (Phase 3; Task 11)
- `docs/specs/2026-05-14-cowork-area-context.md` (Wave 15: area-level context layer + `/cowork-area-sync`)
- `docs/protocol/receipt-schema.md` (canonical receipt fields + idempotency_key derivation)
- `skills/_shared/lib/emit-receipt.sh` (canonical receipt helper)
- `skills/cowork-area-sync/` (sibling skill for refreshing area files in existing bundles)
- `feedback_skill_help_branch_invariant` (handle `--help` before side effects)
