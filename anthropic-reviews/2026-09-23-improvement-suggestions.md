# 2026-09-23 — Improvement suggestions from new Anthropic posts

**Coverage window.** Posts published between 2026-05-11 and 2026-09-23 (the last review was 2026-05-10). Sources scanned: `anthropic.com/news`, `anthropic.com/engineering`, `claude.com/blog`, `resources.anthropic.com`, `anthropic.com/research`. Cap of 15 candidate posts per run applied; the tracker below records which posts were reviewed and their disposition.

**Context that shapes the recommendations.**
- `.harness-profile` still pins `model.primary: claude-opus-4-7` (2026-04-19 vintage) and `model.fallback: claude-sonnet-4-6`. Both are two model generations behind the current Claude Code defaults (Opus 5.5 / Fable 5.1 / Sonnet 5, all shipped Sep 1–22, 2026).
- Claude Code 2.1.280 release note: **"Effort levels no longer apply to newly released models."** This is a direct behavioral change that lands on any `.harness-profile` that bumps `model.primary` to `claude-opus-5-5`. `effort_default: xhigh` becomes a no-op on the new model.
- No new `anthropic.com/engineering` posts in this window (last engineering post is still 2026-04-23). All new material is on `claude.com/blog` or `anthropic.com/news`. The gap is real, not a fetch failure.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Bump `.harness-profile` model pins from Opus 4.7 → Opus 5.5 (and note the effort-level regression) | apply | Straight cost/perf win (40–50% cheaper agentic work); the effort-default caveat is the only real question and the post answers it |
| 2 | Add a CLAUDE.md 200-line cap guideline to `setup-harness` | apply | Cheap forward-guard from the Opus-5.5 cost post; current CLAUDE.md is 35 lines so the invariant is easy to enforce today |
| 3 | Cite Sep-8 Claude Platform cost/perf post as fresh evidence for the existing prompt-caching guardrail in `AGENTS.md § What to avoid` | reject — no Claude API client surface in the harness | Same disposition as 2026-05-06 §1 — the harness is a methodology repo, not a Claude API caller; nothing to act on |
| 4 | Revisit the orchestrator's subagent-dispatch model against the "single agent with skills beats subagents" finding | spec — challenges a shipped wave design | The commerce-agents finding directly contradicts the pattern `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md` was built on; needs `/spec-planner` before any code change |
| 5 | Decide the new fallback pin: `claude-fable-5-1` vs `claude-sonnet-5` (both shipped since last review) | defer until a Sonnet 5 primary reference lands | The Fable 5.1 post positions Fable at Opus-level intelligence / Sonnet-speed — could replace Opus AND Sonnet in the pin; premature to decide without Sonnet 5 specs in hand |

---

## §1 — Bump `.harness-profile` model pins from Opus 4.7 → Opus 5.5, and flag the effort-level behavior change

