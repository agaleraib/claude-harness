# 2026-10-05 — Anthropic post review

Last reviewed-posts entry before this run: **2026-05-10** (~5 months of backlog).
Discovery scope capped at 15 posts; sources crawled: anthropic.com/news, anthropic.com/engineering, claude.com/blog, code.claude.com/docs/en/changelog.

Six posts produced suggestions and consolidated into four §s. Nine posts were triaged as skipped in the tracker — see `reviewed-posts.md` rows dated 2026-10-05 for the one-line reason on each.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Bump `.harness-profile` + loop defaults to Opus 5.5 / Sonnet 5.5 | apply | Opus 4.7 / Sonnet 4.6 / `opus-4.8` references are factually stale; Opus 5.5 (Sep 22) + Sonnet 5.5 (Sep 28) are the current GA coding models with large pricing/latency wins. |
| 2 | Run `/doctor prompt-audit` across `skills/` and `.claude/agents/` | apply | New Claude Code command (2.1.283, Sep 25) that explicitly audits CLAUDE.md/skills/agents for old-model patterns — zero cost to run, surfaces exactly the drift §1 fixes. |
| 3 | Repackage the catastrophic-command denylist as a Claude Code mod | defer | Mods (Oct 1) would remove the one global-settings human-TODO in `/run-loop`, but mods run unsandboxed and shipping a mod requires a plugin host; defer until plugin publishing is on the roadmap. |
| 4 | Publish `claude-harness` as a Claude plugin on the Marketplace | defer | Plugins (Sep 25) + Marketplace (Sep 23) enable one-click install, but the harness is solo-use + symlink-distributed today; revisit if/when a second user adopts it. |

---

## 1. Bump `.harness-profile` + loop review-backend default to Opus 5.5 / Sonnet 5.5

**Source posts:**
- https://www.anthropic.com/claude-opus-5-5 — Opus 5.5 (Sep 22, 2026). Model ID `claude-opus-5-5`. $4/$20 per 1M tokens, cached read $0.20, cache write $5. Terminal-Bench 4.0: 66.4%; FrontierCode v1.1: 54.4%. Positioned as the default coding model.
- https://www.anthropic.com/claude-sonnet-5-5 — Sonnet 5.5 (Sep 28, 2026). Model ID `claude-sonnet-5-5`. $2/$10 per 1M tokens, Terminal-Bench 4.0 70.6% (vs Sonnet 5's 10.3%). Default Sonnet in Claude Code per 2.1.284 changelog, 1M context.
- https://claude.com/blog/claude-opus-5-5-built-for-coding-sessions-that-use-more-context — Sep 24 context: Opus 5.5 costs ~40% less than Opus 5 for typical workloads, cached-read price drops 60%, output generation >30% faster. "You can now change effort levels during your sessions without resetting your cache."
- https://code.claude.com/docs/en/changelog 2.1.284 (Sep 28, 2026) — Sonnet 5.5 shipped as the new default Sonnet with 1M context.

**Problem:** The harness still pins the previous major family.

```
$ grep -c "opus-4-7\|opus-4\.8\|opus-4-6\|sonnet-4" (across *.md *.yml *.yaml *.ts *.json .harness-profile)
96
```

Representative hits:

- `.harness-profile`
  ```yaml
  model:
    primary: claude-opus-4-7
    fallback: claude-sonnet-4-6
    effort_default: xhigh   # derived from stakes.level: medium
  ```
- `skills/_shared/loop/run-loop-prod-deps.ts` — comment `// review: dispatchReview → AnthropicReviewBackend (opus-4.8) / OpenRouter / Codex`
- `skills/_shared/loop/test/dispatch-backends.test.ts` — `assert.equal(DEFAULT_REVIEW_BACKEND, 'anthropic-api:opus-4.8')`
- `skills/_shared/loop/test/live-test-runbook.md` — multiple runbook examples pinned to `opus-4.8`

**Concrete changes (apply order):**

1. Edit `.harness-profile`:
   ```diff
   -# Aligned with Anthropic's 2026-04-23 postmortem (Claude Code defaults Opus-4.7 users to xhigh).
   +# Aligned with Anthropic's 2026-04-23 postmortem (Claude Code defaults Opus-5.5 users to xhigh).
    model:
   -  primary: claude-opus-4-7
   -  fallback: claude-sonnet-4-6
   +  primary: claude-opus-5-5
   +  fallback: claude-sonnet-5-5
      effort_default: xhigh
   ```

2. Loop defaults: `DEFAULT_REVIEW_BACKEND` and surrounding comments/tests move from `anthropic-api:opus-4.8` → `anthropic-api:opus-5.5`. Grep the ~96 hits, mechanically replace, run `node --test skills/_shared/loop/test/*.test.ts`.

3. `skills/_shared/loop/test/live-test-runbook.md` — update the manual-runbook examples so a fresh live test produces the right UTC-stamped line in the "Run log" table.

