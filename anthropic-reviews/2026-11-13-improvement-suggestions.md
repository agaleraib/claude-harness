# Anthropic post review — 2026-11-13

First run after a 6-month gap (last tracker entry: 2026-05-10). In-scope period: 2026-05-11 → 2026-11-13, capped at 15 posts per the routine spec. Four posts produced suggestions; 11 are logged in the tracker with skip reasons.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Refresh `.harness-profile` model pin from Opus 4.7 → Opus 5.5 (+ consider new-project-init defaults) | apply (own profile) · spec (project-init defaults) | Opus 5.5 is the current daily-driver recommendation; Fable 5.2 is the new frontier tier. The own-repo edit is trivial; the multi-file default change touches project-init + wave 1 spec references. |
| 2 | Adopt "dreaming pass" + "verification markers" from *The components of agent memory* | spec | Both patterns are compatible with existing memory conventions but introduce new mechanisms (transcript review, confirmed/unconfirmed tagging) that need design before code. |
| 3 | *Harness design for long-running application development* (Mar 24) — bookkeeping re-affirm | defer | Generator / evaluator / planner split already exists in the harness's agent set; the post adds nothing concrete that isn't already present or deferred. |
| 4 | *How we contain Claude across products* (May 25) — bookkeeping re-affirm of sandcastle + worktree safeguards | defer | AGENTS.md §Loop protocol Safety guardrails already encodes deny-by-default egress, write-root confinement, catastrophic-command denylist hook, and task-scoped credential injection. Worth citing as evidence, but no mechanism change. |

---

## 1. Refresh model pin from Opus 4.7 → Opus 5.5 (and reconsider new-project defaults)

**Source:** https://www.anthropic.com/news/claude-fable-and-mythos-5-2 (2026-11-09).

**Finding.** The post positions the Claude 5 family as the current generation: Fable 5.2 (`claude-fable-5-2`) is "best for the most ambitious, open-ended technical work" and Mythos 5.2 is gated to the Cyber and Life Sciences Verification Programs. For general coding and knowledge tasks, Anthropic **explicitly recommends Claude Opus 5.5 as the daily driver**. This repo's `.harness-profile` still pins `primary: claude-opus-4-7` and `fallback: claude-sonnet-4-6` (set 2026-04-11), unchanged across the 6-month gap since the last routine run. Current remote-session identity for this very run is also `claude-opus-4-7`, confirming the pin is live, not ornamental.

**Decomposition.**

