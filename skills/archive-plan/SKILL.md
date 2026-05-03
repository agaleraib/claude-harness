---
name: archive-plan
description: Compact the `## Recently Shipped` section of `docs/plan.md` by removing rows older than `keep_last` (default 3). Idempotent (re-running with the same plan.md content hits Stage A no-op via `idempotency_key`). Verifies each archived row's linked `docs/waves/wave<N>-<slug>.md` exists before any mutation; aborts on missing wave file. `--dry-run` flag (or `ARCHIVE_PLAN_DRY_RUN=1`) prints the would-be diff and writes a `partial`-status receipt without mutating plan.md. Use periodically to keep the active board's recent-history horizon bounded; the docs/waves/ archive remains canonical for any wave whose row has been removed.
argument-hint: "[--dry-run] [--keep-last <N>]"
---

# Archive plan — compact `## Recently Shipped` rows

Mutates `docs/plan.md` only. Idempotent. Sources `skills/_shared/lib/emit-receipt.sh` for §3.0a reserve-then-mutate lifecycle. Atomic temp+rename for the plan.md write so kill-mid-run leaves the file byte-identical.

## What it does

1. Reads `docs/plan.md` from the invoking repo.
2. Inspects `## Recently Shipped`. If it has more than `keep_last` (default 3) one-line `[x]` rows, selects the oldest `(count - keep_last)` for removal.
3. For each row marked for removal, parses out the linked `docs/waves/wave<N>-<slug>.md` path. If the file does NOT exist on disk, **aborts the entire run with `aborted-on-ambiguity`** before any plan.md mutation. The wave archive file is canonical for any wave whose row is being removed; removing a row when its wave file is missing would destroy the only durable trace of that wave.
4. Removes the row entirely from `docs/plan.md` (no stub, no cross-reference, no placeholder is left behind). The `docs/waves/wave<N>-<slug>.md` file's frontmatter is the durable record.
5. Writes the new plan.md atomically: write `docs/plan.md.tmp`, fsync optional, then `mv -f docs/plan.md.tmp docs/plan.md`.
6. Emits a §4.2 receipt at `.harness-state/archive-plan-<ISO-8601-Z-ts>.yml` via `skills/_shared/lib/emit-receipt.sh`.

After `/archive-plan` runs cleanly, `## Recently Shipped` contains exactly `keep_last` (default 3) one-line `[x]` rows; everything older has been removed.

`/archive-plan` does NOT author wave summaries — those land at close-wave time. The corresponding `docs/waves/<wave-file>.md` archives are read (to verify existence) but never written by this skill.

## Inputs

- `docs/plan.md` (required; read + write target)
- Each `docs/waves/wave<N>-<slug>.md` referenced by rows being archived (read-only verify; their content digest goes into `idempotency_key` so a wave-file edit invalidates the prior key)

## Flags

- `--dry-run` (or `ARCHIVE_PLAN_DRY_RUN=1` env var): print the would-be unified diff to stdout and write a `partial`-status receipt; make NO plan.md mutation. plan.md is byte-identical pre/post (`git diff docs/plan.md` empty; `sha256sum` equal).
- `--keep-last <N>`: override the default `keep_last=3`. Configurability via `.harness-profile.archive_plan.keep_last` is tracked as Open Question #1 (deferred).

## Step 0: Source helper + parse args

```bash
HARNESS_REPO="$(git rev-parse --show-toplevel)"
source "$HARNESS_REPO/skills/_shared/lib/emit-receipt.sh"

DRY_RUN=0
KEEP_LAST=3
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --keep-last) shift; KEEP_LAST="$1" ;;
    *) echo "✗ unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done
[[ -n "${ARCHIVE_PLAN_DRY_RUN:-}" ]] && DRY_RUN=1
```

## Step 1: Pre-mutation verification — every linked wave file MUST exist

Read `## Recently Shipped` rows in document order (oldest at the bottom of the section, newest at the top — by convention `/close-wave` prepends new rows). Identify the oldest `(count - KEEP_LAST)` rows for removal. Parse the `docs/waves/wave<N>-<slug>.md` link from each. For every linked file: `test -f` it. If any row's link is missing OR the row is malformed (no `-> docs/waves/` link), **abort with `aborted-on-ambiguity`** before any mutation.

This is the load-bearing safety check: removing a plan.md row when its wave file is missing would destroy the only durable record of that wave.

## Step 2: Init helper + preflight

```bash
emit_receipt_init archive-plan "-" docs/plan.md "${WAVE_FILES[@]}"

PREFLIGHT="$(emit_receipt_preflight)"
case "$PREFLIGHT" in
  PROCEED)    emit_receipt_started ;;
  NOOP*)      echo "$PREFLIGHT" >&2
              echo "/archive-plan: nothing to do — plan.md already matches a prior success receipt." >&2
              exit 0 ;;
  *)          exit 2 ;;
esac
```

`wave_or_spec` is `-` because /archive-plan is not tied to a single wave or spec — it operates on a range. Per `docs/protocol/receipt-schema.md` §3.0, `operation_id = sha256_hex("archive-plan\n-")`. The `idempotency_key` includes the content digests of `docs/plan.md` AND each archived `docs/waves/wave<N>-<slug>.md` file in `inputs`, so a wave-file edit between runs invalidates the prior key (Stage A no longer matches; fresh work executes).

## Step 3: Compute new plan.md text in memory

