# Harness Model Pin + Effort Routing — `.harness-profile` model block and orchestrator effort dimension

## Origin

Derived from [`anthropic-reviews/2026-04-19-improvement-suggestions.md`](../../anthropic-reviews/2026-04-19-improvement-suggestions.md) §1b (model pin in `.harness-profile`) and §1d (orchestrator effort dimension). Rewritten 2026-04-24 to close 10 design-review gaps and add forward-compat hooks for a future Second Brain `/tokens` analytics feature.

## Overview

Two coupled changes that land together:

1. Add a `model:` block to `.harness-profile` so the harness has an explicit, machine-readable pin of which Anthropic model the repo is tuned for, what its fallback is, and what `effort` default to assume — derived from `stakes.level`. This is the staleness guard a future drift check (or a reviewer agent) can reference when the next model release arrives.

2. Extend `.claude/agents/orchestrator.md` to route on an **effort** dimension in addition to the existing model dimension (haiku / sonnet / opus). Today the orchestrator's routing guidelines pick a model but say nothing about effort — Opus 4.7 exposes an `effort` knob with a meaningful cost/quality trade-off, and the orchestrator should name it explicitly per task, log it in both human-readable and JSONL formats, and honor optional per-task overrides in spec bodies.

These ship together because they share vocabulary: the `effort_default` in `.harness-profile` is the fallback when a task's routing decision doesn't override it, and the orchestrator's routing table consumes that default. Shipping independently would force later reconciliation.

A third, forward-compat thread runs through the spec: a future Second Brain `/tokens` skill will aggregate usage by model × effort × task-shape. This spec does **not** build `/tokens`, but it lays three tracks (parallel JSONL log, stable `task_id`, optional `effort_cost_multiplier` schema hook) so `/tokens` doesn't inherit archaeology work.

## Implementation

**Recommended flow:** `/run-wave 1 → /close-wave 1 → /run-wave 2 → /close-wave 2 → /run-wave 3 → /close-wave 3`
**Reason:** Three waves, each independently shippable in order, with Wave 2 as the bulk-of-work rung depending on Wave 1's schema; medium stakes plus wave-gate isolation earns the ceremony over plain `/micro`.
**Alternatives:** Could fold Wave 3 (README doc sentence) into Wave 2's close step as a `/micro` follow-up; keeping it separate preserves the "docs don't gate code" rollback boundary.
**Implementation block written:** 2026-04-24

## Prior Work

Builds on: [Runtime Orchestrator](2026-04-12-runtime-orchestrator.md) (all 8 tasks shipped in commit `cdf12ad`).

Assumes:
- `.claude/agents/orchestrator.md` exists and contains the "Routing guidelines" section with Haiku / Sonnet / Opus buckets.
- `.harness-profile` exists with the fields documented in `project_harness_profile_schema.md`, including a `stakes.level` block (`low | medium | high`).
- `model_routing: on | off` toggle semantics from the 2026-04-12 spec are unchanged.
- Spec-planner spec format (`**Files:**`, `**Depends on:**`, `**Verify:**` per task) is unchanged.

Changes / extends (does NOT supersede):
- Adds a new `model:` block to `.harness-profile` (the 2026-04-12 spec did not define one).
- Adds an `effort` column to the orchestrator routing table and an `effort` field to the orchestrator's per-task log format.
- Adds an effort-promotion rung to the existing retry-on-failure flow (currently: promote model; new: first promote effort one tier on same model, then promote model at `effort_default`).
- Adds a parallel JSONL log file (`.harness-state/orchestrator.jsonl`) alongside the existing human-readable log.
- Introduces stable `task_id = {spec_basename}:{task_marker}` in both logs.

No existing `[x]` task from the 2026-04-12 spec is invalidated.

## Data Model

This repo has no runtime persistent state. The "data" is three text surfaces:
1. `.harness-profile` YAML (the `model:` block schema).
2. `.harness-state/orchestrator.log` (human-readable routing decisions, one line per dispatch).
3. `.harness-state/orchestrator.jsonl` (structured JSONL, one line per routing decision, forward-compat for `/tokens`).

Schemas are defined inline in the acceptance criteria and the §Logging Contract section below.

## Design Principles

