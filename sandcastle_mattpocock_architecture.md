# Sandcastle (`@ai-hero/sandcastle`) — merge & multi-item architecture review

## Provenance — what I reviewed

- **Source:** `git clone https://github.com/mattpocock/sandcastle` (full source, not a dist tarball).
- **Commit:** `d7a41c828495d571a3837a980ae167dd595e4a18` — "Merge pull request #813 from mattpocock/changeset-release/main", dated 2026-06-16.
- **Package version:** `@ai-hero/sandcastle` **0.9.0** (`package.json`).
- **Local trial config** (public API surface): `~/workspace/sandcastle-trial/.sandcastle/main.mts` (calls `run({ sandbox, agent, promptFile, maxIterations, branchStrategy: { type: "merge-to-head" }, copyToWorktree, hooks })`).
- All file:line citations below are against the cloned tree at `/tmp/sandcastle-src`.

This is pre-1.0 software; behavior may move. Code is treated as source of truth over docs/README.

---

## 1. Merge model: merge-to-HEAD directly, NO PR

**Sandcastle merges each completed run directly into the host's current branch with a plain `git merge`. It never opens a pull request. There is zero PR / GitHub-API code in `src/`.**

Verification — `grep -rniE "createPullRequest|gh pr create|pulls\.create|octokit|pull_request|openPR" src/` (excluding tests) returns **nothing**.

The actual merge (`src/SandboxLifecycle.ts:427-462`):

```ts
if (hasNewCommits) {
  // Fast-forward host's current branch to the temp branch
  yield* display.taskLog(`Merging to ${hostCurrentBranch}`, () =>
    Effect.tryPromise({
      try: async () => {
        try {
          await execAsync(`git merge "${resolvedBranch}"`, {
            cwd: hostRepoDir,        // <-- runs on the HOST repo, current branch
          });
        } catch {
          throw new Error(
            `Merge of '${resolvedBranch}' onto '${hostCurrentBranch}' failed. ` +
              `The temporary branch '${resolvedBranch}' has been preserved. ...`,
          );
        }
      },
      ...
```

After a successful merge the temp branch is deleted (`src/SandboxLifecycle.ts:464-469`):

```ts
yield* Effect.promise(() =>
  execAsync(`git branch -D "${resolvedBranch}"`, { cwd: hostRepoDir }).catch(() => {}),
);
```

Note the comment at `SandboxLifecycle.ts:405-409`: they deliberately use `git merge` (not cherry-pick) so it handles both the fast-forward case (HEAD unmoved) and the diverged case (HEAD moved since the worktree was cut). There is no `git push` and no remote interaction in this path.

---

## 2. `branchStrategy` — three strategies, what each does to git

Type union: `src/SandboxProvider.ts:246-289`. There are **exactly three** variants. There is **no `pr` / `pull-request` strategy.**

| Strategy | Type literal | What it literally does to git |
|---|---|---|
| **head** | `{ type: "head" }` (`SandboxProvider.ts:246-248`) | No worktree, no temp branch. The host working directory is **bind-mounted** straight into the sandbox; the agent commits directly onto the host's current branch. Bind-mount / no-sandbox only — **rejected for isolated providers** (`run.ts:394-398`). Incompatible with `copyToWorktree` (`run.ts:401-410`). This is the default for bind-mount/no-sandbox providers (`run.ts:386-390`). |
| **merge-to-head** | `{ type: "merge-to-head" }` (`SandboxProvider.ts:250-253`) | Creates a **temporary timestamped branch** `sandcastle/<ts>-<randomsuffix>` in a git worktree under `.sandcastle/worktrees/`, agent works there, then on completion runs `git merge "<tempbranch>"` into the host's recorded current branch (`SandboxLifecycle.ts:433`) and `git branch -D` the temp branch. Default for **isolated** providers (`run.ts:388-389`). Temp name generator: `WorktreeManager.ts:82-89`. |
| **branch** (named) | `{ type: "branch", branch: string, baseBranch?: string }` (`SandboxProvider.ts:255-266`) | Commits land and **stay** on an explicit named branch in its own worktree. **No merge to HEAD** — `hostCurrentBranch` is `null` (`SandboxLifecycle.ts:197`, the `!branch` guard), so the merge block is skipped and the `else` branch at `SandboxLifecycle.ts:498-527` just collects the commits on `refs/heads/<branch>`. `baseBranch` chooses the start ref when the branch doesn't exist yet. This is the only strategy with a worktree **lock** and an `origin` fast-forward-on-reuse (ADR 0003 / ADR 0007). |

