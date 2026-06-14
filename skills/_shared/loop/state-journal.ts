// Append-only JSONL journal seam (Wave 19) shared by the issue provider's
// effect-intent record (Task 4, `.harness-state/run-loop-transitions.jsonl`) and
// the merge outbox (Task 8a, `.harness-state/run-loop-outbox.jsonl`).
//
// The interface is append + read-all. Real disk-backed journals land later; here
// it is injected so the crash-safe sequences are testable in memory. Records are
// opaque JSON objects keyed by the caller — this module does not interpret them.

/** A single journal record: an arbitrary JSON object. */
export type JournalRecord = Record<string, unknown>;

/** Append-only journal seam. */
export interface Journal {
  /** Append a record durably (in the real impl, fsync after write). */
  append(record: JournalRecord): Promise<void>;
  /** Read every record in append order. */
  readAll(): Promise<readonly JournalRecord[]>;
}

/**
 * In-memory journal for tests. Records are deep-frozen copies so callers cannot
 * mutate persisted state after the fact (matching durable-write semantics).
 */
export class InMemoryJournal implements Journal {
  private readonly records: JournalRecord[] = [];

  async append(record: JournalRecord): Promise<void> {
    this.records.push(structuredClone(record));
  }

  async readAll(): Promise<readonly JournalRecord[]> {
    return this.records.map((r) => structuredClone(r));
  }
}
