# Fixture harness-status-disallowed-field — registry refuses unknown top-level fields

**Skill under test:** `/harness-status`
**Driver:** `skills/planning-loop/lib/test-fixtures/wave2-fixtures.sh` (function `fx_harness_status_disallowed_field`)
**Asserts:** registry entry with `quality_gate` field → failed receipt + error citing v2 §5 disallow list

## Contract

Set up a registry containing an entry like:

```yaml
projects:
  - id: bad-project
    path: /tmp/example/bad-project
    quality_gate: bunx tsc --noEmit
```

Run scan.sh.

**Pass conditions:**
- Exit code != 0.
- A receipt with `status: failed`.
- Stderr cites the disallowed field name `quality_gate` and references the v2 §5 disallow list.

This guards against drift where the registry slowly accretes per-repo configuration that should live in `.harness-profile`. The parser refusing unknown top-level fields is what keeps the registry path-only.
