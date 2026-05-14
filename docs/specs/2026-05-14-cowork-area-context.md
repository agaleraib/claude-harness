# Cowork Area-Level Context — Sub-spec for Pivot Phase 3

## Overview

The gobot pivot spec (`gobot/docs/specs/2026-05-11-pivot-to-workspace-as-context.md` §6 Phase 3, line 393) names a Phase 3 deliverable in one line:

> *"Area-level shared `~/cowork/<area>/CLAUDE.md` for inherited tone."*

That stub is not a design. This sub-spec expands it into a shippable feature. The operator-driven motivation is concrete: when working on multiple projects under the same `<area>` (e.g. `tier1fx/accounting`, `tier1fx/audits-2026-q2`), the operator wants to declare **once per area** — not once per project — the people they collaborate with and their roles, the email/writing style for that organization, and canonical research sources, with the file picked up automatically by Claude Code parent-walk AND propagated into Desktop / claude.ai bundles.

Current `/new-cowork` (claude-harness Wave 13, shipped at `skills/new-cowork/SKILL.md`) scaffolds **project-only**: `~/cowork/<area>/<project>/CLAUDE.md` + `_charter.md` + `_automations.md` + `.claude/desktop-knowledge/` bundle. The `<area>/` parent directory is just a bare folder — no `CLAUDE.md`, no template, no propagation.

This spec is deliberately scoped to **claude-harness** (skill + template + bundle propagation). It does **NOT** touch:

- Per-project scope envelope (`project_scope:` in `_charter.md`) — owned by the pivot spec §4.5
- `cowork_projects` Supabase table — owned by the pivot spec §8 Item 9
- Lifecycle skills (`/cowork-status`, `/cowork-close`, etc.) — owned by the pivot spec §8 Items 6, 8, 11

Cross-references the pivot spec for ordering but ships independently behind it.

## Prior Work

Builds on:
- [Memory System Redesign](2026-05-13-memory-system-redesign.md) — shipped `/new-cowork` (Wave 13), shared user-global memory root, Desktop Knowledge bundle convention.
- [Pivot — Workspace-as-Context](../../../gobot/docs/specs/2026-05-11-pivot-to-workspace-as-context.md) §6 Phase 3 line 393 — names area-level CLAUDE.md as a Phase 3 deliverable.
- [Universal Harness Protocol v2](2026-04-30-universal-harness-protocol-v2.md) — receipt schema, plan.md shape.

Assumes:
- `~/.claude/memory/` shared root is initialized (Wave 11 shipped).
- `/new-cowork` skill exists and emits receipts per `docs/protocol/receipt-schema.md`.
- Claude Code walks parent directories for `CLAUDE.md` files automatically (verified behavior 2026-05-14).
- Claude Desktop / claude.ai do NOT walk parents — they only see files explicitly added to Project Knowledge.

Changes / extends prior:
- `/new-cowork` gains an area-detection branch with an explicit `--area-context=create|skip|require` flag (default behavior depends on TTY — see §Area-context flag semantics).
- `.claude/desktop-knowledge/` bundle grows from 5 files to 7 (adds `area-CLAUDE.md` + `area-meta.md` copies when area-level files exist).
- `/new-cowork` records area-CLAUDE.md AND `_area.md` content digests as audit-only **receipt metadata** at scaffold time. Area content does **NOT** participate in the project's `idempotency_key` — that would conflict with the existing refuse-on-existing-folder invariant once the operator edits area files. Propagating area edits is `/cowork-area-sync`'s job.
- New skill `/cowork-area-sync` keeps existing bundles in sync with both area files symmetrically (handles creates, updates, and deletions).

## Data Model

### Entity: area-level CLAUDE.md (`~/cowork/<area>/CLAUDE.md`)

| Path | Type | Cap / Constraint | Description |
|---|---|---|---|
| `~/cowork/<area>/CLAUDE.md` | markdown | ≤16KB (Claude Code parent-walk auto-load budget; soft) | Area-scoped persona + collaborators + writing style + research sources. Inherited by every project under `<area>/`. |
| `~/cowork/<area>/_area.md` | YAML+markdown | ≤4KB | Structured area metadata (collaborators table, identifiers). Operator-owned; parsed by future `/cowork-area-status`. |

**Why two files (not one):** `CLAUDE.md` is for prose / persona / style instructions that Claude Code auto-loads via parent-walk. `_area.md` is structured (frontmatter-table form) so future skills can grep `team.members[].email` without parsing prose. Same split as project level (`CLAUDE.md` + `_charter.md`).

**Why `CLAUDE.md` not `_area-context.md`:** the pivot spec already named the file `~/cowork/<area>/CLAUDE.md`. Renaming would diverge. Parent-walk auto-load is the free win — anything else loses it.

### `~/cowork/<area>/CLAUDE.md` — required sections

```markdown
# CLAUDE.md — <area>

> Area-level context for the `<area>` cowork area. Inherited by every project under `~/cowork/<area>/`.
> Project-level overrides live in `<project>/CLAUDE.md`.

## Persona

You are an operator working in the `<area>` area. <Area-specific role description.>

## Collaborators

| Name | Role | Email | Comm. preference |
|---|---|---|---|
| <name> | <role> | <email> | <slack \| email \| phone \| in-person> |

## Writing style

- **Greeting:** <"Hi <first-name>," \| "Dear <full-name>," \| ...>
- **Sign-off:** <"Best, <my-first-name>" \| "Regards, <my-full-name>" \| ...>
- **Formality:** <casual \| professional \| formal>
- **Language:** <en-US \| es-ES \| ...>
- **Voice:** <first-person plural "we" \| first-person singular "I">

## Research sources

- <URL> — <one-line description of why this is authoritative for the area>
- <URL> — ...

## Vocabulary

| Term | Means | Example |
|---|---|---|

## Cross-project conventions

- File naming: <pattern>
- Output format: <markdown \| docx \| ...>
```

### `~/cowork/<area>/_area.md` — frontmatter shape

```yaml
---
id: <area>                          # path-derived
opened_at: <YYYY-MM-DD>
team:
  members:
    - name: <name>
      role: <role>
      email: <email>
      preference: <slack|email|phone|in-person>
      alias: <optional @shorthand for parking lot ownership — feedback_parking_ownership_design>
sources:
  canonical:
    - url: <URL>
      kind: <regulator|standard|playbook|reference>
      summary: <one-line>
---

# Free-form area notes
```

`alias:` field bridges to `feedback_parking_ownership_design` (@alias from team.members memory).

## Area-context flag semantics

