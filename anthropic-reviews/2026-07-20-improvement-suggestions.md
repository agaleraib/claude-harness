# Anthropic post review — 2026-07-20

Coverage window: 2026-05-11 → 2026-07-20 (last tracked review was 2026-05-10). Cap of 15 posts respected. Skipped posts recorded in `reviewed-posts.md` with one-line reasons.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Cite "Steering Claude Code" in AGENTS.md / README as the external endorsement of the harness's CLAUDE.md-plus-skills-plus-subagents-plus-hooks mix | apply | Anthropic's own taxonomy matches the harness's; a one-link cite raises credibility with a ~2-min doc edit |
| 2 | Cite the "How we contain Claude" 93 % approval-fatigue / 83 % auto-mode-block data in `setup-harness` Auto Mode section | apply | First-party evidence for the harness's Auto-Mode-plus-hooks layering; strengthens the same section that already carries the May 8 auto-mode citation |
| 3 | Audit `skills/_shared/loop/safety/denylist.ts` against the Claude Code v2.1.183 / v2.1.187 destructive-command blocks (git checkout / clean / stash drop, terraform destroy, pulumi destroy) | apply | Claude Code now blocks these client-side; the harness's own denylist covers `reset --hard` cross-branch, `rm -rf`, force-push, prod deploy, destructive DB, `curl \| sh`, but not these newer categories — worktree items should not be looser than the host tool |
| 4 | Refresh `.harness-profile` model pin — Sonnet 5 (native 1M ctx, June 30) is the new Claude Code default; Fable 5 (June 9, redeployed July 1) is the new top of stack. Current pin is Opus 4.7 primary / Sonnet 4.6 fallback | spec | Model matrix is now two generations behind; also has to reconcile with `dispatch/review.ts:127` already defaulting to Opus 4.8 — worth a design pass, not a drive-by rename |
| 5 | `/verify` and `/code-review` no longer auto-invoke (v2.1.215, July 19) — audit harness docs that assume auto-invocation | apply | Cheap doc fix; matters because AGENTS.md-style harnesses that lean on auto-invocation start silently no-op'ing after the July 19 release |
| 6 | "Subagents run in background by default" (v2.1.198, July 1) — verify orchestrator / generator dispatch is unaffected | defer until observed pain | Repo grep finds no `run_in_background` / `background:` assumptions in `skills/`; loop dispatch runs through Codex / Anthropic API adapters, not the Task tool. Nothing to fix today. |

Sources referenced:
- <https://www.anthropic.com/engineering/how-we-contain-claude> — "How we contain Claude across products" (Anthropic engineering, May 2026; discovered via public references)
- <https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more> — "Steering Claude Code: when to use CLAUDE.md, skills, hooks, and subagents" (claude.com/blog, June 18 2026)
- <https://code.claude.com/docs/en/changelog> — Claude Code changelog (v2.1.169 → v2.1.215, June 8 – July 19 2026)
- <https://www.anthropic.com/news/claude-fable-5-mythos-5> — "Claude Fable 5 and Claude Mythos 5" (Anthropic news, June 9 2026)
- <https://www.anthropic.com/news/redeploying-fable-5> — "Redeploying Claude Fable 5" (Anthropic news, June 30 2026)
- <https://code.claude.com/docs/en/agent-teams> — "Orchestrate teams of Claude Code sessions" (docs, updated June 15 2026)

---

## 1. Cite "Steering Claude Code" in AGENTS.md / README as the external endorsement of the harness's method mix

**Source.** [Steering Claude Code: when to use CLAUDE.md, skills, hooks, and subagents](https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more) — claude.com/blog, June 18 2026. The post enumerates the seven official ways to shape Claude Code: `CLAUDE.md`, rules, skills, subagents, hooks, output styles, and system-prompt appends — the exact stack this harness already installs.

**Repo state (confirmed).** `grep -rn "steering\|Steering Claude"` in the repo returns no matches. `AGENTS.md` and `README.md` describe the mix in the harness's own words but never anchor it to Anthropic's own taxonomy.

**Concrete diff.** Add one paragraph to `AGENTS.md` (adjacent to the "Skills" or "Layering" section) and a matching bullet to `README.md`:

> Anthropic's own taxonomy of steering methods for Claude Code — `CLAUDE.md`, rules, skills, subagents, hooks, output styles, system-prompt appends — is laid out in [Steering Claude Code](https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more) (2026-06-18). The harness uses all seven; this repo is one operator's opinionated composition of them.

