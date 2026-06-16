// status: RETIRED-deferred (Wave 23) — built + unit-tested but NOT wired into the live
// drive. Serial `ReadinessGatedSource` (run-loop-prod-deps.ts) is the chosen sequencing;
// this AFK-frontier DAG scheduler is deferred-until-parallel-execution (OQ-1 in
// docs/specs/2026-06-16-run-loop-merge-to-head.md). Kept in-tree as the future
// concurrent-scheduling path; do not wire without a concurrency-activation decision.
//
// DAG readiness + AFK-frontier-first scheduling (Wave 19, Task 8).
//
// Builds the dependency DAG from the providers' `blockedBy` edges and classifies
// every item for ONE run, given which items are already MERGED.
//
// Rules (spec Task 8):
//  - Readiness = ALL blockers MERGED (not merely attempted) — a fresh sandcastle
//    container builds from `head`, so an un-merged blocker is not integrated.
//  - AFK-frontier-first: drain every item whose entire ancestry is AFK-or-merged
//    first (these are the auto-merge candidates this run).
//  - When a ready `worktree`/HITL item is reached: open its PR, mark awaiting-human,
//    and CONTINUE with other ready AFK items (do not block the run on it).
//  - Defer any item under a HITL ancestor to `blocked-on-human` — do NOT attempt it
//    this run (its ancestry includes an un-mergeable-by-AFK node).
//  - NO stacked branches: an AFK item is only attempted when every blocker is
//    actually merged, never branched off an un-merged sibling.
//
// The scheduler is PURE: it takes the item set + a merged predicate and returns the
// classification. The driver (which actually opens PRs / dispatches merges) consumes
// the plan; that side-effecting part is injected so this logic is unit-testable.

import { type RunnerKind, type WorkItem, resolveRunnerKind } from '../types.ts';

/** Per-item scheduling disposition for one run. */
export type ScheduleClass =
  | 'attempt-afk' // sandcastle, all blockers merged, no HITL ancestor → auto-merge candidate
  | 'open-pr-awaiting-human' // worktree/HITL item, all blockers merged → open PR, await human
  | 'blocked-on-human' // has a HITL ancestor (transitively) → deferred, not attempted this run
  | 'blocked-on-afk'; // blocked only by un-merged AFK items → wait for the cascade

/** A scheduled item with its computed class + the reason. */
export interface ScheduledItem {
  readonly item: WorkItem;
  readonly kind: RunnerKind;
  readonly class: ScheduleClass;
  readonly reason: string;
}

/** The whole-run schedule. */
export interface Schedule {
  readonly attemptAfk: readonly ScheduledItem[];
  readonly openPrAwaitingHuman: readonly ScheduledItem[];
  readonly blockedOnHuman: readonly ScheduledItem[];
  readonly blockedOnAfk: readonly ScheduledItem[];
  /** Deepest blocked-on-human subtree depth (for the run summary — Task 9). */
  readonly deepestBlockedSubtree: number;
}

/** Tells the scheduler whether an item id is already MERGED. */
export type MergedPredicate = (itemId: string) => boolean;

/** Index items by id; throw on a duplicate or a dangling edge. */
function indexItems(items: readonly WorkItem[]): Map<string, WorkItem> {
  const byId = new Map<string, WorkItem>();
  for (const item of items) {
    if (byId.has(item.id)) {
      throw new Error(`run-loop scheduler: duplicate item id "${item.id}"`);
    }
    byId.set(item.id, item);
  }
  return byId;
}

/** Blockers of an item that are present in the set (dangling edges ignored). */
function blockersOf(item: WorkItem, byId: Map<string, WorkItem>): string[] {
  const raw = item.blockedBy ?? [];
  return raw.filter((id) => byId.has(id));
}

/**
 * True if the item has a HITL (worktree) ancestor anywhere in its un-merged
 * ancestry. A merged ancestor is integrated and no longer gates AFK progress, so
 * merged HITL ancestors do NOT taint descendants. Walks transitively with cycle
 * guarding.
 */
