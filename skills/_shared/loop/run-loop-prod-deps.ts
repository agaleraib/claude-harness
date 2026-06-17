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
  type ImplementBackendId,
  type ReviewBackend,
  IMPLEMENT_BACKENDS,
  ImplementBackendRegistry,
  ReviewBackendRegistry,
  loadBackendConfig,
  resolveImplementBackendId,
} from './dispatch/backends.ts';
import { type SpawnFn, defaultSpawn } from './dispatch/spawn.ts';
import { type AttentionRow, AttentionCollector } from './run-loop-attention-report.ts';
import {
  type ContainerRunner,
  type GitCommitter,
  type GitOpResult,
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
import { type GateResult, type GateRunner, runExitGate } from './protocol/gate.ts';
import {
  type FindingFixer,
  type FindingReproducer,
  runVerifyGate,
} from './protocol/verify-gate.ts';
import {
  type RunProgress,
  type RunStopReason,
  type TerminationConfig,
  DEFAULT_TERMINATION,
  RunSummaryBuilder,
  type RunSummaryReport,
  newRunProgress,
  recordOutcome,
  shouldStop,
} from './termination.ts';
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

/**
 * Per-run backend-direction overrides (Wave 22, Task 6 knob). Parsed from the
 * `--implement`/`--review` CLI flags (flag wins over env) and validated BEFORE any
 * drive side effect; threaded here so they land as `config.implementDefault` /
 * `config.reviewDefault`. Absent ⇒ fall back to env then the hardcoded defaults.
 */
export interface BackendDirectionOverrides {
  readonly implementDefault?: string;
  readonly reviewDefault?: string;
}

/** Build the BackendConfig from process.env (+ optional per-run direction overrides). */
export function buildBackendConfigFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
  overrides: BackendDirectionOverrides = {},
): BackendConfig {
  // .harness-profile parsing for the loop knobs lands with the SKILL.md wiring; the
  // env keys (API keys) are the security-relevant inputs and come from env here.
  //
  // The data-egress knob (allow_external_review) is a per-repo policy: absent ⇒ deny
  // (the diff stays local; review downgrades to codex). An operator can opt a clean-room
  // / trusted run into the external Opus/OpenRouter reviewer via the explicit env gate
  // RUN_LOOP_ALLOW_EXTERNAL_REVIEW=1 — surfaced, not silent, and operator-controlled.
  const base = loadBackendConfig(env);

  // Backend-direction knob (Task 6): the resolved override (flag-then-env) wins over the
  // profile/hardcoded default. The caller has already validated the values; we only
  // place them onto the config. Egress is unchanged: review=codex is local (no gate);
  // anthropic-api / openrouter still require RUN_LOOP_ALLOW_EXTERNAL_REVIEW below.
  const implementRaw =
    overrides.implementDefault ?? env['RUN_LOOP_IMPLEMENT_BACKEND'] ?? base.implementDefault;
  // Narrow to the known implement-backend set; an unrecognized value (e.g. a stray env
  // string that bypassed the entry's validation) is dropped so the per-item codex
  // default applies — never widen `implementDefault` to an arbitrary string.
  const implementDefault: ImplementBackendId | undefined =
    implementRaw !== undefined && IMPLEMENT_BACKENDS.includes(implementRaw as ImplementBackendId)
      ? (implementRaw as ImplementBackendId)
      : undefined;
  const reviewDefault =
    overrides.reviewDefault ?? env['RUN_LOOP_REVIEW_BACKEND'] ?? base.reviewDefault;

  const allow = env['RUN_LOOP_ALLOW_EXTERNAL_REVIEW'];
  const allowExternalReview = allow === '1' || allow === 'true' ? true : base.allowExternalReview;

  return {
    ...base,
    ...(implementDefault !== undefined ? { implementDefault } : {}),
    ...(reviewDefault !== undefined ? { reviewDefault } : {}),
    ...(allowExternalReview !== undefined ? { allowExternalReview } : {}),
  };
}

// --- repo-resolved gate config (Wave 24, Task 1 — F-030) --------------------------
//
// Decision 2 (gate is repo-resolved): the TARGET repo declares its checks; the SKILL.md
// reads the `.harness-profile` `gate:` block and exports the env vars; the engine consumes
// the env into a `RepoGateConfig` with NO YAML parser (zero-dep). Decision 7 (gate command
// encoding — NO shell sniffing): each check is encoded in exactly one of two EXPLICIT forms:
//   (a) argv form  `RUN_LOOP_GATE_TESTS` = a JSON array of strings → spawned directly, NO shell;
//   (b) shell form `RUN_LOOP_GATE_TESTS_SHELL` = a scalar string → spawned `sh ['-c', value]`.
// The same check in BOTH forms ⇒ a configError (never silently pick one). No auto-detection of
// shell metacharacters.

/**
 * A single gate check command. A discriminated value: either a non-empty argv (run with
 * NO shell — `argv[0]` is the command, the rest are args) or a `{ shell }` scalar (run as
 * `sh ['-c', value]`). These are the only two encodings (Decision 7).
 */
export type Command = { readonly argv: readonly string[] } | { readonly shell: string };

/** The three repo-declared gate checks, plus a config-error sentinel + the "configured?" flag. */
export interface RepoGateConfig {
  readonly tests?: Command;
  readonly typecheck?: Command;
  readonly verify?: Command;
  /**
   * Set when the env is internally inconsistent (a check declared in BOTH the argv and
   * `*_SHELL` forms, or invalid JSON in the argv form). A misconfigured gate fails CLOSED
   * (Task 2 turns this into a RED/refuse with the offending check named) — never green.
   */
  readonly configError?: string;
  /** True iff at least one runnable check resolved (⇒ "a gate is configured for this repo"). */
  readonly isConfigured: boolean;
}

