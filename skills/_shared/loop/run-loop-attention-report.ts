// Persistent "needs your attention" report (Wave 23, Task 4).
//
// The loop's happy path auto-merges to HEAD with no human (the mantra). The few items
// that need a human — a merge conflict, a red gate, or a reproduced review finding —
// must never get LOST. Every run writes a one-glance to-do list to
// `.harness-state/run-loop-<date>-attention.md` that survives the terminal session:
// a header (`N items: X auto-merged ✓ · Y need you ↓`) and one `##` block per need-you
// item (reason + branch + PR link, or the no-remote copy-paste commands + a next step).
//
// The renderer is a pure function; the file write goes through an injected sink so unit
// tests assert the markdown without touching disk.

import { writeFileSync } from 'node:fs';

/** Why an item needs a human. `auto-merged` items are counted but not listed. */
export type AttentionReason = 'auto-merged' | 'merge-conflict' | 'failed-check' | 'review-finding';

/** One row in the attention report — produced by the per-item HITL handoff. */
export interface AttentionRow {
  readonly itemId: string;
  /** Short human title (the issue title); falls back to the id when absent. */
  readonly title?: string;
  readonly reason: AttentionReason;
  /** The preserved branch (set for every non-`auto-merged` row). */
  readonly branch?: string;
  /** The opened draft-PR url (set when the handoff pushed + opened a PR). */
  readonly prUrl?: string;
  /** The no-remote fallback: exact copy-paste commands to finish the item by hand. */
  readonly fallbackCommands?: readonly string[];
  /** A freeform next-step line for rows with no branch/PR/fallback (e.g. no edits produced). */
  readonly detail?: string;
}

/** The display label + default next-step line for each need-you reason. */
const REASON_LABEL: Record<Exclude<AttentionReason, 'auto-merged'>, string> = {
  'merge-conflict': 'MERGE CONFLICT',
  'failed-check': 'FAILED CHECK',
  'review-finding': 'REVIEW FINDING',
};

/** Accumulates rows across a run; the driver renders + writes them at the end. */
export class AttentionCollector {
  readonly rows: AttentionRow[] = [];
  record(row: AttentionRow): void {
    this.rows.push(row);
  }
}

/** The canonical report path for a `<date>` (YYYY-MM-DD). */
export function attentionReportPath(date: string): string {
  return `.harness-state/run-loop-${date}-attention.md`;
}

/** Render the attention report markdown (pure — no disk). */
export function renderAttentionReport(rows: readonly AttentionRow[], date: string): string {
  const needYou = rows.filter((r) => r.reason !== 'auto-merged');
  const autoMerged = rows.length - needYou.length;
  const lines: string[] = [
    `# /run-loop — needs your attention (${date})`,
    `${rows.length} items: ${autoMerged} auto-merged ✓ · ${needYou.length} need you ↓`,
  ];
  for (const r of needYou) {
    const label = REASON_LABEL[r.reason as Exclude<AttentionReason, 'auto-merged'>];
    lines.push('', `## ${r.itemId} ${r.title ?? ''}`.trimEnd() + ` — ${label}`);
    if (r.prUrl !== undefined) {
      lines.push(`   Branch pushed, PR opened: ${r.prUrl}`);
      lines.push('   → open the link, resolve, click Merge');
    } else if (r.fallbackCommands !== undefined && r.fallbackCommands.length > 0) {
      lines.push(`   Your work is safe on branch: ${r.branch ?? '(unknown)'}`);
      lines.push('   → no git remote configured — finish it by hand:');
      for (const cmd of r.fallbackCommands) {
        lines.push(`     ${cmd}`);
      }
    } else if (r.detail !== undefined) {
      lines.push(`   → ${r.detail}`);
    } else {
      lines.push(`   Your work is safe on branch: ${r.branch ?? '(unknown)'}`);
    }
  }
  return lines.join('\n') + '\n';
}

/** The file-write seam (injected so tests never touch disk). */
export interface AttentionSink {
  write(path: string, body: string): void;
}

/** The default sink — writes to the real filesystem under the repo. */
export const defaultAttentionSink: AttentionSink = {
  write(path, body) {
    writeFileSync(path, body);
  },
};
