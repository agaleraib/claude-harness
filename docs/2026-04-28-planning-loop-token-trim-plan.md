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

**Files touched:**

- New: `skills/planning-loop/lib/preflight.sh`
- New: `skills/planning-loop/lib/auto-apply.sh`
- Edit: `skills/planning-loop/SKILL.md` (delete inline bash, replace with
  one-line helper invocations)

**Success criteria:**

- `run-fixtures.sh` passes (all 15 fixtures green).
- A REVISE-mode dry-run on a known-clean spec reaches Step 5 without errors.
- SKILL.md byte count drops by ≥ 8KB.
- No paths inside SKILL.md reference `skills/planning-loop/lib/...`
  (relative); only `$HOME/.claude/skills/planning-loop/lib/...` (absolute).

**Rollback:** `git restore skills/planning-loop/SKILL.md` and
`git rm skills/planning-loop/lib/preflight.sh skills/planning-loop/lib/auto-apply.sh`.

**Estimated savings:** ~10KB / ~2.5K tokens off the skill load.

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

## Phase C — Dedupe the JSON edit-block contract (conditional, judgment-heavy)

**Run this phase only if Phases A+B haven't met the ~30KB target.**

**The trap:** Step 6e (clause 5) and Step 6f Phase 1a (per-finding loop) look
duplicative but are not the same content. 6e is a *contract spec* — what's
required, in declarative voice. 6f is a *runtime check list* — how each
clause is verified, with abort reasons and detail-message templates. A naive
collapse loses one or the other.

**Approach if we do this:**

1. Pick 6e as the canonical contract definition. It already reads like a
   spec.
2. Rewrite 6f Phase 1a as a numbered list that *cross-references* 6e clauses
   by number ("verifies clause 5 rule 6 — substring count == 1; abort reason
   `validation-failure`, detail template `F<i>: <field> matches N times in
   $SPEC_PATH`").
3. Keep the abort-reason enum + audit-entry shape blocks intact — those are
   the API contract with the log file (distribution invariant #3).
4. Walk every back-reference in SKILL.md ("see Step 6f Phase 1a", "per the
   contract in `### 6e.`") and confirm each still resolves after the
   collapse.

**Pre-condition before starting:** open Step 6e and Step 6f Phase 1a side by
side and write a one-paragraph diff of what's actually unique to each.
Confirm the diff is ≤ 5 items before proceeding. If it's longer, the
sections aren't really duplicates and this phase is a no-go.

**Success criteria:**

- `run-fixtures.sh` passes.
- Every "see Step …" cross-reference in SKILL.md resolves.
- No abort reason from the master enum is silently dropped (grep
  `validation-failure|hash-mismatch|apply-failure|log-append-failure|orphan-tmp-detected|verdict-id-mismatch|verdict-missing|mixed-routing-incomplete|log-parse-failure|opt-out-set`
  before and after, counts must match — appearances may go down, distinct
  reasons must not).

**Rollback:** `git restore skills/planning-loop/SKILL.md`.

**Estimated savings:** ~3KB / ~750 tokens.

---

## Phase D — Trim inline rationale parentheticals (conditional, judgment-heavy)

**Run this phase only if Phases A–C haven't met the target.**

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
| A (bash extract) | ~10,000 | ~2,500 | ~46,000 | ~11,500 |
| B (description) | ~330 (frontmatter only) | ~130 (per session) | ~46,000 (skill body) | ~11,500 (per invocation) |
| C (dedupe contract) | ~3,000 | ~750 | ~43,000 | ~10,750 |
| D (trim rationale) | ~1,500 | ~400 | ~41,500 | ~10,350 |

Phases A+B alone get ~75% of the available win. Treat C and D as optional.

## Open questions

1. Should `lib/preflight.sh` and `lib/auto-apply.sh` share helpers (e.g.
   shared abort-reason emitter)? Lean **no** for now — they exit at
   different points and shared helpers add coupling.
2. Should `run-fixtures.sh` be updated to source the new `lib/auto-apply.sh`
   instead of re-implementing the logic? Big upside (eliminates the "fixture
   driver drifts from skill" risk). Treat as a follow-up after Phase A
   lands; don't gate Phase A on it.
3. Phase C's contract dedupe might be cleaner to do *as part of* Phase A's
   bash extraction (the Phase 1a loop becomes a script, so the SKILL.md
   side naturally collapses). Decide during Phase A implementation —
   if the natural collapse falls out cheap, take it; otherwise keep C
   separate.
