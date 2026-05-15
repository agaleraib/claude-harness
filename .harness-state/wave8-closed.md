# Wave 8 — CLOSED

- **Closed:** 2026-05-01
- **Merge commit:** `1d7cee0`
- **Reconcile commit:** `2ddc6eb`
- **Post-merge fixes:** none (markdown/bash-only wave; no smoke detour required)
- **Pushed to origin:** yes — `dd03186..2ddc6eb` to origin/master
- **Deploy:** no deploy hook configured (claude-harness is meta-tooling repo; no live infrastructure)
- **Summary doc:** `docs/2026-05-01-claude-harness-wave8-summary.md`
- **Next wave opening:** v2 Wave 1 — Claude Code adapter alignment (~4-6 days; per spec `docs/specs/2026-04-30-universal-harness-protocol-v2.md` §8 Wave 1). No plan.md row pre-created.
- **Open items carried forward:**
  - **DEFERRED — Gate bullet #12 (cold-read 5-question portability test):** Requires opening repo on a fresh editor/machine with no prior conversation context. Candidate answers already authored in `.harness-state/wave8-verification.md`. Action: a human cross-checks the candidates in a new session before declaring the v2 universal claim fully validated for this repo.
  - **DEFERRED to Wave 5 — Spec Open Q #9 (idempotency_key shape):** Wave 8 receipts ship `idempotency_key` as YAML mapping `{value, trace}`; spec §4.2 types it as string. Two options documented in spec at `7a439ff`; recommendation is option (b) — rename trace to sibling field `idempotency_trace` to preserve string typing. Wave 8's two example receipts will need post-merge migration if (b) is chosen.

**Wave 8 ships v2's Wave 0:** AGENTS.md + WORKFLOW.md tool-neutral protocol contract, materialized receipt schema (`docs/protocol/receipt-schema.md`), Codex prompt contract (`docs/protocol/codex-prompt-contract.md`), example receipts proving cross-adapter `idempotency_key` equality (`238e61ca…39587b` matches across manual + claude-code adapters via trace-based recompute). The universal-protocol claim now has mechanical verification at v1 fidelity.
