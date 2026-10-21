# Anthropic post review — 2026-08-26

The last dated suggestions file is 2026-05-10. This run covers Anthropic
publishing between 2026-05-11 and 2026-08-26 — roughly 15 weeks of Claude Code
weekly digests, four model launches (Opus 4.8, Fable 5, Sonnet 5, Opus 5), and
a handful of Claude Platform release notes. Cap: 15 posts. Sources reachable
from this session: `code.claude.com/docs/en/whats-new`,
`platform.claude.com/docs/en/release-notes/overview`, and
`raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/CHANGELOG.md`.
`www.anthropic.com`, `claude.com/blog`, `alignment.anthropic.com`, and
`red.anthropic.com` are all blocked at the network egress proxy — for those
posts the tracker cites the alternate durable URL (release notes or weekly
digest) that carries the same information.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Bump `.harness-profile` to Opus 5 primary + Sonnet 5 fallback | apply | Opus 4.7 pin lags four Claude 5-family launches (Opus 4.8 → Fable 5 → Sonnet 5 → Opus 5); session-prompt already directs "default to the latest and most capable". |
| 2 | Add `/goal` overlap note to `session-start` skill | defer | `/goal` is a runtime completion-check convention; `today_goal.md` is a session-baseline marker. Both can coexist; note the delta for future readers. |
| 3 | Note dynamic workflows + security-guidance plugin as `/run-wave` / `procedures/api-security-checklist.md` cousins | defer | `/run-wave` orchestrator dispatch predates dynamic workflows; the two are complementary, not either/or. Track so a future spec can consider replacement. |
| 4 | Document `--safe-mode` as `harness-status` fallback path | apply | Trivial doc addition; when a harness regression is suspected, `claude --safe-mode` is the cheapest way to isolate CLAUDE.md/skill/hook vs product cause. |
| 5 | Extend `.harness-profile.model` to accept a fallback chain (up to 3) | defer until Opus-availability outage bites | `fallbackModel` config supports up to 3 fallbacks in Claude Code; harness schema pins one. No pain today. |
| 6 | Note `/doctor` (a.k.a. `/checkup`) overlap with `harness-status` skill | reject — different scope | `/doctor` diagnoses Claude Code install; `harness-status` audits the harness's own drift/protocol state. Overlap is nominal. |
| 7 | Fold Claude Security plugin into `procedures/api-security-checklist.md` as an install-path option | defer until multi-project rollout | Solo maintainer; the checklist is a review artifact, the plugin is an active reviewer. Different lifecycle. |
| 8 | Cross-session `SendMessage` + `@` mentions as `/run-wave` orchestrator coordination pattern | defer — no multi-session orchestration pain today | `/run-wave` uses worktrees + subagents, not multi-CLI-sessions. Would only pay off once multiple long-running sessions coexist. |
| 9 | Note 20-concurrent-subagent cap and `--max-budget-usd` for `/run-wave` and `/run-loop` | apply | Cap is a real backstop (v2.1.217); document so a future wave planner doesn't overprovision fanout. `--max-budget-usd` is trivial to mention alongside. |
| 10 | Note subagent forking default-on as behavior change for `Explore` and `planning-loop` | defer until an Explore-agent regression surfaces | v2.1.232 flipped `fork mode` default; subagents inherit parent conversation. May change what Explore sees; observe first. |
| 11 | Add `promptCacheTtl` / `subagentPromptCacheTtl` to `.claude/settings.json` | defer — no cache-TTL problem observed | Settings landed 2026-08-25 (v2.1.243); default TTL is already 1h for this session. Only apply if a cache-miss regression is diagnosed. |
| 12 | Reinforce "skills live in `.claude/skills/`" in setup-harness README — matches Platform Aug 7 GitHub-skills discovery | apply | Claude Managed Agents now auto-loads skills from a mounted repo's `.claude/skills/`. The harness already ships this way; a single-line README note corroborates the design decision. |
| 13 | Adopt Claude Platform cache diagnostics beta as a debugging path for the prompt-cache guardrail | reject — no Claude API surface in this harness | Beta header `cache-diagnosis-2026-04-07` targets `POST /v1/messages`. The harness has no direct API client; guardrail lives in AGENTS.md prose only. |

Verdict counts: **3 apply · 6 defer · 3 reject · 0 spec · 1 (below) is bookkeeping** — carried forward as tracker rows only.

---

