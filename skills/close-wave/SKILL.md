---
name: close-wave
description: Close a docs/plan.md wave — verify worktree → --no-ff merge → process human TODOs → tick plan.md → post-merge note. Portable. Use after orchestrator-dispatched waves (via /run-wave) when an isolated agent worktree is waiting to be merged. Examples: 'close wave 1', 'merge and finish wave 2', 'wrap up the wave'.
argument-hint: "<wave_number>"
---

# Close Wave — portable docs/plan.md wave-exit sequence

Close a fully-shipped wave from an orchestrator's isolated worktree onto the current branch (usually `master`). This is the post-dispatch companion to `/run-wave`: /run-wave ends at dispatch; /close-wave is the human-checkpointed merge + housekeeping flow.

**Assumed inputs (per /run-wave convention):**
- One isolated agent worktree at `$REPO/.claude/worktrees/agent-<id>/` with N task commits + plan-tick commit.
- One summary doc at `$REPO/.claude/worktrees/agent-<id>/docs/<YYYY-MM-DD>-<project>-wave<wave_number>-summary.md` written by the orchestrator per /run-wave Step 8.

If your repo has a project-scoped `/close-wave` at `.claude/skills/close-wave/SKILL.md` (e.g. gobot), project scope wins — that tailored version runs, not this one. This skill is the generic fallback.

## Inputs
- `$wave_number`: The wave to close. Used to find `docs/*-wave$wave_number-summary.md` and the `### Wave $wave_number` section in `docs/plan.md`.

## Step 0: Detect repo + project config

```bash
REPO=$(git rev-parse --show-toplevel)
PROJECT=$(basename "$REPO")
PROFILE="$REPO/.harness-profile"
```

**Read from `.harness-profile` (optional fields):**
- `quality_gate.command` — e.g. `bunx tsc --noEmit`, `npm run typecheck`, `mypy .`, `go vet ./...`, `cargo check`. Used at Step 2 for baseline comparison against the summary doc's "Baseline X → Y" line.
- `protected_paths` — array of paths the skill must NOT touch directly (e.g. `["/services/<name>"]` for live-mirror deployments). Used at Step 6 to surface mirror-TODO prompts.

**Fallback if `quality_gate.command` absent:** try these in order, use first that exits 0 on `--help` or dry-run: `bunx tsc --noEmit`, `npm run typecheck`, `mypy .`, `go vet ./...`, `cargo check`. If none detected, skip tsc-baseline comparison and show `git diff master..HEAD --stat` instead at Step 2.

**Fallback if `protected_paths` absent:** skip the mirror TODO category at Step 6. Only surface what's in the summary doc's §Human-only TODOs verbatim.

## Step 1: Locate the worktree and summary doc

```bash
git -C "$REPO" worktree list
ls "$REPO/.claude/worktrees/" 2>/dev/null
ls "$REPO/.claude/worktrees/agent-*/docs/*-wave$wave_number-summary.md" 2>/dev/null
ls "$REPO/docs/*-wave$wave_number-summary.md" 2>/dev/null
```

Expected: exactly one `agent-<id>` worktree AND exactly one summary file for this wave.

**Rules:**
- If the summary is already on the current branch (not in the worktree), the wave may already be partially merged → STOP, investigate.
- If multiple agent worktrees coexist → STOP, ask user which one to close.
- If no summary file exists in the worktree → STOP. /run-wave Step 8 mandates this file; its absence means the orchestrator didn't complete its mandate. Offer to generate one from inline report + worktree git log before proceeding.

**Success criteria:** worktree path + branch name + summary path captured.

## Step 2: Verify the worktree branch

```bash
cd <worktree_path>
git log --oneline master..HEAD
for sha in $(git log --format="%h" master..HEAD); do
  echo "=== $sha ==="; git show --stat --format="" $sha
done
# Run the detected quality-gate command, if any
<quality_gate_command> 2>&1 | tail -20
# Secret scan — catches accidentally-committed keys
git grep -E "sk-proj-|AIza[0-9A-Za-z_-]{35}|Bearer [A-Za-z0-9._-]{20,}" -- ':!docs' ':!.git' || echo "no leaks"
```

