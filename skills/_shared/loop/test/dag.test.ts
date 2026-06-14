// Unit tests for DAG readiness + AFK-frontier-first scheduling (Wave 19, Task 8).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { type Schedule, scheduleRun } from '../scheduler/dag.ts';
import { type WorkItem } from '../types.ts';

// Fixture DAG (spec Verify):
//   A(sandcastle) → B(sandcastle)   [B blocked by A]
//   C(worktree)   → D(sandcastle)   [D blocked by C]
const A: WorkItem = { id: 'A', runner: 'sandcastle' };
const B: WorkItem = { id: 'B', runner: 'sandcastle', blockedBy: ['A'] };
const C: WorkItem = { id: 'C', runner: 'worktree' };
const D: WorkItem = { id: 'D', runner: 'sandcastle', blockedBy: ['C'] };
const ITEMS: readonly WorkItem[] = [A, B, C, D];

function mergedSet(...ids: string[]): (id: string) => boolean {
  const s = new Set(ids);
  return (id) => s.has(id);
}

function ids(items: Schedule['attemptAfk']): string[] {
  return items.map((s) => s.item.id);
}

test('T8: first pass — A is the AFK frontier, C opens a PR awaiting human, D deferred blocked-on-human, B blocked-on-afk', async () => {
  const sched = scheduleRun(ITEMS, mergedSet());

  assert.deepEqual(ids(sched.attemptAfk), ['A'], 'only A is ready AFK (B waits on A)');
  assert.deepEqual(ids(sched.openPrAwaitingHuman), ['C'], 'C is a ready worktree/HITL item');
  assert.deepEqual(ids(sched.blockedOnHuman), ['D'], 'D under un-merged HITL ancestor C → deferred');
  assert.deepEqual(ids(sched.blockedOnAfk), ['B'], 'B waits on un-merged AFK A');
});

test('T8: AFK cascade — after A merges, B becomes the AFK frontier (A then B in one run)', async () => {
  // Step 1: A attempted+merged. Re-schedule with A merged.
  const afterA = scheduleRun(ITEMS, mergedSet('A'));
  assert.deepEqual(ids(afterA.attemptAfk), ['B'], 'B is now ready (its only blocker A merged)');
  // C still awaiting human; D still deferred.
  assert.deepEqual(ids(afterA.openPrAwaitingHuman), ['C']);
  assert.deepEqual(ids(afterA.blockedOnHuman), ['D']);

  // Step 2: B merges too. The AFK cascade (A then B) is done this run.
  const afterAB = scheduleRun(ITEMS, mergedSet('A', 'B'));
  assert.deepEqual(ids(afterAB.attemptAfk), [], 'no more AFK items this run');
  assert.deepEqual(ids(afterAB.openPrAwaitingHuman), ['C']);
  assert.deepEqual(ids(afterAB.blockedOnHuman), ['D'], 'D still deferred until C is merged externally');
});

test('T8: D is NEVER an attempt while C is un-merged (no stacked branches off a HITL parent)', async () => {
  for (const merged of [mergedSet(), mergedSet('A'), mergedSet('A', 'B')]) {
    const sched = scheduleRun(ITEMS, merged);
    assert.ok(!ids(sched.attemptAfk).includes('D'), 'D never attempted under un-merged C');
    assert.ok(ids(sched.blockedOnHuman).includes('D'), 'D classified blocked-on-human');
  }
});

test('T8: second run after C externally merged drains D', async () => {
  // C merged externally by a human (its PR landed); A and B already merged.
  const sched = scheduleRun(ITEMS, mergedSet('A', 'B', 'C'));
  assert.deepEqual(ids(sched.attemptAfk), ['D'], 'D drains now that its HITL blocker C is merged');
  assert.deepEqual(ids(sched.blockedOnHuman), [], 'nothing deferred');
  assert.deepEqual(ids(sched.openPrAwaitingHuman), [], 'C is merged, not re-opened');
});

test('T8: a merged item is excluded from the schedule entirely', async () => {
  const sched = scheduleRun(ITEMS, mergedSet('A'));
  const all = [
    ...sched.attemptAfk,
    ...sched.openPrAwaitingHuman,
    ...sched.blockedOnHuman,
    ...sched.blockedOnAfk,
  ];
  assert.ok(!all.some((s) => s.item.id === 'A'), 'merged A not scheduled');
});

test('T8: readiness requires blockers MERGED, not merely attempted', async () => {
  // B is only ready once A is in the merged set; "attempted" (absent from merged) is
  // not enough — modeled by A not being in the merged predicate.
  const notMerged = scheduleRun(ITEMS, mergedSet());
  assert.ok(ids(notMerged.attemptAfk).includes('A'));
  assert.ok(!ids(notMerged.attemptAfk).includes('B'), 'B not ready until A is MERGED');
});

test('T8: deepest blocked subtree depth is reported', async () => {
  // Chain: C(worktree) → D(sandcastle) → E(sandcastle). Un-merged depth above E is 2.
  const E: WorkItem = { id: 'E', runner: 'sandcastle', blockedBy: ['D'] };
  const sched = scheduleRun([C, D, E], mergedSet());
  assert.ok(sched.deepestBlockedSubtree >= 2, 'reports the deepest blocked chain depth');
});

test('T8: a ready worktree item with no blockers opens a PR (does not auto-merge)', async () => {
  const sched = scheduleRun([C], mergedSet());
  assert.deepEqual(ids(sched.openPrAwaitingHuman), ['C']);
  assert.deepEqual(ids(sched.attemptAfk), [], 'worktree items are never AFK-merged');
});

test('T8: dangling edges (blocker not in the set) are ignored, item treated ready', async () => {
  const orphan: WorkItem = { id: 'orphan', runner: 'sandcastle', blockedBy: ['ghost'] };
  const sched = scheduleRun([orphan], mergedSet());
  assert.deepEqual(ids(sched.attemptAfk), ['orphan']);
});
