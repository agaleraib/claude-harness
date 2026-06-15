// Concrete review backends + egress-policy dispatchReview (Wave 21, Task 3).
//
// dispatchReview is a SINGLE MODEL JUDGMENT on a diff — no tools, no workspace. Three
// backends implement the T1 ReviewBackend seam:
//   - anthropic-api:<model> (default opus-4.8) — an Anthropic /messages completion on
//     the diff, billed to a review-only ANTHROPIC_API_KEY. Low-volume → pay-per-token.
//   - openrouter:<model> — an OpenAI-compatible /chat/completions call (complexity-routed).
//   - codex — same-model fallback (cheapest, weakest adversarial value); a `codex exec`
//     subprocess judging the diff.
//
// Each returns a STRUCTURED findings list. The verify-gate (T4) treats every finding as
// a PROPOSAL — nothing here acts on a finding; this layer only produces them.
//
// DATA-EGRESS POLICY: anthropic-api and openrouter send the diff to a THIRD PARTY. A
// `.harness-profile` knob (allowExternalReview) governs whether a repo may. If off, an
// external selection is DOWNGRADED to the local `codex` reviewer and the reason is
// logged (via an injected logger — never logs API keys).
//
// All network is an injected HTTP seam; codex goes through the SpawnFn. No live calls
// in tests.

import {
  type BackendConfig,
  type ReviewBackend,
  type ReviewBackendKind,
  type ReviewBackendRegistry,
  type ReviewDispatchContext,
  type ReviewDispatchResult,
  type ReviewFinding,
} from './backends.ts';
import { type SpawnFn, spawnIgnoringStdin } from './spawn.ts';
import { type WorkItem } from '../types.ts';

/** A minimal HTTP seam for the API-backed reviewers (no live fetch in tests). */
export interface HttpClient {
  postJson(
    url: string,
    headers: Readonly<Record<string, string>>,
    body: unknown,
  ): Promise<{ readonly status: number; readonly json: unknown }>;
}

/** A logger seam for egress-downgrade / fallback reasons. NEVER receives secrets. */
export interface ReviewLogger {
  log(message: string): void;
}

const VALID_SEVERITIES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

/**
 * Parse a model's raw text into a structured findings list. The reviewer is prompted to
 * emit a JSON array `[{severity,title,detail?}]`; we tolerate surrounding prose by
 * extracting the first JSON array. Unparseable / malformed ⇒ empty list (a reviewer that
 * found nothing and a reviewer we couldn't parse both yield zero findings — the gate is
 * authoritative, so a missed finding never auto-merges anything unsafe on its own).
 */
export function parseFindings(raw: string): readonly ReviewFinding[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const findings: ReviewFinding[] = [];
  for (const entry of parsed) {
    if (entry === null || typeof entry !== 'object') {
      continue;
    }
    const rec = entry as Record<string, unknown>;
    const severity = rec['severity'];
    const title = rec['title'];
    if (typeof severity !== 'string' || !VALID_SEVERITIES.has(severity)) {
      continue;
    }
    if (typeof title !== 'string' || title.length === 0) {
      continue;
    }
    const detail = rec['detail'];
    findings.push({
      severity: severity as ReviewFinding['severity'],
      title,
      ...(typeof detail === 'string' ? { detail } : {}),
    });
  }
  return findings;
}

/** The instruction prefix every reviewer receives (structured-output contract). */
export function reviewPrompt(diff: string, context: string): string {
  return (
    `You are a code reviewer. Review ONLY the diff below for correctness bugs. ` +
    `Respond with a JSON array of findings: [{"severity":"CRITICAL|HIGH|MEDIUM|LOW",` +
    `"title":"...","detail":"..."}]. Empty array if none.\n\n` +
    `Context: ${context}\n\n--- DIFF ---\n${diff}\n`
  );
}

/** Anthropic API reviewer (default — opus-4.8). Billed to the review-only key. */
export class AnthropicReviewBackend implements ReviewBackend {
  readonly kind: ReviewBackendKind = 'anthropic-api';
  private readonly http: HttpClient;
  private readonly apiKey: string | undefined;
  constructor(deps: { readonly http: HttpClient; readonly apiKey: string | undefined }) {
    this.http = deps.http;
    this.apiKey = deps.apiKey;
  }
  async review(
    diff: string,
    model: string | undefined,
    ctx: ReviewDispatchContext,
  ): Promise<readonly ReviewFinding[]> {
    if (this.apiKey === undefined || this.apiKey.length === 0) {
      throw new Error('run-loop: anthropic-api review requires ANTHROPIC_API_KEY (review-only)');
    }
    const resp = await this.http.postJson(
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      {
        model: model ?? 'claude-opus-4-8',
        max_tokens: 4096,
        messages: [{ role: 'user', content: reviewPrompt(diff, ctx.context) }],
      },
    );
    return parseFindings(extractText(resp.json));
  }
}

