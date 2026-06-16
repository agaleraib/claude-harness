// status: RETIRED-until-concurrency (Wave 23) — built + unit-tested but NOT wired into
// the live drive. Pure-serial merge-to-head (run-loop-prod-deps.ts) needs no run-lock or
// base-SHA CAS; this atomic-merge contract activates ONLY for concurrent merges (OQ-1 in
// docs/specs/2026-06-16-run-loop-merge-to-head.md). Kept in-tree; do not wire until the
// loop runs items concurrently.
//
// Concurrency + atomic-merge contract (Wave 19, Task 8a) — HARD BLOCKER.
//
// Enforced for every AFK auto-merge before the merge lands:
//   1. Repo-level run lock (run-lock.ts).
//   2. Per-item claim before dispatch — two loops MUST NOT both pick the same item.
//   3. Record base SHA at dispatch.
//   4. Rebase/merge current target head onto the item branch before the final gate.
//   5. Final gate RERUN on the exact commit to be merged (a green earlier gate is
//      not sufficient if integration changed the tree).
//   6. Single durable commit point = the merge SHA. Merge with a base-SHA
//      precondition (ff-only onto the refetched head / CAS on the remote ref); on
//      precondition fail → abort + re-queue + log `head-raced`. Outbox keyed by
//      merge SHA: append intent before merge, stamp merge-commit-SHA after. THEN
//      downstream effects, idempotently keyed by merge SHA.
//   7. Startup reconciliation (detect-and-repair post-merge boundaries).
//
// Every git/claim side effect is an injected seam, so the whole contract is
// unit-testable with no real git, no network, no Docker.

import { type Journal, type JournalRecord } from '../state-journal.ts';
import { type WorkItem } from '../types.ts';

/** Per-item claim store. A claim is the non-terminal marker (issues) or a file. */
export interface ClaimStore {
  /** Atomically claim the item for `runId`; false if already claimed by another. */
  tryClaim(itemId: string, runId: string): Promise<boolean>;
  /** The current holder of an item's claim, or null. */
  holder(itemId: string): Promise<string | null>;
  /** Release a claim (on terminal disposition or crash recovery). */
  release(itemId: string): Promise<void>;
}

/** The git seam: head reads, rebase/integration, and the precondition merge. */
export interface MergeGit {
  /** Current target head SHA (the branch the item will merge into). */
  headSha(): Promise<string>;
  /** Integrate the current target head onto the item branch; throws on conflict. */
  rebaseOntoHead(itemId: string, baseSha: string): Promise<void>;
  /** The commit SHA that WILL be merged (the item branch tip after integration). */
  mergeCandidateSha(itemId: string): Promise<string>;
  /**
   * ff-only merge of the item branch onto the target, asserting the target head is
   * still `expectedBaseSha` (CAS). Returns the resulting merge SHA. Throws
   * HeadRacedError if the precondition fails (head moved).
   */
  mergeFfOnly(itemId: string, expectedBaseSha: string): Promise<string>;
}

/** The exit gate, rerun on the exact commit to be merged (step 5). */
export type FinalGate = (itemId: string, mergeCandidateSha: string) => Promise<boolean>;

/** Downstream effects keyed by merge SHA (terminal marker / plan.md tick / receipts). */
export interface DownstreamEffects {
  apply(itemId: string, mergeSha: string): Promise<void>;
}

export class HeadRacedError extends Error {
  constructor(itemId: string, expected: string, actual: string) {
    super(
      `run-loop: head raced while merging ${itemId} — expected base ${expected}, ` +
        `target head is now ${actual}. Aborting and re-queueing.`,
    );
    this.name = 'HeadRacedError';
  }
}

/** Why a merge attempt ended. */
export type MergeOutcome =
  | { readonly status: 'merged'; readonly mergeSha: string }
  | { readonly status: 'head-raced'; readonly requeue: true }
  | { readonly status: 'claim-lost'; readonly holder: string }
  | { readonly status: 'gate-failed-on-merge-commit' };

/** Outbox record (`.harness-state/run-loop-outbox.jsonl`), keyed by item + intent. */
interface OutboxRecord extends JournalRecord {
  readonly kind: 'merge';
  readonly itemId: string;
  readonly runId: string;
  readonly baseSha: string;
  /** Stamped after the merge lands; absent ⇒ intent only (not yet merged). */
  readonly mergeSha?: string;
  /** Stamped once downstream effects complete (idempotency). */
  readonly downstreamDone?: boolean;
}

export interface MergeContractDeps {
  readonly git: MergeGit;
  readonly claims: ClaimStore;
  readonly outbox: Journal;
  readonly finalGate: FinalGate;
  readonly downstream: DownstreamEffects;
  readonly runId: string;
}

/**
 * The atomic-merge contract for one AFK item. Steps 2-7. The run lock (step 1) is
 * acquired once per run by the caller, not per item.
 */
export class MergeContract {
  private readonly d: MergeContractDeps;

  constructor(deps: MergeContractDeps) {
    this.d = deps;
  }

