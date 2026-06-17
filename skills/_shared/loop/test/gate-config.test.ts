// Wave 24, Task 1 (F-030) — repo-resolved gate config tests.
//
// buildGateConfigFromEnv parses the RUN_LOOP_GATE_* env into a RepoGateConfig per
// Decision 7 (NO shell sniffing: argv form is a JSON string[], shell form is a *_SHELL
// scalar). The same check in both forms — or invalid JSON — is a configError. A
// present-but-empty value omits the key (a legitimate partial gate). The ShellGateRunner
// built with a config spawns the argv directly (no shell) or `sh -c <value>` for the
// shell form, honoring the stubbed exit code. No real spawn here.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ShellGateRunner, buildGateConfigFromEnv, type Command } from '../run-loop-prod-deps.ts';
import { type SpawnFn, type SpawnResult } from '../dispatch/spawn.ts';
import { type WorkItem } from '../types.ts';

function argvOf(c: Command | undefined): readonly string[] | undefined {
  return c !== undefined && 'argv' in c ? c.argv : undefined;
}

// (1) all three JSON-argv vars ⇒ exact argv arrays, isConfigured true.
test('T1: three JSON-argv vars parse to the exact argv arrays + isConfigured', () => {
  const cfg = buildGateConfigFromEnv({
    RUN_LOOP_GATE_TESTS: '["npm","test"]',
    RUN_LOOP_GATE_TYPECHECK: '["tsc","--noEmit"]',
    RUN_LOOP_GATE_VERIFY: '["node","verify.js"]',
  });
  assert.deepEqual(argvOf(cfg.tests), ['npm', 'test']);
  assert.deepEqual(argvOf(cfg.typecheck), ['tsc', '--noEmit']);
  assert.deepEqual(argvOf(cfg.verify), ['node', 'verify.js']);
  assert.equal(cfg.isConfigured, true);
  assert.equal(cfg.configError, undefined);
});

// (2) a quoted/multi-arg argv round-trips intact (proves NO re-tokenization).
test('T1: a multi-arg argv round-trips intact (no re-tokenization)', () => {
  const cfg = buildGateConfigFromEnv({ RUN_LOOP_GATE_TESTS: '["bash","-lc","echo hi"]' });
  assert.deepEqual(argvOf(cfg.tests), ['bash', '-lc', 'echo hi']);
});

// (3) none set ⇒ empty config, isConfigured false, no configError.
test('T1: no gate env ⇒ empty config, isConfigured false, no configError', () => {
  const cfg = buildGateConfigFromEnv({});
  assert.equal(cfg.tests, undefined);
  assert.equal(cfg.typecheck, undefined);
  assert.equal(cfg.verify, undefined);
  assert.equal(cfg.isConfigured, false);
  assert.equal(cfg.configError, undefined);
});

// (4) an empty value ⇒ that check omitted; the others remain (partial gate).
test('T1: RUN_LOOP_GATE_TYPECHECK="" ⇒ typecheck omitted, tests/verify remain', () => {
  const cfg = buildGateConfigFromEnv({
    RUN_LOOP_GATE_TESTS: '["npm","test"]',
    RUN_LOOP_GATE_TYPECHECK: '',
    RUN_LOOP_GATE_VERIFY: '["node","v.js"]',
  });
  assert.deepEqual(argvOf(cfg.tests), ['npm', 'test']);
  assert.equal(cfg.typecheck, undefined);
  assert.deepEqual(argvOf(cfg.verify), ['node', 'v.js']);
  assert.equal(cfg.isConfigured, true);
  assert.equal(cfg.configError, undefined);
});

test('T1: an empty JSON array ([]) ⇒ that check omitted, NOT a config error (partial gate)', () => {
  const cfg = buildGateConfigFromEnv({ RUN_LOOP_GATE_TESTS: '[]', RUN_LOOP_GATE_VERIFY: '["v"]' });
  assert.equal(cfg.tests, undefined);
  assert.deepEqual(argvOf(cfg.verify), ['v']);
  assert.equal(cfg.isConfigured, true);
  assert.equal(cfg.configError, undefined);
});

// (5) a *_SHELL scalar ⇒ a { shell } command.
test('T1: a *_SHELL scalar ⇒ a { shell } command', () => {
  const cfg = buildGateConfigFromEnv({ RUN_LOOP_GATE_TESTS_SHELL: 'npm test && tsc -p .' });
  assert.deepEqual(cfg.tests, { shell: 'npm test && tsc -p .' });
  assert.equal(cfg.isConfigured, true);
  assert.equal(cfg.configError, undefined);
});

// (6) the SAME check in BOTH forms ⇒ configError names that check.
test('T1: a check in BOTH argv and *_SHELL ⇒ configError names that check', () => {
  const cfg = buildGateConfigFromEnv({
    RUN_LOOP_GATE_TESTS: '["npm","test"]',
    RUN_LOOP_GATE_TESTS_SHELL: 'npm test',
  });
  assert.ok(cfg.configError !== undefined, 'configError is set');
  assert.match(cfg.configError ?? '', /tests/);
  assert.match(cfg.configError ?? '', /BOTH/i);
});

