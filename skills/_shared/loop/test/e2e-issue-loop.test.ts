// Deterministic stubbed-seam e2e harness for the issue loop (Wave 20, Task 18).
//
// SCAFFOLDING ONLY — the in-CI, reproducible proxy for the live test. It exercises the
// full issue-loop path against stubbed GhClient / git / claim / gate seams:
//   - issue #2 (ready-for-agent, unblocked) drains and MERGES via the mechanical gate;
//   - issue #3 (blocked-by-#2) DEFERS until #2 is MERGED, then becomes ready;
//   - the run summary emits the AFK-merged / HITL-waiting / blocked-on-human metric;
//   - NO denylist violation occurs (the agent's commands pass the denylist matcher);
//   - NO red merge lands (the final gate is rerun on the merge commit; red ⇒ no merge).
//
// The LIVE run against an external repo with live `gh` + the global denylist hook
// install are Human-only TODOs (see the wave summary) — NOT exercised here.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GhStub } from './gh-stub.ts';
import {
  IssueWorkSource,
  READY_FOR_AGENT,
  issueId,
} from '../providers/issue-provider.ts';
import { InMemoryJournal } from '../state-journal.ts';
import { scheduleRun, type MergedPredicate } from '../scheduler/dag.ts';
import {
  MergeContract,
  type ClaimStore,
  type MergeGit,
} from '../merge/merge-contract.ts';
import {
  PostMergeEffects,
  perItemKey,
  type PlanBoard,
  type PostMergeReceipt,
  type ReceiptSink,
} from '../post-merge.ts';
import { RunSummaryBuilder } from '../termination.ts';
import { evaluateShellCommand, type DenylistContext } from '../safety/denylist.ts';
import { type WorkItem } from '../types.ts';

const RUN = 'e2e-run-1';
const WT_ROOT = '/work/.claude/worktrees/agent-e2e';

/** The fixture: #2 ready+unblocked (sandcastle), #3 blocked by #2 (sandcastle). */
function fixtureStub(): GhStub {
  return new GhStub([
    { number: 2, title: 'Implement feature X', body: 'do X', labels: [READY_FOR_AGENT], state: 'open' },
    {
      number: 3,
      title: 'Build on X',
      body: '## Blocked by\n- #2\n',
      labels: [READY_FOR_AGENT],
      state: 'open',
    },
  ]);
}

/** A merge-git stub that produces a deterministic merge SHA and never races. */
class StubMergeGit implements MergeGit {
  async headSha(): Promise<string> {
    return 'head-0';
  }
  async rebaseOntoHead(): Promise<void> {}
  async mergeCandidateSha(itemId: string): Promise<string> {
    return `cand-${itemId}`;
  }
  async mergeFfOnly(itemId: string): Promise<string> {
    return `merge-${itemId}`;
  }
}

class StubClaims implements ClaimStore {
  private readonly held = new Map<string, string>();
  async tryClaim(itemId: string, runId: string): Promise<boolean> {
    if (this.held.has(itemId)) {
      return false;
    }
    this.held.set(itemId, runId);
    return true;
  }
  async holder(itemId: string): Promise<string | null> {
    return this.held.get(itemId) ?? null;
  }
  async release(itemId: string): Promise<void> {
    this.held.delete(itemId);
  }
}

class StubBoard implements PlanBoard {
  readonly ticked = new Map<string, string>();
  async isTicked(itemId: string): Promise<boolean> {
    return this.ticked.has(itemId);
  }
  async tickAndShip(itemId: string, mergeSha: string): Promise<void> {
    this.ticked.set(itemId, mergeSha);
  }
}

class StubReceipts implements ReceiptSink {
  readonly written = new Map<string, PostMergeReceipt>();
  async has(key: string): Promise<boolean> {
    return this.written.has(key);
  }
  async write(receipt: PostMergeReceipt): Promise<void> {
    this.written.set(receipt.idempotencyKey, receipt);
  }
}

