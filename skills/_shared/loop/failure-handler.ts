// Failure escalation (Wave 19, Task 9).
//
// A failed item undergoes the single terminal transition for failure. For issue
// items this is Task 4's escalateItem (two-phase, crash-safe, idempotent). For wave
// items (no gh issue) the equivalent two-phase markers live in `.harness-state/`
// via the journal, and the wave row is left un-ticked with a logged escalation
// pointer.
//
// Idempotent: a terminal failure marker present ⇒ NO second escalation, NO
// re-dispatch.

import { type Journal, type JournalRecord } from './state-journal.ts';
import { type TerminalTransitions } from './providers/issue-provider.ts';
import { type WorkItem } from './types.ts';

/** The failure terminal marker key for a wave item. */
export function waveEscalatedKey(runId: string, itemId: string): string {
  return `run-loop:${runId}:${itemId}:escalated`;
}

/** The wave-escalation two-phase records written to `.harness-state/`. */
interface WaveTransitionRecord extends JournalRecord {
  readonly kind: 'wave-transition';
  readonly itemId: string;
  readonly runId: string;
  /** 'started' (durable intent) or 'escalated' (terminal commit). */
  readonly phase: 'started' | 'escalated';
  /** For the terminal record: the escalation pointer (issue/note) — logged, not ticked. */
  readonly escalationPointer?: string;
}

/** True if `itemId` already carries the wave terminal failure marker. */
async function waveAlreadyEscalated(
  journal: Journal,
  runId: string,
  itemId: string,
): Promise<boolean> {
  const records = await journal.readAll();
  return records.some(
    (r) =>
      r['kind'] === 'wave-transition' &&
      r['itemId'] === itemId &&
      r['phase'] === 'escalated' &&
      r['runId'] === runId,
  );
}

/**
 * Escalate a failed WAVE item via the two-phase markers in the journal:
 *   1. started (durable intent) — written first;
 *   2. escalated (terminal) — written last, carrying the escalation pointer.
 * The wave row is left un-ticked (the caller does not tick plan.md). Idempotent.
 * Returns true when a NEW escalation was written, false when it was already done.
 */
export async function escalateWaveItem(
  journal: Journal,
  runId: string,
  item: WorkItem,
  pointer: string,
): Promise<boolean> {
  if (await waveAlreadyEscalated(journal, runId, item.id)) {
    return false; // terminal marker present — no second escalation
  }
  const started: WaveTransitionRecord = {
    kind: 'wave-transition',
    itemId: item.id,
    runId,
    phase: 'started',
  };
  await journal.append(started);
  const escalated: WaveTransitionRecord = {
    kind: 'wave-transition',
    itemId: item.id,
    runId,
    phase: 'escalated',
    escalationPointer: pointer,
  };
  await journal.append(escalated);
  return true;
}

/**
 * Escalate any failed item. Issue items (carrying `issueNumber`) route through the
 * Task 4 two-phase escalateItem; wave items route through the journal markers.
 * Returns true when a new escalation was performed.
 */
export async function escalateFailure(
  item: WorkItem,
  opts: {
    readonly runId: string;
    readonly transitions?: TerminalTransitions;
    readonly waveJournal?: Journal;
    readonly note?: string;
  },
): Promise<boolean> {
  const issueNumber = item['issueNumber'];
  if (typeof issueNumber === 'number' && opts.transitions !== undefined) {
    // escalateItem is itself idempotent (terminal marker ⇒ no-op).
    await opts.transitions.escalateItem({
      issueNumber,
      escalation: {
        title: `Escalation: ${item.id} failed in /run-loop (run ${opts.runId})`,
        body: opts.note ?? `Item ${item.id} failed; escalated for human review.`,
      },
    });
    return true;
  }
  if (opts.waveJournal !== undefined) {
    return escalateWaveItem(opts.waveJournal, opts.runId, item, opts.note ?? 'gate-failed');
  }
  throw new Error(`run-loop: cannot escalate ${item.id} — no transitions or wave journal provided`);
}
