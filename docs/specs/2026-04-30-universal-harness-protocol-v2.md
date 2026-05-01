# Universal Harness Protocol v2 — protocol core, peer adapters, incremental adoption

**Status:** Draft v2
**Date:** 2026-04-30
**Driver:** Merge the shippable rigor of `2026-04-30-harness-evolution.md` with the protocol-first frame of `2026-04-30-universal-harness-protocol.md`. The harness must remain operable with git, editor, shell, and repo docs; Claude Code, Codex, trackers, PRs, and automation are adapters.

---

## Supersedes

This spec supersedes, but does not delete, these historical drafts:

- `docs/specs/2026-04-30-harness-evolution.md` — Claude-first roadmap draft; current `docs/plan.md` Wave 7 was written against this draft.
- `docs/specs/2026-04-30-universal-harness-protocol.md` — protocol-first alternative draft.

Both files remain useful as design history. New implementation specs should target this v2 unless explicitly stated otherwise.

If `docs/plan.md` Wave 7 remains pointed at `2026-04-30-harness-evolution.md`, update that plan entry before dispatch or add an explicit note that Wave 7 follows this v2 spec.

## 1. Goal

Create a universal harness protocol that can be followed by:

- a human using git + editor + shell
- Claude Code skills/subagents
- Codex prompts/runners
- optional PR visibility
- optional trackers such as Linear or GitHub Issues
- optional automation

The protocol owns durable state. Adapters implement or mirror the protocol; they do not define it.

### 1.1 Release milestones

To keep the goal honest, the spec splits delivery into two named milestones:

1. **Protocol-core release (Waves 0-4):** the protocol is implementable by a human + git + editor + shell, and by Claude Code via the existing skill suite. Codex support at this milestone is defined as "the prompt contract in §7.2 is sufficient for a Codex operator to execute every command row by hand," not "Codex runs autonomously." This release does NOT yet claim the universal goal in §1.
2. **Codex-compatible release (Wave 5 + follow-on Codex command specs):** the protocol gains at least one normative, fixture-verified Codex execution path per required command row. Only after this release ships can the spec claim the full universal goal.

Earlier portability claims in this spec apply to whichever milestone has shipped. Do not assert "universal" until Wave 5 has produced at least the Codex command specs listed in §4.1.

## 2. Doctrine

### 2.1 Manual protocol is primary

The baseline execution path is manual:

```text
read repo protocol files
read spec and plan
create branch/worktree
implement scoped task
run verification
write summary/receipt
merge only after gate
```

Claude Code and Codex may accelerate this path. A tracker may surface it. A PR may make it visible. None of those are allowed to be the only place where essential project state lives.

### 2.2 Completion rule

A protocol step is complete only when its repo artifacts are complete.

Chat history, Claude session state, Codex logs, Linear comments, and GitHub comments can provide context, but they are not the durable record unless summarized into repo artifacts.

### 2.3 Portability test

A new person or different LLM must be able to open the repo and answer:

1. What is active? `docs/plan.md ## Now`
2. What is blocked? `docs/plan.md ## Blocked`
3. What was shipped? `docs/waves/`
4. What verifies this? spec verify blocks + receipts
5. What do I do next? `WORKFLOW.md`

If any answer requires the original Claude/Codex session or a paid SaaS account, the harness is coupled too tightly.

## 3. Protocol Artifacts

Every consumer repo should converge on:

| Artifact | Purpose |
|---|---|
| `AGENTS.md` | Tool-neutral primary instructions for any agent or human reviewer |
| `CLAUDE.md` | Claude-specific addendum or pointer to `AGENTS.md`, not the universal protocol |
| `WORKFLOW.md` | Command matrix: Manual / Claude Code / Codex / Automation |
| `.harness-profile` | Repo-local config: quality gate, protected paths, tracker flag, project metadata |
| `docs/specs/` | Durable technical specs |
| `docs/plan.md` | Active board only |
| `docs/waves/` | Shipped wave summaries |
| `.harness-state/` | Machine-readable receipts and logs |
| `criteria/` | Shared quality rubrics |
| `parking_lot.md` | Deferred side quests |

## 4. Universal Command Contract

`WORKFLOW.md` is the spine of the protocol. Each command row must define at least Manual, Claude Code, and a Codex prompt-contract entry. `deferred decision` is NOT a permitted value for any required protocol command — every row resolves to either an executable adapter form or an explicit manual-equivalent prompt for Codex (see §4.1).

