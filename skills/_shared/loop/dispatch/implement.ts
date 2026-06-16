// Concrete implement adapters — Codex (default) + Claude (Wave 21, Task 2).
//
// Both implement the T1 AgentBackend seam: spawn an agentic CLI (stdin IGNORED) that
// EDITS workspace files, then return. They DO NOT commit — "agent edits, runner
// commits": the unsandboxed node runner does `git add -A && git commit` afterward
// (the agent's sandbox makes `.git` read-only). Commit + collectCommits is the
// GitCommitter seam below, invoked by the runner, NOT by the adapter.
//
// Lanes (DispatchLane = worktree | sandcastle):
//   Codex
//     worktree:   codex exec -s workspace-write -C <cwd> --skip-git-repo-check  (host, OS sandbox)
//     sandcastle: container, ~/.codex mounted ro→writable CODEX_HOME copy,
//                 codex exec --dangerously-bypass-approvals-and-sandbox (container = boundary)
//   Claude
//     worktree:   claude -p   (CLAUDECODE/CLAUDE_CODE_* stripped; confined by the
//                 Wave-20 denylist hook + RUN_LOOP_ENFORCE=1 — its worktree story)
//     sandcastle: container with setup-token / ANTHROPIC_API_KEY (subscription-in-
//                 container is grey — Open Question 3)
//
// All real spawning goes through the injected SpawnFn (stdin-ignored guarantee). The
// container lane goes through an injected ContainerRunner so the docker side is
// stubbable and Docker-absent aborts cleanly (the runner reuses preflightRunners).

import {
  type AgentBackend,
  type AgentDispatchContext,
  type AgentDispatchResult,
  type ImplementBackendId,
} from './backends.ts';
import { type SpawnFn, spawnIgnoringStdin, stripClaudeMarkers, stripOpenAiApiKey } from './spawn.ts';

/**
 * Container-lane seam. The real impl runs the agentic CLI inside a container with the
 * appropriate auth mounted (Codex: ~/.codex ro→writable CODEX_HOME; Claude: token/key)
 * and the workspace bind-mounted so commits land on the host. Stubbed in tests; the
 * Docker-absent abort is handled upstream by preflightRunners, not here.
 */
export interface ContainerRunner {
  /**
   * Run `command argv` for `backend` inside a container against `ctx.cwd` (bind-mounted)
   * with auth provisioned for the backend. Returns the captured result.
   */
  run(
    backend: ImplementBackendId,
    command: string,
    argv: readonly string[],
    ctx: AgentDispatchContext,
  ): Promise<AgentDispatchResult>;
}

/** Build the host (worktree-lane) Codex argv. */
export function codexWorktreeArgv(cwd: string): readonly string[] {
  return ['exec', '-s', 'workspace-write', '-C', cwd, '--skip-git-repo-check'];
}

/** Build the container (sandcastle-lane) Codex argv — the container is the boundary. */
export function codexSandcastleArgv(): readonly string[] {
  return ['exec', '--dangerously-bypass-approvals-and-sandbox'];
}

/**
 * Codex implement adapter — the DEFAULT backend. Worktree lane shells `codex exec`
 * on the host with the native OS sandbox; sandcastle lane delegates to the
 * ContainerRunner. Edits only; the runner commits.
 */
export class CodexImplementAdapter implements AgentBackend {
  readonly id: ImplementBackendId = 'codex';
  private readonly spawn: SpawnFn;
  private readonly container: ContainerRunner;

  constructor(deps: { readonly spawn: SpawnFn; readonly container: ContainerRunner }) {
    this.spawn = deps.spawn;
    this.container = deps.container;
  }

  async dispatch(prompt: string, ctx: AgentDispatchContext): Promise<AgentDispatchResult> {
    // Strip OPENAI_API_KEY so codex always uses its ChatGPT-sub (gpt-5.5) auth — a stray
    // key alongside the login triggers the broken "mixed-auth" state (see stripOpenAiApiKey).
    const env = stripOpenAiApiKey(ctx.env);
    if (ctx.lane === 'sandcastle') {
      const argv = [...codexSandcastleArgv(), prompt];
      return this.container.run('codex', 'codex', argv, { ...ctx, env });
    }
    // Worktree lane: host, native -s workspace-write sandbox.
    const argv = [...codexWorktreeArgv(ctx.cwd), prompt];
    const r = await spawnIgnoringStdin(this.spawn, 'codex', argv, {
      cwd: ctx.cwd,
      env,
    });
    return { ok: r.exitCode === 0, exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr };
  }
}

/** Build the Claude `-p` argv (the prompt is the trailing positional). */
export function claudeArgv(prompt: string): readonly string[] {
  return ['-p', prompt];
}

/**
 * Claude implement adapter — the FLAG backend. Worktree lane shells `claude -p` on the
 * host with CLAUDECODE/CLAUDE_CODE_* stripped (its confinement is the Wave-20 denylist
 * hook + RUN_LOOP_ENFORCE=1, enforced upstream by the guardrail preflight). Sandcastle
 * lane delegates to the ContainerRunner (token/key auth — grey, Open Question 3). Edits
 * only; the runner commits.
 */
export class ClaudeImplementAdapter implements AgentBackend {
  readonly id: ImplementBackendId = 'claude';
  private readonly spawn: SpawnFn;
  private readonly container: ContainerRunner;

  constructor(deps: { readonly spawn: SpawnFn; readonly container: ContainerRunner }) {
    this.spawn = deps.spawn;
    this.container = deps.container;
  }

