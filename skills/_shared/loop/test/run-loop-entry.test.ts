// Tests for the /run-loop entry point + real gh adapter (Wave 20, Task 16).
//
// Verify: /run-loop --help short-circuits with no side effects; `waves`/`issues`
// select the right source; an unknown source errors with the valid set. Plus the real
// gh adapter's getIssue + listByLabelAllStates argv + parsing against a stub runner.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { main, parseRunLoopArgs, VALID_SOURCES } from '../run-loop-entry.ts';
import {
  GhCliAdapter,
  parseIssueJson,
  type CommandRunner,
} from '../gh-adapter.ts';

// --- entry-point argument parsing ---

test('T16: --help short-circuits to help mode (before any source parsing)', () => {
  assert.equal(parseRunLoopArgs(['--help']).mode, 'help');
  assert.equal(parseRunLoopArgs(['-h']).mode, 'help');
  assert.equal(parseRunLoopArgs(['help']).mode, 'help');
  // --help wins even when a source is also present.
  assert.equal(parseRunLoopArgs(['issues', '--help']).mode, 'help');
});

test('T16: `waves` selects the wave source', () => {
  const p = parseRunLoopArgs(['waves']);
  assert.equal(p.mode, 'run');
  if (p.mode === 'run') {
    assert.equal(p.source, 'waves');
  }
});

test('T16: `issues` selects the issue source', () => {
  const p = parseRunLoopArgs(['issues']);
  assert.equal(p.mode, 'run');
  if (p.mode === 'run') {
    assert.equal(p.source, 'issues');
  }
});

test('T16: an unknown source errors with the valid set', () => {
  const p = parseRunLoopArgs(['foo']);
  assert.equal(p.mode, 'error');
  if (p.mode === 'error') {
    assert.match(p.message, /unknown work source "foo"/);
    for (const s of VALID_SOURCES) {
      assert.match(p.message, new RegExp(s));
    }
  }
});

test('T16: a missing source errors (not a crash)', () => {
  assert.equal(parseRunLoopArgs([]).mode, 'error');
});

// --- Wave 22 Task 6: the per-run backend-direction knob (validate-before-side-effect) -

/** Run `fn` with console.log captured; restore on return. */
async function captureLog(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => { lines.push(a.map(String).join(' ')); };
  try {
    await fn();
  } finally {
    console.log = orig;
  }
  return lines;
}

test('T6: an unknown --implement errors and NEVER starts a drive', async () => {
  const lines = await captureLog(() => main(['issues', '--implement', 'gpt5']));
  assert.ok(lines.some((l) => /unknown implement backend "gpt5"/.test(l)), 'the error is printed');
  // The drive never started: no direction line, no preview, no summary.
  assert.equal(lines.some((l) => /\/run-loop direction:/.test(l)), false);
  assert.equal(lines.some((l) => /preview|summary|refused/.test(l)), false, 'no drive side effect');
});

test('T6: an unknown --review errors and NEVER starts a drive', async () => {
  const lines = await captureLog(() => main(['issues', '--review', 'bogus:x']));
  assert.ok(lines.some((l) => /unknown review backend "bogus:x"/.test(l)), 'the error is printed');
  assert.equal(lines.some((l) => /\/run-loop direction:|preview|summary/.test(l)), false, 'no drive side effect');
});

test('T6: an unknown value from the ENV var also short-circuits before any drive', async () => {
  const prev = process.env['RUN_LOOP_IMPLEMENT_BACKEND'];
  process.env['RUN_LOOP_IMPLEMENT_BACKEND'] = 'nope';
  try {
    const lines = await captureLog(() => main(['issues']));
    assert.ok(lines.some((l) => /unknown implement backend "nope"/.test(l)));
    assert.equal(lines.some((l) => /preview|summary/.test(l)), false, 'no drive side effect');
  } finally {
    if (prev === undefined) delete process.env['RUN_LOOP_IMPLEMENT_BACKEND'];
    else process.env['RUN_LOOP_IMPLEMENT_BACKEND'] = prev;
  }
});

test('T6: --help short-circuits BEFORE the knob is validated (usage prints; no knob error)', async () => {
  const lines = await captureLog(() => main(['issues', '--implement', 'gpt5', '--help']));
  // --help is the documented no-side-effect short-circuit: usage prints and the invalid
  // knob is NEVER validated (no error, no drive).
  assert.ok(lines.some((l) => /\/run-loop —/.test(l)), 'usage printed');
  assert.equal(lines.some((l) => /unknown implement backend/.test(l)), false, 'knob not validated under --help');
});

// --- real gh adapter: argv construction + JSON parsing via a stub CommandRunner ---

/** A CommandRunner that records argv and returns scripted stdout per call. */
class StubRunner implements CommandRunner {
  readonly calls: { command: string; args: readonly string[] }[] = [];
  private readonly responses: string[];
  private idx = 0;
  constructor(responses: readonly string[] = []) {
    this.responses = [...responses];
  }
  async run(command: string, args: readonly string[]): Promise<string> {
    this.calls.push({ command, args });
    const r = this.responses[this.idx++];
    if (r === undefined) {
      throw new Error('stub: no scripted response (simulating gh non-zero exit)');
    }
    return r;
  }
}

test('T16 gh adapter: getIssue issues `gh issue view <n> --json ...` and parses labels/state', async () => {
  const runner = new StubRunner([
    JSON.stringify({
      number: 2,
      title: 'T2',
      body: 'body',
      labels: [{ name: 'ready-for-agent' }, { name: 'runner:sandcastle' }],
      state: 'OPEN',
    }),
  ]);
  const gh = new GhCliAdapter(runner);
  const issue = await gh.getIssue(2);
  assert.ok(issue !== null);
  assert.equal(issue?.number, 2);
  assert.deepEqual(issue?.labels, ['ready-for-agent', 'runner:sandcastle']);
  assert.equal(issue?.state, 'open');
  assert.deepEqual(runner.calls[0]?.args.slice(0, 3), ['issue', 'view', '2']);
});

test('T16 gh adapter: getIssue returns null when gh exits non-zero (issue absent)', async () => {
  const gh = new GhCliAdapter(new StubRunner([])); // no scripted response ⇒ throws ⇒ null
  assert.equal(await gh.getIssue(999), null);
});

test('T16 gh adapter: listByLabelAllStates uses --state all --label and parses the array', async () => {
  const runner = new StubRunner([
    JSON.stringify([
      { number: 3, title: 'T3', body: '', labels: [{ name: 'transitioning' }], state: 'CLOSED' },
    ]),
  ]);
  const gh = new GhCliAdapter(runner);
  const issues = await gh.listByLabelAllStates('transitioning');
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.state, 'closed');
  const args = runner.calls[0]?.args ?? [];
  assert.ok(args.includes('--state') && args[args.indexOf('--state') + 1] === 'all');
  assert.ok(args.includes('--label') && args[args.indexOf('--label') + 1] === 'transitioning');
});

test('T16 gh adapter: createIssue parses the new issue number from the printed URL', async () => {
  const runner = new StubRunner(['https://github.com/o/r/issues/4242\n']);
  const gh = new GhCliAdapter(runner);
  const n = await gh.createIssue({ title: 't', body: 'b', labels: ['ready-for-human'] });
  assert.equal(n, 4242);
});

test('T16 gh adapter: parseIssueJson normalizes string labels and missing fields', () => {
  const issue = parseIssueJson({ number: 7, labels: ['a', { name: 'b' }] });
  assert.equal(issue.number, 7);
  assert.deepEqual(issue.labels, ['a', 'b']);
  assert.equal(issue.title, '');
  assert.equal(issue.state, 'open');
});
