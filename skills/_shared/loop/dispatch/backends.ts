// Backend abstraction — dispatch seams + registry (Wave 21, Task 1).
//
// Two SEPARATE dispatch seams, resolved from config, both backend-agnostic at the
// engine layer:
//
//   - dispatchAgent(prompt, ctx)  → runs an *agentic CLI* (the implement step: needs
//     tools / a workspace / a sandbox). Backends: `codex` (default), `claude` (flag).
//     Resolved per item from the runner/label field.
//   - dispatchReview(diff, ctx)   → a *single model judgment on a diff* (no tools).
//     Backends: `anthropic-api:opus-4.8` (default), `openrouter:<model>`
//     (complexity-routed), `codex` (same-model fallback).
//
// This module owns ONLY the abstraction: the backend enums, the dispatch-context
// shapes, the seam interfaces, the config shape, and the two registries that resolve
// a backend id → adapter (with per-item override + defaults + unknown-backend error).
// Concrete adapters (T2 implement, T3 review) plug into the registries; the engine
// never sees a backend name. API keys live in config sourced from env / .harness-profile
// and are NEVER logged — the registry never serializes the config.

import { type WorkItem } from '../types.ts';
import { type RunnerKind } from '../types.ts';

// --- Implement (agentic) backends ------------------------------------------------

/** The agentic-CLI implement backends. `codex` is the default; `claude` is a flag. */
export type ImplementBackendId = 'codex' | 'claude';

export const IMPLEMENT_BACKENDS: readonly ImplementBackendId[] = ['codex', 'claude'];
export const DEFAULT_IMPLEMENT_BACKEND: ImplementBackendId = 'codex';

/** The lane an implement dispatch runs in (mirrors RunnerKind; named for clarity). */
export type DispatchLane = RunnerKind;

/** Context handed to an agentic dispatch (the implement step). */
export interface AgentDispatchContext {
  /** Working directory the agentic CLI runs in (the prepared worktree / mount). */
  readonly cwd: string;
  /**
   * Environment for the child. The implement backends strip their own host markers
   * (e.g. Claude strips CLAUDECODE/CLAUDE_CODE_*); the registry passes this through
   * unmodified — it does not inject or log secrets.
   */
  readonly env: Readonly<Record<string, string>>;
  /** Worktree vs sandcastle — adapters branch their argv/auth on this. */
  readonly lane: DispatchLane;
}

/** The outcome an agentic dispatch reports back (commits are collected by the runner). */
export interface AgentDispatchResult {
  /** True when the agentic CLI exited 0. */
  readonly ok: boolean;
  /** Process exit code (null when killed by signal). */
  readonly exitCode: number | null;
  /** Captured stdout (for logging / debugging; never the env). */
  readonly stdout: string;
  /** Captured stderr. */
  readonly stderr: string;
}

/**
 * The agentic-implement seam. One concrete adapter per ImplementBackendId. The
 * adapter spawns the CLI with stdin IGNORED (see spawnIgnoringStdin) and returns
 * when the agent finishes; it does NOT commit (the runner does — "agent edits,
 * runner commits").
 */
export interface AgentBackend {
  readonly id: ImplementBackendId;
  dispatch(prompt: string, ctx: AgentDispatchContext): Promise<AgentDispatchResult>;
}

// --- Review (judgment) backends --------------------------------------------------

/**
 * Review backend ids. Two carry a model parameter after a colon:
 *   - `anthropic-api:<model>` (default model opus-4.8)
 *   - `openrouter:<model>` (complexity-routed)
 *   - `codex` (same-model fallback; no model suffix)
 * The base kind is the part before the first colon.
 */
export type ReviewBackendKind = 'anthropic-api' | 'openrouter' | 'codex';

export const REVIEW_BACKEND_KINDS: readonly ReviewBackendKind[] = [
  'anthropic-api',
  'openrouter',
  'codex',
];

/** The default review backend id (Opus 4.8 via the Anthropic API). */
export const DEFAULT_REVIEW_BACKEND = 'anthropic-api:opus-4.8';

/** A parsed review backend selector: a base kind plus an optional model parameter. */
export interface ReviewBackendId {
  readonly kind: ReviewBackendKind;
  /** Model parameter (e.g. `opus-4.8`); absent for `codex`. */
  readonly model?: string;
}

/** A single structured review finding (mirrors the protocol Finding severities). */
export interface ReviewFinding {
  readonly severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  readonly title: string;
  readonly detail?: string;
}

