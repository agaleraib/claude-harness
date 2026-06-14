// Unit tests for the wave WorkSource provider (Wave 19, Task 3).
//
// Run: `node --test skills/_shared/loop/test/*.test.ts`

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  type SpecLinkReader,
  type WaveWorkItem,
  buildWaveItems,
  parseWaveBlocks,
  WaveWorkSource,
} from '../providers/wave-provider.ts';

/** A spec-link reader that returns nothing — keeps the parser test disk-free. */
const NULL_READER: SpecLinkReader = {
  async read(): Promise<string | null> {
    return null;
  },
};

// Fixture: two waves. Wave A (10) declares Runner: worktree; Wave B (11) leaves
// the runner unspecified (⇒ sandcastle default) and is Blocked by Wave A. The
// `### ` headings on either side and a trailing `## ` section close the blocks.
const PLAN_FIXTURE = `# Plan

## Now

### Wave 10 — alpha feature
- Runner: worktree
- spec: docs/specs/2026-06-14-alpha.md

**Exit gate:** alpha's tests green and tsc clean.

### Wave 11 — beta feature
- depends-on: Wave 10 merged
- spec: docs/specs/2026-06-14-beta.md

**Exit gate:** beta's acceptance checks pass.

## Recently Shipped
- [x] Wave 9 - prior work -> docs/waves/wave9.md (abc1234)
`;

test('T3: parses 2 waves with correct runners and a single A→B edge', async () => {
  const items = await buildWaveItems(PLAN_FIXTURE, NULL_READER);

  assert.equal(items.length, 2, 'two wave items');

  const byId = new Map<string, WaveWorkItem>(items.map((i) => [i.id, i]));
  const a = byId.get('wave-10');
  const b = byId.get('wave-11');
  assert.ok(a, 'wave-10 present');
  assert.ok(b, 'wave-11 present');

  assert.equal(a.runner, 'worktree', 'wave A declared worktree');
  assert.equal(b.runner, 'sandcastle', 'wave B unspecified ⇒ sandcastle default');

  // Exactly one dependency edge across the whole set: A → B (B blocked by A).
  assert.deepEqual(a.blockedBy, [], 'wave A has no blockers');
  assert.deepEqual(b.blockedBy, ['wave-10'], 'wave B blocked by wave A');

  const totalEdges = items.reduce((n, i) => n + i.blockedBy.length, 0);
  assert.equal(totalEdges, 1, 'a single A→B dependency edge across the set');
});

test('T3: exit gate captured verbatim per wave', async () => {
  const items = await buildWaveItems(PLAN_FIXTURE, NULL_READER);
  const a = items.find((i) => i.id === 'wave-10');
  assert.ok(a);
  assert.match(a.exitGate, /alpha's tests green and tsc clean/);
  // The next `### Wave` heading must NOT bleed into A's exit gate.
  assert.doesNotMatch(a.exitGate, /beta/);
});

test('T3: synthetic spec is the block body; spec link appended when resolvable', async () => {
  const reader: SpecLinkReader = {
    async read(path: string): Promise<string | null> {
      return path === 'docs/specs/2026-06-14-alpha.md' ? 'ALPHA SPEC BODY' : null;
    },
  };
  const items = await buildWaveItems(PLAN_FIXTURE, reader);
  const a = items.find((i) => i.id === 'wave-10');
  const b = items.find((i) => i.id === 'wave-11');
  assert.ok(a && b);
  assert.match(a.syntheticSpec, /alpha feature/, 'block body is the synthetic spec');
  assert.match(a.syntheticSpec, /ALPHA SPEC BODY/, 'resolved spec link is appended');
  assert.match(a.syntheticSpec, /--- linked spec \(docs\/specs\/2026-06-14-alpha\.md\) ---/);
  // B's spec link does not resolve (reader returns null) ⇒ body only, no separator.
  assert.doesNotMatch(b.syntheticSpec, /--- linked spec/);
});

test('T3: specPath provenance recorded when present', async () => {
  const blocks = parseWaveBlocks(PLAN_FIXTURE);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]?.specPath, 'docs/specs/2026-06-14-alpha.md');
  assert.equal(blocks[1]?.specPath, 'docs/specs/2026-06-14-beta.md');
});

test('T3: WaveWorkSource yields items in order, honors isDone, never re-yields', async () => {
  const items = await buildWaveItems(PLAN_FIXTURE, NULL_READER);
  const source = new WaveWorkSource(items, ['wave-10']);

  const first = await source.nextReady();
  assert.equal(first?.id, 'wave-11', 'wave-10 pre-marked done is skipped');
  const second = await source.nextReady();
  assert.equal(second, null, 'drained after the one ready item');

  // allItems exposes the full set for the Task 8 scheduler.
  assert.equal(source.allItems().length, 2);
});

test('T3: a Runner: line with an unknown value falls back to sandcastle', async () => {
  const plan = `### Wave 1 — weird runner
- Runner: kubernetes
`;
  const items = await buildWaveItems(plan, NULL_READER);
  assert.equal(items[0]?.runner, 'sandcastle');
});
