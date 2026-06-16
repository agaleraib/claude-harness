// status: KEEP (Wave 23) — the pickup-time AFK/HITL relabel path. Invoked when issue
// transitions are enabled (RUN_LOOP_TRANSITION_ISSUES); the default read-only drive
// skips it. Retained, not retired.
//
// Loop pickup-time classifier reconciliation (Wave 20, Task 12).
//
// At pickup, once an item's runner is resolved, the loop reconciles the issue's
// EXISTING readiness label (`ready-for-agent` / `ready-for-human`) against the shared
// 4-gate classifier (skills/_shared/classifier). On divergence it re-labels the issue
// and logs WHY. The `/to-issues` label is an initial hint only — the runner-aware test
// is authoritative once the runner is known.
//
// The re-label uses the existing TerminalTransitions.relabelItem two-phase machine
// (crash-safe, idempotent) — no parallel state machine. gh is the injected seam.

import {
  classify,
  type ClassifierRunnerKind,
  type RunnerCapabilities,
  type TaskCapabilitySignals,
} from '../classifier/classify.ts';
import {
  READY_FOR_AGENT,
  READY_FOR_HUMAN,
  type TerminalTransitions,
} from './providers/issue-provider.ts';
import { resolveRunnerKind, type WorkItem } from './types.ts';

/** Existing readiness label on an issue, or null when neither is present. */
export type ExistingLabel = 'ready-for-agent' | 'ready-for-human' | null;

/** The reconciliation outcome for one item. */
export interface ReconcileOutcome {
  readonly itemId: string;
  readonly runner: ClassifierRunnerKind;
  /** True when the classifier disagreed with the existing label and a re-label ran. */
  readonly relabeled: boolean;
  /** The label after reconciliation. */
  readonly finalLabel: 'ready-for-agent' | 'ready-for-human';
  readonly reason: string;
}

/** Read the existing readiness label off an item's gh labels. */
export function existingReadinessLabel(labels: readonly string[]): ExistingLabel {
  if (labels.includes(READY_FOR_HUMAN)) {
    return READY_FOR_HUMAN;
  }
  if (labels.includes(READY_FOR_AGENT)) {
    return READY_FOR_AGENT;
  }
  return null;
}

export interface ReconcileDeps {
  /** The two-phase transition machine (relabelItem) — crash-safe, idempotent. */
  readonly transitions: TerminalTransitions;
  /** Sink for the divergence log (the loop forwards these into the run summary). */
  readonly log: (line: string) => void;
}

/**
 * Reconcile one item's existing readiness label against the runner-aware classifier.
 * Re-labels (via the two-phase machine) and logs on divergence; a no-op when the
 * existing label already agrees. The runner is resolved from the item (sandcastle
 * default). `capabilities` overrides the runner defaults when the loop knows the run
 * injects specific secrets.
 */
export async function reconcileReadiness(
  item: WorkItem,
  signals: TaskCapabilitySignals,
  existing: ExistingLabel,
  deps: ReconcileDeps,
  capabilities?: RunnerCapabilities,
): Promise<ReconcileOutcome> {
  const runner = resolveRunnerKind(item);
  const verdict =
    capabilities !== undefined
      ? classify(signals, runner, capabilities)
      : classify(signals, runner);

  const issueNumber = item['issueNumber'];
  const want = verdict.readiness;

  if (existing === want) {
    return { itemId: item.id, runner, relabeled: false, finalLabel: want, reason: verdict.reason };
  }

  // Divergence: the runner-aware test overrides the initial /to-issues hint.
  const line =
    `run-loop classifier: ${item.id} labeled ${existing ?? '(none)'} but resolves to ${want} ` +
    `under runner=${runner} — ${verdict.reason}`;
  deps.log(line);

  if (typeof issueNumber === 'number') {
    await deps.transitions.relabelItem({ issueNumber, newLabel: want });
  }

  return { itemId: item.id, runner, relabeled: true, finalLabel: want, reason: line };
}
