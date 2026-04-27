---
name: planning-loop
description: Two modes. (1) FRESH — generate a spec via the spec-planner agent from a pre-answered prose blob, then loop it through Codex's adversarial-review until LGTM. (2) REVISE — start from an existing spec file (`--revise <path>`), run adversarial-review on it directly, and let spec-planner iterate it on `needs-attention`. Both modes cap at 3 rounds and escalate on cap; both run fully autonomously between iterations. Each round writes findings into a review log under `.harness-state/planning-loop/`. Use when the user types `/planning-loop`, says "plan and adversarially review X", "draft a spec and have Codex tear it apart", "iterate this spec to LGTM", or "have Codex stress-test this plan".
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

Examples:
  /planning-loop "RSS reader CLI..."
  /planning-loop --revise docs/specs/2026-04-15-rss-mvp.md
  /planning-loop --revise docs/specs/2026-04-15-rss-mvp.md "focus on rate limiting"
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

**1. Leftover detection.** Before doing anything else, check for parked state from a previous run:

```bash
LEFTOVER_STATE=".git/planning-loop-park/state.json"
if [[ -f "$LEFTOVER_STATE" ]]; then
  STASH_MSG="$(jq -r .stash_message "$LEFTOVER_STATE")"
  PARK_TIME="$(jq -r .park_time "$LEFTOVER_STATE")"
  SIDE_COPY="$(jq -r .side_copy "$LEFTOVER_STATE")"
  echo "✗ /planning-loop detected leftover parked state from a previous run."
  echo
  echo "  Parked at:  $PARK_TIME"
  echo "  Stash msg:  $STASH_MSG"
  echo "  Side copy:  $SIDE_COPY (may exist; will be removed on restore)"
  echo
  echo "  Recover with:"
  echo '    bash "$HOME/.claude/skills/planning-loop/lib/restore.sh"'
  echo
  echo "  Or, if you've already manually recovered, delete the state dir:"
  echo "    rm -rf .git/planning-loop-park"
  exit 1
fi
```

Also check for orphan stashes whose message starts with `planning-loop park ` (defense-in-depth — state.json could be lost while the stash remains):

```bash
ORPHAN_STASH="$(git stash list --format='%gd %s' | grep -E ' planning-loop park ' | head -1)"
if [[ -n "$ORPHAN_STASH" ]]; then
  echo "✗ /planning-loop detected an orphan stash from a previous run:"
  echo "    $ORPHAN_STASH"
  echo
  echo "  Pop it (\`git stash pop <ref>\`) or drop it (\`git stash drop <ref>\`), then re-run."
  exit 1
fi
```

**2. Working-tree pre-flight.** With no leftover state, classify the working tree:

```bash
# Lines other than $SPEC_PATH itself.
PORCELAIN_OTHER="$(git status --porcelain | grep -v -F " ${SPEC_PATH}$" || true)"
```

If `$PORCELAIN_OTHER` is non-empty, the tree contains unrelated changes. Auto-park them.

**3. Auto-park.** Stash unrelated changes (including untracked) under a uniquely-named message, using git's native pathspec exclusion to leave `$SPEC_PATH` and the side-copy pattern alone. Journal the message + metadata to state.json so restore can find the stash even if its `stash@{N}` ref shifts.

