---
name: close-wave
description: Close a docs/plan.md wave — state-probe → verify worktree → --no-ff merge → human TODOs → KB → tick plan.md → push → final gate → receipt. Portable, idempotent. Use after orchestrator-dispatched waves (via /run-wave) when an isolated agent worktree is waiting to be merged, OR to finish a partially-closed wave. Examples: 'close wave 1', 'merge and finish wave 2', 'did we properly close wave 3c?'.
argument-hint: "<wave_number>"
---

# Close Wave — portable docs/plan.md wave-exit sequence

Close a fully-shipped wave from an orchestrator's isolated worktree onto the current branch (usually `master`). Post-dispatch companion to `/run-wave`: /run-wave ends at dispatch; /close-wave is the human-checkpointed merge + housekeeping flow.

**Assumed inputs (per /run-wave convention):**
- One isolated agent worktree at `$REPO/.claude/worktrees/agent-<id>/` with N task commits + plan-tick commit.
- One summary doc at `$REPO/.claude/worktrees/agent-<id>/docs/<YYYY-MM-DD>-<project>-wave<wave_number>-summary.md` written by the orchestrator per /run-wave Step 8.

## Why this skill is idempotent

A wave can fall out of the happy path in three ways, each observed in real sessions:

1. **Post-merge smoke fail** — the merge lands, then the first live-smoke fails. The session reroutes into `root-cause → fix commit → re-smoke` and never returns to the tick/push/receipt steps. Plan.md stays unticked, push never happens, no receipt written. User asks a day later "did we actually close that wave?" (Wave 3c / 2026-04-21.)
2. **Close-doesn't-push** — local master advances; `origin/master` stays stale. Any deployment flow watching `origin/master` (e.g. a deploy hook doing `git reset --hard origin/master` on a timer) silently reverts the live target to pre-wave state.
3. **Re-invocation on an already-closed wave** — user asks to "close" a wave that's already done. Naive re-run attempts a fresh merge on nothing.

**Contract:** re-invoking `/close-wave $wave_number` at any point is safe. Step 0 probes current state, the skill skips phases already done, and only stops when the final gate (Step 11) confirms the wave is fully closed and the receipt (Step 12) is written.

## Inputs
- `$wave_number`: The wave to close. Used to find `docs/*-wave$wave_number-summary.md` and the `### Wave $wave_number` section in `docs/plan.md`.

## Done-definition (checked by Step 11 — ALL must hold before the receipt is written)
1. Every `- [ ]` under `### Wave $wave_number` in `docs/plan.md` is either `- [x]` (with commit hash) or explicitly `**Status: Deferred**`.
2. A `**Wave $wave_number exit gate (PASS YYYY-MM-DD, merge \`<hash>\`):**` annotation exists in plan.md for this wave.
3. `git log origin/<main>..<main>` is empty (pushed) OR Step 9 captured an explicit defer reason.
4. `$REPO/.harness-state/wave$wave_number-closed.md` receipt exists with the merge hash + any post-merge fix hashes.
5. No `.claude/worktrees/agent-*` directory for this wave remains.
6. Any post-merge `fix(...)` commits tied to this wave's smoke are listed in the checkbox annotation on plan.md (not just present in `git log`).

## Step 0: State probe — detect repo config and resumption point

```bash
REPO=$(git rev-parse --show-toplevel)
PROJECT=$(basename "$REPO")
PROFILE="$REPO/.harness-profile"
MAIN_BRANCH=$(git -C "$REPO" symbolic-ref refs/remotes/origin/HEAD --short 2>/dev/null | sed 's|origin/||' || echo master)
```

**Read from `.harness-profile` (optional fields):**
- `quality_gate.command` — e.g. `bunx tsc --noEmit`, `npm run typecheck`, `mypy .`, `go vet ./...`, `cargo check`. Used at Step 2 for baseline comparison.
- `protected_paths` — array of paths the skill must NOT touch directly (e.g. `["/services/<name>"]` for live-mirror deployments). Used at Step 6.
- `deploy.command` — optional hook command to trigger after push at Step 9 (e.g. `bash /Users/klorian/services/gobot-deploy.sh`). If absent, Step 9 pushes only.
- `deploy.live_path` — optional path to the live/mirror worktree, used to verify deploy landed (HEAD match).
- `kb.skill` — optional slash command for KB upsert (e.g. `update-kb`). If absent, Step 7 surfaces the upsert list to the user and records as deferred.

