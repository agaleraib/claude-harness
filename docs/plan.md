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

### Wave 16 — Cowork envelope interview (Pivot §4.6 implementation, cross-repo)

- depends-on: Wave 15 merged (✓ d7f1d30) + gobot at `~/workspace/gobot/`
- spec: docs/specs/2026-05-20-cowork-envelope-interview.md
- done-when: All 8 envelope arrays land in every new _charter.md scaffolded by /new-cowork; existing charters untouched; scope-mcp-adapter caller count in gobot unchanged; gobot tsc baseline unchanged
- next-concrete-action: Resolve OQ-3 / OQ-4 / OQ-5, then dispatch Task 1 (template skeleton)

**Tasks (7) — splits cross-repo:** T1 (template, claude-harness), T2 (schema + validator + fixtures, claude-harness), T3 (8 typed probes, **gobot**), T4 (wrapper + --scope-file, claude-harness), T5 (probe tests, **gobot**), T6a (scope-mcp-adapter, **gobot**), T6 (docs, claude-harness). Either merge order is mechanically safe via interview_available gate.

**Exit gate:** 14 numbered checks live in `## Exit Gate` of the spec (rows 1-14). Source of truth is that section.

**Estimate:** ~1.5–2 operator-days end-to-end.

## Next

(none queued)

## Blocked

(none)

## Recently Shipped

- [x] Wave 17 - Plan & spec grammar globalization (two-ladder + board-wave header line; markdown-app parser pilot) -> docs/waves/wave17-plan-spec-grammar-globalization.md (5a1e585)
- [x] Wave 15 - Cowork area-level context (Pivot Phase 3 sub-spec) -> docs/waves/wave15-cowork-area-context.md (d7f1d30)
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
