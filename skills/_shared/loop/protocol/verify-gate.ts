// Verify-gate — reviewer proposes, the gate decides (Wave 21, Task 4).
//
// The spike (#5) proved a confident reviewer can be WRONG (haiku's JS-`$`/newline
// false positive) AND right (Opus's non-string-coercion real gap). So a review finding
// is never acted on directly. The verify-gate is the discipline:
//
//   For each review finding (T3 proposal):
//     1. REPRODUCE it as a failing assertion against the item's gate (GateRunner).
//        - reproduces (the assertion fails) ⇒ it is a REAL finding → drives a fix round.
//        - does NOT reproduce (the assertion passes) ⇒ logged ADVISORY, never blocks.
//     2. Fix rounds are BOUNDED: after the fixer runs, re-reproduce; if still failing
//        after the bound, the finding is REPRODUCED-BUT-UNFIXED → filed as a gh issue
//        (idempotently) and the item escalates. Never an unbounded auto-fix loop.
//
// The gate itself (tests + typecheck + Verify) stays authoritative for merge: a RED
// gate blocks merge regardless of any review (handled by the existing runExitGate +
// per-item protocol). This module only governs how FINDINGS are triaged.
//
// Every effect (reproduction attempt, fix, gh filing) is an injected seam.

import { type WorkItem } from '../types.ts';
import { type GhClient } from '../gh-seam.ts';
import { type ReviewFinding } from '../dispatch/backends.ts';

/** Attempts to express a review finding as a failing assertion and run it. */
export interface FindingReproducer {
  /**
   * Try to reproduce `finding` as a failing assertion against the item's workspace
   * gate. Returns true when the assertion FAILS (the finding is real / reproduced),
   * false when it PASSES (the finding does not reproduce — advisory only).
   */
  reproduce(item: WorkItem, finding: ReviewFinding): Promise<boolean>;
}

/** Attempts to fix a reproduced finding in the item's workspace. */
export interface FindingFixer {
  fix(item: WorkItem, finding: ReviewFinding): Promise<void>;
}

/** Per-finding triage outcome. */
export type FindingTriage =
  | { readonly finding: ReviewFinding; readonly status: 'advisory'; readonly reason: string }
  | { readonly finding: ReviewFinding; readonly status: 'fixed'; readonly rounds: number }
  | {
      readonly finding: ReviewFinding;
      readonly status: 'reproduced-unfixed';
      readonly rounds: number;
      readonly issueNumber: number;
    };

/** The whole verify-gate result over a review's findings. */
export interface VerifyGateResult {
  readonly triaged: readonly FindingTriage[];
  /** True when at least one finding was reproduced-but-unfixed (item must escalate). */
  readonly escalate: boolean;
  /** Advisory (non-reproduced) findings, surfaced in the run summary. */
  readonly advisory: readonly ReviewFinding[];
}

export interface VerifyGateDeps {
  readonly reproducer: FindingReproducer;
  readonly fixer: FindingFixer;
  readonly gh: GhClient;
  /** Max fix rounds per reproduced finding before filing + escalating (default 1). */
  readonly maxFixRounds?: number;
  /** Optional advisory logger (non-reproduced findings). Never receives secrets. */
  readonly logger?: { log(message: string): void };
}

/** Stable marker embedded in a filed finding issue so re-runs are idempotent. */
export function findingMarker(item: WorkItem, finding: ReviewFinding): string {
  // Title + severity + item id uniquely identify a finding across runs. Kept stable so
  // the existence check on re-run matches the prior filing exactly.
  return `run-loop-finding:${item.id}:${finding.severity}:${finding.title}`;
}

/**
 * File a reproduced-but-unfixed finding as a gh issue IDEMPOTENTLY: if an issue whose
 * body carries this finding's marker already exists (open or closed), reuse it rather
 * than creating a duplicate. Returns the issue number.
 */
export async function fileReproducedFinding(
  item: WorkItem,
  finding: ReviewFinding,
  gh: GhClient,
): Promise<number> {
  const marker = findingMarker(item, finding);
  const existing = await gh.listByLabelAllStates('from:code-review');
  for (const issue of existing) {
    if (issue.body.includes(marker)) {
      return issue.number; // already filed — idempotent, no duplicate.
    }
  }
  const sourceLabel = typeof item['sourceLabel'] === 'string' ? (item['sourceLabel'] as string) : undefined;
  const labels = sourceLabel !== undefined ? ['from:code-review', sourceLabel] : ['from:code-review'];
  return gh.createIssue({
    title: `[verify-gate:${finding.severity}] ${finding.title}`,
    body: [
      `**Severity:** ${finding.severity}`,
      finding.detail !== undefined ? `\n${finding.detail}` : '',
      `\n\nReproduced as a failing assertion but not fixed within the bound.`,
      `\n\n<!-- ${marker} -->`,
    ].join(''),
    labels,
  });
}

/**
 * Run the verify-gate over a review's findings. Reviewer proposes; the gate decides.
 * Each finding is reproduced; non-reproduced ⇒ advisory; reproduced ⇒ bounded fix; a
 * still-failing finding after the bound ⇒ filed (idempotent) + escalate.
 */
export async function runVerifyGate(
  item: WorkItem,
  findings: readonly ReviewFinding[],
  deps: VerifyGateDeps,
): Promise<VerifyGateResult> {
  const maxRounds = deps.maxFixRounds ?? 1;
  const triaged: FindingTriage[] = [];
  const advisory: ReviewFinding[] = [];
  let escalate = false;

  for (const finding of findings) {
    // 1. Reproduce. A finding that does not reproduce is ADVISORY — never blocks.
    const reproduced = await deps.reproducer.reproduce(item, finding);
    if (!reproduced) {
      const reason = `finding "${finding.title}" did not reproduce against the gate — advisory only`;
      deps.logger?.log(`verify-gate advisory: ${reason}`);
      advisory.push(finding);
      triaged.push({ finding, status: 'advisory', reason });
      continue;
    }

    // 2. Bounded fix rounds. Re-reproduce after each fix; stop as soon as it clears.
    let rounds = 0;
    let stillFailing = true;
    while (rounds < maxRounds) {
      await deps.fixer.fix(item, finding);
      rounds += 1;
      stillFailing = await deps.reproducer.reproduce(item, finding);
      if (!stillFailing) {
        break;
      }
    }

    if (stillFailing) {
      // Reproduced but unfixed within the bound → file (idempotent) + escalate.
      const issueNumber = await fileReproducedFinding(item, finding, deps.gh);
      triaged.push({ finding, status: 'reproduced-unfixed', rounds, issueNumber });
      escalate = true;
    } else {
      triaged.push({ finding, status: 'fixed', rounds });
    }
  }

  return { triaged, escalate, advisory };
}
