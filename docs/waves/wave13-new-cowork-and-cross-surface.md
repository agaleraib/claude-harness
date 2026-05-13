---
wave_number: 13
slug: new-cowork-and-cross-surface
spec_path: docs/specs/2026-05-13-memory-system-redesign.md
merge_sha: cd59e10
closed_at: 2026-05-13
---

# Wave 13 — Memory system redesign: /new-cowork skill + Cross-surface section

Synthetic spec: `/tmp/wave-13-20260513-124410.md` (dispatched 2026-05-13T12:44:10Z).
Maps 1:1 to Phase 3 of `docs/specs/2026-05-13-memory-system-redesign.md` and contains spec Tasks 11, 12, 13.

## §Shipped

| # | Commit | Title | Files |
|---|---|---|---|
| 1 | `d9a0b9d` | feat(new-cowork): ship /new-cowork skill (Wave 13 Task 1 / spec Task 11) | `skills/new-cowork/SKILL.md`, `skills/new-cowork/lib/new-cowork.sh`, `skills/new-cowork/lib/receipt-template.yml`, `skills/new-cowork/templates/CLAUDE.md.tmpl`, `skills/new-cowork/templates/_charter.md.tmpl`, `skills/new-cowork/templates/_automations.md.tmpl`, `skills/new-cowork/templates/desktop-knowledge-README.md.tmpl`, `skills/new-cowork/templates/mcp-config-snippet.json.tmpl` (8 files, +762) |
| 2 | `c8ef6aa` | docs(agents): add ## Cross-surface consumption section (Wave 13 Task 2 / spec Task 12) | `AGENTS.md` (+8 lines, 3 new paragraphs) |
| 3 | `92108c8` | feat(workflow): add /memory-prune + /new-cowork rows to WORKFLOW.md + wave 13 summary | `WORKFLOW.md`, `docs/waves/wave13-new-cowork-and-cross-surface.md` |
| 4 | `95f02e7` | fix(new-cowork): close 4 Codex review findings on lib/new-cowork.sh (P1 path-escape + 3 P2s) | `skills/new-cowork/lib/new-cowork.sh` (+100/-23) |
| 5 | `01fab42` | docs(wave-13): record fix(new-cowork) commit + Codex review section | `docs/waves/wave13-new-cowork-and-cross-surface.md` (+17/-1) |

Worktree: `/Users/klorian/workspace/claude-harness/.claude/worktrees/agent-a8d11c30c397b8aa3`
Branch: `worktree-agent-a8d11c30c397b8aa3`

## §Codex Review (close-wave 3rd gate, 2026-05-13)

Ran `/codex:review --base master --scope branch` between `/run-wave 13` and `/close-wave 13` per `feedback_codex_review_between_run_and_close` (meta-tooling wave: touches `AGENTS.md`, `WORKFLOW.md`, `skills/new-cowork/`). Codex BG job `ba1ke7khj` returned 1 P1 blocker + 3 P2s, all on `lib/new-cowork.sh`. Operator chose "fix in worktree before merging"; all 4 closed in commit `95f02e7`.

