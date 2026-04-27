# /triage-parking — Universal parking-lot triage skill

**Status:** spec
**Type:** new skill, ships universally via `/setup-harness`
**Owner:** Albert (solo)

## Problem

Parking lots in claude-harness-installed repos (claude-harness itself, wordwideAI, gobot) accumulate side-quest items captured by `/park` during micro-sessions. Items range from trivial chores ("rename foo to bar") to substantive design questions ("redesign alias ownership"). Triaging them by hand is the kind of routine sweep the user already does manually — a strong "promote to routine" signal.

Naive auto-fixing is wrong: most items are *deliberately deferred decisions*, not just code chores. Auto-shipping PRs for everything would steal decisions, leak secrets (one current item is a 🔑 leaked API key), and produce PR spam.

## Goal

A universal `/triage-parking` skill that classifies parking-lot items, archives stale ones, opens at most one bundled draft PR for explicitly-opted-in trivial items, and produces a triage log. **Triage-only by default. Never auto-merges. Per-repo opt-in.**

## Non-goals

- Not a fix-everything loop
- Not scheduled in v1 (on-demand only — earn the schedule by proving value)
- Not a replacement for `/micro` or `/spec-planner`
- Does not depend on `/apply-anthropic-reviews` (that skill is claude-harness-local; this one is universal)
- Does not auto-merge PRs (ever, in any version)

## Design

### Invocation

```
/triage-parking
```

No arguments in v1.

### Pre-flight gates (all must pass or skill bails with explanation)

1. `parking_lot.md` exists at repo root
2. `.harness-profile` exists and contains `triage_parking.enabled: true`
3. Working tree is clean (no uncommitted changes — won't risk colliding with in-flight work)
4. Current branch is the repo's main/master branch (don't run on feature branches)
5. `.harness-state/triage-log.md` itself is not part of the user's uncommitted changes (so writing a refusal log line cannot conflict with in-flight edits — see "Logging contract" gating rule below)

If any gate fails, print the reason and exit 0. The skill **attempts** to append a triage-log line per the Logging contract below; if the log itself is not safe to write (gate 5 failed), the skill prints the would-be log line to stderr instead and exits 0 with no repo mutation.

### Logging contract (single rule, with one explicit exception)

Every invocation of `/triage-parking` appends exactly one line to `.harness-state/triage-log.md`, **provided the log file is safe to write**. "Safe to write" means: `.harness-state/triage-log.md` is either absent, or tracked-and-clean, or untracked-and-not-overlapping with any path in the user's uncommitted changes. This applies to:
- Successful triage runs (with or without a PR)
- Pre-flight gate failures other than the dirty-tree case where the log itself is dirty
- Quality-gate failures during auto-fix
- No-op runs (zero items in any actionable bucket)