// (7) malformed JSON in an argv var ⇒ key omitted + configError.
test('T1: malformed JSON in an argv var ⇒ key omitted + configError', () => {
  const cfg = buildGateConfigFromEnv({ RUN_LOOP_GATE_TESTS: 'npm test' });
  assert.equal(cfg.tests, undefined);
  assert.ok(cfg.configError !== undefined);
  assert.match(cfg.configError ?? '', /tests/);
  assert.match(cfg.configError ?? '', /JSON/i);
  // No runnable check resolved ⇒ not configured (a misconfigured gate is not "configured").
  assert.equal(cfg.isConfigured, false);
});

test('T1: a non-array JSON value (5) ⇒ configError', () => {
  const cfg = buildGateConfigFromEnv({ RUN_LOOP_GATE_TYPECHECK: '5' });
  assert.equal(cfg.typecheck, undefined);
  assert.match(cfg.configError ?? '', /typecheck/);
});

// --- ShellGateRunner built with a RepoGateConfig spawns correctly -----------------

test('T1: a ShellGateRunner built with an argv config spawns argv[0] + rest, NO shell', async () => {
  const calls: Array<{ cmd: string; argv: readonly string[] }> = [];
  const spawn: SpawnFn = async (cmd, argv): Promise<SpawnResult> => {
    calls.push({ cmd, argv });
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  const cfg = buildGateConfigFromEnv({ RUN_LOOP_GATE_TESTS: '["npm","run","test:unit"]' });
  const gate = new ShellGateRunner(spawn, '/repo', cfg);
  const item: WorkItem = { id: 'x' };
  assert.equal(await gate.runTests(item), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.cmd, 'npm', 'spawns argv[0] directly (no shell)');
  assert.deepEqual(calls[0]?.argv, ['run', 'test:unit']);
});

test('T1: a ShellGateRunner built with a { shell } config spawns sh -c <value>', async () => {
  const calls: Array<{ cmd: string; argv: readonly string[] }> = [];
  const spawn: SpawnFn = async (cmd, argv): Promise<SpawnResult> => {
    calls.push({ cmd, argv });
    return { exitCode: 3, stdout: '', stderr: 'boom' };
  };
  const cfg = buildGateConfigFromEnv({ RUN_LOOP_GATE_TESTS_SHELL: 'npm test && tsc' });
  const gate = new ShellGateRunner(spawn, '/repo', cfg);
  const item: WorkItem = { id: 'x' };
  // exit 3 ⇒ red (the stubbed exit code is honored).
  assert.equal(await gate.runTests(item), false);
  assert.equal(calls[0]?.cmd, 'sh');
  assert.deepEqual(calls[0]?.argv, ['-c', 'npm test && tsc']);
  assert.match(gate.note() ?? '', /boom/, 'a red check captures a stderr tail in the note');
});

test('T1: an absent sub-check passes (runCmd(undefined) → true) under an otherwise-configured gate', async () => {
  const spawn: SpawnFn = async (): Promise<SpawnResult> => ({ exitCode: 0, stdout: '', stderr: '' });
  const cfg = buildGateConfigFromEnv({ RUN_LOOP_GATE_TESTS: '["true"]' }); // tests-only (partial)
  const gate = new ShellGateRunner(spawn, '/repo', cfg);
  const item: WorkItem = { id: 'x' };
  assert.equal(await gate.runTypecheck(item), true, 'absent typecheck passes (partial gate)');
  assert.equal(await gate.runVerify(item), true, 'absent verify passes (partial gate)');
  assert.equal(gate.isConfiguredFor(item), true, 'a tests-only repo config is configured');
});

test('T1: an item gate descriptor WINS over the repo config (precedence)', async () => {
  const calls: Array<{ cmd: string; argv: readonly string[] }> = [];
  const spawn: SpawnFn = async (cmd, argv): Promise<SpawnResult> => {
    calls.push({ cmd, argv });
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  const cfg = buildGateConfigFromEnv({ RUN_LOOP_GATE_TESTS: '["repo-test"]' });
  const gate = new ShellGateRunner(spawn, '/repo', cfg);
  const item: WorkItem = { id: 'x', gate: { tests: ['item-test', '--fast'] } };
  await gate.runTests(item);
  assert.equal(calls[0]?.cmd, 'item-test', 'the item descriptor wins over the repo config');
  assert.deepEqual(calls[0]?.argv, ['--fast']);
});

test('T1: isConfiguredFor is true via the item gate even with an unconfigured repo config', () => {
  const spawn: SpawnFn = async (): Promise<SpawnResult> => ({ exitCode: 0, stdout: '', stderr: '' });
  const gate = new ShellGateRunner(spawn, '/repo'); // default unconfigured repo config
  assert.equal(gate.isConfiguredFor({ id: 'x' }), false, 'no item gate + no repo config ⇒ unconfigured');
  assert.equal(gate.isConfiguredFor({ id: 'x', gate: { tests: ['t'] } }), true, 'an item gate ⇒ configured');
});