/** The three gate-check keys, in their canonical order. */
const GATE_CHECK_KEYS = ['tests', 'typecheck', 'verify'] as const;
type GateCheckKey = (typeof GATE_CHECK_KEYS)[number];

/** The env-var suffix for each check's argv form (`RUN_LOOP_GATE_<SUFFIX>`). */
const GATE_ENV_SUFFIX: Readonly<Record<GateCheckKey, string>> = {
  tests: 'TESTS',
  typecheck: 'TYPECHECK',
  verify: 'VERIFY',
};

/**
 * Parse one check's two env forms into a `Command` (or undefined / a config error).
 * Returns `{ command }` when exactly one form resolves, `{}` when neither resolves, and
 * `{ error }` when both forms are populated (mix-is-an-error) or the argv JSON is invalid.
 *
 * Precedence per Decision 7 when BOTH are present is moot: the same check declared in both
 * forms is a configError, not a silent pick. (The item-`gate`-descriptor arm of the
 * precedence lives in `ShellGateRunner.cmdFor`, ahead of this repo config.)
 */
function parseCheckFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  key: GateCheckKey,
): { readonly command?: Command; readonly error?: string } {
  const suffix = GATE_ENV_SUFFIX[key];
  const argvRaw = env[`RUN_LOOP_GATE_${suffix}`];
  const shellRaw = env[`RUN_LOOP_GATE_${suffix}_SHELL`];

  // Shell form: a present, non-empty scalar.
  const hasShell = typeof shellRaw === 'string' && shellRaw.trim().length > 0;

  // Argv form: a present value parsed as a JSON non-empty string[].
  let argvCommand: Command | undefined;
  if (typeof argvRaw === 'string' && argvRaw.trim().length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(argvRaw);
    } catch {
      // Invalid JSON (e.g. `RUN_LOOP_GATE_TESTS="npm test"`) ⇒ key omitted + a config error.
      return { error: `${key}: RUN_LOOP_GATE_${suffix} is not valid JSON (expected a JSON array of strings, e.g. ["npm","test"])` };
    }
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((x) => typeof x === 'string')) {
      argvCommand = { argv: parsed as readonly string[] };
    } else if (!Array.isArray(parsed)) {
      // A non-array JSON value (e.g. `5`, `{"a":1}`) is a config error.
      return { error: `${key}: RUN_LOOP_GATE_${suffix} JSON must be an array of strings` };
    }
    // Else: a present-but-empty array (`[]`) ⇒ key omitted, NOT a config error (a partial gate).
  }

  // Mix-is-an-error: the SAME check declared in BOTH a runnable argv AND a runnable shell.
  if (argvCommand !== undefined && hasShell) {
    return {
      error: `${key}: declared in BOTH RUN_LOOP_GATE_${suffix} (argv) and RUN_LOOP_GATE_${suffix}_SHELL — pick one encoding`,
    };
  }

  // Precedence: *_SHELL scalar → JSON-argv → absent. (Both-present is handled above.)
  if (hasShell) {
    return { command: { shell: (shellRaw as string) } };
  }
  if (argvCommand !== undefined) {
    return { command: argvCommand };
  }
  return {};
}

/**
 * Build a `RepoGateConfig` from the gate env vars (Decision 2 + Decision 7). Sibling to
 * `buildBackendConfigFromEnv`. NO YAML parser — the SKILL.md does the `.harness-profile`
 * `gate:` read and exports the env. The same check in both encodings, or invalid JSON,
 * surfaces a `configError`; a present-but-empty value omits the key (a legitimate partial
 * gate). `isConfigured` is true iff ≥1 runnable check resolved.
 */
export function buildGateConfigFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): RepoGateConfig {
  const resolved: { tests?: Command; typecheck?: Command; verify?: Command } = {};
  const errors: string[] = [];
  for (const key of GATE_CHECK_KEYS) {
    const r = parseCheckFromEnv(env, key);
    if (r.error !== undefined) {
      errors.push(r.error);
    }
    if (r.command !== undefined) {
      resolved[key] = r.command;
    }
  }
  const isConfigured =
    resolved.tests !== undefined || resolved.typecheck !== undefined || resolved.verify !== undefined;
  return {
    ...resolved,
    ...(errors.length > 0 ? { configError: errors.join('; ') } : {}),
    isConfigured,
  };
}

/**
 * A production GateRunner that shells the repo's checks for one item. Resolution per
 * Decision 7's precedence: item `gate` descriptor → repo `RepoGateConfig` check → absent.
 * Each command's zero exit = pass; a `{ shell }` command is spawned `sh ['-c', value]`, an
 * argv command is spawned directly (NO shell). The three-way fail-safe rule (Decision 3) —
 * no gate ⇒ NOT green, configError ⇒ NOT green, partial gate ⇒ absent sub-check passes — is
 * applied by the per-item protocol (Task 2) which keys on `isConfiguredFor`/`configError`.
 */
export class ShellGateRunner implements GateRunner {
  private readonly spawn: SpawnFn;
  private readonly cwd: string;
  private readonly config: RepoGateConfig;
  /** Captured note for the most recent red check (truncated stderr tail). */
  private lastNote: string | undefined;
  constructor(spawn: SpawnFn, cwd: string, config: RepoGateConfig = { isConfigured: false }) {
    this.spawn = spawn;
    this.cwd = cwd;
    this.config = config;
  }

