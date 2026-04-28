---
name: planning-loop
description: Drive a spec through Codex's adversarial-review loop to an `approve` verdict in ≤3 rounds. Two modes — FRESH (spec-planner drafts from a prose blob) and REVISE (`--revise <path>` iterates an existing spec). Use when the user types `/planning-loop`, says "plan and adversarially review X", "iterate this spec to LGTM", or "have Codex stress-test this plan".
argument-hint: "<feature blob>  |  --revise <path-to-existing-spec> [extra focus text]"
---

# Planning Loop

Drive a spec to a Codex-adversarially-reviewed `approve` verdict in at most 3 rounds.

Two modes:
- **FRESH** — `$ARGUMENTS` is a prose blob; spec-planner drafts a new spec at `docs/specs/<date>-<slug>.md`, then the loop iterates.
- **REVISE** — `$ARGUMENTS` starts with `--revise <path>` (optionally followed by focus text); the existing spec is the round-1 draft, and spec-planner only runs on rounds 2-3 if Codex returns `needs-attention`.

Both modes:
- Run autonomously between iterations (no user pauses).
- Suppress spec-planner's discovery phase (the dispatch prompt forbids `AskUserQuestion`).
- Cap at 3 rounds. End in either **LGTM** (Codex returned `approve`) or **Cap reached** (3 rounds, still `needs-attention` — print findings + 3 options and stop, never auto-ship).

## Step 0: Detect mode

**First — handle `--help` / `-h` / `help`** before any other parsing or side effects. If `$ARGUMENTS` is exactly one of those tokens (whitespace-trimmed, case-insensitive), print the usage block below and **exit immediately**. Do NOT create `.harness-state/`, do NOT resolve Codex, do NOT touch the working tree.

```
/planning-loop — drive a spec to a Codex-approved verdict in ≤3 rounds.

Usage:
  /planning-loop "<feature blob>"                 # FRESH mode — draft + iterate
  /planning-loop --revise <path-to-spec> [focus]  # REVISE mode — iterate existing

Modes:
  FRESH    Spec-planner drafts a new spec at docs/specs/<date>-<slug>.md from
           your blob, then loops it through Codex /codex:adversarial-review.
           Blob must pre-answer: what / who / scope / constraints / data /
           error handling. Discovery phase is suppressed — no clarifying
           questions are asked.

  REVISE   Existing spec is round-1 input. Spec-planner only runs on rounds
           2-3 if Codex returns needs-attention. Optional [focus] text adds
           to Codex's review focus prompt.

Both modes:
  - Cap at 3 rounds; never auto-ship at cap.
  - Logs every round to .harness-state/planning-loop/.
  - REVISE: requires clean working tree (skill auto-parks unrelated changes).

Auto-apply at cap (REVISE mode):
  When the cap-reached path's arbiter rulings are unanimous and every
  load-bearing fix passes the JSON edit-block contract (see Step 6e/6f),
  the skill applies the rulings to $SPEC_PATH via temp-file + atomic
  rename and prints a receipt instead of the 4-option menu. Editing is
  not shipping — Rule #6 (user owns /commit) is preserved.

  Opt-out (precedence: env var > profile key, default true):
    PLANNING_LOOP_NO_AUTO_APPLY=1   # disable globally (current shell)
    .harness-profile:               # disable per-project
      planning_loop:
        auto_apply: false

Examples:
  /planning-loop "RSS reader CLI..."
  /planning-loop --revise docs/specs/2026-04-15-rss-mvp.md
  /planning-loop --revise docs/specs/2026-04-15-rss-mvp.md "focus on rate limiting"
  PLANNING_LOOP_NO_AUTO_APPLY=1 /planning-loop --revise <spec>   # disable auto-apply
```

After printing, return without further action.

**Then — detect mode.** Inspect the leading tokens of `$ARGUMENTS`:

- If `$ARGUMENTS` starts with `--revise` → **REVISE mode**. Next whitespace-separated token is `<spec-path>`. Anything after that is optional `EXTRA_FOCUS` text.
- Otherwise → **FRESH mode**. Treat `$ARGUMENTS` as the feature blob.

```bash
# Help-first:
case "$(printf '%s' "$ARGUMENTS" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')" in
  --help|-h|help)
    # Print usage block and exit.
    exit 0
    ;;
esac

# Pseudo-parse:
if [[ "$ARGUMENTS" =~ ^--revise[[:space:]]+([^[:space:]]+)([[:space:]]+(.+))?$ ]]; then
  MODE=revise
  SPEC_PATH="${BASH_REMATCH[1]}"
  EXTRA_FOCUS="${BASH_REMATCH[3]:-}"
else
  MODE=fresh
fi
```

## Step 1: Validate input

### FRESH mode

`$ARGUMENTS` must be a non-empty prose blob describing the feature **plus pre-answered clarifications**. If under ~40 characters, stop and tell the user:

> `/planning-loop` (fresh mode) runs autonomously to LGTM — spec-planner's discovery phase is suppressed, so all clarifying answers must be in the initial argument.
>
> Provide a single prose blob covering at minimum:
> - **What** — feature in one sentence
> - **Who** — target user / caller
> - **Scope** — MVP or full vision
> - **Constraints** — stack, perf, deps, integrations
> - **Data** — what the system reads/writes
> - **Error handling** — failure modes that matter
>
> Example: `/planning-loop "RSS reader CLI for solo dev. MVP: subscribe to feeds, read articles in terminal. Stack: Go + SQLite, no auth. Perf: open in <500ms. Reads OPML, writes article state to local DB. On feed-fetch failure: log + skip, don't crash."`
>
> Or to revise an existing spec: `/planning-loop --revise docs/specs/2026-04-15-rss-mvp.md`

If the blob looks borderline (40-150 chars), continue but flag inline: "Heads-up: input is brief — Codex may flag scope/constraint gaps that pre-answers would have closed."

### REVISE mode

Validate the path:
- `test -f "$SPEC_PATH"` — file must exist. If missing, stop and tell the user.
- File extension should be `.md` (warn-but-continue if not).
- File should be non-empty (`test -s "$SPEC_PATH"`).
- File should look spec-shaped — at minimum has `## ` headings. If the file has no `## ` heading at all, stop:
  > `<path>` doesn't look like a spec (no `## ` headings). Either point at a real spec file or use fresh mode with a feature blob.

#### REVISE-mode pre-flight: leftover detection + auto-park

REVISE mode requires a clean working tree (except for `$SPEC_PATH` itself, which spec-planner edits during the loop). The skill **auto-parks** unrelated changes via a single git stash for the duration of the run, then restores them at any exit. State is journaled to `.git/planning-loop-park/state.json` so leftover state from a crashed/interrupted run can be detected on the next invocation.

The full pre-flight pipeline is implemented in `lib/preflight.sh` and runs five checks in this order:

1. **Leftover state detection** — if `.git/planning-loop-park/state.json` exists, abort with recovery instructions (point at `lib/restore.sh`).
2. **Orphan stash detection** — defense-in-depth for missing state.json: any stash whose message matches `planning-loop park *` aborts with manual-pop instructions.
3. **Phase 1c orphan auto-apply temp-file detection** — recovery for hard-kill mid-Step-6f. The Step 6f executor writes `<SPEC_PATH>.autoapply-tmp` then atomic-renames it onto the spec. If a SIGKILL/host-crash happens between temp-write and rename, the live spec is byte-identical to its pre-Phase-1a state but the orphan tmp is left behind. Conservative: only scans `docs/specs/` and the `--revise <path>` parent directory; ignores stray `.autoapply-tmp` files elsewhere. On hit, prints `diff` and `mv`/`rm` instructions to stderr, best-effort appends an `## Auto-apply aborted — <ts>` entry with reason `orphan-tmp-detected` to the most-recent log file under `.harness-state/planning-loop/`, and exits 1. The skill never auto-cleans or auto-restores in this case — the user decides.
4. **Working-tree classification** — `git status --porcelain` minus `$SPEC_PATH`; if non-empty, run auto-park.
5. **Auto-park** — single named git stash with pathspec exclusions for `$SPEC_PATH`, `docs/specs/_REVIEW-*`, and (defense-in-depth) the skill's repo-relative path when the skill source resolves into the current repo. Writes `state.json` with `parked=true|false` and a `README.md` to `.git/planning-loop-park/` either way, so downstream restore logic uniformly checks one file.

**Invocation:**

```bash
bash "$HOME/.claude/skills/planning-loop/lib/preflight.sh" "$SPEC_PATH" || exit 1
```

The helper exits 0 on success (continue), 1 on any abort with recovery instructions printed.

**Restore is mandatory at every exit.** See Step 6 — every exit path (success, escalation, any error) MUST invoke `bash "$HOME/.claude/skills/planning-loop/lib/restore.sh"` before returning. Rule #10 codifies this.

## Step 2: Compute slug + paths

### FRESH mode

```bash
DATE="$(date +%Y-%m-%d)"
```

Read the first sentence of `$ARGUMENTS`. Pick a 2-4 word kebab-case slug that names the feature (e.g. `rss-reader-cli`, `team-billing-export`). If ambiguous, prefer concrete nouns over verbs.

Set:
- `SPEC_PATH="docs/specs/${DATE}-${SLUG}.md"`
- `LOG_PATH=".harness-state/planning-loop/${DATE}-${SLUG}.md"`

If `SPEC_PATH` already exists, stop:
> Spec `<path>` already exists. Either pick a different slug, delete the existing file, or run revise mode: `/planning-loop --revise <path>`.

### REVISE mode

`SPEC_PATH` is the path the user provided. Derive the log basename from the spec filename without extension. Always include time-of-day to keep reruns from clobbering each other:

```bash
SPEC_BASENAME="$(basename "$SPEC_PATH" .md)"
TIME="$(date +%H%M%S)"
LOG_PATH=".harness-state/planning-loop/${SPEC_BASENAME}-revise-${TIME}.md"
```

### Both modes

```bash
mkdir -p .harness-state/planning-loop
```

## Step 3: Resolve the Codex companion script

Codex commands normally use `${CLAUDE_PLUGIN_ROOT}`, but a Skill runs outside that context. Resolve the path explicitly:

```bash
CODEX_COMPANION=""
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" && -f "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" ]]; then
  CODEX_COMPANION="${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs"
fi
if [[ -z "$CODEX_COMPANION" ]]; then
  CODEX_COMPANION="$(ls -d ~/.claude/plugins/marketplaces/openai-codex/plugins/codex/scripts/codex-companion.mjs 2>/dev/null | head -1)"
fi
if [[ -z "$CODEX_COMPANION" ]]; then
  CODEX_COMPANION="$(find ~/.claude/plugins -name codex-companion.mjs -path '*/openai-codex/*/scripts/*' 2>/dev/null | sort -V | tail -1)"
fi
```

If `$CODEX_COMPANION` is still empty, stop:
> Codex companion script not found. The `openai-codex` plugin must be installed. Run `/codex:setup` to verify.

Sanity-check Codex availability with `node "$CODEX_COMPANION" setup --json | jq -r .ready` — must be `true`. If not, stop and print the setup output.

## Step 4: Initialize the review log

Write the header to `LOG_PATH`. The header differs slightly by mode.

### FRESH mode

```markdown
# Adversarial Review Log: <feature one-liner from $ARGUMENTS>

**Mode:** fresh
**Spec:** docs/specs/<date>-<slug>.md
**Started:** <YYYY-MM-DD HH:MM:SS>
**Cap:** 3 rounds
**Reviewer:** Codex `/codex:adversarial-review` (focus: review as a plan, not code)

---
```

### REVISE mode

```markdown
# Adversarial Review Log: <derived from spec H1, or filename if missing>

**Mode:** revise (existing spec)
**Spec:** <SPEC_PATH>
**Started:** <YYYY-MM-DD HH:MM:SS>
**Cap:** 3 rounds (round 1 = adversarial-review on existing spec; rounds 2-3 = spec-planner revise + re-review)
**Reviewer:** Codex `/codex:adversarial-review` (focus: review as a plan, not code<EXTRA_FOCUS, if present>)

---
```

## Step 5: Iteration loop (rounds 1, 2, 3)

For each round `N` from 1 to 3:

### 5a. Dispatch spec-planner — *only when needed*

**FRESH mode, round 1**: dispatch with the round-1 prompt template (below).
**FRESH mode, rounds 2-3**: dispatch with the round-2+ prompt template (below).
**REVISE mode, round 1**: SKIP this step entirely — the existing spec IS the round-1 draft. Go straight to 5b.
**REVISE mode, rounds 2-3**: dispatch with the round-2+ prompt template (below).

After any spec-planner dispatch, verify `test -f "$SPEC_PATH"`. If missing, stop and tell the user spec-planner failed to write the file.

**Round-1 prompt template (FRESH mode only):** drafts the new spec from the user's pre-answered blob, with discovery suppressed. **Load `references/codex-prompts.md` §1 before dispatching.**

**Round-2+ prompt template (both modes):** revises `$SPEC_PATH` in place against Codex findings, holding scope. **Load `references/codex-prompts.md` §2 before dispatching.**

### 5b. Run adversarial-review

The Codex companion reviews the working-tree **diff**, not the file. For round 2+ in either mode, spec-planner has just edited `$SPEC_PATH` so the modification diff is naturally non-trivial. For **REVISE round 1**, the spec is committed clean — the diff is empty and Codex would either trivially-approve or report nothing to review. Workaround: place a side-path copy of the spec into the working tree as a single untracked addition so the diff equals the full spec content.

**REVISE round 1 — side-path copy:**

```bash
SIDE_COPY="docs/specs/_REVIEW-$(basename "$SPEC_PATH")"
cp -- "$SPEC_PATH" "$SIDE_COPY"
# Note: docs/specs/_REVIEW-* is gitignored to prevent accidental commit.
# The restore helper deletes $SIDE_COPY at exit.
```

Use the side copy's path in the focus text so Codex's references map to the right file. Spec-planner (rounds 2-3) edits the canonical `$SPEC_PATH`, NOT the side copy. Drop the side copy after round 1's review (or regenerate it from the canonical file before any subsequent round that needs the full-file diff scope).

**Run review (all rounds, both modes):**

```bash
TARGET_PATH="$SPEC_PATH"
[[ "$MODE" == "revise" && "$N" == "1" ]] && TARGET_PATH="$SIDE_COPY"

FOCUS="review $TARGET_PATH as a plan, not code — focus on whether the design is sound, what assumptions could break under real-world conditions, and whether scope matches the stated goal"
[[ -n "$EXTRA_FOCUS" ]] && FOCUS="$FOCUS — additional focus: $EXTRA_FOCUS"

REVIEW_OUTPUT="$(node "$CODEX_COMPANION" adversarial-review --wait "$FOCUS" 2>&1)"
```

The script reviews the working tree; the new/edited spec content is picked up because the side copy is untracked (round 1) or the canonical spec is modified (rounds 2-3). Capture full stdout into `REVIEW_OUTPUT`.

**After REVISE round 1**, drop the side copy regardless of the round's verdict:

```bash
if [[ "$MODE" == "revise" && "$N" == "1" ]]; then
  rm -f "$SIDE_COPY"
fi
```

This keeps the working tree showing `$SPEC_PATH` modifications only from round 2 onward, which is what spec-planner will edit.

### 5c. Parse the verdict

```bash
VERDICT="$(printf '%s\n' "$REVIEW_OUTPUT" | grep -E '^Verdict:' | head -1 | awk '{print $2}')"
```

`$VERDICT` will be `approve` or `needs-attention`. If neither matches, treat as `needs-attention` (fail-closed) and log "Verdict line missing — treating as needs-attention" in the review log.

**Trivial-diff guard.** Codex reviews diffs, not files — a no-op diff (e.g. trailing whitespace, single-newline) returns `approve` with summary text indicating no substantive change. That's not a real review. Detect and downgrade:

```bash
TRIVIAL_PATTERNS='(no substantive (plan |design |code )?change is present in the working tree diff|only adds a trailing blank line|nothing to review)'
if [[ "$VERDICT" == "approve" ]] && printf '%s' "$REVIEW_OUTPUT" | grep -qiE "$TRIVIAL_PATTERNS"; then
  VERDICT="needs-attention"
  TRIVIAL_DOWNGRADE=1
fi
```

If `$TRIVIAL_DOWNGRADE` is set, log "Verdict downgraded approve → needs-attention (trivial-diff trap detected)" in the round entry and proceed as if Codex returned `needs-attention`. This protects FRESH mode and any future scope path against the trap; REVISE round 1's side-path copy is the upstream prevention layer.

### 5d. Append round entry to log

```markdown
## Round <N> — <YYYY-MM-DD HH:MM:SS>

**Verdict:** <approve|needs-attention>
**Spec-planner ran this round:** <yes|no — REVISE mode round 1 only>

<full Codex output, fenced as ```text>
```

### 5e. Branch on verdict

| Round | Verdict | Action |
|-------|---------|--------|
| 1 or 2 | `approve` | **Exit clean** — go to Step 6 success path |
| 1 or 2 | `needs-attention` | **Continue** — proceed to round N+1 with findings as input |
| 3 | `approve` | **Exit clean** — go to Step 6 success path |
| 3 | `needs-attention` | **Escalate** — go to Step 6.5 arbiter routing, then Step 6 escalation path |

## Step 6.5: Arbiter routing (cap-reached only)

Runs only when round 3 returned `needs-attention`. Goal: surface a third independent opinion on each unresolved finding before printing the user-decides output. Advisory only — Rule #4 (no auto-ship at cap) still holds.

### 6.5a. Classify each round-3 finding

For each `Findings:` bullet in round 3's Codex output, tag it as `detail`, `scope`, or `mixed`:

- **detail** — cites a specific line/range (e.g. `:151-156`), names a concrete failure mode or a contradiction in wording, and the recommendation is mechanical ("change line N to X", "add a query before the delete"). Most round-3 findings land here.
- **scope** — questions whether the spec's *envelope* is right: wrong data model, wrong split (one skill vs two), stakes don't match the design, the whole step shouldn't exist. The recommendation requires re-thinking, not re-wording.
- **mixed** — has both a scope concern and a detail recommendation. Route to both arbiters.

Heuristic: if the recommendation can be applied with a text edit and a re-run of `/codex:adversarial-review`, it's `detail`. If applying it requires re-deciding what the spec is for, it's `scope`.

### 6.5b. Dispatch arbiter(s) — in parallel when both apply

**Detail bullets → `code-reviewer` agent.** Reasons: independent model from Codex, reads files directly (immune to the diff-scope bug), explicitly framed as adversarial. Dispatch via `Agent` with `subagent_type: code-reviewer` and the prompt template below.

**Scope bullets → `Plan` agent.** Reasons: strongest at design-tradeoff calls, framed for architectural reasoning. Dispatch via `Agent` with `subagent_type: Plan` and the prompt template below.

If both apply, dispatch both in a single message (parallel tool calls).

**Detail-arbiter prompt template (`code-reviewer`):** rules each detail-classified finding as load-bearing / nice-to-have / wrong-premise / defer, and emits a fenced `json` edit block per Shape A or Shape B for every load-bearing finding. **Load `references/codex-prompts.md` §3 before dispatching.**

**Scope-arbiter prompt template (`Plan`):** rules each scope-classified finding using the same four-verdict taxonomy at envelope level (redesign vs follow-up vs misread). **Load `references/codex-prompts.md` §4 before dispatching.**

### 6.5c. Append arbiter verdicts to the review log

Add a new section to `LOG_PATH`:

```markdown
## Arbiter — <YYYY-MM-DD HH:MM:SS>

**Routing:** <N detail bullets → code-reviewer> | <M scope bullets → Plan>

### code-reviewer verdicts (detail)
<verbatim agent output>

### Plan agent verdicts (scope)
<verbatim agent output>
```

If only one class of findings was present, omit the empty section heading.

### 6.5d. Build the option-4 candidate list

Scan arbiter verdicts for any `wrong-premise` rulings. These become **option 4** in the cap-reached output (drop the finding with a note in the spec's `## Open Questions`). If no `wrong-premise` rulings, option 4 is omitted.

