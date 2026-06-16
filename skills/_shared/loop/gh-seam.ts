// GitHub client seam (Wave 19) — the single injected boundary for every real
// `gh` side effect used by the issue provider (Task 4), findings-filer (Task 7),
// and the scheduler/merge layer (Task 8/8a).
//
// Nothing in this module shells out. The real adapter (a thin `gh` CLI wrapper)
// lands in a later wave; here we define the interface and the data shapes so all
// of Wave 19 is testable against a recording stub with no live GitHub.

/** A GitHub issue as the providers care about it. */
export interface GhIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly labels: readonly string[];
  readonly state: 'open' | 'closed';
}

/** A comment on an issue (used for durable marker comments). */
export interface GhComment {
  readonly id: string;
  readonly body: string;
}

/**
 * Result of opening a PR (Wave 23 HITL handoff). `ok:false` (no creds / no remote)
 * is returned, NOT thrown, so the caller falls back to the no-remote copy-paste
 * handoff instead of crashing the run.
 */
export interface PullRequestResult {
  readonly ok: boolean;
  readonly url?: string;
  readonly error?: string;
}

/**
 * The injected gh boundary. Every method maps to one `gh` invocation. Mutations
 * are intentionally fine-grained so the two-phase state machine can order them
 * exactly and a stub can record call order.
 */
export interface GhClient {
  /** `gh issue list --label <label> --state open` (+ comments preloaded). */
  listIssues(label: string): Promise<readonly GhIssue[]>;
  /**
   * Fetch a single issue by number REGARDLESS of open/closed state, or null if it
   * does not exist. Used for label checks during the terminal transition (after
   * close, the issue drops out of the open list but its labels still matter).
   */
  getIssue(issueNumber: number): Promise<GhIssue | null>;
  /**
   * `gh issue list --label <label> --state all` — issues with `label` regardless
   * of open/closed. Used by startup reconciliation to find issues left
   * `transitioning` even after their state-effect closed them.
   */
  listByLabelAllStates(label: string): Promise<readonly GhIssue[]>;
  /** Fetch the comments on an issue (for marker detection / reconciliation). */
  listComments(issueNumber: number): Promise<readonly GhComment[]>;
  /** `gh issue edit <n> --add-label <label>`. */
  addLabel(issueNumber: number, label: string): Promise<void>;
  /** `gh issue edit <n> --remove-label <label>`. */
  removeLabel(issueNumber: number, label: string): Promise<void>;
  /** `gh issue comment <n> --body <body>`; returns the created comment id. */
  comment(issueNumber: number, body: string): Promise<string>;
  /** `gh issue close <n>`. */
  closeIssue(issueNumber: number): Promise<void>;
  /**
   * `gh issue create ...`; returns the new issue number. Used by escalateItem
   * (ready-for-human escalation) and the findings filer (Task 7).
   */
  createIssue(input: {
    readonly title: string;
    readonly body: string;
    readonly labels: readonly string[];
  }): Promise<number>;
  /**
   * `gh pr create --draft --head <branch> ...` — the Wave-23 HITL handoff. Opens a
   * draft PR for a preserved `run-loop/*` branch (assumed already pushed). Returns a
   * typed `PullRequestResult` — a no-creds/no-remote failure is `{ok:false}`, NOT a
   * throw, so the caller can fall back to the copy-paste-command handoff.
   */
  createPullRequest(input: {
    readonly head: string;
    readonly title: string;
    readonly body: string;
    readonly draft: boolean;
  }): Promise<PullRequestResult>;
}
