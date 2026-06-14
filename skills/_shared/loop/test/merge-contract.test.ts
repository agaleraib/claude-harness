// Unit tests for the concurrency + atomic-merge contract (Wave 19, Task 8a).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  acquireRunLock,
  type LockInfo,
  type LockStore,
  releaseRunLock,
  RunLockHeldError,
} from '../merge/run-lock.ts';
import {
  type ClaimStore,
  type DownstreamEffects,
  HeadRacedError,
  MergeContract,
  type MergeGit,
} from '../merge/merge-contract.ts';
import { InMemoryJournal } from '../state-journal.ts';
import { type WorkItem } from '../types.ts';

// --- run lock stubs ---

class MemLockStore implements LockStore {
  private info: LockInfo | null = null;
  constructor(seed: LockInfo | null = null) {
    this.info = seed;
  }
  async read(): Promise<LockInfo | null> {
    return this.info === null ? null : { ...this.info };
  }
  async create(info: LockInfo): Promise<void> {
    if (this.info !== null) {
      throw new Error('lock exists');
    }
    this.info = { ...info };
  }
  async overwrite(info: LockInfo): Promise<void> {
    this.info = { ...info };
  }
  async remove(): Promise<void> {
    this.info = null;
  }
}

// --- claim store stub ---

class MemClaimStore implements ClaimStore {
  readonly claims = new Map<string, string>();
  async tryClaim(itemId: string, runId: string): Promise<boolean> {
    const cur = this.claims.get(itemId);
    if (cur !== undefined && cur !== runId) {
      return false;
    }
    this.claims.set(itemId, runId);
    return true;
  }
  async holder(itemId: string): Promise<string | null> {
    return this.claims.get(itemId) ?? null;
  }
  async release(itemId: string): Promise<void> {
    this.claims.delete(itemId);
  }
}

// --- git stub: scriptable head + integration + precondition merge ---

interface GitScript {
  head: string;
  /** head value to present at the CAS check, to simulate a race (optional). */
  headAtMerge?: string;
  mergeSha?: string;
  rebaseThrows?: boolean;
}

class StubGit implements MergeGit {
  readonly calls: string[] = [];
  private readonly s: GitScript;
  constructor(s: GitScript) {
    this.s = s;
  }
  async headSha(): Promise<string> {
    this.calls.push('headSha');
    return this.s.head;
  }
  async rebaseOntoHead(itemId: string, baseSha: string): Promise<void> {
    this.calls.push(`rebase(${itemId},${baseSha})`);
    if (this.s.rebaseThrows === true) {
      throw new Error('rebase conflict');
    }
  }
  async mergeCandidateSha(itemId: string): Promise<string> {
    this.calls.push(`candidate(${itemId})`);
    return `cand-${itemId}`;
  }
  async mergeFfOnly(itemId: string, expectedBaseSha: string): Promise<string> {
    this.calls.push(`mergeFfOnly(${itemId},${expectedBaseSha})`);
    const headNow = this.s.headAtMerge ?? this.s.head;
    if (headNow !== expectedBaseSha) {
      throw new HeadRacedError(itemId, expectedBaseSha, headNow);
    }
    return this.s.mergeSha ?? `merge-${itemId}`;
  }
}

class RecordingDownstream implements DownstreamEffects {
  readonly applied: { itemId: string; mergeSha: string }[] = [];
  async apply(itemId: string, mergeSha: string): Promise<void> {
    this.applied.push({ itemId, mergeSha });
  }
}

const ITEM: WorkItem = { id: 'A', runner: 'sandcastle' };
const RUN = 'run1';

function contract(opts: {
  git: MergeGit;
  claims?: ClaimStore;
  outbox?: InMemoryJournal;
  finalGateGreen?: boolean;
  downstream?: RecordingDownstream;
  runId?: string;
}): {
  c: MergeContract;
  outbox: InMemoryJournal;
  downstream: RecordingDownstream;
  claims: ClaimStore;
} {
  const outbox = opts.outbox ?? new InMemoryJournal();
  const downstream = opts.downstream ?? new RecordingDownstream();
  const claims = opts.claims ?? new MemClaimStore();
  const c = new MergeContract({
    git: opts.git,
    claims,
    outbox,
    finalGate: async () => opts.finalGateGreen ?? true,
    downstream,
    runId: opts.runId ?? RUN,
  });
  return { c, outbox, downstream, claims };
}

// --- (a) run lock ---

