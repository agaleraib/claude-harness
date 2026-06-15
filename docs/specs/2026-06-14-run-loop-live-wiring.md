# Spec: /run-loop live wiring — pluggable backends, Codex-default, cross-model review

**Date:** 2026-06-14 (rewritten 2026-06-15 after the backend pivot + spike validation)
**Status:** design validated end-to-end via 5 spikes (see §Validation); ready to build
**Board wave:** Wave 21 (single wave)
**Predecessor:** `docs/specs/2026-06-14-run-loop-engine.md` (Waves 18–20 — the engine + safety logic)

## Why this spec exists

Waves 18–20 built the `/run-loop` **engine, protocol, scheduler, and safety logic** — the brain —
with every real side effect behind an injected seam. Those seams have **only test stubs**: nothing
calls `runLoop()` with production deps, the runner adapters spawn no agent, and there is no live
driver. So `/run-loop issues` reads issues but cannot drive real work. This wave builds the **hands**:
concrete adapters + a live driver.

Two events reshaped the design after the original draft:

1. **The Anthropic billing change (effective 2026-06-15)** moves Claude Code + Agent SDK usage to a
   separate, capped, **metered** programmatic credit pool (full API rates, no subscriber discount,
   no rollover). An unattended per-item agent loop is "heavy automation," so Claude-backend dispatch
   is now metered **in every lane** — eliminating the "host lane = free subscription" advantage the
   original default-runner analysis relied on.