  /** Whether ANY gate is configured for this item (item descriptor OR repo config). */
  isConfiguredFor(item: WorkItem): boolean {
    if (this.config.isConfigured) {
      return true;
    }
    const gate = item['gate'];
    if (gate !== null && typeof gate === 'object') {
      for (const key of GATE_CHECK_KEYS) {
        const v = (gate as Record<string, unknown>)[key];
        if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string')) {
          return true;
        }
      }
    }
    return false;
  }

  /** The config error (if the repo config is internally inconsistent). */
  configError(): string | undefined {
    return this.config.configError;
  }

  /** The note for the most recent red check (cleared at the start of each check). */
  note(): string | undefined {
    return this.lastNote;
  }

  private async runCmd(cmd: Command | undefined): Promise<boolean> {
    if (cmd === undefined) {
      return true; // sub-check absent ⇒ passes (only legitimate when a gate is otherwise configured)
    }
    let command: string;
    let argv: readonly string[];
    if ('shell' in cmd) {
      command = 'sh';
      argv = ['-c', cmd.shell];
    } else {
      const [first, ...rest] = cmd.argv;
      if (first === undefined) {
        return true; // empty argv ⇒ nothing to run (defensive; parser rejects empty arrays)
      }
      command = first;
      argv = rest;
    }
    const r = await this.spawn(command, [...argv], {
      cwd: this.cwd,
      env: process.env as Record<string, string>,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r.exitCode !== 0) {
      // Record the red check's stderr tail. Set ONLY on an actual red spawn so it survives
      // a later absent (no-op) sub-check — runExitGate runs all three with no short-circuit,
      // and an absent sub-check must not clear an earlier red check's note.
      this.lastNote = truncateStderr(r.stderr);
    }
    return r.exitCode === 0;
  }

  /** Resolve a check command: item `gate` descriptor first, then the repo config. */
  private cmdFor(item: WorkItem, key: GateCheckKey): Command | undefined {
    const gate = item['gate'];
    if (gate !== null && typeof gate === 'object') {
      const v = (gate as Record<string, unknown>)[key];
      if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string')) {
        return { argv: v as readonly string[] };
      }
    }
    return this.config[key];
  }

  async runTests(item: WorkItem): Promise<boolean> {
    // First check of the gate sequence clears the prior run's note (the protocol builds a
    // fresh ShellGateRunner per gate invocation, but defend against reuse).
    this.lastNote = undefined;
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
  /** Wave 23: collects per-item attention rows (auto-merged vs need-you) for the report. */
  readonly attention?: AttentionCollector;
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

  /**
   * Crash-isolation boundary (Wave 22, Task 2 — Bug 2). Any throw from the per-item
   * work (e.g. UnsupportedContainerRunner.run on an unwired sandcastle lane) is caught
   * HERE, recorded as `status:'failed'` with the reason surfaced in the note, and the
   * runner is torn down (best-effort) so the frozen engine's loop continues with the
   * next item instead of the throw propagating out of runLoop and killing the run. The
   * frozen `runLoop` is NOT modified — isolation lives in this injected protocol.
   */
  async run(item: WorkItem, runner: Runner): Promise<ItemResult> {
    try {
      return await this.runInner(item, runner);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      // Best-effort teardown — never let a teardown failure mask the original cause.
      try {
        await runner.teardown();
      } catch {
        /* swallow: the loop must continue regardless */
      }
      this.d.console.print(`[trace] item ${item.id} threw; isolated + skipped: ${reason}`);
      return {
        itemId: item.id,
        status: 'failed',
        note: `implement-failed: item threw before a gate ran — ${reason}`,
      };
    }
  }

  private async runInner(item: WorkItem, runner: Runner): Promise<ItemResult> {
    const cwd = this.d.cwdFor(item);
    const lane = resolveRunnerKind(item);
    const log = (m: string) => this.d.console.print(`[trace] ${m}`);

    // Wave 23 — merge-to-head: each item works on an isolated predictable-named temp
    // branch off HEAD; a GREEN item is merged-then-deleted (HEAD advances only here);
    // a non-green item's branch is preserved + handed off (push + draft PR). Replaces
    // the Wave-22 commit-in-place + synthetic `merged at <sha>` behavior.
    const ops = this.mergeOps();
    const branch = `run-loop/${item.id}`;
    const title = typeof item['title'] === 'string' ? (item['title'] as string) : undefined;

    const backend = this.d.implementRegistry.resolve(item);
    log(`implement: dispatching ${backend.id} (lane=${lane}) …`);
    await runner.prepare();

    // Isolate: branch off HEAD so commits land on the temp branch, never HEAD.
    const origBranch = await ops.currentBranch(cwd);
    await ops.createTempBranch(cwd, branch);
    const base = await this.d.committer.head(cwd);

    // Everything after the temp branch exists is wrapped so a THROW (e.g. an unwired
    // sandcastle lane, or a gate/review subprocess error) never strands the repo on the
    // temp branch: the catch restores the integration branch, drops the temp branch if no
    // commit landed (preserves it if real work was committed), then re-throws so the outer
    // crash-isolation records the failure.
    let committedToBranch = false;
    try {
      // 1. IMPLEMENT — the real agent edits; the runner commits ON THE TEMP BRANCH.
      //    Bug 3 (Wave 22): commit the working-tree edits REGARDLESS of the agent's exit
      //    code (codex can produce a coherent impl and still exit non-zero). Probe dirty;
      //    if the agent exited ok OR the tree is dirty, commit + collect.
      const prompt = this.promptFor(item);
      const result = await backend.dispatch(prompt, { cwd, env: process.env as Record<string, string>, lane });

      const treeDirty = await this.dirtyTree(cwd);
      let commits: readonly string[] = [];
      if (result.ok || treeDirty) {
        await this.d.committer.commitAll(cwd, `feat: ${item.id} (/run-loop)`);
        commits = await this.d.committer.collectCommits(cwd, base);
      }
      committedToBranch = commits.length > 0;
      log(
        `implement: ${backend.id} exit=${result.exitCode} ok=${result.ok} dirty=${treeDirty}; ` +
          `runner produced ${commits.length} commit(s): ${commits.join(', ')}`,
      );

      if (commits.length === 0) {
        // No work landed — return to the main line, drop the empty temp branch, no handoff
        // (nothing to push). `implement-failed:` bucket (the gate never ran — Bug 4).
        await ops.checkout(cwd, origBranch);
        await ops.deleteBranch(cwd, branch);
        await runner.teardown();
        const why = !result.ok
          ? `agent ${backend.id} exited ${result.exitCode}; ${truncateStderr(result.stderr)}`
          : 'agent made no edits / no commit produced';
        this.d.attention?.record({ itemId: item.id, ...(title ? { title } : {}), reason: 'failed-check', detail: `no changes produced — ${why}` });
        return { itemId: item.id, status: 'failed', note: `implement-failed: ${why}` };
      }
      if (!result.ok) {
        log(`implement: ${backend.id} exited ${result.exitCode} but produced edits; committing + gating anyway`);
      }

      // 2. EXIT GATE — authoritative for merge, FAIL-SAFE (Wave 24 Task 2, Decision 3).
      const gate = await this.runFailSafeGate(item, cwd);
      log(`gate: green=${gate.green} checks=${JSON.stringify(gate.checks)}`);
      if (!gate.green) {
        // RED gate: preserve the branch (back to the main line, no merge), hand it off.
        await ops.checkout(cwd, origBranch);
        await runner.teardown();
        const handoff = await this.handoff(item, branch, 'failed-check', title);
        return { itemId: item.id, status: 'failed', note: `gate-failed: ${gate.note ?? 'exit gate red'}; ${handoff}` };
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
      //    it makes the FAIL-SAFE gate go red; nothing here acts on a raw assertion. Using
      //    the fail-safe gate (not a raw runExitGate) is what heals the verify-gate (Wave 24
      //    Task 5): a real gate goes red on a reddening finding, so the finding reproduces;
      //    a non-reddening finding stays advisory. (An unconfigured item never reaches here —
      //    its per-item gate already red'd it / preflight refused the run.)
      const reproducer: FindingReproducer = {
        reproduce: async () => !(await this.runFailSafeGate(item, cwd)).green,
      };
      const fixer: FindingFixer = { fix: async () => { /* no auto-fix on the local path */ } };
      const vg = await runVerifyGate(item, review.findings, { reproducer, fixer, gh: this.d.gh, maxFixRounds: 1 });
      log(
        `verify-gate: triaged=${vg.triaged.length} advisory=${vg.advisory.length} ` +
          `escalate=${vg.escalate}`,
      );

      if (vg.escalate) {
        // A reproduced review finding — preserve the branch + hand it off (no merge).
        await ops.checkout(cwd, origBranch);
        await runner.teardown();
        const handoff = await this.handoff(item, branch, 'review-finding', title);
        return { itemId: item.id, status: 'escalated', note: `a review finding reproduced + was not fixed within the bound; ${handoff}` };
      }

      // 5. GREEN + no escalation ⇒ merge-to-head. Back to the main line, then merge.
      await ops.checkout(cwd, origBranch);
      const merge = await ops.mergeToHead(cwd, branch);
      if (!merge.ok) {
        // escalate-on-conflict: abort (HEAD untouched), preserve the branch, hand it off,
        // and CONTINUE the loop (skip-and-continue) — do NOT crash.
        await ops.abortMerge(cwd);
        await runner.teardown();
        const handoff = await this.handoff(item, branch, 'merge-conflict', title);
        log(`merge: CONFLICT on ${item.id}; aborted + preserved ${branch}`);
        return { itemId: item.id, status: 'escalated', note: `merge-conflict: could not auto-merge ${branch} onto HEAD; ${handoff}` };
      }
      await ops.deleteBranch(cwd, branch);
      await runner.teardown();
      const mergeSha = await this.d.committer.head(cwd);
      log(`merge: AFK-merged ${item.id} at ${mergeSha}`);
      this.d.attention?.record({ itemId: item.id, ...(title ? { title } : {}), reason: 'auto-merged' });
      return { itemId: item.id, status: 'completed', note: `merged at ${mergeSha}` };
    } catch (err) {
      // Restore the integration branch so a throw never strands the repo on the temp
      // branch; drop the temp branch only when no commit landed (preserve real work).
      try {
        await ops.checkout(cwd, origBranch);
        if (!committedToBranch) {
          await ops.deleteBranch(cwd, branch);
        }
      } catch {
        /* best-effort cleanup — never mask the original throw */
      }
      throw err;
    }
  }

  /**
   * Run the per-item exit gate FAIL-SAFE (Wave 24, Task 2 — the locked three-way rule,
   * Decision 3). The "is anything configured?" decision is made ONCE per item, keyed on
   * the runner's `isConfiguredFor(item)` (item descriptor OR repo `RepoGateConfig`):
   *   (a) no gate configured at all          ⇒ NOT green, note `gate-unconfigured: …`
   *       — NEVER vacuously green. (The motivating defect was a gate that ran zero commands
   *       and returned green, so the loop merged blind.)
   *   (b) a `configError` is set             ⇒ NOT green, note `gate-config-error: <text>`
   *       — a misconfigured gate fails CLOSED.
   *   (c) configured                          ⇒ delegate to `runExitGate`. A present
   *       sub-check runs (zero exit = pass); an absent sub-check passes (legitimate partial
   *       gate — `runCmd(undefined) → true`).
   *
   * A gate runner WITHOUT the fail-safe surface (`isConfiguredFor`/`configError`) is a
   * test/wiring shim — fall back to `runExitGate` (the pre-Wave-24 behavior) so those tests
   * are unaffected. Production always injects a `ShellGateRunner`, which has the surface.
   */
  private async runFailSafeGate(item: WorkItem, cwd: string): Promise<GateResult> {
    const runner = this.d.gate(item, cwd);
    const fs = runner as FailSafeGateRunner;
    if (typeof fs.isConfiguredFor === 'function') {
      const configError = typeof fs.configError === 'function' ? fs.configError() : undefined;
      if (configError !== undefined) {
        return {
          green: false,
          checks: { tests: false, typecheck: false, verify: false },
          note: `gate-config-error: ${configError}`,
        };
      }
      if (!fs.isConfiguredFor(item)) {
        return {
          green: false,
          checks: { tests: false, typecheck: false, verify: false },
          note: 'gate-unconfigured: no gate commands resolved for this repo',
        };
      }
    }
    // Configured (or a test shim without the surface) ⇒ run the real exit gate. On a red
    // gate, enrich the note with the runner's captured stderr tail (the last red check's
    // truncated stderr) so the failure note names WHY, not just WHICH, check failed.
    const result = await runExitGate(item, runner);
    if (!result.green && typeof fs.note === 'function') {
      const tail = fs.note();
      if (tail !== undefined) {
        const base = result.note ?? `exit gate red for ${item.id}`;
        return { ...result, note: `${base} — ${tail}` };
      }
    }
    return result;
  }

  /**
   * The HITL handoff (Wave 23, Task 3): push the preserved branch + open a draft PR via
   * the GhClient seam, recording an attention row. On a no-remote / no-creds failure
   * (push or PR-open), degrade to the copy-paste-command fallback — never crash. Returns
   * a short note fragment (PR url or fallback marker) for the ItemResult.note.
   */
  private async handoff(
    item: WorkItem,
    branch: string,
    reason: Exclude<AttentionRow['reason'], 'auto-merged'>,
    title: string | undefined,
  ): Promise<string> {
    const cwd = this.d.cwdFor(item);
    const ops = this.mergeOps();
    const titleField = title ? { title } : {};
    const push = await ops.pushBranch(cwd, branch);
    if (push.ok) {
      const pr = await this.d.gh.createPullRequest({
        head: branch,
        title: `[run-loop] ${item.id} — ${reason}`,
        body: `Automated /run-loop handoff: item \`${item.id}\` needs a human (${reason}). Work is on \`${branch}\`. Review, then merge or close.`,
        draft: true,
      });
      if (pr.ok && pr.url !== undefined) {
        this.d.console.print(`[trace] handoff: pushed ${branch} + opened draft PR ${pr.url}`);
        this.d.attention?.record({ itemId: item.id, ...titleField, reason, branch, prUrl: pr.url });
        return `PR ${pr.url}`;
      }
    }
    // No-remote / no-creds fallback: keep the branch local + stash copy-paste commands.
    const fallbackCommands = [
      `git push -u origin ${branch}`,
      `gh pr create --draft --head ${branch} --fill`,
    ];
    this.d.console.print(`[trace] handoff: no remote/creds — ${branch} preserved locally with copy-paste commands`);
    this.d.attention?.record({ itemId: item.id, ...titleField, reason, branch, fallbackCommands });
    return `no-remote: branch ${branch} preserved (see attention report)`;
  }

  /**
   * The committer's merge-to-head ops (Wave 23), surfaced via the structural
   * `ShellGitCommitterLike` (the `diff?`/`dirty?` precedent). Production always injects
   * a `ShellGitCommitter` (which has them); a committer lacking them is a test/wiring
   * bug, surfaced with a clear error rather than a silent commit-in-place regression.
   */
  private mergeOps(): {
    currentBranch(cwd: string): Promise<string>;
    checkout(cwd: string, branch: string): Promise<void>;
    createTempBranch(cwd: string, name: string): Promise<void>;
    mergeToHead(cwd: string, branch: string): Promise<{ readonly ok: boolean }>;
    abortMerge(cwd: string): Promise<void>;
    deleteBranch(cwd: string, branch: string): Promise<void>;
    pushBranch(cwd: string, branch: string): Promise<{ readonly ok: boolean }>;
  } {
    const c = this.d.committer as ShellGitCommitterLike;
    if (
      c.currentBranch === undefined || c.checkout === undefined || c.createTempBranch === undefined ||
      c.mergeToHead === undefined || c.abortMerge === undefined || c.deleteBranch === undefined ||
      c.pushBranch === undefined
    ) {
      throw new Error('run-loop: the committer does not support the merge-to-head lifecycle (Wave 23)');
    }
    return {
      currentBranch: (cwd) => c.currentBranch!(cwd),
      checkout: (cwd, b) => c.checkout!(cwd, b),
      createTempBranch: (cwd, n) => c.createTempBranch!(cwd, n),
      mergeToHead: (cwd, b) => c.mergeToHead!(cwd, b),
      abortMerge: (cwd) => c.abortMerge!(cwd),
      deleteBranch: (cwd, b) => c.deleteBranch!(cwd, b),
      pushBranch: (cwd, b) => c.pushBranch!(cwd, b),
    };
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

  /**
   * Probe the working tree for uncommitted edits (Bug 3). Uses the committer's additive
   * `dirty()` when present (ShellGitCommitter); a committer without it reports false (so
   * the pre-Bug-3 ok-only commit path is preserved for a minimal fake committer).
   */
  private async dirtyTree(cwd: string): Promise<boolean> {
    const probe = (this.d.committer as ShellGitCommitterLike).dirty;
    if (probe === undefined) {
      return false;
    }
    return probe.call(this.d.committer, cwd);
  }
}

/** Truncate captured stderr to a short tail for the note/trace (never the env). */
function truncateStderr(stderr: string, max = 280): string {
  const s = stderr.trim();
  if (s.length === 0) {
    return '(no stderr)';
  }
  return s.length <= max ? s : `…${s.slice(s.length - max)}`;
}

/**
 * Structural type: a committer that can also produce a diff + probe a dirty tree
 * (ShellGitCommitter does both). Both are additive on the concrete impl — the frozen
 * `GitCommitter` interface is untouched (Wave 22, Bug 3).
 */
interface ShellGitCommitterLike extends GitCommitter {
  diff?(cwd: string, base: string): Promise<string>;
  dirty?(cwd: string): Promise<boolean>;
  // merge-to-head lifecycle (Wave 23) — additive concrete methods, surfaced structurally.
  currentBranch?(cwd: string): Promise<string>;
  checkout?(cwd: string, branch: string): Promise<void>;
  createTempBranch?(cwd: string, name: string): Promise<void>;
  mergeToHead?(cwd: string, branch: string): Promise<GitOpResult>;
  abortMerge?(cwd: string): Promise<void>;
  deleteBranch?(cwd: string, branch: string): Promise<void>;
  pushBranch?(cwd: string, branch: string, remote?: string): Promise<GitOpResult>;
}

/**
 * Structural type: a GateRunner that also exposes the Wave-24 fail-safe surface. The
 * frozen `GateRunner` (`protocol/gate.ts`) is NOT widened; these are surfaced structurally
 * (the `ShellGitCommitterLike` precedent). `ShellGateRunner` implements all three; a test
 * shim that omits them falls back to the pre-Wave-24 `runExitGate` behavior.
 */
interface FailSafeGateRunner extends GateRunner {
  /** Whether ANY gate is configured for the item (item descriptor OR repo config). */
  isConfiguredFor?(item: WorkItem): boolean;
  /** The repo config's internal-inconsistency error, if any (a misconfigured gate). */
  configError?(): string | undefined;
  /** A truncated stderr tail captured for the most recent red check. */
  note?(): string | undefined;
}

/** The production EngineDeps + the resolved config + the source's ready items. */
export interface ProductionDeps {
  readonly engine: EngineDeps;
  readonly config: BackendConfig;
  readonly readyItems: readonly WorkItem[];
  /** Build the RunSummaryReport from a RunSummary (driver prints it). */
  readonly buildReport: (summary: { readonly visited: readonly string[]; readonly results: readonly ItemResult[] }) => RunSummaryReport;
  /**
   * Whether a real sandcastle container runner is wired (Wave 22, Bug 2). False when the
   * graph fell back to UnsupportedContainerRunner — the driver's preflight then refuses
   * sandcastle items instead of clearing them to a mid-run crash.
   */
  readonly containerLaneWired: boolean;
  /** Wave 23: the per-run attention-row collector (the driver renders + writes it). */
  readonly attention: AttentionCollector;
  /**
   * Wave 24 (Task 1/Task 3): the repo-resolved gate config the graph was built with. The
   * driver reads this for the fail-safe preflight refusal (no resolvable gate ⇒ refuse the
   * run before any agent dispatch). Always present (defaults to `isConfigured: false`).
   */
  readonly gateConfig: RepoGateConfig;
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
  /**
   * Wave 23: the real `RunStopReason` for the printed report. The termination-aware
   * source wrapper knows whether the run stopped on a cap/stall vs draining; absent ⇒
   * `drained` (the frozen `runLoop` only ever sees a drained source).
   */
  readonly stopReason?: () => RunStopReason;
  /**
   * Wave 24 (Task 1): the repo-resolved gate config (from `buildGateConfigFromEnv`),
   * threaded into every per-item `ShellGateRunner` via its constructor. Absent ⇒ an
   * unconfigured config (`isConfigured: false`) — the Task-2 fail-safe rule then reds the
   * item / Task-3 refuses the run at preflight. NEVER vacuously green.
   */
  readonly gateConfig?: RepoGateConfig;
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
  // The container lane is "wired" only when the caller injected a real ContainerRunner;
  // the default UnsupportedContainerRunner throws (Bug 2 — preflight refuses sandcastle).
  const containerLaneWired = opts.seams?.container !== undefined;
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

  const gateConfig = opts.gateConfig ?? { isConfigured: false };
  const gate = (_item: WorkItem, cwd: string): GateRunner => new ShellGateRunner(spawn, cwd, gateConfig);

  const attention = new AttentionCollector();
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
    attention,
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
          // Bug 4: route by the machine-readable note prefix the protocol set —
          // `implement-failed:` (no gate ran) vs `gate-failed:` (gate ran red). An
          // unprefixed failure defaults to gate-failed (pre-Wave-22 behavior).
          if ((r.note ?? '').startsWith('implement-failed:')) {
            builder.recordImplementFailed(r.itemId);
          } else {
            builder.recordGateFailed(r.itemId);
          }
          break;
        case 'skipped':
          break;
        default: {
          const exhaustive: never = r.status;
          throw new Error(`run-loop: unknown item status ${String(exhaustive)}`);
        }
      }
    }
    return builder.build(opts.stopReason?.() ?? 'drained');
  };

  return { engine, config, readyItems: opts.readyItems, buildReport, containerLaneWired, attention, gateConfig };
}

