// Wave 21 Task 1 — backend resolution + stdin-ignored dispatch tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  type AgentBackend,
  type AgentDispatchContext,
  type AgentDispatchResult,
  type BackendConfig,
  type ReviewBackend,
  type ReviewDispatchContext,
  type ReviewFinding,
  DEFAULT_IMPLEMENT_BACKEND,
  DEFAULT_REVIEW_BACKEND,
  ImplementBackendRegistry,
  ReviewBackendRegistry,
  UnknownBackendError,
  loadBackendConfig,
  parseReviewBackendId,
  resolveImplementBackendId,
  resolveReviewBackendId,
} from '../dispatch/backends.ts';
import {
  type SpawnFn,
  type SpawnOptions,
  DISPATCH_STDIO,
  spawnIgnoringStdin,
  stripClaudeMarkers,
} from '../dispatch/spawn.ts';
import { type WorkItem } from '../types.ts';

function item(extra: Record<string, unknown> = {}): WorkItem {
  return { id: 'i1', ...extra };
}

// --- A recording agent backend stub keyed by id. ---
class StubAgentBackend implements AgentBackend {
  readonly id: 'codex' | 'claude';
  readonly seen: { prompt: string; ctx: AgentDispatchContext }[] = [];
  constructor(id: 'codex' | 'claude') {
    this.id = id;
  }
  async dispatch(prompt: string, ctx: AgentDispatchContext): Promise<AgentDispatchResult> {
    this.seen.push({ prompt, ctx });
    return { ok: true, exitCode: 0, stdout: this.id, stderr: '' };
  }
}

class StubReviewBackend implements ReviewBackend {
  readonly kind: 'anthropic-api' | 'openrouter' | 'codex';
  readonly seen: { diff: string; model: string | undefined }[] = [];
  constructor(kind: 'anthropic-api' | 'openrouter' | 'codex') {
    this.kind = kind;
  }
  async review(
    diff: string,
    model: string | undefined,
    _ctx: ReviewDispatchContext,
  ): Promise<readonly ReviewFinding[]> {
    this.seen.push({ diff, model });
    return [];
  }
}

const EMPTY_CONFIG: BackendConfig = {};

// --- Implement backend resolution -------------------------------------------------

test('T1: implement backend defaults to codex when no override / config', () => {
  assert.equal(resolveImplementBackendId(item(), EMPTY_CONFIG), 'codex');
  assert.equal(DEFAULT_IMPLEMENT_BACKEND, 'codex');
});

test('T1: implement config default is honored when item has no override', () => {
  assert.equal(resolveImplementBackendId(item(), { implementDefault: 'claude' }), 'claude');
});

test('T1: per-item implementBackend override wins over the config default', () => {
  assert.equal(
    resolveImplementBackendId(item({ implementBackend: 'claude' }), { implementDefault: 'codex' }),
    'claude',
  );
  // `backend` is accepted as an alias.
  assert.equal(resolveImplementBackendId(item({ backend: 'claude' }), EMPTY_CONFIG), 'claude');
});

test('T1: an unknown implement backend override throws UnknownBackendError', () => {
  assert.throws(
    () => resolveImplementBackendId(item({ implementBackend: 'gemini' }), EMPTY_CONFIG),
    UnknownBackendError,
  );
});

test('T1: the implement registry routes claude vs codex to the right adapter', async () => {
  const codex = new StubAgentBackend('codex');
  const claude = new StubAgentBackend('claude');
  const registry = new ImplementBackendRegistry([codex, claude], EMPTY_CONFIG);

  assert.equal(registry.resolve(item()).id, 'codex'); // default
  assert.equal(registry.resolve(item({ implementBackend: 'claude' })).id, 'claude');

  // Actually dispatch through the resolved adapter.
  const ctx: AgentDispatchContext = { cwd: '/wt', env: {}, lane: 'worktree' };
  await registry.resolve(item({ implementBackend: 'claude' })).dispatch('do it', ctx);
  assert.equal(claude.seen.length, 1);
  assert.equal(codex.seen.length, 0);
});

test('T1: the implement registry errors when no adapter is registered for the resolved id', () => {
  const registry = new ImplementBackendRegistry([new StubAgentBackend('codex')], EMPTY_CONFIG);
  assert.throws(() => registry.resolve(item({ implementBackend: 'claude' })), UnknownBackendError);
});

// --- Review backend resolution ----------------------------------------------------

test('T1: review backend defaults to anthropic-api:opus-4.8', () => {
  const parsed = resolveReviewBackendId(item(), EMPTY_CONFIG);
  assert.equal(parsed.kind, 'anthropic-api');
  assert.equal(parsed.model, 'opus-4.8');
  assert.equal(DEFAULT_REVIEW_BACKEND, 'anthropic-api:opus-4.8');
});

test('T1: parseReviewBackendId splits kind and model; codex takes no model', () => {
  assert.deepEqual(parseReviewBackendId('openrouter:gpt-5.5'), {
    kind: 'openrouter',
    model: 'gpt-5.5',
  });
  assert.deepEqual(parseReviewBackendId('codex'), { kind: 'codex' });
});

