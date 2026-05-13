---
wave_number: 12
slug: memory-system-redesign-migration
spec_path: docs/specs/2026-05-13-memory-system-redesign.md
canonical_receipt: .harness-state/wave-migrate-2026-05-13-memory-system-redesign-2026-05-13T104637Z.yml
journal: .harness-state/wave12-migration.jsonl
phase: 2-of-4
---

# Wave 12 — Migration receipt (human-readable)

Companion to the canonical `.harness-state/wave-migrate-2026-05-13-memory-system-redesign-*.yml` receipt. Captures counts, per-cwd breakdown, and rollback procedure for the one-time backfill of `~/.claude/projects/*/memory/feedback_*.md` into `~/.claude/memory/`.

## Tallies

| Disposition | Count |
|---|---|
| promote | 54 |
| archive | 3 |
| keep | 205 |
| **Total** | **262** |

Discovered-count override: spec/dispatcher cited 260; runtime `find ~/.claude/projects -path '*/memory/feedback_*.md' -type f | wc -l` resolved to **262**. The manifest header records runtime value (262) per Task 1 verify clause.

## Per-cwd breakdown

| Encoded cwd | promote | archive | keep | total |
|---|---|---|---|---|
| `-Users-klorian-services-global-proxy` | 1 | 0 | 23 | 24 |
| `-Users-klorian-workspace-claude-harness` | 49 | 2 | 7 | 58 |
| `-Users-klorian-workspace-gobot` | 3 | 1 | 137 | 141 |
| `-Users-klorian-workspace-wordwideAI` | 1 | 0 | 34 | 35 |
| `-Users-klorian-workspace-generate-trades` | 0 | 0 | 2 | 2 |
| `-Users-klorian-workspace-Marta-learning` | 0 | 0 | 2 | 2 |
| **Total** | **54** | **3** | **205** | **262** |

## Rollback procedure

Each `promote` and `archive` row in `.harness-state/wave12-migration.jsonl` recorded a `source_blob_sha` from `git hash-object -w <source>` BEFORE `rm <source>`. Within the 2-week `gc.pruneExpire` window the original bytes can be restored byte-for-byte:

```bash
# Full rollback (all 57 non-keep rows):
jq -r 'select(.action == "promote" or .action == "archive") | "\(.source_blob_sha) \(.source_path) \(.dest_path)"' \
  .harness-state/wave12-migration.jsonl | while read blob src dest; do
    git cat-file -p "$blob" > "$src"
    rm "$dest"
done

# Per-file rollback (single mis-classified file):
BLOB_SHA=<from-journal-row>
SOURCE=<original-per-cwd-path-from-journal>
DEST=<shared-root-path-from-journal>
git cat-file -p "$BLOB_SHA" > "$SOURCE"
rm "$DEST"
```

Operator chose **not** to pin blobs upfront against `gc.pruneExpire`. Verification window: 2 weeks from 2026-05-13. If `/close-wave-12` finds wrong classifications, restore via journal within that window.

## Wave 11 lesson applied

Per `feedback_gitignore_blocks_in_repo_receipts.md`: the `.gitignore` allowlist patterns

```
!.harness-state/wave-migrate-*.yml
!.harness-state/wave12-migration.jsonl
!.harness-state/memory-prune-*.yml
!.harness-state/memory-prune.jsonl
```

were added BEFORE this task ran. Without that pre-edit, git would silently skip the receipt + journal files at commit time.

## Canonical receipt fields (cross-reference)

| Field | Value |
|---|---|
| `command` | `wave-migrate` |
| `operation_id` | `ddf52e25549c8246ed8684dc7cb1f495b0bb97e2061643a20904744817e1c14f` |
| `idempotency_key.value` | `7e0e452a3c24f3da7c5d22d8c019afc35a9cb9e0b65ae7a07cb4d89684d0a593` |
| `status` | `success` |

`idempotency_key` contains no timestamp (content-derived from sorted-inputs digest), satisfying spec Task 2 verify clause.
