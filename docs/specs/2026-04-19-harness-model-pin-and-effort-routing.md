# Harness Model Pin + Effort Routing — `.harness-profile` model block and orchestrator effort dimension

## Overview

Two coupled changes that land together:

1. Add a `model:` block to `.harness-profile` so the harness has an explicit, machine-readable pin of which Anthropic model the repo is tuned for, what its fallback is, and what `effort` default to assume. This is the staleness guard a future drift check (or a reviewer agent) can reference when the next model release arrives.

2. Extend `agents/orchestrator.md` to route on an **effort** dimension in addition to the existing model dimension (haiku / sonnet / opus). Today the orchestrator's routing guidelines pick a model but say nothing about effort — Opus 4.7 exposes an `effort` knob with a meaningful cost/quality trade-off, and the orchestrator should name it explicitly per task.

These two bullets are shipped as one spec because they share vocabulary: the `effort_default` in `.harness-profile` is the fallback when a task's routing decision doesn't override it, and the orchestrator's routing table consumes that default. Shipping them independently would force later reconciliation.

## Prior Work

Builds on: [Runtime Orchestrator](2026-04-12-runtime-orchestrator.md) (all 8 tasks shipped in commit `cdf12ad`).

Assumes:
- `.claude/agents/orchestrator.md` exists and contains the "Routing guidelines" section with Haiku / Sonnet / Opus buckets.
- `.harness-profile` exists with the fields documented in `project_harness_profile_schema.md`.
- `model_routing: on | off` toggle semantics from the 2026-04-12 spec are unchanged.
- Spec-planner spec format (`Files:`, `Depends on:`, `Verify:` per task) is unchanged.

Changes / extends (does NOT supersede):
- Adds a new `model:` block to `.harness-profile` (the 2026-04-12 spec did not define one).
- Adds an `effort` column to the orchestrator routing table and an `effort` field to the orchestrator's per-task log format.
- Adds an effort-promotion rung to the existing retry-on-failure flow (currently: promote model; new: also promote effort before promoting model).

No existing `[x]` task from the 2026-04-12 spec is invalidated.

## Data Model

This repo has no runtime persistent state. The only "data" is the `.harness-profile` YAML block and the orchestrator log line format — both are text files. No table.

## Design Principles

- **Explicit over implicit.** The model pin and effort default are written out in `.harness-profile` so a reader (human or agent) doesn't have to infer them from README prose. When Anthropic ships the next model, a diff against `.harness-profile` is the single source of truth for what needs re-tuning.
- **Route first, escalate second.** The existing `(haiku → sonnet → opus)` promotion rung stays. Effort is a second, cheaper axis: retry a Sonnet task at `xhigh` before paying to promote it to Opus.
- **Solo-scale.** No per-agent override map, no ceremony. The `model:` block has four fields, the orchestrator table gains one column. If the user ever wants per-agent overrides, that's a follow-up spec.
- **Scoped table.** The orchestrator routing table describes what the **orchestrator** dispatches. It does NOT govern Claude Code's native `/advisor` executor+advisor pattern (which has its own Sonnet+Opus split and isn't orchestrator-dispatched). `/advisor` inherits `effort_default` indirectly if it ever reads `.harness-profile`, but the routing table is not its contract.

## Requirements

### Phase 1: `.harness-profile` model pin block

Add a `model:` block to `.harness-profile`. This is the ground-truth pin the rest of the harness references.

**Acceptance criteria (hard thresholds — all must pass):**
- [ ] `.harness-profile` gains a top-level `model:` block with exactly these four fields: `primary`, `fallback`, `effort_default`, `tokenizer_note`.
- [ ] Default values on first write: `primary: claude-opus-4-7`, `fallback: claude-sonnet-4-6`, `effort_default: xhigh`, `tokenizer_note: "~1.0–1.35x tokens vs 4.6; budget accordingly"`.
- [ ] `effort_default` accepts exactly one of: `low`, `medium`, `high`, `xhigh`. Any other string is a schema violation.
- [ ] `.harness-profile` loads cleanly as YAML after the change (parseable by `yq`, `python -c "import yaml; yaml.safe_load(open('.harness-profile'))"`).
- [ ] `project-init` skill's schema docs mention the new `model:` block so future `.harness-profile` instances include it by default.
- [ ] Edge case: a `.harness-profile` that *lacks* a `model:` block (older copies in consumer projects) does NOT break the orchestrator — orchestrator falls back to: `primary = claude-opus-4-7`, `effort_default = xhigh`, no warning blocker.
- [ ] Edge case: a `.harness-profile` with `model.effort_default` set to an unknown value → orchestrator warns once (`⚠️ unknown effort_default 'blazing' in .harness-profile; using xhigh`) and proceeds.

