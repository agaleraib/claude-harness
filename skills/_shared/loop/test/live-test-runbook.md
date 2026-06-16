# /run-loop live-test runbook (Wave 21, Task 6)

The Wave 21 stack (T1–T5) is wired end-to-end and proven by the **hermetic clean-room
smoke** (`test/smoke-clean-room.test.ts`): a real throwaway git repo driven through
read → implement (agent edits, runner commits) → exit gate → review → verify-gate →
summary, with the agentic CLI and the review model swapped for fakes at the T1 seams.

The two **non-deterministic leaves** — a real `codex exec` agent and a real Opus-4.8
review — are operator-gated. This runbook is the exact procedure to complete them. Do
NOT fabricate a passing live run; run these commands and capture the real output.

## Preconditions (operator provisions; a session cannot)

| Precondition | Why | Status in the Wave 21 worktree |
|---|---|---|
| `~/.codex` ChatGPT OAuth | Codex implement backend (`codex exec`) | present |
| `codex` CLI on PATH | implement subprocess | present |
| `ANTHROPIC_API_KEY` (review-only) | Opus-4.8 review backend (`dispatchReview` default) | **UNSET → live review DEFERRED** |
| Docker daemon | T6(a) container-lane smoke; sandcastle items | up |
| `gh` authed | issue source + findings-filer + board tick | authed |
| Global denylist hook + `RUN_LOOP_ENFORCE=1` | Claude-backend worktree confinement (not needed for the Codex default path) | operator-installed; not a session action |

The single blocker for the Wave 21 exit-gate live clause is **`ANTHROPIC_API_KEY`**: the
default review backend is `anthropic-api:opus-4.8`, and the spec's live Verify requires
"Codex implement + **Opus review** + verify-gate". Without the key, the Opus leg cannot
run, so the live drain is DEFERRED.

## T6(a) — clean-room LIVE smoke (throwaway local repo)

Run from a checkout where `skills/_shared/loop/` is present.

```bash
# 1. Provide the review-only Anthropic key (separate from any implement subscription).
export ANTHROPIC_API_KEY=sk-ant-...            # review-only key
# 2. Confirm the implement + review backends resolve as expected (Codex / Opus).
#    (default implement=codex, default review=anthropic-api:opus-4.8)
# 3. Drive one ready issue end-to-end. --yes bypasses the interactive preview.
/run-loop issues --yes
```

Expected (capture verbatim into the wave summary):
- preview lists `runner=… implement=codex review=anthropic-api:opus-4.8`;
- `runGuardrailPreflight` fires before the first item;
- the item is implemented by `codex exec`, the runner commits, the exit gate runs;
- Opus reviews the diff; findings flow into the verify-gate (reproduced → fix/file;
  unreproduced → advisory) — **no raw review assertion is acted on**;
- a green gate + clean verify ⇒ AFK merge; the run summary prints
  `merged-afk / opened-awaiting-human / deferred-blocked`.

Pass criteria: **no red merge**; no denylist violation (Claude lane) / sandbox escape
(Codex lane).

## T6(b) — quickbase-replacement #2/#3 live cross-repo test — OPERATOR-RUN, DO NOT ATTEMPT FROM A SESSION

This targets a **separate repo** (`quickbase-replacement`). It is explicitly out of
scope for any session run from the claude-harness worktree — do not mutate that repo.

Operator preconditions, then the same `/run-loop issues --yes` from inside the
quickbase-replacement checkout:
1. Seed that repo's `.harness-profile` with the loop backend knobs
   (`loop.implement_default`, `loop.review_default`, `loop.allow_external_review`).
2. Live `gh` creds for that repo; issues #2 and #3 labeled ready, #3 `blockedBy: #2`.
3. Live backend auth (`~/.codex` + `ANTHROPIC_API_KEY`).

Expected: #2 is implemented + merged/PR'd behind the mechanical gate (Codex implement +
Opus review + verify-gate); #3 is DEFERRED until #2 merges; the run summary emits the
AFK-merged / HITL-waiting / blocked-on-human metric (the Option-C workability verdict).

## Wave 22 — dual-direction live re-drain of quickbase-replacement #2/#3 (T7, F-021) — OPERATOR-RUN

> **DO NOT EXECUTE FROM A SESSION.** Needs live `gh` + backend auth (keys re-provided per
> run, never stored), a real external repo (`agaleraib/quickbase-replacement`), and
> human-judgment acceptance. Do NOT mutate quickbase-replacement from the claude-harness
> worktree. This is the deferred **T6b verdict**, now run in BOTH backend directions.

### What Wave 22 fixed (why this re-drain is expected to pass where T6b failed)

