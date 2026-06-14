// The per-item mechanical protocol (Wave 19, Tasks 5-7).
//
// Drives one item through the mechanical gate:
//   run in runner → exit gate (Task 5) → code-review + bounded auto-fix (Task 6)
//   → file leftover findings as issues (Task 7) → (merge happens in Task 8/8a).
//
// This module implements the frozen PerItemProtocol seam. Every external effect
// (gate execution, /code-review, gh) is an injected seam, so the whole protocol is
// unit-testable with no real runner, no review tool, no live GitHub.
//
// Task 5 scope (this commit): run the item, run the exit gate, and NEVER proceed
// past the gate on red. A red gate is recorded as the `gate-failed` disposition
// (mapped to the frozen `failed` status); a green gate proceeds.

import {
  type ItemResult,
  type PerItemProtocol,
  type Runner,
  type WorkItem,
} from '../types.ts';
import { type GateResult, type GateRunner, runExitGate } from './gate.ts';

/**
 * Protocol-internal disposition, richer than the frozen ItemResult.status. The
 * protocol records exactly where an item stopped; `toItemResult` collapses it to
 * the frozen four-value status the engine + WorkSource consume.
 */
export type Disposition =
  | 'gate-failed' // exit gate red — never merged (Task 5)
  | 'review-escalated' // CRITICAL/HIGH survived the single re-review (Task 6)
  | 'ready-to-merge' // gate green + review clean — eligible for the merge step
  | 'completed'; // merged (Task 8/8a fills this in)

/** The full per-item protocol outcome (superset of the frozen ItemResult). */
export interface ProtocolOutcome {
  readonly itemId: string;
  readonly disposition: Disposition;
  /** The exit-gate result, when the gate ran. */
  readonly gate?: GateResult;
  readonly note?: string;
}

/** Map a protocol disposition to the frozen ItemResult the engine consumes. */
export function toItemResult(outcome: ProtocolOutcome): ItemResult {
  const status: ItemResult['status'] =
    outcome.disposition === 'completed'
      ? 'completed'
      : outcome.disposition === 'review-escalated'
        ? 'escalated'
        : outcome.disposition === 'gate-failed'
          ? 'failed'
          : // ready-to-merge but the engine asked for a terminal result without a
            // merge step wired (Task 5/6 standalone) ⇒ treat as escalated so it is
            // never silently dropped. Task 8a replaces this with a real merge.
            'escalated';
  return {
    itemId: outcome.itemId,
    status,
    ...(outcome.note !== undefined ? { note: outcome.note } : {}),
  };
}

/** Dependencies injected into the per-item protocol. */
export interface PerItemDeps {
  readonly gate: GateRunner;
}

/**
 * Per-item protocol — Task 5 slice. Runs the item in its runner, then the exit
 * gate. On a red gate it stops at `gate-failed` and NEVER proceeds to merge. On a
 * green gate it advances to `ready-to-merge` (Task 6 inserts the review loop
 * between the gate and this point; Task 8a inserts the real merge).
 */
export class PerItemProtocolImpl implements PerItemProtocol {
  protected readonly deps: PerItemDeps;

  constructor(deps: PerItemDeps) {
    this.deps = deps;
  }

  async run(item: WorkItem, runner: Runner): Promise<ItemResult> {
    return toItemResult(await this.runProtocol(item, runner));
  }

  /** The richer protocol run, exposed for tests + Task 9 disposition handling. */
  async runProtocol(item: WorkItem, runner: Runner): Promise<ProtocolOutcome> {
    // Run the item in its isolated workspace.
    await runner.prepare();
    await runner.exec(this.promptFor(item));

    // Exit gate (Task 5) — HARD BLOCKER.
    const gate = await runExitGate(item, this.deps.gate);
    if (!gate.green) {
      await runner.teardown();
      return {
        itemId: item.id,
        disposition: 'gate-failed',
        gate,
        ...(gate.note !== undefined ? { note: gate.note } : {}),
      };
    }

    // Green gate — proceed. Subclasses (Task 6) override afterGate to insert the
    // code-review + auto-fix loop before reaching ready-to-merge.
    const afterGate = await this.afterGate(item, runner, gate);
    await runner.teardown();
    return afterGate;
  }

  /**
   * Hook run after a green gate. Base implementation simply marks the item
   * ready-to-merge; Task 6 overrides it with the review loop.
   */
  protected async afterGate(
    item: WorkItem,
    _runner: Runner,
    gate: GateResult,
  ): Promise<ProtocolOutcome> {
    return { itemId: item.id, disposition: 'ready-to-merge', gate };
  }

  /** Build the agent prompt for an item (the synthetic spec / issue body). */
  protected promptFor(item: WorkItem): string {
    const spec = item['syntheticSpec'];
    if (typeof spec === 'string') {
      return spec;
    }
    const body = item['body'];
    if (typeof body === 'string') {
      return body;
    }
    return `Run item ${item.id}.`;
  }
}
