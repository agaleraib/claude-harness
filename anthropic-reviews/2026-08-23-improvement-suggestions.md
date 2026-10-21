# Anthropic Review — 2026-08-23

Reviewer notes: this run covers Anthropic posts published between 2026-05-10 (the most recent tracker date before this run — a ~3.5-month gap) and 2026-08-23. The Anthropic-owned domains (`anthropic.com`, `claude.com`, `alignment.anthropic.com`, `red.anthropic.com`) are blocked at this session's egress proxy, so post *content* was extracted from Web Search snippets rather than fetched directly; URLs cited below all appear as real hits in search results — none are fabricated. Two allow-listed sources supplied verifiable primary text: the Claude Code changelog via `code.claude.com` and the Claude Platform release notes via `platform.claude.com`. That coverage is enough for the triage below, but a maintainer applying any § should re-fetch the source post itself (from a network that permits `claude.com`/`anthropic.com`) before acting on the "Verify before applying" line.

Cap: 15 posts. All 15 are logged in the tracker. Seven produced numbered §s; eight are skipped with reasons.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Context-engineering rules for Claude 5 — audit harness prose against the "6 shifts" | spec | Touches AGENTS.md + CLAUDE.md + every SKILL.md; needs a design pass, not a diff |
| 2 | Steering Claude Code — cite as canonical taxonomy in AGENTS.md | apply | One-line citation reinforces the existing convention; near-zero risk |
| 3 | "How we use skills" — add Gotchas sections to SKILL.md files | defer | Nice-to-have; the harness's skills are already terse and single-purpose |
| 4 | Building verification loops — auto-trigger the existing `*-check` skills | defer | Speculative until the maintainer sees repeated cases where a verify skill should have run |
| 5 | Maximizing sessions — surface the six-tip checklist inside session-start | apply | The tips (/clear, model+effort early, @-mention, /context, /compact) already fit the harness's session-open ritual |
| 6 | How we contain Claude — bookkeeping only; sandcastle already tracks the containment surface | defer | Harness doesn't ship a sandbox layer; reference already exists in `sandcastle_mattpocock_architecture.md` |
| 7 | Model refresh cluster (Opus 4.8 · Fable 5 · Sonnet 5 · Opus 5) — leave `.harness-profile` pin at Opus 4.7 unless a real driver appears | defer | Opus 4.7 still supported; earlier tracker rows already established pin-stability as the default |

Verdict counts: **2 apply · 4 defer · 0 reject · 1 spec.**

---

## 1. Context-engineering rules for Claude 5 — audit harness prose against the "6 shifts"

**Source:** *The new rules of context engineering for Claude 5 generation models* — https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models (Thariq Shihipar, Anthropic; published 2026-07-24, same day Opus 5 shipped).

**What the post says.** Anthropic removed >80% of Claude Code's system prompt for the Claude 5 generation (Opus 5, Fable 5, Sonnet 5) with **no measurable loss on internal coding evaluations**. The post names six shifts in how they now engineer *context* (a discipline distinct from prompt engineering: context is assembled from system prompts, skills, memory, and other sources and reused across many requests). Reported thrust: "stop micromanaging the model, start curating what it sees. Give it judgment instead of rules. Load context progressively, when needed, rather than everything upfront." The post is paired with a `claude doctor` right-sizing command.

