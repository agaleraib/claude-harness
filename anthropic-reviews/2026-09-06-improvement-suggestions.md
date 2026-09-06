# Anthropic post review — 2026-09-06

**Discovery window.** Posts published between the last tracker entry (2026-05-10) and today (2026-09-06). Cap: 15 posts per run.

**Note on discovery.** The remote-session egress policy blocks `www.anthropic.com` / `claude.com` directly (`WebFetch` → `EGRESS_BLOCKED`). Post URLs and dates below were surfaced via `WebSearch` (indirect indexing) rather than direct fetch. URLs themselves are canonical Anthropic-owned paths, but per-post body text was not read verbatim — the URL is authoritative, the summary is second-hand. Reviewer should re-open each URL before acting.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Update `.harness-profile` to the Claude 5 family (Opus 5 primary, Sonnet 5 fallback) | apply | Profile still pins 4.7/4.6; Opus 5 launched 2026-07-24 with the 80% system-prompt reduction and near-Fable intelligence at half price. |
| 2 | Cross-reference `/run-loop` with Anthropic's four-loop taxonomy (turn/goal/time/proactive) | apply | One-sentence pointer in `AGENTS.md` §Loop protocol makes the harness's shape legible to a reader landing from the Anthropic post. |
| 3 | Audit large SKILL.md bodies for progressive-disclosure opportunities per Claude 5 context-engineering rules | defer until §1 lands | Rules explicitly target the Claude 5 generation; auditing while still pinned to Opus 4.7 mis-frames the exercise. Couple with §1. |
| 4 | Consider parallel-wave dispatch via the `Workflow` tool for independent-task waves | defer until parallel-wave dispatch is a real pain point | `feedback_skip_workflow_tool_for_oneoff.md` already codifies the anti-abuse rule; needs a spec pass, not a nudge. |
| 5 | Audit harness methodology against the AI-Native SDLC playbook's 6 stages | defer until wave 26 planning | Substantive doc audit, not a one-line change — should go through `/spec-planner` if adopted. |

---

## 1. Update `.harness-profile` to the Claude 5 family (Opus 5 primary, Sonnet 5 fallback)

**Source posts:**
- Claude Opus 5 launch — 2026-07-24 (referenced from "The new rules of context engineering for Claude 5 generation models", https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models — the same post that describes the Opus 5 / Fable 5 system-prompt reduction).
- Claude Sonnet 5 launch — 2026-06-30 (Sonnet-tier upgrade; near-Opus intelligence at Sonnet cost).

**Current state.**
- `.harness-profile` lines 29–33 still read:
  ```yaml
  model:
    primary: claude-opus-4-7
    fallback: claude-sonnet-4-6
    effort_default: xhigh   # derived from stakes.level: medium
  ```
- Comments in the file cite the 2026-04-23 postmortem for the `xhigh` derivation (still valid).
- The harness has **already been running on Opus 4.8** in practice during recent waves (`docs/waves/wave21-run-loop-live-wiring.md` line 19: "all tasks executed on the current session model (Opus 4.8)"; `skills/_shared/loop/dispatch/backends.ts:88` pins `anthropic-api:opus-4.8` as `DEFAULT_REVIEW_BACKEND`). Opus 4.8 has since been superseded by Opus 5 (2026-07-24).

**Concrete change.** Edit `.harness-profile`:

```diff
 model:
-  primary: claude-opus-4-7
-  fallback: claude-sonnet-4-6
+  primary: claude-opus-5
+  fallback: claude-sonnet-5
   effort_default: xhigh   # derived from stakes.level: medium
```

Also update the leading comment block (lines 21–28) to reference the Claude 5 context-engineering guidance instead of the 2026-04-23 postmortem-only footnote, and check whether the `effort_default: xhigh` derivation table still applies once Anthropic ships product-default effort guidance for Claude 5 (the 2026-04-26 §3 revisit trigger).

Downstream: `skills/_shared/loop/dispatch/backends.ts:88–89` and `skills/_shared/loop/dispatch/review.ts:127` currently pin Opus 4.8. If the operator wants the review backend to track the profile primary, bump those two spots in the same commit; otherwise leave them (review-backend independence is intentional).

