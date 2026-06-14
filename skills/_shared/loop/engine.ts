// The /run-loop control loop (Wave 18, Task 1).
//
// Single async control loop:
//   pull next ready item → resolve its runner → run the per-item protocol →
//   record result → check termination → repeat.
//
// The engine is a PURE FUNCTION of (work-source state, git/issue state): it holds
// no work-source-specific or runner-specific logic. Both the WorkSource and the
// Runner (via RunnerFactory) and the PerItemProtocol are injected. Because the
// engine only ever asks the source for the *next ready, not-yet-done* item and
// records results back through the source, "resume" is just "run again" — a
// re-run naturally skips items the source reports as done.

import {
  type EngineDeps,
  type ItemResult,
  type RunSummary,
  resolveRunnerKind,
} from './types.ts';

/**
 * Run the control loop to termination. Visits ready items in source order until
 * the source drains, driving each through the injected per-item protocol with a
 * runner resolved from the item's declared runner (sandcastle by default).
 *
 * Idempotent / resumable: items the source reports as already done via `isDone`
 * are skipped without being processed, so re-running after an interruption only
 * picks up the remaining work.
 */
export async function runLoop(deps: EngineDeps): Promise<RunSummary> {
  const { source, protocol, runnerFactory, preflight } = deps;

  // Startup preflight (Task 2): runner-aware checks run once before any item is
  // processed. If it rejects (e.g. Docker absent for sandcastle items), the whole
  // run aborts here — no item is dispatched. The engine stays agnostic of what the
  // preflight checks; it only honors the abort.
  if (preflight !== undefined) {
    await preflight();
  }

  const visited: string[] = [];
  const results: ItemResult[] = [];

  // Guard against a misbehaving source that keeps yielding the same item: a
  // well-behaved source advances past every item it returns (whether the engine
  // processes it or skips it as done), so the engine must never see the same id
  // twice. Tracking ids on *every* yield — not just processed ones — closes the
  // spin hole on the done-skip path (a source that forever re-yields a done item
  // would otherwise loop without ever advancing).
  const seen = new Set<string>();

  for (;;) {
    const item = await source.nextReady();
    if (item === null) {
      // Source drained — the one termination reason in Phase 1.
      break;
    }

    if (seen.has(item.id)) {
      throw new Error(
        `run-loop: work-source re-yielded item "${item.id}" that was already ` +
          `seen this run; a WorkSource must advance past every item it returns`,
      );
    }
    seen.add(item.id);

    // Resumability: skip anything already terminal. A re-run that re-encounters a
    // completed item must not re-process it.
    if (await source.isDone(item)) {
      continue;
    }

    const kind = resolveRunnerKind(item);
    const runner = runnerFactory.create(item, kind);

    const result = await protocol.run(item, runner);

    await source.recordResult(item, result);

    visited.push(item.id);
    results.push(result);
  }

  return {
    stopReason: 'drained',
    visited,
    results,
  };
}