### Phase 2: Orchestrator effort dimension

Augment `.claude/agents/orchestrator.md` so every routing decision names an `effort` alongside a model, and the per-task log line records both.

**Acceptance criteria (hard thresholds — all must pass):**
- [ ] The existing "Routing guidelines" section in `orchestrator.md` gains an explicit routing table with columns: **Task shape** | **Model** | **Effort**. Table includes at minimum these three example rows (from the review §):

  | Task | Model | Effort |
  |------|-------|--------|
  | Fix a typo in docs | haiku-4.5 | low |
  | Refactor one module | sonnet-4.6 | medium |
  | Multi-file migration | opus-4.7 | xhigh |

- [ ] The table lives **inside the "Routing guidelines" section**, directly after the three bullet-list buckets (Haiku / Sonnet / Opus). It is a concrete illustration, not a replacement for the guidelines.
- [ ] The "Log the decision" subsection is updated so every routing decision prints both dimensions: `→ Task 3 → Sonnet @ medium: standard CRUD following existing pattern`.
- [ ] The orchestrator log format (`.harness-state/orchestrator.log`) includes an `Effort:` field on each task line — e.g., `Model: Sonnet → Effort: medium → reason: ...`.
- [ ] Default effort selection rule (added to routing guidelines): `low` for read-only / scanning / typo-fix tasks; `medium` for standard implementation; `high` for architecture / complex algorithms; `xhigh` for code-reviewer loops, multi-file migrations, and any task flagged `stakes.level: high` in `.harness-profile`.
- [ ] When no signal in the task favors a different value, the orchestrator falls back to `model.effort_default` from `.harness-profile` (i.e., `xhigh` on this repo).
- [ ] Retry-on-failure flow is extended: if a task fails verification at `effort=medium`, the orchestrator first retries at `effort=xhigh` on the **same model** before promoting to the next model tier. Print the escalation explicitly: `⚠️ Task 3 failed at Sonnet/medium — retrying at Sonnet/xhigh before promoting.`
- [ ] Edge case: `model_routing: off` (dry-run mode) — orchestrator still prints `would route to X @ effort=Y` for visibility but does not dispatch.
- [ ] Edge case: `effort_default` missing from `.harness-profile` → orchestrator uses `xhigh` and logs the fallback once per session.

### Phase 3: README + docs consistency

Keep the README in sync so a reader landing on the repo sees the same vocabulary the orchestrator uses.

**Acceptance criteria (hard thresholds — all must pass):**
- [ ] `README.md` §"orchestrator (Universal)" (around line 408) is updated to name the effort dimension — at minimum one sentence after the "Routing logic (runtime, not hardcoded)" bullet list: "Each route also picks an `effort` (`low` / `medium` / `high` / `xhigh`) — read-only tasks use `low`, code-reviewer and multi-file work use `xhigh`."
- [ ] `README.md` line 932 (the "~500 tokens at startup" claim) is not edited in this spec — that's a separate bullet under review §1c (already shipped via micro). Do NOT re-measure here.
- [ ] `README.md` §"Multi-agent coordination (2026 trend)" (line 913) does not need to change — it already describes the orchestrator at the right abstraction level.
- [ ] Cross-reference: the orchestrator.md routing table is linked from README §"orchestrator (Universal)" via a relative path, so the README doesn't duplicate the table.

## API Surface

Not applicable — no HTTP interfaces. The "interface" here is the `.harness-profile` YAML schema and the orchestrator agent prompt, both documented above.

## Implementation Plan (Sprint Contracts)

Each task is a contract: build it, verify it, move on. Do not skip ahead.

### Phase 1

- [ ] **Task 1:** Add `model:` block to `.harness-profile`.
  - **Files:** `/Users/klorian/workspace/claude-harness/.harness-profile`
  - **Depends on:** Nothing
  - **Verify:** `yq '.model.primary' .harness-profile` returns `claude-opus-4-7`; `yq '.model.effort_default' .harness-profile` returns `xhigh`. File parses cleanly as YAML.

- [ ] **Task 2:** Update `project-init` skill schema docs to mention the `model:` block.
  - **Files:** `/Users/klorian/workspace/claude-harness/skills/project-init/SKILL.md` (schema section), and whichever file holds the `.harness-profile` template (grep for `profile_version: 1` if unclear).
  - **Depends on:** Task 1
  - **Verify:** Running `/project-init` on a scratch directory produces a `.harness-profile` that includes the `model:` block with the four fields and sensible defaults. Manual inspection of the generated file.

### Phase 2