/** OpenRouter reviewer (OpenAI-compatible; complexity-routed model). */
export class OpenRouterReviewBackend implements ReviewBackend {
  readonly kind: ReviewBackendKind = 'openrouter';
  private readonly http: HttpClient;
  private readonly apiKey: string | undefined;
  constructor(deps: { readonly http: HttpClient; readonly apiKey: string | undefined }) {
    this.http = deps.http;
    this.apiKey = deps.apiKey;
  }
  async review(
    diff: string,
    model: string | undefined,
    ctx: ReviewDispatchContext,
  ): Promise<readonly ReviewFinding[]> {
    if (this.apiKey === undefined || this.apiKey.length === 0) {
      throw new Error('run-loop: openrouter review requires OPENROUTER_API_KEY');
    }
    const resp = await this.http.postJson(
      'https://openrouter.ai/api/v1/chat/completions',
      { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      {
        model: model ?? 'openai/gpt-5.5',
        messages: [{ role: 'user', content: reviewPrompt(diff, ctx.context) }],
      },
    );
    return parseFindings(extractOpenAiText(resp.json));
  }
}

/** Codex reviewer — same-model local fallback. Shells `codex exec` (stdin ignored). */
export class CodexReviewBackend implements ReviewBackend {
  readonly kind: ReviewBackendKind = 'codex';
  private readonly spawn: SpawnFn;
  private readonly cwd: string;
  constructor(deps: { readonly spawn: SpawnFn; readonly cwd: string }) {
    this.spawn = deps.spawn;
    this.cwd = deps.cwd;
  }
  async review(
    diff: string,
    _model: string | undefined,
    ctx: ReviewDispatchContext,
  ): Promise<readonly ReviewFinding[]> {
    // Non-agentic judgment: a single codex exec with the diff in the prompt, read-only.
    const r = await spawnIgnoringStdin(
      this.spawn,
      'codex',
      ['exec', '-s', 'read-only', '--skip-git-repo-check', reviewPrompt(diff, ctx.context)],
      { cwd: this.cwd, env: ctx.env },
    );
    return parseFindings(r.stdout);
  }
}

function extractText(json: unknown): string {
  // Anthropic /messages: { content: [{ type:'text', text:'...' }] }
  if (json !== null && typeof json === 'object' && 'content' in json) {
    const content = (json as { content: unknown }).content;
    if (Array.isArray(content)) {
      return content
        .map((c) => (c !== null && typeof c === 'object' && 'text' in c ? String((c as { text: unknown }).text) : ''))
        .join('');
    }
  }
  return '';
}

function extractOpenAiText(json: unknown): string {
  // OpenAI-compatible: { choices: [{ message: { content: '...' } }] }
  if (json !== null && typeof json === 'object' && 'choices' in json) {
    const choices = (json as { choices: unknown }).choices;
    if (Array.isArray(choices) && choices[0] !== null && typeof choices[0] === 'object') {
      const msg = (choices[0] as { message?: unknown }).message;
      if (msg !== null && typeof msg === 'object' && 'content' in msg) {
        return String((msg as { content: unknown }).content);
      }
    }
  }
  return '';
}

/** The base kinds that send a diff to a third party (governed by the egress policy). */
const EXTERNAL_KINDS: ReadonlySet<ReviewBackendKind> = new Set(['anthropic-api', 'openrouter']);

/**
 * Dispatch a review for one item through the registry-resolved backend, applying the
 * data-egress policy: if the resolved backend is EXTERNAL and the repo does not allow
 * external review, DOWNGRADE to the local `codex` reviewer and log the reason. Returns
 * the structured findings plus the backend id that actually ran (post-downgrade).
 *
 * Acts on nothing — the findings flow into T4's verify-gate, which is authoritative.
 */
export async function dispatchReview(args: {
  readonly item: WorkItem;
  readonly diff: string;
  readonly registry: ReviewBackendRegistry;
  readonly config: BackendConfig;
  readonly ctx: ReviewDispatchContext;
  readonly logger?: ReviewLogger;
  /** The local fallback reviewer (codex), used when an external one is refused. */
  readonly localFallback: ReviewBackend;
}): Promise<ReviewDispatchResult> {
  const { item, diff, registry, config, ctx, logger, localFallback } = args;
  const resolved = registry.resolve(item);

  const isExternal = EXTERNAL_KINDS.has(resolved.backend.kind);
  if (isExternal && config.allowExternalReview !== true) {
    logger?.log(
      `review-egress-downgrade: item "${item.id}" requested external reviewer ` +
        `"${resolved.backend.kind}" but allow_external_review is off for this repo; ` +
        `downgrading to local "${localFallback.kind}" reviewer (code diff stays local).`,
    );
    const findings = await localFallback.review(diff, undefined, ctx);
    return { findings, backend: localFallback.kind };
  }

  const findings = await resolved.backend.review(diff, resolved.model, ctx);
  const backendId =
    resolved.model !== undefined ? `${resolved.backend.kind}:${resolved.model}` : resolved.backend.kind;
  return { findings, backend: backendId };
}
