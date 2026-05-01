# WORKFLOW.md

Command-form matrix per `docs/specs/2026-04-30-universal-harness-protocol-v2.md` §4. Every protocol command resolves to an executable form in each adapter column — no `deferred decision` cells in any data row (spec §4 line 97 is explicit).

## Commands

| Protocol command | Manual | Claude Code | Codex (prompt contract per §4.1) | Automation |
| --- | --- | --- | --- | --- |
| Spec work | edit `docs/specs/YYYY-MM-DD-<topic>.md` | `/spec-planner` | `codex spec-writer` prompt: read `AGENTS.md` + `WORKFLOW.md`, draft spec to `docs/specs/YYYY-MM-DD-<topic>.md`, emit receipt | none |
| Review spec | read criteria and revise | `/planning-loop` | `codex spec-reviewer` prompt: read spec + `criteria/`, append review notes inline, emit receipt | optional later |
| Run wave | worktree + branch + implement + verify | `/run-wave` | `codex run-wave` prompt: read plan + spec, create branch, implement scoped task list, run verification, emit receipt; stop on ambiguity | future dispatcher |
| Accept wave | verify branch + merge + receipt | `/close-wave` | `codex close-wave` prompt: verify branch matches spec exit gate, run verification commands, write `docs/waves/` summary, emit receipt; merge step remains manual unless Wave 5 graduates the Codex merge path | future gated bot |
| Commit increment | stage explicit files + commit | `/commit` | `codex commit` prompt: stage explicit files only, run verification, write commit message per repo convention, emit receipt | CI checks only |
| Archive plan | move closed details to `docs/waves/` | `/archive-plan` | `codex archive-plan` prompt: move closed entries from `docs/plan.md` into `docs/waves/` summary files, emit receipt | none |
| Cross-repo status | inspect repos by hand | `/harness-status` | `codex harness-status` prompt: read registry, run read-only `git status`/`git worktree list` per repo, write summary under `.harness-state/`, emit receipt under `.harness-state/` | optional dashboard |

## Codex prompt contract

The Codex column above states an adapter-form prompt, not a full command implementation. Each Codex row must satisfy the six normative clauses in `docs/protocol/codex-prompt-contract.md` (materialized from spec §4.1): explicit input paths, explicit output paths, ≥3 stop conditions, verbatim verification commands, §4.2-conforming receipt shape, and manual-fallback parity. Wave 5's pilot deliverable is at minimum one Codex command spec satisfying §4.1 for one row above; the Codex-compatible release (§1.1) requires §4.1-conforming specs for every row.

## Receipt shape

Every command in the matrix above writes a receipt under `.harness-state/<command>-<wave-or-spec-id>-<timestamp>.yml` shaped per `docs/protocol/receipt-schema.md` (materialized from spec §4.2). Read-only commands write receipts too — read-only means "writes nothing outside `.harness-state/` in any registered repo," not "writes nothing at all."

The receipt schema is normative across adapters: `idempotency_key` must equal byte-for-byte across Manual / Claude Code / Codex / Automation rows for the same logical operation on the same input contents. Worked example pair under `.harness-state/examples/` (manual + claude-code receipts for `/close-wave 6`) plus the recomputer at `.harness-state/examples/recompute-keys.sh` proves the cross-adapter equality.

## Detailed command spec requirements

Each per-command spec under `docs/specs/` must include: input artifacts, output artifacts, manual fallback, adapter behavior (one section per supported adapter including Codex), stop conditions (Codex must stop on ambiguity rather than invent state), verification commands, receipt shape (per `docs/protocol/receipt-schema.md`), and a portability check (per `AGENTS.md` §"How to discover next action"). See spec §4 lines 109-118 for the canonical list.