**Fallback if `quality_gate.command` absent:** try in order and use first detected: `bunx tsc --noEmit`, `npm run typecheck`, `mypy .`, `go vet ./...`, `cargo check`. If none, show `git diff <main>..HEAD --stat` at Step 2 instead.

**Fallback if `protected_paths` absent:** skip the mirror TODO category at Step 6.

**Now probe current phase:**

```bash
cd "$REPO"

# 0a. Receipt already exists?
RECEIPT="$REPO/.harness-state/wave$wave_number-closed.md"
test -f "$RECEIPT" && echo "RECEIPT_EXISTS" || echo "NO_RECEIPT"

# 0b. Exit-gate PASS annotation present?
rg "\*\*Wave $wave_number exit gate \(PASS" docs/plan.md 2>/dev/null | head -1

# 0c. Any active tasks still unticked under this wave?
awk "/^### Wave $wave_number/,/^### Wave /" docs/plan.md \
  | grep "^- \[ \]" | grep -v "Deferred" || echo "NO_UNTICKED"

# 0d. Worktree still alive for this wave?
git worktree list | grep "agent-" || echo "NO_WORKTREE"

# 0e. Local main ahead of origin?
git fetch origin "$MAIN_BRANCH" --quiet 2>/dev/null
git log --oneline "origin/$MAIN_BRANCH..$MAIN_BRANCH" | head -20

# 0f. Merge commit for this wave?
git log --oneline --grep="Wave $wave_number" --merges | head -5
```

**Routing table** — pick the first matching row and jump to that step:

| State | Go to |
|---|---|
| 0a=RECEIPT_EXISTS AND 0c=NO_UNTICKED AND 0e empty | **Done.** Show receipt, exit. |
| 0a=RECEIPT_EXISTS but 0c non-empty OR 0e non-empty | Step 8 → 9 → 11 → 12 (rewrite receipt) |
| 0f non-empty (merge exists) AND 0d=NO_WORKTREE | Step 6 (skill was interrupted post-merge) |
| 0f non-empty AND 0d shows worktree | Step 5 (worktree cleanup) |
| 0f empty AND 0d shows worktree | Step 1 (full flow) |
| 0f empty AND 0d=NO_WORKTREE AND 0a=NO_RECEIPT | STOP — ambiguous. Ask user what to close. |

**Success criteria:** current phase identified; resumption point announced to the user in one sentence (e.g. "Wave 3c: merge exists (`5c3c410`), worktree cleaned, plan.md unticked → resuming at Step 8").

## Step 1: Locate the worktree and summary doc

```bash
git -C "$REPO" worktree list
ls "$REPO/.claude/worktrees/" 2>/dev/null
ls "$REPO/.claude/worktrees/agent-*/docs/*-wave$wave_number-summary.md" 2>/dev/null
ls "$REPO/docs/*-wave$wave_number-summary.md" 2>/dev/null
```

Expected: exactly one `agent-<id>` worktree AND exactly one summary file for this wave.

**Rules:**
- If the summary is already on the current branch (not in the worktree), the wave may already be partially merged → STOP, investigate (Step 0 should have caught this).
- If multiple agent worktrees coexist → STOP, ask user which one to close.
- If no summary file exists in the worktree → STOP. /run-wave Step 8 mandates this file; its absence means the orchestrator didn't complete its mandate. Offer to generate one from inline report + worktree git log before proceeding.

**Success criteria:** worktree path + branch name + summary path captured.

## Step 2: Verify the worktree branch

```bash
cd <worktree_path>
git log --oneline "$MAIN_BRANCH..HEAD"
for sha in $(git log --format="%h" "$MAIN_BRANCH..HEAD"); do
  echo "=== $sha ==="; git show --stat --format="" $sha
done
# Run the detected quality-gate command, if any
<quality_gate_command> 2>&1 | tail -20
# Secret scan — catches accidentally-committed keys
git grep -E "sk-proj-|AIza[0-9A-Za-z_-]{35}|Bearer [A-Za-z0-9._-]{20,}" -- ':!docs' ':!.git' || echo "no leaks"
```