- **Explicit over implicit.** The model pin and effort default are written out in `.harness-profile` so a reader (human or agent) doesn't have to infer them from README prose. When Anthropic ships the next model, a diff against `.harness-profile` is the single source of truth for what needs re-tuning.
- **Route first, escalate second.** The existing `(haiku → sonnet → opus)` promotion rung stays. Effort is a second, cheaper axis: retry a Sonnet task at `xhigh` before paying to promote it to Opus.
- **Solo-scale.** No per-agent override map, no ceremony. The `model:` block has three required fields (plus one optional), the orchestrator table gains one column. Per-agent overrides are Open Question #1.
- **Stakes-derived defaults.** Defaults track the `stakes.level` block the user already filled in at project-init. No hardcoded `xhigh` on tooling repos.
- **Scoped table.** The orchestrator routing table describes what the **orchestrator** dispatches. It does NOT govern Claude Code's native `/advisor` executor+advisor pattern. `/advisor` may inherit `effort_default` if it ever reads `.harness-profile`, but the routing table is not its contract.
- **Forward-compat without premature build.** The JSONL log and `effort_cost_multiplier` hook exist so `/tokens` has data to aggregate when it ships. This spec writes the schemas and stops. `/tokens` itself is out of scope.

## Design Decisions

Previously parked, now resolved — listed here so readers don't mistake them for open.

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Retry-escalation goes effort-first, then model.** On verify failure, retry one effort tier up on the same model; if already at `xhigh`, promote to the next model tier at `effort_default`. | Cheaper axis first. A Sonnet-medium failure often clears at Sonnet-xhigh for a fraction of the cost of promoting to Opus. |

## Logging Contract

Every orchestrator routing decision writes to **two** surfaces. Both are required; neither is optional.

### Surface A — Human-readable console + log file

Printed to the console during dispatch AND appended to `.harness-state/orchestrator.log`. One line per decision, free-form but following this shape:

```
→ <task_id> → <Model> @ <effort>: <reason>
```

Example:
```
→ 2026-04-19-harness-model-pin-and-effort-routing.md:Task 3 → Sonnet @ medium: standard CRUD following existing pattern
```

Retry escalations print an extra line before the replacement decision:

```
⚠️ <task_id> failed at <model>/<effort> — retrying at <model>/<next_effort> before promoting.
```

Retry lines MUST use the same `task_id` shape so log joins work.

### Surface B — Structured JSONL

Appended to `.harness-state/orchestrator.jsonl`. One JSON object per line, required fields populated on every write, optional fields omitted or `null`.

**Schema:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `ts` | yes | string (ISO8601 UTC) | Wall-clock timestamp of the decision |
| `session_id` | yes | string | Contents of `.harness-state/session_start_commit` if present, else a new UUIDv4 generated at orchestrator startup and cached for the session |
| `task_id` | yes | string | `{spec_file_basename}:{task_marker}`, e.g. `2026-04-19-harness-model-pin-and-effort-routing.md:Task 3` |
| `task_shape` | yes | string | One of: `typo-fix | refactor-module | multi-file-migration | code-review | spec-planning | other` |
| `model` | yes | string | Model slug, e.g. `sonnet-4.6`, `opus-4.7`, `haiku-4.5` |
| `effort` | yes | string | One of: `low | medium | high | xhigh` |
| `status` | yes | string | One of: `dispatched | success | failed | retried | skipped` |
| `retried_from` | no | object | `{model, effort}` when this line is a retry; omitted on first dispatch |
| `override_source` | yes | string | One of: `default_rule | effort_default | task_hint | stakes_level` — which input picked this effort |
| `usage` | no | object | Open schema: `{input_tokens?, output_tokens?, cache_read?, cache_creation?}`. Orchestrator writes `null` today; `/tokens` will populate when telemetry arrives. |

**Example line:**

```json
{"ts":"2026-04-24T14:32:11Z","session_id":"d3a1b2c4-e5f6-7890-abcd-ef1234567890","task_id":"2026-04-19-harness-model-pin-and-effort-routing.md:Task 3","task_shape":"refactor-module","model":"sonnet-4.6","effort":"medium","status":"dispatched","override_source":"default_rule","usage":null}
```

**Example retry line (second dispatch of same task):**

