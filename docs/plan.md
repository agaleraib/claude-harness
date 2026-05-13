# claude-harness — plan

Navigator-style active board. Per v2 §6, the file has exactly four sections — `## Now` / `## Next` / `## Blocked` / `## Recently Shipped`. Wave entries in `## Now` / `## Next` use the H3-block form `/spec-planner` auto-appends; entries in `## Recently Shipped` collapse to one-line `[x]` rows pointing at `docs/waves/wave<N>-<slug>.md`. Detail (deviations, exit-gate proofs, post-merge fixes) lives in the `docs/waves/` archive files; this file is the index, not the log.

## Operating Rules for Execution

- Stage files explicitly — never `git add -A` / `git add .`
- `--no-ff` merges on all feature branches
- One wave per dispatch; human checkpoint between waves
- Sub-bullets are authoritative scope when they diverge from headers
- `## Recently Shipped` is compacted by `/archive-plan` (default `keep_last=3`); rows older than the retention window are removed entirely — the wave file in `docs/waves/` is canonical

---

## Now

### Wave 13 - Memory system redesign — /new-cowork skill + Cross-surface section
- spec: docs/specs/2026-05-13-memory-system-redesign.md
- status: ready
- exit gate: `skills/new-cowork/SKILL.md` + `lib/new-cowork.sh` + templates exist; sandbox invocation produces folder with `CLAUDE.md` + `_charter.md` + `_automations.md` + `.claude/desktop-knowledge/{README.md,USER.md→symlink,FEEDBACK.md→symlink,workspace-CLAUDE.md,mcp-config-snippet.json}`; AGENTS.md `## Cross-surface consumption` section present; WORKFLOW.md has rows for `/memory-prune` and `/new-cowork` with no `<deferred>` placeholders

### Wave 14 - Memory system redesign — gobot pivot cascade
- spec: docs/specs/2026-05-13-memory-system-redesign.md
- status: ready
- exit gate: `gobot/docs/specs/2026-05-11-pivot-to-workspace-as-context.md` edited per Task 14; `grep -rn 'gobot-workspaces' gobot/docs/` returns zero hits; `grep -rn 'state_json\.workspace\|workspace_scope\|writeWorkspaceArtifact\|/new-workspace' gobot/docs/specs/2026-05-11*` returns zero hits; `grep -rn '_charter\.md\.kind' gobot/docs/specs/2026-05-11*` returns ≥1 hit (retained); single atomic commit

## Next

(none queued)

## Blocked

(none)

## Recently Shipped

- [x] Wave 12 - Memory system redesign — migration + /memory-prune skill (54 promote / 3 archive / 205 keep) -> docs/waves/wave12-memory-system-migration-and-prune.md (be8a393)
- [x] Wave 11 - Memory system redesign — shared root + AGENTS/CLAUDE memory section + MEMORY.md trim -> docs/waves/wave11-memory-system-redesign-shared-root.md (69dc82d)
- [x] Wave 10 - Plan maintenance, docs/waves/ archive, registry, and /harness-status (v2 Wave 2) -> docs/waves/wave10-plan-registry-maintenance.md (a113829)
- [x] Wave 9 - Universal Harness Protocol — spec Wave 1 (Claude adapter alignment) -> docs/waves/wave9-claude-adapter-alignment.md (a5c844b)
- [x] Wave 8 - Universal Harness Protocol — spec Wave 0 -> docs/waves/wave8-universal-protocol-core.md (1d7cee0)
- [x] Wave 6 - Planning-loop trim — skill-creator alignment -> docs/waves/wave6-planning-loop-skill-creator-alignment.md (b051ee8)
- [x] Wave 5 - Planning-loop trim — regressions -> docs/waves/wave5-planning-loop-trim-regressions.md (ec3f49b)
- [x] Wave 4 - Planning-loop auto-apply arbiter -> docs/waves/wave4-planning-loop-auto-apply-arbiter.md (5b29e9a)
- [x] Wave 3 - V1 Harness Model Pin — README sync -> docs/waves/wave3-readme-cross-reference.md (146908c)
- [x] Wave 2 - V1 Harness Model Pin — orchestrator routing + logging -> docs/waves/wave2-orchestrator-effort-routing.md (4753502)
- [x] Wave 1 - V1 Harness Model Pin — profile schema -> docs/waves/wave1-harness-model-pin-profile-schema.md (4109de6)