The first T6b run (2026-06-15) surfaced four integration bugs; all are fixed + unit-proven:

| Bug | Wave 22 fix | Regression test |
|-----|-------------|-----------------|
| 1 — #3 ran before #2 (readiness not enforced) | `ReadinessGatedSource` gates the issues drive; blockers run first, blocked items withheld until done (recorded-completed-this-run OR issue-terminal) | `test/readiness-drive.test.ts` |
| 2 — unsupported lane crashed the loop | `ProductionProtocol.run` try/catch (skip-and-continue) + preflight refuses unwired sandcastle | `test/prod-deps.test.ts`, `test/run-loop-driver.test.ts` |
| 3 — non-zero codex exit discarded real edits | commit-on-dirty-tree regardless of exit code; truncated stderr surfaced; `ShellGitCommitter.dirty()` probe | `test/prod-deps.test.ts`, `test/implement-adapters.test.ts` |
| 4 — implement failure mis-bucketed as gate-failed | additive `implementFailed` bucket; `implement-failed:`/`gate-failed:` note prefixes route the report | `test/termination.test.ts`, `test/prod-deps.test.ts` |
| 5 (scope) — issue never transitioned | env-gated `RUN_LOOP_TRANSITION_ISSUES=1` terminal transition (default-off = read-only) | `test/prod-deps.test.ts` |

Plus the **per-run backend-direction knob** (`--implement`/`--review` + env; flag wins;
unknown errors before any side effect) enables Direction B.

### Operator preconditions (per run; nothing stored)

1. Live `gh` creds for `agaleraib/quickbase-replacement`; issues #2 (ready) and #3
   (`## Blocked by #2`, ready) labeled `ready-for-agent`.
2. Live backend auth re-provided into `process.env` only:
   - `~/.codex` ChatGPT OAuth (codex implement + codex review);
   - `ANTHROPIC_API_KEY` review-only (Direction A Opus review);
   - `OPENROUTER_API_KEY` (only if a `--review openrouter:<model>` variant is run).
3. A throwaway branch in the quickbase-replacement checkout (reversible).
4. Decide whether to flip `RUN_LOOP_TRANSITION_ISSUES=1` (mutates real issues —
   relabel/close). Default-off keeps the run local-commit-only + reversible.

### Direction A — Codex implement → Opus-4.8 review (external; the original acceptance)

```bash
# From inside the agaleraib/quickbase-replacement throwaway-branch checkout:
RUN_LOOP_ALLOW_EXTERNAL_REVIEW=1 \
  node <path-to>/skills/_shared/loop/run-loop-entry.ts issues \
  --implement codex --review anthropic-api:opus-4.8 --yes
```

### Direction B — Claude implement → Codex review (local review; no egress flag)

```bash
# Local review ⇒ NO RUN_LOOP_ALLOW_EXTERNAL_REVIEW needed.
node <path-to>/skills/_shared/loop/run-loop-entry.ts issues \
  --implement claude --review codex --yes
```

**Honest caveats for Direction B (record alongside the result):**
- `ClaudeImplementAdapter` is spike-validated but never live-run — this is its FIRST live proof.
- `CodexReviewBackend` is unit-tested but never live-run — also its FIRST live proof.
- `implement=claude` is metered at full Claude API rates post-2026-06-15 (deliberate, not the cheap default).

### Acceptance (each direction must satisfy ALL)

- #2 drains end-to-end: implement → **runner commits EVEN on a non-zero-with-edits codex exit** → exit gate green → review → verify-gate → done/transition;
- **#3 is DEFERRED** until #2 reaches a done state (readiness gate);
- **no unsupported-lane crash** (skip-and-continue or preflight-refuse);
- the run summary emits the **AFK-merged / HITL-waiting / blocked** metric with an **honest implement-failed bucket** distinct from gate-failed;
- no red merge; no sandbox escape / denylist violation.

### Captured-summaries template (paste the REAL printed output)

```text
# Direction A — codex → anthropic-api:opus-4.8   (run <UTC timestamp>)
/run-loop direction: implement=codex review=anthropic-api:opus-4.8
/run-loop preview: <N> ready item(s).
  - issue-2: runner=… implement=codex review=anthropic-api:opus-4.8
  - issue-3: <deferred — blocked by #2>            ← assert #3 not processed before #2
… (trace: implement / commit / gate / review / verify-gate / merge) …
/run-loop summary:
  merged-afk:            <n>
  opened-awaiting-human: <n>
  deferred-blocked:      <n>            ← #3 expected here until #2 done
  escalated:             <n>
  implement-failed:      <n>            ← honest bucket (Bug 4)
  gate-failed:           <n>
  stop-reason:           drained
  visited (<k>): issue-2[, …]

# Direction B — claude → codex   (run <UTC timestamp>)
/run-loop direction: implement=claude review=codex
… (same shape; note: FIRST live proof of ClaudeImplementAdapter + CodexReviewBackend) …
/run-loop summary:
  …

# Verdict (human judgment):
#   Direction A: PASS / FAIL — <one line>
#   Direction B: PASS / FAIL — <one line; is claude→codex a recommended config or documented-but-discouraged?>
```

