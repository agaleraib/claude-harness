---
name: shared-root-init
description: Initialize the shared user-global memory root at `~/.claude/memory/` (USER.md, FEEDBACK.md, REFERENCES.md, PROJECTS.md, archive/, feedback/) using the atomic staging-then-rename pattern. Writes a canonical receipt under `.harness-state/` BEFORE any user-global mutation, journals every rename attempt, and refuses on partial-existing target with a `diff -r` for operator review.
---

# shared-root-init

One-shot, idempotent initializer for `~/.claude/memory/`.

## When to use

- First-time setup of the shared memory root on a new machine.
- Wave 11 of `docs/specs/2026-05-13-memory-system-redesign.md` (the canonical first call).
- Recovery after a previously-aborted init: the journal + receipt provide the audit trail; the refuse-on-partial gate requires the operator to hand-resolve before any merge.

## Behavior summary

`bash skills/shared-root-init/lib/init.sh` performs, in order:

1. **Refuse-on-partial gate.** If `~/.claude/memory` already exists (in any state — full, partial, mid-write), exit non-zero. Emit a `diff -r` between the live tree and the expected tree to stderr so the operator can hand-merge. Append a journal line `{action: refused-on-partial-existing, ...}` to `.harness-state/shared-root-init.jsonl`. NEVER silently merge into partial state.
2. **Build staging tree** at `~/.claude/.staging-shared-root-<utc-iso>/` with `archive/`, `feedback/`, and seeded `USER.md` / `FEEDBACK.md` / `REFERENCES.md` / `PROJECTS.md`.
3. **Write durable receipt BEFORE the atomic rename** at `.harness-state/shared-root-init-2026-05-13-memory-system-redesign-<ts>.yml` (canonical schema per `docs/protocol/receipt-schema.md`). `status: partial` until step 7.
4. **Append staging-built journal line** to `.harness-state/shared-root-init.jsonl`.
5. **Atomic rename** `mv $STAGING ~/.claude/memory` — single `rename(2)` syscall, POSIX-atomic since both paths share `~/.claude/`.
6. **Append committed journal line** to `.harness-state/shared-root-init.jsonl`.
7. **Update receipt** `status: success` + `completed_at`.

## Test-only interruption hooks

For verifying the atomic-root invariant (per spec acceptance criterion, Codex round-2 finding [medium]):

- Environment variable: `SHARED_ROOT_INIT_KILL_AFTER_STAGING=1`
- CLI flag: `--kill-after-staging`

Either signals that the script should `kill -KILL $$` immediately after writing the receipt + staging dir but **before** the atomic rename. After a kill, the receipt remains on disk with `status: partial`, the staging dir under `~/.claude/.staging-shared-root-<ts>/` is intact, and `~/.claude/memory` is absent — i.e. the atomic-root invariant holds.

## Test-only HOME override

For sandbox testing without mutating the operator's real `~/.claude/`:

- The script honors `HOME=<sandbox>` — `~/.claude/memory` resolution uses `$HOME` not `getpwuid()`. The Wave 11 exit gate uses this for the refuse-on-partial check.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Atomic rename committed; receipt `status: success`; shared root ready. |
| `1` | Refused on partial-existing target. Diff emitted to stderr. Receipt + journal record the refusal. |
| `137` (`KILL`) | Test-only kill-after-staging path. Receipt + staging dir intact for resumption. |

## Recovery

After a `--kill-after-staging` interruption (or any other crash between staging-built and rename):

1. Operator inspects the receipt — confirms it's the only partial attempt.
2. Operator inspects the staging dir contents.
3. Operator runs `mv ~/.claude/.staging-shared-root-<ts> ~/.claude/memory` manually.
4. Receipt remains `partial` on disk as audit trail; next clean init writes a fresh receipt.

## Not in scope

- Populating FEEDBACK.md / feedback/ with promoted entries — that's Wave 12 (`/migrate-memory`).
- Seeding PROJECTS.md with all known repos — that's Wave 11 Task 2 (separate path under spec).
- Backporting per-cwd MEMORY.md trims — that's Wave 11 Task 5.