- **§1a — Own-repo pin.** Edit `.harness-profile` only; swap `primary: claude-opus-4-7` → `primary: claude-opus-5-5` and promote the old primary to fallback: `fallback: claude-opus-4-7` (retire the Sonnet 4.6 fallback — the Claude 5 family's size-match for Opus 5.5 is Sonnet 5.5). Update the comment on L26 to reference this post instead of the 2026-04-23 postmortem. One file, one commit — trivial, routable to `/micro`.
- **§1b — `project-init` defaults.** `skills/project-init/SKILL.md` L153/154/207/208 bakes `claude-opus-4-7` and `claude-sonnet-4-6` as defaults for every new project the harness scaffolds. `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md` references the same defaults as acceptance-criteria verification commands (L139/L150/L225/L233/L234), and the corresponding closed wave `docs/waves/wave1-harness-model-pin-profile-schema.md` has the fixture values hard-coded. This spans 4 files; the spec's acceptance-check lines are especially delicate because `yq '.model.primary' .harness-profile` returning the old ID is codified as the "PASS" condition. Substantive — needs a spec pass to decide whether to bump defaults repo-wide or add a dated migration note.

**Expected payoff.**

- §1a: the orchestrator dispatches to Opus 5.5 for own-repo work, consistent with Anthropic's own recommendation. Removes the stalest cross-reference in the profile.
- §1b: new projects scaffolded from this harness pick up Claude 5 defaults automatically, reducing the drift between the methodology's advertised model tier and what Anthropic ships.

**Concrete diff (§1a — trivial edit, ready for `/micro`).**

```yaml
# .harness-profile
# Aligned with Anthropic's 2026-11-09 Claude Fable 5.2 / Mythos 5.2 announcement
# (Opus 5.5 recommended as daily driver for general coding/knowledge tasks).
model:
  primary: claude-opus-5-5
  fallback: claude-opus-4-7        # previous primary; kept as safety net
  effort_default: xhigh            # unchanged
```

**Verify before applying:** `grep -n 'claude-opus-4-7' .harness-profile` — if the primary line already reads `claude-opus-5-5`, the §1a edit has already been applied. `grep -rn 'claude-opus-4-7' skills/project-init/SKILL.md docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md docs/waves/wave1-harness-model-pin-profile-schema.md` — if these also read the new ID, §1b has already been applied (or the spec was re-cut to decouple the defaults from the SKILL.md).

**Recommended verdict:** apply (§1a — own-repo pin) · spec (§1b — project-init defaults). Rationale: §1a is a single-file, reversible edit against stale text whose author (Anthropic) now recommends a newer model. §1b touches a wave-1 acceptance spec and its closed-wave receipt, so it needs a spec pass to decide the migration shape (bump in place vs. new spec that parks the old defaults as a legacy fallback path).

**Status:** PENDING — awaiting triage in PR review

---

## 2. Adopt "dreaming pass" + "verification markers" from *The components of agent memory*

**Source:** https://www.anthropic.com/research/components-of-agent-memory (2026-11-06).

**Finding.** The post codifies five agent-memory categories (transcripts, notes, consolidated representations, injected context, excluded) and surfaces concrete patterns, several of which are new vs. this repo's current `~/.claude/memory/` design:

1. **Offline "dreaming" pass** — a scheduled post-session review of the transcript that *corrects wrong notes, merges duplicates, verifies claims against sources, and repairs dangling links*. This is **not** cap management (which `/memory-prune` already handles); it is a correctness pass.
2. **Verification markers** — in the CL-Bench task, consolidated notes carried a per-fact `confirmed` / `unconfirmed` tag, so later sessions could tell which beliefs were load-bearing vs. provisional.
3. **Record the basis for rules** — store a rule together with the evidence that justified it ("verified by X" / "observed in session Y"), not just the rule itself.
4. **Single-writer-per-page** for shared memory files, to prevent parallel-agent overwrites.

**Overlap with what's already in place.**

- (1) is novel. `/memory-prune` is a size-cap enforcer with archival semantics (`skills/memory-prune/lib/prune.sh`). It does not read transcripts, does not verify facts, does not repair links. `/session-end` captures state-of-play into Second Brain but does not revisit prior memory entries for correctness.
- (2) is novel. FEEDBACK.md and the per-tool auto-memory directory don't carry a `confirmed/unconfirmed` axis today.
- (3) is partially present. AGENTS.md L66 ("`~/.claude/memory/feedback/` — per-pattern detail files referenced from FEEDBACK.md") lets a feedback entry link out to a detail file, but there's no convention that the detail file must include the originating evidence/session. Operator discipline only.
- (4) is already implicit — FEEDBACK.md is `/memory-prune`-written + human-written per AGENTS.md L61; the shared root is read-only to sessions per L69. Still, formalizing the single-writer contract for the per-pattern detail files (where sessions *do* write) would close the gap.

**Expected payoff.** Memory promoted from per-cwd auto-memory into the shared root currently inherits whatever confidence level it had at capture time — including "the agent believed it once." A verified/unverified axis lets `/session-start` surface high-confidence entries first, and a dreaming pass catches drift (e.g., a note whose linked file was renamed). Both reduce the "an incorrect note can be carried into every session" failure mode the post explicitly calls out.

**Concrete sketch (needs spec pass).**

```
skills/memory-review/SKILL.md     # new: the dreaming pass
  - reads .harness-state/transcripts/<session-id>.jsonl (if present)
  - reads ~/.claude/memory/feedback/*.md
  - proposes per-file diffs: facts to confirm, duplicates to merge,
    dangling links to repair
  - writes nothing without operator approval (dry-run by default,
    `--apply` to commit, same pattern as memory-prune)
  - emits a receipt at .harness-state/memory-review-<utc-iso>.yml
~/.claude/memory/feedback/<slug>.md  # frontmatter extension:
  ---
  confidence: confirmed | unconfirmed | contested
  verified-by: [session-id | commit-sha | url]
  ---
```

**Scope: speculative** on the exact schema — the post gives no canonical frontmatter shape, and the harness's existing `originCwd:` / `originSessionId:` frontmatter (AGENTS.md L77) would need to be composed with the new fields rather than replaced.

**Verify before applying:** `ls skills/memory-review/ 2>/dev/null; grep -l 'confidence:' ~/.claude/memory/feedback/*.md 2>/dev/null` — if either exists, the pattern has shipped. Also re-read AGENTS.md §Memory first; the memory protocol is the authoritative constraint and may have moved.

**Recommended verdict:** spec — the two patterns (dreaming pass + verification markers) are compatible with existing conventions but (a) introduce a new skill, (b) extend FEEDBACK.md's frontmatter schema, and (c) interact with `/memory-prune`'s archival semantics. Route through `/spec-planner` to decide the composition before writing any code. Plan on carrying `/memory-prune`'s dry-run + receipt + journal pattern over to the new skill.

**Status:** PENDING — awaiting triage in PR review

---

## 3. *Harness design for long-running application development* — re-affirms existing agent split

**Source:** https://www.anthropic.com/research/harness-design-long-running-apps (2026-03-24, missed in prior tracker runs).

**Finding.** The post describes the generator / evaluator / planner trio — a planner expands a short prompt into a spec, a generator writes code, an evaluator drives the running app via Playwright and grades against a rubric. The generator's "sprint contract" (negotiate 'done' and how to verify it before coding) is the one potentially-new mechanism.

**What's already in place.**

- The harness exposes four matching agent types in the `Agent` tool listing: `generator`, `spec-planner`, `ui-evaluator` (Playwright-driven, adversarial, scores against `criteria/` rubrics), `orchestrator` (runtime dispatcher). `.claude/agents/generator.md` already exists.
- The spec-planner → spec → run-wave → close-wave flow (AGENTS.md §Plan & spec grammar + §How to discover next action) is a 1:1 analogue of the planner → spec → generator → evaluator loop in the post, with the wave acceptance criteria playing the role of the "sprint contract."
- The post's advice to "remove context resets once compaction handles it" aligns with the harness's reliance on Claude Code's auto-compaction rather than explicit resets.

**The one gap worth noting.** The post makes the sprint-contract **negotiation** (generator proposes 'done', evaluator reviews before coding starts) explicit as an in-session back-and-forth. The harness today treats spec acceptance criteria as **set by the spec-planner before dispatch** — the generator doesn't propose a contract per task. Adding a generator-side "here's my interpretation of done, is this what you meant?" turn before starting work could reduce misfires, but it's a non-trivial addition to the loop sequence, not a trivial patch.

**Verify before applying:** `grep -n "sprint contract\|contract negotiation\|interpretation of done" .claude/agents/generator.md AGENTS.md skills/spec-planner/SKILL.md 2>/dev/null` — if present, the pattern has been imported. Also check whether F-037..F-039 (Wave 25, acceptance-strictness discipline — see `git log --oneline | grep -i acceptance`) already covers the same concern from the planner side.

**Recommended verdict:** defer — the harness already has the structural pieces the post recommends; the one genuinely-new idea (per-task contract negotiation) is an additive refinement, not a correctness fix. Revisit if a future post-mortem traces a wave failure to "generator misread acceptance criteria."

**Status:** PENDING — awaiting triage in PR review

---

## 4. *How we contain Claude across products* — re-affirms existing sandcastle + worktree safeguards

**Source:** https://www.anthropic.com/research/how-we-contain-claude (2026-05-25).

**Finding.** The post's thesis — "agent risk ≈ failure × blast radius; shrink blast radius through environment-layer containment" — maps 1:1 onto the harness's AGENTS.md §Loop protocol Safety guardrails. Specifically, every bolded design recommendation in the post has an existing analogue in this repo:

| Post recommendation | Harness location |
|---|---|
| Deny-by-default network egress; writes workspace-only | AGENTS.md L113 ("default-deny outbound egress", "writes to an explicit set of roots") |
| Enforcement outside the agent's reach | AGENTS.md L113 (catastrophic-command denylist is a `PreToolUse` hook; CLAUDE.md §Loop protocol notes the hook is installed in global `~/.claude/settings.json`, not from a session) |
| Credential isolation | AGENTS.md L113 ("task-scoped credential injection (only the item's declared secrets, never the whole environment)") |
| Prefer mature primitives (containers) | AGENTS.md L107 (sandcastle runner default; worktree is the opt-out that carries extra guardrails) |
| Fail closed on misconfigured gates | AGENTS.md L105 ("misconfigured gate fails closed → escalate"; "a gate that fails OPEN is worse than no gate") |
| Trust-gated startup | `skills/project-init` and `setup-harness` both gate on operator approval before hook installation |

The post **does** surface a few patterns the harness doesn't explicitly encode:

- "Validate symlinks before path checks, not after."
- "Inspect tool outputs before they enter context, using a small, fast classifier if needed."
- "Canary strings in sensitive content can reveal when injected payloads are being read."

These are niche and would need concrete trigger evidence (a near-miss involving a symlink shim, say) to justify adding to the guardrails list. Flagging here so a future routine run can cross-reference if such evidence lands.

**Verify before applying:** `grep -n "symlink\|canary\|classifier" AGENTS.md skills/*/SKILL.md 2>/dev/null` — if any of the three terms show up in the guardrails sections, the gap has already been closed.

**Recommended verdict:** defer — the harness's existing guardrails already cover the post's load-bearing recommendations; cite this URL as evidence in a later README "why these safeguards" bullet (same shape as the Apr-23 postmortem citation) if that section is ever restructured. Don't ship the symlink/canary/classifier additions on this post alone — wait for incident evidence.

**Status:** PENDING — awaiting triage in PR review

---

## Posts logged as skipped this run

Reasons captured in `anthropic-reviews/reviewed-posts.md` (same row timestamp as this file). Short version:

- IPO roadshow, S-1 filing, public benefit fund, independent evaluators update, Singapore office, Christopher Stubbs LTBT — corporate / finance / personnel / policy; no harness surface.
- AI for Science expansion, early drug-development progress, open call for guest investigators, Cyber Mission, distillation defenses — frontier science / safety research; no coding-harness surface.
- GSA partnership, Preparing for 2026 US midterms, 2026 Usage Policy update — gov / policy; no mechanism change for a coding harness (the Usage Policy update's agentic-coding section was reviewed separately — no new rules affect this repo's current permissions model).
- Redesigning source control at Anthropic (Oct 13) — Scion is an internal replacement for git in Anthropic's monorepo; the post itself says Scion is not a general git replacement. Transferable ideas (intent-focused review, risk-classified diffs, post-merge testing over heavy pre-merge gating) are low-signal relative to the harness's existing `/code-reviewer` + wave-gate flow.
- Donating Agent Skills to the Agentic AI Foundation (Oct 22) — governance only; the spec (SKILL.md frontmatter, discovery, progressive disclosure, triggers) is explicitly unchanged.
- Building a C compiler with a team of parallel Claudes (2026-02-05) — parallel-agent coordination via `current_tasks/` lock files. The harness's atomic-merge serial lane (AGENTS.md L102–105) covers the same concern via per-item claim + fast-forward-only merge, so the `current_tasks/` convention would duplicate an existing mechanism.
- Quantifying infrastructure noise in agentic coding evals (2026-02-05) — resource-reservation guidance for eval authors. The harness defers test-gate semantics to the target repo (`.harness-profile` reads `tests`/`typecheck`/`verify` from the target), so infra-noise mitigation belongs in the target's CI config, not here.
