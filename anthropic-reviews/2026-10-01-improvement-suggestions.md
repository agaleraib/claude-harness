# Anthropic post review — 2026-10-01

**Run window:** 2026-05-11 → 2026-10-01 (first run since 2026-05-10 — the scheduler had a long gap). Capped at 15 posts per `anthropic-reviews/README.md` and the routine prompt; the tracker rows below enumerate every post evaluated this run. Older actionable posts outside the 15-cap (notably the Oct 2025 "Introducing Agent Skills" launch and the Nov 2025 "Advanced tool use" post) remain out of scope by the routine's "since the most recent date in the tracker" rule — note once here, don't re-review next run.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Cite the three containment patterns from "How we contain Claude across products" in `skills/setup-harness/` prior-art notes | defer | Methodology repo, not a sandbox host; patterns inform future `setup-harness` docs but no code surface today |
| 2 | Package the harness as a Claude plugin (vs. symlinks to `~/.claude/skills/`) | reject | Symlink flow in `skills/setup-harness/` works for solo distribution; plugin adds packaging/distribution overhead that only pays off at team scale |
| 3 | Adopt test-impact analysis (TIA) in CI, per "Agentic coding is straining CI" | defer | Harness has no `.github/workflows/` and `test_required: false` in `.harness-profile`; TIA has no surface until CI lands |
| 4 | Migrate `.harness-profile.model.primary`/`fallback` from `claude-opus-4-7`/`claude-sonnet-4-6` to the Claude 5 family (`claude-opus-5-5`/`claude-sonnet-5-5`) | defer | Opus 5.5 released 2026-09-22 (9 days ago); Sonnet 5.5 released 2026-09-28 (3 days ago). Both are still in the typical post-launch stability window — same analogy as the Aug-2025 postmortem the 2026-04-19 model-pin spec cites. Revisit once ~2 weeks have passed with no mass regression reports. |

