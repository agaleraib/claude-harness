// Shared seams for the /run-loop engine (Wave 18, Phase 1).
//
// These interfaces are the FROZEN contract that Waves 19/20 import. The engine
// (engine.ts) consumes them; the real WorkSource providers (Phase 2), the
// PerItemProtocol (Phase 3), and the scheduler (Phase 4) implement them later.
//
// Design invariant (spec Task 1): the engine is a pure function of
// (work-source state, git/issue state). It holds no work-source-specific or
// runner-specific logic — everything is injected. "Resume" is just "run again."

/** Which runner an item declares it wants. Unspecified ⇒ sandcastle (default). */
export type RunnerKind = 'sandcastle' | 'worktree';

/**
 * A unit of work the loop processes. Phase 2 providers (wave / issue) construct
 * these; in Phase 1 a stub shape is enough. Only the fields the engine itself
 * reads are typed here — providers may carry additional payload, so the shape is
 * intentionally open via `[key: string]: unknown`.
 *
 * `runner` is the item's *declared* runner. The engine resolves an unspecified
 * runner to `sandcastle` (the default) at selection time — see resolveRunnerKind.
 */
export interface WorkItem {
  /** Stable identifier, unique within a run. */
  readonly id: string;
  /** Declared runner; absent ⇒ engine defaults to sandcastle. */
  readonly runner?: RunnerKind;
  /** Item ids that must be MERGED before this item is ready (Phase 4 uses this). */
  readonly blockedBy?: readonly string[];
  /** Open payload — providers attach the synthetic spec, exit gate, body, etc. */
  readonly [key: string]: unknown;
}

/**
 * The work-source seam. A provider knows how to enumerate ready items and how to
 * tell whether an item is already done (so the loop is idempotent across runs).
 *
 * The engine never inspects provider internals; it only asks:
 *  - what is the next ready item? (drained ⇒ null)
 *  - is this item already done? (lets a re-run skip completed work)
 *  - record that an item produced a result.
 */
export interface WorkSource {
  /**
   * Return the next ready, not-yet-done item in source order, or `null` when the
   * source is drained. Implementations must honor `isDone` so a re-run skips
   * items completed on a prior run.
   */
  nextReady(): Promise<WorkItem | null>;

  /** True if the item has already reached a terminal (done) state. */
  isDone(item: WorkItem): Promise<boolean>;

  /** Persist that `item` produced `result`. Must be idempotent per item. */
  recordResult(item: WorkItem, result: ItemResult): Promise<void>;
}

/** Outcome of running a single item through the per-item protocol. */
export interface ItemResult {
  readonly itemId: string;
  /** Terminal disposition of the item this run. */
  readonly status: 'completed' | 'escalated' | 'failed' | 'skipped';
  /** Optional human-readable note (escalation reason, failure summary, etc.). */
  readonly note?: string;
}

/**
 * The per-item protocol seam. Phase 3 implements the real mechanical gate
 * (implement → exit gate → code-review → auto-fix → file findings → merge).
 * In Phase 1 the engine only knows it can hand an item + its resolved runner to
 * a protocol and get back a result.
 */
export interface PerItemProtocol {
  run(item: WorkItem, runner: Runner): Promise<ItemResult>;
}

/**
 * The Runner seam (implemented in Task 2). A runner owns the isolated workspace
 * lifecycle for one item. The engine resolves an item's runner kind to a Runner
 * instance via a RunnerFactory, then the PerItemProtocol drives the lifecycle.
 */
export interface Runner {
  readonly kind: RunnerKind;
  /** Create the isolated workspace (worktree dir / container). */
  prepare(): Promise<void>;
  /** Run the agent against `prompt` inside the prepared workspace. */
  exec(prompt: string): Promise<void>;
  /** Return the commit SHAs produced during this run. */
  collectCommits(): Promise<readonly string[]>;
  /** Tear the workspace down (remove container / worktree). */
  teardown(): Promise<void>;
}

/** Resolves a WorkItem to a concrete Runner instance for its (defaulted) kind. */
export interface RunnerFactory {
  create(item: WorkItem, kind: RunnerKind): Runner;
}

/** Why the loop stopped. Phase 4 adds cap / stall / budget reasons. */
export type StopReason = 'drained';

/** Outcome of a whole loop run. */
export interface RunSummary {
  readonly stopReason: StopReason;
  /** Item ids visited this run, in the order they were processed. */
  readonly visited: readonly string[];
  /** Results recorded this run, in processing order. */
  readonly results: readonly ItemResult[];
}

/**
 * A startup check run once, before the loop begins. Runner-aware preflight
 * (sandcastle/Docker availability — Task 2) is wired here so the engine stays
 * agnostic of what is being checked: it just awaits the hook and aborts the whole
 * run if it throws. Optional — omit it and the loop starts immediately.
 */
export type Preflight = () => Promise<void>;

/** Everything the engine needs injected. No concrete impls live in the engine. */
export interface EngineDeps {
  readonly source: WorkSource;
  readonly protocol: PerItemProtocol;
  readonly runnerFactory: RunnerFactory;
  /** Optional startup check; if it rejects, the run aborts before any item runs. */
  readonly preflight?: Preflight;
}

/**
 * Resolve an item's declared runner to a concrete kind, applying the
 * sandcastle-default rule (spec Task 2). Pure; exported so Task 2 and the engine
 * share exactly one definition of "what runner does this item get?".
 */
export function resolveRunnerKind(item: WorkItem): RunnerKind {
  return item.runner ?? 'sandcastle';
}
