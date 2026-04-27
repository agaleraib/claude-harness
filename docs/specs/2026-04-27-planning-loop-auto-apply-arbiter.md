# Planning-loop auto-apply unanimous arbiter rulings — carve-out for Rule #4 at the cap-reached path

## Overview

When `/planning-loop --revise` hits the 3-round cap and Step 6.5 dispatches arbiters, the skill currently always prints the 4-option "Decide: 1/2/3/4" menu — even when every arbiter ruling is unanimous AND every implied disposition is mechanical (drop the finding to Open Questions, or apply a one-shot recommended fix). On the 2026-04-27 run against `docs/specs/2026-04-26-triage-parking.md`, this produced the friction documented in `feedback_auto_merge_solo_routine_prs.md` and `feedback_harness_too_intrusive.md`: F1 was unanimously `wrong-premise`, F2 was a one-line `load-bearing` fix both reviewers agreed on — yet the skill still asked the user to pick between 4 options whose answer was already locked in.

This spec adds a narrow auto-apply path to Step 6 escalation: when ALL arbiter rulings are unanimous AND ALL implied dispositions are mechanical, the skill applies them to the spec file via temp-file + atomic rename, appends an audit entry to the planning-loop log, prints a receipt, and exits. The user still owns `/commit` — Rule #6 is unchanged. Editing is not shipping.

Audience: solo user (Albert) running `/planning-loop --revise` against existing specs in `claude-harness` and downstream consumer repos. Single-actor envelope; no concurrent writers to worry about.

### Trust boundary trade-off (deliberate carve-out)

Rule #9 says "arbiters are advisory, never authoritative". This spec carves out a single narrow case where unanimous mechanical arbiter advice is allowed to execute against `$SPEC_PATH` without an interactive confirmation prompt. This is a deliberate trade-off, on the same axis as `feedback_auto_merge_solo_routine_prs.md` (don't split locked-in decisions into a second confirmation), `feedback_lean_rituals_over_automation.md` (automation when cost-per-use is near-invisible), and `feedback_harness_too_intrusive.md` (don't ask when the answer is mechanical).

The asymmetry that justifies the carve-out:
- **False-apply cost:** recoverable. The change lives uncommitted in the working tree; `git diff $SPEC_PATH` shows it; user can `git checkout -- $SPEC_PATH` before `/commit`. Rule #6 (user owns `/commit`) is the trust-recovery backstop.
- **Always-ask cost:** permanent friction on a workflow the user runs frequently, on cases where the answer is provably locked in (unanimous + mechanical + JSON-edit-block validates).

