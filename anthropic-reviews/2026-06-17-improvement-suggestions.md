# 2026-06-17 — Anthropic post review

Posts published 2026-05-11 → 2026-06-17, surfaced via anthropic.com/news, claude.com/blog, and anthropic.com/research. Tracker last covered up to 2026-05-10.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Bump `.harness-profile` from `claude-opus-4-7` to `claude-opus-4-8` | apply | Same upgrade shape as 2026-04-19 §1 (4.6 → 4.7); same-price, drop-in successor; harness has had time-on-4.7 sign-off |
| 2 | Cite "Agentic coding and persistent returns to expertise" in README "Why Not Superpowers" | apply | 400k-session Anthropic-internal data quantifies the "humans plan, Claude executes" pattern the harness already builds around |
| 3 | Add a Gotchas convention to `skill-creator` (Anthropic: "highest-signal content in any skill is the Gotchas section") | defer until next `skill-creator` edit | Methodology gain is real but small for a solo author; bundle with the next planned `skill-creator` revision rather than a one-off pass |
| 4 | Adopt the Claude Code "dynamic workflows" pattern in the orchestrator | defer until orchestrator hits a parallelism ceiling | Anthropic-shipped JS-orchestrated-subagent pattern overlaps with `/run-wave` + orchestrator but is a different shape; speculative for a solo harness today |
| 5 | Use HTML (not markdown) for evaluator / planner artifact output | reject — speculative for a tooling repo | "Unreasonable effectiveness of HTML" post targets human-readable reports; harness artifacts are consumed by tools (commit, archive-plan) where markdown is the lingua franca |

---

## 1. Bump `.harness-profile` from `claude-opus-4-7` to `claude-opus-4-8`

