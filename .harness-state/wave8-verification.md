# Wave 8 Verification — 5-question portability test

**Date:** 2026-05-01
**Spec:** `docs/specs/2026-04-30-universal-harness-protocol-v2.md` §2.3
**Source artifacts (post-Wave-8):**
- `AGENTS.md` (Wave 8 Task 1)
- `WORKFLOW.md` (Wave 8 Task 2)
- `CLAUDE.md` (Wave 8 Task 3)
- `docs/protocol/receipt-schema.md` (Wave 8 Task 5)
- `docs/protocol/codex-prompt-contract.md` (Wave 8 Task 6)
- `.harness-state/examples/{manual,claude}-close-wave-6.yml` + `recompute-keys.sh` (Wave 8 Task 7)

**Note:** Candidate answers below are derived from current protocol-file content. The "manual verification" exit-gate bullet (cold human read with no Claude/Codex session) is NOT satisfied by this file alone — the orchestrator IS a Claude session. A human must open the repo without prior session context and confirm.

## Q1: What is active?

- **Answer source:** `docs/plan.md`
- **Expected location per spec:** `docs/plan.md ## Now`
- **Yes/no:** Partial-yes — `docs/plan.md` exists and lists active waves (`### Wave 1` … `### Wave 7` headers under "Operating Rules for Execution"). However, the plan.md in this repo follows the legacy `### Wave N — ...` shape, not the v2-target `## Now / ## Next / ## Blocked / ## Recently Shipped` shape from spec §6. Migration to the §6 shape is tracked separately (post-Wave-8 work).

## Q2: What is blocked?

- **Answer source:** `docs/plan.md ## Blocked`
- **Yes/no:** No (in current shape). The legacy plan.md structure does not have a dedicated `## Blocked` section. Wave items annotate their own status inline (e.g. "SUPERSEDED" on Wave 7). When plan.md migrates to the §6 target shape, this answer becomes Yes.

## Q3: What was shipped?

- **Answer source per spec:** `docs/waves/`
- **Actual location in this repo:** `docs/<date>-claude-harness-wave<N>-summary.md` files at the top of `docs/` (Waves 1-6 present; Wave 8 summary lands as `docs/2026-05-01-claude-harness-wave8-summary.md`).
- **Yes/no:** Yes — at least 6 closed-wave summary files exist on disk. The file-naming convention differs from spec §3's `docs/waves/` directory; consolidation is post-Wave-8 work.

## Q4: What verifies this?

- **Answer source:** Each spec's exit gate + `.harness-state/` receipts
- **Yes/no:** Yes — every spec under `docs/specs/` includes a "Wave N Exit Gate" or equivalent verify block; Wave 8 ships worked-example receipts at `.harness-state/examples/{manual,claude}-close-wave-6.yml` plus a deterministic recomputer (`.harness-state/examples/recompute-keys.sh`) that asserts cross-adapter `idempotency_key` equality per spec §4.2. Per-session per-command receipts are not yet emitted by all skills (post-Wave-8 work tracked in v2 Wave 1 — Claude Code adapter alignment).

## Q5: What do I do next?

- **Answer source:** `WORKFLOW.md`
- **Yes/no:** Yes — Task 2 just shipped this file at the repo root. Rows enumerate Manual / Claude Code / Codex / Automation columns for the 7 protocol commands. The Codex prompt-contract details live in `docs/protocol/codex-prompt-contract.md`; the receipt shape lives in `docs/protocol/receipt-schema.md`.

## Summary

3 of 5 answers are Yes outright (Q3, Q4, Q5). Q1 is partial-Yes (plan.md exists, structure is legacy not v2-target). Q2 is No (no `## Blocked` section in current plan.md shape). The two gaps both reduce to a single follow-up: migrate `docs/plan.md` to the §6 target shape (`## Now` / `## Next` / `## Blocked` / `## Recently Shipped`). That migration is out of scope for Wave 8 (markdown-only protocol-file wave) and is properly handled by a future plan-shape migration wave or by the existing `/archive-plan` command path once it lands.

The exit gate's final bullet — a cold human read of the repo answering these 5 questions without prior Claude/Codex session context — remains HUMAN-ONLY and is surfaced in the wave summary's §Human-only TODOs.