The mitigations that make this trade-off safe (load-bearing — together they replace the role of an interactive prompt):
1. Conjunctive precondition (Rule #11): unanimous + drop-or-mechanical + no `defer`/`nice-to-have` + JSON-block validates.
2. Section-scoped edits (F2 mitigation): every load-bearing edit must declare and validate against a named H2 spec section.
3. Atomic temp-file + rename (F3 mitigation): no half-written spec on hard kill.
4. SHA-256 hash check before/after validation (F4 mitigation): external mutation aborts auto-apply.
5. All-or-nothing semantics: any failure restores the pre-apply state byte-identically.
6. Opt-out: `PLANNING_LOOP_NO_AUTO_APPLY=1` env var OR `planning_loop.auto_apply: false` in `.harness-profile` disables auto-apply entirely (always falls through to menu) for users who don't want this trade-off.

Interactive confirmation is intentionally NOT added: it would defeat the user's stated ask ("is the decision go-ahead behavior implemented at the skill level so it doesn't ask in the future?") and re-introduce the friction the carve-out exists to remove.

## Implementation

**Recommended flow:** `/micro` per task with `/commit` between (Tasks 1-5 sequential, mostly-mechanical edits to one file plus fixtures)
**Reason:** 5 tasks total, all touching `skills/planning-loop/SKILL.md` (plus fixtures dir), no parallelism available (each task depends on the previous), `stakes: medium` per `.harness-profile`.
**Alternatives:** Single-`/micro` shot bundling Tasks 1-3 if user wants speed over reviewable per-task commits — acceptable given the scope is one file and ~80 lines of new prose/bash logic.
**Implementation block written:** 2026-04-27

## Prior Work

Builds on: [/planning-loop skill — first live run, 3 bugs](MEMORY: project_planning_loop_skill.md) and the existing `skills/planning-loop/SKILL.md` (629 lines as of master).

Assumes:
- Step 6.5 already dispatches arbiters and writes per-finding verdicts to `$LOG_PATH` under the `## Arbiter — <ts>` heading (sections `### code-reviewer verdicts (detail)` and `### Plan agent verdicts (scope)`).
- Rule #4 ("No auto-ship at cap") and Rule #9 ("Arbiters are advisory, never authoritative") exist in the skill's `## Rules (load-bearing)` block.
- `lib/restore.sh` runs at every exit and does not need changes.
- The repo follows the `feedback_arbiter_divergence_pattern.md` formatting convention (per-finding rulings presented independently).

Changes:
- Rule #4 gets a narrow carve-out: "auto-applying unanimously-decided arbiter rulings to spec text is permitted and is NOT shipping."
- Rule #9 gets a clarifying clause: when arbiter advice is unanimous AND mechanical, the skill may execute that advice on the spec file.
- New Rule #11 codifies the conjunctive precondition (unanimous + drop-or-mechanical-fix + no `defer`/`nice-to-have` + every load-bearing fix passes the JSON-edit-block contract below + spec-hash unchanged across validation→apply window).
- Step 6 escalation path branches: auto-apply if preconditions hold AND opt-out is not set, else print existing menu unchanged.
- New opt-out surface: `PLANNING_LOOP_NO_AUTO_APPLY=1` env var (precedence) OR `planning_loop.auto_apply: false` in `.harness-profile` (default `true`). When either is asserted, Step 6 skips the auto-apply branch entirely.

### Out-of-scope coupling note (arbiter prompt template)

This spec depends on the Step 6.5b arbiter prompt template (in the parent `skills/planning-loop/SKILL.md`) emitting load-bearing fixes in the JSON edit-block format defined under "Edit operation contract" below. Updating the arbiter prompt is **NOT** in this spec's scope as a behavioral change — Task 4 of this spec includes a single-line edit to the arbiter prompt to require the JSON block, but the broader prompt-engineering work (tuning, examples, fallback wording) lives in the parent skill's evolution. If the arbiter fails to emit the JSON block for any load-bearing finding, that finding fails Phase 1 validation and the whole auto-apply aborts to the menu (correct, conservative behavior).

## Data Model

No persistent state schema changes. The skill reads/writes existing files only.

### Reads
| Source | Format | Purpose |
|--------|--------|---------|
| `$LOG_PATH` (the round-3 + arbiter sections) | Markdown | Extract per-finding arbiter verdicts and JSON edit blocks |
| `$SPEC_PATH` | Markdown | Read current spec text to validate + apply edits |

### Writes
| Target | Format | Purpose |
|--------|--------|---------|
| `$SPEC_PATH` | Markdown (atomic replace via temp + `mv`) | Apply unanimous mechanical dispositions; commit point is the rename |
| `$SPEC_PATH.autoapply-tmp` | Markdown (transient temp file) | Holds the fully-edited spec text until atomic rename; never the live spec |
| `$LOG_PATH` | Markdown (append) | Audit-trail entry under new `## Auto-apply — <ts>` heading |
| `.gitignore` (one-time, by Task 1) | Text (append `*.autoapply-tmp` if absent) | Keep transient temp files out of git |

### Edit operation contract (load-bearing findings)

Auto-apply requires every `load-bearing` arbiter recommendation to include exactly one fenced JSON block in the verdict body, with one of these two shapes. Both shapes require a `section` field naming the H2 heading whose body the edit belongs to (load-bearing F2 mitigation: prevents an anchor match from drifting into the wrong section, prevents accidental insertion of headings, prevents edits spanning section boundaries).

**Shape A — replacement (default):**
```json
{
  "section": "<exact H2 heading text from $SPEC_PATH, e.g. 'Constraints' or 'Phase 1: Detection + auto-apply core'>",
  "old_string": "<verbatim text from $SPEC_PATH, exactly one occurrence>",
  "new_string": "<replacement text>"
}
```

**Shape B — insertion (additions only, no `old_string` available):**
```json
{
  "section": "<exact H2 heading text from $SPEC_PATH>",
  "insert_after": "<verbatim anchor text from $SPEC_PATH, exactly one occurrence>",
  "new_string": "<text to insert immediately after the anchor>"
}
```

Validation rules (all must hold for the edit to be eligible):
1. The fenced JSON block parses as valid JSON.
2. Exactly one of `{section, old_string, new_string}` or `{section, insert_after, new_string}` keypairs is present (not both, not neither).
3. `new_string` is non-empty.
4. `section` is non-empty AND matches an H2 heading (`^## <section>` literal match) that exists exactly once in current `$SPEC_PATH`. Multi-match or zero-match on the H2 heading aborts.
5. The named section's body range is computed as: lines from the matched `## <section>` line (exclusive) to the next `^## ` line (exclusive) or EOF.
6. For Shape A: `old_string` is non-empty AND appears exactly once as a literal substring in current `$SPEC_PATH` AND that one occurrence falls inside the section body range from rule 5. (Note: `grep -Fc` counts matching lines, not substring occurrences — see Phase 1a for the substring-count semantics.)
7. For Shape B: `insert_after` is non-empty AND appears exactly once as a literal substring in current `$SPEC_PATH` AND that one occurrence falls inside the section body range from rule 5. (Same substring-count semantics as rule 6.)
8. Neither `old_string` nor `new_string` (Shape A) and neither `insert_after` nor `new_string` (Shape B) may contain a line matching `^## ` (case-sensitive, anchored). This prevents an edit from inserting or destroying a section heading and prevents matches that span heading boundaries. Edits that need to add a heading are out of scope for auto-apply (fall through to menu).

Anything else — line-number-only references ("change line 42 to..."), prose-only "replace foo with bar" without a JSON block, missing `section` field, `section` value that doesn't match any H2 in the spec, match outside the named section body range, multi-match `old_string`, multi-match `insert_after`, edit text containing `## ` lines, or unparseable JSON — fails validation. A failed validation on ANY load-bearing finding aborts auto-apply (see all-or-nothing rule below); it does NOT fall through to the older "non-mechanical" detection path. Detection of non-mechanical recommendations (the `redesign`/`rethink`/etc. wordlist) still runs as a cheap pre-filter, but the JSON-block contract is the authoritative gate.

### Auto-apply audit entry shape (appended to `$LOG_PATH`)

```markdown
## Auto-apply — <YYYY-MM-DD HH:MM:SS>

Preconditions: unanimous=true, mechanical=true, no-defer-or-nice=true, all-edits-validated=true, spec-hash-stable=true, opt-out-not-set=true.
Spec SHA-256 (pre-apply): <hex>
Spec SHA-256 (post-apply): <hex>

### Applied
- **F1** [wrong-premise → Open Questions]
  - Title: <one-line title>
  - Arbiter rationale (verbatim): <one-sentence rationale>
  - Ruled by: code-reviewer + Plan
  - Spec section touched: `## Open Questions`
- **F2** [load-bearing → spec edit (Shape A)]
  - Title: <one-line title>
  - Spec section touched: `<section heading>`
  - Old text (verbatim): <snippet>
  - New text (verbatim): <snippet>
- **F3** [load-bearing → spec edit (Shape B insert-after)]
  - Title: <one-line title>
  - Spec section touched: `<section heading>`
  - Anchor (verbatim): <snippet>
  - Inserted text (verbatim): <snippet>
```

Note: there is no `### Skipped` section. Auto-apply is all-or-nothing — either every finding lands or none do, and on a "none" outcome the receipt is never printed (the menu prints instead and a separate `## Auto-apply aborted — <ts>` block is appended to `$LOG_PATH` with the abort reason).

### Auto-apply aborted entry shape (appended to `$LOG_PATH` on validation failure, hash-mismatch, or apply failure)

```markdown
## Auto-apply aborted — <YYYY-MM-DD HH:MM:SS>

Reason: <opt-out-set | validation-failure | hash-mismatch | apply-failure | log-append-failure | orphan-tmp-detected>
Failed finding: <F-id or "n/a">
Detail: <e.g. "F2 old_string matches 0 times in $SPEC_PATH" / "F3 insert_after matches 3 times" / "F2 section 'Constraints' not found in $SPEC_PATH" / "F2 old_string match falls outside section 'Constraints' body range" / "JSON block in F1 unparseable: <error>" / "$SPEC_PATH SHA-256 changed between validation and apply (external mutation detected): pre=<hex8> now=<hex8>" / "atomic rename failed: <errno>" / "PLANNING_LOOP_NO_AUTO_APPLY=1 set" / "orphan $SPEC_PATH.autoapply-tmp detected from prior run">

Falling through to 4-option menu.
```

## Requirements

### Phase 1: Detection + auto-apply core

#### Detection logic for "unanimous + mechanical"

Block runs only inside the Step 6 escalation path (i.e., only after Step 6.5 has appended arbiter verdicts).

**Acceptance criteria (hard thresholds — all must pass):**
- [ ] Opt-out check runs FIRST, before any other detection work: if `PLANNING_LOOP_NO_AUTO_APPLY=1` is set in the environment OR `.harness-profile` contains `planning_loop.auto_apply: false`, skill writes a `## Auto-apply aborted — <ts>` entry with reason `opt-out-set`, prints the existing 4-option menu unchanged, and exits via the menu path. Env var takes precedence over profile. Profile default is `auto_apply: true` when key is absent. (Honors the trust-boundary trade-off opt-out; see Overview.)
- [ ] Auto-apply path is entered if and only if ALL of the following are true:
  - Opt-out is not set (per check above).
  - Every round-3 finding has at least one arbiter verdict in `$LOG_PATH`.
  - For each finding, all arbiters that ruled on it agree on the same verdict (no `code-reviewer=load-bearing, Plan=wrong-premise` splits).
  - Every per-finding verdict is one of `wrong-premise` or `load-bearing`. Any `defer` or `nice-to-have` on any finding aborts auto-apply.
  - For every `load-bearing` verdict, the recommendation passes the Edit operation contract validation (Shape A or Shape B with `section` field, section H2 found and unique, single-match within section body range, non-empty fields, no `## ` lines in edit text).
- [ ] If ANY precondition fails, the existing 4-option menu prints unchanged (current behavior preserved verbatim) AND a `## Auto-apply aborted — <ts>` entry is appended to `$LOG_PATH` per the shape above.
- [ ] Detection logic lives in a clearly delimited section of `SKILL.md` titled `### 6e. Auto-apply preconditions` (or similar) so future readers can find it.

**Non-mechanical pre-filter for `load-bearing` recommendations (cheap reject before JSON parsing):**
- [ ] Recommendation does NOT contain any of the words: `redesign`, `rethink`, `reconsider`, `restructure`, `scope-change`, `envelope`, `architecture` (case-insensitive). If any present → finding fails detection (treated like a missing JSON block).
- [ ] Recommendation cites at most one spec section (count of `##`-prefixed headings referenced in the prose body is <= 1). If multi-section → fails detection.

The pre-filter is advisory; the JSON-block contract is authoritative. A recommendation that passes the pre-filter but lacks a valid JSON block still aborts auto-apply.

#### Phase 1a: Validation pass (dry-run, in-memory) + pre-validation hash

Before any mutation, the skill validates every finding's edit operation up front. No file writes happen in this phase.

**Acceptance criteria:**
- [ ] Skill computes `SPEC_HASH_PRE = sha256sum "$SPEC_PATH" | awk '{print $1}'` immediately at the start of Phase 1a, before any other read of `$SPEC_PATH`. The value is stored in memory for the Phase 1b re-check (F4 mitigation: external-mutation detection).
- [ ] If `$LOG_PATH` already exists (it should, since Step 6.5 wrote to it), skill computes `LOG_HASH_PRE = sha256sum "$LOG_PATH" | awk '{print $1}'` for the same purpose.
- [ ] **Round-3 finding ID extraction (asserts unanimity gate is computed over the COMPLETE finding set, not a parser-truncated subset; mitigates the "silent under-count = silent spec corruption" risk):**
  - Skill extracts the round-3 findings ID set by parsing the round-3 Codex output block in `$LOG_PATH`. Source: the fenced ```text block under the `## Round 3 — <ts>` heading. Match every line of shape `^- \[(low|medium|high)\] ` and capture the position-ordered IDs as `F1`, `F2`, … in document order. Result: `EXPECTED_FINDING_IDS = [F1, F2, F3, ...]` with cardinality `N`.
  - Skill extracts the arbiter verdict ID set by parsing the `## Arbiter — <ts>` section. For each `### <arbiter-name> verdicts` subsection, match `^\*\*F[0-9]+: (load-bearing|wrong-premise|nice-to-have|defer)\*\*` per-finding bullet rows and capture the IDs ruled on by that arbiter. Build a `VERDICTS_BY_ID` map: `{F1: {code-reviewer: load-bearing, Plan: load-bearing}, F2: {code-reviewer: wrong-premise}, ...}`.
  - Skill asserts `set(EXPECTED_FINDING_IDS) == set(keys(VERDICTS_BY_ID))`. If any expected ID is missing from arbiter verdicts (under-count) OR any verdict ID is not in the expected set (drift), abort with reason `verdict-id-mismatch` and detail naming the symmetric difference (e.g., `expected={F1,F2,F3}, ruled={F1,F3}; missing=F2`).
  - Skill asserts each expected finding has at least one arbiter verdict (length of `VERDICTS_BY_ID[Fi]` >= 1 for every i). If any finding has zero verdicts, abort with reason `verdict-missing` and the bare ID.
  - Routing-aware completeness: for each finding classified as `mixed` in the Step 6.5 routing line (parsed from `**Routing:** ...`), skill asserts BOTH arbiters ruled (both `code-reviewer` and `Plan` keys present in `VERDICTS_BY_ID[Fi]`). Detail-only or scope-only findings only require the routed arbiter. If a `mixed` finding has only one arbiter's verdict, abort with reason `mixed-routing-incomplete` and the bare ID. Prevents the failure mode where a parser drops one arbiter section and unanimity is computed from a single voice.
  - Parser is single-pass and fail-closed: any regex non-match, any unparseable section heading, any IO read error on `$LOG_PATH` aborts with reason `log-parse-failure` and the failing line number. Never silently elides.
- [ ] Skill parses the JSON edit block out of every `load-bearing` arbiter verdict body.
- [ ] Skill verifies each block matches Shape A or Shape B per the Edit operation contract (including the required `section` field).
- [ ] For each block, skill resolves the H2 section body range: `awk` (or equivalent) finds the line range from `^## <section>` (exclusive of heading) to the next `^## ` line (exclusive) or EOF. If the H2 doesn't exist or matches >1 times, validation fails for that finding.
- [ ] Skill confirms `<old_string>` (or `<insert_after>` for Shape B) appears exactly **once** as a substring in `$SPEC_PATH`. Note: a literal substring search is required, not a line-count — `grep -Fc` counts matching lines, which under-counts multiple matches on one line and fails entirely on multi-line `old_string`. Reference implementation in Python: `printf '%s' "$OLD_STRING" | python3 -c 'import sys; needle = sys.stdin.read(); print(open(sys.argv[1]).read().count(needle))' "$SPEC_PATH"` (note: `printf '%s'` avoids the trailing-newline that `<<<` would add; the value of `$OLD_STRING` must include any trailing whitespace exactly as in the JSON block). Equivalent awk/perl literal-substring counters are acceptable. If the count is 0 or >1, validation fails for that finding.
- [ ] Skill confirms the single match's line number falls within the resolved section body range. Match outside the named section aborts validation for that finding.
- [ ] Skill verifies neither `old_string` / `new_string` (Shape A) nor `insert_after` / `new_string` (Shape B) contains any line matching `^## ` (would break Markdown structure).
- [ ] Skill verifies `$SPEC_PATH` is writable (`test -w "$SPEC_PATH"`) AND its parent directory is writable (`test -w "$(dirname "$SPEC_PATH")"`, needed for the temp-file + atomic-rename pattern).
- [ ] Skill verifies `$LOG_PATH` is writable (`test -w "$LOG_PATH"`).
- [ ] Skill verifies the Open Questions append target is resolvable for every `wrong-premise` finding (heading regex below matches OR fall-through to "create new section at EOF" is available).
- [ ] If ANY check above fails, skill writes the `## Auto-apply aborted — <ts>` entry to `$LOG_PATH`, prints the existing 4-option menu unchanged, and exits via the menu path. Phase 2 does NOT run.
- [ ] Validation results (per-finding pass/fail with reason) are accumulated in memory; on failure the abort entry includes the FIRST failing finding's id and reason.

#### Phase 1b: Apply pass (atomic temp-file + rename, all-or-nothing)

Runs only after Phase 1a passes for every finding. The commit point is a single `mv` (atomic on POSIX when source and destination are on the same filesystem). The live `$SPEC_PATH` is never partially written: it is either the pre-apply file or the fully-edited file.

**Acceptance criteria:**
- [ ] Skill reads `$SPEC_PATH` once into memory (or copies to `$SPEC_PATH.autoapply-tmp` as the working buffer; either is acceptable as long as the live spec is not edited in place).
- [ ] **Hash re-check (F4 mitigation):** Skill recomputes `SPEC_HASH_NOW = sha256sum "$SPEC_PATH" | awk '{print $1}'` and compares to `SPEC_HASH_PRE` from Phase 1a. If they differ, skill aborts immediately: deletes `$SPEC_PATH.autoapply-tmp` if it exists, appends `## Auto-apply aborted — <ts>` with reason `hash-mismatch` and detail naming both 8-char hash prefixes, prints the 4-option menu, exits via the menu path. (External writer modified the spec between validation and apply.)
- [ ] If `$LOG_PATH` had a recorded `LOG_HASH_PRE`, same hash re-check is performed against `$LOG_PATH`; mismatch aborts the same way.
- [ ] Skill applies every edit IN MEMORY (or against `$SPEC_PATH.autoapply-tmp`) in declared order (F1 → F2 → ...). For Shape A: literal-string replace `old_string` → `new_string` within the named section's body range. For Shape B: literal insert of `new_string` immediately after the unique anchor match within the named section's body range. For `wrong-premise`: append the bullet to the resolved Open Questions section.
- [ ] Each edit re-validates uniqueness AND section-containment against the in-progress buffer (one prior edit could introduce a duplicate of a later edit's `old_string` or shift the section's body range; if uniqueness drops to 0 or grows to >1, or if the match leaves the section, the apply fails).
- [ ] If ANY edit fails mid-apply, skill deletes `$SPEC_PATH.autoapply-tmp` (live `$SPEC_PATH` was never touched), appends a `## Auto-apply aborted — <ts>` entry to `$LOG_PATH` with reason `apply-failure`, prints the 4-option menu, and exits via the menu path. The live spec is byte-identical to its pre-Phase-1a state.
- [ ] After all in-memory edits succeed, skill writes the fully-edited buffer to `$SPEC_PATH.autoapply-tmp` (if not already there), runs `sync` (best-effort fsync), then performs the atomic rename: `mv "$SPEC_PATH.autoapply-tmp" "$SPEC_PATH"`. This rename is the commit point.
- [ ] If the atomic rename itself fails (e.g., cross-device, permission), skill deletes `$SPEC_PATH.autoapply-tmp`, appends `## Auto-apply aborted — <ts>` with reason `apply-failure` and detail `atomic rename failed: <errno>`, prints the menu, exits via the menu path.
- [ ] After the rename succeeds, skill appends the `## Auto-apply — <ts>` audit entry to `$LOG_PATH`. The append is a single `>>` write; on POSIX, short appends to a regular file under `O_APPEND` are atomic. If $LOG_PATH file size is large, the append may not be atomic — the skill MUST use a single `printf '%s' "$ENTRY" >> "$LOG_PATH"` invocation to keep it as close to atomic as the OS allows.
- [ ] If the audit append fails (disk, permission, race): the spec is now mutated; skill cannot roll back atomically without re-introducing partial-write risk. Skill writes the abort entry to stderr inline, AND attempts a best-effort `## Auto-apply aborted — <ts>` append with reason `log-append-failure` (if even this fails, stderr is the only record). Skill prints a clear warning that the spec WAS modified but the audit trail is missing, points the user at `git diff $SPEC_PATH` for visibility, prints the 4-option menu (now contextually pointless but preserves the contract), and exits via the menu path. This is the one documented exception to "spec never mutated without audit entry"; the trade-off is that rolling back the spec post-rename would require reading the snapshot and doing a second non-atomic write, which is worse.
  - **v4 TODO (deferred per Open Question #6):** investigate audit-first/rename-second pattern (write a "pending" audit entry with planned `SPEC_HASH_POST` before rename, then mark complete after rename). Would close the post-rename-pre-audit window at the cost of a different inconsistency (audit claims success that didn't happen yet) and requires recovery logic to detect/reconcile pending entries on next run. Defer until post-rename-pre-audit failure is observed in practice.
- [ ] Temp file `$SPEC_PATH.autoapply-tmp` is deleted before exit on any failure path. On the success path, the atomic `mv` consumes it.
- [ ] Edits happen in working tree only; no `git add`, no `git commit`.

#### Phase 1c: Hard-kill recovery (orphan temp-file detection)

Runs at the very start of `/planning-loop` (alongside the existing orphan-stash detection).

**Acceptance criteria:**
- [ ] At skill startup (Step 1 pre-flight), skill checks for any `*.autoapply-tmp` file next to specs in `docs/specs/` (or wherever `$SPEC_PATH` would resolve for the active loop).
- [ ] If found, skill prints a warning identifying the orphan file (path, mtime), instructs the user to inspect via `diff <spec> <spec>.autoapply-tmp` and either delete the orphan (`rm <spec>.autoapply-tmp`) or replace the spec with it (`mv <spec>.autoapply-tmp <spec>`), then aborts the current `/planning-loop` invocation. Skill does NOT auto-clean and does NOT auto-restore — the user decides.
- [ ] Detection is conservative: only `*.autoapply-tmp` files in `docs/specs/` (or paths the user passes via `--revise <path>`'s parent dir) are considered. Stray `*.autoapply-tmp` files elsewhere in the tree are ignored.
- [ ] An `## Auto-apply aborted — <ts>` entry with reason `orphan-tmp-detected` is appended to the most recent `$LOG_PATH` (best-effort; if no log is identifiable, write to stderr).

#### Apply: `wrong-premise` → Open Questions append (resolution detail)

Used by Phase 1b for every `wrong-premise` finding. Resolution is deterministic and runs once during Phase 1a (to validate the target exists) and again during Phase 1b (to do the actual append).

**Acceptance criteria:**
- [ ] Skill appends a new bullet to the spec's Open Questions section. The bullet contains: short title of the finding, arbiter's one-sentence rationale (verbatim), and which arbiter(s) ruled it.
- [ ] If the spec contains `## Open Questions`, append there.
- [ ] Else if the spec contains `## Open questions parked for v2` (alternate heading used by some spec-planner-shipped specs), append there.
- [ ] Else create a new `## Open Questions` section at end of file and append the bullet.
- [ ] Heading match must be tolerant of minor case/whitespace variation; use a small regex (e.g. `^##[[:space:]]+[Oo]pen [Qq]uestions`).
- [ ] Heading regex matches multiple `## Open Questions` sections (rare, malformed spec) → append to the FIRST match; log a warning bullet under the audit entry's `### Applied` block for that finding.
- [ ] Edge case: spec already has a bullet with the same title → still append (no de-dupe in MVP); audit entry shows it.

#### Audit trail append (binding contract)

**Acceptance criteria:**
- [ ] Skill appends a `## Auto-apply — <ts>` block to `$LOG_PATH` matching the shape in Data Model above ONLY after every spec edit succeeded.
- [ ] Every applied finding appears under `### Applied` with verbatim arbiter source text.
- [ ] On any failure path (Phase 1a validation fail, Phase 1b apply fail, audit-append fail), a `## Auto-apply aborted — <ts>` block is appended instead (best-effort on the audit-append fail case).
- [ ] The two block types (`## Auto-apply` and `## Auto-apply aborted`) are mutually exclusive per loop run — exactly one or the other (or neither, if the abort-append itself failed and stderr was used).

### Phase 2: Output + rules + restore

#### Auto-apply output template

**Acceptance criteria:**
- [ ] On successful auto-apply, skill prints exactly:
  ```
  ✓ Planning loop hit cap (3 rounds) — arbiters unanimous; auto-applied option 4.

    Spec:         <SPEC_PATH>  (updated via atomic rename)
    Log:          <LOG_PATH>   (auto-apply summary appended)
    Findings handled:
      - F1 [wrong-premise → Open Questions]: <one-line title>
      - F2 [load-bearing → spec edit at <section>]: <one-line title>
      - F3 [load-bearing → spec edit at <section>]: <one-line title>

  Review the diff and `/commit` when ready. Spec is uncommitted; restore-helper has run.
  ```
- [ ] Skill exits 0 after printing.
- [ ] `lib/restore.sh` is invoked before exit (Rule #10 unchanged).
- [ ] On abort path (Phase 1a or 1b failure), the existing 4-option menu prints unchanged and the receipt above does NOT print.

#### Rules update

**Acceptance criteria:**
- [ ] Rule #4 modified to add the carve-out clause: "Auto-applying unanimously-decided arbiter rulings to the spec text is permitted and is NOT 'shipping'; the user still owns `/commit`. (Carve-out added 2026-04-27.)"
- [ ] Rule #9 modified to clarify: "When arbiter advice is unanimous AND every load-bearing fix passes the JSON edit-block contract (see `### 6e.`), the skill may execute that advice on the spec file; the user remains the sole authority over committing. (Clarification added 2026-04-27.)"
- [ ] New Rule #11 added with text: "Auto-apply preconditions are conjunctive — ALL of (a) opt-out not set, (b) unanimous, (c) drop-or-mechanical-fix, (d) no `defer`/`nice-to-have`, (e) every load-bearing fix validates against the JSON edit-block contract including `section`-scoped containment, (f) `$SPEC_PATH` SHA-256 unchanged between Phase 1a validation and Phase 1b apply, must hold. ANY exception falls through to the menu, all-or-nothing (no partial-apply, ever)."
- [ ] Opt-out documented in skill header / usage block: env var `PLANNING_LOOP_NO_AUTO_APPLY=1` and `.harness-profile` key `planning_loop.auto_apply: false` both disable auto-apply. Env var precedence > profile.

#### Error handling + restore

**Acceptance criteria:**
- [ ] Spec file disappears between Step 6.5 and Step 6 → skill prints error message ("spec at $SPEC_PATH no longer exists; falling through to menu"), runs restore, falls through to menu. No temp file to clean up (none was created).
- [ ] Auto-apply runs partially then crashes BEFORE the atomic rename (SIGKILL, terminal death, host crash) → live `$SPEC_PATH` is byte-identical to pre-apply state because edits happened in memory or in `$SPEC_PATH.autoapply-tmp`. The orphan temp file is detected by Phase 1c on next `/planning-loop` startup; user resolves manually.
- [ ] Auto-apply runs partially then crashes AFTER the atomic rename but BEFORE the audit append → spec is mutated, audit is missing. This is the one acceptable inconsistency window per Phase 1b's documented exception. `git diff $SPEC_PATH` is the user's visibility tool. Phase 1c does NOT report this case (no orphan temp file exists).
- [ ] `lib/restore.sh` is updated to clean up any `$SPEC_PATH.autoapply-tmp` next to the active spec (single line addition, in scope as part of Task 3) — handles the common case where the skill exits cleanly via menu after Phase 1b aborted.
- [ ] Temp file pattern `*.autoapply-tmp` is matched by `.gitignore` so it never accidentally gets staged. Task 1 adds the pattern if absent.

### Phase 3: Test fixtures (regression coverage)

Note: tests live as fixture markdown files under `skills/planning-loop/lib/test-fixtures/` (create the dir). The skill itself is bash-only; tests are runnable manually via a small driver script.

**Acceptance criteria:**
- [ ] Fixture A — `all-unanimous-mechanical.md`: synthetic round-3 + arbiter log where F1 = unanimous wrong-premise and F2 = unanimous load-bearing with a valid Shape A JSON block (`section` field set, `old_string` matches exactly once in synthetic-spec inside the named section). Running the auto-apply path produces the auto-apply receipt; no temp file remains; `## Auto-apply — <ts>` entry exists in log with both pre and post hashes.
- [ ] Fixture B — `one-disagreement.md`: synthetic log where code-reviewer = load-bearing and Plan = wrong-premise on F1. Running the auto-apply path prints the existing 4-option menu (regression); `## Auto-apply aborted` entry exists with reason `validation-failure`. Spec is byte-identical to pre-run state.
- [ ] Fixture C — `non-mechanical-load-bearing.md`: synthetic log where the load-bearing recommendation says "consider redesigning the rollback" (no JSON block, hits pre-filter wordlist). Running the auto-apply path prints the menu; abort entry exists. Spec is byte-identical to pre-run state.
- [ ] Fixture D — `mixed-defer.md`: synthetic log with one `defer` verdict among otherwise-unanimous mechanical rulings. Running the auto-apply path prints the menu; abort entry exists. Spec is byte-identical to pre-run state.
- [ ] Fixture E — `json-block-multimatch.md`: synthetic log where F1 has a valid JSON block but `old_string` matches `$SPEC_PATH` 2 times. Running the auto-apply path prints the menu; abort entry exists with reason citing the multi-match. Spec file is BYTE-IDENTICAL to its pre-run state (verify with `diff` or hash); no temp file remains.
- [ ] Fixture F — `json-block-zero-match.md`: synthetic log where F1's `old_string` matches `$SPEC_PATH` 0 times (e.g., stale recommendation). Running the auto-apply path prints the menu; abort entry exists; spec is byte-identical to pre-run state.
- [ ] Fixture G — `insert-after-shape.md`: synthetic log where F1 uses Shape B (`section` + `insert_after` + `new_string`) with a unique anchor in synthetic-spec inside the named section. Running the auto-apply path produces the receipt and the inserted text appears immediately after the anchor. No temp file remains.
- [ ] Fixture H — `simulated-log-append-fail.md`: same as Fixture A but driver script makes `$LOG_PATH` read-only (`chmod -w`) AFTER Phase 1a passes (and AFTER the `LOG_HASH_PRE` is recorded). Driver verifies the documented inconsistency-window behavior: either the skill aborts BEFORE the atomic rename (spec byte-identical, abort entry to stderr/log), or the skill completes the rename and emits the documented stderr warning about missing audit. Driver restores log writability before next fixture. Test passes if either outcome matches its documented contract.
- [ ] Fixture I (new) — `section-mismatch.md`: synthetic log where F1 has a valid JSON block but `section` value doesn't match any H2 in synthetic-spec. Running the auto-apply path prints the menu; abort entry exists with reason citing the missing section. Spec is byte-identical to pre-run state.
- [ ] Fixture J (new) — `match-outside-section.md`: synthetic log where F1's `section` field names section "Constraints" but the `old_string` happens to also appear once elsewhere in the spec (in section "Overview") AND zero times inside Constraints. Running the auto-apply path prints the menu; abort entry exists with reason citing match-outside-section. Spec is byte-identical to pre-run state.
- [ ] Fixture K (new) — `edit-text-contains-h2.md`: synthetic log where F1's `new_string` contains a line starting with `## Foo`. Running the auto-apply path prints the menu; abort entry exists with reason citing the H2 in edit text.
- [ ] Fixture L (new) — `external-mutation.md`: same setup as Fixture A, but driver script appends a single character to `$SPEC_PATH` AFTER Phase 1a's hash is recorded and BEFORE Phase 1b's hash re-check (simulated by a sleep+touch hook the driver injects). Running the auto-apply path prints the menu; abort entry exists with reason `hash-mismatch` and detail naming both 8-char hash prefixes. Spec retains the externally-injected character (skill did NOT clobber it).
- [ ] Fixture M (new) — `opt-out-env-var.md`: synthetic log identical to Fixture A but driver runs the skill with `PLANNING_LOOP_NO_AUTO_APPLY=1` set. Skill prints the menu; abort entry exists with reason `opt-out-set`. Spec is byte-identical to pre-run state.
- [ ] Fixture N (new) — `opt-out-profile.md`: synthetic log identical to Fixture A but driver places a `.harness-profile` with `planning_loop.auto_apply: false` in the test working directory. Skill prints the menu; abort entry exists with reason `opt-out-set`. Spec is byte-identical to pre-run state.
- [ ] Fixture O (new) — `orphan-tmp-startup.md`: driver script places a stale `<spec>.autoapply-tmp` file next to a synthetic spec, then invokes `/planning-loop --revise <spec>`. Skill aborts at Step 1 pre-flight with the orphan-detection warning; auto-apply Phase 1 never runs.

## Implementation Plan (Sprint Contracts)

Each task is a contract: build it, verify it, move on. All edits land in `skills/planning-loop/SKILL.md` unless noted.

### Phase 1
- [ ] **Task 1:** Add detection block (`### 6e. Auto-apply preconditions`) to SKILL.md and add `*.autoapply-tmp` to `.gitignore`
  - **Files:** `skills/planning-loop/SKILL.md`, `.gitignore`
  - **Depends on:** Nothing
  - **Verify:** New `### 6e.` section exists between Step 6.5 and Step 6's escalation path; section text encodes the Edit operation contract (Shape A + Shape B with required `section` field), the section-body-range computation, the H2-in-edit-text rejection rule, the non-mechanical pre-filter, the conjunctive precondition (including opt-out check and hash check), and the opt-out surface (env var + profile key with precedence); `grep -cF 'Auto-apply preconditions' skills/planning-loop/SKILL.md` returns 1; `grep -cF '*.autoapply-tmp' .gitignore` returns >= 1; `grep -cF 'PLANNING_LOOP_NO_AUTO_APPLY' skills/planning-loop/SKILL.md` returns >= 1.

- [ ] **Task 2:** Add auto-apply executor block (`### 6f. Auto-apply executor`) to SKILL.md — implements Phase 1a (validate + pre-hash) + Phase 1b (hash re-check → in-memory apply → temp-file write → atomic rename → audit append)
  - **Files:** `skills/planning-loop/SKILL.md`
  - **Depends on:** Task 1
  - **Verify:** New `### 6f.` section exists; covers Phase 1a in-memory validation (JSON parse, `section` resolution, single-match check inside section body, H2-in-edit-text rejection, writability checks, `SPEC_HASH_PRE` and `LOG_HASH_PRE` capture), Phase 1b hash re-check (abort with `hash-mismatch` on diff), in-memory or temp-file edit application, atomic rename (`mv "$SPEC_PATH.autoapply-tmp" "$SPEC_PATH"`) as the commit point, audit append after rename, the documented post-rename-pre-audit inconsistency-window exception (with the stderr warning), the wrong-premise → Open Questions append (with both heading variants), the load-bearing Shape A and Shape B execution paths within section body ranges, and the audit-trail append shape (matches Data Model section of this spec, including pre/post hash lines); section explicitly states "no partial-apply, no skipped findings, no in-place edits to live spec".

- [ ] **Task 3:** Branch Step 6 escalation path on auto-apply preconditions, add new output template, add Phase 1c orphan-temp-file detection at Step 1 pre-flight, and update `lib/restore.sh` to clean up stale temp files
  - **Files:** `skills/planning-loop/SKILL.md`, `skills/planning-loop/lib/restore.sh`
  - **Depends on:** Task 2
  - **Verify:** Step 6 escalation path now reads "if 6e returns true AND 6f succeeds, print the auto-apply receipt; on any abort, print the existing 4-option menu"; the existing menu text is preserved character-for-character; the new receipt template appears under "### Auto-apply receipt" inside Step 6 and matches the template in this spec's Phase 2 acceptance criteria; Step 1 pre-flight contains the new orphan-temp-file detection block (Phase 1c) which scans for `*.autoapply-tmp` next to specs in `docs/specs/` and aborts the loop with a manual-resolve message if found; `lib/restore.sh` contains a block that checks for `*.autoapply-tmp` next to the active spec and deletes it (does NOT auto-restore — the orphan handling at Step 1 pre-flight owns user-visible recovery).

### Phase 2
- [ ] **Task 4:** Update Rules #4, #9, add Rule #11; add JSON-edit-block requirement line to the Step 6.5b arbiter prompt template; document opt-out
  - **Files:** `skills/planning-loop/SKILL.md`
  - **Depends on:** Task 3
  - **Verify:** Rule #4 contains the carve-out clause with date `2026-04-27`; Rule #9 contains the clarifying clause with date `2026-04-27` and references the JSON edit-block contract; Rule #11 exists with the conjunctive-precondition text including all six clauses (opt-out, unanimous, mechanical, no defer/nice, JSON contract validates with section-scoping, hash unchanged) and "no partial-apply, ever"; `grep -c "^11\." skills/planning-loop/SKILL.md` (or matching numbered-rule format the file uses) returns >= 1; the Step 6.5b arbiter prompt template contains a single-line instruction "For each load-bearing finding, emit your recommendation as a fenced ```json block with `section` (the H2 heading body the edit belongs to) plus either `{old_string, new_string}` or `{insert_after, new_string}` per the contract in `### 6e.`"; the skill's usage/header block documents both opt-out surfaces (env var precedence, profile key default).

### Phase 3
- [ ] **Task 5:** Create test fixtures + driver script
  - **Files:** `skills/planning-loop/lib/test-fixtures/all-unanimous-mechanical.md`, `skills/planning-loop/lib/test-fixtures/one-disagreement.md`, `skills/planning-loop/lib/test-fixtures/non-mechanical-load-bearing.md`, `skills/planning-loop/lib/test-fixtures/mixed-defer.md`, `skills/planning-loop/lib/test-fixtures/json-block-multimatch.md`, `skills/planning-loop/lib/test-fixtures/json-block-zero-match.md`, `skills/planning-loop/lib/test-fixtures/insert-after-shape.md`, `skills/planning-loop/lib/test-fixtures/simulated-log-append-fail.md`, `skills/planning-loop/lib/test-fixtures/section-mismatch.md`, `skills/planning-loop/lib/test-fixtures/match-outside-section.md`, `skills/planning-loop/lib/test-fixtures/edit-text-contains-h2.md`, `skills/planning-loop/lib/test-fixtures/external-mutation.md`, `skills/planning-loop/lib/test-fixtures/opt-out-env-var.md`, `skills/planning-loop/lib/test-fixtures/opt-out-profile.md`, `skills/planning-loop/lib/test-fixtures/orphan-tmp-startup.md`, `skills/planning-loop/lib/test-fixtures/synthetic-spec.md`, `skills/planning-loop/lib/test-fixtures/run-fixtures.sh`
  - **Depends on:** Task 4
  - **Verify:** `bash skills/planning-loop/lib/test-fixtures/run-fixtures.sh` runs all 15 fixtures (A–O) against a fresh copy of `synthetic-spec.md` per fixture and prints PASS/FAIL per fixture; Fixtures A, G produce the auto-apply receipt and leave no temp file; Fixtures B, C, D, E, F, I, J, K, L, M, N produce menu output, leave no temp file, and (for E, F, I, J, K, M, N) leave the spec byte-identical to pre-run state; Fixture L leaves the spec with the externally-injected character preserved; Fixture H matches one of its two documented contract outcomes; Fixture O aborts at pre-flight without invoking auto-apply; script exits 0 only when all 15 pass.

## Constraints

- Single skill touched in production code: `skills/planning-loop/SKILL.md` (symlinked from `~/.claude/skills/planning-loop/SKILL.md`); plus the small additions to `lib/restore.sh` and `.gitignore`.
- Test fixtures live under `skills/planning-loop/lib/test-fixtures/` (new directory).
- No new dependencies. Bash + existing spec-planner/Agent dispatch + Codex companion only. JSON parsing uses `jq` (already a harness dependency); if absent, validation fails closed (treat as unparseable JSON → abort). SHA-256 uses `sha256sum` (GNU coreutils) or `shasum -a 256` (BSD/macOS); skill probes for whichever is available at startup.
- Rule #6 ("user owns `/commit`") is preserved verbatim — this spec must NOT auto-stage or auto-commit.
- All edits to the spec file happen in the working tree; the file ends modified-uncommitted on success, byte-identical to pre-run on any pre-rename abort, and modified-uncommitted-but-audit-missing only in the documented post-rename-pre-audit inconsistency window.
- Live `$SPEC_PATH` is NEVER edited in place. Edits live in memory or in `$SPEC_PATH.autoapply-tmp` until the atomic `mv` commit point.
- Atomic-rename guarantee assumes `$SPEC_PATH.autoapply-tmp` and `$SPEC_PATH` are on the same filesystem. Validation includes a writability check on the parent directory; cross-device-link errors at rename time abort with `apply-failure`.
- Log append assumes POSIX `O_APPEND`-style atomicity for short writes; `printf '%s' "$ENTRY" >> "$LOG_PATH"` is the load-bearing primitive. Documented as an assumption, not a guarantee for very large entries.
- No concurrency protection (no lock file). Single-actor envelope per Overview; documented limitation inherited from the parent skill. The SHA-256 hash check is the load-bearing mitigation for unintended-concurrent-writer scenarios (editors, formatters, file watchers, second terminal): differing hashes between Phase 1a and Phase 1b abort auto-apply.
- Detection regex must be conservative: false positives (auto-apply when shouldn't) are worse than false negatives (menu when could've auto-applied), because the menu still works.
- Opt-out surfaces (env var, profile key) honor the trust-boundary trade-off; users who don't accept the carve-out can disable auto-apply globally (env var) or per-project (profile key).

## Cross-references

- `feedback_auto_merge_solo_routine_prs.md` — same axis: locked-in verdict + mechanical execution = paperwork not decision.
- `feedback_lean_rituals_over_automation.md` — automation when cost-per-use is near-invisible; this fires only on cap-reached + unanimous + mechanical, so cost-per-use is genuinely tiny.
- `feedback_harness_too_intrusive.md` — don't ask when the answer is mechanical.
- `feedback_arbiter_divergence_pattern.md` — guides the per-finding-independence formatting that detection logic relies on.
- `feedback_external_side_effect_rollback.md` — same family as the snapshot-rollback discipline here: never assume a downstream succeeded without checking.
- `project_planning_loop_skill.md` — KB entry tracking the parent skill; should be updated post-merge with a "v3 (auto-apply) shipped" line.

## Out of Scope

- Auto-committing the spec or auto-running `/commit` after auto-apply.
- Auto-applying `nice-to-have` or `defer` verdicts (those still go to the menu in MVP).
- Multi-finding load-bearing fixes that touch >1 spec section per finding (defer until evidence justifies). Multiple findings each touching their own single section IS supported.
- Partial auto-apply / "best-effort" semantics. All-or-nothing is load-bearing per Rule #11.
- Lock files / concurrency protection. Single-actor envelope; SHA-256 hash check is the documented mitigation, not a true lock.
- Semantic-correctness verification of the proposed edit (e.g., a third agent that reads the diff and judges whether it makes sense). Section-heading scoping + JSON-block contract + hash check are the load-bearing mitigations; deeper semantic verification is out of scope.
- Changing arbiter routing logic in Step 6.5 (selection of which arbiter runs on which finding stays as-is).
- Deeper arbiter prompt-engineering work beyond the single-line JSON-block requirement added in Task 4 (tuning, examples, fallback wording lives in the parent skill's evolution).
- Changing rounds 1/2/3 review behavior — only Step 6 escalation path changes.
- FRESH mode auto-apply (cap-reached path in FRESH mode is unchanged; FRESH-mode arbiters carry different semantics and are out of scope here).
- De-duplication of repeat findings across rounds.
- Interactive confirmation before auto-apply (intentional — the whole point is no question when the answer is locked in; users who disagree with this trade-off use the opt-out).
- Auto-restore of orphan `.autoapply-tmp` files on startup (Phase 1c only DETECTS and reports; user resolves manually).

## Open Questions

| # | Question | Impact | Decision needed by |
|---|----------|--------|-------------------|
| 1 | Should auto-apply produce a single bundled diff in the receipt (e.g. unified diff snippet) so the user can eyeball changes without `git diff`? Nice-to-have polish; not in MVP because `git diff $SPEC_PATH` is already the expected verify step. | Affects receipt template only; could be added in v4 without breaking anything. | Before any v4 polish pass. |
| 2 | If the load-bearing recommendation contains BOTH a valid JSON block AND extra prose about "consider also X", do we apply the JSON block and ignore the prose, or treat the prose as an additional non-mechanical signal and abort? MVP applies the JSON block and ignores prose (the JSON contract is the authoritative ruling). | Affects how often auto-apply fires in practice. | After 3+ live cap-reached runs. |
| 3 | Phase 1c orphan-temp-file detection scope — only `docs/specs/*.autoapply-tmp` or also user-passed `--revise <path>` parent dir? MVP: both paths the active loop would resolve. | Edge case for orphans in non-standard spec locations. | Before v4. |
| 4 | Test driver script — bash-only or extract to a helper file under `lib/`? Bash-only chosen for MVP simplicity; could grow. | Affects discoverability of tests. | Before Phase 3 begins. |
| 5 | Does `jq` need to be added to a documented dependency list, or is it safe to assume it's present on every machine running the harness? MVP fails closed if absent (treats unparseable). | Minor docs gap. | Before merge. |
| 6 | The post-rename-pre-audit inconsistency window is currently the one documented exception to "spec never mutated without audit". An alternative would be to write the audit entry FIRST (predicting success), then do the atomic rename, then patch the audit entry on success. MVP keeps current order (rename → append) because audit-first creates a different inconsistency (audit claims success that didn't happen). | Affects which inconsistency window we accept. | After live evidence shows whether the post-rename-pre-audit window ever fires. |
| 7 | `.harness-profile` schema for `planning_loop.auto_apply` — owned by `/project-init` per the established convention; spec specifies the key but actual schema-add is `/project-init`'s job. Coordination needed before merge. | Schema source-of-truth ownership. | Before merge. |
| 8 | Concurrent-writer race window between Phase 1b hash-recheck and atomic `mv`. Codex (round 3) flagged the residual ms-scale TOCTOU window as a "no-lock" gap and recommended adding a lockfile/mkdir lock spanning validation through rename. **Both arbiters (`code-reviewer`, `Plan`) ruled wrong-premise:** locks are explicitly out-of-scope per the parent skill's documented single-actor limitation (see `skills/planning-loop/SKILL.md` Step 1 "REVISE-mode pre-flight: leftover detection + auto-park" + project memory `project_planning_loop_skill.md` "Auto-park failure modes acknowledged" listing concurrent /planning-loop runs in two terminals as documented unhandled); the SHA-256 recheck is the documented single-actor mitigation; Codex's threat model inflated the editor/formatter/file-watcher list (which the SHA-256 catches best-effort) into a multi-writer scenario that the spec's single-actor envelope explicitly excludes. The recommendation "without a lock, keep the existing interactive menu path" is a wholesale walk-back of the user's stated ask ("don't make me confirm decisions that are already locked in"). If multi-actor support ever lands in the parent skill, revisit lock scope; until then, `git diff $SPEC_PATH` + Rule #6 (`/commit` ownership) are the trust-recovery backstop. | Affects whether the no-confirmation feature ships at all. | Only revisit if the parent skill removes the single-actor limitation. |
