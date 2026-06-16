// Wave 23 Task 4 — attention-report renderer tests (pure; no disk).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  type AttentionRow,
  attentionReportPath,
  renderAttentionReport,
} from '../run-loop-attention-report.ts';

test('T4: renders the header + a MERGE CONFLICT (PR) block + a FAILED CHECK (fallback) block', () => {
  const rows: AttentionRow[] = [
    { itemId: 'issue-1', reason: 'auto-merged' },
    { itemId: 'issue-2', title: 'distinct-values', reason: 'merge-conflict', branch: 'run-loop/issue-2', prUrl: 'https://github.com/o/r/pull/7' },
    { itemId: 'issue-3', reason: 'auto-merged' },
    { itemId: 'issue-5', title: 'refactor X', reason: 'failed-check', branch: 'run-loop/issue-5', fallbackCommands: ['git push -u origin run-loop/issue-5', 'gh pr create --draft --head run-loop/issue-5 --fill'] },
  ];
  const out = renderAttentionReport(rows, '2026-06-16');

  assert.match(out, /^# \/run-loop — needs your attention \(2026-06-16\)/);
  assert.match(out, /4 items: 2 auto-merged ✓ · 2 need you ↓/);
  // MERGE CONFLICT block with the PR url + next step.
  assert.match(out, /## issue-2 distinct-values — MERGE CONFLICT/);
  assert.match(out, /Branch pushed, PR opened: https:\/\/github\.com\/o\/r\/pull\/7/);
  assert.match(out, /→ open the link/);
  // FAILED CHECK block with the no-remote copy-paste commands.
  assert.match(out, /## issue-5 refactor X — FAILED CHECK/);
  assert.match(out, /git push -u origin run-loop\/issue-5/);
  assert.match(out, /gh pr create --draft --head run-loop\/issue-5 --fill/);
  // Auto-merged items are counted, not listed.
  assert.ok(!out.includes('issue-1'), 'auto-merged items are not listed');
});

test('T4: a zero-need-you run still renders a header-only report', () => {
  const out = renderAttentionReport([{ itemId: 'a', reason: 'auto-merged' }, { itemId: 'b', reason: 'auto-merged' }], '2026-06-16');
  assert.match(out, /2 items: 2 auto-merged ✓ · 0 need you ↓/);
  assert.ok(!out.includes('##'), 'no need-you blocks');
});

test('T4: attentionReportPath is the canonical dated .harness-state path', () => {
  assert.equal(attentionReportPath('2026-06-16'), '.harness-state/run-loop-2026-06-16-attention.md');
});
