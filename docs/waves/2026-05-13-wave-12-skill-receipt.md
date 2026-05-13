---
wave_number: 12
slug: memory-prune-skill
spec_path: docs/specs/2026-05-13-memory-system-redesign.md
canonical_receipt: emitted-at-runtime-per-apply
phase: 2-of-4
commit_boundary: skill-commit
---

# Wave 12 — Skill receipt (human-readable)

Companion to the migration receipt at `docs/waves/2026-05-13-wave-12-migration-receipt.md`. Records the second-commit deliverables: the `/memory-prune` skill and its session-start/end hooks.

## Shipped

| Artifact | Path |
|---|---|
| Skill metadata | `skills/memory-prune/SKILL.md` |
| Skill body | `skills/memory-prune/lib/prune.sh` |
| Receipt template | `skills/memory-prune/lib/receipt-template.yml` |
| Global symlink | `~/.claude/skills/memory-prune` → `skills/memory-prune/` |
| session-start hook | `skills/session-start/SKILL.md` Step 6b |
| session-end hook | `skills/session-end/SKILL.md` Step 9b |

## Verification (rerun by exit gate)

```bash
# 1. --help exits 0 before any side effect
bash skills/memory-prune/lib/prune.sh --help                          # PASS

# 2. dry-run against fixture mutates nothing + writes no receipt
PRUNE_FIXTURE=$(mktemp -d); mkdir -p "$PRUNE_FIXTURE/.harness-state"
yes "- old-feedback-line-with-pointer-to-vanished-topic-file" | head -200 > "$PRUNE_FIXTURE/FEEDBACK.md"
bash skills/memory-prune/lib/prune.sh --root "$PRUNE_FIXTURE" >/dev/null 2>&1
[ "$(wc -c < "$PRUNE_FIXTURE/FEEDBACK.md")" -gt 5120 ]                # PASS

# 3. --apply brings FEEDBACK.md ≤5KB + writes receipt + journal
bash skills/memory-prune/lib/prune.sh --root "$PRUNE_FIXTURE" --apply --receipt-root "$PRUNE_FIXTURE/.harness-state" >/dev/null 2>&1
[ "$(wc -c < "$PRUNE_FIXTURE/FEEDBACK.md")" -le 5120 ]                 # PASS
ls "$PRUNE_FIXTURE/.harness-state/memory-prune-"*.yml >/dev/null      # PASS

# 4. idempotency_key stable across re-runs with same input bytes
#    (sorted_inputs uses basename-only "memory-prune.input-digest:<sha>";
#    digest hashes only sha values, no paths — stable across fixtures)
```

All four verify clauses passed at Task 4 acceptance time (2026-05-13 dispatch).

## Behavior summary

| Mode | Mutates? | Emits receipt? | Emits journal? |
|---|---|---|---|
| `--help` | no | no | no |
| (dry-run, default) | no | no | no |
| `--apply` | yes | yes (`memory-prune-*.yml`) | yes (`memory-prune.jsonl`) |
| `--apply --no-receipt` (test-only) | yes | no | no |

## Receipt schema

Canonical receipt fields conform to `docs/protocol/receipt-schema.md`:

- `command: memory-prune`
- `operation_id` = `sha256_hex("memory-prune\n-")` (pure-command form)
- `idempotency_key.value` = `sha256_hex("memory-prune\n-\n<input-content-digest>")`, content-derived (NO timestamp)
- `inputs` = `["memory-prune.input-digest"]` (basename-only path; content = newline-joined `<basename>:<sha256>` lines for each over-cap file)
- `outputs` = `[<archive-dest>, <journal-path>]`

## Hook surface

`/session-start` Step 6b and `/session-end` Step 9b print a single-line warning per over-cap file:

```
### Memory-prune
  ⚠ /Users/.../FEEDBACK.md over cap (5238 bytes) — run /memory-prune
```

Never blocks. Silent when all files are under cap.

## Q#10 status

Per dispatcher: Q#10 (command-subject extension for `operation_id`) is **parked** and does NOT block Wave 12. The skill uses pure-command form: `sha256_hex("memory-prune\n-")`. If Q#10 lands later, the operation_id derivation can extend without breaking the existing schema (the second field defaults to `-` when no subject).
