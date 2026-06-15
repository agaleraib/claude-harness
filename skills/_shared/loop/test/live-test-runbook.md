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

## Container-lane (Docker) auth check — DEFERRED sub-clause of T2

The T2 Verify "a container run authenticates on the mounted token and produces a commit
visible on the host" needs Docker + the Codex OAuth token mounted into the container
(`~/.codex` ro seed → writable `CODEX_HOME` copy). The `ContainerRunner` seam is in
place and unit-asserted; the live container auth is operator-run (Docker is up, but the
container image + mount wiring is an operator step, not a session action).