| Protocol command | Manual | Claude Code | Codex (prompt contract per §4.1) | Automation |
|---|---|---|---|---|
| Spec work | edit `docs/specs/YYYY-MM-DD-<topic>.md` | `/spec-planner` | `codex spec-writer` prompt: read `AGENTS.md` + `WORKFLOW.md`, draft spec to `docs/specs/YYYY-MM-DD-<topic>.md`, emit receipt | none |
| Review spec | read criteria and revise | `/planning-loop` | `codex spec-reviewer` prompt: read spec + `criteria/`, append review notes inline, emit receipt | optional later |
| Run wave | worktree + branch + implement + verify | `/run-wave` | `codex run-wave` prompt: read plan + spec, create branch, implement scoped task list, run verification, emit receipt; stop on ambiguity | future dispatcher |
| Accept wave | verify branch + merge + receipt | `/close-wave` | `codex close-wave` prompt: verify branch matches spec exit gate, run verification commands, write `docs/waves/` summary, emit receipt; merge step remains manual unless Wave 5 graduates the Codex merge path | future gated bot |
| Commit increment | stage explicit files + commit | `/commit` | `codex commit` prompt: stage explicit files only, run verification, write commit message per repo convention, emit receipt | CI checks only |
| Archive plan | move closed details to `docs/waves/` | `/archive-plan` | `codex archive-plan` prompt: move closed entries from `docs/plan.md` into `docs/waves/` summary files, emit receipt | none |
| Cross-repo status | inspect repos by hand | `/harness-status` | `codex harness-status` prompt: read registry, run read-only `git status`/`git worktree list` per repo, write summary under `.harness-state/`, emit receipt under `.harness-state/` | optional dashboard |

Each detailed command spec must include:

- input artifacts
- output artifacts
- manual fallback
- adapter behavior (one section per supported adapter, including Codex)
- stop conditions (Codex must stop on ambiguity rather than invent state)
- verification commands
- receipt shape (per §4.2 schema)
- portability check

### 4.1 Codex prompt contract

Codex adapter rows in §4 are not full command implementations — they are normative prompt contracts. Each Codex row shipped by Wave 5 (or by any later command-specific spec) must satisfy:

1. **Inputs:** prompt names every input artifact path explicitly. No "Codex figures out" inputs.
2. **Outputs:** prompt names every output artifact path and the receipt path under `.harness-state/`.
3. **Stop conditions:** prompt enumerates at least three stop-on-ambiguity triggers (missing input, ambiguous spec, verification failure) and instructs Codex to write a partial-completion receipt rather than guess.
4. **Verification:** prompt cites the verify commands from the relevant spec exit gate verbatim.
5. **Receipt shape:** prompt instructs Codex to emit a receipt that conforms to §4.2 — same fields, same format, regardless of which adapter generated it.
6. **Manual fallback parity:** the prompt contract must produce the same artifacts as a competent human running the manual column.

Wave 5's pilot deliverable is at minimum one Codex command spec that satisfies §4.1 for one row in §4. The Codex-compatible release (§1.1) requires §4.1-conforming specs for all required rows: Spec work, Review spec, Run wave, Accept wave, Commit increment, Archive plan, Cross-repo status.

### 4.2 Minimum shared receipt schema

Receipts are the durable contract between adapters. Every command row in §4, regardless of adapter, writes a receipt to `.harness-state/<command>-<wave-or-spec-id>-<timestamp>.yml` (or equivalent namespaced path) with the following fields. This applies to read-only commands as well — read-only means "writes nothing outside `.harness-state/` in any registered repo," not "writes nothing at all." The receipt is the durable audit trail and is mandatory.

| Field | Type | Required | Description |
|---|---|---|---|
| `receipt_id` | string | yes | Stable identifier: `<command>-<wave-or-spec-id>-<timestamp>`; reused across retries of the same logical operation |
| `command` | string | yes | Protocol command name as listed in §4 (`run-wave`, `close-wave`, `commit`, etc.) |
| `adapter` | string | yes | One of `manual`, `claude-code`, `codex`, `automation` |
| `wave_id` | string | conditional | Required for run-wave/close-wave/archive-plan; null for spec-only commands |
| `spec_path` | string | conditional | Required for spec-related commands; relative to repo root |
| `inputs` | list[string] | yes | Repo-relative paths of input artifacts read by the operation |
| `outputs` | list[string] | yes | Repo-relative paths of artifacts written or modified |
| `verification` | object | yes | `{ commands: list[string], results: list[{cmd, exit_code, summary}] }`; empty list allowed only for read-only commands |
| `started_at` | ISO-8601 timestamp | yes | UTC start time |
| `completed_at` | ISO-8601 timestamp | conditional | UTC end time on success; absent on partial completion |
| `status` | string | yes | One of `success`, `partial`, `failed`, `aborted-on-ambiguity` |
| `merge_sha` | string | conditional | Required when `command=close-wave` and `status=success` |
| `pr_url` | string | optional | Draft/visibility PR URL when present (Wave 3+) |
| `tracker_ref` | string | optional | External tracker issue ID when tracker adapter is enabled (Wave 4+) |
| `idempotency_key` | string | yes | Content-derived freshness key (per the canonical algorithm below); reruns with the same key MUST be detected and either resumed or no-op'd |
| `operation_id` | string | yes | Stable recovery-lookup identifier (per the algorithm in Recovery semantics below); does NOT change when input contents change mid-operation |
| `retry_of` | string | optional | `receipt_id` of the prior attempt this receipt supersedes; chains forward, never backward |
| `notes` | string | optional | Free-text adapter notes (Codex stop-reason, Claude session summary, etc.) |

