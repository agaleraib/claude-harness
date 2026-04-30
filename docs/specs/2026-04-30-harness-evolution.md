# Harness Evolution — Cross-repo visibility, lean plan.md, wave-as-PR, Linear pilot

**Status:** Draft (roadmap spec — each wave gets its own detail spec)
**Date:** 2026-04-30
**Driver:** Two competing Codex plans (Linear-centered Codex-native vs central registry + adapters) reviewed in session. This spec extracts the shippable cherry-pick and rejects the over-reach.

---

## 0. Doctrine — protocol-first, adapters-second

Per `feedback_protocol_first_doctrine.md`. The harness must be operable with **git + editor + shell + docs** alone. Agents accelerate the protocol; they don't define it.

**Protocol (durable, tool-neutral) — every consumer repo:**

| Artifact | Purpose |
|---|---|
| `AGENTS.md` | Generic agent instructions (any LLM, any framework) — what to do, what to avoid, where state lives |
| `WORKFLOW.md` | Workflow contract — command-form matrix (Manual / Claude / Codex / Automation) for every command in the repo |
| `docs/specs/` | What to build and why |
| `docs/plan.md` | Active board (Now / Next / Blocked / Recently Shipped) |
| `docs/waves/` | Shipped wave summaries |
| `.harness-state/` | Receipts/logs (machine-readable) |
| `criteria/` | Quality bar |
| `parking_lot.md` | Deferred work |

**Adapters (replaceable frontends):**

| Adapter | Location |
|---|---|
| Claude Code skills | `.claude/skills/` (symlinked from harness) |
| Codex prompts | `.codex/prompts/` (when needed, not built upfront) |
| Cross-repo registry | `~/.harness/projects.yml` (meta, also an adapter) |
| GitHub automation | `.github/workflows/` (existing) |
| Linear sync | wordwideAI only (Wave 4 pilot) |

**Two distinct portability properties** (do not conflate):
- **Tool-neutral** — readable/executable by any LLM or framework. AGENTS.md provides this.
- **Human-executable** — a human with `git + editor + gh` can carry out the workflow without an LLM. WORKFLOW.md's Manual column provides this.

The doctrine requires BOTH. Protocol files MUST satisfy human-executable; adapters MAY accelerate but MUST NOT own protocol-level state.

**The 5-question test** — a new person OR a different LLM should be able to open the repo and answer, without the original Claude/Codex session:
1. What is active? → `docs/plan.md ## Now`
2. What is blocked? → `docs/plan.md ## Blocked`
3. What was shipped? → `docs/waves/`
4. What verifies this? → spec exit gate + `.harness-state/` receipt
5. What do I do next? → `WORKFLOW.md` ladder

If any answer requires a Claude or Codex session, the harness has lock-in and the wave that introduced it is non-compliant.

## 1. Goal

Evolve the claude-harness from per-repo solo workflow to multi-repo solo workflow without:
- replacing existing skills (`/spec-planner`, `/planning-loop`, `/run-wave`, `/close-wave`, `/commit`, `/triage-parking`, `/apply-anthropic-reviews`)
- adding automation that fires without user trigger
- committing to Linear or a daemon before piloting

Claude Code stays primary. `/codex` invoked when warranted (review, adversarial passes, second-opinion).

## 2. Non-goals

- **Codex-native commands** (`/spec-writer`, `/run-issue`, `/accept-issue`). They rename existing skills without adding capability and force a migration. Wrap existing skills with Linear-aware behavior gated on `.harness-profile.tracker: linear` instead.
- **Top-level `protocol/` + `adapters/` directory split.** YAGNI for solo as a *directory* rearrangement. The *role* split (protocol files vs adapter files) IS in scope and lives in WORKFLOW.md — see §0.
- **Symphony-like daemon.** Both Codex plans agree; per `project_symphony_evaluation`.
- **Automated plan.md maintenance** as a hook or routine. Manual `/archive-plan` only.
- **9-state Linear workflow.** Ceremony bloat per `feedback_codex_walks_back_friction_reducers`. Use the minimum states the pilot needs.

## 3. Sources of truth (lifted from Plan 1)