```json
{"ts":"2026-04-24T14:38:47Z","session_id":"d3a1b2c4-e5f6-7890-abcd-ef1234567890","task_id":"2026-04-19-harness-model-pin-and-effort-routing.md:Task 3","task_shape":"refactor-module","model":"sonnet-4.6","effort":"xhigh","status":"retried","retried_from":{"model":"sonnet-4.6","effort":"medium"},"override_source":"default_rule","usage":null}
```

### `task_id` stability

Today the orchestrator prints `Task 3` as a per-run ordinal. This spec pins `task_id` to `{spec_basename}:{task_marker}` in both surfaces, so a week of log lines can be joined across runs by task identity. When a task is dispatched from a synthetic `/tmp/wave-N-*.md` spec, the orchestrator uses the synthetic basename as the prefix (the underlying source specs still appear in the `Source specs referenced:` header of the synthetic file for downstream attribution).

## Requirements

### Phase 1: `.harness-profile` model pin block

Add a `model:` block to `.harness-profile`. This is the ground-truth pin the rest of the harness references.

**Acceptance criteria (hard thresholds — all must pass):**
- [ ] `.harness-profile` gains a top-level `model:` block with these three required fields: `primary`, `fallback`, `effort_default`. One optional field: `effort_cost_multiplier` (object, schema open — orchestrator ignores if absent; reserved for future `/tokens` modeled-cost rendering).
- [ ] Default values on first write: `primary: claude-opus-4-7`, `fallback: claude-sonnet-4-6`, `effort_default` **derived from `stakes.level`** per the mapping below.
- [ ] **Stakes → effort_default mapping** (documented in project-init schema docs and inline in `.harness-profile` as a comment):
  - `stakes.level: low` → `effort_default: medium`
  - `stakes.level: medium` → `effort_default: high`
  - `stakes.level: high` → `effort_default: xhigh`
- [ ] User MAY override the derived default by editing the field directly. The derivation only applies on first write during `/project-init`.
- [ ] `effort_default` accepts exactly one of: `low`, `medium`, `high`, `xhigh`. Any other string is a schema violation.
- [ ] `effort_cost_multiplier` (if present) is an object with keys from `{low, medium, high, xhigh}` and numeric values. Orchestrator does not validate values today — `/tokens` will consume.
- [ ] `.harness-profile` loads cleanly as YAML after the change (parseable by `yq`, `python -c "import yaml; yaml.safe_load(open('.harness-profile'))"`).
- [ ] `project-init` skill's schema docs mention the new `model:` block, the stakes→effort_default mapping, and the optional `effort_cost_multiplier` hook so future `.harness-profile` instances include it by default.
- [ ] No `tokenizer_note` field exists anywhere in the schema or defaults. (This field was proposed in the prior draft and killed — the `stakes.level` block is already surfaced at session-start; `tokenizer_note` was dead data.)
- [ ] Edge case: a `.harness-profile` that *lacks* a `model:` block (older copies in consumer projects) does NOT break the orchestrator — it falls back to `primary = claude-opus-4-7`, `effort_default = xhigh` **and warns once per session**: `⚠️ no model: block in .harness-profile; using defaults (primary=claude-opus-4-7, effort_default=xhigh)`.
- [ ] Edge case: a `.harness-profile` with `model.effort_default` set to an unknown value → orchestrator warns once per session (`⚠️ unknown effort_default 'blazing' in .harness-profile; using xhigh`) and proceeds with `xhigh`.
- [ ] Both degradation warnings (missing block, invalid value) use the same severity and the same once-per-session gate.

### Phase 2: Orchestrator effort dimension, logging, retries, per-task hints

Augment `.claude/agents/orchestrator.md` so every routing decision names an `effort` alongside a model, honors optional per-task hints, logs both surfaces (human + JSONL), and handles retry escalation.

**Acceptance criteria (hard thresholds — all must pass):**

- [ ] The existing "Routing guidelines" section in `orchestrator.md` gains an explicit routing table with columns: **Task shape** | **Model** | **Effort**. Table includes at minimum these three example rows:

  | Task | Model | Effort |
  |------|-------|--------|
  | Fix a typo in docs | haiku-4.5 | low |
  | Refactor one module | sonnet-4.6 | medium |
  | Multi-file migration | opus-4.7 | xhigh |

