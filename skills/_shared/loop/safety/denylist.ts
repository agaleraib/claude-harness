// Catastrophic-command denylist matcher (Wave 20, Task 10) — PreToolUse backstop.
//
// This module is the MATCHER LOGIC behind a Claude Code `PreToolUse` hook that the
// operator installs globally in `~/.claude/settings.json` (the install itself is a
// human-only TODO; this code is the reusable, testable decision function the hook
// shells out to). It fires REGARDLESS of permission mode and blocks catastrophic
// commands under the worktree runner.
//
// CRITICAL POSTURE (spec Task 10): a string denylist cannot enumerate every bypass
// (alternate syntax, scripts, aliases, path variants, non-shell file tools). The
// hook is therefore a BACKSTOP LAYER, not the confinement boundary. The matcher:
//   (a) canonicalizes the command (resolve abs paths, strip quoting, expand obvious
//       aliases) before matching — never raw-substring only;
//   (b) defers non-shell Write/Edit path checks to Task 11 write-root confinement
//       (see safety/write-root.ts) rather than string-matching file tools;
//   (c) FAILS CLOSED on parse ambiguity — an unparseable/obfuscated command BLOCKS
//       under the worktree runner;
//   (d) honors an operator `loop_allowlist:` (allowlist-leaning posture): when set,
//       only allowlisted command families (+ read-only ops) pass; otherwise the run
//       logs a `weak-posture` warning so the operator sees confinement is denylist-only.
//
// Zero-dep, pure. Every input (the command string, the repo tiers, the active
// worktree root) is passed in; nothing here shells out or touches the filesystem.

/** A decision the matcher returns for one candidate command. */
export type DenylistDecision =
  | { readonly action: 'allow'; readonly reason: string }
  | { readonly action: 'block'; readonly rule: string; readonly reason: string };

/** Repo-tier config sourced from `.harness-profile`. */
export interface RepoSafetyConfig {
  /** Extra denied command patterns declared per-repo (`loop_denylist:`). */
  readonly loopDenylist?: readonly string[];
  /** Allowlist-leaning posture: permitted command prefixes (`loop_allowlist:`). */
  readonly loopAllowlist?: readonly string[];
}

/** Context the matcher needs to evaluate a command. */
export interface DenylistContext {
  /** Absolute path of the active worktree dir; writes/deletes outside it are suspect. */
  readonly worktreeRoot: string;
  /** Repo-tier config from `.harness-profile`. */
  readonly repo: RepoSafetyConfig;
}

/**
 * The UNIVERSAL denylist tier, versioned in the hook. Each entry is a normalized
 * matcher over a canonicalized command. These block regardless of repo config.
 *
 * Matchers operate on the CANONICAL form (see canonicalizeCommand): lowercased
 * token stream with quoting stripped and the leading binary reduced to its
 * basename. This is why `/bin/rm` and `r''m` both reduce to the `rm` token.
 */
interface UniversalRule {
  readonly id: string;
  readonly describe: string;
  /** Returns true when the canonical command matches this catastrophic shape. */
  readonly matches: (canon: CanonicalCommand, ctx: DenylistContext) => boolean;
}

/** A command after canonicalization. */
export interface CanonicalCommand {
  /** The original raw command, untouched. */
  readonly raw: string;
  /** Whitespace-split tokens after quote-stripping + alias expansion, lowercased. */
  readonly tokens: readonly string[];
  /** basename of tokens[0] (the resolved binary), lowercased. */
  readonly bin: string;
  /** True when the command could not be confidently parsed (⇒ fail closed). */
  readonly ambiguous: boolean;
  /** Why it was deemed ambiguous (for the block reason). */
  readonly ambiguityReason?: string;
}

/** Obvious aliases we expand before matching (a small, conservative set). */
const ALIAS_MAP: Readonly<Record<string, string>> = {
  'rm': 'rm',
  'rmdir': 'rmdir',
  'del': 'rm',
};

/**
 * Constructs that defeat static parsing of a single command line. If any appears,
 * we cannot confidently say the command is safe → fail closed under worktree.
 * (Pipelines into a shell, command substitution, eval, base64-decode-pipe, etc.)
 */
