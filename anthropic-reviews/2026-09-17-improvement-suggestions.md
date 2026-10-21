# Anthropic post review — 2026-09-17

Last review ran 2026-05-10. Four months of Claude Code releases have shipped since, plus one high-signal claude.com/blog piece. Cap at ~10 suggestions to keep triage tractable; the highest-leverage item is §1 (model pin drift — the harness has been pinned to Opus 4.7 since April while Opus 5 became the default in July).

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Refresh `.harness-profile` model pin (Opus 4.7 → Opus 5; Sonnet 4.6 → Sonnet 5) | apply | Concrete drift from two new default models since May; matches existing pin convention |
| 2 | Extend `.harness-profile.model.fallback` to a chain (max 3) | apply | Claude Code now supports 3-deep fallback; harness schema is single-value only |
| 3 | Adopt `claude plugin eval` for skill regression testing | spec | Big shift in how skills are QA'd; existing `skills/skill-creator/eval-viewer/` overlap needs a design pass, not a straight port |
| 4 | Run `/skill-doctor` once against the harness's 25 skills and record findings | apply | Cheap audit; harness ships 25 skills to `~/.claude/skills/`, no visibility today into which are unused |
| 5 | Add `PreModelSwitch` / `PostModelSwitch` hook slots to session-start conventions | defer | Interesting for orchestrator model-routing telemetry, but no current pain |
| 6 | Compare `/workflows` (dynamic workflows) to orchestrator dispatch | defer | Anthropic-side alternative to the harness's own multi-agent dispatch; premature to swap |
| 7 | Document `--restricted` for the `run-loop` sandbox runner | defer | Sandbox runner already isolates via container/worktree; `--restricted` is a Claude-Code-side simplification, not a replacement |
| 8 | Note the "Claude 5 context engineering" pruning guidance in AGENTS.md/CLAUDE.md steward notes | defer | Directional; no evidence current AGENTS.md is over-specified for Claude 5-generation models |
| 9 | Add `disableBundledSkills` / `disallowed-tools` frontmatter examples to `skills/skill-creator` reference | reject | Speculative; no signal the harness's own skills need to shed bundled or gate tools |
| 10 | Auto mode became the default permission mode Aug 14 — reconcile with harness settings | reject — already covered by 2026-05-08 §1 | Duplicates a still-open thread in an earlier review file |

---

## 1. Refresh `.harness-profile` model pin — Opus 4.7 → Opus 5; Sonnet 4.6 → Sonnet 5

**Sources:**
- Claude Code Week 27 (June 29 – July 3, 2026): "Claude Sonnet 5 — the new default model for Pro, Team Standard, and Enterprise subscription seats … native 1M-token context window, and adaptive thinking on by default." https://code.claude.com/docs/en/whats-new/2026-w27
- Claude Code Week 30 (July 20–24, 2026): "Claude Opus 5 — the new default Opus model in Claude Code, with a 1M-token context window and fast mode at $10/$50 per MTok." https://code.claude.com/docs/en/whats-new/2026-w30
- Claude Code Week 36 (Aug 31 – Sep 4, 2026): "Claude Fable 5.1 is available in Claude Code with a 1M-token context window." https://code.claude.com/docs/en/whats-new/2026-w36

**Current state (2026-09-17):** `.harness-profile` still pins:

```yaml
model:
  primary: claude-opus-4-7
  fallback: claude-sonnet-4-6
```

That was set in `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md` when Opus 4.7 was the newest release. Since then Anthropic has shipped Opus 4.8 (May), Sonnet 5 (June), Opus 5 (July), and Fable 5.1 (September). The pin still resolves — Opus 4.7 is still callable — but the harness is running against a model line two majors behind.

**Concrete change:**

```diff
 model:
-  primary: claude-opus-4-7
-  fallback: claude-sonnet-4-6
+  primary: claude-opus-5
+  fallback: claude-sonnet-5
   effort_default: xhigh   # derived from stakes.level: medium
```

