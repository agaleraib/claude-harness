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

- `~/.config/harness/projects.yml` (or the path in `HARNESS_REGISTRY_PATH`)
- For each registered repo (or filtered subset): `<path>/docs/plan.md` if present, `<path>/.harness-profile` if present
- Empty / missing inputs are tolerated per §"Pre-conversion repo handling" below

Note: git state (branch / worktree / `git status --porcelain` output) is deliberately NOT included in the receipt's input file set — see §"Stage A no-op exemption" below.

## Flags

- `--group <name>`: scan only registered repos whose `group` field matches `<name>`.
- `--id <name>`: scan only the registered repo whose `id` field matches `<name>` (exclusive with `--group`).
- (No `--watch` mode; per spec §Out of Scope, live-dashboards are out of scope. Read-only one-shot scan only.)

## What it does

1. Resolve registry path: `HARNESS_REGISTRY_PATH` if set, else `~/.config/harness/projects.yml`.
2. If the file does not exist → friendly stderr + write a "no projects registered" summary + receipt; exit 0.
3. Parse the registry (YAML). Refuse unknown top-level fields per v2 §5; duplicate `id` triggers `failed`; relative `path` triggers `failed`.
4. For each registered repo (subset filtered by `--group`/`--id`):
   - `cd $path && git --no-optional-locks status --porcelain && git --no-optional-locks worktree list --porcelain`. The `--no-optional-locks` (or `GIT_OPTIONAL_LOCKS=0`) flag suppresses the `.git/index` lstat refresh + `index.lock` acquisition that plain `git status` performs on a cold cache, which would otherwise falsify the hard read-only invariant below.
   - Read `$path/docs/plan.md` if present; parse `## Now` and `## Blocked` sections best-effort.
   - Read `$path/.harness-profile` if present.
   - Compose a per-repo Markdown block + JSON object.
5. Aggregate the per-repo blocks into `.harness-state/harness-status-<ISO-8601-Z-ts>.md` and `.harness-state/harness-status-<ts>.json` in the **invoking** repo only.
6. Emit a §4.2 receipt at `.harness-state/harness-status-<ts>.yml` via `skills/_shared/lib/emit-receipt.sh` with `idempotency_key.trace.stage_a_exempt: true` (per §"Stage A no-op exemption" below).

## Hard read-only invariants

Verified by Task 7's `harness-status-readonly-invariant.md` fixture:

- No `git commit` is executed in any scanned repo (`git rev-parse HEAD` byte-identical pre/post).
- No edits to `docs/plan.md`, `docs/specs/`, `docs/waves/`, `parking_lot.md`, source files, or `.harness-profile` in any scanned repo (`git --no-optional-locks status --porcelain` returns the same set pre/post).
- No new branches created in any scanned repo (`git branch --list` byte-identical pre/post).
- **No writes under each scanned repo's `.git/` directory** — verified by `sha256` of `.git/index` and `.git/HEAD` byte-identical pre/post for every scanned repo. This catches `index.lock` acquisition + lstat-refresh writes that `git status --porcelain` parity does NOT surface.
- The only writes anywhere on disk are the invoking repo's `.harness-state/harness-status-<ts>.{md,json,yml}`.

## Pre-conversion repo handling

A repo that has not adopted the v2 plan.md format must NOT fail the whole scan:

- Missing `$path/docs/plan.md` → block reports `(plan.md not found)`; scan continues.
- Plan.md without `## Now` / `## Blocked` headings → block reports `(pre-v2 plan format; skipped)`; scan continues.
- Malformed `.harness-profile` (YAML parse fails) → block reports `(harness-profile malformed; skipped)`; scan continues.
- Missing `$path` on disk → block reports `(repo path missing on disk: <path>)`; per-repo input digest records `MISSING` for that path's contributory inputs.

Exit code: 0 on partial-pre-conversion runs. Non-zero ONLY if the registry itself parses fail OR the invoking repo's `.harness-state/` is unwritable.

## Output format

Markdown summary structure:

```markdown
# Harness status — <ISO-8601 timestamp>

Registry: ~/.config/harness/projects.yml (3 projects, 2 groups)

## claude-harness (group: harness)
- path: /Users/klorian/workspace/claude-harness
- branch: master
- working tree: clean
- worktrees: 1 (master at /Users/klorian/workspace/claude-harness)
- ## Now (1 active):
  - Wave 10 - Plan registry maintenance — running
- ## Blocked: none
- last shipped: Wave 9 — Claude Code adapter alignment (a5c844b)

## wordwideAI (group: product)
- path: /Users/klorian/workspace/wordwideAI
- (pre-v2 plan format; skipped)

## gobot (group: infra)
- (repo path missing on disk: /tmp/example/gobot)

---
Total: 3 registered, 2 reachable, 1 missing
```

JSON snapshot has the same data as a structured object; no prose. Receipt YAML follows §4.2.

## Stage A no-op exemption

