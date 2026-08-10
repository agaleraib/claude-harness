# Anthropic post review — 2026-06-01

Routine ran 2026-06-01 against posts dated 2026-05-10 (last review) through 2026-06-01. Four §s relevant, ten skipped (recorded in `reviewed-posts.md`).

The high-leverage item is §1 (Opus 4.7 → 4.8 model bump in `.harness-profile` + README intro). §2 surfaces a question — does Claude Code on Opus 4.8 still default to xhigh, or did it drop to high alongside the API default? — that the maintainer should resolve before retuning `effort_default`. §3 is a one-sentence framing add captured from the large-codebases best-practices post. §4 is bookkeeping (Dynamic Workflows research preview — defer alongside prior Managed Agents row). §5 is the HTML-over-Markdown opinion piece, recommended `reject`.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Bump `model.primary` claude-opus-4-7 → claude-opus-4-8 | apply | New flagship released 2026-05-28, pricing unchanged, same shape as 2026-04-19 §1. |
| 2 | Re-evaluate `effort_default` derivation for Opus 4.8 (HIGH default in API) | defer until Claude-Code-on-Opus-4.8 default is documented | API defaults to HIGH; unclear whether Claude Code still defaults to xhigh — verify before retuning. |
| 3 | Adopt the "compensation rules turn into overhead after a model upgrade" framing in AGENTS.md | apply | Sharpens the post-release-review half of the anthropic-reviews routine into a named failure mode. |
| 4 | Dynamic Workflows in Claude Code — bookkeeping | defer until Dynamic Workflows graduates from research preview | Conceptually overlaps with the harness orchestrator but is fan-out-at-scale within one model; research preview only on Max/Team/Enterprise. |
| 5 | HTML-over-Markdown for evaluator reports + criteria | reject — speculative for a Markdown-first methodology repo | Opinion piece, no Anthropic-bundled tooling has migrated; flip only if first-party criteria templates ship as HTML. |

---

## 1. Bump `model.primary` from `claude-opus-4-7` to `claude-opus-4-8`

