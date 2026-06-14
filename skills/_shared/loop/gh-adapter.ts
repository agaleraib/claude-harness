// Real `gh` CLI adapter for the GhClient seam (Wave 20, Task 16).
//
// Wave 19 declared the GhClient interface (gh-seam.ts) including getIssue +
// listByLabelAllStates but shipped NO implementation. This adapter is the thin `gh`
// CLI wrapper. Per the module convention, the actual process invocation is an
// INJECTED command-runner seam, so the adapter's argv construction + JSON parsing are
// unit-testable with no live GitHub, no `gh` binary, no network.
//
// Each GhClient method maps to exactly one `gh` invocation, matching the seam's
// fine-grained shape so the two-phase state machine can order calls precisely.

import { type GhClient, type GhComment, type GhIssue } from './gh-seam.ts';

/** The process seam: run a command with argv, return stdout (throws on non-zero). */
export interface CommandRunner {
  /** Run `command` with `args`; resolve stdout, reject on a non-zero exit. */
  run(command: string, args: readonly string[]): Promise<string>;
}

/** Fields we ask `gh issue ... --json` for, mapped onto GhIssue. */
const ISSUE_JSON_FIELDS = 'number,title,body,labels,state';

/** Parse a `gh ... --json number,title,body,labels,state` row into a GhIssue. */
export function parseIssueJson(raw: unknown): GhIssue {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('gh-adapter: expected an issue object');
  }
  const o = raw as Record<string, unknown>;
  const number = o['number'];
  const title = o['title'];
  const body = o['body'];
  const state = o['state'];
  if (typeof number !== 'number') {
    throw new Error('gh-adapter: issue.number missing/not a number');
  }
  // gh returns labels as [{name: string, ...}]; normalize to string[].
  const rawLabels = Array.isArray(o['labels']) ? o['labels'] : [];
  const labels = rawLabels
    .map((l) => (typeof l === 'object' && l !== null ? (l as Record<string, unknown>)['name'] : l))
    .filter((n): n is string => typeof n === 'string');
  // gh issue state is OPEN/CLOSED; normalize to the seam's lowercase union.
  const normState = typeof state === 'string' && state.toLowerCase() === 'closed' ? 'closed' : 'open';
  return {
    number,
    title: typeof title === 'string' ? title : '',
    body: typeof body === 'string' ? body : '',
    labels,
    state: normState,
  };
}

/** Parse a `gh issue view <n> --json comments` payload into GhComment[]. */
export function parseCommentsJson(raw: unknown): readonly GhComment[] {
  if (typeof raw !== 'object' || raw === null) {
    return [];
  }
  const comments = (raw as Record<string, unknown>)['comments'];
  if (!Array.isArray(comments)) {
    return [];
  }
  return comments
    .map((c) => {
      if (typeof c !== 'object' || c === null) {
        return null;
      }
      const o = c as Record<string, unknown>;
      const id = o['id'];
      const bodyVal = o['body'];
      return {
        id: typeof id === 'string' ? id : String(id ?? ''),
        body: typeof bodyVal === 'string' ? bodyVal : '',
      } satisfies GhComment;
    })
    .filter((c): c is GhComment => c !== null);
}

/** The real `gh` CLI adapter. Argv construction + parsing tested via a stub runner. */
export class GhCliAdapter implements GhClient {
  private readonly runner: CommandRunner;

  constructor(runner: CommandRunner) {
    this.runner = runner;
  }

  async listIssues(label: string): Promise<readonly GhIssue[]> {
    const args = ['issue', 'list', '--state', 'open', '--json', ISSUE_JSON_FIELDS, '--limit', '500'];
    if (label !== '') {
      args.push('--label', label);
    }
    const out = await this.runner.run('gh', args);
    return this.parseList(out);
  }

  async getIssue(issueNumber: number): Promise<GhIssue | null> {
    // `gh issue view <n>` works regardless of open/closed; null when it does not exist.
    try {
      const out = await this.runner.run('gh', [
        'issue',
        'view',
        String(issueNumber),
        '--json',
        ISSUE_JSON_FIELDS,
      ]);
      const parsed: unknown = JSON.parse(out);
      return parseIssueJson(parsed);
    } catch {
      // gh exits non-zero when the issue does not exist; the seam wants null there.
      return null;
    }
  }

  async listByLabelAllStates(label: string): Promise<readonly GhIssue[]> {
    const out = await this.runner.run('gh', [
      'issue',
      'list',
      '--state',
      'all',
      '--label',
      label,
      '--json',
      ISSUE_JSON_FIELDS,
      '--limit',
      '500',
    ]);
    return this.parseList(out);
  }

  async listComments(issueNumber: number): Promise<readonly GhComment[]> {
    const out = await this.runner.run('gh', [
      'issue',
      'view',
      String(issueNumber),
      '--json',
      'comments',
    ]);
    const parsed: unknown = JSON.parse(out);
    return parseCommentsJson(parsed);
  }

  async addLabel(issueNumber: number, label: string): Promise<void> {
    await this.runner.run('gh', ['issue', 'edit', String(issueNumber), '--add-label', label]);
  }

  async removeLabel(issueNumber: number, label: string): Promise<void> {
    await this.runner.run('gh', ['issue', 'edit', String(issueNumber), '--remove-label', label]);
  }

  async comment(issueNumber: number, body: string): Promise<string> {
    // gh prints the created comment URL; use it as the stable comment id.
    const out = await this.runner.run('gh', [
      'issue',
      'comment',
      String(issueNumber),
      '--body',
      body,
    ]);
    return out.trim();
  }

  async closeIssue(issueNumber: number): Promise<void> {
    await this.runner.run('gh', ['issue', 'close', String(issueNumber)]);
  }

  async createIssue(input: {
    readonly title: string;
    readonly body: string;
    readonly labels: readonly string[];
  }): Promise<number> {
    const args = ['issue', 'create', '--title', input.title, '--body', input.body];
    for (const label of input.labels) {
      args.push('--label', label);
    }
    const out = await this.runner.run('gh', args);
    // gh prints the new issue URL (…/issues/<n>); extract the trailing number.
    const m = out.trim().match(/\/(\d+)\s*$/);
    if (m?.[1] === undefined) {
      throw new Error(`gh-adapter: could not parse created issue number from "${out.trim()}"`);
    }
    return Number.parseInt(m[1], 10);
  }

  private parseList(stdout: string): readonly GhIssue[] {
    const trimmed = stdout.trim();
    if (trimmed === '') {
      return [];
    }
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error('gh-adapter: expected a JSON array from gh issue list');
    }
    return parsed.map(parseIssueJson);
  }
}