Also update `skills/project-init/SKILL.md`'s copy-of-profile template and the "Aligned with Anthropic's 2026-04-23 postmortem" comment (Opus 5 defaults may have different effort semantics — read the release notes before copying the comment verbatim).

**Expected payoff:** Sessions started from the harness use the current-generation model instead of a 5-month-old one. 1M-token context on both tiers changes what fits in a single `/run-wave` orchestrator turn.

**Verify before applying:** `grep -n "primary:" .harness-profile` — if the value is no longer `claude-opus-4-7`, someone already ran this. And check https://code.claude.com/docs/en/model-config#available-models for whether Opus 5 has been superseded by the time you triage this.

**Recommended verdict:** apply — concrete drift, low risk, one-file edit; matches the exact convention `.harness-profile` was built for.
**Status:** PENDING — awaiting triage in PR review

---

## 2. Extend `.harness-profile.model.fallback` to a chain (max 3)

**Source:** Claude Code Week 24 (June 8–12, 2026): "`fallbackModel` configures up to three fallback models tried in order when the primary is overloaded or unavailable, and `--fallback-model` now applies to interactive sessions too." https://code.claude.com/docs/en/whats-new/2026-w24

**Current state:** `.harness-profile` supports a single `model.fallback` string. If that fallback is also overloaded, sessions fail.

**Concrete change:** Widen `.harness-profile` schema to accept either a string (current) or a list of up to 3 strings:

```yaml
model:
  primary: claude-opus-5
  fallback:
    - claude-sonnet-5     # first fallback
    - claude-fable-5-1    # second fallback (cheaper, still 1M context)
  effort_default: xhigh
```

Update `skills/project-init/SKILL.md` and any consumer of `model.fallback` (the drift detector, `/run-wave` dispatch) to accept the list form; keep back-compat with the single-string form. The Claude Code `fallbackModel` setting is the mechanism that consumes it at runtime — the harness just needs to emit the right shape.

**Expected payoff:** Fewer session failures during Anthropic capacity events (the May 2026 SpaceX-limits post confirmed capacity is still bursty). Cost governance: a cheaper Fable/Haiku fallback keeps sessions running when the two Opus/Sonnet tiers are both saturated.

**Verify before applying:** `grep -rn "\.harness-profile" skills/ docs/` — count how many places read `model.fallback` as a single string; if it's more than ~3, this becomes a spec-worthy refactor rather than an apply. Also re-check https://code.claude.com/docs/en/model-config#fallback-model-chains for whether the ceiling has moved from 3.

**Recommended verdict:** apply — small schema evolution; pairs naturally with §1 (upgrade + widen in one commit).
**Status:** PENDING — awaiting triage in PR review

---

## 3. Adopt `claude plugin eval` for skill regression testing (spec)

**Sources:**
- Claude Code Week 37 (Sep 7–11, 2026): "`claude plugin eval` runs your plugin against a suite of test cases, scores the results, and by default runs each case again without the plugin so you can see what it contributes. `claude plugin eval init` … writes the files." https://code.claude.com/docs/en/whats-new/2026-w37
- Docs: https://code.claude.com/docs/en/plugin-evals
- v2.1.269, Sept 11, 2026. Graders: `regex`, `tool_used`, `tool_order`, `file_exists`, `llm`, `baseline`. CI flags: `--threshold`, `--model`, `--judge-model`, `--no-publish`, `--max-cost-usd`.

**Current state:** The harness ships 25 skills to `~/.claude/skills/` via symlink. Only `skills/planning-loop/evals/` has an eval suite (using `evals.json` + `trigger-eval.json`). `skills/skill-creator/` bundles its own `eval-viewer/generate_review.py` script — a legacy pattern from before `claude plugin eval` existed.

**What "adopt" would mean — and why it's spec, not apply:**

