// Leftover findings → GitHub issues (Wave 19, Task 7).
//
// Every MEDIUM/LOW finding (and any surviving-but-non-blocking note) from the
// per-item review is filed as a GitHub issue so nothing is silently dropped. Each
// filed issue is labeled `from:code-review` PLUS the source item's own label, and
// its body carries a back-reference to the source item. gh is the injected,
// stubbed seam.

import { type GhClient } from '../gh-seam.ts';
import { type Finding } from './review.ts';
import { type WorkItem } from '../types.ts';

export const FROM_CODE_REVIEW = 'from:code-review';

/**
 * The source item's own label, used to tag the filed findings issues so they trace
 * back to the work item. Issue items carry their readiness label here; wave items
 * carry a `wave:<n>` label. Absent ⇒ only `from:code-review` is applied.
 */
export function sourceLabelFor(item: WorkItem): string | undefined {
  const explicit = item['sourceLabel'];
  if (typeof explicit === 'string' && explicit.length > 0) {
    return explicit;
  }
  // Wave items expose a numeric waveNumber; derive a stable label.
  const waveNumber = item['waveNumber'];
  if (typeof waveNumber === 'number' && Number.isInteger(waveNumber)) {
    return `wave:${waveNumber}`;
  }
  return undefined;
}

/** A back-reference to the source item embedded in each filed issue body. */
export function backReference(item: WorkItem): string {
  const issueNumber = item['issueNumber'];
  if (typeof issueNumber === 'number') {
    return `Filed from /code-review on source issue #${issueNumber} (item \`${item.id}\`).`;
  }
  return `Filed from /code-review on source item \`${item.id}\`.`;
}

/**
 * File each leftover (MEDIUM/LOW / non-blocking) finding as its own GitHub issue.
 * Returns the created issue numbers in finding order. Zero findings ⇒ zero issues
 * (no gh mutation at all).
 */
export async function fileLeftoverFindings(
  item: WorkItem,
  findings: readonly Finding[],
  gh: GhClient,
): Promise<number[]> {
  if (findings.length === 0) {
    return [];
  }
  const sourceLabel = sourceLabelFor(item);
  const labels = sourceLabel !== undefined ? [FROM_CODE_REVIEW, sourceLabel] : [FROM_CODE_REVIEW];
  const ref = backReference(item);

  const created: number[] = [];
  for (const f of findings) {
    const body = [
      `**Severity:** ${f.severity}`,
      f.detail !== undefined ? `\n${f.detail}` : '',
      `\n${ref}`,
    ].join('');
    const number = await gh.createIssue({
      title: `[code-review:${f.severity}] ${f.title}`,
      body,
      labels,
    });
    created.push(number);
  }
  return created;
}
