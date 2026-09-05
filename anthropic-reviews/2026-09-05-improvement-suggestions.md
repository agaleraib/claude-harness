# Anthropic post review — 2026-09-05

Reviewed window: **2026-05-10 → 2026-09-05** (last tracker date → today). A ~4-month gap: nearly every actionable post lands in the middle of that window. Cap: 15 posts.

Skipped rows (10) are logged in the tracker with one-line reasons; only in-scope, harness-actionable posts are expanded below.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Bump `.harness-profile` fallback: `claude-sonnet-4-6` → `claude-sonnet-5` | apply | Sonnet 5 shipped 2026-06-30, ships native 1M context, is the current default in Claude Code — the pin is stale. |
| 2 | Adopt "judgment-first" phrasing style for skill authors (context-engineering post) | defer until next skill-authoring pass | 6061 SKILL.md lines skew heavy on explicit prohibitions; the new guidance says Claude 5-gen models do better with judgment-scoped rules, but a mass rewrite is a whole-repo pass, not a one-diff apply. |
| 3 | Cross-map harness phase gates to the six-stage AI-Native SDLC playbook | defer — scope: speculative | Six-stage loop (Plan → Design → Build → Test → Deploy → Maintain, each committing an artifact) parallels `docs/specs/` + `docs/plan.md` + wave archive, but the playbook is enterprise-scale; a solo harness doesn't need the org-scale governance layer. |
| 4 | Consider promoting `model.primary`: `claude-opus-4-7` → `claude-opus-5` | defer until Opus 5 hits parity for `xhigh` orchestrator dispatch | Opus 5 launched 2026-07-24 at same $5/$25 pricing; upgrade is technically clean but Opus 4.7 is a deliberate pin (see comment in `.harness-profile`) and the harness's stakes.level:medium → effort_default:xhigh derivation was chosen against Opus 4.7's characteristics. |
| 5 | Optionally emit anthropic-review triage as a Claude Code Artifact | defer — scope: speculative | Artifacts (2026-06-18) would give the maintainer a shareable web view of each run's triage table, but the current Markdown → GitHub-PR flow already works and Artifacts are Team/Enterprise-gated. |

---

## 1. Bump `.harness-profile` fallback: `claude-sonnet-4-6` → `claude-sonnet-5`

**Source:** [Introducing Claude Sonnet 5 — Anthropic (2026-06-30)](https://www.anthropic.com/news/claude-sonnet-5) · companion release note: [Claude Code v2.1.197 changelog](https://code.claude.com/docs/en/whats-new)

**Facts checked against the repo:**

```
$ grep -nE "claude-sonnet-|claude-opus-" .harness-profile
  primary: claude-opus-4-7
  fallback: claude-sonnet-4-6
```

The fallback still names `claude-sonnet-4-6`. Sonnet 5 became Anthropic's default coding model on 2026-06-30, ships a native 1M-token context window (no beta header required), is priced $2 / $10 per Mtok (permanent per July follow-up), and is now the default in Claude Code. The 2026-05-04 tracker entry that rejected the `context-1m-2025-08-07` header removal explicitly reasoned "sonnet-4-6 fallback never used that beta" — Sonnet 5 collapses that concern entirely.

**Concrete change (one line):**

```diff
 model:
   primary: claude-opus-4-7
-  fallback: claude-sonnet-4-6
+  fallback: claude-sonnet-5
   effort_default: xhigh   # derived from stakes.level: medium
```

**Expected payoff:** Fallback path uses a model that's actively maintained (Sonnet 4.6 will lose freshness as Anthropic hardens the 5-generation), gets native 1M context without the retired beta header, and matches what Claude Code's own CLI defaults to today. Zero code changes elsewhere — the orchestrator reads `.harness-profile` at dispatch time.

**Verify before applying:** `grep -nE "^  (primary|fallback):" .harness-profile` — if fallback already reads `claude-sonnet-5` (or newer), this suggestion is stale; skip.

**Recommended verdict:** apply — trivial, low-risk, single-line diff on a value that's demonstrably stale.
**Status:** PENDING — awaiting triage in PR review

---

## 2. Adopt "judgment-first" phrasing for skill authors (Claude 5 context engineering)

**Source:** [The new rules of context engineering for Claude 5 generation models — Claude blog (2026-07-24)](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models) — by Thariq Shihipar. Anthropic reported they deleted ~80% of Claude Code's system prompt by rewriting explicit prohibitions ("Never write multi-paragraph docstrings", "Do not create planning documents unless asked") into judgment-scoped rules ("Write code that reads like the surrounding code: match its comment density, naming, and idiom").

**Facts checked against the repo:**

```
$ wc -l skills/*/SKILL.md | sort -rn | head -3
   719 skills/planning-loop/SKILL.md
   675 skills/close-wave/SKILL.md
   488 skills/skill-creator/SKILL.md
   ...
   6061 total
```

The harness's own skill bodies total ~6K lines and — spot-checked — lean on the older "explicit rule" style (e.g. planning-loop's 719 lines are heavy with "Do X in this order", "Never skip Y"). This is the style Anthropic just deprecated for Claude 5-gen models. The harness pins Opus 4.7 (see §4), but Claude Code sessions running against this repo may hit Sonnet 5 (default) or Opus 5 whenever the primary is unavailable — so the guidance already applies through the fallback path today.

