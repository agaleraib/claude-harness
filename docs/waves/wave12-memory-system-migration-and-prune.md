---
wave_number: 12
slug: memory-system-migration-and-prune
spec_path: docs/specs/2026-05-13-memory-system-redesign.md
merge_sha: be8a393
closed_at: 2026-05-13
---

# Wave 12 — Memory system redesign: migration + /memory-prune skill

Synthetic spec: `/tmp/wave-12-20260513-104013.md` (dispatched 2026-05-13T10:40:13Z).

## §Shipped

| # | Commit | Title | Files |
|---|---|---|---|
| 1 | `dccc990` | feat(memory): wave 12 migration — promote 54 / archive 3 / keep 205 feedback files | `.gitignore`, `.harness-state/wave-migrate-2026-05-13-memory-system-redesign-2026-05-13T104637Z.yml`, `.harness-state/wave12-migration.jsonl`, `docs/specs/2026-05-13-memory-system-redesign-migration.md`, `docs/waves/2026-05-13-wave-12-migration-receipt.md` (5 files, +672) |
| 2 | `0aa7d2b` | feat(memory-prune): /memory-prune skill + session-start/end hooks | `skills/memory-prune/SKILL.md`, `skills/memory-prune/lib/prune.sh`, `skills/memory-prune/lib/receipt-template.yml`, `skills/session-start/SKILL.md`, `skills/session-end/SKILL.md`, `docs/waves/2026-05-13-wave-12-skill-receipt.md` (6 files, +589) |
| 3 | (this file) | docs(wave-12): summary | `docs/waves/wave12-memory-system-migration-and-prune.md` |

Worktree: `/Users/klorian/workspace/claude-harness/.claude/worktrees/agent-aba308fc3ccaacf0b`
Branch: `worktree-agent-aba308fc3ccaacf0b`

## §Wave 12 Exit Gate Results

Ran verbatim from synthetic spec §"Wave 12 Exit Gate" (with `260` substituted by runtime `262` in the file-count math).

| Gate | Check | Result | Evidence |
|---|---|---|---|
| 1a | `test -f docs/specs/2026-05-13-memory-system-redesign-migration.md` | PASS | 278-line manifest committed in `dccc990` |
| 1b | `grep -q '^# Discovered count: 262'` | PASS | Header line `# Discovered count: 262` present |
| 2 | All `~/.claude/memory/feedback/*.md` have `originCwd:` + `promotedAt: 2026-05-13` | PASS | 54/54 promoted files verified |
| 3 | `test -d ~/.claude/memory/archive` | PASS | Created by Wave 11; populated by Wave 12 (3 archive files + index-overflow file) |
| 4 | `skills/memory-prune/{SKILL.md,lib/prune.sh}` present + `lib/prune.sh` executable | PASS | mode 100755 |
| 5a | Dry-run rc=0 | PASS | Sub-shell exit 0 |
| 5b | Dry-run does NOT mutate fixture | PASS | size before=after (11200 bytes) |
| 6a | `--apply` rc=0 | PASS | Sub-shell exit 0 |
| 6b | After `--apply`, FEEDBACK.md ≤5120 | PASS | Final size 5096 bytes |
| 6c | `--apply` writes `memory-prune-*.yml` receipt | PASS | Receipt at `<fixture>/.harness-state/memory-prune-noop-2026-05-13TXXXX.yml` |
| 7 | `262 - non_keep == remaining` | PASS | `262 - 57 = 205 = remaining` ✓ |

## §Human-only TODOs

None. Wave is fully automated; operator review at /close-wave-12 time confirms classifier proposals are correct (byte-exact rollback available via journal + git blobs for ~14 days).

## §Open Questions

- **Q#10** — parked. Command-subject extension to `operation_id` (`sha256_hex("<command>\n<subject>")` instead of `sha256_hex("<command>\n-")`). Wave 12 uses pure-command form throughout. The receipt template at `skills/memory-prune/lib/receipt-template.yml` documents the current pure-command shape; if Q#10 lands later, the second field defaults to `-` and the upgrade is backward-compatible.
- **No new OQs surfaced.**

## §KB upsert suggestions

1. **`/memory-prune` skill location:**
   - `skills/memory-prune/SKILL.md` (worktree); symlinked to `~/.claude/skills/memory-prune`.
   - Dry-run by default; `--apply` mutates with temp-rename + byte-exact-backup + journal + canonical receipt.
   - `--help` handled BEFORE side effects (per `feedback_skill_help_branch_invariant`).