## §1 · Bump `.harness-profile` to Opus 5 primary + Sonnet 5 fallback

**Sources**
- Claude Opus 4.8 launch — Platform release note 2026-05-28: <https://platform.claude.com/docs/en/release-notes/overview>
- Claude Fable 5 launch — Platform release note 2026-06-09: <https://platform.claude.com/docs/en/release-notes/overview>
- Claude Sonnet 5 launch — Platform release note 2026-06-30: <https://platform.claude.com/docs/en/release-notes/overview>
- Claude Opus 5 launch — Platform release note 2026-07-24: <https://platform.claude.com/docs/en/release-notes/overview>
- Claude Code Week 27 digest (Sonnet 5 as default for Pro/Team-Standard/Enterprise) 2026-06-29 – 2026-07-03: <https://code.claude.com/docs/en/whats-new/2026-w27>
- Claude Code Week 30 digest (Opus 5 as new default Opus) 2026-07-20 – 2026-07-24: <https://code.claude.com/docs/en/whats-new/2026-w30>

**What changed**
Between 2026-05-28 and 2026-07-24 Anthropic shipped four model generations
above Opus 4.7 (currently pinned in `.harness-profile`):

| Model | Date | 1M ctx | Adaptive thinking | Notes |
|---|---|---|---|---|
| Opus 4.8 (`claude-opus-4-8`) | 2026-05-28 | yes | yes | Default effort `high`; min cacheable prompt 1024 tokens. |
| Fable 5 (`claude-fable-5`) | 2026-06-09 | yes | yes (only mode) | Refusal category `reasoning_extraction` added. |
| Sonnet 5 (`claude-sonnet-5`) | 2026-06-30 | yes | yes | ~30% more tokens per text (new tokenizer). |
| Opus 5 (`claude-opus-5`) | 2026-07-24 | yes | yes | $5/$25 per MTok (same as 4.8); `xhigh`/`max` require thinking. |

