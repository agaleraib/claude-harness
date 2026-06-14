// Unit tests for the control loop (Wave 18, Task 1).
//
// Run: `node --test skills/_shared/loop/test/*.test.ts`
// (Node 25 strips TypeScript types natively — no build step.)

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { runLoop } from '../engine.ts';
import { type ItemResult, type Runner, type WorkItem } from '../types.ts';
import { NoopProtocol, StubRunnerFactory, StubWorkSource } from './stubs.ts';

const threeItems: readonly WorkItem[] = [
  { id: 'item-1' },
  { id: 'item-2' },
  { id: 'item-3' },
];

test('visits all ready items in source order and terminates on drained', async () => {
  const source = new StubWorkSource(threeItems);
  const summary = await runLoop({
    source,
    protocol: new NoopProtocol(),
    runnerFactory: new StubRunnerFactory(),
  });

  assert.deepEqual(summary.visited, ['item-1', 'item-2', 'item-3']);
  assert.equal(summary.results.length, 3);
  assert.equal(summary.stopReason, 'drained');
});

test('records one result per visited item, through the source', async () => {
  const source = new StubWorkSource(threeItems);
  const summary = await runLoop({
    source,
    protocol: new NoopProtocol(),
    runnerFactory: new StubRunnerFactory(),
  });

  assert.equal(source.recorded.length, 3);
  assert.deepEqual(
    source.recorded.map((r) => r.itemId),
    ['item-1', 'item-2', 'item-3'],
  );
  assert.ok(summary.results.every((r) => r.status === 'completed'));
});

test('resume: a pre-marked-done item is skipped, only the rest are visited', async () => {
  const source = new StubWorkSource(threeItems, ['item-2']);
  const summary = await runLoop({
    source,
    protocol: new NoopProtocol(),
    runnerFactory: new StubRunnerFactory(),
  });

  assert.deepEqual(summary.visited, ['item-1', 'item-3']);
  assert.equal(summary.results.length, 2);
  assert.equal(summary.stopReason, 'drained');
});

test('empty source terminates immediately on drained with zero visits', async () => {
  const source = new StubWorkSource([]);
  const summary = await runLoop({
    source,
    protocol: new NoopProtocol(),
    runnerFactory: new StubRunnerFactory(),
  });

  assert.deepEqual(summary.visited, []);
  assert.equal(summary.results.length, 0);
  assert.equal(summary.stopReason, 'drained');
});

test('engine resolves a runner for every visited item (default sandcastle)', async () => {
  const source = new StubWorkSource(threeItems);
  const factory = new StubRunnerFactory();
  await runLoop({ source, protocol: new NoopProtocol(), runnerFactory: factory });

  assert.equal(factory.built.length, 3);
  assert.ok(factory.built.every((b) => b.kind === 'sandcastle'));
});

test('engine throws if a source re-yields an already-processed item (no spin)', async () => {
  // A deliberately broken source that yields item-1 forever and never marks done.
  const broken = {
    yielded: 0,
    async nextReady(): Promise<WorkItem | null> {
      this.yielded += 1;
      return { id: 'loopy' };
    },
    async isDone(): Promise<boolean> {
      return false;
    },
    async recordResult(_i: WorkItem, _r: ItemResult): Promise<void> {},
  };

  await assert.rejects(
    runLoop({
      source: broken,
      protocol: new NoopProtocol(),
      runnerFactory: new StubRunnerFactory(),
    }),
    /re-yielded item "loopy"/,
  );
});

test('engine-level isDone skip: a yielded-but-done item is not processed', async () => {
  // Source that yields item-a (done), then item-b (not done), then drains.
  // Exercises the engine's own isDone branch (distinct from a source that
  // filters done items internally before yielding).
  const queue: WorkItem[] = [{ id: 'item-a' }, { id: 'item-b' }];
  let i = 0;
  const factory = new StubRunnerFactory();
  const recorded: ItemResult[] = [];
  const source = {
    async nextReady(): Promise<WorkItem | null> {
      return i < queue.length ? queue[i++]! : null;
    },
    async isDone(item: WorkItem): Promise<boolean> {
      return item.id === 'item-a';
    },
    async recordResult(_item: WorkItem, result: ItemResult): Promise<void> {
      recorded.push(result);
    },
  };

  const summary = await runLoop({ source, protocol: new NoopProtocol(), runnerFactory: factory });

  assert.deepEqual(summary.visited, ['item-b'], 'the done item is skipped, only item-b is visited');
  assert.equal(recorded.length, 1);
  assert.equal(factory.built.length, 1, 'no runner is built for the skipped done item');
});

test('a custom protocol result flows through to the summary and source', async () => {
  const escalating = {
    async run(item: WorkItem, _runner: Runner): Promise<ItemResult> {
      return { itemId: item.id, status: 'escalated' as const, note: 'needs human' };
    },
  };
  const source = new StubWorkSource([{ id: 'x' }]);
  const summary = await runLoop({
    source,
    protocol: escalating,
    runnerFactory: new StubRunnerFactory(),
  });

  assert.equal(summary.results[0]?.status, 'escalated');
  assert.equal(summary.results[0]?.note, 'needs human');
  assert.equal(source.recorded[0]?.status, 'escalated');
});
