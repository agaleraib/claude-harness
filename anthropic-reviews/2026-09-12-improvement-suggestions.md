# Anthropic-post review — 2026-09-12

Bridges a ~4-month gap since the last routine run (2026-05-10). Sources: the Claude
Code weekly changelog (`code.claude.com/docs/en/whats-new/2026-w22` through `-w34`,
directly reachable from this session) and dated model/feature announcements
paraphrased through third-party recaps (anthropic.com is currently unreachable
from the routine's network policy — see the tracker column `URL` for the
canonical Anthropic page, verify from a browser session before applying).

Each § below is scoped to **something the harness could actually change** —
either a config diff, a doc addition, or a "leave alone, we already do it"
audit. Every § ends with a `Verify before applying` line so a future maintainer
can re-check that the suggestion is still needed.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Update `.harness-profile` primary/fallback for Opus 5 + Sonnet 5 (post-May defaults) | spec | Model swap touches every model-pinned skill/agent/wave-doc; needs a survey pass, not a one-line edit |
| 2 | Extend `_shared/loop/safety/denylist.ts` to match Auto Mode: `git clean -fd`, `git stash drop`, `terraform destroy` | apply | Denylist gap vs. Anthropic's own auto-mode classifier — 3 concrete patterns, low risk |
| 3 | Migrate `.harness-profile` `model.fallback` scalar → list (`fallbackModel` supports up to 3) | apply | Schema-widening; today's single fallback becomes list of one, then the maintainer can append |
| 4 | Document `claude --safe-mode` as the canonical "is it the harness?" triage entry point | apply | One paragraph in `AGENTS.md`; concrete win for a debugging routine that already exists in `procedures/triage-quality-issues.md` |
| 5 | Note the `/goal` check-in feature (W34) parallels the harness's `today_goal.md` — decide whether to converge | defer until next `/session-start` iteration | Same shape, different owners; a merge is a spec-level call, not a scheduled edit |
| 6 | `ultracode` dynamic workflows overlap with the harness's `run-loop`/orchestrator | spec | Substitutes a primitive the harness rolled itself; needs a design pass, not a wave |
| 7 | Cross-session `ListAgents`/`SendMessage` (W32) as a `triage-parking` coordination surface | defer until team.size > 1 | Feature landed for multi-session workflows; solo maintainer has no second live session to message |
| 8 | Confirm harness is unaffected by TaskCreate/TodoWrite removal on Opus 4.8/Sonnet 5/Fable 5/Mythos 5 (W33) | reject — already in place | grep confirms zero usage in `skills/`, `procedures/`, `.claude/agents/` |

---

## 1. Update `.harness-profile` primary/fallback for the post-May 2026 model line

**Source(s):**
- `https://code.claude.com/docs/en/whats-new/2026-w22` — "Opus 4.8 is now the default on Max, Team Premium, Enterprise pay-as-you-go, and the Anthropic API" (May 25–29).
- `https://code.claude.com/docs/en/whats-new/2026-w27` — "Sonnet 5 is the new default model for Pro, Team Standard, and Enterprise subscription seats" (June 29 – July 3).
- `https://code.claude.com/docs/en/whats-new/2026-w30` — "Claude Opus 5 is the new default Opus model in Claude Code" (July 20–24).

Today's `.harness-profile` (checked 2026-09-12):

```yaml
model:
  primary: claude-opus-4-7
  fallback: claude-sonnet-4-6
  effort_default: xhigh
```

