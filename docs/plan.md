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

### Wave 24 — /run-loop portable exit gate (repo-resolved checks + fail-safe)

- depends-on: Wave 23 merged (✓ 1173320)
- spec: docs/specs/2026-06-16-run-loop-portable-gate.md
- Runner: worktree — all tasks. T1–T6 are AFK (ready-for-agent), built on the host via the `/run-wave` orchestrator's `.claude/worktrees/agent-<id>/` (the sandcastle container lane is preflight-refused on this host, so it is NOT used); T7 is worktree/HITL (ready-for-human) — operator-gated live validation, a DAG leaf (no HITL-as-non-leaf warning)
- done-when: `ShellGateRunner` executes the repo-resolved gate (`.harness-profile gate:` → `RUN_LOOP_GATE_*` → `RepoGateConfig`); no gate configured ⇒ preflight-refused (primary) + per-item RED (backstop), never vacuously green; partial gate (a sub-check empty) still passes; the verify-gate reproduces a gate-reddening finding again; SKILL.md + AGENTS.md document the `gate:` block + the "adopt on a new repo" checklist; 240-test baseline green + new regressions, strict tsc 0, no `any`, zero frozen-interface change
- next-concrete-action: `/run-wave 24` (spec adversarially approved via `/planning-loop` 2026-06-17 — 3 cap rounds + arbiter + `/grill-me` Task 4 redesign + confirming passes → `approve`)

**Tasks (7):** T1 `buildGateConfigFromEnv` + `RepoGateConfig` threading (F-030), T2 fail-safe `ShellGateRunner` three-way rule (F-031), T3 preflight refusal for unconfigured repos (F-032), T4 FF-only merge guard + post-gate worktree hygiene (`--ff-only` + `discardWorktreeChanges`) (F-033), T5 verify-gate-heals regression test (F-034), T6 `gate:` block docs + new-repo on-ramp checklist (F-035), T7 live validation on quickbase-replacement [worktree/HITL, DAG leaf] (F-036). Dependency: T1 → T2 → {T3, T4}; T5 after T2; T6 after T4; T7 operator-gated (after T3+T4+T6). T1–T6 AFK/worktree; T7 HITL.

**Exit gate:** Each task's `Verify` block in the spec is the source of truth. Wave-level: the repo-resolved gate executes real checks; the fail-safe three-way rule holds (no-gate ⇒ refuse + red; partial ⇒ passes; configured-but-empty ⇒ red); the verify-gate heals; 240+ tests green; strict tsc 0; no `any`; zero frozen-interface change.

**Estimate:** ~0.5–1 operator-day for T1–T5 (code + docs); T6 is a separate operator-gated live run.

## Blocked

(none)

## Recently Shipped

- [x] Wave 23 - /run-loop adopt merge-to-head + HITL PR handoff + attention report: per-item temp branch off HEAD → on GREEN ff-merge into HEAD + delete (no PR/push/human); non-green (conflict/red gate/review finding) → push + draft PR + persistent `.harness-state/run-loop-<date>-attention.md`; no-remote fallback to copy-paste commands; escalate-on-conflict + throw-cleanup (no stranded branch); termination caps (20/stall 3); built-but-unwired modules dispositioned. 240 tests, tsc 0, zero frozen-interface change; T8 live re-drain PASS (real merge SHA 4f3ed3f) -> docs/waves/wave23-run-loop-merge-to-head.md (1173320)
- [x] Wave 22 - /run-loop issues live-drain fixes: 4 integration bugs (readiness, crash-isolation, commit-on-edits, honest bucketing) + env-gated terminal transition + per-run `--implement`/`--review` backend-direction knob; deterministic gate green (212 tests, tsc 0, zero frozen-interface change); dual-direction live re-drain (T7) + T5 live-gh DEFERRED to operator -> docs/waves/wave22-run-loop-live-drain-fixes.md (cb8d098)
- [x] Wave 21 - /run-loop live wiring: pluggable backends + cross-model review + production composition root (live drain via real entry: Codex implement + Opus-4.8 review) -> docs/waves/wave21-run-loop-live-wiring.md (8461197)
- [x] Wave 20 - /run-loop engine: Phases 5–7 safety + integration + entry -> docs/waves/wave20-run-loop-engine-safety-integration.md (8c605fe)
- [x] Wave 19 - /run-loop engine: Phases 2–4 core (providers + protocol + scheduler) -> docs/waves/wave19-run-loop-engine-core.md (eede94b)
- [x] Wave 18 - /run-loop engine: Phase 1 foundation (engine + runner interface) -> docs/waves/wave18-run-loop-engine-foundation.md (953987f)
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