- [ ] The table lives **inside the "Routing guidelines" section**, directly after the three bullet-list buckets (Haiku / Sonnet / Opus). It illustrates, not replaces, the guidelines.

- [ ] **Default effort selection rules** (added to routing guidelines, evaluated in order):
  1. `low` — read-only / scanning / typo-fix tasks.
  2. `medium` — standard implementation following existing patterns.
  3. `high` — architecture / complex algorithms / novel design.
  4. `xhigh` — code-reviewer loops, multi-file migrations.
  5. Fallback — `model.effort_default` from `.harness-profile` (which itself is stakes-derived).

  Note: there is NO separate "xhigh for any task with `stakes.level: high`" rule. That duplicates the `effort_default` fallback (which is already `xhigh` on high-stakes repos per the stakes→effort mapping).

- [ ] **Per-task effort hint (opt-in).** If a spec task body contains a line `**Effort:** <low|medium|high|xhigh>` (same style as `**Verify:**`), the orchestrator uses that value and logs `override_source: task_hint`. Absence of the hint is fine — falls through to the selection rules above.

- [ ] **Human log format** per §Logging Contract Surface A. Every decision prints `→ <task_id> → <Model> @ <effort>: <reason>` to console AND appends to `.harness-state/orchestrator.log`. No separate `Model: Sonnet → Effort: medium → reason: …` format — Surface A is the single canonical human format.

- [ ] **JSONL log format** per §Logging Contract Surface B. Every decision also appends one line to `.harness-state/orchestrator.jsonl` with all required fields populated. `usage` is `null` today.

- [ ] **Stable `task_id`.** Both surfaces use `{spec_basename}:{task_marker}` (e.g. `2026-04-19-harness-model-pin-and-effort-routing.md:Task 3`), not per-run ordinals.

- [ ] **Retry-on-failure flow, generalized.** On verify failure:
  - If current `effort < xhigh`: retry one effort tier up on the **same model**. Log with `status: retried`, `retried_from: {model, effort}`.
  - If current `effort == xhigh`: promote to the next model tier at `effort_default`. Log with `status: retried`, `retried_from: {model, xhigh}`.
  - The rung applies regardless of starting effort — `low → medium → high → xhigh → promote-model`. No special-casing `medium → xhigh → promote`.
  - Print the escalation explicitly per Surface A retry format.

- [ ] Edge case: `model_routing: off` (dry-run mode) — orchestrator still prints `would route to <Model> @ effort=<effort>` (Surface A) and writes `status: skipped` to Surface B, but does not dispatch.

- [ ] Edge case: `effort_default` missing from `.harness-profile` → orchestrator uses `xhigh`, writes `override_source: effort_default`, and emits the once-per-session warning from Phase 1.

- [ ] Edge case: `.harness-state/orchestrator.jsonl` doesn't exist on first write → create it (append mode handles this for a new file; document the invariant).

### Phase 3: README + docs consistency

Keep the README in sync so a reader landing on the repo sees the same vocabulary the orchestrator uses.

**Acceptance criteria (hard thresholds — all must pass):**
- [ ] `README.md` §"orchestrator (Universal)" is updated to name the effort dimension — at minimum one sentence after the "Routing logic (runtime, not hardcoded)" bullet list: "Each route also picks an `effort` (`low` / `medium` / `high` / `xhigh`) — read-only tasks use `low`, code-reviewer and multi-file work use `xhigh`, and the default tracks `stakes.level` via the `effort_default` pin."
- [ ] `README.md` §"orchestrator (Universal)" contains a relative-path link to `.claude/agents/orchestrator.md` so the README doesn't duplicate the routing table.
- [ ] No other README prose changes in this spec. The line 932 "~500 tokens at startup" claim and the line 913 "Multi-agent coordination (2026 trend)" block are out of scope.

## API Surface

Not applicable — no HTTP interfaces. The "interface" here is the `.harness-profile` YAML schema, the orchestrator agent prompt, and the JSONL log schema — all documented above.

## Implementation Plan (Sprint Contracts)

Each task is a contract: build it, verify it, move on. Do not skip ahead. Tasks are grouped into waves compatible with `/run-wave`; each wave is one isolated worktree dispatch with its own exit gate.

