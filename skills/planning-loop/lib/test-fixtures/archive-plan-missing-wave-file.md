# Fixture archive-plan-missing-wave-file — abort BEFORE any plan.md mutation

**Skill under test:** `/archive-plan`
**Driver:** `skills/planning-loop/lib/test-fixtures/wave2-fixtures.sh` (function `fx_archive_plan_missing_wave_file`)
**Asserts:** aborted-on-ambiguity; plan.md byte-identical pre/post

## Contract

Set up the 5-entry `## Recently Shipped` plan.md, but DO NOT create one of the linked `docs/waves/wave<N>-<slug>.md` files (e.g., create only 4 of the 5). Capture `sha256` of plan.md pre-run. Run archive.sh.

**Pass conditions:**
- Exit code != 0.
- A receipt with `status: aborted-on-ambiguity`.
- `docs/plan.md` is **byte-identical** to its pre-run state (`sha256` equal pre/post). NO mutation occurred.
- Stderr explicitly cites the missing wave file path.

This is the load-bearing safety check: a single missing wave-archive file aborts the entire run BEFORE any plan.md write. Removing a row when its canonical archive is missing would destroy the only durable trace of that wave.
