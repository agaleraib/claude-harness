// Unit tests for failure handling + termination + run summary (Wave 19, Task 9).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  DEFAULT_TERMINATION,
  newRunProgress,
  recordOutcome,
  RunSummaryBuilder,
  shouldStop,
  type TerminationConfig,
} from '../termination.ts';
import {
  escalateFailure,
  escalateWaveItem,
  waveEscalatedKey,
} from '../failure-handler.ts';
import { InMemoryJournal } from '../state-journal.ts';
import {
  IssueWorkSource,
  READY_FOR_AGENT,
  TerminalTransitions,
  TRANSITIONING,
  terminalKey,
} from '../providers/issue-provider.ts';
import { GhStub, SimulatedCrash } from './gh-stub.ts';
import { type WorkItem } from '../types.ts';

const RUN = 'run1';

test('T9: 3 consecutive forced gate failures → stop reason stall after exactly 3 attempts', async () => {
  const progress = newRunProgress(0);
  let attempts = 0;
  let stop: ReturnType<typeof shouldStop> = null;
  for (let i = 0; i < 10; i += 1) {
    stop = shouldStop(progress, DEFAULT_TERMINATION, 0);
    if (stop !== null) {
      break;
    }
    attempts += 1;
    recordOutcome(progress, 'gate-failed');
  }
  assert.equal(stop, 'stall');
  assert.equal(attempts, 3, 'stops after exactly 3 gate failures');
});

test('T9: a success resets the consecutive-failure streak (no premature stall)', async () => {
  const progress = newRunProgress(0);
  recordOutcome(progress, 'gate-failed');
  recordOutcome(progress, 'gate-failed');
  recordOutcome(progress, 'merged'); // resets the streak
  recordOutcome(progress, 'gate-failed');
  assert.equal(shouldStop(progress, DEFAULT_TERMINATION, 0), null, 'streak reset, no stall');
  assert.equal(progress.consecutiveGateFailures, 1);
});

test('T9: iteration cap 2 → stop after 2 processed items', async () => {
  const config: TerminationConfig = { ...DEFAULT_TERMINATION, iterationCap: 2 };
  const progress = newRunProgress(0);
  let attempts = 0;
  for (let i = 0; i < 10; i += 1) {
    if (shouldStop(progress, config, 0) !== null) {
      break;
    }
    attempts += 1;
    recordOutcome(progress, 'merged');
  }
  assert.equal(attempts, 2, 'exactly 2 successful items before the cap stops the run');
  assert.equal(shouldStop(progress, config, 0), 'iteration-cap');
});

test('T9: token budget and wall-clock caps each trigger their stop reason', async () => {
  const tok: TerminationConfig = { ...DEFAULT_TERMINATION, tokenBudget: 100 };
  const p1 = newRunProgress(0);
  p1.tokensUsed = 100;
  assert.equal(shouldStop(p1, tok, 0), 'token-budget');

  const wall: TerminationConfig = { ...DEFAULT_TERMINATION, wallClockMs: 1000 };
  const p2 = newRunProgress(0);
  assert.equal(shouldStop(p2, wall, 1000), 'wall-clock');
});

test('T9: clean run summary has non-zero merged-afk and the correct stop reason (HARD requirement)', async () => {
  const sb = new RunSummaryBuilder();
  sb.recordMerged('A');
  sb.recordMerged('B');
  sb.recordAwaitingHuman('C');
  sb.recordDeferred();
  sb.noteDeepestBlockedSubtree(2);
  const summary = sb.build('drained');

  assert.equal(summary.mergedAfk, 2);
  assert.equal(summary.openedAwaitingHuman, 1);
  assert.equal(summary.deferredBlockedOnHuman, 1);
  assert.equal(summary.deepestBlockedSubtree, 2);
  assert.equal(summary.stopReason, 'drained');
  assert.deepEqual(summary.visited, ['A', 'B', 'C']);
});

test('T9: deferred items do not count toward the iteration cap', async () => {
  const config: TerminationConfig = { ...DEFAULT_TERMINATION, iterationCap: 1 };
  const progress = newRunProgress(0);
  recordOutcome(progress, 'deferred');
  recordOutcome(progress, 'deferred');
  assert.equal(progress.itemsProcessed, 0, 'deferred items are not attempted');
  assert.equal(shouldStop(progress, config, 0), null);
});

// --- failure escalation via the Task 4 two-phase machine ---

test('T9: a failed ISSUE item escalates via escalateItem; rerun is idempotent (no second escalation, not re-picked)', async () => {
  const gh = new GhStub([{ number: 5, body: 'do it', labels: [READY_FOR_AGENT] }]);
  const journal = new InMemoryJournal();
  const tx = new TerminalTransitions(gh, journal, RUN);
  const item: WorkItem = { id: 'issue-5', issueNumber: 5 };

  const first = await escalateFailure(item, { runId: RUN, transitions: tx, note: 'gate-failed' });
  assert.equal(first, true);

  // ready-for-agent removed; an escalation issue exists; terminal failure marker present.
  const issue = gh.peek(5);
  assert.ok(!issue?.labels.includes(READY_FOR_AGENT), 'ready-for-agent removed');
  const escalations = gh.calls.filter((c) => c.startsWith('createIssue('));
  assert.equal(escalations.length, 1, 'exactly one escalation issue');

  // Source not re-picked on rerun (terminal marker present).
  const source = new IssueWorkSource({ gh, journal, runId: RUN });
  const items = await source.allItems();
  assert.ok(!items.some((i) => i.id === 'issue-5'), 'escalated issue not re-yielded');

  // Re-escalating performs NO second escalation issue.
  await escalateFailure(item, { runId: RUN, transitions: tx, note: 'gate-failed' });
  assert.equal(
    gh.calls.filter((c) => c.startsWith('createIssue(')).length,
    1,
    'no second escalation on rerun',
  );
});

