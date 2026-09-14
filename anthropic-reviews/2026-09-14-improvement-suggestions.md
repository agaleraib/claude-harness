# Anthropic post review — 2026-09-14

Long gap since the previous review (2026-05-10 → 2026-09-14, ~4 months). Two model generations shipped in the interval (Opus 4.8 on 2026-05-28, then Opus 5 on 2026-07-24; Sonnet 5 on 2026-06-30), so the largest single class of change this run is model-pin freshness in `.harness-profile` and README copy. Beyond that, Anthropic published a canonical "Steering Claude Code" framework and a paired "Building verification loops in Claude Code with skills" post that map directly onto the harness's existing skills/agents split and evaluator loop.

Note on discovery: the egress proxy blocked `www.anthropic.com` and `claude.com` for WebFetch this run, so per-post analysis is grounded in WebSearch snippet content rather than full-page reads. Every URL below is one that appeared in a live search result — not fabricated — but per-post prose is more compressed than usual. Reviewers, treat the "Verify before applying" line as load-bearing.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Bump `.harness-profile` `model.primary` from `claude-opus-4-7` to `claude-opus-5` | apply | Two model generations shipped (4.8 on 2026-05-28, then 5 on 2026-07-24); pin is 4 months stale |
| 2 | Bump `.harness-profile` `model.fallback` from `claude-sonnet-4-6` to `claude-sonnet-5` | apply | Sonnet 5 shipped 2026-06-30 and Anthropic docs describe it as close to Opus 4.8 at Sonnet pricing |
| 3 | Update README/CLAUDE.md prose that still hard-codes "Opus 4.7" to say "current Opus" (or `${CLAUDE_MODEL}`) | apply | Copy references a two-generation-old model in at least two user-visible spots |
| 4 | Add the Opus 5 `thinking: disabled` restriction at effort `xhigh`/`max` to `docs/opus-model-notes.md` (create) as a compatibility caveat before flipping the pin | spec | Breaking API-behavior change intersects `effort_default: xhigh`; needs a small design pass to decide whether any harness code path could accidentally trip it |
| 5 | Add a canonical "when to use CLAUDE.md vs rules vs skills vs subagents vs hooks vs output styles vs `--append-system-prompt`" table to README, citing "Steering Claude Code" (2026-07-10) | apply | Harness already has piecemeal guidance; a canonical table with Anthropic's own vocabulary tightens it and lets `setup-harness` reference one section |
| 6 | Adopt "description field = trigger, not summary" as an explicit rule in `skills/skill-creator/SKILL.md` (per "Lessons from building Claude Code: How we use skills", 2026-06-21) | defer until skill-creator next touched | Sampled `session-start`, `harness-status`, `commit` — descriptions already read as triggers, so the rule is *de facto* observed; codify it the next time skill-creator changes |
| 7 | Note "auto mode is the default in Claude Code" in `README.md` Permission Mode section | apply | README currently frames auto mode as an opt-in ("use auto mode to eliminate permission prompts"); Anthropic's follow-up post makes it the default for Pro/Max/Team |
| 8 | Add "Running auto mode in production" (Nuro/Gusto/Garner learnings) as a bookkeeping cite next to the existing auto mode section | reject — bookkeeping only | Learnings ("tune classifier per repo", "~10% of transcripts had a denial") don't translate into a solo-maintained harness change; just noise if added |
| 9 | Evaluate whether `claude agents` (Agent view, 2026-05-11 Research Preview) supersedes the orchestrator's parallel-dispatch pattern | defer until orchestrator concurrency pain | Research preview + local-machine-only; orchestrator today dispatches via subagents in-process which is fine at 1-user scale. Revisit if the harness ever needs to fan out >3 sessions in parallel |
| 10 | Cite "How we contain Claude across products" and "How Anthropic secures its AI-native SDLC" in the README "Why not Superpowers" evidence list | defer until next README refresh | Two new Anthropic-authored engineering pieces on the same containment/verification themes the harness already argues from; useful evidence, low urgency |

---

