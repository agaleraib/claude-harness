// Concrete denylist-hook probe (the piece the production composition root was missing).
//
// The backend-aware preflight (run-loop-driver.ts) refuses a Claude-backend *worktree*
// item unless the catastrophic-command PreToolUse denylist hook is ACTIVE — Claude has
// no native OS sandbox, so the hook + RUN_LOOP_ENFORCE is its worktree confinement story
// (Codex items never need it; the `-s workspace-write` sandbox is their boundary). The
// production wiring previously stubbed `hookProbe.isActive()` to `false`, which made the
// Claude worktree lane unreachable even when the operator HAD installed the hook. This
// probe actually detects it.
//
// "Active" requires BOTH:
//   1. RUN_LOOP_ENFORCE=1 in the env — the installed hook fail-opens without it (Wave 20),
//      so without the flag the hook is installed-but-not-enforcing.
//   2. a PreToolUse hook in ~/.claude/settings.json whose command references the denylist
//      script (`loop-denylist`) — i.e. it is actually installed.
// Any read/parse error ⇒ false (fail-safe: refuse the Claude worktree lane rather than run
// it unconfined). Satisfies both the driver's `HookProbe` and safety/guardrails'
// `DenylistHookProbe` (same `isActive(): Promise<boolean>` shape).

import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

/** Marker substring identifying the installed denylist PreToolUse hook command. */
export const DENYLIST_HOOK_MARKER = 'loop-denylist';

export interface InstalledDenylistHookProbeDeps {
  /** Path to the global Claude Code settings file. Default: ~/.claude/settings.json */
  readonly settingsPath?: string;
  /** Environment carrying RUN_LOOP_ENFORCE. Default: process.env */
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export class InstalledDenylistHookProbe {
  private readonly settingsPath: string;
  private readonly env: Readonly<Record<string, string | undefined>>;

  constructor(deps: InstalledDenylistHookProbeDeps = {}) {
    this.settingsPath = deps.settingsPath ?? join(homedir(), '.claude', 'settings.json');
    this.env = deps.env ?? process.env;
  }

  async isActive(): Promise<boolean> {
    // The hook fail-opens unless RUN_LOOP_ENFORCE=1, so it only enforces with the flag.
    if (this.env['RUN_LOOP_ENFORCE'] !== '1') return false;
    try {
      const raw = await readFile(this.settingsPath, 'utf8');
      const parsed = JSON.parse(raw) as { hooks?: { PreToolUse?: unknown } };
      return hasDenylistHook(parsed.hooks?.PreToolUse);
    } catch {
      // Missing / unreadable / invalid settings ⇒ treat as not active (fail-safe).
      return false;
    }
  }
}

/** True if any PreToolUse entry's command references the denylist hook script. */
export function hasDenylistHook(preToolUse: unknown): boolean {
  if (!Array.isArray(preToolUse)) return false;
  for (const entry of preToolUse) {
    const hooks = (entry as { hooks?: unknown }).hooks;
    if (!Array.isArray(hooks)) continue;
    for (const h of hooks) {
      const cmd = (h as { command?: unknown }).command;
      if (typeof cmd === 'string' && cmd.includes(DENYLIST_HOOK_MARKER)) return true;
    }
  }
  return false;
}
