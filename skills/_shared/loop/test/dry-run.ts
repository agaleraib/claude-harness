// Dry-run harness for the /run-loop engine (Wave 18, Task 1 Verify).
//
// Invokes the engine with a stub work-source (3 fake items, no deps) and a stub
// runner that no-ops. Asserts the loop visits all 3 in order, records 3 results,
// and terminates on "drained". Then re-runs with one item pre-marked done and
// asserts it visits only 2.
//
// Run: `node skills/_shared/loop/test/dry-run.ts`
// (Node 25 strips TypeScript types natively — no build step.)

import { strict as assert } from 'node:assert';
import { runLoop } from '../engine.ts';
import { type WorkItem } from '../types.ts';
import { NoopProtocol, StubRunnerFactory, StubWorkSource } from './stubs.ts';

const items: readonly WorkItem[] = [
  { id: 'item-1' },
  { id: 'item-2' },
  { id: 'item-3' },
];

async function main(): Promise<void> {
  // --- Run 1: clean source, 3 items, no deps. ---
  const source = new StubWorkSource(items);
  const factory = new StubRunnerFactory();
  const summary = await runLoop({
    source,
    protocol: new NoopProtocol(),
    runnerFactory: factory,
  });

  assert.deepEqual(
    summary.visited,
    ['item-1', 'item-2', 'item-3'],
    'loop should visit all 3 items in source order',
  );
  assert.equal(summary.results.length, 3, 'loop should record 3 results');
  assert.equal(source.recorded.length, 3, 'source should have 3 recorded results');
  assert.equal(summary.stopReason, 'drained', 'loop should terminate on drained');
  // No runner declared ⇒ all default to sandcastle.
  assert.deepEqual(
    factory.built.map((b) => b.kind),
    ['sandcastle', 'sandcastle', 'sandcastle'],
    'unspecified runner should default to sandcastle for every item',
  );
  console.log('[dry-run] run 1: visited 3 items, recorded 3 results, drained — OK');

  // --- Run 2: resume with item-2 pre-marked done ⇒ visits only 2. ---
  const source2 = new StubWorkSource(items, ['item-2']);
  const summary2 = await runLoop({
    source: source2,
    protocol: new NoopProtocol(),
    runnerFactory: new StubRunnerFactory(),
  });

  assert.deepEqual(
    summary2.visited,
    ['item-1', 'item-3'],
    'resume run should skip the pre-marked-done item and visit only 2',
  );
  assert.equal(summary2.results.length, 2, 'resume run should record 2 results');
  assert.equal(summary2.stopReason, 'drained', 'resume run should terminate on drained');
  console.log('[dry-run] run 2 (resume): visited 2 items (item-2 pre-done), drained — OK');

  console.log('[dry-run] HARNESS PASS');
}

main().catch((err: unknown) => {
  console.error('[dry-run] HARNESS FAIL');
  console.error(err);
  process.exitCode = 1;
});
