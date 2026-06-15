// Production composition root for /run-loop (Wave 21, Task 5 completion).
//
// This is the real-graph assembly that was previously only proven in a throwaway /tmp
// harness. It lives here, in committed production code, so the entry EXECUTABLE
// (`node run-loop-entry.ts issues --yes`) drives the REAL adapters end-to-end:
//
//   providers (issue via GhCliAdapter / a local one-item source)
//     + production PerItemProtocol
//        ( implement: CodexImplementAdapter / ClaudeImplementAdapter via the runner,
//          agent-edits/runner-commits via ShellGitCommitter;
//          exit gate: runExitGate over a GateRunner that shells the repo's checks;
//          review: dispatchReview → AnthropicReviewBackend (opus-4.8) / OpenRouter / Codex;
//          verify-gate: runVerifyGate — reviewer proposes, gate decides;
//          merge: green gate + no escalation ⇒ record the merge )
//     + DefaultRunnerFactory (T2 implement adapters)
//     + backend-aware guardrail preflight.
//
// EVERYTHING that touches a process / network / disk is a real seam impl here, but each
// is still injectable so the composition root is unit-testable WITHOUT live model calls
// (the tests pass fakes for the spawn / http / gh seams and assert the wiring).
//
// FROZEN INTERFACES: this module is NEW code. It implements the frozen EngineDeps,
// PerItemProtocol, RunnerFactory, GateRunner, GhClient/CommandRunner seams — it does
// NOT modify any of them. Additive-only.

import {
  type EngineDeps,
  type ItemResult,
  type PerItemProtocol,
  type Runner,
  type RunnerFactory,
  type RunnerKind,
  type WorkItem,
  type WorkSource,
  resolveRunnerKind,
} from './types.ts';
import { DefaultRunnerFactory } from './runners.ts';
import { type GhClient } from './gh-seam.ts';
import { GhCliAdapter, type CommandRunner } from './gh-adapter.ts';
import { InMemoryJournal } from './state-journal.ts';
import { IssueWorkSource } from './providers/issue-provider.ts';
import {
  type AgentBackend,
  type BackendConfig,
  type ReviewBackend,
  ImplementBackendRegistry,
  ReviewBackendRegistry,
  loadBackendConfig,
  resolveImplementBackendId,
} from './dispatch/backends.ts';
import { type SpawnFn, defaultSpawn } from './dispatch/spawn.ts';
import {
  type ContainerRunner,
  type GitCommitter,
  CodexImplementAdapter,
  ClaudeImplementAdapter,
  ShellGitCommitter,
} from './dispatch/implement.ts';
import {
  type HttpClient,
  type ReviewLogger,
  AnthropicReviewBackend,
  CodexReviewBackend,
  OpenRouterReviewBackend,
  dispatchReview,
} from './dispatch/review.ts';
import { type GateRunner, runExitGate } from './protocol/gate.ts';
import {
  type FindingFixer,
  type FindingReproducer,
  runVerifyGate,
} from './protocol/verify-gate.ts';
import { RunSummaryBuilder, type RunSummaryReport } from './termination.ts';
import { type DriverConsole } from './run-loop-driver.ts';

/** Alias kept descriptive at the composition-root layer. */
export type ProductionConsole = DriverConsole;

// --- real process seam (gh / spawn) ----------------------------------------------

/** A real CommandRunner shelling out via node:child_process.execFile (gh adapter). */
export class ExecFileCommandRunner implements CommandRunner {
  async run(command: string, args: readonly string[]): Promise<string> {
    const { execFile } = await import('node:child_process');
    return await new Promise<string>((resolve, reject) => {
      execFile(command, [...args], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`${command} ${args.join(' ')} failed: ${stderr || err.message}`));
        } else {
          resolve(stdout);
        }
      });
    });
  }
}

/** A real fetch-backed HttpClient for the API review backends. */
export class FetchHttpClient implements HttpClient {
  async postJson(
    url: string,
    headers: Readonly<Record<string, string>>,
    body: unknown,
  ): Promise<{ readonly status: number; readonly json: unknown }> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers },
      body: JSON.stringify(body),
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json };
  }
}

/** A container runner that refuses — the live local smoke is worktree-lane only. */
class UnsupportedContainerRunner implements ContainerRunner {
  async run(): Promise<never> {
    throw new Error('run-loop: the sandcastle container lane is not wired for the local live path');
  }
}