### 6e. Auto-apply preconditions

Runs only at the cap-reached path, after Step 6.5d and before Step 6 prints anything. This block decides whether to fall through to the existing 4-option menu (default) or take the auto-apply branch (Step 6f). Full conjunctive precondition is codified in Rule #11; carve-out for Rule #4 + clarification of Rule #9.

The branch is taken if and only if **every** clause below holds. ANY failure aborts to the menu — all-or-nothing, no partial-apply, no skipped findings, no in-place edits to live spec.

**Clause 1 — Opt-out check (runs FIRST, before any other detection work):**

- Env var `PLANNING_LOOP_NO_AUTO_APPLY=1` (any non-empty value is treated as set; precedence over profile).
- Profile key `planning_loop.auto_apply: false` in `.harness-profile`. Default is `true` when key is absent.
- If either opt-out signal is asserted, append `## Auto-apply aborted — <ts>` with reason `opt-out-set` to `$LOG_PATH`, fall through to the menu, exit via the menu path. Skip every clause below.

**Clause 2 — Unanimity over the COMPLETE round-3 finding set:**

- Parse round-3 Codex findings ID set from the fenced ```text block under `## Round 3 — <ts>` in `$LOG_PATH`. Match every line of shape `^- \[(low|medium|high)\] ` and capture position-ordered IDs as `F1`, `F2`, … in document order. Result: `EXPECTED_FINDING_IDS = [F1, F2, F3, ...]` with cardinality `N`.
- Parse arbiter verdict ID set from the `## Arbiter — <ts>` section. For each `### <arbiter-name> verdicts` subsection, match `^\*\*F[0-9]+: (load-bearing|wrong-premise|nice-to-have|defer)\*\*` per-finding bullets and accumulate `VERDICTS_BY_ID = {F1: {code-reviewer: load-bearing, Plan: load-bearing}, F2: {code-reviewer: wrong-premise}, ...}`.
- Assert `set(EXPECTED_FINDING_IDS) == set(keys(VERDICTS_BY_ID))`. Symmetric difference → abort with reason `verdict-id-mismatch` (detail names the missing/extra IDs).
- Assert each expected finding has at least one verdict; zero-verdict finding → abort with reason `verdict-missing` and the bare ID.
- **Mixed-routing-aware completeness:** for each finding tagged `mixed` in the Step 6.5 routing line, BOTH arbiters MUST have ruled (both `code-reviewer` and `Plan` keys present). One-arbiter-on-mixed → abort with reason `mixed-routing-incomplete` and the bare ID. Detail-only or scope-only findings only require their routed arbiter.
- For each finding, all arbiter verdicts must agree on the same value (no `code-reviewer=load-bearing, Plan=wrong-premise` splits). Disagreement on any finding → abort with reason `validation-failure` (detail: which finding, what split).
- Parser is single-pass and fail-closed: any regex non-match, unparseable section heading, or IO read error on `$LOG_PATH` aborts with reason `log-parse-failure` and the failing line number.

**Clause 3 — Verdict whitelist (no `defer` or `nice-to-have`):**

- Every per-finding verdict must be one of `wrong-premise` or `load-bearing`. Any `defer` or `nice-to-have` on any finding → abort with reason `validation-failure`.

**Clause 4 — Non-mechanical pre-filter for `load-bearing` recommendations (cheap reject before JSON parsing):**

- Recommendation body must NOT contain any of (case-insensitive): `redesign`, `rethink`, `reconsider`, `restructure`, `scope-change`, `envelope`, `architecture`. Hit → that finding fails detection (treated like a missing JSON block). Pre-filter is advisory; the JSON-block contract below is authoritative.
- Recommendation cites at most one spec section (count of `## `-prefixed headings referenced in the recommendation prose body is ≤ 1). Multi-section reference → fails detection.

**Clause 5 — Edit operation contract (load-bearing findings, MUST validate before apply):**

Auto-apply requires every `load-bearing` arbiter recommendation to include exactly one fenced ```json block with one of these two shapes. Both shapes require a `section` field naming the H2 heading whose body the edit belongs to (rules 4, 6, 7, 8 below enforce section containment).

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

Validation rules (all must hold for the edit to be eligible — Step 6f Phase 1a runs these in order):

1. The fenced JSON block parses as valid JSON (`jq` is the load-bearing primitive; absent `jq` fails closed, treats as unparseable, aborts).
2. Exactly one of `{section, old_string, new_string}` or `{section, insert_after, new_string}` keypairs is present (not both, not neither).
3. `new_string` is non-empty.
4. `section` is non-empty AND matches an H2 heading (`^## <section>` literal match, anchored) that exists exactly once in current `$SPEC_PATH`. Multi-match or zero-match on the H2 heading aborts.
5. **Section-body-range computation:** lines from the matched `^## <section>` line (exclusive of the heading) to the next `^## ` line (exclusive) or EOF if no further H2 exists. Used by rules 6 + 7 below to bound where matches are allowed.
6. **Shape A:** `old_string` is non-empty AND appears exactly once as a literal substring in current `$SPEC_PATH` AND that one occurrence falls inside the section body range from rule 5.
7. **Shape B:** `insert_after` is non-empty AND appears exactly once as a literal substring in current `$SPEC_PATH` AND that one occurrence falls inside the section body range from rule 5.
8. **H2-in-edit-text rejection:** Neither `old_string` nor `new_string` (Shape A) and neither `insert_after` nor `new_string` (Shape B) may contain a line matching `^## ` (case-sensitive, anchored). This prevents an edit from inserting or destroying a section heading and prevents matches that span heading boundaries. Edits that need to add a heading are out of scope for auto-apply (fall through to menu).

