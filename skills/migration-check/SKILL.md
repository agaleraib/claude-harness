---
name: migration-check
description: Verify a database migration is reversible, concurrent-safe, and backfill-safe before running in production. Run in Test or Deploy phase whenever schema changes are in play.
argument-hint: "[path/to/migration-file]"
---

# Migration Check

Database migrations are the most common cause of production incidents. This skill walks through a migration file and verifies it's safe before it runs against production.

## Step 1: Locate the migration

If `$ARGUMENTS` provided, use that file. Otherwise, detect:

```bash
# Common patterns
find migrations/ prisma/migrations/ supabase/migrations/ db/migrate/ -type f -newer .harness-state/last_migration_check 2>/dev/null | head -5
```

If multiple migrations are pending, process the oldest first and loop.

## Step 2: Classify the change

Read the migration file and classify each statement:

| Statement | Risk | Notes |
|---|---|---|
| `CREATE TABLE` | Low | Safe, new table has no rows |
| `ADD COLUMN` (nullable, no default) | Low | Safe |
| `ADD COLUMN NOT NULL` + default | **Medium** | Safe in modern PG/MySQL, can be slow on large tables |
| `ADD COLUMN NOT NULL` without default | **HIGH** | Fails if table has rows; requires backfill strategy |
| `DROP COLUMN` | **HIGH** | Irreversible; ensure no code references it |
| `RENAME COLUMN` / `RENAME TABLE` | **HIGH** | Breaks any running code that uses the old name |
| `ALTER COLUMN TYPE` | **HIGH** | Often requires table rewrite, long locks |
| `CREATE INDEX` (non-concurrent) | **HIGH** | Blocks writes on large tables |
| `CREATE INDEX CONCURRENTLY` | Medium | Safer but can't be in a transaction |
| `DROP INDEX` | Medium | Fast but watch query plans |
| `CREATE/DROP CONSTRAINT` | Medium-High | Foreign keys can trigger validation scans |
| `UPDATE` / `DELETE` (bulk) | **HIGH** | Long locks, needs batching |
| `DROP TABLE` | **HIGH** | Irreversible |

## Step 3: Run the safety checks

For each change, verify:

### 3a. Reversibility

- [ ] A `down` / `rollback` migration exists or the framework auto-generates one
- [ ] For `DROP` operations, reversibility means "we have a backup" — document it
- [ ] For `RENAME` operations, the down migration restores the original name

### 3b. Concurrent-write safety

- [ ] No long table-level locks on hot tables during business hours
- [ ] `CREATE INDEX` uses `CONCURRENTLY` (PG) or `ONLINE` (MySQL) where available
- [ ] `ALTER COLUMN TYPE` avoided or batched via temp column + backfill + swap

### 3c. Backfill strategy (if NOT NULL or type change)

- [ ] Backfill script exists and batches updates (not a single `UPDATE`)
- [ ] Backfill tested on a copy of production data (or an equivalent-size staging table)
- [ ] For NOT NULL, a default is supplied OR a two-phase deploy is used (add nullable → backfill → set NOT NULL)

### 3d. Application compatibility

- [ ] Old application code can still read the new schema (for zero-downtime)
- [ ] New application code handles the old schema (during deploy window)
- [ ] If (3d) is false, this is a hard-downtime migration — schedule accordingly

### 3e. Foreign keys and constraints

- [ ] New FKs don't break existing orphaned rows (run a validation query first)
- [ ] `NOT VALID` trick used for PG FK additions on large tables (add as NOT VALID → validate later)

## Step 4: Dry-run against a copy

If possible, run the migration against a recent production snapshot or staging clone:

```bash
# Example: create a copy of staging DB, run migration, measure duration
# pg_dump --data-only production | psql migration-test
# psql migration-test -f migrations/20260411_add_user_preferences.sql
# time psql migration-test -f migrations/20260411_add_user_preferences.sql
```

Capture:
- Duration
- Any warnings
- Lock contention (check `pg_locks` during the run if you're paranoid)

If duration > 30 seconds on production-scale data, flag it.

## Step 5: Verify rollback works

Run the rollback/down migration on the same copy. If it succeeds and the schema is back to the pre-migration state, pass. If the down migration is missing or fails, **fail hard**.

## Step 6: Report

```
## Migration Check — [migration filename]

**Classification:** LOW | MEDIUM | HIGH risk
**Duration on test data:** [Nms]

### Safety checks
✅ Reversibility
✅ Concurrent-write safety
⚠️  Backfill — script exists but not tested at scale
✅ Application compatibility
✅ Foreign keys
✅ Rollback verified on copy

### Required actions before running in production
1. Test backfill script on production-sized data
2. Schedule a maintenance window if duration > 30s

### Recommended deploy sequence
[ordered steps specific to this migration]
```

## Step 7: Record the check

```bash
touch .harness-state/last_migration_check
```

Append to `.harness-state/migration-log.md`:
```markdown
- [YYYY-MM-DD HH:MM] Checked [filename] — [LOW|MEDIUM|HIGH], [passed|blocked] — notes: [...]
```

## Rules

1. **Never skip for prototypes with real data.** Even prototype DBs with real user data get the full check.
2. **Dry-run on a copy, not in prod.** Ever.
3. **If you can't roll back, you don't run it.** Full stop.
4. **HIGH risk migrations require a maintenance window OR a two-phase deploy.** No "I'll be quick."
5. **Two-phase deploys for NOT NULL adds:** phase 1 = add nullable + backfill + deploy, phase 2 = set NOT NULL + deploy. Never one-shot.
6. **Document the production run** — append to migration-log.md with actual duration after running.
