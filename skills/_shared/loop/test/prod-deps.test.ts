// Wave 21 Task 5 completion — production composition-root tests.
//
// Assert the real graph assembles + resolves the right backends, and that the entry
// executable reaches the driver — WITHOUT any live model call. The spawn / http / gh
// seams are faked: the fake spawn stands in for `codex exec` (edits a file) and for
// `git`/gate checks; the fake http stands in for the Anthropic review API.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  ReadinessGatedSource,
  ShellGateRunner,
  TerminationGatedSource,
  buildBackendConfigFromEnv,
  buildGateConfigFromEnv,
  buildProductionDeps,
  buildTerminalTransitionHook,
} from '../run-loop-prod-deps.ts';
import { IssueWorkSource, READY_FOR_AGENT, terminalKey } from '../providers/issue-provider.ts';
import { InMemoryJournal } from '../state-journal.ts';
import { runEntry, runProduction } from '../run-loop-entry.ts';
import { type SpawnFn, type SpawnResult } from '../dispatch/spawn.ts';
import { type HttpClient } from '../dispatch/review.ts';
import { ShellGitCommitter } from '../dispatch/implement.ts';
import { defaultSpawn } from '../dispatch/spawn.ts';
import { type WorkItem, type WorkSource, type ItemResult } from '../types.ts';
import { GhStub } from './gh-stub.ts';

// A one-item local WorkSource (the throwaway clean-room shape).
class OneItemSource implements WorkSource {
  private yielded = false;
  readonly recorded: ItemResult[] = [];
  private readonly item: WorkItem;
  constructor(item: WorkItem) {
    this.item = item;
  }
  async nextReady(): Promise<WorkItem | null> {
    if (this.yielded) return null;
    this.yielded = true;
    return this.item;
  }
  async isDone(): Promise<boolean> { return false; }
  async recordResult(_i: WorkItem, r: ItemResult): Promise<void> { this.recorded.push(r); }
}

// --- config from env --------------------------------------------------------------

test('prod: buildBackendConfigFromEnv reads API keys from env, never logs them', () => {
  const cfg = buildBackendConfigFromEnv({ ANTHROPIC_API_KEY: 'rk', OPENROUTER_API_KEY: 'ork' });
  assert.equal(cfg.anthropicApiKey, 'rk');
  assert.equal(cfg.openrouterApiKey, 'ork');
  // defaults: implement=codex, review=anthropic-api:opus-4.8 (resolved at use time)
  assert.equal('implementDefault' in cfg, false);
  // external review is default-deny unless the explicit env gate is set.
  assert.notEqual(cfg.allowExternalReview, true);
});

// --- Wave 22 Task 6: the per-run backend-direction knob → config -------------------

test('T6: --implement/--review overrides set config.implementDefault/reviewDefault', () => {
  const cfg = buildBackendConfigFromEnv({}, { implementDefault: 'claude', reviewDefault: 'codex' });
  assert.equal(cfg.implementDefault, 'claude');
  assert.equal(cfg.reviewDefault, 'codex');
});

test('T6: env-only RUN_LOOP_IMPLEMENT_BACKEND/REVIEW_BACKEND set the same config', () => {
  const cfg = buildBackendConfigFromEnv({
    RUN_LOOP_IMPLEMENT_BACKEND: 'claude',
    RUN_LOOP_REVIEW_BACKEND: 'codex',
  });
  assert.equal(cfg.implementDefault, 'claude');
  assert.equal(cfg.reviewDefault, 'codex');
});

test('T6: the flag override WINS over the env value', () => {
  const cfg = buildBackendConfigFromEnv(
    { RUN_LOOP_IMPLEMENT_BACKEND: 'codex', RUN_LOOP_REVIEW_BACKEND: 'anthropic-api:opus-4.8' },
    { implementDefault: 'claude', reviewDefault: 'codex' },
  );
  assert.equal(cfg.implementDefault, 'claude', 'flag implement wins over env');
  assert.equal(cfg.reviewDefault, 'codex', 'flag review wins over env');
});

test('T6: no knob ⇒ config carries no implement/review default (hardcoded defaults used)', () => {
  const cfg = buildBackendConfigFromEnv({});
  assert.equal('implementDefault' in cfg, false);
  assert.equal('reviewDefault' in cfg, false);
});

test('prod: RUN_LOOP_ALLOW_EXTERNAL_REVIEW env gate opts into external review', () => {
  assert.equal(buildBackendConfigFromEnv({ RUN_LOOP_ALLOW_EXTERNAL_REVIEW: '1' }).allowExternalReview, true);
  assert.equal(buildBackendConfigFromEnv({ RUN_LOOP_ALLOW_EXTERNAL_REVIEW: 'true' }).allowExternalReview, true);
  assert.notEqual(buildBackendConfigFromEnv({ RUN_LOOP_ALLOW_EXTERNAL_REVIEW: '0' }).allowExternalReview, true);
  assert.notEqual(buildBackendConfigFromEnv({}).allowExternalReview, true);
});

// --- ShellGateRunner: declared commands gate; absent ⇒ vacuously green -------------

test('prod: ShellGateRunner runs declared gate commands and passes on zero exit', async () => {
  const calls: string[] = [];
  const spawn: SpawnFn = async (cmd, argv, opts): Promise<SpawnResult> => {
    calls.push(`${cmd} ${argv.join(' ')}`);
    assert.deepEqual(opts.stdio, ['ignore', 'pipe', 'pipe']);
    return { exitCode: cmd === 'false' ? 1 : 0, stdout: '', stderr: '' };
  };
  const gate = new ShellGateRunner(spawn, '/repo');
  const greenItem: WorkItem = { id: 'g', gate: { tests: ['true'], typecheck: ['true'], verify: ['true'] } };
  assert.equal(await gate.runTests(greenItem), true);
  const redItem: WorkItem = { id: 'r', gate: { tests: ['false'] } };
  assert.equal(await gate.runTests(redItem), false);
  // No declared command ⇒ vacuously green (no spawn).
  assert.equal(await gate.runVerify({ id: 'n' }), true);
});

