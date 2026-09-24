# Anthropic post review — 2026-09-24

**Coverage note.** The last tracker entry was 2026-05-10 — a ~4.5 month gap. This run enumerates 15 posts across the interim (May 19 → Sep 23, 2026), pulled from `anthropic.com/news`, `anthropic.com/engineering`, and `claude.com/blog`. Older Managed-Agents-adjacent posts from May 2026 re-affirm existing deferrals (2026-04-19 §2, 2026-04-25 memory row) and are logged as skips in the tracker rather than restated here.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Evaluate migrating `.harness-profile` `model.primary` from `claude-opus-4-7` to Opus 5.5 | spec | 20% input/output + 60% cache-read cost drop is material; migration ripples through skills that pin model ids, fallback chain, effort routing — needs a design pass, not a one-line edit |
| 2 | Cite the "6-step modernization framework" + adopt the *certificate* framing in `spec-planner` and `apply-anthropic-reviews` docs | apply | Anthropic's public phrasing lines up almost 1:1 with the harness's existing strict-acceptance-criteria discipline (Wave 25). Adds one bullet of external evidence, no code change |
| 3 | Flag Claude Marketplace as a future distribution channel alongside `setup-harness` symlink | defer until first external adopter or plugin-manifest requirement | Marketplace is a customer-discovery surface for skills/plugins/agents — potentially relevant once the harness has users beyond the solo maintainer, but no author-side action needed today |
| 4 | Note Claude Code Artifacts as a candidate rendering surface for `harness-status` / evaluator reports | defer until a dashboard need actually emerges | Artifacts are private-by-default org-scoped live pages; interesting as a *future* replacement for markdown status reports, but not needed now for a solo repo |

---

## 1. Evaluate migrating `.harness-profile` `model.primary` from `claude-opus-4-7` to Opus 5.5