**Concrete change (guidance, not a diff):**

Add a "Writing rules for Claude 5-gen consumers" section to `skills/skill-creator/SKILL.md` (or `AGENTS.md` §"Skill authoring") pointing at the post and naming its six shifts. Example rewrite (from the post's own examples):

- ❌ Old: `Default to writing no comments. Never write multi-paragraph docstrings.`
- ✅ New: `Write code that reads like the surrounding code — match its comment density, naming, and idiom.`

Also mention `/doctor` as the audit tool Anthropic ships (Claude Code v2.1.198+ has it built in) — the harness's own skills can be run through it to find high-token, low-value blocks.

**Expected payoff:** Smaller SKILL.md files (Anthropic hit 80% reduction on their own harness), lower per-turn tokens, and skills that generalize better across the 4.x → 5.x model boundary. Real work is per-skill and would be its own wave.

**Why defer, not apply:** This is a whole-repo authoring-style pass, not a single-file edit. Correct routing per README §"Decompose first, then route" is `/spec-planner` → wave, not `/micro`. Also: the harness's explicit style protects against past drift-detector regressions — swapping wholesale without evals risks reintroducing them. Better as a spec-scoped wave when a skill next needs meaningful maintenance.

**Verify before applying:** `grep -c "Never\|Do NOT\|Don't" skills/*/SKILL.md | sort -t: -k2 -rn | head -5` — if the counts have dropped materially (say <30 per file for the top offenders) since 2026-09-05, someone has already done a pass; re-scope accordingly.

**Recommended verdict:** defer until next skill-authoring pass — payoff is real but the change shape is a coordinated rewrite, not a one-shot diff.
**Status:** PENDING — awaiting triage in PR review

---

## 3. Cross-map harness phase gates to the six-stage AI-Native SDLC playbook

**Source:** [The AI-Native SDLC playbook — Claude blog (2026-08-21)](https://claude.com/blog/the-ai-native-sdlc-playbook) · companion: [How Anthropic secures its AI-native software development lifecycle — Claude blog (2026-07-21)](https://claude.com/blog/how-anthropic-secures-its-ai-native-software-development-lifecycle)

The playbook frames the AI-native SDLC as a **six-stage loop** (Plan → Design → Build → Test → Deploy → Maintain), where each stage **commits a machine-executable, human-readable Markdown artifact** that the next stage reads (`intent.md` → `spec.md` → `plan.md` → PR → production evidence). Governance ships as code through **hooks, skills, and evals**. Human review concentrates at high-risk artifact transitions rather than every line of code.

**Facts checked against the repo:**

```
$ ls docs/specs/ | head
2026-04-12-runtime-orchestrator.md
2026-04-19-harness-model-pin-and-effort-routing.md
...
$ head -3 docs/plan.md
# claude-harness — plan
Navigator-style active board. Per v2 §6, the file has exactly four sections —
`## Now` / `## Next` / `## Blocked` / `## Recently Shipped`.
```

The harness already has:
- **Plan-stage artifact:** `docs/plan.md` (navigator board)
- **Spec-stage artifact:** `docs/specs/<date>-<topic>.md` (auto-generated by `/spec-planner`)
- **Build-stage artifact:** `docs/waves/wave<N>-<slug>.md` archive + `.harness-state/wave<N>-closed.md`
- **Test / Deploy / Maintain-stage artifacts:** implicit in Git history + PR reviews
- **Governance-as-code:** existing skills + `.claude/settings.json` hooks (currently empty) + planning-loop test fixtures

**What the playbook adds that the harness doesn't:**
- Explicit **intent artifact** upstream of the spec (captures the "why" separately from the "what") — the harness folds this into `/spec-planner` discovery questions, so it's an ephemeral in-session output rather than a committed file.
- Explicit **risk tiers** on agent-authored changes (H/M/L) that gate reviewer breadth.
- **Isolated identity** for the agent's write scope (e.g. bot user with narrower repo perms).

**Concrete change (speculative):**

If a maintainer ever wants to formalize this, sketch a new spec: `docs/specs/2026-09-<n>-intent-md-convention.md` that adds an `## Intent` block to the top of every `docs/specs/*.md` file (or a separate `docs/intents/` directory), so the "why" is a persisted artifact distinct from the "what" — the playbook's #1 example of what discipline that stage adds.

**Why defer:** Solo harness, no reviewers to route by risk tier, no bot identity to isolate. The intent-vs-spec split is philosophically clean but adds a whole file convention for negligible practical gain at this scale. Worth reconsidering if the harness ever grows beyond `team.size: solo`.

**Verify before applying:** `grep -l "team.size: solo" .harness-profile` — if that still holds, the playbook's org-scale controls (risk tiers, isolated identities, evidence artifacts) remain over-scoped. Also check `.claude/settings.json` for populated hooks: currently `{"hooks": {}}`, so "governance as hooks" has no substrate to hang from yet.

**Recommended verdict:** defer — scope: speculative; enterprise-scale playbook doesn't fit a solo-maintained harness cleanly. Revisit if `team.size` changes.
**Status:** PENDING — awaiting triage in PR review

---

## 4. Consider promoting `model.primary`: `claude-opus-4-7` → `claude-opus-5`

**Source:** [Introducing Claude Opus 5 — Anthropic (2026-07-24)](https://www.anthropic.com/news/claude-opus-5) — Opus 5 shipped at the **same** $5/$25 per-Mtok price as Opus 4.8, is the new default model on Claude Max, and reports state-of-the-art on Frontier-Bench and GDPval-AA coding evaluations.

**Facts checked against the repo:**

```
$ grep -nE "primary:" .harness-profile
  primary: claude-opus-4-7
```

The `.harness-profile` comment explicitly notes the pin was chosen for the Opus-4.7 postmortem window ("Aligned with Anthropic's 2026-04-23 postmortem"). That reasoning is now dated — the postmortem window closed months ago, and Opus 5 has been the default for Claude Code Max users since 2026-07-24.

**Concrete change (one line):**

```diff
 model:
-  primary: claude-opus-4-7
+  primary: claude-opus-5
   fallback: claude-sonnet-5   # apply §1 first
   effort_default: xhigh
```

**Why defer, not apply:**
- Unlike §1's Sonnet swap (a fallback that rarely fires), the primary is what every orchestrator dispatch hits. A drift here changes the character of every wave.
- The harness's `effort_default: xhigh` was derived from `stakes.level: medium` **against Opus 4.7's characteristics** (per the profile comment referencing the 2026-04-23 postmortem). Opus 5's `xhigh` cost/behavior curve is different enough that the pairing should be validated first — a `/micro` on one wave, not a blind pin flip.
- No urgency: Opus 4.7 is still supported and available in the model header fallback chain (`claude-opus-5[1m]`, `claude-opus-4-8[1m]`, `claude-opus-4-7[1m]`), so the pin still resolves.

**Verify before applying:** `grep -nE "^  primary:" .harness-profile` — and separately, check whether the runtime model header still lists Opus 4.7 as a valid fallback (`grep -rE "claude-opus-4-7" .claude/ 2>/dev/null`). If Anthropic sunsets Opus 4.7 the pin becomes urgent; otherwise, defer remains defensible.

**Recommended verdict:** defer until Opus 5 is validated against `xhigh` orchestrator dispatch on at least one throwaway wave.
**Status:** PENDING — awaiting triage in PR review

---

## 5. Optionally emit anthropic-review triage as a Claude Code Artifact

**Source:** [Claude Code now supports artifacts — Claude blog (2026-06-18)](https://claude.com/blog/artifacts-in-claude-code)

Claude Code Artifacts turn a session's work into a live, shareable HTML page on a private `claude.ai/code/artifact/<uuid>` URL. The blog post explicitly names PR walkthroughs, dashboards, and release checklists as canonical uses — all shaped like the triage table this routine emits.

**Facts checked against the repo:**

```
$ ls anthropic-reviews/ | head
2026-04-19-improvement-suggestions.md
...
README.md
reviewed-posts.md
```

The routine currently emits Markdown → GitHub PR. The maintainer triages in the PR thread. That's fine for a solo maintainer, but an Artifact would render the triage table as a filterable/sortable page and let comments land on chips instead of Markdown rows.

**Concrete change (speculative):**

Extend the routine's post-commit step: after opening the PR, call `Artifact({file_path: "anthropic-reviews/<date>-improvement-suggestions.md", ...})` and paste the artifact URL as a PR comment. The Markdown file remains the source of truth; the artifact is a rendering.

**Why defer:**
- **Availability:** Artifacts are Team/Enterprise-gated at launch; a solo Pro account may not have access to publish. Verify in-account before wiring.
- **Redundancy:** The routine's Triage summary table already gives the "at-a-glance map" the maintainer needs. An artifact would render more prettily but adds a moving part that lives outside the git-tracked source.
- **Discoverability:** The GitHub PR is where triage discussion already lives. Splitting some of it into an Artifact comment thread costs continuity.

**Verify before applying:**
1. Confirm the maintainer's account tier has Artifact publish access: `curl -sS "$HTTPS_PROXY/__agentproxy/status" | jq .` — no direct signal here; the accurate check is trying `Artifact({file_path: ...})` in a session.
2. Re-check whether the Markdown-only flow has generated triage friction (long PRs where finding a §is slow) — if yes, the artifact becomes worth its overhead; if no, the current flow is fine.

**Recommended verdict:** defer — scope: speculative; low-friction Markdown flow doesn't earn the second surface today.
**Status:** PENDING — awaiting triage in PR review