## 1. Bump `.harness-profile` `model.primary` from `claude-opus-4-7` to `claude-opus-5`

**Source:** https://www.anthropic.com/news/claude-opus-5 (2026-07-24) and https://www.anthropic.com/news/claude-opus-4-8 (2026-05-28) as the intermediate.

**Current state (verified in this session):**
```
$ grep -n "primary\|fallback" /home/user/claude-harness/.harness-profile
model:
  primary: claude-opus-4-7
  fallback: claude-sonnet-4-6
```

**Concrete change:**
```diff
 model:
-  primary: claude-opus-4-7
+  primary: claude-opus-5
   fallback: claude-sonnet-4-6
   effort_default: xhigh   # derived from stakes.level: medium
   effort_cost_multiplier: {}
```

**Expected payoff:** Uses the current-generation model. Opus 5 has a 1M-token default context (per Claude Platform docs surfaced in search) and Anthropic positions it as ~half the price of Fable 5 for near-frontier intelligence. Opus 4.7 is now two named generations behind (4.7 → 4.8 → 5) and 4 months old at pin-time.

**Caveat that gates this suggestion** (see §4 spec): the Opus 5 API rejects `thinking: {"type": "disabled"}` at effort `xhigh` or `max` — a breaking change from Opus 4.8. The harness pins `effort_default: xhigh`. Grep the harness for any code path that both selects Opus 5 and asks for disabled thinking before flipping the pin; if none exists (which is likely — nothing in `skills/` today constructs Anthropic API calls), the caveat reduces to a doc note.

**Verify before applying:**
```bash
grep -rn "opus-4-7\|opus 4.7\|Opus 4.7" /home/user/claude-harness/.harness-profile /home/user/claude-harness/README.md /home/user/claude-harness/CLAUDE.md /home/user/claude-harness/AGENTS.md
grep -rn "thinking.*disabled\|thinking.*type" /home/user/claude-harness/skills/
```
First grep should still show `claude-opus-4-7` unpinned; second should return empty (no harness code constructs API-level thinking config).

**Recommended verdict:** apply — model pin is 4 months stale and the successor is a straight upgrade path.
**Status:** PENDING — awaiting triage in PR review

---

## 2. Bump `.harness-profile` `model.fallback` from `claude-sonnet-4-6` to `claude-sonnet-5`

**Source:** https://www.anthropic.com/news/claude-sonnet-5 (2026-06-30).

**Current state:** `.harness-profile` line 34 pins `fallback: claude-sonnet-4-6`. Sonnet 5 is one named generation newer; Anthropic's own announcement (via search snippet) describes it as "close to Opus 4.8 at Sonnet pricing." The 2026-05-04 tracker row already noted the retirement of Sonnet 4.5/4 `context-1m-2025-08-07` beta header; nothing in `.harness-profile` still depends on it.

**Concrete change:**
```diff
 model:
   primary: claude-opus-5      # per §1
-  fallback: claude-sonnet-4-6
+  fallback: claude-sonnet-5
```

**Expected payoff:** Fallback matches current frontier-value tier. Cost profile of the fallback path improves without any code change downstream (the profile is read at session-start; no skill hardcodes the string).

**Verify before applying:**
```bash
grep -rn "sonnet-4-6\|sonnet 4.6\|Sonnet 4.6" /home/user/claude-harness/
```
Should show one hit — the `.harness-profile` line — and nothing else. If a skill hard-codes the string, patch it in the same commit.

**Recommended verdict:** apply — same reasoning as §1, one generation behind.
**Status:** PENDING — awaiting triage in PR review

---

## 3. Refresh README/CLAUDE.md copy that still says "Opus 4.7"

**Source:** downstream of §1 and §2 — no new post, just copy hygiene.

**Current state:**
```
$ grep -n "Opus 4.7" /home/user/claude-harness/README.md
28: - **Instruction ignoring**: Claude models skip CLAUDE.md and skills under load (…)
891: Unlike CLAUDE.md instructions (which Opus 4.7 can ignore under load), hooks **always fire**:
```
Line 28 doesn't name the model (fine); line 891 does. There may be additional hits under `docs/` — the grep above only scanned root files.