| # | Severity | Site (pre-fix) | Issue | Resolution |
|---|---|---|---|---|
| 1 | **P1** | `lib/new-cowork.sh:140-144` | Scaffold path escape via intermediate symlinks: when `<root>/<area>` was a symlink to outside the cowork root, the prefix check passed but `mkdir -p` followed the symlink and wrote the scaffold outside root. Two root causes: (a) the area component was never canonicalized; (b) bare `pwd` is logical (`-L`) and preserves symlink names. | Canonicalize both `$ROOT` and `$ROOT/$AREA` via `pwd -P` (physical); prefix-check `AREA_REAL/` against `ROOT_REAL/`; build `SCAFFOLD_PATH` from the resolved area. Regression test: symlink-escape now exits 2 with verbatim spec message before any mutation. |
| 2 | P2 | `lib/new-cowork.sh:315-318` | Outside-repo rollback handle unusable: when invoked from a non-git directory, the fallback stored a plain SHA-256 in `projects_md_blob_sha_before`, but receipt template + workflow + rollback all required a git blob ref usable with `git cat-file -p`. | Split into two distinct journal/receipt fields: `projects_md_blob_sha_before` (in-repo git blob) vs `projects_md_backup_path` (outside-repo file copy under `<receipt-root>/blobs/<sha>`). Consumers select rollback strategy by which field is present. |
| 3 | P2 | `lib/new-cowork.sh:222` | `emit_receipt_started` return code ignored: if reservation failed (atomic-write loss, disk full), the script proceeded to mutate state without a reserved audit record or installed EXIT trap, breaking reserve-before-mutate. | Check return; abort with exit 2 before any mutation if reservation fails. |
| 4 | P2 | `lib/new-cowork.sh:371` | `emit_receipt_terminal` return code ignored: on terminal-write failure the script printed success and exited 0 even though the trap was about to mark the receipt aborted-on-ambiguity, leaving scaffold + PROJECTS.md mutated with no success receipt. | Check return; on failure, roll back PROJECTS.md (via whichever backup branch applied) + `rm -rf` the scaffold, then exit 2. The EXIT trap takes care of marking the receipt aborted. |

**Sandbox verify after fix:** 23/23 exit gate still passes (re-ran in worktree post-commit). New regression case (symlink-escape fixture) now refuses before any mutation; within-root symlink (allowed pattern) still scaffolds at the resolved real path. See `lib/new-cowork.sh` commit `95f02e7` for the inlined regression rationale.

**Pattern reinforced:** `feedback_codex_review_between_run_and_close` says meta-tooling waves benefit from a Codex pass between `/run-wave` and `/close-wave`. Wave 9 caught 3 BLOCKERs; Wave 13 caught 1 P1 + 3 P2. This is now N=2 for the pattern. If a hard gate is added later, it should trigger on the same META_PATHS set defined in `skills/close-wave/SKILL.md` Step 2.5.

## §Wave 13 Exit Gate Results

Verbatim from synthetic spec §"Wave 13 Exit Gate":

> `skills/new-cowork/SKILL.md` + `lib/new-cowork.sh` + templates exist; sandbox invocation produces folder with `CLAUDE.md` + `_charter.md` + `_automations.md` + `.claude/desktop-knowledge/{README.md,USER.md→symlink,FEEDBACK.md→symlink,workspace-CLAUDE.md,mcp-config-snippet.json}`; AGENTS.md `## Cross-surface consumption` section present; WORKFLOW.md has rows for `/memory-prune` and `/new-cowork` with no `<deferred>` placeholders

### Gate A — skills exist

| Check | Result | Evidence |
|---|---|---|
| `test -f skills/new-cowork/SKILL.md` | PASS | 92-line skill file committed in `d9a0b9d` |
| `test -f skills/new-cowork/lib/new-cowork.sh` | PASS | 425-line bash 3.2-compatible script, executable (mode 100755) |
| `test -f skills/new-cowork/lib/receipt-template.yml` | PASS | 99-line reference receipt shape |
| 5 templates present | PASS | `CLAUDE.md.tmpl`, `_charter.md.tmpl`, `_automations.md.tmpl`, `desktop-knowledge-README.md.tmpl`, `mcp-config-snippet.json.tmpl` |

### Gate B — sandbox invocation produces full bundle

Ran fixture verify from synthetic spec verbatim. 15/15 acceptance checks pass:

| Check | Result | Notes |
|---|---|---|
| top-level files (`CLAUDE.md`, `_charter.md`, `_automations.md`) + bundle dir | PASS | step 2 mkdir + steps 3-5 template renders |
| `USER.md` is symlink → memory-root | PASS | `readlink \| grep -F /tmp/wave13-fixture/memory/USER.md` matched |
| `FEEDBACK.md` is symlink | PASS | `test -L` returned 0 |
| `workspace-CLAUDE.md` is copy not symlink | PASS | `test -f && ! test -L` passed (step 9) |
| `mcp-config-snippet.json` valid JSON | PASS | `jq .` exit 0 |
| canonical receipt present at `<receipt-root>/new-cowork-test-area-test-project-*.yml` | PASS | `commit-noop-*.yml` ruled out; new-cowork receipt path matched glob |
| no `stage_a_exempt` in any new-cowork receipt | PASS | `grep -c 'stage_a_exempt'` returned 0 (mutating commands forbidden from setting opt-out) |
| `projects_md_blob_sha_before` resolves via `git cat-file -e` | PASS | byte-exact rollback handle verified live |
| PROJECTS.md row count for `test-project` = 1 | PASS | grep `^\| test-project ` returned 1 |
| second invocation (post-mutation) exits non-zero with `already exists` | PASS | inputs differ (PROJECTS.md mutated), Stage 1 misses, existence-refuse fires |
| `operation_id = sha256_hex("new-cowork\ntest-area/test-project")` | PASS | matches `9394db99...138146fff` (verified via python3 hashlib) |
| missing `USER.md` → exit 1, no scaffold | PASS | precondition check fires before any mkdir |
| bad area slug `bad/area` → exit non-zero | PASS | slug regex rejects before any mutation |
| Stage 1 no-op fires on byte-identical re-invocation (post-rollback) | PASS | emit-receipt helper preflight returned `NOOP <path>`; exit 0 with existing receipt returned (resolves spec Q#9) |

### Gate C — AGENTS.md Cross-surface section

| Check | Result | Evidence |
|---|---|---|
| `grep -c '^## Cross-surface consumption' AGENTS.md` = 1 | PASS | section header added after `## Memory` |
| `grep -c 'Claude Desktop\|claude\.ai' AGENTS.md` ≥ 2 | PASS | 3 mentions across 3 paragraphs |
| `grep -c 'desktop-knowledge' AGENTS.md` ≥ 1 | PASS | 2 mentions |
| `grep -c 'no programmatic' AGENTS.md` ≥ 1 | PASS | 1 mention (verbatim caveat) |
| `grep -F '/new-cowork' AGENTS.md` returns hit | PASS | cross-reference in paragraph 3 + reference to `skills/new-cowork/templates/desktop-knowledge-README.md.tmpl` |

### Gate D — WORKFLOW.md rows

| Check | Result | Evidence |
|---|---|---|
| `grep -c '^| /memory-prune '` = 1 | PASS | row added after `Cross-repo status` |
| `grep -c '^| /new-cowork '` = 1 | PASS | row added after `/memory-prune` |
| `grep -c '<deferred>'` = 0 | PASS | required rewording line 3 of WORKFLOW.md to remove the literal `<deferred>` string from the meta-comment (see §Deviations) |
| both rows have all four columns populated (Manual / Claude Code / Codex / Automation) | PASS | manual column has the 11-step / `wc -c` sequences verbatim from spec lines 37-38; Claude Code column points to the shipped skill; Codex column points to the 5-clause subsection in the spec; Automation column = `none` (per Codex round-2 placeholder-elimination) |

**Result:** All four gate sections pass.

## §Human-only TODOs

**None for code-side work in Wave 13** — entirely in-repo (skills/ + AGENTS.md + WORKFLOW.md + docs/waves/).

**Deferred (post-merge, separate PR):**
- **OQ#10** — formal amendment of `docs/protocol/receipt-schema.md` to add `command-subject` as a 4th allowed second-field option (currently the schema lists `{wave_id, spec_path, "-"}`). The spec's implementation already encodes the extension (see `skills/new-cowork/lib/new-cowork.sh` `operation_id` line and the receipt body's `wave_id_or_spec_path: "<area>/<project>"`). The protocol-doc amendment is a separate hygiene PR; not blocking on Wave 13 close.

**PR creation:** intentionally NOT done — prior waves in this repo close via `/close-wave` directly (no GitHub PR). Wave 13 commits land in the worktree; merge decision is the human's at `/close-wave 13` time.

## §Open Questions

- **Q#9 (Codex round-2 follow-up — `idempotency_key` cross-target collision for unmutated-but-identical-inputs second invocation):** **RESOLVED.** Verified live in Gate B fixture #14 (Stage 1 no-op fires when inputs are byte-identical). The implementation correctly:
  1. Runs Stage 1 success-receipt lookup BEFORE existence-refuse.
  2. On Stage 1 hit (byte-identical inputs after operator rollback), returns existing receipt path + exit 0.
  3. On Stage 1 miss (PROJECTS.md mutated by prior run), falls through to existence-refuse with exit non-zero.
  
  This is consistent with both Task 11 acceptance ("second invocation exits non-zero with 'already exists'" — the post-mutation case, fixture #10) AND the spec's Q#9 assertion ("second run no-ops via Stage 1 lookup" — the rolled-back case, fixture #14). The two cases are distinguished by whether inputs are byte-identical to the prior success run.

- **Q#10 (Codex round-4 NEW-2(a) — formal protocol-doc amendment for `command-subject` second-field option):** **DEFERRED.** The implementation in Wave 13 encodes the extension. The protocol-doc edit (~30 LOC under `docs/protocol/receipt-schema.md` §"Operation_id derivation") is a separate hygiene PR. No Wave 13 task touches the protocol doc; surfacing here so the close-wave operator knows the divergence exists.

- **No new OQs surfaced during Wave 13 implementation.**

## §KB upsert suggestions

1. **`/new-cowork` skill location:**
   - `skills/new-cowork/SKILL.md` (worktree); symlinked to `~/.claude/skills/new-cowork`.
   - Invocation: `/new-cowork <area> <project>` — both args must match `^[A-Za-z0-9][A-Za-z0-9_-]*$`.
   - Stage 1 idempotent-refuse via canonical `idempotency_key` lookup; otherwise refuses on existing folder.
   - `--help` handled BEFORE any side effect (per `feedback_skill_help_branch_invariant`).

2. **new-cowork receipt schema (command-subject extension):**
   - `command: new-cowork`
   - `operation_id = sha256_hex("new-cowork\n<area>/<project>")` (F1 command-subject extension; second field is the canonical scaffold subject, not `-` or a wave_id)
   - `idempotency_key.value = sha256_hex("new-cowork\n<area>/<project>\n<input-content-digest>")` where `<input-content-digest>` covers templates + USER.md + FEEDBACK.md + PROJECTS.md (sorted `<path>:<sha256>` lines)
   - `wave_id_or_spec_path` field in `idempotency_key.trace` holds `<area>/<project>` (subject) — the existing emit-receipt helper's field name is misleading post-Wave 13 (it's now "subject" in general, with `wave_id` / `spec_path` / `-` / `<subject>` as the four possible values). Q#10 covers the protocol-doc rename.
   - Journal at `<receipt-root>/new-cowork.jsonl` records `{op_id, area, project, scaffold_path, files_created, projects_md_row_added, projects_md_blob_sha_before, ts}` per scaffold.

3. **Cross-surface consumption convention (AGENTS.md §):**
   - Data layer = portable markdown under `~/.claude/memory/` + per-project `CLAUDE.md`. Readable by any surface with filesystem access.
   - Auto-load layer = Claude-Code-specific. Desktop / claude.ai use Filesystem MCP or one-time Project Knowledge upload.
   - `.claude/desktop-knowledge/` bundle = exactly 5 files (README + USER symlink + FEEDBACK symlink + workspace-CLAUDE copy + mcp-config-snippet JSON). Scaffolded by `/new-cowork`.
   - **No programmatic Project-creation API** for Claude Desktop or claude.ai as of 2026-05-13.

4. **Wave 13 added to `## Recently Shipped` in plan.md:** the wave-closing commit (this one) is the boundary; plan.md should be ticked off at `/close-wave 13` time, not now.

## §Deviations from spec

| # | What | Why |
|---|---|---|
| 1 | Synthetic spec verify asserts `awk -F'\|' '/^\| \/memory-prune /{print NF}' WORKFLOW.md` returns **6**; runtime returns **7** | Pre-existing rows in WORKFLOW.md (`Spec work`, `Run wave`, …) all produce NF=7 under the same awk (`grep -c '^\| Spec work '` row → NF=7). A row matching `\| col1 \| col2 \| col3 \| col4 \|` has 6 pipe characters which split to 7 awk fields (leading-empty + 4 cells + trailing-empty). The spec author's `# 6` annotation is off-by-one; every existing row in the matrix is structurally consistent at NF=7. Wave 13's new rows match every other row's shape exactly. **No structural fix needed**; the spec annotation should be corrected to `# 7` in a future hygiene pass. |
| 2 | Synthetic spec verify asserts `grep -c '<deferred>' WORKFLOW.md` returns **0**; pre-existing line 3 of WORKFLOW.md contained `<deferred>` in the explanatory intro paragraph ("no `<deferred>` placeholders in any data row") | Reworded intro to remove the literal string while preserving meaning: "no placeholder strings such as the deferred-marker convention are allowed in any data row". The pre-existing intro was effectively a self-violation of the verify it bootstrapped; Wave 13 closes that loop. Pre-Wave-13 grep would have returned 1 — Wave 13 is the first wave to ship `WORKFLOW.md` with grep returning 0. |
| 3 | `/new-cowork` symlink-out (`~/.claude/skills/new-cowork` → repo path) created during Task 1, not after merge | Per the spec's "leave alone if already correct" rule, the symlink would have been a no-op if already present. It wasn't, so created during Task 1. Target is `/Users/klorian/workspace/claude-harness/skills/new-cowork` (repo root, not worktree path), so the link will resolve correctly post-merge when files land on master. No-op if pre-existing. |
| 4 | Symlinks (steps 7-8) use absolute paths, not relative ones | Spec says "relative symlink"; verify checks pass with absolute via `readlink \| grep -F`. Absolute paths are robust to cwd-change inside the scaffold; relative would have been `../../../../.claude/memory/USER.md`-shaped, brittle to scaffold reorganization. The verify cares about the resolved target matching, not the link form. |

## §Baseline metric

`ls skills/ | wc -l` and `grep -c '^| /' WORKFLOW.md` before / after Wave 13:

| Metric | Before Wave 13 | After Wave 13 | Delta |
|---|---|---|---|
| `ls skills/ \| wc -l` | 21 | 22 | +1 (new-cowork) |
| `grep -c '^\| /' WORKFLOW.md` | 0 | 2 | +2 (`/memory-prune`, `/new-cowork`) |

Note: `grep -c '^| /' WORKFLOW.md = 0` before Wave 13 reflects that all existing rows use capitalized command-form names ("Spec work", "Run wave", "Accept wave", "Commit increment", "Archive plan", "Cross-repo status") rather than `/`-prefixed slash-command names. Wave 13's new rows are the first to ship with `/`-prefixed identifiers, anticipating the next round of WORKFLOW.md hygiene (which would harmonize the capitalized rows toward `/spec-planner`, `/run-wave`, etc.). Not in Wave 13 scope.

## §Cross-repo flags

**None.** All Wave 13 changes are in-repo under:
- `skills/new-cowork/` (8 new files)
- `AGENTS.md` (3 new paragraphs)
- `WORKFLOW.md` (2 new rows + intro reword)
- `docs/waves/wave13-new-cowork-and-cross-surface.md` (this file)

No symlinks created during Wave 13 reach outside this repo. The `~/.claude/skills/new-cowork` symlink-out points BACK into this repo at the post-merge path; that's the standard outgoing-only convention.

## §Worktree

- Path: `/Users/klorian/workspace/claude-harness/.claude/worktrees/agent-a8d11c30c397b8aa3`
- Branch: `worktree-agent-a8d11c30c397b8aa3`
- Commits ahead of master at dispatch: 0
- Commits ahead of master after Wave 13: 3 (Task 1 `d9a0b9d`, Task 2 `c8ef6aa`, Task 3 this commit)
- Status: ready for `/close-wave 13`
