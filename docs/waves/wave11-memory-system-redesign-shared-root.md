---
wave_number: 11
slug: memory-system-redesign-shared-root
spec_path: docs/specs/2026-05-13-memory-system-redesign.md
merge_sha: 69dc82d
closed_at: 2026-05-13
---

# Wave 11 — Memory system redesign (shared root + AGENTS.md + CLAUDE.md + MEMORY.md trim)

**Worktree:** `.claude/worktrees/agent-aa0c06eb4c817dcff`
**Branch:** `worktree-agent-aa0c06eb4c817dcff`
**Wave-closing commit:** `f1f79f8`
**Spec:** `docs/specs/2026-05-13-memory-system-redesign.md` (committed sha `4bbafc1`)
**Tasks shipped:** 5 / 5

## §Shipped

| # | Commit | Task | Vertical | Description |
|---|---|---|---|---|
| 1 | f1f79f8 | Task 1 | skills + .harness-state + ~/.claude/memory | NEW `skills/shared-root-init/` + atomic init of `~/.claude/memory/` (USER/FEEDBACK/REFERENCES/PROJECTS + archive/ + feedback/) via staging-then-rename; canonical receipt written BEFORE rename; journal records every rename attempt incl. refusals. |
| 2 | f1f79f8 | Task 2 | ~/.claude/memory/PROJECTS.md + docs/waves/ | Seeded 5 repo rows (claude-harness, gobot, wordwideAI, second-brain, claude-bot); in-repo manifest at `docs/waves/2026-05-13-wave-11-projects-md-seed.md`. |
| 3 | f1f79f8 | Task 3 | AGENTS.md | `## Memory` section: 5 paragraphs covering shared root + 6 entities, caps, promotion convention, archive/, CONTEXT.md pointer. |
| 4 | f1f79f8 | Task 4 | CLAUDE.md | Per-cwd auto-memory paragraph: `~/.claude/projects/<encoded-cwd>/memory/MEMORY.md` + "promotion is manual" cross-reference to AGENTS.md. |
| 5 | f1f79f8 | Task 5 | per-cwd MEMORY.md + archive/ + receipts | Trim 29562 → 5106 bytes; archive full pre-trim copy at `~/.claude/memory/archive/index-2026-05-13.md`; pre-mutation byte-exact backup at git blob `049ea693`; rollback drill PASS; wave-closing commit. |

Wave 11 ships in a **single commit** (`f1f79f8`) on the worktree branch — all 5 tasks committed together per the all-or-nothing wave guarantee. The human merges via `/close-wave`.

## §Wave 11 Exit Gate Results

All 8 numbered checks ran inside the worktree against live state after the commit landed.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Shared root dir + 6 entities (`USER.md`, `FEEDBACK.md`, `REFERENCES.md`, `PROJECTS.md`, `archive/`, `feedback/`) | PASS | All 7 `test -d`/`test -f` succeed; sizes well under per-file caps |
| 2 | Canonical receipt present with `status: success` or `status: partial` | PASS | `.harness-state/shared-root-init-2026-05-13-memory-system-redesign-20260513T093431Z.yml` (status: success) + `…T093440Z.yml` (status: partial — test-only kill-after-staging audit, sandboxed HOME) |
| 3 | Journal records both `staging-built` AND `committed` lines | PASS | `.harness-state/shared-root-init.jsonl` contains 6 lines: 2 real (staging-built + committed under `~/.claude/`) + 4 sandbox-test (staging-built + 3 refused-on-partial-existing under `/var/folders/`) |
| 4 | Refuse-on-partial sandbox exits non-zero | PASS | `HOME=$PARTIAL bash skills/shared-root-init/lib/init.sh` returned `1`; `diff -r` emitted to stderr; journal line `action: refused-on-partial-existing` written |
| 5 | AGENTS.md `## Memory` section present | PASS | `grep -c '^## Memory'` = 1 |
| 6 | CLAUDE.md `per-cwd auto-memory` paragraph present | PASS | `grep -c 'per-cwd auto-memory'` = 1; `grep -c 'promotion is manual'` = 1 |
| 7 | Per-cwd `MEMORY.md` ≤ 5120 bytes | PASS | 5106 bytes (14 bytes under the cap) |
| 8 | No line in `~/.claude/memory/*.md` exceeds 150 chars | PASS | `awk 'length > 150' ~/.claude/memory/*.md` produced no output |

