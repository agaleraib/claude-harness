---
wave_number: 17
slug: plan-spec-grammar-globalization
spec_path: docs/specs/2026-06-11-plan-spec-grammar-globalization.md
merge_sha: 5a1e585
work_sha: 1a1ded7
closed_at: 2026-06-12
branch: grammar-globalization
status: merged
---

# Wave 17 — Plan & spec grammar globalization

Writes the two-ladder plan/spec numbering grammar down once, globally, and points
`spec-planner` at it instead of at prior specs. Board ladder (`Wave N`, monotonic,
`plan.md` only) and spec ladder (`Phase`/`Task`, restart-at-1, `docs/specs/` only) never
cross; a mandatory `> **Board wave:**` header line is the canonical machine-readable
anchor. The `(Wave N)` parenthetical is demoted to optional-legacy (not banned), so no
cross-repo migration is forced. `markdown-app` (cleanPlan) is the parser pilot that
proves the grammar end-to-end.

Built directly in-session (doc + small back-compatible TS change), not via `/run-wave`
dispatch. Recorded as Wave 17 for board auditability. Merged to master via `--no-ff`
(`5a1e585`); markdown-app pilot merged to its `main` separately.

## §Shipped (claude-harness — global layer)

| Task | File(s) | Description |
|------|---------|-------------|
| T1 | `AGENTS.md` | New `## Plan & spec grammar` section — two ladders, monotonic board wave, spec-local Phase/Task, F-0xx global, mandatory header-line format, whole-project exception, parenthetical-as-legacy |
| T2 | `.claude/agents/spec-planner.md` | Header line added to the spec Output Format template; Rule #13 (numbering follows AGENTS.md §grammar, not prior specs); Prior-Work-governs-content-not-numbering note. Propagates to every repo via the `~/.claude/agents/` symlink |

## §Shipped (markdown-app — parser pilot, separate repo / branch `board-wave-grammar-pilot`)

| Task | File(s) | Description |
|------|---------|-------------|
| T3 | `src/parser/specParse.ts`, `model.ts` | `BoardWaveHeader` + `boardWaves` on `ParsedSpec`; header-line parse (`·`-split, tolerates `>`/`**`); `boardWaveCovers()` (exact or integer-range); `findAnchorLine` resolves board-`Wave N` via header line first, suppresses legacy `Wave N → Phase N` pairing when a header line exists (legacy pairing intact when absent) |
| T4 | `divergence.ts`, `index.ts`, `components/DivergenceBadge.tsx` | `board-wave-divergence` flag (plan board wave ∉ spec's declared waves), wired into `waveDivergenceFlags`; barrel exports; badge label |
| T5 | `docs/specs/*.md` (×3) | Header lines backfilled with real board numbers: repo-doc-browser = Wave 7; plan-follower-desktop = Wave 1–5 (sanctioned exception); wave5-split-pane = Wave 5 (supplement) |
| T6 | `tests/parser.divergence.test.ts` | +5 describe blocks. Keystone proof: a board-Wave-3 spec with phases 1–3 resolves `Wave 3` → first Phase (work start), NOT `### Phase 3` |

## §Exit Gate Results

| Check | Result | Evidence |
|-------|--------|----------|
| AGENTS.md has `## Plan & spec grammar` naming both ladders | ✓ PASS | section present after `## Where state lives` |
| spec-planner emits the header line + Rule #13 | ✓ PASS | `Board wave:` in Output Format template; Rule #13 added |
| Change is additive (no spec invalidated; parenthetical still valid) | ✓ PASS | demote-not-banned; legacy specs untouched |
| markdown-app: header line parsed, canonical anchor, divergence flag | ✓ PASS | new vitest blocks green |
| markdown-app: typecheck + lint clean, tests green | ✓ PASS | `typecheck: OK`, `lint: OK`, 234/234 vitest |

## §Drift the pilot exposed

markdown-app's `plan.md` correctly files the repo-doc-browser feature as board **Wave 7**,
but the spec's phases had historically been labeled `(Wave 1…4)` — spec-internal phase
numbers masquerading as board waves. The header line now makes Wave 7 canonical; the new
`board-wave-divergence` flag catches the reverse case automatically.

## §Follow-ups (parked)

- OQ#1: have `spec-planner`'s plan.md auto-append also assert the spec's header-line wave
  matches the appended board wave (close the loop server-side, not just in cleanPlan).
- OQ#2: backfill other repos' active specs lazily (header line is additive — no rush).
