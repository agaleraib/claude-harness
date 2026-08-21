# Anthropic post review — 2026-08-21

First review since 2026-05-10 (~3-month gap). Discovery capped at 15 in-scope posts per the routine. The gap covers the entire Claude 5 family launch (Opus 4.8 → Fable 5 → Sonnet 5 → Opus 5) plus two engineering posts (`dynamic workflows`, `new rules of context engineering`) that speak directly to the harness's philosophy.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Refresh `model.primary` / `model.fallback` — pin Claude 5 family | apply | `.harness-profile` + `project-init` template + `orchestrator.md` all reference `opus-4-7` / `sonnet-4-6`; four successor models have shipped (Opus 4.8, Sonnet 5, Opus 5, Haiku 4.5) and the run-loop already reviews on `opus-4.8` — harness-internal drift. |
| 2 | Cite *The new rules of context engineering for Claude 5* in README "Why Not Superpowers" | apply | First-party evidence: Anthropic removed 80% of Claude Code's system prompt for Claude 5. Reinforces the harness's core "keep context lean" thesis. |
| 3 | Cite *Steering Claude Code: when to use CLAUDE.md, skills, hooks, and subagents* in README | apply | Anthropic-authored decision matrix for the exact question the harness's architecture answers. One link, one sentence — improves discoverability of the underlying reasoning. |
| 4 | Reconcile `orchestrator` agent with native `Workflow` tool (dynamic workflows) | spec | Claude Code shipped a first-party parallel-subagent orchestration primitive (June 2). Overlaps with `orchestrator`'s parallel-worktree fan-out. Interop story needs a design pass — not a `/micro` edit. |
| 5 | Cite *Claude Code effort level and model selection* in `orchestrator.md` | apply | Anthropic-authored guidance on the exact `effort × model` matrix the orchestrator implements. Cheap cross-reference, useful for future readers. |
| 6 | Cite *Loop engineering: Getting started with loops* in `run-loop/SKILL.md` | apply | Anthropic's taxonomy (manual / time-based / verification) validates run-loop's design; one link. |
| 7 | Reference *Building a C compiler with parallel Claudes* in README multi-agent section | defer | Bookkeeping. Only interesting if orchestrator ever formalizes cross-agent locking; current worktree isolation is sufficient. |

---

## §1 — Refresh `model.primary` / `model.fallback` and the orchestrator routing table for the Claude 5 family

