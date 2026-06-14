// Runner interface implementations + selection (Wave 18, Task 2).
//
// The `Runner` interface itself is frozen in types.ts (prepare / exec /
// collectCommits / teardown). This module provides:
//   - two implementations: SandcastleRunner (default) and WorktreeRunner;
//   - a RunnerFactory that selects the implementation from the item's declared
//     runner, defaulting to sandcastle when unspecified;
//   - a startup preflight that checks sandcastle (Docker/Podman) availability and
//     refuses to start sandcastle items when the container engine is absent.
//
// SCOPE (Phase 1): what must be REAL and tested here is the SELECTION logic and
// the Docker-absent-abort logic. The actual `sandcastle.run()` / docker calls are
// thin adapter stubs at this layer — the real container/worktree side effects land
// in later waves. The adapters are injected so the selection + abort logic is
// unit-testable in isolation with no Docker, no git, no filesystem.

import {
  type Runner,
  type RunnerFactory,
  type RunnerKind,
  type WorkItem,
  resolveRunnerKind,
} from './types.ts';

/**
 * Probes whether the sandcastle container engine (Docker/Podman) is available.
 * Injected so the abort logic is testable with Docker stubbed present/absent.
 * The real probe (e.g. `docker info`) lands with the real adapter in a later wave.
 */
export interface ContainerEngineProbe {
  /** True when a container engine is running and usable for sandcastle runs. */
  isAvailable(): Promise<boolean>;
  /** Human-readable engine name for messages (e.g. "Docker", "Podman"). */
  readonly name: string;
}

/**
 * Thin adapter the SandcastleRunner delegates its real side effects to
 * (`sandcastle.run()` into a container, merge-to-head / named-branch strategy).
 * Stubbed at this layer; the real implementation arrives in a later wave.
 */
export interface SandcastleAdapter {
  prepare(item: WorkItem): Promise<void>;
  run(item: WorkItem, prompt: string): Promise<void>;
  collectCommits(item: WorkItem): Promise<readonly string[]>;
  teardown(item: WorkItem): Promise<void>;
}

/**
 * Thin adapter the WorktreeRunner delegates to: create `.claude/worktrees/agent-<id>/`,
 * run the agent natively on the host (host env + secrets), collect commits, remove
 * the worktree. Stubbed at this layer; the real implementation arrives in a later wave.
 */
export interface WorktreeAdapter {
  prepare(item: WorkItem): Promise<void>;
  run(item: WorkItem, prompt: string): Promise<void>;
  collectCommits(item: WorkItem): Promise<readonly string[]>;
  teardown(item: WorkItem): Promise<void>;
}

/**
 * Sandcastle runner — DEFAULT. Runs the agent in a Docker/Podman container with a
 * merge-to-head / named-branch strategy. All real side effects are delegated to an
 * injected SandcastleAdapter so this layer carries no live container calls.
 */
export class SandcastleRunner implements Runner {
  readonly kind: RunnerKind = 'sandcastle';
  private readonly item: WorkItem;
  private readonly adapter: SandcastleAdapter;

  constructor(item: WorkItem, adapter: SandcastleAdapter) {
    this.item = item;
    this.adapter = adapter;
  }

  prepare(): Promise<void> {
    return this.adapter.prepare(this.item);
  }
  exec(prompt: string): Promise<void> {
    return this.adapter.run(this.item, prompt);
  }
  collectCommits(): Promise<readonly string[]> {
    return this.adapter.collectCommits(this.item);
  }
  teardown(): Promise<void> {
    return this.adapter.teardown(this.item);
  }
}

/**
 * Worktree runner — no container, native host environment + secrets. Workspace is
 * `.claude/worktrees/agent-<id>/`. All real side effects are delegated to an
 * injected WorktreeAdapter.
 */
export class WorktreeRunner implements Runner {
  readonly kind: RunnerKind = 'worktree';
  private readonly item: WorkItem;
  private readonly adapter: WorktreeAdapter;

  constructor(item: WorkItem, adapter: WorktreeAdapter) {
    this.item = item;
    this.adapter = adapter;
  }

  prepare(): Promise<void> {
    return this.adapter.prepare(this.item);
  }
  exec(prompt: string): Promise<void> {
    return this.adapter.run(this.item, prompt);
  }
  collectCommits(): Promise<readonly string[]> {
    return this.adapter.collectCommits(this.item);
  }
  teardown(): Promise<void> {
    return this.adapter.teardown(this.item);
  }
}

/** Adapters the factory needs to construct the two runner kinds. */
export interface RunnerAdapters {
  readonly sandcastle: SandcastleAdapter;
  readonly worktree: WorktreeAdapter;
}

/**
 * RunnerFactory that selects the implementation from the item's declared runner,
 * defaulting to sandcastle when unspecified. Selection is the real, tested logic;
 * the constructed runners delegate their side effects to the injected adapters.
 */
export class DefaultRunnerFactory implements RunnerFactory {
  private readonly adapters: RunnerAdapters;

  constructor(adapters: RunnerAdapters) {
    this.adapters = adapters;
  }

  create(item: WorkItem, kind: RunnerKind): Runner {
    switch (kind) {
      case 'worktree':
        return new WorktreeRunner(item, this.adapters.worktree);
      case 'sandcastle':
        return new SandcastleRunner(item, this.adapters.sandcastle);
      default: {
        // Exhaustiveness guard: a new RunnerKind must be handled explicitly.
        const exhaustive: never = kind;
        throw new Error(`run-loop: unknown runner kind ${String(exhaustive)}`);
      }
    }
  }
}

/** Raised at loop start when the runner preflight cannot be satisfied. */
export class RunnerPreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunnerPreflightError';
  }
}

/**
 * Startup preflight (spec Task 2): "Sandcastle availability (Docker running) is
 * checked at loop start; if absent, the loop refuses to start sandcastle items and
 * says so."
 *
 * Resolves each item's runner (sandcastle-default), and if ANY item resolves to
 * sandcastle while the container engine is unavailable, throws a clear
 * RunnerPreflightError naming the offending item(s). When no item needs sandcastle,
 * an absent container engine is fine — worktree-only runs proceed.
 *
 * Pure w.r.t. the engine: it inspects only the items and the injected probe, takes
 * no side effects, and returns void on success.
 */
export async function preflightRunners(
  items: readonly WorkItem[],
  probe: ContainerEngineProbe,
): Promise<void> {
  const sandcastleItems = items.filter((item) => resolveRunnerKind(item) === 'sandcastle');
  if (sandcastleItems.length === 0) {
    return;
  }
  if (await probe.isAvailable()) {
    return;
  }
  const ids = sandcastleItems.map((item) => item.id).join(', ');
  throw new RunnerPreflightError(
    `run-loop: ${probe.name} is not available, so the loop refuses to start the ` +
      `${sandcastleItems.length} sandcastle item(s) [${ids}]. Start ${probe.name} ` +
      `(the sandcastle container engine), or declare these items 'runner: worktree' ` +
      `if they can run on the host.`,
  );
}
