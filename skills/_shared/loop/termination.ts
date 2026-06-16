// Failure handling + termination + run summary (Wave 19, Task 9).
//
// Skip-and-continue on item failure. A failed item undergoes the SINGLE terminal
// transition for failure via escalateItem (Task 4 two-phase machine). Idempotent:
// a terminal escalation marker present ⇒ no second escalation, no re-dispatch.
// Wave items (no gh issue) get equivalent two-phase markers in `.harness-state/`
// and the wave row is left un-ticked with a logged escalation pointer.
//
// Termination on the FIRST of: work-source drained / iteration cap (default 20) /
// stall (3 consecutive gate failures) / token-budget exhausted / optional
// wall-clock cap. The run summary is a HARD requirement.

/** Why the loop stopped (extends the Phase-1 `drained`). */
export type RunStopReason =
  | 'drained'
  | 'iteration-cap'
  | 'stall'
  | 'token-budget'
  | 'wall-clock';

/** Caps + budgets governing termination. */
export interface TerminationConfig {
  /** Max items processed this run (default 20). */
  readonly iterationCap: number;
  /** Consecutive gate failures that trigger a stall stop (default 3). */
  readonly stallThreshold: number;
  /** Optional wall-clock cap in ms; omit for none. */
  readonly wallClockMs?: number;
  /** Optional token budget; omit for none. */
  readonly tokenBudget?: number;
}

export const DEFAULT_TERMINATION: TerminationConfig = {
  iterationCap: 20,
  stallThreshold: 3,
};

/** Mutable run-progress the termination controller tracks. */
export interface RunProgress {
  /** Items successfully processed (merged/escalated/relabeled) this run. */
  itemsProcessed: number;
  /** Current streak of consecutive gate failures (reset on any success). */
  consecutiveGateFailures: number;
  /** Tokens consumed so far (caller increments; 0 when untracked). */
  tokensUsed: number;
  /** Run start epoch ms. */
  readonly startedAt: number;
}

export function newRunProgress(now: number): RunProgress {
  return { itemsProcessed: 0, consecutiveGateFailures: 0, tokensUsed: 0, startedAt: now };
}

/**
 * Decide whether to stop BEFORE processing the next item. Returns the stop reason
 * or null to continue. Order matters: iteration cap and stall are checked against
 * the running totals; drained is signaled separately by the caller (no work left).
 */
export function shouldStop(
  progress: RunProgress,
  config: TerminationConfig,
  now: number,
): RunStopReason | null {
  if (progress.itemsProcessed >= config.iterationCap) {
    return 'iteration-cap';
  }
  if (progress.consecutiveGateFailures >= config.stallThreshold) {
    return 'stall';
  }
  if (config.tokenBudget !== undefined && progress.tokensUsed >= config.tokenBudget) {
    return 'token-budget';
  }
  if (config.wallClockMs !== undefined && now - progress.startedAt >= config.wallClockMs) {
    return 'wall-clock';
  }
  return null;
}

/**
 * Fold one item outcome into the progress counters. A gate failure increments the
 * consecutive-failure streak; any non-gate-failure outcome resets it. Every
 * processed item (success OR failure) counts toward the iteration cap.
 */
export function recordOutcome(
  progress: RunProgress,
  outcome: 'gate-failed' | 'merged' | 'escalated' | 'awaiting-human' | 'deferred',
): void {
  // Deferred items are NOT attempted this run, so they don't count toward the cap.
  if (outcome === 'deferred') {
    return;
  }
  progress.itemsProcessed += 1;
  if (outcome === 'gate-failed') {
    progress.consecutiveGateFailures += 1;
  } else {
    progress.consecutiveGateFailures = 0;
  }
}

/** The run summary — a HARD requirement (spec Task 9). */
export interface RunSummaryReport {
  readonly mergedAfk: number;
  readonly openedAwaitingHuman: number;
  readonly deferredBlockedOnHuman: number;
  readonly escalated: number;
  readonly gateFailed: number;
  /**
   * Items that failed BEFORE any gate ran (Wave 22, Bug 4) — an implement/commit
   * failure or a thrown lane. Distinct from `gateFailed` (the gate ran and went red),
   * so the summary is honest about where the failure happened. Additive field —
   * `RunSummaryReport` is NOT a frozen Phase-1 interface.
   */
  readonly implementFailed: number;
  /** Deepest blocked subtree depth (from the scheduler — Task 8). */
  readonly deepestBlockedSubtree: number;
  readonly stopReason: RunStopReason;
  /** Item ids visited this run, in processing order. */
  readonly visited: readonly string[];
}

/** Accumulates the run summary across the loop. */
export class RunSummaryBuilder {
  private mergedAfk = 0;
  private openedAwaitingHuman = 0;
  private deferredBlockedOnHuman = 0;
  private escalated = 0;
  private gateFailed = 0;
  private implementFailed = 0;
  private deepestBlockedSubtree = 0;
  private readonly visited: string[] = [];

  recordMerged(itemId: string): void {
    this.mergedAfk += 1;
    this.visited.push(itemId);
  }
  recordAwaitingHuman(itemId: string): void {
    this.openedAwaitingHuman += 1;
    this.visited.push(itemId);
  }
  recordDeferred(): void {
    this.deferredBlockedOnHuman += 1;
  }
  recordEscalated(itemId: string): void {
    this.escalated += 1;
    this.visited.push(itemId);
  }
  recordGateFailed(itemId: string): void {
    this.gateFailed += 1;
    this.visited.push(itemId);
  }
  /** Record an item that failed BEFORE any gate ran (Wave 22, Bug 4). */
  recordImplementFailed(itemId: string): void {
    this.implementFailed += 1;
    this.visited.push(itemId);
  }
  noteDeepestBlockedSubtree(depth: number): void {
    this.deepestBlockedSubtree = Math.max(this.deepestBlockedSubtree, depth);
  }

  build(stopReason: RunStopReason): RunSummaryReport {
    return {
      mergedAfk: this.mergedAfk,
      openedAwaitingHuman: this.openedAwaitingHuman,
      deferredBlockedOnHuman: this.deferredBlockedOnHuman,
      escalated: this.escalated,
      gateFailed: this.gateFailed,
      implementFailed: this.implementFailed,
      deepestBlockedSubtree: this.deepestBlockedSubtree,
      stopReason,
      visited: [...this.visited],
    };
  }
}
