# Anthropic post review — 2026-09-20

First review pass since 2026-05-10. Four months of accumulated posts (May 25 – Sep 17, 2026) surveyed; 14 candidate posts examined (within the 15-per-run cap), 9 produced §s below, 5 skipped in the tracker. Highest-leverage single suggestion: **§1 (Opus 5 primary-model pin)**, since the harness still pins `claude-opus-4-7` while Anthropic has since shipped both Opus 4.8 (2026-05-28) and Opus 5 (2026-07-24). Sources fetched via `WebSearch` only — `www.anthropic.com` and `claude.com` are blocked by this session's egress proxy, so post content is summarised from search-result snippets rather than full-text reads; every URL below is one WebSearch returned. Verify each § against the primary source before applying.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Bump `.harness-profile` primary from Opus 4.7 → Opus 5 (Opus 4.8 as fallback) | apply | Opus 5 is Anthropic's July-2026 frontier-class code/agent model at half of Fable 5's price; harness profile is a full major revision behind. |
| 2 | Cite "Harness design for long-running application development" in AGENTS.md `## Loop protocol` as external corroboration | apply | Anthropic's July engineering post independently validates the harness's initializer→per-item mechanical gate loop shape; a one-line citation strengthens the doc without asking for structural change. |
| 3 | Rename/cross-link the existing `/run-loop` skill so users searching for "dynamic workflows" find it | apply | June "A harness for every task" post makes "dynamic workflow" the term-of-art; harness already ships the mechanism as `/run-loop` — a discoverability fix, not a build. |
| 4 | Add a `docs/protocol/skills-vs-plugins.md` explainer to defend the harness's "symlinked skills, not a plugin" packaging choice | spec | June 21 plugins launch shifts the default packaging expectation; the harness deliberately stayed on symlinked skills — worth writing that down before someone asks. |
| 5 | Extend README §"Context Hygiene" with the three Aug 14 tips the doc doesn't yet cover (`/context` audit, `@-mention files`, `--quiet` flags) | apply | README already teaches `/clear` + `/compact` + `/rename`; missing three of the six official Anthropic tips is a small, cheap fix. |
| 6 | Update README §"Permission Mode" to note Auto Mode is now the default on Pro/Max/Team (Aug 14, 2026) | apply | One-sentence factual update; keeps the docs from lying about a rollout that happened in August. |
| 7 | Test Impact Analysis (Sep 14) — park under `parking_lot.md` "revisit when the harness owns a test suite" | defer until harness ships tests | The `.harness-profile` currently declares `test_required: false` — TIA has no hook to bite. |
| 8 | "How we contain Claude" (May 25) — no fresh action; harness already ships `procedures/api-security-checklist.md` + `/security-review` + Auto Mode docs | reject — already covered | The blast-radius framing is a good citation source but every concrete practice in the post is already surfaced. |
| 9 | Cowork + chat merger (Sep 16) — cross-check `skills/new-cowork/` and `skills/cowork-area-sync/` for stale "Cowork is a separate desktop app" copy | defer until Cowork docs written | Impacts documentation copy, not machinery; batch with the next planned edit to those skills. |

## Skipped posts (see tracker for one-line reasons)

- Introducing Claude Opus 4.8 (May 28, 2026)
- Self-hosted environments for Claude Code (Aug 6, 2026)
- How Claude Tag serves as Anthropic's first responder for CI/CD failures (Aug 18, 2026)
- The AI-Native SDLC playbook (Aug 21, 2026)
- Projects redesigned: from folder to conversation (Sep 17, 2026)

---

## 1. Bump `.harness-profile` `model.primary` from `claude-opus-4-7` → `claude-opus-5`

**Source:** https://www.anthropic.com/news/claude-opus-5 (2026-07-24, "Introducing Claude Opus 5")

**Summary of the source (search-result snippets):** Opus 5 launched July 24, 2026 as Anthropic's new coding-and-knowledge-work SOTA. It approaches Fable 5 performance at half the price, ships with a user-controllable low/medium/high effort toggle, has a 1M-token context window and 128K max output. Available on Claude Code, the Claude API, Bedrock, Vertex, and Foundry with API model ID `claude-opus-5`.

