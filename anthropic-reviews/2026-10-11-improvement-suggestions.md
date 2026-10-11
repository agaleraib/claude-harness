# Anthropic post review — 2026-10-11

Scope: posts published 2026-05-11 → 2026-10-11 (5-month backlog since the last run on 2026-05-10). Fifteen-post cap applied; the dominant signal is three new frontier models (**Opus 5.5** Sep 22, **Sonnet 5.5** Sep 28, **Haiku 5.5** Oct 7). Everything else in-scope is either (a) methodology posts that corroborate existing harness patterns or (b) a new cloud-sessions / routines surface the harness's own scheduled routines are already running on. Several resource URLs on `claude.dev` are not reachable from this cloud environment's proxy — the posts in question are flagged inline in the tracker and partial content was drawn from their `claude.com` or `code.claude.com/docs/en/routines` equivalents where available.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Spec a model-family upgrade: Opus 4.7 → Opus 5.5 + Sonnet 4.6 → Sonnet 5.5 (and reconsider Haiku 5.5 as a new dispatch tier) | spec | Multi-file change touching `.harness-profile`, `AGENTS.md`, `orchestrator.md`, orchestrator retry rung, and README references to "Opus 4.7"; cache-TTL and no-mid-session-switch guidance are design choices the spec must settle. |
| 2 | Add a short "containment principles" paragraph to `AGENTS.md` citing `how-we-contain-claude` — focus on the two tactical points: domain-allowlists-as-capability-grants and resolve-symlinks-before-path-validation (the skills dir is symlinked out). | apply | One-paragraph doc edit, concrete lessons, directly relevant to the harness's symlinked `~/.claude/skills/` layout and the global git-hooks dispatcher just merged (e0328b8). |
| 3 | Cross-reference the AI-native SDLC playbook in README's "Why Not Superpowers" evidence list — the playbook independently codifies the harness's exact pattern stack (plan.md gate, CLAUDE.md, skills, hooks-as-hard-gates, worktrees). | apply | One-line citation; outside corroboration for existing architecture choices, strengthens the evidence list. |

---

## 1. Spec a model-family upgrade: Opus 4.7 → Opus 5.5 (and Sonnet 4.6 → Sonnet 5.5, plus Haiku 5.5 as a new dispatch tier)

- **Source URLs:**
  - Introducing Claude Opus 5.5 (2026-09-22): https://www.anthropic.com/claude-opus-5-5
  - Introducing Claude Sonnet 5.5 (2026-09-28): https://www.anthropic.com/claude-sonnet-5-5
  - Introducing Claude Haiku 5.5 (2026-10-07): https://www.anthropic.com/claude-haiku-5-5
  - Coding sessions use more context — Opus 5.5 is built for that (2026-09-24): https://claude.com/resources/articles/claude-opus-5-5-built-for-coding-sessions-that-use-more-context

