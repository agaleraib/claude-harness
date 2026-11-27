# Anthropic post review — 2026-11-27

First routine run since 2026-05-10 — the tracker gap covers the Claude 5 family launches (Opus 5.5, Sonnet 5.5, Haiku 5.5), the Agentic AI Foundation donation, Claude Ship, and a set of research/engineering posts on agent memory, always-on agents, safety evaluations, and enterprise coding-agent security. Each suggestion below is anchored to a specific grep/read check that will tell a future reader whether the suggestion is still relevant.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Upgrade `.harness-profile` model pins to the Claude 5 family (Opus 4.7 → Opus 5.5, Sonnet 4.6 → Sonnet 5.5) | apply | Pins are two major versions behind; agent `model: opus` alias already resolves at runtime, only `.harness-profile` needs the explicit version bump. |
| 2 | Add Haiku 5.5 as a lightweight subagent lane in the orchestrator's effort-routing table | defer | Pitched directly as an Opus/Sonnet companion for compaction/summarization/lookups; no cost-pain signal in the solo repo yet. |
| 3 | Adopt the "dashboard file + single-writer pages + verified-status flags" memory patterns from `components-of-agent-memory` | spec | The article's pattern meaningfully extends the existing Wave 11-15 memory-system work; enough shape delta to warrant `/spec-planner` before any code. |
| 4 | Treat `/loop` and the `anthropic-reviews` scheduler as "always-on agents" with event-inbox + outbox discipline | defer | Pattern is sound but assumes multi-source webhook ingress + shared-worker contention; solo cron trigger doesn't need the full architecture yet. |
| 5 | Formalize evals for `code-reviewer` + `ui-evaluator` (labeled corpus, blind grader, preregistered thresholds) | spec | Extends the still-deferred 2026-04-19 §5; the safety-evals post is the first concrete recipe to anchor a design pass on. |
| 6 | Add a PreToolUse config-protection rule — deny agent writes to `~/.claude/settings.json`, `CLAUDE.md`, `.claude/agents/`, and MCP config | apply | Concrete control from the enterprise-security guide; the existing write-root module already has the seam. Low-risk defense-in-depth. |
| 7 | Position `/ship` alongside the local `code-reviewer` agent in `README.md` (companion to the existing /ultrareview callout from 2026-05-10 §1) | defer | Hosted PR Steward + Claude Approvals require Team/Enterprise plan + per-repo admin enable; bookkeeping unless the maintainer opts in. |

---

## 1. Upgrade `.harness-profile` model pins to the Claude 5 family

**Source:** https://www.anthropic.com/claude-opus-5-5 (2026-09-22) · https://www.anthropic.com/claude-sonnet-5-5 (2026-09-28)

**Current state** (grepped `.harness-profile`):
```yaml
model:
  primary: claude-opus-4-7
  fallback: claude-sonnet-4-6
  effort_default: xhigh   # derived from stakes.level: medium
```

Opus 4.7 is now two major versions behind. The Opus 5.5 page claims ~40% cost reduction per typical workload vs Opus 5 and better agentic-coding benchmarks; the Sonnet 5.5 page claims Terminal-Bench 4.0 of 70.6% (vs 10.3% for Sonnet 5) and matches Opus 5.5 on several evals while costing $2/$10 per Mtok (unchanged from Sonnet 5).

Agent files under `.claude/agents/*.md` already use `model: opus` (an alias that resolves at runtime), so those do not need edits — only `.harness-profile` needs the version bump.

**Concrete changes:**
```yaml
# .harness-profile
model:
  primary: claude-opus-5-5          # was claude-opus-4-7
  fallback: claude-sonnet-5-5       # was claude-sonnet-4-6
```

**Caveats worth flagging in the commit message:**
- Opus 5.5 removes the ability to disable thinking entirely (page: "Thinking can no longer be disabled"). No harness skill currently disables thinking, so this should be inert, but verify no `disable_thinking: true` or equivalent is pinned in setup-harness templates before merging.
- Sonnet 5.5 introduces a `between_tools` thinking setting that replaces "thinking off" for Sonnet. If any skill ever set thinking-off on Sonnet, migrate to `between_tools` before bumping.
- The 2026-04-27 §1 wave (`effort_default: xhigh` from `stakes.level: medium`) stays correct — Sonnet 5.5's Claude Code default is Medium but Opus 5.5's effort treatment doesn't require changing the derivation table.

