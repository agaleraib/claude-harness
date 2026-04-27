# Cross-Check-Plan — Programmatic plan.md ↔ specs consistency checker

## Overview

`/cross-check-plan` is a deterministic, LLM-free skill that parses `docs/plan.md`, follows every spec link in every Wave block, and reports structural divergences between the plan index and the specs it points at.

It is **not** a code-reviewer or adversarial reviewer. It is a parser doing the same kind of mechanical consistency check that `/close-wave`'s Step 11 final gate runs against the merged tree — but pulled forward to **before** `/run-wave` dispatches the orchestrator, so plan.md/spec drift is caught when it's cheap to fix instead of after a wave is already in flight.

**Motivating case:** 2026-04-27 Wave 4 close caught a plan.md/spec path divergence at the exit-gate run (plan.md said `test-fixtures/run-all.sh`, spec said `lib/test-fixtures/run-fixtures.sh`). The orchestrator had already been dispatched against the wrong-path expectations. Cross-check would have surfaced the mismatch pre-dispatch.

**Audience:** solo user (Albert), claude-harness + downstream consumer repos that follow the navigator-style `docs/plan.md` + `docs/specs/` convention.

**Lifecycle:** standalone skill in MVP. Could later be wired as `/run-wave` Step 0 pre-flight or `/close-wave` Step 0 pre-flight to fail-fast on inconsistent state.

## Implementation

**Recommended flow:** `/micro` per task with `/commit` between
**Reason:** Single-file skill build, ~4 sequential mechanical tasks, no parallelism, medium stakes — waves earn nothing here.
**Alternatives:** Single `/micro` covering all 4 tasks if Albert prefers one work-block; `/commit` once at the end. Trade-off is reviewability of each step.
**Implementation block written:** 2026-04-27

## Prior Work

Builds on:
- `/run-wave` skill (Rule 11 — accepted Task marker styles: heading-style `### Task 1` and inline-bold `**Task 1:**`)
- `/close-wave` skill (Step 11 final-gate exit-gate command execution against the merged tree)
- `reference_bash_compat_patterns.md` (bash 3.2 portability)
- `reference_auto_park_pattern.md` (state-journal location convention `.harness-state/<skill>/`)

