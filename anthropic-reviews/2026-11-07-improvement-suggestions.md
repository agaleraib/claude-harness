# Anthropic review — 2026-11-07

Coverage window: 2026-05-11 → 2026-11-07 (long gap since the previous run on 2026-05-10). Capped at 15 posts per routine policy; seven produced relevant §s, eight were skipped with a one-line reason in the tracker.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Agent-memory architecture (transcripts / notes / wiki / injected + "dreaming") | spec | Substantive — overlaps existing shared-root but adds consolidation and wiki layer |
| 2 | Reconsider orchestrator-plus-generator for small waves | defer | Pattern is load-bearing in `run-wave` today; defer until we see context-bloat evidence |
| 3 | Lift `/verify` and loop-type vocabulary from verification-loops + loop-engineering posts | apply | One sentence each in `skills/commit/SKILL.md` + `skills/run-loop/SKILL.md`; small, high-leverage |
| 4 | Context-engineering 80% prompt cut — audit AGENTS.md / CLAUDE.md for lift-not-needed instructions | spec | AGENTS.md is big; a prune pass is substantive and needs measurement, not a one-shot edit |
| 5 | Containment: deny-list sensitive host paths in `.claude/settings.json` + a note in setup-harness | apply | Low-risk defensive change; aligns with Anthropic's own containment recommendations |
| 6 | Update `.harness-profile` model pins to Opus 5.5 + Sonnet 5.5 (`claude-opus-5-5`, `claude-sonnet-5-5`) | apply | Current pins (`claude-opus-4-7`, `claude-sonnet-4-6`) are two generations behind as of 2026-09 |
| 7 | Adopt new Claude Code permission knobs: `blockWritesOutsideWorkingDirectories` + `denyInsteadOfPrompting` | apply | Tiny settings.json patch; both directly useful for a solo harness that sometimes runs unattended |

---

## 1. Agent-memory architecture — transcripts / notes / wiki / injected, plus "dreaming" consolidation

