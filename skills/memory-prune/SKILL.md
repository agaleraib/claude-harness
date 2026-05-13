---
name: memory-prune
description: Cap-management for `~/.claude/memory/*.md`. Dry-run by default — surfaces over-cap files (>5KB) and lines (>150 chars) without mutating. `--apply` archives the oldest entries / lines pointing to vanished topic files to `~/.claude/memory/archive/prune-<utc-date>.md` using temp-rename + byte-exact-backup + journal + canonical receipt. Surfaced by `/session-start` and `/session-end` as a non-blocking warning.
---

# memory-prune

Ongoing cap-management for the shared user-global memory root introduced in Wave 11 of `docs/specs/2026-05-13-memory-system-redesign.md`.

## When to use

- A `/session-start` warning says `~/.claude/memory/FEEDBACK.md` or similar is over its 5KB / 1KB cap.
- You want to audit which index entries point to feedback files that no longer exist in `~/.claude/memory/feedback/`.
- Routine maintenance every ~1-2 weeks once `~/.claude/memory/` has been live.

Dry-run by default — never touches state until `--apply`. Safe to run repeatedly.

## Invocation

```bash
bash skills/memory-prune/lib/prune.sh                     # dry-run against ~/.claude/memory
bash skills/memory-prune/lib/prune.sh --apply             # apply changes; emit receipt + journal
bash skills/memory-prune/lib/prune.sh --root /tmp/fixture # against test fixture
bash skills/memory-prune/lib/prune.sh --help              # print usage
```

Flags:
- `--root <dir>` — root to prune (default `~/.claude/memory`). Skips `archive/` and `feedback/` subdirs.
- `--apply` — mutate state. Without this flag the skill is read-only.
- `--receipt-root <dir>` — where to write the receipt + journal (default `<calling-repo>/.harness-state` if inside a repo, else `~/.harness-state`).
- `--no-receipt` — test-only: skip receipt + journal emission (used by fixture tests).
- `--help` — print this usage and exit 0 (handled BEFORE any side effect per `feedback_skill_help_branch_invariant`).

## Behavior

For each `*.md` file at `<root>` (NOT recursive into `archive/` or `feedback/`):

1. `wc -c` the file.
2. If size > 5120 bytes (or 1024 for `USER.md`), parse markdown bullets and identify candidates for archive:
   - Bullets whose linked topic file (`feedback/<slug>.md`) no longer exists in `<root>/feedback/`.
   - Otherwise, oldest entries (preserved-order assumption: earliest in file is oldest).
3. Report any line whose `awk length` exceeds 150 bytes (separate "long-line report" section).

When `--apply`:

For each candidate row:
1. `git hash-object -w <source>` — pre-mutation byte-exact backup to the local git object store.
2. Write `<file>.new` with the candidate rows removed; preserve all retained rows in order.
3. Atomic rename `mv <file>.new <file>`.
4. Append the removed rows to `<root>/archive/prune-<utc-date>.md` (creating it if absent).
5. Append a journal line to `<receipt-root>/memory-prune.jsonl`:
   ```json
   {"op_id":"memory-prune:<utc-iso>","action":"prune","source_path":"<file>","dest_path":"<root>/archive/prune-<utc-date>.md","source_sha256":"<hex>","source_blob_sha":"<git-blob-sha>","dest_sha256":"<hex>","ts":"<utc-iso>"}
   ```
6. Write a canonical receipt at `<receipt-root>/memory-prune-<utc-iso>.yml` conforming to `docs/protocol/receipt-schema.md`:
   - `operation_id = sha256_hex("memory-prune\n-")` (pure-command form — no command-subject extension; Q#10 parked).
   - `idempotency_key = sha256_hex("memory-prune\n-\n<input-content-digest>")` (content-derived, NO timestamp).
   - `status: success` only after the rename succeeds for every candidate.

## Rollback

Every `--apply` invocation logs a `source_blob_sha` per affected file BEFORE the rewrite. Within the local `gc.pruneExpire` window (default 2 weeks):

```bash
# Restore a single file byte-for-byte:
BLOB_SHA=<from-journal-row>
SOURCE=<file-path-from-journal>
git cat-file -p "$BLOB_SHA" > "$SOURCE"
```

The skill never touches `feedback/<slug>.md` detail files — only the top-level `*.md` indexes (`FEEDBACK.md`, `REFERENCES.md`, etc.). Detail-file curation is a separate (currently manual) workflow.

## Surfaced by

`/session-start` and `/session-end` print a non-blocking warning when any top-level memory file exceeds its cap:

```bash
wc -c ~/.claude/memory/*.md 2>/dev/null | awk '$1 > 5120 || ($1 > 1024 && $2 ~ /USER\.md/) {print "  ⚠ " $2 " over cap (" $1 " bytes) — run /memory-prune"}'
```

The warning is informational only. It does not block session start/end.

## Test-only interruption hooks

- `MEMORY_PRUNE_TEST_FAIL_AFTER_BACKUP=1` — exit non-zero after writing the `.new` file and emitting the journal-rollback-blob, BEFORE the atomic rename. Lets fixtures verify the receipt records `partial` status when the trap fires.
- `EMIT_RECEIPT_TEST_PIN_TIMESTAMP=<iso-string>` — pin started_at / completed_at for fixture determinism (inherited from `emit-receipt.sh`).

## See also

- `docs/specs/2026-05-13-memory-system-redesign.md` (Phase 2; Task 4)
- `skills/_shared/lib/emit-receipt.sh` (canonical receipt helper)
- `feedback_gitignore_blocks_in_repo_receipts` (allowlist receipt + journal in caller's `.gitignore`)
- `feedback_skill_help_branch_invariant` (handle `--help` before side effects)
