# Universal Harness Protocol — portable core, replaceable adapters

**Status:** Draft alternative spec
**Date:** 2026-04-30
**Driver:** A harness that depends on Claude Code, Codex, Linear, or any one SaaS/tool becomes a weakness. The protocol must remain operable with git, editor, shell, and repo docs; agents and trackers are adapters.

---

## 1. Goal

Define a universal harness protocol that can be executed by:

- a human using git + editor + shell
- Claude Code skills/subagents
- Codex prompts/runners
- optional automation
- optional trackers such as Linear or GitHub Issues

The protocol owns durable project state. Adapters accelerate the protocol but never become the source of truth.

## 2. Doctrine

### 2.1 Protocol first

The harness is the repo-local operating protocol:

| Artifact | Purpose |
|---|---|
| `AGENTS.md` | Tool-neutral agent instructions and repository map |
| `WORKFLOW.md` | Command matrix: Manual / Claude Code / Codex / Automation |
| `docs/specs/` | Durable technical specs and implementation contracts |
| `docs/plan.md` | Active board only: Now / Next / Blocked / Recently Shipped |
| `docs/waves/` | Shipped wave summaries and human-readable receipts |
| `.harness-state/` | Machine-readable run state, receipts, and logs |
| `criteria/` | Quality rubrics shared by all adapters |
| `parking_lot.md` | Deferred work that should not interrupt the current goal |

### 2.2 Adapters second

Adapters are replaceable frontends:

| Adapter | Role |
|---|---|
| Manual | Baseline execution path; must always work |
| Claude Code | Skills and subagents that implement protocol commands |
| Codex | Prompts, workflows, or runners that implement protocol commands |
| Tracker | Linear/GitHub/Jira sync layer; never durable-only truth |
| Automation | Optional daemon or CI helper; never bypasses gates |

### 2.3 Completion rule

A protocol step is complete only when its repo artifacts are complete.

Chat history, Claude session state, Codex logs, Linear comments, and SaaS issue states may help, but they do not count as the durable record unless summarized into repo artifacts.

### 2.4 Portability test

A new person or different LLM must be able to open the repo and answer:

1. What is active? `docs/plan.md ## Now`
2. What is blocked? `docs/plan.md ## Blocked`
3. What was shipped? `docs/waves/`
4. What verifies this? spec verify blocks + receipt
5. What do I do next? `WORKFLOW.md`

If any answer requires the original Claude/Codex session or a paid SaaS account, the protocol is too coupled.

## 3. Non-goals

- Replacing existing Claude Code skills in the first wave.
- Making Codex the new primary harness runtime.
- Making Linear or any tracker mandatory.
- Building a daemon before manual and one-shot adapter paths are proven.
- Auto-merging agent work.
- Moving protocol state into `.claude/`, `.codex/`, Linear, or GitHub comments only.
- Reorganizing the repo into large `protocol/` and `adapters/` trees before the contracts stabilize.

## 4. Universal command contract

Every harness command must define the same four execution forms:

| Protocol command | Manual | Claude Code | Codex | Automation |
|---|---|---|---|---|
| Spec work | edit `docs/specs/...` | `/spec-planner` | `codex spec-writer` | none |
| Review spec | read criteria and revise | `/planning-loop` | `codex spec-loop` | optional reviewer job |
| Run wave | create worktree, implement tasks, verify | `/run-wave` | `codex run-wave` | future dispatcher |
| Accept wave | verify branch, merge, write receipt | `/close-wave` | `codex accept-wave` | future gated bot |
| Commit increment | stage explicit files, review, commit | `/commit` | `codex commit-check` | CI check only |
| Archive plan | move closed wave detail to `docs/waves/` | `/archive-plan` | `codex archive-plan` | none |
| Cross-repo status | inspect each repo | `/harness-status` | `codex harness-status` | optional dashboard |

Each command spec must include:

- input artifacts
- output artifacts
- manual fallback
- adapter-specific implementation notes
- stop conditions
- verification
- receipt shape

## 5. Source-of-truth rules

| Concern | Source of truth |
|---|---|
| Technical intent | `docs/specs/` |
| Active repo work | `docs/plan.md` |
| Cross-repo index | central registry path list only |
| Shipped summaries | `docs/waves/` |
| Machine receipts | `.harness-state/` |
| Code review state | Git branch / PR |
| Tracker status | tracker adapter cache, optional |
| Agent instructions | `AGENTS.md` + `WORKFLOW.md` |