2. **Codex offers a structurally better fit for the bulk implementation work**: file-based ChatGPT
   OAuth (portable into containers, unlike Claude's macOS Keychain) and a native OS-level sandbox
   (`codex exec -s workspace-write`) that subsumes most of the hand-rolled Wave-20 worktree guardrails.

The result is **not** a Codex-only pivot. The engine is tool-neutral by contract (AGENTS.md
"Loop protocol"), so the right move is to **make the backend pluggable** and pick economical defaults.

## Decisions (locked — see §Validation for the empirical basis)

| Axis | Decision |
|---|---|
| Loop architecture | **Node-driven** — keep the tested `runLoop` engine; the runner re-enters an agent by **shelling to a headless CLI subprocess** (the harness `Agent` tool is unreachable from a node process). |
| Backend pluggability | **Un-punt agnosticism.** A `dispatchAgent` seam selects the backend; the engine stays backend-agnostic. |
| **Implement** backend | **Codex (`codex exec`) = default** (ChatGPT-sub OAuth, sidesteps Anthropic metering) · **Claude (`claude -p`) = flag.** Per-item override via the runner/label field. |
| **Review** backend | A **separate** selector (`dispatchReview` — a model judgment on a diff, *not* an agentic CLI): **Anthropic API → Opus 4.8 = default** · **OpenRouter (complexity-routed)** · Codex same-model = fallback. Review is low-volume → **pay-per-token API is intentional and cheap**. |
| Commit model | **Agent edits, runner commits.** The agent only touches workspace files; the unsandboxed node runner does `git add`/`commit` after. Backend-uniform (works for Codex's read-only-`.git` sandbox *and* Claude). |
| Dispatch mechanics | Child stdin **ignored** (`stdio:['ignore',…]`) — `codex exec` blocks indefinitely on open stdin; `claude -p` waits 3s. |
| Worktree confinement | **Codex native `-s workspace-write`** (host, OS-enforced) / container = boundary. The **Wave-20 denylist hook + `RUN_LOOP_ENFORCE` become the *Claude*-backend's worktree story**, not the universal path. |
| Container auth | Codex: mount `~/.codex` (ro seed → writable `CODEX_HOME` copy) + `codex exec --dangerously-bypass-approvals-and-sandbox` (container is the boundary). Run as non-root for Claude; Codex tolerates root under sandbox-bypass. |
| Review trust | **Verify-gate is authoritative.** A review finding is a *proposal*: convert a claimed bug to a failing test and re-run the gate. Never merge/act on a raw review assertion — even from Opus. |
| Review data egress | An external review API (OpenRouter, or any non-local endpoint) sends code diffs to a third party → **per-repo policy knob** governing which repos may use a non-local review backend (ties to Wave-20 egress posture). |
| Cost ceiling | No loop-level spend cap — operator owns spend via account-level limits. Wave-19 iteration cap (default 20; run low first) is the only loop-side bound. |
| Pre-run preview | Driver prints "N ready items + resolved order/runners — proceed?" with a `--yes` bypass for cron. |

## Validation (5 spikes, 2026-06-14/15 — artifacts in `/tmp/*-spike/`, throwaway)

1. **Claude host dispatch — PASS.** node → `claude -p` (CLAUDECODE/`CLAUDE_CODE_*` stripped, bypassPermissions) ran a headless agent that committed; `collectCommits` recovered it. Impl note: ignore stdin.
2. **Denylist-hook backstop — PASS (A/B).** With the global hook + `RUN_LOOP_ENFORCE=1`, a dispatched agent's `rm -rf` outside the worktree was **blocked** (sentinel survived); control without the env var **deleted** it. The hook is the differentiator, not model refusal. *(This is now the Claude-backend's worktree safety story.)*
3. **Codex dispatch, both lanes — PASS.** Host: `codex exec -s workspace-write` ran headless on the ChatGPT OAuth token, edited the file; the unsandboxed runner committed (`e28cf6f`). Container: mounted OAuth token **authenticated inside a Linux container** (the exact thing the macOS Keychain blocked for Claude), created the file, no root refusal under sandbox-bypass. Findings folded into Decisions: stdin-ignore; `.git` is read-only under `workspace-write` → **agent-edits/runner-commits**.
4. **gpt-5.5 implementation capability — PASS.** Given a stub + 10 tests (unit-order rejection, >59 min, empty/garbage validation), `codex exec` produced a correct one-shot `parseDuration`; the gate verified **10/10 green independently**.
5. **Cross-model review tier — the reviewer-quality thesis, proven.** Reviewing #4's Codex diff: **haiku** gave one finding = a **false positive** (claimed JS `$` matches before `\n`; verified wrong). **Opus 4.8** (via Anthropic API) **cleared that false positive** with correct reasoning *and* found **two real gaps the tests missed** — non-string coercion (`parseDuration(["1h"])`→3600) and >2^53 precision loss — both verified empirically. Conclusions: reviewer model tier is load-bearing (Opus-4.8-class default); and the **verify-gate is essential** (both reviewers' findings were verified before accept/discard).

## Scope (what exists vs. what this wave adds)

| Seam / piece | Today | Wave 21 |
|---|---|---|
| `runLoop` / scheduler / providers / gh-adapter | ✅ tested, tool-neutral | reuse unchanged |
| Wave-20 denylist hook / write-root / egress | ✅ built + spike-validated | **demoted** to the Claude-backend's worktree adapter |
| `dispatchAgent` (implement) seam + backend registry | ❌ | **T1** |
| Codex + Claude implement adapters (both lanes) | ⚠️ stub | **T2** |
| `dispatchReview` seam + Opus-API / OpenRouter / Codex review backends | ❌ | **T3** |
| Mechanical gate (`GateRunner`) + **verify-gate** + findings-filer | ⚠️ stub | **T4** |
| Live driver (preflight → runLoop → preview → summary) | ❌ comment only | **T5** |
| Real smoke + live test | ❌ (was stubbed) | **T6** |

## Tasks

### Task 1: Backend abstraction — `dispatchAgent` + `dispatchReview` seams + registry

Introduce two dispatch seams and a backend registry resolved from config:
- `dispatchAgent(prompt, {cwd, env, lane})` → runs an **agentic CLI** (implement step; needs tools/workspace/sandbox). Backends: `codex` (default), `claude` (flag). Resolved per item from the runner/label field; engine stays backend-agnostic.
- `dispatchReview(diff, {context})` → a **single model judgment on a diff** (no tools). Backends: `anthropic-api:opus-4.8` (default), `openrouter:<model>` (complexity-routed), `codex` (same-model fallback).
- Both spawn with **stdin ignored** (`stdio:['ignore','pipe','pipe']`) — non-negotiable (codex blocks on stdin otherwise).
- Config: backend selection + API keys (`ANTHROPIC_API_KEY` review-only, `OPENROUTER_API_KEY`) sourced from env / `.harness-profile`, never logged.

**Verify:** Unit tests over backend resolution (per-item override, defaults, unknown-backend error). A dispatch helper test asserts the child is spawned with no stdin. Selecting `claude` vs `codex` for implement, and `anthropic-api` vs `openrouter` for review, routes to the right adapter (adapters stubbed).

### Task 2: Concrete implement adapters — Codex (default) + Claude, both lanes, runner-commits

- **Codex adapter:** worktree lane = `codex exec -s workspace-write -C <wt> --skip-git-repo-check`; sandcastle lane = container with `~/.codex` mounted (ro seed → writable `CODEX_HOME` copy) + `--dangerously-bypass-approvals-and-sandbox` (container is the boundary). Image runs the agent (non-root for Claude; Codex tolerates root under bypass).
- **Claude adapter:** `claude -p` with `CLAUDECODE`/`CLAUDE_CODE_*` stripped; worktree lane gated by the Wave-20 denylist hook + `RUN_LOOP_ENFORCE=1` (its confinement story); sandcastle lane = container with a `setup-token`/`ANTHROPIC_API_KEY` (subscription-in-container is unsupported/grey — see OQ).
- **Agent edits, runner commits:** after the agent returns, the unsandboxed node runner does `git add -A && git commit` (the agent's sandbox makes `.git` read-only). Then `collectCommits(base..HEAD)`.

**Verify:** Against a throwaway repo, the Codex adapter (host) runs an agent that edits files, the runner commits, `collectCommits` returns the commit. A container run authenticates on the mounted token and produces a commit visible on the host. The Claude adapter (host) does the same with the hook active. Docker-absent ⇒ sandcastle items abort cleanly (reuse `preflightRunners`).

### Task 3: Concrete review backends — Opus-4.8 API (default) + OpenRouter + Codex; verify-gate-fed

`dispatchReview` implementations:
- **`anthropic-api:opus-4.8`** (default) — a completion on the per-item diff. Low-volume → pay-per-token, billed to a review-only `ANTHROPIC_API_KEY` (separate from the implement subscription).
- **`openrouter:<model>`** — OpenAI-compatible endpoint, model chosen by review complexity.
- **`codex`** — same-model fallback (cheapest; weakest adversarial value).
- **Data-egress policy:** a `.harness-profile` knob declares whether a repo may use a non-local review backend; if not, fall back to a local/Codex review and log it (external review APIs receive code diffs — a third-party data egress).

**Verify:** The same diff routed to each backend returns a structured findings list. With the external-review policy off for a repo, an `openrouter` selection is refused/downgraded to local with a logged reason. A weak reviewer's false positive and a strong reviewer's real finding both flow into T4's verify step (not acted on directly).

### Task 4: Mechanical gate + verify-gate (reviewer proposes, gate decides)

- **`GateRunner`** runs the item's exit gate in its workspace — tests + typecheck + the item's `Verify`/acceptance checks — returning `GateResult` (red blocks merge, no short-circuit).
- **Verify-gate:** each review finding is a *proposal*. Before any auto-fix or escalation, the loop attempts to **reproduce** it as a failing assertion against the gate; only reproduced findings drive a fix round (bounded; then escalate). Unreproduced findings are logged as advisory, never block a merge. This is the discipline the spike proved necessary (a confident reviewer — even Opus — can be wrong; haiku was).
- Reproduced-but-unfixed findings → filed as gh issues via the real `GhClient` (`from:code-review` + source label), idempotently.

**Verify:** A fixture with a deliberately failing test produces a red `GateResult` and is NOT merged. A *real* review finding (e.g. the non-string-coercion gap) reproduces as a failing test and drives a fix round; a *false-positive* finding (the JS-`$`/newline claim) fails to reproduce and is logged advisory, not acted on. Re-running files no duplicate issues.

### Task 5: The live driver — preflight → runLoop → preview → summary

`run-loop-entry.ts` (or a `run-loop-driver.ts` it delegates to) builds production `EngineDeps`
(providers + protocol + `DefaultRunnerFactory` with T2 implement adapters + T3 review backends),
runs `runGuardrailPreflight` (now backend-aware: Codex lane relies on its native sandbox; Claude
worktree lane requires the denylist hook), then `runLoop`, and prints the `RunSummaryReport`
alongside the frozen `RunSummary`. Includes the **pre-run preview** ("N ready items + resolved
backends/runners — proceed?", `--yes` bypass). `/run-loop --help` short-circuits before any of it.

**Verify:** `/run-loop issues` on a repo with one ready item drives read → implement (Codex) → gate →
review (Opus) → verify → merge → board tick, and prints a summary with the AFK/HITL/blocked metric.
`--help` does nothing else. `runGuardrailPreflight` is provably invoked before the first item, and is
backend-aware (a Claude worktree item without the hook is refused; a Codex item is not).

### Task 6: Real smoke + live test

(a) Clean-room smoke against a throwaway local repo: one ready item, Codex implements, Opus reviews,
runner commits/merges. (b) The deferred **quickbase-replacement #2/#3** live test (after seeding its
`.harness-profile`). Capture the AFK-merged / HITL-waiting / blocked-on-human run summary as the
Option-C workability verdict.

**Verify:** A live run merges/PRs #2's work behind the mechanical gate (Codex implement + Opus review
+ verify-gate), defers #3 until #2 is merged, and emits the run-summary metric. No red merge; no denylist
violation (Claude lane) / sandbox escape (Codex lane).

## Exit gate

`skills/_shared/loop/` tests stay green (134 + new); strict `tsc` 0 errors; no `any`; **no frozen
Phase-1 interface change** (additive impls only — flag loudly if forced). A real `/run-loop issues`
run drains ≥1 item end-to-end via the **Codex-implement + Opus-review + verify-gate** path and emits
the AFK/HITL/blocked summary (T5/T6).

## Open questions

1. **Backend defaults are pricing-driven and may shift.** Codex-default rests on ChatGPT-sub OAuth
   being viable for automation; OpenAI could meter it like Anthropic did (2026-06-15). The pluggable
   seam is the hedge — defaults are config, not architecture.
2. **Subscription-for-unattended-automation is ToS-grey for every vendor** (Claude *and* OpenAI), per
   the sandcastle #191 thread. Not legal advice; the operator owns the call. The API-billed review
   path is unambiguous.
3. **Claude-backend container auth** has no clean subscription path (Keychain not portable; #191 OPEN).
   The Claude sandcastle lane needs `setup-token`/`CLAUDE_CODE_OAUTH_TOKEN` (grey) or an API key
   (metered). The Codex sandcastle lane has no such problem (file OAuth). So the Claude backend is
   effectively worktree-first.
4. **OpenRouter / external review egress.** Sending diffs to a third party is a data-egress decision;
   the per-repo policy knob (T3) governs it, but the portable default (which repos opt in) is unpinned.
5. **Codex reads `AGENTS.md`** (its own convention) — our "Loop protocol" section will be seen by
   dispatched Codex agents. Likely a feature (they follow the protocol); confirm it doesn't mislead.
6. **OS-level egress/write-guard portability** (carried from the engine spec) — `sandbox-exec` macOS vs
   netns/landlock Linux; the portable subset is unpinned. Codex's native sandbox covers the Codex lane;
   the Claude worktree lane keeps the advisory-or-OS-enforced posture with honest run-summary surfacing.