**Substring-count semantics (rules 6 + 7):** `grep -Fc` counts matching LINES, not substring occurrences — under-counts multiple matches on one line and fails entirely on multi-line `old_string`. The helper uses a literal substring counter (Python `str.count`); equivalent awk/perl counters are acceptable.

**Clause 6 — Hash-stable across validation→apply window (F4 mitigation, external-mutation detection):**

- Step 6f Phase 1a captures `SPEC_HASH_PRE = sha256sum "$SPEC_PATH" | awk '{print $1}'` (or `shasum -a 256` on BSD/macOS — probe at startup) AND `LOG_HASH_PRE` for `$LOG_PATH` if it exists.
- Step 6f Phase 1b recomputes `SPEC_HASH_NOW` and compares to `SPEC_HASH_PRE`. Diff → abort with reason `hash-mismatch` and detail naming both 8-char hash prefixes. (External writer modified the spec between validation and apply.)
- Same check for `$LOG_PATH`: when `LOG_HASH_PRE` was recorded, recompute `LOG_HASH_NOW` and compare. Diff → abort with reason `log-hash-mismatch` and detail naming both 8-char hash prefixes. The log-hash check guards against an external writer racing the round-3 finding parse with concurrent appends to the log; mismatching means the EXPECTED set the helper validated against may no longer match what's on disk.

**Wrong-premise findings:** automatically eligible (no JSON block required). The disposition is "append a one-line bullet to the spec's Open Questions section". Phase 1a verifies the append target is resolvable: heading regex matches `^## Open Questions` OR `^## Open questions parked for v2` OR fall-through to "create new section at EOF" is available.

**Result of 6e.** A boolean: auto-apply eligible (proceed to 6f) or not (menu path). On a "not eligible" outcome, append `## Auto-apply aborted — <ts>` with the first failing reason to `$LOG_PATH` (best-effort) before falling through.

### 6f. Auto-apply executor

Runs only if 6e returned eligible. Implementation lives in `lib/auto-apply.sh` and enforces the full contract from 6e end-to-end. All-or-nothing: **no partial-apply, no skipped findings, no in-place edits to live spec**. The commit point is a single atomic `mv`; on any abort before the rename, the live spec is byte-identical to its pre-Phase-1a state.

**Invocation:**

```bash
AUTOAPPLY_OUTCOME="$(bash "$HOME/.claude/skills/planning-loop/lib/auto-apply.sh" "$SPEC_PATH" "$LOG_PATH")"
```

The helper:
- exit 0 + stdout `success` → auto-apply landed; audit appended; print receipt.
- exit 1 + stdout `menu-*` → aborted to menu; aborted entry appended; print 4-option menu.
- exit 2 → hard error (missing args, no SHA-256 utility, file unreadable); also fall through to menu.

`$AUTOAPPLY_OUTCOME` values: `success` | `menu-validation-failure` | `menu-opt-out` | `menu-hash-mismatch` | `menu-apply-failure` | `menu-audit-failure`. Caller branches on `success` vs anything else; abort reasons are persisted in the appended `## Auto-apply aborted — <ts>` log entry.

#### Phase 1a — Validation pass (in-memory, no writes)

The helper parses `EXPECTED_FINDING_IDS` from the round-3 fenced block in `$LOG_PATH` (Clause 2) and arbiter `VERDICTS_BY_ID` from the `## Arbiter — <ts>` section, then for each finding in declared order verifies the checks in this table. First failure aborts; Phase 1b does not run.