  /** Attempt to AFK auto-merge one item under the full contract. */
  async attemptMerge(item: WorkItem): Promise<MergeOutcome> {
    // Step 2 — per-item claim before dispatch.
    const claimed = await this.d.claims.tryClaim(item.id, this.d.runId);
    if (!claimed) {
      const holder = (await this.d.claims.holder(item.id)) ?? 'unknown';
      return { status: 'claim-lost', holder };
    }

    // Step 3 — record base SHA at dispatch (in the outbox as merge intent).
    const baseSha = await this.d.git.headSha();
    await this.appendIntent(item.id, baseSha);

    // Step 4 — integrate current target head onto the item branch before the gate.
    await this.d.git.rebaseOntoHead(item.id, baseSha);
    const candidate = await this.d.git.mergeCandidateSha(item.id);

    // Step 5 — final gate RERUN on the exact commit to be merged.
    const green = await this.d.finalGate(item.id, candidate);
    if (!green) {
      // Discard the unmerged intent + release the claim; the item will be re-handled.
      await this.discardIntent(item.id);
      await this.d.claims.release(item.id);
      return { status: 'gate-failed-on-merge-commit' };
    }

    // Step 6 — single durable commit point: ff-only/CAS merge with the base-SHA
    // precondition. The merge SHA is THE commit point; intent is already in the
    // outbox. On precondition failure → abort + re-queue + log head-raced.
    let mergeSha: string;
    try {
      mergeSha = await this.d.git.mergeFfOnly(item.id, baseSha);
    } catch (err) {
      if (err instanceof HeadRacedError) {
        await this.discardIntent(item.id);
        await this.d.claims.release(item.id);
        return { status: 'head-raced', requeue: true };
      }
      throw err;
    }
    await this.stampMerged(item.id, baseSha, mergeSha);

    // THEN downstream effects, idempotently keyed by the merge SHA.
    await this.d.downstream.apply(item.id, mergeSha);
    await this.stampDownstreamDone(item.id, baseSha, mergeSha);
    await this.d.claims.release(item.id);

    return { status: 'merged', mergeSha };
  }

  /**
   * Step 7 — startup reconciliation. Repairs the three post-merge boundaries,
   * idempotently, keyed by merge SHA or item key. Safe to run repeatedly.
   */
  async reconcile(): Promise<void> {
    const records = await this.latestPerItem();
    for (const rec of records.values()) {
      if (rec.mergeSha === undefined) {
        // intent-but-unmerged → discard intent + re-queue (release the claim).
        await this.discardIntent(rec.itemId);
        await this.d.claims.release(rec.itemId);
        continue;
      }
      if (rec.mergeSha !== undefined && rec.downstreamDone !== true) {
        // merged-but-unmarked / marked-but-unticked → finish downstream effects
        // idempotently keyed by merge SHA.
        await this.d.downstream.apply(rec.itemId, rec.mergeSha);
        await this.stampDownstreamDone(rec.itemId, rec.baseSha, rec.mergeSha);
        await this.d.claims.release(rec.itemId);
      }
    }
  }

  // --- outbox helpers ---

  private async appendIntent(itemId: string, baseSha: string): Promise<void> {
    const rec: OutboxRecord = { kind: 'merge', itemId, runId: this.d.runId, baseSha };
    await this.d.outbox.append(rec);
  }

  private async discardIntent(itemId: string): Promise<void> {
    // Append a tombstone so the latest record for the item carries no mergeSha and
    // is explicitly discarded; latestPerItem treats a discarded record as resolved.
    const rec: OutboxRecord & { discarded: true } = {
      kind: 'merge',
      itemId,
      runId: this.d.runId,
      baseSha: '',
      discarded: true,
    };
    await this.d.outbox.append(rec);
  }

  private async stampMerged(itemId: string, baseSha: string, mergeSha: string): Promise<void> {
    const rec: OutboxRecord = { kind: 'merge', itemId, runId: this.d.runId, baseSha, mergeSha };
    await this.d.outbox.append(rec);
  }

  private async stampDownstreamDone(
    itemId: string,
    baseSha: string,
    mergeSha: string,
  ): Promise<void> {
    const rec: OutboxRecord = {
      kind: 'merge',
      itemId,
      runId: this.d.runId,
      baseSha,
      mergeSha,
      downstreamDone: true,
    };
    await this.d.outbox.append(rec);
  }

  /** The latest non-discarded outbox record per item id. */
  private async latestPerItem(): Promise<Map<string, OutboxRecord>> {
    const all = await this.d.outbox.readAll();
    const latest = new Map<string, OutboxRecord>();
    for (const r of all) {
      if (r['kind'] !== 'merge') {
        continue;
      }
      const rec = r as OutboxRecord & { discarded?: boolean };
      const itemId = rec.itemId;
      if (rec.discarded === true) {
        latest.delete(itemId); // a discard resolves the item — nothing to repair
        continue;
      }
      latest.set(itemId, rec);
    }
    return latest;
  }
}