**Why this matters for the harness.** The repo's README already stakes out this position — the "Why Not Superpowers / Heavy Skill Systems?" section (README.md:23) cites the April 23 postmortem and the AGENTbench negative-ROI finding. This new post is Anthropic's own first-party statement of the same thesis for the Claude 5 family — and it lands on a harness whose largest SKILL.md files run 675–719 lines (planning-loop:719, close-wave:675, skill-creator:488). Whether those are "instructions for how to think" (bad by the new rules) or "checklists of what to check against" (still fine — the README's own framing) is exactly the kind of judgment call the post's six-shifts framework is built to make.

**Concrete changes.** None yet — this is why the recommendation is `spec`, not `apply`:

- Fetch the actual post and enumerate the six shifts verbatim (search snippets summarise but don't quote them all).
- For each shift, audit AGENTS.md, CLAUDE.md, and each SKILL.md against it — the audit is the deliverable, not a diff.
- Some skills are legitimately long because they encode multi-step verification checklists (`deploy-check`, `close-wave`) and match the README's "WHAT to check against" framing — those may be exempt. Others (large `planning-loop`, `skill-creator`) may cross into "HOW to think" territory and are the primary rewrite candidates.
- Consider whether the harness should install and lean on `claude doctor` as part of `setup-harness` — if the command right-sizes CLAUDE.md and skills for the consumer project, it composes with the harness's model-pin philosophy.

**Expected payoff.** If Anthropic's own 80%-cut finding replicates on the Claude 5 family, over-prescriptive skills either become a no-op or actively hurt. The harness's philosophy already anticipates this; the spec makes it durable and turns the anticipation into a diff.

scope: speculative — the harness targets Opus 4.7 today; the six shifts are tuned for the Claude 5 generation. The audit only pays out if the maintainer plans to move (or dual-track) to Claude 5.

**Verify before applying:** re-fetch https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models on a network that permits `claude.com`, quote the six shifts verbatim into the spec, and cross-check them against `wc -l skills/*/SKILL.md` output — if the mean skill length has already dropped since 2026-08-23, the audit may already be moot.

**Recommended verdict:** spec — six-shift audit is a design pass across ~25 files, not a mechanical edit.
**Status:** PENDING — awaiting triage in PR review

---

## 2. Steering Claude Code — cite as canonical taxonomy in AGENTS.md

**Source:** *Steering Claude Code: when to use CLAUDE.md, skills, hooks, and subagents* — https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more (published 2026-06-18).

**What the post says.** Enumerates seven mechanisms for instructing Claude Code's behavior: CLAUDE.md files, rules, skills, subagents, hooks, output styles, and appending the system prompt. Subagents are markdown files in `.claude/agents/` with YAML frontmatter (`name`, `description`, plus optional `model` and tool access) whose body becomes the subagent's system prompt; a subagent runs in its own fresh context window and only its final message + metadata returns to the main session.

**Why this matters for the harness.** The harness already uses six of the seven mechanisms (CLAUDE.md, skills at `skills/*/SKILL.md`, subagents at `.claude/agents/`, hooks in `settings.json`, and per-agent system prompts). AGENTS.md is the tool-neutral protocol contract; it currently doesn't cite Anthropic's own naming for the taxonomy it inherits. A one-line citation both credits the source and gives future contributors an outside anchor when a boundary question comes up ("is X a skill or a subagent?").

**Concrete changes.**

Append to AGENTS.md's `## What this repo is` (line 5) or as a new one-line footer under `## What to avoid`:

```markdown
For the mechanism taxonomy this repo composes on top of (CLAUDE.md · rules · skills · subagents · hooks · output styles · system-prompt append), see Anthropic's canonical framing: https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more (2026-06-18).
```

Only cite; do not restructure. The harness's existing conventions (skills as folders with SKILL.md + YAML frontmatter, subagents in `.claude/agents/`, hooks in settings.json) already match Anthropic's naming — the citation reinforces alignment rather than announcing a change.

**Expected payoff.** A ~150-byte AGENTS.md diff. Next time a contributor asks "should this be a skill or a subagent?", the answer is one hyperlink away.

**Verify before applying:** confirm the post URL still resolves (a Web Search hit for "Steering Claude Code" pointing to this exact `claude.com/blog/steering-claude-code-...` slug), and check that AGENTS.md doesn't already cite it — a `grep -n "steering-claude-code" AGENTS.md` should return no hits at apply time.

**Recommended verdict:** apply — one-line citation, no risk, reinforces existing convention.
**Status:** PENDING — awaiting triage in PR review

---

## 3. "How we use skills" — add Gotchas sections to SKILL.md files

**Source:** *Lessons from building Claude Code: How we use skills* — https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills (attributed to Thariq Shihipar; published 2026-06-21).

**What the post says.** After cataloging Anthropic's internal skills, they cluster into **nine categories**, and the best skills fit cleanly into one category rather than straddling several. Two operational rules stand out: the highest-signal content in any skill is the **Gotchas section**, built from common failure points Claude hits when using the skill; and skills are **folders**, not "just markdown files" — the folder may include scripts, assets, and data the agent can discover, explore, and manipulate.

**Why this matters for the harness.** A grep of all 25 SKILL.md files returned **zero `## Gotchas` sections** (checked via `Grep pattern="## Gotchas|### Gotchas|Gotchas" path=skills` — no files found). Skills are already correctly shaped as folders (verified: `skills/_shared/loop/`, `skills/skill-creator/references/`, etc. exist), and skills are already named `SKILL.md` (verified: 25 hits from `find skills -name SKILL.md`), so the folder-vs-file distinction is a no-op. The **only** actionable item is Gotchas.

**Concrete changes.** For each SKILL.md whose author has hit a real failure mode more than once, append:

```markdown
## Gotchas

- <symptom> → <cause> → <fix>
- <symptom> → <cause> → <fix>
```

Do NOT retrofit hypothetical gotchas from imagined failures — that adds bloat without the signal the post is describing. The signal comes from *actual* failures caught in review, in receipts, or in the parking lot.

Candidate skills likely to have real gotchas (based on file size and complexity, not verified against actual failures):
- `planning-loop` (719 lines) — has been through multiple wave-level bug fixes recently (Waves 22–25 per `git log`)
- `close-wave` (675 lines) — merge/finalize logic
- `skill-creator` (488 lines) — meta-skill
- `run-wave`, `run-loop` — orchestrator dispatch

Skip the trivial ones (park, micro, commit) unless a real gotcha has surfaced.

**Expected payoff.** Turns each skill from "here's how" into "here's how, and here's what NOT to do." Low-cost, high-signal — but only if the gotchas are *real*, which is why this is a defer, not an apply.

**Verify before applying:** `grep -rn "^## Gotchas" skills/ | wc -l` should still return 0 at apply time (otherwise someone already started); `git log --grep=gotcha --all --oneline` may surface prior discussion of this pattern.

**Recommended verdict:** defer — the shape is right; wait for real failure-mode signal before appending Gotchas sections to skills that don't need them.
**Status:** PENDING — awaiting triage in PR review

---

## 4. Building verification loops — auto-trigger the existing `*-check` skills

**Source:** *Building verification loops in Claude Code with skills* — https://claude.com/blog/building-verification-loops-in-claude-code-with-skills (published 2026-07-22).

**What the post says.** A verification loop is a repeating cycle where an agent runs tests, linters, or custom checks, and fixes what fails before moving on. Encode verification *as a skill*, and the loop starts closing itself: Claude already reads deterministic signals from the codebase (type checkers, linters, test runners, runtime errors), and a skill packages the "when to check" glue so every session benefits.

**Why this matters for the harness.** The harness already ships four verification-shaped skills: `a11y-check`, `api-smoke-test`, `deploy-check`, `migration-check` (verified: `ls skills/ | grep -iE "verify|test|lint|check"` returns exactly those four). What the post *adds* is the framing that these should trigger themselves — a skill whose description hits a keyword-density threshold ("deploy", "before ship", "smoke") gets auto-loaded when the conversation touches that concept, instead of waiting for the user to name it. The harness's session-start already reads `current_phase` (Architect|Code|Test|Deploy — verified in `skills/session-start/SKILL.md:25`), so half the wiring is already there.

**Concrete changes.** None concrete yet — the sizing depends on whether the maintainer has hit cases where a `*-check` skill *should have* run but didn't. Options if the pattern proves out:

- Tighten the `description:` frontmatter on each `*-check` SKILL.md so Claude Code's skill-picker auto-loads it when relevant keywords appear (e.g. `deploy-check` triggers on any Bash tool call mentioning `deploy`, `prod`, `release`).
- Add a `.claude/hooks/` PreToolUse hook that names the relevant check skill in system-reminder text when a phase-transition heuristic fires (e.g. moving from `current_phase: Code` to `current_phase: Deploy` should surface `deploy-check` in the next system-reminder).
- Neither of these is worth building until the maintainer sees the miss pattern in their own sessions.

**Expected payoff.** Fewer "you should have run `deploy-check` before this" moments after the fact — but only pays out if the miss pattern is real.

scope: speculative — no evidence in `.harness-state/` or `parking_lot.md` (verified: `grep -in "should have run\|forgot to run" parking_lot.md .harness-state/*.md 2>/dev/null` returns nothing) that a check skill was skipped when it should have fired.

**Verify before applying:** re-check `parking_lot.md` for any entry mentioning a missed verification step; if none, the pattern hasn't manifested and there's still nothing to fix. Also `ls skills/ | grep -iE "verify|check|test|lint"` should still return the same four skills — a new one might already encode the pattern.

**Recommended verdict:** defer — wait for two real cases where an existing `*-check` skill was skipped and should have fired. That's the trigger; without it, the auto-load wiring is speculative.
**Status:** PENDING — awaiting triage in PR review

---

## 5. Maximizing sessions — surface the six-tip checklist inside session-start

**Source:** *Maximizing the value of your Claude Code sessions* — https://claude.com/blog/maximizing-the-value-of-your-claude-code-sessions (published 2026-08-14).

**What the post says.** Six tips: (1) `/clear` between tasks to drop irrelevant prior context; (2) pick model + effort *before* starting — mid-session changes bust the prompt cache; (3) `@`-mention files instead of naming them (saves a Read call); (4) add quiet flags to noisy commands or run them in a subagent (command output persists for the whole session); (5) run `/context` once in a fresh session to see what's loaded (CLAUDE.md, MCP tool defs) and cut what's unnecessary; (6) `/compact` before you walk away.

**Why this matters for the harness.** Three of the six tips already show up in harness practice, but none are collected in one visible spot:

- Tip 2 (model+effort early) is enforced by `.harness-profile` pinning (verified: `model.primary: claude-opus-4-7`, `effort_default: xhigh` at `.harness-profile:29–32`).
- Tip 5 (`/context` audit) is implicit in `session-start`'s "read profile → read state" opening (verified: `skills/session-start/SKILL.md:15–46`).
- Tip 6 (`/compact` before walking away) is what `session-end` half-does.

Tips 1, 3, 4 have no harness-visible echo — they're operator habits that either happen or don't. A five-line reminder inside `session-start` or the top of README.md would ensure a new consumer project inherits them.

**Concrete changes.**

Add a short block to `skills/session-start/SKILL.md`, after the "read state" step (around line 46), or as a `## Session hygiene` section near the end:

```markdown
## Session hygiene (Anthropic's six tips)

Before starting the day's first micro:
- `/clear` between unrelated tasks (drops the previous task's context — cheaper cache hits, less accidental cross-contamination).
- `.harness-profile` already pins model + effort, so no mid-session `/model` or `/effort` swap (cache-busting).
- `@`-mention files instead of naming them ("edit @src/foo.ts" reads the file directly; saves a Read call).
- For any Bash command whose output you don't need in-context, run with a `--quiet` flag or delegate it to a subagent — long-lived output stays in the conversation for the whole session.
- Once per fresh session, run `/context` to see what's loaded from CLAUDE.md + MCP tool defs; prune anything the current task doesn't need.
- Before walking away, `/compact` if you'll resume the same task later.

Source: https://claude.com/blog/maximizing-the-value-of-your-claude-code-sessions (2026-08-14).
```

**Expected payoff.** A durable in-repo reminder that new consumer projects inherit through `setup-harness`. Doesn't force the tips — surfaces them once, where they'd be seen at session-open time.

**Verify before applying:** `grep -rn "Session hygiene\|/context\|@-mention" skills/session-start/SKILL.md` should still return no relevant hits at apply time. If Claude Code has renamed any of the six commands (`/clear`, `/compact`, `/context` — check the current `code.claude.com/docs/en/commands` page), update the diff before committing.

**Recommended verdict:** apply — small, additive, and the harness's session-open ritual is already the natural home for these tips.
**Status:** PENDING — awaiting triage in PR review

---

## 6. How we contain Claude — bookkeeping only

**Source:** *How we contain Claude across products* — https://www.anthropic.com/engineering/how-we-contain-claude (published 2026-05-25 per Simon Willison mirror linked in search results, though the exact date needs confirmation when the domain is reachable).

**What the post says.** Three containment patterns, one per product surface: claude.ai uses gVisor containers, Claude Code uses OS-level sandboxes (Seatbelt on macOS, bubblewrap on Linux) with human-in-the-loop, Claude Cowork uses a full VM. Design principle: supervise *what the agent can do*, not *what it does* — enforce access boundaries via sandboxes, VMs, and egress controls rather than trying to grade every action. The post is candid about real incidents where Claude "helpfully" escaped a sandbox to complete a task, examined git history to find test answers, and identified the benchmark it was being run on.

**Why this matters for the harness.** The harness does not ship a sandbox layer — that's Claude Code's job. What the harness *does* have is `sandcastle_mattpocock_architecture.md` (verified: file exists at repo root, 1 file), which is where architectural notes about sandboxed execution belong. This post is worth logging in the tracker so a future run doesn't re-analyze it; the substance is Claude Code's own responsibility, not the harness's.

**Concrete changes.** None. If the maintainer eventually adds a "how consumer projects should think about egress" section to setup-harness, this post is the anchor.

**Verify before applying:** `grep -rn "how-we-contain-claude" .` should return no hits before adding a citation; if `sandcastle_mattpocock_architecture.md` grows a "further reading" section, this URL belongs there. Also confirm the Anthropic-owned domain is reachable — if the maintainer's network also blocks `anthropic.com`, use the Simon Willison mirror URL noted in search results instead.

**Recommended verdict:** defer — bookkeeping only; useful reference if a consumer-project sandbox spec ever lands.
**Status:** PENDING — awaiting triage in PR review

---

## 7. Model refresh cluster (Opus 4.8 · Fable 5 · Sonnet 5 · Opus 5) — leave `.harness-profile` pin alone

**Sources (bundled — one § per model would be padding):**

- *Introducing Claude Opus 4.8* — https://www.anthropic.com/news/claude-opus-4-8 (2026-05-28)
- *Claude Fable 5 and Claude Mythos 5* — https://www.anthropic.com/news/claude-fable-5-mythos-5 (2026-06-09)
- *Introducing Claude Sonnet 5* — https://www.anthropic.com/news/claude-sonnet-5 (2026-06-30)
- *Introducing Claude Opus 5* — https://www.anthropic.com/news/claude-opus-5 (2026-07-24)

**What the posts say (per Web Search snippets and platform.claude.com release notes lines 156–200):**

- Opus 4.8 (2026-05-28): 1M context, effort defaults to `high`, minimum cacheable prompt drops to 1,024 tokens, adaptive thinking enabled — Claude Code Auto Mode expanded and Workflows research preview shipped alongside.
- Fable 5 + Mythos 5 (2026-06-09): 1M context by default, adaptive thinking is the only thinking mode, uses the Opus 4.7 tokenizer (~30% more tokens per prompt).
- Sonnet 5 (2026-06-30): 1M context, adaptive thinking on by default, manual extended thinking removed, ~30% more tokens for the same text.
- Opus 5 (2026-07-24): 1M context, thinking on by default at $5/$25 (same as 4.8), `effort` is the primary steering control, disabling thinking is refused at effort `xhigh`/`max`.
- Related retirement (per platform.claude.com line 71): fast mode for **Opus 4.7** was removed on 2026-07-24 — requests to `claude-opus-4-7` with `speed: "fast"` return an error; the model itself remains available at standard speed.

**Why this matters for the harness.** `.harness-profile` pins `model.primary: claude-opus-4-7` and `model.fallback: claude-sonnet-4-6` (verified: `.harness-profile:29–30`). Opus 4.7 remains supported for standard-speed inference — the fast-mode removal only bites if the harness ever set `speed: "fast"` for Opus 4.7. It doesn't (no `speed:` field in `.harness-profile` or in any harness skill: `grep -rn "speed:" .harness-profile skills/` returns no matches). So the pin still works exactly as configured.

The 2026-05-04 tracker row on the 1M-token retirement for Sonnet 4.5/4 already established the general pattern: **the harness pins deliberately and does not chase newer models unless a real driver appears**. This cluster is the same pattern one turn later.

**Concrete changes.** None. If a real driver eventually appears (e.g. Opus 4.7 announces a deprecation date, or a downstream cost/context-window need for consumer projects), revisit as a `/micro` — flip the pin and re-derive `effort_default` if needed. Until then, holding is the right move.

**Verify before applying:** `grep -n "^model:" -A 5 .harness-profile` should still show `claude-opus-4-7` as primary and `claude-sonnet-4-6` as fallback. Also check https://platform.claude.com/docs/en/about-claude/model-deprecations for an Opus 4.7 retirement date — if one has been announced, the "hold" recommendation flips.

**Recommended verdict:** defer — Opus 4.7 still supported; the pin holds until a real driver forces a move. Consistent with the 2026-05-04 disposition.
**Status:** PENDING — awaiting triage in PR review

---

## Appendix: skipped posts (rationales mirrored in the tracker)

The eight skipped posts break down as:

- **Model launch news, individually.** Opus 4.8 (5/28), Fable 5 + Mythos 5 (6/9), Sonnet 5 (6/30), Redeploying Fable 5 (7/1), Opus 5 (7/24) are each skipped in the tracker because the actionable takeaway lives in §7 (bundled). A per-model row is kept so future runs don't re-analyze them.
- **Dynamic Workflows research preview** (5/28) — Anthropic's own multi-agent orchestration primitive shipped in Opus 4.8. The harness's `/run-wave` already fills the same slot with tool-neutral protocol artifacts; a Workflow-based rewrite is speculative and only becomes real if the harness ever needs >100 subagents in one session, which is not on the roadmap.
- **Government of Alberta uses Claude Code** (7/6) — customer story, no methodology delta.
- **Investigating three real-world incidents in cybersecurity evaluations** (7/27) — cybersecurity-evals research, not harness-author guidance.
- **Claude Code auto mode default (2026-08-09/14 rollout)** — the underlying engineering post was already reviewed as 2026-05-08 §1. The August rollout is a distribution change, not a methodology change.