**Concrete change:**
```diff
- Unlike CLAUDE.md instructions (which Opus 4.7 can ignore under load), hooks **always fire**:
+ Unlike CLAUDE.md instructions (which even a top-tier Claude model can ignore under load), hooks **always fire**:
```
Prefer model-neutral phrasing over pinning the name — the point holds across generations, and this file otherwise won't need editing on the next bump.

**Expected payoff:** Documentation matches the pinned model; no stale-name confusion for new colleagues reading INSTALL-FOR-COLLEAGUE.md and cross-referencing the README.

**Verify before applying:**
```bash
grep -rn "Opus 4\.[0-9]\|opus-4-[0-9]" /home/user/claude-harness/README.md /home/user/claude-harness/CLAUDE.md /home/user/claude-harness/AGENTS.md /home/user/claude-harness/INSTALL-FOR-COLLEAGUE.md /home/user/claude-harness/docs/
```
If tomorrow's pin has already moved past Opus 5, this grep still surfaces every stale citation to fix.

**Recommended verdict:** apply — trivial and follows §1 mechanically.
**Status:** PENDING — awaiting triage in PR review

---

## 4. Document Opus 5's `thinking: disabled` restriction at `xhigh`/`max` before flipping the primary pin

**Source:** https://www.anthropic.com/news/claude-opus-5 and https://platform.claude.com/docs/en/about-claude/models/whats-new-opus-5 (both 2026-07-24).

**What the post says (from search snippet):** "On Claude Opus 5, disabling thinking is allowed only at effort `high` or below: `thinking: {"type": "disabled"}` with effort `xhigh` or `max` returns a 400 error, a breaking change from Claude Opus 4.8."

**Why this needs a spec pass, not a straight apply:** `.harness-profile` pins `effort_default: xhigh` (derived from `stakes.level: medium`). The harness doesn't today construct Anthropic API calls directly — Claude Code does — so the API-level restriction is mostly a Claude-Code-configures-it-for-you concern. But `skills/_shared/loop/` and `skills/orchestrator/` do plan future subagent dispatch, and the loop engine may grow a thinking-toggle parameter as it matures. A short design note gets the constraint into someone's eyeline before that happens.

**Proposed artifact:** `docs/opus-model-notes.md` — a one-page changelog-style file capturing per-generation gotchas as they surface. Seed entry:

```markdown
# Opus model-generation notes

Rolling notes on Opus-generation quirks the harness needs to remember.
Add new entries at the top.

## Opus 5 (2026-07-24)

- `thinking: {"type": "disabled"}` returns 400 at effort `xhigh`/`max`
  (breaking change from Opus 4.8). `.harness-profile` pins
  `effort_default: xhigh`, so any harness code path that lowers effort
  before disabling thinking is fine — but never disable thinking without
  also lowering effort. Nothing in `skills/` constructs thinking config
  today; audit this file if that changes.
- Mid-conversation tool changes require the
  `mid-conversation-tool-changes-2026-07-01` beta header. Claude Code
  handles the header on your behalf; only relevant if the harness ever
  drives the Messages API directly.
- Default context is 1M tokens. There is no smaller-context variant.

## Opus 4.8 (2026-05-28)

- Same price as 4.7; drop-in for the majority of workloads.
- Introduced "dynamic workflows" in Claude Code (not currently used by
  the harness — the loop engine in `skills/_shared/loop/` predates it).
```

**Expected payoff:** Future-me (or a future collaborator) doesn't have to re-derive why the profile pins what it does. The file is deliberately small so it doesn't rot.

**Verify before applying:**
```bash
test -f /home/user/claude-harness/docs/opus-model-notes.md  # already exists? drop the suggestion
grep -rn "thinking.*disabled\|thinking.*type\|beta.*mid-conversation" /home/user/claude-harness/skills/  # any surface that would hit the restriction? drop or expand accordingly
```

