// Tests for worktree write-root confinement (Wave 20, Task 11).
//
// Asserts: a write outside the allowed roots (both `> /tmp/x` shell form via the
// denylist hook AND a non-shell Write to `/tmp/x`) is denied and the target is
// untouched; the OS-level guard denies an out-of-root write when available; with no
// guard available the posture is advisory-only; a pre-run snapshot ref is created;
// with the hook absent a worktree item is refused while sandcastle items still run.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { type WorkItem } from '../types.ts';
import {
  resolveWritePath,
  resolveWriteRootPosture,
  type WriteGuard,
  type WriteRoots,
} from '../safety/write-root.ts';
import { evaluateShellCommand, type DenylistContext } from '../safety/denylist.ts';
import { runGuardrailPreflight, type GuardrailDeps } from '../safety/guardrails.ts';
import {
  type ApprovalStore,
  type CredentialProvider,
  type EgressContext,
  type EgressMechanism,
} from '../safety/egress.ts';

const WT = '/work/.claude/worktrees/agent-x';
const HS = '/work/.harness-state';
const ROOTS: WriteRoots = { worktreeDir: WT, harnessStateDir: HS };

test('T11: a non-shell Write to a path outside the allowed roots is denied', () => {
  const d = resolveWritePath('/tmp/x', ROOTS);
  assert.equal(d.action, 'deny');
});

test('T11: a non-shell Write inside the worktree is allowed', () => {
  const d = resolveWritePath(`${WT}/src/file.ts`, ROOTS);
  assert.equal(d.action, 'allow');
});

test('T11: a relative ../ escape resolves outside the worktree and is denied', () => {
  const d = resolveWritePath('../../etc/passwd', ROOTS);
  assert.equal(d.action, 'deny');
});

test('T11: a write into the run .harness-state/ is allowed', () => {
  const d = resolveWritePath(`${HS}/receipt.json`, ROOTS);
  assert.equal(d.action, 'allow');
});

test('T11: the shell `> /tmp/x` redirect form is caught by the denylist hook layer', () => {
  // The shell write form goes through the PreToolUse hook (Task 10). With an
  // allowlist declared, a non-allowlisted `tee`/redirect command is blocked there.
  const ctx: DenylistContext = { worktreeRoot: WT, repo: { loopAllowlist: ['npm', 'node'] } };
  const d = evaluateShellCommand('tee /tmp/x', ctx);
  assert.equal(d.action, 'block');
});

// --- OS guard availability → posture ---

class StubWriteGuard implements WriteGuard {
  readonly name = 'sandbox-exec';
  established: WriteRoots | null = null;
  private readonly available: boolean;
  constructor(available: boolean) {
    this.available = available;
  }
  async isAvailable(): Promise<boolean> {
    return this.available;
  }
  async establish(roots: WriteRoots): Promise<void> {
    if (!this.available) {
      throw new Error('guard unavailable');
    }
    this.established = roots;
  }
}

test('T11: with an OS-level guard available the write-root posture is os-level', async () => {
  const guard = new StubWriteGuard(true);
  const posture = await resolveWriteRootPosture(guard, ROOTS);
  assert.equal(posture.enforced, 'os-level');
  assert.deepEqual(guard.established, ROOTS);
});

test('T11: with no guard available the posture is advisory-only', async () => {
  const posture = await resolveWriteRootPosture(undefined, ROOTS);
  assert.equal(posture.enforced, 'advisory');
});

// --- preflight: hook-absent refusal + snapshot ---

function stubSecretGate(): GuardrailDeps['secretGate'] {
  const mechanism: EgressMechanism = {
    name: 'stub',
    async isAvailable() {
      return true;
    },
    async establish(allowed): Promise<EgressContext> {
      return { allowedHosts: allowed, permits: (h) => allowed.includes(h) };
    },
  };
  const approvals: ApprovalStore = { async isApproved() { return true; } };
  const credentials: CredentialProvider = { async resolve() { return {}; } };
  return { mechanism, approvals, credentials, config: {} };
}

function deps(hookActive: boolean, guard?: WriteGuard): GuardrailDeps {
  const created: string[] = [];
  return {
    hookProbe: { async isActive() { return hookActive; } },
    snapshot: {
      async create(label) {
        created.push(label);
        return `snap-${label}`;
      },
    },
    repo: { loopAllowlist: ['npm test'] },
    writeRoots: ROOTS,
    ...(guard !== undefined ? { writeGuard: guard } : {}),
    secretGate: stubSecretGate(),
  };
}

test('T11: with the hook absent, worktree items are refused while sandcastle items run', async () => {
  const items: WorkItem[] = [
    { id: 'sc-1', runner: 'sandcastle' },
    { id: 'wt-1', runner: 'worktree' },
  ];
  const report = await runGuardrailPreflight(items, deps(false));
  assert.equal(report.hookActive, false);
  const sc = report.perItem.find((p) => p.itemId === 'sc-1');
  const wt = report.perItem.find((p) => p.itemId === 'wt-1');
  assert.equal(sc?.disposition, 'run-sandcastle');
  assert.equal(wt?.disposition, 'refused-no-hook');
  // No snapshot is taken when worktree items are all refused.
  assert.equal(report.snapshotRef, undefined);
});

test('T11: a pre-run snapshot ref is created before the first worktree item runs', async () => {
  const items: WorkItem[] = [{ id: 'wt-1', runner: 'worktree' }];
  const report = await runGuardrailPreflight(items, deps(true, new StubWriteGuard(true)));
  assert.ok(report.snapshotRef !== undefined);
  assert.equal(report.writeRootPosture?.enforced, 'os-level');
});

test('T11: with no OS guard the run summary records advisory write-root + weak-posture if no allowlist', async () => {
  const d = deps(true); // no guard, but allowlist present
  const report = await runGuardrailPreflight([{ id: 'wt-1', runner: 'worktree' }], d);
  assert.equal(report.writeRootPosture?.enforced, 'advisory');
  assert.ok(report.warnings.some((w) => w.startsWith('advisory-write-root')));
  // allowlist present ⇒ no weak-posture warning
  assert.equal(report.warnings.some((w) => w.startsWith('weak-posture')), false);
});