2. **memory-prune receipt schema:**
   - `command: memory-prune`
   - `operation_id = sha256_hex("memory-prune\n-")` (pure-command, Q#10 parked)
   - `idempotency_key.value = sha256_hex("memory-prune\n-\n<input-content-digest>")` (content-derived, NO timestamp)
   - `sorted_inputs[0] = "memory-prune.input-digest:<sha-of-newline-joined-basename:sha-lines>"` (path-stable across fixtures via cwd-into-tempdir trick)
   - Journal at `<receipt-root>/memory-prune.jsonl` records `{op_id, action, source_path, dest_path, source_sha256, source_blob_sha, dest_sha256, ts}` per affected file

3. **gitignore allowlist (per `feedback_gitignore_blocks_in_repo_receipts`):**
   - `!.harness-state/wave-migrate-*.yml`
   - `!.harness-state/wave12-migration.jsonl`
   - `!.harness-state/memory-prune-*.yml`
   - `!.harness-state/memory-prune.jsonl`

## §Deviations from spec

| # | What | Why |
|---|---|---|
| 1 | Manifest header says `# Discovered count: 262` (spec/dispatcher cited 260) | Runtime `find ~/.claude/projects -path '*/memory/feedback_*.md' -type f \| wc -l` returned 262. Per Task 1 verify "equals find ... \| wc -l", I followed runtime not the literal 260. Exit gate clause 7 also substitutes 262. The two extra files appeared between spec-write time (or dispatcher pre-flight) and Wave 12 execution (per-cwd auto-memory continued writing in the meantime). |
| 2 | `.gitignore` allowlist patterns added BEFORE Tasks (mandatory but not a spec task per `feedback_gitignore_blocks_in_repo_receipts`) | Pre-flight in the migration commit's diff. Without this, git silently skips `.harness-state/wave-migrate-*.yml`, `.harness-state/wave12-migration.jsonl`, `.harness-state/memory-prune-*.yml`, `.harness-state/memory-prune.jsonl` at commit time. |
| 3 | FEEDBACK.md index contains pointers to 33 of 54 promoted files (spec Task 3 verify says `≥ count of promote rows`) | 5KB hard cap + 150-byte-per-line cap forced greedy-fit: sort entries by description length DESC, append in order, stop when adding the next entry would exceed 5120 bytes. 21 entries dropped to `~/.claude/memory/archive/feedback-index-overflow-2026-05-13.md` per spec's "drop shortest-description entries until under cap" clause. The verify clause `≥ promote count` conflicts with the 5KB cap when 54 average-length entries would total ~8.4KB; the cap wins. Detail files at `~/.claude/memory/feedback/<slug>.md` are unaffected — only the index was constrained. |
| 4 | Entry trim in FEEDBACK.md uses ASCII `--` instead of em-dash `—` and ASCII `...` instead of `…` | The 150-byte cap is enforced by `awk length`, which counts bytes. Multibyte chars (em-dash = 3 bytes, ellipsis = 3 bytes) inflated byte length past the cap for ostensibly-short rows. Switched all separator/truncation chars to ASCII so byte length = char count. |
| 5 | Pre-existing `memory-prune-noop-2026-05-13T105843Z.yml` receipt removed before Task 5 commit | Stray artifact from first `--apply` test run (the test created a fixture under `mktemp` but at the point my receipt-emission was incomplete it bound to the real worktree `.harness-state/` instead of the fixture). The receipt pointed to a tmp dir that no longer existed; rm'd before commit to keep the skill commit clean. |

## §Migration tallies

**Total:** 262 source files (runtime `find`)

| Disposition | Count | % |
|---|---|---|
| promote | 54 | 20.6% |
| archive | 3 | 1.1% |
| keep | 205 | 78.2% |

### Cross-cwd breakdown

| Encoded cwd | promote | archive | keep | total |
|---|---|---|---|---|
| `-Users-klorian-services-global-proxy` | 1 | 0 | 23 | 24 |
| `-Users-klorian-workspace-claude-harness` | 49 | 2 | 7 | 58 |
| `-Users-klorian-workspace-gobot` | 3 | 1 | 137 | 141 |
| `-Users-klorian-workspace-wordwideAI` | 1 | 0 | 34 | 35 |
| `-Users-klorian-workspace-generate-trades` | 0 | 0 | 2 | 2 |
| `-Users-klorian-workspace-Marta-learning` | 0 | 0 | 2 | 2 |
| **Total** | **54** | **3** | **205** | **262** |

### Classifier rationale distribution (top fire-paths)

- **cross-cutting allowlist hit:** 47 promote rows
- **universal-keyword body match:** 7 promote rows
- **frontmatter `superseded:` field:** 1 archive row
- **resolved-marker (RESOLVED / superseded literal in body):** 2 archive rows
- **default-keep (no heuristic fired):** 205 keep rows

## §Blob retention status

Per dispatcher operator decision: blobs are NOT pinned upfront against `gc.pruneExpire`. Every `promote` and `archive` row in `.harness-state/wave12-migration.jsonl` has a `source_blob_sha` recorded BEFORE source-delete, written to the local git object store via `git hash-object -w`. Confirmed retention:

- Journal lines with `source_blob_sha`: **57** (54 promote + 3 archive)
- All 57 `git cat-file -e <sha>` checks pass at exit-gate time
- Default `gc.pruneExpire` window: **2 weeks** (begins 2026-05-13)

If `/close-wave-12` review surfaces wrong classifications, operator restores via:

```bash
BLOB_SHA=<from journal>
SOURCE=<source_path from journal>
DEST=<dest_path from journal>
git cat-file -p "$BLOB_SHA" > "$SOURCE"
rm "$DEST"
```

Within the 2-week window. After that, blobs may be GC'd unless pinned (e.g., `git update-ref refs/wave-12-rollback/<sha> <sha>`).

## Cross-repo flags

None. Wave 12 is fully scoped to claude-harness.

## Worktree

- Path: `/Users/klorian/workspace/claude-harness/.claude/worktrees/agent-aba308fc3ccaacf0b`
- Branch: `worktree-agent-aba308fc3ccaacf0b`
- Commits ahead of master: 2 (this summary commit will make it 3)
- Status: ready for `/close-wave 12`