// --- the production graph assembles + drives one item via FAKE seams ---------------

test('prod: buildProductionDeps assembles the real graph and drives one item (faked seams)', async (t) => {
  // A real throwaway repo (real git; the implement step is faked, the runner commits).
  const dir = mkdtempSync(join(tmpdir(), 'prod-deps-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 't@e.com');
  git('config', 'user.name', 'T');
  writeFileSync(join(dir, 'README.md'), '# base\n');
  git('add', 'README.md');
  git('commit', '-q', '-m', 'base');

  // Fake spawn: `codex` edits a file (implement); the gate commands `node --check` etc.
  // are short-circuited to pass; everything else (review codex, if hit) returns [].
  const fakeSpawn: SpawnFn = async (cmd, _argv, opts): Promise<SpawnResult> => {
    if (cmd === 'codex') {
      // implement: edit a file in the workspace (agent edits, runner commits).
      writeFileSync(join(opts.cwd, 'feature.txt'), 'done\n');
      return { exitCode: 0, stdout: 'edited', stderr: '' };
    }
    return { exitCode: 0, stdout: '', stderr: '' }; // gate commands pass
  };
  // Fake Anthropic http: return one MEDIUM finding (advisory — won't reproduce).
  const fakeHttp: HttpClient = {
    async postJson() {
      return {
        status: 200,
        json: { content: [{ type: 'text', text: JSON.stringify([{ severity: 'MEDIUM', title: 'style nit' }]) }] },
      };
    },
  };

  const item: WorkItem = {
    id: 'clean-room-1',
    runner: 'worktree',
    implementBackend: 'codex',
    body: 'do the thing',
    gate: { tests: ['true'], typecheck: ['true'], verify: ['true'] },
  };
  const source = new OneItemSource(item);
  const gh = new GhStub();
  const lines: string[] = [];
  const prod = buildProductionDeps({
    source,
    readyItems: [item],
    cwdFor: () => dir,
    config: { allowExternalReview: true, anthropicApiKey: 'rk' },
    gh,
    // Implement + gate go through fakeSpawn; the committer uses REAL git (defaultSpawn).
    seams: { spawn: fakeSpawn, http: fakeHttp, committer: new ShellGitCommitter(defaultSpawn), console: { print: (l) => lines.push(l) } },
  });

  // Drive the single item directly through the production protocol via the engine.
  const runner = prod.engine.runnerFactory.create(item, 'worktree');
  const result = await prod.engine.protocol.run(item, runner);

  assert.equal(result.status, 'completed', 'green gate + advisory-only finding ⇒ merged');
  // The runner committed the faked agent's edit.
  assert.equal(readFileSync(join(dir, 'feature.txt'), 'utf8'), 'done\n');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString().trim();
  assert.match(result.note ?? '', new RegExp(head));
  // The trace shows the real-graph steps.
  assert.ok(lines.some((l) => /implement: codex/.test(l)), 'implement step traced');
  assert.ok(lines.some((l) => /review: backend=/.test(l)), 'review step traced');
  assert.ok(lines.some((l) => /verify-gate:/.test(l)), 'verify-gate step traced');
  assert.ok(lines.some((l) => /merge: AFK-merged/.test(l)), 'merge step traced');

  // buildReport folds the result into the RunSummaryReport.
  const report = prod.buildReport({ visited: [item.id], results: [result] });
  assert.equal(report.mergedAfk, 1);
});

// --- a red gate ⇒ NOT merged ------------------------------------------------------

test('prod: a red exit gate ⇒ item is failed (never merged)', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'prod-red-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q'); git('config', 'user.email', 't@e.com'); git('config', 'user.name', 'T');
  writeFileSync(join(dir, 'f'), 'x\n'); git('add', 'f'); git('commit', '-q', '-m', 'base');

  const fakeSpawn: SpawnFn = async (cmd, _argv, opts): Promise<SpawnResult> => {
    if (cmd === 'codex') { writeFileSync(join(opts.cwd, 'g'), 'y\n'); return { exitCode: 0, stdout: '', stderr: '' }; }
    if (cmd === 'false') return { exitCode: 1, stdout: '', stderr: '' };
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  const item: WorkItem = { id: 'red', runner: 'worktree', implementBackend: 'codex', body: 'x', gate: { tests: ['false'] } };
  const prod = buildProductionDeps({
    source: new OneItemSource(item), readyItems: [item], cwdFor: () => dir,
    config: { anthropicApiKey: 'rk' }, gh: new GhStub(),
    seams: { spawn: fakeSpawn, committer: new ShellGitCommitter(defaultSpawn), console: { print: () => {} } },
  });
  const result = await prod.engine.protocol.run(item, prod.engine.runnerFactory.create(item, 'worktree'));
  assert.equal(result.status, 'failed');
});

// --- Wave 22 Bug 3: commit edits regardless of exit code; surface stderr -----------

// A fake committer with a controllable dirty-tree + commit count. `dirty` is the Bug-3
// additive probe; `commitAll`/`collectCommits` model the runner-commits step.
class FakeCommitter {
  private committed = false;
  private readonly opts: { dirtyTree: boolean; commitsAfter: readonly string[] };
  constructor(opts: { dirtyTree: boolean; commitsAfter: readonly string[] }) {
    this.opts = opts;
  }
  async head(): Promise<string> { return 'BASE'; }
  async commitAll(): Promise<void> { this.committed = true; }
  async collectCommits(): Promise<readonly string[]> {
    return this.committed ? this.opts.commitsAfter : [];
  }
  async diff(): Promise<string> { return 'fake diff'; }
  async dirty(): Promise<boolean> { return this.opts.dirtyTree; }
  // Wave 23 merge-to-head ops (no-op fakes; merge always succeeds).
  async currentBranch(): Promise<string> { return 'main'; }
  async checkout(): Promise<void> {}
  async createTempBranch(): Promise<void> {}
  async mergeToHead(): Promise<{ ok: boolean; exitCode: number | null; stderr: string }> { return { ok: true, exitCode: 0, stderr: '' }; }
  async abortMerge(): Promise<void> {}
  async deleteBranch(): Promise<void> {}
  async pushBranch(): Promise<{ ok: boolean; exitCode: number | null; stderr: string }> { return { ok: true, exitCode: 0, stderr: '' }; }
}

function backendReturning(res: { ok: boolean; exitCode: number | null; stderr: string }) {
  return {
    id: 'codex' as const,
    async dispatch() {
      return { ok: res.ok, exitCode: res.exitCode, stdout: '', stderr: res.stderr };
    },
  };
}

test('T3: a non-zero exit WITH a dirty tree commits + gates (NOT failed-at-implement)', async () => {
  const item: WorkItem = { id: 'edits-nonzero', runner: 'worktree', implementBackend: 'codex', body: 'x', gate: { tests: ['true'] } };
  const committer = new FakeCommitter({ dirtyTree: true, commitsAfter: ['sha1'] });
  const lines: string[] = [];
  const fakeHttp: HttpClient = {
    async postJson() { return { status: 200, json: { content: [{ type: 'text', text: '[]' }] } }; },
  };
  // gate spawn: every declared command passes (exit 0).
  const gateSpawn: SpawnFn = async (): Promise<SpawnResult> => ({ exitCode: 0, stdout: '', stderr: '' });
  const prod = buildProductionDeps({
    source: new OneItemSource(item),
    readyItems: [item],
    cwdFor: () => '/repo',
    config: { allowExternalReview: true, anthropicApiKey: 'rk' },
    gh: new GhStub(),
    seams: { spawn: gateSpawn, http: fakeHttp, committer: committer as unknown as ShellGitCommitter, console: { print: (l) => lines.push(l) } },
  });
  // Swap the implement backend for one that exits non-zero (index.lock case).
  const protocol = prod.engine.protocol as unknown as { d: { implementRegistry: { resolve: () => unknown } } };
  protocol.d.implementRegistry.resolve = () => backendReturning({ ok: false, exitCode: 1, stderr: 'index.lock: Operation not permitted' });

  const result = await prod.engine.protocol.run(item, prod.engine.runnerFactory.create(item, 'worktree'));
  assert.notEqual(result.status, 'failed', 'edits-on-non-zero-exit must NOT fail at implement');
  assert.equal(result.status, 'completed', 'committed + green gate + advisory-only ⇒ completed');
  assert.ok(lines.some((l) => /exited 1 but produced edits/.test(l)), 'the commit-anyway path is traced');
});

test('T3: a non-zero exit with a CLEAN tree / no commits ⇒ failed with truncated stderr', async () => {
  const item: WorkItem = { id: 'no-edits', runner: 'worktree', implementBackend: 'codex', body: 'x', gate: { tests: ['true'] } };
  const committer = new FakeCommitter({ dirtyTree: false, commitsAfter: [] });
  const prod = buildProductionDeps({
    source: new OneItemSource(item),
    readyItems: [item],
    cwdFor: () => '/repo',
    config: { anthropicApiKey: 'rk' },
    gh: new GhStub(),
    seams: { committer: committer as unknown as ShellGitCommitter, console: { print: () => {} } },
  });
  const protocol = prod.engine.protocol as unknown as { d: { implementRegistry: { resolve: () => unknown } } };
  protocol.d.implementRegistry.resolve = () => backendReturning({ ok: false, exitCode: 2, stderr: 'fatal: real codex error tail' });

  const result = await prod.engine.protocol.run(item, prod.engine.runnerFactory.create(item, 'worktree'));
  assert.equal(result.status, 'failed');
  assert.match(result.note ?? '', /implement-failed:/, 'no-commit failure is the implement-failed bucket');
  assert.match(result.note ?? '', /real codex error tail/, 'the truncated codex stderr is surfaced');
});

// --- Wave 22 Bug 5: env-gated terminal transition on the issues drive --------------

test('T5: with RUN_LOOP_TRANSITION_ISSUES=1, a completed item transitions its issue', async () => {
  const gh = new GhStub([{ number: 2, labels: [READY_FOR_AGENT], state: 'open' }]);
  const runId = 'run-t5';
  const source = new IssueWorkSource({ gh, journal: new InMemoryJournal(), runId });
  const items = await source.allItems();
  const hook = buildTerminalTransitionHook(source.terminalTransitions(), { RUN_LOOP_TRANSITION_ISSUES: '1' });
  assert.notEqual(hook, undefined, 'the gate env enables the hook');

  const gated = new ReadinessGatedSource(source, items, hook);
  const item = items.find((i) => i.id === 'issue-2')!;
  await gated.recordResult(item, { itemId: 'issue-2', status: 'completed', note: 'merged at sha' });

  // completeItem ran: a PR-link comment, the issue closed, the terminal marker written.
  assert.equal(gh.peek(2)?.state, 'closed', 'the issue was closed');
  const comments = await gh.listComments(2);
  assert.ok(comments.some((c) => c.body.includes('pr-link')), 'PR-link comment posted');
  assert.ok(
    comments.some((c) => c.body.includes(terminalKey(runId, 'issue-2', 'completed'))),
    'terminal completed marker written',
  );

  // Idempotent: a second drive over the same item is a no-op (no new close mutation).
  const closesBefore = gh.calls.filter((c) => c.startsWith('closeIssue')).length;
  await gated.recordResult(item, { itemId: 'issue-2', status: 'completed', note: 'merged at sha' });
  const closesAfter = gh.calls.filter((c) => c.startsWith('closeIssue')).length;
  assert.equal(closesAfter, closesBefore, 'a re-drive performs no second close (idempotent)');
});

test('T5: with the env UNSET, a completed item performs NO gh mutation (read-only)', async () => {
  const gh = new GhStub([{ number: 2, labels: [READY_FOR_AGENT], state: 'open' }]);
  const source = new IssueWorkSource({ gh, journal: new InMemoryJournal(), runId: 'run-t5b' });
  const items = await source.allItems();
  // No RUN_LOOP_TRANSITION_ISSUES ⇒ the hook is undefined ⇒ the drive stays read-only.
  const hook = buildTerminalTransitionHook(source.terminalTransitions(), {});
  assert.equal(hook, undefined, 'default-off ⇒ no hook');

  const gated = new ReadinessGatedSource(source, items, hook);
  const mutationsBefore = gh.calls.length;
  const item = items.find((i) => i.id === 'issue-2')!;
  await gated.recordResult(item, { itemId: 'issue-2', status: 'completed', note: 'merged' });
  assert.equal(gh.calls.length, mutationsBefore, 'no gh mutation when the transition gate is off');
  assert.equal(gh.peek(2)?.state, 'open', 'the issue stays open');
});

// --- Wave 22 Bug 4: buildReport routes failures to the honest bucket by note prefix -

test('T4: buildReport routes implement-failed: vs gate-failed: notes to distinct buckets', () => {
  const item: WorkItem = { id: 'x' };
  const prod = buildProductionDeps({
    source: new OneItemSource(item),
    readyItems: [item],
    cwdFor: () => '/repo',
    config: {},
    gh: new GhStub(),
    seams: { console: { print: () => {} } },
  });
  const report = prod.buildReport({
    visited: ['a', 'b', 'c'],
    results: [
      { itemId: 'a', status: 'failed', note: 'implement-failed: agent codex exited 1; index.lock' },
      { itemId: 'b', status: 'failed', note: 'gate-failed: exit gate red' },
      { itemId: 'c', status: 'completed', note: 'merged at deadbeef' },
    ],
  });
  assert.equal(report.implementFailed, 1, 'implement-failed: note ⇒ implement-failed bucket');
  assert.equal(report.gateFailed, 1, 'gate-failed: note ⇒ gate-failed bucket');
  assert.equal(report.mergedAfk, 1);
});

// --- Wave 22 Bug 2: a throwing lane is crash-ISOLATED; the sibling still runs -------

test('T2: a thrown lane is recorded failed (reason surfaced) and the loop continues', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'prod-isolate-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q'); git('config', 'user.email', 't@e.com'); git('config', 'user.name', 'T');
  writeFileSync(join(dir, 'f'), 'x\n'); git('add', 'f'); git('commit', '-q', '-m', 'base');

  // item1 runs on the sandcastle lane with the DEFAULT (unwired) container ⇒ dispatch
  // throws. item2 is a healthy worktree/codex item that edits a file.
  const item1: WorkItem = { id: 'thrower', runner: 'sandcastle', implementBackend: 'codex', body: 'x', gate: {} };
  const item2: WorkItem = {
    id: 'healthy', runner: 'worktree', implementBackend: 'codex', body: 'y',
    gate: { tests: ['true'], typecheck: ['true'], verify: ['true'] },
  };

  const fakeSpawn: SpawnFn = async (cmd, _argv, opts): Promise<SpawnResult> => {
    if (cmd === 'codex') { writeFileSync(join(opts.cwd, 'g'), 'y\n'); return { exitCode: 0, stdout: '', stderr: '' }; }
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  const fakeHttp: HttpClient = {
    async postJson() { return { status: 200, json: { content: [{ type: 'text', text: '[]' }] } }; },
  };

  // A two-item source (drives both through the production protocol via the engine).
  class TwoItemSource implements WorkSource {
    private i = 0;
    readonly recorded: ItemResult[] = [];
    private readonly items = [item1, item2];
    async nextReady(): Promise<WorkItem | null> { return this.i < this.items.length ? this.items[this.i++]! : null; }
    async isDone(): Promise<boolean> { return false; }
    async recordResult(_it: WorkItem, r: ItemResult): Promise<void> { this.recorded.push(r); }
  }
  const source = new TwoItemSource();
  const lines: string[] = [];
  const prod = buildProductionDeps({
    source,
    readyItems: [item1, item2],
    cwdFor: () => dir,
    config: { allowExternalReview: true, anthropicApiKey: 'rk' },
    gh: new GhStub(),
    // NO container seam ⇒ UnsupportedContainerRunner ⇒ the sandcastle dispatch throws.
    seams: { spawn: fakeSpawn, http: fakeHttp, committer: new ShellGitCommitter(defaultSpawn), console: { print: (l) => lines.push(l) } },
  });

  const { runLoop } = await import('../engine.ts');
  const summary = await runLoop(prod.engine);

  // BOTH items were visited — the throw did NOT propagate out of runLoop.
  assert.deepEqual(summary.visited, ['thrower', 'healthy']);
  const r1 = source.recorded.find((r) => r.itemId === 'thrower');
  const r2 = source.recorded.find((r) => r.itemId === 'healthy');
  assert.equal(r1?.status, 'failed', 'the throwing item is failed');
  assert.match(r1?.note ?? '', /not wired|threw/i, 'the throw reason is surfaced in the note');
  assert.equal(r2?.status, 'completed', 'the healthy sibling still ran to completion');
  assert.ok(lines.some((l) => /isolated \+ skipped/.test(l)), 'the isolation is traced');
  // The container lane is reported unwired so the driver preflight would refuse it.
  assert.equal(prod.containerLaneWired, false);
});

