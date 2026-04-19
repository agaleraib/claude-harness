---
name: run-wave
description: Dispatch the orchestrator to execute a wave of tasks from docs/plan.md in an isolated worktree. Use this whenever the user types /run-wave, says "run wave N", "execute wave N", "kick off wave N", "dispatch wave N", or otherwise asks to start building the tasks grouped under a Wave heading in plan.md. The skill reads plan.md, finds the requested Wave block, follows each bullet's spec link, enumerates the cherry-picked sub-tasks (not the whole spec), pulls each task's Verify block, and builds an orchestrator prompt with the wave's exit gate cited verbatim. It dispatches and stops — merging and final tick-off belong to a separate step.
argument-hint: "[wave number]"
---

# Run Wave

Execute a single wave of work from `docs/plan.md` by dispatching the orchestrator in an isolated worktree.

`plan.md` is a navigator-style index: each Wave block lists bullets, each bullet points at a vertical spec in `docs/specs/`, and bullets may cherry-pick only a subset of a spec's tasks (e.g. "V11 Task 1 + Task 2" while Tasks 3–4 belong to a later wave). This skill traverses that structure, builds a synthetic "wave spec" combining only the cherry-picked tasks, and hands it to the orchestrator inside a worktree — so the whole wave is one rollback-safe batch.

The skill **ends at dispatch**. Running the wave's exit gate on master, merging, and branch cleanup belong to `/merge-wave` (or a manual sequence). This separation exists because exit-gate failure is a human judgment call — the skill should not auto-merge.

## Step 1: Resolve the wave number

If `$ARGUMENTS` is a positive integer, use it. Otherwise, use `AskUserQuestion`:

> **Which wave?**
>
> Enter a Wave number from `docs/plan.md`. Example: `1` for "Wave 1 — Unblock typecheck & rotate secrets".

## Step 2: Locate plan.md

```bash
test -f docs/plan.md && echo docs/plan.md || (test -f plan.md && echo plan.md)
```

If neither exists, stop:

> No `plan.md` found. `/run-wave` requires `docs/plan.md` (or `plan.md` at repo root). Generate one with `/spec-planner` or see `docs/prompts.md` for the convention.

## Step 3: Extract the Wave block

Read plan.md. Locate the heading matching `### Wave N` (case-insensitive, any dash or em-dash after the number). Capture everything from that heading up to the next `### ` heading (or end of file). This is your working block.

If no matching heading exists, stop and list what's available:

> Wave N not found in plan.md. Found: `### Wave 1 — ...`, `### Wave 2 — ...`, etc.

## Step 4: Parse wave items

From the Wave block, collect each top-level `- [ ]` bullet. Skip:

- `- [x]` (already done)
- `- [~]` (in progress — ask before resuming)
- Anything nested under "Gated Milestones" or "Deferred" sub-sections (these should live in separate top-level sections of plan.md, but be defensive)

For each open `- [ ]` item, capture:

1. **Vertical name + size label** — e.g. "V7 MCP Fleet — blockers only — Size: S"
2. **Spec link** — `[spec: ...](./specs/...)` or a bare `docs/specs/...` path
3. **Sub-bullets** — the cherry-picked task enumeration (e.g. `B1: ...`, `Task 1 (blocker): ...`, `Phase 1 T2: ...`). These define which tasks from the linked spec belong to this wave. **Sub-bullets are authoritative scope.**
4. **Header/sub-bullet divergence flag** — note when the header names a narrower scope than the sub-bullets enumerate. Example: header says "V5 Smart Check-in — Phase 1" but sub-bullets list Phase 1 + Phase 2 + Phase 3. This is a convention in some repos: the header is a short label; the sub-bullets define actual scope. Do NOT stop on this — capture both and surface the divergence in Step 9's confirmation summary so the user eyeballs it before dispatch.

If a bullet has no spec link, stop:

> Wave item "[name]" has no spec link. Fix plan.md before dispatching.

## Step 5: Read each referenced spec

For each spec file captured in Step 4:

