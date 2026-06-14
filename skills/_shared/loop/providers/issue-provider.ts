// Issue WorkSource provider + durable two-phase terminal-transition state machine
// (Wave 19, Task 4).
//
// Reads `gh issue list --label ready-for-agent`, parses each issue's `## Blocked by`
// section into edges and its `runner:*` label into the declared runner (default
// sandcastle), and exposes the issue body as the work item.
//
// The provider owns the SINGLE TERMINAL TRANSITION contract used by Task 9. It
// exposes exactly three mutually-exclusive terminal operations on a source issue —
// completeItem / escalateItem / relabelItem — each executed as the same ordered,
// crash-safe two-phase sequence:
//
//   1. Begin (durable intent first): write a `transition-started` marker (comment +
//      `transitioning` label) recording the intended terminal state, BEFORE
//      `ready-for-agent` is touched. So the issue always carries either
//      `ready-for-agent` or `transitioning`, never neither.
//   2. Leave the ready queue: remove `ready-for-agent`.
//   3. State-specific effect (replayable via the effect-intent journal):
//        completeItem → post PR-link comment + close;
//        escalateItem → create one `ready-for-human` escalation issue (+ add label);
//        relabelItem  → swap the readiness label.
//   4. Commit (terminal marker last): write the terminal idempotency-key comment AND
//      remove `transitioning`.
//
// Each op first checks for an existing terminal marker and is a no-op if found.
// Invariant: a source issue is always in exactly one of
//   { ready-for-agent, transitioning, terminal-marker } — never none.
//
// Durable effect record (step 3 is replayable): before the step-3 effect, append an
// effect-intent record to the transitions journal keyed `<item-id>:<target-state>`;
// immediately after the effect succeeds, stamp it with the created-resource ids
// (escalation-issue number, PR-link comment id, close confirmation). On resume,
// reconciliation reads this first: if it carries result ids, step 3 is SKIPPED.

import { type GhClient, type GhIssue } from '../gh-seam.ts';
import { type Journal, type JournalRecord } from '../state-journal.ts';
import {
  type ItemResult,
  type RunnerKind,
  type WorkItem,
  type WorkSource,
} from '../types.ts';

export const READY_FOR_AGENT = 'ready-for-agent';
export const READY_FOR_HUMAN = 'ready-for-human';
export const TRANSITIONING = 'transitioning';

/** The three mutually-exclusive terminal states an issue can transition to. */
export type TerminalState = 'completed' | 'escalated' | 'relabeled';

/** Payload an issue WorkItem carries beyond the engine-read fields. */
export interface IssueItemPayload {
  readonly issueNumber: number;
  readonly title: string;
  /** The issue body, verbatim — the work item. */
  readonly body: string;
}

export interface IssueWorkItem extends WorkItem, IssueItemPayload {
  readonly id: string;
  readonly runner: RunnerKind;
  readonly blockedBy: readonly string[];
}

/** Turn an issue number into the stable WorkItem id. */
export function issueId(issueNumber: number): string {
  return `issue-${issueNumber}`;
}

/** Parse the `runner:<kind>` label; default sandcastle when absent/invalid. */
export function parseRunnerLabel(labels: readonly string[]): RunnerKind {
  for (const label of labels) {
    const m = label.match(/^runner:(\S+)$/i);
    const kind = m?.[1]?.toLowerCase();
    if (kind === 'worktree' || kind === 'sandcastle') {
      return kind;
    }
  }
  return 'sandcastle';
}

/**
 * Parse the `## Blocked by` section into source-item edges. Recognizes
 * `#<n>` issue references and bare `<n>` on bullet lines, mapping each to its
 * `issue-<n>` id. Stops at the next `## ` heading.
 */
export function parseBlockedBy(body: string): string[] {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => /^##\s+Blocked by\b/i.test(l));
  if (start === -1) {
    return [];
  }
  const ids = new Set<string>();
  for (let i = start + 1; i < lines.length; i += 1) {
    const l = lines[i] ?? '';
    if (/^##\s/.test(l)) {
      break;
    }
    const refRe = /#(\d+)\b/g;
    let m: RegExpExecArray | null;
    while ((m = refRe.exec(l)) !== null) {
      const n = Number.parseInt(m[1] ?? '', 10);
      if (Number.isInteger(n)) {
        ids.add(issueId(n));
      }
    }
  }
  return [...ids];
}