**Source:** [Introducing Claude Opus 4.8 — Anthropic News, 2026-05-28](https://www.anthropic.com/news/claude-opus-4-8)

Anthropic shipped Claude Opus 4.8 on 2026-05-28 at the same price as Opus 4.7 ($5 input / $25 output per Mtok standard; $10/$50 fast mode at 2.5× speed — fast mode is now 3× cheaper than on prior models). Coverage describes Opus 4.8 as "stronger across coding, agentic tasks, and professional work, with the consistency and autonomy to keep working on long-running tasks" and as "sharper judgement, more honesty about its progress, and the ability to work independently for longer than its predecessors". Agentic-coding benchmark moves from 64.3% (4.7) to 69.2% (4.8).

The harness's `.harness-profile:30` still pins `model.primary: claude-opus-4-7`, and `README.md:3` opens with *"A lean agent harness for Claude Code, designed for Opus 4.7's native capabilities."* (`README.md:11` repeats the same framing in the Philosophy section). Same shape as 2026-04-19 §1 (the Opus 4.6 → 4.7 bump that APPLIED in the harness's first review run).

**Concrete changes (operative text only — historical spec/wave docs left alone as a record):**

```diff
- # .harness-profile
- model:
-   primary: claude-opus-4-7
+   primary: claude-opus-4-8
    fallback: claude-sonnet-4-6
```

```diff
- # README.md (line 3)
- A lean agent harness for Claude Code, designed for Opus 4.7's native capabilities.
+ A lean agent harness for Claude Code, designed for Opus 4.8's native capabilities.

- # README.md (Philosophy block, line 11)
- Opus 4.7 plans carefully, sustains long tasks, debugs effectively, and follows instructions literally at low effort
+ Opus 4.8 plans carefully, sustains long tasks, debugs effectively, and follows instructions literally at low effort
```

```diff
- # skills/project-init/SKILL.md (line 133-134 + line 187-188)
- | `model.primary` | yes | `claude-opus-4-7` | Top-of-stack model the orchestrator dispatches to. |
+ | `model.primary` | yes | `claude-opus-4-8` | Top-of-stack model the orchestrator dispatches to. |
  | `model.fallback` | yes | `claude-sonnet-4-6` | Used when the orchestrator demotes for cost/latency. |
  ...
-   primary: claude-opus-4-7
+   primary: claude-opus-4-8
    fallback: claude-sonnet-4-6
```

**Expected payoff:** the harness consumes the published flagship default and the README intro stops misleading new readers. Per-token spend is unchanged. The two "Why Not Superpowers" bullets in the README that reference Opus 4.7 capabilities remain valid (Opus 4.8 is reported as a strict superset for coding/agentic tasks) but should be re-worded to 4.8 for consistency.

**Leave alone (historical record):**
- `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md` — dated spec, accurate at the time.
- `docs/waves/wave1-harness-model-pin-profile-schema.md` and other `docs/waves/wave*.md` files — closed waves, no edits.
- `anthropic-reviews/2026-04-19-improvement-suggestions.md` and other dated suggestions files — append-only history per `anthropic-reviews/README.md`.

**Verify before applying:** `grep -nE "claude-opus-4-7|Opus 4\.7" README.md AGENTS.md CLAUDE.md WORKFLOW.md .harness-profile skills/project-init/SKILL.md` — if any operative (not historical-spec or anthropic-reviews) file still references 4.7, the bump hasn't shipped.

**Recommended verdict:** apply — concrete value, low risk for current scope; same playbook as 2026-04-19 §1.

**Status:** PENDING — awaiting triage in PR review

---

## 2. Re-evaluate `effort_default` derivation now that Opus 4.8's API default is HIGH

**Source:** [Introducing Claude Opus 4.8 — Anthropic News, 2026-05-28](https://www.anthropic.com/news/claude-opus-4-8) (see also [Claude Opus 4.8 is here: effort controls, dynamic workflows — The New Stack, 2026-05-28](https://thenewstack.io/claude-opus-48-release/))

Coverage of the Opus 4.8 release states the model **defaults to HIGH effort** (Anthropic's stated best balance of token spend and output quality), with `xhigh` ("extra") for harder tasks and `max` for maximum depth. This is a change from Opus 4.7, whose Claude Code default the harness aligned with via the 2026-04-23 postmortem (which traced the Claude Code Opus-4.7 default to xhigh).

The harness's `.harness-profile:32` currently sets `effort_default: xhigh` for `stakes.level: medium`, with the derivation comment naming the postmortem as justification:

```yaml
# stakes.level: low    → effort_default: high
# stakes.level: medium → effort_default: xhigh
# stakes.level: high   → effort_default: xhigh
# Aligned with Anthropic's 2026-04-23 postmortem (Claude Code defaults Opus-4.7 users to xhigh).
```

It is **not yet clear from public sources** whether Claude Code on Opus 4.8 still defaults to xhigh, or whether the Claude Code default dropped to high alongside the API default. The maintainer should confirm this before retuning anything. Two scenarios:

- **Scenario A — Claude Code on Opus 4.8 still defaults to xhigh:** no derivation change needed; just refresh the comment to cite the Opus 4.8 launch alongside the April-23 postmortem.
- **Scenario B — Claude Code on Opus 4.8 defaults to HIGH (matching the API):** the harness's `medium → xhigh` derivation is once again strictly above Anthropic's published default, the same shape that motivated the prior round of fixes (originally 2026-04-27 §1, but in the opposite direction — that one *raised* the default). Update the derivation table to:
  - low → medium (was high)
  - medium → high (was xhigh)
  - high → xhigh (was xhigh)
  - Then re-derive this repo's own `.harness-profile` (currently medium → xhigh) to medium → high.

Touchpoints if Scenario B: `.harness-profile:24-32` (the derivation comment and `effort_default` value), `skills/project-init/SKILL.md` (project-init derivation table — needs grep to locate), `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md` (leave alone — historical spec).

**Verify before applying:** read https://code.claude.com/docs/en/changelog for an Opus-4.8 Claude Code default-effort entry, and https://code.claude.com/docs/en/effort if present; also check `~/.claude/settings.json` after a fresh upgrade for a default-effort field. Decision criterion: does Claude Code on Opus 4.8 default to xhigh or to high?

**Recommended verdict:** defer until the Claude Code Opus-4.8 default is confirmed. The §1 model bump is independent and can ship without this; this § blocks on a published-default lookup the maintainer hasn't yet done.

**Status:** PENDING — awaiting triage in PR review

---

## 3. Capture the "compensation rules turn into overhead after a model upgrade" framing in `AGENTS.md`

**Source:** [How Claude Code works in large codebases: Best practices and where to start — Claude.com Blog, 2026-05-14](https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start)

The post (a seven-layer enterprise-codebases playbook covering CLAUDE.md, hooks, skills, LSP, MCP, sub-agents, and global rules) closes with an operational point that is sharper than how the harness currently frames its review cadence:

> *"The guide recommends meaningful reviews every three to six months, especially after major model releases. Many rules are written to compensate for specific limitations of the model in use at the time of writing: when the model improves, those compensations turn into overhead that slows the agent."*

The anthropic-reviews routine already does the post-release-review half: this very routine fires on each new Anthropic post and the `/apply-anthropic-reviews` skill closes the loop. What's missing is the explicit *failure mode* the framing names — *compensations that turn into overhead*. The README's "Why Not Superpowers" §3 last bullet (vendor primitives keep absorbing harness territory) captures a *vendor*-driven version of the same pattern; this captures the *harness-author*-driven version.

**Concrete change — single new bullet in `AGENTS.md` or `anthropic-reviews/README.md`** (decide which fits — `AGENTS.md` is tool-neutral and lives at the methodology layer; `anthropic-reviews/README.md` lives next to the routine that operationalizes the check):

```diff
+ - **After each Anthropic Opus / Sonnet release**, review harness rules for *compensation rot*: instructions
+   written to work around a prior-model limitation that now slow the new model down. The 2026-04-23
+   postmortem's "25-word verbosity cap knocked 3% off coding evals" is the canonical first-party example;
+   the same shape applies to harness-author rules (overlong CLAUDE.md, defensive skill guards, evaluator
+   rubrics that spell out "and also check X"). The anthropic-reviews routine cues the check; the rule itself
+   is the operative discipline.
```

This is a one-bullet documentation add — `/micro`-shaped, no schema change, no agent change.

**Verify before applying:** `grep -nE "compensate|compensation rot|prior.*model.*limit|overhead that slows" AGENTS.md README.md anthropic-reviews/README.md` — if no match in any of those three files, the framing isn't captured yet.

**Recommended verdict:** apply — single-bullet documentation add that sharpens an already-running routine into a named discipline; trivial to undo if it ages badly.

**Status:** PENDING — awaiting triage in PR review

---

## 4. Dynamic Workflows in Claude Code — bookkeeping (defer alongside the Managed Agents row)

**Source:**
- [Introducing Claude Opus 4.8 — Anthropic News, 2026-05-28](https://www.anthropic.com/news/claude-opus-4-8) (announcement)
- [Orchestrate subagents at scale with dynamic workflows — Claude Code Docs](https://code.claude.com/docs/en/workflows) (docs)

Dynamic Workflows shipped 2026-05-28 alongside Opus 4.8, as a research preview on Claude Code for Max / Team / Enterprise plans. The shape: Claude writes a JavaScript orchestration script on the fly for a task you describe, a runtime executes it in the background while your session stays responsive, and the script fans work to up to **1,000 total subagents per run with a maximum of 16 concurrent**. Use cases coverage names: codebase audits, large migrations, cross-checked research. The cited canonical example is Jarred Sumner porting Bun from Zig to Rust (≈750k LoC of new Rust).

**How it overlaps with the harness's `orchestrator` agent** (`.claude/agents/orchestrator.md`):

- The harness orchestrator implements the same orchestrator-worker pattern Anthropic published in the multi-agent-research-system engineering post, and routes per-task across **model tiers** (opus / sonnet / haiku) with an `effort` axis.
- Dynamic Workflows fans out **within one model** at much higher concurrency than a wave ever uses (a wave dispatches at most a handful of tasks; this routine, for instance, doesn't dispatch in parallel).

**Why defer, not adopt:**
- (a) Research preview, plan-gated;
- (b) the harness's per-task tiered routing is a different axis from fan-out-at-scale — they would coexist, not compete;
- (c) up to 1,000 subagents is wildly over-provisioned for any current harness wave;
- (d) the related 2026-04-19 §2 (brain/hands split, Managed Agents) is already deferred — Dynamic Workflows is the Claude Code analog and belongs in the same deferred bucket.

This § is bookkeeping: record that Dynamic Workflows was reviewed, that it doesn't trigger an immediate harness change, and that the trigger to revisit is *either* graduation from research preview *or* a concrete harness wave that needs > 5 parallel subagents per task.

**Verify before applying:** `grep -rEn "Dynamic Workflows|dynamic.workflows|workflows\.js|fan-out" .claude/agents/ skills/ docs/` — if no match, no work has been imported yet (expected). Revisit when either (a) the docs page at https://code.claude.com/docs/en/workflows leaves "research preview" status, or (b) a wave's spec contains more than 5 independent parallel tasks where the orchestrator's tiered routing isn't adding value.

**Recommended verdict:** defer until Dynamic Workflows graduates from research preview *or* a harness wave needs > 5 parallel subagents.

**Status:** PENDING — awaiting triage in PR review

---

## 5. HTML-over-Markdown for evaluator reports + criteria — opinion piece, recommend reject

**Source:** [Using Claude Code: The unreasonable effectiveness of HTML — Claude.com Blog, 2026-05-20, Thariq Shihipar (Claude Code engineering lead)](https://claude.com/blog/using-claude-code-the-unreasonable-effectiveness-of-html)

The post argues that for daily Claude Code users, plans, code reviews, design systems, and reports should be emitted as **HTML, not Markdown**, because (a) higher information density per token, (b) humans don't read a 100-line Markdown file (Thariq's anecdote — *"in practice, he tends to not actually read more than a 100-line markdown file, and certainly is not able to get anyone else in his organization to read it"*), and (c) HTML allows interactive affordances (collapsible details, tables, links inline with structured content). The post's framing is that Anthropic itself is adopting HTML as the internal default for these surfaces.

**Where this could apply in the harness:**
- `criteria/*.md` (six rubric files consumed by `code-reviewer`, `ui-evaluator`)
- evaluator outputs (e.g. `ui-evaluator` writes an `evaluation-report.md` per criteria/*.md it consults)
- `docs/waves/*-closed.md` summaries (read by maintainer at wave close)

**Counter-considerations specific to this repo:**
- The harness is **Markdown-first across every artifact** — `.claude/agents/*.md`, `skills/*/SKILL.md`, `AGENTS.md`, `CLAUDE.md`, `docs/specs/*.md`, `criteria/*.md`. Migrating one artifact to HTML adds an inconsistency tax that compounds.
- The post's primary payoff is *human readability of long reports* — but harness evaluator outputs are consumed programmatically (by `/run-wave`, by `code-reviewer`'s own consumption), not read end-to-end.
- **No first-party tooling has migrated yet.** The Anthropic-bundled `skill-creator` and `claude-api` skills still emit Markdown. The harness rule-of-thumb is to follow first-party tooling — flipping ahead of it is speculative.
- The post is **opinion, not protocol** — there is no Anthropic engineering RFC or docs change that says "harness authors should emit HTML for evaluator outputs."

**Verify before applying:** `grep -rEn "<html|<table|<details>|<section>" criteria/ docs/waves/ .claude/agents/ui-evaluator.md` — should currently return ~0 matches. Flip the verdict only if (a) Anthropic ships first-party HTML criteria / evaluator templates, *or* (b) the maintainer explicitly endorses the Thariq thesis for this repo.

**Recommended verdict:** reject — speculative for a Markdown-first solo-maintained methodology repo; opinion piece, no first-party tooling has migrated. Revisit if Anthropic ships HTML criteria templates or the `skill-creator` skill's output format flips.

**Status:** PENDING — awaiting triage in PR review

---

## Skipped this run (rationale in `reviewed-posts.md`)

- How Anthropic's cybersecurity team built a threat detection platform with Claude Code (2026-05-12) — case study, no methodology surface.
- Code w/ Claude SF 2026: Building on the AI exponential — event recap, contents already covered by §4 and prior Managed Agents rows.
- Code w/ Claude London 2026: Rethinking how we build (2026-05-26) — event recap, same as SF.
- Anthropic acquires Stainless (2026-05-18) — SDK-tooling consolidation; no surface that touches the harness today (the harness has no Claude API client).
- Updating our Usage Policy — policy update, no harness change.
- Anthropic raises $65B Series H — financial news.
- Anthropic forms $200M partnership with Gates Foundation — programmatic / social.
- Anthropic expands compute partnership with Google and Broadcom — infrastructure.
- Statement from Dario Amodei on discussions with the Department of War — policy / government relations.
- Anthropic education report: how educators use Claude — research, no coding-harness surface.