// --- the entry EXECUTABLE reaches the driver (no live call) ------------------------

test('prod: runEntry delegates a valid source to runProduction (reaches the driver)', async () => {
  let seen: { source: string; yes: boolean } | undefined;
  const parsed = await runEntry(['issues', '--yes'], {
    print: () => {},
    runDrive: async (source, o) => { seen = { source, yes: o.yes }; },
  });
  assert.equal(parsed.mode, 'run');
  assert.deepEqual(seen, { source: 'issues', yes: true });
});

test('prod: runProduction(waves) is a graceful no-op for the local path (no crash)', async () => {
  const lines: string[] = [];
  await runProduction('waves', { yes: true, print: (l) => lines.push(l) });
  assert.ok(lines.some((l) => /not wired for the local path/.test(l)));
});

// --- Wave 23 Tasks 2-3: merge-to-head + HITL handoff (fake committer + fake GhClient) ---

// A merge-to-head committer that records the lifecycle calls and lets a test force a
// merge conflict (mergeOk=false) or a no-remote push failure (pushOk=false).
class MergeRecordingCommitter {
  readonly calls: string[] = [];
  private readonly opts: { mergeOk?: boolean; pushOk?: boolean; commits: readonly string[] };
  constructor(opts: { mergeOk?: boolean; pushOk?: boolean; commits: readonly string[] }) {
    this.opts = opts;
  }
  async head(): Promise<string> { return 'MERGESHA'; }
  async commitAll(): Promise<void> { this.calls.push('commitAll'); }
  async collectCommits(): Promise<readonly string[]> { return this.opts.commits; }
  async diff(): Promise<string> { return 'd'; }
  async dirty(): Promise<boolean> { return true; }
  async currentBranch(): Promise<string> { return 'main'; }
  async checkout(): Promise<void> { this.calls.push('checkout'); }
  async createTempBranch(_c: string, n: string): Promise<void> { this.calls.push(`createTempBranch:${n}`); }
  async mergeToHead(_c: string, b: string): Promise<{ ok: boolean; exitCode: number | null; stderr: string }> {
    this.calls.push(`mergeToHead:${b}`);
    return { ok: this.opts.mergeOk ?? true, exitCode: this.opts.mergeOk === false ? 1 : 0, stderr: '' };
  }
  async abortMerge(): Promise<void> { this.calls.push('abortMerge'); }
  async deleteBranch(_c: string, b: string): Promise<void> { this.calls.push(`deleteBranch:${b}`); }
  async pushBranch(_c: string, b: string): Promise<{ ok: boolean; exitCode: number | null; stderr: string }> {
    this.calls.push(`pushBranch:${b}`);
    return { ok: this.opts.pushOk ?? true, exitCode: this.opts.pushOk === false ? 128 : 0, stderr: '' };
  }
}