### CAPTURED RESULTS — both directions PASS (2026-06-16)

Run live against `agaleraib/quickbase-replacement` #2/#3 on throwaway branches. **Both directions
drained #2 end-to-end; #3 deferred-then-isolated; honest summaries.** This is the T6b verdict, met.

| Direction | Implement | Review | Commit | Summary |
|-----------|-----------|--------|--------|---------|
| **A — codex→Opus** | codex gpt-5.5, 730 lines / 8 files | `anthropic-api:opus-4.8`, **0 findings** | `e360fe8` | `merged-afk:1 implement-failed:1 (issue-3 isolated) drained visited(2)` |
| **B — claude→codex** | claude, 633 lines / 5 files | `codex` gpt-5.5, **2 findings** → verify-gate triaged → both advisory (unreproduced), escalate=false | `83eb002` | `merged-afk:1 implement-failed:1 drained visited(2)` |

Both runs exercised every Wave-22 fix live (T1 readiness deferred #3 then unblocked it in-run; T2
refused #3 at preflight AND isolated its sandcastle throw; T3 committed edits; T4 honest
implement-failed bucket; T6 knob selected the direction). Direction B is the **first live proof** of
`ClaudeImplementAdapter` + `CodexReviewBackend` (cross-model adversarial review working). No GitHub
mutation (`RUN_LOOP_TRANSITION_ISSUES` left default-off; A's Opus review returned 0 findings, B's 2
findings were unreproduced advisories — nothing filed). **Verdict: A PASS, B PASS — claude→codex is a
viable cross-model config (codex surfaced 2 real review points; the verify-gate correctly gated them).**

> **OPERATOR GOTCHA — codex auth (cost us a long detour; bake into any codex run):**
> codex uses its ChatGPT-subscription gpt-5.5 ONLY when there is **no competing OpenAI API key**.
> If `OPENAI_API_KEY` is in the env OR an `api_key` sits under `[providers.openai]` in
> `~/.codex/config.toml`, codex enters a broken **mixed-auth** state (`codex doctor` warns
> "mixed auth signals") and fails with misleading `usage limit` / `revoked token` /
> `Missing bearer` errors — NOT a real cap. Fix: remove the `api_key` line from
> `~/.codex/config.toml` and run codex with `OPENAI_API_KEY` UNSET. The exact runs above used:
>
> ```bash
> # Direction A (Opus review needs ANTHROPIC_API_KEY; codex needs OPENAI_API_KEY UNSET):
> set -a; source <env-with-ANTHROPIC_API_KEY>; set +a
> unset OPENAI_API_KEY
> RUN_LOOP_ALLOW_EXTERNAL_REVIEW=1 node <path>/run-loop-entry.ts issues \
>   --implement codex --review anthropic-api:opus-4.8 --yes
>
> # Direction B (claude implement = host login; codex review = sub; no anthropic key needed):
> unset OPENAI_API_KEY
> RUN_LOOP_ENFORCE=1 node <path>/run-loop-entry.ts issues \
>   --implement claude --review codex --yes
> ```
>
> Direction B's claude-WORKTREE lane also requires the global denylist hook active —
> `RUN_LOOP_ENFORCE=1` + the installed `~/.claude/settings.json` PreToolUse hook, detected by the
> `InstalledDenylistHookProbe` wired in `fix(loop): wire real denylist hookProbe` (`c29ef37`).
> (Codex worktree items don't need it — native sandbox is their boundary.)
> Follow-up candidate: have the codex adapters strip `OPENAI_API_KEY` from the child env in sub mode
> so this footgun can't recur (analogous to `ClaudeImplementAdapter` stripping `CLAUDECODE`).

## Container-lane (Docker) auth check — DEFERRED sub-clause of T2

The T2 Verify "a container run authenticates on the mounted token and produces a commit
visible on the host" needs Docker + the Codex OAuth token mounted into the container
(`~/.codex` ro seed → writable `CODEX_HOME` copy). The `ContainerRunner` seam is in
place and unit-asserted; the live container auth is operator-run (Docker is up, but the
container image + mount wiring is an operator step, not a session action).
