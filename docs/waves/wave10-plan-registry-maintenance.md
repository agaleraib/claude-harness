---
wave_number: 10
slug: plan-registry-maintenance
spec_path: docs/specs/2026-05-02-plan-registry-maintenance.md
merge_sha: a113829
closed_at: 2026-05-03
---

# Wave 10 — Plan maintenance, docs/waves/ archive, registry, /harness-status — orchestrator summary

**Wave:** 10 (claude-harness — v2 protocol Wave 2)
**Spec:** docs/specs/2026-05-02-plan-registry-maintenance.md
**Worktree:** `.claude/worktrees/agent-a996ce3d506ed00d5/`
**Branch:** `worktree-agent-a996ce3d506ed00d5`
**Mode:** dry-run (`.harness-profile` has no `model_routing` key — orchestrator executed all tasks itself; would-be routing logged in `.harness-state/orchestrator.log`)
**Generated:** 2026-05-03

## §Shipped

| # | Commit | Task | Vertical | Description |
|---|--------|------|----------|-------------|
| 1 | `ddb0630` | Task 1 | plan.md | Convert docs/plan.md to four-section active-board format (`## Now` / `## Next` / `## Blocked` / `## Recently Shipped`); migrate Wave 10 to `## Now`; collapse Waves 1-9 to one-line `[x]` rows in `## Recently Shipped` |
| 2 | `af43f73` | Task 2 | docs/waves/ | git mv eight summaries into docs/waves/wave<N>-<slug>.md with YAML frontmatter prepended; retarget skills/close-wave/SKILL.md and skills/run-wave/SKILL.md Step 8 (and adjacent paths) to docs/waves/; legacy path retired in same commit |
| 3 | `6bda5c6` | Task 4 | harness-status | skills/harness-status/SKILL.md `## Bootstrapping the registry` subsection (allowed fields, v2 §5 disallow list, default location, `HARNESS_REGISTRY_PATH` env-var, manual bootstrap command) + skills/harness-status/lib/test-fixtures/example-projects.yml (3 illustrative entries under /tmp/example/) |
| 4 | `ea09dcf` | Task 3 | archive-plan | New skill at skills/archive-plan/{SKILL.md, lib/archive.sh}. §3.0a reserve-then-mutate via skills/_shared/lib/emit-receipt.sh. Atomic temp+rename. Idempotent (Stage A no-op). Pre-mutation verifies all linked docs/waves/wave<N>-<slug>.md files exist; aborts on missing wave file. --dry-run / ARCHIVE_PLAN_DRY_RUN=1 leaves plan.md byte-identical |
| 5 | `a97d416` | Task 5 | harness-status | Full skills/harness-status/SKILL.md body + skills/harness-status/lib/scan.sh. Read-only across registered repos via `--no-optional-locks`. Stage A no-op exemption (timestamp-salted idempotency_key.value + stage_a_exempt:true in trace). Pre-conversion repo handling. Updates docs/protocol/receipt-schema.md with the §"Stage A no-op exemption" appendix |
| 6 | `dad1c84` | Task 6 | WORKFLOW.md | Flesh out /archive-plan + /harness-status placeholder rows with concrete receipt-path conventions and full manual-fallback runbooks per spec line 638-641 |
| 7 | `1728026` | Task 7 | fixtures | 12 fixture .md contracts (5 archive-plan + 7 harness-status) + driver wave2-fixtures.sh + 9 receipt YAML examples (4 archive-plan + 4 harness-status, including manual+claude-code pair) + recompute-wave2-keys.sh (handles stage_a_exempt:true special case) + run-fixtures.sh extension. Combined fixture suite total 56/56 PASS (was 44 pre-Wave-10) |