**Expected payoff:** Catches up to two model-generation cycles of cost/quality improvement without any orchestrator or agent refactor. Low-risk — the pin is text-only.

**Verify before applying:** `grep -E '^\s*(primary|fallback):' .harness-profile` — if the values are `claude-opus-5-5` + `claude-sonnet-5-5` (or newer), drop the suggestion. If either still names `4-7` or `4-6`, the bump is still live.

**Recommended verdict:** apply — low-risk text change with large latent payoff; delaying only burns cost/quality.

**Status:** PENDING — awaiting triage in PR review

---

## 2. Add Haiku 5.5 as a lightweight subagent lane in the orchestrator's effort-routing table

**Source:** https://www.anthropic.com/claude-haiku-5-5 (2026-10-07)

Haiku 5.5 is pitched explicitly as the companion-subagent tier for Opus 5.5 and Sonnet 5.5, with:
- Input $0.10 / output $0.50 per Mtok (≤100k context tier) — roughly 75% cheaper per task than Haiku 4.5.
- OSWorld 2.1 at 72.4% — strong on browser/tool use.
- Terminal-Bench 4.0 at 39.2% — weak on complex agentic coding, so NOT a replacement for Sonnet/Opus on the main generator agent.
- **First Haiku with an adjustable effort setting** (Low → Max).

The post explicitly recommends Haiku 5.5 for "compaction, summarization, database queries, and classification" subagent roles. The harness today has `orchestrator.md` pinned to `model: opus` with an `effort_default` derivation keyed off `stakes.level`. There's no "haiku lane" for the orchestrator to delegate narrow summarization or compaction tasks to.

**Concrete changes (sketch, not final):**
- Add an optional `model.lightweight_subagent: claude-haiku-5-5` field to `.harness-profile` (schema-additive, no default behavior change).
- In `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md`, add a section on when the orchestrator should route to the lightweight lane (e.g. transcript compaction, planning-loop trigger-eval judging, parking-lot classification).
- Potentially allow agent frontmatter to pick a lane: `model: haiku` in an agent file that is pure summarization.

**Expected payoff:** Cheaper compaction/classification passes without touching the critical path. Harness repo itself is low-volume so payoff is small; payoff is larger for consumer projects that install from this repo.

**Scope: speculative** — needs a concrete subagent role to justify. Haiku 5.5 is a weaker reviewer, so the code-reviewer and ui-evaluator agents should stay on opus.

**Verify before applying:** `grep -nE 'claude-haiku|lightweight_subagent|haiku' .harness-profile skills/*/SKILL.md .claude/agents/*.md` — if a haiku lane is already wired, drop the suggestion.

**Recommended verdict:** defer until a cost-pain signal appears (e.g. planning-loop or memory-prune doing enough runs per month to matter) — the capability is real, the trigger isn't yet.

**Status:** PENDING — awaiting triage in PR review

---

## 3. Adopt the "dashboard + single-writer pages + verified-status flags" memory patterns

**Source:** https://www.anthropic.com/research/components-of-agent-memory (2026-11-06)

