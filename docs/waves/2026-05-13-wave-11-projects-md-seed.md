# Wave 11 Task 2 — PROJECTS.md seed manifest

**Source spec:** `docs/specs/2026-05-13-memory-system-redesign.md` Task 2
**Wave:** 11
**Generated:** 2026-05-13
**Target file (off-repo):** `~/.claude/memory/PROJECTS.md`

This file is the in-repo audit trail for the rows seeded into `~/.claude/memory/PROJECTS.md`.
The target file is off-repo (user-global), so this manifest records exactly which rows were
appended so a future operator can verify or replay the seed.

## Row source extraction

For each row, `id`, `path`, `kind`, `opened_at`, `status` were derived as follows:

| Column | Source |
|---|---|
| `id` | directory name under `~/workspace/` |
| `path` | `~/workspace/<id>` |
| `area` | empty (repos default; cowork projects fill from path) |
| `title` | directory name (operator may rename later) |
| `kind` | `repo` (all 5 are git repos under `~/workspace/`) |
| `opened_at` | `project.created` from each repo's `.harness-profile`; today (2026-05-13) if `.harness-profile` is missing |
| `closes_at` | empty (ongoing repos) |
| `status` | `active` |

## Seeded rows (5 total)

| id | path | area | title | kind | opened_at | closes_at | status | profile_source |
|---|---|---|---|---|---|---|---|---|
| claude-harness | ~/workspace/claude-harness |  | claude-harness | repo | 2026-04-11 |  | active | .harness-profile present (seeded by Task 1 init) |
| gobot | ~/workspace/gobot |  | gobot | repo | 2026-04-15 |  | active | .harness-profile present |
| wordwideAI | ~/workspace/wordwideAI |  | wordwideAI | repo | 2026-04-11 |  | active | .harness-profile present (project.name=FinFlow legacy; canonical id is wordwideAI per memory `project_repo_name_mismatch`) |
| second-brain | ~/workspace/second-brain |  | second-brain | repo | 2026-04-26 |  | active | .harness-profile present |
| claude-bot | ~/workspace/claude-bot |  | claude-bot | repo | 2026-05-13 |  | active | no .harness-profile — opened_at defaulted to today |

## Verification

```bash
grep -c '^| claude-harness ' ~/.claude/memory/PROJECTS.md   # = 1
grep -c '^| ' ~/.claude/memory/PROJECTS.md                  # = 6 (header + 5 repo rows)
wc -c ~/.claude/memory/PROJECTS.md                          # ≤ 4096 bytes
awk 'length > 150' ~/.claude/memory/PROJECTS.md             # no output (all ≤150 chars)
```

## Notes

- `claude-bot` lacks a `.harness-profile`. Per spec: "(or today if missing)". `opened_at = 2026-05-13`.
- `wordwideAI` was previously named `finflow-deck` (renamed to `wordwideAI` per memory entry
  `project_repo_name_mismatch`). The `.harness-profile.project.name` still reports the legacy
  `FinFlow`. Canonical `id` in PROJECTS.md is `wordwideAI` (matches directory name and the spec's
  list of "5 known repos").
- All rows are `kind=repo`. Cowork projects (`kind ∈ {project, domain, engagement}`) will be added
  by Phase 3's `/new-cowork` skill.
