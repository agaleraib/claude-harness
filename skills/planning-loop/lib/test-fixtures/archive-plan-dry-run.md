# Fixture archive-plan-dry-run — byte-identical plan.md + status: partial

**Skill under test:** `/archive-plan`
**Driver:** `skills/planning-loop/lib/test-fixtures/wave2-fixtures.sh` (function `fx_archive_plan_dry_run`)
**Asserts:** plan.md byte-identical pre/post, status:partial, diff printed to stdout
**Pair:** `archive-plan-normal-run.md` (asserts mutation + status:success)

## Contract

Set up the same 5-entry `## Recently Shipped` plan.md as `archive-plan-normal-run.md`. Capture `sha256` of plan.md pre-run. Run `bash skills/archive-plan/lib/archive.sh --plan <path> --dry-run`.

**Pass conditions:**
- Exit code 0.
- A receipt with `status: partial`.
- `docs/plan.md` is **byte-identical** to its pre-run state (`sha256` equal pre/post).
- The would-be unified diff was printed to stdout.
- NO mutation occurred under any dry-run path.

The `partial` status here reflects "preview only — no side effects applied," distinct from a `success` no-op.

Equivalent variant: `ARCHIVE_PLAN_DRY_RUN=1 bash skills/archive-plan/lib/archive.sh --plan <path>` (no `--dry-run` flag, env var only). The driver runs both code paths to assert equivalence.