### Wave 1 — `.harness-profile` model-pin schema

**Why this wave:** Ship the `model:` block, stakes-derived `effort_default`, optional `effort_cost_multiplier`, and project-init schema docs. Independently shippable — orchestrator still works without reading the block via the graceful-degradation ACs, so master stays green even if Wave 2 slips.

- [x] **Task 1 — Add `model:` block to `.harness-profile`.** Shipped 2026-04-25 in commit `0dbd852` (Wave 1 merge `4109de6`).
  - **Files:** `/Users/klorian/workspace/claude-harness/.harness-profile`
  - **Depends on:** Nothing
  - **Verify:** `yq '.model.primary' .harness-profile` returns `claude-opus-4-7`; `yq '.model.fallback' .harness-profile` returns `claude-sonnet-4-6`; `yq '.model.effort_default' .harness-profile` returns `high` (this repo is `stakes.level: medium`); `python -c "import yaml; yaml.safe_load(open('.harness-profile'))"` exits 0; `grep -q tokenizer_note .harness-profile` returns non-zero (field must not exist).

- [x] **Task 2 — Update `project-init` skill schema docs.** Shipped 2026-04-25 in commit `6dc6e2a` (Wave 1 merge `4109de6`). Manual scratch-dir `/project-init` verify deferred — see human-only TODOs in wave-1 summary.
  - **Files:** `/Users/klorian/workspace/claude-harness/skills/project-init/SKILL.md` (schema section); whichever file holds the `.harness-profile` template emitted by `/project-init` (grep for `profile_version: 1` if unclear).
  - **Depends on:** Task 1
  - **Verify:** `grep -q "model:" skills/project-init/SKILL.md` matches; the stakes→effort_default mapping table appears in the schema docs verbatim (low→medium, medium→high, high→xhigh); `effort_cost_multiplier` documented as optional and unvalidated. Manual inspection: running `/project-init` on a scratch dir produces a `.harness-profile` with the `model:` block and effort_default matching the stakes answer the user gave.

**Wave 1 exit gate:**
- `yq '.model.primary' .harness-profile` returns `claude-opus-4-7`
- `yq '.model.fallback' .harness-profile` returns `claude-sonnet-4-6`
- `yq '.model.effort_default' .harness-profile` returns `high`
- `python -c "import yaml; yaml.safe_load(open('.harness-profile'))"` exits 0
- `grep -q tokenizer_note .harness-profile` returns non-zero (field removed/never added)
- `grep -q "stakes.level" skills/project-init/SKILL.md` matches (schema doc references the stakes mapping)
- `grep -q "effort_cost_multiplier" skills/project-init/SKILL.md` matches (optional hook documented)

### Wave 2 — Orchestrator effort routing + logging contract

**Why this wave:** Bulk of the work. Ship the routing-table effort column, per-task hint parsing, generalized retry-escalation rung, human log format (Surface A), JSONL parallel log (Surface B), and stable `task_id` in both. Depends on Wave 1 because the orchestrator reads `effort_default` from the `model:` block; running this wave before Wave 1 would ship an orchestrator that warns-and-defaults on its own repo — functional, but noisy.

- [x] **Task 3 — Add effort-augmented routing table + selection rules to `orchestrator.md`.** Shipped 2026-04-25 in commit `79b9ab9` (Wave 2 merge `4753502`).
  - **Files:** `/Users/klorian/workspace/claude-harness/.claude/agents/orchestrator.md` (inside "Step 4 → Route each task → Routing guidelines", immediately after the three bullet-list buckets).
  - **Depends on:** Wave 1
  - **Verify:** `grep -q "| Effort |" .claude/agents/orchestrator.md` matches; the five default selection rules appear in order (low/medium/high/xhigh/fallback); no rule mentions `stakes.level: high` as a separate xhigh trigger (collapsed into `effort_default`).

- [x] **Task 4 — Add per-task effort hint parsing.** Shipped 2026-04-25 in commit `3e4ad14` (Wave 2 merge `4753502`).
  - **Files:** `/Users/klorian/workspace/claude-harness/.claude/agents/orchestrator.md` (Step 4 task-parsing subsection).
  - **Depends on:** Task 3
  - **Verify:** `grep -q "\\*\\*Effort:\\*\\*" .claude/agents/orchestrator.md` matches; the prompt explains that a spec task may include `**Effort:** <value>` and the orchestrator honors it with `override_source: task_hint`. Dry-run test: dispatch a task with an explicit `**Effort:** xhigh` hint and confirm the human log reflects it.