/** Build the WorkItem view of an issue. */
export function toIssueWorkItem(issue: GhIssue): IssueWorkItem {
  return {
    id: issueId(issue.number),
    issueNumber: issue.number,
    title: issue.title,
    body: issue.body,
    runner: parseRunnerLabel(issue.labels),
    blockedBy: parseBlockedBy(issue.body),
  };
}

// --- Deterministic marker keys (carry the idempotency key in the comment body) ---

/** The `transition-started` marker for a run/item/target — written in step 1. */
export function transitionStartedKey(runId: string, itemId: string, target: TerminalState): string {
  return `run-loop:${runId}:${itemId}:transition-started:${target}`;
}

/** The terminal idempotency-key marker — written in step 4. */
export function terminalKey(runId: string, itemId: string, target: TerminalState): string {
  return `run-loop:${runId}:${itemId}:${target}`;
}

/** Effect-intent journal key for step 3 (`<item-id>:<target-state>`). */
export function effectKey(itemId: string, target: TerminalState): string {
  return `${itemId}:${target}`;
}

/** Shape of an effect-intent journal record. */
interface EffectRecord extends JournalRecord {
  readonly kind: 'effect-intent';
  readonly key: string;
  readonly runId: string;
  readonly itemId: string;
  readonly target: TerminalState;
  /** Stamped after the effect succeeds; absent ⇒ effect not yet done. */
  readonly resultIds?: {
    readonly escalationIssue?: number;
    readonly prLinkCommentId?: string;
    readonly closed?: boolean;
    readonly relabeledTo?: string;
  };
}

/** Inputs for a terminal transition. */
export interface TransitionInput {
  readonly issueNumber: number;
  /** For completeItem: the PR url/ref to link. */
  readonly prLink?: string;
  /** For escalateItem: the escalation issue body + title. */
  readonly escalation?: { readonly title: string; readonly body: string };
  /** For relabelItem: the new readiness label to add. */
  readonly newLabel?: string;
}

/** Result ids of a step-3 effect, as stamped into the journal. */
type ResultIds = NonNullable<EffectRecord['resultIds']>;

/**
 * The durable two-phase terminal-transition state machine. Constructed with the
 * injected gh client + effect-intent journal + the run id. Crash-safe: every op
 * follows the same ordered sequence and is replayable from any boundary.
 */
export class TerminalTransitions {
  private readonly gh: GhClient;
  private readonly journal: Journal;
  private readonly runId: string;

  constructor(gh: GhClient, journal: Journal, runId: string) {
    this.gh = gh;
    this.journal = journal;
    this.runId = runId;
  }

  /** completeItem: link the PR and close the issue. */
  completeItem(input: TransitionInput): Promise<void> {
    return this.transition('completed', input);
  }

  /** escalateItem: create one ready-for-human escalation issue + add the label. */
  escalateItem(input: TransitionInput): Promise<void> {
    return this.transition('escalated', input);
  }

  /** relabelItem: swap the readiness label to input.newLabel. */
  relabelItem(input: TransitionInput): Promise<void> {
    return this.transition('relabeled', input);
  }

