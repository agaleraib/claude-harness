# /planning-loop token trim plan

**Date:** 2026-04-28
**Branch:** `claude/analyze-planning-loop-tokens-TO8ld`
**Status:** plan only — nothing implemented yet

## Goal

Reduce `skills/planning-loop/SKILL.md` runtime token cost without changing
behavior. Today: 55,707 bytes / 989 lines / ~14K tokens loaded on every
`/planning-loop` invocation, plus ~180 tokens preloaded every session via the
frontmatter `description`. Target: ~30KB / ~7K tokens, ~50 token description.

## Non-goals

- Changing skill behavior, preconditions, abort reasons, or audit-entry shape.
- Changing the `/planning-loop` invocation surface or argument parsing.
- Extending auto-apply scope (adding heading edits, partial-apply, etc.).

## Pre-conditions (must hold before starting any phase)

1. Working tree clean on `claude/analyze-planning-loop-tokens-TO8ld`.
2. `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` exits 0 — the
   15-fixture suite is the safety net. Run it before each phase, not just at
   the end.
3. The skill is symlinked into `~/.claude/skills/planning-loop/` (verify via
   `readlink ~/.claude/skills/planning-loop`). Edits land in both places at
   once; no separate install step.

## Distribution invariants (must remain true at every checkpoint)

These are the rules that keep the skill installable in other repos and keep
the existing fixtures passing:

1. **Absolute paths to lib/ scripts only.** Every reference uses
   `$HOME/.claude/skills/planning-loop/lib/<file>` or resolves
   `${BASH_SOURCE[0]}` inside the helper. Never repo-relative
   `skills/planning-loop/lib/...` from inside SKILL.md — consuming repos don't
   have that tree.
2. **Contracts stay in SKILL.md, mechanism moves to lib/.** Claude has to
   reason about *what* the JSON edit-block contract is, *what* abort reasons
   exist, *what* the audit-entry shape looks like. The bash that *implements*
   hash probing, opt-out parsing, validation, and apply is mechanical and
   belongs in lib/.
3. **Audit-entry shape is the API to the log file.** Any change to the
   `## Auto-apply — <ts>` or `## Auto-apply aborted — <ts>` block format is a
   behavior change, not a refactor. Out of scope.
4. **Test fixtures must keep passing after every phase.** If
   `run-fixtures.sh` regresses, stop and roll back the phase before
   continuing.
5. **Opportunity (not a requirement):** when extracting Steps 6e/6f bash to
   `lib/auto-apply.sh`, the fixture driver currently re-implements that logic
   as standalone bash. The driver could later source the lib script directly,
   tightening the "skill = test target" coupling. Track as follow-up; do not
   block Phase A on it.

---

## Phase A — Extract inline bash to lib/ scripts (mechanical, low risk)

**Goal:** drop ~250 lines of inline bash from SKILL.md by moving mechanism to
helper scripts. Contract text stays.

**New files:**

- `skills/planning-loop/lib/preflight.sh`
- `skills/planning-loop/lib/auto-apply.sh`

**What moves to `lib/preflight.sh`** (currently SKILL.md lines ~130–298):

- Leftover state detection (`.git/planning-loop-park/state.json` check).
- Orphan-stash detection (`planning-loop park *` without state.json).
- Phase 1c orphan auto-apply temp-file detection (the `*.autoapply-tmp`
  scanner).
- Working-tree pre-flight classification (`PORCELAIN_OTHER`).
- Auto-park stash construction including the skill-self-exclusion guard,
  state.json journal write, and the README in `.git/planning-loop-park/`.

Helper exits non-zero with the same user-visible error messages on the same
conditions as today. Helper takes `$SPEC_PATH` as argv[1].

**What moves to `lib/auto-apply.sh`** (currently SKILL.md lines ~610–878):

- SHA-256 utility probe (`sha256sum` vs `shasum -a 256` fallback).
- Opt-out resolution (`PLANNING_LOOP_NO_AUTO_APPLY` env var precedence over
  `.harness-profile` `planning_loop.auto_apply` key).
- Phase 1a per-finding validation loop (JSON parse, shape A xor B, section
  resolution, substring count, match-within-section, H2-in-edit-text
  rejection, writability checks).
- Phase 1b apply pass (hash re-check, in-memory or temp-file edit
  application, atomic rename, audit append, post-rename-pre-audit warning).
