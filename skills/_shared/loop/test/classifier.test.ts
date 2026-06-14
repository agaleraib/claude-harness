// Tests for the shared AFK/HITL 4-gate classifier + loop reconciliation (Task 12).
//
// Verify: the same task fixture classifies AFK under worktree and HITL under
// sandcastle; an issue pre-labeled ready-for-agent whose task trips gate (1) under
// its resolved runner is re-labeled ready-for-human with a logged reason.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classify,
  defaultRunnerCapabilities,
  type TaskCapabilitySignals,
} from '../../classifier/classify.ts';
import {
  existingReadinessLabel,
  reconcileReadiness,
  type ReconcileDeps,
} from '../classifier-reconcile.ts';
import { InMemoryJournal } from '../state-journal.ts';
import { TerminalTransitions } from '../providers/issue-provider.ts';
import { GhStub } from './gh-stub.ts';
import { type WorkItem } from '../types.ts';

// A task that needs a host credential the container cannot provide.
const HOST_CRED_TASK: TaskCapabilitySignals = { requiredCredentials: ['host-keychain'] };

test('T12: the SAME task is AFK under worktree and HITL under sandcastle (runner-aware)', () => {
  const wt = classify(HOST_CRED_TASK, 'worktree');
  const sc = classify(HOST_CRED_TASK, 'sandcastle');
  assert.equal(wt.readiness, 'ready-for-agent');
  assert.equal(sc.readiness, 'ready-for-human');
  assert.deepEqual(sc.trippedGates, ['unobtainable-credential']);
});

test('T12: each of the four gates independently forces HITL', () => {
  assert.equal(classify({ requiresOutOfBandAction: true }, 'worktree').readiness, 'ready-for-human');
  assert.equal(
    classify({ requiresUnspecifiedProductJudgment: true }, 'worktree').readiness,
    'ready-for-human',
  );
  assert.equal(
    classify({ requiresIrreversibleProdAction: true }, 'worktree').readiness,
    'ready-for-human',
  );
  // A worktree task needing only host-providable creds + no other gate ⇒ AFK.
  assert.equal(classify({ requiredCredentials: ['host-gh'] }, 'worktree').readiness, 'ready-for-agent');
});

test('T12: a no-need task is AFK under either runner', () => {
  assert.equal(classify({}, 'worktree').readiness, 'ready-for-agent');
  assert.equal(classify({}, 'sandcastle').readiness, 'ready-for-agent');
});

test('T12: defaultRunnerCapabilities — worktree reaches host secrets, sandcastle none', () => {
  assert.ok(defaultRunnerCapabilities('worktree').providableCredentials.length > 0);
  assert.equal(defaultRunnerCapabilities('sandcastle').providableCredentials.length, 0);
});

test('T12 reconcile: a ready-for-agent issue tripping gate (1) under sandcastle is re-labeled ready-for-human + logged', async () => {
  // Issue #5 pre-labeled ready-for-agent (the /to-issues hint), runner sandcastle,
  // task needs a host credential the container cannot provide ⇒ gate (1) trips.
  const gh = new GhStub([{ number: 5, labels: ['ready-for-agent'], state: 'open' }]);
  const transitions = new TerminalTransitions(gh, new InMemoryJournal(), 'run-1');
  const logged: string[] = [];
  const deps: ReconcileDeps = { transitions, log: (l) => logged.push(l) };

  const item: WorkItem = { id: 'issue-5', issueNumber: 5, runner: 'sandcastle' };
  const existing = existingReadinessLabel(['ready-for-agent']);
  const out = await reconcileReadiness(item, HOST_CRED_TASK, existing, deps);

  assert.equal(out.relabeled, true);
  assert.equal(out.finalLabel, 'ready-for-human');
  assert.equal(logged.length, 1);
  assert.match(logged[0] ?? '', /ready-for-human/);
  // The issue now carries ready-for-human (added by relabelItem).
  assert.ok(gh.peek(5)?.labels.includes('ready-for-human'));
});

test('T12 reconcile: an agreeing label is a no-op (no re-label, no log)', async () => {
  const gh = new GhStub([{ number: 6, labels: ['ready-for-agent'], state: 'open' }]);
  const transitions = new TerminalTransitions(gh, new InMemoryJournal(), 'run-1');
  const logged: string[] = [];
  const deps: ReconcileDeps = { transitions, log: (l) => logged.push(l) };

  // worktree item needing only host creds ⇒ AFK ⇒ agrees with ready-for-agent.
  const item: WorkItem = { id: 'issue-6', issueNumber: 6, runner: 'worktree' };
  const out = await reconcileReadiness(item, HOST_CRED_TASK, 'ready-for-agent', deps);
  assert.equal(out.relabeled, false);
  assert.equal(logged.length, 0);
});
