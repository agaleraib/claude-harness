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

### Wave 10 - Plan maintenance, docs/waves/ archive, registry, and /harness-status (v2 Wave 2)
- spec: docs/specs/2026-05-02-plan-registry-maintenance.md
- status: ready
- exit gate: docs/plan.md is a four-section active board; eight wave summaries migrated to docs/waves/; close-wave Step 8 retargeted to docs/waves/; /archive-plan idempotent + §4.2-receipt with cross-adapter idempotency_key equality (manual+claude-code success-receipt pair byte-equal); ~/.config/harness/projects.yml is path-only; /harness-status read-only with §4.2-receipt and pre-conversion-repo tolerance; WORKFLOW.md +2 rows; fixtures green

## Next

(none queued)

## Blocked

(none)

## Recently Shipped

- [x] Wave 9 - Universal Harness Protocol — spec Wave 1 (Claude adapter alignment) -> docs/waves/wave9-claude-adapter-alignment.md (a5c844b)
- [x] Wave 8 - Universal Harness Protocol — spec Wave 0 -> docs/waves/wave8-universal-protocol-core.md (1d7cee0)
- [x] Wave 6 - Planning-loop trim — skill-creator alignment -> docs/waves/wave6-planning-loop-skill-creator-alignment.md (b051ee8)
- [x] Wave 5 - Planning-loop trim — regressions -> docs/waves/wave5-planning-loop-trim-regressions.md (ec3f49b)
- [x] Wave 4 - Planning-loop auto-apply arbiter -> docs/waves/wave4-planning-loop-auto-apply-arbiter.md (5b29e9a)
- [x] Wave 3 - V1 Harness Model Pin — README sync -> docs/waves/wave3-readme-cross-reference.md (146908c)
- [x] Wave 2 - V1 Harness Model Pin — orchestrator routing + logging -> docs/waves/wave2-orchestrator-effort-routing.md (4753502)
- [x] Wave 1 - V1 Harness Model Pin — profile schema -> docs/waves/wave1-harness-model-pin-profile-schema.md (4109de6)