/** Context handed to a review dispatch (a judgment on a diff — NO tools, NO workspace). */
export interface ReviewDispatchContext {
  /** Free-form context the reviewer model should consider (item id, spec excerpt). */
  readonly context: string;
  /** Environment carrying the review API key; never logged. */
  readonly env: Readonly<Record<string, string>>;
}

/** What a review dispatch returns: a structured findings list (possibly empty). */
export interface ReviewDispatchResult {
  readonly findings: readonly ReviewFinding[];
  /** The backend id that actually produced this review (post egress-downgrade). */
  readonly backend: string;
}

/**
 * The review-judgment seam. One concrete adapter per ReviewBackendKind. The adapter
 * sends the diff to a single model and parses a structured findings list back. It
 * spawns/calls with NO tools and (for subprocess backends) stdin IGNORED.
 */
export interface ReviewBackend {
  readonly kind: ReviewBackendKind;
  review(diff: string, model: string | undefined, ctx: ReviewDispatchContext): Promise<readonly ReviewFinding[]>;
}

// --- Config (env / .harness-profile) ---------------------------------------------

/**
 * Backend configuration sourced from env + `.harness-profile`. API keys live here
 * and MUST NOT be logged — nothing in this module serializes this object. Selection
 * fields default when absent.
 */
export interface BackendConfig {
  /** Default implement backend; absent ⇒ DEFAULT_IMPLEMENT_BACKEND (codex). */
  readonly implementDefault?: ImplementBackendId;
  /** Default review backend id string; absent ⇒ DEFAULT_REVIEW_BACKEND. */
  readonly reviewDefault?: string;
  /**
   * Whether this repo may use a NON-LOCAL review backend (anthropic-api / openrouter).
   * Absent ⇒ false (default-deny egress; T3 enforces the downgrade-to-local).
   */
  readonly allowExternalReview?: boolean;
  /** Review-only Anthropic API key (env ANTHROPIC_API_KEY). Never logged. */
  readonly anthropicApiKey?: string;
  /** OpenRouter API key (env OPENROUTER_API_KEY). Never logged. */
  readonly openrouterApiKey?: string;
}

/**
 * The subset of `.harness-profile` this module reads. A caller parses the profile
 * YAML (the loop already does this elsewhere) and hands the relevant fields here;
 * keeping it a plain object means no filesystem dependency in this module.
 */
export interface ProfileBackendFields {
  /** `loop.implement_default:` — codex | claude. */
  readonly implementDefault?: string;
  /** `loop.review_default:` — e.g. "anthropic-api:opus-4.8". */
  readonly reviewDefault?: string;
  /** `loop.allow_external_review:` — may diffs leave the repo to a non-local reviewer? */
  readonly allowExternalReview?: boolean;
}

/**
 * Build a BackendConfig from env + the parsed `.harness-profile` fields. API keys come
 * ONLY from env (ANTHROPIC_API_KEY review-only, OPENROUTER_API_KEY); selection +
 * egress policy come from the profile. Pure: no filesystem, no logging. Absent keys
 * are simply omitted (exactOptionalPropertyTypes-friendly), so nothing serializes an
 * undefined secret.
 */
export function loadBackendConfig(
  env: Readonly<Record<string, string | undefined>>,
  profile: ProfileBackendFields = {},
): BackendConfig {
  const implementDefault =
    profile.implementDefault !== undefined &&
    IMPLEMENT_BACKENDS.includes(profile.implementDefault as ImplementBackendId)
      ? (profile.implementDefault as ImplementBackendId)
      : undefined;
  const anthropicApiKey = env['ANTHROPIC_API_KEY'];
  const openrouterApiKey = env['OPENROUTER_API_KEY'];
  return {
    ...(implementDefault !== undefined ? { implementDefault } : {}),
    ...(profile.reviewDefault !== undefined ? { reviewDefault: profile.reviewDefault } : {}),
    ...(profile.allowExternalReview !== undefined
      ? { allowExternalReview: profile.allowExternalReview }
      : {}),
    ...(anthropicApiKey !== undefined ? { anthropicApiKey } : {}),
    ...(openrouterApiKey !== undefined ? { openrouterApiKey } : {}),
  };
}

/** Raised when a backend id cannot be resolved against a registry. */
export class UnknownBackendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownBackendError';
  }
}

/**
 * Resolve the IMPLEMENT backend id for one item: a per-item override (the item's
 * `implementBackend` / `backend` field) wins; otherwise the config default; otherwise
 * the codex default. An override naming an unknown backend throws UnknownBackendError.
 */