  /** The shared ordered sequence for all three terminal ops. */
  private async transition(target: TerminalState, input: TransitionInput): Promise<void> {
    const itemId = issueId(input.issueNumber);
    const tKey = terminalKey(this.runId, itemId, target);

    // No-op if already terminal (idempotency: re-invoke is zero gh mutations
    // beyond the read of existing comments).
    if (await this.hasTerminalMarker(input.issueNumber, target)) {
      return;
    }

    // Step 1 — Begin: durable intent first. Marker comment + transitioning label,
    // BEFORE ready-for-agent is touched. Idempotent: skip the comment if the
    // transition-started marker already exists (resume path).
    const startKey = transitionStartedKey(this.runId, itemId, target);
    if (!(await this.hasMarker(input.issueNumber, startKey))) {
      await this.gh.comment(input.issueNumber, startKey);
    }
    if (!(await this.hasLabel(input.issueNumber, TRANSITIONING))) {
      await this.gh.addLabel(input.issueNumber, TRANSITIONING);
    }

    // Step 2 — Leave the ready queue. No-op if already removed (resume path).
    if (await this.hasLabel(input.issueNumber, READY_FOR_AGENT)) {
      await this.gh.removeLabel(input.issueNumber, READY_FOR_AGENT);
    }

    // Step 3 — State-specific effect, replayable via the effect-intent journal.
    await this.runEffect(target, itemId, input);

    // Step 4 — Commit: terminal marker comment, then clear transitioning.
    await this.gh.comment(input.issueNumber, tKey);
    if (await this.hasLabel(input.issueNumber, TRANSITIONING)) {
      await this.gh.removeLabel(input.issueNumber, TRANSITIONING);
    }
  }

  /**
   * Step 3 effect with the replayable journal. Append intent first; if a prior
   * intent already carries result ids, SKIP the effect (never double-create).
   * Stamp result ids immediately after the effect succeeds.
   */
  private async runEffect(
    target: TerminalState,
    itemId: string,
    input: TransitionInput,
  ): Promise<void> {
    const key = effectKey(itemId, target);
    const prior = await this.findEffect(key);
    if (prior?.resultIds !== undefined) {
      // Effect already performed on a prior run — replay is a no-op.
      return;
    }
    if (prior === undefined) {
      const intent: EffectRecord = {
        kind: 'effect-intent',
        key,
        runId: this.runId,
        itemId,
        target,
      };
      await this.journal.append(intent);
    }

    const resultIds = await this.performEffect(target, input);

    const done: EffectRecord = {
      kind: 'effect-intent',
      key,
      runId: this.runId,
      itemId,
      target,
      resultIds,
    };
    await this.journal.append(done);
  }

  /**
   * The actual gh side effect for each terminal state. Each sub-effect is itself
   * idempotent against OBSERVABLE gh state (deterministic marker comments + issue
   * state), so a crash partway through step 3 followed by a replay never
   * double-creates: the spec's "deterministic marker comments are the cross-check".
   * The escalation issue is the one non-deterministic resource, so its number is
   * also recorded both as a deterministic marker comment on the source issue and in
   * the journal resultIds.
   */
  private async performEffect(target: TerminalState, input: TransitionInput): Promise<ResultIds> {
    const itemId = issueId(input.issueNumber);
    switch (target) {
      case 'completed': {
        // Deterministic PR-link marker: detect-and-skip if already posted.
        const prMarker = `run-loop:${this.runId}:${itemId}:pr-link`;
        const bodies = await this.commentBodies(input.issueNumber);
        let prLinkCommentId: string | undefined;
        if (!bodies.some((b) => b.includes(prMarker))) {
          const linkText = input.prLink !== undefined ? `Merged via PR: ${input.prLink}` : 'Merged.';
          prLinkCommentId = await this.gh.comment(input.issueNumber, `${prMarker} — ${linkText}`);
        }
        // Close only if still open (idempotent).
        const issue = await this.gh.getIssue(input.issueNumber);
        if (issue !== null && issue.state === 'open') {
          await this.gh.closeIssue(input.issueNumber);
        }
        return { ...(prLinkCommentId !== undefined ? { prLinkCommentId } : {}), closed: true };
      }
      case 'escalated': {
        // createIssue is the one non-deterministic effect — a crash between the
        // create and the journal stamp would otherwise double-create. Two cross-
        // checks make it idempotent:
        //  1. the journal resultIds (fast path);
        //  2. a DETERMINISTIC marker embedded in the escalation issue body, found by
        //     scanning ready-for-human issues — covers the lost-stamp crash window.
        const prior = await this.findEffect(effectKey(itemId, 'escalated'));
        const priorNum = prior?.resultIds?.escalationIssue;
        if (priorNum !== undefined) {
          return { escalationIssue: priorNum };
        }
        const escMarker = `run-loop:${this.runId}:${itemId}:escalation-issue`;
        const existing = await this.gh.listByLabelAllStates(READY_FOR_HUMAN);
        const already = existing.find((i) => i.body.includes(escMarker));
        if (already !== undefined) {
          return { escalationIssue: already.number };
        }
        const esc = input.escalation ?? {
          title: `Escalation: issue #${input.issueNumber} needs a human`,
          body: `Auto-escalated by /run-loop (run ${this.runId}). See source issue #${input.issueNumber}.`,
        };
        const escalationIssue = await this.gh.createIssue({
          title: esc.title,
          // Embed the deterministic marker so a lost-stamp resume can find this issue.
          body: `${esc.body}\n\n${escMarker}`,
          labels: [READY_FOR_HUMAN],
        });
        return { escalationIssue };
      }
      case 'relabeled': {
        const newLabel = input.newLabel ?? READY_FOR_HUMAN;
        // addLabel is naturally idempotent (set semantics), but guard anyway.
        if (!(await this.hasLabel(input.issueNumber, newLabel))) {
          await this.gh.addLabel(input.issueNumber, newLabel);
        }
        return { relabeledTo: newLabel };
      }
      default: {
        const exhaustive: never = target;
        throw new Error(`run-loop: unknown terminal state ${String(exhaustive)}`);
      }
    }
  }

