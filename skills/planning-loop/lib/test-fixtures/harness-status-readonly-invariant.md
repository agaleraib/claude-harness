# Fixture harness-status-readonly-invariant — read-only across all scanned repos

**Skill under test:** `/harness-status`
**Driver:** `skills/planning-loop/lib/test-fixtures/wave2-fixtures.sh` (function `fx_harness_status_readonly`)
**Asserts:** no writes in any scanned repo (HEAD, .git/index, .git/HEAD all byte-identical)

## Contract

Build a registry pointing at 1-2 real (`git init`'d) sandbox repos created in `mktemp -d`. Capture pre-run state for each scanned repo:
- `git rev-parse HEAD`
- `sha256 .git/index`
- `sha256 .git/HEAD`
- `git --no-optional-locks status --porcelain` output

Run `HARNESS_REGISTRY_PATH=<fixture> bash skills/harness-status/lib/scan.sh`.

Capture post-run state for each scanned repo. Compare.

**Pass conditions:**
- Each scanned repo's `git rev-parse HEAD` is byte-identical pre/post.
- Each scanned repo's `sha256 .git/index` is byte-identical pre/post.
- Each scanned repo's `sha256 .git/HEAD` is byte-identical pre/post.
- Each scanned repo's `git status --porcelain` set is byte-identical pre/post.
- The only writes anywhere on disk are the invoking repo's `.harness-state/harness-status-<ts>.{md,json,yml}` files.

This is the load-bearing read-only assertion. The `.git/index` byte-equality catches `index.lock` acquisition + lstat refresh — failures `git status --porcelain` parity does NOT surface (per `feedback_git_status_not_read_only`). The `--no-optional-locks` / `GIT_OPTIONAL_LOCKS=0` flag in scan.sh is what enforces this.