Both pins are two model families behind: Opus 5 is the current Opus default,
Sonnet 5 is the current Sonnet default. `claude-opus-4-7` still resolves per
Anthropic's changelog, but the *effort defaults* baked into new models have
shifted (W22: "Opus 4.8 defaults to high effort; use /effort xhigh for harder
tasks") — an update to `model.primary` is not just a string swap, it invalidates
the note under `effort_default` about the 2026-04-23 postmortem's xhigh floor.

Proposed diff (kept as a **spec** because it also touches `skills/project-init/SKILL.md`,
`docs/waves/wave1-harness-model-pin-profile-schema.md`, `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md`,
and every wave doc that hardcodes `claude-opus-4-7` — 8 files by grep):

```diff
 model:
-  primary: claude-opus-4-7
-  fallback: claude-sonnet-4-6
+  primary: claude-opus-5
+  fallback: [claude-opus-4-8, claude-sonnet-5, claude-sonnet-4-6]
   effort_default: xhigh
```

Expected payoff: aligns dispatch defaults with the models Claude Code itself
picks on this account, avoids the `/model` picker having to override on every
session start, and keeps three retreat rungs (see §3 for the fallback-list
schema change that this depends on).

**Verify before applying:** `grep -RE "claude-(opus-4-7|sonnet-4-6)" .harness-profile skills/project-init docs/specs docs/waves` — the count of pinned references tells you the blast radius. If Anthropic has since deprecated `claude-opus-4-7` (check `platform.claude.com/docs/en/release-notes/overview`), the update is no longer optional.

**Recommended verdict:** spec — the diff itself is trivial, but the harness has an entire wave (Wave 1) and spec (2026-04-19) built around the current pin; a fresh spec should record the migration and the surrounding renames rather than a silent edit.
**Status:** PENDING — awaiting triage in PR review

---

## 2. Extend `_shared/loop/safety/denylist.ts` to match Auto Mode's destructive-git blocklist

**Source:** `https://code.claude.com/docs/en/whats-new/2026-w25` — "Auto mode now blocks destructive git commands (`git reset --hard`, `git clean -fd`, `git stash drop`) when you didn't ask to discard local work, and blocks `terraform destroy` unless you asked for the specific stack" (June 15–19).

Current harness denylist (`skills/_shared/loop/safety/denylist.ts`) covers:

```
rm -rf of a path outside the active worktree
git reset --hard across branches
```

It does NOT cover `git clean -fd`, `git stash drop`, or `terraform destroy`. Auto
Mode's classifier considers these three destructive-by-default in the same sense
as `reset --hard`. Since the harness denylist is a PreToolUse hook meant to
compose with Auto Mode (per `AGENTS.md` §"Loop protocol" and Wave-25 fixtures),
lifting Auto Mode's three additions closes the gap.

Proposed diff (add three entries; the pattern format matches the two existing entries):

```typescript
// skills/_shared/loop/safety/denylist.ts
{
  describe: 'git clean -fd (destructive discard of untracked files/dirs)',
  // Match `git clean` with -f (force) plus -d (dirs); Auto Mode also blocks -x/-X variants.
  ...
},
{
  describe: 'git stash drop / clear (unrecoverable stash discard)',
  ...
},
{
  describe: 'terraform destroy (infra teardown)',
  // Auto Mode blocks unless the specific stack was named in-session; harness has no in-session
  // stack-name signal today, so the default here is unconditional block until a --stack arg
  // whitelist is added.
  ...
},
```

Expected payoff: closes a documented gap between the harness's `_shared/loop`
guardrail and Anthropic's own Auto Mode classifier — matters most for the
issues-source loop, where Codex or a subagent might issue one of these against
a dirty worktree the maintainer forgot about. The `_shared/loop` fixtures under
`skills/_shared/loop/lib/` already exercise the two existing entries, so
extending the table is one test-fixture addition per entry.

**Verify before applying:** `grep -E "reset --hard|clean -fd|stash drop|terraform destroy" skills/_shared/loop/safety/denylist.ts` — if all four are already present, this § is done; otherwise the missing entries are the concrete diff.

**Recommended verdict:** apply — three literal patterns, existing table, existing test scaffolding.
**Status:** PENDING — awaiting triage in PR review

---

## 3. Widen `.harness-profile` `model.fallback` from scalar → ordered list

**Source:** `https://code.claude.com/docs/en/whats-new/2026-w24` — "`fallbackModel` configures up to three fallback models tried in order when the primary is overloaded or unavailable" (June 8–12).

Today the harness schema (`skills/project-init/SKILL.md` §"model block" and the
`.harness-profile` at repo root) uses a **single-string** fallback:

```yaml
model:
  primary: claude-opus-4-7
  fallback: claude-sonnet-4-6   # scalar
```

Claude Code's CLI now consumes up to three ordered fallbacks. Migrating the
harness to a list form gives §1 room to declare `[claude-opus-4-8, claude-sonnet-5, claude-sonnet-4-6]`
and matches upstream vocabulary; the change is source-compatible if the loader
accepts either scalar or list.

Proposed diff (schema doc, `skills/project-init/SKILL.md`):

```diff
-| `model.fallback` | yes | `claude-sonnet-4-6` | Used when the orchestrator demotes for cost/latency. |
+| `model.fallback` | yes | `[claude-sonnet-5, claude-sonnet-4-6]` | List of up to three fallback models tried in order when the primary is overloaded or unavailable. A scalar is accepted for back-compat (treated as a one-element list). |
```

Any loader in `skills/_shared/` that parses `model.fallback` needs a
"if string, wrap in [ ]" line — search below.

Expected payoff: aligns the harness's declared fallback slot with the underlying
Claude Code primitive; the harness's `primary → fallback` demotion path today
skips straight to Sonnet 4.6 rather than trying Opus 4.8 or Sonnet 5 first, both
of which are cheaper *and* newer than the pinned fallback.

**Verify before applying:** `grep -RnE "fallback:|model\.fallback" skills/ .harness-profile` — count the read sites; if any reader assumes `.fallback` is a string, the migration also needs a loader tweak.

**Recommended verdict:** apply — schema widening, back-compat with scalar; the payoff scales with §1.
**Status:** PENDING — awaiting triage in PR review

---

## 4. Document `claude --safe-mode` as the canonical "is it the harness?" triage entry point

**Source:** `https://code.claude.com/docs/en/whats-new/2026-w24` — "Start Claude Code with `--safe-mode`, or set `CLAUDE_CODE_SAFE_MODE`, to launch with all customizations disabled: CLAUDE.md, skills, plugins, hooks, MCP servers, and custom commands and agents do not load. Authentication, model selection, built-in tools, and permissions still work. If a problem disappears in safe mode, one of those surfaces is the cause." (June 8–12).

The harness already has a page for this decision — `procedures/triage-quality-issues.md`
(added by 2026-04-26 §2, "is-it-the-model-or-your-harness?"). Its flowchart is
about model version regressions; the new `--safe-mode` flag adds a **second
axis** — "is a piece of harness customization the cause?" — that today the
procedure doesn't mention.

Proposed diff (append one section to `procedures/triage-quality-issues.md`):

```markdown
## Is a piece of harness customization the cause? (added 2026-09-12)

`claude --safe-mode` (or `CLAUDE_CODE_SAFE_MODE=1`) launches Claude Code with
every user customization disabled: `CLAUDE.md`, skills, plugins, hooks, MCP
servers, custom commands, custom agents. Authentication, model selection,
built-in tools, and permissions still work. If a symptom vanishes in safe mode,
one of those surfaces is at fault — bisect by re-enabling categories one at a
time.

Source: https://code.claude.com/docs/en/whats-new/2026-w24 (feature landed
v2.1.169).
```

Expected payoff: the harness ships enough customization (18 skills, PreToolUse
denylist hook per `CLAUDE.md`, per-skill agents under `.claude/agents/`) that a
"weird Claude behavior" symptom often needs a bisect. `--safe-mode` is the
one-shot bisect entry the routine's own troubleshooting doc should point at.

**Verify before applying:** `grep -iE "safe-mode|CLAUDE_CODE_SAFE_MODE" procedures/ AGENTS.md README.md` — if any file already documents the flag, integrate there instead of re-adding.

**Recommended verdict:** apply — one paragraph, docs-only, immediate payoff on the next quality-regression session.
**Status:** PENDING — awaiting triage in PR review

---

## 5. `/goal` check-in feature parallels the harness's `today_goal.md` — decide whether to converge

**Source:** `https://code.claude.com/docs/en/whats-new/2026-w34` — "When background tasks keep a `/goal` waiting, Claude checks in on them after 30 minutes instead of waiting indefinitely and keeps checking in, at longer intervals while the session sits idle; set `CLAUDE_CODE_GOAL_CHECKIN_MINUTES=0` to opt out" (August 17–21).

Claude Code introduced a first-party `/goal` primitive somewhere in its late-July
/ August rollout (the changelog entries reference it as an existing feature by
W34). The harness's `skills/session-start/SKILL.md` writes the day's goal to
`.harness-state/today_goal.md` and `skills/session-end/SKILL.md` reads it back —
same UX shape (single goal, session-scoped), different owner (harness YAML file
vs. built-in in-session state).

The overlap is **speculative for now**: I could not confirm the exact `/goal`
data-model without reaching claude.com/blog (blocked), and the harness's
`today_goal.md` is used by `session-end`, `park`, and `harness-status` — a merge
is more than a copy-paste.

Rather than propose a diff, capture the question:

> Does the built-in `/goal` (with `CLAUDE_CODE_GOAL_CHECKIN_MINUTES`) supersede
> `.harness-state/today_goal.md`? If yes, session-start writes into `/goal`
> instead of a file, and session-end reads from `/goal`. If no, they coexist
> and the redundancy is documented so a future contributor doesn't propose a
> merge without owning the downstream migration.

**Verify before applying:** `grep -RnE "today_goal|current_micro" skills/ .harness-state/` catalogs today's readers and writers; a browser fetch of `https://claude.com/blog/introducing-goal-in-claude-code` (or the equivalent) closes the data-model question. scope: speculative

**Recommended verdict:** defer until next `/session-start` iteration — the merge is a design question, not a wave; safe to leave both surfaces coexisting until a session where `/goal` misbehaves and the maintainer has to pick a side.
**Status:** PENDING — awaiting triage in PR review

---

## 6. `ultracode` dynamic workflows overlap with the harness's `run-loop` / orchestrator dispatch

**Source(s):**
- `https://code.claude.com/docs/en/whats-new/2026-w22` — "A workflow is an orchestration script Claude writes for your task and runs across many subagents in the background. Use one when a task is too large for one conversation to coordinate … Manage runs with `/workflows`." (May 25–29).
- `https://code.claude.com/docs/en/whats-new/2026-w23` — "The trigger keyword for dynamic workflows changed from `workflow` to `ultracode`" (June 1–5).
- `https://code.claude.com/docs/en/whats-new/2026-w30` — subagent depth chains capped at 5 levels; `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` default 20.

The harness's `skills/run-loop/` and orchestrator agent (`.claude/agents/orchestrator.md`)
implement much of what `ultracode` provides:

- A TypeScript engine (`skills/_shared/loop/`) drives a plan → dispatch →
  verify → merge cycle.
- The engine's `dispatch/review.ts` fans work out to Codex + Opus-4.8 reviewers.
- Wave-21 evidence shows this working live against a throwaway repo.

`ultracode` is a competing primitive: Claude writes the orchestration JS,
Anthropic's runtime executes it, and up to 1,000 subagents run in the background
while the maintainer keeps a single interactive session. It solves the same
problem (`run-loop` is capped at ~20 concurrent subagents by W30's default) with
a different governance model (Anthropic-owned JS runtime + `/workflows`
management vs. harness-owned TS engine + `.harness-state/` receipts).

The question the harness needs to answer:

> Is `_shared/loop` a durable investment — because it enforces the
> AFK/HITL/blocked classifier, receipt discipline, and the AGENTS.md loop
> contract that `ultracode` does not — or is `ultracode` now the primitive
> `run-loop` should compose on top of, replacing the concurrency + retry layer
> and keeping only the classifier + receipt layer?

Either answer is defensible. A spec should record which the maintainer picked
and why, because a future contributor looking at both will otherwise pick
whichever they saw last. scope: speculative

**Verify before applying:** `grep -RE "ultracode|/workflows|CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS" AGENTS.md skills/run-loop skills/_shared/loop` — if any reference already exists, integrate there; otherwise the spec is greenfield.

**Recommended verdict:** spec — architectural decision, not a wave; a `spec-planner` pass with the AGENTS.md loop protocol on one side and the ultracode primitive on the other is the right shape.
**Status:** PENDING — awaiting triage in PR review

---

## 7. Cross-session `ListAgents` / `SendMessage` (W32) as a `triage-parking` coordination surface

**Source:** `https://code.claude.com/docs/en/whats-new/2026-w32` — "Your Claude Code sessions can now message each other. Claude discovers your other sessions with the `ListAgents` tool and sends with `SendMessage`, either when you ask it to or on its own, such as after a change in one session affects what another is working on. A message is text Claude writes for the other session, never your conversation history or files. Available on macOS and Linux. Requires v2.1.224 or later." (August 3–7).

The harness's `skills/triage-parking/` today owns the "convert parked
[auto-ok] items into draft PRs" flow, which runs single-session against
`parking_lot.md`. In a multi-session world — one session actively coding, a
second running the `triage-parking` skill in the background — `SendMessage`
could be the coordination surface: the coding session can nudge the parking
session ("I just closed the Wave-26 spec, re-scan for now-actionable items")
without either session touching the other's transcript.

Solo-single-session use today makes this a **defer**: the maintainer is only
ever running one session at a time, so there's no second agent to message. If
the harness ever grows a background-runner posture (see §6, or a
`claude self-hosted-runner`-based CI arm), this becomes actionable.

**Verify before applying:** `.harness-profile` still says `team.size: solo`. If that flips to a multi-runner posture, or if the maintainer starts running `claude agents` in the background routinely, revisit this row.

**Recommended verdict:** defer until team.size > 1 or a background-runner posture is adopted.
**Status:** PENDING — awaiting triage in PR review

---

## 8. Confirm TaskCreate / TodoWrite deprecation on newer models doesn't affect the harness (W33)

**Source:** `https://code.claude.com/docs/en/whats-new/2026-w33` — "The task-tracking tools, such as `TaskCreate`, `TaskUpdate`, and `TodoWrite`, are **no longer available on Opus 4.8, Sonnet 5, Fable 5, Mythos 5, and later models in those families**; set `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` to re-enable them" (August 10–14).

`grep -rE "TaskCreate|TaskUpdate|TodoWrite" /home/user/claude-harness` returns
**zero matches** — no harness skill, procedure, or agent depends on the
task-tracking tools. Nothing to change; call the row done in the tracker so a
future reviewer doesn't re-open it.

**Verify before applying:** `grep -rE "TaskCreate|TaskUpdate|TodoWrite" skills/ procedures/ .claude/ AGENTS.md CLAUDE.md` — if the count is still 0, the row is `no_change_needed`; if any usage crept in (e.g., a new skill), the fix is either avoiding the tool or opt-in via `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` at the session boundary.

**Recommended verdict:** reject — already-in-place (no usage exists), so nothing to do; the row is here as an audit receipt.
**Status:** PENDING — awaiting triage in PR review