/**
 * Build the production `issues`-mode deps: a real GhCliAdapter-backed IssueWorkSource.
 * Used by the entry executable for `node run-loop-entry.ts issues`. Each issue item runs
 * in the current repo checkout (cwd). For a fully local throwaway smoke without a GitHub
 * remote, a caller can instead build a local WorkSource and call buildProductionDeps
 * directly (see the live-test runbook / smoke harness).
 */
export async function buildIssuesProductionDeps(
  seams?: ProductionSeams,
  overrides: BackendDirectionOverrides = {},
): Promise<ProductionDeps> {
  const command = seams?.command ?? new ExecFileCommandRunner();
  const gh = new GhCliAdapter(command);
  const source = new IssueWorkSource({ gh, journal: new InMemoryJournal(), runId: `run-${Date.now()}` });
  const readyItems = await source.allItems();
  // Bug 1 (Task 1): gate the drive on blocked-by readiness. The frozen engine pulls in
  // source order; the readiness gate lives in this composition layer so blockers run
  // before blocked items and a blocked item is withheld until its blockers are done.
  //
  // Bug 5 (Task 5): wire the env-gated GitHub terminal transition (default-off). A
  // successful AFK merge transitions its issue ONLY when RUN_LOOP_TRANSITION_ISSUES=1.
  const transitionHook = buildTerminalTransitionHook(source.terminalTransitions());
  const gatedSource = new ReadinessGatedSource(source, readyItems, transitionHook);
  // Wave 23 Task 5: enforce the termination caps (iteration 20 / stall 3) in the
  // composition layer — the wrapper returns null from nextReady() once a cap fires, so
  // the frozen runLoop stops as `drained` while stopReason() surfaces the real reason.
  const termSource = new TerminationGatedSource(gatedSource);
  // Task 6 knob: the per-run --implement/--review overrides (flag-then-env) land on
  // config.implementDefault / config.reviewDefault here.
  const config = buildBackendConfigFromEnv(process.env, overrides);
  // Wave 24 (Task 1): resolve the repo gate from env (the SKILL.md exported the
  // `.harness-profile` `gate:` block into RUN_LOOP_GATE_* before invoking the engine).
  const gateConfig = buildGateConfigFromEnv(process.env);
  const repoCwd = process.cwd();
  return buildProductionDeps({
    source: termSource,
    readyItems,
    cwdFor: () => repoCwd,
    config,
    gh,
    gateConfig,
    stopReason: () => termSource.stopReason(),
    ...(seams !== undefined ? { seams } : {}),
  });
}

