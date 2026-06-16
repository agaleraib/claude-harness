// Wave 21 Task 5 — the live driver (deterministic portion; LIVE drain is DEFERRED).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  type DriverConsole,
  type HookProbe,
  buildPreview,
  buildSummaryLines,
  drive,
  runBackendAwarePreflight,
} from '../run-loop-driver.ts';
import { runEntry } from '../run-loop-entry.ts';
import { type BackendConfig } from '../dispatch/backends.ts';
import { type EngineDeps, type RunSummary, type WorkItem } from '../types.ts';
import { type RunSummaryReport } from '../termination.ts';
import { StubWorkSource, StubRunnerFactory, NoopProtocol } from './stubs.ts';

const EMPTY_CONFIG: BackendConfig = {};

function hook(active: boolean): HookProbe {
  return { async isActive() { return active; } };
}
function recordingConsole(): { console: DriverConsole; lines: string[] } {
  const lines: string[] = [];
  return { console: { print: (l) => lines.push(l) }, lines };
}
const REPORT: RunSummaryReport = {
  mergedAfk: 1,
  openedAwaitingHuman: 0,
  deferredBlockedOnHuman: 0,
  escalated: 0,
  gateFailed: 0,
  deepestBlockedSubtree: 0,
  stopReason: 'drained',
  visited: ['i1'],
};

// --- backend-aware preflight ------------------------------------------------------

test('T5: a Claude worktree item WITHOUT the hook is refused; a Codex worktree item is not', async () => {
  const items: WorkItem[] = [
    { id: 'codex-wt', runner: 'worktree', implementBackend: 'codex' },
    { id: 'claude-wt', runner: 'worktree', implementBackend: 'claude' },
  ];
  const pre = await runBackendAwarePreflight(items, EMPTY_CONFIG, hook(false));
  assert.deepEqual(pre.cleared.map((i) => i.id), ['codex-wt']);
  assert.equal(pre.refused.length, 1);
  assert.equal(pre.refused[0]?.itemId, 'claude-wt');
  assert.match(pre.refused[0]?.reason ?? '', /denylist hook/);
});

test('T5: with the hook active, a Claude worktree item clears', async () => {
  const items: WorkItem[] = [{ id: 'claude-wt', runner: 'worktree', implementBackend: 'claude' }];
  const pre = await runBackendAwarePreflight(items, EMPTY_CONFIG, hook(true));
  assert.deepEqual(pre.cleared.map((i) => i.id), ['claude-wt']);
  assert.equal(pre.refused.length, 0);
});

test('T5: a sandcastle item always clears (container is its boundary), hook never probed', async () => {
  let probed = false;
  const probe: HookProbe = { async isActive() { probed = true; return false; } };
  const items: WorkItem[] = [{ id: 'sc', runner: 'sandcastle', implementBackend: 'claude' }];
  const pre = await runBackendAwarePreflight(items, EMPTY_CONFIG, probe);
  assert.deepEqual(pre.cleared.map((i) => i.id), ['sc']);
  assert.equal(probed, false, 'no Claude WORKTREE item ⇒ the hook is not probed');
});

// --- Wave 22 Bug 2: preflight REFUSES sandcastle when the container lane is unwired --

test('T2: an unwired container lane REFUSES a sandcastle item (was: cleared)', async () => {
  const items: WorkItem[] = [{ id: 'sc', runner: 'sandcastle' }];
  const pre = await runBackendAwarePreflight(items, EMPTY_CONFIG, hook(true), {
    containerLaneWired: false,
  });
  assert.equal(pre.cleared.length, 0, 'sandcastle item is NOT cleared when the lane is unwired');
  assert.equal(pre.refused.length, 1);
  assert.equal(pre.refused[0]?.itemId, 'sc');
  assert.match(pre.refused[0]?.reason ?? '', /container lane is not wired/);
});

test('T2: a wired container lane (default) still clears a sandcastle item', async () => {
  const items: WorkItem[] = [{ id: 'sc', runner: 'sandcastle' }];
  const wired = await runBackendAwarePreflight(items, EMPTY_CONFIG, hook(true), {
    containerLaneWired: true,
  });
  assert.deepEqual(wired.cleared.map((i) => i.id), ['sc']);
  // And the option is backward-compatible: omitting it clears (the pre-Wave-22 default).
  const omitted = await runBackendAwarePreflight(items, EMPTY_CONFIG, hook(true));
  assert.deepEqual(omitted.cleared.map((i) => i.id), ['sc']);
});

// --- preview + summary text -------------------------------------------------------