  private async findEffect(key: string): Promise<EffectRecord | undefined> {
    const records = await this.journal.readAll();
    // Last matching record wins (a stamped record supersedes a bare intent).
    let found: EffectRecord | undefined;
    for (const r of records) {
      if (r['kind'] === 'effect-intent' && r['key'] === key) {
        found = r as EffectRecord;
      }
    }
    return found;
  }

  private async commentBodies(issueNumber: number): Promise<readonly string[]> {
    const comments = await this.gh.listComments(issueNumber);
    return comments.map((c) => c.body);
  }

  private async hasMarker(issueNumber: number, key: string): Promise<boolean> {
    return (await this.commentBodies(issueNumber)).some((b) => b.includes(key));
  }

  private async hasTerminalMarker(issueNumber: number, target: TerminalState): Promise<boolean> {
    const itemId = issueId(issueNumber);
    return this.hasMarker(issueNumber, terminalKey(this.runId, itemId, target));
  }

  private async hasLabel(issueNumber: number, label: string): Promise<boolean> {
    // getIssue returns the issue regardless of open/closed state, so a label check
    // after the close effect (completeItem) still sees the live label set.
    const issue = await this.gh.getIssue(issueNumber);
    return issue?.labels.includes(label) ?? false;
  }
}

/** Inputs to construct the issue provider. */
export interface IssueProviderDeps {
  readonly gh: GhClient;
  readonly journal: Journal;
  readonly runId: string;
}

/**
 * The issue WorkSource. At construction it does nothing; `init()` performs startup
 * reconciliation (resume) and then yields fresh ready-for-agent items in source
 * order. Reconciliation resolves any issue stuck mid-transition to completion
 * idempotently before any fresh item is yielded, and never re-yields a
 * terminal-marked or mid-transition issue.
 */
export class IssueWorkSource implements WorkSource {
  private readonly gh: GhClient;
  private readonly journal: Journal;
  private readonly runId: string;
  private readonly transitions: TerminalTransitions;
  private queue: IssueWorkItem[] = [];
  private cursor = 0;
  private initialized = false;
  readonly recorded: ItemResult[] = [];

  constructor(deps: IssueProviderDeps) {
    this.gh = deps.gh;
    this.journal = deps.journal;
    this.runId = deps.runId;
    this.transitions = new TerminalTransitions(deps.gh, deps.journal, deps.runId);
  }

  /** Expose the terminal-transition machine (Task 9 escalates failed items via it). */
  terminalTransitions(): TerminalTransitions {
    return this.transitions;
  }

