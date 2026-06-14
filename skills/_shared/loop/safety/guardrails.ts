// Loop-start guardrail preflight (Wave 20, Tasks 11 + 11a).
//
// At loop start, if ANY pending item resolves to the `worktree` runner, the loop
// verifies the denylist hook (Task 10) is installed/active; if not, it REFUSES TO
// START those items (sandcastle items still run — the container is their boundary).
// For SECRET-BEARING worktree items the preflight additionally enforces Task 11a's
// egress + pre-approval gates before any such item is dispatched.
//
// It also takes a pre-run `master` snapshot (tag/stash) so a bad merge/host write is
// recoverable with one `git reset`, and resolves the write-root posture
// (OS-enforced vs advisory) for honest residual-risk surfacing.
//
// All host effects (hook probe, snapshot, egress, write guard, credentials) are
// injected, stubbable seams. Pure orchestration; no real side effects here.

import { type WorkItem, resolveRunnerKind } from '../types.ts';
import { isWeakPosture, type RepoSafetyConfig } from './denylist.ts';
import {
  type WriteGuard,
  type WriteRootPosture,
  type WriteRoots,
  resolveWriteRootPosture,
} from './write-root.ts';
import {
  type SecretGateDeps,
  type SecretGateOutcome,
  gateSecretBearingItem,
  isSecretBearingWorktreeItem,
} from './egress.ts';

/** Probe whether the catastrophic-command PreToolUse hook is installed + active. */
export interface DenylistHookProbe {
  /** True when the global PreToolUse denylist hook is installed and firing. */
  isActive(): Promise<boolean>;
}

/** Pre-run snapshot seam: tag/stash `master` so a bad merge is reset-recoverable. */
export interface SnapshotStore {
  /** Create a pre-run snapshot ref; returns its identifier (tag/stash ref). */
  create(label: string): Promise<string>;
}

/** Per-item guardrail disposition decided at preflight. */
export type ItemGuardrail =
  | { readonly itemId: string; readonly disposition: 'run-sandcastle' }
  | { readonly itemId: string; readonly disposition: 'run-worktree' }
  | {
      readonly itemId: string;
      readonly disposition: 'refused-no-hook';
      readonly reason: string;
    }
  | {
      readonly itemId: string;
      readonly disposition: 'run-worktree-secret';
      readonly gate: Extract<SecretGateOutcome, { status: 'dispatch' }>;
    }
  | {
      readonly itemId: string;
      readonly disposition: 'deferred-secret';
      readonly secretStatus: Exclude<SecretGateOutcome['status'], 'dispatch'>;
      readonly reason: string;
    };

/** The whole-run guardrail result. */
export interface GuardrailReport {
  readonly perItem: readonly ItemGuardrail[];
  /** True when any worktree item exists in this run. */
  readonly hasWorktreeItems: boolean;
  /** Hook active at loop start. */
  readonly hookActive: boolean;
  /** Pre-run snapshot ref (created only when a worktree item will run). */
  readonly snapshotRef?: string;
  /** Write-root posture (OS-enforced vs advisory) for worktree items. */
  readonly writeRootPosture?: WriteRootPosture;
  /** Warnings for the run summary (weak-posture, advisory-write-root, residual egress). */
  readonly warnings: readonly string[];
}

export interface GuardrailDeps {
  readonly hookProbe: DenylistHookProbe;
  readonly snapshot: SnapshotStore;
  readonly repo: RepoSafetyConfig;
  readonly writeRoots: WriteRoots;
  /** Optional OS write guard; absent ⇒ advisory write-root posture. */
  readonly writeGuard?: WriteGuard;
  /** Secret-bearing gating deps (controls A-C); required when secret items exist. */
  readonly secretGate: SecretGateDeps;
}

/**
 * Run the loop-start guardrail preflight over all pending items. Pure orchestration:
 * classifies each item's disposition, refuses worktree items when the hook is absent,
 * gates secret-bearing items through controls (A)-(C), and assembles the warnings the
 * run summary surfaces. Sandcastle items always pass through (container is their
 * boundary).
 */
export async function runGuardrailPreflight(
  items: readonly WorkItem[],
  deps: GuardrailDeps,
): Promise<GuardrailReport> {
  const worktreeItems = items.filter((i) => resolveRunnerKind(i) === 'worktree');
  const hasWorktreeItems = worktreeItems.length > 0;
  const hookActive = hasWorktreeItems ? await deps.hookProbe.isActive() : true;

  const warnings: string[] = [];
  const perItem: ItemGuardrail[] = [];

  // Snapshot + write-root posture are only relevant when a worktree item will run
  // (and only when the hook gate passes — otherwise worktree items are refused).
  let snapshotRef: string | undefined;
  let writeRootPosture: WriteRootPosture | undefined;
  if (hasWorktreeItems && hookActive) {
    snapshotRef = await deps.snapshot.create('run-loop-pre-run');
    writeRootPosture = await resolveWriteRootPosture(deps.writeGuard, deps.writeRoots);
    if (writeRootPosture.enforced === 'advisory') {
      warnings.push(`advisory-write-root: ${writeRootPosture.note}`);
    }
    if (isWeakPosture(deps.repo)) {
      warnings.push(
        'weak-posture: no loop_allowlist declared — worktree confinement is denylist-only',
      );
    }
  }

  for (const item of items) {
    const kind = resolveRunnerKind(item);
    if (kind === 'sandcastle') {
      perItem.push({ itemId: item.id, disposition: 'run-sandcastle' });
      continue;
    }

    // Worktree item. Hook absent ⇒ refuse (sandcastle items above still drain).
    if (!hookActive) {
      perItem.push({
        itemId: item.id,
        disposition: 'refused-no-hook',
        reason:
          'the catastrophic-command PreToolUse denylist hook is not active; refusing to start ' +
          'this worktree item (sandcastle items still run — the container is their boundary)',
      });
      continue;
    }

    // Secret-bearing worktree item ⇒ controls (A)-(C).
    if (isSecretBearingWorktreeItem(item)) {
      const gate = await gateSecretBearingItem(item, deps.secretGate);
      if (gate.status === 'dispatch') {
        for (const note of gate.residualNotes) {
          warnings.push(note);
        }
        perItem.push({ itemId: item.id, disposition: 'run-worktree-secret', gate });
      } else {
        perItem.push({
          itemId: item.id,
          disposition: 'deferred-secret',
          secretStatus: gate.status,
          reason: secretDeferralReason(gate),
        });
      }
      continue;
    }

    // Non-secret worktree item under the Task 10/11 posture.
    perItem.push({ itemId: item.id, disposition: 'run-worktree' });
  }

  return {
    perItem,
    hasWorktreeItems,
    hookActive,
    ...(snapshotRef !== undefined ? { snapshotRef } : {}),
    ...(writeRootPosture !== undefined ? { writeRootPosture } : {}),
    warnings,
  };
}

function secretDeferralReason(gate: Exclude<SecretGateOutcome, { status: 'dispatch' }>): string {
  switch (gate.status) {
    case 'awaiting-pre-approval':
      return 'no pre-execution approval token; deferred to blocked-on-human (agent never invoked)';
    case 'egress-unenforceable':
      return 'no OS-level egress mechanism available; refusing to run secret-bearing item unattended';
    case 'egress-config-invalid':
      return `malformed worktree_egress_allowlist (${gate.reason}); refusing rather than open egress`;
    default: {
      const exhaustive: never = gate;
      throw new Error(`run-loop: unknown secret-gate status ${String(exhaustive)}`);
    }
  }
}
