# Anthropic post review — 2026-11-10

Covers Anthropic posts published between 2026-05-10 (last review) and 2026-11-10. 15 posts cap applied; longer backlog than usual due to the six-month gap since the last routine run — the three Claude 5.5 model launches (Opus / Sonnet / Haiku), the Fable 5.2 launch, and two methodology-dense engineering posts (components of agent memory, fold-subagents guidance) dominated the signal.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Upgrade `.harness-profile` + orchestrator routing table from 4.x model pins to 5.5 generation | apply | Pinned IDs (`claude-opus-4-7`, `claude-sonnet-4-6`, `haiku-4.5`) are two generations stale; 5.5 is cheaper per task and the API IDs are published. |
| 2 | Fix stray `claude-opus-4-8` default in `skills/_shared/loop/dispatch/review.ts:127` | apply | That model ID does not exist; a live run of the anthropic-api review adapter without an explicit `model` would 404. Caught while verifying §1. |
| 3 | Adopt the "dreaming" (offline transcript→notes consolidation) pattern in `/memory-prune` | spec | Memory system has the surface (`FEEDBACK.md` + `feedback/<slug>.md` per-entity split) but no replay-against-transcripts validation step. Design pass needed before coding. |
| 4 | Add Haiku 5.5 as an explicit compaction/summarization subagent slot | defer until orchestrator routing re-audit | Haiku 5.5 is 75% cheaper than 4.5 with much higher capability; worth a routing rethink, but only when a wave re-opens the orchestrator rubric. |
| 5 | Cite "How we contain Claude across products" in `setup-harness` hook-trust docs | apply | The setup-harness skill writes `.claude/settings.json` hooks; the post names "executing project-local config before trust is established" as a real exploited vulnerability — add a one-paragraph warning. |
| 6 | Run a "fold subagents into the main loop" eval on the planner/generator/orchestrator trio | defer until a solo-maintenance pain point surfaces | The post's advice (merge tightly coupled specialists first, measure with a small eval) presumes you already run evals. Without the deferred `2026-04-19 §5` eval infrastructure, this is premature. |
| 7 | Consider Fable 5.2 as a `stakes.level: high` escalation option | defer until a consumer project trips stakes.level: high | Fable 5.2 is 2x Opus 5.5's price for ~5–10% benchmark lift. Solo harness repo is `stakes.level: medium`; no consumer project has yet asked for Fable-tier work. |
| 8 | Message threads API (TTFT optimisation) | reject — harness has no Claude API client surface | The run-loop review adapter is the only API call site; message threads require a feature-flag + prev-response-ID bookkeeping client that doesn't exist and would be premature. |
| 9 | Adopt "Scion" patterns (post-merge CI + superfan component watchers) | reject — architectural bet, not harness-scale | Scion is monorepo infrastructure for 30k changes/day. Harness is solo-maintained at < 1 merge/day. |
| 10 | Pin agentskills.io / GitHub links for future vendor-neutral rebrand | defer until AAIF publishes a migration notice | Anthropic donated the Agent Skills standard to the AAIF; no format break, but URLs may redirect eventually. |

---

## 1. Upgrade `.harness-profile` + orchestrator routing table from 4.x model pins to the 5.5 generation

**Sources:**
- "Introducing Claude Opus 5.5" — https://www.anthropic.com/claude-opus-5-5 (Sep 22, 2026). Model ID `claude-opus-5-5`. Input $4 / output $20 per MTok (Opus 5 was $5 / $25). Cache reads cut 60% to $0.20/MTok. Terminal-Bench 4.0 66.4% vs. 52.3% for Opus 5. Default effort medium.
- "Introducing Claude Sonnet 5.5" — https://www.anthropic.com/claude-sonnet-5-5 (Sep 28, 2026). Model ID `claude-sonnet-5-5`. Input $2 / output $10 per MTok (same as Sonnet 5, uses ~30% fewer tokens/task). Cache reads halved to $0.10/MTok. Terminal-Bench 4.0 70.6% vs. Sonnet 5's 10.3%.
- "Introducing Claude Haiku 5.5" — https://www.anthropic.com/claude-haiku-5-5 (Oct 7, 2026). Model ID `claude-haiku-5-5`. Input $0.10 / output $0.50 per MTok (up to 100k prompts). ~75% cheaper than Haiku 4.5. First Haiku with an effort setting.

