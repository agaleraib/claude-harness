// Shared AFK/HITL capability classifier (Wave 20, Task 12).
//
// A single module shared between `/spec-planner` (plan time) and the /run-loop engine
// (pickup time). It implements the 4-GATE CAPABILITY TEST: escalate to a human ONLY
// if the item requires any of —
//   (1) an unobtainable credential / access;
//   (2) an out-of-band action (something the agent cannot perform from the repo);
//   (3) an unspecified product/design judgment;
//   (4) an irreversible production action.
//
// The test is RUNNER-AWARE: a `worktree` item has host secrets/tools a `sandcastle`
// item lacks, so the SAME task can be AFK under `worktree` and HITL under `sandcastle`
// (e.g. it needs a host credential the container cannot reach). The classifier is a
// pure function of (task signals, resolved runner) — no I/O, zero-dep — so both
// `/spec-planner` and the loop call exactly one definition of "human or agent?".
//
// The loop-side label RECONCILIATION (re-labeling a diverging gh issue) lives in the
// loop module (classifier-reconcile.ts); it imports this pure test. Matt's
// `/to-issues` label is an initial HINT only — never authoritative.

/** The runner an item resolves to (mirrors the loop's RunnerKind; kept local so the
 *  classifier has zero dependency on the loop module and is independently shareable). */
export type ClassifierRunnerKind = 'sandcastle' | 'worktree';

/** The four capability gates. Tripping ANY gate ⇒ HITL. */
export type CapabilityGate =
  | 'unobtainable-credential'
  | 'out-of-band-action'
  | 'unspecified-product-judgment'
  | 'irreversible-prod-action';

/** The readiness verdict. */
export type Readiness = 'ready-for-agent' | 'ready-for-human';

/**
 * Signals describing what a task NEEDS. These are the inputs `/spec-planner` extracts
 * from a task body and the loop derives from an issue. Each is intentionally explicit
 * so the test is deterministic and runner-aware rather than a heuristic keyword scan.
 */
export interface TaskCapabilitySignals {
  /**
   * Credentials/access the task requires (e.g. "prod-db", "host-keychain",
   * "github.com"). A credential is "unobtainable" when the resolved runner cannot
   * provide it (see runnerCanProvide). Empty ⇒ no credential need.
   */
  readonly requiredCredentials?: readonly string[];
  /** True when the task needs an action the agent cannot perform from the repo
   *  (a phone call, a vendor portal click, a physical action). */
  readonly requiresOutOfBandAction?: boolean;
  /** True when the task hinges on a product/design judgment the spec leaves open. */
  readonly requiresUnspecifiedProductJudgment?: boolean;
  /** True when the task performs an irreversible production action (drop prod data,
   *  cut a public release, send customer comms). */
  readonly requiresIrreversibleProdAction?: boolean;
}

/** What a given runner can provide, for gate (1) runner-awareness. */
export interface RunnerCapabilities {
  /** Credentials/access this runner can supply to the agent. */
  readonly providableCredentials: readonly string[];
}

/** Default capabilities per runner kind. `worktree` reaches host secrets/tools that a
 *  `sandcastle` container does not. Callers may override with explicit capabilities. */
export function defaultRunnerCapabilities(kind: ClassifierRunnerKind): RunnerCapabilities {
  if (kind === 'worktree') {
    // The host environment: keychain, host gh/git creds, host network, local tools.
    return { providableCredentials: ['host-keychain', 'host-gh', 'host-network', 'host-env'] };
  }
  // sandcastle: container-only — explicitly injected secrets, no ambient host access.
  return { providableCredentials: [] };
}

/** True when the runner can provide every required credential (gate 1 passes). */
function runnerCanProvide(
  required: readonly string[],
  caps: RunnerCapabilities,
): boolean {
  const provide = new Set(caps.providableCredentials);
  return required.every((c) => provide.has(c));
}

/** A full classification result with the tripped gates + a human-readable reason. */
export interface Classification {
  readonly readiness: Readiness;
  readonly runner: ClassifierRunnerKind;
  readonly trippedGates: readonly CapabilityGate[];
  readonly reason: string;
}

/**
 * Run the 4-gate capability test for a task under a resolved runner. Pure.
 *
 * `capabilities` defaults to defaultRunnerCapabilities(runner) but may be overridden
 * (e.g. a sandcastle run that DOES inject a specific declared secret can list it as
 * providable, flipping gate (1)).
 */
export function classify(
  signals: TaskCapabilitySignals,
  runner: ClassifierRunnerKind,
  capabilities: RunnerCapabilities = defaultRunnerCapabilities(runner),
): Classification {
  const tripped: CapabilityGate[] = [];

  const required = signals.requiredCredentials ?? [];
  if (required.length > 0 && !runnerCanProvide(required, capabilities)) {
    tripped.push('unobtainable-credential');
  }
  if (signals.requiresOutOfBandAction === true) {
    tripped.push('out-of-band-action');
  }
  if (signals.requiresUnspecifiedProductJudgment === true) {
    tripped.push('unspecified-product-judgment');
  }
  if (signals.requiresIrreversibleProdAction === true) {
    tripped.push('irreversible-prod-action');
  }

  if (tripped.length > 0) {
    return {
      readiness: 'ready-for-human',
      runner,
      trippedGates: tripped,
      reason: `HITL under ${runner}: trips capability gate(s) [${tripped.join(', ')}]`,
    };
  }
  return {
    readiness: 'ready-for-agent',
    runner,
    trippedGates: [],
    reason: `AFK under ${runner}: no capability gate tripped`,
  };
}