**Current state in the repo (verified):**
- `.harness-profile` pins `model.primary: claude-opus-4-7` (line 32) and `model.fallback: claude-sonnet-4-6`, dated 2026-04-11.
- `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md` Q4 explicitly parks the "who bumps the pin" question ("When Opus 4.8 ships, who updates the `model.primary` pin — a dedicated drift-check skill, or a manual micro-session triggered by the anthropic-reviews routine? … Park — decide after anthropic-reviews routine has a second run.") — that decision has now had many runs, so the park question is due.
- No file under `/home/user/claude-harness` mentions `claude-opus-5` or the July 24 announcement.
- Opus 4.8 is referenced in run-loop wave docs (`docs/waves/wave21-run-loop-live-wiring.md`, `docs/specs/2026-06-14-run-loop-live-wiring.md`) as the API-side reviewer backend that was proven at wave 21 live-drain (2026-06-15), but never propagated into `.harness-profile`.

**Concrete diff:**

```diff
--- a/.harness-profile
+++ b/.harness-profile
@@ model:
-  primary: claude-opus-4-7
-  fallback: claude-sonnet-4-6
+  primary: claude-opus-5
+  fallback: claude-opus-4-8       # was claude-sonnet-4-6; Opus 4.8 is the Wave-21-proven reviewer tier
   effort_default: xhigh   # derived from stakes.level: medium
   effort_cost_multiplier: {}   # optional; keys ∈ {low, medium, high, xhigh} → numeric (reserved for /tokens)
```

Also open a follow-up micro to answer the Q4 park in the 2026-04-19 spec: adopt the "manual micro-session triggered by this routine" answer, since that is what actually happened here.

**Expected payoff:** Solo-maintainer harness stays on the current frontier model without a two-major-version lag. The `effort_default: xhigh` pin already lines up with Opus 5's effort toggle, and the wave-21 audit trail already trusts Opus 4.8 as reviewer — using it as fallback rather than jumping to Sonnet is a documented, tested tier.

**Verify before applying:** `grep -n 'primary\|fallback' .harness-profile` and `curl -sS https://www.anthropic.com/news/claude-opus-5` (or the API model list) to confirm `claude-opus-5` is still the current primary model ID and that no `claude-opus-5-1` has since shipped that would be the better pin.

**Recommended verdict:** apply — one-line profile edit; the routine's parked Q4 answer is now overdue.
**Status:** PENDING — awaiting triage in PR review

---

## 2. Cite "Harness design for long-running application development" in AGENTS.md §"Loop protocol" as external corroboration

**Source:** https://www.anthropic.com/engineering/harness-design-long-running-apps (2026-07-26, Prithvi Rajasekaran, Anthropic Labs)

**Summary of the source (search-result snippets):** Anthropic's engineering post argues harness design is load-bearing for long-running agentic coding. It describes an *initializer agent* that decomposes a product spec into a task list, plus a *coding agent* that implements tasks one feature at a time, and enumerates common failure modes when agents go off the rails over long horizons. The post also frames frontend-design quality as a distinct axis from long-running autonomy.

**Current state in the repo (verified):**
- `AGENTS.md` §"Loop protocol" already describes the harness's own initializer/per-item-gate architecture: plan.md waves → planner classifies AFK/HITL → per-item mechanical gate (implement → exit gate → review → verify → bounded auto-fix → merge). The 4-gate AFK/HITL classifier and the runner-aware capability test are already coded in `skills/_shared/classifier/`.
- `skills/run-loop/SKILL.md` documents the third execution lane and cites the wave-21 live drain (2026-06-15) as production evidence.
- No existing reference to the July 26 Anthropic post — this is a *citation gap*, not a mechanism gap.

**Concrete diff (illustrative):**

```diff
--- a/AGENTS.md
+++ b/AGENTS.md
@@ Loop protocol
 **Relationship to the wave lane.** The loop reuses the wave lane's machinery, it does not replace it: an AFK merge performs the same board tick + receipts the wave-close step performs, and the planner's per-wave runner declaration feeds the loop's runner selection. Use the wave lane when a human checkpoint between batches is wanted; use the loop when a stream of independently-gated work should drain unattended.
+
+**External corroboration.** The initializer→per-item-gate shape used here matches the pattern Anthropic Labs describes in *Harness design for long-running application development* (Prithvi Rajasekaran, 2026-07-26, https://www.anthropic.com/engineering/harness-design-long-running-apps). Their two failure-mode taxonomy (agents "going off the rails over time" in complex tasks) is the same failure surface `.harness-state/current_micro.md` + the mechanical gate exist to bound — cite the post when explaining *why* the loop enforces per-item state rather than trusting a single long-lived agent context.
```

