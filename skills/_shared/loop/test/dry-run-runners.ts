// Dry-run harness for the Runner interface (Wave 18, Task 2 Verify).
//
// Mirrors the spec's three Verify scenarios as a runnable script:
//   1. runner: worktree → worktree runner instantiated
//   2. no runner field → sandcastle runner instantiated (default)
//   3. Docker stubbed absent + a sandcastle item present → loop aborts at startup
//      with a clear message (no item dispatched)
//
// Run: `node skills/_shared/loop/test/dry-run-runners.ts`

import { strict as assert } from 'node:assert';
import { runLoop } from '../engine.ts';
import {
  DefaultRunnerFactory,
  RunnerPreflightError,
  SandcastleRunner,
  WorktreeRunner,
  preflightRunners,
} from '../runners.ts';
import { type WorkItem, resolveRunnerKind } from '../types.ts';
import { NoopAdapter, NoopProtocol, StubContainerEngineProbe } from './stubs.ts';

async function main(): Promise<void> {
  const factory = new DefaultRunnerFactory({
    sandcastle: new NoopAdapter(),
    worktree: new NoopAdapter(),
  });

  // 1. worktree declared → worktree runner. (resolveRunnerKind mirrors the engine.)
  const wItem: WorkItem = { id: 'w', runner: 'worktree' };
  assert.ok(factory.create(wItem, resolveRunnerKind(wItem)) instanceof WorktreeRunner);
  console.log('[dry-run] runner: worktree → WorktreeRunner — OK');

  // 2. no runner field → sandcastle (default).
  const sItem: WorkItem = { id: 's' };
  assert.ok(factory.create(sItem, resolveRunnerKind(sItem)) instanceof SandcastleRunner);
  console.log('[dry-run] no runner field → SandcastleRunner (default) — OK');

  // 3. Docker absent + sandcastle item → abort at startup, no dispatch.
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
  let aborted = false;
  try {
    await runLoop({
      source,
      protocol: new NoopProtocol(),
      runnerFactory: factory,
      preflight: () => preflightRunners(items, new StubContainerEngineProbe(false)),
    });
  } catch (err: unknown) {
    aborted = true;
    assert.ok(err instanceof RunnerPreflightError);
    assert.match(err.message, /Docker is not available/);
    assert.match(err.message, /refuses to start/);
    console.log(`[dry-run] Docker absent + sandcastle item → abort: "${err.message}"`);
  }
  assert.ok(aborted, 'loop should abort when Docker is absent and a sandcastle item is present');
  assert.equal(dispatched, 0, 'no item should be dispatched on a preflight abort');
  console.log('[dry-run] Docker-absent abort at startup, zero items dispatched — OK');

  console.log('[dry-run] RUNNER HARNESS PASS');
}

main().catch((err: unknown) => {
  console.error('[dry-run] RUNNER HARNESS FAIL');
  console.error(err);
  process.exitCode = 1;
});