/**
 * Readiness-gated WorkSource wrapper (Wave 22, Task 1 — Bug 1).
 *
 * The frozen `engine.ts` pulls items in source order with no readiness check and throws
 * if a source ever re-yields an id it already saw this run. So the readiness gate lives
 * HERE, in the issues-mode source composition, NOT in the engine: this wrapper holds the
 * full ready-item set up front and, on each `nextReady()`, yields the next not-yet-
 * yielded item whose blockers are ALL done — processing blockers before blocked items.
 *
 * "Done" for a blocker (OQ-3, resolved — the UNION):
 *   - recorded `completed` THIS run (via recordResult), OR
 *   - the blocker's issue carries a terminal state (inner.isDone() ⇒ closed / terminal
 *     marker).
 * Either satisfies readiness. With `RUN_LOOP_TRANSITION_ISSUES` default-off, a blocker
 * AFK-merged locally never transitions its issue, so the recorded-this-run arm is what
 * unblocks its dependents inside a single drive — exactly the intended "defer #3 until
 * #2 is done" behavior.
 *
 * Blockers referencing ids NOT in this run's ready set are ignored (dangling-edge rule,
 * mirroring `scheduler/dag.ts`'s `blockersOf`): a blocker that is already closed is not
 * in the ready-for-agent queue, so it does not gate.
 *
 * When no remaining item is currently ready (its blockers are not yet done), `nextReady`
 * returns `null` — the source is drained for this drive. The engine then stops; a
 * re-run (resume) re-evaluates against the now-updated issue state.
 */