**Expected payoff:** Adds authoritative external evidence for a design choice the maintainer would otherwise have to justify from first principles when onboarding a colleague (see `INSTALL-FOR-COLLEAGUE.md`). No structural change needed.

**Verify before applying:** `grep -n 'Loop protocol' AGENTS.md` and read the full source post before quoting failure modes verbatim — the WebSearch snippet said only "two common failure modes" without listing them; a citation that misquotes is worse than none.

**Recommended verdict:** apply — one-paragraph citation, low risk, meaningful reinforcement of an existing doc.
**Status:** PENDING — awaiting triage in PR review

---

## 3. Cross-link `/run-loop` from a new one-liner in README under the term "dynamic workflows"

**Source:** https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code (2026-06-02)

**Summary of the source (search-result snippets):** The June 2 post frames Claude Code's ability to write and orchestrate its own multi-agent harness on the fly as a *dynamic workflow*, and enumerates patterns for getting the most out of that mechanism. The term "dynamic workflow" is now the Anthropic-official phrase for what this harness has been calling a loop/wave lane since April.

**Current state in the repo (verified):**
- `README.md` and `WORKFLOW.md` describe the wave lane, loop lane, and mechanical gate in the harness's own vocabulary — no occurrence of "dynamic workflow" or "dynamic workflows".
- `skills/run-loop/SKILL.md` is the third execution lane and already implements the pattern.
- A user coming from the June 2 post looking for "the harness's dynamic workflow support" will not find it via grep or repo search.

**Concrete diff (illustrative):**

```diff
--- a/README.md
+++ b/README.md
@@ (near the run-loop / wave lane section)
-`/run-loop` drives a stream of ready work — plan.md waves or `ready-for-agent` gh issues — end-to-end behind a mechanical gate, unattended, until the source drains or a termination cap fires.
+`/run-loop` drives a stream of ready work — plan.md waves or `ready-for-agent` gh issues — end-to-end behind a mechanical gate, unattended, until the source drains or a termination cap fires. (This is what Anthropic's June 2026 post [*A harness for every task*](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code) calls a **dynamic workflow**; the harness's version pre-dates that framing and adds the AFK/HITL classifier + risk-proportional auto-merge on top.)
```

**Expected payoff:** Pure discoverability. No new mechanism, no new dependency, no scope change. Costs one sentence; saves any future reader (including a returning maintainer) the "wait, does this repo do dynamic workflows?" search.

**Verify before applying:** `grep -in 'dynamic workflow' README.md WORKFLOW.md AGENTS.md skills/run-loop/SKILL.md` — if it's already there, drop the diff.

**Recommended verdict:** apply — trivial edit, clearly positive-signal.
**Status:** PENDING — awaiting triage in PR review

---

## 4. Write a short `docs/protocol/skills-vs-plugins.md` defending the "symlinked skills, no plugin bundle" packaging choice

**Source:** https://claude.com/blog/claude-code-plugins (2026-06-21, "Customize Claude Code with plugins")

**Summary of the source (search-result snippets):** Claude Code plugins are packaged bundles of skills + agents + hooks + MCP servers, installable via `/plugin`, distributed through marketplaces. Plugins can contain multiple skills, whereas a skill is a single SKILL.md directory. The `--plugin-dir` CLI flag now accepts `.zip` archives. By mid-2026 there are community plugin marketplaces on "every corner" (per third-party ecosystem summaries).

**Current state in the repo (verified):**
- The harness's canonical distribution shape (per `CLAUDE.md`, `AGENTS.md`, `skills/setup-harness/SKILL.md`) is: `skills/<x>/SKILL.md` sources in-repo, symlinked out to `~/.claude/skills/`. Bidirectional symlink invariant is a stated bug flag ("If `skills/<x>` is itself a symlink, that's a bug — flag it.").
- The only "plugin" reference in the whole repo is `README.md`'s note that the codex-integration path requires the `openai-codex` plugin — that's a *consumer* of a plugin, not a plugin authoring stance.
- There is no `docs/protocol/skills-vs-plugins.md` or equivalent explaining *why* the harness chose the symlink-fanout distribution over packaging its ~18 skills as one `claude-harness` plugin.

**Concrete outline for the new doc:**