Cross-check against the summary doc §Shipped table:
- Commit list matches
- Files-per-commit fall within the Wave $wave_number scope listed in `docs/plan.md`
- Quality-gate output matches summary's "Baseline X → Y" (skip if no gate configured)
- Secret scan returns zero matches outside `docs/`

**Cross-repo symlink check** (per /run-wave Rule 10): if any commit touched a file that is a symlink reaching outside this repo, verify the symlink's owning repo is clean before treating the wave as shipped.

```bash
for f in $(git diff --name-only "$MAIN_BRANCH..HEAD"); do
  if [ -L "$f" ]; then
    tgt=$(readlink -f "$f")
    tgt_repo=$(git -C "$(dirname "$tgt")" rev-parse --show-toplevel 2>/dev/null)
    if [ "$tgt_repo" != "$REPO" ] && [ -n "$tgt_repo" ]; then
      echo "SYMLINK OUT: $f → $tgt (repo: $tgt_repo)"
      git -C "$tgt_repo" status --short
    fi
  fi
done
```

**Rules:**
- Commit list mismatch → STOP.
- Any commit touches a file outside Wave $wave_number scope → STOP, surface which file + commit, ask user.
- Quality-gate count higher than claimed → STOP, show the new errors, ask whether to merge anyway.
- Symlink-target repo has uncommitted changes → STOP, surface the sibling repo path + dirty files, ask whether to commit upstream first.

**Success criteria:** verification table printed; zero red flags OR user explicitly overrides each.

## Step 3: Human checkpoint — approve the merge

Show the user:
- Branch name + commit count
- §Shipped table from the summary doc
- §Human-only TODOs (verbatim — these drive Step 6)
- §Open Questions answered/deferred
- Expected conflict: `docs/plan.md` `both added` (§4 covers it)
- Any cross-repo symlink flags from Step 2

Ask via `AskUserQuestion`: "Merge wave $wave_number to `$MAIN_BRANCH`?" Options: "Merge (Recommended)" / "Show me the full diff first" / "Abort".

If "Show diff first", run `git diff $MAIN_BRANCH..HEAD --stat` + targeted `git diff $MAIN_BRANCH..HEAD -- <file>`, then re-ask.

**Rules:**
- Never merge without explicit approval.
- If "Abort" — do NOT delete the worktree; leave everything alive.

**Success criteria:** explicit user approval captured.

## Step 4: `--no-ff` merge + handle expected plan.md conflict

```bash
cd "$REPO"
git checkout "$MAIN_BRANCH"
git merge --no-ff <worktree_branch>
```

**Expected conflict — TWO shapes** (both from parent + worktree both adding `docs/plan.md`). Resolution: take the worktree's version (has the Wave N ticks + closed-gate metadata).

1. **Parent has an untracked `docs/plan.md`** — merge refuses with `error: The following untracked working tree files would be overwritten by merge: docs/plan.md`.
   ```bash
   rm docs/plan.md
   git merge --no-ff <worktree_branch>
   ```

2. **Parent has a committed `docs/plan.md`** (both branches added) — CONFLICT: both added.
   ```bash
   if git status --short | grep -q "^AA docs/plan.md"; then
     git checkout --theirs docs/plan.md
     git add docs/plan.md
     git merge --continue
   fi
   ```

Any other conflict → STOP, surface, do NOT auto-resolve.

**Rules:**
- Always `--no-ff` (preserves wave history as one merge commit).
- Stage explicitly, never `git add -A` / `git add .`.
- Never `--no-verify` / `--no-gpg-sign` / `-c commit.gpgsign=false`. Fix pre-commit failures and re-commit.

**Success criteria:** merge commit on main branch; `git status` clean; quality-gate count matches Step 2.
Capture `MERGE_HASH=$(git log --format=%h -1)` for later steps.

## Step 5: Delete the worktree and feature branch