**Source:** [Introducing Claude Opus 4.8 (2026-05-28)](https://www.anthropic.com/news/claude-opus-4-8) · companion: [Claude Opus 4.8 product page](https://www.anthropic.com/claude/opus)

**What changed.** Opus 4.8 is the drop-in successor to Opus 4.7 (same $5/$25 per Mtok price, same Claude Code / Claude Platform / AWS / GCP / Foundry availability). Anthropic positions it as "more reliable and sharper in its judgment when performing agentic tasks" — roughly 4× less likely than Opus 4.7 to let flaws in its own code pass unremarked. Claude Code release on 2026-05-28 also shipped fast-mode at 2.5× speed for 3× lower cost vs. previous models, and the new "dynamic workflows" feature (see §4).

**Why the harness should bump.** The harness pins a primary model in `.harness-profile` precisely so model rolls happen deliberately, not by drift. Opus 4.7 has now had ~7 weeks of in-harness use; 4.8 has had ~3 weeks of public-bake time at this date; and the 2026-04-19 §1 upgrade (4.6 → 4.7) is the precedent for how this bump should ship — a one-line `.harness-profile` edit plus a sweep of explicit "Opus 4.7" mentions in docs/specs/waves/README.

**Concrete diff.**

```diff
 # .harness-profile
 model:
-  primary: claude-opus-4-7
+  primary: claude-opus-4-8
   fallback: claude-sonnet-4-6
   effort_default: xhigh   # derived from stakes.level: medium
```

Then sweep these files for `claude-opus-4-7` / `Opus 4.7` references and bump the ones that read as "current primary" (leave 2026-04-19 §1 and older suggestions/waves alone — they are historical record):

- `README.md` (one mention of "Opus 4.7" in the Why Not Superpowers evidence list — leave it; the postmortem was specifically about 4.7)
- `skills/project-init/SKILL.md`, `skills/apply-anthropic-reviews/SKILL.md` — bump where it reads as the live model pin
- `skills/_shared/loop/dispatch/review.ts`, `skills/_shared/loop/dispatch/backends.ts` — only if a model id is hardcoded; prefer reading from `.harness-profile`
- Do NOT bump anthropic-reviews/* historical entries (provenance)

**Expected payoff.** Same as 2026-04-19 §1 — keeps the harness's primary model in step with the maintained Opus tier without the maintainer having to think about it on every session start; the bump is cheap to revert if 4.8 regresses for this harness's workloads.

**Verify before applying:** run `grep -n "claude-opus-4-7\|primary:" .harness-profile` — if `model.primary` is already `claude-opus-4-8` (or a later tier), this suggestion is already in place; drop the §.

**Recommended verdict:** apply — same shape and risk as the 4.6 → 4.7 bump; no architecture change.
**Status:** PENDING — awaiting triage in PR review

---

## 2. Cite "Agentic coding and persistent returns to expertise" in README "Why Not Superpowers"

**Source:** [Agentic coding and persistent returns to expertise (2026-06-16)](https://www.anthropic.com/research/claude-code-expertise)

**What the post says.** A privacy-preserving Anthropic study of ~400,000 Claude Code sessions from ~235,000 users (Oct 2025 – Apr 2026) finds: (a) "in a typical session, people make most of the planning decisions (what to do) and Claude makes most of the execution decisions (how to do it)"; (b) "the more domain expertise a person has, the more often the session ends in success — though the gap between intermediate and expert users is modest"; (c) Claude Code users now average 20 hours/week using it.

**Why this is harness-relevant.** The README "Why Not Superpowers" section (`README.md:23-34`) argues against heavy instruction layers because they degrade Opus's judgment. The 400k-session data is independent, first-party evidence of the same dynamic from a different angle: when Claude is doing more execution work per instruction, the harness's job is to clear the path (lay-of-the-land CLAUDE.md, lean skills, no instruction bloat) rather than to over-specify the *how*. This is the cleanest first-party datum to date for the "harness should not interpose between operator and model" framing the README already takes.

**Concrete diff** (append one bullet after the existing 2026-04-30 onboarding citation, between the current `Vendor primitives keep absorbing harness territory` line and the closing sentence about 500-token overhead):

```diff
 - **Vendor primitives keep absorbing harness territory**: Claude Code now ships a built-in `/security-review` slash command, and Anthropic launched [Claude Security in public beta on 2026-04-30](https://claude.com/blog/claude-security-public-beta) with full-codebase vulnerability scanning + patch generation on Opus 4.7. A custom security-review skill would have been a reasonable addition to this harness six months ago; today it's redundant with first-party tooling. The pattern repeats — keep the harness lean so vendor releases don't deprecate it.
+- **Operators plan, Claude executes**: Anthropic's 2026-06-16 study of ~400k Claude Code sessions ([Agentic coding and persistent returns to expertise](https://www.anthropic.com/research/claude-code-expertise)) quantifies a now-stable pattern — in a typical session the human makes most of the *what-to-do* decisions and Claude makes most of the *how-to-do-it* decisions, and domain expertise compounds: more expertise per session ⇒ more useful work per instruction. The harness's job is to leave that channel clean (lay-of-the-land CLAUDE.md, lean skills, no over-specified procedures) rather than to over-prescribe the *how*.
 
 **This harness keeps context overhead under 500 tokens at session start** (agent descriptions only). Full agent/skill content loads only when invoked.
```

**Expected payoff.** One bullet, durable citation, strengthens the README's "Why Not Superpowers" argument with the most authoritative first-party empirical data published to date. Costs ~1 minute to apply.

**Verify before applying:** `grep -n "claude-code-expertise\|persistent returns to expertise" README.md` — if either string already appears, this § is already shipped; drop it.

**Recommended verdict:** apply — one-bullet addition, clear evidence, fits an existing evidence list.
**Status:** PENDING — awaiting triage in PR review

---

## 3. Add a Gotchas convention to `skill-creator`

**Source:** [Lessons from building Claude Code: How we use skills (2026-06-03)](https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills)

**What the post says.** Two lessons worth singling out for a solo harness:

1. *"The highest-signal content in any skill is the Gotchas section, which should be built up from common failure points that Claude runs into when using your skill."*
2. *"More lines don't necessarily mean better instructions — skills need to be maintainable, not comprehensive, and Claude is smart enough to work with concise, well-structured guidance."*

**Why it's defer, not apply.** This is genuinely good methodology, but acting on it has two costs that exceed the marginal payoff today:

- The harness has 24 skills. Sweeping each one for a Gotchas section would touch every SKILL.md, and most of the harness's gotchas already live as inline footnotes rather than a section.
- The first lesson is best landed inside `skill-creator/SKILL.md` so *new* skills inherit the convention. That edit will happen anyway the next time `skill-creator` is revised — bundling it into a planned edit costs less context than a one-off pass.

**What an apply would look like, when it happens.** Add a one-line "Gotchas — list the common ways Claude misuses this skill; cite the symptom, not the fix" instruction to `skill-creator/SKILL.md`'s skill-template guidance, and have it pre-render an empty `## Gotchas` section in the SKILL.md template it generates. Do not retro-sweep existing skills; let the convention propagate via the next edit each skill receives.

**Verify before applying:** `grep -ni "gotchas" skills/skill-creator/SKILL.md` — if a Gotchas convention is already documented in `skill-creator`, drop this §.

**Recommended verdict:** defer until the next planned edit to `skill-creator` — methodology gain is real but small at solo scale; cheapest to bundle into existing maintenance.
**Status:** PENDING — awaiting triage in PR review

---

## 4. Adopt the Claude Code "dynamic workflows" pattern in the orchestrator

**Source:** [Introducing dynamic workflows in Claude Code (2026-05-28)](https://claude.com/blog/introducing-dynamic-workflows-in-claude-code) · follow-up: [A harness for every task: dynamic workflows in Claude Code (2026-06-02)](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code)

**What Anthropic shipped.** Claude Code can now write a JavaScript orchestration file on the fly that spawns tens to hundreds of subagents (each on its own model / effort / worktree) and synthesizes results. Headline case study: Bun's 750k-LoC Zig → Rust port shipped in 11 days with 99.8% of the test suite passing, called by Jarred Sumner "the state of the art today for reliably using agents to complete medium-to-large projects."

**Why this is defer, not apply.** The harness already has a coordinator/worker dispatch pattern: the `orchestrator` agent parses spec tasks and dispatches each to opus/sonnet/haiku subagents (`/run-wave` does this in a worktree), and `run-loop` runs autonomous wave/issue dispatch. So the harness has the *shape* of dynamic workflows already — what Anthropic's release adds on top is:

- Subagents written to a JS file the model can re-edit on the fly (vs. the harness's task-list-driven model where dispatch is parsed from `docs/plan.md`).
- Per-subagent worktree isolation as a first-class primitive (the harness's `/run-wave` worktree dispatch is the closest analog; `run-loop` has its own worktree runner).
- Empirical evidence that the pattern scales to 100s-of-subagent jobs.

For a solo coding harness whose typical wave is single-digit tasks, the migration cost is high (an architecture rewrite of the orchestrator + `/run-wave`) for parallelism the maintainer is not yet hitting a ceiling on. The right time to revisit is when wave size grows enough that sequential dispatch becomes the bottleneck, or when a consumer project on this harness needs a 100k+ LoC migration that the current orchestrator can't fan out cleanly. **scope: speculative**

**Verify before applying:** `grep -n "dynamic workflow\|dynamic-workflow" .claude/agents/orchestrator.md skills/run-wave/SKILL.md skills/run-loop/SKILL.md` — if a dynamic-workflows mode is already documented, this § is already shipped; drop it. Also check if `.claude/agents/orchestrator.md` cites the dynamic-workflows blog as deferred-context: if so, the deferral is already on the record.

**Recommended verdict:** defer until orchestrator parallelism becomes a measurable bottleneck.
**Status:** PENDING — awaiting triage in PR review

---

## 5. Use HTML (not markdown) for evaluator / planner artifact output

**Source:** [Using Claude Code: The unreasonable effectiveness of HTML (2026-05-20)](https://claude.com/blog/using-claude-code-the-unreasonable-effectiveness-of-html)

**What the post argues.** As agents got more capable, Markdown became a restrictive output format: long markdown docs are hard to read, don't render natively in most browsers, and can't carry visualizations, color, or interactivity. The author (Thariq Shihipar, Claude Code team) advocates asking Claude to emit HTML for reports and long artifacts.

**Why reject for this harness.** The harness's artifacts (`evaluation-report.md`, `docs/plan.md`, `docs/specs/*.md`, `today_goal.md`, `current_micro.md`, wave files, PR bodies, this very file) are consumed by *other parts of the harness* (`commit`, `archive-plan`, `apply-anthropic-reviews`, `close-wave`, the planning-loop arbiter) and by `gh pr` / `git log` views — all of which speak markdown by default. Switching to HTML would break grep workflows, fail to render in `gh` PR threads, and add a rendering step before any human-skim review.

The HTML advice fits a different shape — Anthropic's own use case is interactive reports a human opens in a browser. The harness has no such surface. If a consumer project on this harness later needs HTML reports (e.g. a `ui-evaluator` rubric scorecard rendered for a stakeholder), that would be a project-specific override, not a harness-wide convention. **scope: speculative**

**Verify before applying:** `grep -rn "\.html\b" skills/ procedures/ .claude/agents/ 2>/dev/null` — if any harness skill/procedure/agent already emits HTML artifacts, the rejection rationale here needs re-evaluation.

**Recommended verdict:** reject — markdown-first artifact pipeline is intentional; HTML would create rendering friction without payoff at solo coding scale.
**Status:** PENDING — awaiting triage in PR review
