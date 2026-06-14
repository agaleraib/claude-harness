// Wave WorkSource provider (Wave 19, Task 3).
//
// Reads docs/plan.md, extracts open `### Wave N` blocks and their items, follows
// spec links, and exposes each wave as a loop WorkItem carrying:
//   - id              — `wave-<N>` (stable within a run)
//   - runner          — the `Runner:` line on the block (default sandcastle)
//   - blockedBy       — the wave ids named by `Blocked by` / `depends-on` edges
//   - syntheticSpec   — the wave block body (the synthetic wave-spec; reuses the
//                       /run-wave Step 4-6 idea of "the block IS the spec")
//   - exitGate        — the exit gate text, verbatim
//   - specPath        — the followed spec link (for provenance)
//   - waveNumber      — the parsed integer
//
// This module is PURE w.r.t. the filesystem: the plan.md text and a spec-link
// reader are injected, so the parser is unit-testable against a fixture string
// with no disk access. The engine consumes the resulting WorkSource through the
// frozen interface only.

import {
  type ItemResult,
  type RunnerKind,
  type WorkItem,
  type WorkSource,
} from '../types.ts';

/** Payload a wave WorkItem carries beyond the engine-read fields. */
export interface WaveItemPayload {
  readonly waveNumber: number;
  /** The wave block body, verbatim — the synthetic wave-spec. */
  readonly syntheticSpec: string;
  /** The exit gate text, verbatim (empty string when the block declares none). */
  readonly exitGate: string;
  /** The followed spec link, if the block named one. */
  readonly specPath?: string;
}

/** A wave WorkItem: the frozen WorkItem fields plus the wave payload. */
export interface WaveWorkItem extends WorkItem, WaveItemPayload {
  readonly id: string;
  readonly runner: RunnerKind;
  readonly blockedBy: readonly string[];
}

/** One parsed `### Wave N` block before it is turned into a WorkItem. */
export interface ParsedWaveBlock {
  readonly waveNumber: number;
  readonly title: string;
  readonly runner: RunnerKind;
  /** Wave numbers this block is blocked by (the raw `N` from edge lines). */
  readonly blockedByWaveNumbers: readonly number[];
  readonly specPath?: string;
  readonly exitGate: string;
  readonly body: string;
}

const WAVE_HEADING = /^###\s+Wave\s+(\d+)\b\s*(?:[—\-:]\s*(.*))?$/;

/** Reads the spec linked from a wave block. Injected so the parser stays pure. */
export interface SpecLinkReader {
  /** Resolve a spec link (e.g. `docs/specs/foo.md`) to its text, or null if absent. */
  read(specPath: string): Promise<string | null>;
}

/**
 * Split plan.md into the body of each `### Wave N` block. The body runs from the
 * heading line up to (but not including) the next heading of level `###` or
 * shallower (`#`, `##`, `###`) or end-of-file. A wave block lives inside one
 * section and never spans a higher-level boundary, so any such heading closes it.
 */
export function splitWaveBlocks(planText: string): { heading: string; body: string }[] {
  const lines = planText.split('\n');
  const blocks: { heading: string; body: string }[] = [];
  let current: { heading: string; bodyLines: string[] } | null = null;

  const isWaveHeading = (line: string): boolean => WAVE_HEADING.test(line);
  const isBlockTerminator = (line: string): boolean => /^#{1,3}\s/.test(line);

  const flush = (): void => {
    if (current !== null) {
      blocks.push({ heading: current.heading, body: current.bodyLines.join('\n') });
      current = null;
    }
  };

  for (const line of lines) {
    if (isWaveHeading(line)) {
      flush();
      current = { heading: line, bodyLines: [line] };
      continue;
    }
    if (current !== null && isBlockTerminator(line)) {
      // A heading (### or shallower) that is NOT a wave heading closes the block.
      flush();
      continue;
    }
    if (current !== null) {
      current.bodyLines.push(line);
    }
  }
  flush();
  return blocks;
}

/** Parse the `Runner:` line out of a block body; default sandcastle when absent/invalid. */
function parseRunner(body: string): RunnerKind {
  // Match a line like `- Runner: worktree` or `Runner: sandcastle` (any leading bullet/space).
  const m = body.match(/^\s*[-*]?\s*Runner:\s*(\S+)/im);
  const raw = m?.[1]?.trim().toLowerCase();
  if (raw === 'worktree' || raw === 'sandcastle') {
    return raw;
  }
  return 'sandcastle';
}

/**
 * Parse the wave numbers this block is blocked by. Accepts both the engine grammar
 * (`Blocked by: Wave A`) and this repo's plan.md grammar (`depends-on: Wave A`).
 * Extracts every `Wave <N>` token on those lines.
 */
function parseBlockedBy(body: string): number[] {
  const nums = new Set<number>();
  const lineRe = /^\s*[-*]?\s*(?:Blocked by|depends-on)\s*:?\s*(.*)$/gim;
  let lineMatch: RegExpExecArray | null;
  while ((lineMatch = lineRe.exec(body)) !== null) {
    const rest = lineMatch[1] ?? '';
    const waveRe = /\bWave\s+(\d+)\b/gi;
    let waveMatch: RegExpExecArray | null;
    while ((waveMatch = waveRe.exec(rest)) !== null) {
      const n = Number.parseInt(waveMatch[1] ?? '', 10);
      if (Number.isInteger(n)) {
        nums.add(n);
      }
    }
  }
  return [...nums];
}