**`/harness-status` is exempt from §3.0a Stage A prior-success no-op reuse.** Each invocation rescans live state and writes a fresh receipt with a fresh `idempotency_key.value`, regardless of whether the receipt-input file set (registry + plan.md + .harness-profile contents) is unchanged since the last run.

Per `docs/protocol/receipt-schema.md` §"Stage A no-op exemption", every `/harness-status` receipt carries:

```yaml
idempotency_key:
  value: <sha256_hex(operation_id + "\n" + ISO-8601 timestamp + "\n" + sha256_hex(<resolved registry path contents or 'MISSING'>))>
  trace:
    ... (standard fields) ...
    stage_a_exempt: true
```

**Behavior consequences:**
- Two consecutive `/harness-status` runs with identical registry + plan.md + .harness-profile contents and identical git state produce **DIFFERENT** `idempotency_key.value` byte-for-byte (timestamp differs).
- A follow-up run after a git-state-only change (branch switch / worktree add / new uncommitted edit on a scanned repo) reflects that change in the second summary rather than short-circuiting.

This exemption is the documented opt-out for read-only freshness-probe commands. Mutating commands like `/archive-plan` continue to use Stage A unchanged.

## Receipt shape (§4.2)

| Field           | Value                                                                                                                              |
|-----------------|------------------------------------------------------------------------------------------------------------------------------------|
| `command`       | `harness-status`                                                                                                                   |
| `wave_id`       | `null`                                                                                                                             |
| `spec_path`     | `null`                                                                                                                             |
| `operation_id`  | `sha256_hex("harness-status\n-")` per §3.0                                                                                          |
| `inputs`        | `[<resolved registry path>, <each registered $path/docs/plan.md if present>, <each registered $path/.harness-profile if present>]` |
| `outputs`       | `[.harness-state/harness-status-<ts>.md, .harness-state/harness-status-<ts>.json]`                                                 |
| `verification.commands` | `[git status --porcelain, git worktree list --porcelain]` (run per scanned repo; aggregated)                              |
| `status`        | `success` / `partial` / `failed`                                                                                                   |
| `idempotency_key.trace.stage_a_exempt` | `true` (load-bearing — see Stage A exemption above)                                                          |

## Manual fallback

Enumerate `~/.config/harness/projects.yml` by hand. For each entry:

```bash
cd <path>
git --no-optional-locks status --porcelain
git --no-optional-locks worktree list --porcelain
test -f docs/plan.md && cat docs/plan.md   # best-effort
test -f .harness-profile && cat .harness-profile
```

Compose the Markdown summary by hand at `.harness-state/harness-status-<ts>.md` (one section per repo per the format above). Hand-author the §4.2 receipt YAML at `.harness-state/harness-status-<ts>.yml` using `.harness-state/examples/wave2/manual-harness-status-success.yml` as the template; populate `idempotency_key.trace.stage_a_exempt: true`. Stage explicit files; commit; push (the runtime scan itself is read-only and has no PR surface — `gh` only enters the picture for shipping the skill source code).

## Verify

Sample run with `HARNESS_REGISTRY_PATH=skills/harness-status/lib/test-fixtures/example-projects.yml` pointed at a 3-project fixture (1 v2 + 1 pre-conversion + 1 missing-on-disk) produces `.harness-state/harness-status-<ts>.{md,json,yml}` in invoking repo only. Pre-conversion block contains `(pre-v2 plan format; skipped)`. Missing block contains `(repo path missing on disk: <path>)`. Read-only assertion: `git rev-parse HEAD` and `sha256` of `.git/index` and `.git/HEAD` byte-identical pre/post on each scanned repo.

**Stage A exemption fixture (load-bearing):** two consecutive runs with frozen git state and unchanged inputs produce DIFFERENT `idempotency_key.value` byte-for-byte (NOT identical); both receipts carry `stage_a_exempt: true`; AND a follow-up run with a git-state-only change reflects that change in the second summary rather than short-circuiting.

See `skills/planning-loop/lib/test-fixtures/harness-status-*.md` for the full fixture suite (Wave 10 Task 7).

## Rules

1. **Read-only across registered repos.** No commits, no edits, no branch creation, no `.git/` writes (verified by sha256 of `.git/index` and `.git/HEAD` byte-equality).
2. **Writes only to the invoking repo's `.harness-state/`.** The Markdown summary, JSON snapshot, and §4.2 receipt are the three permitted artifacts.
3. **Pre-conversion repos do not break the scan.** Missing plan.md, pre-v2 format, malformed `.harness-profile`, missing path → annotate the per-repo block and continue.
4. **Stage A exemption is mandatory.** Every receipt carries `stage_a_exempt: true`; two consecutive runs with frozen state produce different `idempotency_key.value`.
5. **Receipt is mandatory.** No bypass; every invocation emits a `success` / `partial` / `failed` receipt.
6. **No `--watch` mode.** Live dashboards are out of scope (per spec §Out of Scope).
