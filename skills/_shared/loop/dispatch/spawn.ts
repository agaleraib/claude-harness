// Subprocess dispatch helper (Wave 21, Task 1).
//
// The single place every backend that shells out to a CLI (codex / claude) goes
// through. Its one NON-NEGOTIABLE invariant: the child is spawned with stdin IGNORED
// (`stdio: ['ignore', 'pipe', 'pipe']`). `codex exec` blocks indefinitely on an open
// stdin and `claude -p` waits ~3s — ignoring stdin is required for headless dispatch.
//
// The actual child-process spawn is an INJECTED seam (SpawnFn) so the stdin-ignore
// guarantee, env handling, and output capture are unit-testable with NO real process.
// The default seam binds node:child_process.spawn; tests pass a recording fake.

/** The stdio triple every dispatched child uses: stdin IGNORED, stdout+stderr piped. */
export const DISPATCH_STDIO: readonly ['ignore', 'pipe', 'pipe'] = ['ignore', 'pipe', 'pipe'];

/** Options a dispatch passes to the spawn seam. */
export interface SpawnOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  /** Always DISPATCH_STDIO — surfaced so the seam/fake can assert stdin is ignored. */
  readonly stdio: readonly ['ignore', 'pipe', 'pipe'];
}

/** The captured result of a finished child. */
export interface SpawnResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * The spawn seam: run `command argv...` and resolve with the captured result. The
 * default impl (defaultSpawn) binds node:child_process; tests inject a fake to assert
 * argv + the stdin-ignored stdio without a real process.
 */
export type SpawnFn = (
  command: string,
  argv: readonly string[],
  options: SpawnOptions,
) => Promise<SpawnResult>;

/**
 * Spawn `command argv` with stdin IGNORED (the non-negotiable invariant) via the
 * injected seam. Callers never construct the stdio triple themselves — this function
 * is the only place DISPATCH_STDIO is applied, so the guarantee can't be bypassed.
 */
export function spawnIgnoringStdin(
  spawn: SpawnFn,
  command: string,
  argv: readonly string[],
  ctx: { readonly cwd: string; readonly env: Readonly<Record<string, string>> },
): Promise<SpawnResult> {
  return spawn(command, argv, {
    cwd: ctx.cwd,
    env: ctx.env,
    stdio: DISPATCH_STDIO,
  });
}

/**
 * Strip the Claude-Code host markers from an env so a dispatched `claude -p` does not
 * mistake the loop's own session for a nested one. Removes CLAUDECODE and every
 * CLAUDE_CODE_* key (spike-validated). Returns a NEW object; the input is untouched.
 * Backend-agnostic helper kept here next to the spawn boundary.
 */
export function stripClaudeMarkers(
  env: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_')) {
      continue;
    }
    out[k] = v;
  }
  return out;
}

/**
 * Strip `OPENAI_API_KEY` from an env so a dispatched `codex` always uses its
 * ChatGPT-subscription (gpt-5.5) auth and can't fall into the broken "mixed-auth" state.
 * Unconditional: the loop's codex backend targets the sub-only gpt-5.5, so a stray
 * OpenAI API key (e.g. exported in a shell profile) alongside the ChatGPT login makes
 * `codex doctor` report "mixed auth signals" and codex tries a broken API path. Returns
 * a NEW object; the input is untouched. Mirrors stripClaudeMarkers at the spawn boundary.
 */
export function stripOpenAiApiKey(
  env: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (k === 'OPENAI_API_KEY') {
      continue;
    }
    out[k] = v;
  }
  return out;
}

/**
 * The default spawn seam, binding node:child_process.spawn with stdin IGNORED. Lazily
 * imports child_process so the module loads in environments without it (tests inject a
 * fake and never reach here). Buffers stdout/stderr and resolves on close.
 */
export const defaultSpawn: SpawnFn = async (command, argv, options) => {
  const { spawn } = await import('node:child_process');
  return await new Promise<SpawnResult>((resolve, reject) => {
    const child = spawn(command, [...argv], {
      cwd: options.cwd,
      env: { ...options.env },
      stdio: [...options.stdio],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      reject(err);
    });
    child.on('close', (code) => {
      resolve({ exitCode: code, stdout, stderr });
    });
  });
};