```
docs/protocol/skills-vs-plugins.md
─────────────────────────────────
Title: Why claude-harness distributes as symlinked skills, not a plugin bundle
Sections:
  1. Anthropic's 2026-06-21 plugin format — the bundle-and-marketplace model
  2. What the harness does instead (`~/.claude/skills/` symlink from setup-harness)
  3. Trade-offs (writable-in-place source of truth vs. installer atomicity)
  4. Migration cost estimate + trigger condition ("if a second maintainer or a second distribution channel joins, revisit")
  5. Pointer to `skills/setup-harness/SKILL.md` for the current installer path.
```

**Expected payoff:** Prevents a well-meaning contributor (or the maintainer six months from now) from re-litigating the packaging choice, and gives a concrete migration trigger. Zero implementation cost until the trigger fires. Marks this decision as scope-explicit so the harness doesn't drift into plugin-shape by accident.

**Scope: speculative** — this is a design-explainer doc, not a mechanism change; write it only if the maintainer thinks the "why not a plugin?" question is likely to come up.

**Verify before applying:** `ls docs/protocol/ 2>/dev/null | grep -i plugin` and `grep -rin 'plugin' skills/setup-harness/` — confirm no equivalent explainer already exists and confirm setup-harness's installer path hasn't secretly become plugin-shaped since the last check.

**Recommended verdict:** spec — needs a design pass via /spec-planner before writing, because "when to migrate to plugin format" is the load-bearing content and that's a real cross-cutting decision (touches every consumer project that installs from this repo).
**Status:** PENDING — awaiting triage in PR review

---

## 5. Extend README §"Context Hygiene" with the three Aug 14 tips it doesn't yet cover

**Source:** https://claude.com/blog/maximizing-the-value-of-your-claude-code-sessions (2026-08-14, "Maximizing the value of your Claude Code sessions")

**Summary of the source (search-result snippets):** Six tips: (a) `/clear` between tasks; (b) set model + effort early; (c) `@-mention files` to focus context; (d) quiet flags on commands (e.g. `--quiet` on npm-scripts) to keep tool output out of context; (e) `/context` to audit startup payload; (f) `/compact` before you walk away.

**Current state in the repo (verified — `grep -n` on README.md):**
- `/clear` between tasks — present (line 864).
- Set model + effort early — present via `.harness-profile` `effort_default` and orchestrator routing (line 574).
- `/compact Focus on [X]` — present (line 865).
- `@-mention files` — **NOT** in README (grep for `@-mention`, `@file` returns 0 hits).
- `--quiet` flags — **NOT** in README (grep for `--quiet`, `quiet flag` returns 0 hits).
- `/context` to audit startup — **NOT** as a first-class tip (only mentioned in the "Further reading" link block at line 1118).

Three of six tips are missing. Two rows in the existing "Context Hygiene" table already have the same rhythm.

**Concrete diff:**

```diff
--- a/README.md
+++ b/README.md
@@ | **`/btw` for side questions** | Quick questions mid-task | Answer appears in overlay, never enters conversation history. Zero context cost. |
+| **`@-mention` the files that matter** | When the change touches ≤5 files | Points Claude at exactly what it needs to read; a subagent would summarize away detail you may need. |
+| **`--quiet` flags on tool calls** | Any pnpm/npm/pytest/cargo invocation | Full command output enters context; `--quiet` (or `--silent`, `-q`, `--reporter=dot`) strips the walls of text and leaves only the exit signal. |
+| **`/context` before you resume a session** | After `--resume` on a warm session | Prints what's already in the window so you know whether to `/compact` before adding more work. |
```

(Attribution: cite the Aug 14 post in the intro paragraph of the Context Hygiene section — this whole table is now Anthropic-endorsed session hygiene.)

**Expected payoff:** Closes half the tip-parity gap between the harness README and Anthropic's canonical guide. No mechanism change; targets the same audience the README already serves.

**Verify before applying:** `grep -in '@-mention\|@file\|--quiet\|/context' README.md` — if the maintainer has already patched this since 2026-09-20, drop the corresponding rows.

**Recommended verdict:** apply — three README rows, plain factual gap, no side effects.
**Status:** PENDING — awaiting triage in PR review

---

## 6. README §"Permission Mode" — note Auto Mode is now the *default* on Pro/Max/Team

**Source:** https://claude.com/blog/auto-mode-default-in-claude-code (2026-08-14, "Auto mode is now the default in Claude Code for Pro, Max, and Team plans")

**Summary of the source (search-result snippets):** From August 14, 2026, new sessions on Pro/Max/Team plans start in Auto Mode by default. Enterprise and Free stay opt-in. This is a rollout notice for a feature the harness has already documented since May.

