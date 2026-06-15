// Wave 21 Task 2 — concrete implement adapters (Codex + Claude), both lanes,
// agent-edits/runner-commits. Argv + lane routing are asserted against a recording
// SpawnFn/ContainerRunner; the runner-commits flow is proven end-to-end against a
// REAL throwaway git repo with REAL git (the agent is faked by a SpawnFn that edits
// a file, standing in for `codex exec`). Docker-absent abort reuses preflightRunners.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  type AgentDispatchContext,
  type AgentDispatchResult,
  type ImplementBackendId,
} from '../dispatch/backends.ts';
import {
  CodexImplementAdapter,
  ClaudeImplementAdapter,
  ShellGitCommitter,
  type ContainerRunner,
  claudeArgv,
  codexSandcastleArgv,
  codexWorktreeArgv,
  runImplementWithCommit,
} from '../dispatch/implement.ts';
import { type SpawnFn, type SpawnOptions, defaultSpawn } from '../dispatch/spawn.ts';
import { preflightRunners, RunnerPreflightError } from '../runners.ts';
import { StubContainerEngineProbe } from './stubs.ts';
import { type WorkItem } from '../types.ts';

class RecordingContainer implements ContainerRunner {
  readonly calls: { backend: ImplementBackendId; command: string; argv: readonly string[]; ctx: AgentDispatchContext }[] = [];
  async run(
    backend: ImplementBackendId,
    command: string,
    argv: readonly string[],
    ctx: AgentDispatchContext,
  ): Promise<AgentDispatchResult> {
    this.calls.push({ backend, command, argv, ctx });
    return { ok: true, exitCode: 0, stdout: 'container-ok', stderr: '' };
  }
}

