# Anthropic post review — 2026-11-21

**Review window:** 2026-05-11 → 2026-11-21 (routine was dormant ≈6 months; this run clears the backlog).
**Posts evaluated in scope:** 15 (capped per routine).
**Discovery scope:** `anthropic.com/news`, `anthropic.com/engineering`, `claude.com/blog` (Claude Code category). News-only entries (IPO, partnerships, geo expansion, customer stories) and policy/safety announcements without a Claude Code hook were skipped straight to the tracker.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Bump harness model pin: Opus 4.7 → Opus 5.5 family (Opus 5.5 primary, Sonnet 5.5 fallback, Haiku 5.5 subagent) | spec | 5+ file edits + one convention change (stakes→effort derivation); needs a design pass before shipping |
| 2 | Add Fable 5.2 as an optional "advisor" tier above Opus for hardest planning work | defer | Speculative; no spec_planner/orchestrator consumer yet, and pricing ($8/$40) is 2x Opus 5.5 |
| 3 | Re-anchor `effort_default` derivation now that Claude Code default dropped from xhigh → medium for the 5.5 family | apply | One doc-edit; the current comment cites a stale 2026-04-23 anchor |
| 4 | Adopt `.claude/settings.json` `permissions.deny` for generated files and third-party trees, at setup-harness time | apply | One-liner in `setup-harness` templates; Anthropic now ships this as a first-party pattern |
| 5 | Codify subdirectory CLAUDE.md + start-in-subdirectory guidance in the README's CLAUDE.md section | apply | README already recommends lean root; adds the "walks up the tree" mechanic that was absent |
| 6 | "Dreaming" offline-consolidation pass over `.harness-state/` + MEMORY.md (one-writer-per-page, wiki+search) | defer | Overlaps `/memory-prune` and session-end; worth a design look only if cross-session recall misfires |
| 7 | Scan persistent context (CLAUDE.md / MEMORY.md / `.harness-state/`) at session-start for injected instructions + canary strings | defer | No incident yet; add if the harness takes on an unattended `/run-loop` with network tools |
| 8 | Attach "Building strong safety evaluations" rubric guidance to the still-deferred 2026-04-19 §5 (agent evals) | defer | Bookkeeping on the existing deferred item; no action today |
| 9 | Re-affirm the "verification is the new bottleneck" framing in the README (post from `claude.com/blog/running-an-ai-native-engineering-org`) | reject | Already reflected by code-reviewer + ui-evaluator + planning-loop — no delta |

---

## 1. Bump harness model pin: Opus 4.7 → Opus 5.5 family

**Source:** https://www.anthropic.com/news/claude-opus-5-5 (2026-09-22), https://www.anthropic.com/news/claude-sonnet-5-5 (2026-09-28), https://www.anthropic.com/news/claude-haiku-5-5 (2026-10-07).