**Current state in the repo (verified):**
- `README.md` §"Permission Mode" (line 873–885) documents Auto Mode as an *opt-in* setting the reader would add to their `~/.claude/settings.json`.
- The 2026-05-08 §1 in this same reviews directory already handled Anthropic's engineering deep-dive on Auto Mode; that's the mechanism doc. This post is only the "now the default" flip.
- README says "Use **auto mode** to eliminate permission prompts" — no note that it's already on for most users.

**Concrete diff:**

```diff
--- a/README.md
+++ b/README.md
@@ ### Permission Mode
-Use **auto mode** to eliminate permission prompts without compromising safety:
+Use **auto mode** to eliminate permission prompts without compromising safety. (Auto mode is the [default on new Pro/Max/Team sessions since 2026-08-14](https://claude.com/blog/auto-mode-default-in-claude-code); the config block below is only needed to *pin* mode + allowlist explicitly, or to opt in on Enterprise/Free where the default is still `default`.)
```

**Expected payoff:** README stops implying the reader has to opt in when in fact most of them are already in Auto Mode by default. Prevents the "why don't I see prompts anymore?" support question.

**Verify before applying:** `grep -n 'default on new Pro' README.md` — if already there, drop. Also confirm Anthropic hasn't since rolled Auto Mode back or renamed it before quoting.

**Recommended verdict:** apply — one-sentence factual annotation.
**Status:** PENDING — awaiting triage in PR review

---

## 7. Test Impact Analysis (Sep 14) — park under `parking_lot.md` with a clear reactivation trigger

**Source:** https://claude.com/blog/agentic-coding-is-straining-ci-heres-how-we-scaled-test-impact-analysis-at-anthropic (2026-09-14)

**Summary of the source (search-result snippets):** Anthropic's CI job volume grew 25× in 6 months once agents joined the team (compound: 8× more code per engineer × 10× more tests × ~constant headcount = 25× CI jobs). They built a deterministic **test impact analysis / test selection service** — a listener that records every test result into a per-test history, and a selector that uses that history plus package relevance to pick which tests each PR runs. The service was patched three times before landing on a sustainable architecture; the post argues horizontally-scaled test selection will be industry-standard for teams running agents at scale.

**Current state in the repo (verified):**
- `.harness-profile` declares `test_required: false` (line, verbatim: `test_required: false        # no runnable tests yet`).
- `procedures/api-security-checklist.md` and `procedures/triage-quality-issues.md` are the only two files in `procedures/`. No CI configuration, no test runner, no per-test history storage exists in the repo.
- The `run-loop` engine at `skills/_shared/loop/` runs its own gates (`node:test` on the shared loop module), but that is not a CI-scale problem — it's a single-repo unit-test module tree.

**Concrete diff (park entry, not a suggestion body):**

```diff
--- a/parking_lot.md
+++ b/parking_lot.md
@@ (append under "Deferred until preconditions met")
+### Test Impact Analysis (deferred until harness owns a shared test suite)
+
+Anthropic's 2026-09-14 engineering post on scaling test-impact analysis
+(https://claude.com/blog/agentic-coding-is-straining-ci-heres-how-we-scaled-test-impact-analysis-at-anthropic)
+describes a per-test-history listener + package-relevance selector. It bites when
+CI job growth compounds against agent-generated PRs. **Reactivation trigger:** the
+harness ships a runnable test suite (revisit `.harness-profile.quality_bar.test_required`) AND
+opens itself to agent-authored PRs. Until then, the mechanism has nothing to select over.
```

**Expected payoff:** Marks the post as reviewed and *deliberately deferred* — the next reviewer knows this was considered, not missed. Costs a parking-lot row; guards against re-scoring the same post next month.

**Verify before applying:** `grep -in 'test.impact\|TIA' parking_lot.md` — if already parked, don't add a second row. Also `head -50 parking_lot.md` to check the "Deferred until preconditions met" section actually exists (harness-adjacent parking sections have historically been renamed).

**Recommended verdict:** defer until harness ships tests — the post's mechanism only applies once there's a test suite to select against.
**Status:** PENDING — awaiting triage in PR review

---

## 8. "How we contain Claude across products" (May 25, 2026) — no action; already covered

**Source:** https://www.anthropic.com/engineering/how-we-contain-claude (2026-05-25)

