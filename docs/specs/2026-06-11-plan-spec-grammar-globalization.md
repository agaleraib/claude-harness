# Plan & spec grammar globalization — two ladders, one canonical anchor

> **Board wave:** Wave 17 · Phases 1–2 · Tasks 1–6

## Overview

The harness had no canonical doc defining how `Wave` / `Phase` / `Task` / `F-0xx`
numbering works. The grammar was already universal in *behavior* — `/run-wave` reads
`### Wave N` as the board unit, specs subdivide into `Phase`/`Task` internally — but it
lived only as tribal pattern across `spec-planner`, `run-wave`, and `close-wave`. With
the rule unwritten, the de-facto template became "read the last spec and match it,"
which replicated the `Phase N (Wave N)` ambiguity (a spec's internal phase numbers
masquerading as board waves) every time a new spec was authored.

This wave writes the rule down once, globally, and points the planner at it. A
downstream consumer (`markdown-app` / cleanPlan, which parses `plan.md` + specs) is
the pilot that proves the grammar end-to-end.

**Design decision (origin: a pasted analysis proposing this for markdown-app only):**
the analysis recommended keeping the grammar *project-local* because "spec-planner is
shared." That premise is inverted — the two-ladder grammar is **already** the harness's
universal contract, so its rules belong in the global layer (`AGENTS.md`), while only
per-spec *data* and the *parser* stay local. The `(Wave N)` parenthetical is **demoted
to optional-legacy, not banned** (operator decision), so existing specs across all repos
keep working with no migration sweep; the header line is additive and authoritative.

## Implementation

**Recommended flow:** Built directly in-session (doc + small-TS change), not via
`/run-wave` dispatch. Recorded retroactively as Wave 17 for board auditability.
**Reason:** 6 tasks, no parallelism, low blast radius (additive docs + back-compatible parser).
**Alternatives:** None — the global doc edits are pure documentation of existing behavior.
**Implementation block written:** 2026-06-11

## The grammar (canonical text lives in AGENTS.md §"Plan & spec grammar")

Two ladders that never cross:

1. **Board ladder — `Wave N` (`docs/plan.md` only).** Global, monotonic (`max + 1` at
   append), never restarts, never reused, never renumbered. The `/run-wave` unit.
2. **Spec ladder — `Phase` + `Task` (`docs/specs/` only).** A per-feature spec
   subdivides exactly one board wave into `Phase 1..n` / `Task 1..m`, restarting at 1.
3. **Feature ids — `F-0xx`.** Global/monotonic across all specs.
4. **Mandatory header line** — `> **Board wave:** Wave N · Phases A–B · Tasks C–D ·
   Features F-0XX–F-0YY` — the machine-readable map; the canonical anchor a parser reads
   to jump between `plan.md` and the spec.
5. **Exception** — a whole-project spec defining several board waves may map
   `Phase N = Wave N` (only when N is the real board number); emits one header line per
   board wave.
6. **`(Wave N)` parentheticals are legacy fallback, not canonical** — valid but not
   authoritative; tools resolve from the header line first.

## Requirements

### Phase 1: Global grammar layer (claude-harness)

**Acceptance criteria (all must pass):**
- [x] `AGENTS.md` has a `## Plan & spec grammar` section stating the two ladders, the
  monotonic board-wave rule, spec-local Phase/Task restart, F-0xx global, the mandatory
  header-line format, the whole-project exception, and the parenthetical-as-legacy rule.
- [x] `spec-planner` emits the `> **Board wave:**` header line in its spec template.
- [x] `spec-planner` has a hard rule: numbering follows AGENTS.md §grammar, not prior
  specs; Prior-Work governs content inheritance only.
- [x] Change is additive — no existing spec is invalidated; the parenthetical stays valid.

### Phase 2: Parser pilot (markdown-app — cross-repo validation)

**Acceptance criteria (all must pass):**
- [x] The parser parses the header line into a `BoardWaveHeader` (`wave` + optional
  `phases`/`tasks`/`features`), tolerating `>` and `**` decoration and `·` separators.
- [x] `findAnchorLine` resolves a board-`Wave N` anchor via the header line first and
  **suppresses** the legacy `Wave N → Phase N` pairing when a header line is present;
  legacy pairing is intact when no header line exists (back-compat).