Plus per-task verify hooks ran independently and all PASSED (see §Shipped table commit + `docs/waves/2026-05-13-wave-11-receipt.md`).

## §Human-only TODOs

The synthetic spec stated "None identified. Wave 11 is fully scriptable." That matches my execution — every task ran headless. No human-only TODOs surfaced during the wave.

Optional follow-ups for the human at `/close-wave` time:

- Confirm whether the two canonical receipts (the real `20260513T093431Z` with `status: success` + the test `20260513T093440Z` with `status: partial`) should both stay in `.harness-state/`. My judgement: yes — the partial one is the durable audit-trail evidence that the kill-after-staging acceptance criterion was actually run. But this is the operator's call.
- Confirm whether `wordwideAI` was the right canonical `id` for that row given the `.harness-profile` reports `project.name=FinFlow`. I followed the spec's "5 known repos" list verbatim + the memory entry `project_repo_name_mismatch` ("canonical name is wordwideAI"). If the spec intent was `FinFlow`, the row needs a one-line edit before merge.

## §Open Questions — answered, deferred, or unchanged

- **Receipt durability.** The wave-closing commit stages the receipt + journal into the working tree, but they were written DURING Task 1 (before any commit). The receipt-before-mutate guarantee is honored on disk regardless of git state. **Answered: durability holds.**
- **Pre-trim backup blob retention.** The git blob `049ea693` is durable in the worktree's object store. If the worktree is deleted before the wave merges, the blob is lost. **Deferred to /close-wave:** ensure the merge ties the blob to a tracked ref (creating a commit that references it suffices — the wave-closing commit DOES reference the sha in the receipt's text but the blob itself isn't reachable from HEAD's tree). Recommend tagging the blob or adding a `.harness-state/wave11-memory-original.md` file containing the original bytes before merge, but the spec's clause (b) only requires the blob exists in the local object store + the journal records the sha, which currently holds.
- **`.gitignore` extension scope.** I added 3 whitelist patterns (`!shared-root-init-*.yml`, `!shared-root-init.jsonl`, `!wave11-memory-trim.jsonl`). Future shared-root-init runs (e.g. on a different machine) will produce additional `shared-root-init-*.yml` files which the whitelist matches generically. **Answered: pattern is intentional and forward-compatible.**

## §KB upsert suggestions

Two facts worth a one-line MEMORY.md/feedback entry once Wave 11 merges:

1. **Shared user-global memory root convention** — `~/.claude/memory/` is now the canonical user-global location with 6 entities (`USER.md` / `FEEDBACK.md` / `REFERENCES.md` / `PROJECTS.md` / `archive/` / `feedback/`); promotion from per-tool auto-memory dirs is **move + frontmatter stamp**, never copy; `archive/` is never auto-loaded by any tool. Suggested entry: `reference_shared_memory_root.md`.

2. **`skills/shared-root-init/` location + atomic-rename pattern** — Reusable pattern for any future skill that must initialize a directory tree under a user-global path with a refuse-on-partial gate and durable pre-mutation receipt. Worth indexing as `reference_atomic_root_init_pattern.md` so the next memory-system-style task (e.g. a hypothetical `desktop-knowledge-init`) finds it.

## §Deviations from spec