  /**
   * Startup reconciliation (resume). Scan for any issue carrying `transitioning`
   * or a `transition-started` marker but no terminal marker, and resume each to
   * completion idempotently. Only then build the fresh ready queue.
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.reconcile();

    const ready = await this.gh.listIssues(READY_FOR_AGENT);
    const fresh: IssueWorkItem[] = [];
    for (const issue of ready) {
      // Never yield an issue mid-transition or already terminal.
      if (issue.labels.includes(TRANSITIONING)) {
        continue;
      }
      if (await this.anyTerminalMarker(issue.number)) {
        continue;
      }
      fresh.push(toIssueWorkItem(issue));
    }
    this.queue = fresh;
    this.initialized = true;
  }

  /** All ready items (for the Task 8 scheduler DAG build). */
  async allItems(): Promise<readonly IssueWorkItem[]> {
    await this.init();
    return this.queue;
  }

  async nextReady(): Promise<WorkItem | null> {
    await this.init();
    while (this.cursor < this.queue.length) {
      const item = this.queue[this.cursor++]!;
      return item;
    }
    return null;
  }

  async isDone(item: WorkItem): Promise<boolean> {
    const num = Number.parseInt(item.id.replace(/^issue-/, ''), 10);
    if (!Number.isInteger(num)) {
      return false;
    }
    return this.anyTerminalMarker(num);
  }

  async recordResult(_item: WorkItem, result: ItemResult): Promise<void> {
    this.recorded.push(result);
  }

  /** True if the issue carries any of the three terminal markers. */
  private async anyTerminalMarker(issueNumber: number): Promise<boolean> {
    const comments = await this.gh.listComments(issueNumber);
    const bodies = comments.map((c) => c.body);
    const targets: TerminalState[] = ['completed', 'escalated', 'relabeled'];
    const itemId = issueId(issueNumber);
    return targets.some((t) => bodies.some((b) => b.includes(terminalKey(this.runId, itemId, t))));
  }

  /**
   * Detect-and-repair: for every issue that is mid-transition (has a
   * `transition-started` marker or the `transitioning` label) but no terminal
   * marker, resume the same terminal op to completion idempotently.
   */
  private async reconcile(): Promise<void> {
    const candidates = await this.collectMidTransition();
    for (const c of candidates) {
      // Replay the same op; the machine no-ops the already-done steps and skips
      // the step-3 effect when the journal carries result ids.
      const input: TransitionInput = { issueNumber: c.issueNumber };
      switch (c.target) {
        case 'completed':
          await this.transitions.completeItem(input);
          break;
        case 'escalated':
          await this.transitions.escalateItem(input);
          break;
        case 'relabeled':
          await this.transitions.relabelItem(input);
          break;
        default: {
          const exhaustive: never = c.target;
          throw new Error(`run-loop: unknown terminal state ${String(exhaustive)}`);
        }
      }
    }
  }

  /** Find issues mid-transition (started but not committed) and their target. */
  private async collectMidTransition(): Promise<
    { issueNumber: number; target: TerminalState }[]
  > {
    // Two views, deduped by number:
    //  - transitioning-labeled issues in ANY state (crash after step-2/step-3, incl.
    //    a closed issue that completeItem's effect already closed);
    //  - ready-for-agent issues (crash after the step-1 comment but before the
    //    transitioning label landed — the issue still carries ready-for-agent and a
    //    transition-started marker).
    const transitioning = await this.gh.listByLabelAllStates(TRANSITIONING);
    const ready = await this.gh.listIssues(READY_FOR_AGENT);
    const candidates = new Map<number, GhIssue>();
    for (const i of [...transitioning, ...ready]) {
      candidates.set(i.number, i);
    }

    const out: { issueNumber: number; target: TerminalState }[] = [];
    for (const issue of candidates.values()) {
      const comments = await this.gh.listComments(issue.number);
      const bodies = comments.map((c) => c.body);
      const itemId = issueId(issue.number);
      const targets: TerminalState[] = ['completed', 'escalated', 'relabeled'];
      for (const t of targets) {
        const started = bodies.some((b) => b.includes(transitionStartedKey(this.runId, itemId, t)));
        const committed = bodies.some((b) => b.includes(terminalKey(this.runId, itemId, t)));
        // Resume only when the target is identifiable via a started marker. A bare
        // transitioning label with no started marker is an impossible state — step 1
        // writes the comment before the label — so the started marker pins the target.
        if (started && !committed) {
          out.push({ issueNumber: issue.number, target: t });
          break;
        }
      }
    }
    return out;
  }
}