4. Any CLAUDE.md / README refs ("Opus 4.7 / Sonnet 4.6") get the same bump — treat this as a single mechanical sweep, not an opportunity to rewrite copy.

**Expected payoff:** Removes a Sep-22-to-Oct-5 drift gap. The $4/$20 Opus-5.5 pricing + 1M-context Sonnet-5.5 are a straight upgrade for the orchestrator and the loop's review backend; no API-shape change (`claude-opus-5-5` and `claude-sonnet-5-5` are drop-in model IDs).

**Scope:** concrete, mechanical.

**Verify before applying:** `grep -rn "opus-4-7\|opus-4\.8\|opus-4-6\|sonnet-4" .harness-profile skills/_shared/ CLAUDE.md examples/*/CLAUDE.md 2>/dev/null | wc -l` — if the count is 0 the sweep has already landed and this § is a no-op; if the harness has adopted a different model family (e.g. 5.6+) prefer that.

**Recommended verdict:** apply — model migration is a routine sweep and the harness is behind by one major family; the only thing blocking it is clicking "do it."

**Status:** PENDING — awaiting triage in PR review

---

## 2. Run `/doctor prompt-audit` against `skills/` and `.claude/agents/`

**Source:** https://code.claude.com/docs/en/changelog version 2.1.283 (Sep 25, 2026): *"Added `/doctor prompt-audit` to audit CLAUDE.md files, skills, agents for old model patterns."*

**Why this matters now:** This command was built for exactly the drift §1 is cleaning up — Opus-4.x / Sonnet-4.x phrasing scattered across skill bodies. Running it costs one Claude Code session, gives machine-grounded output, and will catch patterns a hand-grep won't (e.g. "Opus 4.6+" phrasing in prose, outdated effort-slider references).

**Concrete action:**

```
$ claude   # inside /home/user/claude-harness
> /doctor prompt-audit
```

Review the audit's findings; land them in the same PR as §1 or as a follow-up `fix(audit):` commit. If the audit produces zero findings after §1 lands, this § is complete.

**Expected payoff:** Confirms §1 was exhaustive and surfaces the "fuzzy prose" drift grep won't catch (e.g. a skill that advises "default to Opus 4.6 for review" in natural-language instructions).

**Scope:** concrete, bounded (one audit run).

**Verify before applying:** `which claude && claude --version` to confirm Claude Code ≥ 2.1.283 is on PATH. If older, pending — bump Claude Code first or run audit in a fresh install.

**Recommended verdict:** apply — a cheap second pass that double-checks §1 using Anthropic's own tool.

**Status:** PENDING — awaiting triage in PR review

---

## 3. Repackage the `/run-loop` catastrophic-command denylist as a Claude Code mod

**Source:** https://claude.com/blog/claude-code-mods (Oct 1, 2026) — Claude Code "mods": TypeScript functions shipped inside plugins that hook into Claude Code events (tool.call, permission request, ui.render). *"A mod can block, modify, or retry tool calls."*

**Current state in the harness** (`CLAUDE.md`):

> The catastrophic-command denylist is a Claude Code **`PreToolUse` hook** the operator installs in `~/.claude/settings.json` (global). The matcher logic ships from `skills/_shared/loop/safety/denylist.ts`; wiring it into global settings is an operator action and is NOT done from a session — see the `/run-loop` skill's Human-only TODOs.

The hook currently requires the operator to hand-edit global settings — the single remaining human-only TODO in the `/run-loop` story.

**What a mod version would change:**

- Mod wraps the existing `denylist.ts` matcher as a `tool.call` hook that blocks matching commands (same semantics as the PreToolUse hook).
- Mod ships inside a plugin (`claude-harness-safety` or similar); installed via `/plugin install …`.
- Removes the "edit `~/.claude/settings.json`" step from `/run-loop`'s setup — one tool-neutral primitive replaces one Claude-only operator action.

**Caveats (why defer, not apply):**

- Mods run **unsandboxed with full machine access** per the Anthropic post. Shipping a mod to a user is a trust ask; today the denylist is one small matcher, but a plugin host inherits publishing-trust obligations.
- Mods require a plugin to live in — see §4. Standing up plugin publishing just for one hook is premature.
- The current operator-installed hook works fine for a solo maintainer and is auditable in one `grep` of `settings.json`.
- Mods' event model is TypeScript running inside Claude Code; the existing `denylist.ts` is already TypeScript, so the port is small — but the deferral is about distribution, not code.

**Scope:** speculative — the real cost is in the plugin-publishing path (§4), not the mod code itself.

**Verify before applying:** `cat skills/run-loop/SKILL.md | grep -A2 "Human-only TODO"` — if the human-only step is already gone (operator moved it elsewhere), this § is a no-op. Also re-check https://code.claude.com/docs/en/mods for a sandboxed-mode flag; if mods gain sandboxing, the trust objection weakens and this § should move toward apply.

