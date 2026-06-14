// /run-loop entry-point wiring (Wave 20, Task 16).
//
// The thin front-end behind the /run-loop skill: parse the work-source argument
// (`waves` | `issues`), short-circuit `--help` before any side effect, and select the
// WorkSource provider that the shared engine drives. Pure argument parsing + provider
// selection live here so they are unit-testable; the SKILL.md body invokes this then
// hands the selected provider to runLoop().
//
// RunSummary.stopReason DECISION (Wave 19 carry-forward constraint #3):
//   The frozen RunSummary.stopReason is `StopReason = 'drained'`. Wave 19's T9 added a
//   SEPARATE RunStopReason + RunSummaryReport (the richer metrics surface) rather than
//   widening the frozen type. For the Phase-6 end-to-end wiring we RETURN
//   RunSummaryReport ALONGSIDE the frozen RunSummary rather than widening
//   RunSummary.stopReason. Rationale: widening the `StopReason` union alone would be
//   type-additive, but the loop's real output needs the richer metric FIELDS
//   (mergedAfk / openedAwaitingHuman / deferredBlockedOnHuman / …) that the frozen
//   RunSummary interface does not carry — adding those fields WOULD mutate the frozen
//   interface shape. Returning RunSummaryReport alongside keeps every Phase-1 frozen
//   interface byte-for-byte untouched (additive-only honored) while giving the entry
//   point the full metric surface. See the wave summary §Open Questions.

/** The two work-source lanes the entry point selects between. */
export type WorkSourceArg = 'waves' | 'issues';

/** Result of parsing the /run-loop argument vector. */
export type ParsedRunLoopArgs =
  | { readonly mode: 'help' }
  | { readonly mode: 'run'; readonly source: WorkSourceArg }
  | { readonly mode: 'error'; readonly message: string };

/** The valid source set, surfaced in the error message. */
export const VALID_SOURCES: readonly WorkSourceArg[] = ['waves', 'issues'];

/**
 * Parse the /run-loop arguments. `--help`/`-h`/`help` short-circuits to help mode
 * BEFORE any side effect (matching /run-wave's convention). An unknown source errors
 * with the valid set. Pure.
 */
export function parseRunLoopArgs(argv: readonly string[]): ParsedRunLoopArgs {
  const tokens = argv.map((a) => a.trim()).filter((a) => a.length > 0);

  // --help short-circuit: if any token is a help flag, help wins before parsing.
  if (tokens.some((t) => t === '--help' || t === '-h' || t.toLowerCase() === 'help')) {
    return { mode: 'help' };
  }

  const source = tokens[0]?.toLowerCase();
  if (source === undefined) {
    return {
      mode: 'error',
      message: `/run-loop: missing work source. Valid sources: ${VALID_SOURCES.join(' | ')}`,
    };
  }
  if (source === 'waves' || source === 'issues') {
    return { mode: 'run', source };
  }
  return {
    mode: 'error',
    message: `/run-loop: unknown work source "${tokens[0]}". Valid sources: ${VALID_SOURCES.join(' | ')}`,
  };
}

/** The usage text printed on --help (no side effects before this). */
export const RUN_LOOP_USAGE = `/run-loop — drive plan.md waves OR gh issues end-to-end behind the mechanical gate.

Usage:
  /run-loop waves        # drive ready docs/plan.md waves
  /run-loop issues       # drive ready-for-agent gh issues
  /run-loop --help       # print this and exit

Behavior:
  - Selects the work-source provider (wave / issue) and invokes the shared
    /run-loop engine: pull next ready item -> resolve runner -> per-item
    mechanical gate (implement -> exit gate -> code-review -> auto-fix ->
    file findings -> atomic merge) -> record -> repeat to termination.
  - Risk-proportional auto-merge: AFK-frontier-first; worktree/HITL items
    open a PR and await a human; secret-bearing worktree items are gated by
    egress + pre-approval + scoped creds (refused unattended without them).
  - Safety: the catastrophic-command denylist hook must be active before any
    worktree item runs; absent, those items are refused (sandcastle still runs).
  - Ends with a run summary: AFK-merged / HITL-waiting / blocked-on-human.

Name chosen over /loop (the Anthropic interval-scheduler built-in) for
consistency with /run-wave.`;
