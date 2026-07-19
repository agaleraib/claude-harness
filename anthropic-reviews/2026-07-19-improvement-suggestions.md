# Anthropic Post Review — 2026-07-19

**Review window:** posts published 2026-05-11 → 2026-07-19 (68-day gap since the last run on 2026-05-10, so the queue is deep). Reviewed 15 posts total; 6 produced suggestions, 9 skipped in the tracker with one-line reasons.

The high-leverage finds this run are model-pin bumps that mirror Anthropic's own default upgrades (Opus 4.7 → 4.8 on 2026-05-28, Sonnet 4.6 → 5 on 2026-06-30) and a low-cost SKILL.md convention (add `## Gotchas` sections) from the June 3 "How we use skills" post. The rest are deferrals of larger shape changes (Dynamic Workflows, sandboxing) that are worth marking but not worth building against today.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Bump `.harness-profile` model.primary → `claude-opus-4-8` | apply | Same-price successor; Anthropic reports 4× fewer unflagged code flaws vs 4.7; the harness's stance is to track the current Opus tier. |
| 2 | Bump `.harness-profile` model.fallback → `claude-sonnet-5` | apply | Sonnet 4.6 → 5 is a substantial agentic upgrade at intro pricing; matches the harness's own `run-loop` note that already invokes an Opus API 4.8 reviewer. |
| 3 | Add `## Gotchas` sections to SKILL.md files | apply | The June 3 "How we use skills" post calls this the highest-signal content in any skill; the harness has 0 skills with the convention today. Concrete and cheap. |
| 4 | Note Dynamic Workflows / `ultracode` alongside `/run-loop` | defer until Workflow tool has adversarial-verify parity with the run-loop mechanical gate | Anthropic's Workflow tool (v2.1.154+) covers fan-out/adversarial-verify patterns the harness's `/run-loop` also targets, but the run-loop's per-item verify + auto-merge/PR gate is not a Workflow substitute today. Bookmark. |
| 5 | Recommend `sandbox.enabled: true` + `sandbox.credentials` in `setup-harness` for target projects | defer until target-project telemetry shows an actual exfiltration or permission-fatigue signal | Sandboxing is powerful but per-platform (Seatbelt/bubblewrap) and the harness ships to a solo maintainer's projects; no evidence yet that permission fatigue or credential-exfil risk is a live problem. |
| 6 | Reconcile "Loop engineering" post advice against the harness's own `/run-loop` | defer until the next `/run-loop` retro | The June 30 post is a "getting started with loops" primer; the harness's `/run-loop` is already past the primer stage. Worth re-reading when the next termination-cap or mechanical-gate edit lands. |

---

## 1. Bump `.harness-profile` model.primary from `claude-opus-4-7` → `claude-opus-4-8`

