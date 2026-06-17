// Wave 24, Task 5 (F-034) — the verify-gate heals once the gate runs real commands.
//
// The motivating defect: the live ShellGateRunner ran ZERO commands and returned green,
// so the verify-gate's reproducer (`reproduce = () => !(runExitGate()).green`) could never
// see a RED gate — every Opus finding was silently downgraded to advisory. With a real
// RepoGateConfig (Task 1) + the fail-safe gate (Task 2) wired through the reproducer, a
// finding whose failing assertion reddens the gate REPRODUCES (drives a fix round /
// escalation); a finding that does not redden the gate stays ADVISORY.
//
// No new production code beyond Tasks 1-2 (+ the Task 4 Mechanism-B wrap). This is the
// regression proof. The control: with an empty RepoGateConfig and no item gate, the
// reproduce path is unreachable because the item is refused/red FIRST (Tasks 2/3).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildProductionDeps, buildGateConfigFromEnv } from '../run-loop-prod-deps.ts';
import { ShellGitCommitter } from '../dispatch/implement.ts';
import { type SpawnFn, type SpawnResult } from '../dispatch/spawn.ts';
import { type HttpClient } from '../dispatch/review.ts';
import { type WorkItem, type WorkSource, type ItemResult } from '../types.ts';
import { GhStub } from './gh-stub.ts';

class OneItemSource implements WorkSource {
  private yielded = false;
  readonly recorded: ItemResult[] = [];
  private readonly item: WorkItem;
  constructor(item: WorkItem) { this.item = item; }
  async nextReady(): Promise<WorkItem | null> { if (this.yielded) return null; this.yielded = true; return this.item; }
  async isDone(): Promise<boolean> { return false; }
  async recordResult(_i: WorkItem, r: ItemResult): Promise<void> { this.recorded.push(r); }
}

// A committer fake: real-ish merge lifecycle recorder, no real git (no worktree side effects).
class FakeCommitter {
  readonly calls: string[] = [];
  async head(): Promise<string> { return 'SHA'; }
  async commitAll(): Promise<void> {}
  async collectCommits(): Promise<readonly string[]> { return ['sha1']; }
  async diff(): Promise<string> { return 'diff'; }
  async dirty(): Promise<boolean> { return true; }
  async currentBranch(): Promise<string> { return 'main'; }
  async checkout(): Promise<void> {}
  async createTempBranch(): Promise<void> {}
  async mergeToHead(): Promise<{ ok: boolean; exitCode: number | null; stderr: string }> { return { ok: true, exitCode: 0, stderr: '' }; }
  async abortMerge(): Promise<void> {}
  async deleteBranch(): Promise<void> {}
  async pushBranch(): Promise<{ ok: boolean; exitCode: number | null; stderr: string }> { return { ok: true, exitCode: 0, stderr: '' }; }
  async discardWorktreeChanges(): Promise<void> { this.calls.push('discard'); }
}

// A review http that returns exactly one finding (title controls the modeled behavior).
function oneFindingHttp(title: string): HttpClient {
  return {
    async postJson() {
      return { status: 200, json: { content: [{ type: 'text', text: JSON.stringify([{ severity: 'HIGH', title }]) }] } };
    },
  };
}

