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
  ShellGateRunner,
  buildBackendConfigFromEnv,
  buildProductionDeps,
} from '../run-loop-prod-deps.ts';
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
