// Tests for secret-bearing worktree in-run containment (Wave 20, Task 11a).
//
// Covers the hard-threshold acceptance criteria + the Verify block:
//  - no allowlist ⇒ only loopback reachable; git remote denied unless listed;
//  - allowlisted host reachable, non-allowlisted fails in the same run;
//  - no OS egress mechanism ⇒ item NOT run unattended (egress-unenforceable), while
//    a sandcastle item in the same run still completes;
//  - missing approval ⇒ awaiting-pre-approval, agent never invoked; with token ⇒ run;
//  - only declared secrets injected; an undeclared .env.local key is absent;
//  - malformed allowlist ⇒ egress-config-invalid (not open egress);
//  - git remote allowlisted ⇒ run summary reports git-remote-allowlisted.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { type WorkItem } from '../types.ts';
import {
  gateSecretBearingItem,
  hostReachable,
  isSecretBearingWorktreeItem,
  type ApprovalStore,
  type CredentialProvider,
  type EgressConfig,
  type EgressContext,
  type EgressMechanism,
  type SecretGateDeps,
} from '../safety/egress.ts';

/** Egress mechanism that permits exactly the established allowlist (+ loopback). */
class StubEgress implements EgressMechanism {
  readonly name = 'sandbox-exec-egress';
  established: readonly string[] | null = null;
  private readonly available: boolean;
  constructor(available: boolean) {
    this.available = available;
  }
  async isAvailable(): Promise<boolean> {
    return this.available;
  }
  async establish(allowed: readonly string[]): Promise<EgressContext> {
    this.established = allowed;
    return { allowedHosts: allowed, permits: (h) => allowed.includes(h) };
  }
}

class StubApprovals implements ApprovalStore {
  private readonly approved: ReadonlySet<string>;
  constructor(approved: ReadonlySet<string>) {
    this.approved = approved;
  }
  async isApproved(itemId: string): Promise<boolean> {
    return this.approved.has(itemId);
  }
}

/** Credential provider over a backing `.env.local`; returns ONLY declared keys. */
class StubCredentials implements CredentialProvider {
  resolvedKeys: readonly string[] | null = null;
  private readonly envLocal: Readonly<Record<string, string>>;
  constructor(envLocal: Readonly<Record<string, string>>) {
    this.envLocal = envLocal;
  }
  async resolve(declared: readonly string[]): Promise<Readonly<Record<string, string>>> {
    this.resolvedKeys = declared;
    const out: Record<string, string> = {};
    for (const k of declared) {
      const v = this.envLocal[k];
      if (v !== undefined) {
        out[k] = v;
      }
    }
    return out;
  }
}

function deps(over: {
  available?: boolean;
  approved?: readonly string[];
  config?: EgressConfig;
  envLocal?: Record<string, string>;
}): { deps: SecretGateDeps; egress: StubEgress; creds: StubCredentials } {
  const egress = new StubEgress(over.available ?? true);
  const creds = new StubCredentials(over.envLocal ?? {});
  return {
    egress,
    creds,
    deps: {
      mechanism: egress,
      approvals: new StubApprovals(new Set(over.approved ?? [])),
      credentials: creds,
      config: over.config ?? {},
    },
  };
}

const SECRET_ITEM: WorkItem = { id: 'wt-secret', runner: 'worktree', secrets: ['API_TOKEN'] };

test('T11a: classification — worktree + declared secrets is secret-bearing', () => {
  assert.equal(isSecretBearingWorktreeItem(SECRET_ITEM), true);
  assert.equal(isSecretBearingWorktreeItem({ id: 'a', runner: 'worktree' }), false);
  assert.equal(isSecretBearingWorktreeItem({ id: 'b', runner: 'sandcastle', secrets: ['X'] }), false);
});

test('T11a: no allowlist ⇒ only loopback reachable; git remote denied', async () => {
  const { deps: d } = deps({
    approved: ['wt-secret'],
    config: { gitRemoteHost: 'github.com' },
  });
  const out = await gateSecretBearingItem(SECRET_ITEM, d);
  assert.equal(out.status, 'dispatch');
  if (out.status === 'dispatch') {
    assert.equal(hostReachable(out.egress, '127.0.0.1'), true);
    assert.equal(hostReachable(out.egress, 'github.com'), false);
    assert.equal(hostReachable(out.egress, 'evil.test'), false);
  }
});

test('T11a: allowlisted host reachable, non-allowlisted fails, in the same run', async () => {
  const { deps: d } = deps({
    approved: ['wt-secret'],
    config: { worktreeEgressAllowlist: ['api.internal.test'] },
  });
  const out = await gateSecretBearingItem(SECRET_ITEM, d);
  assert.equal(out.status, 'dispatch');
  if (out.status === 'dispatch') {
    assert.equal(hostReachable(out.egress, 'api.internal.test'), true);
    assert.equal(hostReachable(out.egress, 'other.test'), false);
  }
});

test('T11a: git remote reachable only when explicitly allowlisted; reports git-remote-allowlisted', async () => {
  const { deps: d } = deps({
    approved: ['wt-secret'],
    config: { worktreeEgressAllowlist: ['github.com'], gitRemoteHost: 'github.com' },
  });
  const out = await gateSecretBearingItem(SECRET_ITEM, d);
  assert.equal(out.status, 'dispatch');
  if (out.status === 'dispatch') {
    assert.equal(hostReachable(out.egress, 'github.com'), true);
    assert.ok(out.residualNotes.some((n) => n.startsWith('git-remote-allowlisted')));
  }
});

test('T11a: no OS egress mechanism ⇒ egress-unenforceable (item not run unattended)', async () => {
  const { deps: d } = deps({ available: false, approved: ['wt-secret'] });
  const out = await gateSecretBearingItem(SECRET_ITEM, d);
  assert.equal(out.status, 'egress-unenforceable');
});

test('T11a: missing approval ⇒ awaiting-pre-approval; credentials never resolved', async () => {
  const { deps: d, creds } = deps({ approved: [] });
  const out = await gateSecretBearingItem(SECRET_ITEM, d);
  assert.equal(out.status, 'awaiting-pre-approval');
  // The agent is never invoked and secrets are never even resolved.
  assert.equal(creds.resolvedKeys, null);
});

test('T11a: with the approval token present, the item dispatches', async () => {
  const { deps: d } = deps({ approved: ['wt-secret'] });
  const out = await gateSecretBearingItem(SECRET_ITEM, d);
  assert.equal(out.status, 'dispatch');
});

test('T11a: only declared secrets are injected; an undeclared .env.local key is absent', async () => {
  const { deps: d } = deps({
    approved: ['wt-secret'],
    envLocal: { API_TOKEN: 'tok', DB_PASSWORD: 'undeclared-secret' },
  });
  const out = await gateSecretBearingItem(SECRET_ITEM, d);
  assert.equal(out.status, 'dispatch');
  if (out.status === 'dispatch') {
    assert.equal(out.env['API_TOKEN'], 'tok');
    assert.equal('DB_PASSWORD' in out.env, false);
  }
});

test('T11a: a malformed egress allowlist ⇒ egress-config-invalid (not open egress)', async () => {
  const { deps: d } = deps({
    approved: ['wt-secret'],
    config: { worktreeEgressAllowlist: ['https://evil.test/path'] },
  });
  const out = await gateSecretBearingItem(SECRET_ITEM, d);
  assert.equal(out.status, 'egress-config-invalid');
});
