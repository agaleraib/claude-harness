# spec-planner strict acceptance-check discipline — enforce machine-verifiable acceptance criteria

> **Board wave:** Wave 25 · Phases 1–2 · Tasks 1–6 · Features F-037–F-039
> _(Machine-readable map per AGENTS.md §"Plan & spec grammar". `Wave 25` is the board number; `Phase`/`Task` restart at 1 inside this spec. `F-0xx` is global/monotonic.)_

## Prior Work
Builds on: [spec-planner agent definition](/.claude/agents/spec-planner.md) and the `/planning-loop` Codex adversarial-review dispatch.
Assumes: spec-planner already enforces two disciplines (Manual-fallback bullets, WORKFLOW.md row delta), each with a self-check + summary-line field. Manual-fallback is enforced by a **Codex reviewer criterion**; WORKFLOW.md-delta by a **mechanical `preflight-abort` gate** (safe there because presence/absence of a delta table is a purely structural signal). This spec adds a third discipline — acceptance-criteria strictness — following the **Manual-fallback pattern** (self-check + summary field + Codex reviewer criterion), because "is this criterion genuinely verifiable?" is a semantic judgment, not a structural presence signal.
Changes: nothing is removed. spec-planner gains one self-check + one summary-line field + one Rule; `/planning-loop` gains one Codex reviewer criterion wired to a new shared scanner's `sub-strict:` diagnostics. The shared scanner is the single source of truth for the grammar. There is deliberately **no** mechanical abort gate for acceptance criteria — an earlier draft carried one; it was dropped after adversarial review (see Out of Scope).

## Overview

spec-planner emits acceptance criteria as the pass/fail contract a coding agent and an evaluator agent must agree on. Its prose already demands "hard-threshold acceptance criteria" (Rule 2, Rule 4), but — unlike the Manual-fallback and WORKFLOW.md-delta disciplines — that demand is enforced **only by exhortation**. There is no self-check, no summary-line field, and no reviewer criterion. A spec can ship with `works cleanly`, `feels fast`, or `properly handles errors` and nothing catches it.

This spec closes that asymmetry. It gives acceptance-criteria strictness the same discipline the Manual-fallback rule already has — a self-check plus a Codex reviewer criterion — but grounds both in **one deterministic scanner** so there is exactly one definition of "strict":

1. a shared, deterministic **scanner** (`skills/planning-loop/lib/acceptance-strictness.sh`) that implements the finite strictness grammar and emits `strict=<P> total=<T>` plus one `sub-strict: <reason> :: <bullet>` line per sub-strict bullet,
2. a **MANDATORY self-check** in spec-planner that mirrors the scanner's grammar in prose, WARNS (never blocks — fail-open), and populates a **new field in the final summary line** (`Acceptance criteria: <P>/<T> strict`) so strictness is greppable/auditable — this summary field is the auditable surface,
3. a **wired Codex reviewer criterion**: `/planning-loop` runs the scanner before each adversarial-review dispatch and injects the `sub-strict:` diagnostics verbatim into the reviewer prompt + round log, so Codex flags sub-strict criteria as `needs-attention` grounded in the scanner's deterministic output rather than re-interpreted prose.

Unlike the structural WORKFLOW.md-delta discipline (a purely present/absent signal, safe to enforce with a deterministic `exit 1`), "is this acceptance criterion genuinely verifiable?" is a **semantic judgment** — so it is enforced by the Codex reviewer, NOT a mechanical abort. There is deliberately no `preflight-abort` layer for acceptance strictness.

**Who it is for:** the harness operator and every downstream project that installs spec-planner via `setup-harness`. **Problem solved:** vague, judgment-laden acceptance criteria silently reaching the builder.

### The strict acceptance-criterion grammar (finite, testable — single source of truth)

The predicate is a **deterministic grammar**, implemented ONCE in the shared scanner `skills/planning-loop/lib/acceptance-strictness.sh` (Task 3) and mirrored verbatim in spec-planner's self-check prose. Nuance beyond this grammar is the Codex reviewer's job, NOT the grammar's. There is no "non-exhaustive" clause and no open-ended judgment anywhere in the grammar.

**Engine + locale are pinned (Finding 1 — one dialect, one result).** Every regex below is **POSIX ERE**, evaluated by the scanner with `LC_ALL=C grep -E` (case-insensitive mechanisms/lexicon use `LC_ALL=C grep -Ei`). Three portability rules hold everywhere in this grammar: (1) alternation is written with a **bare** `|`, never the escaped `\|` (in `grep -E`, `\|` is a literal pipe); (2) there is **no** `\b` word boundary (POSIX ERE has none) — boundaries are the explicit delimiter class `(^|[^[:alnum:]_])` … `([^[:alnum:]_]|$)`; (3) **no Unicode** characters appear in any regex (comparators are ASCII-only). A `LC_ALL=C grep -E`/bash reference implementation, the spec-planner self-check, and the Codex reviewer therefore classify the same bullet identically.