**Expected payoff.** Bring the profile's advertised primary in line with the model the harness actually runs on; capture the "near-Fable intelligence at half price" cost win called out in Anthropic's own comms; unblock §3 (context-engineering audit is only meaningful once the primary is Claude 5).

**Verify before applying:**
1. `grep -E "^\s*(primary|fallback):" .harness-profile` still shows `claude-opus-4-7` / `claude-sonnet-4-6` (if it already reads `claude-opus-5` / `claude-sonnet-5`, this § is already applied — drop it).
2. Confirm the exact model IDs in the `claude-api` skill's model catalog (or via `claude --version` / the Anthropic docs) before committing — the marketing name "Opus 5" maps to a specific `claude-opus-5-<date>` slug in some contexts.

**Recommended verdict:** apply — the profile is drifting behind actual usage, and the accompanying context-engineering rule change (§3) can't be evaluated honestly against a 4.7 pin.

**Status:** PENDING — awaiting triage in PR review

---

## 2. Cross-reference `/run-loop` with Anthropic's four-loop taxonomy (turn / goal / time / proactive)

**Source post:** https://claude.com/blog/getting-started-with-loops — "Loop engineering: Getting started with loops" (2026-06-30). Practitioner intro that names four loop archetypes (turn-based, goal-based, time-based, proactive) and their stop conditions.

**Current state.**
- `grep -Ei "turn-based|goal-based|time-based|proactive.loop" AGENTS.md skills/run-loop/SKILL.md` returns nothing (2026-09-06 spot-check).
- The harness's `/run-loop` is a **goal-based drain loop** — pull-next-ready → mechanical gate → repeat until source drains or termination cap fires (`skills/run-loop/SKILL.md` opening paragraphs).
- `AGENTS.md` §Loop protocol describes the mechanism but doesn't place the loop in Anthropic's taxonomy.

**Concrete change.** Add one paragraph to either `AGENTS.md` §Loop protocol or the intro of `skills/run-loop/SKILL.md`:

> In Anthropic's four-loop taxonomy ([Loop engineering: Getting started with loops](https://claude.com/blog/getting-started-with-loops), 2026-06-30), `/run-loop` is a **goal-based drain loop**: the stop condition is "the work source is empty or the termination cap fires", not "a fixed number of turns elapsed" (turn-based), "a wall-clock deadline hit" (time-based), or "an external signal fires" (proactive). This lets a reader landing from the Anthropic post place the harness's third execution lane in the framework they're already reading in.

**Expected payoff.** A one-line taxonomic anchor. Doesn't change behavior; makes the doc discoverable-in-context if someone reads the Anthropic post first, then lands on the harness.

**Verify before applying:** `grep -Ei "goal-based|turn-based|time-based|proactive.loop" AGENTS.md skills/run-loop/SKILL.md` still yields nothing.

**Recommended verdict:** apply — trivial pointer, low risk, no ongoing maintenance cost.

**Status:** PENDING — awaiting triage in PR review

---

## 3. Audit large SKILL.md bodies for progressive-disclosure opportunities per Claude 5 context-engineering rules

**Source post:** https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models — "The new rules of context engineering for Claude 5 generation models" (2026-07-24, Thariq Shihipar). Reports the Claude Code team removed >80% of the system prompt for Opus 5 / Fable 5 with no measurable loss on coding evaluations. Prescribes: stop micromanaging, curate what the model sees, load progressively when needed, prefer automatic memory over manually maintained files, hand rich references instead of thin specs.

**Current state (2026-09-06 line counts).**
```
719  skills/planning-loop/SKILL.md
675  skills/close-wave/SKILL.md
488  skills/skill-creator/SKILL.md
446  skills/run-wave/SKILL.md
412  skills/triage-parking/SKILL.md
348  skills/project-init/SKILL.md
298  skills/setup-harness/SKILL.md
289  skills/commit/SKILL.md
219  skills/session-start/SKILL.md
```
The harness already uses `references/` sub-dirs for progressive disclosure (`skills/planning-loop/references/rules.md`, `skills/skill-creator/references/anthropic-skill-authoring.md`, etc.), so this isn't a "you're not doing it" complaint — it's a "the model that will read these is now the one the Claude Code team stripped 80% for" trigger.