const OBFUSCATION_MARKERS: readonly RegExp[] = [
  /\|\s*(sh|bash|zsh|dash)\b/, // curl ... | sh
  /\beval\b/,
  /\$\(/, // command substitution
  /`/, // backtick substitution
  /\bbase64\b.*\|/, // base64 -d | sh style
  /\bsource\b/,
  /<\(/, // process substitution
];

/** Strip shell quoting that is used purely to obfuscate a token (`r''m`, `"rm"`). */
function stripQuoting(token: string): string {
  // Remove empty-string concatenations and surrounding quotes: r''m → rm, "rm" → rm.
  return token.replace(/['"]/g, '');
}

/** Reduce a binary token to its basename so `/bin/rm` and `./rm` become `rm`. */
function binBasename(token: string): string {
  const noQuote = stripQuoting(token);
  const slash = noQuote.lastIndexOf('/');
  const base = slash === -1 ? noQuote : noQuote.slice(slash + 1);
  return base.toLowerCase();
}

/**
 * Canonicalize a raw command for matching. Resolves the leading binary to a
 * basename, strips obfuscation quoting on every token, expands obvious aliases,
 * and flags obfuscation/parse-ambiguity so the caller can fail closed.
 */
export function canonicalizeCommand(raw: string): CanonicalCommand {
  const trimmed = raw.trim();

  // Obfuscation markers ⇒ ambiguous (fail closed). We still surface the tokens for
  // diagnostics, but the decision will block under the worktree runner.
  let ambiguous = false;
  let ambiguityReason: string | undefined;
  for (const re of OBFUSCATION_MARKERS) {
    if (re.test(trimmed)) {
      ambiguous = true;
      ambiguityReason = `command contains a construct that defeats static safety analysis (${re.source})`;
      break;
    }
  }

  // A command invoking an arbitrary script file cannot be parsed for its effect
  // here — its body is not in the command line. Treat as ambiguous (fail closed):
  // `bash ./wipe.sh`, `sh ./x`, `./script.sh`.
  const rawTokens = trimmed.split(/\s+/).filter((t) => t.length > 0);
  const first = rawTokens[0] ?? '';
  const firstBin = binBasename(first);
  const isShellInterp = firstBin === 'sh' || firstBin === 'bash' || firstBin === 'zsh' || firstBin === 'dash';
  const secondLooksLikeScript = /\.(sh|bash|zsh|py|rb|pl)$/.test(stripQuoting(rawTokens[1] ?? ''));
  const firstLooksLikeScript = /(^|\/)[^/]+\.(sh|bash|zsh|py|rb|pl)$/.test(stripQuoting(first));
  if (!ambiguous && ((isShellInterp && secondLooksLikeScript) || firstLooksLikeScript)) {
    ambiguous = true;
    ambiguityReason =
      'command runs a script file whose body is not inspectable from the command line';
  }

  const tokens = rawTokens.map((t) => {
    const stripped = stripQuoting(t).toLowerCase();
    return ALIAS_MAP[stripped] ?? stripped;
  });
  const bin = ALIAS_MAP[firstBin] ?? firstBin;

  return {
    raw,
    tokens,
    bin,
    ambiguous,
    ...(ambiguityReason !== undefined ? { ambiguityReason } : {}),
  };
}

/** True if any token is a recursive-force flag set for rm (`-rf`, `-fr`, `-r -f`). */
function hasRecursiveForce(tokens: readonly string[]): boolean {
  const flags = tokens.filter((t) => t.startsWith('-'));
  const joined = flags.join('');
  const hasR = /r/.test(joined);
  const hasF = /f/.test(joined);
  return hasR && hasF;
}

/** True when a path token escapes the worktree root (`..`, absolute outside root). */
function pathEscapesWorktree(token: string, worktreeRoot: string): boolean {
  const p = stripQuoting(token);
  if (p.startsWith('-')) {
    return false; // a flag, not a path
  }
  if (p.includes('..')) {
    return true; // relative escape (`../outside`, `../../etc/...`)
  }
  if (p.startsWith('/')) {
    // Absolute path: escapes unless it is inside the worktree root.
    return !(p === worktreeRoot || p.startsWith(`${worktreeRoot}/`));
  }
  return false; // a plain relative path stays inside the cwd (= worktree)
}

const UNIVERSAL_RULES: readonly UniversalRule[] = [
  {
    id: 'rm-rf-outside-worktree',
    describe: 'rm -rf of a path outside the active worktree',
    matches: (c, ctx) => {
      if (c.bin !== 'rm' || !hasRecursiveForce(c.tokens)) {
        return false;
      }
      // Block when ANY path argument escapes the worktree, OR when targeting `/`.
      const pathArgs = c.tokens.slice(1).filter((t) => !t.startsWith('-'));
      if (pathArgs.some((p) => p === '/' || p === '/*')) {
        return true;
      }
      return pathArgs.some((p) => pathEscapesWorktree(p, ctx.worktreeRoot));
    },
  },
  {
    id: 'force-push-protected',
    describe: 'force-push to master/main',
    matches: (c) => {
      if (c.bin !== 'git') {
        return false;
      }
      const isPush = c.tokens.includes('push');
      const forced = c.tokens.some((t) => t === '--force' || t === '-f' || t === '--force-with-lease');
      const protectedRef = c.tokens.some((t) => t === 'master' || t === 'main' || /:(master|main)$/.test(t));
      return isPush && forced && protectedRef;
    },
  },
  {
    id: 'git-reset-hard-cross-branch',
    describe: 'git reset --hard across branches',
    matches: (c) => {
      if (c.bin !== 'git') {
        return false;
      }
      const isReset = c.tokens.includes('reset');
      const hard = c.tokens.includes('--hard');
      // A reset --hard naming another ref/branch (not HEAD / no arg) is destructive.
      const namesOtherRef = c.tokens.some(
        (t, i) => i >= 2 && !t.startsWith('-') && t !== 'head' && !/^head[~^]/.test(t),
      );
      return isReset && hard && namesOtherRef;
    },
  },
  {
    id: 'prod-deploy',
    describe: 'production deploy command',
    matches: (c) => {
      const line = c.tokens.join(' ');
      return (
        /\b(deploy|release|publish|push)\b/.test(line) &&
        /\b(prod|production|live)\b/.test(line)
      );
    },
  },
  {
    id: 'destructive-db',
    describe: 'destructive database statement',
    matches: (c) => {
      const line = c.tokens.join(' ');
      return (
        /\b(drop\s+(database|table|schema)|truncate\s+table|delete\s+from)\b/.test(line) ||
        /\bdb\s+reset\b/.test(line) ||
        /\bsupabase\b.*\breset\b/.test(line)
      );
    },
  },
  {
    id: 'curl-pipe-shell',
    describe: 'curl | sh (remote-script execution)',
    // Caught by the obfuscation/ambiguity path too, but also explicit here.
    matches: (c) => /\b(curl|wget)\b/.test(c.raw) && /\|\s*(sh|bash|zsh|dash)\b/.test(c.raw),
  },
];

/** Compile a repo-tier `loop_denylist:` entry into a normalized substring matcher. */
function repoDenylistMatches(canon: CanonicalCommand, patterns: readonly string[]): string | null {
  const line = canon.tokens.join(' ');
  for (const pat of patterns) {
    const norm = pat.trim().toLowerCase();
    if (norm.length === 0) {
      continue;
    }
    if (line.includes(norm)) {
      return pat;
    }
  }
  return null;
}

/**
 * Read-only command families that the allowlist-leaning posture always permits
 * (so an allowlist need not enumerate every benign read). Kept deliberately small.
 */
const READ_ONLY_BINS = new Set([
  'ls', 'cat', 'head', 'tail', 'grep', 'rg', 'find', 'pwd', 'echo', 'wc', 'stat', 'file', 'which',
  'git', // git is mostly read; destructive git is caught by universal rules above
  'node', 'npm', 'npx', 'tsc',
]);

/**
 * Evaluate ONE shell command under the worktree runner posture. Returns allow/block.
 *
 * Order:
 *   1. Universal denylist tier (catastrophic shapes) → block.
 *   2. Repo-tier `loop_denylist:` → block.
 *   3. Fail-closed: ambiguous/obfuscated command → block (cannot prove safe).
 *   4. Allowlist-leaning: if `loop_allowlist:` is set, only allowlisted prefixes
 *      (+ read-only bins) pass; everything else blocks.
 *   5. Otherwise allow (denylist-only mode — caller logs weak-posture separately).
 */
export function evaluateShellCommand(raw: string, ctx: DenylistContext): DenylistDecision {
  const canon = canonicalizeCommand(raw);

  for (const rule of UNIVERSAL_RULES) {
    if (rule.matches(canon, ctx)) {
      return {
        action: 'block',
        rule: rule.id,
        reason: `universal denylist: ${rule.describe}`,
      };
    }
  }

  const repoHit = repoDenylistMatches(canon, ctx.repo.loopDenylist ?? []);
  if (repoHit !== null) {
    return {
      action: 'block',
      rule: 'repo-loop-denylist',
      reason: `repo .harness-profile loop_denylist matched: "${repoHit}"`,
    };
  }

  if (canon.ambiguous) {
    return {
      action: 'block',
      rule: 'fail-closed-parse-ambiguity',
      reason:
        canon.ambiguityReason ??
        'command could not be confidently parsed; blocking under the worktree runner (fail closed)',
    };
  }

  const allowlist = ctx.repo.loopAllowlist;
  if (allowlist !== undefined && allowlist.length > 0) {
    const line = canon.tokens.join(' ');
    const allowed =
      READ_ONLY_BINS.has(canon.bin) ||
      allowlist.some((prefix) => {
        const p = prefix.trim().toLowerCase();
        return p.length > 0 && (line === p || line.startsWith(`${p} `) || canon.bin === p);
      });
    if (!allowed) {
      return {
        action: 'block',
        rule: 'allowlist-posture',
        reason: `loop_allowlist is declared and this command family is not allowlisted: "${canon.bin}"`,
      };
    }
  }

  return { action: 'allow', reason: 'no denylist rule matched' };
}

/**
 * Whether the run is in the weak (denylist-only) posture for a given repo config.
 * The loop surfaces a `weak-posture` warning in the run summary when this is true
 * for any worktree item — confinement is denylist-only, not allowlist-confined.
 */
export function isWeakPosture(repo: RepoSafetyConfig): boolean {
  return repo.loopAllowlist === undefined || repo.loopAllowlist.length === 0;
}