Cross-check against the summary doc §Shipped table:
- Commit list matches the summary
- Files-per-commit fall within the Wave $wave_number scope listed in `docs/plan.md`
- Quality-gate output matches summary's "Baseline X → Y" (skip if no gate configured)
- Secret scan returns zero matches outside `docs/`

**Cross-repo symlink check** (per /run-wave Rule 10): if any commit touched a file that is a symlink reaching outside this repo (e.g. `src/lib/*-constants.ts` → sibling-service repo), verify the symlink target's owning repo is clean before treating the wave as shipped. Standard in-repo checks don't catch this.

```bash
for f in $(git diff --name-only master..HEAD); do
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

Ask via `AskUserQuestion`: "Merge wave $wave_number to `<current-branch>`?" Options: "Merge (Recommended)" / "Show me the full diff first" / "Abort".

If "Show diff first", run `git diff master..HEAD --stat` + targeted `git diff master..HEAD -- <file>`, then re-ask.

**Rules:**
- Never merge without explicit approval.
- If "Abort" — do NOT delete the worktree; leave everything alive.

**Success criteria:** explicit user approval captured.

## Step 4: `--no-ff` merge + handle expected plan.md conflict

```bash
cd "$REPO"
git checkout master   # or the project's main branch
git merge --no-ff <worktree_branch>
```

**Expected conflict — TWO shapes:** Both happen when the parent wrote `docs/plan.md` and the orchestrator created its own version in the worktree. Resolution: take the worktree's version (has the Wave N ticks + closed-gate metadata).

1. **Parent has an untracked `docs/plan.md`** — the merge refuses to start with `error: The following untracked working tree files would be overwritten by merge: docs/plan.md`. Resolution: `rm docs/plan.md` in parent, then re-run the merge (worktree's version lands cleanly, no CONFLICT marker).
   ```bash
   rm docs/plan.md
   git merge --no-ff <worktree_branch>
   ```

2. **Parent has a committed `docs/plan.md`** (both branches added the file) — merge produces a CONFLICT: both added. Resolution: `--theirs` + continue.
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
- Stage explicitly, never `git add -A` / `git add .` (avoids pulling in unrelated files).
- Never `--no-verify` / `--no-gpg-sign` / `-c commit.gpgsign=false`. Fix pre-commit failures and re-commit.

**Success criteria:** merge commit on target branch; `git status` clean; quality-gate count matches Step 2.

## Step 5: Delete the worktree and feature branch

```bash
git worktree remove <worktree_path>
git branch -d <worktree_branch>
```

If `-d` refuses → verify `git log master..<worktree_branch>` is empty before escalating to `-D`. Never `-D` without confirming zero unmerged commits.

**Success criteria:** `git worktree list` no longer shows the agent worktree; `.claude/worktrees/agent-<id>/` gone; branch deleted.

## Step 6: Process Human-only TODOs [human]

For each item in §Human-only TODOs (now on the current branch), ask via `AskUserQuestion`: "Execute TODO #N — <summary>?" Options: "Do it now" / "Defer — note in post-merge" / "Already done".

Common TODO categories to recognize (surface extra context per category):

- **Dashboard credential rotation** (OpenAI, Anthropic, ElevenLabs, Supabase, etc.) — always `[human]`. Prompt user; mark done when they confirm. This skill never performs rotations autonomously.
- **Live run / smoke test** against production services — offer to spawn if prerequisites are met (dev env loaded, right branch checked out). Otherwise defer.
- **Protected-path mirror** (only if `.harness-profile` declares `protected_paths`) — the orchestrator can't reach protected-path worktrees from an isolated dev worktree. Offer `diff` + targeted `cp`. Never `git add -A` inside a protected path. **Skip this entire category if `protected_paths` is absent from the profile.**
- **DB migration / infrastructure changes** — requires prerequisite skills (`/migration-check`, direct SSH access). Defer if prerequisites not met.
- **Pre-implementation decisions unresolved** (from /run-wave's Step 9 surfacing) — if the summary flagged an OQ that the orchestrator picked a default for, surface the default taken and ask if it should be locked in.

**Rules:**
- Every TODO ends "done" / "deferred" / "already done". Never silently skip.
- Dashboard rotations + destructive live actions are always `[human]` — this skill never performs them autonomously.
- Deferred TODOs are recorded verbatim for Step 9.

**Success criteria:** every §Human-only TODO line has a resolution.

## Step 7: KB / external-memory update (optional)

If the wave touched infrastructure, cron, MCP, integrations, data flows, architecture decisions, or schema (check the summary doc's §KB upsert suggestions):

```
Skill: update-kb
```

If `/update-kb` (or any project-scoped KB-upsert skill) isn't installed in this harness, preview the suggested upserts from the summary doc to the user and record as a deferred TODO for a future session. Same shape for external-memory plugins (mempalace, etc.) if configured.

**Rules:**
- When infra changes land, KB upsert is expected — don't silently skip. Either upsert or surface the list to the user.
- If the project's CLAUDE.md makes KB upsert mandatory for infra changes, treat that as a hard rule.

**Success criteria:** facts upserted OR user explicitly deferred with the upsert list captured for Step 9.

## Step 8: Reconcile plan.md ticks, OQs, Gated Milestones

Verify the Wave $wave_number checklist in `docs/plan.md` (or `plan.md` if the repo keeps it at root) — every item `- [x]` with commit hash. If the orchestrator didn't tick them, flip + append hash. Mirror in each vertical spec's §Remediation Plan checklist.

Then from §Open Questions answered/deferred in the summary doc:
- **Answered OQ** → resolve in the vertical spec's OQ table with decision + commit ref.
- **Gated Milestone prerequisite answered** → update plan.md §Gated Milestones (e.g. downgrade / mark "not needed").
- **Deferred OQ** → leave open; add one-line pointer to the wave summary for context.

Commit as `docs(plan): close wave $wave_number + reconcile OQs` (stage edited files explicitly).

**Rules:**
- Every `- [x]` ends with a commit hash (standard plan.md Status Legend).
- Never silently delete an OQ — mark answered/deferred with a note.

**Success criteria:** `git grep "\\- \\[ \\]" docs/plan.md` inside §Wave $wave_number returns zero hits. Touched specs committed.

## Step 9: Post-merge note

If the session is mid-flight, append to `$REPO/.harness-state/last_exit.md` under `## Post-merge — Wave $wave_number`:
- Merge commit hash
- Quality-gate before/after (or "no gate configured" if Step 0 found none)
- Deferred TODOs (verbatim from Step 6)
- OQs answered + Gated Milestone status changes
- Cross-repo symlink flags still open (if any)
- Next wave opening item (from plan.md `### Wave N+1`)