1. **`.gitignore` extension was implicit-but-required.** The spec's Task 1 implementation sequence step 8 says `git add .harness-state/shared-root-init-...yml .harness-state/shared-root-init.jsonl` without mentioning that the repo's existing `.gitignore` excludes everything under `.harness-state/` except a small allowlist. I extended the allowlist to include `shared-root-init-*.yml`, `shared-root-init.jsonl`, and `wave11-memory-trim.jsonl`. Justification: the spec text repeatedly calls these "in-repo canonical receipt" and "in-repo journal" — they must be committable. No spec language was altered; only the gitignore allowlist grew.

2. **Two canonical receipts present, not one.** The kill-after-staging verify (Task 1 acceptance criterion line 135) writes its OWN canonical receipt with `status: partial` to `.harness-state/`. This is by design per the spec ("Verify by simulated kill: ... leaves the receipt with `status=partial` for resumption"). The exit gate's check 2 accepts either `status: success` or `status: partial` so both pass; the wave receipt explicitly documents this. **No spec deviation** — this is what the acceptance criterion required.

3. **MEMORY.md trim ratio is aggressive.** I cut MEMORY.md from 29562 → 5106 bytes (an 83% reduction). Many feedback/project entries were dropped from the live index but preserved in `~/.claude/memory/archive/index-2026-05-13.md`. The spec's acceptance criterion line 168-169 requires "≤5120 bytes" and "All entries pruned from MEMORY.md are accounted for: either the topic file still exists in the per-cwd dir (just dropped from index) or it's been moved to `~/.claude/memory/archive/`." Both conditions hold — the topic files themselves are untouched in the per-cwd dir; only the index pointers were dropped. **No deviation.**

4. **Two extra `shared-root-init.jsonl` entries** beyond the spec's literal expectation. The exit-gate runs the refuse-on-partial check live, which appends a journal line. Pre-commit re-stage captures this. Treat as audit-trail evidence not deviation.

5. **No symlinks touched cross-repo.** Spec explicitly anticipated this ("Wave 11 should not touch any cross-repo symlinks, but flag if found"). None found.

## §Baseline `wc -c` MEMORY.md

| Snapshot | bytes |
|---|---|
| Before any Wave 11 work (start-of-wave baseline) | **29562** |
| After Task 5 atomic rename (post-trim) | **5106** |
| Cap (per spec line 167 + exit gate check 7) | ≤5120 |
| Reduction | 24456 bytes (-82.7%) |
| Pre-trim copy preserved at | `~/.claude/memory/archive/index-2026-05-13.md` (30449 bytes incl. recovery header) |
| Byte-exact rollback handle | git blob `049ea6936536ee030f036b4887c21cb23953ef7e` (sha256 `9960471c54d36716ae528fbdae7931b807a3299bab5ca8f6754ac00d9e6a3672`) |

## §Cross-repo flags

None. No file committed in this wave is a symlink reaching outside the claude-harness repo. The `~/.claude/memory/` paths are user-global but they're not symlinks from within this repo — they're filesystem targets the in-repo skill writes to.

## §Routing log (dry-run summary)

Surface A log line per task plus per-task verify status. Full log at `.harness-state/orchestrator.log`; structured JSONL at `.harness-state/orchestrator.jsonl`.

| `task_id` | Would-be model | Would-be effort | Result |
|---|---|---|---|
| 2026-05-13-memory-system-redesign.md:Task 1 | opus-4.7 | xhigh | PASS |
| 2026-05-13-memory-system-redesign.md:Task 2 | sonnet-4.6 | medium | PASS |
| 2026-05-13-memory-system-redesign.md:Task 3 | sonnet-4.6 | medium | PASS |
| 2026-05-13-memory-system-redesign.md:Task 4 | haiku-4.5 | low | PASS |
| 2026-05-13-memory-system-redesign.md:Task 5 | opus-4.7 | xhigh | PASS |

Dry-run mode (no `model_routing: on` in `.harness-profile`): all tasks executed on the current session (Opus 4.7 / 1M-context). Surface B JSONL records `status: skipped` for the initial routing decision lines and `status: success` for the verify outcomes.