| Concern | Source of truth |
|---|---|
| Cross-repo backlog/attention | `~/.harness/projects.yml` registry (new) |
| Active wave board (per repo) | `docs/plan.md` — Now / Next / Blocked / Recently Shipped (new format) |
| Technical spec | `docs/specs/YYYY-MM-DD-<topic>.md` (unchanged) |
| Implementation | git branch / PR (unchanged) |
| Wave receipts | `docs/waves/YYYY-MM-DD-waveN-summary.md` (new — moved out of plan.md) |
| Machine state | `.harness-state/` (unchanged) |
| Optional global queue | Linear (pilot only, one repo) |

## 4. Wave sequence

Six waves, each independently shippable. Stop after any wave if the next isn't paying for itself.

Each wave declares: **Deliverable / Manual fallback / Exit gate / Updates WORKFLOW.md?** Per `feedback_command_vs_wave_scope.md`, the per-command Manual/Claude/Codex/Automation matrix lives in WORKFLOW.md, not duplicated per wave.

### Wave 0 — `AGENTS.md` + `WORKFLOW.md` baseline + spec-skill protocol-alignment (~4 days)

**Spec:** `docs/specs/2026-05-01-protocol-baseline.md` (TBD)

**Deliverable A — Protocol files + profile flag (per consumer repo):**
- `AGENTS.md` (~40 lines) — what any agent must do/avoid, where state lives, how to discover specs/plan/waves
- `WORKFLOW.md` (~60 lines) — command matrix:
- `.harness-profile` gains top-level `protocol_baseline: true` (set after AGENTS.md+WORKFLOW.md exist; gates Wave 3's `/run-wave` Step 0 preflight). Owned by `/project-init` per `project_harness_profile_owner`; Wave 0's repo-level fix script appends the flag once. If the profile is regenerated post-Wave-0 by `/project-init`, the flag must persist (project-init schema docs add it as a recognized field — Task 4 documentation work in `/spec-planner` rules covers this).

```markdown
# Workflow

## Commands

| Command | Manual | Claude | Codex | Automation |
| --- | --- | --- | --- | --- |
| Spec a wave | edit docs/specs/YYYY-MM-DD-<topic>.md | /spec-planner | /spec-writer (deferred) | none |
| Run a wave | git worktree add → branch → implement → push | /run-wave | (deferred) | none |
| Close a wave | merge → write docs/waves/ → tick plan.md | /close-wave | (deferred) | none |
| Commit | git add → git commit | /commit | (deferred) | none |
| Triage parking lot | edit parking_lot.md | /triage-parking | (deferred) | none |
| Archive plan.md | cut closed wave block → paste to docs/waves/ → replace with one-liner | /archive-plan (Wave 2.5) | (deferred) | none |
| Status across repos | run `git status` per repo by hand | /harness-status (Wave 1) | (deferred) | none |
```

**Deliverable B — Spec-author skill refinements:**

`/spec-planner` (`.claude/agents/spec-planner.md`):
- §"Implementation Plan (Sprint Contracts)": each task gains a **Manual fallback** sub-bullet (one line: what a human does with `git + editor + gh` if the adapter doesn't exist). Mandatory.
- §"Spec Generation Rules": new rule — if the spec adds a user-facing command, the spec MUST include a WORKFLOW.md command-matrix row delta.
- §"Recommended Implementation": skills list stays; flag adapters as replaceable, not load-bearing.
- Spec output gains a portability self-check: every task answerable by the 5-question test (§0) using only protocol files.

`/planning-loop` (`skills/planning-loop/SKILL.md`):
- Codex review prompt: add portability criterion — "verify each task has a Manual fallback executable with git+editor+gh; flag specs that hard-require a specific LLM tool name as the only execution path."
- Auto-apply preflight: reject specs adding commands without an accompanying WORKFLOW.md row delta.

**Per-repo independent shipping:** Wave 0 work is split into one tracked wave per consumer repo (claude-harness in this repo's plan.md; wordwideAI + gobot tracked in their own plan.mds when next opened). Spec-skill refinements (Deliverable B) ship in claude-harness only, since that's where the skills live. Wave 0 is "complete" for spec purposes when all 3 repos have shipped their plan.md-tracked equivalent — but consumers can be opened/shipped at different times without blocking each other.

**Manual fallback:** writing AGENTS.md + WORKFLOW.md is itself the deliverable for A. For B, manual fallback is reading the doctrine and writing specs by hand that include Manual-fallback bullets — the skill changes only enforce a discipline a human could follow without them.

**Exit gate (per repo, applied independently):**
- This repo contains `AGENTS.md` + `WORKFLOW.md`
- 5-question test (§0) passes for this repo using only protocol files (recorded in `.harness-state/wave<N>-verification.md`)
- For claude-harness only: `/spec-planner` produces a spec containing per-task Manual-fallback bullets when run on a sample input
- For claude-harness only: `/planning-loop` rejects a fixture spec that lacks Manual-fallback bullets (auto-apply preflight rejects specs adding commands without WORKFLOW.md row delta — distinct code path from Codex `needs-attention` verdict; both code paths exercised by 2 separate fixtures)

**Updates WORKFLOW.md?** Yes — creates it. Every later wave that adds a command also updates this table.

### Wave 1 — Registry + `/harness-status` (~1 week)

**Spec:** `docs/specs/2026-05-04-harness-registry.md` (TBD)

**Deliverable:** `~/.harness/projects.yml` + `/harness-status` skill.

```yaml
projects:
  - id: claude-harness
    path: /Users/klorian/workspace/claude-harness
    main: master
    plan: docs/plan.md
    waves: docs/waves
    state: .harness-state
    tracker: none
  - id: wordwideAI
    path: /Users/klorian/workspace/wordwideAI
    main: master
    plan: docs/plan.md
    waves: docs/waves
    state: .harness-state
    tracker: linear        # pilot only — see Wave 4
    linear_team: WFX
  - id: gobot
    path: /Users/klorian/workspace/gobot
    main: master
    tracker: none
```

`/harness-status` — read-only scan, single command, prints per repo:
- dirty worktree (`git status --porcelain`)
- branch ahead/behind origin
- plan.md size + completed-wave count (drift signal)
- open worktrees waiting on `/close-wave`
- missing receipts (closed wave with no `docs/waves/` summary)
- parking_lot.md item count

**Manual fallback:** for each repo path in registry, run `cd <path> && git status -sb && wc -l docs/plan.md && ls .harness-state/runs/` by hand. ~30 seconds for 3 repos.

**Exit gate:** runs against all 3 repos in <5s, no false positives, never writes.

**Updates WORKFLOW.md?** Yes — adds `/harness-status` row.

### Wave 2 — plan.md format pivot (~3 days)

**Spec:** `docs/specs/2026-05-11-plan-md-format.md` (TBD)

**Deliverable:** Convert all 3 consumer repos to:

```markdown
# Plan

## Now
- [ ] Wave N — <title>
  - spec: docs/specs/YYYY-MM-DD-<topic>.md
  - status: ready | running | review
  - exit gate: <one line>

## Next
- [ ] Wave N+1 — <title>

## Blocked
- [!] Wave N+2 — waiting on <external dep>

## Recently Shipped (last 30 days)
- [x] Wave N-1 — <title> → docs/waves/YYYY-MM-DD-waveN-summary.md (<merge SHA>)
```

`/commit` checks plan.md against this shape; warns on drift, doesn't block.

**Also creates `docs/waves/` directory** (first time) and **migrates existing wave summaries** from `docs/2026-*-wave*-summary.md` to `docs/waves/YYYY-MM-DD-waveN-summary.md`, updating any plan.md references during the move.

**Manual fallback:** edit plan.md in editor, `mkdir -p docs/waves && git mv docs/2026-*-wave*-summary.md docs/waves/`, copy detail of completed waves to docs/waves/ by hand, leave one-line summary.

**Exit gate:** all 3 consumer repos converted; `docs/waves/` exists with migrated summaries; any wave older than 30 days lives in `docs/waves/`.

**Updates WORKFLOW.md?** No (no new command — drift warning lives inside existing `/commit`).

### Wave 2.5 — `/archive-plan` skill (~3 days)

**Spec:** `docs/specs/2026-05-14-archive-plan.md` (TBD)

**Deliverable:** Manual-trigger skill. Behavior:
1. Find waves matching the **archive-eligibility rules** below.
2. Extract `### Wave N — ...` block + sub-bullets.
3. Append to `docs/waves/YYYY-MM-DD-waveN-summary.md` (date from merge commit).
4. Replace block in plan.md with one-line entry under `## Recently Shipped`.
5. Prune `Recently Shipped` lines older than 30 days.

**Archive-eligibility rules** (back-compat):
- **Default (3-signal):** every checkbox ticked AND merge SHA in plan.md AND `.harness-state/wave<N>-closed.md` receipt exists.
- **Legacy (2-signal):** for waves predating the receipt convention (cutoff: receipts not enforced for waves merged before 2026-04-19), accept checkbox-complete + merge SHA. The skill emits a one-line warning per legacy wave noted in the receipt file it generates: "no .harness-state/ receipt — pre-convention wave, archived on 2-signal evidence."

No automation. May be offered as a prompt step in `/commit` if plan.md exceeds N closed waves, opt-in.

**Manual fallback:** for each closed wave in plan.md, cut block → paste to `docs/waves/YYYY-MM-DD-waveN-summary.md` → replace with `- [x] Wave N — <title> → <path> (<sha>)`. ~2 min per wave.

**Exit gate:** running against the current claude-harness plan.md (verified at spec-write time as ~173 lines / 6 closed waves, all having `.harness-state/wave<N>-closed.md` receipts on disk) leaves <40 lines and ≤1 active-wave block, all 6 completed waves moved to `docs/waves/`, idempotent on re-run.

The 2-signal legacy path is verified by a synthetic fixture (delete a receipt file in a tmp dir, confirm `/archive-plan` falls back to 2-signal with the warning emitted) — NOT against the live plan.md, since all 6 currently-closed waves predate the new convention but were retroactively fitted with receipts.

**Updates WORKFLOW.md?** Yes — adds `/archive-plan` row.

### Wave 3 — Wave-as-draft-PR + executor-skill protocol-alignment (~10 days)

**Spec:** `docs/specs/2026-05-18-wave-as-draft-pr.md` (TBD)

**Deliverable A — Draft-PR mechanic:**

`/run-wave` (`skills/run-wave/SKILL.md`) appends after orchestrator dispatch:
1. push branch (`git push -u origin <branch>`)
2. open draft PR (`gh pr create --draft --title "Wave N — <title>" --body-file <synthetic wave spec>`)
3. write PR URL + branch + wave number to `.harness-state/runs/wave-N.json`

`/close-wave` (`skills/close-wave/SKILL.md`) flips draft → ready → merge:
1. read `.harness-state/runs/wave-N.json` for PR number
2. run existing exit-gate verification on the PR's branch (not local master)
3. `gh pr ready <PR>` then `gh pr merge --merge <PR>` (preserves `--no-ff` semantics via `--merge`)
4. existing post-merge sequence (tick plan.md, write receipt, push)

Highest-ROI Symphony pattern per `project_symphony_evaluation`. Closes: `feedback_close_wave_runtime_gotchas`, large-implementation cap, in-flight visibility (the draft PR list IS the dashboard).

**Deliverable B — Executor-skill protocol-alignment:**

`/run-wave` Step 0 preflight (gated on `.harness-profile.protocol_baseline: true` so it doesn't break repos pre-Wave-0):
- Fail-fast if `AGENTS.md` missing
- Fail-fast if `WORKFLOW.md` missing
- Warn (don't block) if the wave's spec lists `Updates WORKFLOW.md? yes` but no WORKFLOW.md diff is staged in the worktree
- Orchestrator prompt addendum: "Do not introduce Claude-specific state outside `.claude/`. Manual fallback for each task must remain executable."

`/close-wave` Step 0 state-probe addition:
- If wave's spec lists `Updates WORKFLOW.md? yes`, verify the WORKFLOW.md diff is in the merge tree before merging; abort with operator message if missing
- Receipt template (Step 12): add line "Manual fallback verified: <yes|n/a>"

**Manual fallback (whole wave):**
- Draft-PR mechanic: `git push -u origin <branch> && gh pr create --draft --title "Wave N — <title>" --body-file docs/specs/<spec>.md`. ~30 seconds. Then `gh pr ready <N> && gh pr merge --merge <N>` to close. Documented in WORKFLOW.md row update.
- Skill preflight: read AGENTS.md/WORKFLOW.md by hand before running a wave; check WORKFLOW.md diff is staged before merging. The skill changes only enforce a discipline a human could follow without them.

**Exit gate:**
- Stack 3 waves in flight on one repo without losing track
- `gh pr list --draft` is the status surface
- `/run-wave` against a repo missing AGENTS.md fails clearly with remediation message
- `/close-wave` against a wave that should have updated WORKFLOW.md but didn't is blocked

**Updates WORKFLOW.md?** Yes — updates `/run-wave` and `/close-wave` rows (new behavior, same commands).

### Wave 4 — Linear pilot on wordwideAI only (~2 weeks observation)

**Spec:** `docs/specs/2026-05-25-linear-pilot.md` (TBD — written after Wave 3 ships)

Per `project_linear_tracker_reconsideration`: pilot on **one** repo, decide after.

**Deliverable:**
- Linear issue ID embedded in branch name + commit trailer + PR title (wordwideAI only)
- Existing `/spec-planner` reads issue body when invoked with `LIN-XXX`
- State transitions are manual via Linear UI or one-line `gh` wrapper — no new skill
- States used in pilot: `Backlog → Spec Ready → Running → PR Open → Done`. Five states, not nine.

**Manual fallback (per deliverable):**
- Linear ID in branch/commit/PR: `git checkout -b LIN-123-<slug>`, `git commit -m "... LIN-123"`, `gh pr create --title "LIN-123: <title>"` — pure git/gh, no skill needed.
- `/spec-planner` reading LIN-XXX: open issue in browser, copy body into spec under §"Linear issue context", run `/spec-planner` on the resulting blob (or write the spec by hand). The skill change only saves the copy-paste step.
- State transitions: Linear web UI directly (the pilot uses no automation here by design).

**Exit gate (decision, not deliverable):** after 2 weeks of pilot use, decide:
- promote to other repos (build `/run-issue`-style wrappers around existing skills)
- stay manual (Linear is just a queue)
- abandon (plan.md was enough)

**Updates WORKFLOW.md?** Yes — wordwideAI's WORKFLOW.md gets a `tracker: linear` block documenting the issue-ID convention.

## 5. What survives unchanged (names + core semantics)

No rename, no move. Wave 0 and Wave 3 add protocol-alignment behavior INSIDE these skills; they remain the same commands with the same primary purpose.

- `/spec-planner` — wave-aware spec writer (Wave 0 adds Manual-fallback enforcement)
- `/planning-loop` — adversarial review loop with auto-apply (Wave 0 adds portability criterion)
- `/run-wave` — orchestrator dispatch (Wave 3 adds draft-PR step + Step 0 preflight)
- `/close-wave` — merge + plan.md tick + receipt (Wave 3 adds draft→ready→merge + WORKFLOW.md diff check)
- `/commit` — staged-change review + parking lot triage
- `/triage-parking` — parking lot sweep
- `/apply-anthropic-reviews` — APPLY-verdict implementer
- `/code-reviewer` — adversarial review agent

## 6. Risk register

| Risk | Mitigation |
|---|---|
| Registry duplicates state already in `.harness-profile` (it IS a source-of-truth per §3) | Schema constraint: registry rows MUST NOT embed config values, only point to per-repo `.harness-profile` paths. Wave 1 schema validation enforces; if a row carries any field other than `id/path/main/plan/specs/waves/state/adapter/tracker/linear_team/quality_gate`, validator rejects. Discipline alone is insufficient — encode in schema. |
| `/archive-plan` deletes in-progress waves it misclassifies | Default 3-signal gate (checkbox-complete + merge SHA + `.harness-state/` receipt); 2-signal legacy fallback only for waves merged before 2026-04-19; receipt file emitted by `/archive-plan` flags any 2-signal archives explicitly. |
| Wave-as-draft-PR doesn't generalize to wordwideAI co-vibe protocol | Solo-only first; co-vibe interaction parked, not designed in. |
| Linear pilot leaks Linear-specific patterns into core skills | Pilot wraps via `.harness-profile.tracker: linear` flag; core skills stay tracker-agnostic. |
| 3 setup-harness copies on disk drift further (`project_harness_propagation_gap`) | Out of scope — separate `sync-harness` skill, parked. |
| User hits "harness too intrusive" again (`feedback_harness_too_intrusive`) | Every new command is manual trigger; zero hooks; zero cron; opt-in via profile flags. |
| Wave 3: `gh pr ready` succeeds but `gh pr merge` fails (branch protection / merge conflict / auth) | `/close-wave` Step 11 (final gate) re-queries `gh pr view <N> --json state,mergedAt` after the merge attempt; if `state != MERGED`, abort the receipt and emit operator instructions. Rollback: `gh pr ready --undo` is unavailable; manual `gh api -X PATCH /repos/.../pulls/<N> -f draft=true` documented in WORKFLOW.md row update. |

## 7. Open questions

1. **Registry path** — `~/.harness/projects.yml` (Plan 2) or `~/.config/harness/projects.yml` (XDG)? Default to former unless XDG matters.
2. **`/archive-plan` opt-in via `/commit`** — should `/commit` offer to run it when plan.md has >N closed waves? If yes, what's N? Default proposal: prompt only when >5 closed waves AND user invoked `/commit` after `/close-wave`.
3. **wave-as-draft-PR for wordwideAI** — does the co-vibe protocol's "playground-live" gate change the merge step? Defer to Wave 3 spec.
4. **Linear states** — confirm 5-state pilot (`Backlog / Spec Ready / Running / PR Open / Done`) before Wave 4; user may want a Spec Review state.

## 7.1 Resolved decisions (Wave 0 prerequisites)

- **AGENTS.md vs CLAUDE.md** — RESOLVED. AGENTS.md is the tool-neutral primary (any LLM, any framework). CLAUDE.md remains for Claude-Code-specific instructions Claude Code reads natively at session start; it becomes a thin file that points at AGENTS.md for the protocol contract and adds Claude-specific overrides only when needed. Wave 0 deliverable A includes a one-line CLAUDE.md update: `> Tool-neutral protocol lives in AGENTS.md. Claude-specific overrides below.` Both files coexist; neither replaces the other.

## 8. Verify (per wave, summarized)

| Wave | Verification |
|---|---|
| 0 — protocol baseline + spec-skill alignment | (per repo) (a) `test -f AGENTS.md && test -f WORKFLOW.md`; (b) 5-question test recorded in `.harness-state/wave<N>-verification.md`; (c, claude-harness only) `/spec-planner` produces spec with per-task Manual-fallback bullets on sample input; (d, claude-harness only) `/planning-loop` rejects fixture spec missing Manual-fallback (Codex-prompt path) AND auto-apply preflight rejects fixture spec adding command without WORKFLOW.md row delta (preflight path) — 2 distinct fixtures |
| 1 — registry | `/harness-status` runs against 3 real repos; matches manual `git status` ground truth |
| 2 — plan.md format | All 3 consumer repos converted; `docs/waves/` exists per repo; existing `docs/2026-*-wave*-summary.md` files migrated; `/commit` warns on drift |
| 2.5 — `/archive-plan` | Idempotent; archives only 3-signal-confirmed waves (default) or 2-signal legacy waves with explicit warning; reduces claude-harness plan.md from ~173 to <40 lines |
| 3 — wave-as-PR + executor-skill alignment | (a) `gh pr list --draft` shows 3+ stacked waves; (b) `/run-wave` against repo missing AGENTS.md fails clearly; (c) `/close-wave` blocks merge when WORKFLOW.md update is missing; (d) Step 11 final gate verifies `gh pr view <N>` reports `state=MERGED` before writing receipt |
| 4 — Linear pilot | 2-week observation; decision logged BOTH in `project_linear_tracker_reconsideration` memory AND `docs/waves/2026-XX-XX-wave4-decision.md` (in-repo proof) |

## 9. Sequence summary

```
Wave 0 (AGENTS.md + WORKFLOW.md baseline + /spec-planner & /planning-loop alignment)
  └─ unblocks: tool-neutral protocol exists; spec authoring enforces Manual fallback
Wave 1 (registry + status)
  └─ unblocks: cross-repo visibility
Wave 2 (plan.md format)
  └─ unblocks: lean board enforcement
Wave 2.5 (/archive-plan)
  └─ unblocks: keeping the lean format lean
Wave 3 (wave-as-draft-PR + /run-wave & /close-wave alignment)
  └─ unblocks: in-flight concurrency without daemon; executor skills enforce protocol
Wave 4 (Linear pilot, wordwideAI only)
  └─ decides: tracker centralization yes/no
```

Stop and reassess after each wave. The plan is written to be abandonable mid-stream.
