// Per-item exit gate (Wave 19, Task 5).
//
// After the agent runs the item in its runner, the exit gate runs tests +
// typecheck + the item's `Verify`/acceptance criteria. The gate is a HARD BLOCKER:
// the per-item protocol NEVER proceeds to merge on a red gate. If the agent cannot
// make the gate green within the iteration, the item is recorded `gate-failed`
// (which Task 9 maps to an escalation / failure).
//
// The actual test/typecheck/verify execution is an INJECTED seam (GateRunner) so
// this layer is unit-testable with no real test runner, no tsc, no shell.

import { type WorkItem } from '../types.ts';

/** The outcome of running the exit gate for one item. */
export interface GateResult {
  /** True only when tests AND typecheck AND verify all passed. */
  readonly green: boolean;
  /** Per-check breakdown (for the failure note / summary). */
  readonly checks: {
    readonly tests: boolean;
    readonly typecheck: boolean;
    readonly verify: boolean;
  };
  /** Human-readable detail for a red gate (which checks failed). */
  readonly note?: string;
}

/**
 * Runs the three gate checks for an item inside its prepared workspace. Injected
 * so the protocol's "never merge on red" logic is testable with forced-red checks.
 * The real adapter shells out to the project's test + tsc commands and evaluates
 * the item's Verify block; that lands with the real runner side in a later wave.
 */
export interface GateRunner {
  runTests(item: WorkItem): Promise<boolean>;
  runTypecheck(item: WorkItem): Promise<boolean>;
  runVerify(item: WorkItem): Promise<boolean>;
}

/**
 * Run the full exit gate for an item. All three checks run (no short-circuit) so
 * the failure note can name every red check — useful for the run summary and for
 * the agent's next iteration. The gate is green only when all three pass.
 */
export async function runExitGate(item: WorkItem, runner: GateRunner): Promise<GateResult> {
  const tests = await runner.runTests(item);
  const typecheck = await runner.runTypecheck(item);
  const verify = await runner.runVerify(item);
  const green = tests && typecheck && verify;

  const result: GateResult = {
    green,
    checks: { tests, typecheck, verify },
    ...(green
      ? {}
      : {
          note: `exit gate red for ${item.id}: ${[
            tests ? null : 'tests',
            typecheck ? null : 'typecheck',
            verify ? null : 'verify',
          ]
            .filter((x): x is string => x !== null)
            .join(', ')} failed`,
        }),
  };
  return result;
}