const passSpawn: SpawnFn = async (cmd): Promise<SpawnResult> =>
  cmd === 'false' ? { exitCode: 1, stdout: '', stderr: '' } : { exitCode: 0, stdout: '', stderr: '' };
const reviewHttp: HttpClient = { async postJson() { return { status: 200, json: { content: [{ type: 'text', text: '[]' }] } }; } };

test('T3: a RED-gate item is preserved on its branch, pushed, and a draft PR is opened', async () => {
  const item: WorkItem = { id: 'issue-9', runner: 'worktree', implementBackend: 'codex', body: 'x', gate: { tests: ['false'] } };
  const committer = new MergeRecordingCommitter({ commits: ['sha1'] });
  const gh = new GhStub();
  const prod = buildProductionDeps({
    source: new OneItemSource(item), readyItems: [item], cwdFor: () => '/repo',
    config: { anthropicApiKey: 'rk' }, gh,
    seams: { spawn: passSpawn, http: reviewHttp, committer: committer as unknown as ShellGitCommitter, console: { print: () => {} } },
  });
  const result = await prod.engine.protocol.run(item, prod.engine.runnerFactory.create(item, 'worktree'));
  assert.equal(result.status, 'failed');
  // The branch is created + preserved (no deleteBranch), pushed, never merged.
  assert.ok(committer.calls.includes('createTempBranch:run-loop/issue-9'));
  assert.ok(committer.calls.includes('pushBranch:run-loop/issue-9'));
  assert.ok(!committer.calls.some((c) => c.startsWith('mergeToHead')), 'a red item is never merged');
  assert.ok(!committer.calls.some((c) => c.startsWith('deleteBranch')), 'a red item branch is preserved');
  // A draft PR was opened and its url is in the note + the attention row.
  assert.ok(gh.calls.includes('createPullRequest(run-loop/issue-9,draft=true)'));
  assert.match(result.note ?? '', /PR https:\/\/github\.com/);
  const row = prod.attention.rows.find((r) => r.itemId === 'issue-9');
  assert.equal(row?.reason, 'failed-check');
  assert.ok(row?.prUrl?.startsWith('https://github.com/'));
});