test('T1: an unknown review kind, or a missing required model, throws', () => {
  assert.throws(() => parseReviewBackendId('gemini:pro'), UnknownBackendError);
  assert.throws(() => parseReviewBackendId('anthropic-api'), UnknownBackendError);
  assert.throws(() => parseReviewBackendId('openrouter'), UnknownBackendError);
});

test('T1: the review registry routes anthropic-api vs openrouter to the right adapter', async () => {
  const anthropic = new StubReviewBackend('anthropic-api');
  const openrouter = new StubReviewBackend('openrouter');
  const codex = new StubReviewBackend('codex');
  const registry = new ReviewBackendRegistry([anthropic, openrouter, codex], EMPTY_CONFIG);

  const def = registry.resolve(item());
  assert.equal(def.backend.kind, 'anthropic-api');
  assert.equal(def.model, 'opus-4.8');

  const or = registry.resolve(item({ reviewBackend: 'openrouter:gpt-5.5' }));
  assert.equal(or.backend.kind, 'openrouter');
  assert.equal(or.model, 'gpt-5.5');

  const ctx: ReviewDispatchContext = { context: 'i1', env: {} };
  await or.backend.review('diff', or.model, ctx);
  assert.equal(openrouter.seen[0]?.model, 'gpt-5.5');
  assert.equal(anthropic.seen.length, 0);
});

// --- stdin-ignored spawn ----------------------------------------------------------

test('T1: spawnIgnoringStdin always spawns with stdin IGNORED', async () => {
  let capturedStdio: SpawnOptions['stdio'] | undefined;
  let capturedArgv: readonly string[] | undefined;
  const fake: SpawnFn = async (_cmd, argv, options) => {
    capturedStdio = options.stdio;
    capturedArgv = argv;
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  await spawnIgnoringStdin(fake, 'codex', ['exec', '-s', 'workspace-write'], {
    cwd: '/wt',
    env: {},
  });
  assert.deepEqual(capturedStdio, DISPATCH_STDIO);
  assert.equal(capturedStdio?.[0], 'ignore');
  assert.deepEqual(capturedArgv, ['exec', '-s', 'workspace-write']);
});

// --- config loader ----------------------------------------------------------------

test('T1: loadBackendConfig sources API keys from env and selection from profile', () => {
  const cfg = loadBackendConfig(
    { ANTHROPIC_API_KEY: 'rk', OPENROUTER_API_KEY: 'ork', PATH: '/usr/bin' },
    { implementDefault: 'claude', reviewDefault: 'openrouter:gpt-5.5', allowExternalReview: true },
  );
  assert.equal(cfg.implementDefault, 'claude');
  assert.equal(cfg.reviewDefault, 'openrouter:gpt-5.5');
  assert.equal(cfg.allowExternalReview, true);
  assert.equal(cfg.anthropicApiKey, 'rk');
  assert.equal(cfg.openrouterApiKey, 'ork');
});

test('T1: loadBackendConfig omits absent keys and ignores an invalid implementDefault', () => {
  const cfg = loadBackendConfig({}, { implementDefault: 'gemini' });
  assert.equal('anthropicApiKey' in cfg, false);
  assert.equal('openrouterApiKey' in cfg, false);
  assert.equal('implementDefault' in cfg, false); // invalid value dropped → falls through to codex
  assert.equal(resolveImplementBackendId(item(), cfg), 'codex');
});

test('T1: stripClaudeMarkers removes CLAUDECODE + CLAUDE_CODE_* and nothing else', () => {
  const out = stripClaudeMarkers({
    CLAUDECODE: '1',
    CLAUDE_CODE_ENTRYPOINT: 'cli',
    CLAUDE_CODE_SESSION: 'x',
    PATH: '/usr/bin',
    ANTHROPIC_API_KEY: 'secret',
  });
  assert.deepEqual(out, { PATH: '/usr/bin', ANTHROPIC_API_KEY: 'secret' });
});

// --- Wave 22 Task 6: validateImplementBackendId (the knob validator) ---------------

test('T6: validateImplementBackendId accepts codex/claude and rejects anything else', async () => {
  const { validateImplementBackendId } = await import('../dispatch/backends.ts');
  assert.equal(validateImplementBackendId('codex'), 'codex');
  assert.equal(validateImplementBackendId('claude'), 'claude');
  assert.throws(() => validateImplementBackendId('gpt5'), UnknownBackendError);
  assert.throws(() => validateImplementBackendId('gpt5'), /unknown implement backend "gpt5"/);
});

test('T6: parseReviewBackendId rejects an unknown review selector (the knob validator)', () => {
  // codex (local) + the two external kinds with a model parse; a bogus kind throws.
  assert.deepEqual(parseReviewBackendId('codex'), { kind: 'codex' });
  assert.deepEqual(parseReviewBackendId('anthropic-api:opus-4.8'), { kind: 'anthropic-api', model: 'opus-4.8' });
  assert.throws(() => parseReviewBackendId('bogus:x'), UnknownBackendError);
});