**Recommended verdict:** defer until §4 lands (or until the harness gains a second user). The denylist already works via settings hook; the mod would only replace the one human-TODO, which is not worth standing up a plugin for by itself.

**Status:** PENDING — awaiting triage in PR review

---

## 4. Publish `claude-harness` as a Claude plugin on the Marketplace

**Source posts:**
- https://claude.com/blog/build-plugins-for-claude (Sep 25, 2026) — Plugins can bundle "MCP connectors, Agent Skills, or both" into a single installable unit. Published via directory submission; two pathways: a single MCP connector, or a plugin bundle hosted on GitHub. Each submission is safety-scanned. Analytics after publish.
- https://claude.com/blog/claude-marketplace (Sep 23, 2026) — Marketplace is the discovery/distribution surface for plugins + connectors + partner products + consulting partners. 2,000+ integrations at launch; developers submit via the connector/plugin submission flow.

**What this would change for the harness:**

- Today: user runs `~/.claude/harness/skills/setup-harness` from inside a target project; harness is symlinked into `~/.claude/skills/`.
- Plugin version: user runs `/plugin install claude-harness`; Claude Code resolves the plugin, installs skills + any hook mods (see §3), and `setup-harness` becomes a plugin-provided slash command.
- Updates: `/plugin update claude-harness` replaces the current `git pull` + re-run setup.
- Discoverability: Marketplace listing + analytics (installs by product surface, listing views, search).

**Why defer:**

- `.harness-profile` says `audience.kind: internal`, `size_estimate: "1"`. Shipping a plugin + Marketplace listing is overhead that pays off at team-of-many scale, not solo.
- Publishing requires a paid Claude plan (per the plugin post) and makes the harness a public artifact; today it's solo-use, and the Marketplace surface pulls in support obligations (bug reports, listing hygiene, version churn).
- Mods (§3) make more sense once a plugin exists to host them. If/when the maintainer decides to publish, §3 and §4 land as a pair.

**If the maintainer does want to publish**, the preparatory work is small: add a `plugin.json` manifest at repo root (skills already have `SKILL.md` with YAML frontmatter, so the plugin-bundle pathway should ingest them cleanly), decide on a `claude-harness` or `agalera/claude-harness` listing name, and submit via the directory portal.

**Scope:** speculative — not current need, but low-friction later.

**Verify before applying:** `grep "size_estimate\|audience.kind" .harness-profile` — if `size_estimate` is still `"1"` and `audience.kind` is still `internal`, the "solo tool" premise holds and defer stands; if it has moved to `size_estimate > 1` or `kind: external`, revisit this § and move toward apply.

**Recommended verdict:** defer until the harness gains a second maintainer or an explicit "I want others to install this" moment.

**Status:** PENDING — awaiting triage in PR review

---

## Posts skipped this run

Full one-line reasons live in `reviewed-posts.md` (search for `2026-10-05`). Quick summary:

| URL | Reason |
|-----|--------|
| https://www.anthropic.com/claude-fable-and-mythos-5-1 (Sep 1) | Fable is a creative-writing / TTS model; Mythos is still gated to Project Glasswing partners. No coding-harness surface. |
| https://claude.com/blog/how-to-prepare-for-ai-driven-code-modernization-projects (Sep 23) | Enterprise-services playbook (SI partners doing legacy migrations). No harness methodology delta. |
| https://claude.com/blog/projects-redesigned (Sep 17) | Claude.ai UX redesign (folder → conversation). Not Claude Code. |
| https://claude.com/blog/cowork-is-now-claude (Sep 16) | Cowork + chat consolidation under one Claude product. Non-coding surface. |
| https://claude.com/blog/claude-tag-now-supports-personal-connectors-in-channels (Sep 24) | Slack-side feature for Claude Tag. No harness affordance. |
| https://claude.com/blog/agents-you-can-coach-how-asana-builds-human-agent-teams-with-claude (Sep 29) | Customer success story; Managed-Agents territory already deferred (2026-04-19 §2). |
| https://claude.com/blog/giving-companies-more-control-over-their-ai-agents-with-nvidia (Sep 28) | NVIDIA enterprise partnership; no coding-harness surface. |
| https://claude.com/blog/how-anthropics-sales-team-rebuilt-inbound-with-claude-managed-agents (Sep 30) | Managed-Agents sales-ops case study. Non-coding surface. |
| https://claude.com/blog/claude-for-government-is-now-generally-available (Sep 30) | GTM / government compliance announcement; no harness surface. |

---

## Backlog touchpoints

- §1 (model bump) subsumes the "revisit when a new Opus/Sonnet ships" implicit review item from the May 2026 batch.
- §3 (mod packaging) and §4 (plugin publish) jointly cover the deferred-until-plugins-matter note from 2026-05-07 §3 (`updatedToolOutput`) and 2026-05-10 §2 (routines-as-a-cloud-primitive).
- No change to the deferred 2026-04-19 §2 (Managed Agents brain/hands split) — none of the September/October posts shift that call.