function recordingSpawn(): { spawn: SpawnFn; calls: { cmd: string; argv: readonly string[]; stdio: SpawnOptions['stdio']; env: Readonly<Record<string, string>> }[] } {
  const calls: { cmd: string; argv: readonly string[]; stdio: SpawnOptions['stdio']; env: Readonly<Record<string, string>> }[] = [];
  const spawn: SpawnFn = async (cmd, argv, options) => {
    calls.push({ cmd, argv, stdio: options.stdio, env: options.env });
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  return { spawn, calls };
}

// --- argv builders ---------------------------------------------------------------

test('T2: codex argv differs per lane (worktree native sandbox vs container bypass)', () => {
  assert.deepEqual(codexWorktreeArgv('/wt'), ['exec', '-s', 'workspace-write', '-C', '/wt', '--skip-git-repo-check']);
  assert.deepEqual(codexSandcastleArgv(), ['exec', '--dangerously-bypass-approvals-and-sandbox']);
  assert.deepEqual(claudeArgv('do it'), ['-p', 'do it']);
});

// --- lane routing + stdin ignored -------------------------------------------------

test('T2: Codex worktree lane shells codex exec with stdin ignored; sandcastle uses the container', async () => {
  const { spawn, calls } = recordingSpawn();
  const container = new RecordingContainer();
  const codex = new CodexImplementAdapter({ spawn, container });

  await codex.dispatch('PROMPT', { cwd: '/wt', env: { PATH: '/usr/bin' }, lane: 'worktree' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.cmd, 'codex');
  assert.deepEqual(calls[0]?.stdio, ['ignore', 'pipe', 'pipe']);
  assert.deepEqual(calls[0]?.argv, ['exec', '-s', 'workspace-write', '-C', '/wt', '--skip-git-repo-check', 'PROMPT']);
  assert.equal(container.calls.length, 0);

  await codex.dispatch('PROMPT', { cwd: '/wt', env: {}, lane: 'sandcastle' });
  assert.equal(container.calls.length, 1);
  assert.equal(container.calls[0]?.backend, 'codex');
});

test('T2: Claude worktree lane strips CLAUDE markers and shells claude -p with stdin ignored', async () => {
  const { spawn, calls } = recordingSpawn();
  const container = new RecordingContainer();
  const claude = new ClaudeImplementAdapter({ spawn, container });

  await claude.dispatch('FIX', {
    cwd: '/wt',
    env: { CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', PATH: '/usr/bin' },
    lane: 'worktree',
  });
  assert.equal(calls[0]?.cmd, 'claude');
  assert.deepEqual(calls[0]?.argv, ['-p', 'FIX']);
  assert.deepEqual(calls[0]?.stdio, ['ignore', 'pipe', 'pipe']);
  // CLAUDECODE / CLAUDE_CODE_* stripped from the child env.
  assert.equal('CLAUDECODE' in (calls[0]?.env ?? {}), false);
  assert.equal('CLAUDE_CODE_ENTRYPOINT' in (calls[0]?.env ?? {}), false);
  assert.equal(calls[0]?.env['PATH'], '/usr/bin');
});

// --- agent edits, runner commits (REAL git, throwaway repo) -----------------------

test('T2: agent edits files, the runner commits, collectCommits returns the commit', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'loop-t2-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  // Real throwaway repo with one base commit.
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  writeFileSync(join(dir, 'README.md'), 'base\n');
  git('add', 'README.md');
  git('commit', '-q', '-m', 'base');

  // A FAKE agent backend: instead of `codex exec`, a SpawnFn that edits a workspace
  // file (proving "agent edits, .git untouched"). It ignores stdin like the real one.
  const fakeAgentSpawn: SpawnFn = async (_cmd, _argv, options) => {
    assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
    writeFileSync(join(options.cwd, 'feature.txt'), 'implemented by agent\n');
    return { exitCode: 0, stdout: 'edited', stderr: '' };
  };
  const codex = new CodexImplementAdapter({
    spawn: fakeAgentSpawn,
    container: new RecordingContainer(),
  });

  // The runner commits via REAL git (defaultSpawn shells out).
  const committer = new ShellGitCommitter(defaultSpawn);

  const { result, commits } = await runImplementWithCommit({
    backend: codex,
    committer,
    prompt: 'add the feature',
    ctx: { cwd: dir, env: process.env as Record<string, string>, lane: 'worktree' },
    commitMessage: 'feat: agent-implemented feature',
  });

  assert.equal(result.ok, true);
  assert.equal(commits.length, 1, 'exactly one commit produced this run');
  // The committed file is present and the commit is the one collectCommits reported.
  assert.equal(readFileSync(join(dir, 'feature.txt'), 'utf8'), 'implemented by agent\n');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString().trim();
  assert.equal(commits[0], head);
});

test('T2: a no-edit agent run produces zero commits (commitAll is no-op-safe)', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'loop-t2b-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  writeFileSync(join(dir, 'f'), 'x\n');
  git('add', 'f');
  git('commit', '-q', '-m', 'base');

  const noEditSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: '', stderr: '' });
  const codex = new CodexImplementAdapter({ spawn: noEditSpawn, container: new RecordingContainer() });
  const { commits } = await runImplementWithCommit({
    backend: codex,
    committer: new ShellGitCommitter(defaultSpawn),
    prompt: 'noop',
    ctx: { cwd: dir, env: process.env as Record<string, string>, lane: 'worktree' },
    commitMessage: 'noop',
  });
  assert.equal(commits.length, 0);
});

test('T2: a failed agent run short-circuits — no commit, empty SHA list', async () => {
  let committed = false;
  const failingSpawn: SpawnFn = async () => ({ exitCode: 7, stdout: '', stderr: 'boom' });
  const codex = new CodexImplementAdapter({ spawn: failingSpawn, container: new RecordingContainer() });
  const committer = {
    async head() { return 'BASE'; },
    async commitAll() { committed = true; },
    async collectCommits() { return ['SHOULD_NOT_HAPPEN']; },
  };
  const { result, commits } = await runImplementWithCommit({
    backend: codex,
    committer,
    prompt: 'x',
    ctx: { cwd: '/wt', env: {}, lane: 'worktree' },
    commitMessage: 'm',
  });
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 7);
  assert.equal(committed, false, 'runner must not commit after a failed agent run');
  assert.deepEqual(commits, []);
});

// --- Docker-absent ⇒ sandcastle items abort cleanly (reuse preflightRunners) ------

test('T2: Docker-absent ⇒ a sandcastle implement item aborts cleanly via preflightRunners', async () => {
  const sandcastleItem: WorkItem = { id: 'sc1', runner: 'sandcastle' };
  await assert.rejects(
    preflightRunners([sandcastleItem], new StubContainerEngineProbe(false, 'Docker')),
    RunnerPreflightError,
  );
  // A worktree-only run is unaffected by Docker being absent.
  await preflightRunners([{ id: 'wt1', runner: 'worktree' }], new StubContainerEngineProbe(false));
});
