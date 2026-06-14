// Tests for post-merge downstream effects (Wave 20, Task 13).
//
// Verify: after a fixture AFK wave merges, its plan.md row is ticked + moved to
// Recently Shipped, and a per-item receipt + a run-summary receipt exist with valid
// idempotency keys. Re-running is a no-op on the already-ticked row. A merged-but-
// unticked fixture (merge SHA in the outbox, row still `[ ]`) is repaired to ticked +
// receipt on the next reconciliation pass, idempotently.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PostMergeEffects,
  perItemKey,
  runSummaryKey,
  type PlanBoard,
  type PostMergeReceipt,
  type ReceiptSink,
} from '../post-merge.ts';
import { InMemoryJournal } from '../state-journal.ts';
import {
  MergeContract,
  type ClaimStore,
  type MergeGit,
} from '../merge/merge-contract.ts';
import { type WorkItem } from '../types.ts';

/** In-memory plan board recording ticks. */
class StubBoard implements PlanBoard {
  readonly ticked = new Map<string, string>(); // itemId → mergeSha
  tickCalls = 0;
  async isTicked(itemId: string): Promise<boolean> {
    return this.ticked.has(itemId);
  }
  async tickAndShip(itemId: string, mergeSha: string): Promise<void> {
    this.tickCalls += 1;
    this.ticked.set(itemId, mergeSha);
  }
}

/** In-memory receipt sink keyed by idempotency key. */
class StubReceipts implements ReceiptSink {
  readonly written = new Map<string, PostMergeReceipt>();
  async has(key: string): Promise<boolean> {
    return this.written.has(key);
  }
  async write(receipt: PostMergeReceipt): Promise<void> {
    if (this.written.has(receipt.idempotencyKey)) {
      throw new Error(`double-write of receipt ${receipt.idempotencyKey}`);
    }
    this.written.set(receipt.idempotencyKey, receipt);
  }
}

function effects(): { fx: PostMergeEffects; board: StubBoard; receipts: StubReceipts; journal: InMemoryJournal } {
  const board = new StubBoard();
  const receipts = new StubReceipts();
  const journal = new InMemoryJournal();
  return { fx: new PostMergeEffects({ board, receipts, journal, runId: 'run-1' }), board, receipts, journal };
}

test('T13: an AFK merge ticks + ships the row and writes a per-item receipt', async () => {
  const { fx, board, receipts, journal } = effects();
  await fx.apply('wave-3', 'sha-abc');
  assert.equal(board.ticked.get('wave-3'), 'sha-abc');
  assert.ok(await receipts.has(perItemKey('wave-3', 'sha-abc')));
  assert.equal((await journal.readAll()).length, 1);
});

test('T13: re-running is a no-op on the already-ticked row (idempotent)', async () => {
  const { fx, board, receipts } = effects();
  await fx.apply('wave-3', 'sha-abc');
  await fx.apply('wave-3', 'sha-abc'); // replay
  assert.equal(board.tickCalls, 1); // not ticked twice
  assert.equal(receipts.written.size, 1); // receipt written once (no double-write throw)
});

test('T13: a run-summary receipt is written once with a valid key', async () => {
  const { fx, receipts } = effects();
  await fx.writeRunSummary({ mergedAfk: 1 });
  await fx.writeRunSummary({ mergedAfk: 1 }); // replay no-op
  assert.ok(await receipts.has(runSummaryKey('run-1')));
  assert.equal(receipts.written.size, 1);
});

// --- merged-but-unticked repair via outbox reconciliation (the key Task 13 ↔ 8a path) ---

/** Minimal MergeGit (unused on the reconcile path but required by the contract). */
const noopGit: MergeGit = {
  async headSha() { return 'head'; },
  async rebaseOntoHead() {},
  async mergeCandidateSha() { return 'cand'; },
  async mergeFfOnly() { return 'merge'; },
};

/** Claim store that records releases. */
class StubClaims implements ClaimStore {
  readonly released: string[] = [];
  async tryClaim() { return true; }
  async holder() { return null; }
  async release(itemId: string): Promise<void> {
    this.released.push(itemId);
  }
}

test('T13: a merged-but-unticked outbox record is repaired to ticked + receipt on reconcile, idempotently', async () => {
  const { fx, board, receipts } = effects();
  const outbox = new InMemoryJournal();
  // Seed the outbox as if a merge landed (step-6 stamp) but downstream NEVER ran:
  // mergeSha present, downstreamDone absent → reconciliation must repair it.
  await outbox.append({ kind: 'merge', itemId: 'wave-9', runId: 'run-0', baseSha: 'b', mergeSha: 'sha-999' });

  const claims = new StubClaims();
  const contract = new MergeContract({
    git: noopGit,
    claims,
    outbox,
    finalGate: async () => true,
    downstream: fx, // the PostMergeEffects under test
    runId: 'run-1',
  });

  // Row starts unticked.
  assert.equal(await board.isTicked('wave-9'), false);

  await contract.reconcile();
  // Repaired: row ticked to the merge SHA + per-item receipt written.
  assert.equal(board.ticked.get('wave-9'), 'sha-999');
  assert.ok(await receipts.has(perItemKey('wave-9', 'sha-999')));

  // Second reconcile pass is a no-op (idempotent — no double tick, no double receipt).
  const sizeBefore = receipts.written.size;
  await contract.reconcile();
  assert.equal(receipts.written.size, sizeBefore);
  assert.equal(board.tickCalls, 1);
});