A pre-flight failure line uses this shape (so it's distinguishable from a real run):

```
2026-04-26: SKIPPED gate=clean-tree | reason="uncommitted changes in src/" | 0 reviewed | 0 mutations
```

**Dirty-tree refusal exception:** if gate 3 fails AND `.harness-state/triage-log.md` is itself among the dirty paths (or the user's uncommitted changes touch `.harness-state/`), the skill must NOT write to the log — appending would mutate the user's already-dirty checkout, which is the exact safety problem gate 3 exists to prevent. In that case the skill prints the refusal line to stderr in the same format prefixed with `[stderr-only]` and exits 0. The audit gap is acceptable because the user's own dirty state is itself the audit record.

The audit promise: if the user can't find a line for a given day AND no `[stderr-only]` refusal was printed in the user's terminal, the skill was never invoked that day. There is no code path that mutates anything (parking_lot, worktree, PR) without also writing a log line; the only invocations that don't log are pre-flight refusals where logging itself would violate the safety gate.

### Step 1: Read parking_lot.md

Parse `## Open` section into structured items: `{date, description, source, markers}`.

Markers detected from description:
- `[auto-ok]` — opt-in for auto-fix
- `[hold]` — explicit "do not touch"

### Mutation isolation rule (applies to every step that follows)

All edits to `parking_lot.md` — archive moves, `[queued]` marker appends, and resolved-item moves — happen **only in a disposable worktree on a triage branch**, never on main. The main checkout is read-only for the duration of the run. Edits become durable only when a draft PR is opened against main. If any failure occurs before the PR is opened (classification crash, quality-gate failure, push failure, gh CLI failure), the worktree and branch are discarded and main is untouched.

This guarantees: a failed run leaves zero side effects on main beyond the triage-log line. A user seeing a `gate=*` or `quality-gate-failed` log line knows for certain that `parking_lot.md` on main is unchanged.

### Step 2: Classify each item (in-memory only)

Classification is a pure read of the current `parking_lot.md` on main. No file mutations occur in this step. For each open item, assign exactly one bucket using the inlined rubric below.

**Skip (no action, leave in Open):**
- Description matches `/key|secret|credential|token|password/i` (security — human only)
- Has `[hold]` marker
- `source:` field matches the active micro-goal in `.harness-state/current_micro.md` (in-flight collision)

**Archive (will move to `## Archived` inside the worktree branch only):**
- Item date >90 days old AND no `[auto-ok]` marker AND no activity referencing it in last 30 commits

**Substantive (flag for human, leave in Open):**
- Description contains `investigate|consider|explore|design|document|review whether|may not be|should we|maybe|could`
- Description references architectural change (>1 file impact stated, or words like "refactor", "redesign", "migration")
- No `[auto-ok]` marker

**Modest (queue for `/micro`, leave in Open with `[queued]` marker appended inside the worktree branch only):**
- Single concrete action ("add retry logic", "fix grep fallback") but spans >1 file or >20 LOC estimated
- No `[auto-ok]` marker
- A `[queued YYYY-MM-DD]` token will be appended to the item line so future runs skip it — this edit happens in the worktree, not on main

**Trivial-auto-ok (eligible for draft PR):**
- Has explicit `[auto-ok]` marker (user opted this specific item in)
- Imperative phrasing ("rename X", "remove Y", "add Z fallback")
- Estimated single-file, <20 LOC change

### Step 3: Cap and select

From the trivial-auto-ok bucket, take **at most 3 items** for this run. If more exist, leave the rest for the next invocation. **Max 1 draft PR per run** containing all selected auto-fixes plus any archive/queue mutations from Step 2.

Determine PR mode for this run:
- **auto-fix mode**: ≥1 trivial-auto-ok items selected — PR will contain code commits + parking_lot edits
- **triage-only mode**: 0 trivial-auto-ok items, but ≥1 archive moves OR ≥1 modest items needing `[queued]` markers — PR will contain parking_lot edits only
- **no-op mode**: 0 trivial-auto-ok, 0 archives, 0 modest items needing markers — skip Step 4 entirely, go to Step 5 (log + report). No worktree, no PR, no main mutation.

### Step 4: Worktree, mutate, gate, draft PR

All mutations below happen inside the worktree. If any sub-step fails, run the **rollback procedure** at the end of this section before exiting.

**Collision-resistant naming.** Names are date-stamped for human readability *plus* a uniqueness suffix so two runs on the same day (or a run while a prior PR's branch is still alive) can never alias. Generate at run start:

```
RUN_ID="$(date -u +%Y-%m-%d)-$(git rev-parse --short HEAD)-$(openssl rand -hex 3)"
WORKTREE_PATH="../triage-${RUN_ID}"
BRANCH_NAME="triage/parking-${RUN_ID}"
```

The base SHA pins the run to the main commit it started from (so identity verification at rollback time is trivial); the 6-hex-char random suffix breaks ties when two runs start on the same SHA. Before creating the worktree/branch, the skill must verify both names are unused: `git worktree list` must not contain `${WORKTREE_PATH}`, `git branch --list "${BRANCH_NAME}"` must be empty, and (for safety) `git ls-remote --heads origin "${BRANCH_NAME}"` must be empty. If any check finds a collision, regenerate the random suffix and retry up to 3 times; if all retries collide, bail with `SKIPPED gate=name-collision` and exit 0 with no mutation.

**Stateful creation tracking.** The skill maintains an in-memory record of *what it created during this invocation* — populated only after each create operation reports success. Initial state:

```
CREATED_LOCAL_BRANCH=false
CREATED_WORKTREE=false
PUSHED_REMOTE_BRANCH=false
EXPECTED_REMOTE_SHA=""   # set after push, used to confirm identity at rollback
```

Each step below sets exactly one of these flags on success. Rollback consults them — it never deletes a resource the skill did not create.

1. Create a temp worktree from main: `git worktree add "${WORKTREE_PATH}" -b "${BRANCH_NAME}"`. On success: `CREATED_WORKTREE=true`, `CREATED_LOCAL_BRANCH=true`.
2. **Apply parking_lot.md edits in the worktree** (in this order, all in one logical change):
   - Move archive-bucket items from `## Open` to `## Archived`
   - Append `[queued YYYY-MM-DD]` to modest-bucket item lines
   - Leave skip / substantive / trivial-auto-ok items in `## Open` for now (resolved trivials get moved in step 6 below, after they pass the gate)
3. **If auto-fix mode**: for each selected trivial-auto-ok item, make the code change in the worktree. If any item turns out to be more complex than the trivial heuristic predicted (touches >1 file, requires >20 LOC, breaks tests), **abort that item only** — drop it from the selected list, leave its parking_lot line untouched in `## Open`, continue with the rest. If aborts reduce the selected list to zero AND there are no archive/queue edits from step 2, treat the run as no-op: rollback the worktree (no PR), log accordingly, exit 0.
4. Run `quality_gate.command` from `.harness-profile` (e.g., `npm test && npm run typecheck`).
5. **If gate fails** → run rollback procedure, log `quality-gate-failed`, exit 0. No PR, no mutation persists on main.
6. **If gate passes**:
   - In auto-fix mode: move each successfully-fixed trivial-auto-ok item from `## Open` to `## Resolved` in parking_lot.md (still in the worktree)
   - Commit: one commit per code change (conventional commit style) plus one final commit titled `chore(parking): triage sweep ${RUN_ID}` containing all parking_lot.md edits (archive moves + queue markers + resolved moves)
   - In triage-only mode: just the single `chore(parking): triage sweep` commit
7. Push branch with `--set-upstream origin "${BRANCH_NAME}"`. On success: `PUSHED_REMOTE_BRANCH=true`, `EXPECTED_REMOTE_SHA="$(git -C "${WORKTREE_PATH}" rev-parse HEAD)"`. **If push fails** → run rollback procedure, log `push-failed`, exit 0.
8. Open draft PR via `gh pr create --draft`:
   - auto-fix mode title: `chore(parking): triage <N> items ${RUN_ID}` (the date prefix of `${RUN_ID}` is what's shown to humans; the full ID stays in the branch name)
   - triage-only mode title: `chore(parking): triage sweep YYYY-MM-DD — archive <A>, queue <Q>` (date only — `${RUN_ID}` is not user-facing here)
   - PR body: bulleted list of every item touched (resolved / archived / queued) with original parking_lot date + source; include `Run ID: ${RUN_ID}` in a trailer line for traceability
   - **If `gh pr create` fails** → run rollback procedure (including deleting the pushed branch), log `pr-create-failed`, exit 0.
9. Clean up worktree (`git worktree remove "${WORKTREE_PATH}"`). The branch stays on the remote as the PR branch.

**Rollback procedure (called from any failure path in Step 4):**

Rollback is *stateful* — it deletes only what this invocation successfully created, and it verifies identity before destruction. Pseudocode order:

1. If `CREATED_WORKTREE` is true: `git worktree remove --force "${WORKTREE_PATH}"`. (Path collision was already ruled out at creation time, so we know this is our worktree.)
2. If `CREATED_LOCAL_BRANCH` is true: verify the local branch still points at a commit reachable from this run (its tip's first-parent chain reaches the base SHA captured in `${RUN_ID}`); if so, `git branch -D "${BRANCH_NAME}"`. If the branch is unexpectedly missing or points elsewhere, **do not delete** — log `rollback-skipped-local reason="branch identity mismatch"` and continue.
3. If `PUSHED_REMOTE_BRANCH` is true: fetch the remote tip with `git ls-remote origin "${BRANCH_NAME}"`. Only if the remote SHA equals `${EXPECTED_REMOTE_SHA}` (proving no other actor pushed over it) run `git push origin --delete "${BRANCH_NAME}"`. Otherwise **do not delete** — log `rollback-skipped-remote reason="remote SHA drifted"` and continue.
4. Verify main is unchanged: `git status` on the main checkout must report clean.
5. Append the triage-log line per Step 5 with the failure reason and any `rollback-skipped-*` notes appended, then exit 0.

This procedure guarantees: a pre-existing branch/worktree/PR-branch with a colliding name from a prior run cannot be deleted because (a) name-collision pre-flight prevented us from ever picking the same name, and (b) even if a name somehow matches, the identity check (base-SHA reachability for local; expected-SHA equality for remote) refuses to destroy resources we did not create.

### Step 5: Triage log

Per the Logging contract above, append exactly one line to `.harness-state/triage-log.md` (create file with header if missing). Successful run shape:

```
2026-04-26: 11 reviewed | 2 auto→PR#42 | 1 modest queued | 5 substantive | 2 archived | 1 skipped(secret)
```

Triage-only PR shape:

```
2026-04-26: 11 reviewed | 0 auto | 1 modest queued | 5 substantive | 2 archived | 1 skipped(secret) | triage-only→PR#43
```

Failure shapes:

```
2026-04-26: SKIPPED gate=opt-in | reason="triage_parking.enabled not set" | 0 reviewed | 0 mutations
2026-04-26: 11 reviewed | quality-gate-failed | 0 mutations persisted | rollback ok
2026-04-26: 11 reviewed | pr-create-failed | 0 mutations persisted | rollback ok (remote branch deleted)
```

The line is written for every invocation, no exceptions.

### Step 6: Report to user

Print the triage-log line plus:
- PR URL if one was opened (auto-fix or triage-only)
- Names/dates of the 5 most-recent items in each non-empty bucket (so user can sanity-check classifications)
- On rollback: a one-line note stating which failure path triggered it and confirming main is clean
- One-line next-action suggestion if substantive count >5: "Substantive backlog at N — consider a triage-parking session-end ritual to promote or close them"

## Skill file location

`claude-harness/skills/triage-parking/SKILL.md`

Symlinked into `~/.claude/skills/triage-parking` so it's available globally and propagates via `/setup-harness` to new repos.

## .harness-profile addition

`/setup-harness` adds this block to new profiles (commented out by default):

```yaml
# triage_parking:
#   enabled: false  # set to true to allow /triage-parking to open draft PRs
```

Existing profiles in wordwideAI and gobot remain untouched until the user manually opts in.

## /park skill update

Update `claude-harness/skills/park/SKILL.md` Step 5 confirmation to mention markers:

> Tip: append `[auto-ok]` if this is a trivial mechanical fix you'd be happy for `/triage-parking` to ship as a draft PR. Append `[hold]` to lock it from triage entirely.

This is the only change to `/park` — markers are opt-in, not prompted.

## Rollout

1. Build skill in claude-harness on a feature branch
2. Test against claude-harness's own parking_lot.md (set `triage_parking.enabled: true` in this repo's profile first)
3. Verify dry-run classifies the existing 11 items correctly:
   - 🔑 API key item → skipped (secret)
   - "Document branches vs worktrees" → substantive (contains "document")
   - "session-start parking_baseline init fails" → modest (concrete bug, single file likely)
   - Most others → substantive (contain "consider", "investigate", design judgment)
   - Expected trivial-auto-ok count: 0 (no items currently have the marker — that's correct, marker is new)
   - Expected mode: triage-only if any modest items need `[queued]` markers OR any items qualify for archive; else no-op. Either way, parking_lot.md on main must be unchanged after the dry-run.
4. Manually add `[auto-ok]` to one item, re-run, verify auto-fix draft PR opens cleanly AND parking_lot.md on main is unchanged until the PR is merged
5. Force a quality-gate failure (e.g., temporarily break a test), re-run, verify rollback: no PR opens, no remote branch lingers, parking_lot.md on main unchanged, triage-log line shows `quality-gate-failed`
6. Merge to master; symlink picks up automatically
7. Document in README under "Skills" section

## Tasks

| # | Task | Effort | Notes |
|---|------|--------|-------|
| 1 | Create `skills/triage-parking/SKILL.md` with steps 1–6 above | medium | sonnet |
| 2 | Update `skills/park/SKILL.md` Step 5 with marker tip | trivial | haiku |
| 3 | Update `skills/setup-harness/SKILL.md` to seed commented `triage_parking:` block in new profiles | trivial | haiku |
| 4 | Add `triage_parking.enabled: true` to claude-harness's own `.harness-profile` for self-testing | trivial | manual |
| 5 | Dry-run skill against claude-harness parking_lot.md, verify classifications match expectations in spec AND parking_lot.md on main is byte-identical before/after | small | manual |
| 6 | Add `[auto-ok]` to one suitable item (candidate: grep fallback bug, line 20), re-run, confirm draft PR opens AND parking_lot.md edits land only on the PR branch | small | manual |
| 7 | Force a quality-gate failure during a dry-run; verify rollback procedure leaves main clean, deletes the local triage branch (matched by this run's `${RUN_ID}` only), and writes a `quality-gate-failed` triage-log line | small | manual |
| 7b | Collision test: pre-create a branch named `triage/parking-${RUN_ID}` (using a fixture script that mimics the same-day naming scheme), invoke `/triage-parking`, confirm it either picks a new suffix on retry OR exits with `gate=name-collision` and never touches the pre-existing branch | small | manual |
| 7c | Stateful-rollback test: pre-create a branch with the legacy date-only name `triage/parking-YYYY-MM-DD` from a fake "prior run", trigger a forced failure mid-run, verify the pre-existing branch is **not** deleted and the rollback log notes `rollback-skipped-*` if applicable | small | manual |
| 7d | Dirty-log refusal test: dirty `.harness-state/triage-log.md` (e.g., add a stray uncommitted line), invoke skill, confirm refusal goes to stderr only and no file is mutated | trivial | manual |
| 8 | README: add `/triage-parking` to skills section with one-line description | trivial | haiku |

## Verify

- Skill exits cleanly on a repo without `parking_lot.md` AND a `SKIPPED gate=parking-lot-missing` log line is appended
- Skill exits cleanly on a repo without `triage_parking.enabled` AND a `SKIPPED gate=opt-in` log line is appended
- Skill never opens a PR when working tree is dirty AND a `SKIPPED gate=clean-tree` log line is appended (or, when the log itself is dirty, a `[stderr-only]` refusal line is printed and no file is mutated)
- Skill never opens a PR when on a non-main branch AND a `SKIPPED gate=branch` log line is appended
- Dirty-tree refusal where the user's uncommitted changes touch `.harness-state/` results in zero file mutation — the refusal line goes to stderr, not the log file
- Secret-bearing items never appear in any PR diff
- `.harness-state/triage-log.md` line is appended on every invocation **except** the explicit dirty-tree-on-log-path exception, which prints to stderr instead
- Worktree is cleaned up via the rollback procedure on every failure path (quality-gate, push, gh)
- After any rollback path, `git status` on the main checkout is clean and `git log` on main is unchanged from before the run
- After a `pr-create-failed` rollback, the remote branch `triage/parking-${RUN_ID}` does not exist (verified by `git ls-remote`) **only if** the skill itself pushed it; a pre-existing remote branch with the same human-readable date prefix from a prior run is never deleted
- Run ID uses format `YYYY-MM-DD-<short-sha>-<6-hex>`; two back-to-back runs on the same day produce two distinct branch names with no overlap
- Pre-flight name-collision check correctly skips a run when local branch, remote branch, or worktree path already exists for the chosen `RUN_ID`; collision retry regenerates suffix and succeeds within 3 attempts under normal conditions
- Stateful rollback: if the skill is invoked with a hand-crafted scenario where a branch matching `triage/parking-*` exists from a prior run, a forced failure mid-run does NOT delete that pre-existing branch (because the skill's `CREATED_LOCAL_BRANCH` / `PUSHED_REMOTE_BRANCH` flags are scoped to this invocation only)
- Remote-identity check: if a remote branch this skill pushed is overwritten by an external `git push --force` between push and rollback, the rollback procedure detects the SHA drift and refuses to delete it, logging `rollback-skipped-remote`
- `parking_lot.md` on main is byte-identical before and after any failed run (no archive/queue/resolve edits leak)
- PR is always `--draft`
- Triage-only PR title format `chore(parking): triage sweep YYYY-MM-DD — archive <A>, queue <Q>` is used when there are no auto-fix items but archive/queue mutations exist (date-only in user-facing title; full `${RUN_ID}` lives in the branch name and PR body trailer)

## Open questions parked for v2

- Should the skill be schedulable via `/loop` or remote cron? (Need 2-3 manual runs first to see if it earns it)
- Should the rubric be extracted to `docs/classification-rubric.md` and shared with `/apply-anthropic-reviews`? (Yes if a third skill needs it; not yet)
- Should `/session-end` call `/triage-parking` automatically when parking_lot has >5 items? (Tempting but violates "lean rituals over automation" — skip)
- Triage-only mode opens a PR for archive/queue mutations even when no code changes; could feel noisy. Acceptable for v1 because it preserves the "all parking_lot mutations go through reviewed PRs" invariant. v2 may add a `--auto-merge-triage-only` flag for solo repos once the routine has earned trust — explicitly excluded from v1 per the "never auto-merges" non-goal.
- Audit-gap on dirty-log refusal: the dirty-tree-on-log-path exception leaves no on-disk record of the refusal — the user must read terminal stderr to know the skill ran. Acceptable for v1 because the only path that triggers the gap is one where the user is *already* mid-edit on `.harness-state/`, so they're actively in the loop. v2 could add a sibling refusal-log path (e.g., `~/.claude/triage-refusal-log.md` outside the repo) if this proves to be a problem; deferred until evidence justifies the second log surface.