**Recommended verdict:** spec — small design pass to decide whether this file is worth creating vs. inlining the caveat in `.harness-profile` YAML comments. Doesn't need `/spec-planner` proper — a 15-minute think.
**Status:** PENDING — awaiting triage in PR review

---

## 5. Add a canonical "when to use CLAUDE.md vs rules vs skills vs subagents vs hooks vs output styles vs `--append-system-prompt`" section to README, citing "Steering Claude Code"

**Source:** https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more (2026-07-10).

**What the post says (from search snippet):** "There are seven methods for instructing Claude's behavior: CLAUDE.md files, rules, skills, subagents, hooks, output styles, and appending the system prompt." Post gives a concrete decision framework — e.g. skills for procedures you want visible in the main thread, subagents when intermediate results would clutter the transcript, hooks for guaranteed deterministic action.

**Current state:** `README.md` has separate sections on CLAUDE.md (~line 767), Hooks (~line 889), and permission mode (~line 871), plus the AGENTS.md piece on prefix stability (~line 54). There's no single decision table. The 2026-04-30 §1 suggestion already imported the "lay of the land" framing from an earlier MacCoss post; this update stacks a canonical seven-way rubric on top.

**Concrete change:** Insert a new subsection near the CLAUDE.md guidance (~README.md line 767) titled "Where does this rule belong?" with a table roughly like:

| Instruction type | Best for | Guaranteed to fire? | Visible in transcript? |
|---|---|---|---|
| `CLAUDE.md` | Always-on project standards, build commands, lay of the land | No — advisory | Yes (loaded into every conversation) |
| Rules (`.claude/rules/`) | Fine-grained per-directory / per-file conventions | No — advisory | Only when matched by file location |
| Skills (`.claude/skills/`) | Procedures you want to see and steer step-by-step in the main thread | On-demand — Claude picks | Yes (executed inline) |
| Subagents (Task tool + `.claude/agents/`) | Side tasks whose intermediate results would clutter the main context | On-demand | No — only the summary comes back |
| Hooks (`~/.claude/settings.json → hooks`) | Deterministic actions on file edits / tool calls / lifecycle events | Yes — always fires | Only stdout/stderr, not the trigger |
| Output styles | Consistent formatting or tone for a session | Yes (once set) | Applies to every message |
| `--append-system-prompt` | One-off session-wide directive Claude Code should treat as system-level | Yes | Not surfaced |

Cite the "Steering Claude Code" post as the source, and add a one-liner: "If the same rule keeps showing up as advice the model doesn't follow, promote it from CLAUDE.md to a hook."

**Expected payoff:** New consumers of `setup-harness` land on one section that answers "where do I put this rule?" instead of piecing it together from three README subsections and the AGENTS.md prefix-stability paragraph. Reduces the surface area of README bloat, since existing paragraphs can point to this table instead of restating the rubric.

**Verify before applying:**
```bash
grep -n "seven methods\|instruction type\|Where does this rule" /home/user/claude-harness/README.md
# should be empty — if it already lands, drop the suggestion
grep -n "steering-claude-code" /home/user/claude-harness/README.md /home/user/claude-harness/CLAUDE.md /home/user/claude-harness/AGENTS.md
# ditto — if the URL is already cited, the table may already be in place
```

**Recommended verdict:** apply — highest-leverage single change from this batch; canonicalizes what the harness already implicitly follows.
**Status:** PENDING — awaiting triage in PR review

---

## 6. Codify "description field = trigger, not summary" in `skills/skill-creator/SKILL.md`

**Source:** https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills (2026-06-21).

**What the post says (from search snippet):** "When Claude Code starts a session, it builds a listing of every available skill with its description. This listing is what Claude scans to decide 'is there a skill for this request?' Which means the description field is not a summary, it's a description of when to trigger this skill."

**Current state (verified in this session):** sampled `skills/session-start/SKILL.md`, `skills/harness-status/SKILL.md`, `skills/commit/SKILL.md` — all three descriptions read as triggers ("Run at the start of every session before any work", "Use when you want to see all your harness-managed projects' state at once", "let you fix or park issues"). The rule is *de facto* observed. But `skill-creator/SKILL.md` (the skill that generates other skills) doesn't explicitly call the rule out for future authors.