```bash
git worktree remove <worktree_path>
git branch -d <worktree_branch>
```

If `-d` refuses → verify `git log $MAIN_BRANCH..<worktree_branch>` is empty before escalating to `-D`. Never `-D` without confirming zero unmerged commits.

**Success criteria:** `git worktree list` no longer shows the agent worktree; `.claude/worktrees/agent-<id>/` gone; branch deleted.

## Step 6: Process Human-only TODOs [human]

For each item in §Human-only TODOs (now on the current branch), ask via `AskUserQuestion`: "Execute TODO #N — <summary>?" Options: "Do it now" / "Defer — note in post-merge" / "Already done".

Common TODO categories:

- **Dashboard credential rotation** (OpenAI, Anthropic, ElevenLabs, Supabase, etc.) — always `[human]`. Prompt; mark done when user confirms.
- **Live run / smoke test** against production services — offer to spawn if prerequisites are met. Otherwise defer.
- **Protected-path mirror** (only if `.harness-profile` declares `protected_paths`) — offer `diff` + targeted `cp`. Never `git add -A` inside a protected path. **Skip this category if `protected_paths` is absent.**
- **DB migration / infrastructure changes** — requires prerequisite skills (e.g. `/migration-check`). Defer if prerequisites not met.
- **Pre-implementation decisions unresolved** (from /run-wave's Step 9 surfacing) — surface the default the orchestrator picked and ask if it should be locked in.

**Smoke-test TODOs are special — this is where Wave 3c dropped Step 8.** If the summary lists a post-merge smoke test:
1. Run it. If it PASSES → mark done, proceed.
2. If it FAILS → root-cause, write a `fix(...)` commit on the main branch, re-run smoke.
3. When the re-smoke passes, **record each fix commit hash** in a scratch variable `FIX_COMMITS`. Step 8 must append them to the relevant plan.md checkbox annotation.
4. Do NOT declare the wave closed from a green re-smoke alone. Explicitly resume at Step 8 — the final gate (Step 11) will block until plan.md reflects the fix commits.

**Rules:**
- Every TODO ends "done" / "deferred" / "already done". Never silently skip.
- Dashboard rotations + destructive live actions are always `[human]`.
- Deferred TODOs recorded verbatim for Step 10.
- After every smoke-fix detour, explicitly resume at Step 8.

**Success criteria:** every §Human-only TODO line has a resolution; any fix commits from smoke-fix detours captured in `FIX_COMMITS`.

## Step 7: KB / external-memory update

If the wave touched infrastructure, cron, MCP, integrations, data flows, architecture decisions, or schema (check the summary doc's §KB upsert suggestions):

- If `.harness-profile.kb.skill` is set, invoke it: `Skill: <kb.skill>`.
- If absent, preview the suggested upserts from the summary doc and record as a deferred TODO for a future session.

**Rules:**
- When infra changes land, KB upsert is expected — don't silently skip.
- If the project's CLAUDE.md makes KB upsert mandatory for infra changes, treat as hard rule.

**Success criteria:** facts upserted OR user explicitly deferred with upsert list captured for Step 10.

## Step 8: Reconcile plan.md ticks, exit-gate annotation, OQs, Gated Milestones

Every task under `### Wave $wave_number` in `docs/plan.md` must end this step either `- [x]` with commit hash(es) OR explicitly `**Status: Deferred**`. Mirror in each vertical spec's §Remediation Plan checklist.

**Checkbox annotation pattern:**
```
- [x] **<Task name>** (...) — **Size: X** — commits `abc1234` (1.1 <one-line what>), `def5678` (1.2 <one-line what>)[, `ghi9012` (post-merge fix — <one-line>)]. Merge `$MERGE_HASH`.
```
If Step 6 captured `FIX_COMMITS`, append them with a `post-merge fix` tag on the appropriate task.

**Exit-gate PASS annotation** — append to the `**Wave $wave_number exit gate:**` line:
```
**Wave $wave_number exit gate (PASS YYYY-MM-DD, merge `$MERGE_HASH`):** <original checks with ✓ / DEFERRED tags inline> [+ spec-deviation notes if any]
```

From §Open Questions answered/deferred in the summary doc:
- **Answered OQ** → resolve in the vertical spec's OQ table with decision + commit ref.
- **Gated Milestone prerequisite answered** → update plan.md §Gated Milestones.
- **Deferred OQ** → leave open; add one-line pointer to the wave summary.

Commit as `docs(plan): close wave $wave_number + reconcile OQs` (stage edited files explicitly). Capture `RECONCILE_HASH`.

**In-step machine check — BLOCKING** (this is the check that was missing when Wave 3c slipped):
```bash
# Must return empty
awk "/^### Wave $wave_number/,/^### Wave /" docs/plan.md | grep "^- \[ \]" | grep -v "Deferred"
# Must return exactly one line
rg "\*\*Wave $wave_number exit gate \(PASS" docs/plan.md
# Every FIX_COMMITS hash must appear in plan.md
for sha in $FIX_COMMITS; do rg "\`$sha\`" docs/plan.md > /dev/null || echo "MISSING: $sha"; done
```
If any check fails → do not proceed. Surface the failing check + offending lines and loop back within this step.

**Rules:**
- Every `- [x]` ends with a commit hash.
- Never silently delete an OQ — mark answered/deferred with a note.
- Fix commits from Step 6 smoke detours MUST appear in the checkbox annotation, not just in git log.

**Success criteria:** all three in-step machine checks pass; reconciliation commit on main branch.

## Step 9: Push to origin + trigger deploy

```bash
git log --oneline "origin/$MAIN_BRANCH..$MAIN_BRANCH" | head -20
```

Show the user the commits to be pushed (merge + reconcile + any post-merge fixes). Ask via `AskUserQuestion`: "Push wave $wave_number to origin$([ -n "$DEPLOY_CMD" ] && echo ' and trigger deploy')?" Options: "Push + deploy (Recommended)" / "Push only — I'll deploy later" / "Defer both (explain why)".

On "Push + deploy":
```bash
git push origin "$MAIN_BRANCH"
# If .harness-profile.deploy.command is set:
$DEPLOY_CMD
# If .harness-profile.deploy.live_path is set, verify HEAD match:
git -C "$DEPLOY_LIVE_PATH" log --oneline -1
```

**Rules:**
- Without push, any deploy hook watching `origin/$MAIN_BRANCH` with `git reset --hard` will silently revert the live target to pre-wave state. Default is push.
- "Defer both" must be accompanied by a reason — recorded verbatim in Step 10 post-merge note AND Step 12 receipt.
- Never force-push the main branch.

**Success criteria:** `git log origin/$MAIN_BRANCH..$MAIN_BRANCH` empty OR user explicitly deferred with reason captured in `DEFER_REASON`.

## Step 10: Post-merge note

If the session is mid-flight, append to `$REPO/.harness-state/last_exit.md` under `## Post-merge — Wave $wave_number`:
- Merge commit hash + reconcile commit hash + any post-merge fix hashes
- Pushed? (yes / deferred — reason)
- Deploy triggered? (yes / HEAD mismatch / deferred)
- Quality-gate before/after
- Deferred TODOs (verbatim from Step 6)
- OQs answered + Gated Milestone status changes
- Cross-repo symlink flags still open (if any)
- Next wave opening item (from plan.md `### Wave N+1`)

If the session was already closed, write to `$REPO/.harness-state/post_merge_wave$wave_number.md`. Create `.harness-state/` if missing.

**Success criteria:** note written; next session-start will not have to re-derive state.

## Step 11: Final verification gate — BLOCKING

This is the step that prevents "did we actually close this wave?" questions later. Run every check; all must pass. On any hard failure, surface the failure and loop back to the responsible step — do NOT write the receipt.

```bash
cd "$REPO"

# 11a. Every Wave N task ticked or explicitly deferred — HARD
unticked=$(awk "/^### Wave $wave_number/,/^### Wave /" docs/plan.md | grep "^- \[ \]" | grep -v "Deferred")
[ -z "$unticked" ] || { echo "FAIL 11a"; echo "$unticked"; exit 1; }

# 11b. Exit-gate PASS annotation exists — HARD
rg "\*\*Wave $wave_number exit gate \(PASS" docs/plan.md > /dev/null \
  || { echo "FAIL 11b: no exit-gate PASS annotation"; exit 1; }

# 11c. Local main pushed (or Step 9 explicitly deferred) — WARN if deferred
ahead=$(git log --oneline "origin/$MAIN_BRANCH..$MAIN_BRANCH" | wc -l | tr -d ' ')
if [ "$ahead" != "0" ]; then
  [ -n "$DEFER_REASON" ] || { echo "FAIL 11c: $ahead commits unpushed, no defer reason"; exit 1; }
  echo "WARN 11c: $ahead unpushed commits, deferred because: $DEFER_REASON"
fi

# 11d. No stale worktree for THIS wave — SOFT (multiple waves in flight is legal)
git worktree list | grep "agent-" && echo "WARN 11d: agent worktree still present — confirm it's for a different wave"

# 11e. Every FIX_COMMITS hash referenced in plan.md — HARD
for sha in $FIX_COMMITS; do
  rg "\`$sha\`" docs/plan.md > /dev/null \
    || { echo "FAIL 11e: fix commit $sha not in plan.md"; exit 1; }
done

# 11f. Quality-gate still clean (no regression from reconcile commit)
<quality_gate_command> 2>&1 | tail -5
```

**Rules:**
- 11a, 11b, 11c (without defer reason), 11e are HARD fails → loop back to Step 8 (or Step 9 for 11c).
- 11c with captured defer reason is a WARN.
- 11d is soft — surface but don't block.
- Do NOT write Step 12 receipt until all hard checks pass.

**Success criteria:** all hard checks PASS; warnings surfaced with context.

## Step 12: Closure receipt

Write `$REPO/.harness-state/wave$wave_number-closed.md`:

```markdown
# Wave $wave_number — CLOSED

- **Closed:** <ISO date>
- **Merge commit:** `$MERGE_HASH`
- **Reconcile commit:** `$RECONCILE_HASH`
- **Post-merge fixes:** <FIX_COMMITS or "none">
- **Pushed to origin:** <yes | deferred — reason>
- **Deploy:** <confirmed HEAD=<hash> | no deploy hook configured | deferred>
- **Summary doc:** `docs/<date>-<project>-wave$wave_number-summary.md`
- **Next wave opening:** <line from plan.md §Wave N+1>
- **Open items carried forward:** <deferred TODOs / OQs verbatim>
```

Tell the user the receipt path. Step 0 of any future `/close-wave $wave_number` finds this and no-ops.

**Success criteria:** receipt file exists and contains all captured hashes.

## Rules

1. **Portable by default.** Reads `.harness-profile` for project-specific bits (quality-gate, protected paths, deploy hook, KB skill). Falls through to safe defaults when fields are absent.
2. **Idempotent.** Step 0 is mandatory; re-invocations resume at the correct step, never re-merge.
3. **Step 11 is BLOCKING.** Never declare a wave closed without it passing. The whole point is that final gate.
4. **Smoke-fix detours always resume at Step 8.** A green re-smoke is not "wave closed" — plan.md must reflect the fix commits before Step 11 can pass. Step 8's in-step machine check enforces this.
5. **Never merge without Step 3 approval.**
6. **`docs/plan.md` `both added` conflict → always take the worktree version.** Both shapes handled in Step 4.
7. **Never `git add -A` / `git add .`.** Stage files explicitly.
8. **Never `--no-verify` / `-c commit.gpgsign=false`.** Fix underlying issues.
9. **Never touch protected paths without per-file user confirmation.**
10. **Never silently skip a human TODO.** Every item → done / deferred / already-done.
11. **Dashboard actions are always `[human]`.**
12. **Fail fast on ambiguity:** multiple worktrees, multiple summaries, missing summary doc, conflict beyond plan.md, quality-gate mismatch, dirty cross-repo symlink target → STOP.
13. **Default to pushing.** "Close-doesn't-push" is the #1 cause of live targets silently reverting to pre-wave state.
14. **Cross-repo symlink awareness.** Step 2 walks symlinks reaching outside this repo and verifies their owning repo is clean.