/**
 * Optional terminal-transition hook (Wave 22, Task 5 — Bug 5). Invoked by the issues-
 * mode drive AFTER a result is recorded, to transition the item's GitHub issue
 * (complete / escalate) — only when the operator opts in via `RUN_LOOP_TRANSITION_ISSUES`.
 * Default-off ⇒ the drive stays GitHub-read-only (local commits only), preserving the
 * reversible throwaway-branch posture.
 */
export interface TerminalTransitionHook {
  onResult(item: WorkItem, result: ItemResult): Promise<void>;
}

/**
 * Termination-cap enforcement (Wave 23, Task 5). A `WorkSource` wrapper composing with
 * `ReadinessGatedSource`: it folds each outcome into `RunProgress` and, before yielding
 * the next item, consults `shouldStop`. When a cap (iteration ≥ 20) or stall (3
 * consecutive failures) hits, `nextReady()` returns `null` — the frozen `runLoop` stops
 * as if drained — while `stopReason()` surfaces the REAL reason for the printed report.
 * `engine.ts` is NOT modified; the cap lives entirely in this composition layer.
 */
export class TerminationGatedSource implements WorkSource {
  private readonly inner: WorkSource;
  private readonly config: TerminationConfig;
  private readonly now: () => number;
  private readonly progress: RunProgress;
  private stopped: RunStopReason | null = null;

