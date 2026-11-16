# 2026-11-16 — Anthropic post review

Discovery window: **2026-05-10 → 2026-11-16** (183 days; the previous run left the tracker at 2026-05-10). Reviewed 11 posts — the top-of-funnel for anything harness-adjacent in that span — against the current state of the repo (`.harness-profile`, `AGENTS.md ## Memory`, `skills/memory-prune/`, `skills/_shared/loop/dispatch/review.ts`, `docs/specs/2026-05-13-memory-system-redesign.md`). Five produced actionable §s; six are logged as skipped in the tracker.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Record confirmation status + add a dreaming-style audit pass (`components of agent memory`) | apply | Concrete, low-risk, closes a real gap in the memory frontmatter spec and in `/memory-prune`'s cap-only coverage. |
| 2 | Attach safety-eval rubric patterns to the still-deferred 2026-04-19 §5 agent-evals design | defer until agent-evals lands | No code change today — strictly a design constraint for future work. |
| 3 | Claude 5.5 family released; re-evaluate `.harness-profile` pin + drop stale `claude-opus-4-8` default in `review.ts` | defer until maintainer picks re-pin direction | Model choice is a maintainer judgment; the stale fallback string is a one-line cleanup you probably want to pair with that call. |
| 4 | Agent Skills donated to AAIF — status-quo bookkeeping | reject — already conforms | The donated spec is "folder + SKILL.md"; the harness already ships exactly that. No action. |
| 5 | Note the Anthropic analyst-deferral finding in `procedures/triage-quality-issues.md` | defer | Interesting but not urgent for a solo harness; park as a procedural footnote for future triage. |

---

## 1. Record confirmation status on feedback entries, and add a dreaming-style audit pass to `/memory-prune`