The central registry must not duplicate repo operational config. It may store `id`, `path`, and display grouping. Per-repo details such as main branch, tracker settings, quality gate, plan path, and protected paths live in each repo's `.harness-profile` or protocol files.

Example:

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

## 6. Plan.md maintenance policy

`docs/plan.md` is an active board, not a permanent archive.

Required shape:

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
- `docs/plan.md` keeps only active work and recent one-line shipped entries.
- Archive actions are manual-triggered, not hooks or cron.
- Existing skills must support both old and new summary locations during migration.
- `close-wave` writes or links the shipped summary before marking the wave fully closed.

## 7. Adapter contract

### 7.1 Claude Code adapter

Claude Code skills remain valid only if they satisfy the universal command contract.

Required updates:

- `/spec-planner` emits manual fallback for every task.
- `/planning-loop` reviews specs for protocol portability.
- `/run-wave` consumes the active-board `docs/plan.md` shape.
- `/close-wave` writes compatible `docs/waves/` summaries and `.harness-state/` receipts.
- `/commit` warns when `docs/plan.md` drifts from active-board shape.

Claude-specific state must stay under `.claude/` and must not be required to resume work manually.

### 7.2 Codex adapter

Codex must be implemented as a peer adapter, not as a replacement protocol.

Required command specs:

- `codex spec-writer`
- `codex spec-loop`
- `codex run-wave`
- `codex accept-wave`
- `codex commit-check`
- `codex archive-plan`
- `codex harness-status`

Each Codex command must:

- read `AGENTS.md` and `WORKFLOW.md`
- consume the same `docs/specs/`, `docs/plan.md`, `docs/waves/`, and `.harness-state/` artifacts as Claude
- produce the same receipt and summary formats
- stop on ambiguity rather than invent tracker or adapter state
- include a manual fallback in its own spec

Codex may use Symphony-like ideas such as isolated workspaces, bounded concurrency, and structured logs, but not the prototype implementation as a required dependency.

### 7.3 Tracker adapter

Trackers are convenience layers.

Permitted:

- mirror active work into Linear/GitHub Issues
- store priority, assignment, comments, and notifications
- link issues to specs, PRs, and receipts
- import explicit human decisions back into repo docs

Forbidden:

- tracker-only specs
- tracker-only acceptance decisions
- tracker-only receipts
- mandatory SaaS state for continuing work

If a tracker is disabled, the repo must remain operable from `docs/plan.md`, specs, branches, and receipts.

### 7.4 PR visibility adapter

Draft PRs can provide an in-flight dashboard, but they are not the merge protocol by default.

The safe v1 rule:

- completed worktree branches may open draft PRs for visibility
- `/close-wave` still owns verification, merge decision, plan update, and receipt
- changing to PR-first remote merge requires a separate state-machine spec

## 8. Wave sequence

Each wave is independently shippable. Stop after any wave if the next one does not pay for itself.

### Wave 0 - Protocol core

**Spec:** `docs/specs/YYYY-MM-DD-protocol-core.md`

**Deliverable:**

- create root `AGENTS.md`
- create root `WORKFLOW.md`
- define universal command contract
- define receipt and wave-summary formats
- define active-board `docs/plan.md` shape
- define adapter completion rule

**Manual fallback:** write/read the protocol files by hand and follow the command matrix.

**Exit gate:**

- protocol portability test passes for this repo
- `WORKFLOW.md` has Manual / Claude Code / Codex / Automation columns
- no command is documented only as a Claude, Codex, or SaaS action

### Wave 1 - Claude Code adapter alignment

**Spec:** `docs/specs/YYYY-MM-DD-claude-adapter-alignment.md`

**Deliverable:**

- update `/spec-planner` for manual fallback bullets
- update `/planning-loop` for portability review
- update `/run-wave` for protocol baseline preflight
- update `/close-wave` for `docs/waves/` compatibility
- update `/commit` for plan-shape warnings

**Manual fallback:** execute each command's Manual column in `WORKFLOW.md`.

**Exit gate:**

- fixture spec without manual fallback is rejected or flagged
- a protocol-compliant spec passes planning-loop review
- close-wave can discover summaries in both old and new locations

### Wave 2 - Codex adapter protocol specs

**Spec:** `docs/specs/YYYY-MM-DD-codex-adapter-specs.md`

**Deliverable:**

- write Codex specs for `spec-writer`, `spec-loop`, `run-wave`, `accept-wave`, `commit-check`, `archive-plan`, and `harness-status`
- define prompt locations and invocation forms
- define how Codex reads repo protocol files
- define output receipt compatibility

