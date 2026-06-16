// Wave 22, Task 1 (Bug 1) — readiness-gated drive regression tests.
//
// Before this fix the issues-mode drive pulled items in source order, so a blocked
// item (#3 `## Blocked by #2`) was processed FIRST. ReadinessGatedSource gates the
// drive on blocked-by readiness in the COMPOSITION layer (the frozen engine is
// untouched): blockers run before blocked items, and a blocked item is WITHHELD until
// its blockers are done — done = recorded-completed-this-run OR issue-terminal (OQ-3
// union). The frozen engine's seen-guard means a withheld item is yielded at most once,
// only after its blocker is recorded done.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ReadinessGatedSource } from '../run-loop-prod-deps.ts';
import { runLoop } from '../engine.ts';
import { DefaultRunnerFactory } from '../runners.ts';
import {
  type EngineDeps,
  type ItemResult,
  type PerItemProtocol,
  type Runner,
  type WorkItem,
  type WorkSource,
} from '../types.ts';

// An inner source that holds a fixed item set and tracks issue-terminal done-state via
// an injected set (the "issue closed / terminal marker" arm). recordResult is recorded.
class InnerSource implements WorkSource {
  readonly recorded: ItemResult[] = [];
  private cursor = 0;
  private readonly items: readonly WorkItem[];
  /** Ids whose ISSUE is terminal (closed) independent of this run. */
  private readonly terminal: Set<string>;
  constructor(items: readonly WorkItem[], terminal: Set<string> = new Set()) {
    this.items = items;
    this.terminal = terminal;
  }
  async nextReady(): Promise<WorkItem | null> {
    return this.cursor < this.items.length ? this.items[this.cursor++]! : null;
  }
  async isDone(item: WorkItem): Promise<boolean> {
    return this.terminal.has(item.id);
  }
  async recordResult(_item: WorkItem, result: ItemResult): Promise<void> {
    this.recorded.push(result);
  }
}

// A protocol that records processing order and returns `completed` for every item.
function recordingProtocol(order: string[]): PerItemProtocol {
  return {
    async run(item: WorkItem, _runner: Runner): Promise<ItemResult> {
      order.push(item.id);
      return { itemId: item.id, status: 'completed', note: 'ok' };
    },
  };
}

const noopAdapter = {
  async prepare(): Promise<void> {},
  async run(): Promise<void> {},
  async collectCommits(): Promise<readonly string[]> { return []; },
  async teardown(): Promise<void> {},
};

function engineWith(source: WorkSource, order: string[]): EngineDeps {
  return {
    source,
    protocol: recordingProtocol(order),
    runnerFactory: new DefaultRunnerFactory({ sandcastle: noopAdapter, worktree: noopAdapter }),
  };
}

// A = issue-2, B = issue-3 blockedBy issue-2. Source order lists B FIRST to prove the
// gate reorders (the pre-fix bug yielded B first).
const A: WorkItem = { id: 'issue-2', runner: 'sandcastle' };
const B: WorkItem = { id: 'issue-3', runner: 'sandcastle', blockedBy: ['issue-2'] };

test('readiness: nextReady yields the blocker A first and withholds B until A is done', async () => {
  const inner = new InnerSource([B, A]); // source order: B before A
  const gated = new ReadinessGatedSource(inner, [B, A]);

  // First pull: A (the unblocked blocker), NOT B — even though B is first in source order.
  const first = await gated.nextReady();
  assert.equal(first?.id, 'issue-2', 'blocker A yields first');

  // Before A is recorded done, B is NOT ready ⇒ nextReady returns null (drained-for-now).
  assert.equal(await gated.nextReady(), null, 'B withheld while its blocker is not done');

  // Record A done (completed this run) ⇒ a re-evaluation now yields B.
  await gated.recordResult(A, { itemId: 'issue-2', status: 'completed' });
  const next = await gated.nextReady();
  assert.equal(next?.id, 'issue-3', 'B becomes ready after its blocker is recorded done');
  assert.equal(await gated.nextReady(), null, 'fully drained after B');
});

test('readiness: the engine NEVER processes B before A (full runLoop)', async () => {
  const order: string[] = [];
  const inner = new InnerSource([B, A]);
  const gated = new ReadinessGatedSource(inner, [B, A]);
  const summary = await runLoop(engineWith(gated, order));

  // Both processed, A strictly before B — the frozen engine + the gate cooperate.
  assert.deepEqual(order, ['issue-2', 'issue-3']);
  assert.deepEqual(summary.visited, ['issue-2', 'issue-3']);
  assert.equal(summary.stopReason, 'drained');
});

test('readiness: a blocker whose ISSUE is already terminal unblocks B immediately (union arm)', async () => {
  const order: string[] = [];
  // A's issue is terminal (closed) independent of this run; engine skips A (isDone) but B
  // must still be allowed to run because its blocker is done by the issue-terminal arm.
  const inner = new InnerSource([B, A], new Set(['issue-2']));
  const gated = new ReadinessGatedSource(inner, [B, A]);
  const summary = await runLoop(engineWith(gated, order));

  // A is skipped by the engine (isDone ⇒ true), B runs because its blocker is terminal.
  assert.deepEqual(order, ['issue-3'], 'only B is processed; A is already done');
  assert.deepEqual(summary.visited, ['issue-3']);
});

test('readiness: a non-completed blocker result does NOT unblock B', async () => {
  const inner = new InnerSource([A, B]);
  const gated = new ReadinessGatedSource(inner, [A, B]);

  const first = await gated.nextReady();
  assert.equal(first?.id, 'issue-2');
  // A produced a FAILED result this run (not completed) and its issue is not terminal ⇒
  // B stays blocked.
  await gated.recordResult(A, { itemId: 'issue-2', status: 'failed', note: 'implement-failed: boom' });
  assert.equal(await gated.nextReady(), null, 'B stays deferred when its blocker did not complete');
});
