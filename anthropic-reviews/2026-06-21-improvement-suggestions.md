# Anthropic Post Review — 2026-06-21

Six weeks of Anthropic output (2026-05-11 → 2026-06-21) covering: **Claude Opus 4.8** (May 28), **dynamic workflows in Claude Code** (May 28), **Claude Fable 5 + Mythos 5** (June 9), the **"How we contain Claude across products"** engineering deep-dive, two Code w/ Claude conference recaps (SF May 12 / London May 26), and several customer/research pieces (CodeRabbit orchestration, HTML for outputs, Coding agents in social sciences, Project Glasswing update, CLUE).

The headline event for this harness is **Opus 4.8 + dynamic workflows**: Opus 4.8 (May 28) is shipped 41 days after 4.7 with cheaper fast-mode and an explicit "dynamic workflows" feature in Claude Code where Claude **writes its own per-task harness on the fly**. The companion engineering post — ["A harness for every task: dynamic workflows in Claude Code"](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code) — uses the word "harness" the same way this repo does, names six composable patterns (classify-and-act, fan-out-and-synthesize, adversarial verification, generate-and-filter, tournament, loop-until-done), and proposes `~/.claude/workflows/` as a save-and-distribute path. Three things flow from this:

1. The `.harness-profile` model pin is now one version behind a shipped Opus minor (§1).
2. Two posts (large-codebases + harness-for-every-task) explicitly frame Claude Code as *a harness with five extension points* (CLAUDE.md, hooks, skills, plugins, MCP servers) — first-party corroboration of this repo's framing, worth one line in `References` (§2).
3. The "How we contain Claude across products" piece is a first-party engineering treatment of the same problem space `sandcastle_mattpocock_architecture.md` reviewed empirically — worth a cross-reference (§3).

Claude Fable 5 + Mythos 5 (June 9, Mythos-class) are noted but deferred: Fable 5 access was suspended shortly after launch per public reporting (see Tracker note), and Mythos 5 is gated to cyberdefenders only. The `/ultracode` trigger + `~/.claude/workflows/` distribution path from the dynamic-workflows post is also deferred — no current workflow in this harness needs the fan-out shape that the new feature unlocks beyond what `/run-loop` already does (§4).

