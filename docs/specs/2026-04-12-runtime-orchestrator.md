# Runtime Orchestrator — Dispatch spec tasks to the right model at execution time

## Overview

An agent that reads spec tasks and dispatches each to an opus, sonnet, or haiku subagent based on task complexity — decided at runtime, not at spec-writing time. Follows Anthropic's orchestrator-worker pattern where "a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results."

The orchestrator is Opus. It reads a spec phase, evaluates each task, picks the right model, spawns workers, verifies results, and commits. Tasks with non-overlapping files run in parallel using worktrees; overlapping tasks run sequentially.

Enabled/disabled via `.harness-profile`.

## Prior Work

Builds on:
- [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — orchestrator-worker pattern, runtime routing
- [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) — Opus lead + Sonnet workers, 90% improvement over solo Opus
- Existing harness: spec-planner (writes specs with tasks), `/commit` skill (review + plan update), code-reviewer (quality gate)

Assumes: spec files follow the spec-planner output format with `Files:`, `Depends on:`, and `Verify:` fields per task.

## Requirements

### Phase 1: Sequential orchestration

#### Core dispatch loop

The orchestrator reads a spec phase, evaluates each task, routes it to a model, and runs it through `/commit`.

**Acceptance criteria:**
- [ ] Reads a spec file and phase number, extracts tasks in dependency order
- [ ] For each task, evaluates complexity and selects a model (opus/sonnet/haiku)
- [ ] Spawns a subagent with the selected model, passing: task description, files, verification step, and relevant project context
- [ ] After subagent completes, runs the Verify step from the spec
- [ ] If verification passes → runs `/commit` skill (review + plan update + spec checklist)
- [ ] If verification fails → promotes to opus and retries once; if opus also fails → stops and asks user
- [ ] Prints routing decision for each task: "Task 3 → Sonnet: straightforward CRUD endpoints"
- [ ] Error case: spec file not found → clear error message
- [ ] Error case: task has unmet dependency → skip and report

#### Routing logic

How the orchestrator decides which model handles a task.

**Acceptance criteria:**
- [ ] Routes based on task characteristics, not hardcoded rules
- [ ] Considers: number of files touched, whether task creates new architecture or follows existing patterns, whether task description contains ambiguity, project stakes level from `.harness-profile`
- [ ] General guidelines (soft, orchestrator can override): haiku for read-only/scan/boilerplate tasks; sonnet for standard implementation following established patterns; opus for architecture decisions, complex algorithms, ambiguous requirements
- [ ] High-stakes projects (`stakes.level: high`) → never route code-writing tasks to haiku
- [ ] Routing decision is logged with one-line justification per task

#### Enable/disable toggle

**Acceptance criteria:**
- [ ] Reads `model_routing: on | off` from `.harness-profile`
- [ ] When `off` (default): orchestrator still reads specs and runs tasks sequentially, but all tasks run on the current session's model (no subagent spawning). Behaves like a guided `/micro` loop.
- [ ] When `on`: full routing with model selection and subagent dispatch
- [ ] If `.harness-profile` doesn't exist or has no `model_routing` field → treat as `off`

### Phase 2: Parallel-when-safe execution

#### File overlap analysis

Before dispatching tasks, the orchestrator analyzes which tasks can run in parallel.

**Acceptance criteria:**
- [ ] Reads `Files:` field from each task in the phase
- [ ] Builds a dependency + file overlap graph
- [ ] Tasks with no dependency AND no file overlap → eligible for parallel execution
- [ ] Tasks that share any file path or parent directory → must run sequentially
- [ ] Prints execution plan before starting: "Tasks 3,4 → parallel (no overlap); Task 5 → after 3,4 (depends on Task 3)"

#### Parallel dispatch with worktrees

**Acceptance criteria:**
- [ ] Parallel tasks spawn subagents with `isolation: "worktree"` — each gets its own working copy
- [ ] Orchestrator waits for all parallel tasks to complete before moving to dependent tasks
- [ ] After parallel tasks complete, worktree changes are merged back to the main branch
- [ ] If merge conflict occurs → stops, reports the conflict, asks user how to resolve
- [ ] Each parallel task still goes through `/commit` independently (review happens per-task, not batched)
- [ ] Error case: worktree creation fails → falls back to sequential for that task pair

#### Shared state guard

**Acceptance criteria:**
- [ ] Tasks touching database migrations → always sequential (shared state)
- [ ] Tasks touching config files (`.env`, `tsconfig.json`, `package.json`) → always sequential
- [ ] Tasks touching type definition files that other parallel tasks import → sequential
- [ ] These rules override the file-overlap analysis

## Implementation Plan (Sprint Contracts)

### Phase 1

- [x] **Task 1:** Create orchestrator agent definition (done in cdf12ad)
  - **Files:** `.claude/agents/orchestrator.md`
  - **Depends on:** Nothing
  - **Verify:** Agent is loadable, description is clear, can be invoked with "use the orchestrator to build Phase 1 from docs/specs/X.md"

- [x] **Task 2:** Implement routing logic (done in cdf12ad)
  - **Files:** `.claude/agents/orchestrator.md` (routing guidelines section)
  - **Depends on:** Task 1
  - **Verify:** Given a sample spec with mixed-complexity tasks, orchestrator assigns different models and logs justifications

- [x] **Task 3:** Wire `/commit` integration (done in cdf12ad)
  - **Files:** `.claude/agents/orchestrator.md` (post-task commit section)
  - **Depends on:** Task 2
  - **Verify:** After a task completes and passes verification, `/commit` runs automatically with review + plan.md + spec checklist updates

- [x] **Task 4:** Add `.harness-profile` toggle (done in cdf12ad)
  - **Files:** `.claude/agents/orchestrator.md`, `.harness-profile` schema docs
  - **Depends on:** Task 1
  - **Verify:** `model_routing: off` runs all tasks on current model; `model_routing: on` spawns subagents with selected models

- [x] **Task 5:** Implement retry-with-promotion (done in cdf12ad)
  - **Files:** `.claude/agents/orchestrator.md` (failure handling section)
  - **Depends on:** Task 2
  - **Verify:** Sonnet task that fails verification → automatically retried with opus; opus failure → stops and asks user

### Phase 2

- [x] **Task 6:** File overlap analysis (done in cdf12ad)
  - **Files:** `.claude/agents/orchestrator.md` (parallel execution section)
  - **Depends on:** Task 3
  - **Verify:** Given a phase with 4 tasks, correctly identifies which can run in parallel based on Files field and dependencies

- [x] **Task 7:** Parallel dispatch with worktrees (done in cdf12ad)
  - **Files:** `.claude/agents/orchestrator.md` (worktree dispatch section)
  - **Depends on:** Task 6
  - **Verify:** Two independent tasks run in parallel worktrees, both complete, changes merge cleanly

- [x] **Task 8:** Shared state guards (done in cdf12ad)
  - **Files:** `.claude/agents/orchestrator.md` (shared state section)
  - **Depends on:** Task 6
  - **Verify:** Tasks touching migrations or config files are forced sequential even if file overlap analysis says parallel is safe

## Constraints

- The orchestrator is an agent (`.claude/agents/`), not a skill — invoked with natural language, not slash commands
- All code quality enforcement happens through existing `/commit` → code-reviewer chain — the orchestrator does not review code itself
- Spec-planner output format is the contract — the orchestrator depends on `Files:`, `Depends on:`, and `Verify:` fields existing in every task
- The orchestrator runs on Opus — it needs judgment to route effectively

## Out of Scope

- **Automatic spec generation** — the orchestrator executes specs, it doesn't write them (that's spec-planner)
- **Cross-phase orchestration** — the orchestrator runs one phase at a time. Moving between phases is a user decision.
- **Cost tracking** — no token/cost reporting per model. May add later.
- **Custom model lists** — toggle is on/off, not "which models are allowed." Orchestrator uses judgment + stakes level.

## Open Questions

| # | Question | Impact | Decision needed by |
|---|----------|--------|-------------------|
| 1 | Should the orchestrator write to a log file (`.harness-state/orchestrator.log`) for debugging routing decisions? | Helps tune routing over time | Before Phase 1 ship |
| 2 | When model_routing is off, should the orchestrator still print "would have routed to X" for visibility? | Helps user learn the routing without risk | Before Phase 1 ship |
| 3 | Should parallel worktree branches have a naming convention (e.g., `orchestrator/task-3`)? | Prevents branch pollution | Before Phase 2 |
