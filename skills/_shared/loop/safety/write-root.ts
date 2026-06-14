// Worktree write-root confinement (Wave 20, Task 11).
//
// The worktree runner launches the agent with cwd = the worktree dir and an
// EXPLICIT set of allowed write roots = { the worktree dir, .harness-state/ for the
// run }. Writes outside those roots — by shell command, by non-shell Write/Edit, or
// by any tool — are denied at the layer that can SEE the target path:
//   - the PreToolUse hook (Task 10) for tool calls (this module is the path check it
//     delegates to for non-shell Write/Edit — denylist.ts point (b));
//   - plus, where the host supports it, an OS-level guard (sandbox-exec profile on
//     macOS / read-only bind-mount on Linux) declared in `.harness-profile`
//     (`worktree_write_guard:`).
//
// When NO OS-level guard is available, confinement falls back to the hook+allowlist
// layer only and the loop logs that the write-root guard is ADVISORY, not
// OS-ENFORCED, in the run summary (honest residual-risk surfacing — Phase 5 stmt).
//
// Pure + zero-dep. Path resolution is lexical (no filesystem stat): we normalize
// `.`/`..` segments against the worktree root so a `..` escape is caught without
// touching disk. The real OS-guard establishment is an injected, stubbable seam.

/** The set of roots an item is permitted to write to during its run. */
export interface WriteRoots {
  /** Absolute path of the worktree dir (primary write root). */
  readonly worktreeDir: string;
  /** Absolute path of the per-run `.harness-state/` dir. */
  readonly harnessStateDir: string;
}

/** A write-path decision. */
export type WritePathDecision =
  | { readonly action: 'allow'; readonly root: string }
  | { readonly action: 'deny'; readonly reason: string };

/** Lexically normalize an absolute path, collapsing `.`/`..` without touching disk. */
export function normalizeAbsPath(p: string): string {
  if (!p.startsWith('/')) {
    // A relative path is resolved against the worktree cwd by the caller; here we
    // only normalize absolute inputs. Relative inputs are handled by resolveWrite.
    return p;
  }
  const segments = p.split('/');
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === '' || seg === '.') {
      continue;
    }
    if (seg === '..') {
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return `/${out.join('/')}`;
}

/** True when `child` is `root` or a descendant of `root` (both normalized abs). */
function isWithin(root: string, child: string): boolean {
  const r = normalizeAbsPath(root);
  const c = normalizeAbsPath(child);
  return c === r || c.startsWith(`${r}/`);
}

/**
 * Resolve a write target path against the worktree cwd, then decide allow/deny.
 * A relative path is joined to the worktree dir BEFORE normalization, so
 * `../../etc/passwd` resolves out of the worktree and is denied.
 */
export function resolveWritePath(targetPath: string, roots: WriteRoots): WritePathDecision {
  const abs = targetPath.startsWith('/')
    ? normalizeAbsPath(targetPath)
    : normalizeAbsPath(`${roots.worktreeDir}/${targetPath}`);

  if (isWithin(roots.worktreeDir, abs)) {
    return { action: 'allow', root: normalizeAbsPath(roots.worktreeDir) };
  }
  if (isWithin(roots.harnessStateDir, abs)) {
    return { action: 'allow', root: normalizeAbsPath(roots.harnessStateDir) };
  }
  return {
    action: 'deny',
    reason: `write target "${targetPath}" (resolved ${abs}) is outside the allowed write roots ` +
      `{${normalizeAbsPath(roots.worktreeDir)}, ${normalizeAbsPath(roots.harnessStateDir)}}`,
  };
}

/**
 * OS-level write guard seam. The real impl establishes a restricted-write sandbox
 * (sandbox-exec profile on macOS / read-only bind-mount on Linux). Stubbed in tests.
 * `isAvailable()` lets the loop know whether confinement is OS-enforced or advisory.
 */
export interface WriteGuard {
  /** True when this host can OS-enforce the write-root restriction. */
  isAvailable(): Promise<boolean>;
  /**
   * Establish the OS guard for a run with the given write roots. Throws if it
   * cannot be established. No-op-and-throw is acceptable for unavailable hosts —
   * callers gate on isAvailable() first.
   */
  establish(roots: WriteRoots): Promise<void>;
  /** Human-readable mechanism name (e.g. "sandbox-exec", "bind-mount-ro"). */
  readonly name: string;
}

/** Posture of write-root confinement for a run, for run-summary surfacing. */
export type WriteRootPosture =
  | { readonly enforced: 'os-level'; readonly mechanism: string }
  | { readonly enforced: 'advisory'; readonly note: string };

/**
 * Resolve the write-root posture for a run: OS-enforced when a guard is available,
 * else advisory (hook + allowlist only). The loop records this in the run summary.
 */
export async function resolveWriteRootPosture(
  guard: WriteGuard | undefined,
  roots: WriteRoots,
): Promise<WriteRootPosture> {
  if (guard !== undefined && (await guard.isAvailable())) {
    await guard.establish(roots);
    return { enforced: 'os-level', mechanism: guard.name };
  }
  return {
    enforced: 'advisory',
    note:
      'no OS-level write guard available on this host; write-root confinement is advisory ' +
      '(PreToolUse hook + allowlist only), NOT OS-enforced',
  };
}