Canonical idempotency-key derivation (NORMATIVE — all adapters MUST follow this exactly):

The `idempotency_key` is the lowercase hex SHA-256 digest of a UTF-8 byte string assembled from the following fields, joined with a single LF (`\n`) separator, with no leading/trailing whitespace and no trailing newline:

```text
field 1: command                  (string, exact value from §4 command column)
field 2: wave_id or spec_path     (whichever applies; if both apply, wave_id wins; if neither, the literal string "-")
field 3: input content digest     (defined below)
```

Input content digest:

- Sort `inputs` lexicographically by repo-relative path.
- For each input path, compute lowercase hex SHA-256 of the file's raw byte contents at the time work starts. If the path is missing on disk, use the literal string `MISSING`.
- Join entries as `<path>:<digest>` and concatenate with single LF separators.
- The input content digest is the lowercase hex SHA-256 of that joined string.

Excluded from the key by construction: `started_at`, `completed_at`, `adapter`, `notes`, `pr_url`, `tracker_ref`, `merge_sha`, `retry_of`, and the receipt path itself. Timestamps and adapter identity MUST NOT influence the key.

Consequences:

- Identical command + wave/spec + input contents across manual, Claude, and Codex adapters produces an identical `idempotency_key`. Wave 0's example-receipt exercise MUST demonstrate this with at least one manual/Claude pair sharing a key for the same logical operation; Wave 5 extends the same demonstration to a Codex-generated receipt.
- Editing any input file's contents invalidates the prior key. A success receipt whose `idempotency_key` does not match the current recomputed key MUST NOT be treated as a no-op — adapters re-run the operation and link via `retry_of` only when the prior key was for the same inputs.
- Path-only renames change the key (paths are part of the digest). This is intentional: a rename is a different operation.

Recovery semantics:

- Every receipt MUST also persist an `operation_id` field: lowercase hex SHA-256 of the UTF-8 string `<command>\n<wave_id-or-spec_path-or-"-">` (paths/IDs only, NO input content). Unlike `idempotency_key`, `operation_id` does not change when input file contents change mid-operation.
- Recovery search proceeds in two stages, in this order:
  1. **Exact-content match (no-op or content-equality resume):** Recompute the canonical `idempotency_key` and look for an existing receipt with that exact key. If found and `status=success`, the operation is a no-op and returns the existing receipt. If found and `status=partial|aborted-on-ambiguity`, the new attempt sets `retry_of` to that receipt's `receipt_id` and resumes from the next missing output.
  2. **Operation-identity fallback (mutated-input resume):** If no exact-content match exists, scan `.harness-state/` for receipts with the same `operation_id` and `status` in `partial|aborted-on-ambiguity`. The most recent such receipt MUST be treated as the in-progress attempt: the new run sets `retry_of` to that receipt's `receipt_id` and resumes from the next missing output recorded there. This rule is what makes mutating commands (`/archive-plan`, Review spec, Accept wave, `/close-wave`) resumable after interruption — by the time of retry, input contents on disk have already been mutated by the partial attempt, so the content-derived `idempotency_key` cannot match.
- Mutating commands (any command whose `outputs` overlap with its `inputs`, or which deletes/moves input artifacts) MUST either (a) write to a temp file and atomically rename into place once all changes for a given output are staged, OR (b) record a rollback journal entry in `.harness-state/` naming the original byte contents (or sha256 + git blob ref) of every input artifact about to be mutated, before mutating it. Recovery uses the journal to reconstruct the pre-mutation input state when validating progress.
- Partial-completion receipts MUST list every output produced before stopping; recovery resumes from the next missing output.
- Failed receipts (`status=failed`) MUST include a `verification.results` entry showing which command failed and its exit code.
- The receipt schema table above is amended to include `operation_id` (string, required, same derivation as defined here). Wave 0's example receipts MUST include this field; Wave 1's per-command fixtures MUST exercise the operation-identity fallback for at least one mutating command (`/archive-plan` is the simplest target once it lands in Wave 2; in Wave 1 use a `/close-wave` fixture that mutates `docs/plan.md` between attempts).