**What changed:**
- **Opus 5.5** (`claude-opus-5-5`). Claude Code and apps default to Medium effort. Anthropic reports Opus 5.5 at Medium beats Opus 5 at Max for ~1/5 the cost. Thinking **cannot be disabled**; `between_tools` is the new control for Sonnet. Preserved-thinking is enforced for accounts created on/after 2026-08-31 — integrations that edit prior context need updates. Fast mode is live in Claude Code.
- **Sonnet 5.5** (`claude-sonnet-5-5`). Claude Code default = Medium; API default = High (a split the harness didn't need to care about before). Batches tool calls more aggressively; fewer steps/tokens per task. At Max effort it's prone to running the code-review skill recursively — Xhigh is safer for merge-ready work.
- **Haiku 5.5** (`claude-haiku-5-5`). First Haiku with adjustable effort (Low/Med/High/Xhigh/Max). Pricing is ~10% of Sonnet 5.5 (tiered at 100k tokens). Pairs with Opus 5.5 / Sonnet 5.5 as a subagent model; still trails them on Terminal-Bench 4.0 (39.2% vs 70.6%).

**Current harness state (verified 2026-11-21):**
- `.harness-profile` line 30–32: `model.primary: claude-opus-4-7`, `model.fallback: claude-sonnet-4-6`.
- `README.md` line 3, 10, 25, 574, 852, 891: "Opus 4.7" referenced as the design target 6 times in live prose.
- `skills/project-init/SKILL.md` line 166, 203: stakes→effort derivation table cites "2026-04-23 postmortem (Claude Code defaults Opus-4.7 users to xhigh)" — the new Opus 5.5 Claude Code default is **Medium**, not Xhigh.
- The `orchestrator`'s runtime routing table (`.claude/agents/orchestrator.md`, referenced by README line 574) still assumes a 4.x model lineup when it picks `haiku` for read-only and `opus` for architecture.

**Concrete changes (decomposed):**
- **§1a — pin bump** (`.harness-profile`): `model.primary: claude-opus-5-5`, `model.fallback: claude-sonnet-5-5`. Add a comment pinning Haiku 5.5 as the subagent floor.
- **§1b — README prose refresh**: rewrite the six "Opus 4.7" mentions as "Opus 5.5" (or more durably: "the current Opus generation") and update the "Philosophy" quote block to acknowledge Medium as the Claude Code default — the current prose argues for xhigh "because Opus 4.7 follows instructions literally at low effort," which is no longer the shipped default.
- **§1c — effort_default re-anchor** (`skills/project-init/SKILL.md` + `.harness-profile` comment block): replace the 2026-04-23 postmortem anchor with the 5.5 family defaults. New derivation candidate:

  | `stakes.level` | `effort_default` (5.5 era) |
  | --- | --- |
  | `low` | `medium` |
  | `medium` | `high` |
  | `high` | `xhigh` |

  Rationale: Opus 5.5 Medium ≈ Opus 5 Max on reported benchmarks, so the low→high jump of the 4.7 table now costs more without a quality delta. High/xhigh stays above the shipped default for high-stakes work. Keep the "derivation only on first write; manual override preserved" rule.
- **§1d — orchestrator routing**: audit `.claude/agents/orchestrator.md` for 4.x-era assumptions (e.g. "haiku can't handle complex algorithms" — now partly addressed by adjustable effort on Haiku 5.5). No change required if the routing is already generation-agnostic; call this out explicitly in the audit.
- **§1e — preserved-thinking caveat**: add one line to `AGENTS.md` and `CLAUDE.md` noting that integrations that edit prior context (e.g. the orchestrator's synthetic wave-spec injection) may need review for preserved-thinking compatibility if the account was created on/after 2026-08-31.

**Expected payoff:** Moves the harness off a model the Claude Code product no longer ships as the default primary. Removes the stale postmortem anchor that encouraged `xhigh` for routine work (now typically overkill and more expensive than needed). Clarifies that Haiku 5.5 is now a real option with its own effort knob, which may unlock cheaper orchestrator dispatches.

**scope: speculative** on §1d only — the orchestrator audit may find no changes needed. The pin + derivation re-anchor are concrete.

**Verify before applying:**
- `grep -n "claude-opus-4-7\|claude-sonnet-4-6\|Opus 4\.7" .harness-profile README.md CLAUDE.md skills/project-init/SKILL.md` — if any match remains, the §'s still live.
- `grep -n "2026-04-23 postmortem" skills/project-init/SKILL.md .harness-profile` — stale anchor still referenced.
- Also sanity-check: `cat .harness-profile | grep -E "^model:" -A 5` should still show `opus-4-7` as primary; if a prior landing already bumped it, drop this §.

**Recommended verdict:** spec — multi-file; introduces a new stakes→effort derivation table (a reusable convention); changes a 2026-04-23-era anchor that other docs cite. Per README triage protocol: >5 files OR new convention → spec.
**Status:** PENDING — awaiting triage in PR review

---

## 2. Add Fable 5.2 as an optional "advisor" tier above Opus for the hardest planning work

**Source:** https://www.anthropic.com/news/claude-fable-and-mythos-5-2 (2026-11-09).

**What's new:** Fable 5.2 (model ID: `claude-fable-5-2`) sits above Opus 5.5 for the "most ambitious, open-ended technical work" and outperforms Opus 5.5 on almost all evaluated capabilities. Pricing: $8 in / $40 out per 1M tokens (2× Opus 5.5). Anthropic specifically frames it as either an **Advisor** (smaller models consult it on hard problems) or an **Orchestrator** (delegates simpler work to smaller models). Mythos 5.2 is the unsafeguarded sibling, gated to the Cyber and Life Sciences Verification Programs.

**Potential harness surface:**
- `spec-planner` on genuinely novel feature specs (not already-templated work) could call Fable 5.2 as a one-shot advisor before writing the spec.
- `planning-loop` could promote to Fable 5.2 for the final review round when the cap-reached `needs-attention` arbiters disagree.
- `orchestrator` could add a new "fable" route for tasks tagged `advisor: true` in a spec.

**Why defer:**
- 2× Opus 5.5 pricing hurts token economy on a solo-maintained repo; the payoff is uncertain without side-by-side comparisons on actual harness-maintainer tasks.
- Nothing in the current `planning-loop` auto-apply arbiter design assumes a tier above Opus. Adding one is a routing change, not a config knob.
- The repo already defers §2 from 2026-04-19 (brain/hands split via Managed Agents) for exactly this kind of "tier-above-the-default" architectural shift. Pair this § with that deferral.

**scope: speculative**.

**Verify before applying:**
- `grep -nE "fable|claude-fable" .harness-profile skills/planning-loop/SKILL.md .claude/agents/orchestrator.md` — if Fable has already been wired in, drop this §.
- Check `anthropic-reviews/2026-04-19-improvement-suggestions.md` §2 status — if that deferral is also still PENDING, keep this § deferred alongside it.

**Recommended verdict:** defer until (a) the Opus 5.5 pin lands (§1) and the harness has 2+ weeks of 5.5-family baseline usage, AND (b) there's a concrete planning-loop or spec-planner task where Fable's advisor pattern beats stacking two Opus 5.5 rounds.
**Status:** PENDING — awaiting triage in PR review

---

## 3. Re-anchor `effort_default` derivation for the Opus 5.5 era

**Source:** https://www.anthropic.com/news/claude-opus-5-5 (2026-09-22) — "Default effort is medium. Opus 5.5 at default effort beats Opus 5 at max effort for about a fifth of the cost."

**Current harness state (verified 2026-11-21):**
`skills/project-init/SKILL.md:166` states:
> As of Anthropic's [2026-04-23 postmortem](https://www.anthropic.com/engineering/april-23-postmortem), Claude Code defaults Opus-4.7 users to `xhigh`. The derivation above stays at or above that floor for the primary model.

That anchor is now **stale**. Opus 5.5's Claude Code default is **Medium**, not Xhigh. Keeping `xhigh` for `stakes.level: medium` means the harness is now running at a higher effort than the vendor's own default, which inflates cost without a clear quality win on the new generation.

**Concrete change** (text-edit; defers the derivation-table change itself to §1c since they must land together):
Replace the anchor paragraph at `skills/project-init/SKILL.md:166` with:
> As of 2026-09-22, Claude Code defaults Opus 5.5 users to `medium` (Anthropic reports Opus 5.5 at medium ≈ Opus 5 at max). The derivation above keeps `stakes.level: medium` at Anthropic's new default and bumps high-stakes work one step above it. See [Opus 5.5 announcement](https://www.anthropic.com/news/claude-opus-5-5) for the cost/quality curve.

Mirror the comment update in `.harness-profile:24-27`.

**Expected payoff:** Removes a stale citation; aligns effort defaults with the model the harness will actually pin to after §1 lands.

**Verify before applying:**
- `grep -n "2026-04-23 postmortem" skills/project-init/SKILL.md .harness-profile` — if zero hits, this § is already applied.
- Must land **with or after** §1c; applying it alone leaves an inconsistent state.

**Recommended verdict:** apply — one-paragraph doc edit; the citation is objectively outdated.
**Status:** PENDING — awaiting triage in PR review

---

## 4. Adopt `.claude/settings.json` `permissions.deny` in setup-harness templates

**Source:** https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start — "Committed `permissions.deny` rules in `.claude/settings.json` exclude generated files and third-party code for the whole team."

**What's new (relative to this harness):** Anthropic now treats `permissions.deny` as a first-class recommendation for every project, not just large ones. The harness's `setup-harness` SKILL ships templates for `.claude/`, criteria/, procedures/, CLAUDE.md — but does not seed a `permissions.deny` block.

**Current harness state (verified 2026-11-21):**
- `grep -l "permissions.deny" skills/setup-harness/templates/` → no match.
- `CLAUDE.md` line 28 references the catastrophic-command denylist as a `PreToolUse` hook (global, operator-installed). That covers the bash side; it does not cover file-read/write permission denies.
- `README.md` line 880 documents the Auto Mode `allow` list; no corresponding `deny` guidance.

**Concrete changes:**
- Add `.claude/settings.json` to `skills/setup-harness/templates/` with a project-type-aware `permissions.deny` block:

  ```jsonc
  {
    "permissions": {
      "deny": [
        "Read(node_modules/**)",
        "Read(dist/**)",
        "Read(build/**)",
        "Read(.next/**)",
        "Read(target/**)",
        "Read(**/*.log)",
        "Read(.git/objects/**)"
      ]
    }
  }
  ```

  Branch the list per detected runtime (Node/Bun → `node_modules`, Rust → `target`, Python → `__pycache__`, `.venv`, etc.) from `skills/project-init/SKILL.md`'s detection logic.
- Add one row to `README.md`'s "Session Hygiene → Permission Mode" table citing deny-list guidance + the source blog post.

**Expected payoff:** Saves context when Claude hits auto-opened generated files during code exploration. Costs zero context when nothing in the denylist is touched.

**scope: speculative** on the exact deny-list contents — Anthropic's post doesn't ship a canonical list.

**Verify before applying:**
- `ls skills/setup-harness/templates/ | grep -E "settings\.json|\.claude"` — if a template file already exists, read it and adjust this § to a diff rather than a fresh file.
- `grep -nR "permissions.deny" skills/setup-harness/ README.md` — any match means partial work is already done.

**Recommended verdict:** apply — one new template file; one README table row; first-party pattern from a recent engineering post.
**Status:** PENDING — awaiting triage in PR review

---

## 5. Codify subdirectory CLAUDE.md + start-in-subdirectory guidance in the README

**Source:** https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start — "Start Claude in subdirectories rather than the repo root. It walks up the tree and loads each CLAUDE.md it finds."

**What's new:** The walks-up-the-tree mechanic is now officially recommended by Anthropic for monorepos / layered codebases. The README's current CLAUDE.md section (line 749–772) correctly tells users to keep CLAUDE.md lean, but it does not mention the subdirectory walk or recommend starting Claude in subdirectories for scoped tasks.

**Current harness state (verified 2026-11-21):**
- `README.md` line 749 "Write Your CLAUDE.md" section: focused on the root CLAUDE.md only.
- `CLAUDE.md` (project root, 36 lines): compliant with the lean-root principle; no subdirectory CLAUDE.md files exist today in this repo (none needed — monolithic tool repo).
- `examples/backend-project/CLAUDE.md` and `examples/web-app-project/CLAUDE.md`: shipped as references but not subdirectory-nested.

**Concrete changes:**
- Add a short "**Subdirectory CLAUDE.md files**" subsection under README.md "Write Your CLAUDE.md" with two bullets:
  - "Claude walks from the cwd up to the repo root, loading each `CLAUDE.md` along the way. A root-level CLAUDE.md for the lay of the land + per-package CLAUDE.md files for local test/lint commands keeps each session's context scoped to what's actually relevant."
  - "For monorepos, start Claude in the package you're working on, not the repo root — scoped commands + scoped context."
  - Cite the source blog post.
- Add one bullet to `examples/web-app-project/CLAUDE.md` noting the walk-up behavior, since web-app projects are the most common split-repo case the harness documents.

**Expected payoff:** Aligns the harness's documented CLAUDE.md pattern with Anthropic's current recommendation. Applies mostly to downstream consumer projects — this repo itself stays single-CLAUDE.md.

**Verify before applying:**
- `grep -n "subdirectory\|walks up\|per-package" README.md` — if the walks-up-the-tree mechanic is already documented, drop this §.
- `ls examples/*/CLAUDE.md` — confirm both example CLAUDE.md templates still exist; this § assumes they do.

**Recommended verdict:** apply — one README subsection, two bullets; aligns with first-party guidance that was absent when the current section was written.
**Status:** PENDING — awaiting triage in PR review

---

## 6. "Dreaming" (offline memory consolidation) for `.harness-state/` + MEMORY.md

**Source:** https://www.anthropic.com/engineering/components-of-agent-memory (2026-11-06).

**What's new:** Anthropic describes a formal agent-memory architecture: raw transcripts → memory notes → wiki representations → small injected context. An offline "**dreaming**" pass runs over logs and transcripts between sessions to validate notes against ground truth, build wiki pages, decide what to preload, and prune bloat. Key principles:
- **One writer per page** — concurrent agents overwriting a shared file lost data; assigning each entity its own page fixed it.
- **Validate notes against transcripts** — catches wrong notes (e.g. incorrect landmarks that led to failed routes).
- **Wiki + search > search alone** — fewer tokens, better recall.
- **Limit injected context** — long instruction files reduce adherence.

**Current harness state (verified 2026-11-21):**
- Per-cwd auto-memory lives at `~/.claude/projects/<encoded-cwd>/memory/MEMORY.md` (noted in CLAUDE.md line 11).
- `/memory-prune` exists as a Phase-2 pruner for cap management.
- `.harness-state/` carries receipts (`run-wave-*.yml`, `close-wave-*.yml`, `wave<N>-closed.md`); it's the structured session-state surface, but it's not a wiki.
- No "dreaming" / offline consolidation pass exists today. Promotion from per-cwd memory to `~/.claude/memory/feedback/` is manual by design (preserves per-cwd provenance per AGENTS.md).

**Overlap analysis** (why defer rather than apply):
- The "one writer per page" principle is already satisfied — `.harness-state/` writes are per-wave + per-skill + timestamped.
- The "wiki + search" pattern overlaps `docs/waves/<file>.md` (one page per subject with frontmatter + links).
- The "validate notes against transcripts" and "offline consolidation" ideas have NO existing analog, and would be new infrastructure.
- `/memory-prune` handles cap management but doesn't validate note correctness.

**Candidate shape (if it moves out of defer):**
- A `/dream` skill that runs between sessions over `.harness-state/` receipts + MEMORY.md + the last N session transcripts; outputs a short diff of proposed memory-note changes for human review (NOT auto-applied).
- Opt-in per-repo via `.harness-profile`.

**scope: speculative** on the whole § — no reported cross-session recall failure in the parking lot or wave receipts justifies building this now.

**Verify before applying:**
- `grep -nR "dream\|offline consolidat" skills/ docs/specs/` — if any landed work exists, adjust the §.
- Check `parking_lot.md` for any item tagged `[memory]` or `[recall]` indicating actual pain — none as of 2026-11-21.

**Recommended verdict:** defer until a concrete cross-session recall failure (either a wave write-up or a `/memory-prune` observation) makes the design pass worth running.
**Status:** PENDING — awaiting triage in PR review

---

## 7. Scan persistent context at session-start for injected instructions + plant canary strings

**Source:** https://www.anthropic.com/engineering/how-we-contain-claude (2026-05-25).

**What's new:** From the "Incidents and lessons" section — treat `CLAUDE.md`, memory, and workspace state as **re-entry points for prompt injection**, because those files reload every session. Anthropic recommends:
- Scanning persistent context at session start for anything that looks like an instruction aimed at the model (not the human).
- Planting canary strings in sensitive contexts to detect exfiltration attempts.
- Deferring loading of project config (hooks, settings, MCP definitions) until the user has accepted the trust prompt.

**Current harness state (verified 2026-11-21):**
- The repo has a global `PreToolUse` denylist hook (`.harness-state` + global git-hook dispatcher; see commit 5130b9d "feat(git-hooks): global dispatcher — secret scan, mass-delete block, profile gate").
- No session-start scanner for CLAUDE.md / MEMORY.md / `.harness-state/` injection patterns.
- No canary-string convention anywhere in the repo.
- The per-cwd auto-memory flows through `~/.claude/projects/<encoded-cwd>/memory/MEMORY.md` — a file Claude Code writes, not the user — but is not scanned before Claude reloads it.

**Why defer** (not reject):
- The harness is solo-maintained (`team.size: solo` per `.harness-profile`). The threat model Anthropic describes — phished-user injection, exfiltration through allowlisted domains — assumes network-enabled Claude. The harness has `/run-loop` and Second Brain `curl` calls as network surfaces but nothing that follows attacker-controlled links today.
- Adding a session-start scanner is the kind of "add architecture ahead of need" the maintainer convention explicitly asks reviewers to flag for `scope: speculative` rather than reject outright.
- Canary strings would require tooling to detect their egress, which is out of scope for a local-only harness.

**Candidate shape (if it moves out of defer):**
- Extend the global `SessionStart` hook (already in play via the hook dispatcher) with a grep for suspicious patterns in CLAUDE.md / MEMORY.md / `.harness-state/*.md` — e.g. "IMPORTANT: ignore previous", "run this command", imperative mood directed at the agent.
- Report findings without blocking; log to `.harness-state/injection-scan-<ts>.yml`.

**scope: speculative**.

**Verify before applying:**
- `grep -rn "SessionStart" ~/.claude/settings.json 2>/dev/null` — check whether a session-start hook is already configured.
- `grep -rn "canary\|injection.scan" skills/ docs/` — ensure nothing landed in a prior wave.
- Check `parking_lot.md` + the OpenAI-key parking item at line 11 — there's a real secret-exposure lesson already learned ("🔑 OpenAI API key exposed in ~/.claude/settings.json under the paperbanana MCP config"). That incident is a weak signal that this § may become actionable before "when there's a real incident."

**Recommended verdict:** defer until (a) the harness takes on an unattended `/run-loop` flow with network-touching tools, OR (b) a persistent-context injection incident is logged in parking_lot or a wave receipt.
**Status:** PENDING — awaiting triage in PR review

---

## 8. Attach safety-evaluation rubric guidance to the still-deferred 2026-04-19 §5 (agent evals)

**Source:** https://www.anthropic.com/engineering/building-strong-safety-evaluations (2026-11-13).

**What this post adds (relative to 2026-04-19 §5 and 2026-05-03 §1's BioMysteryBench attachment):**
- **Pair harmful prompts with matched benign prompts** in the same domain, to measure both harmful compliance AND over-refusal.
- **Construct validity**: refusal rate is often the wrong metric. Score "appropriate response" per domain with its own rubric — a model that refuses everything scores "safe" but is not safer.
- **Grader practices**: atomic yes/no criteria, length-bias check, flip pairwise option order, validate with Cohen's kappa against human labels, compare grader-human agreement to human-human agreement.
- **Sample sizes**: ~100 items floor for complex multi-turn evals; ~1,000 for simple single-turn.
- **Preregister** metrics, comparisons, slices, improvement thresholds.

**Current harness state (verified 2026-11-21):**
- 2026-04-19 §5 ("Formalize evals for the adversarial reviewers") is **still deferred** per `anthropic-reviews/reviewed-posts.md` row 26.
- 2026-05-03 §1 attached "human-solvable / human-difficult tier split" to that same deferred item as a design constraint.
- No eval fixtures exist in-repo for `code-reviewer` or `ui-evaluator` today (`ls skills/*/evals/` → only `planning-loop/evals` and `skill-creator/evals`).

**Concrete change** (bookkeeping only):
Update the `anthropic-reviews/reviewed-posts.md` row for 2026-04-19 §5 to note a third attachment: 2026-11-13's post's rubric guidance (benign counter-prompts, construct validity, grader practices). No code change; no new §.

Actually, since the convention is one row per post in the tracker and the design-constraint annotations attach to the §5 **when it's un-deferred**, the right move is to note this in the tracker's status column under the 2026-11-13 post itself (link back to 2026-04-19 §5). This § exists so the attachment is durable; future readers opening 2026-04-19 §5 should know to pull in these three posts.

**scope: speculative** — no action taken today; this is a pointer.

**Verify before applying:**
- `grep -n "2026-04-19 §5\|2026-05-03 §1" anthropic-reviews/reviewed-posts.md` — confirm both prior attachments are still present.
- When the §5 deferral is eventually picked up, load this §'s source URL into the design pass as prior art.

**Recommended verdict:** defer — bookkeeping on an existing deferral; no fresh action.
**Status:** PENDING — awaiting triage in PR review

---

## 9. Re-affirm "verification is the new bottleneck" framing in README

**Source:** https://claude.com/blog/running-an-ai-native-engineering-org — "Verification, code review, and security took their place" (as the bottleneck, once agents write the code).

**Current harness state (verified 2026-11-21):**
- `README.md` line 23 ("Why Not Superpowers / Heavy Skill Systems?") already builds the case that the harness's primary value is **adversarial verification**, not instruction scaffolding.
- `code-reviewer`, `ui-evaluator`, `planning-loop` + its arbiter chain, the Codex second-pass arbiter path, and `/commit`'s review-before-commit flow collectively ARE the verification stack.

**Reject reason:** The post's main insight ("verification is now the bottleneck") is already reflected in both the README's framing and in the architecture. Adding a one-sentence citation would be padding — the tracker entry for the post + a line in `anthropic-reviews/reviewed-posts.md` (relevant → §9) is the right durable record.

**Verify before applying:** (none — rejected)

**Recommended verdict:** reject — already fully reflected in the harness; citing it in README would be padding (per the "Anti-patterns to avoid: Don't pad" rule in `anthropic-reviews/README.md`).
**Status:** PENDING — awaiting triage in PR review

---

## Skipped (tracker-only)

The remaining posts in-window were not actionable. Tracker rows below carry the one-line reason; nothing was expanded into a §. Verdict column shows what the agent would have recommended if forced to write a §.

| Post | Date | Verdict if forced | Reason |
|---|---|---|---|
| Redesigning source control at Anthropic | 2026-10-13 | reject | Informational; Scion is Anthropic-internal. Patterns (sparse checkouts, server-side history) don't map onto a tooling repo's workflow. |
| Donating Agent Skills to the Agentic AI Foundation | 2026-10-22 | reject | Governance transfer; no changes to the SKILL.md format, licensing, or distribution. The repo's vendored `skill-creator` continues to work unchanged. |
| Anthropic Cyber Mission + OSS Scanner | 2026-10-08 | reject | OSS Scanner is a service for public repos; no local CLI/SDK surface. Revisit if Claude for Open Source ships a harness-invocable tool. |
| 2026 Usage Policy update | 2026-10-08 | reject | No coding-workflow changes. Explicitly: "page doesn't mention coding tools, security research, penetration testing, or dual-use code." |
| Anthropic IPO (close, pricing, roadshow, S-1) | Oct 26 – Nov 20 | reject | Four financial/governance news items; no harness surface. |
| GSA partnership expansion / Barclays / Singapore office / Christopher Stubbs LTBT / Public benefit fund / Economic scenarios / Situation Report (Ebola) / 2026 US midterms / Expanding Cyber Verification Program / AI for Science / Open call for guest investigators / Early progress on drug development / Genesis Mission commitment / Distillation defenses / Update on independent evaluators / Claude Frontier Academy | May–Nov | reject | Policy, geo, customer, and research-program announcements. No developer-tooling or coding-workflow surface. |

---

## Notes for the next routine run

- The 6-month backlog is cleared; the next run has a short window.
- 2026-04-19 §5 (agent evals) has now accumulated three attachments (2026-05-03, 2026-11-13, plus any future eval-methodology post). If a 4th lands, consider un-deferring and running `/spec-planner` directly — enough design constraints are on the table.
- Opus 5.5 / Sonnet 5.5 / Haiku 5.5 landed as three sibling posts; from Opus 5.5 onwards (2026-09-22), the Opus 4.7 anchor in the repo is formally stale. §1's spec'd work is the critical path.