**Source:** [Introducing Claude Opus 4.8](https://www.anthropic.com/news/claude-opus-4-8) (published 2026-05-28)

**What the post says.** Opus 4.8 launched 41 days after Opus 4.7 at the same API price ($15/M input, $75/M output). Anthropic reports it is roughly 4× less likely than Opus 4.7 to let flaws in code it has written pass unremarked, is the only model to complete every case end-to-end on Anthropic's Super-Agent benchmark, and ships as the default model in Claude Code alongside the new Dynamic Workflows feature (see §4). Fast mode for Opus 4.8 is 3× cheaper than for prior Opus models. Model ID: `claude-opus-4-8`.

**Why this belongs in the harness.** The harness's stance is "track the current Opus tier": the pinned model in `.harness-profile:29-32` drives orchestrator dispatch, and `README.md:3-25` calls out Opus 4.7's low-effort literal-instruction-following as the reason terse rubrics work. That reasoning is inherited by 4.8 (Anthropic's post explicitly frames 4.8 as "more reliable and sharper in judgment" — same behavior model, better honesty pressure). The prior Opus 4.6 → 4.7 bump was tracker row [2026-04-19 §1](./2026-04-19-improvement-suggestions.md#1-upgrade-the-harness-from-opus-46-to-opus-47) and applied cleanly; this run's bump is the same shape.

**Concrete changes.**

- `.harness-profile:29-32`: change `model.primary` from `claude-opus-4-7` → `claude-opus-4-8`.
- `skills/project-init/SKILL.md`: 4 references to `claude-opus-4-7` as the default `model.primary` for new project harness profiles; update all 4 to `claude-opus-4-8`.
- `README.md`: 6+ prose references to "Opus 4.7" that describe the harness's design assumptions. Update to "Opus 4.8" where the sentence names a model version; leave references to older postmortems / research citations (e.g. the 2026-04-23 postmortem cited on line 30) unchanged, since those events happened on Opus 4.7.
- Do NOT change the `.harness-profile:19-24` comment block that references the 2026-04-23 postmortem — that's a historical citation for the `xhigh` effort_default derivation, still valid.

**Expected payoff.** Puts new-project defaults on the honesty-tuned successor; the harness's terse-rubric approach benefits directly from Anthropic's "4× less likely to let flaws pass unremarked" claim, since that's the exact failure mode the rubrics catch.

**Verify before applying:** `grep -rn "claude-opus-4-7\|Opus 4\.7" .harness-profile skills/project-init/SKILL.md README.md` — if any of these files no longer contain those tokens, a prior PR already bumped and this § is stale.

**Recommended verdict:** apply — same-price successor; the reasoning behind the current pin transfers unchanged.
**Status:** PENDING — awaiting triage in PR review

---

## 2. Bump `.harness-profile` model.fallback from `claude-sonnet-4-6` → `claude-sonnet-5`

**Source:** [Introducing Claude Sonnet 5](https://www.anthropic.com/news/claude-sonnet-5) (published 2026-06-30)

**What the post says.** Sonnet 5 is "the most agentic Sonnet model yet", available at intro pricing of $2/M input, $10/M output through 2026-08-31 (moves to $3/$15 after), with performance close to Opus 4.8 at lower cost. Substantial improvement over Sonnet 4.6 on reasoning, tool use, coding, and knowledge work. Available on all subscription tiers and every Claude Code deployment surface. Model ID: `claude-sonnet-5`.

**Why this belongs in the harness.** `.harness-profile:29-32` and `skills/project-init/SKILL.md` pin `claude-sonnet-4-6` as the orchestrator's cost/latency demotion target. Sonnet 5's cheaper intro pricing + near-Opus-4.8 quality is the exact tradeoff the fallback slot is for. Note: `skills/run-loop/SKILL.md:19-27` documents an already-completed live clean-room drain against `anthropic-api:opus-4.8` (as reviewer, not primary) — so the harness's downstream tooling already emits 4.8 identifiers; the profile-level pin should not lag.

**Concrete changes.**

- `.harness-profile:29-32`: change `model.fallback` from `claude-sonnet-4-6` → `claude-sonnet-5`.
- `skills/project-init/SKILL.md`: 4 references to `claude-sonnet-4-6` as the default fallback; update all 4 to `claude-sonnet-5`.
- Cross-check `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md`: the pin-schema spec references the `4-6` / `4-7` pair as an example; leave the historical spec unchanged (design docs are not living config), but a `-o-that-was-then` note may be worth adding if a future spec revisits pin format.

**Expected payoff.** Fallback slot matches the current Sonnet frontier; also fixes a semantic gap where the demotion target predates the primary by two generations (a two-generation gap makes routing weird when the primary bumps to 4.8).

**Verify before applying:** `grep -rn "claude-sonnet-4-6" .harness-profile skills/project-init/SKILL.md` — if hits are already zero, this § is stale. Also re-check https://www.anthropic.com/news/claude-sonnet-5 for any intro-pricing deprecation notice past 2026-08-31 that would change the value calculation.

**Recommended verdict:** apply — same shape as §1; the fallback slot is design-committed to tracking the current Sonnet tier.
**Status:** PENDING — awaiting triage in PR review

---

## 3. Add `## Gotchas` sections to SKILL.md files

**Source:** [Lessons from building Claude Code: How we use skills](https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills) (Thariq Shihipar, published ~June 3, 2026)

**What the post says.** From the search-visible content of the post (WebFetch is 403 on claude.com, so this is compiled from multiple third-party summaries): "The highest-signal content in any skill is the Gotchas section, built up from common failure points that Claude runs into when using your skill." Concrete examples the post gives include:

- "The subscriptions table is append-only. The row you want is the one with the highest version, not the most recent `created_at`."
- "This field is called `@request_id` in the API gateway and `trace_id` in the billing service. They're the same value."
- "Staging returns 200 even when the Stripe webhook didn't actually process. Check `payment_events` for the real state."

The pattern is: after Claude fails at something in the same predictable way twice, capture the failure mode as a one-liner in the skill's `## Gotchas` section. Over time it becomes the skill's most-consulted section.

**Why this belongs in the harness.** Grepping the whole tree shows zero SKILL.md files with a `## Gotchas` heading (verified via `grep -rn "^## Gotchas\|^### Gotchas" skills/`). The harness's skills are long (planning-loop is 719 lines, close-wave 675, skill-creator 488) — exactly the class of skill where a Gotchas section pays off, because there's enough surface for Claude to fail predictably in the same way twice. `skills/skill-creator/SKILL.md` already vends anthropic-skill-authoring guidance (progressive disclosure, under-500-lines) but does not currently prescribe a Gotchas convention — which is precisely where the June 3 post breaks new ground.

**Concrete changes.** Two-step:

**Step A — convention.** Add a "Gotchas" recommendation to `skills/skill-creator/references/anthropic-skill-authoring.md` (the vendored best-practices snapshot the skill-creator reads before drafting). One paragraph:

> **## Gotchas section (highest-signal content).** After Claude fails at the same thing twice in a skill's territory, capture the failure mode as a one-liner under a `## Gotchas` section. Format: one bullet per gotcha, terse, stating the surprising fact directly (not the debugging steps). Over time this becomes the section Claude consults first. Update proactively; delete gotchas that go stale after a fix ships.

**Step B — retrofit.** Walk the 14 top-level SKILL.md files (`skills/*/SKILL.md`, excluding `_shared`) and add a `## Gotchas` section to any where an accumulated failure mode is already captured elsewhere in the body (buried in a warning or a "watch out" callout). Start with `run-loop`, `run-wave`, `close-wave`, `planning-loop`, and `commit` — these are the ones with enough history to have known gotchas. Do not fabricate gotchas; if there are none, leave the section unadded.

**Expected payoff.** Concrete step toward Anthropic-internal best practice; low cost (each retrofit is a 5-line diff at most). The recurring-failure-mode capture is the exact discipline the harness's `parking_lot.md` and post-wave `docs/waves/*-receipt.md` conventions already reach for at the project level — Gotchas brings the same idea to the skill level.

**Verify before applying:** `grep -rn "^## Gotchas\|^### Gotchas" skills/` — a nonempty result means at least one skill already has the section, so start with the ones that don't rather than assuming this § is stale. Also `grep -rn "gotcha\|Gotcha" skills/skill-creator/references/` to confirm the authoring reference doesn't already prescribe the convention.

**Recommended verdict:** apply — cheap, concrete, and matches an already-established Anthropic-internal best practice. Two-step (convention update + selective retrofit) is decomposable via `/apply-anthropic-reviews`.
**Status:** PENDING — awaiting triage in PR review

---

## 4. Note Dynamic Workflows / `ultracode` as adjacent to `/run-loop`

**Source:** [A harness for every task: dynamic workflows in Claude Code](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code) + [Claude Code Workflows docs](https://code.claude.com/docs/en/workflows) (blog post ~May 28 2026 alongside Opus 4.8 launch; docs live)

**What the post says.** Anthropic shipped a Workflow tool in Claude Code v2.1.154+ that lets Claude write a JavaScript orchestration script for a task and hand it to a runtime that runs subagents in the background. Key primitives: `agent()`, `parallel()`, `pipeline()`, `phase()`. Trigger by including `ultracode` in a prompt (or setting `/effort ultracode` for a whole session). Supports adversarial-verify, fan-out-and-synthesize, and pipeline patterns. The runtime caps concurrent agents at 16 and total agents per run at 1000. A bundled `/deep-research` workflow ships. Workflows can be saved as slash commands in `.claude/workflows/` (project) or `~/.claude/workflows/` (personal).

**Why this belongs in the harness — bookmark, not action.** The harness has its own execution lane at `skills/run-loop/SKILL.md` + the TS engine at `skills/_shared/loop/` that orchestrates a mechanical gate (implement → exit gate → code-review → bounded auto-fix → verify → atomic-merge) across plan.md waves or `ready-for-agent` gh issues. That's superficially the same shape as Anthropic's Workflow tool, but with three material differences:

1. **The gate.** `/run-loop`'s value is the per-item mechanical gate (verify + auto-merge / PR / block), not the orchestration itself. Workflow's script surface doesn't ship a gate; it ships primitives to build one.
2. **The execution substrate.** `/run-loop` dispatches to Codex or Claude implement adapters, uses an external Opus-API/OpenRouter reviewer, and runs inside git worktrees or a sandcastle container. Workflow's agents are Claude Code subagents in the same session's cwd.
3. **Resumability.** `/run-loop` is a pure function of (work-source state, git state), so "resume is just run again." Workflow is resumable within the same session only.

That said, Anthropic's post explicitly names workflow-shaped tasks the harness's `/run-loop` was built for — "500-file migration", "codebase-wide bug sweep", "adversarial verification" — so future harness runbooks might dispatch a workflow *for one wave item* while `/run-loop` still owns the outer gate. The concrete deferral test: does the Workflow tool ship an adversarial-verify pattern that beats the harness's Codex-review + verify-gate composition at the same or lower token cost?

**Concrete changes (none this run).** No code changes today. When the next `/run-loop` retro or a spec change lands, revisit this § to decide whether:

- Any of the harness's existing workflow-shaped skills (e.g. `/apply-anthropic-reviews` § decomposition) should be re-implemented as a saved workflow under `~/.claude/workflows/` instead of a SKILL.md.
- The `/run-loop` engine should expose a Workflow-tool dispatch mode as one more backend adapter alongside Codex / Claude.

**Expected payoff (deferred).** Meaningful if the Workflow tool matures faster than the run-loop can absorb its patterns; otherwise, keep the harness lean and let Anthropic's tool win where it wins.

**Verify before applying:** `grep -rn "ultracode\|dynamic workflow\|Workflow tool" skills/ docs/` — if any of these strings has surfaced in the interim, someone else already opened the seam. Also re-read https://code.claude.com/docs/en/workflows for any adversarial-verify example that would move the deferral test.

**Recommended verdict:** defer until Workflow tool has adversarial-verify parity with the run-loop mechanical gate — bookmark the shape; do not fold `/run-loop` into it yet.
**Status:** PENDING — awaiting triage in PR review

---

## 5. Recommend `sandbox.enabled: true` + `sandbox.credentials` in `setup-harness` for target projects

**Sources:**
- [How we contain Claude across products](https://www.anthropic.com/engineering/how-we-contain-claude) (published 2026-05-28)
- [Making Claude Code more secure and autonomous with sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing) + [/sandbox docs](https://code.claude.com/docs/en/sandboxing) (live)

**What the posts say.** Claude Code v2.1.187+ ships an OS-level sandbox — Seatbelt on macOS, bubblewrap on Linux — that reads are allowed everywhere by default, writes are allowed only inside the working directory + session temp, and network is deny-by-default (first-host-use prompts, or pre-allow via `sandbox.network.allowedDomains`). Anthropic reports an 84% reduction in permission prompts once sandboxing is on. The engineering post frames it as a "blast radius" bound: even a compromised skill or a phished agent (they cite an internal February 2026 red-team where Claude was tricked into exfiltrating `~/.aws/credentials` 24/25 times) can't leak outside the sandbox. New in v2.1.187: `sandbox.credentials.files` for path-based read-blocks and `sandbox.credentials.envVars` for env-scrubbing (with a `"mode": "mask"` option that keeps `gh`/`npm` working while never letting the sandboxed command see the real token).

**Why this belongs in the harness — deferred, not action.** `setup-harness` (the skill that installs harness config into target projects) currently emits an empty `.claude/settings.json` (`{"hooks": {}}` — verified `cat .claude/settings.json`). The natural place to seed a `sandbox.*` block is here, since setup-harness already knows the platform (macOS vs Linux) and whether the target project has an `.env` / `.aws` / `.ssh` credential surface.

Three reasons this is a *defer* not an *apply*:

1. **Per-platform prereqs.** On Linux/WSL2 the sandbox needs `bubblewrap` and `socat` installed; setup-harness doesn't currently gate on OS-level tooling, and adding "install these packages or the harness won't work" to a setup skill is a regression in itself.
2. **No live signal.** The harness runs on a solo maintainer with `team.size: solo`; there's no reported permission-fatigue or credential-exfil incident in tracker history that would motivate the change.
3. **Sandboxing composes with hooks.** The harness's catastrophic-command denylist hook (documented in `AGENTS.md` and installed globally) already gates the highest-risk categories at the pre-tool-use layer. Sandboxing is complementary, not replacing.

That said — if a target consumer project ever handles secrets (Anthropic API keys, cloud creds, Stripe keys, etc.), the `sandbox.credentials.envVars` with `"mode": "mask"` pattern is the specific new capability worth adopting because it *keeps `gh`/`npm` working* while preventing accidental exfil. Bookmark that as the trigger for reconsidering.

**Concrete changes (none this run).** When a consumer project surfaces a credential-handling need — the trigger — add a stanza to `skills/setup-harness/SKILL.md` that:

- Detects the platform and asks the user to install bubblewrap/socat on Linux/WSL2 if missing.
- Seeds `.claude/settings.json` with `sandbox.enabled: true` and `sandbox.credentials.files: [{path: "~/.aws/credentials", mode: "deny"}, {path: "~/.ssh", mode: "deny"}]`.
- Documents the `"mode": "mask"` pattern for env-scoped credentials in the setup-harness output.

**Expected payoff (deferred).** Blast-radius bound on any target project that installs the harness; specifically closes the credential-exfil vector Anthropic red-teamed in February.

**Verify before applying:** `cat .claude/settings.json` — if it now has a `sandbox` block, this § is partially satisfied. `grep -rn "sandbox\.enabled\|sandbox\.credentials\|bubblewrap" skills/setup-harness/` — nonempty means the seed logic has already landed.

**Recommended verdict:** defer until target-project telemetry shows an actual exfiltration or permission-fatigue signal — the mechanism is real and low-cost to adopt *if* there's a project that needs it, but seeding it into `setup-harness` without a live signal is over-fitting to a hypothetical.
**Status:** PENDING — awaiting triage in PR review

---

## 6. Reconcile "Loop engineering" post advice against the harness's own `/run-loop`

**Source:** [Loop engineering: Getting started with loops](https://claude.com/blog/getting-started-with-loops) (published 2026-06-30)

**What the post says.** Anthropic's "getting started with loops" primer frames the agentic loop as: gather context → take action → check work → repeat if needed → respond. Practical advice for building loops:

- Pick one task where you're the bottleneck; look for the piece you could hand off.
- Write the *verification check* first — the loop only converges if the check is objective.
- Run the loop, observe where it stalls or over-reaches, and iterate on it.
- Move the loop to the cloud with `/schedule` once it stabilizes.

**Why this belongs in the harness — bookmark, not action.** The harness's `/run-loop` skill (184 lines of prose + a 3000-line TS engine at `skills/_shared/loop/`) is well past the primer stage. The verification check the post prescribes is embodied in the harness's per-item mechanical gate (verify-gate + review + bounded auto-fix); the "observe where it stalls" advice is embodied in the `docs/waves/*-receipt.md` post-wave retros. The bookkeeping is done.

But the June 30 post is worth re-reading at the next `/run-loop` termination-cap edit or mechanical-gate revision, because two of its framings are still fresh advice for the harness's future:

1. **"Look for the piece you could hand off."** The harness's current `/run-loop` engine dispatches implement + review, but the plan-writing step (spec-planner) is still hand-driven. Handoff-worthy?
2. **"Move it to the cloud with `/schedule`."** Anthropic Routines (docs at https://code.claude.com/docs/en/routines) are a natural home for the `anthropic-reviews` scheduled routine, and the tracker's [2026-05-10 §2](./2026-05-10-improvement-suggestions.md#2-migrate-the-anthropic-reviews-routine-itself-to-a-claude-code-cloud-routine) already flagged that migration. This § inherits that deferral.

**Concrete changes (none this run).** Re-read the post at the next `/run-loop` retro; carry the routine-migration bookmark forward from 2026-05-10 §2.

**Expected payoff (deferred).** Zero today; potentially non-zero if the loop primer's "handoff" framing matches a real bottleneck in the harness's own dev cycle.

**Verify before applying:** `grep -n "loop-engineering\|getting-started-with-loops" anthropic-reviews/reviewed-posts.md` — if a later § has since acted on this, drop the bookmark. Also re-check the 2026-05-10 §2 Status field; if that migration has happened, this § is fully absorbed.

**Recommended verdict:** defer until the next `/run-loop` retro — no action today; the harness is past the primer's target audience.
**Status:** PENDING — awaiting triage in PR review

---

## Skipped posts (context for the tracker rows)

These posts were reviewed and skipped rather than folded into a §. Brief reasons here; full tracker rows in `reviewed-posts.md`:

- **[Introducing Claude Fable 5 and Mythos 5](https://www.anthropic.com/news/claude-fable-5-mythos-5)** (2026-06-09) — Fable 5 is a Mythos-class model made safe for general use; different tier than the Opus/Sonnet slots the harness pins. Coverage of the model bump story is handled by §1 (Opus 4.8) and §2 (Sonnet 5).
- **[Redeploying Claude Fable 5](https://www.anthropic.com/news/redeploying-fable-5)** — export-controls news; no harness surface.
- **[A new way to reflect on how you use Claude](https://www.anthropic.com/news/reflect-with-claude)** — consumer-facing usage-visualization feature; not a coding harness surface.
- **[Introducing Claude Corps](https://www.anthropic.com/news/claude-corps)** — early-career fellowship program; not a harness surface.
- **[Claude Science, an AI workbench for scientists](https://www.anthropic.com/news/claude-science-ai-workbench)** — vertical AI workbench (biology / chemistry / clinical); not a coding-harness surface.
- **[Bringing Claude Code and Claude Cowork to government](https://claude.com/blog/bringing-claude-code-and-claude-cowork-to-government)** — vertical rollout announcement; no methodology change implied.
- **[How Anthropic runs large-scale code migrations with Claude Code](https://claude.com/blog/ai-code-migration)** — customer case study (Bun migration via Fable 5 + Opus 4.8 + Dynamic Workflows). The methodology insight (parallel + verification-check-driven) is the same as §4; no distinct action.
- **[Claude for Teachers](https://www.anthropic.com/news)** — consumer/education launch; not a harness surface.

**At the 15-post cap.** The Government-of-Alberta customer case study (2026-07-06) is also known but was folded into the Government-vertical row rather than tracked as a distinct row, since it's the same disposition as the Government blog post.
