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

(none queued)

## Next

### Wave 15 - Cowork area-level context (Pivot Phase 3 sub-spec)
- spec: docs/specs/2026-05-14-cowork-area-context.md
- status: ready
- exit gate: `templates/AREA_CLAUDE.md.tmpl` + `templates/_area.md.tmpl` exist in `skills/new-cowork/templates/`; `bash skills/new-cowork/lib/new-cowork.sh --area-context=create <new-area> <new-project>` in a fresh sandbox produces `<new-area>/CLAUDE.md` + `<new-area>/_area.md` AND project bundle contains `area-CLAUDE.md` + `area-meta.md` (5→7 file bundle delta); re-run is Stage 1 no-op (idempotency_key unchanged by area-file content edits); `skills/cowork-area-sync/SKILL.md` + `lib/cowork-area-sync.sh` exist and pass mixed active/closed/missing-status fixture (closed projects byte-identical before/after); resume case completes via journal glob + `status: in-progress` filter, adopts the in-progress `<utc-iso>` as session id; ambiguous-resume (≥2 in-progress journals) exits 6 with zero filesystem mutation; per-file rollback booleans (`area_claude_created_this_run`, `area_meta_created_this_run`) exercised by mixed-pre-existing-state fixtures; WORKFLOW.md has `/cowork-area-sync` row; AGENTS.md § Cross-surface mentions area-level files
- depends-on: Wave 13 merged ✓ (`/new-cowork` shipped at `cd59e10`); cross-references gobot pivot Phase 3 (line 393 stub expanded by this sub-spec)
- note: 3 unresolved Codex findings deferred to implementation per `feedback_planning_loop_stop_signal` — F5 (cowork-area-sync receipts conforming to docs/protocol/receipt-schema.md), F6 (source-digest drift check on resume), F7 (Codex prompt contract stop conditions); see `.harness-state/planning-loop/2026-05-14-cowork-area-context-revise-150920.md` for full review trail

## Blocked

(none)

## Recently Shipped

- [x] Wave 14 - Memory system redesign — gobot pivot cascade (cross-repo) -> ../gobot/docs/waves/wave14-cowork-rename-cascade.md (gobot:970f790)
- [x] Wave 13 - Memory system redesign — /new-cowork skill + Cross-surface section + WORKFLOW rows -> docs/waves/wave13-new-cowork-and-cross-surface.md (cd59e10)
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