Wave 0's exit gate validates this schema AND the canonical key algorithm: it ships at least one manual-generated example and one Claude-generated example for the same logical operation, and a fixture or verification step proves they compute the same `idempotency_key` byte-for-byte. The Codex-compatible release (§1.1) requires at least one Codex-generated example per command row, and Wave 5's exit gate proves the Codex receipt's key matches the manual/Claude key for the same logical operation.

## 5. Source-of-Truth Rules

| Concern | Source of truth |
|---|---|
| Technical intent | `docs/specs/` |
| Active repo work | `docs/plan.md` |
| Cross-repo index | path-only central registry |
| Repo config | `.harness-profile` and repo protocol files |
| Shipped summaries | `docs/waves/` |
| Machine receipts | `.harness-state/` |
| Code review state | git branch / PR |
| Tracker status | optional mirror/cache |
| Agent instructions | `AGENTS.md` + `WORKFLOW.md` |

The central registry is an index only. It must not become a second `.harness-profile`.

Allowed registry fields:

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

Disallowed registry fields unless a later spec justifies them:

- main branch
- plan path
- waves path
- quality gate
- tracker team
- deploy command
- protected paths

Those belong in each repo.

## 6. Plan.md Maintenance Policy

`docs/plan.md` is an active board, not an archive.

Target shape:

```markdown
# Plan

## Now
- [ ] Wave N - <title>
  - spec: docs/specs/YYYY-MM-DD-<topic>.md
  - status: ready | running | review
  - exit gate: <one line>

## Next
- [ ] Wave N+1 - <title>

## Blocked
- [!] Wave N+2 - blocked on <decision/dependency>

## Recently Shipped
- [x] Wave N-1 - <title> -> docs/waves/YYYY-MM-DD-waveN-summary.md (<merge SHA>)
```

Rules:

- Completed wave detail moves to `docs/waves/`.
- `docs/plan.md` keeps active work, blocked work, next work, and recent one-line shipped entries.
- Archive is manual-triggered through `/archive-plan` or manual editing.
- No hook or cron mutates `docs/plan.md`.
- During migration, skills must support both old summary paths and `docs/waves/`.

## 7. Adapter Discipline

### 7.1 Claude Code adapter

Claude Code is the first implemented adapter, not the protocol owner.

Required discipline:

- Claude-specific state stays under `.claude/`.
- Work is resumable without the Claude session.
- `/spec-planner` emits manual fallback bullets for every task.
- `/planning-loop` flags specs that require a specific LLM/tool as the only execution path.
- `/run-wave` and `/close-wave` obey `WORKFLOW.md` and produce shared receipts.
- `/commit` can warn on plan-format drift but must not silently rewrite protocol state.

### 7.2 Codex adapter

Codex prompt contracts are protocol-level artifacts (see §4.1). The Codex column in §4 is normative for prompt shape; Wave 5 decides which Codex commands graduate from prompt contract to fixture-verified spec.

Any Codex command spec must:

- read `AGENTS.md` and `WORKFLOW.md`
- consume the same `docs/specs/`, `docs/plan.md`, `docs/waves/`, and `.harness-state/` artifacts as Claude/manual paths
- produce compatible summaries and receipts conforming to §4.2
- preserve manual fallback
- stop on ambiguity rather than invent Codex-only state
- avoid depending on Symphony Elixir prototype as a required runtime
- satisfy every §4.1 prompt-contract clause

Wave 5 is the decision point for whether to expand the Codex command suite beyond a pilot. It is NOT a prerequisite for protocol-core adoption (§1.1 milestone 1), but IS a prerequisite for the universal goal in §1 (§1.1 milestone 2). Adapter classes that have not produced §4.1-conforming specs cannot have their independence claimed by this spec.

### 7.3 PR visibility adapter

Draft PRs are visibility, not the merge protocol.

Safe v1:

- create draft PR only after a completed branch exists
- store PR URL in `.harness-state/`
- keep `/close-wave` responsible for verification, merge decision, plan update, and receipt
- do not switch to remote PR merge until a separate state-machine spec redesigns idempotency, conflict handling, and receipts

### 7.4 Tracker adapter

Trackers are optional convenience layers.

Permitted:

- mirror active work
- provide priority, assignment, comments, and notifications
- link specs, PRs, and receipts
- capture human decisions if they are copied back into repo artifacts

Forbidden:

- tracker-only specs
- tracker-only acceptance decisions
- tracker-only receipts
- mandatory paid-SaaS state for continuing work

The tracker pilot is tracker-agnostic. It may run on `wordwideAI`, but the spec should avoid Linear-specific vocabulary except where documenting the pilot adapter.