test('T18 e2e: #2 merges via the mechanical gate, #3 defers until #2 MERGED, summary emits the metric', async () => {
  const gh = fixtureStub();
  const source = new IssueWorkSource({ gh, journal: new InMemoryJournal(), runId: RUN });
  const items: WorkItem[] = [...(await source.allItems())];
  assert.equal(items.length, 2);

  const summary = new RunSummaryBuilder();

  // --- PASS 1: nothing merged yet. #2 ready (no blockers); #3 blocked by un-merged #2. ---
  const merged = new Set<string>();
  const isMerged: MergedPredicate = (id) => merged.has(id);
  const sched1 = scheduleRun(items, isMerged);

  // #2 is an AFK auto-merge candidate; #3 is blocked-on-afk (its only blocker, #2,
  // is an un-merged AFK item — so it is NOT under a HITL ancestor, it just waits).
  assert.deepEqual(
    sched1.attemptAfk.map((s) => s.item.id),
    [issueId(2)],
  );
  assert.deepEqual(
    sched1.blockedOnAfk.map((s) => s.item.id),
    [issueId(3)],
  );
  // No HITL/worktree items in this fixture ⇒ nothing awaiting human, nothing blocked-on-human.
  assert.equal(sched1.openPrAwaitingHuman.length, 0);
  assert.equal(sched1.blockedOnHuman.length, 0);

  // The readiness rule: #3 must NOT be attempted while #2 is un-merged.
  assert.equal(sched1.attemptAfk.some((s) => s.item.id === issueId(3)), false);

  // --- Mechanical gate for #2: NO red merge, NO denylist violation. ---
  const board = new StubBoard();
  const receipts = new StubReceipts();
  const post = new PostMergeEffects({
    board,
    receipts,
    journal: new InMemoryJournal(),
    runId: RUN,
  });

  // Simulate the agent's commands passing the denylist (no catastrophic command).
  const denyCtx: DenylistContext = { worktreeRoot: WT_ROOT, repo: { loopDenylist: [] } };
  const agentCommands = ['npm test', 'git add src/x.ts', 'git commit -m "feat: X"'];
  for (const cmd of agentCommands) {
    assert.equal(evaluateShellCommand(cmd, denyCtx).action, 'allow', `denylist must allow: ${cmd}`);
  }

  // Final gate reruns GREEN on the exact merge commit ⇒ a merge lands (no red merge).
  let finalGateRuns = 0;
  const contract = new MergeContract({
    git: new StubMergeGit(),
    claims: new StubClaims(),
    outbox: new InMemoryJournal(),
    finalGate: async () => {
      finalGateRuns += 1;
      return true; // green on the merge commit
    },
    downstream: post,
    runId: RUN,
  });

  const item2 = items.find((i) => i.id === issueId(2))!;
  const outcome = await contract.attemptMerge(item2);
  assert.equal(outcome.status, 'merged');
  if (outcome.status === 'merged') {
    assert.equal(outcome.mergeSha, `merge-${issueId(2)}`);
    summary.recordMerged(item2.id);
    merged.add(item2.id);
  }
  // The final gate ran on the merge commit (step 5) — this is what prevents a red merge.
  assert.equal(finalGateRuns, 1);
  // Post-merge effects ran: board ticked + receipt written, keyed by the merge SHA.
  assert.equal(board.ticked.get(issueId(2)), `merge-${issueId(2)}`);
  assert.ok(await receipts.has(perItemKey(issueId(2), `merge-${issueId(2)}`)));

  // #3 deferred this pass (its blocker just merged but the readiness re-eval is next pass).
  summary.recordDeferred();

  // --- PASS 2: #2 is now MERGED. #3 becomes a ready AFK candidate. ---
  const sched2 = scheduleRun(items, isMerged);
  // #2 is excluded from the schedule (merged); #3 is now attempt-afk.
  assert.equal(sched2.attemptAfk.some((s) => s.item.id === issueId(2)), false);
  assert.deepEqual(
    sched2.attemptAfk.map((s) => s.item.id),
    [issueId(3)],
  );
  assert.equal(sched2.blockedOnAfk.length, 0);

  // Merge #3 the same way (green gate, no denylist violation).
  const contract3 = new MergeContract({
    git: new StubMergeGit(),
    claims: new StubClaims(),
    outbox: new InMemoryJournal(),
    finalGate: async () => true,
    downstream: post,
    runId: RUN,
  });
  const item3 = items.find((i) => i.id === issueId(3))!;
  const out3 = await contract3.attemptMerge(item3);
  assert.equal(out3.status, 'merged');
  if (out3.status === 'merged') {
    summary.recordMerged(item3.id);
    merged.add(item3.id);
  }

  // --- The run summary emits the AFK-merged / HITL-waiting / blocked-on-human metric. ---
  const report = summary.build('drained');
  assert.equal(report.mergedAfk, 2); // #2 + #3 merged AFK
  assert.equal(report.openedAwaitingHuman, 0); // no worktree/HITL items in this fixture
  assert.equal(report.deferredBlockedOnHuman, 1); // #3 deferred one pass
  assert.equal(report.stopReason, 'drained');
  assert.deepEqual(report.visited, [issueId(2), issueId(3)]);
});

test('T18 e2e: a denylist violation in the loop path is caught (negative control)', () => {
  // A catastrophic command the agent might emit MUST be blocked — the harness asserts
  // the denylist would have prevented it (so "no denylist violation occurs" is a real
  // guarantee, not a vacuous one).
  const denyCtx: DenylistContext = { worktreeRoot: WT_ROOT, repo: { loopDenylist: [] } };
  assert.equal(evaluateShellCommand('rm -rf /', denyCtx).action, 'block');
  assert.equal(evaluateShellCommand('git push --force origin master', denyCtx).action, 'block');
});

test('T18 e2e: a RED final gate on the merge commit prevents the merge (no red merge lands)', async () => {
  const gh = fixtureStub();
  const source = new IssueWorkSource({ gh, journal: new InMemoryJournal(), runId: RUN });
  const items = await source.allItems();
  const item2 = items.find((i) => i.id === issueId(2))!;

  const board = new StubBoard();
  const receipts = new StubReceipts();
  const post = new PostMergeEffects({
    board,
    receipts,
    journal: new InMemoryJournal(),
    runId: RUN,
  });

  const contract = new MergeContract({
    git: new StubMergeGit(),
    claims: new StubClaims(),
    outbox: new InMemoryJournal(),
    finalGate: async () => false, // RED on the merge commit
    downstream: post,
    runId: RUN,
  });

  const outcome = await contract.attemptMerge(item2);
  assert.equal(outcome.status, 'gate-failed-on-merge-commit');
  // NO merge landed: the board is untouched and no receipt was written.
  assert.equal(board.ticked.size, 0);
  assert.equal(receipts.written.size, 0);
});