(Recommended verdict is the agent's call — the maintainer is free to override; the `Status:` line is what binds.)

---

## 1. Cite the three containment patterns from "How we contain Claude across products" in `skills/setup-harness/` prior-art notes

**Source:** [How we contain Claude across products](https://www.anthropic.com/engineering/how-we-contain-claude) (Anthropic Engineering, 2026-05-25)

**Why it caught the routine's eye.** The post lays out three canonical isolation patterns — ephemeral containers (claude.ai), OS-level sandbox with human-in-the-loop (Claude Code), and local VM (Claude Cowork) — and names one architectural rule that *does* generalize to a methodology repo like this one:

> Parse project configuration only after trust boundaries are established.

That is, don't execute `.claude/settings.json` or any skill in the clone directory until the user has confirmed the clone is trusted. Today the harness's `setup-harness` skill (`skills/setup-harness/SKILL.md`) walks the user through installing symlinked skills but doesn't call out the "parse-after-trust" invariant anywhere — a drive-by user cloning a hostile fork and running `/setup-harness` is implicitly trusting the fork's `.claude/settings.json` by executing it.

**Concrete change** (small, in `skills/setup-harness/SKILL.md`):

Add a "Trust boundary" subsection in the pre-install checks that reminds the operator to review `.claude/settings.json` and the top-level `AGENTS.md`/`CLAUDE.md` before running any harness skill from a fresh clone — mirroring Anthropic's own containment rule.

**Expected payoff:** A one-paragraph note that costs ~10 lines of markdown but closes a trust-boundary foot-gun. Low risk, pure documentation.

**scope: speculative** — the actual exploit scenario (a fork maliciously populating `settings.json` with a `PreToolUse` hook that `curl`s a secret) is unlikely for a solo-maintained repo but increases if the harness ever gets a public plugin listing (see §2).

**Verify before applying:** `grep -r "trust" skills/setup-harness/SKILL.md` — if the skill already walks the operator through verifying `.claude/settings.json` before installation, this is already in place and the § should be dropped. Also check whether the 2026-04-19 §4 or any later § already addressed the fresh-clone trust boundary.

**Recommended verdict:** defer until setup-harness UX is next revised — pattern is sound but a solo repo rarely gets fresh-clone attacks; batch with other setup-harness UX changes rather than opening a dedicated commit.

**Status:** PENDING — awaiting triage in PR review

---

## 2. Package the harness as a Claude plugin (vs. symlinks to `~/.claude/skills/`)

**Source:** [Build plugins for Claude](https://claude.com/blog/build-plugins-for-claude) (claude.com/blog, 2026-09-25) and [Claude Marketplace](https://claude.com/blog/claude-marketplace) (2026-09-23)

**Why it caught the routine's eye.** Anthropic's new plugin spec bundles skills, agents, commands, hooks, and MCP servers into a single installable unit distributed through the Claude Marketplace (claude.com/blog says: *"Plugins package MCP connectors, Agent Skills, or both"*; in Claude Code specifically plugins may also include *"LSPs, commands, hooks, and agents"*). This repo currently ships skills by symlink from `skills/` into `~/.claude/skills/`, documented in `CLAUDE.md` under "Skills directory layout". A plugin would collapse that symlink step into a single `claude plugin install claude-harness` and would make the harness listable in the Marketplace.

**Concrete change** (would require spec, not a small edit):

- Add a `plugin.json` manifest at repo root enumerating skills, agents, hooks (none today), and the `.harness-profile` schema version.
- Reshape `skills/setup-harness/` to recognize the plugin path alongside the symlink path, or deprecate the symlink path entirely.
- Decide whether `.harness-profile`, `.harness-state/`, `AGENTS.md`, and `CLAUDE.md` ship inside the plugin or stay as per-project files that the plugin's `project-init` skill scaffolds (today they're scaffolded by `/project-init`).

**Why rejected.** Three reasons:

1. **The symlink flow is the maintainer's single user.** `.harness-profile` has `audience.kind: internal`, `audience.size_estimate: "1"`. Distribution overhead buys nothing solo.
2. **The harness is a methodology, not a packaging target.** The repo's `AGENTS.md` and `CLAUDE.md` convention explicitly scopes "`setup-harness` installs skills via symlink" — making the plugin boundary the harness's distribution unit would blur that boundary (plugins are versioned bundles; the harness is a living methodology edited in-place).
3. **The plugin spec is still young.** The Sep 25 post describes a submission portal; durable conventions (how to version skills across a plugin, how plugins coexist with user-level skills) are still forming. Picking it up now risks a rewrite in 3 months.

**Verify before applying:** Before reversing this verdict, check: (a) does `.harness-profile.audience.size_estimate` still say `"1"`? (b) has anyone outside the maintainer cloned the harness? (`git log --format='%an' | sort -u`). (c) has Anthropic published a stable plugin schema version (not just the portal announcement)? If all three say yes, revisit.

**Recommended verdict:** reject — solo distribution; symlinks work; plugin spec not yet stable. Durable rejection with a trigger (3 criteria above) that opens the question again.

**Status:** PENDING — awaiting triage in PR review

---

## 3. Adopt test-impact analysis (TIA) in CI, per "Agentic coding is straining CI"

**Source:** [Agentic coding is straining CI. Here's how we scaled test impact analysis at Anthropic](https://claude.com/blog/agentic-coding-is-straining-ci-heres-how-we-scaled-test-impact-analysis-at-anthropic) (claude.com/blog, 2026-09-14, by Sachin Malhotra)

**Why it caught the routine's eye.** The post describes a two-component CI pattern (listener records per-test history; selector picks which tests a given PR runs using package relevance + history) that Anthropic adopted after agent-authored PRs grew CI load 25× in six months. For a Claude Code harness that drives multi-wave work (`/run-wave`, `/run-loop`), the TIA pattern is directly on-topic: a wave worker could pick only the tests touched by its diff rather than the full suite.

**Why deferred (not applied).**

- The harness has **no CI today**: `ls .github/workflows/` returns "No such file or directory"; `.harness-profile` sets `quality_bar.test_required: false` and `quality_bar.typecheck_blocking: false`.
- The repo's languages are `[markdown, bash]`; there's no test suite for TIA to prune.
- The Node ≥24 `skills/_shared/loop/` engine uses `node:test` but is tested interactively via `/run-loop`, not in CI.

TIA is a pattern worth filing for the day CI lands. Until then it's empty infrastructure.

**Concrete change (for the day it applies):** Record a one-paragraph pointer in `docs/plan.md` as a backlog item: *"If/when harness adds a GitHub Actions workflow for the Node loop engine, start with full-suite then adopt TIA from the Anthropic Sep-14 post (per-test history + package-relevance selector)."* Don't scaffold the plan.md item today — it's pure speculation.

**Verify before applying:** `ls .github/workflows/ 2>/dev/null | wc -l` → 0 today. When that's > 0 and the harness has a runnable test suite, re-read the post and consider adopting the listener+selector split. Also `grep -n test_required .harness-profile` — if that flag ever flips to `true`, this § warrants reconsideration.

**Recommended verdict:** defer until CI exists — no surface today; strong candidate the moment there's a test suite worth pruning.

**Status:** PENDING — awaiting triage in PR review

---

## 4. Migrate `.harness-profile.model.primary`/`fallback` to the Claude 5 family (`claude-opus-5-5` + `claude-sonnet-5-5`)

**Source:** Two companion posts

- [Claude Opus 5.5](https://claude.com/blog/claude-opus-5-5-built-for-coding-sessions-that-use-more-context) (2026-09-24)
- Claude Sonnet 5.5 release (2026-09-28, per Anthropic newsroom; see also [Opus 5.5 blog](https://claude.com/blog/claude-opus-5-5-built-for-coding-sessions-that-use-more-context) and the news-page listing fetched this run)

**Why it caught the routine's eye.** `.harness-profile` currently pins:

```yaml
model:
  primary: claude-opus-4-7
  fallback: claude-sonnet-4-6
```

The 2026-04-19 model-pin spec (`docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md`) and the 2026-04-23 Claude-Code-quality postmortem both pointed at Opus 4.7 as "the current generation Claude Code defaults to". Six months later, the Claude 5 family (Fable 5.1, Opus 5.5, Sonnet 5.5) is the current generation per Anthropic's model-id listing. The harness's primary pin is now a generation behind.

**Why deferred (not applied today).**

- **Stability window.** Opus 5.5 released 2026-09-22 (9 days ago); Sonnet 5.5 released 2026-09-28 (3 days ago). The 2025-Aug/Sep triple-postmortem (Anthropic's own evidence) showed that mass regressions appear in the first 2–4 weeks after a family launch. Pin-flipping before that window closes risks shipping the regression into every project that inherits `.harness-profile`'s effort-routing defaults.
- **Effort-routing semantics may change.** `effort_default: xhigh` is derived from `stakes.level: medium` and the postmortem rule that Opus 4.7 users default to xhigh. Whether that rule still holds for Opus 5.5 is unstated in Anthropic's Sep-24 post; the post emphasizes cache management, not effort. The migration is a two-field edit *if* the derivation rule carries forward unchanged — otherwise it's a spec change.

**Concrete change (when the window closes):**

```diff
 model:
-  primary: claude-opus-4-7
-  fallback: claude-sonnet-4-6
+  primary: claude-opus-5-5
+  fallback: claude-sonnet-5-5
   effort_default: xhigh   # derived from stakes.level: medium
   effort_cost_multiplier: {}
```

Also cross-grep for the old IDs in `docs/specs/`, `docs/waves/wave1-harness-model-pin-profile-schema.md`, and `skills/project-init/` — those references describe the model-pin behavior conceptually and may need updating (or may need to stay as historical annotations; decide per-file).

**Verify before applying:**

1. `grep -rn "claude-opus-4-7\|claude-sonnet-4-6" /home/user/claude-harness/ | wc -l` — currently 8 files touched. Review each.
2. Anthropic newsroom check: has a Claude 5-family postmortem posted since 2026-10-01? If yes, read it before flipping.
3. Confirm Opus 5.5 still routes correctly with `effort: xhigh` on a sample `/run-wave` — the 2026-04-19 model-pin spec's retry-escalation rules (effort-first-then-model) assume the primary model honors `effort` the same way Opus 4.7 did.
4. If the Claude 5 family changes the `effort_default` derivation table (`stakes.level: medium → ?`), this becomes a spec (`spec` verdict) rather than a text edit.

**Recommended verdict:** defer until 2–3 weeks post Sonnet 5.5 launch — pin flip is a small text change, but the risk is downstream (every project inheriting from the harness). Target 2026-10-19 for re-eval.

**Status:** PENDING — awaiting triage in PR review

---

## Skipped posts (summary — see tracker for the full list)

11 posts skipped this run; one-line reasons live in `anthropic-reviews/reviewed-posts.md`. Headline skips:

- **Enterprise Frontier Safeguards** (2026-09-01), **Life Sciences Verification Program** (2026-09-17), **Partnering with Accenture on embedded evaluation** (2026-09-18) — enterprise-safety / go-to-market, no harness surface.
- **Claude in Chrome GA** (2026-08-26), **Projects redesigned** (2026-09-17), **Claude Marketplace** (2026-09-23) — product UX / consumer surface; cloud-sessions-only. Marketplace rolls into §2.
- **New in Managed Agents: self-hosted sandboxes + MCP tunnels** (2026-05-19) — bookkeeping with the still-deferred 2026-04-19 §2 (Managed Agents adoption).
- **Fable 5.1 / Mythos 5.1** (2026-09-01) — Fable is for consumer agents, Mythos still gated. Model-id migration lives in §4.
- **Opus 5.5 release / Sonnet 5.5 release** (2026-09-22 / 2026-09-28) — folded into §4.
- **How to prepare for AI-driven code modernization projects** (2026-09-23) — six-step framework (define target / certificate / promotion policy / prereqs / agentic workflow / run) is enterprise-modernization methodology; closest harness analog is the `/spec-planner` → `docs/specs/` → `/run-wave` sequence this repo already runs. No surface delta.
- **Claude for Government GA** (2026-09-30) — enterprise/vertical, no harness surface.