## 8. Wave Sequence

Six waves, each independently shippable. Stop after any wave if the next one does not pay for itself.

### Wave 0 - Protocol core and Wave 7 plan alignment (~3-4 days)

**Spec:** `docs/specs/YYYY-MM-DD-protocol-core.md`

**Deliverable:**

- add root `AGENTS.md`
- add root `WORKFLOW.md` populated from the §4 command matrix, including the Codex prompt-contract column
- resolve `AGENTS.md` vs `CLAUDE.md`: `AGENTS.md` is tool-neutral primary; `CLAUDE.md` is Claude-specific addendum or pointer
- add `protocol_baseline: true` to `.harness-profile` after protocol files exist
- update current `docs/plan.md` Wave 7 to point at the v2-derived implementation spec, or explicitly note this v2 supersedes the old target
- materialize the §4.2 receipt schema as `docs/protocol/receipt-schema.md` (or equivalent path; checked into the repo) including all required fields, conditional rules, and recovery semantics
- produce a manual-generated example receipt and a Claude-generated example receipt under `.harness-state/examples/` that both validate against the schema
- materialize §4.1 Codex prompt contract as `docs/protocol/codex-prompt-contract.md` so Wave 5 inherits a stable target

**Manual fallback:** read and follow `AGENTS.md` + `WORKFLOW.md` by hand; receipts hand-authored in YAML against the §4.2 schema.

**Exit gate:**

- `test -f AGENTS.md` exits 0
- `test -f WORKFLOW.md` exits 0
- `test -f docs/protocol/receipt-schema.md` exits 0
- `test -f docs/protocol/codex-prompt-contract.md` exits 0
- `grep -F 'AGENTS.md' CLAUDE.md` matches, or `CLAUDE.md` is absent by explicit decision
- `grep -q '^protocol_baseline: true$' .harness-profile` exits 0
- `grep -c '^| .* | .* | .* | .* | .* |$' WORKFLOW.md` returns at least 8
- `WORKFLOW.md` contains zero occurrences of `deferred decision` for required protocol commands
- `.harness-state/examples/` contains at least one manual-adapter receipt and one claude-code-adapter receipt; both pass schema validation (manual or scripted)
- `.harness-state/wave<N>-verification.md` records the five portability-test answers for this repo, where `<N>` is the implementing wave's number in the consumer repo's plan.md (claude-harness uses `wave8-verification.md` since plan.md Wave 8 dispatches v2 Wave 0)
- Wave 7 plan entry no longer ambiguously targets a superseded spec

**Updates `WORKFLOW.md`?** Yes, creates it.

### Wave 1 - Claude Code adapter alignment (~4-6 days)

**Spec:** `docs/specs/YYYY-MM-DD-claude-adapter-alignment.md`

**Deliverable:**

- refine `.claude/agents/spec-planner.md`:
  - every implementation task gets a `Manual fallback` bullet
  - specs adding user-facing commands must include a `WORKFLOW.md` row delta
- refine `skills/planning-loop/SKILL.md`:
  - Codex review prompt gains portability criterion
  - preflight rejects specs that add commands without `WORKFLOW.md` row delta