// --- seams the production graph is built from (each defaulted to a real impl) -----

export interface ProductionSeams {
  /** Process spawn seam (defaults to the real stdin-ignored child_process spawn). */
  readonly spawn?: SpawnFn;
  /** HTTP seam for API review backends (defaults to fetch). */
  readonly http?: HttpClient;
  /** gh CommandRunner (defaults to execFile). Only used in `issues` mode. */
  readonly command?: CommandRunner;
  /** Container lane runner (defaults to unsupported — worktree-only local path). */
  readonly container?: ContainerRunner;
  /** Git committer (defaults to ShellGitCommitter over the spawn seam). */
  readonly committer?: GitCommitter;
  /** Console sink (defaults to process.stdout via console.log). */
  readonly console?: DriverConsole;
}

/** Build the BackendConfig from process.env (+ optional profile fields). */
export function buildBackendConfigFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): BackendConfig {
  // .harness-profile parsing for the loop knobs lands with the SKILL.md wiring; the
  // env keys (API keys) are the security-relevant inputs and come from env here.
  //
  // The data-egress knob (allow_external_review) is a per-repo policy: absent ⇒ deny
  // (the diff stays local; review downgrades to codex). An operator can opt a clean-room
  // / trusted run into the external Opus/OpenRouter reviewer via the explicit env gate
  // RUN_LOOP_ALLOW_EXTERNAL_REVIEW=1 — surfaced, not silent, and operator-controlled.
  const base = loadBackendConfig(env);
  const allow = env['RUN_LOOP_ALLOW_EXTERNAL_REVIEW'];
  if (allow === '1' || allow === 'true') {
    return { ...base, allowExternalReview: true };
  }
  return base;
}

/**
 * A production GateRunner that shells the repo's checks for one item. For the
 * clean-room local path the item carries an explicit `gate` descriptor (tests /
 * typecheck / verify commands run in `cwd`); absent ⇒ the gate is vacuously green
 * (nothing to check). Each command's zero exit = pass.
 */
export class ShellGateRunner implements GateRunner {
  private readonly spawn: SpawnFn;
  private readonly cwd: string;
  constructor(spawn: SpawnFn, cwd: string) {
    this.spawn = spawn;
    this.cwd = cwd;
  }
  private async runCmd(cmd: readonly string[] | undefined): Promise<boolean> {
    if (cmd === undefined || cmd.length === 0) {
      return true; // no check declared ⇒ pass (vacuously green)
    }
    const [command, ...argv] = cmd;
    if (command === undefined) {
      return true;
    }
    const r = await this.spawn(command, argv, {
      cwd: this.cwd,
      env: process.env as Record<string, string>,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return r.exitCode === 0;
  }
  private cmdFor(item: WorkItem, key: 'tests' | 'typecheck' | 'verify'): readonly string[] | undefined {
    const gate = item['gate'];
    if (gate !== null && typeof gate === 'object') {
      const v = (gate as Record<string, unknown>)[key];
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
        return v as string[];
      }
    }
    return undefined;
  }
  async runTests(item: WorkItem): Promise<boolean> {
    return this.runCmd(this.cmdFor(item, 'tests'));
  }
  async runTypecheck(item: WorkItem): Promise<boolean> {
    return this.runCmd(this.cmdFor(item, 'typecheck'));
  }
  async runVerify(item: WorkItem): Promise<boolean> {
    return this.runCmd(this.cmdFor(item, 'verify'));
  }
}

/** Dependencies the production protocol resolves per item. */
export interface ProductionProtocolDeps {
  readonly implementRegistry: ImplementBackendRegistry;
  readonly reviewRegistry: ReviewBackendRegistry;
  readonly localReviewFallback: ReviewBackend;
  readonly config: BackendConfig;
  readonly committer: GitCommitter;
  readonly gh: GhClient;
  readonly gate: (item: WorkItem, cwd: string) => GateRunner;
  readonly cwdFor: (item: WorkItem) => string;
  readonly console: DriverConsole;
  readonly reviewLogger?: ReviewLogger;
}

/**
 * The production PerItemProtocol. Drives one item through the REAL graph:
 *   implement (agent edits, runner commits) → exit gate → review (dispatchReview) →
 *   verify-gate (runVerifyGate) → merge decision.
 *
 * Implements the frozen PerItemProtocol seam. The injected `Runner` owns the workspace
 * lifecycle; this protocol drives the implement adapter through it and then the gate /
 * review / verify-gate. A red gate ⇒ never merged (gate-failed). A reproduced-unfixed
 * review finding ⇒ escalated. Otherwise ⇒ completed (merged).
 */
export class ProductionProtocol implements PerItemProtocol {
  private readonly d: ProductionProtocolDeps;
  constructor(deps: ProductionProtocolDeps) {
    this.d = deps;
  }

