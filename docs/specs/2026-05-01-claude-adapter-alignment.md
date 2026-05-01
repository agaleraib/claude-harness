# Claude Adapter Alignment — Wave 1 of v2 universal harness protocol

## Overview

This spec drives Wave 1 of `docs/specs/2026-04-30-universal-harness-protocol-v2.md`: bring the five Claude Code commands that participate in the wave-and-commit loop — `/spec-planner`, `/planning-loop`, `/run-wave`, `/close-wave`, `/commit` — into conformance with the protocol-first doctrine. Audience is the solo developer of `claude-harness` (the meta-tooling repo); the adapter changes flow downstream into every consumer repo through the existing symlink/copy install paths.

Six things change behaviorally:

1. `/spec-planner` replaces its old 3-rule wave-vs-micro decision tree with a single principle ("waves are commit batches with ALL-or-NOTHING merge semantics") plus a 5-signal checklist and a shape-consequence table. Wave-shaped specs auto-append a `### Wave N` block to `docs/plan.md`; micro-shaped and trivial specs leave plan.md untouched. This closes `project_plan_md_update_gap` and obsoletes `feedback_run_wave_commit_plan_entry`.
2. `/spec-planner` adds two mandatory rules to spec generation: every implementation task carries a `**Manual fallback:**` sub-bullet; any spec adding a user-facing command must include a `WORKFLOW.md` row delta.
3. `/planning-loop` enforces those two rules at review time (Codex portability criterion, preflight reject for missing WORKFLOW.md row delta) but architecturally MUST NOT touch `docs/plan.md` — spec-planner owns that artifact end-to-end.
4. `/run-wave`, `/close-wave`, and `/commit` each emit a §4.2-conforming YAML receipt under `.harness-state/` using the canonical SHA-256 `idempotency_key` algorithm and the new `operation_id` field, matching the Wave 8 example pair shape. Receipt emission follows a **reserve-then-mutate** discipline: a `started` receipt is written before any side effect, then atomically updated to `success` / `partial` / `failed` / `aborted-on-ambiguity` at exit (including via bash `trap` on abnormal termination).
5. The `WORKFLOW.md` command matrix is updated for the three Wave-1-touched commands (`/run-wave`, `/close-wave`, `/commit`) so each row cites its `.harness-state/` receipt path and the manual fallback sequence per upstream v2 §8 Wave 1.
6. Fixture coverage (positive/negative/idempotency/crash-recovery) lands under `skills/planning-loop/lib/test-fixtures/` and `.harness-state/examples/wave1/`.

Existing skill names and core semantics are stable. All edits are in-place behavior additions.

## Implementation

**Recommended flow:** `/run-wave 1 → /close-wave 1` (single wave, but ALL-or-NOTHING merge semantics — partial completion of receipts/fixtures across the 6 deliverables would be worse than no change since the protocol-conformance claim depends on the full set landing together). Dependency layers within the wave:
- Layer 0 (parallel): Tasks 1, 4, 5, 6, 7 (skill-text edits + planning-loop enforcement edits + shared receipt helper).
- Layer 1 (depends on Layer 0): Tasks 2, 3 (depend on Task 1); Tasks 8, 9, 10 (depend on Task 7).
- Layer 2 (depends on Layer 1): Task 11 (WORKFLOW.md row updates depend on Tasks 8-10 to know the receipt-path conventions).
- Layer 3 (depends on Layer 2): Task 12 (fixtures depend on all behaviors landing).
**Reason:** 12 tasks, 5-way parallelism in Layer 0 and 3-way parallelism in Layer 1, stakes:high (this is meta-tooling — wrong receipts ship to every consumer repo). Wave ceremony earns the rollback insurance.
**Alternatives:** Sequential `/micro` per task with `/commit` between would work, but loses the Layer-0 and Layer-1 parallelism and removes the all-or-nothing merge guard.
**Implementation block written:** 2026-05-01 (revised after Codex round 1; +Task 7 helper, +Task 11 WORKFLOW.md, +12-task layout)

## Prior Work

Builds on:
- [Universal Harness Protocol v2](2026-04-30-universal-harness-protocol-v2.md) — §8 Wave 1 is this spec's bounded scope; §4.2 is the receipt schema (already materialized at `docs/protocol/receipt-schema.md`); §4.1 is the Codex prompt contract (materialized at `docs/protocol/codex-prompt-contract.md`).
- [Planning-loop trim remediation](2026-04-28-planning-loop-trim-remediation.md) — current `skills/planning-loop/SKILL.md` shape; this spec extends, does not rewrite.
- [Planning-loop auto-apply arbiter](2026-04-27-planning-loop-auto-apply-arbiter.md) — auto-apply preflight phases; this spec adds Phase 1a.

Assumes (inherits from v2 protocol spec, not redefined here):
- §4.2 receipt schema and canonical `idempotency_key` algorithm at `docs/protocol/receipt-schema.md`.
- §4.1 Codex prompt contract at `docs/protocol/codex-prompt-contract.md`.
- Wave 0 shipped `AGENTS.md`, `WORKFLOW.md`, the Wave 8 example receipt pair (`manual-close-wave-6.yml`, `claude-close-wave-6.yml`), and `recompute-keys.sh`.
- AGENTS.md vs CLAUDE.md disposition is decided (Wave 8 default: AGENTS.md is tool-neutral primary; CLAUDE.md is Claude-specific addendum or pointer).

Changes / overrides:
- Resolves `project_plan_md_update_gap` — `/spec-planner` now writes plan.md entries for wave-shaped specs (was: never auto-updated, manual only).
- Obsoletes `feedback_run_wave_commit_plan_entry` — `/run-wave` no longer needs a hand-committed plan.md entry to function; spec-planner already wrote it before dispatch.

Open Q #9 of the v2 protocol spec (idempotency_key string vs mapping shape) is deferred to Wave 5; this spec preserves the existing `{value, trace}` mapping form used by the Wave 8 example receipts.

## Doctrine context (cross-cutting; non-normative summary)

The v2 protocol's three-line summary, restated for fast onboarding:

- **Manual is primary.** `git + editor + shell + repo docs` is the baseline execution path. Claude Code is the first adapter, not the protocol owner.
- **Completion = repo artifacts.** Chat history is not the durable record.
- **Portability test.** A new person or different LLM must answer the five §2.3 questions from repo files alone.

Every requirement in this spec serves one of those three. When a requirement seems to add friction, the friction is buying portability (`Manual fallback:` bullets are unreadable to no one; `WORKFLOW.md` row deltas keep the command matrix honest; receipts make the audit trail durable beyond a Claude session).

## Trust-boundary trade-off (PRE-EMPT)

Per `feedback_codex_walks_back_friction_reducers`, the `/spec-planner` plan.md auto-append is friction-removal **by design**. Codex (or any adversarial reviewer) is likely to flag this as "should require user confirmation before mutating `docs/plan.md`." That finding is **wrong-premise** for this spec, for these reasons:

1. The user already chose to run `/spec-planner` — that is the consent boundary.
2. The shape-consequence table makes the auto-append behavior *deterministic and visible in spec output* (the final summary line surfaces shape classification before any write).
3. Idempotency on existing Wave N entries means re-runs are safe.
4. Opt-out is wired in two ways:
   - `.harness-profile.spec_planner.auto_plan_append: false` (default `true`)
   - env var `SPEC_PLANNER_NO_AUTO_PLAN=1`
5. Confirmation prompts on the happy path are exactly the friction the v2 protocol's adapter discipline is removing — adapters should accelerate the manual path, not interrupt it.

If `/planning-loop` returns a Codex finding asking for a confirmation prompt, the planning-loop arbiter should classify it as `wrong-premise` and the spec-author override stands.

## Data Model

This spec has no persistent application-level state. The artifacts it manipulates are existing repo files and `.harness-state/` receipts. The receipt shape is normative in `docs/protocol/receipt-schema.md` §4.2 and is not redefined here.

For convenience, the receipt fields touched by Wave 1 commands:

| Field | Source / value for Wave 1 commands |
|---|---|
| `receipt_id` | `<command>-<wave-or-spec-id>-<ISO-8601-Z-timestamp>` (e.g. `run-wave-1-2026-05-02T1430Z`) |
| `command` | `run-wave` / `close-wave` / `commit` |
| `adapter` | `claude-code` |
| `wave_id` | numeric string for `run-wave` / `close-wave`; null for `commit` |
| `spec_path` | repo-relative spec path; required for spec-related commands |
| `inputs` | repo-relative paths read at start (spec, plan.md, modified files) |
| `outputs` | repo-relative paths written/modified |
| `verification.commands` / `.results` | exit-code-bearing list per §4.2 |
| `idempotency_key` | mapping `{value: <hex>, trace: {command, wave_id_or_spec_path, sorted_inputs, input_content_digest}}` (preserved from Wave 8 shape pending Open Q #9 resolution in Wave 5). The canonical algorithm at `docs/protocol/receipt-schema.md` §4.2 is the source of truth; this spec changes only the surface shape (mapping vs string), not the derivation. |
| `operation_id` | `sha256_hex("<command>\n<wave_id-or-spec_path-or-'-'>")` per the normative §4.2 schema. Used ONLY as the partial/aborted resume key; never as a success-path shortcut (see §3.0a lookup order). |
| `status` | `started` / `success` / `partial` / `failed` / `aborted-on-ambiguity` |
| `merge_sha` | required when `command=close-wave` and `status=success` |
| `retry_of` | optional; chains forward to prior `receipt_id` when resuming a `partial` or `aborted-on-ambiguity` operation per Stage B (schema-aligned). `failed` receipts are terminal and NEVER Stage-B-chained. |
| `notes` | free-text adapter notes |

Receipt path: `.harness-state/<command>-<operation-slug>-<timestamp>.yml`.

**Receipt lifecycle:** every command writes a `started` receipt before any mutating side effect, then atomically rewrites the same file with terminal `status` (success/partial/failed/aborted-on-ambiguity) at exit. A bash `trap EXIT` covers abnormal termination so the receipt always reaches a terminal state if the file existed at all. See §3.0a for the reserve-then-mutate algorithm + crash-recovery semantics, and §Phase 5 for the recovery-marker fallback when terminal-write itself fails.

## API Surface

Not applicable — no HTTP interfaces.

## Design Principles

`/spec-planner` and `/planning-loop` outputs are read by humans first, agents second. The shape and word choice of those outputs *is* the API surface for the adapter discipline.

- **Protocol-first phrasing.** Skill text refers to "the protocol" and "manual fallback," not to "Claude" as the actor. The skill is an accelerator, not the source of truth.
- **Make the shape decision visible.** `/spec-planner` always emits a final summary line classifying the spec as wave-shaped, micro-shaped, or trivial, and stating the consequence (plan.md auto-appended / left untouched). No silent decisions.
- **Single principle, then signals, then table.** Replacing 3 heuristic rules with the new structure costs more lines but earns reusability — the same shape decision applies whether the spec is being drafted, revised, or audited.
- **Idempotent over interactive.** Re-running `/spec-planner` on the same spec must not duplicate plan.md rows or receipts. Re-running `/run-wave` / `/close-wave` / `/commit` on the same logical operation must compute the same `idempotency_key` and no-op the side effects.
- **Failure-mode discipline is split by command class.** Spec-planner never blocks spec emission on plan.md issues (warning + suggested block to stdout). Wave-executor commands (`/run-wave`, `/close-wave`, `/commit`) DO block on receipt-path-unwritable preflight — the audit trail is load-bearing for protocol portability and cannot be silently skipped.

## Requirements

### Phase 1: Spec-planner shape doctrine (`/spec-planner`)

Edits target `.claude/agents/spec-planner.md`. All semantics are in-place additions.

#### 1.1 Replace wave-vs-micro decision tree

The current "Recommended Implementation" section's 3-rule decision tree (parallelism rank / total ≥6 + stakes:high / otherwise) is replaced with:

- **Single principle:** "Waves are commit batches with ALL-or-NOTHING merge semantics. A wave's value is that partial completion is worse than no change. Use a wave when that is true; use micro when it isn't."
- **5-signal checklist** (any TRUE => lean wave-shaped; multiple TRUE => commit to wave-shaped):
  1. Parallelism rank ≥2 in any dependency layer.
  2. Partial completion is materially worse than no change (i.e., shipping half the spec breaks invariants).
  3. The spec touches ≥3 files OR introduces a new directory tree.
  4. `stakes: high` in `.harness-profile` AND total tasks ≥3.
  5. Expected dispatch session > 30 minutes of orchestrator wall time.
- **Shape-consequence table:**
  | Shape | When | Plan.md consequence |
  |---|---|---|
  | Wave-shaped | ≥1 signal TRUE | Auto-append `### Wave N` block to `docs/plan.md` |
  | Micro-shaped | All signals FALSE, ≥2 implementation tasks | plan.md untouched; user runs `/micro` per task |
  | Trivial | All signals FALSE, ≤1 implementation task | plan.md untouched; user edits directly |

**Acceptance criteria (hard thresholds — all must pass):**
- [ ] `grep -F 'ALL-or-NOTHING' .claude/agents/spec-planner.md` exits 0.
- [ ] `grep -c '^[0-9]\. ' .claude/agents/spec-planner.md` returns ≥5 for the new signal-checklist block (counted within the new section only, verified by manual inspection that the 5 signals are listed).
- [ ] `grep -F 'Shape | When | Plan.md consequence' .claude/agents/spec-planner.md` exits 0.
- [ ] The old 3-rule decision tree text ("Any rank has ≥2 parallel tasks", "Total ≥6 tasks AND `stakes: high`", "Otherwise") no longer appears as the primary decision tree (verified by absence of the specific old phrasing OR by presence of a clear "REPLACES previous heuristic" note pointing at the new section).
- [ ] Edge case: a spec with all 5 signals FALSE and 1 task is classified `trivial` and emits the "plan.md untouched" summary line.

#### 1.2 Auto-append plan.md for wave-shaped specs

When `/spec-planner` classifies the spec as wave-shaped, it appends a `### Wave N` block to `docs/plan.md` where `N = max(existing wave numbers in plan.md) + 1`.

The block format must match the v2 protocol §6 plan.md target shape:

```markdown
### Wave N - <spec title>
- spec: docs/specs/YYYY-MM-DD-<topic>.md
- status: ready
- exit gate: <one line, sourced from spec's exit gate>
```

If the spec already has a Wave N entry pointing at the same `spec_path`, the operation is idempotent (no duplicate row). If plan.md is missing or malformed, fall back to printing the suggested block to stdout with a one-line warning; do not block spec emission.

**Acceptance criteria:**
- [ ] On a wave-shaped spec with no prior plan.md entry, `/spec-planner` writes a new `### Wave N` block whose `N` equals `max(existing wave numbers) + 1`.
- [ ] Idempotency: running `/spec-planner` twice on the same spec produces exactly one `### Wave N` block in plan.md (no duplicates).
- [ ] On a micro-shaped spec, plan.md byte-equality holds before and after the run.
- [ ] On a trivial spec, plan.md byte-equality holds before and after the run.
- [ ] Error case: plan.md missing → spec is still written; warning line printed to stdout containing `plan.md not found`; suggested block also printed to stdout; spec-planner exits 0.
- [ ] Error case: plan.md present but no `### Wave ` headings → fall back to `N=1`; warning printed; spec emission unblocked.
- [ ] Opt-out: `.harness-profile.spec_planner.auto_plan_append: false` skips the append; opt-out also wired via env var `SPEC_PLANNER_NO_AUTO_PLAN=1`; both paths still emit the shape classification summary line.

#### 1.3 Mandatory `Manual fallback:` sub-bullet per task

Every implementation task in the Implementation Plan section of every generated spec must include a `**Manual fallback:**` sub-bullet describing how a human with `git + editor + gh` can complete the task without any LLM tool.

**Acceptance criteria:**
- [ ] `/spec-planner` output for any sample input contains `**Manual fallback:**` once per implementation task (verified by `grep -c '**Manual fallback:**' <spec>` matching task count).
- [ ] The agent definition file contains a hard rule: "Every implementation task MUST include a `**Manual fallback:**` sub-bullet. Specs that omit this fail self-check."
- [ ] A self-check at end of spec emission counts tasks vs `Manual fallback:` bullets and warns if mismatched.

#### 1.4 WORKFLOW.md row delta for new commands

Any spec that adds a user-facing command (slash command, CLI entry point, or new subagent invocation) must include a `WORKFLOW.md` command-matrix row delta showing the new row to be added. Format matches the v2 §4 matrix: `| Protocol command | Manual | Claude Code | Codex prompt contract | Automation |`.

**Acceptance criteria:**
- [ ] The agent definition file documents the rule and shows the row format.
- [ ] When a sample input adds a command, the emitted spec contains a `### WORKFLOW.md row delta` (or equivalent named subsection) with at least one new `| ... | ... | ... | ... | ... |` row.
- [ ] When a sample input does NOT add a command, no row delta is emitted (no false positives).

#### 1.5 Final summary line

`/spec-planner` always emits a final stdout line of the form:

```
Spec shape: <wave|micro|trivial>; plan.md: <auto-appended Wave N|untouched>; Manual fallback bullets: <N>/<N>; WORKFLOW.md row delta: <yes|n/a>
```

**Acceptance criteria:**
- [ ] Every `/spec-planner` invocation prints exactly one line matching this format to stdout.
- [ ] The classification matches the actual side effects (no drift between summary and reality).

### Phase 2: Planning-loop enforcement (`/planning-loop`)

Edits target `skills/planning-loop/SKILL.md` and any auto-apply preflight scripts.

#### 2.1 Codex review prompt — portability criterion

The Codex review prompt body (currently in `skills/planning-loop/references/codex-prompts.md` per `project_planning_loop_skill.md`) gains a new criterion:

> **Portability:** Verify each implementation task has a `Manual fallback:` sub-bullet executable with git + editor + gh. Flag specs that hard-require a specific LLM tool name (Claude, Codex, etc.) as the only execution path.

**Acceptance criteria:**
- [ ] `grep -qi 'portability' skills/planning-loop/SKILL.md` exits 0.
- [ ] The Codex prompt file contains the literal phrase `Manual fallback` and the literal phrase `git + editor + gh`.
- [ ] Fixture: a spec missing `Manual fallback:` on any task triggers a Codex `needs-attention` finding; runner outcome is `menu` (matches existing planning-loop runner outcome taxonomy).

#### 2.2 Auto-apply preflight Phase 1a — WORKFLOW.md row delta gate

A new preflight phase (Phase 1a, before existing classification phases) inspects the spec for "adds a user-facing command" markers (e.g., a Files entry under `skills/<name>/SKILL.md`, or a heading containing "command:" with a slash-prefixed name). If detected, the preflight requires a `WORKFLOW.md row delta` subsection in the spec; if missing, preflight aborts with runner outcome `preflight-abort`.

**Acceptance criteria:**
- [ ] Fixture: spec adds command + has WORKFLOW.md row delta → preflight passes (no abort).
- [ ] Fixture: spec adds command + no WORKFLOW.md row delta → preflight aborts; receipt records `status=aborted-on-ambiguity` (or equivalent) with `notes` citing the missing row delta.
- [ ] Fixture: spec adds NO command → Phase 1a is a no-op regardless of WORKFLOW.md row delta presence.

#### 2.3 Plan.md non-touch guarantee

`/planning-loop` MUST NOT read, write, or recommend modifications to `docs/plan.md`. Plan.md ownership is exclusive to `/spec-planner`.

**Acceptance criteria:**
- [ ] `grep -F 'plan.md' skills/planning-loop/SKILL.md` returns no matches indicating planning-loop writes plan.md (read-only references for context are OK if explicitly marked "context-only, no write").
- [ ] No subprocess invoked by `/planning-loop` mutates `docs/plan.md` during fixture runs (verified by `git diff docs/plan.md` before/after each fixture).

### Phase 3: Wave-executor receipts (`/run-wave`, `/close-wave`, `/commit`)

Each command emits a §4.2-conforming YAML receipt under `.harness-state/<command>-<operation-slug>-<timestamp>.yml`. The shape MUST match the Wave 8 example receipt pair (`manual-close-wave-6.yml`, `claude-close-wave-6.yml`):

- `idempotency_key` is preserved as a mapping `{value, trace}` pending Wave 5 resolution of v2 Open Q #9.
- `operation_id` is the SHA-256 of `<command>\n<wave_id-or-spec_path-or-'-'>` per the normative §4.2 schema (see §3.0).
- `adapter: claude-code` for all three commands.
- Idempotency_key derivation uses the canonical algorithm from `docs/protocol/receipt-schema.md`. Implementations use `sha256sum` if available, else fall back to `shasum -a 256`, matching the bash 3.2 pattern in `recompute-keys.sh`.

#### 3.0 operation_id derivation (per normative §4.2 schema)

`operation_id` follows the schema's simple form verbatim: `sha256_hex("<command>\n<wave_id-or-spec_path-or-'-'>")`.

Per command, the second line of the digest input is:

| Command | Second line | Notes |
|---|---|---|
| `run-wave` | `<wave_id>` (bare integer string) | Wave-keyed; one logical dispatch per wave-id. |
| `close-wave` | `<wave_id>` (bare integer string) | Same key as run-wave so the run/close pair share `operation_id` for resume. |
| `commit` | `<spec_path>` if the commit advances a plan.md row; else `'-'` | The advance-vs-no-advance distinction is encoded by spec_path-vs-`'-'`. Two unrelated no-advance commits on the same branch will share `operation_id`; that is acceptable because `idempotency_key` (which incorporates input content) is the authoritative success-recovery key — see §3.0a lookup order. |

`operation_id` is NEVER used as a success-path shortcut. Its only role is to attach `retry_of` chains for partial/aborted invocations whose mutated inputs have already changed (and therefore whose `idempotency_key` no longer matches the prior receipt). Success-path no-op is governed strictly by `idempotency_key` equality — see §3.0a.

#### 3.0a Reserve-then-mutate receipt lifecycle (audit-trail invariant)

Every command in scope MUST follow this lifecycle. The audit trail is unbreakable in normal exits and recoverable in crash exits.

1. **Preflight (before any side effect):**
   1. Resolve receipt path: `.harness-state/<command>-<wave-or-spec-slug>-<ISO-8601-Z-timestamp>.yml` (e.g., `run-wave-1-2026-05-02T1430Z`).
   2. Verify `.harness-state/` exists, is a directory, and is writable. If not, **abort before any side effect** with a clear error to stderr; exit non-zero. Do NOT proceed with the underlying work.
   3. **Recovery lookup (two-stage, content-freshness-first per `docs/protocol/receipt-schema.md`):**
      1. **Stage A — idempotency_key (success path):** Compute the canonical `idempotency_key` for the *current* invocation's inputs (sorted input paths + content digests). Scan `.harness-state/` for any existing receipt with **status=success AND idempotency_key.value == current value**. If found → no-op; print existing receipt path; exit 0. This guarantees that any change to input contents (modified spec, modified plan.md, different staged files) **invalidates** the prior success and forces fresh work.
      2. **Stage B — operation_id (partial/aborted resume only):** If Stage A found nothing, compute `operation_id` per §3.0 and scan for any receipt whose `status` is in `partial` / `aborted-on-ambiguity` and whose `operation_id` matches (per the normative schema's recovery semantics in `docs/protocol/receipt-schema.md`). If found → set `retry_of: <prior receipt_id>` on the new receipt and proceed. This stage handles the case where inputs have legitimately mutated since the prior partial run (so `idempotency_key` won't match), but the logical operation is the same and the prior partial state is what we are resuming from. `failed` receipts are NOT resumable under Stage B — the schema treats hard failures as terminal, so the next attempt is a fresh logical operation with no `retry_of` chain. `started` receipts are orphan candidates handled by the 60-minute orphan rule in §Phase 5 (`Started-receipt orphan`); they are not matched by Stage B directly.
      3. **Never** use a success receipt found by `operation_id` alone as a no-op shortcut. `operation_id` matches against success receipts are ignored — only `idempotency_key` equality (Stage A) authorizes a success no-op.
   4. Write the **`started` receipt** with `status: started`, all known input paths, the computed `idempotency_key`, the computed `operation_id`, and a placeholder `verification` block. This reserves the audit trail before mutation.
   5. Install a `trap EXIT` that, if the receipt's `status` is still `started` at exit, atomically rewrites it. The terminal status the trap writes depends on the cause: signal-driven exits (SIGTERM, SIGINT, timeout, host crash recovery) and orchestrator-ambiguity-stop both write `status: aborted-on-ambiguity` (Stage-B-resumable per the schema). Only clean non-zero exits from the underlying command (e.g., tsc/test failure, merge conflict, pre-commit-hook rejection) write `status: failed` (terminal per the schema, not Stage-B-resumable). The trap encodes the cause via `notes`; `aborted-on-ambiguity` is the safe default when the cause is unclear.
2. **Do the work** (dispatch, merge, commit, etc.).
3. **Terminal write:** atomically rewrite the same receipt path with terminal `status` (`success` / `partial` / `aborted-on-ambiguity`) and the populated `verification.results`, `outputs`, and any command-specific fields (`merge_sha` for close-wave). Atomic = write to `<path>.tmp` then `mv -f <path>.tmp <path>`.
4. **Trap clears:** at successful terminal write, the trap handler is reset (or the trap-handler logic checks for the success status before overwriting).

**Overlapping input/output protocol (per normative schema §Recovery semantics):** when a command's `outputs` overlap its `inputs` (e.g., `/close-wave` mutating `docs/plan.md` and `docs/waves/<summary>`; `/commit` mutating `docs/plan.md` and `parking_lot.md`), the mutation MUST follow the schema's atomic-rename option: write the new content to `<path>.tmp` then `mv -f <path>.tmp <path>` once the new bytes are fully staged. The receipt-file lifecycle in steps 1-4 already uses this discipline; non-receipt mutated artifacts MUST do the same. `git merge --no-ff` (used by `/close-wave`) and `git commit` (used by `/commit`) satisfy this rule for files carried by git's own index update, since git's working-tree write is itself atomic-rename. No separate rollback journal is required when atomic-rename is used (per schema option (a)); adapters MUST NOT mutate an overlapping input/output via in-place writes that leave a window where the file holds neither the old nor the new bytes.

**Acceptance criteria for overlapping I/O:**
- [ ] `/close-wave` plan.md and wave-summary updates use temp-file-plus-rename (or `git merge` for merge-carried updates); no in-place writes.
- [ ] `/commit` parking_lot.md and plan.md updates outside `git commit`'s own atomic write use temp-file-plus-rename.
- [ ] Fixture: kill the command between the temp-file write and the rename → original input bytes are still on disk and the next invocation's `idempotency_key` recomputes to the prior content (no mid-write torn state).

**Acceptance criteria for §3.0a:**
- [ ] If `.harness-state/` is read-only, the command aborts before any underlying side effect (no merge, no commit, no orchestrator dispatch). Verified by a fixture that chmod's the directory.
- [ ] If the command process is killed (`kill -TERM`) mid-work, the receipt at exit shows `status: aborted-on-ambiguity` (signal exits are Stage-B-resumable per the schema; `failed` is reserved for clean non-zero command exits with no signal involvement). Verified by a fixture that backgrounds the command and signals it.
- [ ] No receipt file ever ends in `status: started` after the command process has exited (the trap guarantees a terminal status is written).
- [ ] **Stage-A success no-op:** A `success` receipt whose `idempotency_key.value` matches the current invocation's recomputed key short-circuits to a no-op (no new receipt file created).
- [ ] **Content-freshness invalidation:** If the prior `success` receipt's `idempotency_key.value` does NOT match the current recomputed key (because spec, plan.md, or staged files changed), the success no-op MUST NOT trigger; the command proceeds to do fresh work. Verified by a fixture that mutates the spec between two `/run-wave` invocations on the same wave_id.
- [ ] **operation_id is never a success shortcut:** A `success` receipt sharing only `operation_id` (but with a different `idempotency_key.value`) is ignored by the recovery lookup. Verified by a fixture that constructs this exact divergence.
- [ ] **Stage-B partial resume:** A `partial` / `aborted-on-ambiguity` receipt with matching `operation_id` (regardless of idempotency_key) results in `retry_of` chaining on the new receipt and the command proceeds with fresh work. `failed` receipts are NOT Stage-B-resumable (schema-aligned terminal status); a fresh logical operation runs with no `retry_of` chain.

#### 3.1 `/run-wave` receipt

Follows the §3.0a lifecycle. The `started` receipt is written **before** the orchestrator is dispatched (i.e., before any worktree creation or branch checkout).

- `command: run-wave`
- `wave_id`: the wave number being dispatched
- `spec_path`: the spec the wave was sourced from (per `docs/plan.md`)
- `operation_id`: `sha256_hex("run-wave\n<wave_id>")` per §3.0
- `inputs`: `[docs/plan.md, <spec_path>, ...any cited sub-spec paths]`
- `outputs`: `[<worktree branch path>, .harness-state/<orchestrator-log-path>]` (populated at terminal write; in `started` receipt these are empty `[]` or absent)
- `verification`: lint/typecheck commands with results (terminal write only)
- `status`: `started` (preflight) → `success` on clean dispatch; `partial` if dispatch returned but exit gate not met; `aborted-on-ambiguity` if orchestrator stopped on ambiguity OR if signals/timeout caught by the EXIT trap (Stage-B-resumable); `failed` only for clean non-zero command exits with no signal involvement (terminal; not Stage-B-resumable)

**Acceptance criteria:**
- [ ] On a successful fixture wave, the receipt validates against the §4.2 schema (manual or scripted check).
- [ ] On a deliberately-broken fixture (e.g., missing spec), the receipt is written with `status=failed` and `verification.results` shows the failed command + exit code.
- [ ] Same inputs run twice → same `idempotency_key.value` and `operation_id` byte-for-byte; second invocation no-ops via Stage A (idempotency_key match on the prior success).
- [ ] **Content-freshness:** if the spec or plan.md changes between two `/run-wave` invocations on the same `wave_id`, `idempotency_key.value` differs from the prior success receipt; Stage A does NOT no-op; the command does fresh work and writes a new receipt.
- [ ] Crash-recovery fixture: SIGTERM during dispatch produces a terminal `aborted-on-ambiguity` receipt (not a `started` orphan, not `failed`). The next invocation sets `retry_of` via Stage B.
- [ ] Preflight fixture: `.harness-state/` chmod 0o500 → command aborts before worktree creation; no worktree exists; no receipt file exists; clear stderr error.

#### 3.2 `/close-wave` receipt

Follows the §3.0a lifecycle. The `started` receipt is written **before** the merge attempt (i.e., before `git merge --no-ff`).

- `command: close-wave`
- `wave_id`: the wave being closed
- `spec_path`: the spec the wave was sourced from
- `operation_id`: `sha256_hex("close-wave\n<wave_id>")` per §3.0
- `inputs`: `[docs/plan.md, <spec_path>, docs/waves/<summary file path>]`
- `outputs`: `[docs/plan.md, docs/waves/<summary>]` (terminal write only)
- `verification`: presence checks + plan.md tick-off check (mirrors Wave 8 example pair)
- `merge_sha`: required when `status=success`
- `status`: `started` (preflight) → `success` / `partial` / `failed` / `aborted-on-ambiguity` (terminal)

**Acceptance criteria:**
- [ ] Receipt validates against §4.2 schema.
- [ ] `merge_sha` field is populated when `status=success` (absent or null is invalid).
- [ ] Cross-adapter equality (idempotency) fixture: a hand-authored manual receipt and the claude-code receipt for the same logical close-wave operation produce identical `idempotency_key.value`.
- [ ] Content-freshness: re-running `/close-wave` after the wave summary file or plan.md changed produces a different `idempotency_key.value` than any prior success receipt; Stage A does NOT no-op.
- [ ] Crash-recovery fixture: SIGTERM after `started` receipt is written but before merge → terminal `aborted-on-ambiguity` receipt (no orphan `started`, not `failed`). Next invocation Stage-B-chains via `operation_id`.
- [ ] Preflight fixture: read-only `.harness-state/` aborts close-wave before any merge; `git status` shows no merge commit was created.

#### 3.3 `/commit` receipt

Follows the §3.0a lifecycle. The `started` receipt is written **before** `git commit` runs (i.e., after staging, after pre-commit hooks queue but before the commit SHA exists).

- `command: commit`
- `wave_id`: numeric string when the commit advances a plan.md row (`notes: "advances Wave N"`); else `null`
- `spec_path`: required when the commit advances a plan.md row (sourced from the row's `spec:` field); else optional and populated only when the commit references a spec via the parking-lot
- `operation_id`: per §3.0 — `sha256_hex("commit\n<spec_path>")` when advancing plan.md, else `sha256_hex("commit\n-")`. Note: unrelated no-advance commits on the same branch will share `operation_id`; this is acceptable because `idempotency_key` (which incorporates staged-file content digests) is the authoritative success-path key. Two no-advance commits with disjoint staged sets will have **different** `idempotency_key` values and therefore neither will short-circuit the other (Stage A no-op fails). Stage B partial resume will only chain `retry_of` if a *resumable* receipt (`partial` or `aborted-on-ambiguity`) with matching `operation_id` exists; `failed` receipts (clean non-zero command exits) are terminal and never Stage-B-chained. In practice this means a partial/aborted commit attempt's `retry_of` may attach to an unrelated prior no-advance partial — acceptable noise that does not affect correctness because the new attempt always does fresh work.
- `inputs`: `[<staged file paths>, parking_lot.md (if checked), docs/plan.md (if checked)]`
- `outputs`: `[<commit SHA>, parking_lot.md (if updated), docs/plan.md (if updated)]` (terminal write only; commit SHA captured from `git log -1 --format=%H` after `git commit` succeeds)
- `verification`: pre-commit hooks + code-reviewer agent verdict (if run)
- `status`: `started` (preflight) → `success` / `partial` / `failed` (terminal)

**Acceptance criteria:**
- [ ] Receipt validates against §4.2 schema.
- [ ] When `wave_id` is null, the schema validator accepts the receipt (per §4.2 conditional rule).
- [ ] Idempotency-key separation fixture: two `/commit` invocations on the same branch with disjoint staged sets produce **different** `idempotency_key.value` (because content digests differ); neither short-circuits the other via Stage A. (See §4.6.)
- [ ] Logical-retry fixture: `/commit` killed mid-pre-commit-hook by SIGTERM → terminal `aborted-on-ambiguity` receipt with `retry_of: null` (signal exit; not `failed`). Re-running with the **same staged paths** and unchanged content: Stage A finds no success match (prior was `aborted-on-ambiguity`); Stage B activates and chains `retry_of` to the prior receipt (matching `operation_id`); fresh work proceeds. Companion fixture: `/commit` rejected by pre-commit-hook with clean non-zero exit (no signal) → terminal `failed` receipt; re-running produces a fresh `started` receipt with NO `retry_of` chain (`failed` is terminal per schema).
- [ ] Plan.md advance fixture: a commit advancing `Wave 2` of spec X has `operation_id = sha256_hex("commit\ndocs/specs/X.md")`; a no-advance commit on the same branch has `operation_id = sha256_hex("commit\n-")`. The two `operation_id` values differ.
- [ ] Crash-recovery fixture: SIGTERM after `started` receipt but before `git commit` runs → terminal `aborted-on-ambiguity` receipt (Stage-B-resumable); `git log` shows no new commit.
- [ ] Preflight fixture: read-only `.harness-state/` aborts commit before `git commit` runs.

### Phase 4: Fixture coverage

All fixtures land under `skills/planning-loop/lib/test-fixtures/` (for planning-loop fixtures) and `.harness-state/examples/wave1/` (for receipt examples).

#### 4.1 Wave-shape vs micro-shape classification fixtures

- Fixture A: spec with parallelism rank 2 → classified `wave-shaped`; plan.md row appended.
- Fixture B: spec with all 5 signals false, 2 tasks → classified `micro-shaped`; plan.md unchanged.
- Fixture C: spec with all 5 signals false, 1 task → classified `trivial`; plan.md unchanged.

**Acceptance criteria:**
- [ ] All three fixtures pass under `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh`.
- [ ] Each fixture asserts the final summary line matches expected classification.

#### 4.2 Missing `Manual fallback:` fixture

A fixture spec where one task lacks the `Manual fallback:` sub-bullet.

**Acceptance criteria:**
- [ ] Codex review verdict on this fixture is `needs-attention` citing the missing fallback.
- [ ] Runner outcome is `menu` (per existing planning-loop runner outcome taxonomy).

#### 4.3 Missing WORKFLOW.md row delta fixture

A fixture spec adding a slash command but with no `WORKFLOW.md row delta` subsection.

**Acceptance criteria:**
- [ ] Auto-apply preflight Phase 1a aborts.
- [ ] Runner outcome is `preflight-abort`.
- [ ] Receipt records the abort with `status` set per §4.2 and `notes` citing the missing delta.

#### 4.4 Receipt example pairs under `.harness-state/examples/wave1/`

For each command in scope (`run-wave`, `close-wave`, `commit`), ship:

- One §4.2-valid `success` receipt.
- One §4.2-valid `partial` or `failed` (or `aborted-on-ambiguity`) receipt.

Plus one hand-authored **manual-adapter** receipt paired with the claude-code `close-wave` success receipt for the cross-adapter equality fixture.

Total: **at least 6 command receipts plus one manual paired receipt** (i.e., 7 files). Each must validate against the §4.2 schema and recompute its embedded `idempotency_key` correctly when run through a `recompute-keys.sh`-style validator.

**Acceptance criteria:**
- [ ] `.harness-state/examples/wave1/` contains at least 6 command receipt files (3 success + 3 of mixed `partial`/`failed`/`aborted-on-ambiguity` — at least one of each terminal-non-success status) plus one manual paired receipt — 7 files total under this naming pattern.
- [ ] Each receipt parses as valid YAML.
- [ ] Each receipt's `idempotency_key.value` recomputes correctly from its `idempotency_key.trace`.
- [ ] Each receipt's `operation_id` matches `sha256_hex("<command>\n<wave_id-or-spec_path-or-'-'>")` per §3.0 derivation.
- [ ] The manual paired receipt and its claude-code counterpart (the `close-wave` success pair) share an identical `idempotency_key.value` (cross-adapter equality property).

#### 4.5 Idempotency fixture

A fixture that runs the same logical operation twice (same inputs, same wave/spec) and asserts:

- Identical `idempotency_key.value` byte-for-byte across invocations.
- Identical `operation_id` byte-for-byte across invocations.
- Second invocation no-ops to the first receipt (returns the existing receipt rather than creating a new one).

**Acceptance criteria:**
- [ ] Fixture exits 0 only when both keys match and the second invocation does not produce a new receipt file.
- [ ] Fixture is invoked by `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh`.

#### 4.6 `/commit` recovery-key separation fixture

Four commit scenarios on the same fixture branch, asserting the §3.0a two-stage recovery semantics under the schema's simple `operation_id`:

- Scenario A: stage `file-a.txt`, commit (no plan.md advance) → `success`.
- Scenario B: stage `file-b.txt`, commit (no plan.md advance) → `success`. Different staged content, so different `idempotency_key.value`. Same `operation_id` (`sha256_hex("commit\n-")`) as A — but Stage A success-lookup uses `idempotency_key`, not `operation_id`, so B does NOT no-op against A.
- Scenario C: re-stage the **exact same content** as A (logical retry after some intervening unrelated work) → Stage A finds A's success receipt by `idempotency_key.value` and no-ops; no new receipt is written.
- Scenario D: stage `file-a.txt` and advance `Wave 2` of a fixture spec → different `operation_id` (`sha256_hex("commit\ndocs/specs/<fixture>.md")`) and different `idempotency_key` (advance status is part of input trace).

**Acceptance criteria:**
- [ ] `idempotency_key(A) != idempotency_key(B)` (different staged content); B does fresh work, B's receipt is written.
- [ ] `idempotency_key(A) == idempotency_key(C)` (same content); C no-ops via Stage A; no new receipt for C.
- [ ] `operation_id(A) != operation_id(D)` (no-advance vs spec-advance).
- [ ] `idempotency_key(A) != idempotency_key(D)`.
- [ ] **Stale-success protection:** mutate `file-a.txt`'s content and re-stage it; the new `idempotency_key.value` differs from A's; the command does fresh work even though `operation_id` still matches A's. Verifies F1's content-freshness invariant directly.

#### 4.7 Crash-recovery fixture

A fixture that backgrounds a wave-executor command and signals it mid-flight, asserting the audit trail invariant from §3.0a.

**Acceptance criteria:**
- [ ] After SIGTERM, the receipt file exists with terminal `status: aborted-on-ambiguity` (Stage-B-resumable per schema; `started` is forbidden, `failed` is wrong status for signal exits).
- [ ] No orphan `.tmp` receipt files remain in `.harness-state/`.
- [ ] Re-running the same operation finds the `aborted-on-ambiguity` receipt, sets `retry_of` via Stage B, and proceeds with fresh work.
- [ ] Companion fixture: a clean non-zero exit (no signal) writes `status: failed`; re-running produces a fresh `started` receipt with NO `retry_of` chain (terminal-failed is not Stage-B-resumable per schema).

#### 4.8 Preflight-abort fixture (read-only `.harness-state/`)

A fixture that chmod's `.harness-state/` to read-only, runs each of `/run-wave`, `/close-wave`, `/commit`, and asserts no underlying side effect occurred.

**Acceptance criteria:**
- [ ] `/run-wave`: no worktree created; no branch created; non-zero exit; clear stderr error citing `.harness-state/` write failure.
- [ ] `/close-wave`: no merge commit on master/feature branch; non-zero exit; clear stderr error.
- [ ] `/commit`: no new commit on `git log`; non-zero exit; clear stderr error.
- [ ] In all three cases, no receipt file was written (the preflight check ran before any mutation OR before `started` write).

### Phase 5: Edge cases and error handling

- [ ] **plan.md missing:** `/spec-planner` prints warning, prints suggested block, writes spec, exits 0.
- [ ] **plan.md malformed (no `### Wave ` headings):** `/spec-planner` falls back to `N=1`, prints warning, writes spec, exits 0.
- [ ] **plan.md present but spec already has its row:** no duplicate; idempotent; spec write proceeds.
- [ ] **`.harness-profile` missing:** `auto_plan_append` defaults to `true`; spec-planner proceeds.
- [ ] **`.harness-profile.spec_planner` block missing:** treat as default (auto-append on).
- [ ] **`SPEC_PLANNER_NO_AUTO_PLAN=1` env var set:** skip auto-append even if profile says `true`. Print summary line indicating `plan.md: skipped (env var)`.
- [ ] **Codex review unavailable** (network down, runtime missing): `/planning-loop` aborts cleanly with `aborted-on-ambiguity` receipt; does NOT silently skip the portability criterion.
- [ ] **Preflight (`.harness-state/` not writable):** command aborts BEFORE any mutating side effect (no worktree, no merge, no commit). Stderr error cites the unwritable path. No receipt file is written. Non-zero exit. Distinct error code from post-mutation failures so callers can distinguish.
- [ ] **Post-mutation receipt-terminal-write fails** (disk filled mid-operation, permissions changed mid-operation): the `started` receipt is already on disk from preflight. The EXIT trap attempts to write a terminal-status receipt (`aborted-on-ambiguity` for signal exits, `failed` for clean non-zero exits); if that ALSO fails, the trap writes a one-line `<receipt_path>.recovery-needed` marker file naming the receipt and the unwritten terminal status. The command emits an error to stderr and exits non-zero. The underlying work is NOT rolled back (per `feedback_external_side_effect_rollback` — non-zero exit ≠ undo); operator inspects the marker file and either completes the receipt manually or runs a recovery helper. This satisfies "explicit partial receipt recovery path rather than only stderr."
- [ ] **Started-receipt orphan (process killed before terminal write):** the EXIT trap rewrites the receipt with `status: aborted-on-ambiguity` and `notes: "killed by signal"` (signal exits are Stage-B-resumable per schema; `failed` would be wrong). If the kill itself prevents trap execution (SIGKILL), the next run of the same `operation_id` finds an orphan `started` receipt; the recovery rule is: an orphan `started` receipt older than 60 minutes is treated as `aborted-on-ambiguity` for `retry_of` chaining purposes (resumable, schema-aligned). Document this rule in the SKILL bodies.
- [ ] **Bash 3.2 macOS compatibility:** receipt emission uses `sha256sum` if available, else `shasum -a 256`; no associative arrays anywhere (per `reference_bash_compat_patterns`); `trap EXIT` syntax is portable.

## Implementation Plan (Sprint Contracts)

Each task is a contract: build it, verify it, move on. Dependencies are explicit. See the `## Implementation` block at the top of this spec for the canonical execution-rank layout (Layer 0 = Tasks 1, 4, 5, 6, 7; Layer 1 = Tasks 2, 3, 8, 9, 10; Layer 2 = Task 11; Layer 3 = Task 12).

### Phase 1: Spec-planner shape doctrine

- [ ] **Task 1:** Replace `/spec-planner` decision tree with single principle + 5-signal checklist + shape-consequence table.
  - **Files:** `.claude/agents/spec-planner.md`
  - **Depends on:** Nothing
  - **Verify:** `grep -F 'ALL-or-NOTHING' .claude/agents/spec-planner.md` exits 0; `grep -F 'Shape | When | Plan.md consequence' .claude/agents/spec-planner.md` exits 0; manual read confirms the old 3-rule heuristic is gone or marked superseded.
  - **Manual fallback:** Open `.claude/agents/spec-planner.md` in an editor; locate the "Recommended Implementation" section; replace its decision-tree paragraph with the new principle, checklist, and table per spec §1.1; save.

- [ ] **Task 2:** Add `/spec-planner` plan.md auto-append logic + opt-out + fallback-to-stdout error path.
  - **Files:** `.claude/agents/spec-planner.md` (procedural rules); also document the env var `SPEC_PLANNER_NO_AUTO_PLAN=1` and `.harness-profile.spec_planner.auto_plan_append` flag in the agent body.
  - **Depends on:** Task 1
  - **Verify:** Sample dry run on a wave-shaped spec writes a `### Wave N` block to `docs/plan.md` with `N = max(existing) + 1`; second run is idempotent; sample dry run on a micro-shaped spec leaves plan.md byte-identical; running with `SPEC_PLANNER_NO_AUTO_PLAN=1` skips the append on the wave-shaped spec.
  - **Manual fallback:** After spec-planner emits the spec, the operator manually appends the suggested `### Wave N` block to `docs/plan.md` using an editor; spec-planner prints the block to stdout for copy-paste.

- [ ] **Task 3:** Add mandatory `**Manual fallback:**` per-task rule, WORKFLOW.md row delta rule for new-command specs, and final summary line.
  - **Files:** `.claude/agents/spec-planner.md`
  - **Depends on:** Task 1
  - **Verify:** Sample spec output contains `**Manual fallback:**` once per implementation task; sample input adding a slash command produces a `### WORKFLOW.md row delta` subsection with a 5-column row; final stdout line matches the §1.5 format on every dry run.
  - **Manual fallback:** Author the spec by hand using the agent file as a checklist; manually add `Manual fallback:` bullets and the WORKFLOW.md row delta section.

### Phase 2: Planning-loop enforcement

- [ ] **Task 4:** Add portability criterion to Codex review prompt.
  - **Files:** `skills/planning-loop/references/codex-prompts.md`, `skills/planning-loop/SKILL.md` (to surface the criterion in the prompt-shape summary)
  - **Depends on:** Nothing (parallel to Task 1)
  - **Verify:** `grep -qi 'portability' skills/planning-loop/SKILL.md`; prompt file contains literal `Manual fallback` and `git + editor + gh`; the missing-`Manual fallback:` fixture in Task 12 confirms the criterion fires.
  - **Manual fallback:** Open the Codex prompt file in an editor; insert the new criterion paragraph before the existing review-output instructions; save.

- [ ] **Task 5:** Add auto-apply preflight Phase 1a (WORKFLOW.md row delta gate).
  - **Files:** `skills/planning-loop/SKILL.md` (procedural description); `skills/planning-loop/lib/auto-apply.sh` (or whatever script implements preflight today; verify path during build)
  - **Depends on:** Nothing (parallel to Task 1)
  - **Verify:** Fixture in Task 12 (`missing-workflow-delta.md`) with command-add spec missing row delta triggers `preflight-abort`; fixture with row delta present passes Phase 1a.
  - **Manual fallback:** A human reviewing a spec checks for new commands and confirms the WORKFLOW.md row delta section exists; rejects the spec if it does not.

- [ ] **Task 6:** Document plan.md non-touch invariant in planning-loop SKILL.md.
  - **Files:** `skills/planning-loop/SKILL.md`
  - **Depends on:** Nothing (parallel to Task 1)
  - **Verify:** SKILL.md contains an explicit statement that planning-loop does not read or write `docs/plan.md`; existing planning-loop scripts have no `plan.md` write paths (verified by `git diff` over fixture runs).
  - **Manual fallback:** A human reviewer confirms by reading the SKILL.md doctrine block.

### Phase 3: Wave-executor receipts

- [ ] **Task 7:** Author the shared receipt-emission helper implementing the §3.0a reserve-then-mutate lifecycle (preflight write check, started-receipt write, EXIT trap, atomic terminal write, two-stage recovery lookup, retry_of chaining, `.recovery-needed` marker on terminal-write failure, orphan-started 60-min recovery rule).
  - **Files:** `skills/_shared/lib/emit-receipt.sh` (single shared helper sourced by all three commands; commits to the shared-helper option from old Open Q #4 — see resolved Open Questions below) + the §3.0 `operation_id` derivation (per-command second-line table).
  - **Depends on:** Nothing (parallel to Task 1)
  - **Verify:** Unit fixture exercises preflight-abort path (read-only `.harness-state/`), started-receipt write, terminal-success rewrite, EXIT-trap-on-SIGTERM produces terminal `aborted-on-ambiguity` (Stage-B-resumable), companion fixture for clean non-zero exit produces terminal `failed` (NOT Stage-B-resumable), **Stage A** idempotency_key success no-op, **Stage A negative** (mutated input → no no-op), **Stage B** retry_of chaining when prior `partial`/`aborted-on-ambiguity` receipt with matching `operation_id` exists, **Stage B negative** (prior `failed` receipt → no chain, fresh logical operation). Bash 3.2 compatibility verified by `bash --version` 3.2 fixture run.
  - **Manual fallback:** A human authors three near-identical receipt-emission code blocks inline in the three SKILL bodies, accepting the duplication; the §3.0 `operation_id` derivation table is followed by hand.

- [ ] **Task 8:** Wire `/run-wave` to emit a §4.2-conforming receipt via the shared helper.
  - **Files:** `skills/run-wave/SKILL.md` (procedural).
  - **Depends on:** Task 7
  - **Verify:** Fixture run produces a YAML file at `.harness-state/run-wave-<operation-slug>-<timestamp>.yml`; file parses as valid YAML; `idempotency_key.value` recomputes correctly; `operation_id` matches §3.0 derivation; `adapter: claude-code`. Crash-recovery fixture (§4.7) and preflight fixture (§4.8) both pass.
  - **Manual fallback:** After dispatching the wave, the operator hand-authors the receipt YAML using the example pair (`manual-close-wave-6.yml`) as a template; computes `idempotency_key` via `recompute-keys.sh`-style invocation; for crash-recovery, the operator manually creates an `aborted-on-ambiguity`-status receipt for any signal-killed dispatch (Stage-B-resumable per schema); reserves `failed` for clean non-zero command exits.

- [ ] **Task 9:** Wire `/close-wave` to emit a §4.2-conforming receipt with `merge_sha` via the shared helper.
  - **Files:** `skills/close-wave/SKILL.md` (procedural)
  - **Depends on:** Task 7
  - **Verify:** Fixture run produces a receipt with `status: success` and `merge_sha` populated (or `partial`/`failed` with `merge_sha` absent); cross-adapter equality fixture shows manual + claude-code receipts share `idempotency_key.value`; crash-recovery and preflight fixtures pass.
  - **Manual fallback:** Hand-author the receipt YAML after merge; copy `merge_sha` from `git log -1 --format=%H`; for crash recovery, manually rewrite any orphan `started` receipt to `aborted-on-ambiguity` (Stage-B-resumable per schema; reserve `failed` for clean non-zero command exits with no signal involvement).

- [ ] **Task 10:** Wire `/commit` to emit a §4.2-conforming receipt via the shared helper, including the §3.0 `operation_id` derivation (`spec_path` when advancing plan.md, `'-'` otherwise).
  - **Files:** `skills/commit/SKILL.md` (procedural)
  - **Depends on:** Task 7
  - **Verify:** Fixture run produces a receipt with `wave_id: null` accepted by schema validator (no-advance commits); plan.md-advance commit produces a receipt with `wave_id` set and `operation_id = sha256_hex("commit\n<spec_path>")`. Recovery-key separation fixture (§4.6) passes: disjoint staged content produces distinct `idempotency_key` (Stage A does not cross-no-op), identical staged content no-ops via Stage A, mutated content (same paths, different bytes) does NOT no-op even though `operation_id` matches (content-freshness verified).
  - **Manual fallback:** Hand-author receipt YAML; commit SHA from `git log -1 --format=%H`; compute the input content digest for `idempotency_key.trace` manually via `git diff --cached | sha256sum`.

### Phase 4: WORKFLOW.md row updates and fixtures

- [ ] **Task 11:** Update `WORKFLOW.md` rows for the three Wave-1-touched commands so each row cites its `.harness-state/` receipt path and the manual fallback sequence, per upstream v2 §8 Wave 1 requirement.
  - **Files:** `WORKFLOW.md` (existing rows for `/run-wave`, `/close-wave`, `/commit`).
  - **Depends on:** Tasks 8, 9, 10 (must know the actual receipt path conventions and `operation_id` derivation before documenting them; row text cites §3.0 and §3.0a).
  - **Verify:**
    - `grep -F '.harness-state/run-wave-' WORKFLOW.md` exits 0 (path pattern referenced in /run-wave row).
    - `grep -F '.harness-state/close-wave-' WORKFLOW.md` exits 0.
    - `grep -F '.harness-state/commit-' WORKFLOW.md` exits 0.
    - Each of the three rows has a Manual column citing the manual-receipt template path (`.harness-state/examples/wave1/manual-*.yml`).
    - Each of the three rows references the §4.2 receipt schema and the §3.0 `operation_id` derivation (at least the Codex prompt contract column or the Manual column points at the schema doc).
    - No row was renamed or removed (verified by diff: only the three rows changed; the row count is unchanged).
  - **Manual fallback:** Open `WORKFLOW.md` in an editor; locate the existing `/run-wave`, `/close-wave`, `/commit` rows; in each row's Claude-Code column add the receipt-path pattern; in each row's Manual column add the manual-fallback sequence (template path + `recompute-keys.sh` invocation); save.

- [ ] **Task 12:** Author all fixtures (Phase 4 of Requirements) and wire them into `run-fixtures.sh`.
  - **Files:**
    - `skills/planning-loop/lib/test-fixtures/wave-shape-classification.md`
    - `skills/planning-loop/lib/test-fixtures/micro-shape-classification.md`
    - `skills/planning-loop/lib/test-fixtures/trivial-shape-classification.md`
    - `skills/planning-loop/lib/test-fixtures/missing-manual-fallback.md`
    - `skills/planning-loop/lib/test-fixtures/missing-workflow-delta.md`
    - `skills/planning-loop/lib/test-fixtures/idempotency.md`
    - `skills/planning-loop/lib/test-fixtures/commit-recovery-key-separation.md` (§4.6)
    - `skills/planning-loop/lib/test-fixtures/crash-recovery.md` (§4.7)
    - `skills/planning-loop/lib/test-fixtures/preflight-abort-readonly-state.md` (§4.8)
    - `.harness-state/examples/wave1/run-wave-1-success.yml`
    - `.harness-state/examples/wave1/run-wave-1-partial.yml`
    - `.harness-state/examples/wave1/close-wave-1-success.yml`
    - `.harness-state/examples/wave1/close-wave-1-failed.yml`
    - `.harness-state/examples/wave1/commit-1-success.yml`
    - `.harness-state/examples/wave1/commit-1-aborted.yml`
    - `.harness-state/examples/wave1/manual-close-wave-1-success.yml` (paired with claude-code success for cross-adapter equality)
    - `skills/planning-loop/lib/test-fixtures/run-fixtures.sh` (extend to invoke new fixtures)
  - **Depends on:** Tasks 1-11 (all behaviors and WORKFLOW.md rows must exist before fixtures can exercise them)
  - **Verify:** `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` exits 0 with all new fixtures passing; receipt example pair under `.harness-state/examples/wave1/` validates with a `recompute-keys.sh`-style script that asserts cross-adapter `idempotency_key` equality on the manual+claude-code success pair.
  - **Manual fallback:** Hand-author each fixture file using existing fixtures (`all-unanimous-mechanical.md`, etc.) as templates; hand-author the YAML receipts using `manual-close-wave-6.yml` and `claude-close-wave-6.yml` as templates; manually run each fixture and confirm expected outcome.

### WORKFLOW.md row delta (this spec's own delta)

This spec does NOT add a new user-facing command — it only updates the existing rows for `/run-wave`, `/close-wave`, and `/commit` with their receipt paths. The row schema is unchanged; only Claude-Code and Manual columns gain receipt-related text. Per Task 11, those updates land in `WORKFLOW.md` directly; this section is the in-spec record of what changed.

| Protocol command | Manual (delta) | Claude Code (delta) | Codex prompt contract | Automation |
|---|---|---|---|---|
| /run-wave | Add: "On completion, hand-author `.harness-state/run-wave-<operation-slug>-<ts>.yml` per `.harness-state/examples/wave1/manual-*.yml`; recompute `idempotency_key` via `recompute-keys.sh`." | Add: "Emits `.harness-state/run-wave-<operation-slug>-<ts>.yml` via shared helper (§3.0a reserve-then-mutate)." | unchanged | unchanged |
| /close-wave | Add: "On completion, hand-author `.harness-state/close-wave-<operation-slug>-<ts>.yml`; populate `merge_sha` from `git log -1 --format=%H`." | Add: "Emits `.harness-state/close-wave-<operation-slug>-<ts>.yml` with `merge_sha` populated." | unchanged | unchanged |
| /commit | Add: "On completion, hand-author `.harness-state/commit-<operation-slug>-<ts>.yml`; compute staged-content digest via `git diff --cached \| sha256sum` for `idempotency_key.trace`." | Add: "Emits `.harness-state/commit-<operation-slug>-<ts>.yml` with `operation_id = sha256_hex(\"commit\\n<spec_path-or-'-'>\")` per §3.0." | unchanged | unchanged |

## Constraints

- **Existing skill names and core semantics remain stable.** No renames, no removed flags, no broken invocations from consumer repos.
- **Per-command WORKFLOW.md matrix is the single source of truth.** Per `feedback_command_vs_wave_scope`, the matrix is per-command, not per-wave. This spec does not duplicate WORKFLOW.md rows per wave.
- **Bash 3.2 compatibility (macOS default shell).** Per `reference_bash_compat_patterns`: no associative arrays; use `eval` + dynamic var names where lookups are needed; SHA-256 derivation uses `sha256sum` if available else `shasum -a 256`.
- **Markdown for skill bodies, YAML for receipts, SHA-256 for keys.** No new tooling dependencies.
- **`/planning-loop` MUST NOT touch plan.md.** Architectural invariant. Plan.md ownership is exclusive to `/spec-planner`.
- **Idempotency_key shape preserved.** `{value, trace}` mapping form, matching Wave 8 example receipts. Open Q #9 of the v2 protocol spec (whether to flatten to a string) is deferred to Wave 5.
- **Receipt path stays under `.harness-state/`.** No alternate paths.
- **Failure mode discipline is split by command class.** Spec-planner is non-mutating-of-external-state and emits the spec even if plan.md is missing (warning to stdout, suggested block to stdout). Wave-executor commands (`/run-wave`, `/close-wave`, `/commit`) DO mutate external state and follow §3.0a reserve-then-mutate: preflight aborts BEFORE mutation if `.harness-state/` is unwritable; post-mutation receipt-write failures are captured by EXIT trap into `.recovery-needed` markers; underlying work is not rolled back (per `feedback_external_side_effect_rollback`).
- **Receipt audit-trail invariant.** No wave-executor command may complete a side effect without an on-disk receipt or a `.recovery-needed` marker pointing at the missing receipt. The `started` receipt + EXIT trap + atomic terminal write enforce this in normal and abnormal exits.
- **operation_id derivation matches normative §4.2.** Per §3.0, the digest input is `<command>\n<wave_id-or-spec_path-or-'-'>` — no command-specific extensions. The success-path no-op uses `idempotency_key`, NOT `operation_id`; `operation_id` only governs partial/aborted resume chaining. This is the load-bearing fix for content-freshness invalidation per `docs/protocol/receipt-schema.md`.

## Out of Scope

Explicitly NOT in this wave (per v2 protocol §8 and the user's input):

- `/archive-plan` skill (Wave 2 of v2 protocol)
- `/harness-status` skill (Wave 2 of v2 protocol)
- Draft PR visibility adapter (Wave 3 of v2 protocol)
- Tracker pilot — Linear or otherwise (Wave 4 of v2 protocol)
- Codex peer adapter — fixture-verified Codex command specs (Wave 5 of v2 protocol)
- Idempotency_key shape change (string vs mapping) — deferred to Wave 5 per Open Q #9
- Auto-apply auto-merge of any kind beyond the existing planning-loop auto-apply mechanical-arbiter path
- Migration of consumer repos (wordwideAI, gobot) — those happen in their own per-repo specs after this wave ships
- Any change to the `/triage-parking` or `/apply-anthropic-reviews` skills (separate ownership chains)
- Any change to `code-reviewer.md` or `orchestrator.md` agent definitions (out of scope for adapter alignment per v2 §7.1)

## Open Questions

| # | Question | Impact | Decision needed by |
|---|----------|--------|-------------------|
| 1 | Should `/run-wave` fail if the dispatched orchestrator did not emit its own session-level receipt under `.harness-state/`? Today only the wave-level skill receipt is required by §4.2. | Affects how strictly `/run-wave`'s `verification.results` reflects orchestrator state. Current spec leaves this implicit. | Phase 3 build (Tasks 8-9); resolve by build start. |
| 2 | When `/commit` advances multiple plan.md items in one go, does it emit one receipt or N? Current spec defaults to one receipt with `notes: "advances Wave N, Wave M"` and `operation_id = sha256_hex("commit\n<spec_path>")` keyed on the spec_path of the first-listed advance. Multiple commits advancing different wave subsets stay distinguishable via `idempotency_key` (which incorporates the staged-content digest). | Receipt cardinality and idempotency semantics for multi-advance commits. | Phase 3 build (Task 10); resolve before fixture authoring in Task 12. |
| 3 | Does the wave-shape signal #5 ("expected dispatch session > 30 minutes") get measured by the spec author or auto-derived from task count × stakes? Current spec defers to author judgment. | Subjectivity could cause classification drift. Acceptable for solo-dev meta-tooling repo; revisit if multi-dev consumers adopt. | Defer; revisit when this skill ships to a multi-dev consumer repo. |
| 4 | ~~Where does the receipt-emission helper live~~ — RESOLVED in revision: `skills/_shared/lib/emit-receipt.sh` (single shared helper), per Task 7. Duplication option rejected because the §3.0a lifecycle is too easy to drift across three copies; the trap-handling and atomic-rewrite logic must be identical to satisfy the audit-trail invariant. | n/a | Resolved. |
| 5 | Codex prompt portability criterion phrasing — should it explicitly forbid mentions of "Claude Code" in spec task bodies, or only flag specs where `Manual fallback:` is missing? Current spec leans toward the latter (less restrictive). | Affects false-positive rate of planning-loop reviews. | Phase 2 build (Task 4); validate on a fixture before locking. |
| 6 | The orphan-`started`-receipt recovery rule uses a 60-minute staleness threshold. Is 60 min the right constant, or should it be derived from `.harness-profile` (e.g., `harness.receipt_orphan_minutes`)? Current spec hard-codes 60 to avoid scope creep, but a long orchestrator dispatch could legitimately exceed it. | A wrong constant could cause the recovery path to falsely treat an in-flight `started` receipt as failed and double-emit. 60 min is a conservative ceiling for known dispatch sessions in this repo. | Defer to a follow-up spec if any consumer repo's dispatch routinely exceeds 60 min. Document the constant in the SKILL bodies so it's visible. |
| 7 | Should the preflight check also verify free disk space on `.harness-state/` (e.g., ≥10 KB available) rather than just write-permission? Current spec only checks writability via attempting to create a probe file. | A disk-full failure during started-receipt write would fall through to the `.recovery-needed` marker path, which is correct but noisier than aborting upfront. | Out of scope for Wave 1 — the writability probe (creating + deleting a tiny temp file) inherently catches disk-full. Revisit if it becomes a real failure mode. |
| 8 | Codex round-1 finding "receipt write failure is treated as non-rollbackable after primary state changes" was answered by §3.0a (preflight aborts BEFORE mutation) plus the `.recovery-needed` marker for post-mutation failures. The remaining question is whether the marker file should be machine-readable YAML (parseable by future recovery tooling) vs free-form one-line text. Current spec specifies one-line text for simplicity. | Affects future automation around recovery. | Defer; one-line text is sufficient for the manual-recovery audience this spec targets. |
| 9 | Codex round-2 F2 (receipt-schema divergence) — RESOLVED in round 3 by option (a): keep `idempotency_key` as `{value, trace}` mapping (Wave 5 deferral per v2 Open Q #9) AND drop the proposed command-specific `operation_target` in favor of the normative §4.2 `operation_id = sha256_hex("<command>\n<wave_id-or-spec_path-or-'-'>")`. This concentrates schema decisions in Wave 5 and keeps Wave 1 schema-conformant. | n/a | Resolved. |
| 10 | Codex round-2 F1 (operation_id success no-op bypasses content freshness) — RESOLVED in round 3: §3.0a now mandates two-stage recovery — Stage A uses `idempotency_key` for success no-op (so any input change invalidates the prior success), Stage B uses `operation_id` only for partial/aborted resume chaining. `operation_id` is NEVER a success shortcut. | n/a | Resolved. |
| 11 | Codex round-3 F2 (receipt examples spec'd with mapping idempotency_key while normative schema requires string) — DROPPED 2026-05-01 as **wrong-premise** per code-reviewer arbiter ruling: Wave 8 already shipped `{value, trace}` mapping form on master in `.harness-state/examples/manual-close-wave-6.yml` + `claude-close-wave-6.yml`; v2 spec Open Q #9 explicitly defers the shape decision to Wave 5 (signed-off), and §3.0 of this spec line 46 documents the deferral inheritance. Codex's recommendation rests on the false premise that the schema's current `string` typing is unanimously binding rather than under explicit, signed-off deferral. The divergence pre-exists Wave 1; this spec inherits it intentionally. | n/a | Wrong-premise; dropped. Wave 5 will ratify the shape. |
| 12 | Codex round-3 F1 (failed receipts treated as resumable beyond schema's partial/aborted-on-ambiguity scope) and F3 (mutating-command rollback journal omitted for `/close-wave` and `/commit` overlapping I/O) — RESOLVED 2026-05-01 by manual Option-4 application of arbiter Shape A + Shape B JSON edits to §3.0a (Stage B narrowed to `partial|aborted-on-ambiguity` only; atomic-rename overlapping-I/O protocol added with 3 acceptance criteria). | n/a | Resolved. |