- **The harness state these touch:**
  - `.harness-profile` lines 206–209 (`model.primary: claude-opus-4-7`, `model.fallback: claude-sonnet-4-6`, `effort_default: xhigh`)
  - `AGENTS.md` §Profile schema lines 153–154 (defaults table) and lines 207–209 (example block)
  - `.claude/agents/orchestrator.md` routing table (`opus-4.7` / `sonnet-4.6` dispatch names, retry/escalation rung at `opus-4.7/xhigh`, lines 149–169, 227–263, 369, 382)
  - `README.md` lines 3, 10, 25, 852, 891 — prose about "Opus 4.7" capabilities as the harness's design assumption
  - `skills/project-init/SKILL.md` derivation table that sets `effort_default` from `stakes.level` (currently calibrated against the 2026-04-23 Opus 4.7 postmortem that bumped Opus 4.7's product default to xhigh)

- **What the posts say (facts to design against, not conclusions):**
  - **Opus 5.5:** $4 input / $20 output / $0.20 cache-read / $5 cache-write (per million tokens); "about 20% below Opus 5 on input/output and 60% below on cache reads", "~40% cheaper on typical token-billed workloads", "more than 30% faster", "stronger on complex open-ended work than Sonnet 5.5". Thinking cannot be turned off. Preserved thinking (anti-distillation) applies to API accounts created on or after 2026-08-31. Cybersecurity requests may be re-routed to Opus 4.8 unless Cyber-Verified. Fast Mode available in Claude Code at $8/$40.
  - **Sonnet 5.5:** $2 input / $10 output / $2.50 cache-write / $0.20 cache-read. Benchmark jumps vs Sonnet 5: Terminal-Bench 4.0 10.3→70.6%, OSWorld 57.0→80.1%, Chartography 15.6→61.6%. "About two points lower than Opus 5.5 on GDPval-AA". Default effort tier in Claude Code is **medium** (platform default is **high**). Code-review at Max effort splits reviews across many subagents and in two evaluated cases caused timeouts / out-of-scope edits (relevant to this repo's `code-reviewer` agent). Thinking-off callers must switch to the `between_tools` setting before migrating.
  - **Haiku 5.5:** $0.10 / $0.50 input (≤100K / >100K prompts), $0.50 / $2.50 output. "~75% cheaper on average than Haiku 4.5". **First Haiku-class model with an adjustable effort setting** — makes it a plausible new dispatch tier in the orchestrator for low-stakes read/scaffold work. Uses an updated tokenizer, so token counts increase slightly. The Cognition / Devin case study pairs Haiku 5.5 as sidekick with Opus 5.5 as lead — same shape the orchestrator already uses with Sonnet 4.6 and Opus 4.7.
  - **Opus 5.5 for long coding sessions:** cache-miss on input dropped >50% in Claude Code; API-key / cloud-provider callers can set a one-hour cache TTL (vs the 5-minute default); forked subagents start from the parent's cache; "the article advises against switching models midway, which implies a cache cost" (direct consequence for the orchestrator's model-escalation rung).

- **Design questions the spec must answer:**
  1. **Primary pin:** Opus 4.7 → Opus 5.5, or hold at Opus 4.7 and treat Opus 5.5 as the retry rung above `opus-4.7/xhigh`? (Currently Step 6 Case C in `orchestrator.md:260` has no higher rung.)
  2. **Fallback pin:** Sonnet 4.6 → Sonnet 5.5 straight swap, or re-benchmark first? The Terminal-Bench jump is large enough that the dispatch bucket boundaries ("read-only tasks" vs "code-reviewer loop") may need revisiting.
  3. **Dispatch floor:** Add `claude-haiku-5-5` as a new tier for `low` effort read-only tasks? (Current `.claude/agents/orchestrator.md:136` only guards against Haiku for high-stakes code-writing — the harness itself is `stakes.level: medium` so Haiku is already in-bucket, but there is no current rung that *dispatches* to it.)
  4. **Mid-session escalation vs cache:** the current retry rung demotes-or-promotes between models mid-task (orchestrator.md:225 escalation sequence). Opus 5.5's cache guidance ("avoid mid-session model switch") argues for only switching models at task boundaries, not inside a verify-fail retry loop. Spec needs to decide: keep the rung, or move model-promotion to the next spawned subagent instead of the retried one.
  5. **Effort-default derivation:** `project-init` derives `effort_default` with a note citing the 2026-04-23 Opus 4.7 postmortem. Sonnet 5.5's product default is **medium** on Claude Code, **high** on the platform — the derivation table should either be re-explained (why xhigh for medium stakes still holds) or recalibrated.
  6. **Preserved-thinking account scoping:** both Opus 5.5 and Sonnet 5.5 bind preserved thinking to the account that created it. The harness's cross-session continuity (project-tracker in Second Brain, `.harness-state/` locally) does not move thinking across accounts, so this is likely a no-op — but the spec should confirm no skill or agent assumes shared reasoning context between sessions on different machines.
  7. **Fast Mode on Opus 5.5 in Claude Code:** Fast Mode is available but costs 2× the per-token price. The orchestrator today has no concept of "Fast Mode". Spec should decide whether to expose a Fast Mode flag at all (likely no — it's a session-level knob, not a dispatch-level one) and whether CLAUDE.md should mention it.

- **Suggested spec shape (one spec, three waves):**
  - **Wave A — model-pin swap only:** `.harness-profile` + schema defaults in `AGENTS.md` + `project-init` derivation table + prose references in README. No orchestrator routing-table change. Smallest possible blast radius.
  - **Wave B — orchestrator routing-table refresh:** redo the model/effort combinations in `orchestrator.md:149–169`, update the escalation rung so model-promotion happens at task boundaries only, add a new Haiku dispatch bucket if the benchmarking supports it. Includes refreshed example JSONL rows.
  - **Wave C — docs + evidence:** rewrite the "Why Not Superpowers" prose that currently cites Opus-4.7-specific capabilities (README:3, 10, 25, 852), update `code.claude.com` best-practices citations if the referenced advice has changed, cross-reference the Sonnet 5.5 code-review-at-Max-effort finding against this repo's own `code-reviewer` agent config.

- **Verify before applying:** `grep -n -E 'claude-opus-4-7|claude-sonnet-4-6' .harness-profile AGENTS.md .claude/agents/orchestrator.md README.md skills/project-init/SKILL.md` — if any of those pins have already been bumped by a prior wave, prune this § to only the untouched surfaces.

- **Recommended verdict:** spec — three-wave model-family upgrade touching the central routing primitive; too many design decisions (escalation vs cache, Haiku dispatch floor, Fast Mode scope) to apply as a mechanical diff.

- **Status:** PENDING — awaiting triage in PR review

---

## 2. Add a "containment principles" paragraph to `AGENTS.md` citing `how-we-contain-claude`

- **Source URL:** How we contain Claude across products — https://www.anthropic.com/engineering/how-we-contain-claude (undated as of fetch, listed as "Featured" on anthropic.com/engineering)

- **What the post says (two concrete things the harness should notice):**
  1. **Domain allowlists are capability grants, not safe defaults.** The post walks through an incident where an allowed domain (`api.anthropic.com`) let an attacker upload files using their own API key, because the allowlist assumed "this host is safe" rather than "this host restricted to our session's token". Fix: a proxy inside the VM passes only requests carrying the VM's own session token.
  2. **Resolve symlinks before path validation, or links escape authorized folders.** Called out as a specific recommendation for harness authors.

- **Why the harness should care:**
  - `CLAUDE.md:21–26` establishes that this repo's `skills/` is symlinked OUT to `~/.claude/skills/`. The direction is OUT, which lowers the risk, but any sibling tool that follows a symlink into a harness-controlled path still needs the harness's intended path validation to resolve first. Any future hook or script that reads skill content by path should documentably `realpath`-resolve first — the containment post is the hook to add that principle without owning a bug for it.
  - The global git-hooks dispatcher landed in commit 5130b9d / e0328b8 (`feat/global-git-hooks: profile gate, secret scan, mass-delete block`) is a trust surface the containment principles directly apply to. The dispatcher reads `.harness-profile` from the repo being committed — a maliciously crafted repo could in principle plant a symlinked `.harness-profile`. Call this out in the dispatcher's own doc or in `AGENTS.md`'s dispatcher section.
  - The containment post also says "defer parsing and execution of project-local config until the user accepts trust." The harness's `setup-harness` skill writes `.claude/settings.json` on first install; the post doesn't ask us to change that behavior (Claude Code itself owns the trust prompt), but citing the principle makes the harness's own install flow legible to a reader auditing it.

- **Concrete change:** add a short "Containment principles" subsection to `AGENTS.md` (near the "What state lives where" section, which already governs file-boundary assumptions) with three bullets:
  - Treat domain-allowlists as capability grants — they say *this host is reachable*, not *this host is safe*. Audit the list every time it widens.
  - When a hook or script traverses a path, resolve symlinks first. The repo's own `skills/` layout symlinks OUT; a mirrored IN-link in a consumer project would otherwise bypass the dispatcher's profile gate.
  - Project-local config (`.claude/settings.json`, `.harness-profile`) runs under the user's full permissions once trust is accepted. The dispatcher's profile-gate (5130b9d) is the harness's first line against that; it must not itself follow a symlinked profile file.

- **Verify before applying:**
  - `grep -n -E 'allowlist|symlink|realpath' AGENTS.md CLAUDE.md` — if these principles are already written down, drop this §.
  - `git log --oneline --grep='containment\|allowlist\|symlink'` — if a later commit on master already addressed any of the three bullets, trim accordingly.
  - Read the dispatcher's source (`scripts/git-hooks/` or similar — path is wherever the 5130b9d commit landed it) and confirm whether `realpath` is already called before reading `.harness-profile`. If it is, the third bullet can be dropped.

- **Recommended verdict:** apply — one-paragraph doc edit; concrete tactical anchor (the just-merged dispatcher) that makes the citation substantive instead of ornamental.

- **Status:** PENDING — awaiting triage in PR review

---

## 3. Cross-reference the AI-native SDLC playbook in README's "Why Not Superpowers" evidence list

- **Source URL:** The AI-native SDLC playbook (2026-08-21) — https://claude.com/resources/articles/the-ai-native-sdlc-playbook

- **Why this one, not the half-dozen other methodology posts in the window:** the playbook independently proposes the exact stack this harness ships:
  - artifact-committing stages (`intent.md`, `spec.md`, `plan.md`) → the harness has `docs/plan.md`, `docs/specs/`, `docs/waves/`
  - `CLAUDE.md` under a page, listing build/test/lint commands and recurring mistakes → the harness ships `CLAUDE.md` + `skills/setup-harness/templates/user-CLAUDE.md` with the same shape
  - skills in `.claude/skills/<name>/SKILL.md` for policies that must trigger consistently → the harness distributes skills via `~/.claude/skills/` symlinks (`CLAUDE.md:21–26`)
  - **hooks as hard gates** (PreToolUse for protected paths, PostToolUse for formatters, test-file-edit blocks during fix tasks) → the harness just merged a global git-hooks dispatcher (5130b9d / e0328b8) that implements the same shape at commit time
  - plan-mode-first for non-trivial work → the harness's `/micro` vs `/spec-planner` rung on anthropic-reviews/README.md's "How approved suggestions actually get built" table is the same decision
  - worktree parallelism → the harness has `.claude/worktrees/agent-<id>/` for orchestrator dispatch and the `/run-wave` skill
  - evals in CI when `CLAUDE.md`, `.claude/**`, or hooks change → the harness has a deferred §5 wave from 2026-04-19 for "agent evals"

- **Concrete change:** add one bullet to the "Why Not Superpowers / Heavy Skill Systems" section's evidence list (README.md line 23ff, right after the existing GitHub-issue citations) along the lines of:

  ```
  - **Independent corroboration (2026-08-21):** Anthropic's [AI-native SDLC playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook) codifies the same stack this harness ships — artifact-committing stages (`intent.md`/`spec.md`/`plan.md`), one-page `CLAUDE.md`, `.claude/skills/<name>/SKILL.md`, hooks as hard gates, worktree parallelism, and CI evals gated on harness-config changes. The playbook presents these as "a starting point to tailor to each organization's risk profile" — this harness is one such tailoring, pinned at `.harness-profile stakes.level: medium`, solo maintainership.
  ```

  Keeping the citation to **one bullet** matches the surrounding list's density; longer treatments belong in a spec, not an evidence list.

- **Verify before applying:**
  - `grep -n 'ai-native-sdlc-playbook\|SDLC playbook' README.md` — if a prior § already cited this, drop ours.
  - Re-read README.md lines 23–45 to confirm the bullet-list structure is still what the file uses (and not a table or prose paragraph by then). The bullet shape above assumes the current list format.

- **Recommended verdict:** apply — single-line evidence-list addition; durable because the playbook is likely to remain Anthropic's canonical articulation of the pattern through at least the next model generation.

- **Status:** PENDING — awaiting triage in PR review

---

## Skipped posts in this window (short-reason, mirrored in the tracker)

Every post below was reviewed and judged non-actionable for a solo-maintained Claude Code harness. Captured here for the triage record; the full list is also in `reviewed-posts.md`.

- **Posts whose claude.dev URL was unreachable from this proxy**, so the fetch fell back to the resource-article equivalent (noted inline per §), to the `code.claude.com/docs/en/routines` reference docs, or to a web-search summary: `claude-code-in-the-cloud` (field guide), `building-effective-agent-automations`, `automating-eval-design-and-hillclimbing`, `what-a-task-costs-on-opus-5-5`, `how-we-made-claude-ai-faster`. The routines docs that fetched successfully cover the harness-relevant surface of the first two.

- **Routines surface (Oct 1–8 cluster):** `Introducing routines in Claude Code` and the "Building effective agent automations" reference implementation already have the harness's own routine-migration bookkeeping tracked in **2026-05-10 §2** (PENDING). No fresh action.

- **Mods (2026-10-01):** `Customize Claude Code with mods` — mods ship inside plugins; this harness distributes skills via symlink to `~/.claude/skills/`, not plugins. The user-level `plugin-authoring` skill is already available to any project that installs this harness. Revisit only if `setup-harness` ever starts emitting plugins.

- **Model-adjacent posts:** `Claude discovers novel enzyme system`, `The Situation Report` (Ebola), `Claude Frontier Academy` ($100M training initiative), `Claude for commerce agents`, `how healthcare uses Claude Tag`, `how people use Claude Cowork` — vertical / case study / program announcements, no coding-harness surface.

- **Enterprise + policy:** `2026 Usage Policy update`, `Genesis Mission` commitment, `Anthropic Cyber Mission`, `Expanding Cyber Verification Program`, `Life Sciences Verification Program`, `Enterprise Frontier Safeguards`, `Barclays scales Claude`, `Accenture embedded evaluation`, `Build enterprise AI services` JV — policy / case-study / partnership announcements.

- **Loop engineering: Getting started with loops** (claude.com/resources/articles/getting-started-with-loops): four-loop-types framing (turn-based / goal-based / time-based / proactive) and cost-control advice ("route routine work to smaller models, reserve the most capable model for judgment calls"). The harness's existing orchestrator routing table already encodes this; the `/run-loop` skill covers time-based loops. No fresh § — the specific advice to add verification *inside* a loop is captured by the deferred agent-evals wave (2026-04-19 §5).

- **How Block orchestrates Claude Fable across thousands of pull requests** (2026-10-08): the "plan with frontier, execute with smaller" pattern is already the orchestrator's dispatch shape (opus-4.7 as lead, sonnet-4.6 for execution). Validates the architecture; no new §.

- **The Claude Code guide for startups** (2026-08-20): layered-context (`CLAUDE.md`, skills, MCP), verification (evals, hooks, loops), isolated rebuilds (worktrees, plan-mode) — these are the exact three stacks the harness ships. Validates the architecture; no new §.

- **Google Workspace connectors, Dashboards-and-motion, Comcast/Booz Allen Mythos exploit chains, Cresta CX agent builder, Expanding Startups program** — consumer / connector / case-study content; no coding-harness surface.
