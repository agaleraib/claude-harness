# Anthropic post review — 2026-11-05

Run covers the window 2026-05-10 (last tracker row) → 2026-11-05.

The last routine run on 2026-05-10 left a six-month gap; this run catches up to the 15-post cap. The newest in-scope engineering post (Oct 13 *Redesigning source control*) is scale-mismatched for a solo tooling repo, and the three model releases that dropped during the gap (Opus 5.5 on Sep 22, Sonnet 5.5 on Sep 28, Haiku 5.5 on Oct 7) collectively trigger the only substantive §. Everything else is either skipped in the tracker (governance, policy, enterprise partnerships, financial news, vertical product launches) or deferred (Diane Sarkis's "when to fold subagents" piece, which is a methodology lens on the orchestrator but needs an eval set before any refactor).

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Migrate `.harness-profile`, README, and orchestrator-dispatch model pin from Opus 4.7 to Opus 5.5 | spec | Multi-file change: `.harness-profile` schema derivation table, README lede + "Why Not Superpowers" postmortem citation, `skills/project-init/SKILL.md` derivation docs, `skills/_shared/loop/dispatch/review.ts` default, two more SKILL.md references. Also carries API behavior changes (thinking can no longer be disabled; preserved-thinking enforcement for post-Aug-31-2026 accounts). Needs a design pass — not a one-shot `/micro`. |
| 2 | Audit the `/run-wave → orchestrator → opus/sonnet/haiku` fan-out against Diane Sarkis's "fold subagents" criteria | defer until the orchestrator misfires on a real wave | Guidance is methodology, not a defect report. The harness already has the end-to-end eval gap Sarkis requires as step 0 (no golden fixtures — this is 2026-04-19 §5, still deferred). scope: speculative. |
| 3 | Add Haiku 5.5's new effort knob as a routing lever in the orchestrator (`--effort` to haiku subagents, not just opus/sonnet) | defer until §1 lands | Haiku 5.5 is the first Haiku with an adjustable effort setting (release-page quote). The orchestrator currently routes to haiku for "simple" tasks without an effort dial; gaining one gives finer cost/quality control. Blocked on §1 (model-id migration must land before adding the knob). |

---

## §1 — Migrate harness model pin from Opus 4.7 → Opus 5.5 (and fallback from Sonnet 4.6 → Sonnet 5.5)

**Source URLs**
- https://www.anthropic.com/claude-opus-5-5 (Sep 22, 2026 — model release)
- https://www.anthropic.com/claude-sonnet-5-5 (Sep 28, 2026 — model release)
- https://www.anthropic.com/claude-haiku-5-5 (Oct 7, 2026 — model release; context for §3)

**What the posts say that matters here**

- Opus 5.5 model ID is `claude-opus-5-5`. Pricing is $4 input / $20 output per 1M tokens (about 40% cheaper than Opus 5 on typical workloads).
- Opus 5.5 benchmark claims relative to Opus 5: Terminal-Bench 4.0 66.4% vs 52.3%; CursorBench 4.0 57.8% vs 46.6%; FrontierCode 1.1 54.4% vs 48.0%.
- **Thinking can no longer be disabled on Opus 5.5.** Any wrapper code that passes `thinking: {type: "disabled"}` needs to be removed or it will error.
- **Preserved-thinking enforcement**: For API accounts created on or after 2026-08-31, Opus 5.5 blocks edits to prior turns that could extract its reasoning. Any harness code that rewrites earlier messages mid-conversation needs to be audited.
- **Cybersecurity reroute**: Some cybersecurity-adjacent tasks are routed to Opus 4.8 (not 5.5) with safeguards; this is Anthropic-side routing, not something the harness controls, but the consequence is that cost/latency can look inconsistent on security-focused prompts.
- Sonnet 5.5 model ID is `claude-sonnet-5-5` ($2/$10 per 1M). Benchmark position vs Opus 5.5: Sonnet 5.5 is *higher* on Terminal-Bench 4.0 (70.6% vs 66.4%), lower on FrontierCode 1.1 (46.2% vs 54.4%). Anthropic positions Opus 5.5 as the model for "complex, open-ended work requiring sustained judgment" and Sonnet 5.5 for "well-scoped everyday tasks."

**Current state in the repo (grep confirms)**

- `.harness-profile:30-32` pins `primary: claude-opus-4-7`, `fallback: claude-sonnet-4-6`.
- `README.md:3` opens with "designed for Opus 4.7's native capabilities".
- `README.md:10` has the "Opus 4.7 plans carefully, sustains long tasks…" paragraph.
- `README.md:25-32` *"Why Not Superpowers / Heavy Skill Systems?"* evidence list cites the 2026-04-23 postmortem with language tied to "Opus-4.7 users".
- `skills/project-init/SKILL.md:147-210` defines the `stakes → effort_default` derivation with inline comments asserting "Claude Code defaults Opus-4.7 users to `xhigh`."
- `skills/_shared/loop/dispatch/review.ts:127` hard-defaults to `'claude-opus-4-8'` (not `-4-7`, not `-5-5` — a third divergent version that needs reconciling at the same time).
- `skills/apply-anthropic-reviews/SKILL.md` and multiple `docs/waves/` summaries reference Opus 4.7.
- `.harness-profile` was generated 2026-04-11; the derivation table has never been re-visited against a model-family bump.

**Concrete changes (sketch — not final, spec will ladder these)**

1. Decide the new primary/fallback pair. Default assumption: `primary: claude-opus-5-5`, `fallback: claude-sonnet-5-5`. Rationale: Sonnet 5.5 is a stronger generalist than Sonnet 4.6 and beats Opus 5.5 on Terminal-Bench, so it's a reasonable fallback *and* a reasonable "cheap mode" for routine waves.
2. `.harness-profile`: update `model.primary` + `model.fallback`, rewrite the comment block citing the 2026-04-23 postmortem (keep the citation — it's still the floor-justification for `xhigh`; just restate "Opus-5.5 users" where today it says "Opus-4.7 users" **only if Anthropic's new default for 5.5 actually documents the same floor**; otherwise drop the postmortem citation and re-derive from the migration guide).
3. `README.md`: update the lede sentence and the "Opus 4.7 plans carefully" paragraph. Keep the "Why Not Superpowers" evidence list — the postmortem is historical evidence, it doesn't expire — but re-check whether the 2026-04-23 learnings still hold for 5.5 behaviour (needs reading https://platform.claude.com/docs/en/models/opus-5-5/migration-guide; may require footnote).
4. `skills/project-init/SKILL.md:147-210`: update the derivation table's inline citation. Keep the `stakes.level → effort_default` table itself — the mapping is harness policy and is independent of which model ID is used.
5. `skills/_shared/loop/dispatch/review.ts:127`: change the hardcoded `'claude-opus-4-8'` to `'claude-opus-5-5'` **or** make it read `.harness-profile`'s `model.primary` so the pin stops drifting from the profile. The second option is the right fix.
6. Sweep the remaining 17 Opus-4.7 references caught by the grep (mostly in `docs/waves/` and `anthropic-reviews/` dated files). Dated anthropic-review files are **immutable history** per the README — do NOT edit those; leave them pointing at Opus 4.7 as historical record. Wave summaries are also historical; leave them. Only edit the live docs.
7. Audit any wrapper code that passes `thinking: {type: "disabled"}` (none found in a quick grep — `review.ts` doesn't set it — but worth a second pass during the spec phase).
8. Audit any wrapper code that edits earlier conversation turns (none apparent; the harness uses the Claude Code CLI, not direct Messages API).

**Expected payoff**

- The repo's advertised capability matches the pinned model (currently Opus 4.7 is the default on a Claude Code session using a stale pin, so the harness is advertising capabilities it doesn't ship against).
- ~40% cost reduction on wave dispatches once `review.ts` picks up the new pin (per Opus 5.5's release-page claim; needs verification in the spec).
- The `.harness-profile` drift between the profile (`-4-7`), the dispatch default (`-4-8`), and the actual cloud environment (model ID is set per-session, often `-4-7` per the current system-prompt banner on this run) is resolved to one source of truth.

**Verify before applying:** `grep -rn 'claude-opus-4\|claude-sonnet-4-6\|Opus 4\.7\|Opus-4\.7' README.md .harness-profile skills/ docs/` from the repo root. If that still returns live-doc hits (ignoring `anthropic-reviews/` and `docs/waves/` which are immutable history), the §1 work is not yet done. Also re-read https://platform.claude.com/docs/en/models/opus-5-5/migration-guide before cutting the spec — the release page cites it but the breaking-change list may have grown since 2026-09-22.

**Recommended verdict:** spec — multi-file change touching the .harness-profile schema-derivation documentation, README copy, two SKILL.md files, and dispatch code; also carries an API-behavior-change audit (thinking-disabled / preserved-thinking). The changes are coupled (model-id change in `.harness-profile` is meaningless until README + dispatch + project-init derivation docs line up with it), and the "Why Not Superpowers" postmortem citation needs a judgment call on whether to retain, re-anchor, or drop. Per the README's "Decompose first, then route" protocol, this clears at least two of the four promotion signals (underspecified shape, touches in-flight mechanisms via `.harness-profile` schema + `project-init`'s derivation), so it ladders to `/spec-planner`, not `/micro`.

**Status:** PENDING — awaiting triage in PR review

---

## §2 — Audit `/run-wave → orchestrator → opus/sonnet/haiku` fan-out against the "fold subagents" criteria

**Source URL**
- https://claude.com/resources/articles/building-agents-when-to-fold-subagents-into-your-main-agent-loop (Oct 22, 2026, Diane Sarkis)

**What the post says that matters here**

Sarkis argues that *using fewer subagents with context and tools disclosed progressively through skills and tool search often improves quality and reduces cost and latency*. Five fold-into-main-loop signals:

1. Each team owns a subagent, so architecture mirrors the org chart (N/A for solo).
2. Multiple prompts producing a conflicting "Frankenprompt" with no consistent voice.
3. Handoffs lose context, and multi-agent latency hurts the user experience.
4. Each specialist has localized evals, too narrow to judge the whole system.
5. Specialists chain on each other's output, touch the same data, or are often called together.

Migration protocol: build a 10-example end-to-end eval first, merge tightly-coupled specialists first, convert prompts into skills and API calls into MCP tools, compare with-and-without scores per task (not just aggregate). *Keep* a subagent separate only when it must talk to the user directly or when the folded version scores worse.

**Why this maps to the harness — and where it stops mapping**

The harness has a layered agent/subagent chain today:
- `/run-wave` (skill) builds a synthetic wave spec and dispatches an **orchestrator** agent in a worktree.
- The **orchestrator** agent (defined in `.claude/agents/`) routes each task at runtime to an **opus/sonnet/haiku** subagent based on complexity.
- The **code-reviewer** agent runs post-hoc on the diff.
- The **spec-planner** agent runs up-front on an idea.
- The **generator** and **evaluator** project-level agents chain on each other's output (consumer projects only, not this repo).

Signal 5 (specialists chain on each other's output) partially applies: orchestrator → opus/sonnet/haiku → code-reviewer is a chain. But the chain exists because each hop has a distinct responsibility (runtime routing, implementation, adversarial review), not because the org chart imposed it.

Signal 2 (Frankenprompt) is worth a one-pass audit: `.claude/agents/orchestrator.md` and `skills/run-wave/SKILL.md` have overlapping instructions on "how to pick a subagent"; `code-reviewer` and `skill-creator/agents/grader.md` share some adversarial-review vocabulary. None of this is a red flag yet.

**What's missing for an informed decision**

Sarkis's step 0 — a 10-example end-to-end eval — doesn't exist in this repo. That's 2026-04-19 §5 (Agent evals fixtures), which is still **deferred**. Until that lands, there is no "is this score lower with or without the orchestrator?" comparison, so any "fold the orchestrator into run-wave" refactor would be vibes-driven.

**Concrete changes (if ever picked up)**

1. Build the deferred §5 fixtures first.
2. Then score the existing orchestrator → subagent chain on those fixtures.
3. Then test a folded variant (run-wave calls Claude Code directly, with progressively-disclosed skills instead of a routing orchestrator) and compare per-task scores.
4. Only if the folded variant scores at parity or better do we fold.

**Expected payoff (speculative)**

- If the orchestrator layer is adding cost/latency without quality delta: eliminating it would reduce wave dispatch cost and time-to-first-commit.
- If the orchestrator layer is adding quality: we'd know it empirically for the first time, and we could cite the data in the README's "Why Not Superpowers" evidence list.

**Verify before applying:** (a) grep for whether the 2026-04-19 §5 fixtures have landed — `ls skills/*/evals/ 2>&1 | grep -v planning-loop` to see if any agent now has fixtures beyond planning-loop's; if the answer is still "only planning-loop has evals", this suggestion is still blocked. (b) re-read the orchestrator and run-wave skill files to check whether a visible Frankenprompt has emerged since 2026-05-10.

**Recommended verdict:** defer until the deferred 2026-04-19 §5 (agent-evals fixtures) lands — Sarkis's own protocol requires the eval set as step 0. scope: speculative. Also defer because the "fold subagents" guidance is methodology, not a defect report: a solo harness isn't bleeding on org-chart mirroring (Signal 1), and no concrete Frankenprompt (Signal 2) or context-loss-on-handoff (Signal 3) has been reported.

**Status:** PENDING — awaiting triage in PR review

---

## §3 — Add Haiku 5.5's adjustable effort setting to orchestrator subagent routing

**Source URL**
- https://www.anthropic.com/claude-haiku-5-5 (Oct 7, 2026)

**What the post says that matters here**

Haiku 5.5 is *"Anthropic's first Haiku-class model with an adjustable effort setting."* Pricing: $0.10 / $0.50 input per 1M (under 100k / over 100k prompts), $0.50 / $2.50 output. Per the release page, it costs about 75% less to run than Haiku 4.5 on average. Positioned as a subagent alongside Opus 5.5 and Sonnet 5.5 for coding work, and for high-volume summarization / compaction / classification / browser-use.

**Current state in the repo**

- The orchestrator agent exists globally at `~/.claude/agents/orchestrator.md` (not visible in this repo's working tree — it symlinks in via `setup-harness`).
- The agent's description says it routes to `opus`, `sonnet`, or `haiku` subagents based on task complexity.
- There is no `--effort` or `effort_override` dial for the haiku branch today. Haiku pre-5.5 didn't support one.

**Concrete change (sketch)**

- Teach the orchestrator that haiku now accepts an effort setting, same as opus/sonnet.
- The simplest rule: default haiku to `low` (consistent with its "high-volume cheap work" positioning), and let the orchestrator bump to `medium` when it sees signal (long input, nested structure, borderline-complexity task).
- Document the mapping in `skills/project-init/SKILL.md`'s `effort_default` derivation table — currently that table only covers the primary model's floor, not the subagent-fanout tiers.

**Expected payoff**

- Cost-aware escalation: today the orchestrator either routes to haiku (no effort dial, cheap) or escalates to sonnet (effort dial, more expensive). Haiku 5.5's new effort knob adds a middle rung — haiku at `medium` or `high` — before the sonnet escalation. That's a real cost lever.
- Combined with §1's cost reduction (Opus 5.5 is ~40% cheaper than Opus 5), total wave cost could drop meaningfully. No numbers yet — would need to re-run a baseline wave against the new model mix.

**Verify before applying:** (a) check whether `~/.claude/agents/orchestrator.md` has already grown a haiku-effort dial — `grep -n 'haiku.*effort\|effort.*haiku' ~/.claude/agents/orchestrator.md`. (b) confirm §1 (model-id migration) has landed, since routing to `claude-haiku-5-5` with an effort setting is meaningless until the orchestrator is aware the model exists. Blocked on §1.

**Recommended verdict:** defer until §1 lands. The feature exists, the payoff is concrete, but there's no point bolting it onto the current orchestrator if the orchestrator is still pointed at a pre-5.5 model family. Pair with §1 when §1 goes through `/spec-planner`.

**Status:** PENDING — awaiting triage in PR review

---

## Reviewed-and-skipped this run (durable list, mirrored in the tracker)

The following in-scope-by-publisher posts from the 2026-05-10 → 2026-11-05 window were reviewed and dropped without a §. One-liner each so the maintainer can sanity-check the skip calls.

| Post | Date | Why skipped |
|---|---|---|
| *How we contain Claude across products* (engineering) | 2026-05-25 | Engineering deep-dive on claude.ai/Claude Code/Cowork containment layers. Of the 12 actionable items the post lists, 10 are already covered: 2026-05-08 §1 (Auto Mode + permissions), 2026-04-25 skip row (Managed Agents memory → not applicable), setup-harness's PreToolUse denylist, `.claude/settings.json` trust-prompt deferral. The two remaining (symlink resolution before path validation; canary-string injection detection) are Claude Code CLI concerns, not harness concerns — the harness doesn't do its own path validation. |
| *Redesigning source control at Anthropic* (engineering) | 2026-10-13 | Scion is a monorepo-scale replacement for git with a server-first design. Everything specific is scale-mismatched (Spanner, multi-tier caches, 7-day CI post-merge gates) for a single-maintainer tooling repo. The transferable design ideas (lazy loading, generated indexes, intent-focused review) overlap with patterns the harness already uses (`/harness-status`, skill-creator grader, `.harness-profile` as single source of truth). No new §. |
| *Donating Agent Skills to the Agentic AI Foundation* | 2026-10-22 | Governance change — standard moves to Linux Foundation's Agentic AI Foundation. Post explicitly says no spec/format changes are announced; proposals (versioning, security guidance) are roadmap items, not finished work. Nothing to action in SKILL.md files today. Revisit when AAIF publishes v1.0 of the versioning spec or the security guidance. |
| *An update on independent evaluators* | 2026-10-15 | Governance news (METR, SecureBio, Accenture/Faculty, Hugging Face talks). About how Anthropic shares its own models with outside evaluators. Not about agent-eval methodology a harness could adopt. |
| *Claude Duet Safety, Privacy, and Security* | 2026-10-23 | Consumer agent, not a coding harness. The transferable security patterns (approval gates with full context, out-of-model intent check, credential isolation, fixed browser command surface) are already covered by 2026-05-08 §1 (Auto Mode classifier) and by Claude Code's own sandboxing. The one novel pattern — outbound sensitive-data classification before messages leave — is a Duet-specific feature; a coding harness isn't shipping messages on behalf of users. |
| *Manage costs and demonstrate ROI for Claude Code on Google Cloud* | 2026-10-27 | Enterprise-cost-governance guide. Portable patterns (define a countable unit of work; correlate telemetry with source control) overlap with the harness's existing `.harness-state/` receipts and `/harness-status` telemetry. Specific recommendations (warn at 75%/95% thresholds, per-user/per-team/per-org caps) presume a multi-developer org and a billing seat model — not relevant to `team.size: solo`. Revisit if the harness ever ships to a team. |
| *Make long-running agents faster with message threads* | 2026-11-02 | Messages API feature (TTFT reduction for >500k-token conversations via server-held thread state). The harness runs on the Claude Code CLI, which per the post itself already has this on by default — "where threads are on by default." No harness-side action: the CLI handles it. |
| *New agents and products for Claude Marketplace* | 2026-11-04 | Enterprise distribution channel for partner agents (Chainguard, Datadog, Webflow, etc.). Post doesn't describe a path for a user-maintained skills repo to ship on Marketplace. Revisit if Anthropic documents a Marketplace submission flow for individual skill bundles. |
| *2026 Usage Policy update* (effective 2026-11-12) | 2026-10-08 | Policy/legal update. The harness doesn't ship an agent that controls physical hardware, makes high-stakes decisions on behalf of users, or runs surveillance / deceptive campaigns — none of the new clauses apply to the surface area the harness covers. Revisit if the harness grows a consumer-facing surface. |
| *Anthropic files S-1 with the SEC for proposed IPO* | 2026-10-26 | Financial-market news; no harness surface. |
| *AI for Science expands to foundations and research institutions* | 2026-10-28 | Grant/research-program expansion; no developer-tooling surface. |
| *Partnering with Accenture on embedded evaluation* | 2026-09-18 | Anthropic-side evaluator partnership. Covered by the same reasoning as *Independent evaluators update* above. |

(Posts not listed either fall outside the canonical sources — `/news` + `/engineering` + `resources` + `/research` — or are vertical-product, GTM, financial, or policy announcements with no harness-facing surface. See the tracker's `skipped` rows for one-line reasons.)