**(a) SCOPE — which lines are scanned.** A line is an *acceptance-criteria bullet* iff it matches `^[[:space:]]*- \[ \][[:space:]]` AND it lies inside an OPEN acceptance-criteria block. A block OPENS on any line matching `^[[:space:]]*\*\*Acceptance criteria` and CLOSES on the next line matching `^#{2,6}[[:space:]]` (any `##`–`######` ATX heading) or the next block-opening marker. Bullets outside an open block — notably Implementation-Plan `- [ ] **Task N:**` checkboxes — are NEVER scanned.

**(b) JUDGMENT-WORD LEXICON — closed, whole-token, delimiter-bounded.** POSIX ERE has no `\b`, so the word boundary is the explicit non-word delimiter class. The scanner matches EXACTLY this alternation (run via `LC_ALL=C grep -Ei`) and no other words:

```
(^|[^[:alnum:]_])(clean|cleanly|fast|quick|quickly|intuitive|intuitively|smooth|smoothly|robust|robustly|graceful|gracefully|proper|properly|correct|correctly|seamless|seamlessly|user-friendly|performant|reliable|reliably|scalable|nice|snappy|responsive)([^[:alnum:]_]|$)
```

This list is **exhaustive** — the scanner adds no words at scan time. The delimiter class matches **whole tokens only**: `cleanup` does NOT trip `clean` (the trailing `u` is `[:alnum:]`, so the closing boundary fails) and `fastener` does NOT trip `fast` — proven by fixture `strict-word-boundary-edge.md`. POSIX ERE `grep -E` is leftmost-longest, so `cleanly` matches the `cleanly` alternative, not `clean`; `user-friendly` matches as a single alternative because the literal `-` sits inside the alternation (the delimiter class only guards the ends).

**(c) MECHANISM REGEXES — a bullet "names a mechanism" iff ≥1 of M1–M4 matches.** All regexes are POSIX ERE run via `LC_ALL=C grep -E` (M4 via `LC_ALL=C grep -Ei`); alternation is bare `|` (never `\|`); no `\b`; no Unicode:

| # | Mechanism | Regex (POSIX ERE) |
|---|---|---|
| M1 | backtick-fenced code span (see M1-binding rule below for judgment bullets) | `` `[^`]+` `` |
| M2 | HTTP verb + path token | `(^|[^[:alnum:]_])(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)[[:space:]]+/` |
| M3 | ASCII numeric comparator token | `(<=|>=|==|<|>)[[:space:]]*[0-9]` |
| M4 | Error/Edge-case prefix | `(Error case|Edge case):` |

M3 is **ASCII-only** — the Unicode comparators `≤`/`≥` are dropped (they depend on locale/encoding); only `<`, `>`, `<=`, `>=`, `==` count. The `<=|>=|==` alternatives precede `<|>` so leftmost-longest binds the two-character operators first. M2 bounds the verb with the same delimiter class as the lexicon so `TARGET /x` (verb not a whole token) does not match.

**M1-binding rule for judgment bullets (Finding 4 — closes vacuous binding; a scanner-accuracy tweak, no hard gate depends on it).** When a scoped bullet matches the judgment lexicon (b), an M1 backtick span counts as a binding mechanism ONLY IF the span is *command-shaped* — its inner text (between the backticks) matches `LC_ALL=C grep -E '[-/=(]'` (contains at least one of `-`, `/`, `=`, `(`, i.e. looks like a flag / path / assignment / call). A bare-phrase span such as `` `dark mode` `` (only alphanumerics and spaces) does NOT bind; the bullet stays `unbound-judgment` (fixture `strict-incidental-span-darkmode.md`). A command-shaped span such as `` `grep -c foo bar` `` DOES bind (fixture `strict-command-span-binds.md`). For bullets that do NOT match the judgment lexicon, M1 is unchanged: any `` `…` `` span counts. M2–M4 are unaffected — a comparator like `< 768px` still binds via M3 regardless of backticks. (A bare space is excluded from the command-shaped set so an incidental phrase span like `` `dark mode` `` does not bind; comparators such as `< 768px` are covered by M3 independently, so dropping `<`/`>` from the M1 set loses no coverage.)

**(d) BINDING + STRICTNESS.** A scoped bullet is **strict** iff it matches ≥1 mechanism regex (M1–M4). Otherwise it is **sub-strict**, tagged with one reason code:

- `unbound-judgment` — matches the judgment lexicon (b) AND matches zero mechanism regexes (M1 evaluated under the narrowed binding rule above for judgment bullets, so an incidental bare-phrase backtick span does not disqualify this reason code).
- `no-mechanism` — matches zero mechanism regexes AND no judgment word (a bullet asserting nothing verifiable).

Equivalently: a judgment word is *allowed* iff the same bullet also matches a mechanism regex (it is then "bound"). `P` = count of strict bullets; `T` = count of scoped bullets. The scanner prints a first line `strict=<P> total=<T>`, then one `sub-strict: <reason> :: <bullet-text>` line per sub-strict bullet. That is the scanner's entire output contract — there is no abort flag; the nuanced decision of what to do about a sub-strict bullet belongs to the Codex reviewer.

**Layering keeps false-positives cheap** — the two enforcement layers read *different* grammar outputs:

| Enforcement layer | Reads | Consequence | Reversible by |
|---|---|---|---|
| spec-planner self-check | scanner grammar (mirrored in prose) | WARN + `<P>/<T>` in summary line | n/a (never blocks) |
| `/planning-loop` Codex reviewer criterion | the scanner's `sub-strict:` lines injected **verbatim** into the review prompt + round log (grammar output + human judgment) | `needs-attention` finding | operator resolves in loop |

This mirrors the Manual-fallback discipline: both are enforced by a Codex reviewer criterion rather than a mechanical gate, because "is this genuinely verifiable?" is a semantic judgment (the structural WORKFLOW.md-delta gate can be mechanical precisely because presence/absence of a delta table is not a judgment). This spec is itself dogfooded: every acceptance criterion below is strict under M1–M4 (each carries a command-shaped backtick span, an `Error case:`/`Edge case:` prefix, or an ASCII comparator token).

## Implementation

**Recommended flow:** `/run-wave 25 → /close-wave 25`
**Reason:** 3 features across 2 phases touching ≥4 files (`spec-planner.md`, `acceptance-strictness.sh` (new), `acceptance-review-focus.sh` (new), `codex-prompts.md`, `SKILL.md`, fixtures); layer-1 tasks (Task 1 self-check, Task 3 scanner, Task 4 Codex criterion) are dependency-independent → parallelism rank 3. Signals 1 and 3 of the wave checklist are TRUE.
**Alternatives:** Micro-shaped is defensible — partial completion is not *breaking* here (signal 2 is FALSE), so `/micro` per task with `/commit` between would also work. Wave chosen for the atomic "discipline lands as one coherent unit" property.
**Implementation block written:** 2026-07-02

_plan.md consequence:_ wave-shaped → a `### Wave 25` block is appended to `docs/plan.md` **at land time by `/spec-planner` semantics**, NOT during this `/planning-loop` review (plan.md ownership is exclusive to `/spec-planner`; `/planning-loop` must not touch plan.md). Do not append a `status: ready` row for an unapproved spec.

## Requirements

### Phase 1: spec-planner self-check + summary line

#### F-037 — Acceptance-criteria strictness self-check (spec-planner)

Add a MANDATORY "Acceptance-criteria strictness self-check" subsection to `.claude/agents/spec-planner.md` (sibling to the existing Manual-fallback self-check), plus a codifying Rule. The subsection documents that the check **mirrors the shared scanner's grammar** (single source of truth), WARNS on each sub-strict bullet naming the reason code, and NEVER blocks emission. Behavioral verification of the grammar is NOT the LLM's job — it lives in the scanner + fixtures (F-039); the self-check only WARNs and feeds the summary line.

**Acceptance criteria (hard thresholds — all must pass):**
- [ ] `grep -c 'Acceptance-criteria strictness self-check' .claude/agents/spec-planner.md` returns `>= 1` (subsection heading present).
- [ ] The self-check documents it mirrors the shared scanner (single source of truth): `grep -Ec 'acceptance-strictness\.sh|shared scanner' .claude/agents/spec-planner.md` returns `>= 1`.
- [ ] Both grammar halves are named in the file: `grep -c 'mechanism' .claude/agents/spec-planner.md` returns `>= 1` AND `grep -Eic 'judgment (word|lexicon)' .claude/agents/spec-planner.md` returns `>= 1`.
- [ ] The subsection states the check is fail-open: `grep -Ec 'still ships|do not block|does not block|never block' .claude/agents/spec-planner.md` returns `>= 1`.
- [ ] A new Rule numbered 15 exists in the `## Rules` list: `grep -Ec '^15\. ' .claude/agents/spec-planner.md` returns `== 1`.
- [ ] Edge case: the file names at least one judgment word from lexicon (b) so the guidance is concrete, not abstract: `grep -Eic 'clean|graceful|properly|performant' .claude/agents/spec-planner.md` returns `>= 1`.

#### F-038 — Final summary-line strictness field (spec-planner)

Extend spec-planner's mandatory final summary line with an `Acceptance criteria: <P>/<T> strict` field (P = strict bullets, T = total scoped bullets), sourced from the shared scanner's `strict=<P> total=<T>` output, so downstream tooling can `grep` the strictness result exactly as it greps the Manual-fallback bullet count.

**Acceptance criteria (hard thresholds — all must pass):**
- [ ] The summary-line template in `.claude/agents/spec-planner.md` includes the literal token `Acceptance criteria:` followed by a `<P>/<T> strict` placeholder: `grep -Ec 'Acceptance criteria: <?[PN]>?/<?[TN]>? *strict' .claude/agents/spec-planner.md` returns `>= 1`.
- [ ] The field is documented as sourced from the shared scanner, not a re-implementation: `grep -Ec 'acceptance-strictness\.sh|strict=<?P' .claude/agents/spec-planner.md` returns `>= 1`.
- [ ] Edge case: a spec with zero scoped acceptance bullets → field renders `0/0 strict` (documented literal `0/0` appears in the section): `grep -Ec '0/0' .claude/agents/spec-planner.md` returns `>= 1`.

### Phase 2: /planning-loop enforcement

#### F-039 — Shared scanner + wired Codex reviewer criterion (`/planning-loop`)

Build the shared deterministic scanner, add a nuanced reviewer criterion to `skills/planning-loop/references/codex-prompts.md`, **wire the scanner's `sub-strict:` diagnostics into the Codex review dispatch** (`skills/planning-loop/SKILL.md` Step 5b) through a shared focus-builder helper so Codex reviews the scanner's deterministic output rather than re-interpreting prose (Finding 2), and prove the whole grammar behaviorally with fixtures. **Enforcement behavior is verified here — against real scanner outputs — not by grepping prose.** There is no mechanical abort layer: the scanner classifies, the summary field audits, and the Codex reviewer judges.

**Scanner contract (`acceptance-strictness.sh <spec_path>`):** stdout line 1 is `strict=<P> total=<T>`; then zero or more `sub-strict: <unbound-judgment|no-mechanism> :: <bullet>` lines. That is the whole output — no abort flag. Exit code is always `0` (it is a scanner, not a gate). It implements grammar clauses (a)–(d) verbatim and is the ONLY place the SCOPE rule, lexicon, and mechanism regexes are encoded.

**Review-focus helper contract (`acceptance-review-focus.sh` — a two-subcommand CLI) — the deterministic FOLD boundary.** The helper performs the FOLD itself so both folds are fixture-testable; it composes `acceptance-strictness.sh <spec>` internally (the scanner is the single source of truth for the grammar — the helper never re-implements it). Two explicit subcommands, exit code always `0`:

- `acceptance-review-focus.sh --emit-focus "<base-focus>" <spec>` → prints the FINAL Codex focus string on stdout = the caller's `<base-focus>` verbatim, then the strictness block: the verbatim `sub-strict:` lines from `acceptance-strictness.sh <spec>`, or the single line `all acceptance criteria are strict` when the scanner reports none.
- `acceptance-review-focus.sh --emit-log <spec>` → prints the round-log entry block on stdout (the same strictness block, log-formatted under a `FOCUS — acceptance-criteria strictness (auto-generated, do not edit):` header).

`/planning-loop` Step 5b reduces to a caller-guarded pair of VERBATIM helper calls — the skill performs NO string transformation of its own, it passes helper stdout straight through, and the `[[ -x ]]` guard makes a missing/non-executable helper a true no-op (fail-open at the caller, so `$FOCUS` is never clobbered by a `bash: ... No such file` 127):

```
HELPER="$HOME/.claude/skills/planning-loop/lib/acceptance-review-focus.sh"
if [[ -x "$HELPER" ]]; then                                        # caller-side guard = true fail-open
  FOCUS="$(bash "$HELPER" --emit-focus "$FOCUS" "$SPEC_PATH")"     # before the adversarial-review dispatch
  bash "$HELPER" --emit-log "$SPEC_PATH" >> "$LOG_PATH"            # append to the round log
fi                                                                 # helper absent/non-exec → $FOCUS unchanged, no log line, review proceeds
```

The scanner is not invoked anywhere else in the review path; the FOLD (base-focus + strictness block, and the log block) lives inside the helper where a fixture asserts it byte-for-byte.

**Testability boundary (Finding 2 closure — the fold itself is now machine-proven).** Because the FOLD lives inside the helper (`--emit-focus` builds base-focus + strictness block; `--emit-log` builds the log block), Task 6's fixture asserts both folded outputs against a sample spec. The ONLY surface not machine-asserted is the single SKILL.md line that invokes each subcommand and assigns its stdout to `$FOCUS` / redirects it to `$LOG_PATH` — an irreducibly LLM-executed skill step, covered by grep-presence + per-commit review. All deterministic string construction lives in the fixture-proven helper; there is no untested transformation between the asserted helper output and the reviewer input. That is the terminal proof boundary — no further layers.

**Acceptance criteria (hard thresholds — all must pass):**
- [ ] Scanner strict path: `bash skills/planning-loop/lib/acceptance-strictness.sh skills/planning-loop/lib/test-fixtures/strict-all-clean.md` prints a first line matching `^strict=([0-9]+) total=\1$` (P == T) and zero `sub-strict:` lines (Task-5 harness asserts both).
- [ ] Mechanisms M1–M4 each bind alone: `bash skills/planning-loop/lib/acceptance-strictness.sh skills/planning-loop/lib/test-fixtures/strict-mechanisms-each.md` prints `strict=4 total=4` and zero `sub-strict:` lines (four bullets, one matching exactly M1, M2, M3, M4 respectively — proves each mechanism binds standalone under `LC_ALL=C grep -E`).
- [ ] Word-boundary edge: `bash skills/planning-loop/lib/acceptance-strictness.sh skills/planning-loop/lib/test-fixtures/strict-word-boundary-edge.md` (single bullet containing `cleanup` + `fastener`, no real lexicon token and no mechanism) prints `strict=0 total=1` and exactly one `^sub-strict: no-mechanism ::` line — NOT `unbound-judgment` — proving `cleanup`/`fastener` do not trip `clean`/`fast`.
- [ ] Incidental bare-phrase span does not rescue a vague bullet (Finding 4): `bash skills/planning-loop/lib/acceptance-strictness.sh skills/planning-loop/lib/test-fixtures/strict-incidental-span-darkmode.md` prints `strict=0 total=1` and one `^sub-strict: unbound-judgment ::` line (the `` `dark mode` `` span is not command-shaped, so M1 does not bind the `clean` judgment).
- [ ] Command-shaped span binds a judgment bullet (Finding 4): `bash skills/planning-loop/lib/acceptance-strictness.sh skills/planning-loop/lib/test-fixtures/strict-command-span-binds.md` prints `strict=1 total=1` (the `` `grep -c foo bar` `` span contains `-`, is command-shaped, and binds M1).
- [ ] Scanner mixed counts: `bash skills/planning-loop/lib/acceptance-strictness.sh skills/planning-loop/lib/test-fixtures/strict-mixed-counts.md` prints `strict=2 total=3` and exactly one `sub-strict:` line (Task-5 harness asserts the count `== 1`).
- [ ] Scope: `bash skills/planning-loop/lib/acceptance-strictness.sh skills/planning-loop/lib/test-fixtures/strict-task-checkbox-immune.md` prints `total=0` (the judgment-word `- [ ]` bullet is an Implementation-Plan task checkbox, out of any open acceptance block).
- [ ] Error case: `bash skills/planning-loop/lib/acceptance-strictness.sh skills/planning-loop/lib/test-fixtures/strict-no-requirements.md` (no `**Acceptance criteria` marker) prints `strict=0 total=0` and exits `0` (no crash).
- [ ] Codex layer criterion present AND scoped to its own block (a stray token elsewhere must NOT satisfy it): extracting the strictness criterion block with `awk '/\*\*Acceptance-criteria strictness/{f=1} f{print} f&&/^[[:space:]]*$/{exit}' skills/planning-loop/references/codex-prompts.md` yields a non-empty block that contains BOTH `sub-strict` AND `needs-attention` (the harness runs the awk block-extraction then two `grep -q` over the extracted block, so the pre-existing Portability criterion's `needs-attention` cannot satisfy this).
- [ ] LOAD-BEARING fold proof (Finding 2 closure): against `strict-review-focus-sample.md` (a full spec whose only sub-strict bullet is `- [ ] Clean shutdown on SIGTERM.`), BOTH `bash skills/planning-loop/lib/acceptance-review-focus.sh --emit-focus "REVIEW-FOCUS: check portability" skills/planning-loop/lib/test-fixtures/strict-review-focus-sample.md` AND `bash skills/planning-loop/lib/acceptance-review-focus.sh --emit-log skills/planning-loop/lib/test-fixtures/strict-review-focus-sample.md` produce output containing the exact verbatim line `sub-strict: unbound-judgment :: - [ ] Clean shutdown on SIGTERM.` (Task-6 harness asserts both via `grep -F`); the `--emit-focus` output ALSO contains the caller's base focus `REVIEW-FOCUS: check portability` verbatim. This proves the fold reaching the reviewer AND the fold reaching the log both carry the scanner's diagnostics.
- [ ] Edge case: for a fully-strict spec, `bash skills/planning-loop/lib/acceptance-review-focus.sh --emit-log skills/planning-loop/lib/test-fixtures/strict-all-clean.md` emits the `FOCUS — acceptance-criteria strictness` header followed by the literal `all acceptance criteria are strict`, emits zero `sub-strict:` lines, and exits `0`; `bash skills/planning-loop/lib/acceptance-review-focus.sh --emit-focus "BASE-FOCUS" skills/planning-loop/lib/test-fixtures/strict-all-clean.md` emits `BASE-FOCUS` followed by `all acceptance criteria are strict` and zero `sub-strict:` lines (the strictness block is always self-contained — the helper never emits raw scanner output).
- [ ] Edge case: Step 5b invokes both subcommands (secondary — grep is all an LLM-executed skill line can assert): `grep -Ec '"\$HOME/\.claude/skills/planning-loop/lib/acceptance-review-focus\.sh" --emit-focus' skills/planning-loop/SKILL.md` returns `>= 1` AND `grep -Ec '"\$HOME/\.claude/skills/planning-loop/lib/acceptance-review-focus\.sh" --emit-log' skills/planning-loop/SKILL.md` returns `>= 1` (the skill captures `FOCUS="$(... --emit-focus "$FOCUS" "$SPEC_PATH")"` before the dispatch and redirects `... --emit-log "$SPEC_PATH" >> "$LOG_PATH"` to the round log, performing no string transformation of its own).
- [ ] Edge case: Step 5b fails open on an absent helper via a caller-side guard: `grep -Ec 'if \[\[ -x "\$HELPER" \]\]' skills/planning-loop/SKILL.md` returns `>= 1` (the guard wraps both helper calls so a missing/non-executable helper leaves `$FOCUS` unchanged and writes no log line — a bare `bash <missing>` returning `127` never clobbers the base focus; secondary grep, consistent with the terminal LLM-executed boundary).

## Constraints
- spec-planner.md is an LLM prompt: F-037/F-038 criteria verify **instruction presence** (grep), not model obedience. Behavioral enforcement of the grammar lives in the shared scanner `acceptance-strictness.sh` + its fixtures (Task 5) — deterministic bash — NOT in the LLM self-check. The self-check's only job is to WARN and populate the summary line by invoking/mirroring that one scanner.
- **Single source of truth.** The grammar (SCOPE + closed lexicon + mechanism regexes M1–M4 + binding) is implemented ONCE, in `acceptance-strictness.sh`. Both the review-focus helper and the fixtures call that scanner; spec-planner's self-check mirrors its grammar in prose. No second copy of the regexes anywhere.
- The Codex wiring must not re-implement the grammar and must perform the FOLD inside the helper: `/planning-loop` Step 5b runs exactly `FOCUS="$(bash "$HOME/.claude/skills/planning-loop/lib/acceptance-review-focus.sh" --emit-focus "$FOCUS" "$SPEC_PATH")"` before the dispatch and `bash "$HOME/.claude/skills/planning-loop/lib/acceptance-review-focus.sh" --emit-log "$SPEC_PATH" >> "$LOG_PATH"` for the round log; each subcommand composes `acceptance-strictness.sh` internally (single source of truth) and does the fold. **The helper is the deterministic FOLD boundary. The only surface not machine-asserted is the single SKILL.md line that invokes the helper and assigns its stdout to `$FOCUS` / redirects to `$LOG_PATH` — an irreducibly LLM-executed skill step, covered by grep-presence + per-commit review. All deterministic string construction lives in the fixture-proven helper; there is no untested transformation between the asserted helper output and the reviewer input.** This is the terminal boundary — no further layers are invented. **Fail-open is enforced at the CALLER, not by the helper** (a missing file cannot run code to preserve `$FOCUS`): Step 5b guards both calls with `if [[ -x "$HELPER" ]]`, so an absent/non-executable helper leaves `$FOCUS` unchanged and writes no log line. Separately, when the helper IS present but its internal `acceptance-strictness.sh` is missing/non-executable, `--emit-focus` echoes the base focus unchanged and `--emit-log` emits a no-op line. Both partial-install cases (missing helper, missing scanner) degrade to an unchanged review.
- **Helper path convention.** The production Step 5b invocation and every manual-fallback command use the canonical installed path `"$HOME/.claude/skills/planning-loop/lib/acceptance-review-focus.sh"` (matching how `preflight.sh`/`restore.sh` are already invoked in `SKILL.md`), and the Step 5b presence-grep asserts that exact shape. Verify/fixture commands deliberately use the repo-relative `skills/planning-loop/lib/...` form because they run from the repo root during development — the two forms are intentional, not an inconsistency.
- The judgment lexicon is closed at scan time; the Codex reviewer criterion — not the scanner — is the authority for nuanced sub-strict cases the grammar cannot see (contextual meanings, unrecognized mechanisms).

## Out of Scope
- A mechanical `preflight-abort` gate for acceptance criteria — **deliberately dropped**. Deciding "is this criterion genuinely verifiable?" is a semantic judgment; forcing it into a deterministic `exit 1` (as the structural WORKFLOW.md-delta gate does) is a category error and drew a false-positive finding in every adversarial-review round. Enforcement is the Codex reviewer criterion, not an abort.
- Rewriting existing shipped specs to pass the new check (forward-only; historical specs are grandfathered).
- Any change to the Manual-fallback or WORKFLOW.md-delta disciplines.
- A standalone lint CLI for acceptance criteria outside the spec-planner / planning-loop path (the scanner ships as a `lib/` helper, not a user-facing command).
- Auto-*fixing* sub-strict criteria (the check flags; the author rewrites).
- Expanding the closed lexicon or mechanism set at scan time (any change is a code edit to `acceptance-strictness.sh` + fixtures, reviewed like any other).

### WORKFLOW.md row delta

Task 6 touches `skills/planning-loop/SKILL.md`, so the spec-planner detection heuristic ("`Files:` entry pointing at `skills/<name>/SKILL.md`") DOES fire — this subsection is therefore **required**, not defensive. But **no new user-facing command is added or renamed**: `/spec-planner` and `/planning-loop` keep their existing rows, and the new `acceptance-strictness.sh` + `acceptance-review-focus.sh` are internal `lib/` helpers (not slash commands or CLI entry points). The `/planning-loop` row is **amended** — its Step 5b dispatch injects the scanner's `sub-strict:` diagnostics and its Codex prompt gains the strictness criterion. Delta:

| Protocol command | Manual | Claude Code | Codex prompt contract | Automation |
|---|---|---|---|---|
| Spec work | edit `docs/specs/…` | `/spec-planner` | *unchanged* | none |
| Review spec | read criteria and revise | `/planning-loop` (Step 5b: `--emit-focus` folds the strictness block into the reviewer FOCUS, `--emit-log` folds it into the round log) | `codex spec-reviewer` prompt: **+ acceptance-criteria strictness criterion, grounded in the injected `sub-strict:` diagnostics** | *unchanged* |

## Implementation Plan (Sprint Contracts)

### Phase 1

- [ ] **Task 1:** Add the "Acceptance-criteria strictness self-check (MANDATORY)" subsection + Rule 15 to spec-planner (F-037).
  - **Files:** `.claude/agents/spec-planner.md`
  - **Depends on:** Nothing
  - **Runner:** sandcastle   # classifier: ready-for-agent; gates: none (design pinned, no host secret, reversible, no prod action)
  - **Verify:** `grep -c 'Acceptance-criteria strictness self-check' .claude/agents/spec-planner.md` returns `>= 1` AND `grep -Ec '^15\. ' .claude/agents/spec-planner.md` returns `== 1` — both fail before, pass after.
  - **Manual fallback:** open `.claude/agents/spec-planner.md` in an editor, add the subsection under the Manual-fallback self-check (mirroring the grammar clauses (a)–(d) and pointing at `acceptance-strictness.sh` as the source of truth) plus a Rule 15 in the `## Rules` list, save, `git add` the file — no LLM required.

- [ ] **Task 2:** Extend the "Final summary line" template with the `Acceptance criteria: <P>/<T> strict` field (F-038).
  - **Files:** `.claude/agents/spec-planner.md`
  - **Depends on:** Task 1
  - **Runner:** sandcastle   # classifier: ready-for-agent; gates: none
  - **Verify:** `grep -Ec 'Acceptance criteria: <?[PN]>?/<?[TN]>? *strict' .claude/agents/spec-planner.md` returns `>= 1` — fails before, passes after.
  - **Manual fallback:** edit the "Final summary line" code block in `.claude/agents/spec-planner.md` to append the field and a sentence noting it is sourced from `acceptance-strictness.sh`, save, `git add` — plain editor edit.

### Phase 2

- [ ] **Task 3:** Build the shared deterministic scanner `acceptance-strictness.sh` implementing grammar clauses (a)–(d) (F-039, scanner core).
  - **Files:** `skills/planning-loop/lib/acceptance-strictness.sh`
  - **Depends on:** Nothing (independent of Phase 1 — different file)
  - **Runner:** sandcastle   # classifier: ready-for-agent; gates: none
  - **Verify:** `bash skills/planning-loop/lib/acceptance-strictness.sh docs/specs/2026-07-02-spec-planner-strict-acceptance.md` prints a first line matching `^strict=[0-9]+ total=[0-9]+$` and exits `0` — the file does not exist before (grep/run fails), runs after. (Full behavioral assertions land in Task 5.)
  - **Manual fallback:** hand-write the bash scanner: iterate spec lines tracking the OPEN acceptance block (SCOPE clause a), apply the closed lexicon (b) and mechanism regexes M1–M4 (c) per scoped bullet under `LC_ALL=C grep -E`, tally `strict`/`total`, emit `sub-strict:` reason lines (d); `chmod +x`, `git add` — pure bash, no LLM.

- [ ] **Task 4:** Add the acceptance-strictness reviewer criterion to codex-prompts.md (F-039, Codex layer).
  - **Files:** `skills/planning-loop/references/codex-prompts.md`
  - **Depends on:** Nothing
  - **Runner:** sandcastle   # classifier: ready-for-agent; gates: none
  - **Verify:** the strictness criterion is added as its own labeled block that instructs blocking — `awk '/\*\*Acceptance-criteria strictness/{f=1} f{print} f&&/^[[:space:]]*$/{exit}' skills/planning-loop/references/codex-prompts.md` extracts a non-empty block containing BOTH `sub-strict` AND `needs-attention` (two `grep -q` over the extracted block) — fails before (no such block), passes after; the pre-existing Portability criterion's `needs-attention` cannot satisfy it.
  - **Manual fallback:** append a criterion block labeled exactly `> **Acceptance-criteria strictness:**` (this label is the `awk` extraction anchor in F-039's acceptance criteria) next to the existing "Portability" criterion (codex-prompts.md ~line 20), mirroring its `> **…:**` shape, instructing Codex to return `needs-attention` on `sub-strict` acceptance criteria surfaced in the injected `sub-strict:` diagnostics, save, `git add`.

- [ ] **Task 5:** Add behavioral fixtures + a sub-runner asserting scanner outputs (F-039, verification layer).
  - **Files:** `skills/planning-loop/lib/test-fixtures/strict-all-clean.md`, `strict-mechanisms-each.md`, `strict-word-boundary-edge.md`, `strict-mixed-counts.md`, `strict-task-checkbox-immune.md`, `strict-no-requirements.md`, `strict-incidental-span-darkmode.md`, `strict-command-span-binds.md`, `skills/planning-loop/lib/test-fixtures/acceptance-strictness-fixtures.sh`, `skills/planning-loop/lib/test-fixtures/run-fixtures.sh`
  - **Depends on:** Task 3
  - **Runner:** sandcastle   # classifier: ready-for-agent; gates: none
  - **Verify:** `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` exits `0` with the acceptance-strictness sub-block PASS — scanner asserts: all-clean `P==T` zero sub-strict; mechanisms-each `4/4` zero sub-strict; word-boundary-edge `0/1` reason `no-mechanism`; incidental-span-darkmode `0/1` + `unbound-judgment`; command-span-binds `1/1`; mixed `2/3` one sub-strict; task-checkbox `total=0`; no-requirements `0/0` exit 0. Fails before (fixtures + sub-runner absent), passes after. (The review-focus behavioral assertion is added to this same harness by Task 6.)
  - **Manual fallback:** hand-author the eight `.md` fixtures and `acceptance-strictness-fixtures.sh` (emitting a trailing `pass=N fail=M` line like `emit-receipt-mechanical.sh`), wire a folding block into `run-fixtures.sh` copying the existing mechanical-sub-block pattern, run the harness locally to confirm green — plain bash + editor.

- [ ] **Task 6:** Wire the scanner's `sub-strict:` diagnostics into the Codex review dispatch via a shared focus-builder helper (F-039, Codex wiring layer — Finding 2).
  - **Files:** `skills/planning-loop/lib/acceptance-review-focus.sh`, `skills/planning-loop/SKILL.md`, `skills/planning-loop/references/codex-prompts.md`, `skills/planning-loop/lib/test-fixtures/strict-review-focus-sample.md`, `skills/planning-loop/lib/test-fixtures/run-fixtures.sh`
  - **Depends on:** Task 3, Task 4, Task 5
  - **Runner:** sandcastle   # classifier: ready-for-agent; gates: none (deterministic wiring, no host secret, reversible, no prod action)
  - **Verify:** against `strict-review-focus-sample.md`, BOTH `bash skills/planning-loop/lib/acceptance-review-focus.sh --emit-focus "BASE-FOCUS" skills/planning-loop/lib/test-fixtures/strict-review-focus-sample.md` AND `bash skills/planning-loop/lib/acceptance-review-focus.sh --emit-log skills/planning-loop/lib/test-fixtures/strict-review-focus-sample.md` contain the exact line `sub-strict: unbound-judgment :: - [ ] Clean shutdown on SIGTERM.` (LOAD-BEARING behavioral fold proof, asserted via `grep -F`); `--emit-focus` output also contains `BASE-FOCUS`; both subcommands against `strict-all-clean.md` emit `all acceptance criteria are strict` and zero `sub-strict:` lines, exit `0`; `grep -Ec '"\$HOME/\.claude/skills/planning-loop/lib/acceptance-review-focus\.sh" --emit-focus' skills/planning-loop/SKILL.md` returns `>= 1` AND `grep -Ec '"\$HOME/\.claude/skills/planning-loop/lib/acceptance-review-focus\.sh" --emit-log' skills/planning-loop/SKILL.md` returns `>= 1` (secondary fold-presence grep); the review-focus sub-block appended to `run-fixtures.sh` PASSes — all fail before, pass after.
  - **Manual fallback:** hand-write the two-subcommand `acceptance-review-focus.sh` (each subcommand composes `acceptance-strictness.sh "$SPEC"` internally: `--emit-focus "$BASE" "$SPEC"` prints `$BASE` then the strictness block — the verbatim `^sub-strict:` lines or `all acceptance criteria are strict`; `--emit-log "$SPEC"` prints the same strictness block under the `FOCUS — acceptance-criteria strictness (auto-generated, do not edit):` header), edit `skills/planning-loop/SKILL.md` Step 5b to the two verbatim calls `FOCUS="$(bash "$HOME/.claude/skills/planning-loop/lib/acceptance-review-focus.sh" --emit-focus "$FOCUS" "$SPEC_PATH")"` and `bash "$HOME/.claude/skills/planning-loop/lib/acceptance-review-focus.sh" --emit-log "$SPEC_PATH" >> "$LOG_PATH"`, add one sentence to `codex-prompts.md` noting the injected diagnostics, author `strict-review-focus-sample.md`, append a review-focus sub-block to `run-fixtures.sh` asserting both subcommands carry the sub-strict line, run the harness — plain bash + editor, no LLM.

## Open Questions

| # | Question | Impact | Decision needed by |
|---|----------|--------|-------------------|
| 1 | Should the closed judgment lexicon (b) be sourced from a shared file so `criteria/` rubrics and this scanner stay in sync, rather than inlined in `acceptance-strictness.sh`? | Maintainability / drift between rubric language and gate | Before F-039 lands; can defer to a follow-up |
| 2 | Should the Codex reviewer criterion be gated behind a `.harness-profile` opt-in (like `triage_parking.enabled`) for projects that deliberately allow prose criteria? | Portability to non-strict downstream projects | Before wide `setup-harness` distribution |