**Summary of the source (search-result snippets):** Anthropic's containment layers across claude.ai, Claude Code, and Cowork — OS sandboxes, network isolation, tool-use permissioning. Core principle: "supervise what an agent is able to do, not what it actually does." Blast-radius framing: capabilities motivate deployment, containment caps the damage. Cites 93% permission-prompt approval rate (before Auto Mode) and 83% risky-behavior blocking rate (after).

**Current state in the repo (verified):**
- `procedures/api-security-checklist.md` — present.
- `skills/security-review/` — bundled Claude Code built-in, visible in the available-skills list.
- `README.md` §"Permission Mode" — documents Auto Mode + explicit allowlist.
- `AGENTS.md` §"Loop protocol" already covers **safety guardrails** for the worktree lane: catastrophic-command denylist as a `PreToolUse` hook, write-root confinement, default-deny egress on secret-bearing items, task-scoped credential injection. This is exactly "supervise what the agent is able to do" — the containment principle the post argues for.

Every concrete practice the post advocates is already surfaced somewhere in this repo. The only value-add would be citing the post as an *evidence source* for the design already in place — which is a duplicate of the 2026-05-08 review's Auto Mode entry.

**Recommended verdict:** reject — already covered. No fresh action from this post beyond what the 2026-05-08 §1 (Auto Mode) already carried.

**Verify before applying:** `grep -rn 'blast radius\|blast-radius\|contain Claude' README.md AGENTS.md CLAUDE.md skills/setup-harness/` — if a citation to this post surfaces before next quarter's review, this rejection was still correct; if `AGENTS.md` §"Loop protocol" grows a *new* containment paragraph that lacks a citation, revisit whether adding the URL there is worth the edit.

**Status:** PENDING — awaiting triage in PR review

---

## 9. Cowork + chat merger (Sep 16) — cross-check `skills/new-cowork/` + `skills/cowork-area-sync/` for stale copy

**Source:** https://claude.com/blog/cowork-and-chat-are-now-one-claude (2026-09-16, "Claude Cowork and chat are now one Claude")

**Summary of the source (search-result snippets):** Anthropic merged Claude Cowork (the desktop knowledge-work agent) and Claude chat into a single Claude surface. Shared memory is on by default across the merged surface.

**Current state in the repo (verified):**
- `skills/new-cowork/` scaffolds `.claude/desktop-knowledge/` bundles for Claude Desktop / claude.ai projects (documented in `AGENTS.md` line 89).
- `skills/cowork-area-sync/` refreshes those bundles.
- Both skills' internal copy still treats Cowork as a separate product surface (per `AGENTS.md` line 89 wording: "the `.claude/desktop-knowledge/` bundle scaffolded by `/new-cowork` inside each cowork project is the explicit cross-surface bridge").

**Actionable but batched:** the merger flips the framing from "Cowork is a distinct desktop product with its own Projects UI" to "Cowork is one of the surfaces of Claude, sharing memory with chat by default." Copy in `new-cowork` and `cowork-area-sync` that says "Cowork desktop app" / "Cowork Projects" / "distinct surface" will read as stale. The mechanism (drag-a-folder, MCP filesystem, `desktop-knowledge/` bundle) still works — only the vocabulary is out of date.

**Recommended verdict:** defer — combine with the next planned edit to the cowork skills rather than opening a copy-only PR now. Reactivation trigger: any wave that already touches `skills/new-cowork/` or `skills/cowork-area-sync/`.

**Verify before applying:** `grep -rn 'Cowork\|cowork desktop\|desktop-knowledge' skills/new-cowork/ skills/cowork-area-sync/ AGENTS.md` — and confirm via the Sep 16 post whether "Cowork" is still the product name for the merged surface or has itself been renamed.

**Status:** PENDING — awaiting triage in PR review

---

## Notes for the maintainer

- **Coverage caveat.** WebFetch to `www.anthropic.com` and `claude.com` returned `EGRESS_BLOCKED` from this session's proxy, so every URL above was surfaced by `WebSearch` and every summary is drawn from search-result snippets — not full-text reads. Verify each linked post directly before quoting from it in a PR body or public README. This is also why the four-month backlog is being processed as one batch: the previous 2026-05-10 run may have been the last time the routine could reach the sources.
- **The Q4 park from `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md` is due.** §1's edit is the concrete answer ("the anthropic-reviews routine surfaces the bump; the maintainer applies it as a manual micro"). Consider closing that spec Q on the same PR.
- **Highest-leverage single suggestion:** §1 (Opus 5 pin). Everything else is documentation polish or a park entry.