Assumes:
- plan.md follows the harness Wave block convention: `### Wave N` heading (H3, matching the existing claude-harness/`docs/plan.md` and `/close-wave`'s parsing), sub-bullets with spec links and Task IDs, an "exit gate" or "verify" block with shell commands. (The H3 level is set by harness convention; `/run-wave` and `/close-wave` both parse `^### Wave N`.)
- Specs follow the spec-planner output: Task IDs appear under either `### Task N` headings or `**Task N:**` inline-bold (per /run-wave Rule 11), and each task has a `**Files:**` field listing affected paths.
- Specs live under `docs/specs/`. Spec links from plan.md may use either `./specs/foo.md` (relative) or `docs/specs/foo.md` (repo-rel).

Changes: nothing — this is a new read-only checker, not a modification of existing skills.

## Data Model

No persistent state. Skill is read-only against the repo and writes a single dated report to `.harness-state/cross-check/`.

**Inputs:**
- `docs/plan.md` (or `$1` override) — parsed for Wave blocks, spec links, Task IDs, exit-gate verify lines.
- Every `docs/specs/*.md` referenced by a spec link in plan.md — parsed for Task IDs (both marker styles) and per-task `**Files:**` lists.

**Outputs:**
- `.harness-state/cross-check/<YYYY-MM-DD>-cross-check-report.md` — markdown report.
- Stdout: human-readable summary.
- Exit code: 0 (no ERRORs) or 1 (≥1 ERROR, OR `--strict` and ≥1 WARN).

**Per-Wave intermediate state (load-bearing for F-004 scoping):**

The parser MUST iterate Wave blocks one at a time and, for each Wave N, build the following per-wave structures (NOT a single global flat structure):

- `wave_specs[N]` — the set of resolved spec paths referenced by spec links inside Wave N's block.
- `wave_documented_files[N]` — the union of `**Files:**` entries across every Task in every spec in `wave_specs[N]`. This is the ONLY set used to decide `documented(P)` for paths extracted from Wave N's exit-gate verify lines.
- Path tokens are extracted from each Wave N's exit-gate verify lines on demand during F-004 evaluation per the tokenizer contract below; no separate cached set is required.

A path that is documented only in some other Wave M's specs (M ≠ N) is NOT considered documented for Wave N. This prevents a wrong-path verify command in Wave A from being silently satisfied by an unrelated spec in Wave B.

**Files-list grammar (load-bearing for `wave_documented_files[N]` parsing):**

The `**Files:**` field of each Task in a referenced spec is the SOLE input to `wave_documented_files[N]`. The parser MUST handle every shape currently shipping in claude-harness specs, deterministically. Defined grammar:

A Task body is the text from a Task marker (heading-style `### Task N` / `### Task N — ...` OR inline-bold `**Task N:**` / `**Task N —**`) to the next Task marker, the next H2 (`## ...`), the next H3 (`### ...`) at the same level, or end of file — whichever comes first.

Within a Task body, the `**Files:**` field begins at a literal `**Files:**` marker and ends at:
- The next `**<Field>:**` marker (e.g. `**Depends on:**`, `**Verify:**`, `**Effort:**`), OR
- The next Task marker (per above), OR
- A blank line followed by a non-indented, non-bullet line, OR
- End of Task body.

Within the Files field, ALL of the following shapes MUST parse equivalently:

1. **Inline comma-separated:** `**Files:** \`path/a\`, \`path/b\`, path/c`
2. **Bulleted multiline:** `**Files:** All under \`skills/foo/\`:` followed by `- \`path/a\``, `- \`path/b\` (Fixture A)`, etc. Bullets begin with `-` or `*` after optional whitespace.
3. **Mixed:** inline list followed by bulleted continuation.

Path extraction within the Files field:
- Strip backticks (`` ` ``) — paths inside backticks are equivalent to bare paths.
- Strip parenthetical comments — anything from `(` to the matching `)` on the same line is dropped (so `\`path/a\` (Fixture A)` yields `path/a`).
- Split unquoted prose into tokens; keep only tokens that contain `/` OR end in a recognized extension (`.md`, `.ts`, `.js`, `.sh`, `.py`, `.json`, `.yaml`, `.yml`, `.toml`).
- Skip prose lines that don't contain a path candidate (e.g. "All under `skills/foo/`:" produces only `skills/foo` as a directory candidate after normalization strips the trailing `/`).

Path normalization (applied after extraction):
- Strip leading `./` (so `./docs/plan.md` and `docs/plan.md` are equivalent).
- Strip trailing `/` from directory entries (so `skills/foo/` becomes `skills/foo`).
- No case folding; paths are case-sensitive.
- Deduplicate via set semantics (a path appearing in N Tasks contributes one entry to `wave_documented_files[N]`).

Directory entries: a path ending in `/` (or after normalization, recognized as a directory by appearing in a Files list as a parent of subsequent bulleted children) covers any path under that directory tree for `documented_for_wave(P, N)`. Example: spec Files lists `skills/cross-check-plan/` → exit-gate `bash skills/cross-check-plan/run-fixtures.sh` is documented (path is under the directory).

Fixtures (added to Task 3 verify):
- Inline comma-separated: `**Files:** \`a\`, \`b\`, c` → `{a, b, c}`.
- Bulleted with parenthetical comments (mirrors `2026-04-27-planning-loop-auto-apply-arbiter.md` Task 5 shape): `**Files:** All under \`skills/x/\`:` + `- \`x/y.md\` (note A)` → `{skills/x, x/y.md}`.
- Mixed: inline `**Files:** \`a\`` + bullet `- \`b\`` → `{a, b}`.
- Field termination: `**Files:** \`a\`` + `**Depends on:** Nothing` → `{a}` (does not bleed into Depends).
- Backtick-stripping: `**Files:** \`path/with-dashes.md\`` → `{path/with-dashes.md}`.
- Directory coverage: spec Files contains `skills/foo/`; verify cites `skills/foo/run.sh` → documented (path is under documented dir).

**Tokenizer contract (load-bearing for F-004 path extraction):**

For each shell-command line under a Wave's "exit gate" / "verify" sub-section, extract path-candidate tokens using the following deterministic rules. The tokenizer is independent of any spec's Files list — it does not need to "recognize" a path to extract it.

A token T from a verify line is extracted as a path candidate iff ALL of the following hold:

1. T contains at least one `/` character (rules out single-segment commands like `bash`, `grep`, flags like `-c`, and bare env-var refs like `HOME`).
2. T does NOT start with `-` (rules out flags like `-c`, `--strict`, `-name`).
3. T does NOT start with `$` (rules out env-var references like `$HOME/foo`, `$PWD/bar` — these are dynamic and out of scope for static checking).
4. T is unquoted in the shell-command line, OR T is a quoted argument that appears anywhere within the argument list of a recognized command-position keyword (allowing zero or more option flags between the keyword and T). Recognized command-position keywords: `grep`, `bash`, `sh`, `test`, `cat`, `python`, `python3`, `node`, `awk`, `sed`, `head`, `tail`, `wc`, `diff`, `ls`, `stat`, `source`, `.` (dot-source). "Argument list" terminates at the next pipe (`|`), redirect (`>`, `<`, `>>`), command separator (`;`, `&&`, `||`, `&`), or end of line. Option flags are tokens beginning with `-` (and their immediate values). Examples: in `grep -r 'src/foo.ts' .`, the quoted `'src/foo.ts'` is extracted because it sits in `grep`'s argument list after `-r`. In `bash scripts/run.sh foo`, `scripts/run.sh` is extracted; `foo` is rejected by Rule 1 (no `/`). In `python3 -m mymod path/to/data.csv`, `path/to/data.csv` is extracted. In `cat $HOME/foo.txt`, `$HOME/foo.txt` is rejected by Rule 3.

Note: extension is NOT required. `scripts/run`, `bin/tool`, `path/to/Makefile`, and other extensionless repo-relative paths are extracted. The previous "ends in known extension OR matches a Files entry" heuristic is REMOVED — it caused silent skips for extensionless invalid paths.

Tokens that pass extraction are then classified per F-004's decision rule against `wave_documented_files[N]` (per-Wave scope, not global).

## Requirements

### Phase 1: MVP (single phase — single wave)

#### F-001: Parse plan.md and locate Wave blocks

**Acceptance criteria (hard thresholds — all must pass):**
- [ ] Reading the script's docs/plan.md produces a list of Wave block ranges (start line, end line, wave label) covering every `### Wave N` heading and its content up to the next `### ` heading at the same level, the next `## ` heading, or EOF.
- [ ] If `docs/plan.md` does not exist (or `$1` override path does not exist), script exits with code 1 and a clear `ERROR: plan.md not found at <path>` message on stderr.
- [ ] Empty plan.md (zero Wave blocks) is treated as a clean run: exit 0, report records "no waves found" as INFO, no ERRORs.

#### F-002: Resolve spec links inside each Wave block

**Acceptance criteria:**
- [ ] For each Wave block, every markdown link of form `[…](./specs/foo.md)` or `[…](docs/specs/foo.md)` is extracted and resolved to an absolute repo path.
- [ ] Both relative (`./specs/...md`) and repo-rel (`docs/specs/...md`) link forms resolve to the same on-disk file.
- [ ] If a resolved spec path does not exist on disk, the finding is logged as ERROR with detail `spec link → <link>; resolved → <abs path>; status → not found`.
- [ ] Hyperlinks pointing outside `docs/specs/` (e.g. external URLs, README links) are ignored — they are not in scope for this checker.

#### F-003: Verify cherry-picked Task IDs appear in linked specs

**Acceptance criteria:**
- [ ] For each Wave bullet, every Task ID reference (e.g. `Task 1`, `Task B1`) is extracted by regex. Task IDs match the patterns documented by /run-wave Rule 11: `Task <N>` and `Task <prefix><N>` shapes.
- [ ] For each Task ID, the linked spec is searched for BOTH heading-style (`### Task 1`, `### Task B1`) AND inline-bold (`**Task 1:**`, `**Task B1:**`) markers per /run-wave Rule 11. (Marker styles outside Rule 11's documented set — e.g. `Phase 1 T2` — are out of scope for MVP; if a spec uses them, /run-wave Rule 11 must be widened first.)
- [ ] If neither marker style matches, the finding is logged as ERROR with detail showing both regex patterns that were tried, so the user sees what was searched.
- [ ] If at least one marker style matches, the Task ID is recorded as resolved (no finding emitted).

#### F-004: Verify exit-gate paths are documented in specs (documentation-consistency check, per-Wave scoped)

**Contract:** cross-check is a documentation-consistency check. It verifies that plan.md and the specs it references agree about which paths exist in the project. It does **NOT** verify build outputs and does **NOT** require exit-gate paths to exist on disk before a wave runs. A wave whose verify command references a file that the wave itself will create must still be able to pass cross-check pre-dispatch — as long as the path is documented in a `**Files:**` list of a Task in a spec referenced from the **same** Wave block.

**Per-Wave scoping (closes Codex F1 cross-wave false-negative):** `documented(P)` is decided **inside the Wave whose exit-gate cites P**. A path documented only in some other Wave's specs is treated as undocumented for the current Wave. This prevents Wave A from silently passing because Wave B's spec happens to mention the same path.

Formally, for an exit-gate path token P extracted from Wave N's verify lines:

`documented_for_wave(P, N)` = "P appears in the `**Files:**` list of at least one Task in at least one spec ∈ `wave_specs[N]`" (using the per-wave intermediate state defined in the Data Model).

**Path extraction:** path tokens are extracted via the deterministic tokenizer contract defined in the Data Model section (independent of Files lists; extension NOT required). All extracted tokens are checked.

**Decision rule (per extracted exit-gate path token P, evaluated within Wave N):**

| `documented_for_wave(P, N)`? | Exists on disk? | Finding |
|--------------------------------|-----------------|---------|
| Yes | Yes | none (consistency-PASS) |
| Yes | No | none (consistency-PASS — wave will create it) |
| No | Yes | WARN `path-undocumented` (real but no spec linked from this Wave documents it) |
| No | No | ERROR `path-undocumented-and-missing` |

This catches the original 2026-04-27 Wave 4 divergence (`test-fixtures/run-all.sh` was neither in any spec's Files list nor on disk → ERROR), AND it lets pre-dispatch waves pass when plan.md + the Wave's own spec agree on paths the wave will create (Yes/No row → no finding), AND it catches cross-wave drift where Wave A cites a path documented only in Wave B's spec.

**Acceptance criteria:**
- [ ] For each Wave block N, every shell-command line under an "exit gate" / "verify" sub-section is scanned using the tokenizer contract (Data Model). Path tokens are extracted regardless of file extension; extensionless paths (e.g. `scripts/run`, `bin/tool`) are extracted and checked.
- [ ] Tokens that begin with `-` (flags) are NOT extracted. Verifiable via fixture: exit-gate line `bash run.sh -c foo` does not flag `-c`.
- [ ] Tokens that begin with `$` (env-var refs) are NOT extracted. Verifiable via fixture: exit-gate line `cat $HOME/foo` does not flag `$HOME/foo`.
- [ ] For each extracted path token P inside Wave N, `documented_for_wave(P, N)` is computed against `wave_documented_files[N]` ONLY — NOT against a global union over all Waves.
- [ ] If `documented_for_wave(P, N)` is true → no finding emitted, regardless of whether P exists on disk yet (pre-dispatch waves pass).
- [ ] If `documented_for_wave(P, N)` is false AND P exists on disk → WARN with detail `path real but undocumented in any spec referenced from Wave N`.
- [ ] If `documented_for_wave(P, N)` is false AND P does NOT exist on disk → ERROR with detail `path not documented in any spec referenced from Wave N and not found on disk`.
- [ ] **Cross-wave isolation fixture (Codex F1 regression):** plan.md has Wave A whose exit-gate cites path X, and Wave B whose linked spec documents X in a Task's Files list. X is referenced from NO spec linked to Wave A. Expected: Wave A's check emits ERROR (if X is missing on disk) or WARN (if X exists on disk) — NOT pass. Wave B's check passes for X.
- [ ] **Extensionless missing-path fixture (Codex F2 regression):** Wave N exit-gate cites `scripts/build` which has no extension, does not exist on disk, and is not in any spec's Files list. Expected: ERROR `path-undocumented-and-missing`.
- [ ] **Extensionless real-but-undocumented fixture (Codex F2 regression):** Wave N exit-gate cites `bin/tool` (the file exists on disk, e.g. as a real binary in the repo) but `bin/tool` is not in `wave_documented_files[N]`. Expected: WARN `path-undocumented`.
- [ ] The skill's report header includes a one-line reminder: "Cross-check is a documentation-consistency check; it does NOT verify build outputs. Path coverage is scoped per-Wave."

#### F-005: Flag orphan tasks (informational, per-spec scoped)

**Contract:** Task IDs are scoped per-spec — generic IDs like `Task 1` and `Task 2` are routinely reused across specs. Orphan detection MUST NOT use a single global "cited Task IDs" set, because a `Task 1` cited in spec A would falsely appear to "cover" an uncited `Task 1` in spec B and hide a real orphan. Instead, orphan status is decided **within each referenced spec**, comparing that spec's tasks only against the Wave entries that point to **that same spec**.

**Data model:** `cited_tasks_by_spec` is a map keyed by resolved spec path → set of Task IDs cited in Wave bullets that link to that spec. (No global cited-ID set anywhere in the orphan check.)

**Decision rule (per referenced spec S):**
- Let `tasks_in_S` = set of Task IDs found in S (both heading-style and inline-bold markers).
- Let `cited_in_S` = `cited_tasks_by_spec[S]` (Task IDs cited in Wave bullets whose spec link resolves to S).
- Orphans for S = `tasks_in_S - cited_in_S`.

**Acceptance criteria:**
- [ ] The skill maintains a `cited_tasks_by_spec` association keyed by **resolved spec path** (not by spec link string — both `./specs/foo.md` and `docs/specs/foo.md` for the same file collapse to one key).
- [ ] For each spec S referenced from any Wave block, the orphan set is computed as `tasks_in_S - cited_tasks_by_spec[S]` and members are logged as INFO with detail `orphan task <ID> in <spec> — drafted in spec but no Wave entry references it`.
- [ ] Repeated Task IDs across specs (e.g. spec A and spec B both contain `Task 1`) do NOT mask each other: a `Task 1` cited in a Wave bullet that links to spec A does not satisfy spec B's `Task 1`. Verifiable via fixture: two specs each with `Task 1`, plan.md cites only spec A's `Task 1` → orphan INFO emitted for spec B's `Task 1`.
- [ ] INFO findings never affect exit code (including under `--strict` — orphan INFOs stay INFO).

#### F-006: Report shape and exit code

**Acceptance criteria:**
- [ ] Report file is written to `.harness-state/cross-check/<YYYY-MM-DD>-cross-check-report.md`.
- [ ] Report opens with a summary header showing ERROR / WARN / INFO counts (e.g. `**Findings:** 2 ERROR · 1 WARN · 3 INFO`).
- [ ] Each Wave block produces a report section `### Wave N` containing a markdown table with columns `Check | Status | Detail`.
- [ ] Stdout summary echoes the same counts and points at the report file path.
- [ ] Exit code is 0 if zero ERRORs; 1 if ≥1 ERROR.
- [ ] When `--strict` flag is passed, WARNs are upgraded to ERRORs for purposes of exit code (but their `Status` column stays `WARN` in the report so the distinction is preserved).

#### F-007: Invocation surface

**Acceptance criteria:**
- [ ] `/cross-check-plan` (no args) runs against `docs/plan.md` from repo root.
- [ ] `/cross-check-plan <path>` runs against an alternate plan.md path (for repos that customize the path).
- [ ] `/cross-check-plan --strict` upgrades WARN → ERROR for exit-code purposes.
- [ ] `/cross-check-plan --help` prints usage and exits 0 without performing any check or writing any report (no side effects). This is the same `--help` self-protection pattern as /triage-parking.
- [ ] Combining `<path>` and `--strict` works in either order.

## Implementation Plan (Sprint Contracts)

Each task is a contract: build it, verify it, move on. All tasks are sequential — no parallelism.

### Phase 1 — Single wave

- [ ] **Task 1:** Skill skeleton — directory, SKILL.md frontmatter + description, `--help` branch with no side effects, plan.md existence check, exit code wiring.
  - **Files:** `skills/cross-check-plan/SKILL.md`, `skills/cross-check-plan/run.sh`
  - **Depends on:** Nothing
  - **Verify:** `bash skills/cross-check-plan/run.sh --help` prints usage and exits 0; calling the script with a nonexistent plan.md path (test fixture path under a system temp dir) exits 1 with `ERROR: plan.md not found` on stderr — verify locally with whichever temp path you prefer; running with no args against this repo's `docs/plan.md` exits 0 or 1 (does not crash). Note: this verify uses prose, not a hardcoded path, to keep the spec portable across machines.

- [ ] **Task 2:** Wave-block parser + spec-link resolver + per-Wave intermediate state — extract Wave ranges, extract spec links, resolve both link forms, emit ERRORs for missing spec files. Build the per-Wave structures defined in the Data Model: `wave_specs[N]` and `wave_documented_files[N]` (union of Files entries from Tasks in those specs). Per-Wave scoping is load-bearing for F-004; downstream tasks MUST NOT collapse these into a global flat set. Path-token extraction from exit-gate verify lines happens on demand in Task 3 per the tokenizer contract; no separate cached `wave_exit_gate_paths[N]` set is needed.
  - **Files:** `skills/cross-check-plan/run.sh`
  - **Depends on:** Task 1
  - **Verify:** Construct a minimal fixture plan.md with one Wave bullet pointing at a non-existent spec; run script; assert exit code 1 AND report file contains an ERROR row mentioning the missing spec path. Do the same with one Wave bullet pointing at an existing spec; assert no missing-spec ERROR is emitted. Additionally, construct a 2-Wave fixture where Wave A's spec lists path `a/x.sh` and Wave B's spec lists path `b/y.sh`; dump (or trace) the per-Wave intermediate state and assert `wave_documented_files[A] = {a/x.sh}` and `wave_documented_files[B] = {b/y.sh}` — NOT a merged union.

- [ ] **Task 3:** Task-ID verifier + exit-gate path tokenizer + per-Wave path checker — for each Wave bullet, search linked specs for Task ID markers (both styles). Implement the tokenizer contract from the Data Model section (rules 1–4: contains `/`, not `-`-prefixed, not `$`-prefixed, unquoted-or-after-command-keyword) and apply it to exit-gate verify lines. Classify each extracted token per F-004's per-Wave decision rule, using `wave_documented_files[N]` ONLY (never a cross-Wave union).
  - **Files:** `skills/cross-check-plan/run.sh`
  - **Depends on:** Task 2
  - **Verify:** Construct fixtures: (a) plan.md cites `Task 99` but the spec only has `Task 1` → ERROR emitted with both marker patterns shown in detail; (b) Wave N exit-gate references a path NOT in `wave_documented_files[N]` AND missing on disk → ERROR `path-undocumented-and-missing`; (c) Wave N exit-gate references a path real on disk but NOT in `wave_documented_files[N]` → WARN `path-undocumented`; (d) Wave N exit-gate references a path that IS in `wave_documented_files[N]` AND exists on disk → no finding; (e) **pre-dispatch lifecycle case:** path IS in `wave_documented_files[N]` but does NOT yet exist on disk → no finding (consistency-PASS, the wave will create it); (f) **Codex F1 cross-wave isolation:** Wave A exit-gate cites path X; X is in Wave B's spec Files list but NOT in any Wave-A-linked spec; X is missing on disk → ERROR for Wave A (NOT pass), Wave B passes; (g) **Codex F2 extensionless missing:** Wave N exit-gate cites `scripts/build` (no extension, missing, undocumented) → ERROR `path-undocumented-and-missing`; (h) **Codex F2 extensionless real-but-undocumented:** Wave N exit-gate cites `bin/tool` (file exists on disk, not in any spec Files) → WARN `path-undocumented`; (i) **tokenizer negative cases:** exit-gate line `bash run.sh -c foo` does not extract `-c`; exit-gate line `cat $HOME/foo` does not extract `$HOME/foo`; exit-gate line `grep -r 'src/foo.ts' .` extracts `src/foo.ts` (after a recognized command keyword `grep`).

- [ ] **Task 4:** Orphan-task scan (per-spec scoped) + report writer + `--strict` flag + summary stdout. Produces final markdown report at `.harness-state/cross-check/<DATE>-cross-check-report.md` with summary header, per-Wave sections, and the F-006 exit-code wiring.
  - **Files:** `skills/cross-check-plan/run.sh`
  - **Depends on:** Task 3
  - **Verify:** Run against this repo's real `docs/plan.md`; report file is written under `.harness-state/cross-check/` with today's date; report opens with `**Findings:** N ERROR · M WARN · K INFO` header AND the documentation-consistency reminder line; each Wave gets its own `### Wave N` section with a 3-column table; stdout echoes counts and report path; with `--strict`, a fixture that produces exactly 1 WARN and 0 ERRORs exits 1 instead of 0; **per-spec orphan fixture:** two specs each containing `Task 1`, plan.md cites only spec A's `Task 1` → INFO orphan emitted for spec B's `Task 1` (proves cited-tasks-by-spec scoping is correct, not a global ID set).

## Constraints

- **Bash 3.2 portability:** No bash 4-only constructs (associative arrays, `mapfile`, `${var,,}`). Per `reference_bash_compat_patterns.md`. Use `awk` / `sed` for parsing where bash arrays would otherwise be needed.
- **No `jq`:** plan.md and specs are markdown, not JSON. Use grep/awk/sed only.
- **Read-only against repo:** Only writes to `.harness-state/cross-check/`. No git mutations. No spec or plan.md edits.
- **No network, no LLM, no Codex dispatch.** Fully local and deterministic.
- **Idempotent:** running the skill twice in the same day overwrites the same dated report file; running across days produces one file per day.
- **Self-protection on `--help`:** Like /triage-parking, `--help` must not perform any side effect (Codex 2026-04-27 finding informs this).

## Out of Scope

- **Auto-fixing divergences.** Surface only — Albert decides what to fix.
- **LLM-style design review of the spec.** Use `/planning-loop --revise` for that.
- **Enforcing scope-of-changes between Wave commits and spec Files lists** (i.e. checking that the actual diff a wave produces stays within the documented Files set). Different problem, different skill if ever needed.
- **Wiring as a Step 0 pre-flight inside `/run-wave` or `/close-wave`.** MVP ships the standalone skill; integration is a follow-up decision.
- **Flagging spec-internal inconsistencies** (e.g. a spec's Task 3 referencing a path not in its own Files list). Cross-check is a plan↔spec consistency tool, not an intra-spec linter.
- **Cross-repo cross-checks.** One plan.md, one repo, per invocation.
- **Full shell parsing.** The tokenizer in F-004 / Data Model is intentionally simple (rules 1–4). Constructs like `xargs`, `find -exec`, `make` targets, multi-line heredocs, and command substitution are NOT parsed. Accepted false-negatives; revisit post-MVP per Open Question #3.
- **Validating paths in non-Wave contexts.** Path checks apply ONLY to exit-gate / verify shell-command lines inside Wave blocks. Paths mentioned in spec body prose, Wave bullet bodies outside the verify section, README files, etc. are not extracted or validated.
- **Per-Wave runtime modes / per-Wave invocation flags.** Per-Wave scoping is a data-model property, not a runtime mode. The skill always runs over the entire plan.md; there is no `--wave N` flag in MVP.

## Open Questions

| # | Question | Impact | Decision needed by |
|---|----------|--------|-------------------|
| 1 | Should `--strict` also upgrade INFO (orphan tasks) to ERROR? Current spec says no (INFO stays INFO under --strict per F-005), but reconfirm after first dogfood. | Determines whether orphan tasks ever block exit-1 | Phase 1 wrap |
| 2 | Should the skill auto-add itself as a Step 0 hook into `/run-wave` and `/close-wave` once MVP is validated? | Affects whether the skill is invoked manually or invisibly | Post-MVP |
| 3 | Tokenizer contract is fixed for MVP (rules 1–4 in Data Model) and explicitly excludes full shell parsing (out of scope). Open question is whether first-dogfood data justifies expanding the command-keyword whitelist (e.g. adding `xargs`, `find -exec`, `make`) — or accepting the false-negatives those introduce. | Determines whether the tokenizer needs a v2 — does NOT block MVP. | Post-MVP, after first dogfood run |
| 4 | Should the report include a `[ ] Acknowledge` checkbox per ERROR/WARN row so Albert can iterate fixes against a single report file? | UX polish, not load-bearing for MVP | Post-MVP |