`/new-cowork` accepts a new optional flag `--area-context=<mode>` with three values:

| Mode | Meaning | TTY default | Non-TTY default |
|---|---|---|---|
| `create` | Scaffold `<area>/CLAUDE.md` + `<area>/_area.md` from templates if absent. No prompt. | If `--area-context` omitted and area files absent: **prompt** instead. | n/a — non-TTY callers must pass the flag explicitly. |
| `skip` | Do not scaffold area files. Project bundle is the 5-file shape (no `area-CLAUDE.md` / `area-meta.md`). Receipt records `area_context_decision: skip`. | Available via explicit flag. | n/a — must be explicit. |
| `require` | Refuse to scaffold the project if `<area>/CLAUDE.md` is absent. Exits non-zero with a message naming the missing files. Useful in CI / automation that wants area context to be a hard precondition. | Available via explicit flag. | Available via explicit flag. |

**Default behavior matrix:**

| Caller | Flag passed? | Area files present? | Behavior |
|---|---|---|---|
| TTY (interactive) | no | yes | Project scaffolds normally; bundle includes area copies. Receipt records `area_context_decision: present`. |
| TTY (interactive) | no | no | Prompt: *"Area `<area>` has no shared CLAUDE.md. Create one now? \[Y/n\]"*. `Y` → behaves as `create`. `n` → behaves as `skip`. Receipt records `area_context_decision: create` or `skip` plus `decided_via: prompt`. |
| TTY (interactive) | yes (any value) | any | Flag value wins; no prompt. Receipt records `area_context_decision: <mode>` plus `decided_via: flag`. |
| Non-TTY (script / Codex / cron) | no | any | **Refuse** — print error: *"Non-interactive shell requires explicit `--area-context=create\|skip\|require`. Aborting."*. Exit code 4. No filesystem mutation. |
| Non-TTY | yes | any | Flag value wins. Receipt records `area_context_decision: <mode>` plus `decided_via: flag`. |

**Receipt schema delta.** `/new-cowork` receipt YAML gains two fields (always present, never omitted):

```yaml
area_context_present: <bool>           # true iff area-CLAUDE.md exists at end of run
area_context_decision: create|skip|require|present
decided_via: prompt|flag|implicit      # implicit = files already present, no flag, no prompt needed
area_context_skip_reason: <string|null> # populated when decision=skip (e.g. "operator declined", "flag=skip")
```

Rationale: the previous silent non-TTY skip behavior was an attractive nuisance — automation could produce projects without area context without surfacing the decision, defeating the spec's purpose. Explicit-flag-or-fail in non-TTY mode mirrors the existing pattern in `/close-wave` (refuses ambiguous arguments rather than guessing) and makes the decision auditable from the receipt alone.

## Implementation

**Recommended flow:** Single plan.md wave (no inter-wave dependency). Sequential micro tasks fit a single wave's commit budget.
**Reason:** Three signals from `feedback_wave_vs_micro_shape_rule`: (a) partial completion breaks invariants — scaffold template + bundle propagation + receipt update must be atomic so existing bundles don't see inconsistent state; (b) touches ≥3 files (template + skill body + receipt schema); (c) operator-attestable in <30 min — small. No worktree isolation needed (skill code only, no migrations).
**Alternatives:** None — splitting wouldn't reduce risk and would leave a half-shipped propagation contract.
**Implementation block written:** 2026-05-14

### Tasks

Each task lists Files, Depends on, Verify, and **Manual fallback** (per repo portability rule — every implementation task must be completable with `git + editor + gh` alone, no LLM tooling required).

- [ ] **Task 1:** Add `templates/AREA_CLAUDE.md.tmpl` + `templates/_area.md.tmpl` matching the Data Model section shape. Use existing `{{AREA}}` / `{{TODAY}}` substitution vars.
  - **Files:** `skills/new-cowork/templates/AREA_CLAUDE.md.tmpl` (new), `skills/new-cowork/templates/_area.md.tmpl` (new)
  - **Depends on:** Nothing
  - **Verify:** `ls skills/new-cowork/templates/AREA_CLAUDE.md.tmpl skills/new-cowork/templates/_area.md.tmpl` exits 0; `grep -c '{{AREA}}' skills/new-cowork/templates/AREA_CLAUDE.md.tmpl` ≥1.
  - **Manual fallback:** Open an editor, paste the Data Model "required sections" markdown into `skills/new-cowork/templates/AREA_CLAUDE.md.tmpl` with `<area>` replaced by `{{AREA}}`. Paste the `_area.md` frontmatter block into `skills/new-cowork/templates/_area.md.tmpl` with `<area>` → `{{AREA}}` and `<YYYY-MM-DD>` → `{{TODAY}}`. Stage explicitly: `git add skills/new-cowork/templates/AREA_CLAUDE.md.tmpl skills/new-cowork/templates/_area.md.tmpl`.