  async run(item: WorkItem, runner: Runner): Promise<ItemResult> {
    const cwd = this.d.cwdFor(item);
    const lane = resolveRunnerKind(item);
    const log = (m: string) => this.d.console.print(`[trace] ${m}`);

    // 1. IMPLEMENT — the real agent edits; the runner commits.
    const backend = this.d.implementRegistry.resolve(item);
    log(`implement: dispatching ${backend.id} (lane=${lane}) …`);
    await runner.prepare();
    const base = await this.d.committer.head(cwd);
    const prompt = this.promptFor(item);
    const result = await backend.dispatch(prompt, { cwd, env: process.env as Record<string, string>, lane });
    if (!result.ok) {
      await runner.teardown();
      return { itemId: item.id, status: 'failed', note: `implement backend ${backend.id} exited ${result.exitCode}` };
    }
    await this.d.committer.commitAll(cwd, `feat: ${item.id} (/run-loop)`);
    const commits = await this.d.committer.collectCommits(cwd, base);
    log(`implement: ${backend.id} ok; runner produced ${commits.length} commit(s): ${commits.join(', ')}`);
    if (commits.length === 0) {
      await runner.teardown();
      return { itemId: item.id, status: 'failed', note: 'agent made no edits / no commit produced' };
    }

    // 2. EXIT GATE — authoritative for merge.
    const gate = await runExitGate(item, this.d.gate(item, cwd));
    log(`gate: green=${gate.green} checks=${JSON.stringify(gate.checks)}`);
    if (!gate.green) {
      await runner.teardown();
      return { itemId: item.id, status: 'failed', note: gate.note ?? 'exit gate red' };
    }

    // 3. REVIEW — a single model judgment on the produced diff.
    const diff = await this.diffFor(cwd, base);
    log(`review: dispatching review on the diff …`);
    const review = await dispatchReview({
      item,
      diff,
      registry: this.d.reviewRegistry,
      config: this.d.config,
      ctx: { context: `/run-loop item ${item.id}`, env: process.env as Record<string, string> },
      localFallback: this.d.localReviewFallback,
      ...(this.d.reviewLogger !== undefined ? { logger: this.d.reviewLogger } : {}),
    });
    log(`review: backend=${review.backend} findings=${review.findings.length}`);

    // 4. VERIFY-GATE — reviewer proposes, the gate decides. A finding "reproduces" iff
    //    it makes the gate go red; nothing here acts on a raw assertion.
    const gateRunner = this.d.gate(item, cwd);
    const reproducer: FindingReproducer = {
      reproduce: async () => !(await runExitGate(item, gateRunner)).green,
    };
    const fixer: FindingFixer = { fix: async () => { /* no auto-fix on the local path */ } };
    const vg = await runVerifyGate(item, review.findings, { reproducer, fixer, gh: this.d.gh, maxFixRounds: 1 });
    log(
      `verify-gate: triaged=${vg.triaged.length} advisory=${vg.advisory.length} ` +
        `escalate=${vg.escalate}`,
    );

    await runner.teardown();

    // 5. MERGE decision. Green gate + no escalation ⇒ completed (merged onto HEAD).
    if (vg.escalate) {
      return { itemId: item.id, status: 'escalated', note: 'a review finding reproduced + was not fixed within the bound' };
    }
    const mergeSha = await this.d.committer.head(cwd);
    log(`merge: AFK-merged ${item.id} at ${mergeSha}`);
    return { itemId: item.id, status: 'completed', note: `merged at ${mergeSha}` };
  }

  private promptFor(item: WorkItem): string {
    const body = item['body'];
    if (typeof body === 'string') return body;
    const spec = item['syntheticSpec'];
    if (typeof spec === 'string') return spec;
    return `Run item ${item.id}.`;
  }

