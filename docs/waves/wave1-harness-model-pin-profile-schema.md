---
wave_number: 1
slug: harness-model-pin-profile-schema
spec_path: docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md
merge_sha: 4109de6
closed_at: 2026-04-25
---

# Wave 1 Summary — claude-harness model pin + effort routing schema

**Date:** 2026-04-25
**Wave source:** `docs/plan.md` Wave 1
**Spec:** `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md`
**Worktree:** `/Users/klorian/workspace/claude-harness/.claude/worktrees/agent-a827ecef1c34928b7`
**Branch:** `worktree-agent-a827ecef1c34928b7`
**Routing mode:** dry-run (no `model_routing` toggle in `.harness-profile`)

## §Shipped

| Task | Commit | Model (would-route) | Files | Verify |
|------|--------|---------------------|-------|--------|
| 1 — Add `model:` block to `.harness-profile` | `0dbd852` | Sonnet (mechanical YAML insertion) | `.harness-profile` | PASS |
| 2 — Document `model:` schema in project-init + update template | `6dc6e2a` | Sonnet (doc + template, established pattern) | `skills/project-init/SKILL.md` | PASS |

Both tasks executed locally on the current session model in dry-run mode. Routing decisions logged for visibility per orchestrator dry-run conventions.

## §Wave 1 Exit Gate Results

Run inside the worktree after both task commits.

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| 1 | `yq '.model.primary' .harness-profile` | `claude-opus-4-7` | `claude-opus-4-7` | PASS |
| 2 | `yq '.model.fallback' .harness-profile` | `claude-sonnet-4-6` | `claude-sonnet-4-6` | PASS |
| 3 | `yq '.model.effort_default' .harness-profile` | `high` | `high` | PASS |
| 4 | `python -c "import yaml; yaml.safe_load(open('.harness-profile'))"` | exit 0 | exit 0 | PASS |
| 5 | `grep -q tokenizer_note .harness-profile` | non-zero exit | exit 1 | PASS (field absent) |
| 6 | `grep -q "stakes.level" skills/project-init/SKILL.md` | exit 0 | exit 0 | PASS |
| 7 | `grep -q "effort_cost_multiplier" skills/project-init/SKILL.md` | exit 0 | exit 0 | PASS |

Raw command output (verbatim):

```
=== 1. yq .model.primary ===
claude-opus-4-7
=== 2. yq .model.fallback ===
claude-sonnet-4-6
=== 3. yq .model.effort_default ===
high
=== 4. python yaml safe_load ===
exit=0
=== 5. tokenizer_note grep (must be non-zero) ===
exit=1
=== 6. SKILL.md stakes.level ===
exit=0
=== 7. SKILL.md effort_cost_multiplier ===
exit=0
```

All 7 gate checks pass.

## §Human-only TODOs

- **Manual `/project-init` scratch-dir verify** — Task 2 specifies a manual check that running `/project-init` on a scratch directory produces a `.harness-profile` whose `model.effort_default` matches the stakes the user just answered (low → medium, medium → high, high → xhigh). The orchestrator cannot self-invoke `/project-init` reliably. A human should run `/project-init` in a throwaway directory once after Wave 1 merges and confirm the emitted profile contains the `model:` block with the correct stakes-derived `effort_default`.

## §Open Questions

Wave 1 intentionally does NOT resolve OQ#1, OQ#3, OQ#4 from the parent spec — those belong to Wave 2 (orchestrator effort routing + logging) and Wave 3 (README sync). They remain unchanged after this wave:

- **OQ#1** — orchestrator effort-routing behavior (Wave 2)
- **OQ#3** — JSONL log schema + stable `task_id` (Wave 2 / forward-compat)
- **OQ#4** — README/setup-harness doc sync for the new schema (Wave 3)

## §KB upsert suggestions

The new `.harness-profile` `model:` schema is a KB-worthy fact for the harness memory index. Suggested entry:

- **Title:** `.harness-profile model: block schema`
- **Body:** Top-level `model:` block carries `primary` (default `claude-opus-4-7`), `fallback` (default `claude-sonnet-4-6`), `effort_default` (derived on first write from `stakes.level`: low→medium, medium→high, high→xhigh), and optional `effort_cost_multiplier` (object, reserved for `/tokens`). User may override `effort_default` directly. No `tokenizer_note` field — killed in rewrite. Orchestrator gracefully degrades to `primary=claude-opus-4-7`, `effort_default=xhigh` when the block is missing (Wave 2 will implement the warning).
- **Pointers:** `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md`, `.harness-profile` (this repo), `skills/project-init/SKILL.md` Step 4.

## §Deviations from spec

- **`effort_cost_multiplier` inclusion:** Included as `effort_cost_multiplier: {}` (empty mapping) on the `.harness-profile`, matching the spec's recommendation to "include the key with empty/comment placeholder so consumer profiles can see the schema, but leave the body empty so orchestrator's 'ignored if absent' path is exercised." The same shape (`{}` placeholder + inline comment about the optional reserved-for-/tokens nature) is emitted in the project-init template. No deviation from spec recommendation.
- **No other deviations.** Schema kept tight: three required + one optional, no `tokenizer_note`, no extra fields. Existing fields not reordered (additive change only).

## §Cross-repo flags

None. The two files touched in this wave are regular files in this repo:
- `.harness-profile` — owned here.
- `skills/project-init/SKILL.md` — owned here. May be symlinked OUT to `~/.claude/skills/` (this repo as upstream); that direction is the expected harness pattern and not a cross-repo gotcha.

No file in this wave points OUT to another active repo's working tree.

## §Baseline metric

| Metric | Before | After |
|---|---|---|
| `.harness-profile` top-level field count | 10 | 11 (added `model`) |
| `.harness-profile` YAML parses (`yaml.safe_load`) | OK | OK |
| `.harness-profile` `tokenizer_note` present | no | no (still absent) |
| `.harness-profile` size | 1821 bytes | ~2.4 KB after additions (13 inserted lines) |
| `skills/project-init/SKILL.md` mentions `model:` | no | yes |
| `skills/project-init/SKILL.md` mentions `effort_cost_multiplier` | no | yes |
| `skills/project-init/SKILL.md` mentions `stakes.level` mapping | no | yes |

Top-level keys after Wave 1: `profile_version, project, audience, stakes, model, quality_bar, stack, deployment, compliance, team, methodology`.