If the session was already closed (no active `.harness-state/`), write to `$REPO/.harness-state/post_merge_wave$wave_number.md` for next session-start to surface. Create `.harness-state/` if missing.

**Success criteria:** note written; next session-start will not have to re-derive state.

## Rules

1. **Portable by default.** Reads `.harness-profile` for project-specific bits (quality-gate command, protected paths). Falls through to safe defaults when fields are absent. Never assumes a specific repo path.
2. **Project-scoped overrides win.** If a repo ships its own `.claude/skills/close-wave/SKILL.md` (e.g. gobot), that one runs instead. This generic skill is the global fallback.
3. **Never merge without Step 3 approval.** Human checkpoint is load-bearing.
4. **`docs/plan.md` `both added` conflict → always take the worktree version.** Expected pattern, never a mistake. Both shapes handled in Step 4.
5. **Never `git add -A` / `git add .`.** Stage files explicitly.
6. **Never `--no-verify` / `-c commit.gpgsign=false`.** Fix underlying issues.
7. **Never touch protected paths without per-file user confirmation.** If `.harness-profile.protected_paths` declared, those paths are off-limits for direct writes.
8. **Never silently skip a human TODO.** Every item → done / deferred / already-done.
9. **Dashboard actions are always `[human]`.** Rotations and destructive live actions never automated here.
10. **Fail fast on ambiguity:** multiple worktrees, multiple summaries, missing summary doc, conflict beyond plan.md, quality-gate mismatch, dirty cross-repo symlink target → STOP.
11. **Cross-repo symlink awareness.** Step 2 walks symlinks reaching outside this repo and verifies their owning repo is clean before treating the wave as shipped.