export function resolveImplementBackendId(
  item: WorkItem,
  config: BackendConfig,
): ImplementBackendId {
  const override = item['implementBackend'] ?? item['backend'];
  if (typeof override === 'string') {
    if (!IMPLEMENT_BACKENDS.includes(override as ImplementBackendId)) {
      throw new UnknownBackendError(
        `run-loop: unknown implement backend "${override}" on item "${item.id}"; ` +
          `valid: ${IMPLEMENT_BACKENDS.join(' | ')}`,
      );
    }
    return override as ImplementBackendId;
  }
  return config.implementDefault ?? DEFAULT_IMPLEMENT_BACKEND;
}

/**
 * Parse a review backend id string ("anthropic-api:opus-4.8", "openrouter:gpt-5.5",
 * "codex") into its kind + optional model. Throws UnknownBackendError on an
 * unrecognized kind or a missing-but-required model parameter.
 */
export function parseReviewBackendId(id: string): ReviewBackendId {
  const colon = id.indexOf(':');
  const kind = (colon === -1 ? id : id.slice(0, colon)).trim();
  const model = colon === -1 ? undefined : id.slice(colon + 1).trim();

  if (!REVIEW_BACKEND_KINDS.includes(kind as ReviewBackendKind)) {
    throw new UnknownBackendError(
      `run-loop: unknown review backend "${id}"; valid kinds: ${REVIEW_BACKEND_KINDS.join(' | ')}`,
    );
  }
  const k = kind as ReviewBackendKind;

  if (k === 'codex') {
    // codex is the same-model fallback — no model parameter.
    return { kind: k };
  }
  // anthropic-api / openrouter require a model parameter.
  if (model === undefined || model.length === 0) {
    throw new UnknownBackendError(
      `run-loop: review backend "${k}" requires a model (e.g. "${k}:opus-4.8")`,
    );
  }
  return { kind: k, model };
}

/**
 * Resolve the REVIEW backend id for one item: a per-item override (`reviewBackend`)
 * wins; otherwise the config default; otherwise the Opus-4.8 default. Returns the
 * parsed kind+model. T3 layers the egress-policy downgrade on top of this.
 */
export function resolveReviewBackendId(item: WorkItem, config: BackendConfig): ReviewBackendId {
  const override = item['reviewBackend'];
  const id = typeof override === 'string' ? override : (config.reviewDefault ?? DEFAULT_REVIEW_BACKEND);
  return parseReviewBackendId(id);
}

/**
 * Registry of agentic-implement backends. Resolves an item → the concrete adapter
 * for its (overridden / default) backend. Unknown backend ⇒ UnknownBackendError.
 * The registry holds the config but never logs it.
 */
export class ImplementBackendRegistry {
  private readonly byId: ReadonlyMap<ImplementBackendId, AgentBackend>;
  private readonly config: BackendConfig;

  constructor(backends: readonly AgentBackend[], config: BackendConfig) {
    const map = new Map<ImplementBackendId, AgentBackend>();
    for (const b of backends) {
      map.set(b.id, b);
    }
    this.byId = map;
    this.config = config;
  }

  /** Resolve the adapter an item routes to (per-item override, else default). */
  resolve(item: WorkItem): AgentBackend {
    const id = resolveImplementBackendId(item, this.config);
    const backend = this.byId.get(id);
    if (backend === undefined) {
      throw new UnknownBackendError(
        `run-loop: no implement adapter registered for backend "${id}" ` +
          `(registered: ${[...this.byId.keys()].join(', ') || 'none'})`,
      );
    }
    return backend;
  }
}

/**
 * Registry of review-judgment backends. Resolves an item → {adapter, model} for its
 * (overridden / default) review backend kind. Unknown kind ⇒ UnknownBackendError.
 */
export class ReviewBackendRegistry {
  private readonly byKind: ReadonlyMap<ReviewBackendKind, ReviewBackend>;
  private readonly config: BackendConfig;

  constructor(backends: readonly ReviewBackend[], config: BackendConfig) {
    const map = new Map<ReviewBackendKind, ReviewBackend>();
    for (const b of backends) {
      map.set(b.kind, b);
    }
    this.byKind = map;
    this.config = config;
  }

  /** Resolve the adapter + model an item routes to (per-item override, else default). */
  resolve(item: WorkItem): { readonly backend: ReviewBackend; readonly model: string | undefined } {
    const parsed = resolveReviewBackendId(item, this.config);
    const backend = this.byKind.get(parsed.kind);
    if (backend === undefined) {
      throw new UnknownBackendError(
        `run-loop: no review adapter registered for kind "${parsed.kind}" ` +
          `(registered: ${[...this.byKind.keys()].join(', ') || 'none'})`,
      );
    }
    return { backend, model: parsed.model };
  }
}
