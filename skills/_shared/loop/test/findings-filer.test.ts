// Unit tests for leftover findings → issues (Wave 19, Task 7).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  FROM_CODE_REVIEW,
  backReference,
  fileLeftoverFindings,
  sourceLabelFor,
} from '../protocol/findings-filer.ts';
import { type Finding } from '../protocol/review.ts';
import { type WorkItem } from '../types.ts';
import { GhStub } from './gh-stub.ts';

const MED1: Finding = { id: 'm1', severity: 'MEDIUM', title: 'tighten the loop bound', detail: 'detail 1' };
const MED2: Finding = { id: 'm2', severity: 'LOW', title: 'rename a variable' };

// An issue work item carrying its readiness label as the source label.
const ISSUE_ITEM: WorkItem = {
  id: 'issue-42',
  issueNumber: 42,
  sourceLabel: 'ready-for-agent',
};

test('T7: two findings produce two gh issues with correct labels + back-reference', async () => {
  const gh = new GhStub();
  const created = await fileLeftoverFindings(ISSUE_ITEM, [MED1, MED2], gh);

  assert.equal(created.length, 2, 'two issues created');

  for (const number of created) {
    const issue = gh.peek(number);
    assert.ok(issue, 'created issue exists');
    assert.ok(issue.labels.includes(FROM_CODE_REVIEW), 'labeled from:code-review');
    assert.ok(issue.labels.includes('ready-for-agent'), 'labeled with the source item label');
    assert.match(issue.body, /source issue #42/, 'back-reference to the source item');
  }

  // Severity is reflected in the title.
  const titles = created.map((n) => gh.peek(n)?.title ?? '');
  assert.ok(titles.some((t) => t.includes('[code-review:MEDIUM]')));
  assert.ok(titles.some((t) => t.includes('[code-review:LOW]')));
});

test('T7: zero findings produce zero issues (no gh mutation)', async () => {
  const gh = new GhStub();
  const created = await fileLeftoverFindings(ISSUE_ITEM, [], gh);
  assert.deepEqual(created, []);
  assert.equal(gh.calls.length, 0, 'no gh calls at all for zero findings');
});

test('T7: wave items derive a wave:<n> source label', async () => {
  const waveItem: WorkItem = { id: 'wave-19', waveNumber: 19 };
  assert.equal(sourceLabelFor(waveItem), 'wave:19');
  assert.match(backReference(waveItem), /source item `wave-19`/);

  const gh = new GhStub();
  const created = await fileLeftoverFindings(waveItem, [MED1], gh);
  const issue = gh.peek(created[0]!);
  assert.ok(issue?.labels.includes('wave:19'));
});

test('T7: an item with no derivable source label is filed with only from:code-review', async () => {
  const bare: WorkItem = { id: 'item-x' };
  assert.equal(sourceLabelFor(bare), undefined);
  const gh = new GhStub();
  const created = await fileLeftoverFindings(bare, [MED1], gh);
  const issue = gh.peek(created[0]!);
  assert.deepEqual(issue?.labels, [FROM_CODE_REVIEW]);
});
