// Unit tests for the per-item protocol — Task 5 (exit gate hard blocker).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { type GateRunner } from '../protocol/gate.ts';
import { PerItemProtocolImpl } from '../protocol/per-item.ts';
import { type CodeReviewer, type Finding, type ReviewEffort } from '../protocol/review.ts';
import { FROM_CODE_REVIEW } from '../protocol/findings-filer.ts';
import { type WorkItem } from '../types.ts';
import { StubRunner } from './stubs.ts';
import { GhStub } from './gh-stub.ts';

/** A GateRunner whose three checks return fixed booleans. */
function gateRunner(opts: {
  tests?: boolean;
  typecheck?: boolean;
  verify?: boolean;
}): GateRunner {
  return {
    async runTests(): Promise<boolean> {
      return opts.tests ?? true;
    },
    async runTypecheck(): Promise<boolean> {
      return opts.typecheck ?? true;
    },
    async runVerify(): Promise<boolean> {
      return opts.verify ?? true;
    },
  };
}

const ITEM: WorkItem = { id: 'item-x', syntheticSpec: 'build x' };

test('T5: an item whose tests are forced red never reaches merge; recorded gate-failed', async () => {
  const runner = new StubRunner('sandcastle');
  const protocol = new PerItemProtocolImpl({ gate: gateRunner({ tests: false }) });
  const outcome = await protocol.runProtocol(ITEM, runner);

  assert.equal(outcome.disposition, 'gate-failed', 'red tests ⇒ gate-failed');
  assert.equal(outcome.gate?.green, false);
  assert.equal(outcome.gate?.checks.tests, false);
  // The runner ran the item (prepare+exec) but the protocol never advanced past
  // the gate — there is no merge step in the recorded lifecycle.
  assert.ok(runner.calls.includes('prepare'));
  assert.ok(runner.calls.includes('exec'));
  assert.ok(runner.calls.includes('teardown'));
});

test('T5: red typecheck or red verify also blocks at gate-failed', async () => {
  for (const opts of [{ typecheck: false }, { verify: false }]) {
    const protocol = new PerItemProtocolImpl({ gate: gateRunner(opts) });
    const outcome = await protocol.runProtocol(ITEM, new StubRunner('sandcastle'));
    assert.equal(outcome.disposition, 'gate-failed');
  }
});

test('T5: an item with a fully green gate proceeds past the gate', async () => {
  const protocol = new PerItemProtocolImpl({ gate: gateRunner({}) });
  const outcome = await protocol.runProtocol(ITEM, new StubRunner('sandcastle'));

  assert.equal(outcome.disposition, 'ready-to-merge', 'green gate proceeds');
  assert.equal(outcome.gate?.green, true);
});

test('T5: gate-failed maps to the frozen failed status via the PerItemProtocol seam', async () => {
  const protocol = new PerItemProtocolImpl({ gate: gateRunner({ tests: false }) });
  const result = await protocol.run(ITEM, new StubRunner('sandcastle'));
  assert.equal(result.status, 'failed', 'gate-failed ⇒ frozen status "failed"');
  assert.equal(result.itemId, 'item-x');
  assert.match(result.note ?? '', /tests/);
});

test('T5: the gate runs all three checks (no short-circuit) so the note names every red check', async () => {
  const protocol = new PerItemProtocolImpl({
    gate: gateRunner({ tests: false, typecheck: false, verify: true }),
  });
  const outcome = await protocol.runProtocol(ITEM, new StubRunner('sandcastle'));
  assert.match(outcome.gate?.note ?? '', /tests/);
  assert.match(outcome.gate?.note ?? '', /typecheck/);
  assert.doesNotMatch(outcome.gate?.note ?? '', /verify/);
});

test('T7: protocol files leftover MEDIUM/LOW findings as issues through the gh seam', async () => {
  const MED: Finding = { id: 'm', severity: 'MEDIUM', title: 'a medium' };
  const reviewer: CodeReviewer = {
    async review(_item: WorkItem, _effort: ReviewEffort): Promise<readonly Finding[]> {
      return [MED];
    },
  };
  const gh = new GhStub();
  const protocol = new PerItemProtocolImpl({
    gate: gateRunner({}),
    reviewer,
    fixer: { async fix(): Promise<void> {} },
    gh,
  });
  const item: WorkItem = { id: 'issue-7', issueNumber: 7, sourceLabel: 'ready-for-agent' };
  const outcome = await protocol.runProtocol(item, new StubRunner('sandcastle'));

  assert.equal(outcome.disposition, 'ready-to-merge');
  assert.equal(outcome.filedFindingIssues?.length, 1, 'one issue filed for the MEDIUM');
  const filed = gh.peek(outcome.filedFindingIssues![0]!);
  assert.ok(filed?.labels.includes(FROM_CODE_REVIEW));
  assert.ok(filed?.labels.includes('ready-for-agent'));
});