The Code w/ Claude SF/London/Tokyo recap posts and the bulk of the customer case studies are tracker-skipped with reasons.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Bump `.harness-profile` `model.primary` from `claude-opus-4-7` to `claude-opus-4-8` (and the README's five `Opus 4.7` mentions) | apply | Opus 4.8 shipped 2026-05-28; review backend (`skills/_shared/loop/dispatch/review.ts`) already uses it; primary pin and README copy are now stale. |
| 2 | Add two harness-framing posts to README `## References` (large-codebases + harness-for-every-task) | apply | First-party reuse of "harness" terminology + the five-extension-point framing this repo already implements — durable citation, zero churn. |
| 3 | Cross-reference "How we contain Claude across products" from `sandcastle_mattpocock_architecture.md` | apply | The Anthropic post is the first-party treatment of the same problem space the sandcastle review investigates empirically; pairs naturally. |
| 4 | Defer `/ultracode` trigger + `~/.claude/workflows/` distribution path | defer | Feature is real (`/loop`, `/goal`, `s` to save), but the harness already has `/run-loop` covering the unattended-fan-out shape. Revisit when a use-case-specific workflow recurs. |

---

## 1. Bump `.harness-profile` `model.primary` from `claude-opus-4-7` to `claude-opus-4-8` (and the five README `Opus 4.7` mentions)

**Source:** [Introducing Claude Opus 4.8 — Anthropic News, 2026-05-28](https://www.anthropic.com/news/claude-opus-4-8) — Opus 4.8 ships 41 days after Opus 4.7, with cheaper fast-mode (3× cheaper, 2.5× faster) and effort controls on claude.ai. The model ID is `claude-opus-4-8`. Public API endpoints, Claude Code (`/model` picker), Bedrock, Vertex, and Foundry all carry it.

**State on disk today:**
- `.harness-profile:30` → `primary: claude-opus-4-7`
- `.harness-profile:31` → `fallback: claude-sonnet-4-6`
- `README.md` line 3, 10, 25, 852, 891 → narrative copy says "Opus 4.7"
- `skills/project-init/SKILL.md:152` and `:206` → still emit `claude-opus-4-7` as the default `model.primary`
- `skills/_shared/loop/dispatch/backends.ts:88` and `dispatch/review.ts:127` → **already use `claude-opus-4-8`** for the review backend (the run-loop driver bumped ahead of the harness pin during Wave 21 live wiring)

**Recommended diff:**

`.harness-profile` (line 30):
```diff
 model:
-  primary: claude-opus-4-7
+  primary: claude-opus-4-8
   fallback: claude-sonnet-4-6
-  effort_default: xhigh   # derived from stakes.level: medium
+  effort_default: xhigh   # derived from stakes.level: medium (Opus 4.8 keeps xhigh as the product default)
```

`README.md`: replace the five "Opus 4.7" mentions with "Opus 4.8". The substantive line is line 30 (the postmortem citation), where "Opus 4.7 users to xhigh" should become "Opus 4.7/4.8 users to xhigh" since the postmortem itself is dated 2026-04-23 and predates 4.8 — keep both model versions in that one sentence so the citation stays accurate.

`skills/project-init/SKILL.md`: update the example default `model.primary: claude-opus-4-7` → `claude-opus-4-8` on lines 152 and 206.

**Expected payoff:** Eliminates the silent drift between the harness pin and the review backend that already uses 4.8. Stops the `Why Not Superpowers` evidence list from looking dated (a section about "Opus 4.7 performance" reads as stale six weeks after Opus 4.8 shipped). New consumer projects installing the harness via `setup-harness` get the current model in their generated `.harness-profile`.

**Risk:** The 2026-04-25 / 2026-04-27 review entries explicitly aligned `effort_default: xhigh` with the Opus 4.7 product default; Opus 4.8 retains the same default per the 4.8 release notes, so the derivation rule does not change. No spec rewrite needed.

**Scope:** trivial — one-file YAML edit + a multi-replace on the README + two project-init lines.

**Verify before applying:**
1. `grep -n 'primary: claude-opus-4-' /home/user/claude-harness/.harness-profile` — confirm line 30 still reads `claude-opus-4-7` (this § is stale if it already reads `4-8`).
2. `grep -nE 'Opus 4\.7|opus-4-7' /home/user/claude-harness/README.md` — confirm the five hit-lines listed above are still present.
3. Re-read Anthropic's [Opus 4.8 announcement](https://www.anthropic.com/news/claude-opus-4-8) to confirm the model ID is still `claude-opus-4-8` (and that 4.9 hasn't superseded it by the time you act).

**Recommended verdict:** apply — concrete, mechanical, eliminates real drift; review backend has already moved.

**Status:** PENDING — awaiting triage in PR review

---

## 2. Add Anthropic's two "harness" framing posts to README `## References`

**Sources:**
- [How Claude Code works in large codebases: Best practices and where to start](https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start) — Anthropic, May 14, 2026. Key passage: *"the ecosystem built around the model — the harness — determines how Claude Code performs more than the model alone, and is built from five extension points: CLAUDE.md files, hooks, skills, plugins, and MCP servers."*
- [A harness for every task: dynamic workflows in Claude Code](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code) — Anthropic, May 28, 2026. Defines a "harness" as *"the system around the model that decides how work gets split, which subagents spawn, what tools each one gets, how their output is verified, which model handles which step, how work is isolated, and when the job is actually done."*

**Why these two specifically:** the repo is **named** `claude-harness`, the philosophy section repeatedly uses "the harness" as a noun ("This harness keeps context overhead under 500 tokens at session start"), and the README's `## References` already cites Anthropic's earlier ["Harness Design for Long-Running Apps"](https://www.anthropic.com/engineering/harness-design-long-running-apps) (line 1111). Both new posts are first-party uses of *the same word* with *the same meaning* — they're the canonical citations for what this repo claims to be. The first article also enumerates the five extension points (CLAUDE.md / hooks / skills / plugins / MCP servers) the harness ships into `~/.claude/` — adding both citations makes the README's framing externally defensible.

**Recommended diff (`README.md`, after line 1117):**

```diff
 - [How We Built Our Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system) — Orchestrator-worker patterns, model routing
+- [How Claude Code works in large codebases: Best practices and where to start](https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start) — Anthropic, 2026-05-14. First-party naming of the five extension points the harness ships into `~/.claude/` (CLAUDE.md, hooks, skills, plugins, MCP servers).
+- [A harness for every task: dynamic workflows in Claude Code](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code) — Anthropic, 2026-05-28. Defines "harness" in the same sense this repo uses it; describes six composable patterns (classify-and-act / fan-out-and-synthesize / adversarial verification / generate-and-filter / tournament / loop-until-done) the orchestrator agent can be tuned against.
 - [Context Window Visualization](https://code.claude.com/docs/en/context-window) — Understanding what consumes your context
```

**Expected payoff:** Two durable citations that future readers can use to confirm the harness is implementing first-party patterns, not inventing terminology. Costs nothing at runtime (References section, not loaded into context). Strengthens the "Why Not Superpowers" stance by association with first-party material.

**Risk:** Vanishingly small. Both posts are on `claude.com/blog` and stable.

**Scope:** trivial — one README chunk, two new bullets.

**Verify before applying:**
1. `grep -n 'large-codebases-best-practices\|a-harness-for-every-task' /home/user/claude-harness/README.md` — must return nothing today; if either URL is present, this § is stale.
2. Re-fetch both URLs and confirm the framing language (five extension points / six patterns) is still in the body and not behind an edit that softens it.

**Recommended verdict:** apply — trivial documentation update, durable benefit.

**Status:** PENDING — awaiting triage in PR review

---

## 3. Cross-reference "How we contain Claude across products" from `sandcastle_mattpocock_architecture.md`

**Source:** [How we contain Claude across products](https://www.anthropic.com/engineering/how-we-contain-claude) — Anthropic Engineering, June 2026. The post is first-party reporting on the containment architectures shipped for the three Anthropic agentic products: claude.ai (ephemeral gVisor container, server-side, per-session FS, no host access), Claude Code (human-in-the-loop OS sandbox — reads allowed, writes confined to workspace, network denied by default), Claude Cowork (sealed local VM, only workspace + `.claude` mounted, credentials in host keychain). Key thesis: *"hard, deterministic boundaries like sandboxes, VMs, and egress controls have to come before probabilistic model defenses, because the model layer is never 100%."*

**Why pair with the sandcastle review:** `sandcastle_mattpocock_architecture.md` is the harness's empirical review of how `@ai-hero/sandcastle` solves the merge-and-isolation problem (commit `d7a41c8`, 2026-06-16). Anthropic's post covers the same problem space — agent containment and blast-radius bounding — from the first-party angle (three product surfaces, the design rationale for each). The two documents reinforce each other: sandcastle uses a host-side merge-to-HEAD model with no PR; Anthropic's Claude Code containment is a workspace-confined sandbox with network denied by default. Linking them lets a future reader (or future-you) understand both the third-party-tool angle and the first-party-platform angle in one hop.

**Recommended diff (`sandcastle_mattpocock_architecture.md`, after the existing provenance block around line 12):**

```diff
 This is pre-1.0 software; behavior may move. Code is treated as source of truth over docs/README.
+
+**Related first-party reading:** [How we contain Claude across products](https://www.anthropic.com/engineering/how-we-contain-claude) — Anthropic Engineering, June 2026 — covers the containment architectures shipped for claude.ai / Claude Code / Claude Cowork and the thesis that deterministic boundaries (sandboxes, VMs, egress controls) must come before probabilistic model defenses. Read alongside §1 below for the host-merge-to-HEAD angle this review investigates.

 ---
```

**Expected payoff:** Anchors the empirical review with a first-party engineering treatment. Costs nothing at runtime (architecture doc, never loaded into context). Useful at the next sandcastle revision check: if Anthropic ships a Claude Code sandbox profile that aligns with sandcastle's model, this cross-reference is where the comparison happens.

**Risk:** None — pure documentation linkage.

**Scope:** trivial — one block added to one file.

**Verify before applying:**
1. `grep -n 'how-we-contain-claude\|How we contain Claude' /home/user/claude-harness/sandcastle_mattpocock_architecture.md` — must return nothing today; if hit, this § has been applied.
2. Confirm the Anthropic post is still live at the cited URL (the engineering blog has occasionally re-slugged posts).

**Recommended verdict:** apply — single-edit documentation cross-reference; no behavior change.

**Status:** PENDING — awaiting triage in PR review

---

## 4. Defer `/ultracode` trigger + `~/.claude/workflows/` distribution path

**Sources:**
- [Introducing dynamic workflows in Claude Code](https://claude.com/blog/introducing-dynamic-workflows-in-claude-code) — Anthropic, 2026-05-28. Ships dynamic workflows for Pro/Max/Team/Enterprise; introduces the `/ultracode` trigger word and the `s` keystroke in the workflow menu to save a generated workflow.
- [A harness for every task: dynamic workflows in Claude Code](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code) — Anthropic, 2026-05-28. Describes the six composable patterns (above) and proposes two distribution paths: *"You can save workflows by pressing `s` in the workflow menu and check these into `~/.claude/workflows/` or distribute them via a skill."* Also references `/loop` (the Anthropic built-in interval scheduler) and `/goal` (hard completion requirement) as runtime modifiers.

**Why this would be tempting now:**
- The harness ships skills via `~/.claude/skills/` (per `CLAUDE.md` "Skills directory layout"); a parallel `~/.claude/workflows/` channel is a near-zero-cost shipping surface.
- The orchestrator agent already does roughly the **classify-and-act + fan-out-and-synthesize** patterns named in the post — packaging it as a saved workflow rather than (or in addition to) a subagent would let it be invoked from `/ultracode` rather than through the orchestrator.
- The `/run-loop` skill already comments out the naming conflict with `/loop`: *"Name chosen over `/loop` — that is the Anthropic interval-scheduler built-in."* `skills/run-loop/SKILL.md` lines 6-8 — the harness already knows the built-in `/loop` exists.

**Why defer anyway:**
1. **Plan-coverage already.** `/run-loop` is the harness's unattended fan-out lane and is **live as of Wave 21** (`skills/run-loop/SKILL.md` lines 11-26 — Codex/Claude implement + Opus-4.8 review + verify-gate, drained against a real repo on 2026-06-15). It covers the loop-until-done / generate-and-filter shape on plan.md waves and ready-for-agent gh issues. The dynamic-workflows feature is a *Claude-writes-its-own-script* mechanism; the harness's own loop is hand-tuned and ahead of where a Claude-generated workflow would land on a known shape.
2. **No specific use case yet.** The dynamic-workflows post pitches use cases like "bug hunt across an entire service" or "migration touching hundreds of files" — neither matches a recurring shape in this solo harness today.
3. **Cost.** The post explicitly warns: *"They can consume substantially more tokens than typical Claude Code sessions, so Anthropic recommends starting with scoped tasks."* For solo tooling, the orchestrator's existing four-agent fan-out (`code-reviewer + spec-planner + ui-evaluator + generator`) is a better budget fit until a concrete workflow recurs.

**Suggested park signal:** Re-evaluate when **either** (a) a workflow recurs ≥ 3× across consumer-project sessions (e.g., "drive 3 ready issues + run code-review + open PRs" — the kind of thing that today is hand-typed), **or** (b) a consumer project ships against the harness and asks for a saved workflow distribution channel.

**Scope:** speculative — defer is not "ignore"; it's "wait for a recurring shape, then revisit."

**Verify before applying (i.e., if you decide to lift the deferral):**
1. `grep -rn 'ultracode\|~/.claude/workflows\|/loop\b' /home/user/claude-harness/skills/ /home/user/claude-harness/README.md` — confirm `/ultracode` and `~/.claude/workflows/` are still unmentioned. Today: only `skills/run-loop/SKILL.md` lines 6-8 reference `/loop` (the built-in), and only as a naming-conflict callout.
2. Confirm dynamic workflows are still available on the harness's billing plan (the post pins availability to Pro/Max/Team/Enterprise).
3. Check whether any consumer project has requested a workflow distribution channel via parking_lot.md or an issue.

**Recommended verdict:** defer until a recurring fan-out shape needs distribution — solo harness has no current use case beyond `/run-loop`.

**Status:** PENDING — awaiting triage in PR review

---