Re-read `docs/plan.md`. Walk the `## Recently Shipped` section. Skip rows tagged for removal in Step 1. Keep all other content byte-identical. Write the result to `docs/plan.md.tmp` (in the same directory so `mv` is rename-only).

For dry-run mode (`--dry-run` / `ARCHIVE_PLAN_DRY_RUN=1`): instead of writing the temp file, generate `diff -u docs/plan.md <new-text>` and print to stdout. **Make NO plan.md mutation.** Write a `partial`-status receipt and exit 0.

## Step 4: Atomic rename

```bash
mv -f docs/plan.md.tmp docs/plan.md
```

If `mv` fails (rare; cross-filesystem rename, permissions), the temp file is left for inspection and the trap rewrites the receipt to `aborted-on-ambiguity`. plan.md is byte-identical to pre-run state under any failure mode (atomic-rename safety: temp+mv, never write-in-place).

## Step 5: Terminal receipt

```bash
VERIFICATION_YAML="    - cmd: \"git diff --stat docs/plan.md\"
      exit_code: 0
      summary: \"plan.md mutated; rows removed\""
emit_receipt_terminal success "$VERIFICATION_YAML" docs/plan.md
```

For dry-run:

```bash
VERIFICATION_YAML="    - cmd: \"git diff docs/plan.md\"
      exit_code: 0
      summary: \"dry-run preview only; no mutation\""
emit_receipt_terminal partial "$VERIFICATION_YAML"
```

For missing-wave-file abort (Step 1):

```bash
EMIT_RECEIPT__TRAP_CAUSE=aborted-on-ambiguity
exit 1
```

The trap rewrites the started receipt to `aborted-on-ambiguity` (Stage-B-resumable per schema). Exact field set in the §4.2 YAML follows the helper.

## Edge cases

- `## Recently Shipped` has ≤ `keep_last` entries → nothing to do; receipt is `success` with `outputs: []`. (Distinct from Stage A no-op, which short-circuits before the run starts when an identical-input prior `success` exists.)
- `## Recently Shipped` is missing entirely → abort with `aborted-on-ambiguity`; plan.md is malformed.
- Malformed row (no `-> docs/waves/` link) in the removal candidates → abort with `aborted-on-ambiguity`.
- `docs/plan.md` is missing → abort with `aborted-on-ambiguity`; clear stderr error.
- `docs/waves/` directory is missing → `mkdir -p docs/waves` (the wave files themselves come from `/close-wave`).
- `.harness-state/` unwritable → preflight aborts with non-zero exit; no receipt; no plan.md mutation.
- Concurrent invocation → emit-receipt's exclusive-create reservation lock + 60-min orphan rule from `skills/_shared/lib/emit-receipt.sh` handle the race.

## Receipt shape (§4.2)

| Field           | Value                                                                                                   |
|-----------------|---------------------------------------------------------------------------------------------------------|
| `command`       | `archive-plan`                                                                                          |
| `wave_id`       | `null`                                                                                                  |
| `spec_path`     | `null`                                                                                                  |
| `operation_id`  | `sha256_hex("archive-plan\n-")` per §3.0                                                                |
| `inputs`        | `[docs/plan.md, <each archived docs/waves/wave<N>-<slug>.md>]` (sorted by emit-receipt before hashing)  |
| `outputs`       | `[docs/plan.md]` on success; `[]` on no-op success or partial dry-run                                   |
| `verification.commands` | `[git diff --stat docs/plan.md]`                                                                |
| `status`        | `success` / `aborted-on-ambiguity` / `failed` / `partial` (dry-run)                                     |

## Manual fallback

Hand-edit `docs/plan.md` to remove rows from `## Recently Shipped` whose linked `docs/waves/wave<N>-<slug>.md` files exist. Hand-author `.harness-state/archive-plan-<ts>.yml` per `.harness-state/examples/wave2/manual-archive-plan-success.yml`. Recompute `idempotency_key` via `bash .harness-state/examples/wave2/recompute-wave2-keys.sh`. Stage explicit files; commit; push; `gh pr create --draft`.

## Verify

- Normal run on a 5-row `## Recently Shipped` with `keep_last=3` → 2 rows removed; receipt `status: success`; `git diff --name-only docs/plan.md` shows the file modified.
- Re-run on the same compacted plan.md → Stage A no-op (same `idempotency_key`; no new receipt file).
- Missing wave-file → `aborted-on-ambiguity` before any plan.md mutation; plan.md byte-identical pre/post.
- Dry-run → `partial` receipt; `git diff docs/plan.md` empty; `sha256sum docs/plan.md` equal pre/post.
- Atomic-rename safety: kill between temp-write and `mv` → `docs/plan.md` byte-identical pre-run; `docs/plan.md.tmp` may persist (cleanup on next run).

See `skills/planning-loop/lib/test-fixtures/archive-plan-*.md` for the full fixture suite (Wave 10 Task 7).

## Rules

1. **Mutation is `mv`, not write-in-place.** Always temp+mv.
2. **Pre-mutation verify ALL wave files exist.** A single missing file aborts the entire run before any plan.md write.
3. **Dry-run leaves zero side effects.** No plan.md write, no temp file, only stdout diff + `partial` receipt.
4. **Idempotent on identical input.** Stage A short-circuits; second run on same plan.md is a no-op via `idempotency_key`.
5. **Receipt is mandatory.** No bypass; every invocation emits one of `success` / `aborted-on-ambiguity` / `failed` / `partial` (dry-run only).
