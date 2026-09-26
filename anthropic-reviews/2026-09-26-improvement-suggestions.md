# Anthropic post review — 2026-09-26

Discovery window: 2026-05-11 → 2026-09-26 (from the tracker's most recent entry, 2026-05-10). Cap: 15 posts. Sources scanned: `anthropic.com/news`, `anthropic.com/engineering`, `claude.com/blog`, `code.claude.com/docs/en/changelog`, `resources.anthropic.com`, `anthropic.com/research`, `anthropic.com/institute`.

Nearly all news-page items in the window are safety, bio-science, capacity, or enterprise-partnership announcements that don't touch a coding harness — skipped in the tracker with reasons. Four items produced actionable §s below; one landed in `defer` because the pattern is real but the scale is wrong for a solo repo today.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Wire `/doctor prompt-audit` into a periodic harness check | apply | New Sept 25 Claude Code diagnostic (v2.1.283) audits CLAUDE.md/skills/agents for stale-model patterns; harness owns exactly those artifacts |
| 2 | Cite May 25 containment post as evidence in AGENTS.md loop-protocol § | apply | One-line evidence add; matches the existing sandcastle-default + denylist design |
| 3 | Decide on `.harness-profile` model refresh to Opus 5.5 / Sonnet 5 fallbacks | spec | Sonnet 5 shipped 2026-06-30, Opus 5.5 became Claude Code default 2026-09-22; profile still pins 4.7/4.6 fallback. Blast radius wants a spec pass |
| 4 | Add diversity + conflict-detection to orchestrator/generator/evaluator | defer until team scales past solo | Aug 13 multiagent research is real, but the "18 of 30 agents pick same branch" failure needs a fleet the harness doesn't run today |

---

## 1. Wire `/doctor prompt-audit` into a periodic harness check

**Source.** Claude Code v2.1.283 changelog entry (2026-09-25): `https://code.claude.com/docs/en/changelog` — "Added `/doctor prompt-audit` to audit CLAUDE.md files, skills, agents and commands for patterns written for older models."

**Why it matters here.** This is the first Anthropic-shipped diagnostic that reads exactly the four artifact types the harness *owns and distributes*: `CLAUDE.md`, `skills/*/SKILL.md`, `.claude/agents/*.md`, and `skills/**/*.md` slash-command files. Solo maintainer running a meta-harness whose whole job is to ship these files to consumer projects → drift against latest-model prompt idioms is the exact failure mode this audit catches.

**Concrete diff.** Add one step near the end of `skills/session-start/SKILL.md`, after the plan/parking/exit-note reads:

```markdown
## Step N: Prompt-audit hygiene (weekly cadence)

If `.harness-state/last-prompt-audit.txt` is missing or its date is older than 7 days,
suggest running `/doctor prompt-audit` this session. Persist the run date after execution.
Findings above the noise floor open a `parking_lot.md` row via `/park`; do NOT auto-apply
audit suggestions to `CLAUDE.md` or skills — the harness ships to consumer projects and
each rewrite propagates.
```

Alternative placement: fold into `skills/harness-status/SKILL.md` so the audit surfaces
via the status command rather than every session. Choose whichever the maintainer runs
more predictably.

**Expected payoff.** Catches CLAUDE.md and skill wording that was pattern-matched to Opus 4.6/4.7 idioms after Anthropic ships new-model prompt conventions. Low friction (`/doctor` is already in Claude Code), no new external dependency.

**Verify before applying:** `grep -r "prompt-audit\|/doctor" /home/user/claude-harness/skills` — confirmed empty on 2026-09-26; also re-check `code.claude.com/docs/en/changelog` to make sure `/doctor prompt-audit` still ships (versus being renamed / rolled into another command).

**Recommended verdict:** apply — direct fit for a meta-harness that owns exactly the artifact types the audit reads.
**Status:** PENDING — awaiting triage in PR review

---

## 2. Cite the May 25 containment post as evidence in AGENTS.md loop-protocol §

**Source.** "How we contain Claude across products" (engineering, 2026-05-25): `https://www.anthropic.com/engineering/how-we-contain-claude`

**Why it matters here.** The AGENTS.md "Loop protocol" § already describes the sandcastle-default runner, the catastrophic-command denylist as a pre-tool hook, and the fail-safe repo-resolved gate. The containment post's three architectural takeaways — layered defense, match-isolation-to-user-capability, and "custom code remains riskiest" (their most serious incidents were in their *own* proxy/validator code, not gVisor/seccomp) — externally validate the design choices already in the loop protocol.

The `custom code remains riskiest` line is the one worth wiring in explicitly: the harness's catastrophic-command denylist IS custom code, and the containment post is Anthropic saying it *should* be a backstop rather than the confinement boundary. AGENTS.md already says exactly that ("The denylist is a backstop, not the confinement boundary"), so this is a footnote cite, not a design change.

**Concrete diff.** One footnote-style add in `AGENTS.md` at the paragraph that starts `**Safety guardrails (worktree lane).**`:

```markdown
The denylist is a backstop, not the confinement boundary — it canonicalizes commands,
covers non-shell file writes via write-root confinement, and fails closed on parse
ambiguity. [Anthropic's May 25 containment post reaches the same conclusion:
custom-written safety code is the weakest layer; layer it under OS-level primitives.]
```

**Expected payoff.** External anchor for the design decision; makes it easier to explain to a future collaborator why the denylist is *not* the security boundary. Doesn't change behavior.

**Verify before applying:** `grep -n "how-we-contain\|containment" /home/user/claude-harness/AGENTS.md` — confirmed empty on 2026-09-26. Also confirm the URL is still first-party at `anthropic.com/engineering/how-we-contain-claude`.

**Recommended verdict:** apply — one-line evidence add, zero blast radius, cheap to review.
**Status:** PENDING — awaiting triage in PR review

---

## 3. Decide on `.harness-profile` model refresh (Opus 5.5 primary, Sonnet 5 fallback)

**Sources.**
- "Introducing Claude Sonnet 5" (2026-06-30): `https://www.anthropic.com/news/claude-sonnet-5` — `claude-sonnet-5`, $2 / $10 per Mtoken, free/Pro default.
- Claude Code v2.1.280 changelog entry (2026-09-22): `https://code.claude.com/docs/en/changelog` — "Added Claude Opus 5.5 as default Opus model."

**Why it matters here.** `.harness-profile` currently declares:

```yaml
model:
  primary: claude-opus-4-7
  fallback: claude-sonnet-4-6
  effort_default: xhigh
```

Anthropic has since shipped Sonnet 5 (2026-06-30) and made Opus 5.5 the Claude Code default (2026-09-22). The runtime the harness invokes already resolves `claude-opus-4-7 → claude-opus-5-5[1m] → claude-opus-5[1m]` per the session system prompt, so nothing is *broken* today — the harness is riding fallbacks. But the pinned identifier still nominates Opus 4.7 as first choice, and `effort_default: xhigh` was derived against Opus 4.7's product-default guidance from the 2026-04-23 postmortem, which may or may not still hold on 5.5.

Two coupled decisions the maintainer owns:
1. Does the harness follow Anthropic's Claude Code default (Opus 5.5) or stay on 4.7 until an explicit deprecation notice?
2. If yes to 5.5, does `effort_default` stay `xhigh`? (Sonnet 5's post references "extra high" as an available tier; Opus 5.5's product default is worth re-reading before locking a new value.)

**Concrete diff (illustrative — do NOT ship without spec pass).**

```yaml
model:
  primary: claude-opus-5-5
  fallback: claude-sonnet-5
  effort_default: xhigh   # re-derive from Opus 5.5 product-default docs before shipping
```

Downstream: `/project-init` derives `effort_default` from `stakes.level` at first write, so consumer projects using `setup-harness` today would inherit the current mapping. If Opus 5.5's product default changes, the derivation table in `.harness-profile` comments (and any duplicate in `skills/project-init/`) is what actually needs editing.

**Expected payoff.** Removes a soft-drift condition: the profile drifts a little more true each time Anthropic ships a model; explicit refresh keeps the pin honest and captures any effort-level re-derivation in a spec so the reasoning is durable.

**Verify before applying:** `grep -rn "opus-4-7\|sonnet-4-6\|opus-5-5\|sonnet-5" /home/user/claude-harness/.harness-profile /home/user/claude-harness/skills/project-init/` — check whether any downstream skill hard-codes the old identifiers before mass-updating. Also re-read the Claude Code changelog to confirm Opus 5.5 hasn't been deprecated between now and the spec pass.

**Recommended verdict:** spec — the maintainer's own methodology (`/spec-planner` for anything with cross-project blast radius) applies to model pins in a distributed harness profile. Not a `/micro`.
**Status:** PENDING — awaiting triage in PR review

---

## 4. Add diversity + conflict-detection to orchestrator / generator / evaluator

**Source.** "Patterns and problems in multiagent systems" (research, 2026-08-13): `https://www.anthropic.com/research/multiagent-systems`

**Why it matters here.** The research documents four multiagent failure modes: coordination gaps on interdependent tasks, *conformity-driven failures* (their headline: "18 out of 30 agents decided to create a git branch with the exact same branch name"), epistemic vulnerabilities to deception, and goal-conflict escalation into sabotage. It proposes three counter-designs: explicit conflict-detection, diversity mechanisms (vary prompts / scaffolding / contexts), and deferral protocols (halt-and-ask on ambiguity).

The harness has an orchestrator → generator → evaluator loop and a code-reviewer subagent. Two of the three counter-designs are already present in some form:
- **Deferral**: the loop protocol has 4-gate HITL classification with credential/OOB/design-judgment/irreversibility deferral triggers.
- **Conflict detection**: partial — the loop refuses non-fast-forward merges rather than synthesizing an un-gated tree, which catches one class of goal-conflict (racing writers).

The one **not** in place is *diversity*: the harness runs one generator prompt against one evaluator prompt. That's fine at solo scale, but if `/run-loop` ever drains a source in parallel — even two workers wide — the "18 of 30 agents same branch name" failure becomes runnable.

**Concrete diff (illustrative — do NOT ship without evidence).**

Adding a diversity mechanism now would mean either randomizing minor scaffolding in `.claude/agents/generator.md` or adding a `--seed <n>` variant loaded from the item queue. Neither is worth the maintenance overhead until the loop actually runs >1 worker.

The conflict-detection add IS cheaper: `code-reviewer.md` could grow a check for "does this diff contradict a spec constraint another live PR is enforcing?" But this is speculative without cross-PR contention evidence in the current tracker.

**Expected payoff.** Preemptive hardening against multi-worker failure modes. Value goes from ~0 today to ~high the day `/run-loop` starts running >1 concurrent worker; before then, dead weight.

**Verify before applying:** `grep -rn "concurrent\|parallel\|worker\|N-wide" /home/user/claude-harness/skills/run-loop/` and `grep -n "worker" /home/user/claude-harness/AGENTS.md` — if the loop protocol still describes a single-worker drain, this is speculative.

scope: speculative

**Recommended verdict:** defer until `/run-loop` runs >1 concurrent worker (or a HITL project starts fanning out subagents in parallel). Park the reference and revisit when the trigger fires.
**Status:** PENDING — awaiting triage in PR review

---

## Skipped posts — one-line reasons (see tracker rows for the full set)

Full log lives in `anthropic-reviews/reviewed-posts.md`. Highlights of what was scanned and skipped this run:

- Life-sciences enzyme discovery, Life Sciences Verification Program, protein/chemistry, model-hardware-standard preview, scientist grants — bio/hardware/enterprise announcements, no coding-harness surface.
- Watermark, Fable 5 biology safeguards, Alignment & security efforts, Enterprise Frontier Safeguards, Accenture embedded evaluation — safety/enterprise, not harness methodology.
- "When AI builds itself" (recursive-self-improvement institute post) — trend piece; solo-maintainer takeaways are already lived in the harness (delegate, focus on direction-setting, automated review).
- Code w/ Claude SF 2026 recap (May 12) — duplicates the individually-tracked May announcements already covered in the 2026-05-10 review.
- Multi-agent coordination patterns (Apr 10) and "When to use multi-agent systems" (Jan 23) — both older than the tracker's 2026-05-10 boundary, out of discovery scope.

---

See `anthropic-reviews/README.md` for the triage convention.