  constructor(inner: WorkSource, config: TerminationConfig = DEFAULT_TERMINATION, now: () => number = () => Date.now()) {
    this.inner = inner;
    this.config = config;
    this.now = now;
    this.progress = newRunProgress(now());
  }

  /** The real stop reason: a cap/stall when one fired, else `drained`. */
  stopReason(): RunStopReason {
    return this.stopped ?? 'drained';
  }

  async nextReady(): Promise<WorkItem | null> {
    const reason = shouldStop(this.progress, this.config, this.now());
    if (reason !== null) {
      this.stopped = reason;
      return null;
    }
    return this.inner.nextReady();
  }

  async isDone(item: WorkItem): Promise<boolean> {
    return this.inner.isDone(item);
  }

  async recordResult(item: WorkItem, result: ItemResult): Promise<void> {
    recordOutcome(this.progress, terminationOutcome(result));
    await this.inner.recordResult(item, result);
  }
}

/** Map an ItemResult onto the termination-controller's outcome vocabulary. */
function terminationOutcome(
  result: ItemResult,
): 'gate-failed' | 'merged' | 'escalated' | 'awaiting-human' | 'deferred' {
  switch (result.status) {
    case 'completed':
      return 'merged';
    case 'escalated':
      return 'escalated';
    case 'skipped':
      return 'deferred';
    case 'failed':
    default:
      // Both gate-failed and implement-failed count as a failure for the stall streak.
      return 'gate-failed';
  }
}

