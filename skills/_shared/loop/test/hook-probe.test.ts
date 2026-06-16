// Tests for the concrete denylist-hook probe (the production wiring fix).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InstalledDenylistHookProbe, hasDenylistHook } from '../safety/hook-probe.ts';

const INSTALLED_SETTINGS = JSON.stringify({
  hooks: {
    PreToolUse: [
      { matcher: 'Bash(git commit*)', hooks: [{ type: 'command', command: 'echo other' }] },
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'node ~/.claude/hooks/loop-denylist.mjs' }] },
    ],
  },
});

const NO_DENYLIST_SETTINGS = JSON.stringify({
  hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node ~/.claude/hooks/other.mjs' }] }] },
});

function withSettings(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'hookprobe-'));
  const p = join(dir, 'settings.json');
  writeFileSync(p, content);
  return p;
}

test('isActive false when RUN_LOOP_ENFORCE is unset (hook fail-opens, even if installed)', async () => {
  const settingsPath = withSettings(INSTALLED_SETTINGS);
  const probe = new InstalledDenylistHookProbe({ settingsPath, env: {} });
  assert.equal(await probe.isActive(), false);
  rmSync(settingsPath, { force: true });
});

test('isActive true when RUN_LOOP_ENFORCE=1 AND the denylist hook is installed', async () => {
  const settingsPath = withSettings(INSTALLED_SETTINGS);
  const probe = new InstalledDenylistHookProbe({ settingsPath, env: { RUN_LOOP_ENFORCE: '1' } });
  assert.equal(await probe.isActive(), true);
  rmSync(settingsPath, { force: true });
});

test('isActive false when enforcing but the denylist hook is NOT installed', async () => {
  const settingsPath = withSettings(NO_DENYLIST_SETTINGS);
  const probe = new InstalledDenylistHookProbe({ settingsPath, env: { RUN_LOOP_ENFORCE: '1' } });
  assert.equal(await probe.isActive(), false);
  rmSync(settingsPath, { force: true });
});

test('isActive false (fail-safe) when the settings file is missing', async () => {
  const probe = new InstalledDenylistHookProbe({
    settingsPath: join(tmpdir(), 'definitely-does-not-exist-12345', 'settings.json'),
    env: { RUN_LOOP_ENFORCE: '1' },
  });
  assert.equal(await probe.isActive(), false);
});

test('isActive false (fail-safe) on invalid JSON', async () => {
  const settingsPath = withSettings('{ not valid json');
  const probe = new InstalledDenylistHookProbe({ settingsPath, env: { RUN_LOOP_ENFORCE: '1' } });
  assert.equal(await probe.isActive(), false);
  rmSync(settingsPath, { force: true });
});

test('hasDenylistHook handles non-array / malformed PreToolUse shapes', () => {
  assert.equal(hasDenylistHook(undefined), false);
  assert.equal(hasDenylistHook('nope'), false);
  assert.equal(hasDenylistHook([{ hooks: 'bad' }]), false);
  assert.equal(hasDenylistHook([{ hooks: [{ command: 42 }] }]), false);
});
