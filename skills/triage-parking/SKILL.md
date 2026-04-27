---
name: triage-parking
description: Triage parking_lot.md — classify open items (skip / archive / substantive / modest / trivial-auto-ok), archive stale ones, and optionally open a single bundled draft PR for trivial items the user has explicitly opted in via [auto-ok]. Triage-only by default; never auto-merges; per-repo opt-in via .harness-profile. Use on-demand when the parking lot has accumulated and you want a sweep without dropping into manual classification.
---

# Triage Parking

Sweep `parking_lot.md`: classify each open item, archive stale ones, queue modest items, flag substantive ones for human attention, and open at most one draft PR for items the user has explicitly tagged `[auto-ok]`.

**Defaults are conservative.** Without per-item opt-in, this skill is read-only — it classifies, logs, and reports. The only thing it ever writes to `parking_lot.md` automatically is moving stale items to `## Archived` and appending `[queued]` markers to modest items so future runs skip them.

**Never auto-merges.** PRs are always `--draft`. Merging is a human decision.

## Step 0: Pre-flight gates (all must pass or exit cleanly)

Run all four checks. If **any** gate fails, print the reason, append a single line to `.harness-state/triage-log.md` recording the no-op (see Step 5), and **exit 0**. Do not write anywhere else. Do not error.

```bash
# Gate 1: parking_lot.md exists
test -f parking_lot.md || { echo "No parking_lot.md at repo root — nothing to triage."; GATE_FAIL="no_parking_lot"; }

# Gate 2: .harness-profile opts in
test -f .harness-profile && grep -qE '^\s*enabled:\s*true' <(awk '/^triage_parking:/{flag=1; next} /^[a-zA-Z]/{flag=0} flag' .harness-profile) \
  || { echo "triage_parking.enabled is not true in .harness-profile — skill is opt-in per repo."; GATE_FAIL="${GATE_FAIL:-not_enabled}"; }

# Gate 3: working tree clean
test -z "$(git status --porcelain)" || { echo "Working tree has uncommitted changes — won't risk colliding with in-flight work."; GATE_FAIL="${GATE_FAIL:-dirty_tree}"; }

# Gate 4: on main/master
CUR_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null)
MAIN_BRANCH=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')
MAIN_BRANCH=${MAIN_BRANCH:-master}
[ "$CUR_BRANCH" = "$MAIN_BRANCH" ] || { echo "Current branch ($CUR_BRANCH) is not the main branch ($MAIN_BRANCH) — won't run on feature branches."; GATE_FAIL="${GATE_FAIL:-wrong_branch}"; }
```

If `$GATE_FAIL` is set after the four checks: jump to Step 5 (write a single triage-log line of the form `YYYY-MM-DD: gate-fail(<reason>)`) and exit 0. Do not proceed past this step.

The always-log invariant in Step 5 still applies — pre-flight failures get a one-line log entry too.

## Step 1: Read and parse parking_lot.md

Read the file. Extract the `## Open` section into structured items. Each item line in the canonical format:

```
- [YYYY-MM-DD] <description> (source: <source>)
```

For each item, capture:

- `date` — the leading `[YYYY-MM-DD]`
- `description` — text between the date and the trailing `(source: ...)`
- `source` — the parenthesized source value (or `null` if missing)
- `markers` — detect substrings in the description (case-sensitive):
  - `[auto-ok]` — explicit opt-in for auto-fix
  - `[hold]` — explicit "do not touch"
  - `[queued ` — already queued by a prior triage run (skip without action)

Skip blank lines and any line not starting with `- [`. Preserve original line text for write-back later.

If `## Open` is empty: jump to Step 5 (no-op log + report).

## Step 2: Classify each item

For each open item, assign **exactly one** bucket using this rubric, evaluated in order. Stop at the first matching rule.

### Skip (no action, leave in Open)

- Description matches `/key|secret|credential|token|password/i` (security — human only, never goes anywhere near a PR diff)
- Has `[hold]` marker
- Has `[queued ` marker (already handled by a prior run)
- `source:` field, if present, matches the active micro-goal in `.harness-state/current_micro.md` (in-flight collision — don't compete with the user's current work)

### Archive (move to `## Archived`)