The dispatch on `hostCurrentBranch !== null` (`SandboxLifecycle.ts:404`) is the switch between "merge-to-head behavior" (head + merge-to-head both end up merging/committing onto the host's branch) and "named-branch behavior" (commits stay put).

Per-provider allow-lists (`SandboxProvider.ts:268-289`): bind-mount and no-sandbox allow all three; **isolated allows only `merge-to-head` and `branch`** (it has no host working dir to write `head` into).

---

## 3. Where the merge happens — on the HOST, not in the container

The merge is a host-side shell-out, not a container operation:

- `git merge` runs with `cwd: hostRepoDir` (`SandboxLifecycle.ts:434`) — the real host repo path.
- The agent works inside a **git worktree** on the host filesystem (`.sandcastle/worktrees/<name>/`), created by `WorktreeManager.create()` (`createWorktree.ts:231-234`, `SandboxFactory.ts:329-330`).
- The sandbox (Docker/Podman/none) is mounted onto that worktree. For **bind-mount** providers the worktree is shared with the container directly (filesystem already shared). For **isolated** providers the container is separate and changes are synced back to the host worktree via `applyToHost`/`syncOut` (git bundle / `format-patch`+`am`) **before** the host runs `git merge` (`SandboxLifecycle.ts:385-398`, `createWorktree.ts:490-495`, ADR 0017).
- So the trace is: agent commits in worktree → (isolated only) `syncOut` patches commits onto host worktree → host `git merge "<tempbranch>"` into HEAD → host `git branch -D <tempbranch>`. The container never touches the host's HEAD branch.

---

## 4. Multiple work items & dependencies — SANDCASTLE PUNTS THIS

**This is the most important finding. Sandcastle is fundamentally one-`run()`-per-call. It has NO multi-item queue, NO dependency DAG, and NO "issue B blocked by issue A" primitive in its core. Multi-item orchestration and dependency resolution are entirely the caller's job.**

What `run()` actually offers is `maxIterations` (`run.ts:380`, default 1), an **iteration loop** — not a work-item queue:

- `Orchestrator.orchestrate()` loops `for (let i = 1; i <= iterations; i++)` (`Orchestrator.ts:342`), and calls `factory.withSandbox(...) → withSandboxLifecycle(...)` **inside the loop body** (`Orchestrator.ts:346-362`). So worktree-create + agent-run + **merge-to-head happen once per iteration**.
- The semantics of "iteration" is the *same prompt re-run N times* (the simple-loop template's prompt is "pick the next open issue and close it"). Each iteration cuts a fresh temp branch off the **current** HEAD, so iteration `i+1` sees the merge from iteration `i`. That is the only built-in sequencing: sequential iterations compose because each merges to HEAD before the next branches off it. There is no notion that iteration 2 "depends on" iteration 1 — it just starts from whatever HEAD now is.
- The trial `main.mts` comment confirms intent: *"Each iteration works on a single issue."* The dependency ordering ("which issue first") is left to the agent's own judgement inside the prompt.

**Where dependencies actually live: in an LLM agent, in a userland template — not in the engine.** The `parallel-planner` template (`src/templates/parallel-planner/main.mts`) is the canonical multi-item example, and it builds the DAG *in the prompt*, not in code:

- Phase 1 (`main.mts:68-90`): an **opus agent** reads open issues, "builds a dependency graph," and emits `<plan>` JSON of **unblocked** issues + target branch names. Validated via `Output.object` + Zod. Dependency analysis = a model call, not a scheduler.
- Phase 2 (`main.mts:108-132`): `Promise.allSettled` fans out one `run()` per unblocked issue, each with `branchStrategy: { type: "branch", branch: issue.branch }` — so each parallel item lands on **its own named branch** and does NOT merge to HEAD during execution.
- Phase 3 (`main.mts:185-199`): a **merger agent** is handed the list of completed branches and told (in `merge-prompt.md`) to `git merge <branch> --no-edit` each one, resolve conflicts by reading both sides, run typecheck+tests, and commit. Conflict resolution = another model call.
- The outer `for` loop (`main.mts:56`) repeats plan→execute→merge so "newly unblocked issues are picked up after each round of merges." That is the only DAG progression mechanism, and it is hand-rolled in the template.

So: **dependent items are composed by (a) running them on isolated named branches, then (b) having an LLM merge agent integrate the branches in a separate pass.** The engine contributes git plumbing (`branch` strategy + a merge that an agent can drive); the *ordering and blocking logic is delegated to a planner LLM and the user's loop code.* If you ask "how would two dependent items compose under merge-to-head?" — the honest answer is they don't, directly: you would either (i) run them **sequentially** as two `run()` calls / two iterations so the second branches off the first's merged HEAD, or (ii) put them on named branches and run a merge pass. Concurrent merge-to-head for dependent items is explicitly unsafe (see §5).

---

## 5. Concurrency / locking / stale-HEAD

- **merge-to-head is NOT concurrency-safe.** ADR 0018 (`docs/adr/0018-fork-is-session-only.md`) states plainly: *"On the head and merge-to-head strategies, concurrent forks share a working directory / race to merge into the host's HEAD, so they are unsafe."* `merge-to-head` runs `git merge` into the host's current branch, so two concurrent runs race the git index. The README/`run.ts:341-356` `fork()` doc repeats: safe concurrent fan-out **requires a distinct `branch` per fork**.
- **The safe concurrent path is the `branch` strategy**, and only it gets a **lock**. ADR 0007 (`docs/adr/0007-worktree-locking.md`): a file lock at `.sandcastle/locks/<name>.lock` (atomic `O_EXCL`, PID-liveness stale detection, **fail-fast, no wait/retry**) prevents two runs sharing one named-branch worktree. ADR 0007 §Scope: *"Only the branch strategy is affected. The merge-to-head strategy creates unique timestamped branches per run, so collisions are impossible."* — i.e. merge-to-head avoids *branch-name* collisions (timestamp + random suffix, `WorktreeManager.ts:82-89`) but still races on the *HEAD merge* itself, which the lock does NOT cover.
- **Stale-HEAD handling within sequential runs:** `git merge` (not cherry-pick) is chosen precisely so a moved HEAD is handled — fast-forward if HEAD unmoved, real merge if diverged (`SandboxLifecycle.ts:405-409`). There is **no rebase and no retry** anywhere in the merge path.
- **Named-branch reuse refresh:** on reuse of a `branch`-strategy worktree, sandcastle does `git fetch origin <branch>` + `git merge --ff-only` *only* when clean and strictly behind (ADR 0003). It never `reset --hard`, so unpushed commits are never clobbered. merge-to-head worktrees are fresh per run so this is a no-op there.

Net: concurrency is solved **only** for the named-branch strategy (via a fail-fast lock), and even then only for worktree sharing — not for the act of merging to HEAD. Auto-allocated unique branches + serialized/skipped merges for true workspace fan-out is explicitly **deferred / out of scope** (ADR 0018 §Decision).

---

## 6. Conflict handling

- **`run()`'s built-in merge does NOT resolve conflicts.** If `git merge "<tempbranch>"` exits non-zero, it throws a `SyncError` and **preserves the temp branch** with a manual-retry message (`SandboxLifecycle.ts:436-448`): *"The temporary branch '…' has been preserved. To retry: git merge …, then clean up: git branch -D …"*. The merge is also wrapped in a `mergeToHostTimeoutMs` (default `MERGE_TO_HOST_TIMEOUT_MS`, configurable via `timeouts.mergeToHostMs`, `SandboxLifecycle.ts:189-190`, `run.ts:206`) → `MergeToHostTimeoutError` on hang. So at the engine level, a conflict is a **hard failure that stops the run and dumps it on the human**.
- **Conflict *resolution* is delegated to an LLM**, only in the template merge pass: `merge-prompt.md` instructs the merger agent to `git merge <branch> --no-edit`, and *"If there are merge conflicts, resolve them intelligently by reading both sides … run npm run typecheck and npm run test … fix the issues before proceeding."* That is the only place conflicts get resolved, and it's a model call inside userland, not engine logic.

---

## 7. Human-in-the-loop — there is NO merge gate

**Fully unattended. No hook gates the merge, and there is no approval step.**

The complete hook surface is `SandboxHooks` (`src/SandboxLifecycle.ts:86-104`) — only two hook points, **both fire BEFORE the agent runs**:

```ts
export type SandboxHooks = {
  readonly host?: {
    readonly onWorktreeReady?: ReadonlyArray<{ command: string; timeoutMs?: number }>;
    readonly onSandboxReady?: ReadonlyArray<{ command: string; timeoutMs?: number }>;
  };
  readonly sandbox?: {
    readonly onSandboxReady?: ReadonlyArray<{ command: string; sudo?: boolean; timeoutMs?: number }>;
  };
};
```

- `onWorktreeReady` — after worktree create / `copyToWorktree`, before sandbox start.
- `onSandboxReady` — after sandbox boots, before the agent starts (this is where the trial's `npm install` runs).
- There is **no `onAgentComplete`, no `onBeforeMerge`, no `onMerge`, no approval hook.** The only "before host git ops" seam is the internal `applyToHost` (`SandboxLifecycle.ts:151-154`), which is a sync mechanism for isolated providers, **not** a user gate.

The HITL story is therefore **upstream and out-of-band**: a human supplies the prompt/issues, sets `maxIterations`, and reviews the *result* afterward (commits are now on their working branch; nothing is pushed, so review-before-push is the implicit gate). During a run, the merge to HEAD is automatic and ungated. The `interactive()` API exists for a human-driven session, but that's a different entry point, not a gate on the AFK `run()` merge.

---

## Bottom line for a merge-to-head `/run-loop`

- **Q: does sandcastle merge each item to head with no PR?** Yes — `merge-to-head` does exactly `git merge <tempbranch>` into the host's current branch on the host, then deletes the temp branch. No PR anywhere. (`SandboxLifecycle.ts:427-469`.)
- **Q: if so, how does it keep dependent items correct?** It largely **doesn't, in the engine** — it punts. The only built-in compositing is *sequential*: each iteration/run branches off the post-merge HEAD, so item N+1 sees item N's merge. For genuine dependencies it relies on a **userland template** (`parallel-planner`) where an **LLM planner** computes the DAG and emits only unblocked issues, work happens on **isolated named branches** (not merge-to-head), and an **LLM merger agent** integrates branches + resolves conflicts in a later pass, with the plan→execute→merge loop repeated to pick up newly-unblocked items.
- **Q: concurrency/conflict?** merge-to-head is explicitly **not** concurrency-safe (races the HEAD index, ADR 0018); only the named-`branch` strategy is concurrency-protected, via a fail-fast PID lock (ADR 0007). Conflicts in the built-in merge are a **hard failure** (temp branch preserved, human retries); LLM conflict resolution exists only in the template merge agent. No rebase, no auto-retry.
- **Q: HITL?** None at merge time. Hooks (`onWorktreeReady`, `onSandboxReady`) all fire pre-agent; there is no pre-merge/approval hook. Implicit gate = nothing is pushed, so the human reviews after the fact.