1. **Read the spec.**
2. **Locate each cherry-picked task** by its ID (e.g. "Task 1", "B1", "Phase 1 T2"). Look for headings like `### Task 1`, `### B1 — ...`, or `### Phase 1` + inline `T2:`.
3. **Extract the task body** — goal, file list, implementation guidance, any `Depends on:` line.
4. **Extract the task's `**Verify:**` block** if present. This is the task's gate, verbatim.
5. **Flag human-only actions.** Scan the task body for phrases indicating manual work the orchestrator can't do. Two categories:
   - **Manual ops actions** — "dashboard", "rotate the …key", "manual migration", "apply to LXC", "ssh production", "OAuth redirect", "paste from the admin UI", "production deploy", "live cutover".
   - **Pre-implementation decisions** — "Decision required per OQ#N", "Path A vs Path B", "Choose before implementation", "Pick A or B", "blocks on [open question]". These are design choices the spec says a human must make before the work can start. If unresolved in the spec, the skill must surface them at Step 9 and ask the user to pre-answer (or mark as TODO if the orchestrator should pick a safe default inline).

Both categories become TODOs in the final summary, not tasks to attempt. Pre-implementation decisions are louder — they'll block the orchestrator from starting that task if unresolved.

If a cherry-picked task ID doesn't appear in the spec, stop:

> Wave N references `<task-id>` in `<spec>` but the spec has no matching heading. Likely plan.md/spec drift — reconcile before dispatching.

## Step 6: Capture the wave exit gate

Find the line or block in the Wave block starting with `**Wave N exit gate:**` (case-insensitive). Capture its full text verbatim — this is the release gate for the wave, to be run after all tasks commit.

If no exit gate is declared, note that in the dispatch summary — don't invent one.

## Step 7: Capture operating rules

Look in plan.md for a top-level section titled `## Operating Rules for Execution` (or similar). Capture its bullets verbatim. Typical rules include `--no-ff` merges, explicit file staging, protected-path separation (e.g. `/services/<project>` live worktrees), and hook-driven conventions.

If plan.md has no such section, fall back to this minimal set:

- Stage files explicitly (never `git add -A` / `git add .`)
- `--no-ff` merges on all feature branches

## Step 8: Write the synthetic wave spec

The orchestrator expects a spec file to parse. Because a wave cherry-picks across multiple specs, we synthesize one.

Write to `/tmp/wave-<N>-<YYYYMMDD-HHMMSS>.md` with this shape:

```markdown
# Wave <N> — Synthetic spec (from docs/plan.md)

**Generated:** <timestamp>
**Source:** <plan.md path>
**Source specs referenced:**
- <spec path 1>
- <spec path 2>
...

## Context

<verbatim text from plan.md's Wave <N> heading block — the "**Why this wave:**" line>

## Goals

<for each wave item, one line summarizing the vertical + cherry-picked tasks>

## Remediation Plan

<for each cherry-picked task, in the order plan.md listed them:>

### Task <seq> — <original task ID> from <spec file>

**Files:** <from spec>
**Depends on:** <from spec, or "Nothing">

<full task body, verbatim from the spec>

**Verify:**
<verbatim Verify block from the spec, or "No Verify block in source spec — orchestrator must decide how to verify" if missing>

---

## Wave <N> Exit Gate

<verbatim text from plan.md exit gate line/block>

## Operating Rules

<verbatim bullets from Step 7>

## Human-only TODOs (do NOT attempt — surface in final summary)

<list from Step 5's human-only flags, or "None identified" if empty>

---

## Final Summary Requirements (MANDATORY file output)

After all tasks commit and the Exit Gate runs, you MUST write a summary file to:

**`docs/<YYYY-MM-DD>-<project>-wave<N>-summary.md`** (inside the worktree)

Where `<project>` is the repo basename (e.g. "gobot"). Example: `docs/2026-04-18-gobot-wave2-summary.md`.

The summary file MUST contain these sections (downstream close/merge tooling parses them):

1. **§Shipped** — table of commits: `| # | Commit | Task | Vertical | Description |`
2. **§Wave <N> Exit Gate Results** — item-by-item pass/fail/DEFERRED with evidence
3. **§Human-only TODOs** — verbatim list of items NOT attempted, with enough context for a human to execute each
4. **§Open Questions — answered, deferred, or unchanged** — note which spec OQ items this work resolved (with commit refs), which were deferred, and which are untouched
5. **§KB upsert suggestions** — if any task touched cron/MCP/schema/infra/data-flow, list the facts to upsert
6. **§Deviations from spec** — any scope changes, stale line numbers corrected, tasks expanded or narrowed, and why
7. **Baseline <metric>** — before/after numbers for tsc error count (or equivalent project quality signal), matching the Exit Gate's claims