- [ ] **Task 2:** Extend `skills/new-cowork/lib/new-cowork.sh`: parse a new `--area-context=<create|skip|require>` flag. Add helper `maybe_scaffold_area_context` that implements the Area-context flag semantics matrix verbatim (TTY prompt when flag omitted and files absent; non-TTY fails with exit 4 when flag omitted; `require` mode fails with exit 5 if area files absent). Invoke **after the started-receipt is reserved** but before the project scaffold step (so area mutations are journalled). Write area files via **temp+rename** (write to `<area>/.CLAUDE.md.tmp.$$` then `mv` to final path) and record `before_sha256` / `after_sha256` for both area files plus **per-file** `area_claude_created_this_run: <bool>` and `area_meta_created_this_run: <bool>` flags in the started-receipt. Per-file flags are required because mixed pre-existing state is common — e.g. operator created `<area>/CLAUDE.md` by hand but `_area.md` is absent; only the file this invocation actually wrote may be rolled back. On any later failure in the same invocation (project scaffold, PROJECTS.md append, etc.), the rollback handler MUST, **independently per file**, delete `<area>/CLAUDE.md` iff `area_claude_created_this_run == true` AND its on-disk sha256 still matches `area_claude_after_sha256` (no operator edits since); same independent check for `_area.md` using `area_meta_created_this_run` + `area_meta_after_sha256`. Files that fail either condition are left in place and the reason is recorded per file as `area_claude_rollback_skipped_reason` / `area_meta_rollback_skipped_reason` in the terminal receipt.
  - **Files:** `skills/new-cowork/lib/new-cowork.sh` (edit)
  - **Depends on:** Task 1
  - **Verify:**
    - `bash skills/new-cowork/lib/new-cowork.sh --area-context=create test-area-new test-project` in a clean `$HOME=$(mktemp -d)` sandbox → creates `<root>/test-area-new/CLAUDE.md` + `<root>/test-area-new/_area.md`. Started receipt at `.harness-state/new-cowork-<area>-<project>-<utc-iso>.started.yml` exists BEFORE area files appear on disk (verified by injecting `sleep 0.5` between started-write and area-write under `set -x` and observing log ordering); started receipt contains `area_claude_before_sha256: null`, `area_claude_after_sha256: <hex>`, `area_claude_created_this_run: true`, `area_meta_before_sha256: null`, `area_meta_after_sha256: <hex>`, `area_meta_created_this_run: true`.
    - **Mixed pre-existing state cases** (one file present, one absent):
      - Seed `<area>/CLAUDE.md` by hand (operator-authored); leave `_area.md` absent. Run with `--area-context=create` + `NEW_COWORK_FAIL_AFTER_AREA_SCAFFOLD=1` → started receipt records `area_claude_created_this_run: false`, `area_meta_created_this_run: true`. Rollback handler deletes only `_area.md`; pre-existing `<area>/CLAUDE.md` is preserved byte-identical. Terminal receipt: `area_claude_rollback_skipped_reason: "area_claude pre-existed"`, no `area_meta_rollback_skipped_reason` (it was rolled back).
      - Mirror case: seed `<area>/_area.md` by hand; leave `CLAUDE.md` absent. Same flow with roles reversed.
    - **Interrupted-run case:** export `NEW_COWORK_FAIL_AFTER_AREA_SCAFFOLD=1` (test hook) → script writes area files, started receipt, then `exit 99` before project scaffold → cleanup trap fires → area files are removed → terminal receipt records `rolled_back: true` and `rollback_targets: [<area>/CLAUDE.md, <area>/_area.md]`. Re-running the same command after rollback succeeds cleanly (no half-state).
    - **Interrupted-run with pre-existing area files case:** seed BOTH `<area>/CLAUDE.md` AND `<area>/_area.md` manually, then export `NEW_COWORK_FAIL_AFTER_AREA_SCAFFOLD=1` → started receipt records `area_claude_created_this_run: false` AND `area_meta_created_this_run: false` → trap does NOT delete pre-existing files → terminal receipt records `rolled_back: true, area_claude_rollback_skipped_reason: "area_claude pre-existed", area_meta_rollback_skipped_reason: "area_meta pre-existed"`.
    - `bash skills/new-cowork/lib/new-cowork.sh test-area-new test-project` (no flag) under `</dev/null` (non-TTY) → exits 4, prints non-interactive error, no filesystem mutation (no started-receipt either — exit gate is before any disk write).
    - `bash skills/new-cowork/lib/new-cowork.sh --area-context=require test-area-empty test-project` when `<root>/test-area-empty/CLAUDE.md` absent → exits 5, no project scaffold, no area-file scaffold.
    - Re-run with same args → existing refuse-if-exists path still fires (no overwrite).
  - **Manual fallback:** Open `skills/new-cowork/lib/new-cowork.sh` in an editor. Add argument parser entries for `--area-context=*`. Add a function `maybe_scaffold_area_context` that: (a) checks `[ -t 0 ]` for TTY; (b) implements the matrix table's behavior; (c) writes the started-receipt YAML first (via temp+rename to `.harness-state/new-cowork-<area>-<project>-<utc-iso>.started.yml`) capturing `area_claude_before_sha256` (from `sha256sum <area>/CLAUDE.md 2>/dev/null | cut -d' ' -f1` or `null`), `area_meta_before_sha256` (same shape for `_area.md`), and **per-file** `area_claude_created_this_run` + `area_meta_created_this_run` decisions (each independently true iff this invocation will write that specific file); (d) writes templates to `<area>/.CLAUDE.md.tmp.$$` and `<area>/._area.md.tmp.$$` then `mv` to final paths (skipping any file that already exists — operator state is authoritative); (e) captures per-file `after_sha256` values and appends to started-receipt; (f) registers a `trap` cleanup function that on non-zero exit independently checks each per-file `_created_this_run` flag and removes that file only if its on-disk sha256 still matches its `after_sha256`. Test by hand: `HOME=$(mktemp -d) bash -x ./new-cowork.sh --area-context=create test test-proj`, then again with one file pre-seeded + `NEW_COWORK_FAIL_AFTER_AREA_SCAFFOLD=1` to exercise mixed-state rollback. Stage with `git add skills/new-cowork/lib/new-cowork.sh`.

- [ ] **Task 3:** Extend bundle copy logic in `new-cowork.sh`: after project bundle creation, if `<root>/<area>/CLAUDE.md` exists, copy bytes-exactly to `<project>/.claude/desktop-knowledge/area-CLAUDE.md`. If `<root>/<area>/_area.md` exists, copy to `<project>/.claude/desktop-knowledge/area-meta.md`. Bytes-exact copies (not symlinks). Skip silently when files absent.
  - **Files:** `skills/new-cowork/lib/new-cowork.sh` (edit)
  - **Depends on:** Task 2
  - **Verify:** After running Task 2's first verify command, `ls <root>/test-area-new/test-project/.claude/desktop-knowledge/` lists `area-CLAUDE.md` AND `area-meta.md` alongside the existing 5 files (total 7). `diff <root>/test-area-new/CLAUDE.md <root>/test-area-new/test-project/.claude/desktop-knowledge/area-CLAUDE.md` is empty.
  - **Manual fallback:** In `new-cowork.sh`, after the existing 5-file bundle block, add: `[ -f "$AREA_ROOT/CLAUDE.md" ] && cp "$AREA_ROOT/CLAUDE.md" "$BUNDLE_DIR/area-CLAUDE.md"` and the equivalent for `_area.md` → `area-meta.md`. Verify by hand with the `diff` command above.

- [ ] **Task 4:** Update `skills/new-cowork/templates/desktop-knowledge-README.md.tmpl` to document `area-CLAUDE.md` + `area-meta.md` in drag-into-Project-Knowledge instructions. Add an explicit note: *"If `~/cowork/<area>/CLAUDE.md` or `_area.md` changes, re-export the bundle via `/cowork-area-sync <area>` (or manually re-copy both files) and re-drag both into Project Knowledge."*
  - **Files:** `skills/new-cowork/templates/desktop-knowledge-README.md.tmpl` (edit)
  - **Depends on:** Task 1
  - **Verify:** `grep -c 'area-CLAUDE.md' skills/new-cowork/templates/desktop-knowledge-README.md.tmpl` ≥1 AND `grep -c 'area-meta.md' skills/new-cowork/templates/desktop-knowledge-README.md.tmpl` ≥1 AND `grep -c 'cowork-area-sync' skills/new-cowork/templates/desktop-knowledge-README.md.tmpl` ≥1.
  - **Manual fallback:** Open the README template, add the two filenames to the bundle list, and append the re-export note. Save. `git add` the template file.

