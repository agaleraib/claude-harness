# Anthropic Post Review — 2026-11-11

Six months have elapsed since the last review (2026-05-10). Intervening posts weren't reviewed, so this run is deliberately conservative: we evaluate the 15 highest-leverage posts for the harness and defer most ambition until the maintainer confirms direction. The 2026-04-19 `§2` (Managed Agents brain/hands split) and `§5` (agent evals) deferrals still stand; no new fresh evidence tips them to `apply`.

## Triage summary

| § | Suggestion | Recommended | Why |
|---|------------|-------------|-----|
| 1 | Cascade model-pin upgrade: Opus 4.7 → 5.5, Sonnet 4.6 → 5.5, Haiku 4.5 → 5.5, add Fable 5.2 as orchestrator option | spec | 56 occurrences across 11 files + routing-table + escalation-rung semantics shift (Opus 5.5 "thinking can't be off"; Haiku 5.5 now has adjustable effort). Substantive. |
| 2 | Add offline "dreaming" / transcript-verification layer to the memory system | defer until next memory-prune failure | Harness already has FEEDBACK.md index + feedback/*.md detail (very close to the paper's wiki pattern); dreaming is speculative without a failure mode to justify it |
| 3 | Sandbox / containment principles note in `setup-harness` templates + README | defer until a consumer project asks for unattended mode | Useful reference but solo-maintainer isn't running agents unattended today; not currently a pain point |
| 4 | Agent Skills spec donated to Agentic AI Foundation — add a one-line reference in `AGENTS.md` | apply | Trivial, durable: SKILL.md consumers should know the standard's governance home, and the spec lives at agentskills.io now |
| 5 | 2026 Usage Policy update — add link to `AGENTS.md` / README "Prior Work" section | reject | No methodology, skill, or agent surface the policy update changes; the harness already stays within the policy by not shipping anything policy-sensitive |
| 6 | Re-affirm deferred 2026-04-19 §2 (brain/hands) and §5 (agent evals) given Fable 5.2 orchestrator positioning | defer (bookkeeping only) | Fable 5.2 is explicitly positioned as advisor/orchestrator and Managed Agents has shipped the shape the deferrals sketched; nothing to apply standalone — fold into §1's spec when triggered |
| 7 | 15th-review disposition note — no new `apply` suggestions except §4; most posts in this 6-month window are enterprise/governance/funding | reject (bookkeeping only) | Not a change suggestion; context for the maintainer |

---

## §1 — Cascade model-pin upgrade (Opus 4.7 → 5.5; Sonnet 4.6 → 5.5; Haiku 4.5 → 5.5; introduce Fable 5.2)

**Sources (4 Anthropic posts):**
- https://www.anthropic.com/claude-opus-5-5 (Sep 22, 2026)
- https://www.anthropic.com/claude-sonnet-5-5 (Sep 28, 2026)
- https://www.anthropic.com/claude-haiku-5-5 (Oct 7, 2026)
- https://www.anthropic.com/claude-fable-and-mythos-5-2 (Nov 9, 2026)

**What changed on Anthropic's side:**
- **Opus 5.5** (`claude-opus-5-5`) replaces the Opus 4.7-era flagship. Pricing drops 20% ($4 in / $20 out per 1M). Output is >30% faster than Opus 5. **Opus 5.5 can no longer run with thinking turned off** — an API-level behavior shift relevant to the orchestrator's effort/thinking routing. Preserved thinking applies to accounts created on/after 2026-08-31 and is now account-scoped (switching accounts mid-session is affected).
- **Sonnet 5.5** (`claude-sonnet-5-5`) replaces the Sonnet 4.6-era mid-tier. Terminal-Bench 4.0 70.6% (vs. 10.3% for Sonnet 5). GDPval-AA 1844, nearly level with Opus 5.5. Default effort is **medium** in Claude Code (not the harness's current `effort_default: xhigh`), **high** on the Claude Platform. Note: at Max effort Sonnet 5.5 more often invokes Claude Code's code-review skill, which split subagent work and caused timeouts/OOS edits in benchmarks — a signal the harness's own `/code-review` skill should be tested against Sonnet 5.5 at Max before promoting it in routing rules.
- **Haiku 5.5** (`claude-haiku-5-5`) is the **first Haiku-class model with an adjustable effort setting (Low through Max)** — a schema shift for the orchestrator's effort column, which today only ever pairs `haiku-4.5 | low`. Benchmark jumps vs Haiku 4.5 are large (Terminal-Bench 39.2% vs 0.0%; GDPval-AA 1620 vs 735). Routing guidance from Anthropic: Haiku 5.5 as subagent to an Opus 5.5 lead; still not the right pick for "complex agentic coding" (keep Sonnet/Opus there).
- **Fable 5.2** (`claude-fable-5-2`) is Anthropic's new top-tier technical-work model, **explicitly positioned as advisor/orchestrator** (orchestrator-worker pattern: Fable delegates simpler tasks to Haiku/Sonnet/Opus subagents, or acts as Haiku/Sonnet/Opus's advisor when they hit harder problems). The Jump Trading / "1,000-subagent prototype OS" examples confirm the pattern is the harness's existing orchestrator role, just with a model that's billed per-call for that role.

**What's hardcoded in the harness today (grep'd 2026-11-11):**
- `.harness-profile`: `primary: claude-opus-4-7`, `fallback: claude-sonnet-4-6`
- `.claude/agents/orchestrator.md`: routing table with `haiku-4.5 | low`, `sonnet-4.6 | medium`, `opus-4.7 | high/xhigh`; escalation rung `haiku-4.5 → sonnet-4.6 → opus-4.7`; `task_id` schema examples using `opus-4.7`; JSONL log example using `"model":"sonnet-4.6"`; promote-model "stop at opus-4.7/xhigh" terminator
- `skills/project-init/SKILL.md`: `.harness-profile` field defaults named `claude-opus-4-7` / `claude-sonnet-4-6`; stakes→`effort_default` derivation cites the 2026-04-23 postmortem (still valid) but the derivation's "Claude Code defaults Opus-4.7 users to xhigh" sentence is now stale — Claude Code's default effort for Opus 5.5 in-app is unspecified in the launch post; Sonnet 5.5 defaults to medium in-app.

**Expected payoff:**
- Harness stays on a supported model cascade (4.7 may be retired in future; Anthropic's Opus 5.5 launch does not explicitly deprecate 4.7, but every Anthropic launch since Opus 5 has implicitly promoted the newest model as the canonical flagship for coding).
- Fable 5.2 unlocks a cheaper-per-task flagship for the orchestrator role (Anthropic claims typical workloads cost 40% less than Opus 5 at default settings; the Opus 5.5 pricing cut inverts).
- Haiku 5.5's adjustable effort unlocks `haiku-5.5 | medium` for "read-only scan + light reasoning" tasks that today either overcommit to Sonnet or undercommit to Haiku-at-low.

**Why `spec`, not `apply`:**
- 56 occurrences across 11 files = exceeds the 5-file substantive threshold from `anthropic-reviews/README.md`.
- The escalation rung semantics shift once Opus 5.5 can't run with thinking off (the `low → medium → high → xhigh` rung at the top model is no longer semantically meaningful in the same way).
- Opus 5.5's account-scoped preserved thinking + Haiku 5.5's new effort column change the JSONL log schema (`"model":"haiku-4.5","effort":"low"` tuple is no longer the only Haiku shape).
- The Sonnet 5.5 code-review benchmark footnote (Max effort → more subagent dispatches → timeouts in some benchmarks) argues against a one-line sed-style substitution.

**Decompose-first candidates for the spec:**
- §1a: `.harness-profile` + `skills/project-init/SKILL.md` field defaults — pure rename, candidate for `/micro` once §1 is spec'd.
- §1b: orchestrator routing table + escalation rung semantics + JSONL log schema — substantive, spec'd.
- §1c: Fable 5.2 as new orchestrator model slot — new behavior; needs explicit decision before introducing a fourth tier.
- §1d: Sonnet 5.5-at-Max code-review regression test — benchmark harness delta, likely `defer` until §1b lands.

**Verify before applying:** `grep -nREi 'opus-4[\.-]7|sonnet-4[\.-]6|haiku-4[\.-]5' .harness-profile .claude/agents/ skills/project-init/SKILL.md skills/run-wave/ skills/orchestrator*/ 2>/dev/null` — if 0 hits, the cascade has already landed and this § is obsolete.

**Recommended verdict:** spec — touches >5 files + introduces routing/log schema changes; needs `/spec-planner` pass before any coding.

**Status:** PENDING — awaiting triage in PR review

---

## §2 — Add offline "dreaming" / transcript-verification layer to the memory system

**Source:** https://www.anthropic.com/research/components-of-agent-memory (Nov 6, 2026)

**What the post proposes:**
- A memory hierarchy: **transcripts → memory notes → memory representations (wikis) → injected context**.
- **"Dreaming"**: an offline process that moves information between the layers, verifying older notes against the raw transcripts that produced them. In the Pokémon example it fixed a wrong landmark note that had caused a downstream failure.
- Discipline: keep the always-loaded layer small; one agent owns each document; prefer wikis + search over search alone; tune dreaming cadence to volatility.

**What's already in place (grep'd 2026-11-11):**
- `~/.claude/memory/` shared root with four indexes (USER.md ≤1KB, FEEDBACK.md ≤5KB, REFERENCES.md ≤2KB, PROJECTS.md ≤4KB) + `feedback/<slug>.md` detail files — exactly the wiki + index-pointer shape the paper advocates.
- `/memory-prune` skill caps the injected layer (size discipline), dry-run by default, byte-exact rollback via git-hash-object.
- `/session-start` + `/session-end` surface over-cap warnings — manual consolidation lives there today.
- `docs/specs/2026-05-13-memory-system-redesign.md` is the reference spec; `docs/specs/2026-05-31-memory-cap-autoremediation.md` already covers automated cap enforcement.
- **What's missing vs the paper**: no scheduled/offline pass that re-reads **transcripts** (or `.harness-state/orchestrator.jsonl`, or per-cwd `~/.claude/projects/<encoded-cwd>/memory/MEMORY.md` content) to verify or correct entries in `~/.claude/memory/FEEDBACK.md`.

**Why `defer`:**
- The paper's "dreaming" is positioned as a fix for a specific failure mode (notes that drifted from the transcripts that produced them). The harness has no logged instance of this failure — `feedback_wave_vs_micro_shape_rule` and friends have been stable since Wave 11.
- Introducing a scheduled consolidation pass would overlap with existing mechanisms (`/memory-prune`, `/session-end`) and risks the kind of "agentic context bloat" the README's "Why Not Superpowers" section explicitly warns against.
- A feedback entry that disagrees with its source transcript is a strong signal; without such a case documented, the dreaming skill is a solution looking for a problem.

**If promoted later**, the minimal footprint would be:
- A new `/memory-dream` skill that runs `--dry-run` by default, reads `.harness-state/orchestrator.jsonl` + `~/.claude/memory/feedback/<slug>.md`, and flags entries whose claims aren't supported by their origin session's orchestrator log. Apply-mode moves the unsupported entry to `archive/dreaming-<utc-date>.md` with the same byte-exact-rollback shape as `/memory-prune`.
- scope: speculative

**Verify before applying:** `grep -rn 'dreaming\|dream' skills/ docs/ 2>/dev/null` — if hits, the pattern is already in flight and this § is obsolete. Also check `grep -rn "feedback entry wrong\|note disagreed with transcript" ~/.claude/memory/feedback/ 2>/dev/null` — if there's a documented failure case, promote from `defer` to `spec`.

**Recommended verdict:** defer until a documented instance of a feedback entry disagreeing with its source transcript — no failure mode today.

**Status:** PENDING — awaiting triage in PR review

---

## §3 — Sandbox / containment principles note in `setup-harness` templates + README

**Source:** https://www.anthropic.com/research/how-we-contain-claude (May 25, 2026)

**What the post describes:**
- Three Anthropic isolation patterns: ephemeral gVisor container (claude.ai), OS-level sandbox with Seatbelt/bubblewrap (Claude Code), full VM (Cowork).
- Principles: environment-layer defenses before model-layer; match isolation strength to the user's ability to evaluate what the agent does; treat remote tool outputs as untrusted input; resolve symlinks before path validation; read-only mounts where possible.
- **Claude Code-specific**: "Use the reference devcontainer so the agent can run unattended without per-action approvals."; "Treat `.claude/settings.json` hooks as untrusted inbound config; defer parsing until the user accepts the trust prompt."; "Auto mode misses about 17% of overeager actions — don't rely on it as a replacement for a sandbox."

**What's already in place (grep'd 2026-11-11):**
- `skills/setup-harness/` exists but doesn't ship sandbox templates or devcontainer references.
- Global pre-push hook dispatcher (merged in `e0328b8`, 2026-11-08) does secret scan + mass-delete block + profile gate — defense-in-depth at the filesystem boundary.
- `.gitignore` carries the usual sensitive-file patterns.
- **What's missing vs the post**: no explicit sandbox recommendation in `setup-harness/`; no reference to the Claude Code reference devcontainer; no "treat `.claude/settings.json` as untrusted" caveat in `AGENTS.md` or `CLAUDE.md`.

**Why `defer`:**
- The solo maintainer today doesn't run agents unattended for long horizons (every `/run-loop` + `/run-wave` session is observed), so the devcontainer recommendation lands as "nice to know" rather than "fix now".
- The "auto mode misses 17% of overeager actions" claim is interesting but the harness's `AGENTS.md` already doesn't rely on Auto Mode as the primary defense — the pre-push hook is the backstop, and that's already in place.
- Consumer projects installing the harness via `setup-harness` might benefit from a one-paragraph sandbox recommendation, but no consumer project has asked.

**If promoted later**, the minimal footprint would be:
- A new §"Running unattended" subsection in `AGENTS.md` with a one-paragraph summary + link to the containment post and the Claude Code reference devcontainer docs.
- A `setup-harness/templates/README.md.tmpl` note: "if you plan to run agents unattended, review containment guidance in `AGENTS.md`".

**Verify before applying:** `grep -rn 'devcontainer\|containment\|sandbox' AGENTS.md CLAUDE.md skills/setup-harness/ 2>/dev/null` — if hits, the pattern is already in flight and this § is obsolete.

**Recommended verdict:** defer until a consumer project asks for unattended mode — not a current pain point.

**Status:** PENDING — awaiting triage in PR review

---

## §4 — Note Agent Skills spec donation to AAIF in `AGENTS.md`

**Source:** https://www.anthropic.com/news/donating-agent-skills-to-the-agentic-ai-foundation (Oct 22, 2026)

**What the post states:**
- Anthropic has donated the Agent Skills name, logo, GitHub organization, and `agentskills.io` domain to the Agentic AI Foundation (Linux Foundation project co-founded by Anthropic + Block + OpenAI).
- The donation does **not** change the SKILL.md format, YAML frontmatter schema, or distribution mechanism. Existing files continue to work.
- The roadmap mentions future versioned releases, a formal proposal process, and security guidance — none have landed yet.

**What's already in place (grep'd 2026-11-11):**
- 24 `skills/*/SKILL.md` files, all already using the Anthropic frontmatter shape (`name`, `description`).
- `AGENTS.md` is the tool-neutral protocol doc; it doesn't currently state where the SKILL.md spec lives.
- `grep -rn 'agentskills\|AAIF\|Agentic AI Foundation' .` → **0 matches**.

**Concrete change proposed (one-line addition):**

In `AGENTS.md`, under the "Skills" section (if present) or the "Prior Work" / references section, add:

```markdown
> The SKILL.md format + frontmatter shape used here follow the Agent Skills spec, now maintained by the Agentic AI Foundation at [agentskills.io](https://agentskills.io/) (Anthropic donated the spec in Oct 2026). No harness change needed — the file format is unchanged.
```

**Expected payoff:**
- Durable pointer for future readers: the spec isn't an Anthropic-internal convention anymore, it's an industry standard with a Linux-Foundation home.
- Signals to any future colleague installing the harness that SKILL.md files here are spec-compliant rather than ad-hoc.

**Why `apply`:**
- Trivial: a single Markdown line, no code touched, no tests affected.
- Durable: the AAIF governance change is irreversible; this text will remain correct.
- Low risk: no behavioral change at all.

**Verify before applying:** `grep -rn 'agentskills\|AAIF\|Agentic AI Foundation' AGENTS.md README.md 2>/dev/null` — if hits, this § is obsolete.

**Recommended verdict:** apply — one-line reference update, trivial, low-risk, durable.

**Status:** PENDING — awaiting triage in PR review

---

## §5 — 2026 Usage Policy update — no action

**Source:** https://www.anthropic.com/news/2026-usage-policy-update (Oct 8, 2026)

**What the post states:**
- Effective 2026-11-12 (one day after this review).
- New categories: deceptive-activity (influence campaigns), weapons components, surveillance tool authoring, autonomous hardware operator requirement, high-risk use cases (health/legal/financial need human-in-the-loop), abuse-toward-models restriction.
- Skills and agents are not specifically called out.

**What's already in place:**
- Harness doesn't ship anything policy-sensitive (no influence-campaign tooling, no surveillance, no autonomous hardware control).
- The `AGENTS.md` protocol already requires human-in-the-loop for substantive changes (spec-planner → wave → close-wave gates).

**Why `reject`:**
- No methodology, skill, or agent surface changes for a coding harness.
- A README reference to the usage policy adds words without adding guardrails — the policy covers end-users of Claude, not harness-distribution channels.
- The harness README already links to Anthropic's harness design research (`harness-design-long-running-apps`) as the canonical starting reference.

**If a consumer project ever needs policy-sensitive guardrails**, the right surface is the consumer project's `CLAUDE.md`, not the shared harness.

**Verify before applying:** `grep -rn '2026-usage-policy\|aup\|/legal/aup' README.md AGENTS.md CLAUDE.md 2>/dev/null` — if hits, this § is obsolete.

**Recommended verdict:** reject — no harness surface the policy update changes.

**Status:** PENDING — awaiting triage in PR review

---

## §6 — Re-affirm deferred 2026-04-19 §2 (brain/hands) + §5 (agent evals) given Fable 5.2 orchestrator positioning

**Sources (context):**
- https://www.anthropic.com/claude-fable-and-mythos-5-2 (Nov 9, 2026) — Fable 5.2 positioned as advisor/orchestrator.
- https://claude.com/blog/new-in-claude-managed-agents (May 7, 2026) — Managed Agents shipped the "outcomes" + multi-agent orchestration shape.
- Earlier deferrals: 2026-04-19 §2 (Managed Agents brain/hands split) and 2026-04-19 §5 (agent evals fixtures).

**What's changed since the deferrals:**
- Managed Agents is now a shipping product line with "outcomes" (rubric + separate-context grader + typed verdict) as a first-class pattern.
- Fable 5.2 (`claude-fable-5-2`) is explicitly positioned to fill the "brain" role — delegating to Haiku/Sonnet/Opus 5.5 subagents or being consulted as an advisor.

**Why this is bookkeeping only (`defer`):**
- The harness orchestrator already does model routing (opus → sonnet → haiku escalation with effort tiers). Fable 5.2 would be a fourth tier; introducing it is tied to §1 above (the model-pin cascade spec).
- Agent evals (2026-04-19 §5) still have no runnable fixture infrastructure. The BioMysteryBench "human-solvable / human-difficult" tier split logged in 2026-05-03 §1 is still the design constraint waiting on fixtures.
- No new action falls out of this §; the deferrals stand.

**Verify before applying:** `grep -rn 'fable-5-2\|claude-fable' .harness-profile .claude/agents/ skills/ 2>/dev/null` — if hits, §1 has already introduced Fable and this § should be re-read.

**Recommended verdict:** defer — bookkeeping, folds into §1 when §1 is spec'd.

**Status:** PENDING — awaiting triage in PR review

---

## §7 — Disposition note: six-month review window

**Not a change suggestion — context for the maintainer.**

The 2026-05-10 → 2026-11-11 window held 39 Anthropic-domain posts, of which 15 are reviewed here (the per-run cap). The rest are enterprise / governance / funding / personnel / partnership announcements with no coding-harness surface (see tracker rows below). The 15 reviewed posts cluster into:

- **4 model launches** (Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable/Mythos 5.2) — rolled into §1.
- **2 engineering posts** with potential methodology surface (components-of-agent-memory, redesigning-source-control) — §2 covers the first; the second is skipped (Scion is Anthropic-internal and explicitly not offered as a public product).
- **1 containment post** — §3.
- **1 Agent Skills governance post** — §4.
- **1 usage policy update** — §5, rejected.
- **6 others** (JPMorgan, Sheets/Whiteboards, interactive connectors, distillation defenses, Frontier Academy, Accenture) — all skipped in the tracker with one-line reasons.

**Highest-leverage item to pursue first:** §4 (apply — one-line AAIF reference; durable, zero risk).

**Highest-leverage substantive item:** §1 (spec — the Opus 4.7 pin will drift further out of date with every Anthropic launch; running the spec now while the cascade is only one generation behind is cheaper than running it after Opus 6 ships).

**Recommended verdict:** reject — bookkeeping, no concrete change.

**Status:** PENDING — awaiting triage in PR review
