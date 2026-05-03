# Fixture harness-status-missing-repo — repo path not on disk does not break scan

**Skill under test:** `/harness-status`
**Driver:** `skills/planning-loop/lib/test-fixtures/wave2-fixtures.sh` (function `fx_harness_status_missing_repo`)
**Asserts:** repo with `path` not on disk annotated `(repo path missing on disk: <path>)`; scan continues; status: partial

## Contract

Set up a registry with two entries:
1. A real (`git init`'d) sandbox path.
2. A path that does NOT exist on disk (e.g., `/tmp/no-such-repo-<unique>`).

Run scan.sh.

**Pass conditions:**
- Exit code 0.
- Summary `.md` includes a per-repo block for repo #2 containing the literal `(repo path missing on disk: /tmp/no-such-repo-<unique>)`.
- Repo #1's block lists its branch / working-tree status.
- Receipt status is `partial` (mix of reachable + missing).
- Receipt's `inputs` include the registry path; the missing repo's `docs/plan.md` would be `MISSING` in the per-repo input digest because the path doesn't exist.
