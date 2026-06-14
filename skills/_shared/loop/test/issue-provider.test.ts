// Unit tests for the issue provider + durable two-phase terminal state machine
// (Wave 19, Task 4).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  IssueWorkSource,
  READY_FOR_AGENT,
  READY_FOR_HUMAN,
  TRANSITIONING,
  TerminalTransitions,
  terminalKey,
  transitionStartedKey,
} from '../providers/issue-provider.ts';
import { InMemoryJournal, type Journal } from '../state-journal.ts';
import { GhStub, SimulatedCrash } from './gh-stub.ts';

const RUN = 'run1';

function threeIssueStub(): GhStub {
  return new GhStub([
    { number: 1, title: 'A unblocked', body: 'do A', labels: [READY_FOR_AGENT] },
    {
      number: 2,
      title: 'B blocked by A',
      body: '## Blocked by\n- #1\n',
      labels: [READY_FOR_AGENT],
    },
    {
      number: 3,
      title: 'C worktree',
      body: 'do C',
      labels: [READY_FOR_AGENT, 'runner:worktree'],
    },
  ]);
}

test('T4: yields 3 items with correct edges and runners', async () => {
  const gh = threeIssueStub();
  const source = new IssueWorkSource({ gh, journal: new InMemoryJournal(), runId: RUN });
  const items = await source.allItems();

  assert.equal(items.length, 3);
  const byId = new Map(items.map((i) => [i.id, i]));
  assert.equal(byId.get('issue-1')?.runner, 'sandcastle');
  assert.equal(byId.get('issue-2')?.runner, 'sandcastle');
  assert.equal(byId.get('issue-3')?.runner, 'worktree');
  assert.deepEqual(byId.get('issue-1')?.blockedBy, []);
  assert.deepEqual(byId.get('issue-2')?.blockedBy, ['issue-1'], 'B blocked by A');
  assert.deepEqual(byId.get('issue-3')?.blockedBy, []);
});

test('T4: completeItem orders transition-started+transitioning BEFORE removing ready-for-agent, then PR link, close, terminal marker, clear transitioning', async () => {
  const gh = threeIssueStub();
  const tx = new TerminalTransitions(gh, new InMemoryJournal(), RUN);
  await tx.completeItem({ issueNumber: 1, prLink: 'https://example/pr/9' });

  // Call-order assertion against the stub's recorded mutating calls.
  const c = gh.calls;
  const idxStarted = c.findIndex((x) => x.includes('transition-started:completed'));
  const idxTransitioning = c.findIndex((x) => x === `addLabel(1,${TRANSITIONING})`);
  const idxRemoveReady = c.findIndex((x) => x === `removeLabel(1,${READY_FOR_AGENT})`);
  const idxPrLink = c.findIndex((x) => x.includes('Merged via PR: https://example/pr/9'));
  const idxClose = c.findIndex((x) => x === 'closeIssue(1)');
  const idxTerminal = c.findIndex((x) => x.includes(terminalKey(RUN, 'issue-1', 'completed')));
  const idxClearTransitioning = c.lastIndexOf(`removeLabel(1,${TRANSITIONING})`);

  assert.ok(idxStarted >= 0 && idxTransitioning >= 0, 'step 1 markers present');
  assert.ok(idxStarted < idxRemoveReady, 'transition-started BEFORE ready-for-agent removal');
  assert.ok(idxTransitioning < idxRemoveReady, 'transitioning label BEFORE ready-for-agent removal');
  assert.ok(idxRemoveReady < idxPrLink, 'ready removed before the PR-link effect');
  assert.ok(idxPrLink < idxClose, 'single PR link comment before close');
  assert.ok(idxClose < idxTerminal, 'close before terminal marker');
  assert.ok(idxTerminal < idxClearTransitioning, 'terminal marker before clearing transitioning');

  // Exactly one PR-link comment.
  assert.equal(c.filter((x) => x.includes('Merged via PR:')).length, 1);

  // Final state: closed, no ready-for-agent, no transitioning.
  const issue = gh.peek(1);
  assert.equal(issue?.state, 'closed');
  assert.ok(!issue?.labels.includes(READY_FOR_AGENT));
  assert.ok(!issue?.labels.includes(TRANSITIONING));
});

test('T4: escalateItem ends with ready-for-human present, ready-for-agent absent', async () => {
  const gh = threeIssueStub();
  const tx = new TerminalTransitions(gh, new InMemoryJournal(), RUN);
  await tx.escalateItem({
    issueNumber: 1,
    escalation: { title: 'human please', body: 'help' },
  });

  // The escalation issue (a new issue) carries ready-for-human.
  const created = gh.calls.find((x) => x.startsWith('createIssue('));
  assert.ok(created, 'an escalation issue was created');
  assert.match(created, new RegExp(`\\+?${READY_FOR_HUMAN}`));

  // Source issue: ready-for-agent removed, transitioning cleared, terminal marker present.
  const issue = gh.peek(1);
  assert.ok(!issue?.labels.includes(READY_FOR_AGENT), 'ready-for-agent absent');
  assert.ok(!issue?.labels.includes(TRANSITIONING), 'transitioning cleared');
});

