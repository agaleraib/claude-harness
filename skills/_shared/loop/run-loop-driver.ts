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
import {
  type AttentionRow,
  type AttentionSink,
  attentionReportPath,
  defaultAttentionSink,
  renderAttentionReport,
} from './run-loop-attention-report.ts';

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
 * The minimal shape of the repo-resolved gate config the preflight needs (Wave 24,
 * Task 3). Defined structurally here (not imported from `run-loop-prod-deps.ts`) to avoid
 * an import cycle — that module already imports `DriverConsole` from here. The concrete
 * `RepoGateConfig` (with `tests`/`typecheck`/`verify` commands) satisfies this shape.
 */
export interface PreflightGateConfig {
  /** True iff at least one runnable gate check resolved for this repo. */
  readonly isConfigured: boolean;
  /** Set when the gate env is internally inconsistent (a misconfigured gate). */
  readonly configError?: string;
}

/** Additive preflight options (Wave 22, Task 2 — Bug 2). */
export interface PreflightOptions {
  /**
   * Whether a real sandcastle container runner is wired. When `false` (the local live
   * path uses UnsupportedContainerRunner), sandcastle items are REFUSED at preflight
   * — surfaced in the preview — instead of being cleared only to detonate mid-run.
   * Absent ⇒ `true` (backward-compatible: sandcastle clears as before).
   */
  readonly containerLaneWired?: boolean;
  /**
   * The repo-resolved gate config (Wave 24, Task 3 — F-032). When the run has ready items
   * but NO gate is resolvable — not `isConfigured`, or a `configError` — AND the item
   * carries no own `gate` descriptor, the item is REFUSED before any agent dispatch:
   * /run-loop refuses to merge a repo whose checks it cannot run (fail-safe, mirroring the
   * Docker-absent / Claude-hook-absent refusals). Absent ⇒ no gate-based refusal
   * (backward-compatible with callers that do not yet thread the config).
   */
  readonly gateConfig?: PreflightGateConfig;
}

/** The one-line fix surfaced on a gate-unconfigured / gate-config-error refusal. */
const GATE_REFUSAL_FIX =
  'Add a `gate:` block (tests/typecheck/verify) to the target repo\'s `.harness-profile` — ' +
  '/run-loop refuses to merge a repo whose checks it cannot run.';

/** Whether an item carries its own runnable `gate` descriptor (clean-room/local path). */
function itemHasOwnGate(item: WorkItem): boolean {
  const gate = item['gate'];
  if (gate === null || typeof gate !== 'object') {
    return false;
  }
  for (const key of ['tests', 'typecheck', 'verify'] as const) {
    const v = (gate as Record<string, unknown>)[key];
    if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string')) {
      return true;
    }
  }
  return false;
}

/**
 * Backend-aware guardrail preflight. For each ready item:
 *   - sandcastle ⇒ cleared (the container is its boundary) — UNLESS the container lane
 *     is unwired (opts.containerLaneWired === false), in which case it is REFUSED so the
 *     operator sees it in the preview rather than a mid-run crash (Wave 22, Bug 2);
 *   - worktree + codex ⇒ cleared (Codex's native `-s workspace-write` is the boundary);
 *   - worktree + claude ⇒ REQUIRES the denylist hook; refused if it is not active.
 * The hook is probed at most once, and only when a Claude worktree item exists.
 */
export async function runBackendAwarePreflight(
  items: readonly WorkItem[],
  config: BackendConfig,
  hookProbe: HookProbe,
  opts: PreflightOptions = {},
): Promise<BackendAwarePreflight> {
  const containerLaneWired = opts.containerLaneWired ?? true;
  const needsHook = items.some(
    (i) => resolveRunnerKind(i) === 'worktree' && resolveImplementBackendId(i, config) === 'claude',
  );
  const hookActive = needsHook ? await hookProbe.isActive() : true;

  const cleared: WorkItem[] = [];
  const refused: PreflightRefusal[] = [];
  for (const item of items) {
    // Wave 24 (Task 3): fail-safe gate refusal — refuse BEFORE any agent dispatch when the
    // run has no resolvable gate for this item. A repo `configError` reds it (`gate-config-
    // error`); an unconfigured repo with no own item gate reds it (`gate-unconfigured`).
    // An item carrying its OWN `gate` descriptor (clean-room/local path) is exempt.
    if (opts.gateConfig !== undefined && !itemHasOwnGate(item)) {
      if (opts.gateConfig.configError !== undefined) {
        refused.push({
          itemId: item.id,
          reason: `gate-config-error: ${opts.gateConfig.configError}. ${GATE_REFUSAL_FIX}`,
        });
        continue;
      }
      if (!opts.gateConfig.isConfigured) {
        refused.push({
          itemId: item.id,
          reason: `gate-unconfigured: no gate commands resolved for this repo. ${GATE_REFUSAL_FIX}`,
        });
        continue;
      }
    }

    const kind = resolveRunnerKind(item);
    if (kind === 'sandcastle') {
      if (!containerLaneWired) {
        refused.push({
          itemId: item.id,
          reason:
            'sandcastle item but the container lane is not wired (UnsupportedContainerRunner) ' +
            'on this local live path; refused at preflight instead of detonating mid-run. ' +
            "Declare the item 'runner: worktree' to run it on the host, or wire a real " +
            'container runner.',
        });
        continue;
      }
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
    `  implement-failed:      ${report.implementFailed}`,
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
  /**
   * Whether a real sandcastle container runner is wired (Wave 22, Bug 2). Absent ⇒
   * true. When false, the backend-aware preflight refuses sandcastle items instead of
   * clearing them.
   */
  readonly containerLaneWired?: boolean;
  /**
   * The repo-resolved gate config (Wave 24, Task 3 — F-032). Threaded into the backend-
   * aware preflight so a run against a repo with no resolvable gate is REFUSED before any
   * agent dispatch (fail-safe). Absent ⇒ no gate-based refusal.
   */
  readonly gateConfig?: PreflightGateConfig;
  /**
   * Wave 23: the per-run attention rows (auto-merged ✓ / need-you ↓). When present, the
   * driver renders + writes `.harness-state/run-loop-<date>-attention.md` at run end and
   * prints a pointer line. `attentionSink`/`attentionDate` are injectable for tests.
   */
  readonly attention?: { readonly rows: readonly AttentionRow[] };
  readonly attentionSink?: AttentionSink;
  readonly attentionDate?: string;
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
  const pre = await runBackendAwarePreflight(deps.readyItems, deps.config, deps.hookProbe, {
    containerLaneWired: deps.containerLaneWired ?? true,
    ...(deps.gateConfig !== undefined ? { gateConfig: deps.gateConfig } : {}),
  });
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

  // 5. Attention report (Wave 23) — the persistent need-you to-do list. Written even
  //    when zero items need a human (header-only) so the operator always has latest state.
  if (deps.attention !== undefined) {
    const date = deps.attentionDate ?? new Date().toISOString().slice(0, 10);
    const path = attentionReportPath(date);
    const body = renderAttentionReport(deps.attention.rows, date);
    (deps.attentionSink ?? defaultAttentionSink).write(path, body);
    const needYou = deps.attention.rows.filter((r) => r.reason !== 'auto-merged').length;
    deps.console.print(`/run-loop attention report (${needYou} need you): ${path}`);
  }

  return { status: 'ran', summary, report };
}