**Source:** [The components of agent memory](https://www.anthropic.com/research/components-of-agent-memory) (Anthropic research, 2026-11-06).

**Thesis.** Agent memory works best when it is layered: searchable transcripts at the bottom, short per-session notes above them, a wiki or per-entity set of files above that, and a very small always-loaded index at the top. Consolidation ("dreaming") is a scheduled offline pass that reads transcripts + notes and promotes salient things upward, merges duplicates, prunes stale wiki pages, and fixes dangling links. Anthropic found: (a) explaining the *purpose* of memory beats prescribing procedure for strong models; (b) one file per entity preserved 57/57 graded facts where a shared table lost 16; (c) wiki+search (61%) beat search alone (53%) and wiki alone (48%); (d) Claude Code already loads only the first 200 lines or 25 KB of `MEMORY.md` as an index.

**Where the harness already aligns.** The shared-root protocol in `AGENTS.md ##Memory` already uses one file per entity (`USER.md`, `FEEDBACK.md`, `REFERENCES.md`, `PROJECTS.md`) and keeps a hard cap on each; the per-cwd auto-memory + manual promotion to `~/.claude/memory/feedback/<slug>.md` stamps provenance (`originCwd:` / `originSessionId:`) exactly as the "record provenance and verification status" recommendation asks. These are already in place — do not re-suggest.

**What is not in place.** Three gaps:

- **No scheduled consolidation pass.** `/memory-prune` is the manual trim, but there's no offline pass that reads transcripts and corrects memory notes against them, and no dangling-link check across the shared root. The post frames this as the central reason memory doesn't rot.
- **No explicit wiki layer.** `~/.claude/memory/feedback/<slug>.md` files exist, but there's no hyperlinked index with link-integrity checks — just an append-only `FEEDBACK.md` index.
- **No `provenance` / `verification-status` schema in the per-cwd auto-memory layer.** Per-cwd `MEMORY.md` writes aren't shape-constrained today, so the "state the rule + how we know it's true + known traps" structure is not enforced before promotion.

**Concrete change sketch (do not treat as a drop-in diff — this is substantive enough to warrant a spec):**

- Add a `/memory-dream` (or `/memory-consolidate`) skill that runs on an operator-chosen cadence (not a hook — operator-initiated only, to stay within AGENTS.md's "promotion is manual by design"). It would walk the most-recent per-cwd auto-memory diff + session transcripts and write a `.harness-state/memory-consolidation-<timestamp>.yml` receipt proposing: merges, promotions, prunes, broken links. The operator applies or rejects.
- Add an optional `provenance:` + `verified:` YAML frontmatter block on feedback files, stamped by `/memory-prune` at promotion time (not required on auto-memory writes).
- Tighten AGENTS.md to cite the 200-line / 25 KB index-only rule for any new always-loaded file — this guardrail is implicit today.

**Scope:** speculative on the consolidation half; the provenance frontmatter half is ordinary.

**Expected payoff.** Durability of promoted memory grows as the shared root ages. Right now `FEEDBACK.md` + `feedback/` is append-only with no sweep, so stale patterns can outlive their truth.

**Verify before applying:** `grep -rni "consolidat\|dream\|offline-pass" skills/memory-prune/SKILL.md AGENTS.md` and `ls ~/.claude/memory/feedback/ 2>/dev/null | head` — if either turns up an existing consolidation pass or broken-link checker, drop the first bullet; if an automated sweep gets added before this ships, this whole § becomes moot.

**Recommended verdict:** spec — the consolidation piece is a new mechanism (receipt schema + skill + operator cadence) that needs design before any code.
**Status:** PENDING — awaiting triage in PR review

---

## 2. Reconsider orchestrator-plus-generator for small waves

**Source:** [Building agents: When to fold subagents into your main agent loop](https://claude.com/resources/articles/building-agents-when-to-fold-subagents-into-your-main-agent-loop) (claude.com, 2026-10-22).

**Thesis.** Most enterprise multi-agent setups work better as a single model loop with progressively disclosed skills and tools. Subagents justify themselves only when: (a) a single loop shows measurable degradation from context bloat; (b) parallel tasks need fresh, discardable context; or (c) the agent is tripping over tool-choice or conflicting system-prompt instructions. The post argues "an architecture that mirrors the org chart" is an anti-pattern and so are "lossy summary handoffs between agents."

**Where the harness uses subagents today.** `skills/run-wave/SKILL.md:351` dispatches `subagent_type: "orchestrator"`, which then runs tasks (and may further dispatch `generator`-shape work). This is fine for substantive waves — the orchestrator holds the exit-gate, protects the parent session from the task's noisy tool output, and runs in an isolated worktree. But for micro-waves (one bullet, two files) the dispatch-to-subagent cost may exceed the context-cleanliness benefit.

**What this post does NOT say.** It does not argue to drop subagents for isolation-via-worktree work, which is the main value `run-wave` extracts from its orchestrator subagent — the subagent boundary is also the sandbox boundary. The critique is specifically about "specialist" subagents that pass summaries to a coordinator (planner → generator → evaluator telephone-game). The harness's current planner/generator/evaluator wording appears in docs/spec vocabulary and in `/planning-loop` (which is a different pattern than run-wave's dispatch).

**Concrete change sketch (no immediate edit — just a tripwire):**

- When maintainer-side evidence surfaces that `run-wave` orchestrator-dispatch for a one-bullet wave was net-negative (e.g. an orchestrator receipt shows one trivial Edit + no tool noise that would have polluted the parent), add a `/micro-wave` option that runs inline in the parent session with the same exit gate but no worktree dispatch. Until that evidence exists, the current path is fine.
- Audit `skills/_shared/loop/` for any "specialist subagent chain" shape (critique agent → generator agent → evaluator agent) that fits the anti-pattern. First-pass grep below shows the loop engine's dispatch is single-runner, not a chain — so this risk may already be absent.

**Scope:** speculative — this is a "look again when" item, not a fix.

**Expected payoff.** Avoid a future refactor that mistakenly scales a one-size-fits-all orchestrator pattern into every skill.

**Verify before applying:** `grep -rn "subagent_type\|Agent(" skills/ --include="*.md" --include="*.ts" | grep -v "^#"` — if the harness grows a new specialist-subagent chain (generator → evaluator → verifier passing summaries) before this is revisited, upgrade to apply; today the only dispatch is the orchestrator from run-wave.

**Recommended verdict:** defer until context-bloat evidence from an orchestrator receipt shows a one-bullet wave dispatch was net-negative.
**Status:** PENDING — awaiting triage in PR review

---

## 3. Lift the `/verify` built-in + loop-type vocabulary from the verification-loops and loop-engineering posts

**Source:**
- [Building verification loops in Claude Code with skills](https://claude.com/blog/building-verification-loops-in-claude-code-with-skills) (claude.com, 2026-07-22).
- [Loop engineering: Getting started with loops](https://claude.com/blog/getting-started-with-loops) (claude.com, 2026-06-30).

**Thesis (combined).** (a) Manual follow-up checks you repeat should become SKILL.md files with `allowed-tools:` frontmatter and get chained into other skills via wrapper skills (e.g. `safe-refactor` calls `/simplify` then `/verify-no-public-api-changes`). (b) Loops split into four types by trigger + stop condition: **turn-based** (user → model-decides-done), **goal-based** (`/goal`, success criterion + turn cap), **time-based** (`/loop`, `/schedule`), and **proactive** (event- or schedule-triggered, runs until turned off).

**Where the harness already aligns.** `/commit`, `/code-review`, `/simplify`, `/run-loop` all exist. Verification-via-skills is the pattern the harness ships. The tracker already captured the `/loop` skill and `code-review` on 2026-05-10 and before.

**What's missing.** The two posts add two small useful vocab items the harness could cite without new mechanisms:

- `/verify` as a **built-in** verification skill the posts repeatedly name — Claude Code ships this; the harness's `/commit` skill doesn't mention it. Users dropping into the harness may reach for `/verify` by muscle memory from reading these Anthropic posts; a one-line pointer in `skills/commit/SKILL.md` ("For single-check verification outside a commit, `/verify` is Claude Code's built-in; use it when the check isn't tied to a committed change") costs nothing and reduces friction.
- The four loop-type taxonomy aligns with `/run-loop`'s existing modes (wave-source = goal-based, issue-source = proactive). Citing the taxonomy at the top of `skills/run-loop/SKILL.md` ties the skill to Anthropic's own vocabulary and makes the mental model portable.

**Concrete diff (small):**

```
# skills/commit/SKILL.md — add under any existing "see also" or "related" block
Related: Claude Code's built-in `/verify` runs a one-shot verification without a commit
(see https://claude.com/blog/building-verification-loops-in-claude-code-with-skills).
`/commit` is the right choice when verification is tied to a committed change.
```

```
# skills/run-loop/SKILL.md — add one line to the opening summary
This skill implements the "goal-based" (wave-source) and "proactive" (issue-source) loop
types from https://claude.com/blog/getting-started-with-loops.
```

**Scope:** ordinary.

**Expected payoff.** Harness vocabulary matches Anthropic's; muscle-memory `/verify` calls from external readers land on a useful pointer instead of a dead-end.

**Verify before applying:** `grep -n "/verify\|verification loops\|loop types\|goal-based\|turn-based" skills/commit/SKILL.md skills/run-loop/SKILL.md` — if either file already references the posts, drop the corresponding bullet.

**Recommended verdict:** apply — two one-line docs edits, low risk, improves portability of harness vocabulary.
**Status:** PENDING — awaiting triage in PR review

---

## 4. Context-engineering 80% prompt cut — audit AGENTS.md / CLAUDE.md for "lift-not-needed" instructions

**Source:** [The new rules of context engineering for Claude 5 generation models](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models) (claude.com, 2026-07-24).

**Thesis.** For Claude 5-generation models, Anthropic deleted more than 80% of Claude Code's system prompt (reportedly ~800 → ~164 tokens) and saw no measurable regression on internal coding evals. The guidance: fewer prescriptive rules, more judgment-based instructions, and context loaded on demand via skills or tools rather than baked into the always-loaded system prompt. Repeated examples and prescriptive procedures were cut.

**Where the harness today sits.** `AGENTS.md` is big — several KB of protocol, numbering grammar, loop definitions, memory conventions, and cross-surface consumption rules — and it is read on every session start. `CLAUDE.md` is thin (delegates to AGENTS.md). The harness already respects prefix-stability (per the 2026-05-05 §1 guardrail added from the prompt-caching post), which is about *stability* across sessions. This post is about *volume* loaded into one session. The two concerns are orthogonal.

**Why this is non-trivial.** AGENTS.md's grammar isn't decorative — it encodes the Wave/Phase/Task ladder, the receipt schema pointer, and the shared-memory contract. Blindly pruning it would regress adherence on specifically the things it was written for. But the post's core move (cut repeated examples and detailed procedure in favor of judgment-based instructions pointing at skills) could plausibly shrink AGENTS.md meaningfully, since many of its sections duplicate what individual SKILL.md files already say.

**Concrete change sketch (substantive — this is a spec, not a diff):**

- Pass A: inventory AGENTS.md by section. For each section, is the detail load-bearing on every turn (the Wave/Phase ladder, the plan.md grammar, the memory contract) or lift-not-needed (procedural examples, cross-surface Desktop-Project drag instructions that only matter during `/new-cowork`)?
- Pass B: move lift-not-needed sections into the owning SKILL.md and leave a one-line pointer in AGENTS.md.
- Pass C: measure — compare before/after token count of the always-loaded context; also run `/code-review` + `/commit` on a sample change to confirm adherence didn't regress.

**Scope:** substantive, speculative — the harness is this methodology's canonical reader, so a bad cut is expensive.

**Expected payoff.** Smaller always-loaded context on every session; less competition with per-skill instructions; aligns the harness's own methodology with the model generation it currently targets (Opus 4.7, moving to Opus 5.5 per §6).

**Verify before applying:** `wc -c AGENTS.md CLAUDE.md` and `grep -c "^#\|^##\|^###" AGENTS.md` — if either file has already been trimmed below ~3 KB total (or if a separate "audit AGENTS.md for prompt-volume" spec has been written), drop or scope-down this suggestion.

**Recommended verdict:** spec — needs an audit methodology (what counts as "lift-not-needed") and a token-count baseline before any prune.
**Status:** PENDING — awaiting triage in PR review

---

## 5. Containment: deny-list sensitive host paths in `.claude/settings.json` + note in setup-harness

**Source:** [How we contain Claude across products](https://www.anthropic.com/research/how-we-contain-claude) (Anthropic research, 2026-05-25).

**Thesis.** Agent safety comes from capping blast radius at the environment layer, not from the model behaving. Deterministic sandbox boundaries (gVisor containers, Seatbelt, bubblewrap) hold when probabilistic approval checks miss. Specific recommendations: default to no network egress; deny credential paths like `~/.aws`, `~/.ssh`; resolve symlinks before path validation; treat allowlisted domains as capability grants (an API domain can also upload to an attacker's account); validate persistent CLAUDE.md / memory at session start as a potential injection vector. Anthropic's own Claude Code uses Seatbelt / bubblewrap and cut permission prompts by 84%.

**Where the harness today sits.** `.claude/settings.json` contains only `{"hooks": {}}` — no permission rules at all. The harness distributes to target projects via `setup-harness`, which symlinks skills in. Target projects inherit whatever permissions their own `.claude/` has. The harness itself runs in cloud sessions (as now) where the container is ephemeral, but target-project installs land on the user's own machine.

**Concrete diff:**

```json
# .claude/settings.json — replace the current empty hooks stub with:
{
  "hooks": {},
  "permissions": {
    "deny": [
      "Read(~/.aws/**)",
      "Read(~/.ssh/**)",
      "Read(~/.config/gh/**)",
      "Read(~/.docker/config.json)",
      "Read(~/.netrc)",
      "Write(~/.aws/**)",
      "Write(~/.ssh/**)"
    ]
  }
}
```

Plus one paragraph appended to `skills/setup-harness/SKILL.md` noting that target projects installing from the harness inherit this deny list via symlink or copy (whichever setup-harness uses) and that operators who deliberately need credential-path access must override in `~/.claude/settings.json` (user-level), not in the harness's project-level file.

**Caveats to check before applying:**

- Target-project `.claude/settings.json` conflicts: if a consumer project already has a `permissions` block, merging rules is a separate concern — the suggestion is for the harness's own `.claude/settings.json` plus a documented note, not a blanket overwrite in consumer projects.
- Symlink resolution: Claude Code resolves symlinks before matching deny patterns (per 2.1.x releases); these patterns are path-glob and should match post-resolution.

**Scope:** ordinary.

**Expected payoff.** Zero-config defensive default when running the harness anywhere a credential file could be reached — including unattended `/run-loop` and routine runs like this one. The user's MFA / cloud credentials become uncallable from a skill or Bash call that didn't need them.

**Verify before applying:** `cat .claude/settings.json` — if `permissions.deny` already lists `~/.aws` or `~/.ssh`, drop the §; if it has an entirely different permissions schema (settings.local.json overrides, teammate rules), re-scope the diff to merge instead of replace.

**Recommended verdict:** apply — tiny settings patch; aligns with Anthropic's containment recommendations; no runtime cost.
**Status:** PENDING — awaiting triage in PR review

---

## 6. Update `.harness-profile` model pins to Opus 5.5 + Sonnet 5.5

**Source:**
- [Introducing Claude Opus 5.5](https://www.anthropic.com/claude-opus-5-5) (2026-09-22).
- [Introducing Claude Sonnet 5.5](https://www.anthropic.com/claude-sonnet-5-5) (2026-09-28).

**Thesis.** Opus 5.5 (`claude-opus-5-5`) landed 2026-09-22; Sonnet 5.5 (`claude-sonnet-5-5`) landed 2026-09-28. Opus 5.5 is reported ~40% cheaper and ~30% faster than Opus 5 on typical workloads; benchmarks show large gains on long-horizon work (Terminal-Bench 4.0 66.4% vs Opus 5 52.3%, CursorBench 4.0 57.8% vs 46.6%, OSWorld 2.1 81.8% partial vs 74.0%). As of today (2026-11-07), Opus 4.7 and Sonnet 4.6 are two generations behind.

**Where the harness today sits.** `.harness-profile` pins:

```yaml
model:
  primary: claude-opus-4-7
  fallback: claude-sonnet-4-6
```

The system-prompt-level fallback (visible in this session's own system block) already lists `claude-opus-5-5[1m]` and `claude-opus-5[1m]` as runtime fallbacks, so the serving model may already upgrade, but the profile — which drives the orchestrator and documentation — has not been refreshed.

**Concrete diff:**

```yaml
# .harness-profile — model section only
model:
  primary: claude-opus-5-5
  fallback: claude-sonnet-5-5
  effort_default: xhigh   # unchanged — still derived from stakes.level: medium
  effort_cost_multiplier: {}   # unchanged
```

Also update the comment line that cites "Anthropic's 2026-04-23 postmortem (Claude Code defaults Opus-4.7 users to xhigh)" — the postmortem is about Opus-4.7; a refreshed comment should either note the pin is now 5.5 (and whether 5.5 has a published default-effort note to cite instead) or keep the 4.7 cite with a one-line rationale for carrying it forward.

**Caveats:**

- Verify the 5.5 model IDs against a primary source (the two linked Anthropic pages) before changing — the search summaries above gave `claude-opus-5-5` from the official page but the Sonnet 5.5 ID is inferred from the launch convention, not independently checked.
- If any other file hardcodes `claude-opus-4-7` or `claude-sonnet-4-6` (e.g. a skill docstring, a receipt example), update those in the same commit.

**Scope:** ordinary.

**Expected payoff.** Harness documentation and orchestrator-effort derivation match the models operators are actually targeting.

**Verify before applying:**
- `grep -rn "claude-opus-4-7\|claude-sonnet-4-6" .harness-profile skills/ docs/ --include="*.md" --include="*.yml"` — pick up every site that would need the same swap, not just the profile.
- `curl -s https://www.anthropic.com/claude-opus-5-5 | grep -oE 'claude-opus-[0-9]+-[0-9]+' | head -3` (or a WebFetch equivalent) to pin the exact serving ID of Opus 5.5, and the same for Sonnet 5.5, before the Edit — the search summaries reported `claude-opus-5-5` but did not independently verify `claude-sonnet-5-5`.

**Recommended verdict:** apply — one-file YAML edit with well-documented replacement; verify model IDs against the primary source first.
**Status:** PENDING — awaiting triage in PR review

---

## 7. Adopt new Claude Code permission knobs: `blockWritesOutsideWorkingDirectories` + `denyInsteadOfPrompting`

**Source:** Claude Code CHANGELOG — [v2.1.314 and v2.1.319](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md).

**Thesis.** Two permission knobs shipped between the last tracked release (v2.1.126) and today:

- **v2.1.314** added `permissions.blockWritesOutsideWorkingDirectories` for Write, Edit, and NotebookEdit — hard refuse any file write whose target path isn't under a working directory.
- **v2.1.319** added `permissions.denyInsteadOfPrompting`, which denies a call that would otherwise block on a permission prompt in a terminal session, a subagent, or on a teammate.

Both are specifically designed for unattended runs (routines, loops, cloud sessions) where a stuck prompt means the whole run stalls.

**Where the harness today sits.** `.claude/settings.json` is `{"hooks": {}}`. The harness runs unattended in exactly the shape these two knobs were written for: this very routine fires on a schedule with no human watching, and `/run-loop` goes further with multi-item unattended batches.

**Concrete diff (builds on §5's deny list — same file):**

```json
# .claude/settings.json — include with the §5 permissions.deny block
{
  "hooks": {},
  "permissions": {
    "blockWritesOutsideWorkingDirectories": true,
    "denyInsteadOfPrompting": true,
    "deny": [
      "Read(~/.aws/**)",
      "Read(~/.ssh/**)",
      "Read(~/.config/gh/**)",
      "Read(~/.docker/config.json)",
      "Read(~/.netrc)",
      "Write(~/.aws/**)",
      "Write(~/.ssh/**)"
    ]
  }
}
```

**Caveats:**

- `blockWritesOutsideWorkingDirectories: true` refuses any write outside the project tree + scratchpad dir. The scratchpad is usually considered "inside" by Claude Code's working-dir rules (verify on this build), but a skill that writes to `~/.claude/memory/` or similar **will** be refused under this setting. The shared-memory protocol in AGENTS.md says the shared root at `~/.claude/memory/` is read-only for sessions — so this constraint happens to match the existing contract, but any skill in the harness that writes outside the working tree must be audited first. Candidates: `/memory-prune`, `/session-end`, `/shared-root-init`.
- `denyInsteadOfPrompting: true` turns prompts into refusals in terminal/subagent/teammate sessions. For interactive solo use, this changes muscle memory — a usually-approved `Bash(gh pr create …)` prompt would instead deny. The right split is to put this knob in `.claude/settings.local.json` (per-machine / per-maintainer opt-in) rather than the project-tracked `.claude/settings.json`, so interactive solo work isn't disrupted while unattended routines pick it up when they run in a setting that merges both. A clean split is worth deciding before the edit.

**Scope:** ordinary.

**Expected payoff.** Unattended routines (this one + `/run-loop`) fail-fast instead of silently stalling on a write-outside-tree or a permission prompt no human is around to click.

**Verify before applying:**
- `cat .claude/settings.json .claude/settings.local.json 2>/dev/null` — confirm neither field is already set, and pick whether the knobs go in tracked or local.
- `grep -rn "Write(.*~/\|Write(/.*)" skills/ --include="*.md"` (or equivalent) — list every skill that writes outside the working tree, so §7 doesn't break them silently under `blockWritesOutsideWorkingDirectories: true`.

**Recommended verdict:** apply — small settings patch, but audit shared-root-touching skills first and decide tracked-vs-local before committing.
**Status:** PENDING — awaiting triage in PR review