test('T5: the preview lists each item with its resolved runner + backends', () => {
  const lines = buildPreview([{ id: 'i1' }], EMPTY_CONFIG);
  assert.match(lines[0] ?? '', /1 ready item/);
  assert.match(lines[1] ?? '', /i1: runner=sandcastle implement=codex review=anthropic-api:opus-4.8/);
  assert.match(lines.at(-1) ?? '', /--yes/);
});

test('T5: the summary prints the AFK/HITL/blocked metric alongside the frozen RunSummary', () => {
  const frozen: RunSummary = { stopReason: 'drained', visited: ['i1'], results: [] };
  const lines = buildSummaryLines(REPORT, frozen);
  assert.ok(lines.some((l) => /merged-afk:\s+1/.test(l)));
  assert.ok(lines.some((l) => /opened-awaiting-human:/.test(l)));
  assert.ok(lines.some((l) => /deferred-blocked:/.test(l)));
  assert.ok(lines.some((l) => /frozen RunSummary/.test(l)));
});

// --- drive(): preflight invoked before first item, --yes bypass, summary ----------

test('T5: drive runs the loop and the engine preflight fires BEFORE the first item', async () => {
  const order: string[] = [];
  const source = new StubWorkSource([{ id: 'i1' }]);
  const protocol = {
    async run(item: WorkItem, _r: unknown) {
      order.push(`protocol:${item.id}`);
      return { itemId: item.id, status: 'completed' as const };
    },
  };
  const engine: EngineDeps = {
    source,
    protocol: protocol as unknown as NoopProtocol,
    runnerFactory: new StubRunnerFactory(),
    preflight: async () => {
      order.push('preflight');
    },
  };
  const { console: con, lines } = recordingConsole();
  const outcome = await drive({
    engine,
    config: EMPTY_CONFIG,
    readyItems: [{ id: 'i1' }],
    hookProbe: hook(true),
    console: con,
    confirm: { async confirm() { throw new Error('--yes should bypass confirm'); } },
    buildReport: () => REPORT,
    yes: true,
  });
  assert.equal(outcome.status, 'ran');
  // preflight strictly precedes the first item's protocol run.
  assert.deepEqual(order, ['preflight', 'protocol:i1']);
  assert.ok(lines.some((l) => /merged-afk:\s+1/.test(l)));
});

test('T5: drive aborts before the loop when every item is refused at preflight', async () => {
  let loopRan = false;
  const engine: EngineDeps = {
    source: { async nextReady() { loopRan = true; return null; }, async isDone() { return false; }, async recordResult() {} },
    protocol: new NoopProtocol(),
    runnerFactory: new StubRunnerFactory(),
  };
  const { console: con } = recordingConsole();
  const outcome = await drive({
    engine,
    config: EMPTY_CONFIG,
    readyItems: [{ id: 'claude-wt', runner: 'worktree', implementBackend: 'claude' }],
    hookProbe: hook(false),
    console: con,
    confirm: { async confirm() { return true; } },
    buildReport: () => REPORT,
    yes: true,
  });
  assert.equal(outcome.status, 'aborted-preflight');
  assert.equal(loopRan, false, 'the loop must not start when all items are refused');
});

test('T5: drive honors a declined preview (no --yes) and never runs the loop', async () => {
  let loopRan = false;
  const engine: EngineDeps = {
    source: { async nextReady() { loopRan = true; return null; }, async isDone() { return false; }, async recordResult() {} },
    protocol: new NoopProtocol(),
    runnerFactory: new StubRunnerFactory(),
  };
  const { console: con } = recordingConsole();
  const outcome = await drive({
    engine,
    config: EMPTY_CONFIG,
    readyItems: [{ id: 'i1' }],
    hookProbe: hook(true),
    console: con,
    confirm: { async confirm() { return false; } }, // operator declines
    buildReport: () => REPORT,
    yes: false,
  });
  assert.equal(outcome.status, 'declined');
  assert.equal(loopRan, false);
});

// --- entry --help short-circuit ---------------------------------------------------

test('T5: runEntry --help prints usage and NEVER delegates to the driver', async () => {
  let drove = false;
  const lines: string[] = [];
  const parsed = await runEntry(['--help'], {
    print: (l) => lines.push(l),
    runDrive: async () => { drove = true; },
  });
  assert.equal(parsed.mode, 'help');
  assert.equal(drove, false, '--help short-circuits before any drive');
  assert.match(lines[0] ?? '', /\/run-loop/);
});

test('T5: runEntry delegates a valid source to the driver and forwards --yes', async () => {
  let seen: { source: string; yes: boolean } | undefined;
  const parsed = await runEntry(['issues', '--yes'], {
    print: () => {},
    runDrive: async (source, opts) => { seen = { source, yes: opts.yes }; },
  });
  assert.equal(parsed.mode, 'run');
  assert.deepEqual(seen, { source: 'issues', yes: true });
});