**Concrete change.**
1. After §1 lands (profile now on Claude 5), run a per-skill triage on the six largest bodies (planning-loop, close-wave, skill-creator, run-wave, triage-parking, project-init):
   - Which sections are "curation" (what the skill is, when to trigger, non-obvious gotchas)?
   - Which are "micromanagement" (step-by-step scripts the model can now infer)?
   - Which are "rich reference" (worked examples, edge-case tables) that could move to `references/` and be pulled only when the skill body cites them?
2. Aim to keep the SKILL.md body under ~300 lines for the highest-frequency skills; anything above stays only if it's high-value curation.
3. This is an **audit**, not a blanket cut — the harness's skill bodies are load-bearing and already reference-heavy. Empirical test: run one wave post-audit with the trimmed SKILL.md and confirm no regression before applying to the rest.

**Expected payoff.** Aligns with the model's new preference; reduces token spend per skill invocation; the Anthropic post's finding ("no measurable loss") is strong evidence the exercise is worth doing.

**Verify before applying:**
1. `grep -E "^\s*primary:" .harness-profile` reads `claude-opus-5` (i.e. §1 landed).
2. `wc -l skills/*/SKILL.md | sort -rn | head -6` still shows planning-loop / close-wave / skill-creator / run-wave / triage-parking / project-init as the top six — different top-six means the mental model of "which are the largest" has shifted and this § needs re-scoping.

**Recommended verdict:** defer until §1 lands — auditing skill bodies against Claude 5 rules while the profile still pins Opus 4.7 mis-frames the exercise. Also flag as `scope: speculative` for the "no measurable loss" claim — the Anthropic team's benchmark isn't ours.

**Status:** PENDING — awaiting triage in PR review

---

## 4. Consider parallel-wave dispatch via the `Workflow` tool for independent-task waves

**Source post:** https://claude.com/blog/introducing-dynamic-workflows-in-claude-code — "Introducing dynamic workflows in Claude Code" (2026-05-28). Claude Code CLI can now write orchestration scripts (JS) that fan out to tens–hundreds of parallel subagents in one session. GA in Claude Code CLI + Desktop + VS Code extension.

**Current state.**
- The `Workflow` tool is available in this session (`ToolSearch → select:Workflow` returns a schema). System-prompt guidance: "ONLY call this tool when the user has explicitly opted into multi-agent orchestration."
- Harness memory `feedback_skip_workflow_tool_for_oneoff.md` (surfaced in `.harness-state/wave12-migration.jsonl:198`) already codifies the anti-abuse stance.
- `/run-wave` currently dispatches wave tasks to orchestrator subagents sequentially (`skills/run-wave/SKILL.md` — the orchestrator picks one task at a time; parallelism is per-agent, not per-task).
- No harness code references `dynamic-workflow`, `Workflow.tool`, or "orchestration script" outside the migration jsonl (2026-09-06 grep).

**Concrete change (if adopted).** Would need a `/spec-planner` pass, not a `/micro`. The design surface:
- **Where** would parallel dispatch help? Waves whose tasks are demonstrably independent (no shared file writes, no ordering constraint). Today the spec-planner writes waves as a totally-ordered list — that ordering would need a partial-order annotation.
- **How** would a wave declare parallelism? Add an optional `parallel_group: <id>` per task in the spec; the orchestrator would batch same-group tasks into one `Workflow` call.
- **What** are the guardrails? Prevent parallel dispatch when `stakes.level: high` (blast radius); require the denylist hook active (same as `/run-loop`); the dynamic-workflow's "small workflows" size guideline maps to `.harness-profile` (currently "medium" default).
- **Cost.** Every parallel dispatch spends more tokens than the sequential equivalent (each subagent gets its own context prime). Solo tooling isn't obviously bottlenecked by wave wall-clock.

**Expected payoff.** Speculative. Waves in this repo are already narrow (usually 3–6 tasks) and mostly sequentially dependent (each task edits the same skill/spec). The likely gain is in **consumer projects** that run many-file refactor waves — those aren't served by this harness's `/run-wave` today.

**Verify before applying:**
1. `grep -r "Workflow\|dynamic-workflow\|orchestration script" skills/run-wave/ .claude/agents/` still returns nothing (i.e. no in-flight implementation).
2. `git log --oneline --all --grep="parallel.*wave\|workflow.*dispatch" -- docs/plan.md` returns no in-flight wave item.
3. Confirm the Anthropic system-prompt guidance for `Workflow` still requires explicit user opt-in (re-open the post; the rule may have relaxed).