**Proposed change:** append a short paragraph to `skills/skill-creator/SKILL.md` (bottom of the "description" section, wherever the current file describes SKILL.md frontmatter) restating the trigger-not-summary rule with a good/bad example. Cite the Anthropic post.

**Expected payoff:** Every future skill authored via `skill-creator` inherits the trigger-oriented framing. Prevents drift back to summary-style descriptions when the harness grows.

**Verify before applying:**
```bash
grep -n "description\|trigger" /home/user/claude-harness/skills/skill-creator/SKILL.md | head -30
# does the file already say "description is a trigger"? if so, drop
```
Also: audit every existing SKILL.md description for summary drift — one-shot script, no ongoing cost:
```bash
for f in /home/user/claude-harness/skills/*/SKILL.md; do
  awk '/^---$/{n++; next} n==1 && /^description:/' "$f" | head -1
done | less
# read for patterns like "does X, Y, and Z" (summary) vs. "use when X" / "run at Y" (trigger)
```

**Recommended verdict:** defer until skill-creator next touched — the rule is already in practice; codifying it while nothing else needs editing costs more than it saves. Bump to `apply` if any new SKILL.md lands with a summary-style description.
**Status:** PENDING — awaiting triage in PR review

---

## 7. Note "auto mode is now the default in Claude Code" in the README Permission Mode section

**Source:** https://claude.com/blog/auto-mode-default-in-claude-code (undated in search snippet, but title is dispositive: auto mode became the default on Pro/Max/Team). Companion: https://claude.com/blog/auto-mode-in-production (production learnings from Nuro/Gusto/Garner).

**Current state (verified):**
```
README.md:871  ### Permission Mode
README.md:873  Use **auto mode** to eliminate permission prompts without compromising safety:
```
The section reads as if auto mode is an opt-in requiring a settings.json edit. Post-default, that framing is subtly wrong — the settings.json block still applies (for allowlist tuning), but a new consumer's Claude Code already has `mode: "auto"` unless they downgrade.

**Concrete change:**
```diff
 ### Permission Mode

-Use **auto mode** to eliminate permission prompts without compromising safety:
+**Auto mode is now the default** on Claude Code Pro/Max/Team plans
+([announcement](https://claude.com/blog/auto-mode-default-in-claude-code)).
+You still want an explicit allowlist for the actions your workflow performs
+most — the classifier only evaluates actions your allowlist doesn't already
+cover, so a good allowlist is a fast path around per-action classifier
+latency:

 ```json
 // In ~/.claude/settings.json
 {
   "permissions": {
     "mode": "auto",
     "allow": ["Bash(*)", "Read(*)", "Write(*)", "Edit(*)", "Glob(*)", "Grep(*)"]
   }
 }
 ```
```

Keep the existing `Auto mode uses a classifier…` paragraph — it's still correct — and the `claude --permission-mode auto -p …` example is still the recommended pattern for unattended builds.

**Expected payoff:** Documentation matches Claude Code's post-default reality; new consumers don't waste time turning something on that's already on. Also gets the allowlist framed as a latency optimization (classifier fast path) rather than a safety necessity, which matches Anthropic's own framing.

**Verify before applying:**
```bash
grep -n "auto mode is now the default\|already the default" /home/user/claude-harness/README.md
# empty? apply. non-empty? drop.
```

**Recommended verdict:** apply — small copy fix, downstream of Anthropic's default flip.
**Status:** PENDING — awaiting triage in PR review

---

## 8. "Running auto mode in production" (Nuro/Gusto/Garner) as a bookkeeping cite

**Source:** https://claude.com/blog/auto-mode-in-production (undated in snippet, later than 2026-05-08 §1 which covered the engineering post).