Session system prompt for this routine ("The most recent Claude models are the
Claude 5 family and Haiku 4.5 … When building AI applications, default to the
latest and most capable Claude models") explicitly directs the bump.

**Concrete change**
```diff
 # .harness-profile
 model:
-  primary: claude-opus-4-7
-  fallback: claude-sonnet-4-6
+  primary: claude-opus-5
+  fallback: claude-sonnet-5
   effort_default: xhigh   # derived from stakes.level: medium
```

Companion updates:
- `skills/project-init/SKILL.md:152-153` and `:206-207` — the model-defaults
  table + schema example carry the same `claude-opus-4-7` /
  `claude-sonnet-4-6` literals. Rev alongside.
- `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md` — spec was
  written against Opus 4.7 defaults; add a footnote naming the Opus 5 update
  and the date it was applied (don't rewrite the spec — it's history).

**Payoff** — new sessions dispatched by the orchestrator default to the tier
Anthropic recommends for coding + agentic work; also aligns the harness with
the session-prompt directive so any future audit reads the same story.

**Behavior deltas to mind on Opus 5 (not deal-breakers, but worth naming so a
follow-up wave can absorb them):**
- Manual `thinking: {type: "enabled", budget_tokens: N}` is gone (adaptive
  thinking on by default). The harness never sets manual thinking budgets.
- `thinking: {"type": "disabled"}` returns 400 at effort `xhigh` / `max`.
  `.harness-profile` defaults to `xhigh` at `stakes.level: medium`; nothing
  in the harness disables thinking today.
- New tokenizer produces ~30% more tokens per text vs pre-Opus-4.7 tokenizers.
  Only matters if any `.harness-state/` token accounting exists — grep says
  none does.

**Verify before applying:** `grep -R "claude-opus-4-7\|claude-sonnet-4-6" .harness-profile skills/ docs/specs/` — every hit is either the profile itself or the project-init schema table. If the counts don't match this list, another consumer sprouted; check that too.

**Recommended verdict:** apply — session prompt is explicit, model families all in production, four launches worth of lag is enough.
**Status:** PENDING — awaiting triage in PR review

---

## §2 · `/goal` overlap with `session-start`'s `today_goal.md`

**Source:** Claude Code Week 20 digest (2026-05-11 – 2026-05-15) —
<https://code.claude.com/docs/en/whats-new/2026-w20#goal>

**What Claude Code shipped (v2.1.139)**
`/goal <completion condition>` sets a natural-language completion condition;
after each turn a fast model checks whether the condition holds. If not, Claude
starts another turn without a prompt from the user. Goal clears when the
condition is met. Works in interactive, `-p`, and Remote Control.

Example: `> /goal all tests in test/auth pass and the lint step is clean`

**What the harness has today**
`skills/session-start/SKILL.md:172-180` writes a single-sentence goal to
`.harness-state/today_goal.md`:

```markdown
# Today's goal — [YYYY-MM-DD]

**Goal:** [one sentence]
**Phase:** [current]
**Set at:** [timestamp]
```

That file is a session-baseline marker — read once at start, consulted by
`session-end` and `harness-status`. It is not a runtime completion-check.

**Delta**
- `/goal` is a Claude Code runtime affordance (auto-continuation until a
  condition holds).
- `today_goal.md` is a harness-state marker (bookkeeping for the day's focus,
  read by `session-end` to write the exit note).

The two do not collide, but they name the same word ("goal") and a future
reader will ask why the harness bothers with `today_goal.md` when `/goal`
exists. A one-line note in `skills/session-start/SKILL.md` beside the
`today_goal.md` write ("`/goal` is Claude Code's completion-condition loop, a
different mechanism; `today_goal.md` is a session-scope focus record") is
enough to prevent confusion.

**Concrete change (deferred)** — add a comment in `skills/session-start/SKILL.md`
after the `today_goal.md` block:

```diff
 Write the answer to `.harness-state/today_goal.md`:

 ```markdown
 # Today's goal — [YYYY-MM-DD]

 **Goal:** [one sentence]
 **Phase:** [current]
 **Set at:** [timestamp]
 ```
+
+> **Not** the same as Claude Code's runtime `/goal` command (Week 20 · v2.1.139),
+> which loops turns until a completion condition holds. `today_goal.md` is a
+> session-scope focus marker read by `session-end`; use `/goal` inside a
+> session if you want auto-continuation to a verifiable end state.
```

**Verify before applying:** `grep -n "today_goal" skills/session-start/SKILL.md` — line ranges should still match §2's diff. If the block was refactored, thread the note into wherever the write now lives.

**Recommended verdict:** defer — a note is cheap but the confusion hasn't
happened yet; batch with the next session-start touch.
**Status:** PENDING — awaiting triage in PR review

---

## §3 · Dynamic workflows and the security-guidance plugin as cousins of `/run-wave` and `procedures/api-security-checklist.md`

**Sources**
- Claude Code Week 22 digest (2026-05-25 – 2026-05-29):
  <https://code.claude.com/docs/en/whats-new/2026-w22>
- Claude Code Week 30 digest (2026-07-20 – 2026-07-24):
  <https://code.claude.com/docs/en/whats-new/2026-w30>

**What Claude Code shipped**
- **Dynamic workflows** (Week 22, research preview): "an orchestration script
  Claude writes for your task and runs across many subagents in the
  background. Use one when a task is too large for one conversation to
  coordinate: a codebase-wide audit, a large migration, a research question
  that needs cross-checking. Manage runs with `/workflows`." Kick off with
  natural language ("create a workflow that migrates every internal fetch()
  call…"). Docs: <https://code.claude.com/docs/en/workflows>.
- **Security guidance plugin** (Week 22): "reviews Claude's code changes for
  vulnerabilities and fixes them in the same session. It runs a fast pattern
  check on each edit, a model review at the end of each turn, and a deeper
  agentic review on commit or push. Add project rules in
  `.claude/claude-security-guidance.md`." Install:
  `/plugin install security-guidance@claude-plugins-official`.
- **Claude Security plugin** (Week 30, `claude/security`): multi-agent
  vulnerability scan of the whole codebase, findings materialize as patches
  the user applies. Distinct from the lighter-touch security-guidance plugin.

**What the harness has today**
- `/run-wave` (a skill) dispatches wave items to opus/sonnet/haiku subagents
  via the orchestrator. Its dispatch model is deterministic: read
  `docs/plan.md`, expand each wave item, run in a worktree, close-wave once
  green. The unit of parallelism is a wave item, not a whole task.
- `procedures/api-security-checklist.md` is a static review checklist a human
  works down at review time.

**Overlap analysis**
- Dynamic workflows are LLM-authored and run at runtime; `/run-wave` is
  operator-authored from a spec. Both fan out to subagents. The harness
  already has a fanout mechanism, so dynamic workflows is not a replacement —
  it's a research preview whose UX invites bespoke fanouts inside a session
  that the harness would prefer to see landed as a wave item.
- Security-guidance and Claude Security are both dynamic reviewers; the
  harness's checklist is a static reference. They can coexist: the checklist
  becomes the source of truth that the plugin's per-project rules
  (`.claude/claude-security-guidance.md`) reference.

**Concrete change (deferred)** — no code change this run. Track as a note in
`docs/plan.md` under parking-lot-review candidates:
- "Consider whether `/run-wave` should compose with dynamic workflows (invoke
  a workflow from inside a wave item, rather than one-off fanouts from the
  session)."
- "Consider whether `procedures/api-security-checklist.md` should also live at
  `.claude/claude-security-guidance.md` so the security-guidance plugin
  automatically enforces its rules on projects that install the harness."

**Verify before applying:** `ls skills/run-wave/ && grep -n "workflow" skills/run-wave/SKILL.md` — if `/run-wave` grew a workflow-composition surface between now and triage, the parking-lot bullets need rewording.

**Recommended verdict:** defer — both plugins are still-young research
previews; harness cost of adoption is nontrivial and current mechanisms
already cover the ground.
**Status:** PENDING — awaiting triage in PR review

---

## §4 · Document `--safe-mode` as `harness-status` fallback path

**Source:** Claude Code Week 24 digest (2026-06-08 – 2026-06-12):
<https://code.claude.com/docs/en/whats-new/2026-w24>

**What Claude Code shipped (v2.1.169)**
`claude --safe-mode` (or `CLAUDE_CODE_SAFE_MODE=1`) launches Claude Code with
all customizations disabled: CLAUDE.md, skills, plugins, hooks, MCP servers,
custom commands and agents do not load. Authentication, model selection,
built-in tools, and permissions still work. Purpose: isolate a broken
customization by observing whether the problem disappears in a clean session.

**Why it matters here**
When the harness itself is suspected of causing a regression (a skill
misfiring, a hook loop, a plugin conflict introduced by `setup-harness`), the
current `skills/harness-status/SKILL.md` scans harness state files but does
not exercise the "does Claude Code even work without the harness?" question.
`--safe-mode` answers that in one command. Every `harness-status` run should
mention it as the escape hatch.

**Concrete change (apply)** — append a subsection to
`skills/harness-status/SKILL.md`, after the summary-writing block:

```markdown
## Escape hatch — is the harness itself the problem?

If `harness-status` looks clean but Claude Code is misbehaving, launch a
clean session with `claude --safe-mode` (or `CLAUDE_CODE_SAFE_MODE=1`). Safe
mode disables CLAUDE.md, skills, plugins, hooks, MCP servers, and custom
commands/agents — authentication, model selection, built-in tools, and
permissions still work. If the problem disappears there, one of the
harness-installed surfaces is the cause; re-enable them one by one to
isolate.

Source: Claude Code v2.1.169 (Week 24 · 2026-06-08 – 2026-06-12) —
<https://code.claude.com/docs/en/debug-your-config#test-against-a-clean-configuration>
```

Also add a two-line mention in `skills/setup-harness/SKILL.md` after the
install instructions, so first-time installers know the safe-mode escape hatch
exists.

**Verify before applying:** `grep -n "safe-mode\|safe_mode" skills/harness-status/SKILL.md skills/setup-harness/SKILL.md` — if the notes already landed, drop the diff.

**Recommended verdict:** apply — trivial doc addition, real diagnostic value.
**Status:** PENDING — awaiting triage in PR review

---

## §5 · Extend `.harness-profile.model` to accept a fallback chain

**Source:** Claude Code Week 24 digest (Other wins row):
<https://code.claude.com/docs/en/whats-new/2026-w24> — "`fallbackModel`
configures up to three fallback models tried in order when the primary is
overloaded or unavailable, and `--fallback-model` now applies to interactive
sessions too."

**What the harness has today**
`.harness-profile` `model.fallback` is a single string
(`claude-sonnet-4-6` today). `skills/project-init/SKILL.md:153` describes it
as "Used when the orchestrator demotes for cost/latency."

**What Claude Code shipped**
`fallbackModel` config accepts a list of up to three models, tried in order
on primary-model unavailability. Extending `.harness-profile.model.fallback`
to accept either a string or a list of strings would mirror the surface.

**Why defer** — no harness user has hit multi-fallback pain. Adding schema
plumbing for a hypothetical scenario is speculative. Revisit if `.harness-state/`
logs show frequent primary-model failovers.

**Concrete change (deferred)** — sketch only:

```diff
 # .harness-profile
 model:
   primary: claude-opus-5
-  fallback: claude-sonnet-5
+  fallback: [claude-sonnet-5, claude-opus-4-8]   # tried in order
   effort_default: xhigh
```

Corresponding `skills/project-init/SKILL.md` schema table row would change
from "yes / claude-sonnet-4-6" to "yes / string or list of ≤3 strings."

**Verify before applying:** `grep -n "model.fallback\|model:fallback" .harness-profile skills/project-init/SKILL.md` and check that the schema is still a single-string type; if a colleague already migrated it, drop this §.

**Recommended verdict:** defer until an Opus-availability outage forces the
issue; scope: speculative.
**Status:** PENDING — awaiting triage in PR review

---

## §6 · `/doctor` (a.k.a. `/checkup`) overlap with `harness-status`

**Source:** Claude Code Week 28 digest (2026-07-06 – 2026-07-10):
<https://code.claude.com/docs/en/whats-new/2026-w28>

**What Claude Code shipped**
`/doctor` is "a full setup checkup that diagnoses issues and can fix them,
with `/checkup` as its alias." It targets Claude Code's own install (CLI
version, auth, MCP server reachability, plugin health).

**Why reject**
`harness-status` scans the harness's protocol artifacts — `.harness-state/`
freshness, wave-close YAMLs, parking-lot growth, drift signals, skill-symlink
integrity — none of which `/doctor` inspects. The two tools cover
non-overlapping surfaces; running one is not a substitute for the other.

If a future refactor merges the two, that's a `spec` task, not a today-item.

**Verify before applying:** `head -50 skills/harness-status/lib/scan.sh` — confirm the scan is still harness-scoped and doesn't already invoke `/doctor`; if it does, rewrite this § before triage.

**Recommended verdict:** reject — different scope; no immediate overlap to
resolve.
**Status:** PENDING — awaiting triage in PR review

---

## §7 · Fold Claude Security plugin into `procedures/api-security-checklist.md`

**Source:** Claude Code Week 30 digest (2026-07-20 – 2026-07-24):
<https://code.claude.com/docs/en/whats-new/2026-w30>

**What Claude Code shipped**
The `claude/security` plugin "runs a multi-agent vulnerability scan of your
codebase and turns the findings you pick into patches you apply yourself."
Consumer-facing scanner; not automatically installed with Claude Code.

**Why defer**
`procedures/api-security-checklist.md` is a review artifact — a checklist a
human works down at review time on projects that install the harness. It's
not a scanner. The Claude Security plugin is the opposite: an active scanner
run per project, findings + patches. They are complementary; the checklist
could become the source of truth that projects installing the plugin
reference for their own security rules.

For a solo maintainer with no multi-project rollout in flight, no action.
Revisit when a wordwideAI (or similar) consumer project adopts the plugin.

**Verify before applying:** `cat procedures/api-security-checklist.md | head -40` — if the checklist has already been reshaped as a plugin ruleset, this § is obsolete.

**Recommended verdict:** defer until a consumer project adopts the plugin.
**Status:** PENDING — awaiting triage in PR review

---

## §8 · Cross-session `SendMessage` + `@` mentions as `/run-wave` coordination

**Sources**
- Claude Code Week 32 digest (2026-08-03 – 2026-08-07):
  <https://code.claude.com/docs/en/whats-new/2026-w32>
- v2.1.224 changelog (`SendMessage` cross-session macOS/Linux):
  <https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/CHANGELOG.md>
- v2.1.232 changelog (`@` mentions another Claude session by name):
  same URL.

**What Claude Code shipped**
- v2.1.224 (2026-08-07): cross-session `SendMessage` on macOS and Linux —
  one Claude Code session can message another live session on the same
  machine. `SendMessage` tool takes a `to` field naming the target session.
- v2.1.232 (2026-08-13): typing `@` in the prompt mentions another Claude
  session by name; `SendMessage` delivers to a bare name if it uniquely
  matches one live session; interactive sessions on one machine keep unique
  names.

**Where it might land in the harness**
`/run-wave` dispatches subagents inside one CLI session, using worktrees for
isolation. Cross-session `SendMessage` would enable a different pattern:
multiple long-running CLI sessions on the same machine (one per wave, one
per parking-lot investigation) that hand messages between each other. The
harness does not use this pattern today.

**Why defer**
The solo-maintainer workflow is single-session-plus-subagents. Migrating to
multi-session orchestration is a speculative reshape. Revisit if
`.harness-state/` shows two long-running sessions coexisting and the
operator wishes they could message each other.

**Verify before applying:** `ls .harness-state/*.yml 2>/dev/null | wc -l` — if there is no evidence of overlapping wave-run sessions, defer stands.

**Recommended verdict:** defer — no multi-session pain today; scope:
speculative.
**Status:** PENDING — awaiting triage in PR review

---

## §9 · Note the 20-concurrent-subagent cap and `--max-budget-usd` in `/run-wave` / `/run-loop` docs

**Source:** Claude Code v2.1.217 changelog (2026-07-21):
<https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/CHANGELOG.md>

**What Claude Code shipped**
- "Added cap on concurrently-running subagents (default 20)"
- "Fixed `--max-budget-usd` not stopping background subagents"

**Why it matters here**
`/run-wave` dispatches wave items to opus/sonnet/haiku subagents, and
`/run-loop` (from the tool-neutral loop protocol) can pick up an unbounded
number of items. Nothing in the harness's SKILL.md files caps or budgets
fanout. If a wave grows past 20 concurrent subagents, Claude Code's runtime
cap silently queues the excess, which changes wall-clock behavior in ways
the operator has not been told about.

**Concrete change (apply)** — add a two-line note near the
"parallelism / fanout" section of `skills/run-wave/SKILL.md` and
`skills/run-loop/SKILL.md`:

```markdown
> Claude Code caps concurrently-running subagents at 20 by default (Claude
> Code v2.1.217, 2026-07-21). A wave dispatching more than 20 subagents will
> queue the excess; plan wave sizes accordingly, or override with the
> product's future concurrency setting when one lands. Pair with
> `--max-budget-usd` to bound the wave's total spend.
```

**Verify before applying:** `grep -n "concurren\|subagent" skills/run-wave/SKILL.md skills/run-loop/SKILL.md` — confirm the doc doesn't already discuss the cap; if it does, either drop or refresh with the v2.1.217 citation.

**Recommended verdict:** apply — trivial doc, prevents a real footgun.
**Status:** PENDING — awaiting triage in PR review

---

## §10 · Subagent forking default-on as a behavior change for `Explore` and `planning-loop`

**Source:** Claude Code v2.1.232 changelog (2026-08-13):
<https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/CHANGELOG.md>
— "Subagent forking now on by default."

**What changed**
Before v2.1.232, subagents launched via the Agent tool started with a fresh
context. From v2.1.232 onward, the default is fork: subagents inherit the
parent conversation. Behavior can still be overridden per call.

**Where it might land in the harness**
- `skills/planning-loop/` and the harness's use of the `Explore` subagent for
  read-only search: both assume a fresh subagent context (small, focused
  prompts). If forking is now the default, Explore subagents see the whole
  parent conversation — potentially useful, potentially token-heavy, and
  changes what the subagent's system prompt effectively looks like.
- Any wave-close verification subagent that was assumed to be isolated is now
  a fork.

**Why defer**
No regression observed yet. The change might be net-positive (Explore has
more context). Watching-brief only: if a wave verifier suddenly starts
reasoning about earlier session content it shouldn't, forking is the first
suspect.

**Concrete change (deferred)** — no diff. Track as a bullet in `docs/plan.md`
under "post-merge monitoring."

**Verify before applying:** `grep -n "Agent(\|subagent_type\|Explore" skills/planning-loop/SKILL.md skills/run-wave/SKILL.md` — inventory current subagent calls; if any depend on isolation for correctness, escalate this § to `apply` and pass explicit `fork: false` (or the equivalent) on those calls.

**Recommended verdict:** defer until an Explore-agent regression surfaces.
**Status:** PENDING — awaiting triage in PR review

---

## §11 · `promptCacheTtl` / `subagentPromptCacheTtl` in `.claude/settings.json`

**Source:** Claude Code v2.1.243 changelog (2026-08-25):
<https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/CHANGELOG.md>
— "Added `promptCacheTtl` and `subagentPromptCacheTtl` settings."

**What Claude Code shipped**
Two new settings pin the prompt-cache TTL for main-loop and subagent
requests. Default TTL is 1 hour for this session (per session system prompt).
Setting them explicitly locks the TTL against a future default change.

**Why defer**
No cache-miss problem has been observed in `.harness-state/` logs. The 2026-05-05
prompt-caching post ("prefix stability guardrail") already produced a
methodology recommendation in `AGENTS.md`; the settings are a runtime
complement, not a substitute. Reach for them if a specific regression
appears (e.g. subagent chains suddenly recompute a long prompt prefix each
turn).

**Concrete change (deferred)** — when applied, edit `.claude/settings.json`:

```diff
 {
-  "hooks": {
-  }
+  "hooks": {
+  },
+  "promptCacheTtl": "1h",
+  "subagentPromptCacheTtl": "1h"
 }
```

Value literal names come from the v2.1.243 release note; confirm exact JSON
shape from Claude Code docs before applying (the changelog names the setting
but not the value schema).

**Verify before applying:** `cat .claude/settings.json && head -80 https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/CHANGELOG.md | grep -i promptCache` — settings absent + release note still names them → still applicable.

**Recommended verdict:** defer — no observed problem; low-risk cheap fix
available if one arises.
**Status:** PENDING — awaiting triage in PR review

---

## §12 · Reinforce "skills live in `.claude/skills/`" — Platform Aug 7 now auto-loads them from a mounted GitHub repo

**Sources**
- Claude Platform release note 2026-08-07:
  <https://platform.claude.com/docs/en/release-notes/overview> — "Claude
  Managed Agents sessions can now load skills from a GitHub repository. When
  a session mounts a repository, any skills in its root `.claude/skills`
  directory are discovered automatically at session start and available to
  the agent for that session."
- Claude Platform release note 2026-08-19 — "Agent Skills and the Skills API
  are out of beta on the Claude API. Requests no longer require the
  `skills-2025-10-02` beta header."

**Why it matters here**
The harness ships skills as symlinks from `skills/<name>/SKILL.md` in this
repo out to `~/.claude/skills/`. Consumer projects that install this harness
get the same convention. Claude Managed Agents now auto-discover skills at
`.claude/skills/` at repo root. The harness's `skills/` directory is one
level up (not at `.claude/skills/`), because the harness uses `~/.claude/skills/`
as the global install target, not per-repo installation.

There's a small drift risk: a consumer project that installs the harness and
also wants Managed Agents skill auto-discovery may want `.claude/skills/`
populated with symlinks to `~/.claude/skills/` too. That's a wider design
question (managed-agents adoption is still deferred; see 2026-04-19 §2 and
2026-05-06 §1). This § flags the alignment for the future.

**Concrete change (apply)** — one line in `README.md` "Skills directory
layout" section (currently near the top of CLAUDE.md) noting the Managed
Agents auto-discovery path, so future readers know the `.claude/skills/`
directory name is now Anthropic's official skill-discovery location:

```diff
 ## Skills directory layout

 - Source of truth: `skills/` in this repo.
 - Symlinked OUT to `~/.claude/skills/` (claude-harness ships skills to the user's global Claude Code config).
+- Anthropic's Claude Managed Agents auto-discover skills at `.claude/skills/`
+  in a mounted repository (Platform release note 2026-08-07). Harness
+  installs at `~/.claude/skills/` today, not per-repo; revisit
+  `.claude/skills/` layout if a consumer project adopts Managed Agents.
 - No incoming symlinks expected. If `skills/<x>` is itself a symlink, that's a bug — flag it.
```

**Payoff** — one line of forward-looking bookkeeping; a future consumer-project
Managed-Agents rollout will find the note and know where the harness diverges.

**Verify before applying:** `sed -n '/Skills directory layout/,/If \`skills/p' CLAUDE.md` — confirm the section still exists and hasn't already been reshaped around Managed Agents.

**Recommended verdict:** apply — one-line note, corroborates existing design.
**Status:** PENDING — awaiting triage in PR review

---

## §13 · Cache diagnostics API — a debugging path the harness doesn't have

**Source:** Claude Platform release note 2026-05-13:
<https://platform.claude.com/docs/en/release-notes/overview> —
"We've launched cache diagnostics in public beta. Pass
`diagnostics.previous_message_id` on a Messages request and the API reports a
`cache_miss_reason` explaining where the prompt cache prefix diverged from
the previous turn. Include the `cache-diagnosis-2026-04-07` beta header in
your requests."

**Why reject for this repo**
The endpoint targets `POST /v1/messages` — a direct Claude API call from an
application. The harness has no Claude API client of its own: it ships
skills and procedures that run inside Claude Code sessions, and Claude Code
itself owns the Messages call (the harness has no reach into
`diagnostics.previous_message_id`). The 2026-05-05 prompt-caching post
already produced an `AGENTS.md` guardrail on prefix stability; there is no
`.harness-state/` telemetry that would consume `cache_miss_reason` even if
we could set the header.

Revisit only if the harness ever ships a component that calls the Messages
API directly (e.g. a purpose-built evaluator or a `claude-api`-skill user
that measures cache hits).

**Verify before applying:** `grep -R "POST /v1/messages\|anthropic.messages" .` — if any component starts making direct API calls, this § flips from reject to spec.

**Recommended verdict:** reject — no Claude API surface in this harness today.
**Status:** PENDING — awaiting triage in PR review

---

## Not-in-scope this run (recorded for tracker)

The following posts were reviewed and are captured in
`reviewed-posts.md` with a one-line skip reason. They did not surface an
actionable harness change and did not warrant a numbered §:

- Claude Code Week 21 (2026-05-18 – 2026-05-22) — Auto mode on Pro plan / `/usage` / `/code-review`. `/code-review` already ships in `~/.claude/skills/code-review/` from Anthropic; auto mode on Pro is a consumer flag; `/usage` is UX. No harness change.
- Claude Code Week 23 (2026-06-01 – 2026-06-05) — Auto mode on Bedrock / GCP / Foundry. Cross-provider parity, not a harness change.
- Claude Code Week 25 (2026-06-15 – 2026-06-19) — Artifacts on Team/Enterprise, deny/ask param matching (`Tool(param:value)`), `/config key=value`, auto mode blocks destructive git. Consumer UX / Team-Enterprise scope.
- Claude Code Week 26 (2026-06-22 – 2026-06-26) — `claude mcp login/logout`, shell mode responds to command output, `/rewind` after `/clear`. Consumer UX.
- Claude Code Week 27 (2026-06-29 – 2026-07-03) — Sonnet 5 default, Claude in Chrome GA, subagents background by default, Claude Desktop on Linux beta, `/radio`. Sonnet 5 folded into §1; the rest are consumer UX.
- Claude Code Week 29 (2026-07-13 – 2026-07-17) — Artifacts call MCP connectors, screen reader mode, `/fork`, auto mode on cloud providers no longer needs opt-in var. Consumer / accessibility.
- Claude Code Week 33 (2026-08-10 – 2026-08-14) — auto-continue on usage-limit reset, fork mode default (folded into §10), `@`-mentions (folded into §8), GitLab MR support in `--worktree`. Consumer + folded.
- Claude Code Week 34 (2026-08-17 – 2026-08-21) — `/design` research preview, Concise output style, `ANTHROPIC_DEFAULT_MODEL` env var. `/design` is UI-mockup; `ANTHROPIC_DEFAULT_MODEL` is redundant with `.harness-profile` pin (rejected — profile is the correct control).
- Claude Platform release notes for Managed Agents (multiple 2026-06 → 2026-08 entries: budgets, advisor, inference geo, memory stores in self-hosted sandboxes) — bookkeeping alongside the deferred 2026-04-19 §2 (Managed Agents adoption). No harness surface today.
- Claude Platform release note 2026-05-11 — Claude Platform on AWS. Enterprise deployment surface; solo harness has no AWS touchpoint.
- Claude Platform release note 2026-08-05 — Inference hooks (Claude Enterprise). Enterprise compliance; out of scope.
- Claude Platform release note 2026-08-10 — Claude Sonnet 5 pricing held at $2/$10. Pricing, not methodology.
- Claude Platform release note 2026-08-11 — Compliance API returns Cowork/Claude-Code local session transcripts. Enterprise compliance.
- Claude Platform release note 2026-08-18 — Workbench renamed to Playground. Console UX.
- Claude Platform release note 2026-08-19 — Computer use out of beta, browser use tool launched, Files API out of beta, Admin API user management out of beta. Consumer/API GA; Skills API GA is called out in §12.
- Claude Platform release note 2026-08-20 — Python SDK v1.0 (httpx → httpx2 migration). No Python client in the harness.
