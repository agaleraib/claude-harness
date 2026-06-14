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

> **/run-loop engine** (spec `docs/specs/2026-06-14-run-loop-engine.md`) is split across
> three board waves by dependency layer: **Wave 18** (Phase 1 foundation) → **Wave 19**
> (Phases 2–4 core) → **Wave 20** (Phases 5–7 safety + integration + entry). Each wave's
> blockers must be merged before the next dispatches. Within Waves 19/20, independent tasks
> may be fanned out in parallel (Workflow) since Phase 1 freezes the shared interfaces.

### Wave 18 — /run-loop engine: Phase 1 foundation (engine + runner interface)

- depends-on: none (new feature, claude-harness); sandcastle + Docker Desktop available; Matt Pocock engineering skills installed at `~/.agents/skills/`
- spec: docs/specs/2026-06-14-run-loop-engine.md
- done-when: the shared loop engine + `Runner` interface land in `skills/_shared/loop/` and pass their Verify blocks (Task 1 + Task 2); these interfaces are the contract every later wave imports
- next-concrete-action: Dispatch Wave 18 (Task 1 engine skeleton + Task 2 runner interface) serially via /run-wave

**Tasks (2) — Phase 1:** T1 (engine skeleton + control loop), T2 (runner interface: `sandcastle` + `worktree`).

**Exit gate:** Task 1 + Task 2 **Verify:** blocks in the spec, both green. The engine is a pure function of (work-source, git/issue state); the `Runner` interface resolves sandcastle-default / worktree-on-declaration and aborts cleanly when Docker is absent.

**Estimate:** small — 2 tasks, foundational; run serial (must merge before Wave 19).

### Wave 19 — /run-loop engine: Phases 2–4 core (providers + protocol + scheduler)

- depends-on: **Wave 18 merged** (engine + Runner interface frozen)
- spec: docs/specs/2026-06-14-run-loop-engine.md
- done-when: both work-source providers, the per-item mechanical protocol, and the DAG scheduler land and pass their Verify blocks; the core is unit-testable without any unattended/safety machinery
- next-concrete-action: After Wave 18 merges, fan out the independent tasks (T3 ∥ T4) then the protocol/scheduler chain — parallelizable via Workflow against the frozen interfaces

**Tasks (8) — Phases 2–4:** T3 (wave provider), T4 (issue provider + terminal-transition contract), T5 (implement→gate), T6 (review + auto-fix), T7 (findings→issues), T8 (DAG scheduler), T8a (concurrency + atomic-merge), T9 (failure handling + termination + run summary).

**Exit gate:** Each listed task's **Verify:** block (T3–T9 + 8a). Phases 1–4 Verify all green is the precondition for any live test.

**Estimate:** medium–large — providers parallelizable; protocol→scheduler is a dependency chain.

### Wave 20 — /run-loop engine: Phases 5–7 safety + integration + entry

- depends-on: **Wave 19 merged** (core providers + protocol + scheduler)
- spec: docs/specs/2026-06-14-run-loop-engine.md
- done-when: host guardrails, harness integration, the `/run-loop` entry point, and AGENTS.md docs land and pass their Verify blocks; the denylist hook + egress enforcement are installed before any unattended worktree run; e2e live test runs against quickbase-replacement issues #2/#3
- next-concrete-action: After Wave 19 merges, fan out the independent leaves (T10, T11, T14, T15, T17) then the dependent tasks; T18 (live test) last

**Tasks (10) — Phases 5–7:** T10 (denylist hook), T11 (worktree write-confinement), T11a (secret-bearing in-run containment), T12 (shared AFK/HITL classifier), T13 (close-wave tick + receipts), T14 (/park promote + /triage-parking), T15 (/spec-planner Runner field), T16 (/run-loop skill), T17 (AGENTS.md loop protocol), T18 (e2e live test).

**Exit gate:** Each listed task's **Verify:** block (T10–T18 + 11a). Hard gate: denylist hook + egress enforcement installed before the first unattended worktree run; T18 emits the AFK/HITL/blocked run-summary metric.

**Estimate:** large — PreToolUse hook + edits across 4 existing skills + the entry skill + live test.

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