**Source:** [What a task costs on Opus 5.5](https://claude.com/blog/what-a-task-costs-on-opus-5-5) (2026-09-22)

**Post claim.** Opus 5.5 is 20% cheaper on input tokens, 20% cheaper on output tokens, and **60% cheaper on cache reads** (cache-read pricing dropped from 1/10 to 1/20 of input price). Anthropic's guidance in the post is to treat Opus 5.5 as the "daily driver" for supervised coding, reserving Fable 5.1 for cases where "the result matters more than the token price." Caveat cited in the post itself: Opus 5.5 "always thinks before it replies" so per-task token counts can rise even when unit prices fall — *measure on your own work* is the explicit recommendation.

**Current state in the repo.**
- `.harness-profile` pins `model.primary: claude-opus-4-7` and `model.fallback: claude-sonnet-4-6` (`.harness-profile` lines under `# model:`).
- No file in the repo references Opus 5.5 or Fable 5 (grep `opus-5|opus 5.5|opus-5\.5|fable-5` → no matches).
- The comment above the `model:` block ties `effort_default: xhigh` to Anthropic's 2026-04-23 postmortem, so a model change carries a follow-on question: does the xhigh default still hold on Opus 5.5, or is Anthropic's product default different now?

**Why this is `spec`, not `apply`.**
1. `.harness-profile` is the single source of truth consumed by `project-init`, `run-wave` (via `.claude/agents/spec-planner.md`), and the runtime orchestrator (`docs/specs/2026-04-12-runtime-orchestrator.md`). A model rename cascades.
2. Skills that interpolate `${CLAUDE_EFFORT}` (Claude Code v2.1.120+) or that assume specific model-id shapes need re-verification.
3. Fallback chain — `claude-sonnet-4-6` — is also outdated relative to the current Anthropic model lineup and should be reconsidered in the same pass.
4. The post's own "measure on your own work" caveat suggests a controlled A/B on a real wave before flipping the pin.

**Suggested spec scope (for `/spec-planner`):**
- Enumerate every file that names a model id (start from `grep -rE 'claude-opus-4-7|claude-sonnet-4-6' .`).
- Add a `.harness-profile` migration note documenting the "measure before flipping" principle (link this post).
- Decide the fallback: current Sonnet lineage vs. Haiku-tier vs. keep 4-6.
- Re-derive `effort_default` — the 04-23 postmortem justification may or may not still apply.
- Cost-audit: run one representative wave on both pins, compare `/usage` output.

**Expected payoff.** Substantial ongoing cost reduction (biggest line on a typical agentic session's receipt is cache reads, per the post) plus alignment with Anthropic's current product default. Not applying costs money on every wave; applying without a spec risks silently breaking effort routing.

**Verify before applying:** `grep -n 'claude-opus-4-7' .harness-profile` and confirm the pin is still `claude-opus-4-7`; also re-fetch the Opus 5.5 pricing post to confirm the 20/20/60 numbers haven't been superseded by a newer model tier.

**Recommended verdict:** spec — model migration ripples through skills, agents, and effort routing; needs a design pass before any pin flip.
**Status:** PENDING — awaiting triage in PR review

---

## 2. Cite the "6-step modernization framework" + adopt the *certificate* framing in `spec-planner` docs

**Source:** [How to prepare for AI-driven code modernization projects](https://claude.com/blog/how-to-prepare-for-ai-driven-code-modernization-projects) (2026-09-23)

**Post claim.** The post describes a 6-step framework for AI-driven modernization: (1) Define the Target, (2) Create the Certificate, (3) Set the Promotion Policy, (4) Prepare Prerequisites, (5) Build & Refine the Agentic Workflow, (6) Run the Modernization. Step 2 in particular — the *certificate*, defined as "checkable conditions every change must meet" (original tests pass, new tests pass, coverage thresholds, performance bounds, adversarial reviews) — is very close in spirit to how `spec-planner` already writes strict acceptance criteria. The post's own summary of the practice: *"A good check on the finished certificate is whether they would be comfortable merging on the certificate's evidence alone."*

**Current state in the repo.**
- `spec-planner` already enforces strict acceptance-criteria discipline (`.claude/agents/spec-planner.md` §"Acceptance-criteria strictness self-check", Wave 25 shipped 2026-05-xx).
- The shared scanner `skills/planning-loop/lib/acceptance-strictness.sh` owns the SCOPE, closed-judgment-lexicon, and M1–M4 mechanism rules.
- The framing today is internal / mechanical ("strict acceptance criteria"), not connected to a public Anthropic-side vocabulary.
- No file references "certificate", "modernization", or the 6-step framework (grep confirmed).

**Concrete change (single small edit).** Add one bullet + link inside `.claude/agents/spec-planner.md` §"Acceptance-criteria strictness self-check" preamble, framing the strictness rule as the harness's version of what Anthropic calls a *certificate* in the modernization post. Something like:

```markdown
> **External framing.** Anthropic's [AI-Driven Code Modernization](https://claude.com/blog/how-to-prepare-for-ai-driven-code-modernization-projects)
> post (2026-09-23) calls this same artifact a **certificate** — "checkable conditions every change must meet"
> — and offers the reviewer test: *"would you be comfortable merging on the certificate's evidence alone?"*
> Same discipline, external vocabulary. Cite when explaining to consumers why strict-acceptance is not optional.
```

**Expected payoff.** Cheap external evidence — a public Anthropic post now names the discipline the harness already enforces. Useful when justifying strict-acceptance to consumer projects that push back ("this is what Anthropic recommends, not just a solo methodology quirk"). Zero code change, zero risk.

**Verify before applying:** `grep -n 'certificate\|modernization' .claude/agents/spec-planner.md` — confirm the citation isn't already present. Also re-read the post URL to make sure the "merge on the certificate alone" phrasing is still the recommended reviewer test.

**Recommended verdict:** apply — one-bullet doc addition, zero code impact, adds external evidence to a shipped discipline.
**Status:** PENDING — awaiting triage in PR review

---

## 3. Flag Claude Marketplace as a future distribution channel alongside `setup-harness` symlink

**Source:** [Claude Marketplace: one place to discover plugins, agents, and services from our partners](https://claude.com/blog/claude-marketplace) (2026-09-23), plus the customer story [How CodeRabbit, Power Digital, and ThoughtSpot scale with Snowflake and Vercel on Claude Marketplace](https://claude.com/blog/how-coderabbit-power-digital-and-thoughtspot-scale-with-snowflake-and-vercel-on-claude-marketplace) (2026-09-23).

**Post claim.** Marketplace launched 2026-09-23 as a central discovery/distribution surface with three pathways: (a) *Connectors & Plugins* built on MCP + Agent Skills; (b) *Agents & Products* from partners; (c) *Service Partners* from the Claude Partner Network. Publishing paths mentioned in the post: "Create a connector or plugin using the Model Context Protocol (MCP) and Agent Skills", "Apply to list", "Join the Claude Partner Network". The post does not spell out a CLI submission surface, so today this is a strategic-awareness item, not a wiring one.

**Current state in the repo.**
- The harness distributes via `~/.claude/harness/` clone + symlink into `~/.claude/skills/` (`setup-harness` skill).
- There is no plugin manifest, no marketplace listing, no author-side publishing config in the repo (grep `marketplace` → no meaningful matches beyond an unrelated `openai-codex plugin` reference in `README.md:281`).
- `.harness-profile` sets `team.size: solo` and `deployment.targets: [none]` — the harness is not currently distributed to anyone but the solo maintainer.

**Why this is `defer`, not `apply` or `spec`.** For a solo-maintained tooling repo with no external adopters, publishing to a discovery marketplace is scope-speculative. But it is worth logging so a future §-writer doesn't re-discover the option cold. The trigger to revisit is one of:
- The harness gets its first external adopter (co-maintainer, or a friend adopting `setup-harness`);
- Anthropic publishes a plugin-manifest spec (`plugin.json` or similar) that a skill-shipping repo *should* start emitting even without listing;
- A consumer project wants to install a *subset* of harness skills without cloning the whole repo — marketplace-style packaging could solve that.

scope: speculative

**Verify before applying:**
1. `grep -rl 'marketplace\|plugin.json\|manifest' skills/ setup-harness/ AGENTS.md CLAUDE.md README.md` — confirm no publishing surface exists yet.
2. Re-fetch `claude.com/blog/claude-marketplace` — check whether a plugin manifest / CLI submission command has since been documented.
3. Check `.harness-profile` — confirm `team.size: solo` and `deployment.targets: [none]` still hold.

**Recommended verdict:** defer until the harness has an external adopter or Anthropic ships an author-side publishing CLI.
**Status:** PENDING — awaiting triage in PR review

---

## 4. Note Claude Code Artifacts as a candidate rendering surface for `harness-status` / evaluator reports

**Source:** [Claude Code now supports artifacts](https://claude.com/blog/artifacts-in-claude-code) (2026-06-18)

**Post claim.** Artifacts in Claude Code are live, interactive web pages generated in-session — dashboards, incident timelines, PR walkthroughs, checklists. Key properties: private-by-default (org-scoped), version-history at a stable URL, live-refresh when Claude Code republishes, viewable in any browser. Available in beta via the CLI and desktop app.

**Current state in the repo.**
- Evaluator outputs today live in `evaluator-reports/evaluation-report.md` (2026-05-08 §2 references this convention).
- `harness-status` renders a plaintext / markdown status snapshot.
- No file in the repo mentions Claude Code Artifacts as a rendering surface for these outputs (grep `artifact` matches only the user-level `artifact-design`/`artifact-diagramming` skills, which are Anthropic-shipped skills for building artifacts, not consumers of them).
- The `.harness-profile` still says `team.size: solo` — nobody else is looking at these reports today.

**Why this is `defer`, not `apply`.** Markdown reports work for a solo maintainer reading in a terminal. Artifacts become valuable when (a) multiple people need to see the same live report, or (b) the report benefits from interactivity (drilldowns, filters). Neither applies today. Worth flagging so a future §-writer doesn't re-discover the option cold.

**Concrete change if/when triggered.** Add a "Rendering targets" section to `skills/harness-status/SKILL.md` that names Claude Code Artifacts as an alternative to the markdown report, with a link to the post and a note about the org-scoped privacy model (relevant if the harness ever ships evaluator output to consumer projects).

scope: speculative

**Verify before applying:**
1. `grep -rn 'artifact' skills/harness-status/ evaluator-reports/ 2>/dev/null` — confirm no artifact-rendering surface has since been added.
2. `.harness-profile` still says `team.size: solo` and consumer projects still consume plaintext status.
3. Re-check the post URL — Artifacts is still beta at time of writing; a GA release may change the API and privacy model.

**Recommended verdict:** defer until a dashboard need actually emerges (multiple viewers, or interactive report).
**Status:** PENDING — awaiting triage in PR review

---

## Coverage — skipped posts (for tracker cross-reference)

The following posts were reviewed but produced no §; they are logged in `reviewed-posts.md` with a one-line skip reason:

- New in Claude Managed Agents: self-hosted sandboxes and MCP tunnels (2026-05-19) — re-affirms deferred 2026-04-19 §2 (Managed Agents adoption).
- New in Claude Managed Agents: dreaming, outcomes, and multiagent orchestration (2026-05-19) — duplicate of the same-date announcement, already covered in 2026-05-07 §1 and 2026-05-10 §3.
- Building intelligent apps for Apple platforms with Claude in the Foundation Models framework (2026-06-08) — iOS/Apple platform integration, no harness surface.
- Improving our alignment and security efforts (2026-08-31) — alignment-org policy content, no harness surface.
- Agentic coding is straining CI. Here's how we scaled test impact analysis at Anthropic (2026-09-14) — harness has `test_required: false` and no test suite to select from; test-impact-analysis has nothing to bite on.
- Cowork and chat are now one Claude (2026-09-16) — consumer-product consolidation on claude.ai, out of scope.
- Projects redesigned: from folder to conversation (2026-09-17) — claude.ai UX change, no Claude-Code surface.
- Life Sciences Verification Program (2026-09-17) — regulated-industry verification program, out of scope.
- Enterprise Frontier Safeguards (2026-09-01) — enterprise-safety product, no harness surface.
- Claude discovers a novel enzyme system with CRISPR-like repeats (2026-09-23) — scientific-research demonstration, no methodology surface.
- How CodeRabbit, Power Digital, and ThoughtSpot scale with Snowflake and Vercel on Claude Marketplace (2026-09-23) — customer story on the Marketplace launch; the strategic implication is covered by §3.