- `## Auto-apply aborted — <ts>` and `## Auto-apply — <ts>` entry construction.

Script takes `$SPEC_PATH` and `$LOG_PATH` as argv. Reads parsed verdicts from
stdin or a journal file written by SKILL.md before invocation (decide during
implementation; lean stdin-as-JSON for simplicity).

**What stays in SKILL.md:**

- The Step 6e clauses themselves (1 through 6) as the human-readable spec of
  what auto-apply requires.
- The Shape A / Shape B JSON contract definitions (they're the model-facing
  API for the arbiter prompts in Step 6.5).
- The audit-entry shape blocks (markdown templates).
- One-line invocations: `bash "$HOME/.claude/skills/planning-loop/lib/preflight.sh" "$SPEC_PATH"`
  and the matching `auto-apply.sh` call.
- Rules section (1–11), unchanged.

### A.1 — Contract collapse (folded in from former Phase C)

Once the bash leaves Step 6f Phase 1a, what remains in markdown is a
numbered list of "for each check, here's the abort reason and detail
template if it fails". That collapses naturally into an **abort-reason
mapping table** keyed by clause-number (`6e clause 5 rule 6 →
validation-failure / "F<i>: <field> matches N times in $SPEC_PATH"`).

Do this as the final cleanup step of Phase A, after both helper scripts
land and `run-fixtures.sh` passes. **Gate:** if cross-references between
6e and 6f get tangled (e.g. >5 distinct cross-refs needed, or any
arbiter prompt template breaks), abort the collapse and leave Phase 1a
as a verbose-but-bash-free section. Phase A still ships either way.

**Pre-condition before starting A.1:** Phase A's bash extraction is
green (`run-fixtures.sh` passes). Open 6e and 6f Phase 1a side by side
and confirm the unique-to-each diff is ≤ 5 items. If it's longer, skip
A.1 and accept the smaller saving.

**Files touched:**

- New: `skills/planning-loop/lib/preflight.sh`
- New: `skills/planning-loop/lib/auto-apply.sh`
- Edit: `skills/planning-loop/SKILL.md` (delete inline bash, replace
  with one-line helper invocations; collapse Phase 1a verbosity into
  abort-reason table per A.1).

**Success criteria:**

- `run-fixtures.sh` passes (all 15 fixtures green).
- A REVISE-mode dry-run on a known-clean spec reaches Step 5 without errors.
- SKILL.md byte count drops by ≥ 10KB.
- No paths inside SKILL.md reference `skills/planning-loop/lib/...`
  (relative); only `$HOME/.claude/skills/planning-loop/lib/...` (absolute).
- After A.1 (if taken): every "see Step …" cross-reference in SKILL.md
  resolves; the abort-reason enum is preserved (grep
  `validation-failure|hash-mismatch|apply-failure|log-append-failure|orphan-tmp-detected|verdict-id-mismatch|verdict-missing|mixed-routing-incomplete|log-parse-failure|opt-out-set`
  — distinct reasons must not drop).

**Rollback:** `git restore skills/planning-loop/SKILL.md` and
`git rm skills/planning-loop/lib/preflight.sh skills/planning-loop/lib/auto-apply.sh`.
A.1 alone can be rolled back independently with `git restore
skills/planning-loop/SKILL.md` if the collapse is taken and regretted —
the helper scripts stay.

**Estimated savings:** ~13KB / ~3.25K tokens (A bash extract ~10KB +
A.1 collapse ~3KB; A.1 may not happen, in which case ~10KB / ~2.5K).

---

## Phase B — Compress the frontmatter description (low risk)

**Goal:** drop the description from 710 bytes to ~250 bytes (~50 tokens).
This saves on **every Claude Code session**, not just `/planning-loop`
invocations.

**What to keep:** the trigger phrases that drive fuzzy match — `/planning-loop`,
"plan and adversarially review", "iterate this spec to LGTM", "Codex
adversarial review". Those are how the model recognizes invocation intent in
free text.