- add/adjust planning-loop fixtures for missing manual fallback and missing workflow delta
- update each existing Claude command skill so it emits a §4.2-valid receipt under `.harness-state/`, using the canonical `idempotency_key` algorithm and the exempt-output rule for read-only commands. Required commands in this wave: `/run-wave`, `/close-wave`, `/commit`, `/archive-plan` (whose skill lands in Wave 2 — its §4.2 wiring is part of that wave's deliverable, not this one), and `/harness-status` (also Wave 2). For Wave 1, the binding scope is `/run-wave`, `/close-wave`, and `/commit`.
- ship at least one fixture-verified success receipt and one fixture-verified partial/failed receipt per command in scope, stored under `.harness-state/examples/wave1/` and validated by `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` (or an equivalent receipt-validator script invoked by it)
- keep command names and core semantics unchanged

**Manual fallback:** a human writes specs with manual fallback bullets, checks `WORKFLOW.md` deltas by inspection, and hand-authors §4.2 receipts in YAML when running commands without a Claude session.

**Exit gate:**

- `grep -q 'Manual fallback' .claude/agents/spec-planner.md` exits 0
- `grep -q 'WORKFLOW.md row delta' .claude/agents/spec-planner.md` exits 0
- `grep -qi 'portability' skills/planning-loop/SKILL.md` exits 0
- `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` exits 0
- one sample spec-planner dry run contains per-task manual fallback bullets
- `/run-wave`, `/close-wave`, and `/commit` each produce a §4.2-valid success receipt during their fixture run; the receipt's `command`, `adapter=claude-code`, `idempotency_key` (computed per the §4.2 canonical algorithm), `inputs`, `outputs`, `verification`, and `status=success` fields are present and valid
- `/run-wave`, `/close-wave`, and `/commit` each produce a §4.2-valid partial or failed receipt under a deliberately-broken fixture, with `status` set to `partial`, `failed`, or `aborted-on-ambiguity` and `verification.results` populated when applicable
- a fixture proves that running the same logical operation twice (same inputs, same wave/spec) yields the same `idempotency_key` and the second invocation no-ops to the first receipt

**Updates `WORKFLOW.md`?** No new protocol command; clarifies existing rows by citing the §4.2 receipt path each Claude command writes to.

### Wave 2 - Plan maintenance and registry/status (~1 week)

**Spec:** `docs/specs/YYYY-MM-DD-plan-registry-maintenance.md`

This wave is one roadmap wave but must be implemented as independently verifiable tasks:

1. define active-board `docs/plan.md` format
2. define `docs/waves/` summary/archive convention
3. implement `/archive-plan`
4. add path-only central registry
5. implement read-only `/harness-status`

**Deliverable:**

- convert `claude-harness` `docs/plan.md` to active-board format
- preserve completed wave detail in `docs/waves/`
- implement `/archive-plan` and emit a §4.2-valid receipt under `.harness-state/` per invocation
- create path-only registry
- implement `/harness-status` read-only scan that emits a §4.2-valid receipt and writes its summary under `.harness-state/` (no writes elsewhere)
- ensure other registered repos can remain pre-conversion without false failures

**Manual fallback:** edit `docs/plan.md`, move closed wave detail to `docs/waves/`, and run `git status` / `git worktree list` per repo by hand.

**Exit gate:**

- `claude-harness` `docs/plan.md` has Now / Next / Blocked / Recently Shipped sections
- all existing completed claude-harness wave details are preserved in `docs/waves/`
- `/archive-plan` is idempotent and emits a §4.2-valid receipt with the canonical `idempotency_key`
- registry contains only `id`, `path`, and optional `group`
- `/harness-status` never writes outside `.harness-state/` in any repo it scans (no commits, no branch changes, no edits to `docs/plan.md`, `docs/specs/`, `docs/waves/`, source files, or `.harness-profile`); the only writes permitted are the summary file and the §4.2 receipt under `.harness-state/` of the invoking repo
- `/harness-status` emits a §4.2-conforming receipt at `.harness-state/harness-status-<timestamp>.yml` with `status=success` and `verification.commands` listing the read-only git commands run; `outputs` lists the summary path under `.harness-state/`
- `/harness-status` reports pre-conversion repos without failing the whole scan
- `/harness-status` matches manual `git status` ground truth for registered repos

**Updates `WORKFLOW.md`?** Yes, adds `/archive-plan` and `/harness-status` rows.

### Wave 3 - Draft PR visibility, not merge replacement (~4-6 days)

**Spec:** `docs/specs/YYYY-MM-DD-draft-pr-visibility.md`

**Deliverable:**

- add optional draft PR creation only after completed branch/worktree exists
- record PR URL, branch, and wave number in `.harness-state/`
- update `/close-wave` to display PR link if present
- keep local `/close-wave` merge, conflict handling, plan update, and receipt model intact

**Manual fallback:** push completed branch and run `gh pr create --draft` by hand after verifying branch contents.

**Exit gate:**

- draft PR creation cannot run before a completed branch exists
- `/close-wave` works with a PR link present
- `/close-wave` works with no PR link present
- PR URL is not treated as the durable receipt
- no `gh pr merge` path is introduced in this wave

**Updates `WORKFLOW.md`?** Yes, clarifies PR visibility under run/accept wave rows.

### Wave 4 - Tracker pilot, tracker-agnostic (~2 weeks observation)

**Spec:** `docs/specs/YYYY-MM-DD-tracker-pilot.md`

**Deliverable:**

- pilot one tracker on one repo, likely `wordwideAI`
- document tracker issue ID convention for branch, commit trailer, PR title, and spec link
- keep tracker states minimal and adapter-local
- copy human decisions back into repo specs or receipts
- decide after observation whether to expand, keep manual, or abandon

**Manual fallback:** ignore tracker and use `docs/plan.md`, specs, branches, and receipts.

**Exit gate:**

- disabling the tracker leaves the repo operable
- tracker-only decisions are copied into repo artifacts
- pilot decision is recorded in a repo doc or receipt
- core harness docs do not require Linear-specific vocabulary

**Updates `WORKFLOW.md`?** Yes, only in pilot repo if tracker is enabled there.

### Wave 5 - Codex adapter pilot and decision (~1 week pilot, expansion TBD)

**Spec:** `docs/specs/YYYY-MM-DD-codex-adapter-decision.md`

**Important:** This wave is the gate between the protocol-core release (§1.1 milestone 1) and the Codex-compatible release (§1.1 milestone 2). It MUST ship at least one §4.1-conforming Codex command spec with passing fixtures. It does not pre-commit to building the full Codex command suite — that follow-on work is scoped by a separate later spec.

**Required deliverable (not optional):**

- one §4.1-conforming Codex command spec, default target `codex spec-writer`
- the spec includes inputs, outputs, stop conditions, verification commands cited verbatim from the relevant exit gate, §4.2-conforming receipt shape, and explicit manual fallback parity
- at least one fixture run that produces a valid `.harness-state/` receipt indistinguishable in shape from the Claude/manual-generated examples shipped in Wave 0

**Optional deliverable:**

- a second Codex command spec to validate round-trip value
- a comparative effort/quality/portability note in the Wave 5 receipt

**Manual fallback:** execute the same command row manually from `WORKFLOW.md`.

**Exit gate:**

- at least one Codex adapter spec obeys §4.1 prompt-contract clauses and §7.2 discipline rules
- pilot output writes repo artifacts, not Codex-only state
- pilot receipt validates against §4.2 schema
- decision recorded: expand Codex adapter to remaining command rows, keep at one-command pilot, or abandon
- if decision is "expand," a follow-on spec path is named in the Wave 5 receipt
- if decision is "keep at one-command pilot" or "abandon," the universal goal in §1 is explicitly downgraded in the Wave 5 receipt to "Claude+manual independent; Codex prompt-contract documented but not adapter-verified," and §1 is updated by a follow-up commit to match

**Updates `WORKFLOW.md`?** Yes — the piloted command graduates from prompt-contract-only to fixture-verified adapter; row entry is updated to cite the new command spec.

**Universal goal exit condition:** This spec cannot claim "universal harness protocol" per §1 until at least the Wave 5 pilot ships AND a follow-on spec brings the remaining required command rows up to §4.1 conformance. If Wave 5 ends in "keep opportunistic" or "abandon," the §1 goal is explicitly amended to drop the Codex-independent claim.

## 9. What Stays Stable

The following command names and current Claude Code semantics stay stable until their adapter-alignment specs explicitly change them:

- `/spec-planner`
- `/planning-loop`
- `/run-wave`
- `/close-wave`
- `/commit`
- `/triage-parking`
- `/apply-anthropic-reviews`
- `/micro`
- `/session-start`
- `/session-end`

The protocol can add manual/Codex/tracker equivalents without renaming working Claude commands.

## 10. Risk Register

| Risk | Mitigation |
|---|---|
| Universal protocol becomes abstract ceremony | Every wave ships concrete files, skills, or receipts |
| Claude Code remains the de facto protocol | `AGENTS.md`, `WORKFLOW.md`, and §4.1 prompt contracts require normative Codex entries; §1.1 split prevents claiming "universal" until Wave 5 ships |
| Codex work becomes overbuilt | Wave 5 ships one §4.1-conforming command spec; full-suite expansion is a separate later spec |
| Codex column quietly stays unimplemented | §4 forbids `deferred decision`; §1.1 milestone 2 requires §4.1-conforming Codex specs for every required row before "universal" claim ships |
| Receipt format diverges across adapters | §4.2 minimum schema is materialized in Wave 0; manual + Claude examples validate before Wave 1; Codex example required at Wave 5 |
| Idempotency keys diverge across adapters or invalidate incorrectly | §4.2 pins the canonical SHA-256 derivation including input-content hashing and field exclusions; Wave 0 ships a cross-adapter equality fixture for manual+Claude; Wave 5 extends it to Codex |
| Read-only commands lack a durable audit trail | §4.2 narrows "read-only" to "writes nothing outside `.harness-state/`"; `/harness-status` exit gate explicitly requires a §4.2-valid receipt and bounds the summary path to `.harness-state/` |
| Registry competes with repo config | Registry is path-only; `.harness-profile` remains repo-local config |
| `docs/plan.md` keeps growing | `/archive-plan` moves closed detail to `docs/waves/` |
| PR visibility breaks close-wave safety | Draft PRs are visibility only; no remote PR merge in Wave 3 |
| Tracker becomes SaaS lock-in | Tracker-only decisions/receipts/specs are forbidden |
| Cross-repo rollout blocks local progress | Per-repo adoption is independent; other repos may remain pre-conversion |

## 11. Open Questions

1. Should `CLAUDE.md` be a one-line pointer plus Claude-specific overrides, or should it be omitted in repos where `AGENTS.md` is enough?
2. ~~Minimum receipt schema~~ — Resolved in §4.2; Wave 0 materializes the schema and example receipts.
3. Where should the path-only registry live: `~/.harness/projects.yml` or `~/.config/harness/projects.yml`?
4. Should `/archive-plan` be offered by `/commit` when `docs/plan.md` exceeds a threshold, or remain manually invoked only?
5. Which tracker should the pilot use, and what repo should host it?
6. Which single Codex command should Wave 5 pilot first if the detailed spec proceeds? Default: `codex spec-writer`. (The pilot itself is now mandatory per Wave 5 exit gate; only the choice of first command remains open.)
7. After Wave 5, in what order should the remaining Codex command rows graduate from §4.1 prompt-contract-only to fixture-verified specs? This is parked for the follow-on Codex-suite spec, not for this protocol-core spec.
8. ~~"Codex rows do not meet the spec's own explicit-input contract" (round-3 Codex finding F2)~~ — Dropped 2026-04-30 as wrong-premise per code-reviewer arbiter ruling: §4.1 line ~122 explicitly states Codex adapter rows in §4 are normative *prompt contracts*, not full command implementations; canonical paths are pinned globally in §3 (Protocol Artifacts), §4.2 (receipt path template), and §5 (Source-of-Truth Rules); the only genuinely deferred path (registry location) is parked above as Open Q #3. Per-row argument-and-path resolution is the responsibility of each Codex command's detail spec under Wave 5+, not this universal protocol.
8. ~~`idempotency_key` derivation algorithm~~ — Resolved in §4.2; canonical SHA-256 over `command \n wave_id|spec_path|"-" \n input-content-digest`, with input-content-digest defined as SHA-256 of sorted `<path>:<sha256>` lines. Wave 0 ships a cross-adapter equality fixture; Wave 5 extends it to Codex.
9. **Receipt `idempotency_key` field shape — string vs mapping.** Surfaced 2026-05-01 by per-commit `/codex:review` of Wave 8 commit `f34cb9c`. The §4.2 schema table types `idempotency_key` as `string`, but Wave 8's receipt-author also needed to embed the frozen pre-image trace (per Wave 8 exit gate's `recompute-keys.sh` requirement). Orchestrator shipped the field as a YAML mapping `{value: <hex>, trace: {...}}`. Cross-adapter equality is mechanically verified (`recompute-keys.sh` exits 0; both keys = `238e61ca…39587b`), so the universal claim holds regardless of shape. **Decision needed before Wave 5 ships its first Codex receipt:** (a) amend §4.2 schema row to allow mapping shape with `value` + `trace` sub-fields, OR (b) keep `idempotency_key` as scalar string and add a sibling field `idempotency_trace` (or `idempotency_key_trace`) for the pre-image. Option (b) is cleaner — preserves the string typing other tools may consume directly; option (a) keeps shape coupled to derivation. Both Wave 8's `manual-close-wave-6.yml` and `claude-close-wave-6.yml` would need post-merge migration if (b) is chosen.

