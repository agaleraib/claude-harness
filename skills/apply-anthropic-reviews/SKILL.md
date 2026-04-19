---
name: apply-anthropic-reviews
description: Turn APPLY-verdict suggestions from an anthropic-reviews PR into merged changes. Decomposes each § into bullets, classifies them (trivial / modest / substantive), routes trivial bullets to /micro, modest bullets to /micro + plan.md row, substantive bullets to /spec-planner, then updates Status lines in the dated file. Use when the user says 'implement anthropic-reviews', 'apply anthropic-reviews suggestions', or references a merged anthropic-reviews PR whose APPLY §s haven't shipped yet. Examples: 'implement anthropic-reviews', 'apply the 2026-04-19 review', 'ship the apply items from PR #1'.
argument-hint: "[<suggestions-file-date-or-pr-number>]"
---

# Apply Anthropic Reviews — APPLY-verdict implementation protocol

Companion to the `anthropic-reviews/` routine. The routine produces PRs with triaged suggestions; this skill executes the ones marked `APPLY`.

**Assumed inputs:**
- Working inside `claude-harness` (the repo where `anthropic-reviews/` lives)
- At least one dated suggestions file at `anthropic-reviews/<YYYY-MM-DD>-improvement-suggestions.md` with one or more §s whose `**Status:**` line starts with `APPLY —` (human-triaged, not yet shipped)
- `anthropic-reviews/README.md` present (defines the triage + application ladder; this skill implements its "How approved suggestions actually get built" section)

If the user hasn't triaged yet (Status lines still `PENDING`), STOP and point them at the PR — triage is a human step, not this skill's job.

## Inputs

- `$suggestions_ref` (optional): either a date (`2026-04-19`), a PR number (`1`), or absent. If absent, pick the most recent dated file with at least one `APPLY` status line.

## Step 0: Locate the target suggestions file

```bash
REPO=$(git rev-parse --show-toplevel)
cd "$REPO"
ls anthropic-reviews/*-improvement-suggestions.md 2>/dev/null | sort -r
```

Resolve `$suggestions_ref`:
- Date → `anthropic-reviews/$suggestions_ref-improvement-suggestions.md`
- PR number → `gh pr view <num> --json headRefName,files -q '.files[].path'` → pick the `anthropic-reviews/*-improvement-suggestions.md` path
- Absent → first file from the sorted-reverse listing that still has `^\*\*Status:\*\* APPLY —` lines

```bash
grep -c '^\*\*Status:\*\* APPLY —' <target_file>
```

**Rules:**
- Zero `APPLY` lines → STOP. Either everything's shipped or nothing's been triaged. Tell the user which.
- Multiple files in scope + no explicit ref → STOP and ask which one.

**Success criteria:** one target file captured; count of `APPLY` §s known.

## Step 1: Extract APPLY §s

For each § in the target file where `**Status:**` starts with `APPLY —`:

```bash
# List § numbers + titles
grep -n '^## ' <target_file>
# For each §, grab heading through the next §
```

Build an in-memory list:
```
§N — <title> — <Status line's short reason>
   ### Concrete changes (verbatim from the §)
   ...
```

**Success criteria:** structured list of all APPLY §s with their Concrete-changes blocks captured.

## Step 2: Decompose each APPLY § into bullets

For each §, rewrite the Concrete-changes block as a flat bullet list where each bullet is one shippable change. A § with three file touches = three bullets.

Example (§1 from 2026-04-19):
- §1a — README.md lines 10/25/30/32: swap "Opus 4.6" → "Opus 4.7" + one line on new knobs
- §1b — .harness-profile: add `model:` block (`primary`, `fallback`, `effort_default`, `tokenizer_note`)
- §1c — agents/orchestrator.md: add effort dimension + routing table row example

**Rules:**
- One bullet per file-touching change. A bullet that touches one file in two places is still one bullet.
- Preserve the § number + add a letter suffix (§1a, §1b, §1c) so Status updates in Step 6 can resolve back to the § cleanly.
- Never drop a piece of the Concrete-changes block. If something in the § is vague ("update the relevant skill"), call it out as its own bullet — Step 3 will route it to spec-planner.

**Success criteria:** every APPLY § expanded to a flat bullet list; each bullet names exactly one file (or one logical change).

## Step 3: Classify each bullet (decompose-vs-spec test)

For each bullet, apply the single test:

> **Can you write a one-paragraph `/micro` instruction for this bullet right now, from the § alone?**

- **Yes** → the § already spells out the change. Tag bullet `trivial` (unless signal triggers below promote it).
- **No** → the § names a direction, not a design. Tag bullet `substantive`.

Then check the **four promotion signals**. Any signal → bump to `substantive`:

1. **Shape is underspecified** — "add a routing table" without column/row/agent-per-model design choices.
2. **Touches in-flight or existing mechanisms** — collides with open work in memory (`project_multi_agent_routing.md` et al.), existing harness conventions, or a currently-specced feature.
3. **Introduces a reusable convention** — new schema field, new file convention, new `.harness-profile` key that other tools will read.
4. **Concrete changes span >5 files** — README's existing rule of thumb.

Tag intermediate cases as `modest` when:
- Multi-file but mechanical (bullet crosses 2–5 files with no design choices)
- The change deserves a `docs/plan.md` row but not a full spec

**Success criteria:** every bullet tagged `trivial` / `modest` / `substantive` with one-line rationale.