function hasUnmergedHitlAncestor(
  item: WorkItem,
  byId: Map<string, WorkItem>,
  merged: MergedPredicate,
  seen: Set<string> = new Set(),
): boolean {
  for (const blockerId of blockersOf(item, byId)) {
    if (seen.has(blockerId)) {
      continue;
    }
    seen.add(blockerId);
    if (merged(blockerId)) {
      // Merged blocker is integrated — it does not gate, and we do not walk past it.
      continue;
    }
    const blocker = byId.get(blockerId)!;
    if (resolveRunnerKind(blocker) === 'worktree') {
      return true; // an un-merged HITL ancestor
    }
    if (hasUnmergedHitlAncestor(blocker, byId, merged, seen)) {
      return true;
    }
  }
  return false;
}

/** Depth of the longest chain of un-merged blockers above an item (0 if ready). */
function unmergedDepth(
  item: WorkItem,
  byId: Map<string, WorkItem>,
  merged: MergedPredicate,
  seen: Set<string> = new Set(),
): number {
  let max = 0;
  for (const blockerId of blockersOf(item, byId)) {
    if (merged(blockerId) || seen.has(blockerId)) {
      continue;
    }
    seen.add(blockerId);
    const blocker = byId.get(blockerId)!;
    max = Math.max(max, 1 + unmergedDepth(blocker, byId, merged, new Set(seen)));
  }
  return max;
}

/** All blockers of the item are merged (readiness gate). */
function allBlockersMerged(
  item: WorkItem,
  byId: Map<string, WorkItem>,
  merged: MergedPredicate,
): boolean {
  return blockersOf(item, byId).every((id) => merged(id));
}

/**
 * Classify every (not-yet-merged) item for one run. Merged items are excluded from
 * the schedule entirely (they are done). Pure function of (items, merged).
 */
export function scheduleRun(items: readonly WorkItem[], merged: MergedPredicate): Schedule {
  const byId = indexItems(items);

  const attemptAfk: ScheduledItem[] = [];
  const openPrAwaitingHuman: ScheduledItem[] = [];
  const blockedOnHuman: ScheduledItem[] = [];
  const blockedOnAfk: ScheduledItem[] = [];
  let deepestBlockedSubtree = 0;

  for (const item of items) {
    if (merged(item.id)) {
      continue; // already merged — not scheduled
    }
    const kind = resolveRunnerKind(item);
    const ready = allBlockersMerged(item, byId, merged);
    const underHitl = hasUnmergedHitlAncestor(item, byId, merged);

    if (underHitl) {
      // Deferred: an un-merged HITL ancestor gates this item this run.
      const depth = unmergedDepth(item, byId, merged);
      deepestBlockedSubtree = Math.max(deepestBlockedSubtree, depth);
      blockedOnHuman.push({
        item,
        kind,
        class: 'blocked-on-human',
        reason: 'has an un-merged HITL (worktree) ancestor; deferred, not attempted this run',
      });
      continue;
    }

    if (!ready) {
      // Blocked only by un-merged AFK items — wait for the cascade.
      const depth = unmergedDepth(item, byId, merged);
      deepestBlockedSubtree = Math.max(deepestBlockedSubtree, depth);
      blockedOnAfk.push({
        item,
        kind,
        class: 'blocked-on-afk',
        reason: 'one or more AFK blockers are not yet merged',
      });
      continue;
    }

    // Ready (all blockers merged, no un-merged HITL ancestor).
    if (kind === 'worktree') {
      openPrAwaitingHuman.push({
        item,
        kind,
        class: 'open-pr-awaiting-human',
        reason: 'ready worktree/HITL item: open PR, mark awaiting-human, continue with AFK items',
      });
    } else {
      attemptAfk.push({
        item,
        kind,
        class: 'attempt-afk',
        reason: 'ready sandcastle item with all blockers merged — AFK auto-merge candidate',
      });
    }
  }

  return {
    attemptAfk,
    openPrAwaitingHuman,
    blockedOnHuman,
    blockedOnAfk,
    deepestBlockedSubtree,
  };
}