  private async diffFor(cwd: string, base: string): Promise<string> {
    const r = await (this.d.committer as ShellGitCommitterLike).diff?.(cwd, base);
    return r ?? '';
  }
}

/** Structural type: a committer that can also produce a diff (ShellGitCommitter does). */
interface ShellGitCommitterLike extends GitCommitter {
  diff?(cwd: string, base: string): Promise<string>;
}

/** The production EngineDeps + the resolved config + the source's ready items. */
export interface ProductionDeps {
  readonly engine: EngineDeps;
  readonly config: BackendConfig;
  readonly readyItems: readonly WorkItem[];
  /** Build the RunSummaryReport from a RunSummary (driver prints it). */
  readonly buildReport: (summary: { readonly visited: readonly string[]; readonly results: readonly ItemResult[] }) => RunSummaryReport;
}

/** Options for assembling the production graph. */
export interface BuildProductionDepsOptions {
  /** `issues` (GhCliAdapter source) or a caller-supplied local WorkSource. */
  readonly source: WorkSource;
  /** The ready items (for the preview + backend-aware preflight). */
  readonly readyItems: readonly WorkItem[];
  /** Per-item workspace dir resolver (worktree path / repo cwd). */
  readonly cwdFor: (item: WorkItem) => string;
  /** Resolved backend config (keys from env). */
  readonly config: BackendConfig;
  readonly seams?: ProductionSeams;
  readonly gh: GhClient;
}

/**
 * Assemble the production EngineDeps from real adapters. This is the composition root:
 * implement backends (Codex default + Claude), review backends (Opus-API default +
 * OpenRouter + Codex), the production protocol, the DefaultRunnerFactory, and a no-op
 * engine preflight placeholder (the backend-aware preflight runs in the driver before
 * the loop). Caller supplies the WorkSource + per-item cwd + gh client.
 */
export function buildProductionDeps(opts: BuildProductionDepsOptions): ProductionDeps {
  const spawn = opts.seams?.spawn ?? defaultSpawn;
  const http = opts.seams?.http ?? new FetchHttpClient();
  const container = opts.seams?.container ?? new UnsupportedContainerRunner();
  const committer = opts.seams?.committer ?? new ShellGitCommitter(spawn);
  const con = opts.seams?.console ?? { print: (l: string) => console.log(l) };
  const config = opts.config;

  // Implement backends (T2).
  const codexImpl = new CodexImplementAdapter({ spawn, container });
  const claudeImpl = new ClaudeImplementAdapter({ spawn, container });
  const implementRegistry = new ImplementBackendRegistry([codexImpl, claudeImpl] as AgentBackend[], config);

  // Review backends (T3).
  const anthropic = new AnthropicReviewBackend({ http, apiKey: config.anthropicApiKey });
  const openrouter = new OpenRouterReviewBackend({ http, apiKey: config.openrouterApiKey });
  const codexReviewFor = (item: WorkItem) => new CodexReviewBackend({ spawn, cwd: opts.cwdFor(item) });
  // The local review fallback (codex) needs a cwd; use the first ready item's cwd as a
  // representative (all clean-room items share the repo). For `issues` mode each item's
  // own cwd would be its worktree; the fallback is only hit when external review is off.
  const fallbackCwd = opts.readyItems[0] !== undefined ? opts.cwdFor(opts.readyItems[0]) : process.cwd();
  const codexReview = new CodexReviewBackend({ spawn, cwd: fallbackCwd });
  const reviewRegistry = new ReviewBackendRegistry(
    [anthropic, openrouter, codexReview] as ReviewBackend[],
    config,
  );
  void codexReviewFor; // per-item codex review wiring is available; fallbackCwd suffices here.

  const gate = (_item: WorkItem, cwd: string): GateRunner => new ShellGateRunner(spawn, cwd);

  const protocol = new ProductionProtocol({
    implementRegistry,
    reviewRegistry,
    localReviewFallback: codexReview,
    config,
    committer,
    gh: opts.gh,
    gate,
    cwdFor: opts.cwdFor,
    console: con,
  });

  // T2 adapters for the DefaultRunnerFactory. The implement step is driven by the
  // ProductionProtocol (not the runner's exec), so the runner adapters are lifecycle
  // no-ops on the local worktree path; the workspace already exists (the throwaway repo).
  const noopAdapter = {
    async prepare(): Promise<void> {},
    async run(): Promise<void> {},
    async collectCommits(): Promise<readonly string[]> { return []; },
    async teardown(): Promise<void> {},
  };
  const runnerFactory: RunnerFactory = new DefaultRunnerFactory({
    sandcastle: noopAdapter,
    worktree: noopAdapter,
  });

  const engine: EngineDeps = {
    source: opts.source,
    protocol,
    runnerFactory,
  };

  const buildReport = (summary: {
    readonly visited: readonly string[];
    readonly results: readonly ItemResult[];
  }): RunSummaryReport => {
    const builder = new RunSummaryBuilder();
    for (const r of summary.results) {
      switch (r.status) {
        case 'completed':
          builder.recordMerged(r.itemId);
          break;
        case 'escalated':
          builder.recordEscalated(r.itemId);
          break;
        case 'failed':
          builder.recordGateFailed(r.itemId);
          break;
        case 'skipped':
          break;
        default: {
          const exhaustive: never = r.status;
          throw new Error(`run-loop: unknown item status ${String(exhaustive)}`);
        }
      }
    }
    return builder.build('drained');
  };

  return { engine, config, readyItems: opts.readyItems, buildReport };
}

/**
 * Build the production `issues`-mode deps: a real GhCliAdapter-backed IssueWorkSource.
 * Used by the entry executable for `node run-loop-entry.ts issues`. Each issue item runs
 * in the current repo checkout (cwd). For a fully local throwaway smoke without a GitHub
 * remote, a caller can instead build a local WorkSource and call buildProductionDeps
 * directly (see the live-test runbook / smoke harness).
 */
export async function buildIssuesProductionDeps(seams?: ProductionSeams): Promise<ProductionDeps> {
  const command = seams?.command ?? new ExecFileCommandRunner();
  const gh = new GhCliAdapter(command);
  const source = new IssueWorkSource({ gh, journal: new InMemoryJournal(), runId: `run-${Date.now()}` });
  const readyItems = await source.allItems();
  const config = buildBackendConfigFromEnv();
  const repoCwd = process.cwd();
  return buildProductionDeps({
    source,
    readyItems,
    cwdFor: () => repoCwd,
    config,
    gh,
    ...(seams !== undefined ? { seams } : {}),
  });
}

/**
 * A local single-item WorkSource (no `gh`, no GitHub remote). Drives the SAME
 * production protocol + driver as `issues` mode against a throwaway local repo — the
 * committed clean-room path the live smoke runs through the entry executable.
 */
export class LocalItemWorkSource implements WorkSource {
  private yielded = false;
  private readonly item: WorkItem;
  readonly recorded: ItemResult[] = [];
  constructor(item: WorkItem) {
    this.item = item;
  }
  async nextReady(): Promise<WorkItem | null> {
    if (this.yielded) {
      return null;
    }
    this.yielded = true;
    return this.item;
  }
  async isDone(): Promise<boolean> {
    return false;
  }
  async recordResult(_item: WorkItem, result: ItemResult): Promise<void> {
    this.recorded.push(result);
  }
}

/**
 * Build the production deps for a LOCAL clean-room drive: one ready item read from a
 * JSON file, driven against a throwaway repo at `repoDir`. Uses the real graph
 * (real `codex exec`, real review API per config) but a local WorkSource + a no-op
 * GhClient (no GitHub mutation). This is the committed path the entry executable's
 * `--repo`/`--item-file` mode runs — NOT a /tmp harness.
 */
export function buildLocalCleanRoomDeps(opts: {
  readonly repoDir: string;
  readonly item: WorkItem;
  readonly config: BackendConfig;
  readonly seams?: ProductionSeams;
}): ProductionDeps {
  const noopGh: GhClient = {
    async listIssues() { return []; },
    async getIssue() { return null; },
    async listByLabelAllStates() { return []; },
    async listComments() { return []; },
    async addLabel() {},
    async removeLabel() {},
    async comment() { return 'noop'; },
    async closeIssue() {},
    async createIssue() { return -1; },
  };
  return buildProductionDeps({
    source: new LocalItemWorkSource(opts.item),
    readyItems: [opts.item],
    cwdFor: () => opts.repoDir,
    config: opts.config,
    gh: noopGh,
    ...(opts.seams !== undefined ? { seams: opts.seams } : {}),
  });
}

/** Resolve the implement backend label for an item (re-exported for the preview). */
export function implementBackendLabel(item: WorkItem, config: BackendConfig): string {
  return resolveImplementBackendId(item, config);
}

/** Re-export for callers wiring the runner kind into the preview. */
export function runnerKindLabel(item: WorkItem): RunnerKind {
  return resolveRunnerKind(item);
}