// A spawn where the gate `gate-test` command is GREEN on the per-item gate (run #1) and
// then RED on the verify-gate reproducer (run #2+). This models "the finding's failing
// assertion reddens the gate" — the heal we are proving.
function reddenOnReproduceSpawn(): SpawnFn {
  let gateRuns = 0;
  return async (cmd): Promise<SpawnResult> => {
    if (cmd === 'codex') return { exitCode: 0, stdout: '', stderr: '' };
    if (cmd === 'gate-test') {
      gateRuns += 1;
      // run #1 (per-item gate) green; run #2 (reproducer) red ⇒ the finding reproduces.
      return gateRuns === 1 ? { exitCode: 0, stdout: '', stderr: '' } : { exitCode: 1, stdout: '', stderr: 'assertion failed' };
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  };
}

// A spawn where the gate is ALWAYS green ⇒ the finding never reddens the gate ⇒ advisory.
const alwaysGreenSpawn: SpawnFn = async (cmd): Promise<SpawnResult> =>
  cmd === 'false' ? { exitCode: 1, stdout: '', stderr: '' } : { exitCode: 0, stdout: '', stderr: '' };

test('T5: a finding that reddens the gate REPRODUCES and drives an escalation (heal)', async () => {
  const item: WorkItem = { id: 'issue-1', runner: 'worktree', implementBackend: 'codex', body: 'x', gate: { tests: ['gate-test'] } };
  const committer = new FakeCommitter();
  const prod = buildProductionDeps({
    source: new OneItemSource(item), readyItems: [item], cwdFor: () => '/repo',
    config: { allowExternalReview: true, anthropicApiKey: 'rk' }, gh: new GhStub(),
    seams: {
      spawn: reddenOnReproduceSpawn(),
      http: oneFindingHttp('a real gap'),
      committer: committer as unknown as ShellGitCommitter,
      console: { print: () => {} },
    },
  });
  const result = await prod.engine.protocol.run(item, prod.engine.runnerFactory.create(item, 'worktree'));
  // The finding reproduced (the gate went red on re-run), was not fixed within the bound
  // (no-op local fixer) ⇒ the item escalates rather than merging.
  assert.equal(result.status, 'escalated', 'a reproduced finding drives an escalation — the verify-gate is live');
  assert.match(result.note ?? '', /review finding reproduced/);
});

test('T5: a finding that does NOT redden the gate stays ADVISORY (item merges)', async () => {
  const item: WorkItem = { id: 'issue-2', runner: 'worktree', implementBackend: 'codex', body: 'x', gate: { tests: ['true'] } };
  const committer = new FakeCommitter();
  const prod = buildProductionDeps({
    source: new OneItemSource(item), readyItems: [item], cwdFor: () => '/repo',
    config: { allowExternalReview: true, anthropicApiKey: 'rk' }, gh: new GhStub(),
    seams: {
      spawn: alwaysGreenSpawn,
      http: oneFindingHttp('a false positive'),
      committer: committer as unknown as ShellGitCommitter,
      console: { print: () => {} },
    },
  });
  const result = await prod.engine.protocol.run(item, prod.engine.runnerFactory.create(item, 'worktree'));
  assert.equal(result.status, 'completed', 'a non-reddening finding is advisory-only ⇒ the item merges');
});

test('T5 (guard): with the OLD vacuous gate this would have failed — the reproducer can only fire because the gate runs', async () => {
  // The OLD ShellGateRunner returned green when no command was declared (vacuously green),
  // so reproduce() = !green was ALWAYS false ⇒ no finding could ever reproduce. We prove
  // the heal depends on the gate actually running: with a declared, reddening gate the
  // finding reproduces (asserted above); with NO declared command at all, the fail-safe gate
  // reds the item at the PER-ITEM gate (Task 2), so the verify-gate reproducer is never even
  // reached — the item fails as gate-unconfigured, NOT as a silent advisory merge.
  const item: WorkItem = { id: 'issue-3', runner: 'worktree', implementBackend: 'codex', body: 'x' }; // no item gate
  const committer = new FakeCommitter();
  const prod = buildProductionDeps({
    source: new OneItemSource(item), readyItems: [item], cwdFor: () => '/repo',
    config: { allowExternalReview: true, anthropicApiKey: 'rk' }, gh: new GhStub(),
    // No gateConfig ⇒ isConfigured false ⇒ the per-item gate reds gate-unconfigured.
    seams: {
      spawn: alwaysGreenSpawn,
      http: oneFindingHttp('would-be advisory under the old gate'),
      committer: committer as unknown as ShellGitCommitter,
      console: { print: () => {} },
    },
  });
  const result = await prod.engine.protocol.run(item, prod.engine.runnerFactory.create(item, 'worktree'));
  assert.equal(result.status, 'failed', 'an unconfigured gate reds the item — never a vacuous green merge');
  assert.match(result.note ?? '', /gate-unconfigured/);
});

test('T5 (control): with an empty RepoGateConfig and no item gate, the reproduce path is unreachable', async () => {
  // The composition refuses/reds the item BEFORE the verify-gate reproducer. Here we drive
  // the protocol directly (no preflight), so Task 2 reds it at the per-item gate; either way
  // the reproduce path (Task 5's subject) is never exercised on an unconfigured repo.
  const item: WorkItem = { id: 'issue-4', runner: 'worktree', implementBackend: 'codex', body: 'x' };
  const committer = new FakeCommitter();
  let reviewCalled = false;
  const http: HttpClient = { async postJson() { reviewCalled = true; return { status: 200, json: { content: [{ type: 'text', text: '[]' }] } }; } };
  const prod = buildProductionDeps({
    source: new OneItemSource(item), readyItems: [item], cwdFor: () => '/repo',
    config: { allowExternalReview: true, anthropicApiKey: 'rk' }, gh: new GhStub(),
    gateConfig: buildGateConfigFromEnv({}), // empty ⇒ isConfigured false
    seams: { spawn: alwaysGreenSpawn, http, committer: committer as unknown as ShellGitCommitter, console: { print: () => {} } },
  });
  const result = await prod.engine.protocol.run(item, prod.engine.runnerFactory.create(item, 'worktree'));
  assert.equal(result.status, 'failed');
  assert.match(result.note ?? '', /gate-unconfigured/);
  assert.equal(reviewCalled, false, 'review + verify-gate never ran — the item was red at the per-item gate');
});