**Current state (verified):**
- `.harness-profile` pins `model.primary: claude-opus-4-7` and `model.fallback: claude-sonnet-4-6` — both two generations stale.
- `.claude/agents/orchestrator.md` routing table (lines 144–152 + lines 247–264 escalation ladder + §Logging Contract examples) hard-codes `opus-4.7 / sonnet-4.6 / haiku-4.5` across 9+ places.
- `skills/project-init/SKILL.md` lines 153–154 + 207–208 default-document the 4-7 / 4-6 pair in its config schema.
- `.claude/agents/{code-reviewer,spec-planner,generator,ui-evaluator}.md` already use the generic `model: opus` alias and auto-pick up whichever Opus Claude Code treats as current, so no change needed there.

**Proposed diff:**

```diff
# .harness-profile
 model:
-  primary: claude-opus-4-7
-  fallback: claude-sonnet-4-6
+  primary: claude-opus-5-5
+  fallback: claude-sonnet-5-5
   effort_default: xhigh   # derived from stakes.level: medium
```

```diff
# .claude/agents/orchestrator.md — routing table
-| Fix a typo in docs | haiku-4.5 | low |
-| Read-only scan / report | haiku-4.5 | low |
-| Refactor one module | sonnet-4.6 | medium |
+| Fix a typo in docs | haiku-5.5 | low |
+| Read-only scan / report | haiku-5.5 | low |
+| Refactor one module | sonnet-5.5 | medium |
 ...
-| New architecture / pattern others will follow | opus-4.7 | high |
+| New architecture / pattern others will follow | opus-5.5 | high |
 ...
# plus escalation ladder (lines 247–264) and logging examples (lines 327, 337, 343)
```

