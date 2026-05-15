# Wave 13 — CLOSED

- **Closed:** 2026-05-13
- **Merge commit:** `cd59e10`
- **Reconcile commit:** `0922530`
- **Post-merge fixes:** `95f02e7` (Codex P1+3xP2 closure), `01fab42` (docs follow-up for fix), `be72bb5` (docs follow-up for row 5 in summary)
- **Pushed to origin:** yes (`09428b6..be72bb5`)
- **Deploy:** no deploy hook configured (.harness-profile deployment.targets: [none])
- **Summary doc:** `docs/waves/wave13-new-cowork-and-cross-surface.md`
- **Next wave opening:** `### Wave 14 - Memory system redesign — gobot pivot cascade` (separate-repo cascade in `~/workspace/gobot/`)
- **Open items carried forward:**
  - OQ#10 — formal amendment of `docs/protocol/receipt-schema.md` to add `command-subject` as 4th allowed second-field option (~30 LOC hygiene PR). Wave 13's `/new-cowork` implementation already encodes the extension; protocol-doc edit is a separate post-merge hygiene item. Spec default was option (a) — amend in Wave 11 — but Wave 11 closed without it. Still deferred after Wave 13.
- **Notes:**
  - Codex review (BG job `ba1ke7khj`) ran between `/run-wave 13` and `/close-wave 13` per `feedback_codex_review_between_run_and_close`. Caught 1 P1 (scaffold path escape via intermediate symlinks) + 3 P2 (rollback handle, two unchecked receipt return codes). All 4 closed in `95f02e7` before merge. 23/23 sandbox gate still passes post-fix; new symlink-escape regression now refuses with verbatim spec message. N=2 for the meta-tooling-3rd-gate value pattern.
  - `~/.claude/skills/new-cowork` symlink resolves cleanly post-worktree-removal — orchestrator wrote the symlink with the master-checkout path, not the worktree path, so no Step 5b re-point was needed. (Different from Wave 12 where the symlink had to be re-pointed.)
  - Worktree was locked when removal first attempted (`feedback_close_wave_runtime_gotchas`); resolved with `git worktree unlock` before `remove`.
  - 11e initially failed for `01fab42` because docs-only commits weren't in the §Shipped table; added a row and re-verified.