**Manual fallback:** every Codex command spec includes the Manual column from `WORKFLOW.md`.

**Exit gate:**

- no Codex spec stores durable state only in Codex logs
- all Codex commands produce artifacts compatible with Claude/manual flows
- one dry-run command can explain what it would read/write without changing files

### Wave 3 - Plan maintenance

**Spec:** `docs/specs/YYYY-MM-DD-plan-maintenance.md`

**Deliverable:**

- convert this repo to active-board `docs/plan.md`
- add `docs/waves/`
- implement `/archive-plan`
- update summary discovery in `/run-wave` and `/close-wave`

**Manual fallback:** cut closed wave blocks into `docs/waves/` and replace them with one-line shipped entries.

**Exit gate:**

- `docs/plan.md` contains only Now / Next / Blocked / Recently Shipped
- all completed wave detail is preserved in `docs/waves/`
- archive command is idempotent
- old summary links still resolve during migration

### Wave 4 - Central registry and status

**Spec:** `docs/specs/YYYY-MM-DD-harness-registry-status.md`

**Deliverable:**

- create central path-only registry
- implement read-only `/harness-status`
- optionally implement Codex-equivalent `harness-status`

**Manual fallback:** run `git status`, inspect `docs/plan.md`, and list worktrees in each registered repo by hand.

**Exit gate:**

- registry stores no duplicate operational config
- status scan never writes
- results match manual git status for registered repos
- missing repos and missing protocol files are reported clearly

### Wave 5 - Draft PR visibility

**Spec:** `docs/specs/YYYY-MM-DD-draft-pr-visibility.md`

**Deliverable:**

- add optional draft PR creation after a wave branch has real commits
- record PR URL in `.harness-state/`
- keep local close-wave safety model intact

**Manual fallback:** push completed branch and run `gh pr create --draft` by hand.

**Exit gate:**

- draft PR creation never runs before the completed branch exists
- close-wave can proceed with or without a PR
- PR URL is a visibility link, not the durable receipt

### Wave 6 - Tracker pilot

**Spec:** `docs/specs/YYYY-MM-DD-tracker-pilot.md`

**Deliverable:**

- pilot one tracker on one repo
- document issue/spec/PR/receipt linking convention
- snapshot tracker decisions back into repo artifacts

**Manual fallback:** ignore tracker and use `docs/plan.md`.

**Exit gate:**

- disabling tracker leaves the repo operable
- tracker-only decisions are copied into specs or receipts
- pilot decision is recorded: expand, keep manual, or abandon

## 9. Risk register

| Risk | Mitigation |
|---|---|
| Universal protocol becomes abstract ceremony | Each wave must ship a concrete repo artifact or skill change |
| Claude adapter remains de facto primary | Manual and Codex columns are required in `WORKFLOW.md`; completion requires repo artifacts |
| Codex adapter drifts into separate workflow | Codex outputs must match shared receipt/summary formats |
| Registry competes with `.harness-profile` | Registry is path-only; repo config stays repo-local |
| `docs/plan.md` still grows into archive | `/archive-plan` is manual-triggered and idempotent |
| PR visibility accidentally replaces close safety | PR-first merge requires separate state-machine spec |
| Tracker becomes SaaS lock-in | Tracker adapter cannot own specs, decisions, or receipts exclusively |

## 10. Open questions

1. Should `AGENTS.md` replace `CLAUDE.md`, or should `CLAUDE.md` become a Claude-specific addendum?
2. Should Codex prompts live under `.codex/prompts/`, `skills/codex-*`, or both?
3. What is the minimum machine-readable receipt schema needed for both Claude and Codex?
4. Should `/archive-plan` be offered by `/commit` when `docs/plan.md` exceeds a threshold, or remain manually invoked only?
5. Which repo should host the first Codex adapter dry run?

## 11. Sequence summary

```text
Wave 0: protocol core
  -> establishes manual-first, adapter-neutral foundation

Wave 1: Claude Code adapter alignment
  -> existing skills obey the shared protocol

Wave 2: Codex adapter protocol specs
  -> Codex becomes a peer implementation path

Wave 3: plan maintenance
  -> plan.md remains an active board instead of an archive

Wave 4: central registry and status
  -> cross-repo visibility without tracker lock-in

Wave 5: draft PR visibility
  -> in-flight branches become visible without replacing close safety

Wave 6: tracker pilot
  -> optional SaaS convenience is tested without becoming foundation
```

The intended end state is not Claude-first or Codex-first. It is protocol-first, with Manual, Claude Code, Codex, and optional automation as interchangeable execution paths.