test('T3: a merge conflict aborts, preserves the branch, hands off, and does NOT crash', async () => {
  const item: WorkItem = { id: 'issue-7', runner: 'worktree', implementBackend: 'codex', body: 'x', gate: { tests: ['true'] } };
  const committer = new MergeRecordingCommitter({ mergeOk: false, commits: ['sha1'] });
  const gh = new GhStub();
  const prod = buildProductionDeps({
    source: new OneItemSource(item), readyItems: [item], cwdFor: () => '/repo',
    config: { anthropicApiKey: 'rk' }, gh,
    seams: { spawn: passSpawn, http: reviewHttp, committer: committer as unknown as ShellGitCommitter, console: { print: () => {} } },
  });
  const result = await prod.engine.protocol.run(item, prod.engine.runnerFactory.create(item, 'worktree'));
  assert.equal(result.status, 'escalated');
  assert.match(result.note ?? '', /^merge-conflict:/);
  assert.ok(committer.calls.includes('mergeToHead:run-loop/issue-7'));
  assert.ok(committer.calls.includes('abortMerge'), 'conflict ⇒ abort (HEAD untouched)');
  assert.ok(!committer.calls.some((c) => c.startsWith('deleteBranch')), 'conflict ⇒ branch preserved');
  assert.equal(prod.attention.rows.find((r) => r.itemId === 'issue-7')?.reason, 'merge-conflict');
});

