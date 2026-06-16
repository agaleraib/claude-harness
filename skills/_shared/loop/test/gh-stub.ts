// Recording gh stub (Wave 19 tests) — an in-memory GitHub that records call order
// and lets a test crash the sequence at any boundary.
//
// It backs `listIssues('')` (the all-issues reconciliation view) as well as
// label-filtered lists, tracks per-issue labels + comments + open/closed state,
// and appends every mutating call to `calls` so tests can assert exact ordering.

import { type GhClient, type GhComment, type GhIssue, type PullRequestResult } from '../gh-seam.ts';

interface MutableIssue {
  number: number;
  title: string;
  body: string;
  labels: Set<string>;
  state: 'open' | 'closed';
  comments: GhComment[];
}

/** Thrown by a wrapped op to simulate a crash at a chosen boundary. */
export class SimulatedCrash extends Error {
  constructor(at: string) {
    super(`simulated crash at ${at}`);
    this.name = 'SimulatedCrash';
  }
}

export class GhStub implements GhClient {
  private readonly issues = new Map<number, MutableIssue>();
  private nextNumber: number;
  private commentSeq = 0;
  /** Ordered log of every mutating call (for call-order assertions). */
  readonly calls: string[] = [];
  /** Optional hook: throw from here to crash mid-sequence. */
  crashOn: ((call: string) => void) | null = null;

  constructor(
    seed: readonly {
      number: number;
      title?: string;
      body?: string;
      labels?: readonly string[];
      state?: 'open' | 'closed';
    }[] = [],
  ) {
    let max = 0;
    for (const s of seed) {
      this.issues.set(s.number, {
        number: s.number,
        title: s.title ?? `Issue #${s.number}`,
        body: s.body ?? '',
        labels: new Set(s.labels ?? []),
        state: s.state ?? 'open',
        comments: [],
      });
      max = Math.max(max, s.number);
    }
    this.nextNumber = max + 1000; // created issues get high numbers
  }

  private record(call: string): void {
    this.calls.push(call);
    if (this.crashOn !== null) {
      this.crashOn(call);
    }
  }

  private snapshot(i: MutableIssue): GhIssue {
    return {
      number: i.number,
      title: i.title,
      body: i.body,
      labels: [...i.labels],
      state: i.state,
    };
  }

  /** Inspect an issue's current state (test helper, not part of GhClient). */
  peek(number: number): GhIssue | undefined {
    const i = this.issues.get(number);
    return i === undefined ? undefined : this.snapshot(i);
  }

  async listIssues(label: string): Promise<readonly GhIssue[]> {
    const out: GhIssue[] = [];
    for (const i of this.issues.values()) {
      if (i.state !== 'open') {
        continue;
      }
      if (label === '' || i.labels.has(label)) {
        out.push(this.snapshot(i));
      }
    }
    // Stable order by number.
    out.sort((a, b) => a.number - b.number);
    return out;
  }

  async getIssue(issueNumber: number): Promise<GhIssue | null> {
    const i = this.issues.get(issueNumber);
    return i === undefined ? null : this.snapshot(i);
  }

  async listByLabelAllStates(label: string): Promise<readonly GhIssue[]> {
    const out: GhIssue[] = [];
    for (const i of this.issues.values()) {
      if (i.labels.has(label)) {
        out.push(this.snapshot(i));
      }
    }
    out.sort((a, b) => a.number - b.number);
    return out;
  }

  async listComments(issueNumber: number): Promise<readonly GhComment[]> {
    return this.issues.get(issueNumber)?.comments.map((c) => ({ ...c })) ?? [];
  }

  async addLabel(issueNumber: number, label: string): Promise<void> {
    this.issues.get(issueNumber)?.labels.add(label);
    this.record(`addLabel(${issueNumber},${label})`);
  }

  async removeLabel(issueNumber: number, label: string): Promise<void> {
    this.issues.get(issueNumber)?.labels.delete(label);
    this.record(`removeLabel(${issueNumber},${label})`);
  }

  async comment(issueNumber: number, body: string): Promise<string> {
    const id = `c${++this.commentSeq}`;
    this.issues.get(issueNumber)?.comments.push({ id, body });
    this.record(`comment(${issueNumber},${body})`);
    return id;
  }

  async closeIssue(issueNumber: number): Promise<void> {
    const i = this.issues.get(issueNumber);
    if (i !== undefined) {
      i.state = 'closed';
    }
    this.record(`closeIssue(${issueNumber})`);
  }

  async createIssue(input: {
    title: string;
    body: string;
    labels: readonly string[];
  }): Promise<number> {
    const number = ++this.nextNumber;
    this.issues.set(number, {
      number,
      title: input.title,
      body: input.body,
      labels: new Set(input.labels),
      state: 'open',
      comments: [],
    });
    this.record(`createIssue(${number},${input.labels.join('+')})`);
    return number;
  }

  async createPullRequest(input: {
    head: string;
    title: string;
    body: string;
    draft: boolean;
  }): Promise<PullRequestResult> {
    this.record(`createPullRequest(${input.head},draft=${input.draft})`);
    return { ok: true, url: `https://github.com/owner/repo/pull/${++this.nextNumber}` };
  }
}