1. The harness distributes skills via a symlink to `~/.claude/skills/`, **not** as a plugin. `claude plugin eval` expects a `plugin.json` (or `.claude-plugin/plugin.json`) manifest and looks for cases under `evals/` next to it. Reconciling the harness's symlink-distribution model with the plugin-eval expectations is not trivial.
2. `skills/skill-creator/eval-viewer/` currently owns the eval workflow (see `skills/skill-creator/SKILL.md` "run evals to test a skill, benchmark skill performance"). Migrating it wholesale to `claude plugin eval` is a rewrite of that skill's eval contract, not an additive change.
3. Grader taxonomy is new (`regex`, `tool_used`, `tool_order`, `file_exists`, `llm`, `baseline`). Deciding which graders map onto the harness's existing skill contracts (e.g. does `run-loop`'s "picked up the right issue" test become `tool_used`?) needs a design pass.
4. Adding a CI gate (`--threshold`) touches CI config the harness doesn't ship today.

**Expected payoff:** Every skill gets a regression suite, with an automated baseline-delta check. The current setup gives that to `planning-loop` only.

**Verify before applying (before running `/spec-planner`):** `ls skills/*/evals/` — if more than one skill has grown its own eval suite, the design constraint shifts (converge them). Also check https://code.claude.com/docs/en/plugin-evals for whether the harness's symlink-distribution model can be handled without wrapping each skill in a plugin manifest.

**Recommended verdict:** spec — the payoff is real (25 skills, only 1 with evals) but the shape needs a design pass to reconcile the harness's distribution model with Claude Code's plugin-eval expectations. Route via `/spec-planner`.
**Status:** PENDING — awaiting triage in PR review

---

## 4. Run `/skill-doctor` once against the harness's 25 skills and record findings

**Source:** Claude Code Week 36 (Aug 31 – Sep 4, 2026): "`/skill-doctor` shows what each of your skills costs in context and how often it gets used, so you can decide which ones to turn off. Every skill in the skill listing adds to your context on every turn, whether or not Claude ever uses it. Requires v2.1.252 or later." https://code.claude.com/docs/en/whats-new/2026-w36

**Current state:** The harness ships 25 skills to `~/.claude/skills/`. `anthropic-reviews/reviewed-posts.md` line 2026-05-07 already notes an ad-hoc audit ("~6.1K of ~15.5K skills budget used"), but that was hand-computed. `/skill-doctor` gives it as a first-class report with usage frequency, which is what actually determines whether a skill earns its context cost.

**Concrete change:** One-time audit, not a permanent change to the repo. Steps:

1. In an interactive Claude Code session on `claude-harness`, run `> /skill-doctor` and open the report in the `/plugin` manager's Stats tab.
2. In `-p` mode: `claude -p "/skill-doctor"` to print the report as text.
3. Save the text output to `anthropic-reviews/2026-09-17-skill-doctor-audit.md` (or an equivalent path) for durable comparison against future runs.
4. If any harness skill shows 0 uses across recent sessions, mark it as a follow-up candidate for deletion or lazier loading. Do not delete without a separate review — usage frequency is measured per-user, and a skill that's unused in your own sessions may be load-bearing for a target project that ran `setup-harness`.

Follow-up: consider adding `harness-status` or `session-end` to emit skill-usage metrics automatically. Out of scope for this §.

**Expected payoff:** Concrete data (per-skill context cost + usage frequency) instead of the current hand-count. Establishes a durable baseline.

