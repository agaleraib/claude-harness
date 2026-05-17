---
wave_number: 15
slug: cowork-area-context
spec_path: docs/specs/2026-05-14-cowork-area-context.md
merge_sha: d7f1d30
closed_at: 2026-05-17
---

# Wave 15 — Cowork area-level context

Pivot Phase 3 sub-spec: expands the one-line stub *"Area-level shared `~/cowork/<area>/CLAUDE.md` for inherited tone"* into a shippable feature. Adds `<area>/CLAUDE.md` + `<area>/_area.md` scaffolding (via `/new-cowork --area-context=create`), grows the desktop-knowledge bundle from 5 → 7 files when area context exists, and ships a new `/cowork-area-sync <area>` skill to refresh existing bundles after operator edits.

Worktree: `.claude/worktrees/agent-a21dd1e300988e83e` (branch `worktree-agent-a21dd1e300988e83e`).

## §Shipped

| # | Commit  | Task | Vertical | Description |
|---|---------|------|----------|-------------|
| 1 | 83b3e4c | T1 | templates | Add `AREA_CLAUDE.md.tmpl` + `_area.md.tmpl` from spec Data Model section with `{{AREA}}` / `{{TODAY}}` substitutions |
| 2 | 43bc45a | T2 | lib | Extend `new-cowork.sh` with `--area-context=create\|skip\|require` flag, non-TTY guard (exit 4 pre-disk-write), require-mode missing-file (exit 5), `maybe_scaffold_area_context` via temp+rename, combined EXIT trap with per-file `area_*_created_this_run` rollback (sha256-match gate), `NEW_COWORK_FAIL_AFTER_AREA_SCAFFOLD=1` test hook |
| 3 | a1cdeec | T3 | lib | Bundle copy logic after step 9 — bytes-exact `<area>/CLAUDE.md` → `area-CLAUDE.md`, `_area.md` → `area-meta.md` (5→7 file delta when both present; skip silently when absent) |
| 4 | 9ac9e44 | T4 | templates | Update `desktop-knowledge-README.md.tmpl` — document area files in bundle listing, point operators at `/cowork-area-sync` for refresh-after-edit |
| 5 | f03b835 | T5 | lib | Receipt schema — `area_context_present`, `area_context_decision`, `decided_via`, `area_context_skip_reason`, `area_claude_digest_at_scaffold`, `area_meta_digest_at_scaffold` in per-command appendix. **Audit-only — NOT part of `idempotency_key`** (Wave 13 input set preserved) |
| 6 | fc8a5e6 | T6 | skill | New `/cowork-area-sync` skill: SKILL.md + `lib/cowork-area-sync.sh`. Active-only awk status parser, per-project temp+rename + started/terminal receipts, parent journal with `in-progress\|complete\|failed`, resume via journal glob + status filter, ambiguous-resume exit 6, F6 source-digest drift exit 7, `--dry-run`, F5/F6 implemented inline per safe defaults |
| 7 | d1ad652 | T7 | skill | Update `new-cowork/SKILL.md` body — document `--area-context` flag, 5→7 bundle delta, idempotency invariant unchanged, per-file rollback semantics, cross-link spec |
| 8 | 95b8702 | T8 | protocol | `AGENTS.md` Cross-surface now mentions `area-CLAUDE.md` + `area-meta.md`; `WORKFLOW.md` gains `/cowork-area-sync` row + verbatim Codex prompt contract block (lines 262-340 of spec) immediately below the matrix |

