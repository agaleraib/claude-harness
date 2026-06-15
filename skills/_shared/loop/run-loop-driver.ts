// The live /run-loop driver (Wave 21, Task 5).
//
// run-loop-entry.ts parses the args + selects the source; this module is the live
// driver it delegates to once a source is chosen. It:
//   1. resolves each ready item's runner + implement/review backends (the preview);
//   2. runs the BACKEND-AWARE guardrail preflight (Codex worktree relies on its native
//      OS sandbox → not refused; Claude worktree requires the denylist hook → refused
//      if absent; sandcastle always passes — the container is its boundary);
//   3. prints the pre-run preview ("N ready items + resolved backends/runners —
//      proceed?") and waits for confirmation unless `--yes` bypasses it (cron);
//   4. runs the frozen runLoop;
//   5. prints the RunSummaryReport ALONGSIDE the frozen RunSummary.
//
// Every effect (preflight, confirm prompt, console) is an injected seam so the whole
// deterministic flow is unit-testable WITHOUT live Codex / Anthropic credentials. The
// live end-to-end drain (real agent + real review) is operator-gated — see the wave
// summary's Human-only TODOs.

import { type EngineDeps, type RunSummary, type WorkItem, resolveRunnerKind } from './types.ts';
import { runLoop } from './engine.ts';
import {
  type BackendConfig,
  resolveImplementBackendId,
  resolveReviewBackendId,
} from './dispatch/backends.ts';
import { type RunSummaryReport } from './termination.ts';

/** Probe whether the Claude-backend denylist hook is active (Wave-20 guardrail). */
export interface HookProbe {
  isActive(): Promise<boolean>;
}

/** The console seam (stdout lines). Injected so the preview/summary text is asserted. */
export interface DriverConsole {
  print(line: string): void;
}

/** The confirm seam: returns true to proceed. `--yes` skips it entirely. */
export interface Confirmer {
  confirm(prompt: string): Promise<boolean>;
}

/** A backend-aware preflight refusal for one item. */
export interface PreflightRefusal {
  readonly itemId: string;
  readonly reason: string;
}

/** The backend-aware preflight result. */
export interface BackendAwarePreflight {
  /** Items cleared to run, in input order. */
  readonly cleared: readonly WorkItem[];
  /** Items refused (Claude worktree without the hook), with reasons. */
  readonly refused: readonly PreflightRefusal[];
  /** True if the hook was active (only probed when a Claude worktree item exists). */
  readonly hookActive: boolean;
}

/**
 * Backend-aware guardrail preflight. For each ready item:
 *   - sandcastle ⇒ cleared (the container is its boundary);
 *   - worktree + codex ⇒ cleared (Codex's native `-s workspace-write` is the boundary);
 *   - worktree + claude ⇒ REQUIRES the denylist hook; refused if it is not active.
 * The hook is probed at most once, and only when a Claude worktree item exists.
 */
export async function runBackendAwarePreflight(
  items: readonly WorkItem[],
  config: BackendConfig,
  hookProbe: HookProbe,
): Promise<BackendAwarePreflight> {
  const needsHook = items.some(
    (i) => resolveRunnerKind(i) === 'worktree' && resolveImplementBackendId(i, config) === 'claude',
  );
  const hookActive = needsHook ? await hookProbe.isActive() : true;

  const cleared: WorkItem[] = [];
  const refused: PreflightRefusal[] = [];
  for (const item of items) {
    const kind = resolveRunnerKind(item);
    if (kind === 'sandcastle') {
      cleared.push(item);
      continue;
    }
    // worktree
    const backend = resolveImplementBackendId(item, config);
    if (backend === 'codex') {
      cleared.push(item); // native OS sandbox is the boundary — not gated on the hook.
      continue;
    }
    // claude worktree → requires the hook.
    if (hookActive) {
      cleared.push(item);
    } else {
      refused.push({
        itemId: item.id,
        reason:
          'Claude-backend worktree item requires the catastrophic-command denylist hook ' +
          '(its confinement story); the hook is not active, so this item is refused. A ' +
          'Codex worktree item would not be (its native sandbox is the boundary).',
      });
    }
  }
  return { cleared, refused, hookActive };
}