**Recommended verdict:** defer until parallel-wave dispatch becomes an active pain point — the memory file already covers the anti-abuse case and no wave-throughput complaint has surfaced in a triage-parking item to date. `spec` if the maintainer wants a design pass anyway; scope: speculative.

**Status:** PENDING — awaiting triage in PR review

---

## 5. Audit harness methodology against the AI-Native SDLC playbook's 6 stages

**Source post:** https://claude.com/blog/the-ai-native-sdlc-playbook — "The AI-Native SDLC playbook" (2026-08-21, Louis Claxton). Prescribes a six-stage SDLC built around Claude Code, versioned artifacts, automated reviews, and continuous maintenance. Argues teams have kept the same approval gates / reviews / handoffs / policies from the pre-agentic era and are losing the productivity gain.

**Current state.**
- `grep -r "AI-native SDLC\|SDLC playbook" README.md AGENTS.md` returns nothing (2026-09-06).
- The harness's methodology is spec-driven: `/spec-planner` → `docs/specs/<date>-<topic>.md` → `docs/plan.md` wave entry → `/run-wave` → `/close-wave` → `/commit`, with `code-reviewer` as adversarial gate and `/apply-anthropic-reviews` as continuous-maintenance loop. This is an SDLC — it just isn't framed against the playbook's six-stage vocabulary.

**Concrete change (if adopted).**
1. Read the playbook end-to-end (someone with time, not this routine — its indirect summary in the search snippet is not enough to author a diff against).
2. Map each of the six stages to its harness counterpart (spec / wave / close / commit / triage-parking / apply-anthropic-reviews).
3. Note the diverges (e.g. "we don't do stage 5 because …") in `README.md` or a new `docs/methodology-map.md`.
4. Optionally, capture any stage the harness is missing as a wave item.

**Expected payoff.** Discoverability — a reader arriving from the playbook can see where the harness fits. Also a forcing function to notice any stage the harness has silently under-implemented.

**Verify before applying:**
1. `grep -r "AI-native SDLC\|SDLC playbook\|the-ai-native-sdlc-playbook" README.md AGENTS.md docs/` still returns nothing.
2. Confirm the playbook is still the current Anthropic-recommended framing (Anthropic has iterated on methodology posts every ~2 months in 2026; the playbook may be revised by triage time).

**Recommended verdict:** defer until wave 26 planning — substantive doc audit, not a one-line change. If adopted, run through `/spec-planner` (multi-file doc surface + potential new methodology-map doc = substantive per README triage rules).

**Status:** PENDING — awaiting triage in PR review

---

## Posts reviewed and skipped (with reason)

Recorded in `reviewed-posts.md`; listed here for at-a-glance.

- **Claude Opus 4.8 launch (2026-05-28)** — superseded by Opus 5 (2026-07-24). §1 folds the profile bump directly to Opus 5; a separate 4.8 § would be dead on arrival.
- **Claude Fable 5 launch (2026-06-09 → 2026-07-01 restored)** — frontier tier positioned above Opus 5. Not a primary-model candidate for solo tooling at the price point. `.harness-profile` has no `frontier` slot today.
- **Code w/ Claude SF 2026 event page (2026-05-06 / claude.com/blog/code-w-claude-sf-2026-sf)** — umbrella event page; individual sessions covered by their standalone posts (dynamic workflows, loop engineering, running an AI-native engineering org).
- **Running an AI-native engineering org (2026-06-03, Fiona Fung)** — organizational-transformation piece for engineering leaders. Solo tooling has no organizational surface. Revisit if `team.size` in `.harness-profile` ever changes from `solo`.
- **How Warp builds self-improving agents on Claude (2026-08-26)** — customer story; no methodology-pattern transferable to this harness's skill/agent shape.
- **Building commerce agents with Claude / The anatomy of effective commerce agents (2026-09-02)** — vertical (commerce agents); no coding-harness surface.
- **Quantifying infrastructure noise in agentic coding evals (2026-02-05, via engineering blog)** — out of scope (published pre-2026-05-10 window; surfaced only because search results conflated dates). Kept here for the tracker's forensic trail.