Also update `skills/project-init/SKILL.md` lines 153–154 + 207–208 defaults, and `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md` historic example (leave the spec itself unchanged as a frozen artifact — but verify it's not referenced live).

**Expected payoff:** Primary stops serving a model Anthropic will eventually retire. Sonnet 5.5 is ~30% cheaper per task than Sonnet 4.6 at same cap. Haiku 5.5 opens new "cheap compaction subagent" ground (see §4). Opus 5.5 scores roughly on par with Opus 4.7 on the published benchmarks at ~20% lower input/output price.

**Verify before applying:** `grep -n 'claude-opus-4-7\|claude-sonnet-4-6\|opus-4\.7\|sonnet-4\.6\|haiku-4\.5' .harness-profile .claude/agents/orchestrator.md skills/project-init/SKILL.md` — confirm the matches are still live (not already migrated by a prior wave). Also fetch `https://www.anthropic.com/claude-opus-5-5` once more to confirm `claude-opus-5-5` is still the current ID (not superseded by a 5.6 or similar) at apply time.

**Recommended verdict:** apply — concrete, low-risk, high-leverage; four skimmed-and-verified file edits.
**Status:** PENDING — awaiting triage in PR review

---

## 2. Fix stray `claude-opus-4-8` default in `skills/_shared/loop/dispatch/review.ts:127`

**Sources:** Incidental finding from §1 verification pass; not from an Anthropic post. Kept inline here because the fix is on the same code path as §1 and will cause an identical "stale model ID" failure if ignored.

**Current state (verified):** `skills/_shared/loop/dispatch/review.ts:127` reads:
```ts
model: model ?? 'claude-opus-4-8',
```
There is no Anthropic model with ID `claude-opus-4-8`. The generation went 4-7 → 5 → 5.5. A live run of the anthropic-api review adapter without an explicit `model` argument would hit a 404 from the Messages API.

**Proposed diff:**
```diff
-        model: model ?? 'claude-opus-4-8',
+        model: model ?? 'claude-opus-5-5',
```

**Expected payoff:** Removes a latent bug on the run-loop anthropic-api path; keeps the default aligned with `.harness-profile.model.primary` after §1 applies.

**Verify before applying:** `grep -n "claude-opus" skills/_shared/loop/dispatch/review.ts` — confirm the stale ID is still there and that no test fixture relies on it. Also inspect whether callers *always* pass `model` (if so, the default is unreachable and this is a cosmetic fix; still worth doing).

**Recommended verdict:** apply — one-line fix, same wave as §1.
**Status:** PENDING — awaiting triage in PR review

---

## 3. Adopt the "dreaming" (offline transcript → notes consolidation) pattern in `/memory-prune`

**Source:** "The components of agent memory" — https://www.anthropic.com/research/components-of-agent-memory (Nov 6, 2026, Lance Martin).

Key patterns from the post:
- **Dreaming:** an offline pass that replays raw transcripts, validates/corrects notes against them, repairs broken links, and promotes key notes upward (hippocampal-replay analogue).
- **Per-entity single-writer files:** parallel writers to one shared file clobber each other. Assigning each entity/source its own file (with terms quoted verbatim) raised Claude's retained contract facts from 41/57 to 57/57.
- **Memory as prediction about future need:** notes should capture what cannot be re-derived from current screen/context — not re-savable observable state.
- **Verified vs. unconfirmed marking:** have the agent stamp each rule with "verified against transcript" or "hypothesis".
- **Always-loaded index stays small:** Claude Code reads only first 200 lines / 25 KB of `MEMORY.md` per session.

**Current state (verified):**
- `AGENTS.md` §Memory already documents per-entity files for FEEDBACK (`feedback/<slug>.md` per pattern), hard caps (`≤5KB FEEDBACK.md`, 150 char/line), and manual promotion via `/memory-prune`.
- No "dreaming" step exists: `/memory-prune` writes FEEDBACK.md but does not replay transcripts, cross-check notes against raw session JSONL, or repair dangling links. Confirmed via `ls skills/memory-prune/ → SKILL.md + lib/`.
- No verified/unconfirmed stamping convention; notes land as-is.

**Proposed scope (why spec, not apply):** This is a design pass, not a drop-in diff. Open questions:
1. What transcript source does dreaming consume? Claude Code per-cwd auto-memory lives at `~/.claude/projects/<encoded-cwd>/memory/`; the raw transcript is at `~/.claude/projects/<encoded-cwd>/*.jsonl`. Is `/memory-prune` allowed to reach those JSONL files, or should dreaming stay inside the already-written `.md` surface?
2. Does solo-maintenance volume warrant the cost? The post's examples (Pokémon, contract extraction) involve 100s of session-turns of noise; the harness's current pattern runs ~10s of turns before a human review.
3. Should dreaming be a new skill (`/memory-dream`) or a `--dream` flag on existing `/memory-prune`?

**Expected payoff:** Catches note-rot (wrong facts persisted because no one re-reads the transcript to verify). Marginal for solo use today; grows as `~/.claude/memory/feedback/` grows past ~20 patterns.

**Verify before applying:** `ls ~/.claude/memory/feedback/ | wc -l` — if the directory has fewer than ~15 entries, dreaming-level consolidation is premature. Also re-read the post once the spec draft exists to check for updates (Anthropic edits recent posts).

**Recommended verdict:** spec — the mechanism is interesting but open design questions on transcript reach + cost/benefit vs. solo volume rule out a direct apply. Scope: speculative.
**Status:** PENDING — awaiting triage in PR review

---

## 4. Add Haiku 5.5 as an explicit compaction/summarization subagent slot in the orchestrator rubric

**Source:** "Introducing Claude Haiku 5.5" — https://www.anthropic.com/claude-haiku-5-5 (Oct 7, 2026). Haiku 5.5 is ~75% cheaper than Haiku 4.5 on average (input $0.10/MTok vs. $1.00 for prompts up to 100k; output $0.50/MTok vs. $5.00). First Haiku with an adjustable effort setting. Anthropic's product position: "high-volume cost-sensitive tasks" — summaries, compaction, DB queries, classification; and "serves as a subagent alongside Opus 5.5 and Sonnet 5.5."

**Current state (verified):**
- `.claude/agents/orchestrator.md` routing table uses `haiku-4.5` for exactly two shapes: "Fix a typo in docs" and "Read-only scan / report" (lines 144–145).
- No skill or agent currently dispatches explicitly to Haiku for *compaction* (shrinking a bloated context before passing to a bigger model) or *summarization-as-service* — compaction happens inline in whichever model is currently running.
- The orchestrator's escalation ladder (lines 247–248) is `haiku-4.5 → sonnet-4.6 → opus-4.7`; there is no path that *de-escalates* to Haiku for sub-work.

**Why defer:** §1 covers the mechanical ID bump (`haiku-4.5` → `haiku-5.5`). Expanding Haiku's role (adding a compaction routing rule, adding a cheap-subagent dispatcher) is a rubric change. The orchestrator has only been touched by substantive routing changes once (`2026-04-19-harness-model-pin-and-effort-routing.md`); the next wave that touches it is the right scope boundary for this.

**Expected payoff:** Reduces per-wave token spend by routing summarize/compact steps to a model that is 10x cheaper on input than Sonnet; adds a de-escalation pathway not currently in the rubric.

**Verify before applying:** `grep -n "haiku" .claude/agents/orchestrator.md` — confirm the rubric still contains only the two typo/scan rows. Also confirm no intervening wave has already added compaction routing. Consumer-usage signal: check `.harness-state/run-wave-*.yml` for any task shaped like "summarize for next model" that got routed to Sonnet.

**Recommended verdict:** defer until orchestrator routing re-audit — either driven by a consumer project where Opus/Sonnet token spend becomes material, or alongside §6 (fold-subagents eval) if that spec ever unblocks.
**Status:** PENDING — awaiting triage in PR review

---

## 5. Cite "How we contain Claude across products" in `setup-harness` hook-trust docs

**Source:** "How we contain Claude across products" — https://www.anthropic.com/research/how-we-contain-claude (May 25, 2026). Key harness-relevant guidance:

> "Don't parse or execute project-local configuration, such as hooks in `.claude/settings.json`, until the user accepts the trust prompt. We've seen real vulnerabilities from executing configuration before trust was established."

The post also recommends: treat project-open events, config loading, and localhost listeners as untrusted inbound input; resolve symlinks before path validation; keep credentials out of sandboxes entirely.

**Current state (verified):** `skills/setup-harness/SKILL.md` has 16 mentions of `hook` / `.claude/settings.json`. The skill writes `PreToolUse` and `PostToolUse` hooks into `~/.claude/settings.json` (user-global) and project-local `.claude/settings.json`. It does not currently warn the operator that:
1. On an unfamiliar repo, Claude Code's trust prompt gates `.claude/settings.json` execution — the operator should read the hook commands *before* clicking trust.
2. Globally-installed hooks (via the harness's setup-harness install) will run on *every* cwd Claude Code opens, not just the harness repo. This is a blast-radius widening a new user might not expect.

**Proposed addition (sketch, not a diff):** A short "Why the trust prompt matters" box in `skills/setup-harness/SKILL.md` near where the global hook installation happens, with one sentence and a link to the Anthropic post. Something like:

> ⚠️ **Trust prompt first.** Claude Code gates `.claude/settings.json` hook execution behind a per-repo trust prompt. Before clicking accept on an unfamiliar repo, read the `hooks` block — any shell command there will run on every matching tool use. Anthropic's "How we contain Claude" (2026-05-25) documents real vulnerabilities from executing configuration before trust was established.

**Expected payoff:** One-paragraph doc nudge; costs nothing, catches the user before an install-hook footgun. The setup-harness skill *installs* global hooks today, so the warning actually matters for consumer adoption.

**Verify before applying:** `grep -n "trust\|settings.json" skills/setup-harness/SKILL.md` — confirm the skill still installs global hooks and still lacks a trust-prompt warning.

**Recommended verdict:** apply — one paragraph, no code change, documentation only.
**Status:** PENDING — awaiting triage in PR review

---

## 6. Run a "fold subagents into the main loop" eval on the planner → generator → orchestrator trio

**Source:** "Building agents: When to fold subagents into your main agent loop" — https://claude.com/resources/articles/building-agents-when-to-fold-subagents-into-your-main-agent-loop (Oct 22, 2026, Diane Sarkis).

The post's method:
1. Build a small end-to-end eval first (task-completion scoring, one task per production agent chain).
2. Merge tightly coupled specialists first. "Frankenprompt" / overlapping subagents / designs that mirror the org chart are smells.
3. Call retained subagents *as tools* (not as conversation handoffs) unless they must talk to the user directly.
4. Fold subagents one at a time, compare evals with and without, inspect per-task deltas (not just the aggregate).

**Candidate harness targets:**
- `.claude/agents/spec-planner.md` + `.claude/agents/generator.md` are planner→builder with a clean interface (spec file). Classic fold candidate per the post.
- `.claude/agents/orchestrator.md` dispatches to `code-reviewer` and `generator` — this already *is* the pattern the post recommends (subagent-as-tool), so it's safe from the folding question.
- `.claude/agents/ui-evaluator.md` is a black-box verifier with its own Playwright MCP mount — explicitly protected from folding per the post ("good candidates for subagents are black-box verification").

**Current state (verified):** `ls .claude/agents/` returns 6 files (code-reviewer, generator, orchestrator, project-tracker, spec-planner, ui-evaluator). None has been evaluated against a "folded into one agent" baseline. No eval infrastructure exists in the repo for agent-chain task completion — confirmed via `grep -r "eval\|benchmark" skills/_shared/ | head`.

**Why defer:** The post's advice is methodologically correct but presumes you *have* evals. The harness's deferred `2026-04-19 §5` already queues "formalize evals for the adversarial reviewers" — this suggestion is downstream of that. Doing fold-vs-keep A/B without evals is vibes-driven and the post explicitly warns against that.

**Expected payoff:** Latent — fewer agents to maintain, lower hop latency, cleaner prompts. But the gain is only visible once there's an eval score to compare against.

**Verify before applying:** Check whether the deferred eval infrastructure from `2026-04-19 §5` has been unlocked: `ls docs/specs/ | grep -i eval` and `grep -rn "evaluator\|eval" .harness-state/ | head`.

**Recommended verdict:** defer until a solo-maintenance pain point surfaces or until `2026-04-19 §5` unblocks — whichever comes first.
**Status:** PENDING — awaiting triage in PR review

---

## 7. Consider Fable 5.2 as a `stakes.level: high` escalation option

**Source:** "Introducing Claude Fable 5.2 and Claude Mythos 5.2" — https://www.anthropic.com/claude-fable-and-mythos-5-2 (Nov 9, 2026). Fable 5.2 model ID `claude-fable-5-2`. Input $8 / output $40 per MTok (fast mode $16 / $80). FrontierCode 2.0 49.1% @ xhigh (Opus 5.5: 45.5%), FrontierSWE v2 69.9% (Opus 5.5: 62.3%). Anthropic recommends "start with Opus 5.5 and switch up to Fable for hard work."

**Current state (verified):**
- `.harness-profile.stakes.level: medium → effort_default: xhigh` (derived). There's no path today that selects a *different model* based on stakes — `stakes.level: high` would still get Opus 4.7 (or Opus 5.5 after §1).
- The orchestrator's model-promotion ladder ends at `opus-4.7/xhigh` (orchestrator.md:264). After §1 it ends at `opus-5.5/xhigh`.
- No consumer project in the harness's PROJECTS.md is currently `stakes.level: high`.

**Why defer:** The Fable price step is 2x Opus 5.5 ($8/$40 vs. $4/$20) for roughly a 5–10% benchmark lift. For the harness itself (`stakes.level: medium`), this is overspending. Worth adding to the escalation ladder only when a consumer project actually sets `stakes.level: high` and justifies the spend. Also: the Fable 5.2 API costs exceed solo-developer budget-per-session comfort for sustained use.

**Expected payoff (if applied later):** Gives `/project-init` a model to promote to at `stakes.level: high`; closes the gap in the "ladder ends at opus/xhigh" reasoning.

**Verify before applying:** `grep -n "stakes.level: high" .harness-profile anthropic-reviews/*.md ~/.claude/memory/PROJECTS.md 2>/dev/null` — confirm no consumer project has yet opted into high-stakes mode. If one has, this suggestion flips to `apply`.

**Recommended verdict:** defer until a consumer project trips `stakes.level: high`. Scope: speculative until then.
**Status:** PENDING — awaiting triage in PR review

---

## 8. Message threads API (TTFT optimisation)

**Source:** "Make long-running agents faster with message threads" — https://claude.com/resources/articles/message-threads (Nov 2, 2026). Server-held conversation state; client sends only the delta plus `prev_response_id`. Reported ~35% TTFT reduction for 500k–1M token requests. Threads expire 5 min after last request; token spend unchanged (cost knob is caching, not threads).

**Current state (verified):** The only direct Claude API call site in the harness is `skills/_shared/loop/dispatch/review.ts` (the anthropic-api review adapter), a one-shot review call that does not maintain conversational state across turns. The loop engine does not multi-turn against the Messages API. Claude Code itself (which *does* use multi-turn API calls) is the client *consuming* the harness — not something the harness controls.

**Why reject:** No harness surface to attach the feature to. The run-loop review adapter would see zero benefit (it's one-shot, not long-running). If/when the harness grows a multi-turn Claude API client, revisit.

**Expected payoff:** Zero at current surface.

**Verify before applying:** `grep -rn "api.anthropic.com\|claude.com/api\|v1/messages" skills/ | head` — confirm the review dispatcher is still the only API caller. If a second multi-turn caller appears (e.g. a future `/ask-claude` skill), re-evaluate.

**Recommended verdict:** reject — no harness surface for the lessons to act on.
**Status:** PENDING — awaiting triage in PR review

---

## 9. Adopt "Scion" patterns (post-merge CI + superfan component watchers)

**Source:** "Redesigning source control at Anthropic" — https://www.anthropic.com/research/redesigning-source-control (Oct 13, 2026, updated Oct 15). Scion is Anthropic's server-centric replacement for Git, built in ~5 months to handle their monorepo going from ~2.5k merges/day in May to >30k/day by September. Design principles include: always-online clients, source-control-as-an-API, post-merge CI replacing merge-queue global locks, "superfan" Claude agents watching one component each for telemetry drift.

**Current state (verified):** The harness is solo-maintained; `git log --oneline -30` shows <2 commits/day average on main. There is no monorepo, no CI telemetry fan-out, no component watchers. The harness uses Claude Code's built-in `.claude/worktrees/agent-<id>/` worktree convention (per CLAUDE.md) and git's standard post-push PR flow.

**Why reject:** The scale gap is three orders of magnitude. Scion's architectural choices (server as authority, no local clones, API queries over checkouts) only start paying off when human-reviewer latency dominates — not relevant for a solo repo. The "superfan agent per component" idea is interesting but presumes >10 components with their own telemetry streams; the harness has one.

**One pattern worth watching (not applying):** Scion's "humans review *intent*, not every line" matches the harness's existing `code-reviewer` subagent + /code-review skill, which already does the find-real-bugs-not-nits adversarial review. That alignment is confirmation the harness is on a defensible path, not a prompt to change anything.

**Verify before applying:** N/A — the scale gap makes this reject-stable across time. Re-evaluate only if the harness transitions from solo to multi-maintainer with >5 maintainers merging in parallel.

**Recommended verdict:** reject — architectural bet, not harness-scale.
**Status:** PENDING — awaiting triage in PR review

---

## 10. Pin agentskills.io / GitHub links for future vendor-neutral rebrand

**Source:** "Donating Agent Skills to the Agentic AI Foundation" — https://www.anthropic.com/news/donating-agent-skills-to-the-agentic-ai-foundation (Oct 22, 2026). Anthropic donated the Agent Skills standard (SKILL.md format + folder structure + supporting scripts) to AAIF (under Linux Foundation; co-founded by Anthropic, Block, OpenAI). Donation includes the `agentskills.io` domain and GitHub organization. No format changes announced; versioned releases and a formal proposal process are planned but not yet active. David Soria Parra and Mahesh Murag named as Lead Maintainers.

**Current state (verified):** The harness ships SKILL.md files in `skills/<name>/SKILL.md` with the current Anthropic Agent Skills format. `grep -rn "agentskills.io\|anthropics/skills" skills/ docs/ AGENTS.md | head` — checks whether the harness references the governance URLs. If any references exist, they may need a redirect once AAIF migrates.

**Why defer:** Anthropic has explicitly said no format changes. The donation is governance-only right now. The actionable moment is when AAIF publishes a migration notice for the domain / GitHub org — not before. Monitoring is passive.

**Expected payoff:** Prevents a future link-rot wave on consumer projects that `setup-harness`-installed from the old URLs.

**Verify before applying:** `curl -sS https://agentskills.io` and `gh api repos/agentskills/* 2>&1 | head` at check-in time — if either has moved, that's the trigger.

**Recommended verdict:** defer until AAIF publishes a migration notice.
**Status:** PENDING — awaiting triage in PR review

---

## Skipped posts (in-scope but not actionable)

| Post | URL | Reason skipped |
|---|---|---|
| JPMorganChase expands Claude Code | https://claude.com/resources/articles/jpmorganchase-expands-claude-code (Nov 9, 2026) | Customer PR. Only concrete claims are governance (staged access, Devspace sandboxing, verification gates) with no reproducible pattern. |
| AI for Science expands to foundations and research institutions | https://www.anthropic.com/news/ai-for-science-expands-foundations-research-institutions (Oct 28, 2026) | Grant-program announcement. No harness surface. |
| Barclays scales Claude to upgrade operations | https://www.anthropic.com/news/barclays-scales-claude (Oct 1, 2026) | Customer PR. No methodology content. |
| Expanding partnership with GSA | https://www.anthropic.com/news/expanding-partnership-gsa (Oct 27, 2026) | Government partnership announcement. No harness surface. |
| Anthropic files S-1 with the SEC | https://www.anthropic.com/news/s1-sec (Oct 26, 2026) | Corporate-finance announcement. No harness surface. |

Additional out-of-scope (news/research unrelated to Claude Code, not counted toward the 15-post cap): drug development research, open call for guest investigators, Christopher Stubbs LTBT appointment, Public Benefit Fund, update on independent evaluators, 2026 US midterms prep, Singapore office opening, distillation defenses, Anthropic Cyber Mission, 2026 Usage Policy update, Genesis Mission commitment, Cyber Verification Program expansion, Frontier Academy $100M investment.
