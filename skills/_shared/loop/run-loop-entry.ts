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

/**
 * Front-door entry (Wave 21, Task 5). Parses argv, short-circuits `--help` BEFORE any
 * side effect (printing only the usage), and otherwise delegates the chosen source to
 * the live driver via the injected `runDrive` callback (so the SKILL.md body / a live
 * run wires the production driver, and tests assert the short-circuit + delegation
 * without building real EngineDeps).
 *
 * Returns the parsed args' mode so callers know what happened; on `run` it awaits the
 * delegate. The `--yes` bypass is surfaced to the delegate.
 */
export async function runEntry(
  argv: readonly string[],
  io: {
    readonly print: (line: string) => void;
    readonly runDrive: (source: WorkSourceArg, opts: { readonly yes: boolean }) => Promise<void>;
  },
): Promise<ParsedRunLoopArgs> {
  const parsed = parseRunLoopArgs(argv.filter((a) => a !== '--yes'));
  if (parsed.mode === 'help') {
    io.print(RUN_LOOP_USAGE); // short-circuit: nothing else runs.
    return parsed;
  }
  if (parsed.mode === 'error') {
    io.print(parsed.message);
    return parsed;
  }
  const yes = argv.includes('--yes');
  await io.runDrive(parsed.source, { yes });
  return parsed;
}