8 commits, all sequential (each task depends on the previous in the spec's dependency graph). Atomic 5→7 invariant preserved: Tasks 2, 3, 5 must ship together for the bundle propagation contract to be coherent.

## §Wave 15 Exit Gate Results

### Plan.md inline gate (verbatim from `docs/plan.md:24`)

| Check | Result | Evidence |
|-------|--------|----------|
| `templates/AREA_CLAUDE.md.tmpl` + `templates/_area.md.tmpl` exist in `skills/new-cowork/templates/` | ✓ PASS | `ls` exits 0; grep `{{AREA}}` = 3 in AREA template, 1 in `_area.md.tmpl` |
| `bash skills/new-cowork/lib/new-cowork.sh --area-context=create <new-area> <new-project>` in fresh sandbox produces `<new-area>/CLAUDE.md` + `<new-area>/_area.md` AND project bundle contains `area-CLAUDE.md` + `area-meta.md` (5→7 file bundle delta) | ✓ PASS | sandbox scaffolded `xtest-area/CLAUDE.md` + `_area.md`; bundle non-mcpb count = 7 (was 5 in skip mode) |
| Re-run is Stage 1 no-op (idempotency_key unchanged by area-file content edits) | ✓ PASS | First key = `1ad4f3e2…369e069`; after `<area>/CLAUDE.md` edit + PROJECTS.md rollback + scaffold removal, second key = same `1ad4f3e2…369e069`. Area content does not enter the project's `idempotency_key`. |
| `skills/cowork-area-sync/SKILL.md` + `lib/cowork-area-sync.sh` exist | ✓ PASS | both files present and executable; `--help` exits 0 |
| Mixed active/closed/missing-status fixture (closed projects byte-identical before/after) | ✓ PASS | sandbox with `g5act1`, `g5act2`, `g5closed`, `g5missing` all scaffolded via real `/new-cowork`; `g5closed` had status flipped via sed; `g5missing` had status line removed; after sync, active diffs are empty AND `find ... -exec shasum` on closed/missing-status bundle dirs is byte-identical pre/post |
| Resume case completes via journal glob + `status: in-progress` filter, adopts in-progress `<utc-iso>` as session id | ✓ PASS | `COWORK_AREA_SYNC_FAIL_AFTER_PROJECT=1` interrupt leaves journal `status: in-progress` with session id `2026-05-17T132755Z`; re-invocation discovers it, adopts the session, writes terminal receipts `cowork-area-sync-resgate-r1-2026-05-17T132755Z.yml` + `…-r2-…` (same session id), finalizes journal to `complete`; both active projects byte-exact match source |
| Ambiguous-resume (≥2 in-progress journals) exits 6 with zero filesystem mutation | ✓ PASS | seeded two `status: in-progress` journals; invocation exits 6 with both paths printed; `find -exec shasum` manifest identical pre/post |
| Per-file rollback booleans (`area_claude_created_this_run`, `area_meta_created_this_run`) exercised by mixed-pre-existing-state fixtures | ✓ PASS | seeded `<area>/CLAUDE.md` by hand, left `_area.md` absent; ran with `NEW_COWORK_FAIL_AFTER_AREA_SCAFFOLD=1`; pre-existing `CLAUDE.md` byte-identical post-rollback; `_area.md` (created this run) deleted; receipt records `area_claude_rollback_skipped_reason: "area_claude pre-existed"` |
| WORKFLOW.md has `/cowork-area-sync` row | ✓ PASS | `grep -c 'cowork-area-sync' WORKFLOW.md` = 6 (row + Codex prompt block headings) |
| AGENTS.md § Cross-surface mentions area-level files | ✓ PASS | `grep -E 'area-CLAUDE\.md\|area-meta\.md' AGENTS.md` returns the updated Cross-surface paragraph naming both files |

### Spec §Exit gate block (verbatim from `docs/specs/2026-05-14-cowork-area-context.md` lines 343-360)

| Check | Result | Evidence |
|-------|--------|----------|
| Both area templates exist in `skills/new-cowork/templates/` | ✓ PASS | as above |
| Fresh-sandbox `--area-context=create` produces both area files + 7-file bundle | ✓ PASS | as above |
| Interrupted-run rollback (`NEW_COWORK_FAIL_AFTER_AREA_SCAFFOLD=1`) deletes only this-run-created area files via per-file `area_*_created_this_run` + sha256 match | ✓ PASS | both-created case: both files removed, `rollback_targets: [..., ...]`. Mixed-pre-existing case: pre-existing file byte-identical, `area_*_rollback_skipped_reason: "area_* pre-existed"`. Both-pre-existing case (operator seeded both, interrupted): trap leaves both byte-identical, receipt records both `…_rollback_skipped_reason` |
| Non-TTY + no flag → exit 4 with zero filesystem mutation (no started receipt, no area files, no project files) | ✓ PASS | `find` manifest identical pre/post; no `state/` or `cowork/` directories created |
| `--area-context=require` + missing → exit 5, no project scaffold, no area scaffold | ✓ PASS | `[ ! -d <area>/<project> ]` AND `[ ! -f <area>/CLAUDE.md ]` |
| Re-running successful command refuses to overwrite (Stage 1 no-op) | ✓ PASS | Wave 13 existing behavior unchanged; new keys are audit-only metadata |
| `skills/cowork-area-sync/SKILL.md` + `lib/cowork-area-sync.sh` exist. **`~/.claude/skills/cowork-area-sync` symlink is NOT required** | ✓ PASS | repo-local files present; no symlink created (intentional per spec line 244) |
| Symmetric file handling: copy on create/update, remove stale bundle copy on canonical-file delete | ✓ PASS | delete-source test: removed `<area>/_area.md`; re-run via fresh session; receipt records `area_meta_action: delete`, `area_meta_after_sha256: null`; bundle's `area-meta.md` removed |
| **Closed-project isolation**: `status: closed` left byte-identical, recorded under `projects_skipped` with `reason: inactive` | ✓ PASS | closed-project fixture built via real scaffolder + `sed` edit per spec line 210; `find ... -exec shasum` identical; journal `projects_skipped` row: `{ path: ".../g5closed", reason: inactive }` |
| **Charter-shape parity**: closed-project fixture built via real scaffolder + status edit (not synthetic YAML) | ✓ PASS | `bash skills/new-cowork/lib/new-cowork.sh --area-context=create gatearea g5closed` then `sed -i 's/- \*\*status:\*\* active/- **status:** closed/' g5closed/_charter.md` |
| Resume: failing project's `.started.yml` + in-progress journal; re-invocation discovers + completes; final state byte-identical to clean single-pass | ✓ PASS | interrupted run left `cowork-area-sync-resgate-r1-…yml` (terminal) + journal in-progress; resume finalized to `complete`; per-project bundles byte-exact match source post-resume |
| Ambiguous-resume → exit 6, zero mutation | ✓ PASS | as above |
| `--dry-run` exits 0 without mutating; verified via `sha256sum -c` against pre-run manifest | ✓ PASS | `find … -exec shasum > manifest; bash …--dry-run; shasum -c manifest` exits 0 |
| WORKFLOW.md has `/cowork-area-sync` row matching the §WORKFLOW.md row delta shape (5-column / 6-pipe parity with `/new-cowork`) AND verbatim Codex prompt contract appears immediately below the matrix row | ✓ PASS | new row pipe count = 6 (matches `/new-cowork`); Codex prompt block (Goal / Inputs / Outputs / Procedure / Stop conditions / Verification / Do NOT touch) inserted between the matrix and the existing `## Codex prompt contract` H2 |
| AGENTS.md Cross-surface mentions `area-CLAUDE.md` + `area-meta.md` | ✓ PASS | updated paragraph in Cross-surface consumption section |
| Receipt YAML on `/new-cowork` invocations includes `area_context_present`, `area_context_decision`, `decided_via`, `area_context_skip_reason` (any value, including `null` for the last); started receipt additionally includes `area_*_before_sha256`, `area_*_after_sha256`, `area_*_created_this_run` when `--area-context=create` writes area files | ✓ PASS | sample receipt grep'd; 6 keys present in terminal appendix (created mode); started-state receipt content captured pre-terminal-write also has the per-file digests/flags |
| No regression in 5-file bundle when area context absent (operator skip OR TTY `n`) | ✓ PASS | `--area-context=skip` mode: 5-file bundle (FEEDBACK.md, README.md, USER.md, mcp-config-snippet.json, workspace-CLAUDE.md); no `area-*.md` in bundle, no area files at `<area>/` |
| **F6 source-digest drift on resume** → exit 7 with both digest pairs printed; zero mutation | ✓ PASS | interrupted run, then mutated source between runs; resume call exits 7 with `recorded=… current=…` for both files; `sha256sum -c` manifest identical |

All exit gate checks PASS. No DEFERRED items.

## §Human-only TODOs

(none) — all 8 tasks were bash + markdown edits. No dashboards, key rotations, live deploys, or external service config.

## §Open Questions — answered, deferred, or unchanged

### Implemented inline with safe defaults (deferred from `/planning-loop` Round 4 per `feedback_planning_loop_stop_signal`)

- **F5 — `/cowork-area-sync` receipt schema parity.** **Resolved in commit fc8a5e6 (Task 6).** Per-project terminal receipts use the YAML keys named at spec line 230 verbatim (`command`, `area`, `project`, `area_claude_before_sha256`, `area_claude_after_sha256`, `area_claude_action`, `area_meta_before_sha256`, `area_meta_after_sha256`, `area_meta_action`). Shape conforms to `docs/protocol/receipt-schema.md` — sources additionally emit `session_id`, `started_at`, `completed_at`, `status: success`. The `idempotency_key` derivation is left for follow-up — the receipts as shipped are observable + rollback-traceable without it, and the spec's Exit gate does not require an idempotency-key field.
- **F6 — Source-digest drift check on resume.** **Resolved in commit fc8a5e6 (Task 6).** Implemented per safe-default: on resume, recompute `area_claude_source_sha256` + `area_meta_source_sha256` and compare to the parent journal's recorded digests. Mismatch → exit 7 with the message naming both digest pairs (recorded vs current) for both files. Zero filesystem mutation on refusal. Verified by hand: interrupted run, then `echo "OPERATOR LATE EDIT" >> <area>/CLAUDE.md`, resume invocation → exit 7, manifest `sha256sum -c` identical.
- **F7 — Codex prompt contract stop conditions.** **Resolved in commit 95b8702 (Task 8).** Used spec lines 316-324 as-written — success / failure / resume semantics specified verbatim. The contract is now in `WORKFLOW.md` immediately below the new matrix row.

### Source spec §Open questions — paper trail (no implementation change)

- **OQ-A1, OQ-A6, OQ-A7, OQ-A8** — already resolved in spec revisions 2-3 (round 2-4 Codex feedback). All resolutions land naturally in the shipped code:
  - OQ-A1 (non-TTY silent skip removed) → enforced via exit 4 in `new-cowork.sh`.
  - OQ-A6 (started receipt + per-file rollback for area scaffold) → implemented via `area_*_created_this_run` per-file booleans + sha256-match trap in commit 43bc45a.
  - OQ-A7 (`~/.claude/skills/cowork-area-sync` symlink demoted from required to optional) → exit gate uses repo-local files only.
  - OQ-A8 (active-only status parser + per-project resume + parent journal) → implemented in commit fc8a5e6.

- **OQ-A2** (manual `/cowork-area-sync` vs file-watch auto-sync) — **unchanged.** Manual flow shipped. File-watch auto-sync remains parking-lot fodder pending operator feedback on the manual flow's ergonomics.
- **OQ-A3** (gobot `project-context.ts` extending to also load area files) — **unchanged.** Out of scope per spec line 14 (gobot's pivot spec owns it). Wave 15 ships the data layer; gobot's consumption is a follow-up.
- **OQ-A4** (Supabase `cowork_areas` table) — **unchanged.** Recommendation: no. Areas remain a path segment.
- **OQ-A5** (`/cowork-area-sync` validating `_area.md` frontmatter) — **unchanged.** Recommendation: no. The skill is a transport, not a validator; YAML-syntax validation parked as a separate skill if/when operator hits a real failure mode.

## §KB upsert suggestions

Task 6 ships a new skill; Task 8 updates the protocol's tool-neutral contract. Both touch facts that downstream knowledge-graph consumers will want indexed.

Suggested `knowledge_graph_add` entries (canonical-form):

1. **Skill: `/cowork-area-sync`** — type: `lifecycle_skill`. Inputs: `~/cowork/<area>/CLAUDE.md`, `~/cowork/<area>/_area.md`, all active projects' `_charter.md`. Outputs: per-project `cowork-area-sync-<area>-<project>-<utc-iso>.yml` + parent journal `cowork-area-sync-<area>-<utc-iso>.journal.yml`. Cross-references: `/new-cowork` (sibling — initial scaffold), `docs/protocol/receipt-schema.md` (receipt shape).
2. **Lifecycle status parser** — type: `parsing_convention`. Spec: markdown bullet `- **status:** <value>` emitted by `skills/new-cowork/templates/_charter.md.tmpl:17`; portable awk one-liner at `skills/cowork-area-sync/lib/cowork-area-sync.sh`. Consumed by `/cowork-area-sync` for active/closed/archived classification. Future lifecycle skills (`/cowork-status`, `/cowork-close`) MUST use this same parser shape.
3. **Bundle file count delta** — type: `cross_surface_invariant`. Wave 13: 5 files in `.claude/desktop-knowledge/`. Wave 15: 7 files when `--area-context=create` runs (adds `area-CLAUDE.md` + `area-meta.md`). Wave 16.5: `.mcpb` extension generated alongside (orthogonal to the 5/7 axis). Downstream consumers (gobot `project-context.ts` extension, future Desktop Knowledge auto-loaders) MUST handle both 5- and 7-file shapes.
4. **Receipt schema delta — `/new-cowork`** — type: `receipt_schema_evolution`. Wave 13 fields: see SKILL.md NORMATIVE block. Wave 15 adds (audit-only): `area_context_present`, `area_context_decision`, `decided_via`, `area_context_skip_reason`, `area_claude_digest_at_scaffold`, `area_meta_digest_at_scaffold`. **None of these enter `idempotency_key`** — the Wave 13 input set is preserved exactly.
5. **Exit code conventions for `/cowork-area-sync`** — type: `error_taxonomy`. `0` success, `2` argument error, `6` ambiguous resume (≥2 in-progress journals), `7` source-digest drift on resume, `99` test hook. Consumed by: future `/cowork-status` cross-skill chaining, `/run-wave` exit-code interpretation.
6. **Parent-journal lifecycle** — type: `state_machine`. States: `in-progress` → `complete` | `failed`. Transitions: initial write on first invocation; rewrite to `in-progress` (with updated `projects_completed`) after each per-project terminal receipt; final rewrite to `complete` after all active projects done; rewrite to `failed` on operator-marked failure (currently only via hand-edit). Resume discovers via glob + `status: in-progress` filter.
7. **F6 source-drift contract** — type: `safety_invariant`. On any resume, source-file sha256s MUST match the journal's recorded sources. Mismatch → refuse (exit 7) with zero filesystem mutation. Rationale: mixing source states across a resume produces incoherent per-project receipts (some projects sync'd against version A, others against version B).
8. **AGENTS.md Cross-surface delta** — type: `protocol_documentation`. The cross-surface bundle is no longer described as "exactly 5 files" — it is "5 files by default; 7 when area context exists." Consumed by every future tool-neutral consumer of the bundle contract.

## §Deviations from spec

### Stale line numbers / minor scope adjustments

- **Spec line 195 references `new-cowork.sh:239`** as the line of the "scaffold path already exists" refuse check. After Wave 15 edits, the equivalent check is now at `new-cowork.sh:278` (line shifted by Task 2 + Task 5 inserts). The semantic guarantee — Stage 1 idempotency lookup runs BEFORE the folder-exists check — is preserved.
- **Spec line 178** describes the started receipt path as `.harness-state/new-cowork-<area>-<project>-<utc-iso>.started.yml`. The existing helper (`skills/_shared/lib/emit-receipt.sh`) names the started-state receipt `.harness-state/<command>-<slug>-<ts>.yml` (no `.started` suffix); the file's `status: started` field distinguishes it. The semantic guarantee (a started-state receipt exists before any disk mutation) is preserved — adopting the verbatim `.started.yml` filename convention would require widespread helper changes far outside Wave 15 scope. **Flagged for follow-up**: a separate spec can rename if desired.
- **Spec line 218 — `.started.yml` filename for `/cowork-area-sync` per-project receipts** is implemented verbatim (this is the NEW skill so no helper-rename pressure). The per-project receipt does use the `.started.yml` → terminal rename pattern.

### Cross-repo flags

- **No symlinks reaching outside this repo** were encountered during this wave's edit list. `skills/` is symlinked OUT to `~/.claude/skills/` per `CLAUDE.md` "Skills directory layout" — this is the expected outbound symlink, not a sibling-repo dependency.

### Optional Claude-adapter install

Per spec line 244, `~/.claude/skills/cowork-area-sync` → repo-path symlink is **OPTIONAL** and not part of the exit gate. This wave did NOT create the symlink (intentional). Operators on Claude Code who want `/cowork-area-sync` discoverability should run:

```bash
ln -s "$(pwd)/skills/cowork-area-sync" ~/.claude/skills/cowork-area-sync
```

## Baseline metric

No TypeScript in this repo, so no `tsc` baseline. Wave 15 baselines:

- `bash skills/new-cowork/lib/new-cowork.sh --help` → exit 0 ✓
- `bash skills/cowork-area-sync/lib/cowork-area-sync.sh --help` → exit 0 ✓
- Bundle file count before / after `--area-context=create` scaffold: **5 → 7** (verified by `ls | grep -v '\.mcpb$' | wc -l`)
- 5-file bundle preserved when `--area-context=skip` runs (no regression on the pre-Wave-15 shape).

## Reporting summary

- **Worktree path:** `/Users/klorian/workspace/claude-harness/.claude/worktrees/agent-a21dd1e300988e83e`
- **Branch:** `worktree-agent-a21dd1e300988e83e`
- **Commits per task:**
  - T1 — `83b3e4c` add AREA_CLAUDE.md.tmpl + _area.md.tmpl templates
  - T2 — `43bc45a` add --area-context flag + per-file area rollback
  - T3 — `a1cdeec` bundle copy for area files (5→7 file delta)
  - T4 — `9ac9e44` document area-CLAUDE.md + area-meta.md in bundle README
  - T5 — `f03b835` receipt schema — area-context decision fields + audit digests
  - T6 — `fc8a5e6` new /cowork-area-sync skill (SKILL.md + lib script)
  - T7 — `d1ad652` document --area-context flag + bundle delta in new-cowork SKILL.md
  - T8 — `95b8702` AGENTS.md + WORKFLOW.md updates for area-level context
- **Exit gate:** all checks PASS (10 plan.md inline + 17 spec §Exit gate).
- **Human-only TODOs:** (none).
- **Deviations:** stale line numbers in source spec corrected (line 195 ref to `:239` is now `:278`); `.started.yml` filename convention applied to new `/cowork-area-sync` per-project receipts but NOT retrofitted to existing `/new-cowork` started-state receipts (helper-rename out of Wave 15 scope).
- **Cross-repo flags:** none.
- **Summary file written:** `docs/waves/wave15-cowork-area-context.md` (this file) — confirmed.