| # | Check | Abort reason | Detail template |
|---|-------|--------------|-----------------|
| 1 | Verdict-set consistency: every expected finding has at least one arbiter verdict | `verdict-missing` | `expected <Fi> has no arbiter verdict` |
| 2 | Mixed-routing-aware completeness: findings tagged `mixed` in the routing line need BOTH arbiters | `mixed-routing-incomplete` | `mixed-routed <Fi> lacks one arbiter ruling` |
| 3 | Per-finding agreement: no `code-reviewer=load-bearing, Plan=wrong-premise` splits | `validation-failure` | `split verdict on <Fi>: code-reviewer=<x> Plan=<y>` |
| 4 | Verdict whitelist (Clause 3): no `defer` or `nice-to-have` | `validation-failure` | `<Fi> verdict is <v> (no defer/nice-to-have allowed)` |
| 5 | Load-bearing: non-mechanical pre-filter (Clause 4) | `validation-failure` | `<Fi> recommendation hits non-mechanical pre-filter wordlist` |
| 6 | Load-bearing: exactly one fenced ```json block parses via `jq` (Clause 5 rule 1) | `validation-failure` | `<Fi> JSON block unparseable / no fenced JSON block / jq not available` |
| 7 | Load-bearing: Shape A xor Shape B (Clause 5 rule 2) | `validation-failure` | `<Fi> has both old_string and insert_after` / `<Fi> has neither` |
| 8 | `section` resolves to exactly one `^## <section>` H2 in current spec (Clause 5 rule 4) | `validation-failure` | `<Fi> section "<…>" matches N times in spec` |
| 9 | Substring count == 1 in spec (Clause 5 rule 6/7) | `validation-failure` | `<Fi> needle matches N times in spec (need exactly 1)` |
| 10 | Match falls inside section body range (Clause 5 rule 6/7) | `validation-failure` | `<Fi> needle match falls outside section "<…>" body range` |
| 11 | H2-in-edit-text rejection (Clause 5 rule 8) | `validation-failure` | `<Fi> edit text contains line starting with '## '` |
| 12 | `$SPEC_PATH` and parent dir writable (parent for atomic rename) | `validation-failure` | `spec or its parent dir not writable` |
| 13 | Round-3 finding set parseable from log | `log-parse-failure` | `no round-3 findings parsed from $LOG_PATH` |
| 14 | `$LOG_PATH` writable (so the post-rename audit append cannot fail mid-window) | `validation-failure` | `log not writable: $LOG_PATH` |

**Wrong-premise findings** are eligible without a JSON block; their disposition is "append a one-line bullet to `## Open Questions`". Phase 1a confirms an append target is resolvable: `^##[[:space:]]+[Oo]pen [Qq]uestions` heading regex (case-tolerant for `## Open Questions` and `## Open questions parked for v2`), with "create new section at EOF" as fall-through.

The helper captures `SPEC_HASH_PRE` (and `LOG_HASH_PRE` if applicable) at Phase-1a entry — Phase 1b re-checks these for the hash-stable window (Clause 6).

#### Phase 1b — Apply pass (atomic temp-file + rename)

Runs only if Phase 1a passed.

1. **Hash re-check** (Clause 6) — recompute `SPEC_HASH_NOW`; if `!= SPEC_HASH_PRE`, delete any tmp, abort `hash-mismatch` with detail `pre=<hex8> now=<hex8>`. Then, if `LOG_HASH_PRE` was recorded, recompute `LOG_HASH_NOW`; if `!= LOG_HASH_PRE`, delete any tmp, abort `log-hash-mismatch` with detail `pre=<hex8> now=<hex8>`.
2. **Temp buffer** — `cp $SPEC_PATH $SPEC_PATH.autoapply-tmp`. Live spec is NOT touched until step 4.
3. **Apply each edit to the buffer in declared order:**
   - **Wrong-premise → Open Questions append:** locate the resolved heading (or create `## Open Questions` at EOF); append a bullet `- [<title>] (auto-applied <ts> from /planning-loop arbiter ruling: <verbatim arbiter rationale>)`. No MVP de-dupe — duplicates are visible in the audit entry.
   - **Load-bearing Shape A:** literal-string replace `old_string` → `new_string` within the section body range only.
   - **Load-bearing Shape B:** literal-string insert `new_string` immediately after the unique anchor within the section body range only.
   - **Re-validate after each edit:** prior edits can introduce a duplicate of a later `old_string` or shift the section body range. Re-run substring-count + match-within-section for every remaining finding. Any failure → delete tmp, abort `apply-failure` with the failing `<Fi>`, no live mutation.
4. **Atomic rename** — `mv $SPEC_PATH.autoapply-tmp $SPEC_PATH`. Single commit point. On `mv` failure, delete tmp, abort `apply-failure` with `atomic rename failed: errno=<rc>`.
5. **Audit append** — write `## Auto-apply — <ts>` to `$LOG_PATH` (single `>>` write; POSIX O_APPEND atomicity covers entry size).

**Post-rename-pre-audit window.** Phase 1a row #14 pre-checks `$LOG_PATH` writability so the most common failure mode (chmod, missing parent dir) aborts before any spec mutation. The window can still surface on disk-full, filesystem-error, or remount-RO conditions between rename and append. If step 5's audit append fails, the spec is already mutated — rolling back atomically is impossible without a second non-atomic write (worse than the inconsistency). The helper prints a stderr warning naming the spec, best-effort writes a `## Auto-apply aborted — <ts>` entry with reason `log-append-failure`, and returns `menu-audit-failure`. This is the one documented exception to "spec never mutated without audit entry".

**Audit entry shape** (matches Data Model in the spec — `## Auto-apply — <ts>` with Preconditions line, both pre/post hashes, and `### Applied` block of per-finding bullets):

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

There is no `### Skipped` section. Auto-apply is all-or-nothing — either every finding lands or none do. On a "none" outcome the receipt is never printed (the menu prints instead and a separate `## Auto-apply aborted — <ts>` block is appended to `$LOG_PATH` with the abort reason).

**Auto-apply aborted entry shape** (appended on any 1a or 1b failure path):