**Analysis:** The production learnings — "tune the classifier's injected prompts to be more or less permissive for your work", "roughly 10% of session transcripts included an auto mode denial" — are useful data for enterprise teams that own many repos. For a solo-maintained methodology harness with `stakes.level: medium` and one user, they don't translate to a concrete change. The 2026-05-08 §1 suggestion already covers the auto-mode-hooks composition guidance for `setup-harness`; the production learnings don't add.

**Verify before applying:**
```bash
grep -n "auto-mode-in-production\|10% of session\|Nuro\|Gusto" /home/user/claude-harness/anthropic-reviews/
# should be empty except for this file — confirms the row isn't already sourced elsewhere
```

**Recommended verdict:** reject — bookkeeping only; solo harness has no lever the enterprise-tuning story unlocks. Revisit if the harness ever grows a multi-repo profile with per-project classifier tuning.
**Status:** PENDING — awaiting triage in PR review

---

## 9. Evaluate whether `claude agents` (Agent view) supersedes orchestrator parallel dispatch

**Source:** https://claude.com/blog/agent-view-in-claude-code (2026-05-11), companion docs at https://code.claude.com/docs/en/agent-view.

**What the post says:** `claude agents` opens a research-preview TUI for dispatching parallel Claude Code sessions, watching each row, and attaching for the full transcript. Sessions run locally, preserved across sleep, stopped on shutdown. Consume subscription rate at the same rate as interactive sessions.

**Current state:** the harness's orchestrator (per `.claude/`, `skills/run-wave/`, `skills/planning-loop/`) dispatches subagents via the Task tool within a single top-level Claude Code session. It doesn't fan out via `claude agents`. For 1-user scale that's fine — most orchestrator dispatches are 1–3 subagents whose transcripts the operator wants inline.

**Speculative payoff (scope: speculative):** if the harness ever grows a "run wave X across N phases in parallel" mode, `claude agents` is the obvious integration point — each phase would be a separate row in the view. But that's a real feature away, and today `run-wave` runs sequentially by design ("Step 0 preflight" etc.).

**Verify before applying:**
```bash
grep -rn "claude agents\|agent-view\|parallel.*subagent\|fan.out" /home/user/claude-harness/skills/run-wave/ /home/user/claude-harness/skills/planning-loop/ /home/user/claude-harness/skills/orchestrator/ 2>/dev/null
# if any of these appear, the harness has already grown a parallel dispatch surface and this suggestion should re-examine
```

**Recommended verdict:** defer until orchestrator concurrency pain — no problem to solve today, and Research Preview + local-only means it's not stable enough to build against yet.
**Status:** PENDING — awaiting triage in PR review

---

## 10. Cite "How we contain Claude" and "How Anthropic secures its AI-native SDLC" in the README "Why Not Superpowers" evidence list

**Sources:**
- https://www.anthropic.com/engineering/how-we-contain-claude (undated in snippet; describes containment across claude.ai, Claude Code, Cowork with sandboxes/VMs/egress controls — includes the story about Claude exfiltrating `~/.aws/credentials` 24/25 times under a phishing-shaped prompt)
- https://claude.com/blog/how-anthropic-secures-its-ai-native-software-development-lifecycle (2026-07-21; Anthropic Deputy CISO — describes shifting security left, PSR web-app pattern, "80% of merged code is AI-authored")

**Current state:** README's "Why Not Superpowers" section lists Anthropic-authored evidence (postmortems, Managed Agents posts, prompt-caching lessons) as motivation for the harness's opinionated defaults. Two new engineering posts arguably belong on that list — both articulate containment / verification patterns the harness already argues from (evaluator loop, api-security-checklist, hooks-over-CLAUDE.md rule).

**Analysis:** Value is one-line-of-README-per-cite, low urgency. Fold in on the next README refresh rather than as a standalone change.

**Verify before applying:**
```bash
grep -n "how-we-contain-claude\|secures-its-ai-native\|Deputy CISO" /home/user/claude-harness/README.md
# empty? still cite-worthy. non-empty? drop.
```

**Recommended verdict:** defer until next README refresh — no rush; add alongside other README housekeeping so the readme doesn't churn in a citation-only commit.
**Status:** PENDING — awaiting triage in PR review