test('T3: a throw after the temp branch is created restores the branch + drops the empty temp branch', async () => {
  // A backend that throws at dispatch (mirrors an unwired sandcastle lane).
  const item: WorkItem = { id: 'issue-3', runner: 'worktree', implementBackend: 'codex', body: 'x', gate: { tests: ['true'] } };
  const committer = new MergeRecordingCommitter({ commits: [] });
  const prod = buildProductionDeps({
    source: new OneItemSource(item), readyItems: [item], cwdFor: () => '/repo',
    config: { anthropicApiKey: 'rk' }, gh: new GhStub(),
    seams: { spawn: passSpawn, http: reviewHttp, committer: committer as unknown as ShellGitCommitter, console: { print: () => {} } },
  });
  // Force the implement backend to throw (UnsupportedContainerRunner-style).
  const protocol = prod.engine.protocol as unknown as { d: { implementRegistry: { resolve: () => unknown } } };
  protocol.d.implementRegistry.resolve = () => ({ id: 'codex', async dispatch() { throw new Error('container lane not wired'); } });

  const result = await prod.engine.protocol.run(item, prod.engine.runnerFactory.create(item, 'worktree'));
  // The outer crash-isolation records failed (the loop continues), and the cleanup ran:
  assert.equal(result.status, 'failed');
  assert.ok(committer.calls.includes('createTempBranch:run-loop/issue-3'));
  assert.ok(committer.calls.includes('checkout'), 'restored the integration branch on throw');
  assert.ok(committer.calls.includes('deleteBranch:run-loop/issue-3'), 'dropped the empty temp branch on throw');
});

// --- Wave 23 Task 5: termination caps enforced in the composition layer ------------

// A stub source that yields N identical ready items, then drains.
class NItemSource implements WorkSource {
  readonly recorded: ItemResult[] = [];
  private n: number;
  constructor(n: number) { this.n = n; }
  async nextReady(): Promise<WorkItem | null> {
    if (this.n <= 0) return null;
    this.n -= 1;
    return { id: `i${this.n}` };
  }
  async isDone(): Promise<boolean> { return false; }
  async recordResult(_i: WorkItem, r: ItemResult): Promise<void> { this.recorded.push(r); }
}

// Drive a source through the frozen runLoop with a protocol that returns `status`.
async function driveWith(source: WorkSource, status: ItemResult['status']): Promise<readonly string[]> {
  const { runLoop } = await import('../engine.ts');
  const { DefaultRunnerFactory } = await import('../runners.ts');
  const visited: string[] = [];
  const engine = {
    source,
    protocol: { async run(item: WorkItem) { visited.push(item.id); return { itemId: item.id, status }; } },
    runnerFactory: new DefaultRunnerFactory({
      sandcastle: { async prepare() {}, async run() {}, async collectCommits() { return []; }, async teardown() {} },
      worktree: { async prepare() {}, async run() {}, async collectCommits() { return []; }, async teardown() {} },
    }),
  };
  await runLoop(engine as unknown as Parameters<typeof runLoop>[0]);
  return visited;
}

test('T5: the iteration cap stops the drive after exactly 20 visited items', async () => {
  const term = new TerminationGatedSource(new NItemSource(25)); // default cap 20
  const visited = await driveWith(term, 'completed');
  assert.equal(visited.length, 20, 'stops at the iteration cap');
  assert.equal(term.stopReason(), 'iteration-cap');
});

test('T5: 3 consecutive failures trip the stall stop (no 4th attempt)', async () => {
  const term = new TerminationGatedSource(new NItemSource(10));
  const visited = await driveWith(term, 'failed'); // every item fails the gate
  assert.equal(visited.length, 3, 'stops after the stall threshold');
  assert.equal(term.stopReason(), 'stall');
});

test('T5: a clean small run drains (no cap/stall fired)', async () => {
  const term = new TerminationGatedSource(new NItemSource(4));
  const visited = await driveWith(term, 'completed');
  assert.equal(visited.length, 4);
  assert.equal(term.stopReason(), 'drained');
});

test('T3: no remote ⇒ the handoff falls back to copy-paste commands (no PR, no throw)', async () => {
  const item: WorkItem = { id: 'issue-5', runner: 'worktree', implementBackend: 'codex', body: 'x', gate: { tests: ['false'] } };
  const committer = new MergeRecordingCommitter({ pushOk: false, commits: ['sha1'] });
  const gh = new GhStub();
  const prod = buildProductionDeps({
    source: new OneItemSource(item), readyItems: [item], cwdFor: () => '/repo',
    config: { anthropicApiKey: 'rk' }, gh,
    seams: { spawn: passSpawn, http: reviewHttp, committer: committer as unknown as ShellGitCommitter, console: { print: () => {} } },
  });
  const result = await prod.engine.protocol.run(item, prod.engine.runnerFactory.create(item, 'worktree'));
  assert.equal(result.status, 'failed');
  assert.ok(committer.calls.includes('pushBranch:run-loop/issue-5'));
  assert.ok(!gh.calls.some((c) => c.startsWith('createPullRequest')), 'no PR open when push fails');
  const row = prod.attention.rows.find((r) => r.itemId === 'issue-5');
  assert.ok((row?.fallbackCommands?.length ?? 0) > 0, 'fallback copy-paste commands recorded');
  assert.match(result.note ?? '', /no-remote/);
});

// --- Wave 23 Task 6: merge-to-head proof against REAL git (throwaway repo) ----------

