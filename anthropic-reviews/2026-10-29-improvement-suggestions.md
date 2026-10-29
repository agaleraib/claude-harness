# 2026-10-29 — Anthropic post review

Covers posts since the tracker's last entry (2026-05-10). The gap is unusually long (~5½ months); this run honors the 15-post cap and prioritizes posts most likely to affect the harness. Enterprise/vertical/marketing posts, finance news, and policy items from this window are skip-with-reason in the tracker.

The highest-leverage item is **§3** (the subagent-folding guidance) — it questions the exact orchestrator-worker shape the harness ships, and deserves a design pass before the next orchestrator change. Model-pin updates (§5) are the next most actionable, and should be bundled as one `/micro`.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Add "resolve symlinks before path validation" + "treat allowlists as capability grants" to the git-hook denylist review | defer | May 25 containment post reinforces live hook work; no urgent gap |
| 2 | Pin skills-spec compatibility to a known AAIF revision in `skills/README` | defer | AAIF versioning not yet published; wait for spec v1 |
| 3 | Spec-driven re-evaluation of orchestrator subagent fan-out vs. skill-tool consolidation | spec | Oct 22 "fold subagents" post directly contradicts the orchestrator-worker shape — needs design pass, not a mechanical edit |
| 4 | Note the Scion engineering post as a prior-art citation in `docs/specs/.../universal-harness-protocol-v2.md` | reject | Interesting read but no concrete harness surface |
| 5 | Bump `.harness-profile` model pins from Opus 4.7 + Sonnet 4.6 to Opus 5.5 + Sonnet 5.5 (with explicit fallback chain) | apply | Opus 5.5 (Sep 22) + Sonnet 5.5 (Sep 28) both released; session metadata already shows Opus 5.5 in the fallback chain |
| 6 | Add Haiku 5.5 as an optional "cheap tier" model routing lane in orchestrator | defer | Haiku 5.5 is attractive for subagent fan-out, but orchestrator currently has no cheap-tier policy; couple with §3 decision |

---

## 1. Add two containment lessons to the git-hook denylist review