**Payoff.** External validation for the harness's design at essentially zero cost; makes the harness legible to newcomers who read Anthropic's docs first. No behaviour change.

**Verify before applying:** `grep -rn "steering-claude-code" /home/user/claude-harness --include='*.md'` returns zero hits (add the cite only if still absent).

**Recommended verdict:** apply — trivial doc edit, high credibility payoff.

**Status:** PENDING — awaiting triage in PR review

---

## 2. Cite "How we contain Claude" 93 % approval-fatigue / 83 % auto-mode-block data in `setup-harness` Auto Mode section

**Source.** [How we contain Claude across products](https://www.anthropic.com/engineering/how-we-contain-claude) — Anthropic engineering, May 2026. The post reports that Claude Code users approve ~93 % of permission prompts (approval fatigue) and that Auto Mode blocks ~83 % of risky behaviour before execution. Both numbers directly justify a layered posture: hooks as hard rules, then Auto Mode's classifier for the residual — which is exactly what `setup-harness/SKILL.md:139-149` already recommends.

**Repo state (confirmed).** `grep -rn "how we contain\|blast radius\|93%\|approval fatigue"` returns only unrelated `blast radius` uses (in `docs/specs/2026-06-14-run-loop-engine.md` etc.). No mention of the containment post or its statistics. `setup-harness/SKILL.md:141` currently cites Auto Mode's May 2026 GA but has no first-party statistic backing the "hooks-first, classifier-second" layering claim.

**Concrete diff.** In `skills/setup-harness/SKILL.md`, append one sentence to the paragraph at line 141:

> Anthropic's own data ([How we contain Claude across products](https://www.anthropic.com/engineering/how-we-contain-claude), 2026-05) shows Claude Code users approve ~93 % of permission prompts and Auto Mode blocks ~83 % of risky behaviour before execution — which is why the harness treats hooks as hard rules (fires before the classifier) and lets Auto Mode handle the residual.

**Payoff.** Turns a "trust me" claim into a "here's the number" claim in a place operators actually read.

**Verify before applying:** `grep -rn "how-we-contain-claude" /home/user/claude-harness --include='*.md'` returns zero hits, AND the WebFetch of <https://www.anthropic.com/engineering/how-we-contain-claude> still contains the two statistics (Anthropic may republish or restate over time).

**Recommended verdict:** apply — one-sentence doc fix, first-party citation.

**Status:** PENDING — awaiting triage in PR review

---

## 3. Audit `skills/_shared/loop/safety/denylist.ts` against Claude Code v2.1.183 / v2.1.187 client-side destructive-command blocks

**Source.** Claude Code [changelog](https://code.claude.com/docs/en/changelog): v2.1.183 (June 19 2026) added client-side blocks for destructive git commands (`git reset`, `git checkout` when discarding, `git clean`, `git stash drop`); v2.1.187 (June 23 2026) added `terraform destroy` / `pulumi destroy` blocks and org-level model restrictions. These are host-tool guards that fire even in auto mode.

**Repo state (confirmed).** `sed -n '190,270p' skills/_shared/loop/safety/denylist.ts` shows the harness's universal denylist tier currently covers: `rm -rf` escaping worktree, force-push to `master`/`main`, `git reset --hard` naming another ref, prod-deploy heuristic (`deploy|release|publish|push` × `prod|production|live`), destructive DB (`drop|truncate|delete from`, `supabase … reset`), and `curl \| sh`. It does NOT cover `git checkout <file>` (discard-local-changes), `git clean -fd`, `git stash drop`, `terraform destroy`, or `pulumi destroy`. `grep` for those literals in `denylist.ts` returns zero matches.

**Concrete diff (sketch).** Add five entries to the `UNIVERSAL_RULES` array in `skills/_shared/loop/safety/denylist.ts`. Example shape (matching the file's existing style):

```ts
{
  id: 'git-checkout-discard',
  describe: 'git checkout that discards local file changes',
  matches: (c) => c.bin === 'git' && c.tokens.includes('checkout')
    && c.tokens.some((t) => t === '--' || t.startsWith('--')),
},
{ id: 'git-clean-force', describe: 'git clean -f/-fd/-fdx', matches: /* … */ },
{ id: 'git-stash-drop', describe: 'git stash drop / clear', matches: /* … */ },
{ id: 'terraform-destroy', describe: 'terraform destroy', matches: (c) => c.bin === 'terraform' && c.tokens.includes('destroy') },
{ id: 'pulumi-destroy',   describe: 'pulumi destroy',   matches: (c) => c.bin === 'pulumi'   && c.tokens.includes('destroy') },
```

Add the corresponding tests under `skills/_shared/loop/safety/*.test.ts` (the file has an existing test pattern — see `guardrails.ts` companions).

**Payoff.** Removes an asymmetry where an autonomous `/run-loop` worktree lane can run destructive commands that a plain Claude Code session in the same repo cannot. The harness's own AGENTS.md `## Safety` philosophy is that the loop is "denylist-only" for worktree items — that promise only holds if the denylist keeps pace with the host tool.

**Verify before applying:** run `Grep 'checkout\|stash drop\|terraform destroy\|pulumi destroy' skills/_shared/loop/safety/denylist.ts` — if zero hits (as of this writing), the audit is still needed. Also re-fetch the Claude Code changelog and confirm v2.1.183 / v2.1.187 entries have not been superseded or narrowed.

**Recommended verdict:** apply — closes a real, quantifiable gap; ~30 min work + tests.

**Status:** PENDING — awaiting triage in PR review

---

## 4. Refresh `.harness-profile` model pin — Sonnet 5 + Fable 5 landed, current pin is two generations behind

**Sources.**
- [Claude Fable 5 and Claude Mythos 5](https://www.anthropic.com/news/claude-fable-5-mythos-5) — Anthropic news, June 9 2026 (release).
- [Redeploying Claude Fable 5](https://www.anthropic.com/news/redeploying-fable-5) — Anthropic news, June 30 2026 (redeployed after the June 12 → June 26 export-control pause).
- [Claude Code changelog](https://code.claude.com/docs/en/changelog) v2.1.197 (June 30 2026): "Claude Sonnet 5 released: native 1M-token context, default model, promotional pricing."

**Repo state (confirmed).**
- `.harness-profile:29-33` pins `primary: claude-opus-4-7` / `fallback: claude-sonnet-4-6`.
- `skills/project-init/SKILL.md:152-153,206-207` documents the same defaults.
- `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md:139,225,233-234` and `docs/waves/wave1-harness-model-pin-profile-schema.md:33-34,45-47,79` bake `claude-opus-4-7` / `claude-sonnet-4-6` into acceptance criteria.
- `skills/_shared/loop/dispatch/review.ts:127` already defaults review to `claude-opus-4-8` (loop-review surface is one generation newer than the orchestrator pin).
- Numerous `docs/waves/wave*.md` runbooks record Opus 4.8 as the "session model" for `/run-wave` fixtures.

**Why not "apply" (why `spec`).** Three moving pieces have to reconcile:
1. Orchestrator pin (`.harness-profile.model.primary`).
2. Loop-review pin (`dispatch/review.ts` — already Opus 4.8).
3. `stakes.level → effort_default` mapping (`.harness-profile:22-27`) that was originally calibrated against the April 23 Opus 4.7 postmortem. Sonnet 5's native 1M context could change the calculus for the `medium → xhigh` default.

A drive-by rename risks producing a state where the primary is newer than the acceptance-criteria docs assume. Route through `/spec-planner` to produce a migration plan that touches all three surfaces together and updates `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md` in-lock-step.

**Verify before applying:** re-check `yq '.model.primary' /home/user/claude-harness/.harness-profile` — if it still returns `claude-opus-4-7`, the pin is still stale. Also re-fetch <https://www.anthropic.com/news/claude-fable-5-mythos-5> and the Claude Code changelog v2.1.197 entry to confirm Sonnet 5 remains the Claude Code default (a subsequent release could have swapped it).

**Recommended verdict:** spec — three-file change with an acceptance-criteria doc that has to move in lockstep; not a drive-by.

**Status:** PENDING — awaiting triage in PR review

---

## 5. `/verify` and `/code-review` no longer auto-invoke (v2.1.215, July 19) — sweep harness docs that assume auto-invocation

**Source.** [Claude Code changelog](https://code.claude.com/docs/en/changelog) v2.1.215 (July 19 2026): "`/verify` and `/code-review` skills no longer run automatically; invoke them explicitly." This reverses the auto-invocation behaviour that a handful of harness docs quietly depended on.

**Repo state (confirmed).**
- `README.md:425` correctly frames the local `code-reviewer` agent as "invoked synchronously by `/commit`" — this is unaffected because `/commit` explicitly calls it.
- `docs/co-vibe-protocol.md:38,80,97` reads "Code → `/verify` (if UI) or run tests." and "`/verify` passed (if UI)". These lines predate the July 19 change and don't specify whether the invocation is explicit or auto. After July 19, only explicit invocation works, so any operator reading these lines and expecting auto-invocation will get silence.
- `docs/specs/2026-06-14-run-loop-engine.md:221` — "Run `/code-review` on the diff (`high` inline; `ultra` only if the item declares …)" — describes an explicit call inside the loop, so it's unaffected but worth a re-read.

**Concrete diff.** In `docs/co-vibe-protocol.md`, tighten the three `/verify` mentions to make explicit invocation the assumed shape. Example, for line 38:

> Code → **explicitly invoke** `/verify` (if UI) or run tests. As of Claude Code v2.1.215 (2026-07-19), `/verify` does not auto-invoke on session events — it must be typed.

Same one-clause edit for lines 80 and 97.

**Payoff.** Prevents the silent-no-op class of bug where a `/co-vibe`-style operator assumes the skill fired and reads a green tree that was never verified.

**Verify before applying:**
1. `grep -rn "/verify\|/code-review" /home/user/claude-harness/docs --include='*.md'` still shows the three co-vibe lines with no "explicit" caveat.
2. Re-fetch the Claude Code changelog and confirm v2.1.215's revert of auto-invocation has not been reverted by a subsequent point release.

**Recommended verdict:** apply — three-line doc edit, closes a silent-failure hole.

**Status:** PENDING — awaiting triage in PR review

---

## 6. "Subagents run in background by default" (v2.1.198, July 1) — no repo drift, but log the check

**Source.** [Claude Code changelog](https://code.claude.com/docs/en/changelog) v2.1.198 (July 1 2026): "Subagents run in background by default." Behavioural default change for the Agent / Task tool.

**Repo state (confirmed).** `grep -rn "run_in_background\|background: true\|background:true\|subagent.*background"` inside `skills/` returns zero matches. The harness's `/run-loop` dispatches through explicit adapters (`skills/_shared/loop/dispatch/backends.ts`, `dispatch/implement.ts`, `dispatch/review.ts`) that shell out to Codex or the Anthropic API — none of them go through Claude Code's Task-tool subagent, so the default flip does not change loop behaviour.

**Why defer.** Nothing to fix today. The reason to file the check anyway is that if any future harness skill wires up `Agent(...)` invocations, it will inherit the background default; the author should know to pass `run_in_background: false` when a synchronous return is required. This warrants at most a one-sentence note in `AGENTS.md` §Skills — but that's speculative until the first such skill is written.

**Verify before applying:** `grep -rn "Agent tool\|subagent_type\|run_in_background" /home/user/claude-harness/skills --include='*.md' --include='*.ts'` — if any harness skill starts referencing the Agent tool directly, revisit this row.

**Recommended verdict:** defer until observed pain — no current harness skill uses the Agent tool directly; nothing to fix today.

**Status:** PENDING — awaiting triage in PR review

---

## Not turned into §s (in-scope but no harness action)

Also reviewed and skipped (rows appended to `reviewed-posts.md`):

- Anthropic Economic Index: June 2026 report — research release, no harness surface.
- "How Claude's values vary by model and language" (July 13 2026 research) — research release.
- Claude Science launch (July 2026) — vertical product, no coding-harness surface.
- Alibaba distillation-attack Senate letter (June 10) — policy news.
- Anthropic $50B US infrastructure investment (June) — capital news.
- Anthropic drug-discovery program (June 30) — vertical news.
- `anthropics/knowledge-work-plugins` open-source drop (May 26) — Cowork/knowledge-work plugins, out of scope for a code harness (harness ships skills via `~/.claude/skills/` symlink, not plugins).
- Claude Code v2.1.169 self-hosted `post-session` hook — self-hosted-deployment surface, not the harness's Anthropic-hosted path.
- Claude Code v2.1.185 stream-stall hint tweak — UX polish; no harness surface.
- Claude Code v2.1.200 "default" mode renamed "Manual" — string rename; no repo mentions of `defaultMode: "default"` (only `defaultMode: "auto"` in `setup-harness/SKILL.md:147`), so nothing to update.
