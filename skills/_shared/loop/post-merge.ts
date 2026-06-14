// Post-merge downstream effects (Wave 20, Task 13) — reuse /close-wave's tick +
// §4.2 receipts.
//
// These are the DOWNSTREAM effects of the Task 8a atomic-merge contract step 6:
// `DownstreamEffects.apply(itemId, mergeSha)` is called AFTER a merge lands, keyed by
// the merge SHA, and is individually idempotent — so they are driven (or repaired) by
// Task 8a's outbox reconciliation, NEVER by an in-memory completion flag. On an AFK
// merge the loop performs, per item:
//   1. /close-wave's plan.md tick: `[ ]`→`[x]` + move the row to `## Recently Shipped`;
//   2. a §4.2 receipt + journal entry;
// plus ONE run-level summary receipt per run.
//
// NO parallel/duplicate state machine — the board stays the single source of truth and
// is brought into agreement with the merge SHA by reconciliation. A merged-but-unticked
// row (merge SHA in the outbox, row still `[ ]`) is repaired to ticked + receipt on the
// next reconciliation pass, idempotently.
//
// Every disk effect (plan.md mutation, receipt write) is an injected, stubbable seam.

import { type DownstreamEffects } from './merge/merge-contract.ts';
import { type Journal } from './state-journal.ts';

/** The plan.md tick seam: tick a row and move it to Recently Shipped. Idempotent. */
export interface PlanBoard {
  /** True when `itemId`'s row is already ticked (`[x]`) + in Recently Shipped. */
  isTicked(itemId: string): Promise<boolean>;
  /**
   * Tick `itemId`'s row (`[ ]`→`[x]`) and move it to `## Recently Shipped`, stamping
   * the merge SHA. Idempotent: a no-op when already ticked. Mirrors /close-wave.
   */
  tickAndShip(itemId: string, mergeSha: string): Promise<void>;
}

/** The §4.2 receipt sink. Idempotent by idempotency key (mergeSha-derived). */
export interface ReceiptSink {
  /** True when a receipt with this idempotency key already exists. */
  has(idempotencyKey: string): Promise<boolean>;
  /** Write a receipt. Caller guarantees the key is unique per logical effect. */
  write(receipt: PostMergeReceipt): Promise<void>;
}

/** A §4.2-shaped receipt for a post-merge effect. */
export interface PostMergeReceipt {
  readonly idempotencyKey: string;
  readonly kind: 'per-item-merge' | 'run-summary';
  readonly itemId?: string;
  readonly mergeSha?: string;
  readonly runId: string;
  readonly detail: Readonly<Record<string, unknown>>;
}

/** Per-item post-merge idempotency key (the merge SHA is the natural key). */
export function perItemKey(itemId: string, mergeSha: string): string {
  return `run-loop:post-merge:${itemId}:${mergeSha}`;
}

/** Run-summary receipt idempotency key. */
export function runSummaryKey(runId: string): string {
  return `run-loop:run-summary:${runId}`;
}

export interface PostMergeDeps {
  readonly board: PlanBoard;
  readonly receipts: ReceiptSink;
  readonly journal: Journal;
  readonly runId: string;
}

/**
 * Post-merge downstream effects implementing the frozen DownstreamEffects seam the
 * MergeContract calls (and reconciliation repairs). Each effect is idempotent and
 * keyed by the merge SHA, so a repeated apply (reconciliation replay) is a no-op.
 */
export class PostMergeEffects implements DownstreamEffects {
  private readonly d: PostMergeDeps;

  constructor(deps: PostMergeDeps) {
    this.d = deps;
  }

  /** Apply the per-item post-merge effects for one merged item. Idempotent. */
  async apply(itemId: string, mergeSha: string): Promise<void> {
    // 1. plan.md tick — idempotent: skip when the row is already ticked + shipped.
    if (!(await this.d.board.isTicked(itemId))) {
      await this.d.board.tickAndShip(itemId, mergeSha);
    }

    // 2. §4.2 receipt + journal entry — keyed by merge SHA, written once.
    const key = perItemKey(itemId, mergeSha);
    if (!(await this.d.receipts.has(key))) {
      const receipt: PostMergeReceipt = {
        idempotencyKey: key,
        kind: 'per-item-merge',
        itemId,
        mergeSha,
        runId: this.d.runId,
        detail: { effect: 'plan-tick+ship', mergeSha },
      };
      await this.d.receipts.write(receipt);
      await this.d.journal.append({
        kind: 'post-merge',
        itemId,
        mergeSha,
        runId: this.d.runId,
        idempotencyKey: key,
      });
    }
  }

  /**
   * Write the single run-level summary receipt. Idempotent by runId. Called once at
   * loop end with the accumulated run metrics.
   */
  async writeRunSummary(detail: Readonly<Record<string, unknown>>): Promise<void> {
    const key = runSummaryKey(this.d.runId);
    if (await this.d.receipts.has(key)) {
      return;
    }
    await this.d.receipts.write({
      idempotencyKey: key,
      kind: 'run-summary',
      runId: this.d.runId,
      detail,
    });
  }
}