**Source:** [Introducing Claude Opus 5.5](https://www.anthropic.com/claude-opus-5-5) (2026-09-22) + [Claude Code changelog v2.1.280](https://code.claude.com/docs/en/changelog) (2026-09-22).

**Why it matters.**
- The current pin (`claude-opus-4-7`, chosen 2026-04-19) is five months old. Opus 5.5 is 20% cheaper on input/output tokens and 60% cheaper on cache reads (`$0.20/Mtok` vs `$0.50/Mtok`) — the post cites a 40–50% overall cost reduction on agentic coding.
- **Behavioral regression to note:** the changelog line "Effort levels no longer apply to newly released models" means `effort_default: xhigh` in `.harness-profile` becomes a no-op on Opus 5.5. Nothing in the harness silently breaks — the field is still read by the orchestrator's dry-run log lines — but the derivation rule comment (lines 22–26) misrepresents the new reality.
- The 2026-04-19 postmortem-linkage comment ("Aligned with Anthropic's 2026-04-23 postmortem (Claude Code defaults Opus-4.7 users to xhigh)") is now stale evidence — that default policy only ever applied to the 4.7 line.

**Concrete changes.**

```diff
--- a/.harness-profile
+++ b/.harness-profile
@@ -22,10 +22,14 @@ stakes:
-# model: pin + effort routing for the orchestrator.
-# `effort_default` is derived from `stakes.level` on first write by /project-init:
-#   stakes.level: low    → effort_default: high
-#   stakes.level: medium → effort_default: xhigh
-#   stakes.level: high   → effort_default: xhigh
-# Aligned with Anthropic's 2026-04-23 postmortem (Claude Code defaults Opus-4.7 users to xhigh).
-# You may override `effort_default` by editing it directly — derivation only applies on first write.
-# `effort_cost_multiplier` is optional and reserved for future /tokens consumption (orchestrator ignores if absent).
+# model: pin + effort routing for the orchestrator.
+# `effort_default` is derived from `stakes.level` on first write by /project-init.
+# NOTE (2026-09-22): Claude Code v2.1.280 no longer applies effort levels to newly
+# released models (Opus 5.5, Fable 5.1, Sonnet 5). The field is preserved for older
+# pins and for orchestrator dry-run log lines, but it is a no-op on `claude-opus-5-5`.
+#   stakes.level: low    → effort_default: high
+#   stakes.level: medium → effort_default: xhigh
+#   stakes.level: high   → effort_default: xhigh
+# `effort_cost_multiplier` is optional and reserved for future /tokens consumption.
 model:
-  primary: claude-opus-4-7
-  fallback: claude-sonnet-4-6
-  effort_default: xhigh   # derived from stakes.level: medium
+  primary: claude-opus-5-5
+  fallback: claude-sonnet-4-6   # deliberate hold — see §5 in 2026-09-23 review
+  effort_default: xhigh   # kept for older-pin fallbacks; no-op on claude-opus-5-5
   effort_cost_multiplier: {}
```

Alongside the profile bump, `README.md`, `docs/waves/wave1-harness-model-pin-profile-schema.md`, `docs/waves/wave2-orchestrator-effort-routing.md`, `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md`, and `skills/project-init/SKILL.md` mention Opus 4.7 by name — they should stay as-is (historical wave receipts / spec vintages are immutable per repo convention), but the `README.md` "Why not Superpowers" evidence list at the model-pin section is a live document and should get one sentence acknowledging the 2026-09-22 bump.

**Expected payoff.** Direct billing reduction on every `/run-wave`, `/planning-loop`, and `/apply-anthropic-reviews` invocation that dispatches through the orchestrator. Also unblocks §5 (fallback-pin decision).

**Verify before applying:** `grep -E '^\s*primary:' .harness-profile` — if the value is already `claude-opus-5-5`, the pin bump is done. Then `grep 'Opus-4.7 users to xhigh' .harness-profile` — if the stale comment is gone, the comment refresh is done.

**Recommended verdict:** apply — cost win is unambiguous, the effort-level caveat is a comment change (not a behavior change), and there's no reason to hold this five months after the 4.7 → 5.5 transition.

**Status:** PENDING — awaiting triage in PR review

---

## §2 — Add a CLAUDE.md 200-line cap guideline to `setup-harness`

**Source:** [What a task costs on Opus 5.5](https://claude.com/blog/what-a-task-costs-on-opus-5-5) (2026-09-22).

**Why it matters.** The post's Claude Code cost-tuning section calls out CLAUDE.md length directly: *"Keep under 200 lines — every line resends on every turn."* This is a hard number tied to prompt-cache economics, not a stylistic preference. Consumer projects that install this harness via `setup-harness` inherit a `CLAUDE.md` template that they then extend; there's no current guardrail against it drifting past the cache-friendly ceiling.

**Concrete change.** `CLAUDE.md` in this repo is 35 lines today (well below the cap), so the invariant is trivial to state now while it's still true. Two edits:

1. Add one line to `skills/setup-harness/templates/user-CLAUDE.md` (the template that consumer projects extend):
   ```diff
   +<!-- Keep this file under ~200 lines. Every line resends on every Claude Code turn (source: claude.com/blog/what-a-task-costs-on-opus-5-5, 2026-09-22). -->
   ```
2. Add a matching one-line bullet under `AGENTS.md § What to avoid` (line 47 onward):
   ```diff
   +- Don't let a per-repo `CLAUDE.md` grow past ~200 lines — it resends on every Claude Code turn and defeats prompt caching.
   ```

Do **not** add a lint or hook to enforce it — the guideline is the artifact; enforcement is speculative for a solo-maintained repo.

**Expected payoff.** Forward-guards prompt-cache economics on consumer projects without any current behavior change. Cheapest possible mitigation of a real cost lever.

**Verify before applying:** `wc -l CLAUDE.md skills/setup-harness/templates/user-CLAUDE.md` — the numbers should still be under 200. Then `grep -n '200 lines' AGENTS.md skills/setup-harness/templates/user-CLAUDE.md` — if the guideline line is already present, the suggestion is already applied.

**Recommended verdict:** apply — two-line documentation change with real cache-hit-rate payoff for consumers; no risk of breaking anything.

**Status:** PENDING — awaiting triage in PR review

---

## §3 — Cite Sep-8 Claude Platform cost/perf post as prompt-caching evidence in `AGENTS.md`

**Source:** [Reducing cost and improving performance with Claude Platform](https://claude.com/blog/reducing-cost-and-improving-performance-with-claude-platform) (2026-09-08).

**Why it (does not) matter.** The post recycles three levers already covered by the 2026-05-01 §2 prompt-caching-guardrail suggestion and the 2026-05-06 §1 reject: byte-exact prefixes, `/claude-api prompt-audit` for stale reasoning scaffolds, and effort-level down-shifting for newer models. The audit tools it references (`/claude-api prompt-audit`, `/claude-api hillclimb`) run against Claude API requests — the harness makes no Claude API calls of its own. Every skill and agent in this repo dispatches through Claude Code sessions, which do their own prompt-cache management.

**Recommended verdict:** reject — no Claude API client surface in the harness. Same disposition as 2026-05-06 §1 (reject; "harness has no Claude API client surface for the lessons to act on"). The Sep-8 post is fresh evidence for a claim already accepted in `AGENTS.md`, but a citation refresh here would just re-litigate the earlier disposition.

**Verify before applying:** `grep -n 'byte-exact\|prefix-stability\|prompt cach' AGENTS.md` — if the existing guardrail line references the 2026-05-01 or 2026-05-05 citation and is present in the doc, no change is warranted. If the guardrail was silently dropped, restore it with the 2026-05-01 wording, not this post's.

**Status:** PENDING — awaiting triage in PR review

---

## §4 — Revisit the orchestrator's subagent-dispatch design against the "single agent + skills > subagents" finding

**Source:** [A guide to the anatomy of effective commerce agents](https://claude.com/blog/the-anatomy-of-effective-commerce-agents) (2026-09-02).

**Why it matters.** The post says directly: *"a single agent with skills consistently has outperformed both the one-prompt-for-everything design and the subagent design on quality."* The orchestrator (`.claude/agents/orchestrator.md`) dispatches every task to a subagent chosen from `{opus, sonnet, haiku}` at runtime and cites Anthropic's older `multi-agent-research-system` post (2025-06-13) as the source pattern. The new commerce-agents post is a public reversal on that pattern — from the same publisher.

This is not a factual conflict (the multi-agent research post remains published; both patterns can be right for different workloads), but it is exactly the kind of "same source, later evidence" signal that should trigger a design review before more waves are shipped on the older pattern.

**Concrete change (proposal, not diff).** Open `docs/specs/2026-09-23-orchestrator-single-agent-review.md` (via `/spec-planner`) with:
- The two Anthropic evidence points side-by-side (multi-agent 2025-06-13 vs commerce agents 2026-09-02).
- A cost-vs-quality tradeoff analysis using `/usage` data from a recent wave run to establish current baseline.
- Explicit acceptance criteria per outcome: (a) keep multi-agent dispatch as-is, (b) collapse to single-agent + skills, (c) hybrid (dispatch only when spec explicitly flags a task as parallel-safe).

Do NOT begin implementation until the spec lands. This is the exact kind of "reusable convention" the README triage rubric marks substantive (rung 3: `/spec-planner`).

**Expected payoff.** Either validates the current design (with an explicit "we chose this, and here's why the commerce-agents finding doesn't apply") — which is itself valuable durable evidence — or unlocks a cheaper single-agent-with-skills variant if that's what the numbers say.

**Verify before applying:** `head -10 .claude/agents/orchestrator.md` — confirm the file still cites the multi-agent-research-system pattern and dispatches to subagents; if the design has already shifted to single-agent + skills, this § is stale and should be closed. Then `ls docs/specs/*orchestrator*single-agent*` — if a spec already exists, this § is already in `spec` state and the maintainer should just link it.

**Recommended verdict:** spec — the finding challenges a shipped design (Wave 2, docs/waves/wave2-orchestrator-effort-routing.md), and any code change here touches a load-bearing convention. Route through `/spec-planner` before any code lands.

**Status:** PENDING — awaiting triage in PR review

---

## §5 — Decide the new fallback pin: `claude-fable-5-1` vs `claude-sonnet-5`

**Source:** [Introducing Claude Fable 5.1 and Claude Mythos 5.1](https://www.anthropic.com/claude-fable-and-mythos-5-1) (2026-09-01) + [Claude Code changelog v2.1.280](https://code.claude.com/docs/en/changelog) (2026-09-22, mentions Sonnet 5 as a Claude Code default alongside Opus 5.5).

**Why it matters.** `.harness-profile:31` still pins `fallback: claude-sonnet-4-6` — five months stale. Two new Anthropic models are candidates:
- **Fable 5.1** (`claude-fable-5-1`, GA on all platforms) — positioned as "Fable-level intelligence, Opus-level price, Sonnet-speed" ($10/$50 per Mtok; $0.25/Mtok cache reads). Defaults to High effort in Claude Code. Outperforms Opus 5 on Terminal-Bench 4.0 (55.8% vs 52.3%) and CursorBench 3.2.0 (73.4% vs 70.0%).
- **Sonnet 5** — mentioned in the Sep-8 cost post as a migration target and in the Sep-22 changelog as a Claude Code selection; no first-party model-announcement URL surfaced in this window's fetches.

The Fable-vs-Sonnet decision is genuinely a maintainer call: Fable 5.1 is a premium model priced above Sonnet's tier and would flip the "primary is expensive, fallback is cheap" invariant that `wave1-harness-model-pin-profile-schema.md` was built on. Sonnet 5 preserves that invariant, but I couldn't confirm its model ID from the sources scanned this run.

**Concrete change.** No unilateral bump. Once §1 (Opus 5.5 primary) is applied, open a follow-up § in a future review specifically triggered by a first-party Sonnet 5 announcement post — that's when the fallback decision has enough evidence.

**Expected payoff.** Deferred — avoids picking the wrong model IDs from second-hand references.

**Verify before applying:** `grep -E '^\s*fallback:' .harness-profile` — if the value is already updated to `claude-fable-5-1` or `claude-sonnet-5`, close this §. Then `curl -sS https://www.anthropic.com/news 2>/dev/null | grep -i 'sonnet 5'` (or a WebFetch) — if a first-party Sonnet 5 announcement URL has appeared since 2026-09-23, the trigger condition for this deferral is met.

**Recommended verdict:** defer until a first-party Sonnet 5 announcement URL is on `anthropic.com/news` or `anthropic.com/engineering` — without that reference, the fallback pin is a coin flip between Fable 5.1's premium positioning and a Sonnet 5 I can only cite second-hand.

**Status:** PENDING — awaiting triage in PR review

---

## Posts reviewed and skipped this run

Recorded in `reviewed-posts.md` with per-row reasons. Highlights:

- **Sep 17 — Projects redesigned (from folder to conversation).** claude.ai-hosted product surface (Claude Code Cloud sessions). No `~/.claude/` or on-disk convention change; the harness is CLI-first.
- **Sep 14 — Agentic coding is straining CI.** Test-impact-analysis service architecture piece. The harness has no CI (`quality_bar.test_required: false` in `.harness-profile`); the pattern is real but has no surface here.
- **Jun 18 — Claude Code now supports artifacts.** Team/Enterprise beta only, hosted feature. The harness's `.harness-state/` receipts already serve the "durable run artifact" role for a solo repo.
- **May 19 — Managed Agents: self-hosted sandboxes and MCP tunnels.** Same disposition as the standing 2026-04-19 §2 Managed Agents deferral — revisit only when the harness itself is planning to run on Managed Agents.
- Remaining Sep-18/17/16/15/14 posts are enterprise vertical launches (Salesforce, Life Sciences, Small Business, Financial Advisors, Healthcare, Accenture partnership) — no coding-harness surface. All logged in the tracker with one-line reasons rather than padding this file.