## §Wave 10 Exit Gate Results

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| 1 | docs/plan.md has exactly 4 sections | **PASS** | `grep -c '^## (Now\|Next\|Blocked\|Recently Shipped)$' docs/plan.md` = 4 |
| 2 | `ls docs/waves/wave*.md \| wc -l` returns 8 (or 9 with this summary) | **PASS** | 8 returned (wave10 summary lands at /close-wave time → will become 9) |
| 3 | /archive-plan idempotent + §4.2-valid receipt | **PASS** | `archive-plan-success.yml` has canonical `idempotency_key.value=47ec3f42…dd91` recomputed by recompute-wave2-keys.sh; `archive-plan-idempotency.md` fixture proves second invocation no-ops |
| 4 | Registry schema documented; example fixture only allows id/path/group | **PASS** | `grep -F 'Bootstrapping the registry' skills/harness-status/SKILL.md` matches; `manual count: 3` projects in fixture; only allowed fields (id/path/group) present |
| 5 | /harness-status never writes outside `.harness-state/` in scanned repos | **PASS** | `harness-status-readonly-invariant.md` fixture: HEAD/`.git/index`/`.git/HEAD`/`status --porcelain` all byte-identical pre/post |
| 6 | /harness-status emits §4.2-conforming receipt | **PASS** | `harness-status-success.yml` has `command: harness-status`, `status: success`, `outputs: [.md, .json]`, `verification.commands: [git --no-optional-locks status --porcelain, git --no-optional-locks worktree list --porcelain]` |
| 7 | Stage A no-op exemption wired correctly: stage_a_exempt:true; two consecutive runs differ; git-state-only change reflected | **PASS** | All 4 harness-status receipts carry `stage_a_exempt: true`; `harness-status-stage-a-exempt.md` fixture: keys differ (`5623760e…` vs `fb513a39…`) and run 3 reflects `dirty (1 files)` after `touch new-file.txt`; `docs/protocol/receipt-schema.md` documents `stage_a_exempt` in `## Stage A no-op exemption` appendix |
| 8 | /harness-status reports pre-conversion repos without failing scan | **PASS** | `harness-status-pre-conversion-repo.md` fixture: `(pre-v2 plan format; skipped)` annotation present; rc=0 |
| 9 | /harness-status matches manual git status ground truth | **PASS** | `harness-status-readonly-invariant.md` captures `STATUS=<sha>` for `--no-optional-locks status --porcelain` pre/post and asserts byte-equality |
| 10 | WORKFLOW.md has rows for /archive-plan and /harness-status; row count ≥ 9 | **PASS** | both `grep -F` exits 0; rowcount=9 (1 header + 1 separator + 7 command rows; `≥ 9` gate met) |
| 11 | `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` exits 0 with all Wave 2 fixtures passing alongside existing 44+ | **PASS** | `Combined total: 56   Pass: 56   Fail: 0` (44 pre-Wave-10 + 12 Wave-10 = 56) |
| 12 | Cross-adapter idempotency_key equality: manual-archive-plan-success.yml byte-equals archive-plan-success.yml; recompute-wave2-keys.sh exits 0 | **PASS** | both keys = `47ec3f42bf21d03606d84bc1f6de5bbdb432a50a173efdfcc6831ba62699dd91`; recompute-wave2-keys.sh: PASS (also validates each /harness-status receipt's timestamp-salted formula via the stage_a_exempt special case) |
| 13 | Closure-asymmetry resolution (orchestrator side): summary at NEW path with YAML frontmatter | **PASS** | this file lives at `docs/waves/wave10-plan-registry-maintenance.md` with frontmatter `wave_number: 10`, `slug: plan-registry-maintenance`, `spec_path: docs/specs/2026-05-02-plan-registry-maintenance.md`, `merge_sha: <pending>`, `closed_at: <pending>` (filled in at /close-wave time) |
| 14 | Manual-fallback completeness gate (every Task's Manual fallback cites git, editor, gh) | **PASS** | per-task grep loop walked Tasks 1, 2, 4, 3, 5, 6, 7 in document order; each line reports `git≥4, editor≥2, gh≥2`. All 7 tasks meet the git≥1 / editor≥1 / gh≥1 floor |

## §Human-only TODOs

Both items below MUST be performed by a human after this wave merges. Neither was attempted by the orchestrator; they are not wave gates.

1. **Per-user registry bootstrap (one-time per machine, post-merge):** `mkdir -p ~/.config/harness && $EDITOR ~/.config/harness/projects.yml`. Copy the example shape from `skills/harness-status/lib/test-fixtures/example-projects.yml` and edit `path` entries to match local checkouts. The wave's exit gate does NOT check `~/.config/harness/projects.yml` — repo-artifact reproducibility on every machine is preserved by the example fixture under the test tree. (Per spec §4.2 acceptance: "missing-registry behavior is friendly: stderr message + 'no projects registered' summary + exit 0 — not a failure.")

2. **Closure-asymmetry verification at `/close-wave 10` time (orchestrator side complete; close-wave side pending):** the orchestrator wrote this summary at the NEW path (`docs/waves/wave10-plan-registry-maintenance.md`) per the Wave 10 archive convention. Downstream `/close-wave 10` MUST fill in `merge_sha` (from `git log -1 --format=%H` post-merge) and `closed_at` (ISO date) in the YAML frontmatter, AND emit its own §4.2-conforming `close-wave-10-<ts>.yml` receipt via the now-on-master `skills/_shared/lib/emit-receipt.sh` end-to-end (NOT hand-written like Wave 9's was, per OQ #6 resolution). Surface this in the Wave 10 close-wave receipt's `notes` field.

## §Open Questions — answered, deferred, or unchanged

Spec OQs (1-7 from `docs/specs/2026-05-02-plan-registry-maintenance.md`):

| # | Question | Status | Resolution / Note |
|---|----------|--------|-------------------|
| 1 | Should `/archive-plan` `keep_last` be configurable via `.harness-profile.archive_plan.keep_last`? | **Deferred** | Default 3 ships in this wave; configurability is non-blocking and revisited on first user complaint. `--keep-last <N>` flag exists for ad-hoc override (commit `ea09dcf`). |
| 2 | Auto-register repos in `setup-harness` / `/project-init`? | **Deferred** | Manual bootstrap stays the path until a second repo onboards under v2. Documented as "parked" in skills/harness-status/SKILL.md §"Bootstrapping the registry". |
| 3 | `--json` / `--md` flags on `/harness-status` to emit one not the other? | **Deferred** | Both files are tiny; default ships both. Revisit if a downstream tool consumes one. Not implemented (commit `a97d416`). |
| 4 | ISO-8601 timestamps in `closed_at` (hour-granularity)? | **Deferred** | Wave 1-9 frontmatter uses `YYYY-MM-DD` per Task 2 (commit `af43f73`); same shape for Wave 10. Defer until two waves close on the same day. |
| 5 | `/archive-plan` ALSO compacting `## Blocked` rows? | **Deferred** | Out of scope this wave. Future spec, after observing real-world growth. |
| 6 | Closure asymmetry — Wave 10 first wave to use new docs/waves/ path AND mechanized emit-receipt.sh end-to-end on master | **Resolved (orchestrator side)** | This summary file at `docs/waves/wave10-plan-registry-maintenance.md` with frontmatter is the orchestrator-side deliverable. The close-wave side completes when /close-wave 10 fills in `merge_sha` + `closed_at` and emits a §4.2 receipt via emit-receipt.sh. |
| 7 | Codex round 1 F3 (registry-as-machine-state) wrong-premise re-scoping | **Resolved** | Task 4 ships repo artifacts only (schema doc + example fixture); per-user `~/.config/harness/projects.yml` is a manual bootstrap (Human-only TODO #1), NOT a wave gate. Recorded as decision-stands per spec OQ #7. |

## §KB upsert suggestions

For downstream `/close-wave 10` to surface to the project-tracker / mempalace:

- **`project_archive_plan_skill` (new):** /archive-plan ships at master ~`ea09dcf` (orchestrator) → merge SHA at /close-wave time. §3.0a reserve-then-mutate, atomic temp+rename, idempotent via Stage A. Default `keep_last=3`. Mutates docs/plan.md only. Pre-mutation safety: aborts on missing wave file. Dry-run via `--dry-run` / `ARCHIVE_PLAN_DRY_RUN=1`. Receipt at `.harness-state/archive-plan-<ts>.yml`. Cross-adapter `idempotency_key.value=47ec3f42…dd91` byte-stable (manual + claude-code pair).
- **`project_harness_status_skill` (new):** /harness-status ships at master ~`a97d416` → merge SHA at /close-wave time. Read-only across registered repos via `--no-optional-locks`. Writes only to invoking repo's `.harness-state/harness-status-<ts>.{md,json,yml}`. Stage A no-op exemption (timestamp-salted idempotency_key.value; `stage_a_exempt: true` in trace) — every invocation produces a fresh key per receipt-schema.md §"Stage A no-op exemption". Two consecutive runs with frozen state produce DIFFERENT keys.
- **`project_docs_waves_archive` (new):** docs/waves/wave<N>-<slug>.md is the canonical post-merge wave archive. Eight pre-existing summaries migrated 2026-05-03 in commit `af43f73` via `git mv` (history follows). YAML frontmatter (`wave_number`, `slug`, `spec_path`, `merge_sha`, `closed_at`) is the lifted-metadata convention. close-wave Step 8 retargeted (legacy `docs/<date>-<project>-wave<N>-summary.md` retired — no dual-write, no symlink).
- **`project_path_only_registry` (new):** `~/.config/harness/projects.yml` is per-user, per-machine, NOT in any repo. Path-only schema: `id` (kebab-case, unique) / `path` (absolute) / `group` (optional). v2 §5 disallow list (`main_branch`, `plan_path`, `quality_gate`, `protected_paths`, etc.) enforced by parser. `HARNESS_REGISTRY_PATH` env var override for fixtures and CI. Missing registry is a friendly no-op.
- **`project_plan_md_active_board` (update):** docs/plan.md is now a four-section active board (`## Now` / `## Next` / `## Blocked` / `## Recently Shipped`). Wave entries in `## Now`/`## Next` use H3-block form; `## Recently Shipped` uses one-line `[x]` rows pointing at docs/waves/. `/archive-plan` compacts older rows (default keep_last=3); the docs/waves/ archive is canonical for any wave whose row has been removed. Replaces the prior accreting-log layout from commit `ddb0630`.
- **`project_stage_a_exempt_pattern` (new):** `idempotency_key.trace.stage_a_exempt: true` is the canonical opt-out for read-only freshness-probe commands. /harness-status is the sole consumer this wave. Mutating commands (/archive-plan, /run-wave, /close-wave, /commit) MUST NOT set it. Schema documented in `docs/protocol/receipt-schema.md` §"Stage A no-op exemption" (commit `a97d416`).

## §Deviations from spec

1. **WORKFLOW.md row count semantics — header+separator+7 = 9 (gate `≥ 9`).** Spec line 582 says "row count delta is exactly +2" assuming the `Archive plan` and `Cross-repo status` rows did NOT exist before Wave 10. They actually existed as placeholders since Wave 8 Task 2 (commit `4f84dcb`); spec line 636 correctly notes this. Wave 10 fleshed out the placeholders rather than adding new rows; row count went from 9 → 9 (no delta). The `≥ 9` gate (spec line 695) is met. Resolution: existing rows updated; new content (concrete receipt paths, manual fallback runbooks); no row renamed or removed.

2. **Run-wave SKILL.md updated alongside close-wave SKILL.md (Task 2 scope creep).** Spec Task 2 names `skills/close-wave/SKILL.md` Step 8 explicitly. Per spec §"Changes / overrides" line 50, "Read-paths in close-wave/run-wave that consume summary files must accept the new path" — `skills/run-wave/SKILL.md` references the legacy `docs/<YYYY-MM-DD>-<project>-wave<N>-summary.md` path 4 times (Step 8 mandate, Final Summary Requirements, post-dispatch report frame, Rule 9). Updated all 4 in commit `af43f73` to `docs/waves/wave<N>-<slug>.md`. This kept the migration "one-shot, not dual-supported" per spec §Constraints. Surfaced here for transparency.

3. **archive.sh emits its own `archive-plan-noop-<ts>.yml` filename via emit-receipt's slug helper.** Spec §3.2 says the receipt path is `.harness-state/archive-plan-<ts>.yml`. Actual filename includes the slug derived from `wave_or_spec` (which is `-` for /archive-plan, slugged to `noop`). So the path is `.harness-state/archive-plan-noop-<ts>.yml`. This matches the existing helper convention (e.g., `.harness-state/wave1/run-wave-claude-adapter-alignment-<ts>.yml` slugs the spec_path); /archive-plan's `-` slugs to `noop`. Functionally equivalent; the `<command>-<slug>-<ts>.yml` shape is the canonical form. Documented in receipt-schema.md "Receipt path" section.

4. **archive-plan.sh helper YAML omits `wave_id: null` and `spec_path: null` lines.** Per receipt-schema.md "Field table", `wave_id` is "Required for run-wave / close-wave / archive-plan; null for spec-only commands." But the helper's `emit_receipt__write_atomic` only emits `wave_id` for run-wave/close-wave/commit (not archive-plan). For YAML semantics, omitted == null, so this is schema-compliant; the wave1 example receipts use the same convention (omit fields that are null). Could be tightened in a follow-up by extending the helper's case statement to emit `wave_id: null` for archive-plan.

5. **Routing: dry-run mode.** `.harness-profile` does not contain a `model_routing` key, so the orchestrator executed all 7 tasks itself on the live Opus 4.7 (1M context) session rather than spawning subagents. Routing decisions logged with `[dry-run]` prefix in `.harness-state/orchestrator.log` per the orchestrator §Step 1 contract. Same as Wave 9's session shape.

## §Cross-repo flags

**none.** This is meta-tooling on claude-harness only — no symlinks-to-sibling-repos pattern observed. The `/archive-plan` and `/harness-status` skills only touch files under this repo's `skills/` and `.harness-state/`. Spec Task 5's `cd $path` per registered repo executes read-only `git --no-optional-locks` commands and never modifies any cross-repo state.

## §Fixture count baseline

- **Before Wave 10:** 44 fixtures (15 auto-apply A-O + 5 Wave-5 P-T + 1 Wave-5 U + 9 V1-V7+W1-W2 + 14 emit-receipt mechanical). `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` exits 0 with `Combined total: 44 Pass: 44 Fail: 0`.
- **After Wave 10:** 56 fixtures (44 prior + 12 Wave-10 fixtures: 5 archive-plan + 7 harness-status). `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` exits 0 with `Combined total: 56 Pass: 56 Fail: 0`.
- **Delta: +12 fixtures**, all driving real `archive.sh` / `scan.sh` helpers via `wave2-fixtures.sh` (no fixture-bypass anti-pattern; fixtures invoke production scripts in isolated mktemp environments).
