// Repo-level run lock (Wave 19, Task 8a, step 1).
//
// `.harness-state/run-loop.lock` holds run-id + PID + timestamp. The loop refuses
// to start if a LIVE lock is held (naming the holder); a STALE lock (dead PID) is
// reclaimed with a warning; the lock is released on termination including crash
// (the caller installs the trap).
//
// The filesystem + liveness probe are injected seams so the lock logic is testable
// with no real files and no real process table.

/** Persisted lock contents. */
export interface LockInfo {
  readonly runId: string;
  readonly pid: number;
  readonly timestamp: string;
}

/** The injected store for the single lock file. */
export interface LockStore {
  /** Current lock contents, or null when the lock file is absent. */
  read(): Promise<LockInfo | null>;
  /** Atomically create the lock file; rejects if it already exists. */
  create(info: LockInfo): Promise<void>;
  /** Overwrite the lock (used when reclaiming a stale lock). */
  overwrite(info: LockInfo): Promise<void>;
  /** Remove the lock file (release). Idempotent: no-op if absent. */
  remove(): Promise<void>;
}

/** Tells whether a PID belongs to a live process. */
export type LivenessProbe = (pid: number) => boolean;

export class RunLockHeldError extends Error {
  readonly holder: LockInfo;
  constructor(holder: LockInfo) {
    super(
      `run-loop: a live run lock is held by run "${holder.runId}" (pid ${holder.pid}, ` +
        `since ${holder.timestamp}). Refusing to start a second loop.`,
    );
    this.name = 'RunLockHeldError';
    this.holder = holder;
  }
}

/** Result of acquiring the lock — includes whether a stale lock was reclaimed. */
export interface AcquireResult {
  readonly info: LockInfo;
  readonly reclaimedStale: boolean;
  /** Warning text when a stale lock was reclaimed (else undefined). */
  readonly warning?: string;
}

/**
 * Acquire the repo run lock. Throws RunLockHeldError if a live lock is held;
 * reclaims a stale lock (dead PID) with a warning; otherwise creates a fresh lock.
 */
export async function acquireRunLock(
  store: LockStore,
  isAlive: LivenessProbe,
  self: { runId: string; pid: number; now: () => string },
): Promise<AcquireResult> {
  const existing = await store.read();
  const mine: LockInfo = { runId: self.runId, pid: self.pid, timestamp: self.now() };

  if (existing === null) {
    await store.create(mine);
    return { info: mine, reclaimedStale: false };
  }

  // A lock exists. If its PID is live, refuse (name the holder).
  if (isAlive(existing.pid)) {
    throw new RunLockHeldError(existing);
  }

  // Stale lock (dead PID) — reclaim with a warning.
  await store.overwrite(mine);
  return {
    info: mine,
    reclaimedStale: true,
    warning:
      `run-loop: reclaimed a STALE run lock from run "${existing.runId}" ` +
      `(pid ${existing.pid} is dead, lock dated ${existing.timestamp}).`,
  };
}

/** Release the run lock. Safe to call on normal exit and from a crash trap. */
export async function releaseRunLock(store: LockStore): Promise<void> {
  await store.remove();
}
