// Wave 21 Task 6(a) — clean-room smoke harness.
//
// Wires the FULL T1–T5 stack end-to-end against a REAL throwaway git repo, driving one
// ready item through: read -> implement (agent edits, runner commits) -> exit gate ->
// review -> verify-gate -> summary. The agent + review backends are FAKES injected at
// the T1 seams (no live Codex / Anthropic call) so the smoke is hermetic and runs in CI.
//
// This proves the pieces COMPOSE: the same path a live run takes, with the two
// non-deterministic leaves (the agentic CLI + the review model) swapped for fakes. The
// LIVE clean-room smoke (real codex exec + real Opus review) is DEFERRED to the operator
// runbook — see test/live-test-runbook.md — because it needs ANTHROPIC_API_KEY
// (review-only), which is absent in this worktree.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  type AgentDispatchContext,
  type AgentDispatchResult,
  type ImplementBackendId,
  type ReviewFinding,
} from '../dispatch/backends.ts';
import {
  CodexImplementAdapter,
  ShellGitCommitter,
  type ContainerRunner,
  runImplementWithCommit,
} from '../dispatch/implement.ts';
import { type SpawnFn, defaultSpawn } from '../dispatch/spawn.ts';
import { runExitGate, type GateRunner } from '../protocol/gate.ts';
import { runVerifyGate, type FindingReproducer, type FindingFixer } from '../protocol/verify-gate.ts';
import { buildSummaryLines } from '../run-loop-driver.ts';
import { RunSummaryBuilder } from '../termination.ts';
import { type WorkItem, type RunSummary } from '../types.ts';
import { GhStub } from './gh-stub.ts';

class NoContainer implements ContainerRunner {
  async run(
    _backend: ImplementBackendId,
    _command: string,
    _argv: readonly string[],
    _ctx: AgentDispatchContext,
  ): Promise<AgentDispatchResult> {
    throw new Error('smoke is worktree-lane only');
  }
}

test('T6(a): clean-room smoke — read -> implement -> gate -> review -> verify -> summary', async (t) => {
  // --- a real throwaway repo with a base commit ---
  const dir = mkdtempSync(join(tmpdir(), 'loop-smoke-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  writeFileSync(join(dir, 'README.md'), '# project\n');
  git('add', 'README.md');
  git('commit', '-q', '-m', 'base');

  const item: WorkItem = { id: 'smoke-1', runner: 'worktree', implementBackend: 'codex' };

  // --- 1. IMPLEMENT: a FAKE agent (codex stand-in) edits a workspace file; the runner
  //        commits via REAL git; collectCommits recovers the SHA. ---
  const fakeAgentSpawn: SpawnFn = async (_cmd, _argv, options) => {
    writeFileSync(join(options.cwd, 'parse-duration.ts'), 'export const parseDuration = (s: string) => 0;\n');
    return { exitCode: 0, stdout: 'edited', stderr: '' };
  };
  const codex = new CodexImplementAdapter({ spawn: fakeAgentSpawn, container: new NoContainer() });
  const { result, commits } = await runImplementWithCommit({
    backend: codex,
    committer: new ShellGitCommitter(defaultSpawn),
    prompt: 'implement parseDuration',
    ctx: { cwd: dir, env: process.env as Record<string, string>, lane: 'worktree' },
    commitMessage: 'feat: parseDuration',
  });
  assert.equal(result.ok, true);
  assert.equal(commits.length, 1, 'one commit produced');
  assert.equal(readFileSync(join(dir, 'parse-duration.ts'), 'utf8').length > 0, true);

  // --- 2. EXIT GATE: green (the fake gate passes tests+typecheck+verify). ---
  const greenGate: GateRunner = {
    async runTests() { return true; },
    async runTypecheck() { return true; },
    async runVerify() { return true; },
  };
  const gate = await runExitGate(item, greenGate);
  assert.equal(gate.green, true, 'green gate ⇒ eligible to proceed');

  // --- 3. REVIEW: a FAKE reviewer returns the spike's TWO findings — one real, one FP. ---
  const reviewFindings: ReviewFinding[] = [
    { severity: 'HIGH', title: 'non-string coercion', detail: 'parseDuration(["1h"]) -> 3600' },
    { severity: 'MEDIUM', title: 'JS $ matches before newline' },
  ];

  // --- 4. VERIFY-GATE: the real finding reproduces + is fixed; the FP does not
  //        reproduce ⇒ advisory. Nothing escalates; no issue filed. ---
  const gh = new GhStub();
  const fixed = new Set<string>();
  const reproducer: FindingReproducer = {
    async reproduce(_i, f) {
      if (fixed.has(f.title)) return false;
      return f.title === 'non-string coercion'; // only the REAL finding reproduces
    },
  };
  const fixer: FindingFixer = { async fix(_i, f) { fixed.add(f.title); } };
  const vg = await runVerifyGate(item, reviewFindings, { reproducer, fixer, gh });
  assert.equal(vg.escalate, false, 'real finding fixed, FP advisory ⇒ no escalation');
  assert.deepEqual(vg.advisory.map((f) => f.title), ['JS $ matches before newline']);
  assert.equal((await gh.listByLabelAllStates('from:code-review')).length, 0, 'no issue filed');

  // --- 5. SUMMARY: an AFK-merged item emits the run-summary metric. ---
  const builder = new RunSummaryBuilder();
  builder.recordMerged(item.id);
  const report = builder.build('drained');
  const frozen: RunSummary = { stopReason: 'drained', visited: [item.id], results: [] };
  const lines = buildSummaryLines(report, frozen);
  assert.ok(lines.some((l) => /merged-afk:\s+1/.test(l)), 'summary records the AFK merge');
  assert.equal(report.mergedAfk, 1);
});