Verbal-only reports break the handoff to close/merge tooling. Write the file.

---

The synthetic spec below (the `/tmp/wave-<N>-<ts>.md` file) is ephemeral — it lives in `/tmp` so it's accessible from any worktree but doesn't pollute the repo. The mandatory summary file above is the durable artifact.

## Step 9: Confirm before dispatch

Show the user a summary. Include a **Heads-up** section if any header/sub-bullet divergences or unresolved pre-implementation decisions were flagged — these are cases where the user should eyeball the scope before dispatching.

> **Ready to dispatch Wave <N>:**
>
> - Wave items: <count>
> - Total cherry-picked tasks: <count>
> - Specs referenced: <list>
> - Exit gate: <one-line summary>
> - Human-only TODOs flagged: <count> (manual ops) + <count> (pre-implementation decisions)
> - Synthetic spec: `/tmp/wave-<N>-<timestamp>.md`
>
> **Heads-up (if applicable):**
> - **Header/sub-bullet divergence:** <for each item with divergence, name the header scope vs sub-bullet scope>. Sub-bullets are authoritative per convention, but confirm this matches your intent.
> - **Pre-implementation decisions unresolved:** <list each OQ or path-choice that the spec says blocks implementation>. Either pre-answer them now, or accept that the orchestrator will pick a safe default inline (which may not match your preference).

If pre-implementation decisions are unresolved, use `AskUserQuestion` to collect answers before proceeding to dispatch, then fold the answers into the synthetic spec's Context section.

Then use `AskUserQuestion`:

> - **Dispatch** — run the orchestrator in an isolated worktree now
> - **Show me the synthetic spec first** — print it for review before dispatching
> - **Cancel** — don't dispatch

If "show me the spec first", print the file and re-ask.

## Step 10: Dispatch the orchestrator

Invoke the Agent tool with:

- `subagent_type: "orchestrator"`
- `isolation: "worktree"` — creates an isolated working copy so commits don't touch the main checkout
- `description: "Wave <N> orchestration"`
- `prompt:` a brief that tells the orchestrator:
  1. It is executing Wave <N> from a synthetic spec at `/tmp/wave-<N>-<timestamp>.md` (read that file)
  2. The full synthetic spec content, inlined in the prompt (so the orchestrator doesn't depend on reading from `/tmp` if the worktree sandbox blocks it)
  3. After all tasks commit, run the Exit Gate section verbatim and include results in the final summary
  4. Surface Human-only TODOs in the final summary; do NOT attempt them
  5. Respect the Operating Rules section — especially protected-path separation (live worktrees, protected branches)
  6. Final report must include: commits per task, exit gate results (pass/fail per check), human-only TODOs still open, any deviations from spec and why

Example prompt shape:

```
Execute Wave <N> from docs/plan.md. Synthetic spec at /tmp/wave-<N>-<timestamp>.md
and reproduced in full below. Follow your normal flow (parse → route → dispatch
→ verify → /commit per task).

<entire synthetic spec content>

After all tasks commit, run the "Wave <N> Exit Gate" section above verbatim
and include the results in your final summary. Do NOT merge, do NOT edit
plan.md state on master — commits land in the worktree and the human decides
whether to merge.

Human-only TODOs listed at the end of the synthetic spec are NOT tasks for
you — surface them in the final summary as open items for the human.

MANDATORY file output: write the summary to docs/<YYYY-MM-DD>-<project>-wave<N>-summary.md
inside the worktree, with the sections specified in the synthetic spec's "Final
Summary Requirements" block. Verbal-only reports break the handoff to downstream
merge/close tooling.

Cross-repo awareness: if any task touches a file that is a symlink reaching
outside this repo (e.g. src/lib/*-constants.ts symlinked to a sibling-service
repo's source), verify the symlink target's owning repo is clean before
considering the task "shipped". If the target has uncommitted changes, flag
this in the §Deviations section of the summary with the exact sibling repo
path and a commit-first recommendation. Standard pre-merge checks (tsc, secret
scan, git status in this repo) do NOT catch cross-repo dirty state.

Report back with: commits per task, exit gate results, human-only TODOs,
deviations, cross-repo flags (if any), and the worktree path + branch name.
```

## Step 11: Report back

When the orchestrator returns, pass the result through to the user with a minimal frame:

> **Wave <N> dispatched.**
>
> <orchestrator's summary section, verbatim>
>
> **Next:**
> - Inspect: `cd <worktree-path>` and review the diff
> - Verify the summary file exists at `<worktree>/docs/<YYYY-MM-DD>-<project>-wave<N>-summary.md` — if missing, ask the orchestrator to write it before closing (downstream tooling expects it)
> - Close/merge: run the project's wave-closure skill if present (e.g. gobot's `/close-wave <N>`), or fall back to:
>   ```
>   cd <main-checkout>
>   git merge --no-ff <branch> -m "Wave <N>: <summary>"
>   # verify exit gate on master
>   # edit plan.md + specs as needed (unless orchestrator's /commit already did)
>   # git worktree remove <worktree-path>
>   ```
>
> **Human-only TODOs still open:** <list, or "none">
> **Cross-repo flags:** <any symlink-to-sibling-repo dirty-state warnings from the orchestrator's deviations section, or "none">