All three must be true:

- Item date is more than 90 days old (compare against today)
- No `[auto-ok]` marker
- No commit in `git log -30 --oneline` whose subject contains a substring of the item's description (>=8 chars match — rough heuristic, OK to be loose)

### Substantive (flag for human, leave in Open)

Any one of:

- Description contains any of: `investigate`, `consider`, `explore`, `design`, `document`, `review whether`, `may not be`, `should we`, `maybe`, `could` (case-insensitive)
- Description contains any of: `refactor`, `redesign`, `migration`, `architecture`
- Description states or implies multi-file impact (mentions `>1 file`, `across`, `everywhere`, multiple paths)

(All without `[auto-ok]`. If `[auto-ok]` is present despite substantive language, defer to the trivial-auto-ok rule below — the user has explicitly told you it's safe.)

### Modest (queue for `/micro`, leave in Open with `[queued]` appended)

- Single concrete imperative action (`add`, `fix`, `remove`, `rename`, etc.)
- BUT spans more than one file or estimated >20 LOC
- No `[auto-ok]` marker

Append `[queued YYYY-MM-DD]` to the line in `parking_lot.md` (use Edit tool) so future triage runs see it as already-queued and skip.

### Trivial-auto-ok (eligible for the bundled draft PR)

All three must be true:

- Has explicit `[auto-ok]` marker
- Imperative phrasing (`rename X`, `remove Y`, `add Z fallback`, `replace foo with bar`)
- Estimated single-file, <20 LOC change

These are the only items eligible for Step 4. Without `[auto-ok]`, no item ever lands in this bucket — no exceptions.

### Tally

Build counts per bucket: `skip`, `archive`, `substantive`, `modest`, `trivial_auto_ok`. Track which items fell into each. The skipped count broken out by reason (`secret`, `hold`, `in-flight`) is useful for the report.

## Step 3: Apply non-PR write-backs

Before going anywhere near a worktree, perform the parking_lot.md edits that don't need a PR:

1. **Archive moves.** For each item bucketed `archive`, remove the line from `## Open` and append it to `## Archived` (create the section if missing). Append a short note: `[archived YYYY-MM-DD: stale >90d, no activity]`.
2. **Modest queueing.** For each item bucketed `modest`, append ` [queued YYYY-MM-DD]` to the existing line. Do not move it — it stays in `## Open` so the user can promote it via `/micro` when ready.

Commit these edits to the **current branch (main)** with message:

```
chore(parking): triage sweep YYYY-MM-DD — archive N, queue M
```

Skip the commit step if neither archive nor modest produced any changes.

## Step 4: Worktree → fix → gate → draft PR (only if trivial_auto_ok > 0)

If `trivial_auto_ok` count is **zero**: skip this step entirely and proceed to Step 5.

Otherwise:

### 4.1 Cap and select

Take **at most 3** trivial-auto-ok items for this run. If more exist, leave the rest in `## Open` (they'll be picked up next run). One PR per invocation, max.

### 4.2 Set up worktree with cleanup trap

```bash
WORKTREE_DIR="../triage-$(date -u +%Y-%m-%d)"
BRANCH="triage/parking-$(date -u +%Y-%m-%d)"

# Trap ensures cleanup even if quality gate fails or anything else aborts
cleanup() {
  cd "$OLDPWD" 2>/dev/null || true
  git worktree remove --force "$WORKTREE_DIR" 2>/dev/null || true
  git branch -D "$BRANCH" 2>/dev/null || true
}
trap cleanup EXIT

git worktree add "$WORKTREE_DIR" -b "$BRANCH"
cd "$WORKTREE_DIR"
```

The trap MUST run on every exit path. If you can't use a trap (different shell), wrap the rest of this step in an explicit error handler that calls `git worktree remove --force` regardless of outcome.

### 4.3 Apply each fix

For each selected item:

1. Make the change in the worktree
2. If the change turns out to need >1 file, >20 LOC, or breaks something obvious during editing → **abort that item only**. Discard its changes (`git checkout -- <files>`), remove it from the selected list, leave it untouched in `parking_lot.md` for the user to decide manually. Continue with remaining items.
3. If after pruning the selected list is empty → no PR to open; skip to cleanup (the trap will handle it) and proceed to Step 5.

### 4.4 Run quality gate

```bash
GATE=$(awk '/^quality_gate:/{flag=1; next} /^[a-zA-Z]/{flag=0} flag' ../<repo>/.harness-profile | grep -E '^\s*command:' | sed -E 's/^\s*command:\s*"?([^"]*)"?\s*$/\1/')
GATE=${GATE:-"echo 'no quality_gate.command in .harness-profile — skipping' && true"}
eval "$GATE"
```

If gate fails (non-zero exit): the trap cleans up the worktree. Log a `gate-fail` entry in Step 5. Leave all selected items in `parking_lot.md`. **Do not open a PR.** Exit 0.

### 4.5 Commit, push, open draft PR

If the gate passes:

1. Commit each selected item separately, conventional-commit style:
   ```
   chore(parking): <imperative summary> (parked YYYY-MM-DD)
   ```
2. **In the same worktree, on the PR branch**, edit `parking_lot.md`: move each resolved item from `## Open` to `## Resolved`. Append `[resolved YYYY-MM-DD via #PR]` (PR number filled after creation, or omit if pre-creation). Commit as `chore(parking): mark <N> items resolved`. This keeps the parking-lot diff inside the PR — main is untouched until merge.
3. Push the branch: `git push -u origin "$BRANCH"`
4. Open draft PR:
   ```bash
   gh pr create --draft \
     --title "chore(parking): triage <N> items YYYY-MM-DD" \
     --body "$(cat <<EOF
   ## Summary
   Bundled triage of <N> auto-ok-tagged items from parking_lot.md.
   
   ## Items
   <bulleted list: each item's original date, description, and source>
   
   ## Notes
   - All items had explicit \`[auto-ok]\` opt-in
   - Quality gate passed: \`<command>\`
   - Draft — review before merging
   EOF
   )"
   ```
5. Capture the PR URL/number for Step 5's log line and Step 6's report.
6. `cd` back to the original directory. The trap removes the worktree on exit.

## Step 5: Triage log (always-log invariant)

**Always write one line to `.harness-state/triage-log.md`, even on no-op runs and gate failures.** This is how the user sees what the routine is doing on their behalf.

### 5.0 First-run: ensure `.gitignore` un-ignores the log

Before writing the file for the first time, make sure `.gitignore` allows it. Older harness installs (or any repo whose `.gitignore` was seeded before 2026-04-27) had `.harness-state/` as a directory exclude — gitignore semantics make that **un-overridable** by a `!`-rule on a child file. The skill fixes this in place, idempotently:

```bash
GI=".gitignore"
[ -f "$GI" ] || touch "$GI"

# Case A: directory-level exclude — rewrite to file-level + exception
if grep -qE '^\.harness-state/$' "$GI" && ! grep -qE '^!\.harness-state/triage-log\.md$' "$GI"; then
  # macOS/BSD sed compat: write to a temp and move
  awk '
    /^\.harness-state\/$/ {
      print ".harness-state/*"
      print "!.harness-state/triage-log.md"
      next
    }
    { print }
  ' "$GI" > "$GI.tmp" && mv "$GI.tmp" "$GI"
  echo "fixed .gitignore: .harness-state/ → .harness-state/* + !triage-log.md exception"
# Case B: file-level exclude already present, exception missing
elif grep -qE '^\.harness-state/\*$' "$GI" && ! grep -qE '^!\.harness-state/triage-log\.md$' "$GI"; then
  printf '!.harness-state/triage-log.md\n' >> "$GI"
  echo "added !triage-log.md exception to existing .harness-state/* pattern"
# Case C: no .harness-state pattern at all
elif ! grep -qE '^\.harness-state' "$GI"; then
  printf '\n# /triage-parking audit trail — see skills/triage-parking/SKILL.md\n.harness-state/*\n!.harness-state/triage-log.md\n' >> "$GI"
  echo "seeded .harness-state/* + !triage-log.md in .gitignore"
# Case D: already correct — no-op
fi
```

If `.gitignore` was modified, **stage it as part of Step 5's commit** (same `chore(triage-log): record YYYY-MM-DD sweep` commit, or fold into the Step 3 archive/queue commit if one is happening). Mention in the report that `.gitignore` was self-healed.

If `.gitignore` was already correct, this is a no-op — second and subsequent runs do nothing here.

### 5.1 Write the log

If `.harness-state/triage-log.md` does not exist, create it with header:

```markdown
# Triage Log

One line per `/triage-parking` invocation. Append-only.

```

Append today's line. Format depends on outcome:

**Pre-flight gate failure:**
```
2026-04-26: gate-fail(no_parking_lot)
```

**Successful run with PR:**
```
2026-04-26: 12 reviewed | 2 auto→PR#42 | 1 modest queued | 6 substantive | 2 archived | 1 skipped(secret)
```

**Successful run, no PR (no auto-ok items or all aborted):**
```
2026-04-26: 12 reviewed | 0 auto | 1 modest queued | 6 substantive | 2 archived | 1 skipped(secret)
```

**Quality gate failure during PR run:**
```
2026-04-26: 12 reviewed | gate-fail(npm test) — 3 items left for manual review
```

The skipped breakdown (`skipped(secret)`, `skipped(hold)`, `skipped(in-flight)`) is informative — combine if multiple reasons present, e.g. `2 skipped(1 secret, 1 hold)`.

This file is committed to git so the log persists across machines and sessions. Stage and commit it on main with the archive/modest commit (Step 3) when there is one; otherwise as a standalone:

```
chore(triage-log): record YYYY-MM-DD sweep
```

Skip the standalone commit if it would be empty (shouldn't happen — the log line itself is a change).

## Step 6: Report to user

Print to console:

1. The exact triage-log line written in Step 5
2. The PR URL if one was opened
3. Names/dates of the **5 most-recent** items in each non-empty bucket (helps the user sanity-check classifications without reading the full lot)
4. Optional next-action line if `substantive > 5`:
   > Substantive backlog at <N> — consider promoting one to a `/micro` session or close them as "won't do" if no longer relevant.

Example:

```
Triage 2026-04-26: 12 reviewed | 0 auto | 1 modest queued | 6 substantive | 2 archived | 1 skipped(secret)

Substantive (6, showing 5 most recent):
- [2026-04-19] Retire gobot-local /close-wave after global validation
- [2026-04-12] Auto-snapshot hook naming gap (wip: vs feat:)
- [2026-04-12] disable-model-invocation skills can't be invoked via Skill tool
- [2026-04-11] Document branches vs worktrees in methodology.md
- [2026-04-11] session-start should detect cross-session branch switches

Modest queued (1):
- [2026-04-11] session-start parking_baseline init grep fallback bug

Archived (2): see `## Archived` in parking_lot.md
Skipped (1): leaked API key item — security, human-only

Substantive backlog at 6 — consider promoting one to /micro or marking won't-do.
```

## Rules

1. **Triage-only by default.** Without explicit `[auto-ok]` per item AND `triage_parking.enabled: true` per repo, this skill never modifies code. It can still archive stale items and append `[queued]` markers — those are not code changes.
2. **Never auto-merges.** PRs are always `--draft`. The user clicks merge, not the skill.
3. **Secrets never reach a PR.** The classifier `/key|secret|credential|token|password/i` rule is non-negotiable. If it would block a legitimate item, the user can rephrase the parking lot entry — the skill will not.
4. **Always log.** Every run writes one line to `.harness-state/triage-log.md`, including pre-flight gate failures and zero-PR runs. This is the only way the user sees what the skill is doing.
5. **Worktree cleanup is mandatory.** Use a trap (or equivalent error handler) so the worktree is removed even if the quality gate fails, an item aborts mid-fix, or the script errors out. A leftover worktree blocks the next run.
6. **One PR per invocation, max 3 items per PR.** Bundling reduces noise; capping prevents one bad invocation from filling the user's review queue.
7. **Per-repo opt-in.** The `.harness-profile` flag is the master switch. Without it, the skill bails at gate 2.
8. **Conservative on classification.** When in doubt between `substantive` and `modest`, pick `substantive`. When in doubt between `modest` and `trivial-auto-ok`, pick `modest`. The cost of a missed auto-fix is one human glance; the cost of a wrong auto-fix is a bad PR.