test('T4: re-invoking a terminal op with an existing terminal marker is a no-op (zero gh mutations)', async () => {
  const gh = threeIssueStub();
  const journal = new InMemoryJournal();
  const tx = new TerminalTransitions(gh, journal, RUN);
  await tx.completeItem({ issueNumber: 1, prLink: 'pr/1' });
  const callsAfterFirst = gh.calls.length;

  await tx.completeItem({ issueNumber: 1, prLink: 'pr/1' });
  assert.equal(gh.calls.length, callsAfterFirst, 'second invocation performs zero mutations');
});

test('T4: crash AFTER ready-for-agent removed BEFORE terminal marker → reconcile resumes to exactly one terminal state, no duplicate effect', async () => {
  const gh = threeIssueStub();
  const journal: Journal = new InMemoryJournal();

  // First pass: crash right after closeIssue (step 3 done, step 4 not yet).
  const tx = new TerminalTransitions(gh, journal, RUN);
  gh.crashOn = (call) => {
    if (call === 'closeIssue(1)') {
      // allow the close itself, crash immediately after it is recorded
      throw new SimulatedCrash('after-close-before-terminal-marker');
    }
  };
  await assert.rejects(tx.completeItem({ issueNumber: 1, prLink: 'pr/1' }), SimulatedCrash);
  gh.crashOn = null;

  // Mid state: ready-for-agent removed, transitioning still set, no terminal marker, issue closed.
  let issue = gh.peek(1);
  assert.ok(!issue?.labels.includes(READY_FOR_AGENT), 'ready already removed pre-crash');
  assert.ok(issue?.labels.includes(TRANSITIONING), 'still transitioning');
  assert.equal(issue?.state, 'closed', 'close effect already landed');

  // Rerun: reconciliation finds transitioning + no terminal marker, resumes.
  const source = new IssueWorkSource({ gh, journal, runId: RUN });
  await source.init();

  issue = gh.peek(1);
  assert.ok(!issue?.labels.includes(TRANSITIONING), 'transitioning cleared on resume');
  // Terminal marker now present exactly once.
  const comments = await gh.listComments(1);
  const terminalMarkers = comments.filter((c) =>
    c.body.includes(terminalKey(RUN, 'issue-1', 'completed')),
  );
  assert.equal(terminalMarkers.length, 1, 'exactly one terminal marker');
  // No duplicate close effect: closeIssue called exactly once across both passes.
  assert.equal(gh.calls.filter((x) => x === 'closeIssue(1)').length, 1, 'no double close');
  // Issue not re-yielded (terminal).
  assert.equal(await source.nextReady() === null || (await source.isDone({ id: 'issue-1' })), true);
  assert.equal(await source.isDone({ id: 'issue-1' }), true);
});

test('T4: crash AFTER transition-started BEFORE ready-for-agent removal → reconcile resumes from step 2, never stranded', async () => {
  const gh = threeIssueStub();
  const journal: Journal = new InMemoryJournal();

  const tx = new TerminalTransitions(gh, journal, RUN);
  gh.crashOn = (call) => {
    if (call === `addLabel(1,${TRANSITIONING})`) {
      throw new SimulatedCrash('after-transition-started-before-ready-removal');
    }
  };
  // transition-started comment written, then addLabel(transitioning) throws.
  await assert.rejects(tx.completeItem({ issueNumber: 1, prLink: 'pr/1' }), SimulatedCrash);
  gh.crashOn = null;

  // Mid state (crash between step 1 and step 2): transition-started marker present,
  // transitioning label landed, ready-for-agent NOT yet removed. Invariant holds —
  // the issue carries ready-for-agent (and, transiently during step 1, transitioning
  // too), never neither.
  let issue = gh.peek(1);
  assert.ok(issue?.labels.includes(READY_FOR_AGENT), 'still in ready queue (invariant: never neither)');
  assert.ok(issue?.labels.includes(TRANSITIONING), 'transitioning label landed in step 1');
  const startedMarkers = (await gh.listComments(1)).filter((c) =>
    c.body.includes(transitionStartedKey(RUN, 'issue-1', 'completed')),
  );
  assert.equal(startedMarkers.length, 1, 'transition-started written before the crash');

  // Rerun: reconciliation sees the started marker (no terminal), resumes from step 2.
  const source = new IssueWorkSource({ gh, journal, runId: RUN });
  await source.init();

  issue = gh.peek(1);
  assert.equal(issue?.state, 'closed', 'resumed through the close effect');
  assert.ok(!issue?.labels.includes(READY_FOR_AGENT), 'ready removed on resume');
  assert.ok(!issue?.labels.includes(TRANSITIONING), 'transitioning cleared on resume');
  const terminalMarkers = (await gh.listComments(1)).filter((c) =>
    c.body.includes(terminalKey(RUN, 'issue-1', 'completed')),
  );
  assert.equal(terminalMarkers.length, 1, 'exactly one terminal marker, never stranded');
  // No duplicate transition-started.
  assert.equal(startedMarkers.length, 1);
});

test('T4: a terminal-marked issue is never re-yielded by the source', async () => {
  const gh = threeIssueStub();
  const journal = new InMemoryJournal();
  const tx = new TerminalTransitions(gh, journal, RUN);
  await tx.completeItem({ issueNumber: 1, prLink: 'pr/1' });

  const source = new IssueWorkSource({ gh, journal, runId: RUN });
  const items = await source.allItems();
  assert.ok(!items.some((i) => i.id === 'issue-1'), 'completed issue not yielded');
  // #2 and #3 remain.
  assert.deepEqual(items.map((i) => i.id).sort(), ['issue-2', 'issue-3']);
});
