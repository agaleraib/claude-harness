# Fixture archive-plan-idempotency — second invocation Stage A no-op

**Skill under test:** `/archive-plan`
**Driver:** `skills/planning-loop/lib/test-fixtures/wave2-fixtures.sh` (function `fx_archive_plan_idempotency`)
**Asserts:** Stage A no-op on second invocation; same idempotency_key

## Contract

Set up the 5-entry `## Recently Shipped` plan.md. Run archive.sh once (mutates to 3 entries). Capture: receipt path, idempotency_key.value, plan.md content. Run archive.sh AGAIN with the same `--keep-last`. Capture receipt count.

**Pass conditions:**
- First invocation: `status: success`, receipt written, plan.md mutated.
- Second invocation: Stage A no-op short-circuit — exits 0; the helper's `NOOP <existing_receipt>` line is printed to stderr.
- The number of `archive-plan-*.yml` files in `.harness-state/` after the second invocation is the SAME as after the first (no new file).
- Both invocations would compute the same `idempotency_key.value` (proven by the second's no-op behavior — the helper's Stage A check matched).

This is the load-bearing idempotency assertion: identical inputs → identical key → no-op via Stage A.
