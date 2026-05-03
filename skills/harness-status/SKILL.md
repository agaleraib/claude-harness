---
name: harness-status
description: Read-only cross-repo status scan driven by `~/.config/harness/projects.yml`. Aggregates `git status --porcelain` + `git worktree list --porcelain` + best-effort `docs/plan.md` parse + `.harness-profile` read across every registered repo, then writes a Markdown summary, JSON snapshot, and §4.2 receipt under the **invoking** repo's `.harness-state/`. Writes nothing in any scanned repo. Use when you want to see all your harness-managed projects' state at once without context-switching across worktrees.
argument-hint: "[--group <name>] [--id <name>]"
---

# Cross-repo status — read-only registry-driven scan

Walks the path-only registry at `~/.config/harness/projects.yml` (or the path in `HARNESS_REGISTRY_PATH`), runs read-only git commands per registered repo, and emits a single human-readable Markdown summary plus a JSON snapshot plus a §4.2 receipt under the **invoking** repo's `.harness-state/`.

**Read-only contract.** No `git commit`, no `git stash`, no edits to any tracked file in any scanned repo. The skill writes ONLY to the invoking repo's `.harness-state/harness-status-<timestamp>.{md,json,yml}`. Verified by Task 7's `harness-status-readonly-invariant.md` fixture (`git rev-parse HEAD` and `sha256` of `.git/index` and `.git/HEAD` byte-identical pre/post on every scanned repo).

## When to use

- Morning: see which repos have dirty trees / active worktrees / stale `## Now` rows before picking the day's work.
- After a multi-day break: re-derive context across the harness portfolio without opening each repo by hand.
- Before a `/run-wave` or `/close-wave`: confirm no orthogonal work is mid-flight in the target repo.

## Bootstrapping the registry

The registry is a **path-only** YAML file living **per-user, per-machine** at `~/.config/harness/projects.yml` by default. It is NOT checked into any repo. Override the location for fixtures and CI runs via the `HARNESS_REGISTRY_PATH` environment variable.

**Allowed top-level fields** (per v2 §5):

| Field   | Type     | Required | Description                                                       |
|---------|----------|----------|-------------------------------------------------------------------|
| `id`    | string   | yes      | Stable kebab-case project ID, unique within the file              |
| `path`  | string   | yes      | Absolute filesystem path to the repo root                         |
| `group` | string   | no       | Free-form grouping (e.g., `harness`, `product`, `infra`)          |

**Disallowed fields** (per v2 §5 disallow list, enforced by the parser): `main_branch`, `plan_path`, `waves_path`, `quality_gate`, `tracker_team`, `deploy_command`, `protected_paths`, and anything else that belongs in a per-repo `.harness-profile`. Drift toward a second `.harness-profile` is the failure mode the disallow list prevents — registry stays an index, not configuration.

**Example** (matches `skills/harness-status/lib/test-fixtures/example-projects.yml`):

```yaml
projects:
  - id: claude-harness
    path: /Users/klorian/workspace/claude-harness
    group: harness
  - id: wordwideAI
    path: /Users/klorian/workspace/wordwideAI
    group: product
  - id: gobot
    path: /Users/klorian/workspace/gobot
    group: infra
```

**Manual bootstrap (one-time per machine, NOT a wave gate)**:

```bash
mkdir -p ~/.config/harness && $EDITOR ~/.config/harness/projects.yml
```

Copy the example shape above and edit `path` entries to match local checkouts. The wave's exit gate does NOT check `~/.config/harness/projects.yml` — repo-artifact reproducibility on every machine is preserved by the example fixture under the test tree.

**Override location**:

```bash
HARNESS_REGISTRY_PATH=skills/harness-status/lib/test-fixtures/example-projects.yml /harness-status
```

This is the path fixtures use so receipt input digests are reproducible across machines.

**Missing-registry behavior**: if the resolved path does not exist when `/harness-status` runs, the skill prints a friendly stderr message (`registry not found at <path>; create it per skills/harness-status/SKILL.md §Bootstrapping the registry`) and exits 0 with a "no projects registered" summary. Missing registry is a non-error path — not a failure.

**Auto-registration is parked**: per Open Question #2, `setup-harness` and `/project-init` do NOT auto-append the new repo to `~/.config/harness/projects.yml`. Manual bootstrap stays the path until a second repo onboards under the v2 protocol.

## Inputs

The full skill body (per-repo scan walk, output format, §4.2 receipt emission, Stage A no-op exemption, pre-conversion repo handling) is documented in Task 5 deliverables. This file's `## Bootstrapping the registry` subsection is Task 4's repo-artifact deliverable.
