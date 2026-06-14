// Unit tests for code-review + bounded auto-fix (Wave 19, Task 6).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  type AutoFixer,
  type CodeReviewer,
  type Finding,
  type ReviewEffort,
  reviewEffortFor,
  runReviewLoop,
} from '../protocol/review.ts';
import { PerItemProtocolImpl } from '../protocol/per-item.ts';
import { type GateRunner } from '../protocol/gate.ts';
import { type WorkItem } from '../types.ts';
import { StubRunner } from './stubs.ts';

const greenGate: GateRunner = {
  async runTests(): Promise<boolean> {
    return true;
  },
  async runTypecheck(): Promise<boolean> {
    return true;
  },
  async runVerify(): Promise<boolean> {
    return true;
  },
};

/** Reviewer driven by a scripted list of finding-sets, one per invocation. */
class ScriptedReviewer implements CodeReviewer {
  calls = 0;
  efforts: ReviewEffort[] = [];
  private readonly rounds: readonly (readonly Finding[])[];
  constructor(rounds: readonly (readonly Finding[])[]) {
    this.rounds = rounds;
  }
  async review(_item: WorkItem, effort: ReviewEffort): Promise<readonly Finding[]> {
    this.efforts.push(effort);
    const round = this.rounds[this.calls] ?? [];
    this.calls += 1;
    return round;
  }
}

class RecordingFixer implements AutoFixer {
  calls = 0;
  lastFixed: readonly Finding[] = [];
  async fix(_item: WorkItem, findings: readonly Finding[]): Promise<void> {
    this.calls += 1;
    this.lastFixed = findings;
  }
}

const HIGH: Finding = { id: 'f1', severity: 'HIGH', title: 'a high finding' };
const MEDIUM: Finding = { id: 'm1', severity: 'MEDIUM', title: 'a medium finding' };
const ITEM: WorkItem = { id: 'item-x', syntheticSpec: 'build x' };

test('T6: one HIGH finding resolved by the fix → passes after one re-review', async () => {
  // Round 1: [HIGH]; auto-fix; round 2: [] (resolved).
  const reviewer = new ScriptedReviewer([[HIGH], []]);
  const fixer = new RecordingFixer();
  const outcome = await runReviewLoop(ITEM, reviewer, fixer);

  assert.equal(outcome.disposition, 'clean');
  assert.equal(reviewer.calls, 2, 'exactly one re-review');
  assert.equal(fixer.calls, 1, 'auto-fix ran once');
  assert.deepEqual(fixer.lastFixed, [HIGH], 'only the blocking finding was fixed');
});

test('T6: a HIGH that persists after the fix → escalated, re-review called exactly once (no infinite loop)', async () => {
  // Round 1: [HIGH]; auto-fix; round 2: still [HIGH] (survives).
  const reviewer = new ScriptedReviewer([[HIGH], [HIGH]]);
  const fixer = new RecordingFixer();
  const outcome = await runReviewLoop(ITEM, reviewer, fixer);

  assert.equal(outcome.disposition, 'escalate');
  assert.equal(reviewer.calls, 2, 're-review called EXACTLY once — no third review');
  assert.equal(fixer.calls, 1, 'auto-fix not retried after the surviving blocker');
  assert.equal(outcome.survivingBlockers.length, 1);
});

test('T6: MEDIUM/LOW findings are never auto-fixed and surface as leftover', async () => {
  const reviewer = new ScriptedReviewer([[MEDIUM]]);
  const fixer = new RecordingFixer();
  const outcome = await runReviewLoop(ITEM, reviewer, fixer);

  assert.equal(outcome.disposition, 'clean');
  assert.equal(reviewer.calls, 1, 'no re-review when there are no blocking findings');
  assert.equal(fixer.calls, 0, 'MEDIUM is never auto-fixed');
  assert.deepEqual(outcome.leftover, [MEDIUM]);
});

test('T6: leftover MEDIUM/LOW from the LAST review survive an auto-fix round', async () => {
  // Round 1: [HIGH, MEDIUM]; fix; round 2: [MEDIUM] (HIGH resolved, MEDIUM remains).
  const reviewer = new ScriptedReviewer([[HIGH, MEDIUM], [MEDIUM]]);
  const outcome = await runReviewLoop(ITEM, reviewer, new RecordingFixer());
  assert.equal(outcome.disposition, 'clean');
  assert.deepEqual(outcome.leftover, [MEDIUM]);
});

test('T6: review effort is high by default, ultra when the item declares review: ultra', async () => {
  assert.equal(reviewEffortFor({ id: 'a' }), 'high');
  assert.equal(reviewEffortFor({ id: 'b', review: 'ultra' }), 'ultra');

  const reviewer = new ScriptedReviewer([[]]);
  await runReviewLoop({ id: 'c', review: 'ultra' }, reviewer, new RecordingFixer());
  assert.equal(reviewer.efforts[0], 'ultra', 'ultra passed through to /code-review');
});

test('T6: protocol integrates the review loop after a green gate (escalate ⇒ review-escalated)', async () => {
  const reviewer = new ScriptedReviewer([[HIGH], [HIGH]]);
  const protocol = new PerItemProtocolImpl({
    gate: greenGate,
    reviewer,
    fixer: new RecordingFixer(),
  });
  const outcome = await protocol.runProtocol(ITEM, new StubRunner('sandcastle'));
  assert.equal(outcome.disposition, 'review-escalated');
  assert.equal(outcome.reviewCount, 2);

  // Frozen status mapping: review-escalated ⇒ escalated.
  const result = await protocol.run(ITEM, new StubRunner('sandcastle'));
  assert.equal(result.status, 'escalated');
});

test('T6: protocol clean review ⇒ ready-to-merge carrying leftover findings', async () => {
  const reviewer = new ScriptedReviewer([[MEDIUM]]);
  const protocol = new PerItemProtocolImpl({
    gate: greenGate,
    reviewer,
    fixer: new RecordingFixer(),
  });
  const outcome = await protocol.runProtocol(ITEM, new StubRunner('sandcastle'));
  assert.equal(outcome.disposition, 'ready-to-merge');
  assert.deepEqual(outcome.leftoverFindings, [MEDIUM]);
});

test('T6: a red gate never reaches the review loop', async () => {
  const reviewer = new ScriptedReviewer([[HIGH]]);
  const protocol = new PerItemProtocolImpl({
    gate: { ...greenGate, async runTests() {
      return false;
    } },
    reviewer,
    fixer: new RecordingFixer(),
  });
  const outcome = await protocol.runProtocol(ITEM, new StubRunner('sandcastle'));
  assert.equal(outcome.disposition, 'gate-failed');
  assert.equal(reviewer.calls, 0, 'review never runs on a red gate');
});