function realRepo(t: { after: (fn: () => void) => void }): string {
  const dir = mkdtempSync(join(tmpdir(), 'mth-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q'); git('config', 'user.email', 't@e.com'); git('config', 'user.name', 'T');
  writeFileSync(join(dir, 'base'), 'x\n'); git('add', 'base'); git('commit', '-q', '-m', 'base');
  return dir;
}

test('T6: a GREEN drive fast-forward merges into HEAD and deletes the temp branch (real git)', async (t) => {
  const dir = realRepo(t);
  const preHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString().trim();
  const fakeSpawn: SpawnFn = async (cmd, _a, opts): Promise<SpawnResult> => {
    if (cmd === 'codex') { writeFileSync(join(opts.cwd, 'feature.txt'), 'done\n'); return { exitCode: 0, stdout: '', stderr: '' }; }
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  const item: WorkItem = { id: 'issue-2', runner: 'worktree', implementBackend: 'codex', body: 'x', gate: { tests: ['true'] } };
  const prod = buildProductionDeps({
    source: new OneItemSource(item), readyItems: [item], cwdFor: () => dir,
    config: { anthropicApiKey: 'rk' }, gh: new GhStub(),
    seams: { spawn: fakeSpawn, http: reviewHttp, committer: new ShellGitCommitter(defaultSpawn), console: { print: () => {} } },
  });
  const result = await prod.engine.protocol.run(item, prod.engine.runnerFactory.create(item, 'worktree'));
  assert.equal(result.status, 'completed');
  const postHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString().trim();
  assert.notEqual(postHead, preHead, 'HEAD advanced via the merge');
  assert.equal(readFileSync(join(dir, 'feature.txt'), 'utf8'), 'done\n', 'merged work is on HEAD');
  const branches = execFileSync('git', ['branch', '--list', 'run-loop/*'], { cwd: dir }).toString().trim();
  assert.equal(branches, '', 'the temp branch is deleted after a green merge');
});

test('T6: a RED drive preserves the branch, leaves HEAD unchanged, and falls back (no remote, real git)', async (t) => {
  const dir = realRepo(t);
  const preHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString().trim();
  const fakeSpawn: SpawnFn = async (cmd, _a, opts): Promise<SpawnResult> => {
    if (cmd === 'codex') { writeFileSync(join(opts.cwd, 'g.txt'), 'y\n'); return { exitCode: 0, stdout: '', stderr: '' }; }
    if (cmd === 'false') return { exitCode: 1, stdout: '', stderr: '' };
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  const item: WorkItem = { id: 'issue-9', runner: 'worktree', implementBackend: 'codex', body: 'x', gate: { tests: ['false'] } };
  const prod = buildProductionDeps({
    source: new OneItemSource(item), readyItems: [item], cwdFor: () => dir,
    config: { anthropicApiKey: 'rk' }, gh: new GhStub(),
    seams: { spawn: fakeSpawn, http: reviewHttp, committer: new ShellGitCommitter(defaultSpawn), console: { print: () => {} } },
  });
  const result = await prod.engine.protocol.run(item, prod.engine.runnerFactory.create(item, 'worktree'));
  assert.equal(result.status, 'failed');
  const postHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString().trim();
  assert.equal(postHead, preHead, 'HEAD is unchanged on a red item');
  const branches = execFileSync('git', ['branch', '--list', 'run-loop/*'], { cwd: dir }).toString().trim();
  assert.match(branches, /run-loop\/issue-9/, 'the temp branch is preserved');
  // The throwaway repo has no remote → the real `git push` fails → no-remote fallback.
  const row = prod.attention.rows.find((r) => r.itemId === 'issue-9');
  assert.ok((row?.fallbackCommands?.length ?? 0) > 0, 'no-remote fallback wrote copy-paste commands');
});

// --- Wave 24 Task 2 (F-031): the fail-safe three-way rule -------------------------
//
// Each test drives one item through the production protocol with a MergeRecordingCommitter
// (records the merge lifecycle) + a recording spawn that distinguishes the implement spawn
// (`codex`) from gate-check spawns. The gate config is threaded via buildProductionDeps's
// `gateConfig` option (Task 1). The item carries NO own `gate` descriptor, so the repo
// config is the only gate source — exercising the no-gate / partial / configError arms.

// A spawn that records every gate-check command (non-codex spawns) and returns the exit
// for the named command (`true`→0, `false`→1, otherwise 0).
function recordingGateSpawn(): { spawn: SpawnFn; gateCalls: string[] } {
  const gateCalls: string[] = [];
  const spawn: SpawnFn = async (cmd, argv): Promise<SpawnResult> => {
    if (cmd === 'codex') return { exitCode: 0, stdout: 'edited', stderr: '' };
    gateCalls.push(`${cmd} ${argv.join(' ')}`.trim());
    if (cmd === 'false') return { exitCode: 1, stdout: '', stderr: 'gate stderr tail' };
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  return { spawn, gateCalls };
}

function failSafeProd(opts: {
  item: WorkItem;
  gateConfig?: import('../run-loop-prod-deps.ts').RepoGateConfig;
  spawn: SpawnFn;
  committer: MergeRecordingCommitter;
}) {
  return buildProductionDeps({
    source: new OneItemSource(opts.item),
    readyItems: [opts.item],
    cwdFor: () => '/repo',
    config: { anthropicApiKey: 'rk' },
    gh: new GhStub(),
    ...(opts.gateConfig !== undefined ? { gateConfig: opts.gateConfig } : {}),
    seams: { spawn: opts.spawn, http: reviewHttp, committer: opts.committer as unknown as ShellGitCommitter, console: { print: () => {} } },
  });
}

test('T2: NO gate configured ⇒ not green (gate-unconfigured), nothing spawned, not merged', async () => {
  const item: WorkItem = { id: 'issue-1', runner: 'worktree', implementBackend: 'codex', body: 'x' }; // no item gate
  const { spawn, gateCalls } = recordingGateSpawn();
  const committer = new MergeRecordingCommitter({ commits: ['sha1'] });
  const prod = failSafeProd({ item, spawn, committer }); // no gateConfig ⇒ isConfigured false
  const result = await prod.engine.protocol.run(item, prod.engine.runnerFactory.create(item, 'worktree'));
  assert.equal(result.status, 'failed', 'an unconfigured gate is NEVER vacuously green');
  assert.match(result.note ?? '', /gate-unconfigured/);
  assert.equal(gateCalls.length, 0, 'no gate command was spawned (decided before running)');
  assert.ok(!committer.calls.some((c) => c.startsWith('mergeToHead')), 'an unconfigured item is never merged');
  // Routes to the HITL handoff (preserve branch + escalate), not a silent merge.
  assert.ok(committer.calls.includes('pushBranch:run-loop/issue-1'));
});

test('T2: tests-only config, tests exit 0 ⇒ green, typecheck/verify not spawned, merges', async () => {
  const item: WorkItem = { id: 'issue-2', runner: 'worktree', implementBackend: 'codex', body: 'x' };
  const { spawn, gateCalls } = recordingGateSpawn();
  const committer = new MergeRecordingCommitter({ commits: ['sha1'] });
  const cfg = buildGateConfigFromEnv({ RUN_LOOP_GATE_TESTS: '["true"]' });
  const prod = failSafeProd({ item, gateConfig: cfg, spawn, committer });
  const result = await prod.engine.protocol.run(item, prod.engine.runnerFactory.create(item, 'worktree'));
  assert.equal(result.status, 'completed', 'a partial (tests-only) green gate proceeds to merge');
  assert.deepEqual(gateCalls, ['true'], 'only the declared tests check ran; absent sub-checks did not spawn');
  assert.ok(committer.calls.includes('mergeToHead:run-loop/issue-2'));
});

test('T2: tests-only config, tests non-zero ⇒ red, escalated, stderr tail in note', async () => {
  const item: WorkItem = { id: 'issue-3', runner: 'worktree', implementBackend: 'codex', body: 'x' };
  const { spawn, gateCalls } = recordingGateSpawn();
  const committer = new MergeRecordingCommitter({ commits: ['sha1'] });
  const cfg = buildGateConfigFromEnv({ RUN_LOOP_GATE_TESTS: '["false"]' });
  const prod = failSafeProd({ item, gateConfig: cfg, spawn, committer });
  const result = await prod.engine.protocol.run(item, prod.engine.runnerFactory.create(item, 'worktree'));
  assert.equal(result.status, 'failed');
  assert.match(result.note ?? '', /gate-failed/);
  assert.match(result.note ?? '', /gate stderr tail/, 'the red check stderr tail is surfaced');
  assert.deepEqual(gateCalls, ['false']);
  assert.ok(!committer.calls.some((c) => c.startsWith('mergeToHead')), 'a red item is never merged');
});

test('T2: full config all green ⇒ green', async () => {
  const item: WorkItem = { id: 'issue-4', runner: 'worktree', implementBackend: 'codex', body: 'x' };
  const { spawn, gateCalls } = recordingGateSpawn();
  const committer = new MergeRecordingCommitter({ commits: ['sha1'] });
  const cfg = buildGateConfigFromEnv({
    RUN_LOOP_GATE_TESTS: '["true"]',
    RUN_LOOP_GATE_TYPECHECK: '["true"]',
    RUN_LOOP_GATE_VERIFY: '["true"]',
  });
  const prod = failSafeProd({ item, gateConfig: cfg, spawn, committer });
  const result = await prod.engine.protocol.run(item, prod.engine.runnerFactory.create(item, 'worktree'));
  assert.equal(result.status, 'completed');
  assert.equal(gateCalls.length, 3, 'all three checks ran');
  assert.ok(committer.calls.includes('mergeToHead:run-loop/issue-4'));
});

test('T2: a { shell } command spawns sh -c <value> and its exit is honored', async () => {
  const item: WorkItem = { id: 'issue-5', runner: 'worktree', implementBackend: 'codex', body: 'x' };
  const shellSpawns: Array<{ cmd: string; argv: readonly string[] }> = [];
  const spawn: SpawnFn = async (cmd, argv): Promise<SpawnResult> => {
    if (cmd === 'codex') return { exitCode: 0, stdout: '', stderr: '' };
    shellSpawns.push({ cmd, argv });
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  const committer = new MergeRecordingCommitter({ commits: ['sha1'] });
  const cfg = buildGateConfigFromEnv({ RUN_LOOP_GATE_TESTS_SHELL: 'npm test && tsc' });
  const prod = failSafeProd({ item, gateConfig: cfg, spawn, committer });
  const result = await prod.engine.protocol.run(item, prod.engine.runnerFactory.create(item, 'worktree'));
  assert.equal(result.status, 'completed');
  assert.equal(shellSpawns[0]?.cmd, 'sh');
  assert.deepEqual(shellSpawns[0]?.argv, ['-c', 'npm test && tsc']);
});

test('T2: a RepoGateConfig configError ⇒ not green (gate-config-error), nothing spawned', async () => {
  const item: WorkItem = { id: 'issue-6', runner: 'worktree', implementBackend: 'codex', body: 'x' };
  const { spawn, gateCalls } = recordingGateSpawn();
  const committer = new MergeRecordingCommitter({ commits: ['sha1'] });
  // BOTH argv + *_SHELL for tests ⇒ a configError (mix-is-an-error).
  const cfg = buildGateConfigFromEnv({ RUN_LOOP_GATE_TESTS: '["true"]', RUN_LOOP_GATE_TESTS_SHELL: 'true' });
  assert.ok(cfg.configError !== undefined, 'precondition: the env is a configError');
  const prod = failSafeProd({ item, gateConfig: cfg, spawn, committer });
  const result = await prod.engine.protocol.run(item, prod.engine.runnerFactory.create(item, 'worktree'));
  assert.equal(result.status, 'failed', 'a misconfigured gate fails CLOSED');
  assert.match(result.note ?? '', /gate-config-error/);
  assert.equal(gateCalls.length, 0, 'no gate command was spawned on a configError');
  assert.ok(!committer.calls.some((c) => c.startsWith('mergeToHead')));
});
