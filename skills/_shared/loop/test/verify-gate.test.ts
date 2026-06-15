// Wave 21 Task 4 — mechanical gate + verify-gate (reviewer proposes, gate decides).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  type FindingFixer,
  type FindingReproducer,
  type VerifyGateDeps,
  fileReproducedFinding,
  findingMarker,
  runVerifyGate,
} from '../protocol/verify-gate.ts';
import { runExitGate, type GateRunner } from '../protocol/gate.ts';
import { type ReviewFinding } from '../dispatch/backends.ts';
import { type WorkItem } from '../types.ts';
import { GhStub } from './gh-stub.ts';

async function filed(gh: GhStub) {
  return gh.listByLabelAllStates('from:code-review');
}

const ITEM: WorkItem = { id: 'i1', sourceLabel: 'ready-for-agent' };

const REAL: ReviewFinding = {
  severity: 'HIGH',
  title: 'non-string coercion',
  detail: 'parseDuration(["1h"]) -> 3600',
};
const FALSE_POSITIVE: ReviewFinding = {
  severity: 'MEDIUM',
  title: 'JS $ matches before newline',
};

/** A reproducer keyed by finding title: reproduces (fails) only for listed titles. */
function reproducerFor(reproduceTitles: Set<string>, fixedTitles?: Set<string>): FindingReproducer {
  return {
    async reproduce(_item, finding) {
      // After a fix, a title moved into fixedTitles stops reproducing.
      if (fixedTitles?.has(finding.title)) {
        return false;
      }
      return reproduceTitles.has(finding.title);
    },
  };
}

// --- mechanical gate: red blocks merge -------------------------------------------

test('T4: a red exit gate (failing test) is NOT green — the protocol never merges it', async () => {
  const redGate: GateRunner = {
    async runTests() { return false; }, // deliberately failing test
    async runTypecheck() { return true; },
    async runVerify() { return true; },
  };
  const result = await runExitGate(ITEM, redGate);
  assert.equal(result.green, false);
  assert.equal(result.checks.tests, false);
  assert.match(result.note ?? '', /tests/);
});

// --- verify-gate: real finding reproduces and drives a fix round ------------------

test('T4: a real finding reproduces, a fix round clears it (status: fixed)', async () => {
  const gh = new GhStub();
  const fixed = new Set<string>();
  const fixer: FindingFixer = {
    async fix(_item, finding) {
      fixed.add(finding.title); // the fix makes it stop reproducing
    },
  };
  const deps: VerifyGateDeps = {
    reproducer: reproducerFor(new Set([REAL.title]), fixed),
    fixer,
    gh,
  };
  const result = await runVerifyGate(ITEM, [REAL], deps);
  assert.equal(result.escalate, false);
  assert.equal(result.triaged[0]?.status, 'fixed');
  assert.equal((await filed(gh)).length, 0, 'a fixed finding is not filed');
});

// --- verify-gate: false positive does NOT reproduce → advisory -------------------

test('T4: a false-positive finding does not reproduce → advisory, not acted on', async () => {
  const gh = new GhStub();
  const logs: string[] = [];
  let fixCalls = 0;
  const deps: VerifyGateDeps = {
    reproducer: reproducerFor(new Set([REAL.title])), // FP title NOT in the reproduce set
    fixer: { async fix() { fixCalls += 1; } },
    gh,
    logger: { log: (m) => logs.push(m) },
  };
  const result = await runVerifyGate(ITEM, [FALSE_POSITIVE], deps);
  assert.equal(result.escalate, false);
  assert.equal(result.triaged[0]?.status, 'advisory');
  assert.deepEqual(result.advisory, [FALSE_POSITIVE]);
  assert.equal(fixCalls, 0, 'never auto-fix an unreproduced finding');
  assert.equal((await filed(gh)).length, 0, 'advisory findings are not filed as issues');
  assert.match(logs[0] ?? '', /advisory/);
});

// --- verify-gate: reproduced-but-unfixed → escalate + file ------------------------

test('T4: a reproduced finding that the fixer cannot clear is filed + escalates', async () => {
  const gh = new GhStub();
  const deps: VerifyGateDeps = {
    reproducer: reproducerFor(new Set([REAL.title])), // never moves to fixed
    fixer: { async fix() { /* fix does nothing — still reproduces */ } },
    gh,
    maxFixRounds: 1,
  };
  const result = await runVerifyGate(ITEM, [REAL], deps);
  assert.equal(result.escalate, true);
  const t = result.triaged[0];
  assert.equal(t?.status, 'reproduced-unfixed');
  const issues = await filed(gh);
  assert.equal(issues.length, 1, 'reproduced-but-unfixed is filed once');
  assert.match(issues[0]?.title ?? '', /verify-gate:HIGH/);
});

// --- idempotent filing: re-run files no duplicate --------------------------------

test('T4: re-running the verify-gate files no duplicate issue (idempotent marker)', async () => {
  const gh = new GhStub();
  // First run files it.
  const n1 = await fileReproducedFinding(ITEM, REAL, gh);
  const after1 = await filed(gh);
  assert.equal(after1.length, 1);
  // The marker is present in the filed body.
  assert.match(
    after1[0]?.body ?? '',
    new RegExp(findingMarker(ITEM, REAL).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
  // Second run finds the existing issue by marker and reuses it — no new issue.
  const n2 = await fileReproducedFinding(ITEM, REAL, gh);
  assert.equal(n2, n1);
  assert.equal((await filed(gh)).length, 1, 'no duplicate issue on re-run');
});