```bash
mkdir -p .git/planning-loop-park
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
STASH_MSG="planning-loop park $TIMESTAMP"
PARK_TIME="$(date '+%Y-%m-%d %H:%M:%S')"

# Stash everything in the working tree EXCEPT $SPEC_PATH (which the loop edits)
# and the _REVIEW-* side-copy pattern (which round 1 may create after parking).
# Pathspec exclusion (':(exclude)<path>') is git-native — handles whitespace,
# untracked files, and staged content uniformly.
#
# Defense-in-depth: if the skill's installed path resolves into the current
# repo (i.e. running /planning-loop on claude-harness itself, where the skill
# source lives), exclude the skill's repo-relative path too. Without this, an
# uncommitted skill source would get stashed and the restore helper would be
# unreachable mid-loop. In normal use (skill installed via symlink into a
# DIFFERENT consuming repo) this exclusion is a no-op.
EXCLUSIONS=( ':(exclude)'"$SPEC_PATH" ':(exclude)docs/specs/_REVIEW-*' )
SKILL_REAL="$(realpath "$HOME/.claude/skills/planning-loop" 2>/dev/null || true)"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -n "$SKILL_REAL" && -n "$REPO_ROOT" && "$SKILL_REAL" == "$REPO_ROOT"/* ]]; then
  SKILL_REL="${SKILL_REAL#$REPO_ROOT/}"
  EXCLUSIONS+=( ':(exclude)'"$SKILL_REL" )
fi

git stash push -u -m "$STASH_MSG" -- "${EXCLUSIONS[@]}"

# Write state journal AFTER the stash succeeds. If git stash returned non-zero
# (e.g. nothing matched, which shouldn't happen here since pre-flight detected
# unrelated changes — but defensively), abort before writing state.json so the
# leftover detector doesn't fire on the next run for a stash that doesn't
# exist.
if ! git stash list --format='%gd %s' | grep -qF " $STASH_MSG"; then
  echo "✗ git stash push reported success but no matching stash found." >&2
  echo "  Aborting before writing state journal. Working tree may be partially modified." >&2
  exit 1
fi

cat > "$LEFTOVER_STATE" <<EOF
{
  "parked": true,
  "stash_message": "$STASH_MSG",
  "park_time": "$PARK_TIME",
  "spec_path": "$SPEC_PATH",
  "side_copy": "docs/specs/_REVIEW-$(basename "$SPEC_PATH")"
}
EOF

cat > .git/planning-loop-park/README.md <<'EOF'
# planning-loop park

This directory journals state for /planning-loop's auto-park. If you're seeing
this without an active /planning-loop run, the previous run was interrupted.

To restore: `bash "$HOME/.claude/skills/planning-loop/lib/restore.sh"`
To abandon: `rm -rf .git/planning-loop-park` (and inspect `git stash list` for
            stashes named `planning-loop park *`)
EOF

echo "✓ Auto-parked unrelated working-tree changes (stash: $STASH_MSG)."
echo "  Will be restored on any exit (success, error, or interrupt)."
```

If `$PORCELAIN_OTHER` was empty (working tree already clean except for `$SPEC_PATH`), skip the stash entirely — but still create state.json with `"parked": false` so downstream cleanup logic uniformly checks one file:

```bash
mkdir -p .git/planning-loop-park
cat > "$LEFTOVER_STATE" <<EOF
{
  "parked": false,
  "park_time": "$(date '+%Y-%m-%d %H:%M:%S')",
  "spec_path": "$SPEC_PATH",
  "side_copy": "docs/specs/_REVIEW-$(basename "$SPEC_PATH")"
}
EOF
```

**4. Restore is mandatory at every exit.** See Step 6 — every exit path (success, escalation, any error) MUST invoke `bash "$HOME/.claude/skills/planning-loop/lib/restore.sh"` before returning. Rule #10 codifies this.

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

**Round-1 prompt template (FRESH mode only):**

```
You are spec-planner. The user has pre-answered every clarifying question. **DO NOT run the Discovery Phase.** Do not call AskUserQuestion. Draft the spec directly from the inputs below and write the full spec to `<SPEC_PATH>`.

Follow your normal Spec Generation Rules + Recommended Implementation block as documented in your agent definition. Do not skip the `## Implementation` block.

After writing the file, return only: "Spec written to <SPEC_PATH>" — no other commentary.

# Inputs (user's pre-answered blob)

<verbatim $ARGUMENTS>
```

**Round-2+ prompt template (both modes):**

```
You are spec-planner, in iteration <N> of an adversarial review loop. The previous draft is at `<SPEC_PATH>`. Codex returned `needs-attention`. Findings below.

**DO NOT run the Discovery Phase.** Do not call AskUserQuestion. Revise `<SPEC_PATH>` in place to address every finding without expanding scope beyond the original spec's stated goal. If a finding is genuinely out of scope or rests on a wrong premise, leave a one-line note in the spec's `## Open Questions` block explaining why — do not drop it silently.

After rewriting, return only: "Spec revised at <SPEC_PATH>" — no other commentary.

<if FRESH mode:>
# Original inputs (user's pre-answered blob)

<verbatim $ARGUMENTS>
</if>

<if REVISE mode:>
# Original spec context

The spec at <SPEC_PATH> was authored before this loop began; treat its existing scope, data model, and acceptance criteria as the source of truth. Codex's findings should be addressed within that envelope.
</if>

# Codex findings to address (from round <N-1>)

