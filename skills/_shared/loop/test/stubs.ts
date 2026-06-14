// Test stubs shared by the dry-run harness and the unit tests (Wave 18).
//
// These are deliberately minimal no-op implementations of the injected seams —
// enough to exercise the engine's control flow and the runner selection logic
// without any real git / Docker / agent invocation.

import {
  type ItemResult,
  type PerItemProtocol,
  type Runner,
  type RunnerFactory,
  type RunnerKind,
  type WorkItem,
  type WorkSource,
} from '../types.ts';
import {
  type ContainerEngineProbe,
  type SandcastleAdapter,
  type WorktreeAdapter,
} from '../runners.ts';

/**
 * In-memory WorkSource over a fixed list of items, yielded in order. An item is
 * "done" when its id is in `doneIds` (seeded for the resume test) or once it has
 * been recorded this run. nextReady advances a cursor and skips done items, so it
 * never re-yields, matching the contract real providers must honor.
 */
export class StubWorkSource implements WorkSource {
  private cursor = 0;
  readonly recorded: ItemResult[] = [];
  private readonly doneIds: Set<string>;
  private readonly items: readonly WorkItem[];

  constructor(items: readonly WorkItem[], preMarkedDone: readonly string[] = []) {
    this.items = items;
    this.doneIds = new Set(preMarkedDone);
  }

  async nextReady(): Promise<WorkItem | null> {
    while (this.cursor < this.items.length) {
      const item = this.items[this.cursor++]!;
      if (this.doneIds.has(item.id)) {
        continue;
      }
      return item;
    }
    return null;
  }

  async isDone(item: WorkItem): Promise<boolean> {
    return this.doneIds.has(item.id);
  }

  async recordResult(item: WorkItem, result: ItemResult): Promise<void> {
    this.recorded.push(result);
    this.doneIds.add(item.id);
  }
}

/** A Runner that records its lifecycle calls and does nothing else. */
export class StubRunner implements Runner {
  readonly calls: string[] = [];
  readonly kind: RunnerKind;
  constructor(kind: RunnerKind) {
    this.kind = kind;
  }
  async prepare(): Promise<void> {
    this.calls.push('prepare');
  }
  async exec(_prompt: string): Promise<void> {
    this.calls.push('exec');
  }
  async collectCommits(): Promise<readonly string[]> {
    this.calls.push('collectCommits');
    return [];
  }
  async teardown(): Promise<void> {
    this.calls.push('teardown');
  }
}

/** RunnerFactory that hands back a StubRunner and records what kind it built. */
export class StubRunnerFactory implements RunnerFactory {
  readonly built: { itemId: string; kind: RunnerKind }[] = [];
  create(item: WorkItem, kind: RunnerKind): Runner {
    this.built.push({ itemId: item.id, kind });
    return new StubRunner(kind);
  }
}

/**
 * No-op per-item protocol: returns a `completed` result for every item without
 * touching the runner. Enough for the Task 1 control-flow Verify.
 */
export class NoopProtocol implements PerItemProtocol {
  async run(item: WorkItem, _runner: Runner): Promise<ItemResult> {
    return { itemId: item.id, status: 'completed' };
  }
}

// --- Task 2 stubs: no-op runner adapters + a stubbable container-engine probe. ---

/** A no-op adapter usable for both sandcastle and worktree runner side effects. */
export class NoopAdapter implements SandcastleAdapter, WorktreeAdapter {
  readonly calls: string[] = [];
  async prepare(_item: WorkItem): Promise<void> {
    this.calls.push('prepare');
  }
  async run(_item: WorkItem, _prompt: string): Promise<void> {
    this.calls.push('run');
  }
  async collectCommits(_item: WorkItem): Promise<readonly string[]> {
    this.calls.push('collectCommits');
    return [];
  }
  async teardown(_item: WorkItem): Promise<void> {
    this.calls.push('teardown');
  }
}

/** Container-engine probe with a fixed availability, for the Docker-absent tests. */
export class StubContainerEngineProbe implements ContainerEngineProbe {
  readonly name: string;
  private readonly available: boolean;
  constructor(available: boolean, name = 'Docker') {
    this.available = available;
    this.name = name;
  }
  async isAvailable(): Promise<boolean> {
    return this.available;
  }
}