/** The usage text printed on --help (no side effects before this). */
export const RUN_LOOP_USAGE = `/run-loop — drive plan.md waves OR gh issues end-to-end behind the mechanical gate.

Usage:
  /run-loop waves        # drive ready docs/plan.md waves
  /run-loop issues       # drive ready-for-agent gh issues
  /run-loop --help       # print this and exit

Per-run backend direction (Wave 22 knob; flag WINS over env):
  --implement <codex|claude>                        (env RUN_LOOP_IMPLEMENT_BACKEND)
  --review <anthropic-api:opus-4.8|codex|openrouter:<model>>  (env RUN_LOOP_REVIEW_BACKEND)
  Defaults: implement=codex, review=anthropic-api:opus-4.8. An unknown value errors
  before any drive runs. Egress is unchanged: review=codex is local (no gate);
  review=anthropic-api / openrouter require RUN_LOOP_ALLOW_EXTERNAL_REVIEW=1.

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

// --- Production wiring (Wave 21, Task 5 completion) --------------------------------
//
// The entry EXECUTABLE assembles the REAL graph and drives it. Imports are kept INSIDE
// runProduction (dynamic) so importing this module for its pure parsers (the unit
// tests) does not pull in the heavy production composition root.

/**
 * Run a /run-loop source end-to-end through the REAL production graph: build production
 * EngineDeps (providers + the production protocol with the T2 implement adapters + T3
 * review backends + GhCliAdapter for issues mode), run the backend-aware guardrail
 * preflight, the preview (--yes bypass), runLoop, and print the RunSummaryReport.
 *
 * `waves` mode is not wired for the live local path yet (the wave provider drives
 * plan.md, not a throwaway repo); `issues` mode is the live path. An optional
 * `localSource` lets a fully local throwaway smoke (no GitHub remote) drive the SAME
 * production protocol + driver without `gh`.
 */
export async function runProduction(
  source: WorkSourceArg,
  opts: {
    readonly yes: boolean;
    readonly print?: (line: string) => void;
    /** Clean-room local drive: a throwaway repo dir + a JSON item file (no gh). */
    readonly localRepo?: string;
    readonly localItemFile?: string;
    /** Per-run backend-direction overrides (Task 6 knob; already validated). */
    readonly implement?: string;
    readonly review?: string;
  },
): Promise<void> {
  const print = opts.print ?? ((l: string) => console.log(l));
  const { drive } = await import('./run-loop-driver.ts');
  const prodMod = await import('./run-loop-prod-deps.ts');
  const overrides = {
    ...(opts.implement !== undefined ? { implementDefault: opts.implement } : {}),
    ...(opts.review !== undefined ? { reviewDefault: opts.review } : {}),
  };

  // Clean-room local path (committed): --repo + --item-file drive the SAME production
  // graph against a throwaway repo with one local item — no `gh`, no GitHub mutation.
  if (opts.localRepo !== undefined && opts.localItemFile !== undefined) {
    const { readFileSync } = await import('node:fs');
    const item = JSON.parse(readFileSync(opts.localItemFile, 'utf8')) as Record<string, unknown> & { id: string };
    const config = prodMod.buildBackendConfigFromEnv(process.env, overrides);
    const prod = prodMod.buildLocalCleanRoomDeps({ repoDir: opts.localRepo, item, config, seams: { console: { print } } });
    await drive({
      engine: prod.engine,
      config: prod.config,
      readyItems: prod.readyItems,
      hookProbe: { async isActive() { return false; } },
      console: { print },
      confirm: { async confirm() { return true; } },
      buildReport: (summary) => prod.buildReport(summary),
      yes: opts.yes,
      containerLaneWired: prod.containerLaneWired,
    });
    return;
  }

  if (source === 'waves') {
    print('/run-loop: `waves` live drive is not wired for the local path yet; use `issues`.');
    return;
  }
  const prod = await prodMod.buildIssuesProductionDeps(undefined, overrides);
  await drive({
    engine: prod.engine,
    config: prod.config,
    readyItems: prod.readyItems,
    hookProbe: { async isActive() { return false; } }, // Codex worktree needs no hook
    console: { print },
    confirm: { async confirm() { return true; } }, // CLI confirm; --yes also bypasses
    buildReport: (summary) => prod.buildReport(summary),
    yes: opts.yes,
    containerLaneWired: prod.containerLaneWired,
  });
}

/**
 * CLI entry: `node run-loop-entry.ts <source> [--yes]`. Parses, short-circuits --help,
 * and otherwise drives the production graph. Guarded by import.meta.main so importing
 * this module never triggers a run.
 */
export async function main(argv: readonly string[]): Promise<void> {
  const flagValue = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  const localRepo = flagValue('--repo');
  const localItemFile = flagValue('--item-file');

  // --help / unknown-source still short-circuit FIRST (no knob validation, no side
  // effect) — the documented contract. parseRunLoopArgs ignores the knob flags.
  const pre = parseRunLoopArgs(argv.filter((a) => a !== '--yes'));
  if (pre.mode !== 'run') {
    await runEntry(argv, { print: (l) => console.log(l), runDrive: async () => {} });
    return;
  }

  // Task 6 knob: resolve the per-run backend direction (flag WINS over env), VALIDATE it
  // before any drive side effect (mirror the --help / unknown-source short-circuit), and
  // thread it into runProduction. An unknown value prints a clear error and returns —
  // the drive never starts. Egress is unchanged + composes (validated downstream).
  const { validateImplementBackendId, parseReviewBackendId } = await import('./dispatch/backends.ts');
  const implementSel = flagValue('--implement') ?? process.env['RUN_LOOP_IMPLEMENT_BACKEND'];
  const reviewSel = flagValue('--review') ?? process.env['RUN_LOOP_REVIEW_BACKEND'];
  let implement: string | undefined;
  let review: string | undefined;
  try {
    if (implementSel !== undefined) {
      implement = validateImplementBackendId(implementSel);
    }
    if (reviewSel !== undefined) {
      // parseReviewBackendId throws on an unknown kind / missing model — the validation.
      parseReviewBackendId(reviewSel);
      review = reviewSel;
    }
  } catch (err) {
    console.log(err instanceof Error ? err.message : String(err));
    return; // short-circuit BEFORE any drive side effect.
  }
  if (implement !== undefined || review !== undefined) {
    console.log(
      `/run-loop direction: implement=${implement ?? 'codex (default)'} ` +
        `review=${review ?? 'anthropic-api:opus-4.8 (default)'}`,
    );
  }

  await runEntry(argv, {
    print: (l) => console.log(l),
    runDrive: (src, o) =>
      runProduction(src, {
        yes: o.yes,
        ...(localRepo !== undefined ? { localRepo } : {}),
        ...(localItemFile !== undefined ? { localItemFile } : {}),
        ...(implement !== undefined ? { implement } : {}),
        ...(review !== undefined ? { review } : {}),
      }),
  });
}

// Direct-run shim: only fires when this file is the executed entry point.
if (import.meta.main) {
  void main(process.argv.slice(2));
}