**Source:** [How we contain Claude across products](https://www.anthropic.com/research/how-we-contain-claude) (Anthropic Engineering, 2026-05-25)

**Context:** The harness ships a global git-hook dispatcher (merged in commit `e0328b8`, feat/global-git-hooks) with a secret-scan + mass-delete-block + profile-gate design. That dispatcher is close in spirit to the two containment principles called out in the post:

> "Treat allowlists as capability grants, not just destination filters. Allowing a trusted domain also allows every function reachable through it."
> "Symlinks and mount modes matter. Resolve symlinks before path validation."

**Concrete suggestion:**

- Add a short "What to avoid" box to the global-git-hooks skill (or its README) with two bullets:
  - *Treat path allowlists as capability grants.* A path allowlist that lets a hook run on `~/project/**` also grants write access to anything a symlink inside that tree points to. If a hook is going to accept symlinked paths, resolve them (`realpath -e`) before matching against the allowlist.
  - *Resolve symlinks before path validation.* Mass-delete / secret-scan matchers should see the resolved path, not the symlink name, so that `rm -rf docs → ../../etc` can't dodge the match by routing through a symlink.
- Separately, mirror the May 25 post's lesson in `AGENTS.md` §Memory or wherever the harness documents "what we validate on":
  - *Don't trust project-local config before consent.* The harness installs skills via symlink to `~/.claude/skills/`; a target project could ship a `.claude/settings.json` with hooks that run before the user accepts the trust dialog. If the dispatcher ever adds project-local matchers, defer them to post-trust.

Payoff: the lessons apply directly to the harness's two concrete hook surfaces (global dispatcher + `~/.claude/skills/` symlink fan-out). Low-cost edit, documents constraints that are easy to break on the next hook change.

**Verify before applying:** Run `grep -nR "realpath\|resolve.*symlink\|allowlist" scripts/global-git-hooks* skills/*/SKILL.md | head` — if the suggestion is already in place in a global-git-hooks skill, drop this §. Also check whether `.claude/settings.json` has a `permissions.defaultMode` or hook block that would surface before the trust dialog.

**Recommended verdict:** defer — May 25 engineering post is 5 months old; this reinforces existing hook work rather than introducing a new mechanism. Pick up only when the next hook change is scheduled.
**Status:** PENDING — awaiting triage in PR review

---

## 2. Pin a known Agent Skills spec revision in the skills index

**Source:** [Donating Agent Skills to the Agentic AI Foundation](https://www.anthropic.com/news/donating-agent-skills-to-the-agentic-ai-foundation) (Anthropic News, 2026-10-22) · spec at [agentskills.io](https://agentskills.io) · [GitHub: agentskills/agentskills](https://github.com/agentskills/agentskills)

**Context:** The Agent Skills name, domain, and GitHub org were donated to the Agentic AI Foundation (Linux Foundation). More than 70 agent platforms integrate the format already. Anthropic says versioned releases, a formal proposal process, and security guidance are *proposed next steps, not yet in place*. This repo's `skills/` directory is the source of truth for every skill it ships (via symlink to `~/.claude/skills/`), and the SKILL.md convention is 1:1 with Anthropic's.

**Concrete suggestion:**

- Add a one-line "Spec compatibility" note to the skills index (`skills/README.md` if it exists, otherwise `CLAUDE.md` §"Skills directory layout"), pinning the SKILL.md format to the Anthropic-maintained spec snapshot that was current when the harness last touched the format. Example:

  > SKILL.md files in this repo follow the Agent Skills format as published by Anthropic in Dec 2025, now stewarded by the Agentic AI Foundation (agentskills.io). The AAIF has proposed a versioning scheme but not yet shipped v1 — until then, this repo tracks whatever ships in Anthropic's `anthropics/skills` repo. Revisit when AAIF publishes v1.

- Open an issue placeholder (in `parking_lot.md`) with a `[auto-ok]` tag: "Audit skills against AAIF v1 spec when published."

Payoff: future-proofing. Zero migration cost today, but a durable breadcrumb for the day the spec diverges.

**Verify before applying:** Run `curl -sS https://agentskills.io/spec/v1 2>&1 | head -5` (or check the GitHub repo tags) — if a v1 spec has shipped, this § becomes a real migration audit instead of a parking-lot placeholder. Also `grep -R "AAIF\|agentskills.io\|Linux Foundation" skills/ CLAUDE.md AGENTS.md` to confirm no prior citation.

**Recommended verdict:** defer until the AAIF ships a versioned v1 spec — pure speculation to pre-adopt right now.
**Status:** PENDING — awaiting triage in PR review

---

## 3. Spec-driven re-evaluation of orchestrator subagent fan-out vs. skill-tool consolidation

**Source:** [Building agents: When to fold subagents into your main agent loop](https://claude.com/resources/articles/building-agents-when-to-fold-subagents-into-your-main-agent-loop) (Diane Sarkis, Anthropic Applied AI, 2026-10-22)

**Context:** The harness ships an **orchestrator agent** (`.claude/agents/orchestrator.md`) whose first line reads *"Runtime orchestrator that reads spec tasks and dispatches each to opus, sonnet, or haiku subagents based on task complexity"* and whose system prompt explicitly cites Anthropic's orchestrator-worker pattern. The harness also dispatches `code-reviewer`, `generator`, `spec-planner`, `project-tracker`, `ui-evaluator`, and `Plan` as subagents (6 agent files in `.claude/agents/`). The Oct 22 post directly questions this shape:

> "Many enterprise agents performed better as one loop with skills and tools than as an orchestrator coordinating many subagents. Subagents still have a place, but teams often overuse them, so the architecture ends up mirroring the org chart."
> "In the Applied AI team's comparisons, a single agent with skills often beat both single-prompt and subagent designs on quality, usually at lower cost and latency per task."
> "One customer measured roughly 2x faster runtime with a single loop than with its multi-agent harness."

The post's decision checklist is directly applicable to each of the harness's six subagents:

| Subagent | Does it need to speak to user? | Needs parallelism / isolated context? | Independent research path or black-box verifier? | Likely verdict |
|---|---|---|---|---|
| `orchestrator` | yes (status output) | yes (dispatches concurrently) | no | keep |
| `code-reviewer` | no (returns findings) | no (one-shot) | yes (black-box verifier) | keep |
| `generator` | partially | sometimes | no | **candidate to fold** → become a skill (`/generate` + tools) |
| `spec-planner` | yes (asks discovery questions) | no | no | keep |
| `project-tracker` | no | no | no (filesystem bookkeeping) | **candidate to fold** → become a skill-plus-MCP-tool |
| `ui-evaluator` | no | yes (Playwright isolation) | yes (black-box verifier) | keep |

**Concrete suggestion:**

- Open a spec via `/spec-planner` titled roughly `docs/specs/2026-10-29-orchestrator-subagent-audit.md` with the following discovery questions already seeded:
  1. For each of the six `.claude/agents/*.md` files, score against the Oct 22 checklist. Which pass "needs isolated context or parallelism"?
  2. Measure baseline: pick 2–3 representative waves from `docs/plan.md`, time an orchestrator-driven run vs. a hypothetical single-loop run with skills + tools. (Rough proxy: wall-clock of the last three `/run-wave` sessions in `.harness-state/orchestrator.jsonl`.)
  3. Identify which subagents could become skills with no quality loss. `generator` is the leading candidate (it's not framed adversarially, doesn't need isolated context, and chains with `code-reviewer` already).
  4. Document the governance split the post recommends: "a small central team should own the system prompt and end-to-end quality, and vet new tools, skills, and evals." For solo-maintained harness this collapses to "the maintainer owns the orchestrator prompt; skills get added freely."
- The spec must *not* produce a mechanical refactor — the post is clear that folding without an eval first is dangerous. The spec should produce (a) a 10-example golden eval of harness tasks (echoes 2026-04-19 §5 which is still deferred), then (b) a staged fold plan.

Payoff: directly addresses an architectural assumption the harness has carried since Wave 1. If even one subagent folds into a skill, the orchestrator's dispatcher gets simpler and runs faster. The downside risk is pure effort — the spec might conclude "keep all six," which is still useful information.

**Verify before applying:** Run `ls .claude/agents/*.md | wc -l` (should still be 6+) and `grep -c "subagent_type" skills/run-wave/SKILL.md skills/planning-loop/SKILL.md` to confirm the orchestrator-worker pattern is still live. If the orchestrator has already been folded into a single-loop design, drop this §.

**Recommended verdict:** spec — architectural call, needs discovery pass before any code change. Couples with the still-deferred 2026-04-19 §5 (agent evals / golden fixtures), which is the eval harness §3 would need to run on.
**Status:** PENDING — awaiting triage in PR review

---

## 4. Scion / Antique engineering post as prior-art citation

**Source:** [Redesigning source control at Anthropic](https://www.anthropic.com/research/redesigning-source-control) (Anthropic Engineering, 2026-10-13)

**Context:** Anthropic's internal merge rate rose from 2,500/day (May 2026) to 30,000/day (Sep 2026). They built Scion (server-centric VCS) and Antique (code review). The post has three ideas that *could* scale down to a solo harness repo (content-addressed artifacts, append-only state, invariant-preserving rewrites) but each is already a one-liner in `AGENTS.md` or `.harness-state/orchestrator.jsonl`.

**Concrete suggestion (rejected):** None actionable at harness scale. The post's lessons target 100-engineer-plus monorepos with daily agent-merge rates in the thousands. Adopting any of its concrete artifacts (changeset log, derived indexes, tiered caching) would be LARP-ing the shape of a big-company problem the solo harness doesn't have.

The one piece worth bookmarking is the point that **invariants should be documented before refactoring** — but AGENTS.md and the per-session `.harness-state/` already carry this discipline. No change proposed.

**Verify before applying:** Run `grep -n "invariant\|Scion\|Antique\|content.addressed" AGENTS.md CLAUDE.md docs/specs/*.md` — if the current docs already cite invariant-preservation, drop this §. (As of 2026-10-29 they do: see AGENTS.md "What to avoid".)

**Recommended verdict:** reject — nothing to ship. The one portable lesson (document invariants) is already in `AGENTS.md`.
**Status:** PENDING — awaiting triage in PR review

---

## 5. Bump `.harness-profile` model pins to the 5.5 family

**Source:**
- [Introducing Claude Opus 5.5](https://www.anthropic.com/news/claude-opus-5-5) (2026-09-22) — model id `claude-opus-5-5`
- [Introducing Claude Sonnet 5.5](https://www.anthropic.com/news/claude-sonnet-5-5) (2026-09-28) — model id `claude-sonnet-5-5`

**Context:** `.harness-profile` currently pins:

```yaml
model:
  primary: claude-opus-4-7
  fallback: claude-sonnet-4-6
```

Both pins are now one major version behind. Three facts to note:

- The session metadata attached to this run (per the harness session banner) shows the Claude Code configured fallback chain is already `claude-opus-4-7` → `claude-opus-5-5[1m]` → `claude-opus-5[1m]`. So Opus 5.5 is already production-reachable in this environment, just not pinned at the profile level.
- Opus 5.5 is roughly 20% cheaper than Opus 5 on input/output, 60% cheaper on cache reads, and ~30% faster. Pricing: $4/$20 per MTok (vs. prior) plus cheaper cache ($0.20 read, $5 write).
- Opus 5.5 "no longer available with thinking mode switched off." For the harness this is a no-op — all skills either use default (thinking on) or explicitly set `effort`, never "off."
- Sonnet 5.5 is ~30% faster, prices per-token unchanged from 5.0 ($2 input / $10 output). Note: *if* the harness ever ran Sonnet with thinking off, the migration guide calls out moving to `between_tools`. Grep returns zero hits for `thinking_mode\|thinking.*off` in the harness, so safe.

**Concrete suggestion:**

- Edit `.harness-profile`:
  ```diff
   model:
  -  primary: claude-opus-4-7
  -  fallback: claude-sonnet-4-6
  +  primary: claude-opus-5-5
  +  fallback: claude-sonnet-5-5
     effort_default: xhigh
  ```
- Add a two-line comment above the block noting the model-ID chain the Claude Code runtime falls back through, so a reader doesn't have to spelunk the Claude Code docs:
  ```yaml
  # 2026-10-29: Opus 5.5 shipped 2026-09-22; Sonnet 5.5 shipped 2026-09-28.
  # Opus 5.5 forces thinking-on, which the harness already relies on; no code change needed.
  ```
- Grep for any skill or doc that hard-codes `claude-opus-4-7` or `claude-sonnet-4-6` outside `.harness-profile` and update in lockstep. Current hits: 8 files.
- Leave the previous model IDs *only* in `anthropic-reviews/*.md` (immutable history) and `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md` (spec provenance). All other hits should migrate.

Payoff: faster + cheaper per-task cost on every harness run, with no code change beyond text pins. The post's claim is ~30% faster + ~20% cheaper for Opus 5.5 vs. Opus 5, and Opus 4.7 is older still.

**Verify before applying:** Run `grep -nR "claude-opus-4-7\|claude-sonnet-4-6" .harness-profile skills/ docs/specs/ 2>&1 | grep -v anthropic-reviews` — the hit set is the file set to migrate. If `.harness-profile` already pins the 5.5 family (someone bumped it between runs), drop this §. Also verify Opus 4.7 is still a valid fallback (`curl -sS https://platform.claude.com/docs/en/release-notes/overview | grep -i "claude-opus-4-7"`) before fully removing it from the chain — a safer first step is to keep 4.7 as a tertiary fallback until 5.5 has baked for a week.

**Recommended verdict:** apply — mechanical text update, low risk, immediate payoff. `/micro` candidate. Stage over one `/commit`.
**Status:** PENDING — awaiting triage in PR review

---

## 6. Add Haiku 5.5 as an optional cheap-tier routing lane in the orchestrator

**Source:** [Introducing Claude Haiku 5.5](https://www.anthropic.com/claude-haiku-5-5) (2026-10-07) — model id `claude-haiku-5-5`

**Context:** The orchestrator agent routes between "opus / sonnet / haiku subagents based on task complexity" per its system prompt, but a grep of the harness turns up no `claude-haiku` pin anywhere. Haiku 5.5 is "the cheapest, fastest, and most capable small model" (Anthropic's words), 75% cheaper on average than Haiku 4.5, and is the first Haiku-class model with an adjustable effort setting. Anthropic positions it as a sidekick to Opus 5.5 (e.g. Cognition's Devin CLI uses Opus 5.5 lead + Haiku 5.5 sidekick).

Pricing (per MTok, ≤100k input / >100k input):
- Input: $0.10 / $0.50
- Output: $0.50 / $2.50
- Cache reads: $0.01 / $0.05

That is ~40× cheaper than Opus 5.5 on input, ~40× on output.

**Concrete suggestion:**

- Add an optional `haiku_tier` field to `.harness-profile` under `model:` that the orchestrator checks before routing:
  ```yaml
  model:
    primary: claude-opus-5-5
    fallback: claude-sonnet-5-5
    cheap_tier: claude-haiku-5-5   # optional; orchestrator routes here for low-stakes mechanical tasks
    effort_default: xhigh
  ```
- Teach the orchestrator (`.claude/agents/orchestrator.md`) that `cheap_tier` is for mechanical/parallelizable work: renames, mass-grep-and-replace, filesystem bookkeeping, status-line regeneration. **Not** for anything the orchestrator or `code-reviewer` would need to catch regressions on.
- Gate this behind `/project-init`: for a solo harness with stakes-medium, cheap_tier is opt-in; don't flip on by default.

**Caveat (why defer):** This change compounds with §3 — if the audit folds `generator` or `project-tracker` into skills, those are precisely the subagents a Haiku lane would have targeted, and the whole lane becomes moot. Don't ship this before the §3 spec answers which subagents stay.

**Verify before applying:** Run `grep -n "haiku\|cheap_tier\|low.stakes" .harness-profile .claude/agents/orchestrator.md skills/project-init/SKILL.md` — if a cheap-tier model routing already exists, drop this §. Also re-check whether §3's spec concluded the orchestrator-worker pattern survives at all; if the spec folded the orchestrator into a single loop, there's no routing lane to add Haiku to.

**Recommended verdict:** defer — attractive on its own but coupled with §3. Pick up only after §3's spec resolves which subagents survive.
**Status:** PENDING — awaiting triage in PR review