- [x] A new `board-wave-divergence` flag fires when `plan.md`'s board wave is not covered
  by the spec's declared header-line wave(s) (exact id or integer range like `1–5`).
- [x] The 3 existing markdown-app specs carry correct header lines (repo-doc-browser =
  Wave 7; plan-follower-desktop = Wave 1–5 exception; wave5-split-pane = Wave 5 supplement).
- [x] `npm run typecheck` + `npm run lint` clean; `npm test` green (234/234).

## Implementation Plan (Sprint Contracts)

### Phase 1
- [x] **Task 1:** AGENTS.md `## Plan & spec grammar` section.
  - **Files:** `AGENTS.md`
  - **Depends on:** Nothing
  - **Verify:** `grep -q "## Plan & spec grammar" AGENTS.md` and the section names both ladders.
  - **Manual fallback:** edit `AGENTS.md` in any editor; insert the section after `## Where state lives`.
- [x] **Task 2:** spec-planner header-line template + Rule #13 + Prior-Work note.
  - **Files:** `.claude/agents/spec-planner.md`
  - **Depends on:** Task 1
  - **Verify:** `grep -c "Board wave:" .claude/agents/spec-planner.md` ≥ 1; Rule #13 present.
  - **Manual fallback:** edit the agent file; add the `> **Board wave:**` line to the Output Format block and a numbered rule.

### Phase 2 (markdown-app)
- [x] **Task 3:** header-line parse + canonical `findAnchorLine`.
  - **Files:** `src/parser/specParse.ts`, `src/parser/model.ts`
  - **Depends on:** Task 1 (grammar)
  - **Verify:** new vitest block — a Wave-3 spec with phases 1–3 resolves `Wave 3` → first Phase, not `### Phase 3`.
  - **Manual fallback:** N/A (TS change); run `npm test`.
- [x] **Task 4:** `board-wave-divergence` flag + wiring + badge + barrel exports.
  - **Files:** `src/parser/divergence.ts`, `src/parser/index.ts`, `src/components/DivergenceBadge.tsx`
  - **Depends on:** Task 3
  - **Verify:** vitest — plan Wave 8 vs spec header Wave 7 → one `board-wave-divergence` flag.
  - **Manual fallback:** N/A; `npm test`.
- [x] **Task 5:** backfill header lines into the 3 specs.
  - **Files:** `docs/specs/2026-06-11-repo-doc-browser.md`, `2026-06-10-plan-follower-desktop.md`, `2026-06-10-wave5-split-pane-explainer-settings.md`
  - **Depends on:** Task 1 (grammar)
  - **Verify:** each spec's first non-title line matches `Board wave:` with its real board number.
  - **Manual fallback:** edit each spec; add the header line after the H1.
- [x] **Task 6:** tests.
  - **Files:** `tests/parser.divergence.test.ts`
  - **Depends on:** Tasks 3–4
  - **Verify:** `npm test` green (234/234).
  - **Manual fallback:** N/A.

## Constraints

- Additive only: the `(Wave N)` parenthetical stays valid; no cross-repo spec migration.
- The global `AGENTS.md` + `spec-planner` change propagates to every repo via the
  `~/.claude/agents/spec-planner.md` symlink — intended (the grammar is universal).
- markdown-app's parser changes are back-compatible: legacy specs (no header line) keep
  the Phase↔Wave pairing behavior unchanged.

## Out of Scope

- Migrating existing specs in other repos (gobot, wordwideAI, etc.) to add header lines —
  lazy/optional, since the header line is additive.
- A `cleanPlan` UI surface for the new flag beyond the existing `DivergenceBadge`.
- Hard-banning the parenthetical (explicitly rejected in favor of demote-to-legacy).

## Open Questions

| # | Question | Impact | Decision needed by |
|---|----------|--------|-------------------|
| 1 | Should `spec-planner`'s plan.md auto-append also emit a board-wave check against the spec's header line? | Closes the loop server-side, not just in cleanPlan | Before next spec-planner change |
| 2 | Backfill other repos' active specs with header lines, or leave lazy? | Consistency vs. churn | When a divergence actually bites in another repo |
