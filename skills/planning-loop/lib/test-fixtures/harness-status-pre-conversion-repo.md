# Fixture harness-status-pre-conversion-repo — pre-v2 plan.md format does not break scan

**Skill under test:** `/harness-status`
**Driver:** `skills/planning-loop/lib/test-fixtures/wave2-fixtures.sh` (function `fx_harness_status_pre_conversion`)
**Asserts:** repo without `## Now` / `## Blocked` headings annotated as `(pre-v2 plan format; skipped)`; scan continues for other repos

## Contract

Set up a registry with two `git init`'d sandbox repos:
1. v2-shaped — `docs/plan.md` with `## Now` / `## Next` / `## Blocked` / `## Recently Shipped` headings.
2. pre-conversion — `docs/plan.md` exists but contains old `## Wave 1` accreting-log format (no v2 headings).

Run scan.sh.

**Pass conditions:**
- Exit code 0 (partial-pre-conversion runs are 0).
- Summary `.md` includes a per-repo block for repo #2 containing the literal `(pre-v2 plan format; skipped)`.
- Repo #1's block lists its `## Now` rows.
- Receipt status is `success` (not `partial`) — pre-conversion is a non-error path.