## 12. Sequence Summary

```text
=== Protocol-core release (§1.1 milestone 1) ===

Wave 0: protocol core and Wave 7 plan alignment
  -> establishes tool-neutral protocol files, materializes receipt schema (§4.2)
     and Codex prompt contract (§4.1), resolves AGENTS/CLAUDE

Wave 1: Claude Code adapter alignment
  -> /run-wave, /close-wave, /commit obey the universal command contract,
     emit §4.2-valid receipts with canonical idempotency keys, and ship
     fixture-verified success + partial/failed examples

Wave 2: plan maintenance and registry/status
  -> plan.md becomes lean; /archive-plan and /harness-status land with
     §4.2-valid receipts; cross-repo visibility appears without tracker lock-in

Wave 3: draft PR visibility
  -> in-flight work becomes visible without replacing close-wave safety

Wave 4: tracker pilot
  -> optional external queue is tested without becoming foundation

(End of protocol-core release. "Universal" claim is NOT yet valid — Codex
support exists only as a documented prompt contract, not a verified adapter.)

=== Codex-compatible release (§1.1 milestone 2) ===

Wave 5: Codex adapter pilot
  -> at least one §4.1-conforming Codex command spec ships with passing fixtures
     and §4.2-conforming receipt; decision recorded on whether to expand suite

Follow-on (separate spec, not in this roadmap):
  -> remaining required command rows graduate from prompt contract to
     fixture-verified Codex specs; only after this completes can the universal
     goal in §1 be claimed without amendment
```

The intended end state is not Claude-first, Codex-first, or tracker-first. It is protocol-first, with replaceable adapters. The two-milestone split is what keeps that promise honest.
