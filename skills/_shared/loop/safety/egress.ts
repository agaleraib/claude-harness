// Secret-bearing worktree in-run containment (Wave 20, Task 11a).
//
// Implements controls (A)-(C) from the Phase 5 threat-model statement for items that
// resolve to the `worktree` runner AND declare a credential need (a `secrets:` list).
// Non-secret worktree items keep the Task 10/11 posture and never reach this module.
//
//  (A) Default-deny outbound egress. Before dispatching a secret-bearing worktree
//      item, establish an egress-restricted context: outbound network denied except
//      to hosts in `worktree_egress_allowlist:` plus loopback. The git remote is NOT
//      auto-allowed — it must be listed explicitly (residual risk surfaced as
//      `git-remote-allowlisted`). Where no OS-level egress mechanism exists, the loop
//      REFUSES to run the item unattended (`egress-unenforceable`) — never a silent
//      fallback to open network with live secrets.
//  (B) Per-item pre-execution approval. No dispatch without an explicit operator
//      approval token recorded BEFORE execution. Absent → deferred to blocked-on-human
//      (`awaiting-pre-approval`); the agent is never invoked.
//  (C) Task-scoped credential injection. Inject ONLY the credentials the item declares
//      in `secrets:` — never the whole `.env.local`. No declared secrets ⇒ none.
//
// Every host/network/credential mechanism is an injected, STUBBABLE seam. Tests
// assert against the stub; no real sandbox-exec / netns / network here.

import { type WorkItem, resolveRunnerKind } from '../types.ts';

/** Loopback hosts always reachable regardless of allowlist. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '::1']);

/** A worktree item's declared credential need. */
export function declaredSecrets(item: WorkItem): readonly string[] {
  const s = item['secrets'];
  if (Array.isArray(s) && s.every((x) => typeof x === 'string')) {
    return s as readonly string[];
  }
  return [];
}

/** True when an item is secret-bearing: worktree runner AND declares any secret. */
export function isSecretBearingWorktreeItem(item: WorkItem): boolean {
  return resolveRunnerKind(item) === 'worktree' && declaredSecrets(item).length > 0;
}

/** Egress config from `.harness-profile`. */
export interface EgressConfig {
  /** Hosts the secret-bearing item may reach (`worktree_egress_allowlist:`). */
  readonly worktreeEgressAllowlist?: readonly string[];
  /** The git remote host (e.g. "github.com"), so we can flag if it is allowlisted. */
  readonly gitRemoteHost?: string;
}

/**
 * Host egress mechanism seam. The real impl establishes a per-process firewall /
 * sandbox-exec egress profile (macOS) or a netns + filter (Linux). Stubbed in tests.
 */
export interface EgressMechanism {
  /** True when this host can OS-enforce outbound egress restriction. */
  isAvailable(): Promise<boolean>;
  /**
   * Establish an egress-restricted context permitting ONLY `allowedHosts` (plus
   * loopback). Returns a handle whose `connect(host)` reports whether a connection
   * would be permitted under the established context — the test seam for asserting
   * the connection actually fails for a non-allowlisted host.
   */
  establish(allowedHosts: readonly string[]): Promise<EgressContext>;
  readonly name: string;
}

/** An established egress-restricted context. */
export interface EgressContext {
  /** True when a connection to `host` is permitted under this context. */
  permits(host: string): boolean;
  /** The exact set of non-loopback hosts permitted. */
  readonly allowedHosts: readonly string[];
}

/** Pre-execution approval token store seam (operator sets the marker out of band). */
export interface ApprovalStore {
  /** True when the operator has recorded pre-execution approval for this item. */
  isApproved(itemId: string): Promise<boolean>;
}

/** Credential provider seam: resolves declared secret keys to env values. */
export interface CredentialProvider {
  /**
   * Resolve ONLY the declared keys to {key: value}. Keys present in `.env.local` but
   * not declared MUST NOT appear. Scoped/short-lived where the provider supports it.
   */
  resolve(declaredKeys: readonly string[]): Promise<Readonly<Record<string, string>>>;
}