**Verify before applying:** `claude --version` — needs v2.1.252 or later. Also check that `feature-flag fetching` is not disabled in the session (see https://code.claude.com/docs/en/env-vars#features-that-need-feature-flag-fetching — `/skill-doctor` isn't available there).

**Recommended verdict:** apply — cheap, one-shot, and produces a durable artifact that informs future skill-pruning decisions. No repo diff needed unless the audit surfaces a specific skill to drop.
**Status:** PENDING — awaiting triage in PR review

---

## 5. Add `PreModelSwitch` / `PostModelSwitch` hook slots to session-start conventions

**Source:** Claude Code Week 36 (Aug 31 – Sep 4, 2026): "A `PreModelSwitch` hook can block a model switch you request, and a `PostModelSwitch` hook can add context for Claude after the session's model changes." https://code.claude.com/docs/en/whats-new/2026-w36

**Current state:** `.claude/settings.json` in the harness has `"hooks": {}` — no hooks registered. The harness doesn't currently guard against model switches; if the user runs `/model claude-fable-5-1` mid-session, the orchestrator has no way to see that or adjust.

**Concrete change (if applied later):** A `PreModelSwitch` hook could:

- Refuse a switch to a model below the harness's floor (e.g. block switches to Haiku for stakes:medium repos)
- Log the switch to `.harness-state/orchestrator.jsonl`

A `PostModelSwitch` hook could inject a one-line memo: "session now on <model>; orchestrator will re-plan xhigh work". Both are new surfaces that pair naturally with `.harness-profile.model.effort_default`.

**Expected payoff:** Model-routing safety net for xhigh work on stakes:medium+ repos, and observability for the drift detector.

**Verify before applying:** `grep -rn "PreModelSwitch\|PostModelSwitch" .` — if either already exists, this is done. Also check https://code.claude.com/docs/en/hooks for whether the hook contract has changed since w36.

**Recommended verdict:** defer — real value, but no current pain (single-maintainer, drift detector doesn't yet consume model-switch events). Revisit if the drift detector gains model-routing checks or if a target project reports mid-session model-switch bugs.
**Status:** PENDING — awaiting triage in PR review

---

## 6. Compare `/workflows` (dynamic workflows) to the harness's orchestrator dispatch

**Sources:**
- Claude Code Week 22 (May 25–29, 2026): "A workflow is an orchestration script Claude writes for your task and runs across many subagents in the background. Use one when a task is too large for one conversation to coordinate: a codebase-wide audit, a large migration, a research question that needs cross-checking. Manage runs with `/workflows`." https://code.claude.com/docs/en/whats-new/2026-w22
- Docs: https://code.claude.com/docs/en/workflows

**Current state:** The harness's `orchestrator` agent (`.claude/agents/orchestrator.md` per the agent listing) dispatches tasks across opus/sonnet/haiku subagents. Dynamic workflows are Anthropic-side infrastructure for the same pattern, with the workflow script authored by Claude, run in the background, and managed via `/workflows` and telemetry.

**Two questions the maintainer would have to answer before adopting:**

1. Is the harness's `orchestrator` a strict subset of what `/workflows` provides, or does it encode harness-specific policy (wave discipline, phase-gate enforcement) that a raw workflow script wouldn't carry?
2. If it's the latter — can the harness emit workflow scripts as an output, so `/run-wave` becomes "generate the workflow script, then hand off to `/workflows`"?

The May 2026 tracker already flagged this direction in `2026-05-07 §1` (re-affirming brain/hands split from 2026-04-19 §2). This § names it explicitly for the September changelog release.

**Expected payoff:** If workflows can absorb the orchestrator's subagent dispatch, the harness sheds a substantial amount of custom orchestration code and inherits observability, retry policy, and cost caps for free.

**Verify before applying:** Read https://code.claude.com/docs/en/workflows in full before scoping a spec — the API surface has moved through multiple weekly releases and the specific dispatch API today may or may not fit the harness's phase-gate semantics. Also cross-reference the still-deferred 2026-04-19 §2 (brain/hands split) to make sure this isn't just re-litigating that decision.

**Recommended verdict:** defer until the maintainer has spent one session driving a real task through `/workflows` and can compare the wall-clock and quality against a `/run-wave` run of the same task. No point speccing until that comparison exists.
**Status:** PENDING — awaiting triage in PR review

---

## 7. Document `--restricted` for the `run-loop` sandbox runner

**Source:** Claude Code Week 35 (Aug 24–28, 2026): "Restricted mode starts Claude Code without the built-in tools that run commands or code. Use it when an evaluation harness drives `claude` on a shared machine. Start it with `--restricted` or set `CLAUDE_CODE_RESTRICTED=1`. Claude Code also removes `WebFetch`, confines the file tools to the working directories, loads only managed settings and `--settings`, and refuses the `bypassPermissions` permission mode." https://code.claude.com/docs/en/whats-new/2026-w35 — flag: `--restricted`, v2.1.248.

**Current state:** `skills/run-loop/SKILL.md` documents two runners: a **worktree runner** (`.claude/worktrees/agent-<id>/`) and a **sandcastle runner** (container engine). `CLAUDE.md` calls the container engine "sandcastle" (my read; verify with the sandbox source). Neither picks up `--restricted` today.

**Concrete change (if applied):** Add a `--restricted` mode toggle to the loop's runner config so a run-loop invocation on a shared or CI machine can start Claude Code without command-running tools. This is orthogonal to the container isolation — `--restricted` is defense-in-depth for cases where the runner already trusts the container but wants an extra guardrail against, say, an untrusted `.mcp.json` in the target project.

**Expected payoff:** Additional layer of blast-radius control for `/run-loop` on a shared box. Minor unless the harness gains an unattended cloud runner.

**Verify before applying:** `grep -rn "\-\-restricted\|CLAUDE_CODE_RESTRICTED" skills/_shared/loop/` — if it's already threaded through, this is done. Also check whether the sandcastle runner's container already provides equivalent isolation (making `--restricted` redundant).

**Recommended verdict:** defer — the container-based sandcastle runner already restricts blast radius; `--restricted` is belt-and-suspenders. Revisit if the harness adds an unattended cloud runner without container isolation, or if a target project reports blast-radius escapes.
**Status:** PENDING — awaiting triage in PR review

---

## 8. Note the "Claude 5 context engineering" pruning guidance in AGENTS.md / CLAUDE.md steward notes

**Sources:**
- claude.com/blog: "The new rules of context engineering for Claude 5 generation models" (referenced in Anthropic tweets and third-party summaries; URL: https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models — currently blocked by this sandbox's egress proxy, so verify the primary source manually before applying)
- Secondary corroboration: Anthropic Cut 80% of Claude Code's System Prompt for advanced models (techstrong.ai coverage, referenced above)

**Current state:** `CLAUDE.md` (35 lines) and `AGENTS.md` (131 lines) are the harness's steering documents. Both were written for the 4.x generation and encode a lot of explicit guardrails (e.g. AGENTS.md's 5-question portability test, the "when in doubt → AGENTS.md wins" resolution rule). The claude.com/blog piece argues that Claude 5-generation models want less imperative prompting and more context — that many explicit rules can be dropped and the model given room to judge.

**Concrete change (if applied):** This is directional guidance, not a diff. What would be actionable:

- Audit `AGENTS.md` for imperative rules that duplicate what a 5-generation model would already do (e.g. "never delete a suggestion silently" — is that a Claude 5 default, or a durable harness convention?).
- Distinguish **harness policy** (rules the maintainer wants to survive model upgrades) from **model coaching** (rules that compensate for a 4.x-generation limitation).
- Keep the former; consider trimming the latter.

**Expected payoff:** Leaner steering documents, better use of Claude 5-generation models' judgment. Non-obvious; needs evidence a specific rule is inflating context without changing behavior.

**Verify before applying:** Fetch https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models directly (egress to `claude.com` was blocked from this run — the maintainer's own environment may allow it) and confirm the post's actual recommendations before restructuring anything. Also — if `/skill-doctor` (§4) surfaces a specific skill whose SKILL.md is bloated with 4.x-era coaching, this is the concrete evidence you'd want.

**Recommended verdict:** defer until (a) the primary source can be read directly and (b) `/skill-doctor` or a specific session provides evidence that harness prose is over-specified for a 5-generation model. Directional advice without a concrete diff is exactly what the maintainer flags as "padding" in `anthropic-reviews/README.md#Anti-patterns`.
**Status:** PENDING — awaiting triage in PR review

---

## 9. Add `disableBundledSkills` / `disallowed-tools` frontmatter examples to `skills/skill-creator` reference

**Sources:**
- Claude Code Week 24 (June 8–12, 2026): "New `disableBundledSkills` setting and `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS` hide bundled skills, workflows, and built-in commands from the model." https://code.claude.com/docs/en/whats-new/2026-w24
- Claude Code Week 22 (May 25–29, 2026): "Skills and commands can set `disallowed-tools` in frontmatter to remove tools from the model while the skill is active." https://code.claude.com/docs/en/whats-new/2026-w22

**Current state:** `skills/skill-creator/SKILL.md` documents skill authoring but doesn't reference `disallowed-tools` frontmatter or `disableBundledSkills`.

**Concrete change:** Add a two-paragraph reference in `skills/skill-creator/references/` (which already exists) covering:

- When to use `disallowed-tools` frontmatter (skill wants to prevent the model from calling a specific tool during its active window — e.g. a review-only skill blocking Edit/Write)
- When to use `disableBundledSkills` at the profile level (target project wants to see only harness skills, not the bundled Anthropic ones)

**Expected payoff:** Skill authors know these levers exist. Small documentation improvement.

**Verify before applying:** `grep -rn "disallowed-tools\|disableBundledSkills" skills/` — if already documented, drop this. Also — this is exactly the "add architecture ahead of current need" pattern flagged in the review-prompt as speculative; the harness has no current signal that skill authors are asking about these levers.

**Recommended verdict:** reject — speculative. No current evidence the harness's skill authors need these levers, and adding reference material "just in case" is what `anthropic-reviews/README.md` calls padding. Revisit if a specific skill needs `disallowed-tools`.
**Status:** PENDING — awaiting triage in PR review

---

## 10. Auto mode became the default permission mode Aug 14 — reconcile with harness settings

**Source:** Claude Code Week 32 (Aug 3–7, 2026): "auto mode becomes the default permission mode for new sessions on Pro, Max, and Team plans starting August 14." https://code.claude.com/docs/en/whats-new/2026-w32

**Current state:** `.claude/settings.json` is essentially empty (`{"hooks": {}}`). The 2026-05-08 review already produced `2026-05-08 §1` covering the same auto-mode-defaulting topic; that § is still open (Status: PENDING) per the file at `anthropic-reviews/2026-05-08-improvement-suggestions.md`.

**Concrete change:** None new — this row exists so the 2026-09-17 tracker doesn't silently drop the topic and re-derive it in a future run.

**Verify before applying:** Read `anthropic-reviews/2026-05-08-improvement-suggestions.md#1` for the still-open decision on auto mode. Only revisit here if that § has been closed with a status that leaves the harness's auto-mode stance ambiguous under the Aug 14 default.

**Recommended verdict:** reject — duplicates `2026-05-08 §1`, which is still awaiting triage. Route feedback there, not here.
**Status:** PENDING — awaiting triage in PR review

---

## Discovery notes

- **Egress:** `www.anthropic.com` and `claude.com` were both blocked by the sandbox's egress proxy this run; only `code.claude.com` was reachable directly. WebSearch worked, so I cross-referenced third-party summaries for Anthropic-side posts, but the maintainer should verify the primary URLs on `www.anthropic.com/engineering` and `claude.com/blog` before applying §8 in particular.
- **Backlog:** The tracker's last review was 2026-05-10 (four months ago). This run covers Claude Code weekly digests from Week 20 (May 11–15) through Week 37 (Sep 7–11) — 18 weeks. I focused on the highest-signal harness surfaces (model pins, skill evals, orchestrator, permission defaults) rather than trying to cover every weekly digest exhaustively. If the maintainer wants any specific week promoted to its own §, comment on this PR and a follow-up run can expand it.