The article argues agent memory works best when:
1. **A dashboard file** (e.g. `global.md`) carries the current goal, a plan, and rules for using memory. Loaded every session.
2. **Single-writer pages** survive multi-agent writes dramatically better: the Pokémon-agent experiment saw 41/57 facts survive a shared writer vs 57/57 with one page per contract.
3. **Verification-status markers** — each entry notes whether a fact was confirmed and how — were more reliable.
4. **"Dreaming"** — an offline pass between sessions that corrects notes, merges duplicates, adds links, and promotes items up the stack (transcripts → memory notes → wikis → injected context).
5. **Top layer stays small** (Claude Code's `MEMORY.md` auto-memory loads only the first 200 lines / 25 KB).

**Current state** (grepped):
- `.harness-state/` holds `current_micro.md`, `today_goal.md`, exit notes, run receipts — dashboard-adjacent but not consolidated into one `global.md`.
- `/session-end` writes `last_exit.md` and triages parking lot (Step 1 of a dreaming pass), but doesn't run a dedicated transcript-vs-notes reconciliation.
- `/memory-prune` manages caps on `~/.claude/memory/*.md` but doesn't implement verified-status flags or merge-duplicates.
- Wave 11-15 memory-system redesign (specs 2026-05-13, 2026-05-31) already built the shared-root convention and cap auto-remediation — the architecture is young enough that these patterns are additive, not a rewrite.

**Concrete changes (shape, not diff):**
- Add a convention in `AGENTS.md` for a single-writer-per-topic rule in `~/.claude/memory/feedback/` (likely already de facto true via `memory-prune`'s index model — verify).
- Extend the per-cwd `MEMORY.md` schema with an explicit `verified: <true|false|unknown>` marker on each item, and have `/memory-prune` surface unverified items older than N days.
- Add a `/dream` (or `session-end --dream`) step that re-reads the session transcript, flags claims in memory that the transcript contradicts, and proposes promotions.
- Consolidate `.harness-state/today_goal.md` + `current_micro.md` + `last_exit.md` into a single dashboard view at `/session-start`, or formalize that they ARE the dashboard layer (naming convention bookkeeping).

**Expected payoff:** Fewer stale or unverified memory entries propagating across sessions; cleaner handoffs; better fit for the "dreaming" cadence now that memory is a shared root.

**Verify before applying:**
1. `grep -rE 'global\.md|verified:|dream' skills/memory-prune skills/session-end skills/session-start docs/specs/*memory*` — if any of these already have a dashboard/verified/dream convention, narrow the suggestion to the unmet piece.
2. Read `docs/specs/2026-05-13-memory-system-redesign.md` and `docs/specs/2026-05-31-memory-cap-autoremediation.md` end-to-end — the verified-status idea may already be in one of those specs.

**Recommended verdict:** spec — the memory system is already specced and partially built; a `/spec-planner` pass should decide which of the four patterns (dashboard, single-writer, verified-status, dreaming) extend the existing design vs duplicate it.

**Status:** PENDING — awaiting triage in PR review

---

## 4. Treat `/loop` and the `anthropic-reviews` scheduler as "always-on agents" with event-inbox + outbox discipline

**Source:** https://claude.com/resources/articles/building-always-on-agents (2026-11-13)

The article defines five primitives for always-on agents: **event inbox** (durable, deduped, single-worker-per-workspace), **timers** (separate store, scheduler enqueues inbox events), **memory** (file-backed, index + on-demand detail), **permissions** (credential proxy + auto mode + deferred tool calls), and **outbox** (paced delivery of background output).

**Current state:**
- `/loop` (`skills/run-loop/SKILL.md`) exists and has a denylist-hook probe, write-root confinement, and a driver (`skills/_shared/loop/run-loop-driver.ts`) — the "worker" piece is real.
- The `anthropic-reviews` scheduler fires a cron trigger that runs this routine. No event-inbox table; the trigger → session is direct.
- No explicit "outbox" — notifications fire inline via `PushNotification`. Pacing is best-effort.
- No "timers" primitive — `ScheduleWakeup` and the cron scheduler are the closest, but neither has its own store.

**Why it's speculative for this repo:**
- Volume is low (one scheduled routine per day at most). Inbox deduplication is only valuable when multiple events can race.
- The maintainer is solo; there's no "multiple workers per workspace" problem to solve.
- Credential proxy is already covered by `.harness-profile` + git-hooks + denylist layering.

**Where the pattern IS worth adopting now (narrow):**
- The article's **batch-and-coalesce** rule applies directly to this routine: if two scheduled fires queue up, merge them. Today the routine would fire independently; adding "skip if another anthropic-review branch is open against master" would save notification duplicates.
- The article's **idempotent, retryable runs** rule applies to `/run-wave` and `/run-loop`: if a session crashes mid-wave, a replay from the inbox should be safe. The existing receipt-+-journal pattern in `/memory-prune` and `/run-wave` is close to this; naming it as idempotent-replay-safe in `AGENTS.md` costs one paragraph.

**Concrete changes (minimal interpretation):**
- Append one paragraph to `AGENTS.md` titled "Always-on routines" explaining that `/loop`, scheduled routines, and wave runners should be idempotent: a replay of the same trigger must not double-write.
- Add a pre-flight check in the anthropic-reviews routine prompt: if `git branch -r | grep anthropic-review-` shows an open unmerged review branch, coalesce into it instead of opening a new PR.

**Expected payoff:** Prevents duplicate PRs when cron fires a routine that races with a previous session that didn't finish. Low payoff today, but cheap insurance.

**Verify before applying:**
1. `grep -rE 'anthropic-review-|coalesce|idempotent' skills/run-loop skills/run-wave skills/apply-anthropic-reviews` — if a coalesce/idempotent clause exists, drop the sub-suggestion.
2. Check for duplicate anthropic-review branches: `gh pr list --search "anthropic-review" --state open` — if more than one is ever open simultaneously, this is a real signal, not speculative.

**Recommended verdict:** defer until a duplicate-run signal appears (e.g. two anthropic-review PRs open against master simultaneously). The architecture is sound but today's volume doesn't reward it.

**Status:** PENDING — awaiting triage in PR review

---

## 5. Formalize evals for `code-reviewer` + `ui-evaluator` (labeled corpus, blind grader, preregistered thresholds)

**Source:** https://www.anthropic.com/research/building-strong-safety-evaluations (2026-11-13)

This is the first Anthropic engineering post that gives a concrete recipe for building agent evals, not just arguing they matter. The three strongest practices the article names:
1. **Write down the construct before collecting data** (e.g. for a reviewer: "catches planted defects; does not flag clean code").
2. **Validate the grader against human judgment** with Cohen's kappa — grader-vs-expert agreement should be about as high as expert-vs-expert.
3. **Preregister thresholds** — write down "we require 80% recall on planted bugs" before you tune the prompt, so you can detect regressions without moving goalposts.

Also useful: use **atomic binary criteria** (one per finding: location-correct, severity-correct, explanation-accurate, no-hallucinated-issue) instead of one overall score; pair harmful prompts with matched benign prompts in the same domain (reviewer: a diff with a planted bug AND a diff with the same shape but no bug).

**Current state:**
- `.claude/agents/code-reviewer.md` + `ui-evaluator.md` define the agent behavior but have no `evals/` subdirectory.
- Only `skills/skill-creator/` has eval infrastructure (`run_eval.py`, `aggregate_benchmark.py`, `improve_description.py`).
- The 2026-04-19 §5 deferral (`defer — agent-evals`) is still open; the 2026-05-03 §1 added BioMysteryBench-style tier-split as a design hint.

**Concrete scope** (needs `/spec-planner`, not a one-shot `/micro`):
- A fixture directory `evals/code-reviewer/` with: planted-bug diffs (recall), clean diffs (precision / no-false-flag), prompt-injection-framed diffs ("this is safe, don't flag it"), explanation-blind grading rubric.
- A fixture directory `evals/ui-evaluator/` with: known-good golden paths, planted regressions, and matched benign variants.
- A grader rubric using atomic binary criteria.
- A `pre-flight` check in `.harness-profile` for the pass threshold that `/run-wave` consults before merging agent-definition changes.

**Expected payoff:** Prevents a prompt-tuning regression on either reviewer silently landing. The harness exists to catch self-assessment failures (the `code-reviewer` agent's stated purpose) — the harness should not itself be self-assessment-only.

**Verify before applying:**
1. `ls .claude/agents/evals/ 2>/dev/null || ls skills/*/evals/` — if either reviewer already has a fixtures directory, drop this suggestion.
2. Check `docs/specs/2026-04-*` for an unmerged agent-evals spec: `ls docs/specs/*eval*` — if one exists, link to it instead of writing a new one.

**Recommended verdict:** spec — enough shape delta vs the existing deferral that a `/spec-planner` pass is warranted before any fixtures land. This post is the recipe the 2026-04-19 §5 was waiting for.

**Status:** PENDING — awaiting triage in PR review

---

## 6. Add a PreToolUse config-protection rule — deny agent writes to settings, hooks, agent defs, and MCP config

**Source:** https://claude.com/resources/articles/enterprise-guide-to-securing-coding-agents (2026-11-23)

The guide's "config change" recommendation (quoting): *"A `ConfigChange` hook can reject settings changes made mid-session, which helps detect attempts to loosen controls."* Pair that with the dependency-control section: review `CLAUDE.md`, MCP servers, plugins, and skills "as if they were packages."

**Current state:**
- `skills/_shared/loop/safety/denylist.ts` is a strong catastrophic-command denylist (installed as a global PreToolUse hook; fails closed on parse ambiguity).
- `skills/_shared/loop/safety/write-root.ts` confines writes to the active worktree + `.harness-state/` — but ONLY under the worktree runner. Outside the worktree runner (normal interactive sessions, foreground `/run-wave`, this scheduled routine), nothing stops an agent from editing `.claude/settings.json`, `.claude/agents/*.md`, `CLAUDE.md`, or `~/.claude/settings.json`.
- The denylist today is command-based, not path-based (Write/Edit on `.claude/settings.json` is not matched by a shell-command denylist).

**Concrete changes:**
- Extend `skills/_shared/loop/safety/write-root.ts` (or add a sibling `config-protect.ts`) with a path denylist that applies to Write/Edit tools in ANY session mode, not just the worktree runner:
  - `~/.claude/settings.json` (and `~/.claude/settings.local.json`)
  - `/home/user/claude-harness/.claude/settings.json`
  - `/home/user/claude-harness/.claude/agents/*.md`
  - `/home/user/claude-harness/CLAUDE.md` and `/home/user/claude-harness/AGENTS.md`
  - any `.mcp.json` or MCP config file in the repo
  - `~/.claude/hooks/` (if the operator stores hook scripts there)
- Wire it as a global PreToolUse hook under the matcher-logic seam that `denylist.ts` already exposes.
- Document in `AGENTS.md`'s "What to avoid" section that these paths are deny-by-default and require explicit permission-mode escalation to edit.

**Expected payoff:** Prevents a prompt-injected session (or a well-meaning routine with a bad idea) from quietly loosening its own guardrails. Low-risk defense-in-depth that complements the existing worktree write-root confinement.

**Non-goals:** Not for blocking HUMAN edits via Edit/Write in an interactive session — the hook should be configured to fire under auto-mode or `bypassPermissions` only, not to interrupt a maintainer manually tuning a setting.

**Verify before applying:**
1. `grep -rE 'settings\.json|CLAUDE\.md|\.claude/agents' skills/_shared/loop/safety/` — if a path denylist already lists these files, drop the suggestion.
2. Look for an existing `ConfigChange` hook or `.claude/settings.json` guard: `grep -r 'ConfigChange\|configChange\|config-change' .claude ~/.claude 2>/dev/null`.
3. Check the git-hooks dispatcher for an equivalent guard: `cat scripts/git-hooks/dispatch.sh` — the dispatcher may already block mass-deletes on these paths (recent commit e0328b8 added "global git hook dispatcher — secret scan, mass-delete block, profile gate").

**Recommended verdict:** apply — small, additive, defense-in-depth. The `write-root.ts` module already has the seam; this extends it to the config surface.

**Status:** PENDING — awaiting triage in PR review

---

## 7. Position `/ship` alongside the local `code-reviewer` agent in `README.md`

**Source:** https://claude.com/resources/articles/introducing-claude-ship (2026-11-23)

Claude Ship (beta) bundles three features into a hosted PR flow:
- **Code Review** (GA) — the hosted equivalent of the local `code-reviewer` agent (already referenced in 2026-05-10 §1 as `/ultrareview`).
- **PR Steward** (beta) — an agent that handles failing CI, merge conflicts, and review feedback by pushing commits to the PR. Does NOT approve or merge.
- **Claude Approvals** (beta) — a policy-file-driven approval engine. The article describes it as "a smarter CODEOWNERS file."

**Trigger surfaces:** `/ship` command in Claude Code, repository-level admin enablement on GitHub, or `@claude <instruction>` comment on a PR.

**Availability:** Claude Team and Enterprise plans only. Excluded: Zero Data Retention, HIPAA, customer-managed encryption keys.

**Relevance to this repo:** The harness is solo-maintained (`team.size: solo`). Claude Ship's economic win is multi-developer — a solo maintainer rarely needs PR Steward to merge-conflict-resolve for them. HOWEVER, if the maintainer runs a cloud session against this repo and wants the session to self-fix CI failures on its own PRs, PR Steward is the hosted alternative to the local `code-reviewer` + `/code-review` skill.

**Concrete changes (if accepted):**
- Add one row to `README.md`'s review-pathway table that currently positions `/code-review` (local), `/ultrareview` (cloud multi-agent), with a third row for `/ship` (hosted PR Steward). One sentence per row.
- Note in the row that `/ship` requires Team/Enterprise plan and repo-level admin opt-in.

**Expected payoff:** Keeps the README's code-review-pathway table current. No code change.

**Verify before applying:**
1. `grep -nE '/ship|Claude Ship|PR Steward' README.md AGENTS.md` — if `/ship` is already documented, drop the suggestion.
2. Check if the maintainer is on Team/Enterprise plan — if on Pro only, the suggestion is moot.

**Recommended verdict:** defer — bookkeeping only; adding a row to the README has no payoff unless the maintainer actually enables Ship on the repo. Re-raise if the maintainer opts in.

**Status:** PENDING — awaiting triage in PR review