test('T9: a failed WAVE item escalates via .harness-state markers, row left un-ticked, idempotent', async () => {
  const journal = new InMemoryJournal();
  const item: WorkItem = { id: 'wave-19', waveNumber: 19 };

  const first = await escalateWaveItem(journal, RUN, item, 'gate-failed: see logs');
  assert.equal(first, true);
  const recs = await journal.readAll();
  assert.ok(recs.some((r) => r['phase'] === 'started'), 'durable intent first');
  assert.ok(
    recs.some((r) => r['phase'] === 'escalated' && r['escalationPointer'] === 'gate-failed: see logs'),
    'terminal escalation with pointer',
  );
  assert.match(waveEscalatedKey(RUN, item.id), /run-loop:run1:wave-19:escalated/);

  // Idempotent: second call writes nothing new.
  const before = (await journal.readAll()).length;
  const second = await escalateWaveItem(journal, RUN, item, 'gate-failed: see logs');
  assert.equal(second, false);
  assert.equal((await journal.readAll()).length, before, 'no second escalation record');
});

// --- crash-during-escalation reconciliation (i) and (ii) ---

test('T9(i): crash after ready-for-agent removed, before terminal marker → reconcile resolves to exactly one escalation', async () => {
  const gh = new GhStub([{ number: 6, body: 'x', labels: [READY_FOR_AGENT] }]);
  const journal = new InMemoryJournal();
  const tx = new TerminalTransitions(gh, journal, RUN);
  const item: WorkItem = { id: 'issue-6', issueNumber: 6 };

  // Crash right after the escalation issue is created (step 3 done, step 4 not).
  gh.crashOn = (call) => {
    if (call.startsWith('createIssue(')) {
      throw new SimulatedCrash('after-escalation-create-before-terminal-marker');
    }
  };
  await assert.rejects(
    escalateFailure(item, { runId: RUN, transitions: tx, note: 'gate-failed' }),
    SimulatedCrash,
  );
  gh.crashOn = null;

  // Rerun: reconciliation resumes the escalate transition to exactly one terminal state.
  const source = new IssueWorkSource({ gh, journal, runId: RUN });
  await source.init();

  const issue = gh.peek(6);
  assert.ok(!issue?.labels.includes(TRANSITIONING), 'transitioning cleared on resume');
  const terminal = (await gh.listComments(6)).filter((c) =>
    c.body.includes(terminalKey(RUN, 'issue-6', 'escalated')),
  );
  assert.equal(terminal.length, 1, 'exactly one terminal escalation marker');
  // Exactly one escalation issue created across both passes.
  assert.equal(gh.calls.filter((c) => c.startsWith('createIssue(')).length, 1, 'no second escalation');
});

test('T9(ii): crash after escalation issue exists, before transitioning cleared → reconcile completes commit step idempotently', async () => {
  const gh = new GhStub([{ number: 7, body: 'y', labels: [READY_FOR_AGENT] }]);
  const journal = new InMemoryJournal();
  const tx = new TerminalTransitions(gh, journal, RUN);
  const item: WorkItem = { id: 'issue-7', issueNumber: 7 };

  // Crash after the terminal marker comment is posted but before transitioning is
  // cleared (step 4 partway): crash on the removeLabel(transitioning) of step 4.
  let armed = false;
  gh.crashOn = (call) => {
    if (call.includes(terminalKey(RUN, 'issue-7', 'escalated'))) {
      armed = true; // terminal marker just posted
      return;
    }
    if (armed && call === `removeLabel(7,${TRANSITIONING})`) {
      throw new SimulatedCrash('after-terminal-marker-before-clearing-transitioning');
    }
  };
  await assert.rejects(
    escalateFailure(item, { runId: RUN, transitions: tx, note: 'gate-failed' }),
    SimulatedCrash,
  );
  gh.crashOn = null;

  const escalationsBefore = gh.calls.filter((c) => c.startsWith('createIssue(')).length;

  // Rerun: reconciliation completes the commit step idempotently — clears
  // transitioning, no second escalation.
  const source = new IssueWorkSource({ gh, journal, runId: RUN });
  await source.init();

  const issue = gh.peek(7);
  assert.ok(!issue?.labels.includes(TRANSITIONING), 'transitioning cleared on resume');
  assert.equal(
    gh.calls.filter((c) => c.startsWith('createIssue(')).length,
    escalationsBefore,
    'no second escalation on resume',
  );
});

// --- Wave 22 Bug 4: a distinct implement-failed bucket -----------------------------

test('T4: recordImplementFailed increments implementFailed, NOT gateFailed', () => {
  const b = new RunSummaryBuilder();
  b.recordImplementFailed('issue-2');
  b.recordGateFailed('issue-3');
  const report = b.build('drained');
  assert.equal(report.implementFailed, 1, 'implement-failed item lands in its own bucket');
  assert.equal(report.gateFailed, 1, 'gate-red item lands in gate-failed');
  // Both visited, in record order.
  assert.deepEqual(report.visited, ['issue-2', 'issue-3']);
});

test('T4: a report with neither failure type reports zero in both buckets', () => {
  const report = new RunSummaryBuilder().build('drained');
  assert.equal(report.implementFailed, 0);
  assert.equal(report.gateFailed, 0);
});
