# Codex Prompt Contract

**Status:** NORMATIVE for any Codex adapter shipped after Wave 5 pilot.
**Source:** `docs/specs/2026-04-30-universal-harness-protocol-v2.md` §4.1.

This file is a faithful materialization of spec §4.1 — Codex adapters read this file as the single source of truth for prompt-contract shape rather than parsing the spec body.

## Background

Codex adapter rows in `WORKFLOW.md` are not full command implementations — they are normative prompt contracts. Each Codex row shipped by Wave 5 (or by any later command-specific spec) must satisfy the six clauses below.

## Clauses

1. **Inputs** — prompt names every input artifact path explicitly. No "Codex figures out" inputs.
2. **Outputs** — prompt names every output artifact path and the receipt path under `.harness-state/`.
3. **Stop conditions** — prompt enumerates at least three stop-on-ambiguity triggers (missing input, ambiguous spec, verification failure) and instructs Codex to write a partial-completion receipt rather than guess.
4. **Verification** — prompt cites the verify commands from the relevant spec exit gate verbatim.
5. **Receipt shape** — prompt instructs Codex to emit a receipt that conforms to the schema in `docs/protocol/receipt-schema.md` (§4.2 of the v2 spec) — same fields, same format, regardless of which adapter generated it.
6. **Manual fallback parity** — the prompt contract must produce the same artifacts as a competent human running the manual column of `WORKFLOW.md`.

## Wave 5 pilot rule

Wave 5's pilot deliverable is at minimum one Codex command spec that satisfies §4.1 for one row in `WORKFLOW.md`.

The Codex-compatible release (§1.1 of the v2 spec) requires §4.1-conforming specs for **all** required rows: Spec work, Review spec, Run wave, Accept wave, Commit increment, Archive plan, Cross-repo status. None of these rows may resolve to `deferred decision` once a Codex-compatible release ships.

## Validation pattern

A §4.1-conforming Codex prompt spec, at minimum:

- Names every input artifact by repo-relative path.
- Names every output artifact by repo-relative path AND the receipt path (`.harness-state/<command>-<wave-or-spec-id>-<timestamp>.yml`).
- Lists ≥3 stop conditions with the partial-completion-receipt instruction.
- Quotes the spec exit gate's verify commands verbatim (no paraphrasing).
- Points at `docs/protocol/receipt-schema.md` for receipt fields rather than re-stating them inline.
- Notes which manual column row in `WORKFLOW.md` it parities.

The receipt-shape clause (§5 above) is what makes Codex receipts commensurable with manual and Claude Code receipts: same `idempotency_key` byte-for-byte for the same logical operation on the same input contents. Cross-adapter equality is verified by `.harness-state/examples/recompute-keys.sh` extended to Codex receipts when the Wave 5 pilot lands.
