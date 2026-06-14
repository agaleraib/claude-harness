// Unit tests for the Runner interface, selection, and Docker-absent abort
// (Wave 18, Task 2).
//
// Run: `node --test skills/_shared/loop/test/*.test.ts`

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { runLoop } from '../engine.ts';
import {
  DefaultRunnerFactory,
  RunnerPreflightError,
  SandcastleRunner,
  WorktreeRunner,
  preflightRunners,
  type RunnerAdapters,
} from '../runners.ts';
import { type WorkItem, resolveRunnerKind } from '../types.ts';
import { NoopAdapter, NoopProtocol, StubContainerEngineProbe } from './stubs.ts';

function adapters(): RunnerAdapters {
  return { sandcastle: new NoopAdapter(), worktree: new NoopAdapter() };
}

// --- Selection ---

// These mirror the engine exactly: resolve the kind via the single shared
// resolveRunnerKind helper (not an inlined `?? 'sandcastle'`), then hand it to the
// factory — so if the default rule ever changes, these tests track it.

test('runner: worktree → factory instantiates the worktree runner', () => {
  const factory = new DefaultRunnerFactory(adapters());
  const item: WorkItem = { id: 'w', runner: 'worktree' };
  const runner = factory.create(item, resolveRunnerKind(item));
  assert.ok(runner instanceof WorktreeRunner);
  assert.equal(runner.kind, 'worktree');
});

test('no runner field → factory instantiates the sandcastle runner (default)', () => {
  const factory = new DefaultRunnerFactory(adapters());
  const item: WorkItem = { id: 's' };
  const runner = factory.create(item, resolveRunnerKind(item));
  assert.ok(runner instanceof SandcastleRunner);
  assert.equal(runner.kind, 'sandcastle');
});

test('runner: sandcastle (explicit) → sandcastle runner', () => {
  const factory = new DefaultRunnerFactory(adapters());
  const item: WorkItem = { id: 's', runner: 'sandcastle' };
  const runner = factory.create(item, resolveRunnerKind(item));
  assert.ok(runner instanceof SandcastleRunner);
});

test('engine resolves the declared runner kind via the factory for each item', async () => {
  // Records what kind the factory was asked to build, by wrapping it.
  const inner = new DefaultRunnerFactory(adapters());
  const built: string[] = [];
  const factory = {
    create(item: WorkItem, kind: 'sandcastle' | 'worktree') {
      built.push(`${item.id}:${kind}`);
      return inner.create(item, kind);
    },
  };
  const items: readonly WorkItem[] = [
    { id: 'a' }, // default → sandcastle
    { id: 'b', runner: 'worktree' },
    { id: 'c', runner: 'sandcastle' },
  ];
  // A source that yields the three items then drains; nothing is pre-done.
  let i = 0;
  const source = {
    async nextReady(): Promise<WorkItem | null> {
      return i < items.length ? items[i++]! : null;
    },
    async isDone(): Promise<boolean> {
      return false;
    },
    async recordResult(): Promise<void> {},
  };
  await runLoop({ source, protocol: new NoopProtocol(), runnerFactory: factory });
  assert.deepEqual(built, ['a:sandcastle', 'b:worktree', 'c:sandcastle']);
});

// --- Runner lifecycle delegates to the adapter ---

test('runner lifecycle delegates each call to its adapter', async () => {
  const sandAdapter = new NoopAdapter();
  const factory = new DefaultRunnerFactory({
    sandcastle: sandAdapter,
    worktree: new NoopAdapter(),
  });
  const runner = factory.create({ id: 's' }, 'sandcastle');
  await runner.prepare();
  await runner.exec('do the thing');
  await runner.collectCommits();
  await runner.teardown();
  assert.deepEqual(sandAdapter.calls, ['prepare', 'run', 'collectCommits', 'teardown']);
});

// --- Docker-absent abort (preflight) ---

test('Docker absent + a sandcastle item present → preflight throws a clear error', async () => {
  const items: readonly WorkItem[] = [{ id: 'needs-docker' }, { id: 'w', runner: 'worktree' }];
  const probe = new StubContainerEngineProbe(false, 'Docker');
  await assert.rejects(
    preflightRunners(items, probe),
    (err: unknown) => {
      assert.ok(err instanceof RunnerPreflightError, 'should be a RunnerPreflightError');
      assert.match(err.message, /Docker is not available/);
      assert.match(err.message, /needs-docker/, 'names the offending sandcastle item');
      assert.match(err.message, /refuses to start/);
      return true;
    },
  );
});

test('Docker absent but only worktree items → preflight passes (no sandcastle to start)', async () => {
  const items: readonly WorkItem[] = [{ id: 'w1', runner: 'worktree' }, { id: 'w2', runner: 'worktree' }];
  await assert.doesNotReject(preflightRunners(items, new StubContainerEngineProbe(false)));
});

test('Docker present + sandcastle items → preflight passes', async () => {
  const items: readonly WorkItem[] = [{ id: 's' }, { id: 'w', runner: 'worktree' }];
  await assert.doesNotReject(preflightRunners(items, new StubContainerEngineProbe(true)));
});

test('engine aborts the whole run at startup when preflight rejects (no item dispatched)', async () => {
  const items: readonly WorkItem[] = [{ id: 'needs-docker' }];
  let dispatched = 0;
  const source = {
    async nextReady(): Promise<WorkItem | null> {
      dispatched += 1;
      return null;
    },
    async isDone(): Promise<boolean> {
      return false;
    },
    async recordResult(): Promise<void> {},
  };
  await assert.rejects(
    runLoop({
      source,
      protocol: new NoopProtocol(),
      runnerFactory: new DefaultRunnerFactory(adapters()),
      preflight: () => preflightRunners(items, new StubContainerEngineProbe(false)),
    }),
    RunnerPreflightError,
  );
  assert.equal(dispatched, 0, 'no item is pulled from the source when preflight aborts');
});