/** The outcome of gating one secret-bearing worktree item before dispatch. */
export type SecretGateOutcome =
  | {
      readonly status: 'dispatch';
      readonly egress: EgressContext;
      readonly env: Readonly<Record<string, string>>;
      /** Residual-risk notes for the run summary (e.g. git-remote-allowlisted). */
      readonly residualNotes: readonly string[];
    }
  | { readonly status: 'awaiting-pre-approval' }
  | { readonly status: 'egress-unenforceable' }
  | { readonly status: 'egress-config-invalid'; readonly reason: string };

/** Validate an allowlist host token; null on parseable, a reason string on invalid. */
function invalidHostReason(host: string): string | null {
  const h = host.trim();
  if (h.length === 0) {
    return 'empty host entry';
  }
  // A host is a DNS name or IP literal — reject whitespace, schemes, paths, globs.
  if (/[\s/\\*]/.test(h) || h.includes('://')) {
    return `unparseable host "${host}"`;
  }
  return null;
}

export interface SecretGateDeps {
  readonly mechanism: EgressMechanism;
  readonly approvals: ApprovalStore;
  readonly credentials: CredentialProvider;
  readonly config: EgressConfig;
}

/**
 * Gate ONE secret-bearing worktree item through controls (A)-(C), IN ORDER, before
 * any agent invocation. Returns the disposition the scheduler/runner acts on.
 *
 * Order rationale: pre-approval (B) is checked before establishing egress (A) so an
 * unapproved item is deferred without touching host mechanisms; config validity and
 * mechanism availability are then checked before any credential is resolved (C), so
 * a refused item never has its secrets materialized.
 */
export async function gateSecretBearingItem(
  item: WorkItem,
  deps: SecretGateDeps,
): Promise<SecretGateOutcome> {
  // (B) Per-item pre-execution approval — checked first; unapproved is never run.
  if (!(await deps.approvals.isApproved(item.id))) {
    return { status: 'awaiting-pre-approval' };
  }

  // (A) Validate the allowlist BEFORE establishing egress — a malformed allowlist
  // refuses the item (egress-config-invalid), never open egress with live secrets.
  const rawAllow = deps.config.worktreeEgressAllowlist ?? [];
  for (const host of rawAllow) {
    const reason = invalidHostReason(host);
    if (reason !== null) {
      return { status: 'egress-config-invalid', reason };
    }
  }

  // (A) No OS-level egress mechanism ⇒ refuse to run unattended (egress-unenforceable).
  if (!(await deps.mechanism.isAvailable())) {
    return { status: 'egress-unenforceable' };
  }

  // (A) Establish the egress-restricted context. The git remote is NOT auto-added;
  // only hosts explicitly listed in the allowlist (plus loopback) are permitted.
  const allowedHosts = rawAllow.map((h) => h.trim()).filter((h) => h.length > 0);
  const egress = await deps.mechanism.establish(allowedHosts);

  const residualNotes: string[] = [];
  const gitRemote = deps.config.gitRemoteHost;
  if (gitRemote !== undefined && allowedHosts.includes(gitRemote)) {
    residualNotes.push(
      `git-remote-allowlisted: ${gitRemote} is reachable during execution; the same host ` +
        `exposes API/token-based exfil — operator-trusted decision (Open Question 6)`,
    );
  }

  // (C) Task-scoped credential injection — only the declared keys.
  const declared = declaredSecrets(item);
  const env = await deps.credentials.resolve(declared);

  return { status: 'dispatch', egress, env, residualNotes };
}

/** Whether a host is reachable under a context (allowlist ∪ loopback). */
export function hostReachable(context: EgressContext, host: string): boolean {
  return LOOPBACK_HOSTS.has(host) || context.permits(host);
}