  async dispatch(prompt: string, ctx: AgentDispatchContext): Promise<AgentDispatchResult> {
    // Strip the host's own Claude-Code markers so the child is a fresh headless session.
    const env = stripClaudeMarkers(ctx.env);
    const argv = claudeArgv(prompt);
    if (ctx.lane === 'sandcastle') {
      return this.container.run('claude', 'claude', argv, { ...ctx, env });
    }
    const r = await spawnIgnoringStdin(this.spawn, 'claude', argv, { cwd: ctx.cwd, env });
    return { ok: r.exitCode === 0, exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr };
  }
}

// --- Agent-edits / runner-commits ------------------------------------------------

/**
 * Git seam the unsandboxed node runner uses to COMMIT what the agent edited and then
 * recover the produced commit SHAs. The agent never touches `.git` (read-only under
 * its sandbox); this runs on the host after the agent returns. Injected so the
 * runner-commits flow is testable with no real git.
 */
export interface GitCommitter {
  /** The current HEAD SHA, captured BEFORE the agent runs (the `base` for the range). */
  head(cwd: string): Promise<string>;
  /** `git add -A` then `git commit` (no-op-safe when the agent made no edits). */
  commitAll(cwd: string, message: string): Promise<void>;
  /** SHAs in `base..HEAD`, oldest→newest (the commits this run produced). */
  collectCommits(cwd: string, base: string): Promise<readonly string[]>;
}

/**
 * Concrete GitCommitter shelling to the `git` CLI via the injected SpawnFn (the same
 * stdin-ignored boundary the agent uses). Used by the real runner; in tests a fake
 * GitCommitter is simpler, but this is exercised by the throwaway-repo integration
 * test so the runner-commits flow is proven end-to-end against real git.
 */
export class ShellGitCommitter implements GitCommitter {
  private readonly spawn: SpawnFn;
  constructor(spawn: SpawnFn) {
    this.spawn = spawn;
  }
  private async git(cwd: string, argv: readonly string[]): Promise<string> {
    const r = await spawnIgnoringStdin(this.spawn, 'git', argv, { cwd, env: process.env as Record<string, string> });
    if (r.exitCode !== 0) {
      throw new Error(`git ${argv.join(' ')} failed (${r.exitCode}): ${r.stderr.trim()}`);
    }
    return r.stdout.trim();
  }
  async head(cwd: string): Promise<string> {
    return this.git(cwd, ['rev-parse', 'HEAD']);
  }
  async commitAll(cwd: string, message: string): Promise<void> {
    await this.git(cwd, ['add', '-A']);
    // `git commit` exits non-zero when there is nothing to commit; tolerate that so a
    // no-edit agent run does not crash the runner.
    const r = await spawnIgnoringStdin(
      this.spawn,
      'git',
      ['commit', '-m', message],
      { cwd, env: process.env as Record<string, string> },
    );
    if (r.exitCode !== 0 && !/nothing to commit/i.test(r.stdout + r.stderr)) {
      throw new Error(`git commit failed (${r.exitCode}): ${(r.stdout + r.stderr).trim()}`);
    }
  }
  async collectCommits(cwd: string, base: string): Promise<readonly string[]> {
    const out = await this.git(cwd, ['rev-list', '--reverse', `${base}..HEAD`]);
    return out.length === 0 ? [] : out.split('\n');
  }
  /**
   * Whether the working tree has uncommitted edits (Wave 22, Bug 3). Additive probe,
   * like `diff` — the `GitCommitter` interface is untouched. Used to detect "the agent
   * edited files but exited non-zero" so the runner commits the real work regardless of
   * the agent's exit code (a cosmetic post-edit git error no longer discards it).
   * `git status --porcelain` prints one line per change; empty ⇒ clean.
   */
  async dirty(cwd: string): Promise<boolean> {
    const r = await spawnIgnoringStdin(this.spawn, 'git', ['status', '--porcelain'], {
      cwd,
      env: process.env as Record<string, string>,
    });
    if (r.exitCode !== 0) {
      throw new Error(`git status failed (${r.exitCode}): ${r.stderr.trim()}`);
    }
    return r.stdout.trim().length > 0;
  }

  /** The unified diff of `base..HEAD` — the produced diff fed to the reviewer. */
  async diff(cwd: string, base: string): Promise<string> {
    const r = await spawnIgnoringStdin(this.spawn, 'git', ['diff', `${base}..HEAD`], {
      cwd,
      env: process.env as Record<string, string>,
    });
    if (r.exitCode !== 0) {
      throw new Error(`git diff failed (${r.exitCode}): ${r.stderr.trim()}`);
    }
    return r.stdout;
  }
}

/**
 * Drive the "agent edits, runner commits" sequence for one item:
 *   1. capture base = HEAD;
 *   2. dispatch the agent (it edits workspace files only);
 *   3. on success, the runner does `git add -A && git commit`;
 *   4. collectCommits(base..HEAD) returns the produced SHAs.
 * A non-zero agent exit short-circuits: no commit is made and an empty SHA list is
 * returned alongside the failed result, so the gate/escalation path handles it.
 */
export async function runImplementWithCommit(args: {
  readonly backend: AgentBackend;
  readonly committer: GitCommitter;
  readonly prompt: string;
  readonly ctx: AgentDispatchContext;
  readonly commitMessage: string;
}): Promise<{ readonly result: AgentDispatchResult; readonly commits: readonly string[] }> {
  const { backend, committer, prompt, ctx, commitMessage } = args;
  const base = await committer.head(ctx.cwd);
  const result = await backend.dispatch(prompt, ctx);
  if (!result.ok) {
    return { result, commits: [] };
  }
  await committer.commitAll(ctx.cwd, commitMessage);
  const commits = await committer.collectCommits(ctx.cwd, base);
  return { result, commits };
}