/** Parse the spec link (first `spec:` line pointing at a path). */
function parseSpecPath(body: string): string | undefined {
  const m = body.match(/^\s*[-*]?\s*spec:\s*(\S+)/im);
  return m?.[1]?.trim();
}

/**
 * Parse the exit gate text verbatim. The engine grammar puts the gate on an
 * `**Exit gate:**` line (possibly pointing at a spec section) or in an `## Exit Gate`
 * subsection. We capture from the first exit-gate marker to the next heading or EOF.
 */
function parseExitGate(body: string): string {
  const lines = body.split('\n');
  const startIdx = lines.findIndex((l) =>
    /^\s*(?:\*\*Exit ?gate:?\*\*|#{1,4}\s*Exit ?Gate\b)/i.test(l),
  );
  if (startIdx === -1) {
    return '';
  }
  const collected: string[] = [lines[startIdx] ?? ''];
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const l = lines[i] ?? '';
    if (/^#{1,4}\s/.test(l)) {
      break;
    }
    collected.push(l);
  }
  return collected.join('\n').trim();
}

/** Parse a single wave block heading + body into a ParsedWaveBlock. */
export function parseWaveBlock(heading: string, body: string): ParsedWaveBlock | null {
  const hm = heading.match(WAVE_HEADING);
  if (hm === null) {
    return null;
  }
  const waveNumber = Number.parseInt(hm[1] ?? '', 10);
  if (!Number.isInteger(waveNumber)) {
    return null;
  }
  const title = (hm[2] ?? '').trim();
  const specPath = parseSpecPath(body);
  const block: ParsedWaveBlock = {
    waveNumber,
    title,
    runner: parseRunner(body),
    blockedByWaveNumbers: parseBlockedBy(body),
    exitGate: parseExitGate(body),
    body,
    ...(specPath !== undefined ? { specPath } : {}),
  };
  return block;
}

/** Parse all wave blocks from plan.md text. */
export function parseWaveBlocks(planText: string): ParsedWaveBlock[] {
  const out: ParsedWaveBlock[] = [];
  for (const { heading, body } of splitWaveBlocks(planText)) {
    const parsed = parseWaveBlock(heading, body);
    if (parsed !== null) {
      out.push(parsed);
    }
  }
  return out;
}

/** Turn a parsed block into the id used for the WorkItem. */
export function waveId(waveNumber: number): string {
  return `wave-${waveNumber}`;
}

/**
 * Build wave WorkItems from plan.md text, following spec links via the injected
 * reader. The synthetic spec is the block body; when a spec link resolves, its text
 * is appended after a separator so the runner has the full context (matching the
 * /run-wave Step 4-6 "the block plus its linked spec is the work" idea).
 *
 * Edges are emitted as `wave-<N>` ids so they match the WorkItem ids.
 */
export async function buildWaveItems(
  planText: string,
  reader: SpecLinkReader,
): Promise<WaveWorkItem[]> {
  const blocks = parseWaveBlocks(planText);
  const items: WaveWorkItem[] = [];
  for (const block of blocks) {
    let syntheticSpec = block.body;
    if (block.specPath !== undefined) {
      const specText = await reader.read(block.specPath);
      if (specText !== null) {
        syntheticSpec = `${block.body}\n\n--- linked spec (${block.specPath}) ---\n\n${specText}`;
      }
    }
    const item: WaveWorkItem = {
      id: waveId(block.waveNumber),
      runner: block.runner,
      blockedBy: block.blockedByWaveNumbers.map(waveId),
      waveNumber: block.waveNumber,
      syntheticSpec,
      exitGate: block.exitGate,
      ...(block.specPath !== undefined ? { specPath: block.specPath } : {}),
    };
    items.push(item);
  }
  return items;
}

/**
 * In-memory wave WorkSource over a pre-built item list. Yields items in source
 * order, honors `isDone` for resumability (an item is done once recorded or
 * pre-seeded done), and never re-yields. Real disk reads happen in buildWaveItems
 * up front, so the source itself takes no side effects on the hot path.
 */
export class WaveWorkSource implements WorkSource {
  private cursor = 0;
  private readonly items: readonly WaveWorkItem[];
  private readonly doneIds: Set<string>;
  readonly recorded: ItemResult[] = [];

  constructor(items: readonly WaveWorkItem[], preMarkedDone: readonly string[] = []) {
    this.items = items;
    this.doneIds = new Set(preMarkedDone);
  }

  /** All items, in source order (for the scheduler's DAG build — Task 8). */
  allItems(): readonly WaveWorkItem[] {
    return this.items;
  }

  async nextReady(): Promise<WorkItem | null> {
    while (this.cursor < this.items.length) {
      const item = this.items[this.cursor++]!;
      if (this.doneIds.has(item.id)) {
        continue;
      }
      return item;
    }
    return null;
  }

  async isDone(item: WorkItem): Promise<boolean> {
    return this.doneIds.has(item.id);
  }

  async recordResult(item: WorkItem, result: ItemResult): Promise<void> {
    this.recorded.push(result);
    this.doneIds.add(item.id);
  }
}