- [ ] **Task 3:** Add the effort-augmented routing table to `orchestrator.md`.
  - **Files:** `/Users/klorian/workspace/claude-harness/.claude/agents/orchestrator.md` (inside "Step 4 → Route each task → Routing guidelines", immediately after the three bullet-list buckets).
  - **Depends on:** Task 1
  - **Verify:** The agent file contains a markdown table with Task / Model / Effort columns and at least the three example rows from the acceptance criteria. `grep "| Effort |" .claude/agents/orchestrator.md` returns a match.

- [ ] **Task 4:** Update "Log the decision" and Step 8 log format to include effort.
  - **Files:** `/Users/klorian/workspace/claude-harness/.claude/agents/orchestrator.md` (Step 4 log section + Step 8 log format).
  - **Depends on:** Task 3
  - **Verify:** `grep "Effort:" .claude/agents/orchestrator.md` returns at least two matches (decision line + log format). Run a dry-run dispatch (`Use the orchestrator to run Task X from [a test spec]`) and confirm the printed decision includes both model and effort.

- [ ] **Task 5:** Extend retry-on-failure flow with the effort-escalation rung.
  - **Files:** `/Users/klorian/workspace/claude-harness/.claude/agents/orchestrator.md` (Step 6 Verify section).
  - **Depends on:** Task 4
  - **Verify:** The Step 6 copy explicitly describes the `same-model @ xhigh` retry before model promotion. `grep -A 3 "retrying at" .claude/agents/orchestrator.md` shows the escalation language.

### Phase 3

- [ ] **Task 6:** Update README §"orchestrator (Universal)" with the effort-dimension sentence.
  - **Files:** `/Users/klorian/workspace/claude-harness/README.md` (around line 447, after the routing logic bullet list).
  - **Depends on:** Task 3
  - **Verify:** `grep -n "effort" README.md` returns a match inside the orchestrator section. Wording matches Phase 3 acceptance criterion #1.

## Constraints

- YAML schema changes to `.harness-profile` must be additive only (solo repo, but consumer copies exist on other machines — `wordwideAI`, `gobot`). Do not reorder existing fields.
- No hooks, no `settings.json` changes. This is doc + agent-prompt work only.
- No new scripts or executables. The validation in Phase 1 acceptance criterion #3 (effort value enum) is advisory in the agent prompt, not a pre-commit hook.
- Orchestrator must still function on a `.harness-profile` that pre-dates this change (graceful degradation is a hard requirement in Phase 1 acceptance criteria).
- The routing table is scoped to **orchestrator dispatches**. Claude Code's native `/advisor` executor+advisor split (rolled out April 2026, see `project_advisor_command.md`) is out of scope — `/advisor` picks its own models and is not orchestrator-driven.

## Out of Scope

- **Per-agent effort overrides** (e.g., `agents: { code-reviewer: { effort: xhigh } }` in `.harness-profile`). Parked — not needed for solo-scale use and adds ceremony. Surface as Open Question #1.
- **A drift-check script** that actually scans consumer repos for stale model pins. This spec adds the pin; a future spec consumes it.
- **Re-measuring the "~500 tokens at startup" claim in README line 932.** That's a separate suggestion (review §1c) already shipped via micro-session.
- **`/advisor` integration.** Native Claude Code command with its own model split; orchestrator table does not govern it.
- **Token-budget math updates elsewhere in the harness** (e.g., session-start skill). The review § mentioned this for future; this spec does NOT touch it.
- **Migrating existing logs** (`.harness-state/orchestrator.log`) to the new format. New entries use the new format; old entries are fine as-is.

## Open Questions

| # | Question | Impact | Decision needed by |
|---|----------|--------|-------------------|
| 1 | Should `.harness-profile` carry a per-agent override map (e.g., `model.agents.code-reviewer.effort: xhigh`)? | Lets per-agent tuning live in config instead of the agent prompt itself. Today every agent has its own prompt; the override would be a DRY shortcut. | Before Phase 2 closes, if the user has opinions. Otherwise park indefinitely. |
| 2 | Does the retry-escalation go `medium → xhigh (same model)` first, then `promote model`, or should it go `promote model at medium first`? Current spec picks the former (cheaper effort bump first). | Affects cost and latency on failed verifications. | Before Task 5 ships. Picking the former as the default; flip if the user prefers model-promotion-first. |
| 3 | Should `effort` appear in spec-planner output (i.e., does every task in a spec now ship with a pre-assigned effort hint)? Currently: no — orchestrator decides at runtime. | Would make specs more prescriptive but contradicts the "route at runtime, not in advance" principle of the 2026-04-12 spec. | Park. The 2026-04-12 spec already picked "runtime routing"; don't re-litigate. |
| 4 | When Opus 4.8 ships, who updates the `model.primary` pin — a dedicated drift-check skill, or a manual micro-session triggered by the anthropic-reviews routine? | Determines whether this spec needs a follow-up spec for automation. | Park — decide after anthropic-reviews routine has a second run. |