test('T8a(a): a held LIVE lock → second invocation refuses and names the holder', async () => {
  const holder: LockInfo = { runId: 'other', pid: 4242, timestamp: '2026-06-14T00:00:00Z' };
  const store = new MemLockStore(holder);
  await assert.rejects(
    acquireRunLock(store, () => true, { runId: RUN, pid: 1, now: () => 'now' }),
    (err: unknown) => {
      assert.ok(err instanceof RunLockHeldError);
      assert.equal(err.holder.runId, 'other');
      assert.match(err.message, /run "other"/);
      assert.match(err.message, /pid 4242/);
      return true;
    },
  );
});

test('T8a(a): a STALE lock (dead PID) is reclaimed with a warning', async () => {
  const stale: LockInfo = { runId: 'dead', pid: 9999, timestamp: 't' };
  const store = new MemLockStore(stale);
  const res = await acquireRunLock(store, () => false, { runId: RUN, pid: 7, now: () => 'now' });
  assert.equal(res.reclaimedStale, true);
  assert.match(res.warning ?? '', /reclaimed a STALE run lock/);
  assert.equal((await store.read())?.runId, RUN);
});

test('T8a(a): absent lock → fresh acquire; release removes it (crash-trap safe / idempotent)', async () => {
  const store = new MemLockStore(null);
  const res = await acquireRunLock(store, () => true, { runId: RUN, pid: 1, now: () => 'now' });
  assert.equal(res.reclaimedStale, false);
  assert.ok((await store.read()) !== null);
  await releaseRunLock(store);
  await releaseRunLock(store); // idempotent
  assert.equal(await store.read(), null);
});

// --- (b) per-item claim ---

test('T8a(b): two instances contending for the same item → exactly one claim wins', async () => {
  // Shared claim store = same repo. r1's merge holds the claim until r1 releases it;
  // a concurrent r2 reaching attemptMerge before r1 releases must lose the claim.
  // Model the interleave with a git seam that lets r2 contend during r1's merge.
  const claims = new MemClaimStore();

  // r2 contends the instant r1 acquires its claim, before r1 releases.
  const c2Result: { status: string }[] = [];
  const r2Git = new StubGit({ head: 'h0' });
  const c2 = new MergeContract({
    git: r2Git,
    claims,
    outbox: new InMemoryJournal(),
    finalGate: async () => true,
    downstream: new RecordingDownstream(),
    runId: 'r2',
  });

  const racingGate = async (): Promise<boolean> => {
    // While r1 is mid-merge (claim held), r2 attempts and must lose.
    c2Result.push(await c2.attemptMerge(ITEM));
    return true;
  };
  const c1 = new MergeContract({
    git: new StubGit({ head: 'h0' }),
    claims,
    outbox: new InMemoryJournal(),
    finalGate: racingGate,
    downstream: new RecordingDownstream(),
    runId: 'r1',
  });

  const o1 = await c1.attemptMerge(ITEM);
  assert.equal(o1.status, 'merged', 'r1 (claim holder) merges');
  assert.equal(c2Result.length, 1);
  assert.equal(c2Result[0]?.status, 'claim-lost', 'r2 contending mid-merge loses the claim');
});

// --- (c) stale head → re-integrate, rerun gate, ff-only with precondition; race → abort ---

test('T8a(c): happy path integrates head, reruns the gate on the merge commit, merges ff-only', async () => {
  const git = new StubGit({ head: 'h0' });
  const { c, outbox } = contract({ git });
  const out = await c.attemptMerge(ITEM);
  assert.equal(out.status, 'merged');

  // Ordering: rebase BEFORE candidate BEFORE mergeFfOnly.
  const order = git.calls;
  assert.ok(order.indexOf('rebase(A,h0)') < order.indexOf('candidate(A)'));
  assert.ok(order.indexOf('candidate(A)') < order.indexOf('mergeFfOnly(A,h0)'));

  // Outbox carries intent then merge SHA then downstreamDone.
  const recs = await outbox.readAll();
  assert.ok(recs.some((r) => r['mergeSha'] === undefined && r['baseSha'] === 'h0'), 'intent first');
  assert.ok(recs.some((r) => typeof r['mergeSha'] === 'string'), 'merge SHA stamped');
  assert.ok(recs.some((r) => r['downstreamDone'] === true), 'downstream stamped');
});

test('T8a(c): head races during the merge (CAS fails) → abort head-raced + re-queue, no merge', async () => {
  // Base recorded as h0, but at merge time head is h1 → precondition fails.
  const git = new StubGit({ head: 'h0', headAtMerge: 'h1' });
  const { c, downstream, claims } = contract({ git });
  const out = await c.attemptMerge(ITEM);
  assert.deepEqual(out, { status: 'head-raced', requeue: true });
  assert.equal(downstream.applied.length, 0, 'no downstream effects on a raced merge');
  assert.equal(await claims.holder(ITEM.id), null, 'claim released for re-queue');
});

