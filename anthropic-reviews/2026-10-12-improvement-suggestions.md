# Anthropic post review — 2026-10-12

Covers posts published since the last tracker run on 2026-05-10 (five-month gap: the previous schedule paused around late May). Discovery pulls the top-of-feed from `anthropic.com/news`, `anthropic.com/engineering`, and `claude.com/blog` for May–October 2026; the engineering feed only surfaced posts from April 2026 and earlier on fetch, so **May–August 2026 is a probable gap** that may need a follow-up sweep. This run is capped at 15 posts per the routine convention.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Migrate the harness pin from Opus 4.7 → Opus 5.5 (and Sonnet 4.6 → Sonnet 5.5, add Haiku 5.5 subagent lane) | spec | Model-family change — `effort_default` rationale breaks (5.5 family defaults to `medium`, not `xhigh`); needs a `/spec-planner` pass. |
| 2 | Attach the `build-eval` + `hillclimb` methodology to the still-deferred 2026-04-19 §5 (agent evals) | defer | Methodology upgrade for an already-deferred item; no new commitment, just better specification once §5 unlocks. |
| 3 | Cite "How we contain Claude across products" in the README "Why Not Superpowers" evidence list | apply | One-sentence citation to a canonical Anthropic engineering post; corroborates the harness's existing containment stance. |
| 4 | Cross-link the "Claude Code in the cloud" field guide from `anthropic-reviews/README.md` so the maintainer can trace how this routine actually executes | apply | This routine runs *as* a cloud session; linking the docs makes the mechanism legible to future readers. |
| 5 | Add Block's "effort as a grid, not a spectrum" idea to the planning backlog (does our single-knob `effort_default` lose signal?) | defer | Architecturally interesting, but the harness is solo-maintained with one effort knob per profile; no evidence of pain yet. |
| 6 | Fold Cresta's four evaluation lenses (Outcome / Execution path / Quality / Resource use) into the deferred 2026-04-19 §5 as the rubric shape | defer | Rubric design input for the same deferred eval work covered in §2; captured together. |

(Six §s this run. The rest of the fetched posts are logged as `skipped` in `reviewed-posts.md` with the usual one-line reason.)

---

## 1. Migrate the harness pin from Opus 4.7 → Opus 5.5 (and Sonnet 4.6 → Sonnet 5.5, add Haiku 5.5 as a subagent lane)

**Source URLs (all first-party):**
- https://www.anthropic.com/claude-opus-5-5 (2026-09-22)
- https://www.anthropic.com/claude-sonnet-5-5 (2026-09-28)
- https://www.anthropic.com/claude-haiku-5-5 (2026-10-07)
- https://code.claude.com/docs/en/model-config (default-effort table + alias version history)

**What changed since the harness last pinned a model:**
- `claude-opus-5-5` landed 2026-09-22. API list price $4 / $20 per MTok (input/output) — ~20% below Opus 5, ~40% cheaper than Opus 5 on typical workloads, and smaller writes than Fable 5.1. Anthropic positions it at Fable-5.1-level quality on most work.
- `claude-sonnet-5-5` landed 2026-09-28. $2 / $10 per MTok (same list as Sonnet 5, but typically 30% cheaper per-task from fewer output tokens). Terminal-Bench 4.0: 70.6% (vs. 10.3% for Sonnet 5). New `between_tools` thinking setting if the harness ever runs Sonnet with thinking off.
- `claude-haiku-5-5` landed 2026-10-07. $0.10 / $0.50 per MTok under 100k context (~75% cheaper than Haiku 4.5). **First Haiku with an adjustable effort level** — can serve as a real subagent, not just a classifier.
- Alias version history in `code.claude.com/docs/en/model-config`:
  - v2.1.280: `opus` alias resolves to Opus 5.5 (Anthropic API, Bedrock, Vertex)
  - v2.1.284: `sonnet` alias resolves to Sonnet 5.5
  - v2.1.293: `haiku` alias resolves to Haiku 5.5

**Why this matters for the harness.** `.harness-profile` pins `model.primary: claude-opus-4-7` and `model.fallback: claude-sonnet-4-6`. Those exact IDs still resolve (not deprecated), but the harness's documented `effort_default` derivation breaks on migration:

```yaml
# .harness-profile:22-26  (current, Opus-4.7-era)
# `effort_default` is derived from `stakes.level` on first write by /project-init:
#   stakes.level: low    → effort_default: high
#   stakes.level: medium → effort_default: xhigh
#   stakes.level: high   → effort_default: xhigh
# Aligned with Anthropic's 2026-04-23 postmortem (Claude Code defaults Opus-4.7 users to xhigh).
```

Per the current docs, **Opus 5.5 / Sonnet 5.5 / Haiku 5.5 default to `medium` effort** (vs. Opus 4.7's `xhigh` default). A straight migration moves the harness from "deliberately xhigh because Anthropic says so" to "deliberately xhigh overriding Anthropic's new default of medium" — the rationale comment becomes a lie, and the implicit cost model (Opus-4.7 pricing × xhigh) stops matching the environment the harness actually runs under.

**Concrete changes if applied:**

1. `/.harness-profile` — bump pins and refresh the derivation rationale:
   ```yaml
   model:
     primary: claude-opus-5-5          # was claude-opus-4-7
     fallback: claude-sonnet-5-5       # was claude-sonnet-4-6
     effort_default: xhigh             # keep xhigh? drop to Anthropic's new default of medium?
     effort_cost_multiplier: {}
   ```
   Decide the `effort_default` question explicitly — it's the hinge, not a mechanical rename.

2. `/.harness-profile:22-26` — rewrite the derivation comment. The 2026-04-23 postmortem citation no longer applies as a one-line justification; replace it with either "harness opts out of the 5.5-era default to preserve 4.7-era behavior" or "harness tracks Anthropic's 5.5-era default of medium".

3. `AGENTS.md` / `CLAUDE.md` — add a one-paragraph note that any skill assuming "xhigh everywhere" needs re-checking against the new default.

4. **Haiku 5.5 subagent lane (new capability, scope: speculative).** Adjustable-effort Haiku is a materially different animal than previous Haikus. The harness could route cheap-and-cold subagent calls (e.g. the per-cwd auto-memory extractor, denylist pattern probing, routine-level grep summarization) to Haiku 5.5 at low/medium effort for ~75% cost reduction. No existing skill does this today — all subagents inherit the primary model via `Agent(subagent_type=...)` defaults. This is a separate wave item, not a search-and-replace.

**Expected payoff.** Cost compression (per Anthropic's own numbers, ~40% on Opus workloads, ~30% on Sonnet workloads) plus access to larger reasoning headroom per task. Risk: every skill in `skills/` was authored and lightly tested on Opus 4.7; some may regress on 5.5 even without a prompt change. The eval regression pattern from Cresta (§6) applies here.

**Scope: speculative — the Haiku-5.5 subagent lane in particular is a new capability, not a repair; the Opus 5.5 pin bump is concrete but the `effort_default` decision needs a design pass.**

**Verify before applying:** `grep -n "claude-opus-4-7\|claude-sonnet-4-6\|effort_default" .harness-profile` — the pins and derivation comment are the two things to compare against the live 5.5-era docs before the migration PR lands.

**Recommended verdict:** spec — three coupled changes (pin bump + effort-default re-derivation + optional Haiku subagent lane), one of which (the effort default) is a policy call that should go through `/spec-planner` before any `/micro`.

**Status:** PENDING — awaiting triage in PR review

---

## 2. Attach the `build-eval` + `hillclimb` methodology to the still-deferred 2026-04-19 §5 (agent evals)

**Source URL (post title confirmed, canonical URL unverified):** "Automating eval design and hillclimbing with Claude" by Lance Martin, 2026-09-28; referenced from the claude.com/blog listing. The claude.dev/blog mirror returned by the listing does not resolve (`claude.dev` doesn't exist as a domain), and no `code.claude.com/blog` or `claude.com/blog/automating-eval-design-and-hillclimbing` path responds. Secondary coverage: https://arize.com/?p=32658 and https://explainx.ai/blog/claude-code-build-eval-hillclimb-2026 (both describe the Anthropic post but neither is first-party). Treat the specific percentage figures below as approximate until the first-party post is re-sourced.

**What the post adds.** The claude-api skill (already bundled with Claude Code, already in this harness's available-skills list) gained two commands:

- `/claude-api build-eval` — interviews the user and generates an evaluation inside the codebase.
- `/claude-api hillclimb` — iterates against that eval, one attributable change per round, keeping only changes that improve the train-set score. A **held-out set** is reserved to catch overfitting.

Four properties of a trustworthy eval (per the post):
1. Tasks mirror production (not toy demos).
2. Scores rise with stronger models.
3. The best current model sits well below 100% — leaves headroom for improvement.
4. Variance is low (same input → same score within noise).

Reported effect (secondary coverage): one customer-support eval ended more accurate at ~1/5 the per-ticket cost; Anthropic's own API skill went 66% → 88% on in-sample and 78.6% → 90.5% on held-out.

**Relationship to the harness.** This is a **methodology upgrade for the deferred 2026-04-19 §5 item** (`Formalize evals for the adversarial reviewers`), currently DEFERRED. The deferral's rationale was that the harness has no fixtures to evaluate against and no cost structure to track regressions on. The build-eval/hillclimb pattern provides exactly those two seams — a build-time interview to generate the eval, and a held-out set to measure drift. If/when §5 unlocks (e.g. a target project's planner-generator-evaluator loop needs to pin behavior across a model migration — see §1 above), the methodology to adopt is this one, not the 2026-04-19-era loose sketch.

**Concrete changes if applied (none now; attach-as-reference only):**
- Edit `anthropic-reviews/2026-04-19-improvement-suggestions.md`'s §5 Status line to add: `· design input: 2026-10-12 §2 (build-eval + hillclimb + 4-eval-properties + held-out set)`.
- No new file; no new skill; no code.

**Expected payoff.** When §5 finally activates (likely driven by §1's model migration), the maintainer already has the design-constraint block captured and doesn't need to re-derive it. Avoids the common "eval work drifts to vibes-driven scoring" failure mode by pre-committing to a held-out set from day one.

**Verify before applying:** `grep -n "Status" anthropic-reviews/2026-04-19-improvement-suggestions.md | grep -i "defer\|§5"` — confirm §5 is still DEFERRED (not APPLIED since 2026-04-19); if it's since been APPLIED, this attach-only § is moot.

**Recommended verdict:** defer until the deferred 2026-04-19 §5 (agent evals) is picked up — no action required now beyond cross-linking.

**Status:** PENDING — awaiting triage in PR review

---

## 3. Cite "How we contain Claude across products" in the README "Why Not Superpowers" evidence list

**Source URL:** https://www.anthropic.com/engineering/how-we-contain-claude (first-party, Anthropic engineering; no explicit date on the page but post appeared in the engineering listing between May and October 2026).

**What the post says.** Anthropic's canonical statement of the containment thesis across claude.ai, Claude Code, and Claude Cowork. Key claims the harness's "Why Not Superpowers" posture already assumes:
- Human-in-the-loop approval prompts fatigue — users approve ~93% of them, so blast-radius capping (environment-level isolation) is the primary defense, not supervision.
- Model-layer defenses are probabilistic; the hard boundary is sandbox + egress policy + scoped credentials.
- Trust-before-execution: project-local config (hooks in `.claude/settings.json`) should not run before the user accepts the trust prompt.
- "Egress as capability": an allowed domain is attack surface, not just a filter target.

The harness already enforces most of these via the global git-hook dispatcher (secret scan, mass-delete block, profile gate — see commit `5130b9d`), the `fewer-permission-prompts` skill (narrow Bash allowlists), and the `.harness-profile` gate (blocks skill execution on uninitialized repos). What's missing is a single externally-cited source the README can lean on when a reader asks "why do you care about containment so much, you're solo."

**Concrete change if applied.** One bullet appended to the README's "Why Not Superpowers" evidence list, in the shape the existing bullets use:

> - [How we contain Claude across products](https://www.anthropic.com/engineering/how-we-contain-claude) (Anthropic engineering, 2026): canonical "approval fatigue hits 93%; cap the blast radius instead" — directly supports the harness's lean on environment-level checks (git-hook dispatcher, Bash allowlists, trust-before-execution via `.harness-profile`) over per-prompt supervision.

**Expected payoff.** One sentence; makes the harness's containment stance externally defensible without new code. Low risk, zero coupling.

**Verify before applying:** `grep -n "Why Not Superpowers\|evidence" README.md 2>&1 | head -10` and `grep -n "how-we-contain-claude" README.md` — confirm the section still exists under that name (previous suggestions have appended to it) and that this URL isn't already cited. If `README.md` doesn't have a "Why Not Superpowers" section anymore, this § becomes moot and should be dropped rather than retargeted — don't invent a new section for it.

**Recommended verdict:** apply — single-sentence README append; trivial; one-file `/micro`.

**Status:** PENDING — awaiting triage in PR review

---

## 4. Cross-link the "Claude Code in the cloud" field guide from `anthropic-reviews/README.md`

**Source URL:** https://code.claude.com/docs/en/claude-code-on-the-web (first-party docs; the "field guide" phrasing comes from the launch post referenced in the 2026-10-06 claude.com/blog listing).

**What the docs establish about this routine's own execution.** This review-generation routine *is* a Claude Code cloud session. The docs page states explicitly:

- Routines execute on Anthropic-managed cloud infrastructure (or a self-hosted environment).
- Each cloud session runs in an isolated, Anthropic-managed VM.
- The cloud VM clones the GitHub remote at the specified branch (not the local checkout).
- Credentials stay encrypted on Anthropic servers and never enter the VM; GitHub operations go through a server-side proxy.
- A session's VM is reclaimed after inactivity; the conversation history is restored on re-open, but background work (subagents, shell commands, pending `/loop` wakeups) is not.
- Setup scripts are cached only when they finish in ~5 minutes.

**Why this helps the maintainer.** `anthropic-reviews/README.md` describes the triage convention and the PR-flow, but says nothing about the execution environment the routine runs in. A future reader who finds a routine run acting strange (missing env vars, blocked egress, a stale cached setup) will have no breadcrumb from this directory to the actual docs. One cross-link closes that gap.

**Concrete change if applied.** Append a "Where this routine runs" subsection to `anthropic-reviews/README.md`, after the "Files in this directory" table and before "How to triage a suggestions PR":

```markdown
## Where this routine runs

This routine runs as a Claude Code *routine* (a saved cloud-session configuration). The execution model is documented upstream:
- [Claude Code in the cloud](https://code.claude.com/docs/en/claude-code-on-the-web) — session lifecycle, VM isolation, GitHub proxy, environment expiry.
- [Routines](https://code.claude.com/docs/en/routines) — scheduling, API triggers, GitHub-event triggers, hourly caps (100 scheduled runs/hour per account), the `<routine-fire-payload>` wrapper around fire text.
- [Cloud environments](https://code.claude.com/docs/en/cloud-environments) — setup scripts (cached ≤5min), network access levels, environment variables, Pro/Max network secrets.

If a run goes silent or acts stale, start with `/schedule why did my <routine-name> do nothing this morning?` from a local CLI session (Claude Code v2.1.227+); it reads the routine's recent run logs and names the actual cause (blocked network, missing connector, tool error).
```

**Expected payoff.** Future-maintainer breadcrumb. No change to the routine itself; no new skill. The 2026-05-10 §2 "migrate this routine to a cloud routine" question remains DEFERRED (it was about the *scheduling mechanism*, not the execution environment).

**Verify before applying:** `grep -n "Where this routine runs\|Claude Code in the cloud" anthropic-reviews/README.md` — confirm the section isn't already there before adding. If the maintainer has already added a similar block, skip this §.

**Recommended verdict:** apply — single-file README append; non-structural; one-paragraph `/micro`.

**Status:** PENDING — awaiting triage in PR review

---

## 5. Add Block's "effort as a grid, not a spectrum" idea to the planning backlog

**Source URL:** https://claude.com/resources/articles/how-block-orchestrates-claude-fable-across-thousands-of-pull-requests (first-party, 2026-10-08).

**Key observation from Block.** The post explicitly reframes effort selection:

> Block treats effort as a grid to optimize against, not a spectrum. Fable on low may outperform another model on xhigh. The goal is clear defaults, such as "use this model on high as the default for this kind of task," with tooling applying them automatically.

In their setup, Fable orchestrates and dispatches to Opus/Sonnet workers; "frontier tokens go to upfront planning" while a larger token share goes to the smaller worker models. Each use case is "tested across every model and effort level."

**Relationship to the harness.** `.harness-profile` has one `effort_default` per profile, derived from `stakes.level`. That is a one-dimensional spectrum, not a model×effort grid. The harness also has no benchmarking harness to drive the "test across every model and effort level" claim — see §2 and the deferred 2026-04-19 §5 for the eval gap.

**Why this isn't "apply" today.** Three reasons:
1. The grid shape presumes multiple co-equal models in rotation (Fable + Opus + Sonnet). The harness pins one primary and one fallback.
2. Benchmarking the grid requires the eval harness that's still deferred (§2).
3. Solo-maintenance scale — Block has an entire platform team ("Buzz") around this. Carrying a grid of defaults without the eval infra to maintain them would rot in weeks.

**Concrete change if applied (bookkeeping only, no code).** Add one row to `parking_lot.md`:

```markdown
- **Model×effort grid (vs. single `effort_default`)** — Block treats effort as a grid, not a spectrum ([Block/Fable post](https://claude.com/resources/articles/how-block-orchestrates-claude-fable-across-thousands-of-pull-requests), 2026-10-08). Conditional on (a) the agent-evals infrastructure from the deferred 2026-04-19 §5 landing, and (b) the harness routing to >2 models (currently just Opus-primary + Sonnet-fallback — see 2026-10-12 §1). Revisit only when both conditions hold.
```

**Expected payoff.** Captures the idea for later without taking on carrying cost today.

**Verify before applying:** `cat parking_lot.md 2>/dev/null | grep -i "grid\|block" | head` — confirm no existing parking-lot item already covers this.

**Recommended verdict:** defer — the shape only pays off once §1 (multiple models) *and* §2/§5 (eval infra) both land; the parking-lot bookkeeping is the "apply" bit if the maintainer wants it logged, but the pattern itself defers.

**Status:** PENDING — awaiting triage in PR review

---

## 6. Fold Cresta's four evaluation lenses into the deferred 2026-04-19 §5

**Source URL:** https://claude.com/resources/articles/how-cresta-turned-cx-expertise-into-an-agent-builder-on-the-claude-agent-sdk (first-party customer article, 2026-10-05).

**What's new.** Cresta's Conductor (an agent that builds other agents on the Agent SDK) evaluates every candidate build against four lenses:

| Lens | Question |
|---|---|
| **Outcome** | Did it produce the requested, usable artifact? |
| **Execution path** | Did it use the right tools and context? |
| **Quality** | How does the result compare with a curated reference? |
| **Resource use** | How much time and model usage did it take? |

Plus two patterns worth noting:
- **Regression reruns on change.** When a new Claude model ships (see §1!) or the framework changes, the same tasks are re-run with the same scoring. Shows what improved and what regressed before the change is adopted.
- **Requirements → tests.** Build-phase requirements and edge cases are converted into tests in the evaluation module, so the workflows that must work every time are monitored as the business changes.

**Relationship to the harness.** This is a **rubric shape** for the deferred 2026-04-19 §5 (agent evals). Pairs naturally with §2's `build-eval` + `hillclimb` methodology: §2 says *how* to iterate, Cresta says *what to score on*. The "regression reruns on new Claude model" piece is also the natural evaluation gate for §1's model migration — if §5 lands before §1 is executed, the migration PR can run the Cresta-shaped rubric and attach the Opus-4.7 vs. Opus-5.5 before/after as evidence.

**Concrete change if applied (none now; attach-as-reference only).**
- Edit `anthropic-reviews/2026-04-19-improvement-suggestions.md`'s §5 Status line (same line §2 of this file touches) to append: `· rubric design input: 2026-10-12 §6 (four-lens Outcome/Execution/Quality/Resource rubric, regression reruns on model change)`.
- No new file; no new skill; no code.

**Expected payoff.** Rubric is captured and sits next to the methodology (§2) so the §5 unlock has a one-paragraph summary to spec from rather than a cold-start design pass.

**Verify before applying:** same as §2 — `grep -n "Status" anthropic-reviews/2026-04-19-improvement-suggestions.md | grep -i "§5"`; confirm §5 still DEFERRED.

**Recommended verdict:** defer until the deferred 2026-04-19 §5 is picked up; same track as §2 — fold both into §5's unlock PR, don't open a separate wave.

**Status:** PENDING — awaiting triage in PR review

---

## Posts fetched but skipped this run

These are logged with one-line reasons in `reviewed-posts.md` and intentionally omitted from the numbered §s above to keep the file tight (per README anti-pattern: "Don't pad the suggestions file"). Full list is in the tracker.

Of note on skipped posts: "Partnering with Accenture on embedded evaluation" (2026-09-18) sounds relevant to §2 / §6 but turned out to be an organizational-partnership announcement, not an engineering post — no methodology to import.