- [x] **Task 5 — Write the §Logging Contract into the orchestrator prompt (Surface A + Surface B).** Shipped 2026-04-25 in commit `efb32a4` (Wave 2 merge `4753502`). Inlined the JSONL schema rather than linking — spec allowed either.
  - **Files:** `/Users/klorian/workspace/claude-harness/.claude/agents/orchestrator.md` (Step 4 "Log the decision" subsection + Step 8 log format).
  - **Depends on:** Task 4
  - **Verify:** The orchestrator prompt contains both the Surface A line shape (`→ <task_id> → <Model> @ <effort>: <reason>`) and the Surface B JSONL schema table verbatim (or a link to this spec's §Logging Contract). `grep -q "orchestrator.jsonl" .claude/agents/orchestrator.md` matches. `grep -q "task_id" .claude/agents/orchestrator.md` matches. An example JSONL line appears in the prompt.

- [x] **Task 6 — Implement stable `task_id` convention.** Shipped 2026-04-25 in commit `69081b3` (Wave 2 merge `4753502`).
  - **Files:** `/Users/klorian/workspace/claude-harness/.claude/agents/orchestrator.md` (task-parsing + logging subsections).
  - **Depends on:** Task 5
  - **Verify:** `grep -q "spec_basename" .claude/agents/orchestrator.md` matches; prompt explicitly constructs `task_id` as `{spec_basename}:{task_marker}` for both log surfaces. Prompt covers the synthetic-spec case (`/tmp/wave-N-*.md`) — basename is the synthetic filename, with source specs documented in the synthetic's header.

- [x] **Task 7 — Generalize the retry-escalation rung.** Shipped 2026-04-25 in commit `92f87f3` (Wave 2 merge `4753502`).
  - **Files:** `/Users/klorian/workspace/claude-harness/.claude/agents/orchestrator.md` (Step 6 Verify section).
  - **Depends on:** Task 6
  - **Verify:** `grep -qE "low → medium|medium → high|high → xhigh" .claude/agents/orchestrator.md` matches; prompt explicitly covers starting efforts other than `medium`; no prose saying "retry from medium to xhigh" as a special case. The model-promotion step lands at `effort_default`, not at the pre-retry effort.

**Wave 2 exit gate:**
- `grep -q "| Effort |" .claude/agents/orchestrator.md`
- `grep -q "orchestrator.jsonl" .claude/agents/orchestrator.md`
- `grep -q "\\*\\*Effort:\\*\\*" .claude/agents/orchestrator.md` (per-task hint documented)
- `grep -q "override_source" .claude/agents/orchestrator.md`
- `grep -q "retried_from" .claude/agents/orchestrator.md`
- `grep -qE "low → medium|medium → high|high → xhigh" .claude/agents/orchestrator.md` (generalized rung)
- `grep -qv "stakes.level: high.*xhigh" .claude/agents/orchestrator.md` (collapsed duplicate rule absent)
- `grep -q "tokenizer_note" .claude/agents/orchestrator.md` returns non-zero (dead field not referenced anywhere)
- Dry-run dispatch of any existing spec task: human log line matches Surface A shape; `.harness-state/orchestrator.jsonl` gains one new line parseable as JSON with all required fields populated.

### Wave 3 — README + cross-reference

**Why this wave:** Docs-only. Independently shippable after Wave 2. Kept separate so a doc typo can be fixed without touching agent prompts or profile schema — rollback isolation matches the change shape.

- [ ] **Task 8 — Update README §"orchestrator (Universal)" with the effort-dimension sentence.**
  - **Files:** `/Users/klorian/workspace/claude-harness/README.md` (§"orchestrator (Universal)", after the routing logic bullet list — grep for the section heading to locate; line numbers drift).
  - **Depends on:** Wave 2
  - **Verify:** `grep -n "effort" README.md` returns a match inside the orchestrator section. Wording matches Phase 3 AC #1: names all four effort values, the `low`/`xhigh` examples, and the `stakes.level` derivation.

- [ ] **Task 9 — Add relative-path cross-reference from README to `.claude/agents/orchestrator.md`.**
  - **Files:** `/Users/klorian/workspace/claude-harness/README.md` (§"orchestrator (Universal)").
  - **Depends on:** Task 8
  - **Verify:** `grep -q "\.claude/agents/orchestrator\.md" README.md` matches inside the orchestrator section; link is relative (starts with `.claude/` or `./.claude/`, not an absolute path or URL).

**Wave 3 exit gate:**
- `grep -nA 2 "orchestrator (Universal)" README.md` shows the effort-dimension sentence with all four effort values and the `stakes.level` derivation mentioned.
- `grep -q "\.claude/agents/orchestrator\.md" README.md` returns 0 (link exists).
- `git diff master -- README.md` touches only the orchestrator section (no drift elsewhere).

## Constraints

- YAML schema changes to `.harness-profile` must be **additive only** (solo repo, but consumer copies exist on other machines — `wordwideAI`, `gobot`). Do not reorder existing fields. Do not add the dead `tokenizer_note` field.
- No hooks, no `settings.json` changes. This is doc + agent-prompt work only.
- No new scripts or executables. Validation in Phase 1 AC (effort value enum, cost-multiplier shape) is advisory in the agent prompt, not a pre-commit hook.
- Orchestrator must still function on a `.harness-profile` that pre-dates this change — **graceful degradation is a hard requirement** (Phase 1 AC, both missing-block and invalid-value cases, with matching once-per-session warning severity).
- The routing table is scoped to **orchestrator dispatches**. Claude Code's native `/advisor` executor+advisor split (rolled out April 2026, see `project_advisor_command.md`) is out of scope — `/advisor` picks its own models and is not orchestrator-driven.
- Forward-compat hooks (JSONL log schema, `effort_cost_multiplier`, stable `task_id`) are writable today even though nothing reads them. Do NOT build `/tokens` in this spec.

## Out of Scope

- **Per-agent effort overrides** (e.g., `agents: { code-reviewer: { effort: xhigh } }` in `.harness-profile`). Parked as Open Question #1.
- **A drift-check script** that actually scans consumer repos for stale model pins. This spec adds the pin; a future spec consumes it.
- **Re-measuring the "~500 tokens at startup" claim in README line 932.** Separate review §1c item, already shipped via micro.
- **`/advisor` integration.** Native Claude Code command with its own model split; orchestrator table does not govern it.
- **Token-budget math updates elsewhere** (e.g., session-start skill). Future work.
- **Migrating existing logs** (`.harness-state/orchestrator.log`) to the new format. New entries use the new format; old entries stay as-is.
- **Building `/tokens`** — the Second Brain analytics skill that will consume `.harness-state/orchestrator.jsonl`. This spec lays the track; `/tokens` is its own future spec.
- **Populating `usage` in JSONL.** Orchestrator writes `null` today. A future telemetry spec fills it when Claude Code surfaces per-dispatch token counts.

## Open Questions

| # | Question | Impact | Decision needed by |
|---|----------|--------|-------------------|
| 1 | Should `.harness-profile` carry a per-agent override map (e.g., `model.agents.code-reviewer.effort: xhigh`)? | Lets per-agent tuning live in config instead of the agent prompt itself. Today every agent has its own prompt; the override would be a DRY shortcut. | Before Phase 2 closes, if the user has opinions. Otherwise park indefinitely. |
| 3 | Should `effort` appear in spec-planner output (i.e., does every task in a spec ship with a pre-assigned effort hint)? Currently: opt-in — orchestrator decides at runtime unless a `**Effort:**` hint is present. | Would make specs more prescriptive but contradicts the "route at runtime, not in advance" principle of the 2026-04-12 spec. | Park. The 2026-04-12 spec already picked "runtime routing"; the opt-in hint is a compromise. Don't re-litigate unless usage data shows most tasks carry hints. |
| 4 | When Opus 4.8 ships, who updates the `model.primary` pin — a dedicated drift-check skill, or a manual micro-session triggered by the anthropic-reviews routine? | Determines whether this spec needs a follow-up spec for automation. | Park — decide after anthropic-reviews routine has a second run. |

(OQ#2 resolved — see §Design Decisions D1.)