test('T8a(c): a green earlier gate is not enough — the final gate reruns on the merge commit and can block', async () => {
  const git = new StubGit({ head: 'h0' });
  const { c, downstream } = contract({ git, finalGateGreen: false });
  const out = await c.attemptMerge(ITEM);
  assert.equal(out.status, 'gate-failed-on-merge-commit');
  assert.ok(!git.calls.some((x) => x.startsWith('mergeFfOnly')), 'never merges on a red final gate');
  assert.equal(downstream.applied.length, 0);
});

// --- (d) kill mid-gate → claim detected, not double-merged ---

test('T8a(d): kill mid-gate leaves a claim + intent; reconcile discards the unmerged intent and re-queues (no double-merge)', async () => {
  const outbox = new InMemoryJournal();
  const claims = new MemClaimStore();
  // Simulate "killed after intent, before merge": claim held, intent in outbox, no mergeSha.
  await claims.tryClaim(ITEM.id, RUN);
  await outbox.append({ kind: 'merge', itemId: ITEM.id, runId: RUN, baseSha: 'h0' });

  const git = new StubGit({ head: 'h0' });
  const { c, downstream } = contract({ git, outbox, claims });
  await c.reconcile();

  assert.equal(downstream.applied.length, 0, 'an unmerged intent is NOT completed (no double-merge)');
  assert.equal(await claims.holder(ITEM.id), null, 're-queued: claim released');
});

// --- (e1/e2/e3) startup reconciliation idempotency ---

test('T8a(e1): merged-but-unmarked → reconcile finishes downstream effects idempotently', async () => {
  const outbox = new InMemoryJournal();
  // Merge landed (mergeSha present) but downstream not yet applied.
  await outbox.append({ kind: 'merge', itemId: ITEM.id, runId: RUN, baseSha: 'h0', mergeSha: 'm1' });

  const { c, downstream } = contract({ git: new StubGit({ head: 'm1' }), outbox });
  await c.reconcile();
  assert.deepEqual(downstream.applied, [{ itemId: ITEM.id, mergeSha: 'm1' }]);

  // Running reconciliation AGAIN produces no additional mutations.
  await c.reconcile();
  assert.equal(downstream.applied.length, 1, 'idempotent: no second downstream apply');
});

test('T8a(e2): intent-but-unmerged → reconcile discards intent + re-queues', async () => {
  const outbox = new InMemoryJournal();
  const claims = new MemClaimStore();
  await claims.tryClaim(ITEM.id, RUN);
  await outbox.append({ kind: 'merge', itemId: ITEM.id, runId: RUN, baseSha: 'h0' });

  const { c, downstream } = contract({ git: new StubGit({ head: 'h0' }), outbox, claims });
  await c.reconcile();
  assert.equal(downstream.applied.length, 0);
  assert.equal(await claims.holder(ITEM.id), null);

  // Idempotent second pass.
  await c.reconcile();
  assert.equal(downstream.applied.length, 0);
});

test('T8a(e3): marked-but-unticked (downstream half-done) → reconcile finishes the board/receipt step idempotently', async () => {
  const outbox = new InMemoryJournal();
  // mergeSha present, downstreamDone NOT stamped → treated as needing repair.
  await outbox.append({ kind: 'merge', itemId: ITEM.id, runId: RUN, baseSha: 'h0', mergeSha: 'm9' });

  const { c, downstream } = contract({ git: new StubGit({ head: 'm9' }), outbox });
  await c.reconcile();
  await c.reconcile();
  assert.deepEqual(downstream.applied, [{ itemId: ITEM.id, mergeSha: 'm9' }], 'applied once, idempotent');

  // After repair, the latest record is stamped downstreamDone.
  const recs = await outbox.readAll();
  assert.ok(recs.some((r) => r['downstreamDone'] === true));
});

test('T8a: a fully-completed item (downstreamDone) needs no repair', async () => {
  const outbox = new InMemoryJournal();
  await outbox.append({
    kind: 'merge',
    itemId: ITEM.id,
    runId: RUN,
    baseSha: 'h0',
    mergeSha: 'm1',
    downstreamDone: true,
  });
  const { c, downstream } = contract({ git: new StubGit({ head: 'm1' }), outbox });
  await c.reconcile();
  assert.equal(downstream.applied.length, 0, 'nothing to repair');
});
