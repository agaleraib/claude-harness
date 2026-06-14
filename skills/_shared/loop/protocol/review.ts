// Code-review + bounded auto-fix (Wave 19, Task 6).
//
// After a green exit gate, run /code-review on the item's diff:
//   - `high` inline by default; `ultra` only when the item declares `review: ultra`.
//   - Auto-fix all CRITICAL + HIGH findings, then re-review EXACTLY ONCE.
//   - If CRITICAL/HIGH survive the re-review, STOP auto-fixing and escalate to human.
//   - MEDIUM/LOW findings are NEVER auto-fixed (Task 7 files them as issues).
//
// Both /code-review and the auto-fixer are INJECTED seams, so the bounded-loop
// logic (at most one re-review, no infinite loop) is unit-testable with no real
// review tool and no real agent.

import { type WorkItem } from '../types.ts';

/** Severity of a single code-review finding. */
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

/** A single finding from /code-review. */
export interface Finding {
  readonly id: string;
  readonly severity: Severity;
  readonly title: string;
  readonly detail?: string;
}

/** The review effort level passed to /code-review. */
export type ReviewEffort = 'high' | 'ultra';

/** The /code-review seam — one invocation returns the findings on the diff. */
export interface CodeReviewer {
  review(item: WorkItem, effort: ReviewEffort): Promise<readonly Finding[]>;
}

/** The auto-fixer seam — attempts to resolve the given (CRITICAL/HIGH) findings. */
export interface AutoFixer {
  fix(item: WorkItem, findings: readonly Finding[]): Promise<void>;
}

/** True for the blocking severities the loop auto-fixes. */
export function isBlocking(f: Finding): boolean {
  return f.severity === 'CRITICAL' || f.severity === 'HIGH';
}

/** Resolve an item's declared review effort (`review: ultra` ⇒ ultra, else high). */
export function reviewEffortFor(item: WorkItem): ReviewEffort {
  return item['review'] === 'ultra' ? 'ultra' : 'high';
}

/** The outcome of the bounded review loop. */
export interface ReviewOutcome {
  /** 'clean' when no blocking findings remain; 'escalate' when they survive. */
  readonly disposition: 'clean' | 'escalate';
  /** Non-blocking (MEDIUM/LOW) findings, for Task 7 to file as issues. */
  readonly leftover: readonly Finding[];
  /** Number of times /code-review was invoked (1 = no re-review; 2 = one re-review). */
  readonly reviewCount: number;
  /** Blocking findings that survived (only when disposition === 'escalate'). */
  readonly survivingBlockers: readonly Finding[];
  readonly note?: string;
}

/**
 * Run the bounded review/auto-fix loop for one item:
 *   1. review (high or ultra);
 *   2. if blocking findings → auto-fix them → re-review EXACTLY ONCE;
 *   3. blocking survivors after the re-review → escalate (never a third review).
 * MEDIUM/LOW from the LAST review are returned as `leftover` for Task 7.
 */
export async function runReviewLoop(
  item: WorkItem,
  reviewer: CodeReviewer,
  fixer: AutoFixer,
): Promise<ReviewOutcome> {
  const effort = reviewEffortFor(item);

  // First review.
  let findings = await reviewer.review(item, effort);
  let reviewCount = 1;
  let blockers = findings.filter(isBlocking);

  if (blockers.length > 0) {
    // Auto-fix the blocking findings, then re-review EXACTLY ONCE.
    await fixer.fix(item, blockers);
    findings = await reviewer.review(item, effort);
    reviewCount = 2;
    blockers = findings.filter(isBlocking);
  }

  const leftover = findings.filter((f) => !isBlocking(f));

  if (blockers.length > 0) {
    // Blocking findings survived the single re-review — STOP, escalate. No third
    // review, no further auto-fix (bounded: at most one re-review).
    return {
      disposition: 'escalate',
      leftover,
      reviewCount,
      survivingBlockers: blockers,
      note: `${blockers.length} CRITICAL/HIGH finding(s) survived one auto-fix + re-review for ${item.id}`,
    };
  }

  return {
    disposition: 'clean',
    leftover,
    reviewCount,
    survivingBlockers: [],
  };
}
