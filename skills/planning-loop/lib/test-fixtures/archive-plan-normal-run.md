# Fixture archive-plan-normal-run — mutation + status: success

**Skill under test:** `/archive-plan`
**Driver:** `skills/planning-loop/lib/test-fixtures/wave2-fixtures.sh` (function `fx_archive_plan_normal_run`)
**Asserts:** mutation occurred, status:success
**Pair:** `archive-plan-dry-run.md` (asserts byte-identical plan.md + status:partial)

## Contract

Set up an isolated git repo with a `docs/plan.md` containing 5 entries in `## Recently Shipped` and matching `docs/waves/wave<N>-<slug>.md` files for all 5. Run `bash skills/archive-plan/lib/archive.sh --plan <path/to/plan.md>` (default `keep_last=3`).

**Pass conditions:**
- Exit code 0.
- A receipt at `.harness-state/archive-plan-noop-<ts>.yml` with `status: success`.
- `docs/plan.md` was mutated: now has exactly 3 `[x]` entries in `## Recently Shipped` (the newest 3); 2 oldest rows removed.
- `git diff --name-only docs/plan.md` shows the file modified.
- Receipt has `command: archive-plan`, `operation_id` matching `sha256_hex("archive-plan\n-")`, `inputs` includes plan.md + the 2 archived `docs/waves/wave<N>-<slug>.md` files (sorted lex by emit-receipt), `outputs: [docs/plan.md]`, `verification.commands` includes `git diff --stat`.

This fixture is paired with `archive-plan-dry-run.md` (the F2 split contract): one asserts mutation + status:success; the other asserts byte-identical plan.md + status:partial. The two contracts MUST NOT be conflated.