- [ ] **Task 5:** Keep `idempotency_key` tied to project-creation inputs only (no change to the digest set from Wave 13: `templates/* + USER.md + FEEDBACK.md + PROJECTS.md`). Area-file content does **NOT** enter the idempotency_key — propagating area edits is `/cowork-area-sync`'s job (Task 6), not `/new-cowork`'s. Including area content in the key would break the existing invariant that re-running the same successful `/new-cowork` is a Stage 1 no-op once the operator edits `<area>/CLAUDE.md`, because Stage-1-miss would fall through to the refuse-on-existing-folder path at `new-cowork.sh:239` and produce a spurious failure. Instead, record area-file digests as **receipt metadata**: the receipt YAML gains the four area-context decision fields from §Area-context flag semantics (`area_context_present`, `area_context_decision`, `decided_via`, `area_context_skip_reason`) PLUS audit-only digest fields `area_claude_digest_at_scaffold` and `area_meta_digest_at_scaffold` (hex sha256 of source files at scaffold time, or `null`). These metadata fields do NOT participate in the idempotency_key.
  - **Files:** `skills/new-cowork/lib/new-cowork.sh` (edit)
  - **Depends on:** Task 3
  - **Verify:**
    - Repeat invocation against unchanged state — Stage 1 no-op fires (receipt path printed, exit 0, no new receipt file).
    - Edit `<area>/CLAUDE.md` content, then re-run the same `/new-cowork <area> <project>` command — Stage 1 no-op STILL fires (the area edit must not invalidate the project's idempotency_key, since project creation inputs are unchanged). Receipt path printed, exit 0.
    - Receipt file contains `area_context_present:`, `area_context_decision:`, `decided_via:`, `area_context_skip_reason:`, `area_claude_digest_at_scaffold:`, `area_meta_digest_at_scaffold:` keys (use `grep -c` per key, each ≥1).
  - **Manual fallback:** In the receipt-emit YAML heredoc, add the four `area_context_*` decision keys plus the two `area_*_digest_at_scaffold` metadata keys (computed via `sha256sum <area>/CLAUDE.md 2>/dev/null | cut -d' ' -f1` or `null`). Do **NOT** touch the digest helper input list. Test by hand: run, edit `<area>/CLAUDE.md`, re-run — second run is a Stage 1 no-op.

- [ ] **Task 6:** Add a new skill `skills/cowork-area-sync/SKILL.md` (+ `lib/cowork-area-sync.sh`). Invocation: `/cowork-area-sync <area> [--dry-run]`. The portable deliverable is the **repo-local script** plus the WORKFLOW row; the `~/.claude/skills/cowork-area-sync` symlink is a Claude-adapter convenience (created opportunistically — see "Adapter install notes" below) and is NOT a required exit-gate artifact.

  **Active-project selection (portable status parser).** Walks every directory at `<root>/<area>/<*>/` containing `_charter.md`. For each candidate, parses the first occurrence of the lifecycle `status` field as emitted by the Wave 13 `_charter.md.tmpl` — a markdown bullet of the shape `- **status:** <value>` (see `skills/new-cowork/templates/_charter.md.tmpl:17`). The status parser is portable awk that matches that exact shape:
  ```
  status=$(awk '/^- \*\*status:\*\*/{ for(i=1;i<=NF;i++) if($i=="**status:**"){print $(i+1); exit} }' "$CHARTER")
  ```
  A project is processed iff `status == "active"`. Projects with `status: closed`, `status: archived`, missing `status:` field, or no `_charter.md` are **skipped** and recorded in the parent journal as `skipped: { path: <p>, reason: <inactive|missing-status|missing-charter> }`. **Verification fixture must come from the real template:** the Task 6 Verify block's closed-project fixture is built by scaffolding via `bash skills/new-cowork/lib/new-cowork.sh ...` and then editing the resulting `_charter.md` to flip `- **status:** active` → `- **status:** closed` — NOT by hand-writing synthetic YAML frontmatter.

  **Per-project sync logic.** For each active project, handle both files symmetrically:
  - If `<root>/<area>/CLAUDE.md` exists → copy to `<project>/.claude/desktop-knowledge/area-CLAUDE.md` (overwrite).
  - If `<root>/<area>/_area.md` exists → copy to `<project>/.claude/desktop-knowledge/area-meta.md` (overwrite).
  - If `<root>/<area>/CLAUDE.md` was **deleted** but `<project>/.claude/desktop-knowledge/area-CLAUDE.md` exists → remove the stale bundle copy.
  - Same deletion behavior for `_area.md` → `area-meta.md`.

  **Per-project atomicity + resume.** Before any copy/delete on a project, write a **per-project started receipt** at `.harness-state/cowork-area-sync-<area>-<project>-<utc-iso>.started.yml` capturing `area_claude_before_sha256`, `area_meta_before_sha256`, planned `action`. Copies use temp+rename: write to `<project>/.claude/desktop-knowledge/.area-CLAUDE.md.tmp.$$` then `mv` to final path. Deletes use `rm -f` (already idempotent). After both file operations complete for the project, append `after_sha256` digests and `action: copy|delete|noop` per file, then rename the started receipt to `.harness-state/cowork-area-sync-<area>-<project>-<utc-iso>.yml` (terminal name — drops `.started`).

  **Resume behavior.**
  - **Discovery.** Each invocation first globs `.harness-state/cowork-area-sync-<area>-*.journal.yml` (note: the pattern matches the parent-journal name shape, not the per-project receipt shape — per-project receipts contain `<project>` between `<area>` and `<utc-iso>`, parent journals do not). For each match, parse `status:`. Three outcomes:
    - **0 matches with `status: in-progress`** → fresh run. Mint a new `<utc-iso>` and write a new parent journal with `status: in-progress`.
    - **Exactly 1 match with `status: in-progress`** → resume that session. Adopt its `<utc-iso>` as the session id for all per-project receipts written in this invocation.
    - **≥2 matches with `status: in-progress`** → **refuse** with exit code 6 and an error message listing every conflicting journal path. The operator must inspect and either finalize one (edit `status:` to `complete` or `failed`) or remove a stale journal before re-running. No filesystem mutation.
  - **Per-session resume logic.** Once the in-progress journal is adopted, skip projects whose terminal receipt `cowork-area-sync-<area>-<project>-<adopted-utc-iso>.yml` already exists, and only process the remaining projects. The parent journal is finalized to `status: complete` only after all active projects have terminal receipts. A `.started.yml` receipt without a matching terminal receipt is treated as the resume boundary: re-process that project (idempotent — same source state produces same digests).
  - **Failed-journal handling.** Journals with `status: failed` are ignored by discovery — they are terminal records, not resumable. Only `status: in-progress` triggers resume.

  **Parent journal.** Path: `.harness-state/cowork-area-sync-<area>-<utc-iso>.journal.yml`. Contains `started_at`, `area`, `area_claude_source_sha256`, `area_meta_source_sha256`, `projects_planned: [...]`, `projects_completed: [...]`, `projects_skipped: [...]`, `status: in-progress|complete|failed`.

  **Per-project receipt schema.** Terminal receipt YAML keys: `command: cowork-area-sync`, `area: <area>`, `project: <project>`, `area_claude_before_sha256`, `area_claude_after_sha256`, `area_claude_action: copy|delete|noop`, `area_meta_before_sha256`, `area_meta_after_sha256`, `area_meta_action: copy|delete|noop` (each digest is hex sha256 or `null`).

  - **Files:** `skills/cowork-area-sync/SKILL.md` (new), `skills/cowork-area-sync/lib/cowork-area-sync.sh` (new). *Optional Claude-adapter install:* `~/.claude/skills/cowork-area-sync` symlink (Claude Code only; not required for portability — see Adapter install notes).
  - **Depends on:** Task 3
  - **Verify (all must pass):**
    - Fresh sandbox with `<area>/CLAUDE.md` + `<area>/_area.md` + **two active projects + one closed project** (`status: closed` in its `_charter.md`) + one project with missing `status:` field. Edit `<area>/CLAUDE.md`. Run `bash skills/cowork-area-sync/lib/cowork-area-sync.sh <area>`. The **two active projects** have `area-CLAUDE.md` matching new content (`diff` empty); the **closed project's bundle is untouched** (`sha256sum` before/after the run is identical for `<closed-project>/.claude/desktop-knowledge/`); the **missing-status project** is also untouched. Parent journal lists the closed + missing-status projects under `projects_skipped` with correct `reason`.
    - Each active project's terminal receipt has `area_claude_before_sha256 != area_claude_after_sha256` and `area_claude_action: copy`. Started receipt was written **before** the temp file appeared (verified under `set -x` + `sleep 0.2` injected between started-write and copy).
    - Delete `<area>/_area.md`. Re-run. Active projects' `area-meta.md` is removed. Receipts show `area_meta_action: delete` and `area_meta_after_sha256: null`. Closed project untouched.
    - `--dry-run` mode prints planned actions per active project AND skip reasons per inactive project, exits 0 without mutating (verified by `sha256sum -c` on a manifest taken before the dry-run).
    - **Resume case:** inject `COWORK_AREA_SYNC_FAIL_AFTER_PROJECT=1` (test hook — fail after first project's terminal receipt is written) → run leaves parent journal `status: in-progress` with one project completed and one started-but-not-terminal. Re-running without the env var **discovers the in-progress journal via the glob `.harness-state/cowork-area-sync-<area>-*.journal.yml` + `status: in-progress` filter**, adopts its `<utc-iso>` as the session id, finishes the remaining project, and finalizes the journal to `status: complete`. Final state is identical to a clean single-pass run (verified by `sha256sum` comparison of all bundle files).
    - **Ambiguous-resume case:** seed two `.harness-state/cowork-area-sync-<area>-*.journal.yml` files both with `status: in-progress` (different `<utc-iso>` values). Re-invocation exits 6, prints both conflicting paths, and performs zero filesystem mutation (verified by `sha256sum -c` on a pre-run manifest).
    - Exit gate check: `grep -c 'area_meta_before_sha256\|area_meta_after_sha256\|area_claude_before_sha256\|area_claude_after_sha256' <receipt>` ≥4 per active-project receipt.
  - **Manual fallback:** Create `skills/cowork-area-sync/SKILL.md` with skill metadata (name, description, allowed-tools — see existing `skills/new-cowork/SKILL.md` as template). Create `lib/cowork-area-sync.sh`: a bash script that (a) takes `<area>` as `$1`, optional `--dry-run`; (b) writes the parent journal `.harness-state/cowork-area-sync-<area>-<utc-iso>.journal.yml` with `status: in-progress` first; (c) iterates `"$AREA_ROOT"/*/` looking for `_charter.md`; for each, parses status with the awk one-liner above and skips non-active (appending to `projects_skipped`); (d) for each active project: write started-receipt YAML via `cat <<EOF > <path>.started.yml`, then `cp -f` source to `<temp>.tmp.$$` and `mv` to final, or `rm -f` for deletions, then capture `after_sha256` and `mv` started receipt to terminal name; (e) finalize parent journal to `status: complete`. Re-runnable: if parent journal exists with `status: in-progress`, list its `projects_completed`, skip those. Test by hand against a sandbox `HOME=$(mktemp -d)` with a closed-project fixture **built from the real Wave 13 scaffolder**: run `bash skills/new-cowork/lib/new-cowork.sh --area-context=skip <area> closed-proj` to scaffold the project, then edit the resulting `<area>/closed-proj/_charter.md` line `- **status:** active` to read `- **status:** closed`. Verify the closed project stays untouched. Stage `skills/cowork-area-sync/SKILL.md` and `skills/cowork-area-sync/lib/cowork-area-sync.sh` explicitly.

  **Adapter install notes (Claude-specific, optional).** For Claude Code users, an opportunistic symlink at `~/.claude/skills/cowork-area-sync` → repo path makes the skill discoverable via `/cowork-area-sync`. Create with: `ln -s "$(pwd)/skills/cowork-area-sync" ~/.claude/skills/cowork-area-sync`. **This is not a required file** and absence does not block the exit gate — the repo-local script is the portable deliverable. Other surfaces (Codex, manual, generic shell) invoke `bash skills/cowork-area-sync/lib/cowork-area-sync.sh <area>` directly.

- [ ] **Task 7:** Update `skills/new-cowork/SKILL.md` body — document `--area-context` flag, bundle delta (5→7 files), idempotency change, cross-link this spec. Add a "## Area-level context" subsection.
  - **Files:** `skills/new-cowork/SKILL.md` (edit)
  - **Depends on:** Task 5
  - **Verify:** `grep -c 'area-level\|AREA_CLAUDE\|--area-context' skills/new-cowork/SKILL.md` ≥3 AND a link to `docs/specs/2026-05-14-cowork-area-context.md` is present.
  - **Manual fallback:** Open the SKILL.md, add the `## Area-level context` heading near the bottom (before any trailing "Notes" section), describe the flag + bundle delta in 3-5 sentences, cross-link the spec. Save and stage.

- [ ] **Task 8:** Update root `AGENTS.md` § Cross-surface (Wave 13 added this section) — note that bundles may now contain area-level files. Update `WORKFLOW.md` to add a row for `/cowork-area-sync` matching the existing matrix shape (see §WORKFLOW.md row delta below for the verbatim row).
  - **Files:** `AGENTS.md` (edit), `WORKFLOW.md` (edit)
  - **Depends on:** Task 6
  - **Verify:** `grep -c 'cowork-area-sync' WORKFLOW.md` ≥1 AND `grep -c 'area-CLAUDE\.md\|area-meta\.md' AGENTS.md` ≥1 AND the new WORKFLOW.md row matches the 4-column shape (count of `|` characters in the row equals existing rows' count).
  - **Manual fallback:** Open `WORKFLOW.md`, append the row from §WORKFLOW.md row delta verbatim. Open `AGENTS.md`, in the Cross-surface section add one sentence: *"`/new-cowork` bundles now optionally include `area-CLAUDE.md` and `area-meta.md` (from `~/cowork/<area>/CLAUDE.md` and `_area.md`). Use `/cowork-area-sync <area>` to refresh existing bundles after area-level edits."*. Save both files, stage explicitly.

### WORKFLOW.md row delta

The spec adds one new user-facing command `/cowork-area-sync`. The row below is appended to `WORKFLOW.md` in Task 8 verbatim — placed alongside the existing `/new-cowork` row from Wave 13.

| Protocol command | Manual | Claude Code | Codex prompt contract | Automation |
|---|---|---|---|---|
| `/cowork-area-sync <area>` | For each `~/cowork/<area>/<*>/` containing `_charter.md` with `status: active` (skip closed/archived/missing-status): write `.harness-state/cowork-area-sync-<area>-<project>-<utc-iso>.started.yml` first; then `cp -f ~/cowork/<area>/CLAUDE.md` → temp+rename `<project>/.claude/desktop-knowledge/area-CLAUDE.md` (or `rm -f` if source absent); same for `_area.md` → `area-meta.md`; rename started receipt to terminal. Write parent journal `.harness-state/cowork-area-sync-<area>-<utc-iso>.journal.yml`. | `/cowork-area-sync <area>` skill invocation | See expanded Codex prompt contract below this table. | none (manual trigger after operator edits area files) |

**Codex prompt contract for `/cowork-area-sync <area>` (verbatim, copy into a Codex prompt):**

```
Goal: refresh Desktop Knowledge bundles for every active project under
  ~/cowork/<area>/ so they mirror current <area>/CLAUDE.md and <area>/_area.md.

Inputs:
  - Required arg: <area> (path segment under ~/cowork/, e.g. "tier1fx")
  - Optional flag: --dry-run (print plan, exit 0, no mutation)
  - Source files: ~/cowork/<area>/CLAUDE.md (may be absent), ~/cowork/<area>/_area.md (may be absent)
  - Target projects: each directory at ~/cowork/<area>/*/ containing _charter.md
    whose lifecycle bullet reads `- **status:** active` (markdown bullet shape
    emitted by Wave 13's `skills/new-cowork/templates/_charter.md.tmpl:17`).
    Skip closed/archived/missing-status.

Outputs (deterministic paths — must all be written for a successful run):
  - Parent journal: .harness-state/cowork-area-sync-<area>-<utc-iso>.journal.yml
    Keys: started_at, area, area_claude_source_sha256, area_meta_source_sha256,
          projects_planned, projects_completed, projects_skipped, status
  - Per-active-project started receipt (transient):
      .harness-state/cowork-area-sync-<area>-<project>-<utc-iso>.started.yml
    Renamed to terminal name (drops `.started`) after both files processed.
  - Per-active-project terminal receipt YAML keys:
      command: cowork-area-sync
      area: <area>
      project: <project>
      area_claude_before_sha256: <hex|null>
      area_claude_after_sha256: <hex|null>
      area_claude_action: copy|delete|noop
      area_meta_before_sha256: <hex|null>
      area_meta_after_sha256: <hex|null>
      area_meta_action: copy|delete|noop

Procedure (follow §Task 6 manual fallback verbatim):
  1. Write parent journal with status: in-progress.
  2. For each ~/cowork/<area>/*/ with _charter.md:
       parse status (matches the markdown bullet `- **status:** <value>`):
         awk '/^- \*\*status:\*\*/{ for(i=1;i<=NF;i++) if($i=="**status:**"){print $(i+1); exit} }' "$CHARTER"
       if != "active" → append to projects_skipped, continue.
  3. For each active project:
       a. Compute area_claude_before_sha256, area_meta_before_sha256 from
          existing bundle copies (null if absent).
       b. Write started receipt YAML to .started.yml path.
       c. For CLAUDE.md: if source exists, cp to temp+rename
          (<bundle>/.area-CLAUDE.md.tmp.$$ then mv); else rm -f.
       d. Same for _area.md → area-meta.md.
       e. Compute after_sha256 digests.
       f. Append after_sha256 + action keys; mv .started.yml → terminal name.
  4. Finalize parent journal to status: complete.

Stop conditions:
  - Success: every active project has a terminal receipt; parent journal
    status: complete; exit 0.
  - Failure: any cp/rm error → leave parent journal status: in-progress,
    started receipt for the failing project in place, exit non-zero.
    The next invocation MUST detect the in-progress journal and resume
    (skip projects with terminal receipts, re-process those with only
    started receipts).

Verification commands (run after each invocation):
  - sha256sum ~/cowork/<area>/CLAUDE.md \
    ~/cowork/<area>/<active-project>/.claude/desktop-knowledge/area-CLAUDE.md
    (digests must match if both present).
  - ls .harness-state/cowork-area-sync-<area>-*-<utc-iso>.yml
    (count must equal number of active projects).
  - grep '^status: complete$' .harness-state/cowork-area-sync-<area>-<utc-iso>.journal.yml
  - For closed/archived projects: their bundle files must be byte-identical
    before/after the run. Verify with sha256sum.

Do NOT touch:
  - Projects with status != active (closed, archived, missing-status).
  - Files outside ~/cowork/<area>/ and .harness-state/.
  - The source files ~/cowork/<area>/CLAUDE.md and _area.md themselves —
    this command is a one-way push from source to bundles.
```

### Exit gate

- `templates/AREA_CLAUDE.md.tmpl` + `templates/_area.md.tmpl` exist in `skills/new-cowork/templates/`.
- `bash skills/new-cowork/lib/new-cowork.sh --area-context=create <new-area> <new-project>` in a fresh `HOME=$(mktemp -d)` sandbox produces `<new-area>/CLAUDE.md` + `<new-area>/_area.md` AND project bundle contains both `area-CLAUDE.md` AND `area-meta.md` (7-file bundle).
- **Interrupted-run rollback (area scaffold case).** Running `/new-cowork --area-context=create` with `NEW_COWORK_FAIL_AFTER_AREA_SCAFFOLD=1` deletes only the area files this invocation actually created (verified independently per file via `area_claude_created_this_run` and `area_meta_created_this_run` in the started receipt) and leaves pre-existing area files byte-identical. Terminal receipt records `rolled_back: true` plus per-file `area_claude_rollback_skipped_reason` / `area_meta_rollback_skipped_reason` for files left in place (e.g. `"area_claude pre-existed"`), or omits those keys for files actually rolled back. Mixed pre-existing state (one file present, one absent) MUST be exercised by the verify fixtures.
- `bash skills/new-cowork/lib/new-cowork.sh <new-area> <new-project>` under `</dev/null` (non-TTY, no flag) exits 4 with the non-interactive error message and **zero filesystem mutation** (no started receipt, no area files, no project files).
- `--area-context=require` mode exits 5 when `<area>/CLAUDE.md` absent, with no project scaffold and no area scaffold.
- Re-running the same successful command refuses to overwrite (Stage 1 idempotency no-op — receipt path printed, exit 0).
- `skills/cowork-area-sync/SKILL.md` + `skills/cowork-area-sync/lib/cowork-area-sync.sh` exist in the repo. **The `~/.claude/skills/cowork-area-sync` symlink is NOT a required artifact** — it is an optional Claude-adapter convenience (see §Task 6 Adapter install notes). The portable exit-gate check is `ls skills/cowork-area-sync/SKILL.md skills/cowork-area-sync/lib/cowork-area-sync.sh` exits 0.
- `bash skills/cowork-area-sync/lib/cowork-area-sync.sh <area>` handles BOTH files symmetrically: copies on create/update, removes stale bundle copies on canonical-file delete. Per-active-project terminal receipt YAML contains `area_claude_before_sha256`, `area_claude_after_sha256`, `area_meta_before_sha256`, `area_meta_after_sha256` (each `null` when absent) and `area_claude_action` / `area_meta_action` (`copy|delete|noop`).
- **Closed-project isolation.** When the area contains a mix of active and closed projects (verified by a fixture: one project with `status: closed` in its `_charter.md`), running `/cowork-area-sync <area>` leaves the closed project's bundle byte-identical (`sha256sum` before == after) and records it under `projects_skipped` in the parent journal with `reason: inactive`. Same isolation for `status: archived` and missing-status projects.
- **Charter-shape parity.** The closed-project fixture used in the Exit-gate verification MUST be produced by scaffolding a project via `bash skills/new-cowork/lib/new-cowork.sh --area-context=skip <area> <closed-proj>` and then editing the `- **status:** active` line in the resulting `_charter.md` to `- **status:** closed`. The status parser used by `/cowork-area-sync` is asserted to match the markdown bullet shape that `skills/new-cowork/templates/_charter.md.tmpl` emits at line 17 — not a synthetic YAML frontmatter fixture.
- **Resume.** When `COWORK_AREA_SYNC_FAIL_AFTER_PROJECT=1` is injected mid-run, the parent journal remains `status: in-progress`, the failing project has a `.started.yml` receipt with no matching terminal receipt, and re-invocation discovers the in-progress journal via glob, adopts its `<utc-iso>` as the session id, and completes the remaining work to reach `status: complete` with final state byte-identical to a clean single-pass run.
- **Ambiguous-resume refusal.** When two `.harness-state/cowork-area-sync-<area>-*.journal.yml` files both have `status: in-progress`, `/cowork-area-sync <area>` exits 6 with a message naming both conflicting paths and performs zero filesystem mutation.
- `--dry-run` mode of `/cowork-area-sync` exits 0 without mutating (verified by `sha256sum -c` against a pre-run manifest).
- WORKFLOW.md has a `/cowork-area-sync` row matching the §WORKFLOW.md row delta shape AND the verbatim Codex prompt contract appears immediately below the matrix row.
- AGENTS.md Cross-surface section mentions `area-CLAUDE.md` + `area-meta.md`.
- Receipt YAML on every `/new-cowork` invocation includes `area_context_present`, `area_context_decision`, `decided_via`, `area_context_skip_reason` keys (any value, including `null` for the last). When `--area-context=create` runs and creates area files, the started receipt additionally includes `area_claude_before_sha256`, `area_claude_after_sha256`, `area_claude_created_this_run`, `area_meta_before_sha256`, `area_meta_after_sha256`, `area_meta_created_this_run` (per-file flags used by rollback).
- No regressions in existing 5-file bundle shape when area context absent (operator passes `--area-context=skip` or area files not present and TTY operator answers `n` to prompt).

## Cross-surface behavior

The two area files (`<area>/CLAUDE.md` + `<area>/_area.md`) are plain markdown on disk. Every surface — including a manual `git + editor` operator with no LLM at all — can find, read, and edit them by path. The table below names the *automatic* loading mechanism per surface; absence of automation never blocks manual use.

| Surface | Automatic loading mechanism | Operator action needed? |
|---|---|---|
| Manual operator (editor + shell, no LLM) | None — operator opens `~/cowork/<area>/CLAUDE.md` directly when context is needed (e.g. drafting an email, referencing collaborator list) | Read/edit by path. `/cowork-area-sync` has a fully manual fallback (per Task 6) using `cp -f` / `rm -f` + `sha256sum` — no LLM required. |
| Claude Code CLI (from inside `<area>/<project>/`) | Parent-walk auto-loads `<area>/CLAUDE.md` | None — automatic |
| Claude Code CLI (from outside `<area>/`) | Not loaded | Operator `cd`s into the project, OR explicitly `@`-references the file |
| Claude Desktop Project | `area-CLAUDE.md` + `area-meta.md` in `.claude/desktop-knowledge/` | One-time drag into Project Knowledge per project; re-drag both files if either area-level file edited (or run `/cowork-area-sync <area>` first to refresh the bundle, then re-drag) |
| claude.ai Project | Same as Desktop | Same as Desktop |
| Codex CLI | Reads `<area>/CLAUDE.md` if the operator explicitly includes it in the prompt context (no auto-walk). The Codex prompt contract in §WORKFLOW.md row delta names this loading path. | Operator pastes the file path or content into the Codex prompt. |
| Gobot autonomous handlers (cron / workflow) | Read `<area>/CLAUDE.md` via `resolveAreaFromCwd()` (gobot Phase 2A's `project-context.ts` extended to walk one more level) | None once gobot Phase 2A extension lands — out of scope for this sub-spec, noted in `## Open questions` |
| Generic shell automation (CI, scripts) | None — same as manual operator. `/cowork-area-sync` manual fallback is the portable adapter. | Script `cat`s or `cp`s the file by path. |

**Portability invariant.** No row in this table requires a Claude-specific or LLM-specific tool to *complete* the work — every loading-path is either (a) automatic on that surface, or (b) reducible to file-path access. The skill commands `/new-cowork` and `/cowork-area-sync` are accelerators over the manual `cp -f` / `rm -f` / `sha256sum` / editor flow; they are not the only execution path.

## Open questions

- **OQ-A1.** *Resolved in revision 2 (round 2 Codex feedback).* Earlier draft recommended a silent non-interactive skip. That's now replaced by `--area-context=create|skip|require` with non-TTY fail-without-flag semantics — see §Area-context flag semantics. Kept here as a paper trail.
- **OQ-A6.** *Resolved in revision 3 + post-cap fix (round 4 Codex feedback).* Earlier draft of Task 2 scaffolded `<area>/CLAUDE.md` + `_area.md` without a started-receipt or rollback path; a killed/failed run could leave a template area context that future projects treat as authoritative. Revision 3 adds: (a) started-receipt reserved BEFORE area writes, (b) temp+rename writes, (c) **per-file** `area_claude_created_this_run` and `area_meta_created_this_run` flags (post-cap fix: split from single boolean to safely handle mixed pre-existing state — operator-created CLAUDE.md with missing _area.md, or vice versa), (d) trap-based rollback that independently per file deletes only this-run-created files whose sha256 still matches, (e) interrupted-run verification case PLUS mixed-pre-existing-state cases in Task 2 Verify and Exit gate. Paper trail.
- **OQ-A7.** *Resolved in revision 3 (round 3 Codex feedback).* Earlier draft made `~/.claude/skills/cowork-area-sync` a required file and the exit gate. Revision 3 demotes it to an optional Claude-adapter install note; the portable deliverable is the repo-local `skills/cowork-area-sync/lib/cowork-area-sync.sh` plus the WORKFLOW row. Codex column expanded into a verbatim prompt contract (Goal / Inputs / Outputs / Procedure / Stop conditions / Verification). Paper trail.
- **OQ-A8.** *Resolved in revision 3 (round 3 Codex feedback).* Earlier `/cowork-area-sync` walked all `_charter.md` directories without checking `status:`, risking mutation of closed/archived projects, and had no per-project started-receipt or resume boundary. Revision 3 adds: (a) portable awk status parser, (b) skip-and-record for non-active projects, (c) closed-project fixture in Verify, (d) per-project started-receipt + temp+rename + terminal-rename pattern, (e) parent journal with `status: in-progress|complete|failed`, (f) explicit resume rules. Paper trail.
- **OQ-A2.** Should `<area>/CLAUDE.md` / `_area.md` edits propagate to existing project bundles **automatically** (e.g. file-watch trigger) or **manually via `/cowork-area-sync`**? **Recommendation:** manual. File-watch is fragile across surfaces and the operator already accepts that Desktop bundles require re-drag on USER.md / FEEDBACK.md edits; one more file fits the existing mental model. Auto-sync is parking-lot fodder for after the manual flow proves stable.
- **OQ-A3.** Should `gobot/src/lib/project-context.ts` (pivot Phase 2A) be extended to also load `<area>/CLAUDE.md` + `<area>/_area.md` for cron / workflow context? **Recommendation:** yes, but as a follow-up in gobot's pivot spec — not this sub-spec. Flagged so the gobot work knows to extend `resolveProjectFromCwd()` to a `resolveProjectAndAreaFromCwd()` shape.
- **OQ-A4.** Does `_area.md` need a Supabase mirror table (`cowork_areas`) parallel to `cowork_projects` (pivot §8 Item 9)? **Recommendation:** no — areas are just a path segment, not an addressable entity. PROJECTS.md already carries `area` per row. Promoting to a table is premature.
- **OQ-A5.** Should `/cowork-area-sync` also validate `_area.md` frontmatter (e.g. YAML parse + required keys) before propagating? **Recommendation:** no — propagate as-is, document in receipt. Schema validation is a separate parking-lot item (`feedback_validation_belongs_in_dedicated_skill`). Operator can read the file directly to spot syntax errors; the sync skill is a transport, not a validator.

## Tradeoffs

- **Loses:** simplicity of "one file per project, nothing else." Adds a second optional level of context.
- **Wins:** removes per-project duplication of collaborators / style / sources, which currently doesn't even fit in `_charter.md` (no schema for it).
- **Operator-attestability:** `cd ~/cowork/tier1fx/audits-2026-q2 && claude` and ask "who do I email about this audit?" — answer should come from `tier1fx/CLAUDE.md` parent-walk without ever opening the file. Single attestable check.

## What's intentionally NOT in scope

- **Editing skills.** No `/cowork-area-edit`. Operator edits with their normal editor. The skill catalog already has too many lifecycle commands per `feedback_lean_rituals_over_automation`.
- **Multiple inheritance** (an area inheriting from a parent meta-area). YAGNI — the user has not asked for `~/cowork/CLAUDE.md` to exist above `<area>/`.
- **Cross-area collaborators.** If a person works across `tier1fx/` and `global/`, they appear in both areas' `_area.md`. No dedup. The cost (one duplicate row per cross-area collaborator) is far smaller than the cost of a central people registry plus references.
- **Validation of `_area.md` frontmatter** beyond YAML parse. Schema validation is parking-lot.
- **`/cowork-area-status`** (joining `_area.md` + active projects). Phase 3.5+ if the operator ever wants it.

## Plan.md row draft

```
## Wave <N> — Cowork area-level context
- spec: docs/specs/2026-05-14-cowork-area-context.md
- depends-on: Wave 13 merged (`/new-cowork` shipped)
- exit-gate: (see spec §Exit gate verbatim)
- status: pending
```

Wave number assigned at `/commit` time per `feedback_run_wave_commit_plan_entry`.