If the orchestrator's report is missing the summary file (it returned verbally but didn't write the docs/ file), note this as a known gap and offer to write the summary file yourself from the inline report + worktree git log. Downstream close/merge skills will likely refuse to proceed without it.

If the orchestrator made no commits (worktree auto-cleaned), surface the reason: exit gate failed before any task could commit, a task's verify failed twice, or the scope was already done.

## Rules

1. **`/run-wave` is read-only with respect to master.** It does not merge, does not tick off plan.md on master, does not edit spec checklists on master. All changes land in the worktree. `/merge-wave` is the separate step that promotes them.

2. **Cherry-picked scope is load-bearing.** plan.md may say "V11 Task 1 + Task 2" while Tasks 3–4 belong to a later wave. Execute only what each bullet enumerates. Don't run the full linked spec. This is the main reason the skill exists — the orchestrator alone can't tell what's in-scope for the wave vs out-of-scope.

3. **Stop rather than guess.** If plan.md is missing, the wave doesn't exist, a bullet has no spec link, or a cherry-picked task ID isn't in its spec, stop and report. Guessing wastes an orchestrator run and corrupts the plan.

4. **Human-only TODOs stay as TODOs.** Dashboard actions, key rotations, live DB migrations, OAuth flows, "paste from admin UI" — the orchestrator does the code-side work and leaves the manual step in the summary. Never attempt them.

5. **Always dispatch in a worktree.** Pass `isolation: "worktree"` to the Agent tool. A wave is a multi-commit batch; the worktree gives a clean rollback path if the orchestrator misreads the spec or the exit gate fails.

6. **Surface protected paths in the prompt.** If plan.md §Operating Rules names a protected path (`/services/<project>` for live deployments, `playground-live` branches), include those prohibitions verbatim in the orchestrator prompt. The orchestrator doesn't read plan.md on its own.

7. **One wave per dispatch.** Don't combine "run Wave 1 and Wave 2" — the human checkpoint between waves is the whole point. If the user wants both, they run the skill twice.

8. **Sub-bullets are authoritative scope, not headers.** When a wave item's header names a narrower scope than the sub-bullets enumerate (e.g. header "Phase 1" but sub-bullets list Phases 1+2+3), the sub-bullets win. The header is a short label; the sub-bullets are the contract. Surface the divergence in Step 9 confirmation so the user can eyeball it, but do not add a "header wins" override. See the memory file `feedback_plan_md_sub_bullets_win.md` in the harness memory store for the convention's provenance.

9. **Mandate summary file output.** The orchestrator MUST write a summary to `docs/<YYYY-MM-DD>-<project>-wave<N>-summary.md` in the worktree — not just return verbally. Downstream close/merge tooling (e.g. gobot's `/close-wave`) expects this file with specific sections. Verbal-only breaks the handoff.

10. **Cross-repo symlink awareness.** If the repo has source files that are symlinks into sibling-project repos (`src/lib/*-constants.ts` → `/services/<sibling>/...` is a common pattern), the orchestrator must verify symlink targets are clean in their owning repo before marking dependent tasks "shipped". Standard in-repo checks don't catch this. Flag in the summary's §Deviations section if found.