**Sources (bundled — five model announcements between 2026-05-28 and 2026-07-24):**
- [Introducing Claude Opus 4.8](https://www.anthropic.com/news/claude-opus-4-8) (2026-05-28)
- [Claude Fable 5 and Claude Mythos 5](https://www.anthropic.com/news/claude-fable-5-mythos-5) (2026-06-09)
- [Introducing Claude Sonnet 5](https://www.anthropic.com/news/claude-sonnet-5) (2026-06-30)
- [Introducing Claude Opus 5](https://www.anthropic.com/news/claude-opus-5) (2026-07-24)
- [Introducing Claude Haiku 4.5](https://www.anthropic.com/news/claude-haiku-4-5)

**What's out of date:**

Three files hard-code the pre-Claude-5 model IDs:

1. `/home/user/claude-harness/.harness-profile:30-32`
   ```yaml
   model:
     primary: claude-opus-4-7
     fallback: claude-sonnet-4-6
   ```
2. `/home/user/claude-harness/skills/project-init/SKILL.md:152-153, 206-207` — same defaults, seeded into every new project via `/project-init`.
3. `/home/user/claude-harness/.claude/agents/orchestrator.md:144-152, 245-262` — the routing table names `haiku-4.5` (current), `sonnet-4.6` (superseded by Sonnet 5), `opus-4.7` (superseded by Opus 4.8 → Opus 5), and the escalation ladder + Case C threshold both reference `opus-4.7`.

**Harness-internal drift already exists:** `skills/_shared/loop/dispatch/review.ts:127` defaults the run-loop reviewer to `claude-opus-4-8`, and the live-test runbook (`skills/_shared/loop/test/live-test-runbook.md`) records a 2026-06-15 clean-room drain against `opus-4.8`. So one lane of the harness has already moved past Opus 4.7 while the profile pin has not.

**Proposed changes (one file per bullet, all `/micro`-sized text edits):**

- **`.harness-profile`** — bump to:
  ```yaml
  model:
    primary: claude-opus-5           # was claude-opus-4-7
    fallback: claude-sonnet-5        # was claude-sonnet-4-6
    effort_default: xhigh
  ```
  Or, if the maintainer prefers a conservative one-step bump for cost / behaviour-drift reasons, `claude-opus-4-8` + `claude-sonnet-5`. Opus 4.8 fixes the "comment verbosity + tool-calling" regressions Anthropic acknowledged in the 4.7 postmortem and matches what run-loop already runs. Opus 5 is the newer default on Claude Max.

- **`skills/project-init/SKILL.md`** — update lines 152, 206, and the "Aligned with Anthropic's 2026-04-23 postmortem (Claude Code defaults Opus-4.7 users to xhigh)" comment (line 202). The postmortem still stands as evidence for the derivation but the model name it references is now historical; either drop the model name or bump to "Claude Code defaults Claude 5 users to `xhigh`" per current effort docs.

- **`.claude/agents/orchestrator.md`** — rename in the routing table (lines 144-152), the escalation ladder (245-246), and Case C (258-262). Table rows should read `haiku-4.5 → sonnet-5 → opus-5` (or `opus-4.8` for the cautious variant). Case C's escalation threshold `opus-4.7 + xhigh` becomes `opus-5 + xhigh`.

**Bundling note:** these three edits are one logical bump (three files, no logic change, no schema change). Decompose per README §"Decompose first, then route": all three bullets are `/micro`-sized text edits — no promotion signal fires. Batch them in a single `/micro` if applied.

**Expected payoff:** eliminates harness-internal drift between the run-loop reviewer (opus-4.8, live) and the profile pin (opus-4-7, stale). New consumer projects onboarded via `/project-init` get a current-generation default instead of a two-quarter-old model. Removes the mismatch a reader spots on day one.

**Verify before applying:**
```bash
grep -n 'claude-opus-4-7\|claude-sonnet-4-6\|opus-4\.7\|sonnet-4\.6' \
  .harness-profile skills/project-init/SKILL.md .claude/agents/orchestrator.md
```
If any hit remains, this § is still live. If all three files reference Claude 5 IDs, drop.

**Recommended verdict:** apply — three concrete text edits, no schema change, aligns pin with what run-loop already uses.
**Status:** PENDING — awaiting triage in PR review

---

## §2 — Cite *The new rules of context engineering for Claude 5 generation models* in README "Why Not Superpowers"

**Source:** [The new rules of context engineering for Claude 5 generation models](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models) (2026-07-24)

**Why this matters:** Anthropic removed **over 80%** of Claude Code's system prompt for Claude 5 models and explicitly identified "over-constraining Claude Code through both the system prompt and CLAUDE.md files" as a live problem. This is first-party, current-generation evidence for the harness's foundational "keep context lean" thesis — it belongs in the README's evidence list right alongside the April-23 postmortem and the AGENTbench arXiv row.

**Concrete change:** append one bullet to `README.md:23-32` (the "Why Not Superpowers / Heavy Skill Systems?" list). Suggested text:

```markdown
- **Anthropic removed 80%+ of Claude Code's system prompt for Claude 5**: The 2026-07-24 [context-engineering post](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models) names "over-constraining Claude Code through both the system prompt and CLAUDE.md files" as a live regression source. Confirms first-party that the "lean context" thesis compounds with each model generation, not just Opus 4.7.
```

**Expected payoff:** the "Why Not Superpowers" section is the harness's central argument. Every fresh first-party evidence row shortens the time-to-conviction for a new reader.

**Verify before applying:**
```bash
grep -n 'new rules of context engineering\|context-engineering-for-claude-5' README.md
```
Empty output = still needed.

**Recommended verdict:** apply — one bullet in a list that already links four supporting sources.
**Status:** PENDING — awaiting triage in PR review

---

## §3 — Cite *Steering Claude Code: when to use CLAUDE.md, skills, hooks, and subagents* in README architecture section

**Source:** [Steering Claude Code: when to use CLAUDE.md, skills, hooks, and subagents](https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more)

**Why this matters:** the README's architecture section (`README.md:38-131`) implicitly answers "when does a new pattern go in CLAUDE.md vs skill vs hook vs subagent?" — the same question this Anthropic post explicitly names. Adding a link gives readers the first-party decision matrix without asking them to reconstruct it from the harness's directory layout. The post also names seven mechanisms (CLAUDE.md, rules, skills, subagents, hooks, output styles, appending the system prompt) — some the harness uses, some it deliberately doesn't. Cross-referencing sharpens the "what this is / what this is NOT" framing at `README.md:14-22`.

**Concrete change:** add one line to `README.md:38` (the "## Architecture" opener) or under the "Scope Rules" table. Suggested phrasing:

```markdown
Anthropic's [Steering Claude Code](https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more) post is the first-party decision matrix for the seven Claude Code steering mechanisms (CLAUDE.md, rules, skills, subagents, hooks, output styles, system-prompt append) — the harness intentionally uses four of them (CLAUDE.md, skills, subagents, hooks) and skips the other three; see below for the split.
```

**Expected payoff:** one link that answers "why does this harness use skills for X but hooks for Y?" for every future reader.

**Verify before applying:**
```bash
grep -n 'steering-claude-code\|Steering Claude Code' README.md AGENTS.md
```
Empty output = still needed.

**Recommended verdict:** apply — one sentence, one link.
**Status:** PENDING — awaiting triage in PR review

---

## §4 — Reconcile `orchestrator` agent with Claude Code's native `Workflow` tool

**Source:** [A harness for every task: dynamic workflows in Claude Code](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code) (2026-06-02)

**What shipped:** Claude Code now exposes a `Workflow` tool that lets Claude write a JavaScript orchestration script on the fly — spawning subagents in parallel, routing by model, running each in its own worktree, and pipelining results — all in the background while the main session stays responsive. This is a native, first-party primitive for the exact use case the harness's `orchestrator` agent implements: parallel-worktree fan-out with model routing.

**The overlap (concrete):**
| Capability | Harness `orchestrator` (custom subagent) | Claude Code `Workflow` tool (native) |
|---|---|---|
| Parallel subagent dispatch | Yes (via worktrees) | Yes (via `parallel()` / `pipeline()`) |
| Runtime model routing | Yes (haiku / sonnet / opus decided per task) | Yes (`opts.model` per `agent()` call) |
| Worktree isolation | Yes (per-task) | Yes (`isolation: 'worktree'`) |
| Spec-anchored ("read spec → dispatch tasks") | Yes — reads `docs/specs/*` | No — arbitrary script |
| Per-task `/commit` chain | Yes (code-reviewer + plan.md + spec checklist) | No — bring your own |
| Foreground vs background | Foreground (blocks main session) | Background (main session stays responsive) |

**Why this is a `spec`-shaped question, not a `/micro`:**

The harness's `orchestrator` agent is *spec-shaped* — it dispatches from `docs/specs/*` with a wave-anchored `/commit` chain after each task. Claude Code's Workflow tool is *ad-hoc-shaped* — Claude writes the script live for one fan-out. They are not one-for-one substitutes. The interesting design question is which one wins in each case:

- One-shot big fan-outs (10+ parallel checks, single-purpose sweeps): Workflow tool likely wins — it's background, no wave ceremony, no plan.md updates.
- Spec-anchored implementation waves: `orchestrator` still wins — the `/commit` chain and `docs/plan.md` bookkeeping are the whole point.
- Middle ground (a wave with mostly-parallel tasks): unclear.

Deciding requires reading the Workflow tool docs (`Workflow` tool schema in your session prompt) and the `orchestrator` agent side-by-side, then picking either (a) "orchestrator delegates to Workflow tool for the fan-out step of a wave", (b) "orchestrator stays the sole spec-anchored dispatcher, Workflow is for ad-hoc", or (c) something the current thinking hasn't surfaced.

**Concrete change:** none until specced. In the interim, add a note to `.claude/agents/orchestrator.md` (probably under §"Parallel execution", `README.md:590-593`) linking the post and saying "Anthropic shipped a native `Workflow` tool for ad-hoc parallel-subagent orchestration in June 2026; interop story for spec-anchored waves is TBD."

**Expected payoff:** avoid drift where a user reaches for `Workflow` mid-wave, bypasses the `/commit` chain, and ends up with orchestrator-shaped state (worktrees, receipts) missing.

**Verify before applying:**
```bash
grep -n 'dynamic workflow\|Workflow tool\|a-harness-for-every-task' \
  .claude/agents/orchestrator.md README.md
```
Empty output = still worth deciding.

**Recommended verdict:** spec — design pass via `/spec-planner` to decide the interop story. Then the resulting edits (probably a paragraph in the orchestrator doc + a README note) become `/micro`-sized.
**Status:** PENDING — awaiting triage in PR review

---

## §5 — Cite *Claude Code effort level and model selection* in `.claude/agents/orchestrator.md`

**Source:** [Claude Code effort level and model selection](https://claude.com/blog/claude-model-and-effort-level-in-claude-code) (2026-07-07)

**Why this matters:** the orchestrator agent's routing table (`orchestrator.md:144-152`) is a per-task `effort × model` matrix that the harness invented before Anthropic published first-party guidance on the same question. Anthropic's post now spells out:

- Model selection = fixed weights / knowledge base (change when Claude has all context, tried, and still got it wrong).
- Effort = tools + files + steps + check-back cadence (change when Claude skipped a file, didn't run tests, or bailed early).

That's exactly the promotion logic the harness's orchestrator uses in Case A / B / C (`orchestrator.md:245-262`). A one-line cross-reference gives the routing table a first-party citation instead of leaving it as harness-original reasoning.

**Concrete change:** near the top of `orchestrator.md` (after the "How to Invoke" block, around line 15), add:

```markdown
The `effort × model` routing table below implements the same shape Anthropic
describes in [Claude Code effort level and model selection][effort-post]:
model = fixed-weights choice, effort = tool/file/step budget. Promote by the
same failure signal split (skipped-a-file → effort, still-wrong-with-context
→ model).

[effort-post]: https://claude.com/blog/claude-model-and-effort-level-in-claude-code
```

**Expected payoff:** future readers of the routing table land on the first-party rationale instead of reverse-engineering the split from the harness's promotion cases.

**Verify before applying:**
```bash
grep -n 'claude-model-and-effort-level-in-claude-code\|Claude Code effort level' \
  .claude/agents/orchestrator.md
```
Empty output = still needed.

**Recommended verdict:** apply — three-sentence cross-reference in one file.
**Status:** PENDING — awaiting triage in PR review

---

## §6 — Cite *Loop engineering: Getting started with loops* in `skills/run-loop/SKILL.md`

**Source:** [Loop engineering: Getting started with loops](https://claude.com/blog/getting-started-with-loops) (2026-06-30)

**Why this matters:** the harness ships `/run-loop` as its "third execution lane" (`skills/run-loop/SKILL.md:1-9`) but the doc doesn't situate it inside Anthropic's now-published loop taxonomy. The post names three loop types — manual, time-based, verification — and the harness already implements or interacts with all three (`/micro` = manual scoping; `/run-loop` + `/loop` = time-based; `/deploy-check` / `code-reviewer` = verification). One link gives run-loop a first-party framing without changing behaviour.

**Concrete change:** in the `## Overview` or `## When to use` section of `skills/run-loop/SKILL.md`, add:

```markdown
> Anthropic's [Loop engineering: Getting started with loops][loops-post] names
> three loop types — manual, time-based, verification. `/run-loop` is
> time-based (plan.md waves or gh issues); the harness's verification loops
> live in per-domain skills (`/deploy-check`, `/api-smoke-test`,
> `/migration-check`, `/a11y-check`, and the `code-reviewer` agent).
>
> [loops-post]: https://claude.com/blog/getting-started-with-loops
```

**Expected payoff:** future readers of `/run-loop` see how it fits into a broader Anthropic-authored framework instead of "another harness invention."

**Verify before applying:**
```bash
grep -n 'getting-started-with-loops\|Loop engineering' \
  skills/run-loop/SKILL.md
```
Empty output = still needed.

**Recommended verdict:** apply — one-block cross-reference, no behaviour change.
**Status:** PENDING — awaiting triage in PR review

---

## §7 — Reference *Building a C compiler with a team of parallel Claudes* in README multi-agent section

**Source:** [Building a C compiler with a team of parallel Claudes](https://www.anthropic.com/engineering/building-c-compiler)

**Why this matters (or doesn't):** Anthropic ran 16 parallel Claude Code sessions building a Rust-based C compiler that compiled Linux 6.9 on x86 / ARM / RISC-V, using a simple git-file-lock as the cross-agent synchronization primitive. The harness's `orchestrator` currently uses worktree isolation (no shared filesystem) to prevent cross-agent conflict. Adding a citation would be purely bookkeeping — the case study validates that parallel-Claude patterns work at scale, but the harness already handles cross-agent conflict a different way (worktrees) that doesn't need locking.

**Concrete change (if applied):** one line under the "Multi-agent coordination (2026 trend)" section of `README.md:1080-1092`:

```markdown
- Anthropic's [C-compiler case study](https://www.anthropic.com/engineering/building-c-compiler)
  ran 16 parallel Claudes with git-file-lock sync for ~$20k of API cost;
  the orchestrator's worktree isolation is a stricter form of the same idea.
```

**Why defer:** bookkeeping only. Would become interesting if the orchestrator ever moved from worktree isolation to shared-tree with file-locks (unlikely — worktrees are cleaner). Not worth spending a review round on today.

**Verify before applying:**
```bash
grep -n 'building-c-compiler\|C compiler' README.md
```

**Recommended verdict:** defer until orchestrator formalizes cross-agent locking — reference material, not a live design need.
**Status:** PENDING — awaiting triage in PR review

---

## Skipped posts (in-scope, tracker-only)

Recorded in `reviewed-posts.md` with per-row reason. Highlights:

- **Lessons from building Claude Code: How we use skills** (2026-06-03) — validates skills-as-folders pattern; harness already uses `skills/<name>/lib/`, `skills/<name>/references/`, `skills/<name>/evals/` (see `skills/planning-loop/`, `skills/harness-status/`). Reject as already-in-place.
- **Building verification loops in Claude Code with skills** — verification loops already implemented via `/deploy-check`, `/api-smoke-test`, `/migration-check`, `/a11y-check`, `code-reviewer`. Reject as already-in-place.
- **Claude Code supports artifacts** (2026-06-18) — could publish `/harness-status` as an artifact; speculative, no immediate need. Defer.
- **Building agents with the Claude Agent SDK** — SDK is a separate distribution surface (embed Claude into third-party apps); harness is Claude Code-bound. Defer until harness has a reason to embed.
