// Wave 21 Task 3 — concrete review backends + egress-policy downgrade.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  type BackendConfig,
  type ReviewDispatchContext,
  ReviewBackendRegistry,
} from '../dispatch/backends.ts';
import {
  type HttpClient,
  type ReviewLogger,
  AnthropicReviewBackend,
  CodexReviewBackend,
  OpenRouterReviewBackend,
  dispatchReview,
  parseFindings,
  reviewPrompt,
} from '../dispatch/review.ts';
import { type SpawnFn } from '../dispatch/spawn.ts';
import { type WorkItem } from '../types.ts';

const CTX: ReviewDispatchContext = { context: 'item i1', env: {} };

function anthropicHttp(text: string): HttpClient {
  return {
    async postJson(url, _headers, _body) {
      assert.match(url, /anthropic\.com/);
      return { status: 200, json: { content: [{ type: 'text', text }] } };
    },
  };
}
function openRouterHttp(text: string): HttpClient {
  return {
    async postJson(url, _headers, _body) {
      assert.match(url, /openrouter\.ai/);
      return { status: 200, json: { choices: [{ message: { content: text } }] } };
    },
  };
}
function codexSpawn(stdout: string): SpawnFn {
  return async (cmd, argv, options) => {
    assert.equal(cmd, 'codex');
    assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']); // stdin ignored
    assert.ok(argv.includes('read-only'), 'codex review is read-only');
    return { exitCode: 0, stdout, stderr: '' };
  };
}

const REAL_FINDING = JSON.stringify([
  { severity: 'HIGH', title: 'non-string coercion', detail: 'parseDuration(["1h"]) -> 3600' },
]);
const FALSE_POSITIVE = JSON.stringify([
  { severity: 'MEDIUM', title: 'JS $ matches before newline', detail: 'incorrect claim' },
]);

// --- parseFindings ---------------------------------------------------------------

test('T3: parseFindings extracts a JSON array, tolerating surrounding prose', () => {
  const out = parseFindings(`Here are my findings:\n${REAL_FINDING}\nThanks!`);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.severity, 'HIGH');
  assert.equal(out[0]?.title, 'non-string coercion');
});

test('T3: parseFindings drops malformed entries and returns [] on garbage', () => {
  assert.deepEqual(parseFindings('no json here'), []);
  assert.deepEqual(parseFindings('[{"severity":"NOPE","title":"x"},{"title":""}]'), []);
});

test('T3: reviewPrompt embeds the diff and demands a JSON findings array', () => {
  const p = reviewPrompt('DIFFBODY', 'ctx');
  assert.match(p, /DIFFBODY/);
  assert.match(p, /JSON array/);
});

// --- each backend returns a structured findings list ------------------------------

test('T3: the same diff routed to each backend returns a structured findings list', async () => {
  const anthropic = new AnthropicReviewBackend({ http: anthropicHttp(REAL_FINDING), apiKey: 'rk' });
  const openrouter = new OpenRouterReviewBackend({ http: openRouterHttp(REAL_FINDING), apiKey: 'ork' });
  const codex = new CodexReviewBackend({ spawn: codexSpawn(REAL_FINDING), cwd: '/repo' });

  for (const b of [anthropic, openrouter, codex]) {
    const findings = await b.review('DIFF', 'opus-4.8', CTX);
    assert.equal(findings.length, 1, `${b.kind} returns findings`);
    assert.equal(findings[0]?.severity, 'HIGH');
  }
});

test('T3: API reviewers require their key', async () => {
  const a = new AnthropicReviewBackend({ http: anthropicHttp('[]'), apiKey: undefined });
  await assert.rejects(a.review('d', 'm', CTX), /ANTHROPIC_API_KEY/);
  const o = new OpenRouterReviewBackend({ http: openRouterHttp('[]'), apiKey: '' });
  await assert.rejects(o.review('d', 'm', CTX), /OPENROUTER_API_KEY/);
});

// --- egress policy: external refused → downgraded to local, logged ---------------

function item(extra: Record<string, unknown> = {}): WorkItem {
  return { id: 'i1', ...extra };
}

test('T3: external review policy OFF downgrades an openrouter selection to local codex, logged', async () => {
  const openrouter = new OpenRouterReviewBackend({ http: openRouterHttp(REAL_FINDING), apiKey: 'ork' });
  const codexLocal = new CodexReviewBackend({ spawn: codexSpawn(FALSE_POSITIVE), cwd: '/repo' });
  const config: BackendConfig = { allowExternalReview: false };
  const registry = new ReviewBackendRegistry([openrouter, codexLocal], config);

  const logs: string[] = [];
  const logger: ReviewLogger = { log: (m) => logs.push(m) };

  const result = await dispatchReview({
    item: item({ reviewBackend: 'openrouter:gpt-5.5' }),
    diff: 'DIFF',
    registry,
    config,
    ctx: CTX,
    logger,
    localFallback: codexLocal,
  });

  assert.equal(result.backend, 'codex', 'downgraded to local codex');
  assert.equal(logs.length, 1);
  assert.match(logs[0] ?? '', /downgrad/i);
  assert.match(logs[0] ?? '', /allow_external_review is off/);
  // The local reviewer ran and produced (its own) findings.
  assert.equal(result.findings.length, 1);
});

test('T3: external review policy ON lets the external reviewer run', async () => {
  const anthropic = new AnthropicReviewBackend({ http: anthropicHttp(REAL_FINDING), apiKey: 'rk' });
  const codexLocal = new CodexReviewBackend({ spawn: codexSpawn('[]'), cwd: '/repo' });
  const config: BackendConfig = { allowExternalReview: true };
  const registry = new ReviewBackendRegistry([anthropic, codexLocal], config);

  const result = await dispatchReview({
    item: item(), // default → anthropic-api:opus-4.8
    diff: 'DIFF',
    registry,
    config,
    ctx: CTX,
    localFallback: codexLocal,
  });
  assert.equal(result.backend, 'anthropic-api:opus-4.8');
  assert.equal(result.findings[0]?.title, 'non-string coercion');
});

// --- spike replay: weak FP + strong real both SURFACE (not acted on) -------------

test('T3: a weak reviewer false-positive and a strong reviewer real finding both flow as findings', async () => {
  const weak = new CodexReviewBackend({ spawn: codexSpawn(FALSE_POSITIVE), cwd: '/repo' });
  const strong = new AnthropicReviewBackend({ http: anthropicHttp(REAL_FINDING), apiKey: 'rk' });

  const weakFindings = await weak.review('DIFF', undefined, CTX);
  const strongFindings = await strong.review('DIFF', 'opus-4.8', CTX);

  // Both PRODUCE findings — dispatchReview/backends never act on them; the T4
  // verify-gate decides. Here we only assert the findings surface for T4 to verify.
  assert.equal(weakFindings[0]?.title, 'JS $ matches before newline'); // the FP
  assert.equal(strongFindings[0]?.title, 'non-string coercion'); // the real gap
});