- **Source:** [The components of agent memory](https://www.anthropic.com/research/components-of-agent-memory) (2026-11-06).
- **What the post says, verbatim where it matters:**
  - "Wrong notes get trusted. A bad note persisted into later sessions until dreaming checked it against the transcript."
  - "Mark confirmation status. Opus 4.7 separated checked facts from unconfirmed ones. Do the same for notes."
  - "Don't restrict to failures. Telling Opus models to 'record only failures' cut their memory gain substantially."
  - Dreaming is "an offline pass that reads the lower layers and writes upward. It corrects wrong notes against transcripts."
- **Current state (verified today):**
  - `~/.claude/memory/feedback/<slug>.md` frontmatter today carries `originCwd:` + `promotedAt:` only (per `docs/specs/2026-05-13-memory-system-redesign.md` line 199). There is no `status: confirmed | unconfirmed` or `last_verified:` field. Grepped the repo — no enforcement, no reader.
  - `skills/memory-prune/` is cap-management only: it archives entries pointing to missing topic files and surfaces oversize files. It does not re-read the cited evidence (session transcript, spec, commit) and correct the note.
  - `.harness-state/last_exit.md` in `skills/session-end/SKILL.md` already records `Outcome: [hit | partial | drifted | blocked]`, so successes DO reach disk at the session level — the Nov 6 post's "don't log only failures" lesson is partially handled already. The gap is at the `~/.claude/memory/feedback/` layer, where there is no success/confirmation distinction after promotion.

- **Concrete change (two parts):**

  **1a — Extend feedback-file frontmatter with `status:` and `last_verified:`:**

  In `docs/specs/2026-05-13-memory-system-redesign.md` § "feedback/<slug>.md" and in `skills/memory-prune/SKILL.md`, add:

  ```yaml
  ---
  originCwd: <encoded-cwd>
  promotedAt: 2026-11-16
  status: unconfirmed       # NEW — unconfirmed | confirmed | superseded
  last_verified: 2026-11-16 # NEW — ISO date of the last audit pass that read the cited evidence
  cited_evidence:           # NEW — optional list of {path, kind} the audit pass can re-read
    - { path: docs/specs/2026-05-13-memory-system-redesign.md, kind: spec }
    - { path: .harness-state/wave12-migration.jsonl, kind: receipt }
  ---
  ```

  New promotions start `status: unconfirmed`. A manual audit stamps `status: confirmed` + bumps `last_verified`. The `~/.claude/memory/FEEDBACK.md` index bullet gains a one-char prefix — e.g. `✓` for confirmed, `?` for unconfirmed — so session-start reads tell the reader which rules are vouched for.

  **1b — Add a dreaming-style audit mode to `/memory-prune`:**

  New flag `bash skills/memory-prune/lib/prune.sh --audit` (dry-run by default; `--audit --apply` to stamp). For each `~/.claude/memory/feedback/<slug>.md`:

  1. Parse `cited_evidence:` from frontmatter.
  2. If every cited path still exists and `git log -1 --format=%H -- <path>` hasn't changed since `last_verified:` → leave alone.
  3. If any cited path is gone or newer → mark the entry as stale in the audit report; operator decides to re-confirm (bump `last_verified`), supersede (set `status: superseded`), or archive.
  4. Separate report section lists `status: unconfirmed` entries older than N days (default 30) so the operator can escalate to confirmed or archive.

- **Expected payoff:** The memory layer surfaces its own staleness instead of silently aging. The `/session-start` warning line already runs `/memory-prune` as a dry-run; wiring the new audit in extends that for free. Cost is low — `/memory-prune` is already dry-run-by-default with a receipt + journal + byte-exact backup contract, so `--audit` ships inside the existing safety envelope.

- **Verify before applying:** `grep -nE '(status|last_verified|cited_evidence):' docs/specs/2026-05-13-memory-system-redesign.md skills/memory-prune/SKILL.md` — the suggestion only remains worthwhile if **none** of those three keys appear. If any of them already exist in the frontmatter spec, drop the suggestion. Also re-read `~/.claude/memory/feedback/<slug>.md` for one promoted file — if the frontmatter already carries confirmation status, the suggestion is moot.

- **Recommended verdict:** apply — concrete, low-risk, closes a real gap in the memory frontmatter spec and in `/memory-prune`'s cap-only coverage.
- **Status:** PENDING — awaiting triage in PR review

---

## 2. Attach rubric-design patterns from Anthropic's safety-eval guide to the still-deferred 2026-04-19 §5 agent-evals work

- **Source:** [Building strong safety evaluations](https://www.anthropic.com/research/building-strong-safety-evaluations) (2026-11-13).
- **Background:** [2026-04-19 §5 (Formalize evals for the adversarial reviewers)](./2026-04-19-improvement-suggestions.md#5-formalize-evals-for-the-adversarial-reviewers) is still **deferred**. [2026-05-03 §1](./2026-05-03-improvement-suggestions.md#1-adopt-the-biomysterybench-human-solvable--human-difficult-tier-split-when-the-deferred-agent-evals-fixtures-land) already attached the BioMysteryBench "human-solvable + human-difficult tier split" as a design constraint. This § stacks a second design constraint on the same deferred item.
- **Patterns the post names that generalize to adversarial code-reviewer and ui-evaluator evals:**
  - "**Make criteria atomic and binary.**" — a per-risk rubric built from yes/no questions, stating explicitly what does *not* count as a hit. In harness terms: each `criteria/*.md` row should be one binary question, not a prose paragraph.
  - **"One bad turn … results in a failing grade for the whole conversation."** — one failed step fails the whole episode. Maps to `ReportFindings` failing an entire review on a single CONFIRMED finding.
  - **Over-refusal checks via paired benign items.** — adversarial-reviewer evals should include legitimate code that resembles a vulnerability (e.g. `rm -rf "${TMPDIR:?}"` as benign cleanup) alongside true positives. A reviewer that flags everything doesn't score well.
  - **Blind the grader and validate it.** — grader-model picking should be blind to design metadata; agreement with a small human-labeled gold set should be measured with a chance-corrected metric (Cohen's κ in the post). Guards against prompt-leakage and sycophancy.
  - **Sample sizes.** — the post gives rough floors: ~100 items for complex multi-turn evals, ~1,000 for single-turn. Useful fixture-count target for `criteria/` if a future eval harness lands.
  - **"Spell out what should *not* change the verdict."** — explicit anti-examples for each rubric row (disclaimers, framing, author identity) so the grader isn't swayed.
- **Concrete change (deferred; only land alongside §5):** When 2026-04-19 §5 is un-deferred, the agent-evals spec needs to bake in: atomic/binary rubric rows, mandatory paired benign items, grader-vs-human agreement check during the spec's `Verify` gate, and the sample-size floors above.
- **Verify before applying:**
  - Confirm 2026-04-19 §5 is still deferred: `grep -A2 '^## 5.' anthropic-reviews/2026-04-19-improvement-suggestions.md | grep -i 'Status:'` — if the Status line is no longer `PENDING`/`DEFER` and the work has shipped, this § should be folded into the live eval spec rather than parked.
  - Confirm no `criteria/*.md` row has already been rewritten to atomic/binary form: `grep -l '^- \[ \]\|^- \[x\]' criteria/*.md` — if the rubric is already structured as checkboxes with explicit non-examples, pieces of this § are moot.
- **Recommended verdict:** defer until agent-evals lands — no code change today; strictly a design constraint for the deferred spec.
- **Status:** PENDING — awaiting triage in PR review

---

## 3. Claude 5.5 family released — re-evaluate `.harness-profile` model pin; drop the stale `claude-opus-4-8` default in `review.ts`

- **Sources:**
  - [Introducing Claude Opus 5.5](https://www.anthropic.com/claude-opus-5-5) (2026-09-22): `claude-opus-5-5`, $4/$20 per MTok, Terminal-Bench 4.0 66.4%, "40% less to run than Opus 5", "preserved thinking" anti-distillation safeguard, fast mode in Claude Code, 18-hour unattended runs.
  - [Introducing Claude Sonnet 5.5](https://www.anthropic.com/claude-sonnet-5-5) (2026-09-28): `claude-sonnet-5-5`, $2/$10 per MTok, 70.6% Terminal-Bench 4.0, "faster, lower-cost complement to Opus 5.5".
  - [Introducing Claude Haiku 5.5](https://www.anthropic.com/claude-haiku-5-5) (2026-10-07): `claude-haiku-5-5`, $0.10/$0.50 per MTok for sub-100k prompts, positioned as "subagent that pairs with Opus 5.5 or Sonnet 5.5," first Haiku with adjustable effort.
  - [Introducing Claude Fable 5.2 and Claude Mythos 5.2](https://www.anthropic.com/claude-fable-and-mythos-5-2) (2026-11-09): `claude-fable-5-2` (Mythos gated), $8/$40 per MTok, FrontierSWE v2 69.9%, positioned as Advisor/Orchestrator above Opus 5.5.
- **Current state (verified today):**
  - `.harness-profile` pins `model.primary: claude-opus-4-7` and `model.fallback: claude-sonnet-4-6`. That's two generations behind the current Claude Code default lineup (per the system prompt's "The most recent Claude models are the Claude 5 family" line).
  - `skills/_shared/loop/dispatch/review.ts:127` has `model: model ?? 'claude-opus-4-8'`. `claude-opus-4-8` is a real model string (the research post on judgment calls was run on Opus 4.8), but it's not what either `.harness-profile` or Claude Code's current defaults point at, and it's inconsistent with the pin above it. Either align the default on `.harness-profile` (preferable — one source of truth) or move it to `claude-opus-5-5`/`claude-sonnet-5-5`.
  - No new effort-routing math is implied: Opus 5.5 keeps the low/medium/high/xhigh/max ladder, so `effort_default: xhigh` (derived from `stakes.level: medium` per `skills/project-init/SKILL.md:153`) still makes sense.
- **Concrete change (the maintainer picks the actual pin):**

  **3a — `.harness-profile`:** three plausible re-pins; the right one depends on operator budget + risk appetite, hence `defer`:
  - `primary: claude-opus-5-5` / `fallback: claude-sonnet-5-5` — straight generation-forward, keeps cost comparable to Opus 4.7, Terminal-Bench 66% vs. Opus 4.7's lower score.
  - `primary: claude-fable-5-2` / `fallback: claude-opus-5-5` — step up to the Advisor/Orchestrator tier for stakes-medium work; roughly 2× cost but 69.9% FrontierSWE v2.
  - `primary: claude-opus-5-5` / `fallback: claude-haiku-5-5` — cost-optimized; Haiku 5.5 as a fallthrough for cheap sub-tasks only (not orchestration; the Oct 7 post explicitly says Haiku 5.5 is not an orchestrator).

  **3b — `skills/_shared/loop/dispatch/review.ts:127`:** replace the hard-coded `'claude-opus-4-8'` fallback with a read from `.harness-profile`'s `model.primary`, or at minimum align it on whichever pin 3a lands at. Keeping the string in only one place removes a drift surface.

- **Expected payoff:** Current sessions silently follow Claude Code's internal default, so the `.harness-profile` pin is more documentation than enforcement right now. Re-pinning to a current family (a) aligns the documented default with the model actually serving most runs and (b) lets the harness take advantage of the "preserved thinking" safeguard without the operator having to know to opt in.
- **Verify before applying:**
  - `grep -n 'claude-opus-4-7\|claude-sonnet-4-6' .harness-profile` — if the pin has already moved, this § is moot.
  - `grep -n "claude-opus-4-8\|claude-opus-4-7\|claude-opus-5\|claude-sonnet-5\|claude-fable-5" skills/_shared/loop/dispatch/review.ts` — check whether the stale default was already updated.
  - `anthropic-reviews/reviewed-posts.md` — confirm no earlier § already moved the pin; this is the first review after the Claude 5.5 cycle.
- **Recommended verdict:** defer until maintainer picks re-pin direction — the stale `review.ts` string is a one-line cleanup, but it's paired with the larger model-choice call; do them together.
- **Status:** PENDING — awaiting triage in PR review

---

## 4. Agent Skills donated to AAIF — bookkeeping; the harness already conforms to the donated spec

- **Source:** [Donating Agent Skills to the Agentic AI Foundation](https://www.anthropic.com/news/donating-agent-skills-to-the-agentic-ai-foundation) (2026-10-22).
- **What the post says:** Anthropic hands the Agent Skills standard (and the `agentskills.io` domain + the `agentskills` GitHub org + the name/logo) to the Linux-Foundation-hosted Agentic AI Foundation. Only normative claim about the spec is: a skill is "a folder containing a `SKILL.md` file." Over 70 platforms integrated it since Dec 2025 (ChatGPT, Cursor, Copilot, VS Code named). Versioned releases + a formal proposal process + security guidance are on the roadmap but unshipped.
- **Current state (verified today):** `find skills -maxdepth 2 -name SKILL.md | wc -l` → 24 skills. Every one is a `skills/<name>/SKILL.md` folder with YAML frontmatter. Already conforms to the spec's single hard requirement.
- **Concrete change:** none. Watch `agentskills.io` for the first versioned release; re-evaluate then.
- **Verify before applying:** read [agentskills.io](https://agentskills.io) when this file is revisited; if a versioned spec has shipped with required frontmatter keys or required subdirectories the harness doesn't carry (e.g. `allowed-tools`, `argument-hint`, `references/`), a new § is needed. The 2026-04-19 §3 (progressive-disclosure skills restructure) is already rejected as in-place, so the baseline here is "already compliant with the only normative requirement the AAIF post names."
- **Recommended verdict:** reject — already conforms. Keep for the durable record; no action today.
- **Status:** PENDING — awaiting triage in PR review

---

## 5. Note the agent-deferral finding in `procedures/triage-quality-issues.md`

- **Source:** [How AI agents shape experts' judgment calls](https://www.anthropic.com/research/agents-judgment-calls) (2026-10-27).
- **The finding, verbatim:** 50 analysts using Claude Code on a causal-inference task matched the agent's randomly-assigned lean 86% of the time, flipped their own prior view 60% of the time when the agent disagreed (vs. 6% when the agent agreed), repeated the agent's arguments 77% of the time but credited the agent only 15% of the time. Experience and expertise didn't predict who deferred. The post calls this "deferral, not sycophancy" and notes the agents "rarely made a strong case for the option they didn't favor."
- **Applicability to a solo harness:** The one thing a solo operator can do today is **name** the failure mode when triaging surprising harness output. If `/run-wave` produced a plan the operator "went along with" and later turned out wrong, the triage question isn't just "was the model right?" — it's "did I adopt the model's lean without arguing against it?" The post's suggested mitigations map to a triage-time checklist, not a product change:
  - Did the agent argue the strongest case for the option it didn't favor?
  - Did the operator state a prior view *before* the agent offered one?
  - Is the agent's recommendation on a decision that should have needed the operator's own reasoning?
- **Concrete change:** Add one short subsection to `procedures/triage-quality-issues.md` — call it "Agent-induced anchoring (2026-10 Anthropic study)" — with the three questions above and a link to the study. ≤20 lines. No skill or agent change.
- **Verify before applying:**
  - `grep -n 'anchoring\|deferral\|agents-judgment-calls' procedures/triage-quality-issues.md` — if the subsection is already present, skip.
  - `wc -l procedures/triage-quality-issues.md` — if the file is already over, say, 300 lines, consider whether adding this would push triage into "too long to read" territory; if so, defer.
- **Recommended verdict:** defer — interesting but not urgent for a solo harness; add when `procedures/triage-quality-issues.md` is next touched.
- **Status:** PENDING — awaiting triage in PR review