**What to drop:** the modes explanation ("Two modes. (1) FRESH... (2)
REVISE..."). It's already in the body and isn't needed for fuzzy match.

**Draft replacement:**

```yaml
description: Drive a spec through Codex's adversarial-review loop to an `approve` verdict in ≤3 rounds. Two modes — FRESH (spec-planner drafts from a prose blob) and REVISE (`--revise <path>` iterates an existing spec). Use when the user types `/planning-loop`, says "plan and adversarially review X", "iterate this spec to LGTM", or "have Codex stress-test this plan".
```

That's ~390 bytes. If it still feels long, drop the parenthetical mode
hints — they're recoverable from the body.

**Success criteria:**

- `description` is ≤ 400 bytes.
- Manual smoke test: type the four trigger phrases in fresh sessions; skill
  surfaces in each.

**Rollback:** trivial — single-line revert.

**Estimated savings:** ~130 tokens preloaded per session.

---

## Phase C — Trim inline rationale parentheticals (conditional, judgment-heavy)

**Run this phase only if Phases A (incl. A.1) + B haven't met the ~7K-token
target.** Note: this was "Phase D" in the original plan; the former Phase C
was folded into Phase A as sub-step A.1, so this is now C.

**The trap:** parentheticals like "(F4 mitigation, external-mutation
detection)", "(load-bearing F2 mitigation)", "(Phase 1c — recovery for
hard-kill mid-Step-6f)" trace back to specific load-bearing risks in the
spec under `docs/specs/2026-04-27-planning-loop-auto-apply-arbiter.md`.
Removing them blindly is how invariants quietly drop.

**Approach if we do this:**

1. List every parenthetical of the form `(F\d+ ...)` or `(... mitigation)`.
2. For each, decide individually: does removing the parenthetical change
   what Claude would do, or just why? Remove only the why-only ones.
3. Move the why-not-removable ones into a single short "Risk register" block
   at the bottom of SKILL.md, indexed by F-number, where they cost less than
   inline.

**Pre-condition before starting:** read the auto-apply spec
(`docs/specs/2026-04-27-planning-loop-auto-apply-arbiter.md`) once to
re-anchor what F1–F5 actually are. Don't trim from memory.

**Success criteria:**

- `run-fixtures.sh` passes.
- Every F-number referenced in the surviving SKILL.md resolves (either to
  the new Risk Register or to the spec's risk register).
- Token cost ≤ 7K on the skill.

**Rollback:** `git restore skills/planning-loop/SKILL.md`.

**Estimated savings:** ~1.5KB / ~400 tokens.

---

## Token cost ledger

| Phase | Bytes saved | Tokens saved | Cumulative SKILL.md size | Cumulative tokens |
|-------|-------------|--------------|--------------------------|-------------------|
| baseline | — | — | 55,707 | ~14,000 |
| A (bash extract, no A.1) | ~10,000 | ~2,500 | ~46,000 | ~11,500 |
| A.1 (contract collapse, if taken) | ~3,000 | ~750 | ~43,000 | ~10,750 |
| B (description) | ~330 (frontmatter only) | ~130 (per session) | ~43,000 (skill body) | ~10,750 (per invocation) |
| C (trim rationale, optional) | ~1,500 | ~400 | ~41,500 | ~10,350 |

Phases A (incl. A.1 if it falls out cheap) + B get the bulk of the win.
Treat C as a tail-end optimization only.

## Resolved decisions

These were the original plan's open questions; resolved 2026-04-28 before
any implementation began.

1. **Shared helpers between `preflight.sh` and `auto-apply.sh` — NO.** They
   exit at different control-flow points: preflight aborts the whole skill,
   auto-apply aborts to the cap-reached menu while the skill keeps running.
   Sharing an abort-emitter would couple unrelated exit semantics for
   minimal saved code.
2. **`run-fixtures.sh` sourcing `lib/auto-apply.sh` — DEFER.** The fixture
   driver was deliberately bash-3.2-compatible (per commit `846cd1b`).
   Coupling them forces the lib script to that constraint too. Worth doing
   eventually as a follow-up that eliminates fixture-driver drift, but it's
   a separate decision and does NOT gate Phase A. Track in the project
   parking lot once Phase A lands.
3. **Phase C dedupe folds into Phase A — YES.** Once Phase A removes the
   bash from Step 6f Phase 1a, what remains collapses naturally into an
   abort-reason mapping table (no longer duplicative with Step 6e's
   contract clauses). Folded in as sub-step A.1 with its own gate (skip if
   cross-references get tangled). Former Phase D renumbered to Phase C.
