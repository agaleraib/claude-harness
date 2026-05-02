# Plan maintenance, `docs/waves/` archive, registry, and `/harness-status` — v2 Wave 2

## Overview

This spec drives Wave 2 of `docs/specs/2026-04-30-universal-harness-protocol-v2.md`: convert `docs/plan.md` from an accreting log into an active board, formalize `docs/waves/` as the shipped-wave archive, ship the path-only central registry that lets cross-repo tools find harness-managed projects, and add the read-only `/harness-status` skill that surfaces multi-repo state without coupling to any tracker.

Audience is the solo developer of `claude-harness` (the meta-tooling repo) and downstream consumer repos that adopt these conventions when they next sync. Wave 1 (`/spec-planner` plan.md auto-append, `/run-wave`/`/close-wave`/`/commit` receipts) already lays the foundation — Wave 2 is the matching maintenance and visibility layer.

Six things change behaviorally:

1. **`docs/plan.md` becomes a four-section active board** — `## Now` / `## Next` / `## Blocked` / `## Recently Shipped` per v2 §6. Per-wave rows match the format `/spec-planner` already auto-appends. Closed-wave detail moves out to `docs/waves/`.
2. **`docs/waves/` is the canonical shipped-wave archive** — one file per closed wave at `docs/waves/wave<N>-<slug>.md`. `/close-wave` writes there going forward; the eight pre-existing `docs/<date>-claude-harness-wave<N>-summary.md` files are migrated into the new directory in a single commit so historical specs and AGENTS.md no longer have to dual-source.
3. **`/archive-plan` is the manual-triggered, idempotent skill that compacts `docs/plan.md` by removing older `## Recently Shipped` rows.** It verifies each linked `docs/waves/wave<N>-<slug>.md` file exists, then removes older `## Recently Shipped` rows entirely from `docs/plan.md`, leaving only the last N rows (default `keep_last=3`; configurability tracked as Open Question #1). The `docs/waves/` file is canonical — once a row leaves `## Recently Shipped`, the wave archive file (not a cross-reference stub in plan.md) is the durable record. `/archive-plan` does not author wave summaries; those land at close-wave time.
4. **The path-only central registry lives at `~/.config/harness/projects.yml`** (resolves v2 Open Q #3 by picking option B — XDG-style per-user config, NOT a checked-in repo file). Allowed fields: `id`, `path`, optional `group`. Nothing else. Repos register/unregister via manual `yq` or editor edits in this wave; auto-register/auto-unregister is parked.
5. **`/harness-status` is a read-only, registry-driven cross-repo scanner.** It reads the registry, runs `git status --porcelain` and `git worktree list --porcelain` per repo, parses each repo's `docs/plan.md` `## Now` / `## Blocked` sections, and writes a single Markdown summary plus a sibling JSON snapshot under the **invoking** repo's `.harness-state/`. It writes nothing in any other repo it scans. It tolerates pre-conversion repos (no v2 plan.md format) without failing the whole scan.
6. **Both new skills emit §4.2-conforming receipts** via the existing `skills/_shared/lib/emit-receipt.sh` helper shipped in Wave 9 / v2 Wave 1. `/archive-plan` is a mutating command and follows the §3.0a reserve-then-mutate lifecycle. `/harness-status` is read-only — it still emits a receipt under `.harness-state/`, with `outputs` pointing at the summary + JSON files (read-only means "writes nothing outside `.harness-state/` in any registered repo," not "writes nothing at all" — per v2 §4.2 verbatim).

Existing skill names and core semantics are stable. All edits are in-place additions or new files.

## Implementation

**Recommended flow:** `/run-wave 10 → /close-wave 10` (single wave; ALL-or-NOTHING merge semantics — partial completion would leave `/archive-plan` referencing a `docs/waves/` directory that doesn't yet exist, or `/harness-status` reading a registry that no skill author has seen before). Dependency layers within the wave:

- Layer 0 (parallel): Tasks 1, 2, 4 (plan.md format spec text + `docs/waves/` convention spec text + registry schema spec text + concrete file moves). These are documentation/migration deliverables and don't depend on each other.
- Layer 1 (depends on Layer 0): Tasks 3, 5 (`/archive-plan` skill — needs Tasks 1+2 to define the source/destination shapes; `/harness-status` skill — needs Task 4's registry).
- Layer 2 (depends on Layer 1): Task 6 (WORKFLOW.md row updates — needs the two new commands' actual receipt-path conventions).
- Layer 3 (depends on Layer 2): Task 7 (fixtures — depend on all behaviors and the WORKFLOW.md rows landing).

**Reason:** 7 tasks, 3-way parallelism in Layer 0 and 2-way in Layer 1, stakes:medium per `.harness-profile` (meta-tooling but not on the hot path of every consumer repo). 5-signal checklist hits 3 of 5 (parallelism rank ≥2, partial completion breaks invariants, ≥3 files touched). Wave-shaped is the right call.

**Alternatives:** Two waves (Wave 10 = plan format + archive-plan; Wave 11 = registry + harness-status) would work if the team felt the scope was too broad, but the dependency between `/archive-plan` referencing `docs/waves/` and `/close-wave` writing to `docs/waves/` means both archive paths need to land together anyway. Splitting saves no review effort and adds a synchronization cost.

**Implementation block written:** 2026-05-02

## Prior Work

Builds on:
- [Universal Harness Protocol v2](2026-04-30-universal-harness-protocol-v2.md) — §8 Wave 2 is this spec's bounded scope; §4.2 receipt schema is the contract for both new skills' receipts; §6 plan.md maintenance policy defines the active-board format; §5 source-of-truth rules and §7.4 "registry is path-only" pin the registry shape.
- [Claude Adapter Alignment (v2 Wave 1)](2026-05-01-claude-adapter-alignment.md) — `skills/_shared/lib/emit-receipt.sh` and the §3.0a reserve-then-mutate lifecycle are inherited directly. Both new skills source the same helper using identical preflight / started / terminal call patterns.

Assumes (inherits from prior specs, not redefined here):
- §4.2 receipt schema and canonical `idempotency_key` algorithm at `docs/protocol/receipt-schema.md`.
- `skills/_shared/lib/emit-receipt.sh` is the canonical receipt-emission helper. New skills MUST source it; do not duplicate the lifecycle inline.
- `docs/plan.md` already has `### Wave N - <title>` rows in the format `/spec-planner` auto-appends (the Wave-1-shipped format).
- `.harness-profile` exists with `protocol_baseline: true`.

Changes / overrides:
- Resolves v2 Open Q #3 — registry location is `~/.config/harness/projects.yml` (option B). Documented in the registry deliverable below.
- Migrates the eight existing `docs/2026-*-claude-harness-wave<N>-summary.md` files into `docs/waves/wave<N>-<slug>.md` as part of this wave. AGENTS.md already points at `docs/waves/` for "what was shipped" — that pointer was forward-looking; this wave makes it accurate.
- Updates `skills/close-wave/SKILL.md` Step 8 to write summaries at `docs/waves/wave<N>-<slug>.md` going forward (the existing `docs/<date>-<project>-wave<N>-summary.md` convention is retired). Read-paths in close-wave/run-wave that consume summary files must accept the new path; old paths are migrated, not dual-supported, so there is no transitional ambiguity.

This spec does NOT modify the `/spec-planner` plan.md auto-append behavior (that landed in Wave 1) — it only defines the **board** format the auto-append targets and the **archive** path that `/close-wave` writes to.

## Doctrine context (cross-cutting; non-normative summary)

The v2 protocol's three lines, restated:

- **Manual is primary.** Editing `docs/plan.md` by hand, moving sections to `docs/waves/` with `git mv`, and running `git status` per repo from a shell are all first-class execution paths for this wave's deliverables. The new skills accelerate, they don't replace.
- **Completion = repo artifacts.** Wave summaries in `docs/waves/` and `/harness-status` snapshots in `.harness-state/` are the durable record. Chat history and `/harness-status` console output are not.
- **Portability test.** A new person opening any registered repo cold must answer the five §2.3 questions from repo files alone. This wave fixes the pointer asymmetry where AGENTS.md said "what was shipped → `docs/waves/`" but the directory didn't exist.

## Trust-boundary trade-off (PRE-EMPT)

Per `feedback_codex_walks_back_friction_reducers`, two design decisions in this spec are friction-removal **by design** and likely to draw "should require user confirmation" pushback from adversarial review:

1. **`/archive-plan` mutates `docs/plan.md` without a confirmation prompt.** That is correct. The user already chose to run `/archive-plan`. The skill is idempotent (re-running with the same plan.md content yields the same `idempotency_key` and no-ops via Stage A). Output is deterministic and reviewable via `git diff` after the fact. A confirmation prompt would defeat the purpose. Opt-out is wired via the standard `.harness-profile.archive_plan.enabled: true` (default) flag and the env var `ARCHIVE_PLAN_DRY_RUN=1` for diff-preview-only mode.
2. **`/harness-status` walks the registry without per-repo opt-in.** Correct because the registry itself is the opt-in (a repo isn't scanned unless its path is in `~/.config/harness/projects.yml`). A second per-repo confirmation would duplicate consent. Per-repo skip lists belong in the registry, not in a runtime prompt.
3. **`/harness-status` is exempt from Stage A no-op reuse (rescans on every invocation).** Correct because the command's value is git-state freshness — the branch, dirty-tree, and worktree state on each registered repo — which lives outside the receipt's input file set. Mechanizing live git output digests into receipt inputs would make `recompute-keys.sh` non-reproducible across machines/days. Per `feedback_codex_walks_back_friction_reducers`: an adversarial review may push toward "include git state in input digests so idempotency holds," which sounds principled but breaks fixture portability. The chosen path (b) preserves receipt-schema integrity for mutating commands while accurately marking `/harness-status` as the documented freshness-probe exception. See §5.4 for the full rationale, including the rejected path (a).

If `/planning-loop` returns a Codex finding asking for confirmation prompts on the first two paths, OR a finding asking for content-stable idempotency on `/harness-status` (path (a) above), the planning-loop arbiter should classify it as `wrong-premise` and the spec-author override stands.

## Data Model

This spec has two persistent-state artifacts beyond receipts: `docs/plan.md` (active board), `docs/waves/<filename>.md` (per-wave archive). The path-only registry at `~/.config/harness/projects.yml` is per-user state, not repo state.

### Entity: PlanBoardRow

A single wave entry on `docs/plan.md`. The format matches what `/spec-planner` auto-appends in Wave 1; this spec does not change the row schema, only formalizes which section it lives in.

| Field | Type | Constraints | Description |
|---|---|---|---|
| `wave_number` | integer | unique within plan.md | The N in `### Wave N - <title>` |
| `title` | string | not null | One-line wave title |
| `spec_path` | string | not null; relative to repo root | `docs/specs/YYYY-MM-DD-<topic>.md` |
| `status` | enum | `ready` / `running` / `review` / `done` | Maps to plan.md section: `ready`/`running`/`review` → `## Now`; `done` → `## Recently Shipped`; explicit `blocked` lives in `## Blocked` (no status field needed; section presence is the signal) |
| `exit_gate_summary` | string | optional, one line | Verbatim or distilled from spec exit gate |
| `merge_sha` | string | required when in `## Recently Shipped` | Git SHA of the merge commit; sourced from the `/close-wave` receipt |
| `archive_path` | string | required for any row currently in `## Recently Shipped` | `docs/waves/wave<N>-<slug>.md` pointer baked into the one-line `[x]` row format. Once `/archive-plan` removes a row, both the row and this field disappear from `docs/plan.md`; the wave file at the pointed path becomes the sole record. |

**Section assignment rules:**
- `## Now` — at most one wave with `status: running` plus zero or more `status: ready` (no hard cap; the user is responsible for not over-queuing).
- `## Next` — wave numbers `> max(running)` with `status: ready` and no blocker. Move to `## Now` when the user starts work.
- `## Blocked` — bullets prefixed `- [!]` with a one-line blocker description; spec-link optional.
- `## Recently Shipped` — bullets prefixed `- [x]` with `<title> -> docs/waves/wave<N>-<slug>.md (<merge SHA>)`. `/archive-plan` decides when to compact this section (default: keep the last 3 rows, remove older rows entirely; the `docs/waves/` archive is canonical for any wave whose row has been removed).

### Entity: WaveArchiveFile

One Markdown file per closed wave at `docs/waves/wave<N>-<slug>.md`.

| Field | Type | Constraints | Description |
|---|---|---|---|
| `wave_number` | integer | encoded in filename | `wave<N>-…` |
| `slug` | string | kebab-case, ≤40 chars | Distilled from spec title; matches `[a-z0-9-]+` |
| `spec_path` | string | required, in body | Repo-relative spec path |
| `merge_sha` | string | required, in body | Git SHA of the merge commit |
| `closed_at` | ISO-8601 date | required, in body | Date the wave was merged |
| `exit_gate_proofs` | list[string] | required, in body | The exit-gate bullet list with PASS/PASS-with-deviation status — copied verbatim from the close-wave summary the orchestrator hand-wrote in `docs/<date>-<project>-wave<N>-summary.md` |
| `post_merge_fixes` | list[string] | optional, in body | Any post-merge reconcile commits (cf. Wave 8/9's pattern of `1f0d250` / `af19192`) |
| `oqs_resolved` | list[string] | optional, in body | Open Questions answered during the wave |
| `oqs_deferred` | list[string] | optional, in body | Open Questions parked or pushed forward |

**Body shape:** the existing `docs/<date>-claude-harness-wave<N>-summary.md` files are the prior art. This spec adopts that shape verbatim — only the path changes (`docs/waves/wave<N>-<slug>.md`) and a frontmatter-style header lifts the `wave_number`/`slug`/`spec_path`/`merge_sha`/`closed_at` fields above the prose for grep-ability.

**Relationship to `.harness-state/wave<N>-closed.md`:** The receipt is the machine-readable source of truth (`.harness-state/wave<N>-closed.md` and the §4.2 YAML receipt). The `docs/waves/` file is the human-readable archive — overlapping content is intentional duplication, like a release note. `/close-wave` writes both in the same commit; receipts go to `.harness-state/`, summary goes to `docs/waves/`.

### Entity: RegistryEntry

A row in `~/.config/harness/projects.yml`. Per-user, per-machine, NOT in any repo.

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | string | not null, unique within file, kebab-case | Stable per-project ID (e.g., `claude-harness`, `wordwideAI`) |
| `path` | string | not null, absolute | Filesystem path to the repo root |
| `group` | string | optional | Free-form grouping (e.g., `harness`, `product`, `infra`) |

Disallowed fields (§5 of v2 spec): `main_branch`, `plan_path`, `waves_path`, `quality_gate`, `tracker_team`, `deploy_command`, `protected_paths`, anything that belongs in a per-repo `.harness-profile`. The registry parser MUST refuse unknown top-level fields (return a clear error citing the field name and the §5 disallow list) — silently accepting them would let drift creep in.

### Entity: HarnessStatusSnapshot

Output of `/harness-status`. Lives under `.harness-state/` of the **invoking** repo only.

| File | Type | Constraints | Description |
|---|---|---|---|
| `.harness-state/harness-status-<timestamp>.md` | Markdown | required | Human-readable summary; one section per registered repo |
| `.harness-state/harness-status-<timestamp>.json` | JSON | required | Machine-readable snapshot — same data as the Markdown, structured for downstream tools |
| `.harness-state/harness-status-<timestamp>.yml` | YAML | required | §4.2 receipt for the run |

**Per-repo block in the Markdown summary contains:**
- `id`, `path`, `group`
- Branch (`git rev-parse --abbrev-ref HEAD`)
- Working tree status: `clean` / `dirty (<N> files)`
- Active worktrees (`git worktree list --porcelain`)
- `## Now` and `## Blocked` rows from the repo's `docs/plan.md` (parsed best-effort; pre-conversion repos get a `(pre-v2 plan format — skipped)` note)
- Last shipped wave (most recent line in `## Recently Shipped` if present)
- Optional warnings (registry path missing on disk, `.harness-profile` malformed, etc.)

The JSON file is a list of objects with the same fields. No prose.

## API Surface

Not applicable — no HTTP interfaces.

## Design Principles

- **Plan.md is for humans first.** The board format optimizes for fast scanning. `## Now` lists 1-3 lines; `## Recently Shipped` keeps the last few merges visible without growing unbounded.
- **`docs/waves/` is the durable record.** When the active board archives a row, the row is removed from `docs/plan.md` entirely; the wave file under `docs/waves/` becomes the sole durable record. The connection from any caller back to plan.md is via filename convention (`wave<N>-<slug>.md`), not via a stub row left behind.
- **`/harness-status` writes nothing it cannot prove was authored by the invoking repo.** Cross-repo reads only. Per v2 §4.2 read-only contract — no commits, no `.harness-profile` edits, no `docs/plan.md` mutation in any scanned repo.
- **Registry is an index, not configuration.** v2 §5 is firm: `id`, `path`, optional `group`. Anything else belongs in the per-repo `.harness-profile`.
- **Pre-conversion repos must not break the scan.** Cross-repo rollout is per-repo; `/harness-status` must surface what it can and skip what it can't, without failing the whole run.
- **Failure-mode discipline.** Both skills follow the §3.0a reserve-then-mutate lifecycle — `/archive-plan` because it mutates `docs/plan.md`, `/harness-status` because the receipt audit trail is mandatory even for read-only commands.

## Requirements

### Phase 1: Active-board format (`docs/plan.md`)

#### 1.1 Section schema

`docs/plan.md` MUST have exactly four top-level sections in this order: `## Now`, `## Next`, `## Blocked`, `## Recently Shipped`. Each section contains zero or more wave rows in the row schema defined in the data model.

**Acceptance criteria:**
- [ ] `claude-harness/docs/plan.md` after this wave contains exactly the headings `## Now`, `## Next`, `## Blocked`, `## Recently Shipped` (regex: `^## (Now|Next|Blocked|Recently Shipped)$` matches each exactly once).
- [ ] No legacy headings remain (`## Operating Rules`, `## Why`, `## Wave \d+`, `## Active`, etc.). Operating-rules-style preamble is acceptable as plain prose above `## Now`.
- [ ] Every existing closed wave (Waves 1-9) appears in `## Recently Shipped` as a one-line entry: `- [x] Wave N - <title> -> docs/waves/wave<N>-<slug>.md (<merge SHA>)` OR has been archived out via Task 3.
- [ ] No row in `## Now` cites a missing spec file (every `spec:` line resolves on disk).
- [ ] Edge case: a wave row in `## Blocked` may omit `merge_sha` and `archive_path`; only `wave_number`, `title`, and the blocker text are required.
- [ ] Idempotency: re-running the conversion (Task 1) on an already-converted plan.md produces a byte-identical file.

#### 1.2 Row format (matches Wave 1 auto-append)

Each row uses the format `/spec-planner` already emits:

```markdown
### Wave N - <title>
- spec: docs/specs/YYYY-MM-DD-<topic>.md
- status: ready | running | review
- exit gate: <one line>
```

Recently-shipped rows collapse to one-liners:

```markdown
- [x] Wave N - <title> -> docs/waves/wave<N>-<slug>.md (<merge SHA>)
```

**Acceptance criteria:**
- [ ] Rows in `## Now` / `## Next` use the H3-block form.
- [ ] Rows in `## Recently Shipped` use the one-line `[x]` form.
- [ ] Rows in `## Blocked` use the one-line form `- [!] Wave N - <title> - blocked on <reason>` (spec-link optional).

### Phase 2: `docs/waves/` archive convention

#### 2.1 Filename and path

Wave summaries live at `docs/waves/wave<N>-<slug>.md`, where `<slug>` is the kebab-case spec-title slug (`[a-z0-9-]+`, ≤40 chars).

**Acceptance criteria:**
- [ ] `docs/waves/` directory exists.
- [ ] Every existing `docs/2026-*-claude-harness-wave<N>-summary.md` file is migrated into `docs/waves/wave<N>-<slug>.md` (eight files: waves 1, 2, 3, 4, 5, 6, 8, 9; Wave 7 was superseded and has no summary).
- [ ] The migration uses `git mv` so history is preserved (verifiable by `git log --follow docs/waves/wave1-*.md` showing the pre-migration history).
- [ ] No `docs/2026-*-wave<N>-summary.md` files remain in `docs/` after migration (verifiable by `ls docs/2026-*-wave*-summary.md` returning empty).

#### 2.2 Body shape

The body retains the existing summary shape (Shipped table, files added/modified, exit gate status, deviations, open items). A new YAML-style frontmatter block at the top of each migrated and future file lifts metadata:

```markdown
---
wave_number: 9
slug: claude-adapter-alignment
spec_path: docs/specs/2026-05-01-claude-adapter-alignment.md
merge_sha: a5c844b
closed_at: 2026-05-01
---

# Wave 9 — Claude Code adapter alignment (v2 Wave 1) — orchestrator summary

[... existing body verbatim ...]
```

**Acceptance criteria:**
- [ ] Each migrated file has a frontmatter block parseable as YAML (delimited by `---`).
- [ ] Each frontmatter contains `wave_number`, `slug`, `spec_path`, `merge_sha`, `closed_at` at minimum.
- [ ] Body content below the frontmatter is byte-identical to the pre-migration source (only the path changed and the frontmatter was prepended).
- [ ] Edge case: the migration script (or manual procedure) is idempotent — running it on already-migrated files is a no-op.

#### 2.3 `/close-wave` writes to `docs/waves/` going forward

`skills/close-wave/SKILL.md` Step 8 (summary doc write) MUST emit at `docs/waves/wave<N>-<slug>.md` from this wave forward. The old `docs/<date>-<project>-wave<N>-summary.md` path is retired (no dual-write, no symlink).

**Acceptance criteria:**
- [ ] `grep -F 'docs/waves/wave' skills/close-wave/SKILL.md` exits 0.
- [ ] `grep -F 'docs/<date>-<project>-wave' skills/close-wave/SKILL.md` returns no matches OR matches only inside a "deprecated" / "retired" annotation block.
- [ ] The receipt `inputs` for `/close-wave` (currently `[docs/plan.md, <spec_path>, docs/waves/<summary file path>]`) resolves the third entry to a `docs/waves/wave<N>-<slug>.md` path on a fixture run.
- [ ] Any reads of summary files in `/run-wave` or `/close-wave` resolve via the new path; pre-migration paths return `MISSING` in the §4.2 input digest, which is acceptable (it's an input on a future invocation, not a backfill requirement).

### Phase 3: `/archive-plan` skill

A new skill at `skills/archive-plan/SKILL.md`. Mutates `docs/plan.md` only. Idempotent. Emits a §4.2 receipt via `skills/_shared/lib/emit-receipt.sh`.

#### 3.1 What it does

`/archive-plan` is invoked manually. Its sole job is to compact `## Recently Shipped` so old entries don't accumulate forever in `docs/plan.md`.

Default behavior:
- Read `docs/plan.md`.
- Inspect `## Recently Shipped`. If it contains more than `keep_last` entries (default: 3), select the oldest (`count - keep_last`) entries for removal.
- For each row marked for removal, verify the linked `docs/waves/wave<N>-<slug>.md` file exists. If it does NOT exist, abort the entire run with `aborted-on-ambiguity` and a clear error citing the missing file (per "Don't invent state when inputs are missing" in AGENTS.md). The `docs/waves/` archive file is the canonical record; removing a plan.md row when its wave file is missing would destroy the only durable trace of that wave.
- Remove the row(s) entirely. No stub, no cross-reference, no placeholder is left behind in `docs/plan.md`. The wave file under `docs/waves/wave<N>-<slug>.md` is canonical — its frontmatter (`wave_number`, `slug`, `spec_path`, `merge_sha`, `closed_at`) is the durable record. After `/archive-plan`, `## Recently Shipped` contains exactly `keep_last` (default 3) one-line `[x]` rows; everything older has been removed.

`/archive-plan` does NOT author wave summaries — those land at close-wave time. It only removes older `## Recently Shipped` rows from `docs/plan.md`; the corresponding `docs/waves/<wave-file>.md` archives are read (to verify existence) but never written by `/archive-plan`.

**Acceptance criteria:**
- [ ] `/archive-plan` reads `docs/plan.md`, identifies `## Recently Shipped` rows older than `keep_last` (default 3), and removes them.
- [ ] Each archived row's linked `docs/waves/wave<N>-<slug>.md` MUST exist before removal — if missing, `/archive-plan` aborts before any mutation with `status: aborted-on-ambiguity`.
- [ ] `/archive-plan` is idempotent: re-running on an already-compacted plan.md is a Stage A no-op (same `idempotency_key`, same receipt).
- [ ] Re-running with the same plan.md content (no changes since last run) hits the §4.2 Stage A success no-op path; no new receipt file is created beyond the existing success receipt.
- [ ] If `## Recently Shipped` has ≤ `keep_last` entries, `/archive-plan` does nothing (writes a `success` receipt with `outputs: []` to record the no-op decision; this is distinct from a Stage A no-op — the operation ran, it just had nothing to do).
- [ ] Edge case: malformed `## Recently Shipped` (a row without `-> docs/waves/`) → abort with `aborted-on-ambiguity` and clear stderr.
- [ ] `--dry-run` flag (or `ARCHIVE_PLAN_DRY_RUN=1` env var) prints the proposed diff to stdout, writes a `partial`-status receipt, and makes no plan.md mutation.

#### 3.2 Receipt shape (§4.2 conformance)

Emitted via `skills/_shared/lib/emit-receipt.sh`:

- `command: archive-plan`
- `wave_id`: `null` (the command isn't tied to a single wave; it acts on a range)
- `spec_path`: `null` (the command operates on plan.md directly, not against a spec)
- `operation_id`: `sha256_hex("archive-plan\n-")` per §3.0 — `'-'` because no wave/spec key applies
- `inputs`: `[docs/plan.md]` plus each `docs/waves/wave<N>-<slug>.md` referenced by the rows being archived (so changing a wave file's contents invalidates the prior `idempotency_key`)
- `outputs`: `[docs/plan.md]` (the file is rewritten in place via temp + atomic rename)
- `verification.commands`: `[git diff --stat docs/plan.md]`
- `status`: `success` on clean run, `aborted-on-ambiguity` on missing wave file, `failed` on disk error, `partial` for `--dry-run`

**Acceptance criteria:**
- [ ] Receipt validates against §4.2 schema (parseable as YAML, has all required fields).
- [ ] `idempotency_key.value` recomputes correctly via the `recompute-keys.sh` algorithm.
- [ ] Two `/archive-plan` runs with identical plan.md content produce identical `idempotency_key.value` byte-for-byte.
- [ ] Mutating a referenced `docs/waves/wave<N>-<slug>.md` file's content (e.g., adding a post-merge note) invalidates the prior `idempotency_key`; next `/archive-plan` does fresh work via Stage A's content-freshness rule.
- [ ] Atomic rename: a fixture that kills the process between temp-file write and rename leaves `docs/plan.md` byte-identical to the pre-run state (no torn write).

### Phase 4: Path-only central registry

A new file at `~/.config/harness/projects.yml`. Per-user, per-machine. NOT in any repo.

#### 4.1 Registry location and shape

Location: `~/.config/harness/projects.yml` by default. **Override via the `HARNESS_REGISTRY_PATH` environment variable** so fixtures and CI runs can point at a fixture file (e.g., `skills/harness-status/lib/test-fixtures/example-projects.yml`) without touching the user's home directory. The directory at the default path is created on first write (by the operator manually for now; auto-creation is parked).

Shape (matching v2 §5 verbatim):

```yaml
projects:
  - id: claude-harness
    path: /Users/klorian/workspace/claude-harness
    group: harness
  - id: wordwideAI
    path: /Users/klorian/workspace/wordwideAI
    group: product
  - id: gobot
    path: /Users/klorian/workspace/gobot
    group: infra
```

Allowed fields: `id` (kebab-case string, unique), `path` (absolute string), `group` (optional string). All other fields are forbidden.

**Acceptance criteria:**
- [ ] A registry parser (in `/harness-status`) that encounters an unknown top-level field under a project entry MUST refuse to load that entry, log a clear error citing the disallowed field name, and continue scanning the remaining entries.
- [ ] A registry parser MUST validate `id` is unique within the file; duplicates trigger a `failed` receipt.
- [ ] A registry parser MUST validate `path` is absolute; relative paths trigger a `failed` receipt.
- [ ] An empty or missing registry file is a graceful no-op: `/harness-status` exits 0 with a one-line "no projects registered" summary.

#### 4.2 Bootstrapping

For this wave, the operator creates the registry by hand using `mkdir -p ~/.config/harness && $EDITOR ~/.config/harness/projects.yml`. Auto-registration during `setup-harness` or `/project-init` is parked (Open Question below). Documentation: `/harness-status --help` and the `skills/harness-status/SKILL.md` body both show the example shape and the manual-edit command.

**Acceptance criteria:**
- [ ] `skills/harness-status/SKILL.md` includes a "Bootstrapping the registry" section with the example YAML, the `mkdir -p` command, and the `HARNESS_REGISTRY_PATH` env-var override.
- [ ] An example registry fixture exists at `skills/harness-status/lib/test-fixtures/example-projects.yml` and contains only allowed fields (`id`, `path`, `group`).
- [ ] If the resolved registry path (`HARNESS_REGISTRY_PATH` if set, else `~/.config/harness/projects.yml`) does not exist when `/harness-status` runs, the skill prints a friendly stderr message ("registry not found at <path>; create it per skills/harness-status/SKILL.md §Bootstrapping") and exits 0 with a "no projects registered" summary. Non-error path; missing registry is not a failure.
- [ ] Wave 10's exit gate is reproducible from the repo alone: `~/.config/harness/projects.yml` is **not** required to exist on any machine for the wave to be considered closed. Cross-machine portability is preserved by the example fixture under the test tree.

### Phase 5: `/harness-status` skill

A new skill at `skills/harness-status/SKILL.md`. **Read-only across registered repos.** Writes only under the invoking repo's `.harness-state/`.

#### 5.1 What it does

When invoked, `/harness-status`:

1. Loads `~/.config/harness/projects.yml`.
2. For each registered project (or the subset matched by `--group <name>` / `--id <name>` flags):
   - `cd $path && git --no-optional-locks status --porcelain && git --no-optional-locks worktree list --porcelain` (read-only; `--no-optional-locks` suppresses the `index.lock` acquisition and `.git/index` lstat refresh that plain `git status` may perform on a cold cache, which would otherwise falsify the hard read-only invariant below). Equivalent: prefix each invocation with `GIT_OPTIONAL_LOCKS=0`.
   - Read `$path/docs/plan.md` if present; parse `## Now` and `## Blocked` sections best-effort.
   - Read `$path/.harness-profile` if present (registry-level metadata only — name, audience, stakes; never edited).
3. Aggregate into a per-repo block (Markdown) and a per-repo object (JSON).
4. Write `.harness-state/harness-status-<timestamp>.md` and `.harness-state/harness-status-<timestamp>.json` and the §4.2 receipt YAML in the **invoking** repo only.

**Hard read-only invariants (per v2 §4.2 contract; verified by Task 7 fixture):**
- [ ] No `git commit` is executed in any scanned repo (verified by `git rev-parse HEAD` before/after on each repo).
- [ ] No edits to `docs/plan.md`, `docs/specs/`, `docs/waves/`, `parking_lot.md`, source files, or `.harness-profile` in any scanned repo (verified by `git --no-optional-locks status --porcelain` returning the same set before and after).
- [ ] No new branches created in any scanned repo (verified by `git branch --list` before and after).
- [ ] No writes under each scanned repo's `.git/` directory (verified by capturing `stat -f '%m %z' .git/index` (or `stat -c '%Y %s'` on Linux) and `sha256` of `.git/index` and `.git/HEAD` before and after the scan; both must be byte-identical for every scanned repo). This catches `index.lock` acquisition and lstat-refresh writes that `git status --porcelain` parity does not surface.
- [ ] The only writes anywhere on disk are: the invoking repo's `.harness-state/harness-status-<timestamp>.md`, `.json`, and `.yml` files.

#### 5.2 Pre-conversion repo handling

A repo that has not adopted the v2 plan.md format must not fail the whole scan.

**Acceptance criteria:**
- [ ] If `$path/docs/plan.md` is missing, the per-repo block reports `(plan.md not found)` and the scan continues.
- [ ] If `$path/docs/plan.md` is present but doesn't contain `## Now` / `## Blocked` headings, the per-repo block reports `(pre-v2 plan format; skipped)` and the scan continues.
- [ ] If `$path/.harness-profile` is malformed YAML, the per-repo block reports `(harness-profile malformed; skipped)` and the scan continues.
- [ ] If `$path` is missing on disk, the per-repo block reports `(repo path missing on disk: <path>)` and the scan continues; the per-repo input digest in §4.2 records `MISSING` for that path's contributory inputs.
- [ ] Fixture: a registry with one v2 repo and one pre-conversion repo produces a summary covering both, with the pre-conversion repo flagged.
- [ ] Exit code: 0 on partial-pre-conversion runs; non-zero only if registry parse fails or the invoking repo's `.harness-state/` is unwritable.

#### 5.3 Output format

Markdown summary structure:

```markdown
# Harness status — <ISO-8601 timestamp>

Registry: ~/.config/harness/projects.yml (3 projects, 2 groups)

## claude-harness (group: harness)
- path: /Users/klorian/workspace/claude-harness
- branch: master
- working tree: clean
- worktrees: 1 (master at /Users/klorian/workspace/claude-harness)
- ## Now (1 active):
  - Wave 10 - Plan registry maintenance — running
- ## Blocked: none
- last shipped: Wave 9 — Claude Code adapter alignment (a5c844b)

## wordwideAI (group: product)
- path: /Users/klorian/workspace/wordwideAI
- branch: master
- working tree: dirty (3 files)
- worktrees: 2
  - master at /Users/klorian/workspace/wordwideAI
  - feature-x at /Users/klorian/workspace/wordwideAI-feature-x
- ## Now (pre-v2 plan format; skipped)
- last shipped: (unknown — pre-v2 format)

## gobot (group: infra)
- (repo path missing on disk: /Users/klorian/workspace/gobot)

---
Total: 3 registered, 2 reachable, 1 missing
```

JSON snapshot has the same data as a structured object. Receipt YAML follows §4.2.

**Acceptance criteria:**
- [ ] The Markdown summary file exists at `.harness-state/harness-status-<timestamp>.md` after a successful run.
- [ ] The JSON file exists at the sibling `.json` path and parses as valid JSON.
- [ ] Both files contain one entry per registered repo.
- [ ] Per-repo block in the Markdown contains: `id`, `path`, `branch`, `working tree`, `worktrees`, `## Now`, `## Blocked`, `last shipped` (in that order, formatted as above).
- [ ] Repos with `path` missing on disk produce a single-line "missing on disk" report and no further fields.

#### 5.4 Receipt shape (§4.2 conformance)

Emitted via `skills/_shared/lib/emit-receipt.sh`:

- `command: harness-status`
- `wave_id`: `null` (cross-repo command, not wave-keyed)
- `spec_path`: `null`
- `operation_id`: `sha256_hex("harness-status\n-")`
- `inputs`: `[<resolved registry path — HARNESS_REGISTRY_PATH if set, else ~/.config/harness/projects.yml>, <each registered $path/docs/plan.md if present>, <each registered $path/.harness-profile if present>]` — paths are repo-root-relative for the invoking repo's own inputs and absolute for cross-repo inputs (the helper handles MISSING for unreachable absolute paths). Fixtures pass `HARNESS_REGISTRY_PATH=skills/harness-status/lib/test-fixtures/example-projects.yml` so the receipt's input digest is reproducible across machines. **Note:** git state (branch / worktree / `git status --porcelain` output) is deliberately NOT included in the input file set — see the Stage A no-op exemption below.
- `outputs`: `[.harness-state/harness-status-<timestamp>.md, .harness-state/harness-status-<timestamp>.json]`
- `verification.commands`: `[git status --porcelain, git worktree list --porcelain]` (commands run per scanned repo; results aggregated into a single list)
- `status`: `success` on full clean run, `partial` if any registered repo errored mid-scan but others succeeded, `failed` if registry itself was malformed or invoking repo's `.harness-state/` was unwritable

**Stage A no-op exemption (`/harness-status` is the documented exception):**

`/harness-status` is **exempt from §3.0a Stage A prior-success no-op reuse**. Each invocation rescans live state and writes a fresh receipt with a fresh `idempotency_key.value`, regardless of whether the receipt-input file set (registry + plan.md + .harness-profile contents) is unchanged since the last run.

Rationale: the value of `/harness-status` is **git-state freshness** — the branch each registered repo is on, whether the working tree is dirty, which worktrees exist. That state lives outside the receipt input file set. If `/harness-status` reused a prior `success` receipt via Stage A whenever plan.md and .harness-profile were unchanged, a branch switch / worktree change / new uncommitted edits in any scanned repo would silently no-op into a stale snapshot — defeating the command's purpose with no mechanically observable failure mode.

The alternative (mechanizing per-repo `git rev-parse HEAD` / `git status --porcelain` / `git worktree list --porcelain` digests into the receipt's input set) was rejected because it makes `recompute-keys.sh` fragile: live git state at recompute time would have to match git state at original-run time exactly, which is unreproducible across machines, across days, and across CI runs. Path (b) — the no-op exemption — preserves the receipt schema and `idempotency_key` contract for `/archive-plan` and other mutating commands while accurately reflecting that `/harness-status` is a freshness probe, not a content-stable derivation.

**Implementation of the exemption:**

- `idempotency_key.value` for `/harness-status` is computed as `sha256_hex(operation_id + "\n" + ISO-8601 timestamp + "\n" + sha256_hex(<resolved registry path contents or 'MISSING'>))` — a non-content-stable shape that includes the invocation timestamp. Two consecutive runs with identical registry + plan.md + .harness-profile contents and identical git state will produce DIFFERENT `idempotency_key.value` strings (timestamp differs).
- `idempotency_key.trace` includes the same fields as other commands (operation_id, sorted input digests) PLUS an explicit `stage_a_exempt: true` field documenting the exemption. This is a documented schema deviation; §4.2 receipt-schema discussion (`docs/protocol/receipt-schema.md`) gains a one-line note in this wave that read-only freshness-probe commands MAY set `stage_a_exempt: true` to opt out of prior-success reuse, with `/harness-status` as the canonical example.
- The Stage A check in `skills/_shared/lib/emit-receipt.sh` (or its caller in `skills/harness-status/`) reads `stage_a_exempt` from the prior receipt's trace; if `true`, skips the prior-success short-circuit and proceeds to a fresh scan unconditionally.
- `recompute-keys.sh` for Wave 2 fixtures handles `/harness-status` receipts as a special case: instead of asserting `idempotency_key.value` recomputes to the original value, it asserts the trace's `stage_a_exempt: true` field is present AND that the `value` matches the documented timestamp-salted formula given the receipt's own `created_at` field.

**Acceptance criteria:**
- [ ] Receipt validates against §4.2 schema (parseable YAML, all required fields present) including the `stage_a_exempt: true` field in `idempotency_key.trace`.
- [ ] `idempotency_key.trace.stage_a_exempt` is `true` on every `/harness-status` receipt; `recompute-keys.sh` Wave 2 special-case logic asserts this field's presence and the timestamp-salted `value` formula.
- [ ] **Stage A exemption behavior:** Two consecutive `/harness-status` runs with NO changes to registry, plan.md, .harness-profile, or git state on any scanned repo produce DIFFERENT `idempotency_key.value` byte-for-byte. (This is the inverse of every other command's idempotency assertion — verified by the `harness-status-stage-a-exempt.md` fixture in Task 7.)
- [ ] **Stage A exemption behavior under git-state-only change:** Two consecutive `/harness-status` runs with identical receipt-input file contents but with a worktree change / branch switch / new uncommitted edit on a scanned repo BOTH execute fresh scans and produce different summaries. The second run does NOT short-circuit on the first run's `success` receipt. (Verified by the `harness-status-stage-a-exempt.md` fixture; this is the load-bearing assertion proving the exemption is wired up correctly.)
- [ ] Read-only assertion: `git rev-parse HEAD` on each scanned repo is byte-identical before and after the run. Verified by Task 7 fixture.
- [ ] Edge case: empty registry → receipt is still written, with `inputs: [<resolved registry path>]` and `outputs: [.harness-state/harness-status-<timestamp>.md, .harness-state/harness-status-<timestamp>.json]`. The summary file says "no projects registered" and the JSON is `[]`. The exemption still applies — empty-registry receipts also carry `stage_a_exempt: true`.

### Phase 6: WORKFLOW.md updates

The matrix gains rows for `/archive-plan` and `/harness-status` (per v2 §8 Wave 2 explicit "Updates `WORKFLOW.md`? Yes, adds `/archive-plan` and `/harness-status` rows").

**Acceptance criteria:**
- [ ] `WORKFLOW.md` has a row for `Archive plan` whose Manual / Claude / Codex / Automation columns match the format below.
- [ ] `WORKFLOW.md` has a row for `Cross-repo status` whose columns match the format below.
- [ ] Both rows reference the §4.2 receipt path under `.harness-state/` and link to `skills/_shared/lib/emit-receipt.sh` for the helper.
- [ ] `grep -c '^| .* | .* | .* | .* | .* |$' WORKFLOW.md` returns ≥ 9 (1 header + 8 command rows; up from 7 after Wave 2).
- [ ] No row was renamed or removed; only the two new rows were added.

### Phase 7: Edge cases and error handling

- [ ] **`docs/plan.md` is missing in the invoking repo:** `/archive-plan` aborts with `aborted-on-ambiguity` and a clear stderr error. `/harness-status` reports `(plan.md not found)` for that repo and continues scanning the others.
- [ ] **`docs/waves/` directory is missing in the invoking repo:** `/archive-plan` creates it (`mkdir -p`) — wave files are not authored by archive-plan, but the directory must exist before any future `/close-wave` writes a summary there.
- [ ] **Registry file unparseable as YAML:** `/harness-status` writes a `failed` receipt with `verification.results` showing the parser error and a non-zero exit code; no summary file is written.
- [ ] **Registry contains a disallowed field** (e.g., `quality_gate`): the entry is skipped with an error logged to the summary file's "warnings" section; the scan continues.
- [ ] **`/archive-plan` invoked on a plan.md with empty `## Recently Shipped`:** writes a `success` receipt with `outputs: []`; no plan.md mutation.
- [ ] **Two `/archive-plan` runs racing on the same plan.md:** the second invocation hits Stage A no-op via `idempotency_key` if the first finished cleanly. If the first is mid-flight, the second's preflight finds a `started` receipt; per the §3.0a 60-min orphan rule, fresh `started` receipts (mtime < 60min) are left for the live process to finish, and the second exits cleanly with an "already running" message. (Within-second double-invocation is handled by emit-receipt's exclusive-create reservation lock.)
- [ ] **`/harness-status` invoked from a directory that is not a git repo:** the helper's `.harness-state/` resolution falls back to `$(pwd)/.harness-state/`; the skill writes there and proceeds. (This is a corner case for users running `/harness-status` from `~/` or another non-repo path.)
- [ ] **A scanned repo has uncommitted changes mid-scan:** the read-only invariant is upheld — the `working tree: dirty (<N> files)` count is reported, but no `git add`, `git stash`, or `git checkout` is executed. The scan never resolves "dirty" by mutating.
- [ ] **`.harness-state/` unwritable in the invoking repo:** both skills' preflight aborts before any side effect (mirrors Wave 1 §3.0a). Non-zero exit; no receipt file; no summary file.
- [ ] **Bash 3.2 macOS compatibility:** registry parsing uses `yq` if available, else `awk` fallback. SHA-256 via `sha256sum` else `shasum -a 256` (inherited from emit-receipt.sh helper). No associative arrays.

## Implementation Plan (Sprint Contracts)

Each task is a contract: build it, verify it, move on. Dependencies are explicit. See the `## Implementation` block at the top of this spec for the canonical execution-rank layout.

### Phase 1: Plan format and archive convention (Layer 0 — parallel)

- [ ] **Task 1:** Convert `docs/plan.md` to the four-section active-board format and migrate Wave 1-9 entries.
  - **Files:** `docs/plan.md`
  - **Depends on:** Nothing (Layer 0)
  - **Verify:** `grep -c '^## (Now|Next|Blocked|Recently Shipped)$' docs/plan.md` returns 4 (one heading per section, regex anchored). All Wave 1-9 entries appear in `## Recently Shipped` as one-line `[x]` rows OR have been archived out by Task 3 (which runs in Layer 1 after this task lands). Spec links resolve on disk: `for spec in $(grep -oE 'docs/specs/[^ )]+\.md' docs/plan.md); do test -f "$spec" || echo MISSING $spec; done` produces no MISSING lines.
  - **Manual fallback:** Complete `git + editor + gh` runbook (no adapter required):
    - `git checkout -b chore/plan-active-board` — branch off master so the plan.md rewrite is reviewable.
    - `$EDITOR docs/plan.md` — create the four section headings (`## Now`, `## Next`, `## Blocked`, `## Recently Shipped`) in that order; move each existing Wave block into the appropriate section (Wave 10 into `## Now`; completed Waves 1-9 into `## Recently Shipped` as one-line `- [x] Wave N - <title> -> docs/waves/wave<N>-<slug>.md (<merge SHA>)` rows). Wave-content detail (deviations, exit-gate proofs) stays in `docs/waves/` files (Task 2). Save.
    - `for spec in $(grep -oE 'docs/specs/[^ )]+\.md' docs/plan.md); do test -f "$spec" || echo MISSING $spec; done` — verify spec links resolve; fix any MISSING entries.
    - `git add docs/plan.md` — stage explicitly.
    - `git commit -m "chore(plan): convert to four-section active board"`.
    - `git push -u origin chore/plan-active-board`.
    - `gh pr create --draft --title "chore(plan): convert to four-section active board" --body "Wave 10 Task 1. Renames legacy headings; migrates Wave 1-9 to ## Recently Shipped one-liners. Detail moves to docs/waves/ in Task 2."`.
    - `gh pr view --web` — confirm rendering. (No receipt; this task isn't a skill invocation, just a manual edit.)

- [ ] **Task 2:** Create `docs/waves/` directory; migrate the eight existing wave summaries; add YAML frontmatter to each; **update `skills/close-wave/SKILL.md` Step 8 to write summaries at `docs/waves/wave<N>-<slug>.md` going forward** (the legacy `docs/<date>-<project>-wave<N>-summary.md` path is retired in the same commit).
  - **Files:** `docs/waves/wave1-harness-model-pin-profile-schema.md`, `docs/waves/wave2-orchestrator-effort-routing.md`, `docs/waves/wave3-readme-cross-reference.md`, `docs/waves/wave4-planning-loop-auto-apply-arbiter.md`, `docs/waves/wave5-planning-loop-trim-regressions.md`, `docs/waves/wave6-planning-loop-skill-creator-alignment.md`, `docs/waves/wave8-universal-protocol-core.md`, `docs/waves/wave9-claude-adapter-alignment.md` (each a `git mv` of the corresponding `docs/2026-*-claude-harness-wave<N>-summary.md` file plus a frontmatter prepend), `skills/close-wave/SKILL.md` (Step 8 path edit + receipt-input list update so the new summary path appears in the §4.2 receipt's `outputs`).
  - **Depends on:** Nothing (Layer 0)
  - **Verify:** `ls docs/waves/wave*.md | wc -l` returns 8. `ls docs/2026-*-claude-harness-wave*-summary.md` returns no matches. `for f in docs/waves/wave*.md; do head -1 "$f" | grep -q '^---$' || echo MISSING-FRONTMATTER "$f"; done` produces no output. `git log --follow docs/waves/wave1-*.md` shows the pre-migration commit history. `grep -F 'docs/waves/wave' skills/close-wave/SKILL.md` exits 0 (Step 8 now writes to the new path). `grep -F 'docs/2026-' skills/close-wave/SKILL.md` returns no lines that reference the legacy summary path (only test-fixture or historical-prose mentions are allowed if they exist; primary write path is updated).
  - **Manual fallback:** Complete `git + editor + gh` runbook:
    - `git checkout -b chore/migrate-wave-summaries` — branch off master.
    - `mkdir -p docs/waves` — ensure target directory exists.
    - `git mv docs/2026-04-25-claude-harness-wave1-summary.md docs/waves/wave1-harness-model-pin-profile-schema.md` — and analogous `git mv` invocations for waves 2, 3, 4, 5, 6, 8, 9 (eight `git mv` calls total). Using `git mv` (NOT `mv` + `git add`) is mandatory so `git log --follow` preserves history.
    - `for f in docs/waves/wave*.md; do $EDITOR "$f"; done` — for each migrated file, prepend a `---`-delimited YAML frontmatter block with `wave_number`, `slug`, `spec_path`, `merge_sha`, `closed_at` lifted from the body. Save each.
    - `$EDITOR skills/close-wave/SKILL.md` — locate Step 8 (the post-merge wave-summary write). Replace the legacy `docs/<date>-<project>-wave<N>-summary.md` write path with `docs/waves/wave<N>-<slug>.md` and update the Step 8 receipt-input list so `outputs` includes the new path. Save.
    - `for f in docs/waves/wave*.md; do head -1 "$f" | grep -q '^---$' || echo MISSING-FRONTMATTER "$f"; done` — verify each file has frontmatter; no output means clean.
    - `grep -F 'docs/waves/wave' skills/close-wave/SKILL.md` — verify the new path landed.
    - `ls docs/2026-*-claude-harness-wave*-summary.md` — verify no legacy paths remain (should return no matches / "no such file or directory").
    - `git add docs/waves/ skills/close-wave/SKILL.md` — stage explicitly.
    - `git commit -m "chore(waves): migrate eight summaries + update close-wave Step 8 path"`.
    - `git push -u origin chore/migrate-wave-summaries`.
    - `gh pr create --draft --title "chore(waves): migrate summaries + update close-wave path" --body "Wave 10 Task 2. git mv preserves history; frontmatter lifted from body; close-wave Step 8 retargeted to docs/waves/."`.
    - `gh pr view --web` — confirm rendering and that GitHub recognizes the file moves as renames (not delete+add). (No receipt; manual edit task.)

### Phase 2: Registry schema (Layer 0 — parallel)

- [ ] **Task 4:** Document the registry schema and ship an example registry fixture under the repo's test tree. The wave's shippable scope is **repo artifacts only** — creating `~/.config/harness/projects.yml` on the developer's machine is a one-time manual bootstrap step, NOT a wave gate. (Per Codex round 1 finding: untracked per-user machine state cannot be a wave deliverable; CI and other maintainers must be able to reproduce the wave from the repo alone.)
  - **Files:**
    - `skills/harness-status/SKILL.md` — a `## Bootstrapping the registry` subsection only (the rest of the file is Task 5). Documents the schema (allowed fields `id` / `path` / optional `group`; v2 §5 disallow list), the default location `~/.config/harness/projects.yml`, the override env var `HARNESS_REGISTRY_PATH`, and the manual-bootstrap command (`mkdir -p ~/.config/harness && $EDITOR ~/.config/harness/projects.yml`).
    - `skills/harness-status/lib/test-fixtures/example-projects.yml` — an example registry fixture committed under the test tree, with 2-3 sample entries (one per group). Used by Task 7 fixtures via `HARNESS_REGISTRY_PATH=skills/harness-status/lib/test-fixtures/example-projects.yml /harness-status …`. **Never** points at a real repo on disk; paths are illustrative (e.g., `/tmp/example/claude-harness`).
  - **Depends on:** Nothing (Layer 0)
  - **Verify:**
    - `grep -F 'Bootstrapping the registry' skills/harness-status/SKILL.md` exits 0.
    - `grep -F 'HARNESS_REGISTRY_PATH' skills/harness-status/SKILL.md` exits 0 (the env-var override is documented).
    - `test -f skills/harness-status/lib/test-fixtures/example-projects.yml` exits 0.
    - `yq '.projects | length' skills/harness-status/lib/test-fixtures/example-projects.yml` returns ≥ 2.
    - The example fixture contains only the allowed fields (`id`, `path`, `group`); `yq '.projects[] | keys' skills/harness-status/lib/test-fixtures/example-projects.yml` returns no field outside the allow-list.
    - The wave's exit gate does NOT check `~/.config/harness/projects.yml`; whether the user has bootstrapped their personal registry is irrelevant to wave closure.
  - **Manual bootstrap (one-time per machine, NOT a wave gate):** After this wave merges, on each machine where `/harness-status` will be invoked, run `mkdir -p ~/.config/harness && $EDITOR ~/.config/harness/projects.yml`; copy the example YAML from `skills/harness-status/lib/test-fixtures/example-projects.yml` and edit `path` entries to match the local checkouts. This step is exercised by `/harness-status` on first invocation; missing registry is a friendly no-op (per §4.2 acceptance criteria), not a failure.
  - **Manual fallback (for the wave deliverable — repo artifacts):** Complete `git + editor + gh` runbook:
    - `git checkout -b feat/registry-schema-docs` — branch off master.
    - `$EDITOR skills/harness-status/SKILL.md` — author the `## Bootstrapping the registry` subsection (schema, allowed fields, disallow list reference, env-var override, default path, bootstrap command). Save.
    - `mkdir -p skills/harness-status/lib/test-fixtures && $EDITOR skills/harness-status/lib/test-fixtures/example-projects.yml` — author the example registry YAML with 2-3 illustrative entries (paths like `/tmp/example/<id>`). Save.
    - `git add skills/harness-status/SKILL.md skills/harness-status/lib/test-fixtures/example-projects.yml` — stage explicitly.
    - `git commit -m "docs(harness-status): registry schema + example fixture"`.
    - `git push -u origin feat/registry-schema-docs`.
    - `gh pr create --draft --title "docs(harness-status): registry schema + example fixture" --body "Wave 10 Task 4. Repo-artifact-only deliverable; per-user ~/.config/harness/projects.yml is a separate manual bootstrap."`.
    - `gh pr view --web` — confirm.

### Phase 3: New skills (Layer 1 — depends on Layer 0)

- [ ] **Task 3:** Author `skills/archive-plan/SKILL.md` and any helper script. Sources `skills/_shared/lib/emit-receipt.sh`. Mutates `docs/plan.md` only (atomic temp+rename). Idempotent.
  - **Files:** `skills/archive-plan/SKILL.md`, `skills/archive-plan/lib/archive.sh` (or whatever helper name fits the existing skill conventions).
  - **Depends on:** Tasks 1 and 2 (needs the active-board format and `docs/waves/` to exist).
  - **Verify:** Two distinct, separately-asserted contracts (dry-run and normal-run MUST NOT be conflated):
    - **Normal run** (no flag, no env var): On a `docs/plan.md` with 5 entries in `## Recently Shipped` (default `keep_last=3`), `/archive-plan` writes a receipt at `.harness-state/archive-plan-<ts>.yml` with `status: success`, mutates `docs/plan.md` (now 3 `## Recently Shipped` entries; 2 removed), and `git diff --name-only docs/plan.md` shows `docs/plan.md` was modified. Atomic-rename safety: kill the process between temp-write and rename → `docs/plan.md` is byte-identical to pre-run state. Idempotency: a second invocation on the now-compacted plan.md hits Stage A no-op (same `idempotency_key`, no new receipt). Missing-wave-file edge case: aborts with `status: aborted-on-ambiguity` before any plan.md write.
    - **Dry-run** (`--dry-run` flag OR `ARCHIVE_PLAN_DRY_RUN=1` env var): On the same 5-entry plan.md, `/archive-plan` writes a receipt with `status: partial`, prints the would-be unified diff to stdout, and `docs/plan.md` is **byte-identical** to its pre-run state (`git diff docs/plan.md` empty; `sha256sum docs/plan.md` equal pre/post). NO mutation occurs under any dry-run path. The `partial` status reflects "preview only — no side effects applied," distinct from a `success` no-op.
    - Fixture filenames reflect the contracts separately: `archive-plan-normal-run.md` (asserts mutation + `success`) and `archive-plan-dry-run.md` (asserts byte-identical plan.md + `partial`). See Task 7 file list.
  - **Manual fallback:** A complete `git + editor + gh` runbook (no adapter required):
    - `git checkout -b chore/archive-plan-$(date +%Y%m%d)` — branch off master so the plan.md edit is reviewable.
    - `$EDITOR docs/plan.md` — identify rows in `## Recently Shipped` older than the most recent 3; for each, verify the linked `docs/waves/wave<N>-<slug>.md` file exists by running `ls docs/waves/wave<N>-*.md` in another shell; delete the row. Save.
    - `$EDITOR .harness-state/archive-plan-$(date -u +%Y%m%dT%H%M%SZ).yml` — hand-author a §4.2 receipt YAML using `.harness-state/examples/wave1/run-wave-1-success.yml` as the template; populate `command: archive-plan`, `inputs: [docs/plan.md, <each archived docs/waves/wave<N>-<slug>.md>]`, `outputs: [docs/plan.md]`, `verification.commands: [git diff --stat docs/plan.md]`, `status: success`. Alternative (still manual): `bash skills/_shared/lib/emit-receipt.sh terminal --command archive-plan --status success ...` per the helper's CLI contract — both paths are first-class.
    - `bash .harness-state/examples/wave2/recompute-wave2-keys.sh` — recompute `idempotency_key.value` and paste into the receipt's `idempotency_key.value` field.
    - `git add docs/plan.md .harness-state/archive-plan-*.yml` — stage explicitly (no `git add -A`).
    - `git commit -m "chore(plan): archive shipped waves <N>..<M>"` — single commit per `/archive-plan` invocation.
    - `git push -u origin chore/archive-plan-<date>` — push the branch.
    - `gh pr create --draft --title "chore(plan): archive shipped waves <N>..<M>" --body "Manual /archive-plan run. Receipt: .harness-state/archive-plan-<ts>.yml"` — draft PR for visibility.
    - `gh pr view --web` — confirm the PR rendered. **Dry-run variant:** skip the `git commit`/`git push`/`gh pr create` steps; instead run `git diff docs/plan.md` to capture the would-be diff, then `git restore docs/plan.md` to revert; hand-author a `status: partial` receipt only, then optionally `gh pr view <existing-pr>` to verify the registry/board state if a related PR exists. The dry-run leaves no commit, no PR, no plan.md mutation.

- [ ] **Task 5:** Author `skills/harness-status/SKILL.md` and any helper script. Sources `skills/_shared/lib/emit-receipt.sh`. Read-only across registered repos. Tolerates pre-conversion repos. Wires the §5.4 Stage A no-op exemption (read `stage_a_exempt: true` from prior receipt's `idempotency_key.trace`; if present, skip prior-success short-circuit and rescan unconditionally) and updates `docs/protocol/receipt-schema.md` with the schema extension.
  - **Files:** `skills/harness-status/SKILL.md`, `skills/harness-status/lib/scan.sh` (or analogous), `docs/protocol/receipt-schema.md` (one-paragraph append documenting the optional `idempotency_key.trace.stage_a_exempt: true` field for read-only freshness-probe commands, citing `/harness-status` as the canonical example).
  - **Depends on:** Task 4 (registry schema docs + example fixture must exist).
  - **Verify:** Sample run with `HARNESS_REGISTRY_PATH=skills/harness-status/lib/test-fixtures/example-projects.yml` pointed at a 3-project fixture (1 v2 repo + 1 pre-conversion repo + 1 missing-on-disk repo) produces `.harness-state/harness-status-<ts>.md` and `.json` and `.yml` in the invoking repo only. Pre-conversion repo block contains `(pre-v2 plan format; skipped)`. Missing repo block contains `(repo path missing on disk: <path>)`. Read-only assertion fixture: `git rev-parse HEAD` on each scanned repo is byte-identical before and after. **Stage A exemption fixture (load-bearing):** two consecutive `/harness-status` runs with frozen git state and unchanged inputs produce DIFFERENT `idempotency_key.value` byte-for-byte (NOT identical — `/harness-status` is exempt from prior-success no-op reuse per §5.4); both receipts carry `idempotency_key.trace.stage_a_exempt: true`; AND a follow-up run with a git-state-only change (e.g., a fresh uncommitted file in one scanned repo) reflects that change in its summary file rather than short-circuiting.
  - **Manual fallback:** Complete `git + editor + gh` runbook (the skill itself is read-only across scanned repos; the build of the skill follows the standard branch+PR flow):
    - `git checkout -b feat/harness-status-skill` — branch off master.
    - `$EDITOR skills/harness-status/SKILL.md` — author the skill body (registry-load, per-repo `git status --porcelain` + `git worktree list --porcelain` walk, plan.md best-effort parse, output formatter, §4.2 receipt emission via `bash skills/_shared/lib/emit-receipt.sh`). Save.
    - `mkdir -p skills/harness-status/lib && $EDITOR skills/harness-status/lib/scan.sh` — author the helper script. Save and `chmod +x` it.
    - **To execute the read-only scan manually (no skill required):** `cat $(echo ${HARNESS_REGISTRY_PATH:-~/.config/harness/projects.yml})` to enumerate registered repos; for each, `cd "$path" && git status --porcelain && git worktree list --porcelain && cat docs/plan.md` (read-only by construction — no `git add`, no `git commit`, no `git stash`). Compose the Markdown summary by hand at `.harness-state/harness-status-<ts>.md` with one section per repo. Hand-author the §4.2 receipt YAML at `.harness-state/harness-status-<ts>.yml` (template: `.harness-state/examples/wave1/run-wave-1-success.yml`), or invoke `bash skills/_shared/lib/emit-receipt.sh terminal --command harness-status --status success ...`. Recompute `idempotency_key.value` via `bash .harness-state/examples/wave2/recompute-wave2-keys.sh`.
    - `git add skills/harness-status/SKILL.md skills/harness-status/lib/scan.sh` — stage explicitly (do NOT stage `.harness-state/harness-status-*` files; those are runtime artifacts, kept by `.gitignore` exception rules).
    - `git commit -m "feat(harness-status): read-only cross-repo scan with §4.2 receipt"`.
    - `git push -u origin feat/harness-status-skill`.
    - `gh pr create --draft --title "feat(harness-status): read-only cross-repo scan" --body "Wave 10 Task 5. Read-only across scanned repos; writes only invoking-repo .harness-state/."`.
    - `gh pr view --web` — confirm. **Note: no `gh` step is required for the runtime scan itself** — `/harness-status` is a read-only command with no PR surface; the `gh` step here is for shipping the skill source code, not for invoking the skill.

### Phase 4: WORKFLOW.md update (Layer 2 — depends on Layer 1)

- [ ] **Task 6:** Add `Archive plan` and `Cross-repo status` rows to `WORKFLOW.md`. Each row's Manual / Claude / Codex / Automation columns follow the v2 §4 matrix shape, citing the new skills and their receipt paths.
  - **Files:** `WORKFLOW.md`
  - **Depends on:** Tasks 3 and 5 (must know the actual receipt-path conventions).
  - **Verify:**
    - `grep -F '/archive-plan' WORKFLOW.md` exits 0.
    - `grep -F '/harness-status' WORKFLOW.md` exits 0.
    - `grep -F '.harness-state/archive-plan-' WORKFLOW.md` exits 0.
    - `grep -F '.harness-state/harness-status-' WORKFLOW.md` exits 0.
    - `grep -c '^| .* | .* | .* | .* | .* |$' WORKFLOW.md` returns ≥ 9 (1 header + 8 command rows).
    - No row renamed or removed; row count delta is exactly +2.
  - **Manual fallback:** Complete `git + editor + gh` runbook:
    - `git checkout -b chore/workflow-md-rows` — branch off master.
    - `$EDITOR WORKFLOW.md` — locate the existing `Archive plan` and `Cross-repo status` placeholder rows (carried forward from v2 §4 matrix); update the Manual column to cite the manual-fallback sequence from this spec (edit plan.md + hand-author receipt for `/archive-plan`; `cat registry` + per-repo `git status --porcelain` for `/harness-status`); update the Claude column to cite the actual receipt path (`.harness-state/archive-plan-<ts>.yml` and `.harness-state/harness-status-<ts>.{md,json,yml}`). Save.
    - `grep -F '/archive-plan' WORKFLOW.md && grep -F '/harness-status' WORKFLOW.md` — verify both rows present.
    - `git add WORKFLOW.md` — stage explicitly.
    - `git commit -m "docs(workflow): add /archive-plan and /harness-status rows"`.
    - `git push -u origin chore/workflow-md-rows`.
    - `gh pr create --draft --title "docs(workflow): add /archive-plan and /harness-status rows" --body "Wave 10 Task 6. Adds two rows; no row renamed or removed."`.
    - `gh pr view --web` — confirm. (No receipt; doc edit task.)

### Phase 5: Fixtures (Layer 3 — depends on Layer 2)

- [ ] **Task 7:** Author all fixtures and wire them into `run-fixtures.sh`. Produce paired manual + claude-code receipt examples for `/archive-plan` to exercise cross-adapter `idempotency_key` equality (mirrors the Wave 9 pattern for `/close-wave`).
  - **Files:**
    - `skills/planning-loop/lib/test-fixtures/archive-plan-normal-run.md` — asserts mutation occurred + `status: success` (paired with `archive-plan-dry-run.md` to enforce F2 split contract)
    - `skills/planning-loop/lib/test-fixtures/archive-plan-dry-run.md` — asserts plan.md is byte-identical pre/post + `status: partial` + diff printed to stdout (paired with `archive-plan-normal-run.md`)
    - `skills/planning-loop/lib/test-fixtures/archive-plan-idempotency.md`
    - `skills/planning-loop/lib/test-fixtures/archive-plan-missing-wave-file.md`
    - `skills/planning-loop/lib/test-fixtures/archive-plan-atomic-rename.md`
    - `skills/planning-loop/lib/test-fixtures/harness-status-readonly-invariant.md`
    - `skills/planning-loop/lib/test-fixtures/harness-status-pre-conversion-repo.md`
    - `skills/planning-loop/lib/test-fixtures/harness-status-missing-repo.md`
    - `skills/planning-loop/lib/test-fixtures/harness-status-empty-registry.md`
    - `skills/planning-loop/lib/test-fixtures/harness-status-malformed-registry.md`
    - `skills/planning-loop/lib/test-fixtures/harness-status-disallowed-field.md`
    - `skills/planning-loop/lib/test-fixtures/harness-status-stage-a-exempt.md` — asserts two consecutive `/harness-status` runs with unchanged receipt-input file contents (and unchanged git state) produce DIFFERENT `idempotency_key.value` byte-for-byte; AND asserts that a git-state-only change between runs (branch switch / worktree add / uncommitted edit on a scanned repo) is reflected in the second run's summary, proving the exemption avoids stale-snapshot no-ops. Replaces the prior `harness-status-idempotency.md` content-stable-equality fixture, which would have asserted the wrong invariant.
    - `.harness-state/examples/wave2/archive-plan-success.yml` — normal-run claude-code receipt; mutation occurred
    - `.harness-state/examples/wave2/archive-plan-aborted.yml` — missing-wave-file abort
    - `.harness-state/examples/wave2/archive-plan-partial-dry-run.yml` — dry-run; no mutation; `status: partial`
    - `.harness-state/examples/wave2/manual-archive-plan-success.yml` (paired with `archive-plan-success.yml` for cross-adapter `idempotency_key` equality)
    - `.harness-state/examples/wave2/harness-status-success.yml`
    - `.harness-state/examples/wave2/harness-status-partial.yml`
    - `.harness-state/examples/wave2/harness-status-failed-malformed-registry.yml`
    - `.harness-state/examples/wave2/manual-harness-status-success.yml` — paired manual receipt cited in the WORKFLOW.md row delta
    - `.harness-state/examples/wave2/recompute-wave2-keys.sh`
    - `skills/planning-loop/lib/test-fixtures/run-fixtures.sh` (extend to invoke new fixtures)
  - **Depends on:** Tasks 1-6 (all behaviors must exist before fixtures can exercise them).
  - **Verify:** `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` exits 0 with all new fixtures passing alongside the existing 44 (this wave adds 12 new fixtures; total = 44 + 12 = 56). Receipt example pair under `.harness-state/examples/wave2/` validates with `bash .harness-state/examples/wave2/recompute-wave2-keys.sh` exiting 0; the manual + claude-code `archive-plan-success` pair share an identical `idempotency_key.value` byte-for-byte. Note: `skills/planning-loop/lib/test-fixtures/` is the multi-skill fixture home (established Wave 9 with `_shared/lib/emit-receipt.sh` fixtures); Wave 10 adds `archive-plan-*` and `harness-status-*` prefixes alongside the existing planning-loop fixtures.
  - **Manual fallback:** Complete `git + editor + gh` runbook:
    - `git checkout -b test/wave2-fixtures` — branch off master.
    - `$EDITOR skills/planning-loop/lib/test-fixtures/archive-plan-normal-run.md` (and each fixture in the Files list) — hand-author each fixture using existing Wave 1 fixtures (e.g., `idempotency.md`, `crash-recovery.md`) as templates. Save each.
    - `mkdir -p .harness-state/examples/wave2 && $EDITOR .harness-state/examples/wave2/archive-plan-success.yml` (and each receipt in the Files list) — hand-author each YAML receipt using `.harness-state/examples/wave1/manual-close-wave-1-success.yml` and `.harness-state/examples/wave1/run-wave-1-success.yml` as templates. Save each.
    - `cp .harness-state/examples/wave1/recompute-wave1-keys.sh .harness-state/examples/wave2/recompute-wave2-keys.sh && $EDITOR .harness-state/examples/wave2/recompute-wave2-keys.sh` — adapt the recompute script for Wave 2 receipt paths and command names. Save and `chmod +x` it.
    - `bash .harness-state/examples/wave2/recompute-wave2-keys.sh` — verify the manual + claude-code `archive-plan-success` pair share an identical `idempotency_key.value`. Iterate on the YAML if not.
    - `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` — verify the new fixtures pass alongside the existing 44+; iterate on fixtures if any fail.
    - `git add skills/planning-loop/lib/test-fixtures/archive-plan-*.md skills/planning-loop/lib/test-fixtures/harness-status-*.md skills/planning-loop/lib/test-fixtures/run-fixtures.sh .harness-state/examples/wave2/` — stage explicitly.
    - `git commit -m "test(wave10): mechanize fixtures + cross-adapter receipt pair"`.
    - `git push -u origin test/wave2-fixtures`.
    - `gh pr create --draft --title "test(wave10): wave 2 fixtures + cross-adapter receipt pair" --body "Wave 10 Task 7. Mechanizes /archive-plan and /harness-status fixtures; cross-adapter idempotency_key equality verified by recompute-wave2-keys.sh."`.
    - `gh pr view --web` — confirm. (No runtime receipt; this task ships fixture files, not a skill invocation.)

### WORKFLOW.md row delta

This spec adds two user-facing commands. Per the spec-planner contract (Wave 1), the WORKFLOW.md row delta is mandatory. Both rows already appear in the WORKFLOW.md matrix in placeholder form (carried forward from the v2 spec § 4 matrix). Task 6 updates them with concrete receipt paths and manual fallbacks.

| Protocol command | Manual | Claude Code | Codex prompt contract | Automation |
|---|---|---|---|---|
| /archive-plan | edit `docs/plan.md` to remove rows from `## Recently Shipped` whose linked `docs/waves/wave<N>-<slug>.md` files exist; hand-author `.harness-state/archive-plan-<ts>.yml` per `.harness-state/examples/wave2/manual-archive-plan-success.yml`; recompute `idempotency_key` via `.harness-state/examples/wave2/recompute-wave2-keys.sh` | `/archive-plan` — emits `.harness-state/archive-plan-<ts>.yml` via `skills/_shared/lib/emit-receipt.sh` (§3.0a reserve-then-mutate); idempotent on unchanged plan.md | `codex archive-plan` prompt: read `docs/plan.md` and `docs/waves/`, identify rows older than `keep_last`, remove them via temp+rename, emit receipt | none |
| /harness-status | enumerate `~/.config/harness/projects.yml` by hand; `cd <path> && git status --porcelain && git worktree list --porcelain` per repo; compose Markdown summary at `.harness-state/harness-status-<ts>.md`; hand-author `.harness-state/harness-status-<ts>.yml` per `.harness-state/examples/wave2/manual-harness-status-success.yml`; recompute `idempotency_key` | `/harness-status` — read-only cross-repo scan; emits `.harness-state/harness-status-<ts>.{md,json,yml}` in invoking repo only via `skills/_shared/lib/emit-receipt.sh` | `codex harness-status` prompt: read registry, run read-only `git status` / `git worktree list` per repo, write summary under `.harness-state/`, emit receipt under `.harness-state/` | optional dashboard |

## Constraints

- **Existing skill names and core semantics remain stable.** No renames; no removed flags; this wave only adds the two new skills and refines `/close-wave` Step 8 to write to `docs/waves/`.
- **Per-command WORKFLOW.md matrix is the single source of truth.** Per `feedback_command_vs_wave_scope`, the matrix is per-command; this spec does not duplicate WORKFLOW.md rows per wave.
- **Bash 3.2 compatibility (macOS default shell).** Per `reference_bash_compat_patterns`: no associative arrays; SHA-256 via `sha256sum` if available else `shasum -a 256` (inherited from `emit-receipt.sh`). New skill helpers MUST source `skills/_shared/lib/emit-receipt.sh` rather than re-implement the lifecycle.
- **Registry is path-only.** v2 §5 disallow list is enforced by the parser. New fields are a spec change, not a one-off addition.
- **`/harness-status` is read-only across registered repos.** No exceptions. The receipt is the only writable artifact, and only in the invoking repo.
- **`/archive-plan` is mutating-but-idempotent.** The §3.0a reserve-then-mutate lifecycle applies; preflight aborts before mutation if `.harness-state/` is unwritable; atomic temp+rename for `docs/plan.md` updates.
- **Idempotency_key shape preserved.** `{value, trace}` mapping form, matching Wave 8/9 receipts. v2 Open Q #9 is still deferred to Wave 5. **Single documented schema extension this wave:** `idempotency_key.trace.stage_a_exempt: true` (optional boolean) marks read-only freshness-probe commands as exempt from §3.0a Stage A prior-success no-op reuse. `/harness-status` is the canonical (and currently sole) consumer; mutating commands like `/archive-plan` continue to use Stage A unchanged. Schema documented in `docs/protocol/receipt-schema.md` as a Task 5 deliverable.
- **No tracker fields, no PR fields, no protected-paths fields anywhere.** Wave 3 (PR visibility) and Wave 4 (tracker pilot) own those — Wave 2 stays in its lane.
- **Receipt audit-trail invariant carries over.** Both new skills use the same EXIT-trap discipline as Wave 1's commands; no skill in this wave may complete a side effect without an on-disk receipt or `.recovery-needed` marker.
- **Migration is one-shot, not dual-supported.** The eight existing `docs/<date>-claude-harness-wave<N>-summary.md` files are migrated to `docs/waves/wave<N>-<slug>.md` as part of this wave; no symlink, no dual-write, no transitional period. Anything reading those paths must be updated in the same commit.

## Out of Scope

Explicitly NOT in this wave (per v2 protocol §8 and the user's input):

- Auto-registration during `setup-harness` or `/project-init` — parked as Open Question.
- A `/archive-plan` daemon, hook, or cron that runs automatically — v2 §6 explicitly forbids this.
- Tracker integration for `/harness-status` (Linear, GitHub Issues, etc.) — Wave 4 of v2 protocol.
- Draft PR visibility integration in `/harness-status` summary — Wave 3 of v2 protocol.
- Any change to the `/spec-planner` plan.md auto-append behavior — that landed in Wave 1.
- A per-repo "scan exclusion" list inside the registry — registry stays path-only; if a repo shouldn't be scanned, remove it from the registry.
- A `/harness-status --watch` mode for live dashboards — read-only one-shot scan only.
- `/archive-plan` authoring or modifying wave summary files — that's `/close-wave`'s job.
- Codex command specs for `/archive-plan` and `/harness-status` — Wave 5 of v2 protocol decides the Codex pilot scope.

## Open Questions

| # | Question | Impact | Decision needed by |
|---|----------|--------|-------------------|
| 1 | Should `/archive-plan`'s `keep_last` default of 3 be configurable via `.harness-profile.archive_plan.keep_last`? Default-of-3 is opinionated; some users may want more visible history on the active board. | Affects how often users invoke `/archive-plan` and how short the `## Recently Shipped` section stays. Non-blocking — default behavior is sane regardless. | Wave 10 close-wave OR first user complaint, whichever comes first |
| 2 | Should `setup-harness` or `/project-init` auto-append the new repo to `~/.config/harness/projects.yml` when run, or stay manual? | Convenience vs. one-source-of-truth. Auto-append is friendlier; manual is harder to misconfigure. Non-blocking. | Wave 11 or later when a second repo onboards under the v2 protocol |
| 3 | Should `/harness-status` accept a `--json` flag to suppress the Markdown file (only emit JSON), and a `--md` flag to suppress JSON? Default ships both. | Cosmetic / output-volume. Non-blocking — both files are tiny. | If/when a downstream tool consumes one and not the other |
| 4 | Should `docs/waves/` files use a `closed_at: YYYY-MM-DDTHH:MM:SSZ` ISO-8601 timestamp instead of just `YYYY-MM-DD`? Hour-granularity is technically more useful for recovery semantics ordering. | Affects recovery semantics if two waves close on the same day. Currently low-risk because waves take days, not hours. | Defer until two waves actually close on the same day |
| 5 | Should `/archive-plan` ALSO compact `## Blocked` rows (move stale blockers older than N days into `docs/waves/blocked/`)? Out of scope for this wave but worth tracking. | Blocked entries grow unbounded otherwise. | Future spec, after observing real-world growth |
| 6 | Closure asymmetry: Wave 9's `/close-wave` for *this* wave will be the first end-to-end run where the `docs/waves/wave10-*.md` summary uses the new path AND emit-receipt.sh is wiring on master. The Wave 9 closure receipt was hand-written because the helper landed in the same wave. Wave 10 should be the first fully mechanized close-wave (helper used, summary at the new path). Surface this in the Wave 10 close-wave receipt. | Verification — proves the new convention works end-to-end on its own deliverables. Non-blocking. | Wave 10 close-wave |
| 7 | Codex round 1 F3 (registry-as-machine-state) was partial wrong-premise: the v2 protocol explicitly chose per-user machine state for the registry (v2 Open Q #3 resolved this spec). Load-bearing portion (CI reproducibility) was addressed by re-scoping Task 4 to repo artifacts only (schema doc + example fixture) and adding `HARNESS_REGISTRY_PATH` env-var override for fixtures. The per-user `~/.config/harness/projects.yml` is a manual bootstrap, not a wave gate. This OQ exists to record that the scope decision (per-user registry) stands and is NOT being walked back. | Documents the design intent against future drift. Non-blocking. | N/A (decision recorded) |

## Verification

End-to-end exit-gate check (mirrors v2 §8 Wave 2 verbatim where stated, plus per-task gates above):

- [ ] `claude-harness/docs/plan.md` has exactly the four sections `## Now`, `## Next`, `## Blocked`, `## Recently Shipped` (Phase 1).
- [ ] All eight pre-existing wave summaries are preserved in `docs/waves/wave<N>-<slug>.md` with frontmatter (Phase 2).
- [ ] `/archive-plan` is idempotent and emits a §4.2-valid receipt with the canonical `idempotency_key` (Phase 3).
- [ ] Registry schema is documented in `skills/harness-status/SKILL.md` and the example fixture at `skills/harness-status/lib/test-fixtures/example-projects.yml` contains only `id`, `path`, optional `group` (Phase 4). The wave gate is reproducible from repo artifacts alone — `~/.config/harness/projects.yml` is NOT checked.
- [ ] `/harness-status` never writes outside `.harness-state/` in any repo it scans — verified by Task 7's `harness-status-readonly-invariant.md` fixture (Phase 5).
- [ ] `/harness-status` emits a §4.2-conforming receipt at `.harness-state/harness-status-<timestamp>.yml` with `status=success` and `verification.commands` listing the read-only git commands run; `outputs` lists the summary path under `.harness-state/` (Phase 5).
- [ ] **Stage A no-op exemption is wired correctly (Phase 5):** every `/harness-status` receipt sets `idempotency_key.trace.stage_a_exempt: true`; two consecutive runs with no input/git changes produce DIFFERENT `idempotency_key.value` strings (the inverse of every other command's idempotency assertion); a git-state-only change between runs is reflected in the second summary rather than being short-circuited. Verified by `harness-status-stage-a-exempt.md` fixture in Task 7. `docs/protocol/receipt-schema.md` documents `stage_a_exempt` as the canonical opt-out for read-only freshness-probe commands.
- [ ] `/harness-status` reports pre-conversion repos without failing the whole scan (Phase 5).
- [ ] `/harness-status` matches manual `git status` ground truth for registered repos — verified by Task 7 fixture comparing scan output against `git status --porcelain` run by hand (Phase 5).
- [ ] `WORKFLOW.md` has rows for `/archive-plan` and `/harness-status`; row count is now ≥ 9 (Phase 6).
- [ ] `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` exits 0 with all Wave 2 fixtures passing alongside the existing 44+ from prior waves (Phase 7 — Task 7).
- [ ] Cross-adapter `idempotency_key` equality holds for the `/archive-plan` manual+claude-code success receipt pair (`.harness-state/examples/wave2/manual-archive-plan-success.yml` and `.harness-state/examples/wave2/archive-plan-success.yml` share the same `idempotency_key.value` byte-for-byte) — verified by `bash .harness-state/examples/wave2/recompute-wave2-keys.sh` exit 0.
- [ ] Closure-asymmetry resolution: the Wave 10 `/close-wave` receipt is generated by `skills/_shared/lib/emit-receipt.sh` end-to-end (NOT hand-written like Wave 9's was), and the wave summary lands at `docs/waves/wave10-plan-registry-maintenance.md` (NOT at `docs/<date>-claude-harness-wave10-summary.md`). Recorded in the Wave 10 close-wave receipt's `notes` field.
- [ ] **Manual-fallback completeness gate (per Codex round 1 F1):** Every implementation task's `**Manual fallback:**` block contains explicit references to `git`, `editor` (or `$EDITOR`), and `gh` commands (or an explicit `no gh — read-only / doc edit / no PR surface` annotation where a `gh` invocation does not fit the task shape). Verifiable via the following per-task grep — tasks are walked in **document order** (1 → 2 → 4 → 3 → 5 → 6 → 7), with each task's body bounded by an explicit next-marker pattern (next-task-in-document-order or next phase heading), because numeric ordering does not match document ordering (Phase 2 contains Task 4 before Phase 3 contains Tasks 3 and 5):
  ```sh
  for task in 1 2 4 3 5 6 7; do
    case "$task" in
      1) to_pat='\*\*Task 2:\*\*' ;;        # Task 1 -> Task 2 (same phase)
      2) to_pat='^### Phase 2:' ;;           # Task 2 -> next phase heading
      4) to_pat='^### Phase 3:' ;;           # Task 4 -> next phase heading
      3) to_pat='\*\*Task 5:\*\*' ;;        # Task 3 -> Task 5 (same phase, document order)
      5) to_pat='^### Phase 4:' ;;           # Task 5 -> next phase heading
      6) to_pat='^### Phase 5:' ;;           # Task 6 -> next phase heading
      7) to_pat='^## ' ;;                    # Task 7 -> next H2 (Constraints)
    esac
    block=$(awk "/\*\*Task $task:\*\*/,/$to_pat/" docs/specs/2026-05-02-plan-registry-maintenance.md)
    echo "Task $task: git=$(echo "$block" | grep -c -E '\bgit (checkout|add|commit|push|mv|status|diff|rev-parse|log)\b'), editor=$(echo "$block" | grep -c -E '\$EDITOR|editor'), gh=$(echo "$block" | grep -c -E '\bgh (pr|view|repo|api)\b|no gh')"
  done
  ```
  Each line MUST report `git≥1`, `editor≥1`, `gh≥1`. Tasks 1, 2, 6 are doc-edit tasks that still ship a `gh pr create --draft` for review visibility (mandatory per v2 §"Manual is primary"). Tasks 3 and 5 ship the skill source code via `gh pr create --draft` AND, for runtime invocations, hand-author receipts under `.harness-state/`. Tasks 4 and 7 ship repo artifacts via `gh pr create --draft`. The case-statement is bash-3.2 compatible (no associative arrays per `reference_bash_compat_patterns`).

## Risks

| Risk | Mitigation |
|---|---|
| Migrating eight wave summaries breaks links from old specs / KB notes | `git mv` preserves history; grep the codebase + KB for `docs/<date>-claude-harness-wave` references before merging and update them in the same commit (verifiable by `grep -r 'docs/2026-.*-claude-harness-wave' .` returning only the migration-itself sites) |
| Pre-conversion repos confuse `/harness-status` and produce noisy summaries | Best-effort plan.md parsing; explicit `(pre-v2 plan format; skipped)` flag per repo; non-zero exit only on registry-level failures, not per-repo issues |
| Registry parser silently accepts disallowed fields (drift toward second `.harness-profile`) | Parser refuses unknown top-level fields with a clear error citing v2 §5; failure is visible, not silent |
| `/archive-plan` accidentally removes a row whose `docs/waves/` file doesn't exist (broken link) | Pre-flight check requires the linked wave file to exist before any plan.md mutation; aborts with `aborted-on-ambiguity` if missing |
| `/harness-status` writes outside `.harness-state/` (read-only contract violation) | Task 7 fixture asserts `git status --porcelain` and `git rev-parse HEAD` byte-equality before/after on each scanned repo; CI-style fail if violated |
| `~/.config/harness/projects.yml` is per-machine; users on multiple machines must edit each | Acknowledged trade-off; alternative would be a checked-in repo file (worse, because paths are per-machine). Future spec may add a sync helper |
| `/archive-plan` race condition (two invocations simultaneously) | Inherited from emit-receipt.sh exclusive-create reservation lock + 60-min orphan rule; same protections as `/run-wave` and `/close-wave` |
| Wave-summary frontmatter format diverges from `/close-wave` going forward | Step 8 of close-wave (existing skill) is updated in this wave (Task 2) to write to `docs/waves/wave<N>-<slug>.md` with the same frontmatter shape used by Task 2's migrated summaries; the migration commit verifies frontmatter consistency across all eight pre-existing summaries via the `head -1 ... grep '^---$'` check |
| Changing `/close-wave` Step 8's summary path breaks consumers reading `docs/<date>-…` | All known consumers are updated in the same commit (run-wave's input list, AGENTS.md's pointer, this spec's references); future consumers will see the new path only |
| `/harness-status` slow on large registries | Out of scope for Wave 2 — registry is currently expected to hold 3-5 entries. If it grows past 20+, parallel `git status` is a Wave 11+ optimization |

## plan.md Wave 10 auto-append (text ready for spec-planner to write)

This block is appended to `docs/plan.md` `## Now` section by `/spec-planner` per the Wave 1 auto-append behavior. The block:

```markdown
### Wave 10 - Plan maintenance, docs/waves/ archive, registry, and /harness-status (v2 Wave 2)
- spec: docs/specs/2026-05-02-plan-registry-maintenance.md
- status: ready
- exit gate: docs/plan.md is a four-section active board; eight wave summaries migrated to docs/waves/; /archive-plan idempotent + §4.2-receipt; ~/.config/harness/projects.yml is path-only; /harness-status read-only with §4.2-receipt and pre-conversion-repo tolerance; WORKFLOW.md +2 rows; fixtures green
```

After Task 1 lands, `## Now` will contain this Wave 10 block; `## Recently Shipped` will contain the migrated `[x]` entries for Waves 1-9.

---

**Spec shape: wave; plan.md: auto-appended Wave 10; Manual fallback bullets: 7/7; WORKFLOW.md row delta: yes**