<findings block from previous adversarial-review stdout>
```

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

**Detail-arbiter prompt template (`code-reviewer`):**

```
You are an independent third-arbiter for a planning-loop that hit cap with unresolved findings. Review the findings below and rule on each.

Spec under review: <SPEC_PATH>
Loop log (full round-by-round Codex output): <LOG_PATH>

For EACH finding below, return one of four verdicts plus one sentence:
- **load-bearing** — must fix before ship; Codex is right
- **nice-to-have** — fix as a TODO in implementation, not a blocker
- **wrong-premise** — Codex misread the spec or the recommendation rests on a false assumption; drop the finding (and explain in one sentence what the misread is)
- **defer** — out of the spec's envelope; document in the spec's `## Open Questions` block

Do NOT propose a redesign. Do NOT widen scope. Read the spec file directly to verify line references.

# Findings to rule on

<list of detail-classified bullets, verbatim from round 3>
```

**Scope-arbiter prompt template (`Plan`):**

```
You are an independent third-arbiter for a planning-loop that hit cap with scope-level findings. The spec under review claims a specific envelope; Codex's findings question that envelope.

Spec under review: <SPEC_PATH>
Loop log: <LOG_PATH>

For EACH finding below, return one of four verdicts plus one paragraph (≤4 sentences):
- **load-bearing** — the envelope IS wrong; spec needs a redesign; sketch the smaller spec or the different spec
- **nice-to-have** — envelope is right; finding is a stretch goal worth tracking but not blocking
- **wrong-premise** — Codex misread the spec's stakes or scope; drop the finding (explain the misread)
- **defer** — fair concern but for a follow-up spec, not this one

Do NOT auto-ship; do NOT commit. The user decides; you are advisory.

# Findings to rule on

<list of scope-classified bullets, verbatim from round 3>
```

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

Print to the user — this runs AFTER Step 6.5 has dispatched arbiters and appended their verdicts to the log:

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

1. **Spec-planner discovery is ALWAYS suppressed.** The dispatch prompt MUST tell the agent not to call `AskUserQuestion`. Applies to both modes; in revise mode, doubly so since we're working from an existing draft.

2. **Hard cap = 3.** Do not raise it. If 3 rounds didn't converge, the gap is design-level, not detail-level.

3. **Fail-closed on missing verdict line.** If Codex stdout doesn't contain a parseable `Verdict:` line, treat it as `needs-attention`. Never default to `approve` because parsing failed.

4. **No auto-ship at cap.** The cap path prints findings and stops. The user decides.

5. **Log every round.** Even if the user aborts mid-loop, the log under `.harness-state/planning-loop/` is the audit trail.

6. **Spec lives in the working tree.** Don't commit it inside the skill — that belongs to a follow-up `/commit`. The adversarial-review picks it up via working-tree scope.

7. **Slug collision is a user signal — except in revise mode.** Fresh mode stops if `SPEC_PATH` already exists. Revise mode targets an existing path on purpose.

8. **Revise mode does NOT widen scope.** Spec-planner's revise prompt explicitly says: address findings within the spec's existing envelope. If Codex flags a scope-level concern, that's a candidate for the spec's `## Open Questions` block, not a silent rewrite that turns an MVP into v2.

9. **Arbiters are advisory, never authoritative.** Step 6.5 surfaces a third opinion to inform the user's decision; it cannot ship the spec, edit the spec, or replace the user-decides options. Even a unanimous "drop all findings" arbiter ruling produces option 4, not auto-ship.

10. **Auto-park is a lifecycle, not a step.** REVISE mode parks unrelated working-tree changes via a single named stash + state journal at `.git/planning-loop-park/state.json`. Every exit point (success, escalation, error) MUST invoke `bash "$HOME/.claude/skills/planning-loop/lib/restore.sh"` before returning. Leftover state from a crashed/interrupted run is detected on the next invocation by the pre-flight in Step 1 and aborts cleanly with recovery instructions; never silently proceed past leftover state. Orphan-stash detection (a stash named `planning-loop park *` without state.json) is defense-in-depth for cases where state.json was lost.

## Out of scope

- Committing the spec (use `/commit` after).
- Routing tasks to waves or `/run-wave` (spec-planner's `## Implementation` block does this; the loop doesn't dispatch).
- Interactive discovery (suppressed by design — see Rule #1).
- Reviewing implementation code (use `/codex:adversarial-review` directly for that).