/** Build the human pre-run preview lines: N items + each item's resolved runner/backends. */
export function buildPreview(items: readonly WorkItem[], config: BackendConfig): readonly string[] {
  const lines: string[] = [`/run-loop preview: ${items.length} ready item(s).`];
  for (const item of items) {
    const runner = resolveRunnerKind(item);
    const implement = resolveImplementBackendId(item, config);
    const review = resolveReviewBackendId(item, config);
    const reviewId = review.model !== undefined ? `${review.kind}:${review.model}` : review.kind;
    lines.push(`  - ${item.id}: runner=${runner} implement=${implement} review=${reviewId}`);
  }
  lines.push('Proceed? (use --yes to bypass this prompt for cron)');
  return lines;
}

/** Render the run summary report (printed alongside the frozen RunSummary). */
export function buildSummaryLines(report: RunSummaryReport, frozen: RunSummary): readonly string[] {
  return [
    '/run-loop summary:',
    `  merged-afk:            ${report.mergedAfk}`,
    `  opened-awaiting-human: ${report.openedAwaitingHuman}`,
    `  deferred-blocked:      ${report.deferredBlockedOnHuman}`,
    `  escalated:             ${report.escalated}`,
    `  gate-failed:           ${report.gateFailed}`,
    `  stop-reason:           ${report.stopReason}`,
    `  visited (${report.visited.length}): ${report.visited.join(', ')}`,
    `  [frozen RunSummary] stopReason=${frozen.stopReason} visited=${frozen.visited.length}`,
  ];
}

/** Everything the live driver needs injected (deterministic + testable). */
export interface DriverDeps {
  /** Production EngineDeps (providers + protocol + DefaultRunnerFactory + preflight). */
  readonly engine: EngineDeps;
  /** Resolved backend config (selection + keys; never logged). */
  readonly config: BackendConfig;
  /** The ready items, in source order, for the preview + backend-aware preflight. */
  readonly readyItems: readonly WorkItem[];
  readonly hookProbe: HookProbe;
  readonly console: DriverConsole;
  readonly confirm: Confirmer;
  /** Builds the RunSummaryReport from the frozen RunSummary (Wave-19 metric surface). */
  readonly buildReport: (summary: RunSummary) => RunSummaryReport;
  /** When true, skip the confirm prompt (cron / --yes). */
  readonly yes: boolean;
}

/** Why a drive ended before running the loop (or its summary). */
export type DriveOutcome =
  | { readonly status: 'ran'; readonly summary: RunSummary; readonly report: RunSummaryReport }
  | { readonly status: 'aborted-preflight'; readonly refused: readonly PreflightRefusal[] }
  | { readonly status: 'declined' };

/**
 * Drive one /run-loop run end to end (after the source is selected). Backend-aware
 * preflight → preview → confirm → runLoop → summary. `runGuardrailPreflight` (via the
 * injected engine.preflight) is invoked by runLoop BEFORE the first item; the
 * backend-aware refusal here is the additional Claude-hook gate the driver owns.
 */
export async function drive(deps: DriverDeps): Promise<DriveOutcome> {
  // 1. Backend-aware preflight. A Claude worktree item without the hook is refused;
  //    a Codex item is not. If everything is refused, abort before the loop.
  const pre = await runBackendAwarePreflight(deps.readyItems, deps.config, deps.hookProbe);
  for (const r of pre.refused) {
    deps.console.print(`refused: ${r.itemId} — ${r.reason}`);
  }
  if (pre.cleared.length === 0 && pre.refused.length > 0) {
    return { status: 'aborted-preflight', refused: pre.refused };
  }

  // 2. Preview + confirm (unless --yes).
  for (const line of buildPreview(pre.cleared, deps.config)) {
    deps.console.print(line);
  }
  if (!deps.yes) {
    const ok = await deps.confirm.confirm('Proceed with the run?');
    if (!ok) {
      deps.console.print('aborted: operator declined the preview.');
      return { status: 'declined' };
    }
  }

  // 3. Run the frozen engine. Its injected preflight (runGuardrailPreflight) runs
  //    before the first item; if it throws, the loop aborts there.
  const summary = await runLoop(deps.engine);

  // 4. Summary — RunSummaryReport ALONGSIDE the frozen RunSummary.
  const report = deps.buildReport(summary);
  for (const line of buildSummaryLines(report, summary)) {
    deps.console.print(line);
  }
  return { status: 'ran', summary, report };
}