export class ReadinessGatedSource implements WorkSource {
  private readonly inner: WorkSource;
  private readonly items: readonly WorkItem[];
  private readonly inSet: ReadonlySet<string>;
  private readonly yielded = new Set<string>();
  /** Ids recorded `completed` this run (the in-run "done" arm of the union). */
  private readonly completedThisRun = new Set<string>();
  private readonly transition: TerminalTransitionHook | undefined;
  private initialized = false;

  constructor(inner: WorkSource, items: readonly WorkItem[], transition?: TerminalTransitionHook) {
    this.inner = inner;
    this.items = items;
    this.inSet = new Set(items.map((i) => i.id));
    this.transition = transition;
  }

  /** Blockers present in this run's ready set (dangling edges ignored). */
  private blockersOf(item: WorkItem): readonly string[] {
    const raw = item.blockedBy ?? [];
    return raw.filter((id) => this.inSet.has(id));
  }

  /** A blocker is done iff completed-this-run OR its issue is terminal (inner.isDone). */
  private async blockerDone(blockerId: string): Promise<boolean> {
    if (this.completedThisRun.has(blockerId)) {
      return true;
    }
    const blocker = this.items.find((i) => i.id === blockerId);
    if (blocker === undefined) {
      return true; // not in the set ⇒ does not gate (dangling edge).
    }
    return this.inner.isDone(blocker);
  }

  async nextReady(): Promise<WorkItem | null> {
    if (!this.initialized) {
      // Touch the inner source's init path (its allItems()/nextReady warms the queue);
      // we already hold the ready set, so we only need the inner for isDone/recordResult.
      this.initialized = true;
    }
    for (const item of this.items) {
      if (this.yielded.has(item.id)) {
        continue;
      }
      const blockers = this.blockersOf(item);
      let ready = true;
      for (const b of blockers) {
        if (!(await this.blockerDone(b))) {
          ready = false;
          break;
        }
      }
      if (ready) {
        this.yielded.add(item.id);
        return item;
      }
    }
    // No remaining item is ready this drive (blockers not yet done) ⇒ drained.
    return null;
  }

  async isDone(item: WorkItem): Promise<boolean> {
    return this.inner.isDone(item);
  }

  async recordResult(item: WorkItem, result: ItemResult): Promise<void> {
    if (result.status === 'completed') {
      this.completedThisRun.add(item.id);
    }
    await this.inner.recordResult(item, result);
    // Bug 5: env-gated GitHub terminal transition (default-off ⇒ read-only). The hook
    // itself owns the env check + idempotency; the source just forwards every result.
    if (this.transition !== undefined) {
      await this.transition.onResult(item, result);
    }
  }
}

/**
 * Build the env-gated terminal-transition hook (Wave 22, Task 5 — Bug 5). Returns
 * `undefined` unless `RUN_LOOP_TRANSITION_ISSUES` is set to `1`/`true` — so a default
 * drive performs ZERO GitHub mutation and stays a reversible local-commit run. When
 * enabled, a `completed` item is run through `completeItem` (PR-link comment + close +
 * terminal marker) and an `escalated` item through `escalateItem`; the two-phase machine
 * is idempotent (existing terminal markers ⇒ no-op), so a re-drive is safe.
 */
export function buildTerminalTransitionHook(
  transitions: IssueTransitionMachine,
  env: Readonly<Record<string, string | undefined>> = process.env,
): TerminalTransitionHook | undefined {
  const gate = env['RUN_LOOP_TRANSITION_ISSUES'];
  if (gate !== '1' && gate !== 'true') {
    return undefined; // default-off ⇒ no GitHub mutation.
  }
  return {
    async onResult(item: WorkItem, result: ItemResult): Promise<void> {
      const issueNumber = issueNumberOf(item);
      if (issueNumber === undefined) {
        return; // not a gh-issue item (e.g. a local clean-room item) ⇒ nothing to transition.
      }
      if (result.status === 'completed') {
        const prLink = typeof item['prLink'] === 'string' ? (item['prLink'] as string) : undefined;
        await transitions.completeItem({ issueNumber, ...(prLink !== undefined ? { prLink } : {}) });
      } else if (result.status === 'escalated') {
        await transitions.escalateItem({ issueNumber });
      }
      // `failed`/`skipped` ⇒ leave the issue in the ready queue (no transition).
    },
  };
}

/** The subset of TerminalTransitions the hook drives (structural — no import cycle). */
export interface IssueTransitionMachine {
  completeItem(input: { readonly issueNumber: number; readonly prLink?: string }): Promise<void>;
  escalateItem(input: { readonly issueNumber: number }): Promise<void>;
}

/** Recover the gh issue number from an item id (`issue-<n>`), or undefined. */
function issueNumberOf(item: WorkItem): number | undefined {
  const n = Number.parseInt(String(item.id).replace(/^issue-/, ''), 10);
  return Number.isInteger(n) && /^issue-\d+$/.test(String(item.id)) ? n : undefined;
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
  /**
   * Wave 24 (Task 1): the repo gate config. The clean-room item usually carries its OWN
   * `gate` descriptor (the item-descriptor arm of Decision 7's precedence), so this can be
   * absent (defaults to `isConfigured: false`); the item gate then drives the per-item gate.
   */
  readonly gateConfig?: RepoGateConfig;
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
    async createPullRequest() { return { ok: false, error: 'no-remote (clean-room)' }; },
  };
  return buildProductionDeps({
    source: new LocalItemWorkSource(opts.item),
    readyItems: [opts.item],
    cwdFor: () => opts.repoDir,
    config: opts.config,
    gh: noopGh,
    ...(opts.gateConfig !== undefined ? { gateConfig: opts.gateConfig } : {}),
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