## Step 4: Human checkpoint — confirm the classification

Show the user a table:

```
| Bullet | Summary | Class | Rung |
|--------|---------|-------|------|
| §1a    | README 4.6→4.7 text | trivial | /micro |
| §1b    | .harness-profile model: block | substantive | signal #3 — new schema | /spec-planner (light) |
| §1c    | orchestrator effort routing | substantive | signal #2 — collides with in-flight | /spec-planner |
| §6     | multi-agent section in README | trivial | /micro (batches with §1a) |
```

Ask via `AskUserQuestion`: "Execute this plan?" Options: "Ship it (Recommended)" / "Re-classify (tell me which bullets)" / "Abort".

If re-classify → user names bullets + new class → rebuild table → re-ask.

**Rules:**
- Never execute without explicit approval (per `feedback_ask_before_deciding.md`).
- Per `feedback_critical_resource_eval.md`, flag bullets that look like over-engineering or duplicate existing mechanisms even if the § marked them APPLY — ask whether to downgrade to `defer` / `reject` before shipping.

**Success criteria:** user-approved classification table captured.

## Step 5: Execute

Group and execute by rung:

### 5a. Batch all `trivial` bullets into one `/micro`

Invoke the `/micro` skill once with a goal covering every trivial bullet. Example micro goal:

> Apply anthropic-reviews 2026-04-19 §1a + §6 — README text bump 4.6→4.7 (lines 10/25/30/32) and new Multi-agent coordination section.

After `/micro` completes, run `/commit`. One commit, multiple bullets.

### 5b. For each `modest` bullet

Still `/micro` + `/commit`, but add a one-line entry to `docs/plan.md` pointing to the bullet's rationale. One row per modest bullet.

### 5c. For each `substantive` bullet

Dispatch `/spec-planner` once per bullet. Hand over the bullet's text + the source § + the rationale tag from Step 3. The spec lands at `docs/specs/<date>-<topic>.md` and adds a plan.md wave row. **Do not ship the code in this session** — spec first, build later via `/run-wave`.

**Rules:**
- Trivial bullets from different §s can share one `/micro` + one commit. That's the point of batching.
- Modest + substantive bullets each get their own path. Never bundle a substantive bullet into a trivial micro.
- If a `/spec-planner` run surfaces discovery questions the user can't answer immediately, park the bullet (via `/park`) and move on.

**Success criteria:** every trivial/modest bullet has a commit hash; every substantive bullet has a spec file path OR a parking-lot entry.

## Step 6: Update Status lines in the dated file

For each bullet shipped or routed in Step 5, update its parent §'s `**Status:**` line in the dated suggestions file.

Format per the `anthropic-reviews/README.md` convention:

- All bullets under § shipped → `**Status:** APPLIED in commit <hash> · <date>`
- All bullets under § specced → `**Status:** SPEC'd in docs/specs/<file>.md · <date>`
- Mixed (some shipped, some specced / parked) → one composite line per § that lists each bullet's resolution:
  ```
  **Status:** PARTIAL — §1a APPLIED in <hash> · §1b SPEC'd in docs/specs/... · §1c PARKED in parking_lot.md · 2026-04-19
  ```

Stage the dated file + any `docs/plan.md` / `parking_lot.md` / `docs/specs/*` additions. Commit as:

```
docs(anthropic-reviews): close APPLY items from <YYYY-MM-DD> review
```

**Rules:**
- Dated files are append-mostly + Status-line-editable. Never rewrite Concrete-changes blocks after a run.
- Every APPLY § ends this skill's execution with a resolved Status line. No silent skips.

**Success criteria:** `grep '^\*\*Status:\*\* APPLY —' <target_file>` returns zero lines for every § touched this run.

## Step 7: Post-run note

Append a short note to `$REPO/.harness-state/last_exit.md` under `## Anthropic-reviews — <date>`:

- Target file path
- Count shipped / specced / parked
- Commit hash(es)
- Any rejected-at-Step-4 bullets with one-line reasons

If `.harness-state/` is absent, skip silently — `session-start` surfaces open anthropic-reviews PRs via `gh` independently.

**Success criteria:** note written if applicable; next session-start will not re-derive what was shipped.

## Rules

1. **Solo repo.** `claude-harness` is solo (per `feedback_harness_is_solo.md`). Don't fan notifications or require additional approvers.
2. **Never execute without Step 4 approval.** The human verdict in the PR was `APPLY`; the human classification here is still required.
3. **Re-verify factual claims before applying.** If a § says "rename X to Y" or "add Z", grep the repo first to confirm it isn't already in place. The v2 routine prompt should catch this at generation time, but defense-in-depth matters.
4. **Trivial bullets batch. Substantive bullets don't.** One `/micro` can carry many trivial bullets across §s; a substantive bullet always gets its own `/spec-planner`.
5. **Never silently downgrade APPLY.** If you want to skip a bullet (signal #1 from the critical-eval feedback — looks like over-engineering), surface it at Step 4 and get user sign-off to flip the Status to `REJECTED` with a reason.
6. **Never `git add -A` / `git add .`.** Stage files explicitly.
7. **Dated suggestions files are durable history.** Only the Status line moves. Concrete-changes blocks stay intact as the decision record.
8. **Fail fast on ambiguity:** no dated file, no APPLY lines, multiple dated files with APPLY lines and no ref, Status line format not matching the README convention → STOP and surface.
