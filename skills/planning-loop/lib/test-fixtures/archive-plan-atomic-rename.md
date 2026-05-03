# Fixture archive-plan-atomic-rename — kill-mid-run leaves plan.md byte-identical

**Skill under test:** `/archive-plan`
**Driver:** `skills/planning-loop/lib/test-fixtures/wave2-fixtures.sh` (function `fx_archive_plan_atomic_rename`)
**Asserts:** atomic-rename safety — failed mv leaves plan.md byte-identical to pre-run state

## Contract

Set up the 5-entry plan.md. Capture `sha256` pre-run. Invoke archive.sh with `ARCHIVE_PLAN_TEST_FORCE_MV_FAIL=1` env var (test hook in archive.sh forces the rename to fail). Capture `sha256` post-run.

**Pass conditions:**
- Exit code != 0.
- `docs/plan.md` is **byte-identical** to its pre-run state (`sha256` equal pre/post). The temp file (.tmp) may or may not persist; the mandate is that the canonical `docs/plan.md` is never partially written.
- Trap-driven receipt rewrite: a receipt with `status: failed` (or `aborted-on-ambiguity` if the trap fired before the explicit cause was set).

Atomic-rename safety means: under any failure mode (kill, mv error, disk full mid-write of .tmp), `docs/plan.md` is never left in a partial state. The canonical file is only ever swapped in via `mv -f` after a complete write to the temp file.