```markdown
## Auto-apply aborted — <YYYY-MM-DD HH:MM:SS>

Reason: <opt-out-set | validation-failure | hash-mismatch | log-hash-mismatch | apply-failure | log-append-failure | orphan-tmp-detected | verdict-id-mismatch | verdict-missing | mixed-routing-incomplete | log-parse-failure>
Failed finding: <F-id or "n/a">
Detail: <e.g. "F2 old_string matches 0 times in $SPEC_PATH" / "F3 insert_after matches 3 times" / "F2 section 'Constraints' not found in $SPEC_PATH" / "F2 old_string match falls outside section 'Constraints' body range" / "JSON block in F1 unparseable: <error>" / "$SPEC_PATH SHA-256 changed between validation and apply (external mutation detected): pre=<hex8> now=<hex8>" / "atomic rename failed: <errno>" / "PLANNING_LOOP_NO_AUTO_APPLY=1 set" / "orphan $SPEC_PATH.autoapply-tmp detected from prior run">

Falling through to 4-option menu.
```

**Cleanup invariants:**
- Temp file `$SPEC_PATH.autoapply-tmp` is deleted before exit on any failure path.
- On the success path, the atomic `mv` consumes it (no leftover).
- All edits happen in working tree only; **no `git add`, no `git commit`**. Rule #6 (user owns `/commit`) is preserved.

## Step 6: Final output

**Before any exit message in this step (success, escalation, or any error path elsewhere in the skill), invoke the restore helper:**

```bash
bash "$HOME/.claude/skills/planning-loop/lib/restore.sh"
```

The helper is idempotent — safe to call when no parked state exists. It pops the auto-park stash if any, deletes the side-path copy if any, and removes `.git/planning-loop-park/`. Failures (e.g. stash-pop conflicts) print recovery instructions and leave state.json in place for the user to handle.

### Success path (any round returned `approve`)

Print to the user (after running the restore helper above):

```
✓ Planning loop converged in <N> round(s).

  Mode:       <fresh|revise>
  Spec:       <SPEC_PATH>
  Log:        <LOG_PATH>
  Verdict:    approve
  Cost:       <P> spec-planner runs + <N> Codex adversarial reviews
              (P = N in fresh mode; P = N-1 in revise mode if revisions happened, else 0)

Next: review the spec, then run the recommended implementation flow from its `## Implementation` block.
```

### Escalation path (3 rounds, still `needs-attention`)

This path runs AFTER Step 6.5 has dispatched arbiters and appended their verdicts to the log. **Branch logic:** if 6e returns true AND 6f succeeds, print the auto-apply receipt below; on any abort (6e returns false, or 6f writes a `## Auto-apply aborted` entry), print the existing 4-option menu unchanged.

#### Auto-apply receipt

Printed only when 6e + 6f succeeded end-to-end (no abort path was taken). The receipt is mutually exclusive with the 4-option menu.

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

Skill exits 0 after printing. `lib/restore.sh` is invoked before exit (Rule #10 unchanged).

#### 4-option menu (existing — preserved character-for-character)

Printed on any 6e or 6f abort, OR when the auto-apply branch was never eligible to run.

```
⚠ Planning loop hit cap (3 rounds) without LGTM.

  Mode:         <fresh|revise>
  Spec:         <SPEC_PATH>
  Log:          <LOG_PATH>
  Last verdict: needs-attention

Final findings (round 3):

<findings block from round 3 — verbatim>

Arbiter verdicts (advisory):

<one-line summary per finding: "<finding-tag>: <verdict> — <one-sentence rationale>">

The skill does NOT auto-ship the spec when the cap is reached. Decide:
  1. Address findings manually and re-invoke `/codex:adversarial-review` directly
  2. Override and ship anyway (judgment call — Codex disagreement may be a design dispute, not a defect)
  3. Rethink the design (often the right answer when 3 rounds didn't converge)
  <if any arbiter returned `wrong-premise`:>
  4. Drop the wrong-premise findings and add one-line notes in the spec's `## Open Questions`:
     <list each wrong-premise finding + arbiter's one-sentence misread explanation>
  </if>
```

## Rules (load-bearing)

Full rationale lives in `references/rules.md`. Load that file when you need the *why* behind a rule; the eleven titles below are sufficient for the constraint set during normal execution.

1. **Spec-planner discovery is ALWAYS suppressed.**
2. **Hard cap = 3.**
3. **Fail-closed on missing verdict line.**
4. **No auto-ship at cap.**
5. **Log every round.**
6. **Spec lives in the working tree.**
7. **Slug collision is a user signal — except in revise mode.**
8. **Revise mode does NOT widen scope.**
9. **Arbiters are advisory, never authoritative.**
10. **Auto-park is a lifecycle, not a step.**
11. **Auto-apply preconditions are conjunctive.**

## Out of scope

- Committing the spec (use `/commit` after).
- Routing tasks to waves or `/run-wave` (spec-planner's `## Implementation` block does this; the loop doesn't dispatch).
- Interactive discovery (suppressed by design — see Rule #1).
- Reviewing implementation code (use `/codex:adversarial-review` directly for that).
