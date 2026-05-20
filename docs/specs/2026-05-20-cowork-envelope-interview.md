# Cowork Envelope Interview — Sub-spec for Pivot §4.6

**Date:** 2026-05-20
**Owner:** cross-repo — claude-harness (skill + template + schema + bash wiring) + gobot (interview.ts probe library, no production-caller wiring)
**Wave:** 1 (claude-harness Wave 16 — coordinated with a gobot-side commit; cross-repo wave per `feedback_cross_repo_wave_dispatch`)
**Status:** draft — awaits operator approval + planning-loop pass

---

## Overview

The gobot pivot spec (`gobot/docs/specs/2026-05-11-pivot-to-workspace-as-context.md` §4.6, lines 265–356) names a mandatory onboarding interview that populates `_charter.md`'s `project_scope:` YAML frontmatter at scaffold time. That section is a complete design but was deferred from claude-harness Wave 13 (the `/new-cowork` bash MVP, commit `cd59e10`, 2026-05-13) and never picked up. As a result, the scope-enforcement plumbing shipped by gobot Wave 15 (Phase 2A, `134d6fa`, 2026-05-14) and Wave 16 (Phase 2B, `3268c26`, 2026-05-14) is dormant: `src/lib/scope-mcp-adapter.ts` reads `actor.projectScope.outlook_folders` and friends, but every live `_charter.md` carries an empty / missing envelope, so every cwd-tagged actor passes through with `projectScope = {}`.

This sub-spec implements §4.6 verbatim: it adds the YAML envelope block to `_charter.md.tmpl`, ships the interview that fills it, validates the result against a JSON schema, and updates `/new-cowork`'s bash body to invoke the interview between scaffold and write.

**This spec is deliberately scoped to claude-harness.** It does NOT add any production callers to `scopeMcpCall` (that wiring is a separate gobot wave). It does NOT backfill `_charter.md` for pre-existing cowork projects (`global/regulatory-radar`, `global/test`, `board-packs/hogg-capital`) — that's a manual operator pass after this ships.

---

## Prior Work

Builds on:
- [Pivot — Workspace-as-Context](../../../gobot/docs/specs/2026-05-11-pivot-to-workspace-as-context.md) §4.6 — verbatim source for the 8-question interview and the probe failure-class taxonomy.
- [Memory System Redesign](2026-05-13-memory-system-redesign.md) Wave 13 — shipped `/new-cowork` bash MVP at `skills/new-cowork/lib/new-cowork.sh` + templates dir.
- [Cowork Area-Level Context](2026-05-14-cowork-area-context.md) Wave 15 (closed 2026-05-17) — added `--area-context` flag, demonstrating the precedent for `/new-cowork` flags + per-file rollback.
- gobot Wave 15 (`134d6fa`) — shipped `scope-mcp-adapter.ts`, `project-context.ts`, `project-artifact-writer.ts`. The adapter reads `actor.projectScope.{outlook_folders, gmail_labels, things3_areas, things3_tags, knowledge_tags}` and denies on mismatch. **Zero production callers today.**
- gobot Wave 16 (`3268c26`) — shipped `cowork_projects` Supabase table + `buildActorFromCwd` + 8 content-skill cascade.

Assumes:
- `/new-cowork` bash MVP is the only scaffold path (per pivot §4.6 paragraph 1).
- macOS-only host for Things3 probes (Q4 / Q4b skip on Linux per §4.6 edge cases).
- Supabase reachable at `10.1.10.233:5432` for Q5 / Q6 KB-tag and async-task-area probes; credentials resolved via `LXC201_PG_PASSWORD` env var, falling back to sourcing `~/workspace/gobot/.env` if present (degrades gracefully on connectivity failure per §4.6 — verified live 2026-05-20, 2151 rows in `knowledge_facts`).
- gobot CLI helpers (`himalaya`, `icalBuddy`, `osascript`) are PATH-resolvable on the operator's machine. Missing helpers → connectivity-class failure → empty option list, NOT hard fail.

Changes / extends prior:
- `_charter.md.tmpl` grows a YAML frontmatter block with 8 envelope arrays + 3 auto-seeded fields (`writable_paths`, `kind`, `reflection.cadence`).
- `/new-cowork` gains a `--scope-file <path>` non-interactive escape hatch (§4.6 edge cases) and an interactive interview between `_charter.md` template-fill and write.
- New `docs/schemas/project-charter.schema.json` validates the YAML frontmatter shape; invalid → hard fail with line-numbered diagnostic.
- Receipt schema (`docs/protocol/receipt-schema.md`) gains an `envelope_keys[]` field listing which arrays the operator populated (non-empty) so a future audit can resolve `scope_source: 'project:<id>'` to the structural shape of the envelope without leaking content.

---

## Data Model

### `_charter.md` frontmatter (post-spec)

```yaml
---
# Identity (auto-seeded)
id: email                                # <area>-<project> slug (collision check at scaffold time)
path: ~/cowork/tier1fx/email/
area: tier1fx
title: Tier1FX email operations          # title-cased <project>, operator overrides
kind: project                            # 'project' | 'domain' | 'engagement'
opened_at: 2026-05-20
closes_at: null                          # null for ongoing
status: active

# Project scope envelope (Q1–Q8 interview output)
project_scope:
  mailboxes: []                          # Q1 + Q2 — folders/labels bound to the account that owns them
                                         # Shape: [{ account_id: <str>, provider: 'outlook'|'gmail',
                                         #           outlook_folders: [<str>], gmail_labels: [<str>] }]
                                         # Invariant: outlook_folders empty when provider=gmail and vice versa.
  calendar_ids: []                       # Q3
  things3_areas: []                      # Q4
  things3_tags: []                       # Q4b
  knowledge_tags: []                     # Q5
  async_task_areas: []                   # Q6
  allowed_specialists: [general]         # Q7 (default at least 'general')
  allowed_mcps: []                       # Q8

# Filesystem authority (auto-seeded)
writable_paths:
  - ~/cowork/tier1fx/email/**            # always; operator adds NAS paths etc.

# Reflection cadence (auto-seeded with default)
reflection:
  cadence: weekly                        # 'weekly' | 'monthly' | 'off'
---
```

Below the frontmatter the existing prose template (`## Identity`, `## Lifecycle`, `## Open questions`, `## Resolved decisions`, `## Notes`) is preserved verbatim. The YAML block is additive; it does NOT replace the `## Identity` / `## Lifecycle` prose sections (operators read prose; automation reads YAML).

### JSON Schema (`docs/schemas/project-charter.schema.json`)

Validates:
- `id`, `path`, `area`, `title`, `kind`, `opened_at`, `status` all required strings (with regex for slug/path).
- `kind` ∈ `{project, domain, engagement}`.
- `status` ∈ `{active, paused, closed}`.
- `closes_at`: ISO date or null.
- `project_scope`: object with all 8 envelope fields present (possibly empty arrays). All array fields contain strings, no duplicates within an array. **Exception:** `mailboxes` is an array of objects (see below), not strings.
- `mailboxes[*]`: object with required `{ account_id: string, provider: 'outlook'|'gmail', outlook_folders: string[], gmail_labels: string[] }`. Cross-field invariant: `provider == 'outlook'` ⇒ `gmail_labels: []`; `provider == 'gmail'` ⇒ `outlook_folders: []`. `account_id` unique within `mailboxes[]` (no duplicate accounts).
- `allowed_specialists`: subset of the live 6-enum (`general, research, content, finance, strategy, critic`) — fail closed if any unknown name; future specialists per Wave 18 require schema bump.
- `writable_paths`: non-empty array of glob strings.
- `reflection.cadence` ∈ `{weekly, monthly, off}`.
- `scope_probes`: object with `required` listing the ten canonical probe keys (`email_accounts`, `outlook_folders`, `gmail_labels`, `calendar_ids`, `things3_areas`, `things3_tags`, `knowledge_tags`, `async_task_areas`, `allowed_specialists`, `allowed_mcps`). Additional `mailboxes.<account_id>` keys ARE allowed (one per row in `project_scope.mailboxes`). The aggregate `_` key is EXPLICITLY FORBIDDEN — `propertyNames: { not: { const: "_" } }`. Each value is `{status: 'ok'|'unreachable'|'skipped', source: string, warning?: string}`.

### Companion schema (`docs/schemas/project-scope.schema.json`)

A second schema validates **only** the `project_scope:` sub-object — the shape consumed by `--scope-file <path>`. This is the same `project_scope` sub-schema referenced above, hoisted to a standalone file via `$ref`. Two schemas exist because:
- A `--scope-file` input is a scope-only YAML/JSON document (no identity fields like `id`, `path`, `area`).
- `project-charter.schema.json` validates the whole `_charter.md` frontmatter (identity + scope + filesystem + reflection).

Both schemas share the `project_scope` sub-shape via `$ref: "./project-scope.schema.json"` so the source of truth lives in one place.

Validator: pure-bash + `jq` + `yq` (no node runtime); see Task 5 for the implementation pattern.

---

## Behavior

### Interview shape — 8 question rounds

Verbatim from pivot §4.6 table (lines 273–286), reproduced here for legibility:

| # | Question | Source of options | Multi-select | Default | Goes into |
|---|---|---|---|---|---|
| 1 | Which email accounts may this project read? | `himalaya account list -o json` + Graph `/me` lookup | yes | none | `mailboxes[].account_id` (one row per selected account) |
| 2 | For each account chosen in Q1, which folders/labels? Asked once per account, sequentially after Q1. | Per-account: account-scoped Graph client `graphClientFor(account_id).get("/mailFolders")` (Outlook accounts) or `gmailClientFor(account_id).listLabels()` (Gmail accounts). **No `/me/` paths** — clients are constructed per `account_id`. | yes | `Inbox` only | `mailboxes[i].outlook_folders` or `mailboxes[i].gmail_labels` — bound to the Q1 account that owns the folder/label |
| 3 | Which calendars may this project read? | Per-account: `graphClientFor(account_id).get("/calendars")` for each Outlook account from Q1, plus `icalBuddy calendars` for the local macOS calendars (the latter is single-identity by definition — local OS calendars). | yes | none | `calendar_ids[]` |
| 4 | Which Things3 areas? *(create-if-missing branch on case-insensitive name match against `<area>` arg)* | `python3 -c 'import things, json; print(json.dumps(things.areas(), default=str))'` | yes | none | `things3_areas[]` |
| 4b | Which Things3 tags? *(implicit-by-area-prefix pre-selection: tags equal to `<area>` or beginning with `<area>-` / `<area>:` / `<area>_` are pre-ticked)* | `python3 -c 'import things, json; print(json.dumps([t["title"] for t in things.tags()], default=str))'` | yes | implicit-by-prefix | `things3_tags[]` |
| 5 | Which KB tags? Filters both `knowledge_facts.tags` AND `knowledge_entries.tags`. Same implicit-by-area-prefix as 4b. | `SELECT DISTINCT unnest(tags) FROM (... UNION ALL ...) ORDER BY 1` against gobot Supabase | yes | implicit-by-prefix | `knowledge_tags[]` |
| 6 | Which `async_tasks.metadata.area` values? | `SELECT DISTINCT metadata->>'area' FROM async_tasks WHERE metadata->>'area' IS NOT NULL` | yes | none | `async_task_areas[]` |
| 7 | Which specialists beyond `general`? | Static list: `general, research, content, finance, strategy, critic` (bumped at Wave 18 if registry grows) | yes | `general` only | `allowed_specialists[]` |
| 8 | Which gobot MCPs may this project invoke? | Static list from `skills/new-cowork/templates/mcp-allowlist-options.json` (operator regenerates) | yes | none | `allowed_mcps[]` |

### Probe failure-class taxonomy (§4.6 verbatim)

Two distinct failure modes — operator-facing behavior MUST differ between them:

1. **Connectivity / availability failure** — Outlook offline, Supabase unreachable, things3 unavailable on Linux, himalaya unconfigured. Wrap the I/O surface (spawn / HTTP / SQL) in try/catch. On failure: log warning, present an empty option list, operator skips with `[]` (a legitimate operator deny). The interview itself succeeds; operator re-runs `/cowork-scope-edit` (Wave 17) once the source is back.

2. **Programmer error in the probe** — missing `import json`, wrong attribute name on a dict, wrong interpreter path, schema drift in the probe SQL. Do NOT swallow with try/catch. Print stderr + the failing snippet, exit non-zero, abort the entire scaffold. Rationale: a silently-degraded probe looks identical in the audit trail to "operator said no" — destroying the §4.6 rationale for making the interview mandatory in the first place.

**Enforcement at probe-write time:** every probe wrapping the I/O in try/catch MUST also include a one-line shape assertion immediately after the spawn returns (e.g. `assert isinstance(parsed, list) and all(isinstance(x, dict) and 'title' in x for x in parsed)`). The assertion is uncaught — it bubbles up as a programmer error. This converts a connectivity-class failure into a programmer-class failure if the probe shape drifts.

### Per-probe status persistence (audit-trail disambiguation)

**Problem:** a degraded probe (e.g. Outlook unreachable) and an explicit operator "deny all" answer both produce `outlook_folders: []`. A later audit cannot distinguish "the operator said no" from "we never asked because Graph was down."

**Resolution:** every probe records its status in the receipt AND in the charter frontmatter under a non-content metadata block. Two surfaces:

1. **`_charter.md` frontmatter — new `scope_probes:` block (sibling of `project_scope:`):**
   ```yaml
   scope_probes:
     # Ten canonical keys — schema-required, regardless of branch (interview or scope-file)
     email_accounts:   { status: ok, source: 'himalaya+graph' }
     outlook_folders:  { status: unreachable, source: 'graph', warning: 'ECONNREFUSED' }
     gmail_labels:     { status: ok, source: 'gmail-api' }
     calendar_ids:     { status: ok, source: 'graph+icalBuddy' }
     things3_areas:    { status: skipped, source: 'platform!=darwin' }
     things3_tags:     { status: skipped, source: 'platform!=darwin' }
     knowledge_tags:   { status: unreachable, source: 'lxc201', warning: 'PGPASSWORD not in env and ~/workspace/gobot/.env missing' }
     async_task_areas: { status: unreachable, source: 'lxc201', warning: 'same as knowledge_tags' }
     allowed_specialists: { status: ok, source: 'static-enum' }
     allowed_mcps:     { status: ok, source: 'mcp-allowlist-options.json' }
     # Per-account mailbox rows — added at interview time, one per row in project_scope.mailboxes
     # Keyed `mailboxes.<account_id>`. NOT present in the template (which predates any interview).
     # account_id MUST be a slug shape (no `@` or `.`) so jq/yq path access works without quoting,
     # e.g. `acct-outlook-001`, NOT `alice@tier1fx.com`. The mailboxes[] entry pairs slug ↔ email.
     mailboxes.acct-outlook-001: { status: ok, source: 'graph' }
     mailboxes.acct-gmail-002:   { status: ok, source: 'gmail-api' }
   ```
   `status` ∈ `{ok, unreachable, skipped}`. `source` is a short identifier of the data source. `warning` is present only when `status != ok`. The aggregate `_` key is FORBIDDEN by the schema (`propertyNames: { not: { const: "_" } }`) — every envelope field gets its own per-probe record, including the `--scope-file` path.

2. **Receipt — `audit.scope_probes[]`** mirrors the same per-probe records. See Task 6 receipt-schema delta.

**Operator gate on unreachable mandatory probes.** When `--scope-file` is NOT used and any of the mandatory probes (Q1, Q2, Q3) returns `status: unreachable`, the interview surfaces a final confirmation prompt: *"<probe-name> was unreachable so options are empty. Continue with empty <field>? (yes / abort / save-as-scope-file)"*. Choosing `abort` exits non-zero and removes the partial scaffold (per Task 4 rollback). Choosing `save-as-scope-file` writes the partial envelope to `~/.harness-state/incomplete-scopes/<area>-<project>.yml` for later reuse via `--scope-file` and exits non-zero. Choosing `yes` proceeds and the receipt + charter both carry the `unreachable` status — audit can see deny-all-by-operator (`status: ok` + empty array) vs deny-by-degraded-probe (`status: unreachable` + empty array).

Optional probes (Q4, Q4b, Q5, Q6, Q7, Q8) do not surface the confirmation — they record the status silently and continue. Operator re-runs `/cowork-scope-edit` (Wave 17) once the source is back.

### Implicit-by-area-prefix matcher (Q4b + Q5)

Tag string `t` is pre-selected iff `lower(t) == lower(area)` OR `lower(t)` matches one of `lower(area) + '-'`, `lower(area) + ':'`, `lower(area) + '_'` as a prefix. Pre-selection is rendered in the AskUserQuestion as `[x]`; operator can deselect.

### Create-if-missing on Q4

If `things.areas()` returns no entry whose `title` case-insensitively equals `<area>`, surface a follow-up AskUserQuestion: *"Things3 area `<Area>` doesn't exist. Create it now?"* with options `Yes (create + auto-select)` / `No (skip — leave empty)`. On yes: `osascript -e 'tell application "Things3" to make new area with properties {name:"<Area>"}'`, refresh the area list, auto-select the new entry. On Linux/Windows runners, skip Q4 + Q4b entirely with `things3_areas: []` and `things3_tags: []`.

### Non-interactive mode (`--scope-file <path>`)

If `--scope-file <path>` is passed:
- Load `<path>` as YAML or JSON (yq auto-detects).
- Validate against `project-scope.schema.json` (scope-only schema — NOT the full charter schema).
- Skip ALL interview rounds; substitute the loaded scope block into the charter template under `project_scope:`.
- Fail fast on missing keys, unknown keys, type mismatches with a `--scope-file <path>:<line>: <jq pointer> <message>` diagnostic.

**Scope-file shape (matches `project-scope.schema.json`):**
```yaml
# project_scope: key is OPTIONAL at top level — the file may be the bare scope block.
# Both forms accepted by Task 4 wrapper:
#
# Form A (bare scope, recommended for fixtures):
mailboxes: []
calendar_ids: []
things3_areas: []
things3_tags: []
knowledge_tags: []
async_task_areas: []
allowed_specialists: [general]
allowed_mcps: []
#
# Form B (nested under project_scope:):
# project_scope:
#   mailboxes: []
#   ...
```

Wrapper logic (Task 4): if top-level `project_scope:` key exists, extract `.project_scope`; else treat the whole file as the scope block. Either way, validate the extracted block against `project-scope.schema.json` and write to `_charter.md` frontmatter under the `project_scope:` key.

A full `_charter.md` file is NOT accepted as `--scope-file` (use `--charter-file` if/when that hatch ships — currently out of scope). This prevents accidental id/area/path drift between the scope file's identity fields and the CLI args.

Use cases: CI fixtures, operator-authored envelope file for reproducible scaffolds, post-mortem reconstruction.

### Edge cases (§4.6 verbatim)

- **No mailboxes configured** (fresh laptop): Q1 prints `"no accounts found — install himalaya / configure Outlook first; rerun /new-cowork after"`. Skill continues with `mailboxes: []` (and `scope_probes.email_accounts.status: unreachable`); operator re-runs `/cowork-scope-edit` once mailboxes exist. The unreachable-mandatory-probe gate (§Per-probe status persistence) surfaces an explicit confirmation so the empty envelope isn't mistaken for an operator deny.
- **Supabase unreachable** at interview time: Q5 + Q6 fall back to deny-all with a warning; scaffold completes.
- **Operator picks an account that exists in himalaya but has no recent reads:** still listed — we trust himalaya config, not message history.
- **Skill invoked non-interactively** (e.g. from CI without `--scope-file`): exit with `"interactive shell required for scope interview; pass --scope-file <path> to import a pre-built envelope"`.

---

## Trust Boundaries

What the envelope gates **after this wave ships** (limited):

- Every `_charter.md` produced by `/new-cowork` post-merge carries a non-trivial envelope, signed by operator answers.
- Pre-existing `_charter.md` files (today: `tier1fx/email` only — the global/* projects have no charter at all) keep their current shape until operator runs `/cowork-scope-edit` (Wave 17).
- Audit log entries with `scope_source: 'project:<id>'` resolve to a real envelope shape, not `{}`.
- The gobot `scope-mcp-adapter` reads the new `mailboxes[]` shape (or its derived flat projection) — so when future enforcement wiring lands, the adapter and the on-disk envelope agree on shape from day one (Task 6a).

What the envelope does **NOT** gate after this wave:

- **MCP calls.** `scopeMcpCall` still has zero production callers. Wiring it into every MCP entry point (knowledge, outlook, gmail, things3, calendar, ...) is a separate gobot wave.
- **Specialist dispatch.** `allowed_specialists` is recorded but not yet checked by `agent_workflows.createChild`. Separate gobot wave.
- **Existing `tier1fx/email` cowork project.** Charter exists, has no envelope. Operator hand-edits OR runs `/cowork-scope-edit` (Wave 17) once it ships.

This wave is **necessary but not sufficient** for end-to-end scope enforcement. It closes the data-shape half; the call-site enforcement half is separate.

---

## Implementation

One claude-harness wave. Six tasks. All file paths absolute under `/Users/klorian/workspace/claude-harness/`.

### Task 1 — `_charter.md.tmpl` envelope skeleton

**Done when:** the template emits a parseable YAML frontmatter block with `project_scope:` (8 envelope fields, the 8th being `allowed_mcps`) + `scope_probes:` (the ten canonical probe-status records: `email_accounts`, `outlook_folders`, `gmail_labels`, `calendar_ids`, `things3_areas`, `things3_tags`, `knowledge_tags`, `async_task_areas`, `allowed_specialists`, `allowed_mcps` — all defaulting to `{ status: skipped, source: 'template' }`; `mailboxes.<account_id>` rows are NOT in the template since the template predates any interview run) + 3 auto-seeded identity fields populated from `{{AREA}}` / `{{PROJECT}}` / `{{TODAY}}` placeholders, and the existing prose body unchanged.

**Next concrete action:** edit `skills/new-cowork/templates/_charter.md.tmpl` — add the YAML frontmatter block above the existing `# _charter.md — {{PROJECT}}` heading.

**Verify:** after `sed 's/{{AREA}}/foo/g; s/{{PROJECT}}/bar/g; s/{{TODAY}}/2026-05-20/g' skills/new-cowork/templates/_charter.md.tmpl | yq --front-matter=extract`, the extracted YAML has keys `project_scope`, `scope_probes`, `writable_paths`, `reflection`; `project_scope | keys` returns the 8 expected envelope keys; `scope_probes | keys` returns the 10 canonical probe keys (matches the schema's `required` list); `scope_probes | has("_")` returns `false`.

**Manual fallback:** with git+editor+gh only:
1. `git switch -c wave16-task1-charter-template`.
2. Open `skills/new-cowork/templates/_charter.md.tmpl` in your editor.
3. Insert the YAML frontmatter block (copy the YAML from §"Data Model" above between the `---` fences) immediately above the existing `# _charter.md — {{PROJECT}}` heading.
4. Save. Manually substitute placeholders into a scratch file: `sed 's/{{AREA}}/foo/g; s/{{PROJECT}}/bar/g; s/{{TODAY}}/2026-05-20/g' skills/new-cowork/templates/_charter.md.tmpl > /tmp/charter-check.md`.
5. Inspect `/tmp/charter-check.md` visually — confirm YAML between `---` fences parses (paste into any online YAML linter if `yq` unavailable).
6. `git add skills/new-cowork/templates/_charter.md.tmpl && git commit -m "wave16(task1): add envelope skeleton to _charter template"`.
7. `git push -u origin wave16-task1-charter-template && gh pr create --title "wave16 T1: charter envelope skeleton" --body "Implements docs/specs/2026-05-20-cowork-envelope-interview.md Task 1"`.

### Task 2 — JSON Schemas + validator helpers (charter + scope)

**Done when:**
- `docs/schemas/project-scope.schema.json` exists — validates the bare scope sub-object (8 fields, mailbox shape, allowed_specialists enum).
- `docs/schemas/project-charter.schema.json` exists — validates the full charter frontmatter and `$ref`s into the scope schema for the `project_scope:` block.
- `skills/new-cowork/lib/validate-charter.sh` and `skills/new-cowork/lib/validate-scope.sh` exist (bash + `jq` + `yq` only, or `npx ajv-cli@5` fallback) and each exits non-zero with a `<path>:<line>: <jq-pointer>: <message>` diagnostic on invalid input.
- Fixtures land under `skills/new-cowork/fixtures/`: `empty-envelope.yml` (valid scope-only, all arrays `[]`, default specialist), `valid-envelope.yml` (valid scope-only, two mailboxes — one outlook + one gmail), `invalid-mailbox-cross-provider.yml` (gmail provider with non-empty `outlook_folders` — must fail), `invalid-full-charter-as-scope.yml` (a full charter passed where a scope-file is expected — must fail), `invalid-unknown-specialist.yml` (unknown name in `allowed_specialists` — must fail), `invalid-charter-aggregate-probes.md` (a synthetic `_charter.md` whose `scope_probes` contains only `{_: {status: skipped, source: scope-file}}` — must fail per the new charter-schema rule that forbids `_` and requires the ten canonical keys, Finding 2 regression guard).

**Next concrete action:** write both schemas with `$schema: "https://json-schema.org/draft/2020-12/schema"`. Charter schema references `./project-scope.schema.json` via `$ref` for the `project_scope` field. Validator pattern:
```bash
# validate-scope.sh — for --scope-file inputs
input_json=$(yq -o=json "$1")
# Strip optional top-level project_scope: wrapper before validation
scope_json=$(echo "$input_json" | jq 'if has("project_scope") then .project_scope else . end')
echo "$scope_json" | npx ajv-cli@5 validate -s docs/schemas/project-scope.schema.json --strict=false 2>/tmp/ajv-err \
  || { sed "s|^|$1:|" /tmp/ajv-err >&2; exit 1; }
```
Charter validator extracts frontmatter via `yq --front-matter=extract -o=json` and validates against `project-charter.schema.json`. If pure-jq validation proves too fragile across edge cases, `ajv-cli` (npm — `npx ajv-cli@5 validate ...`) is the documented fallback; the schema header comment names which path the validator uses.

**Verify:**
- `bash skills/new-cowork/lib/validate-charter.sh ~/cowork/tier1fx/email/_charter.md` exits non-zero (existing charter has no envelope — sanity check the validator catches the missing case).
- `bash skills/new-cowork/lib/validate-scope.sh skills/new-cowork/fixtures/empty-envelope.yml` exits 0.
- `bash skills/new-cowork/lib/validate-scope.sh skills/new-cowork/fixtures/valid-envelope.yml` exits 0.
- `bash skills/new-cowork/lib/validate-scope.sh skills/new-cowork/fixtures/invalid-mailbox-cross-provider.yml` exits non-zero with a diagnostic naming `mailboxes[N].gmail_labels` or `provider` constraint.
- `bash skills/new-cowork/lib/validate-scope.sh skills/new-cowork/fixtures/invalid-full-charter-as-scope.yml` exits non-zero with a diagnostic naming the unexpected `id` / `path` / `area` keys (additionalProperties: false on the scope schema).
- `bash skills/new-cowork/lib/validate-scope.sh skills/new-cowork/fixtures/invalid-unknown-specialist.yml` exits non-zero naming the enum violation.
- `bash skills/new-cowork/lib/validate-charter.sh skills/new-cowork/fixtures/invalid-charter-aggregate-probes.md` exits non-zero with a diagnostic naming either the forbidden `_` key OR the missing canonical `scope_probes` keys — proves the schema rejects the round-1 aggregate-marker regression (Finding 2).

**Manual fallback:** with git+editor+gh only:
1. `git switch -c wave16-task2-schemas`.
2. `mkdir -p docs/schemas skills/new-cowork/fixtures`.
3. Open `docs/schemas/project-scope.schema.json` in editor — write the JSON Schema for the 8-field scope object with `additionalProperties: false`, `mailboxes` items with provider-conditional constraints (use JSON Schema `if`/`then`/`else` to enforce: when `provider == "gmail"`, `outlook_folders` must be `maxItems: 0`).
4. Open `docs/schemas/project-charter.schema.json` — write the full-charter schema; reference the scope schema via `"$ref": "./project-scope.schema.json"` for the `project_scope` property.
5. Open `skills/new-cowork/lib/validate-scope.sh` — paste the validator pattern shown above; `chmod +x` it.
6. Open `skills/new-cowork/lib/validate-charter.sh` — copy the scope validator pattern, adapt to extract frontmatter via `yq --front-matter=extract -o=json`.
7. Write the 6 fixture files under `skills/new-cowork/fixtures/` (hand-author YAML/Markdown matching the shapes named in the Verify list above):
   - `skills/new-cowork/fixtures/empty-envelope.yml`
   - `skills/new-cowork/fixtures/valid-envelope.yml`
   - `skills/new-cowork/fixtures/invalid-mailbox-cross-provider.yml`
   - `skills/new-cowork/fixtures/invalid-full-charter-as-scope.yml`
   - `skills/new-cowork/fixtures/invalid-unknown-specialist.yml`
   - `skills/new-cowork/fixtures/invalid-charter-aggregate-probes.md`
8. Manual verify: run each `bash skills/new-cowork/lib/validate-scope.sh skills/new-cowork/fixtures/<file>.yml` (and `validate-charter.sh` for the `.md` fixture) and confirm exit codes match the Verify list. Inspect diagnostic strings on the invalid fixtures by reading stderr.
9. If `npx ajv-cli@5` is not available locally, install once: `npm install -g ajv-cli@5`.
10. Stage ONLY the explicit files this task creates (no `git add` on directories — that risks sweeping generated files, local scratch, or unrelated cruft per the repo's explicit-staging rule):
    ```bash
    git add \
      docs/schemas/project-scope.schema.json \
      docs/schemas/project-charter.schema.json \
      skills/new-cowork/lib/validate-scope.sh \
      skills/new-cowork/lib/validate-charter.sh \
      skills/new-cowork/fixtures/empty-envelope.yml \
      skills/new-cowork/fixtures/valid-envelope.yml \
      skills/new-cowork/fixtures/invalid-mailbox-cross-provider.yml \
      skills/new-cowork/fixtures/invalid-full-charter-as-scope.yml \
      skills/new-cowork/fixtures/invalid-unknown-specialist.yml \
      skills/new-cowork/fixtures/invalid-charter-aggregate-probes.md
    git status   # confirm staged set matches the list above, nothing else
    git commit -m "wave16(task2): schemas + validators + fixtures"
    ```
11. `git push -u origin wave16-task2-schemas && gh pr create --title "wave16 T2: project-scope + project-charter schemas" --body "Implements docs/specs/2026-05-20-cowork-envelope-interview.md Task 2"`.

### Task 3 — Interview core (`cowork-interview.ts`, gobot-side)

**File target:** `~/workspace/gobot/scripts/cowork-interview.ts` (~300 LOC). Matches the precedent of `scripts/backfill-cron-cowork-project-id.ts` — `#!/usr/bin/env bun` shebang, header comment cross-referencing this spec, imports from `src/lib/*`. Invoked as `bun run scripts/cowork-interview.ts <area> <project> [--scope-file <path>]` from within the gobot repo cwd (the bash wrapper `cd`s into gobot before invoking).

**Done when:** `bun run scripts/cowork-interview.ts <area> <project>` runs the 8 question rounds, probes live systems with the failure-class taxonomy enforced via TypeScript types, and emits a single JSON object on stdout matching the `project_scope:` shape (consumed by claude-harness's bash wrapper in Task 4).

**Next concrete action:** write `scripts/cowork-interview.ts`. Import shape:
```typescript
import { getSupabase } from "../src/lib/supabase";
import { graphGet } from "../src/lib/email/graph-client";
import { listGmailLabels } from "../src/lib/email/gmail-client";
import { listOutlookFolders } from "../src/lib/email/outlook-folders";
import { listHimalayaAccounts } from "../src/lib/email/himalaya-runner";
import { spawnSync } from "node:child_process";
import { z } from "zod";  // schema validation; gobot already has zod (used by MCP servers)
```

**Per-probe pattern** (typed failure classes — every mailbox probe is account-bound):

> **Account-binding invariant (Finding 1, round 2).** Every probe that talks to a mailbox API MUST take `account_id: string` as its first parameter and MUST scope the underlying client to that account. Calling a mailbox probe without `account_id` is a TypeScript compile-time error. The string `/me/` does NOT appear in any probe path — use the account-scoped client constructor instead. This makes "folders offered under the wrong Graph identity" structurally impossible, not just discouraged.

```typescript
type ProbeResult<T> =
  | { ok: true; options: T[] }
  | { ok: false; reason: "unreachable"; message: string };  // connectivity-class → empty

// Programmer-class errors bubble up as throws — uncaught — abort the interview.

// Account-scoped client constructor — looks up tokens by account_id in gobot's
// existing token store; refuses to fall back to a default identity.
// (Concrete name lives in gobot/src/lib/email/graph-client.ts — adapt to whatever
//  the post-merge export is called, but the signature MUST require account_id.)
import { graphClientFor } from "../src/lib/email/graph-client";
import { gmailClientFor } from "../src/lib/email/gmail-client";

async function probeOutlookFolders(account_id: string): Promise<ProbeResult<string>> {
  try {
    const client = graphClientFor(account_id);   // explicit per-account scoping
    const raw = await client.get("/mailFolders"); // NOT '/me/mailFolders' — client is already scoped
    // Type the shape — TS catches drift at compile, runtime parse catches schema change
    const parsed = z.object({ value: z.array(z.object({ displayName: z.string() })) }).parse(raw);
    return { ok: true, options: parsed.value.map(f => f.displayName) };
  } catch (e) {
    if (e instanceof z.ZodError) throw e;  // programmer-class: response shape changed, abort
    return { ok: false, reason: "unreachable", message: String(e) };  // connectivity-class: empty + continue
  }
}

async function probeGmailLabels(account_id: string): Promise<ProbeResult<string>> {
  try {
    const client = gmailClientFor(account_id);    // explicit per-account scoping
    const raw = await client.listLabels();        // account-scoped, NOT global '/me/'
    const parsed = z.object({ labels: z.array(z.object({ name: z.string() })) }).parse(raw);
    return { ok: true, options: parsed.labels.map(l => l.name) };
  } catch (e) {
    if (e instanceof z.ZodError) throw e;
    return { ok: false, reason: "unreachable", message: String(e) };
  }
}
```

**TS-level enforcement.** `probeOutlookFolders` and `probeGmailLabels` are exported with mandatory positional `account_id: string` (NOT optional, NOT default). The `--noImplicitAny` + `strict: true` settings already in gobot's `tsconfig.json` make `probeOutlookFolders()` (no arg) a compile error. Task 5's test harness pins this: a `// @ts-expect-error` test case asserts that omitting `account_id` fails to typecheck. Reviewers grepping `git diff` for `/me/mailFolders` or `/me/labels` MUST find zero hits in the probe library.

**Interactive UI:** `@inquirer/prompts` (~3kB, already-transitively-depended via gobot's CLI tooling; verify at impl time with `bun pm ls | grep inquirer` — if absent, add to `package.json` as a single new dep). Pattern:
```typescript
import { checkbox } from "@inquirer/prompts";

const folders = await checkbox({
  message: "Q2a — Which Outlook folders may this project read?",
  choices: outlookResult.options.map(name => ({ name, value: name, checked: name === "Inbox" })),
});
```

**Implicit-by-prefix matcher** (Q4b + Q5):
```typescript
function prefixMatch(tag: string, area: string): boolean {
  const t = tag.toLowerCase(); const a = area.toLowerCase();
  return t === a || t.startsWith(`${a}-`) || t.startsWith(`${a}:`) || t.startsWith(`${a}_`);
}
```

**Probe execution ordering — Q1 BEFORE Q2 (account-bound folders/labels).** Q2's options are derived from the account selected in Q1, so per-account folder/label probes run sequentially AFTER Q1 closes. The remaining probes (Q3–Q8) are independent and run concurrently in a separate `Promise.all`. Pattern:
```typescript
// Phase 1: probe + ask Q1 (account selection)
const emailAccts = await probeEmailAccounts();   // himalaya + Graph
const chosenAccounts = await checkbox({ message: "Q1 — accounts...", choices: emailAccts.options });

// Phase 2: per-account folder/label probe — sequential per account, bound to account_id
const mailboxes: Array<{ account_id: string; provider: "outlook" | "gmail";
                         outlook_folders: string[]; gmail_labels: string[] }> = [];
const mailboxProbeStatuses: Record<string, ProbeStatus> = {};
for (const acct of chosenAccounts) {
  if (acct.provider === "outlook") {
    const probe = await probeOutlookFolders(acct.account_id);
    mailboxProbeStatuses[`mailboxes.${acct.account_id}`] = statusFromProbe(probe, "graph");
    const folders = probe.ok
      ? await checkbox({ message: `Q2 — ${acct.account_id}: Outlook folders?`,
                         choices: probe.options.map(n => ({ name: n, value: n, checked: n === "Inbox" })) })
      : await confirmEmptyOnUnreachable(`Q2 (${acct.account_id})`, probe);
    mailboxes.push({ account_id: acct.account_id, provider: "outlook",
                     outlook_folders: folders, gmail_labels: [] });
  } else {  // gmail
    const probe = await probeGmailLabels(acct.account_id);
    mailboxProbeStatuses[`mailboxes.${acct.account_id}`] = statusFromProbe(probe, "gmail-api");
    const labels = probe.ok
      ? await checkbox({ message: `Q2 — ${acct.account_id}: Gmail labels?`,
                         choices: probe.options.map(n => ({ name: n, value: n, checked: n === "INBOX" })) })
      : await confirmEmptyOnUnreachable(`Q2 (${acct.account_id})`, probe);
    mailboxes.push({ account_id: acct.account_id, provider: "gmail",
                     outlook_folders: [], gmail_labels: labels });
  }
}

// Phase 3: independent probes run concurrently (Q3–Q8)
const [calendars, things3Areas, things3Tags, kbTags, asyncAreas]
  = await Promise.all([probeCalendars(), probeThings3Areas(area),
                       probeThings3Tags(area), probeKbTags(area), probeAsyncTaskAreas()]);
```

The `probeOutlookFolders` and `probeGmailLabels` functions take the `account_id` as input so the Graph/Gmail call is scoped per-account (no folder/label leakage across accounts).

**`scope_probes` block construction:** for each probe (including per-account mailbox probes), record `{ status, source, warning? }` keyed by the envelope field name (or `mailboxes.<account_id>` for per-account records). Emitted alongside the `project_scope` block on stdout.

**Output:** single JSON object on stdout with shape `{ project_scope: <8-field block>, scope_probes: <per-probe statuses> }`. Bash wrapper (Task 4) parses + writes both into `_charter.md` frontmatter.

**Verify:**
- `bun run scripts/cowork-interview.ts --self-test` runs each probe in isolation against live services and prints `OK <probe>: <N options>` or `UNREACHABLE <probe>: <reason>` — no operator prompts; useful for `/close-wave` smoke. The mailbox probes in self-test mode loop over every himalaya-listed account and call the probe ONCE PER account_id.
- `bunx tsc --noEmit scripts/cowork-interview.ts` returns 0 errors.
- `bunx tsc --noEmit scripts/__tests__/cowork-interview.test.ts` includes at least one `// @ts-expect-error` test asserting `probeOutlookFolders()` and `probeGmailLabels()` (no args) fail to typecheck. Removing the `@ts-expect-error` MUST cause tsc to fail (proves the guard is live).
- `grep -nE "/me/(mailFolders|labels)" scripts/cowork-interview.ts` returns ZERO hits. The string `/me/` does not appear anywhere in the probe library; only account-scoped clients (`graphClientFor(account_id)`, `gmailClientFor(account_id)`) are used.

**Manual fallback:** with git+editor+gh only (in the gobot repo):
1. `cd ~/workspace/gobot && git switch -c wave16-task3-interview`.
2. Open `scripts/cowork-interview.ts` in editor — write the file using the structure shown above (probe functions with `ProbeResult<T>` union, per-account loop for Q2, `Promise.all` for Q3–Q8, JSON stdout output).
3. Add `@inquirer/prompts` to `package.json` if `bun pm ls | grep inquirer` shows it absent: edit `package.json` dependencies block by hand and add `"@inquirer/prompts": "^5.0.0"`; run `bun install`.
4. Add `--self-test` arg parsing (calls each probe once, prints status, exits).
5. Manual verify: `cd ~/workspace/gobot && bunx tsc --noEmit scripts/cowork-interview.ts` returns 0 errors; `bun run scripts/cowork-interview.ts --self-test` runs without throw on a healthy machine and prints `OK <probe>: <N>` for each.
6. `git add scripts/cowork-interview.ts package.json bun.lockb && git commit -m "wave16(task3): cowork-interview.ts — typed probes, per-account mailboxes"`.
7. `git push -u origin wave16-task3-interview && gh pr create --title "wave16 T3: cowork-interview.ts (gobot side)" --body "Implements docs/specs/2026-05-20-cowork-envelope-interview.md Task 3"`.

### Task 4 — Bash skill wiring + `--scope-file` flag + feature-flag-gated interview path

**Done when:** `skills/new-cowork/lib/new-cowork.sh` consumes `--scope-file <path>` (always works, no gobot dependency), AND invokes `bun run scripts/cowork-interview.ts` only when a probe confirms the gobot script is present at the pinned commit/version; refuses to proceed if the interview exits non-zero (programmer-class probe failure); rolls back the partial scaffold on any post-receipt-step failure; emits a clean, actionable error message in every degraded path (gobot absent, script absent, version mismatch, bun absent, non-interactive without scope-file).

**Mechanical cross-repo ordering safety (Finding 3 resolution).** The wrapper does NOT assume `scripts/cowork-interview.ts` exists in the gobot checkout. It probes for the file AND for a script-emitted version sentinel before invoking it. If the probe fails, the wrapper falls back to a clear error directing the operator to use `--scope-file` or check out a gobot commit that includes Task 3. The `--scope-file` path is fully functional regardless of gobot's state — it depends only on Task 1 + Task 2 (both in this PR). This guarantees: if the claude-harness PR merges before the gobot PR, `/new-cowork` still scaffolds via `--scope-file` (or fails fast with an actionable message), and never `die`s with a confusing "interview failed" stack trace mid-scaffold.

**Version sentinel pin.** `scripts/cowork-interview.ts` MUST print `cowork-interview vN` (where `N >= 1` matches the protocol version declared at the top of the TS file) when invoked with `--version`. Task 4 reads `MIN_INTERVIEW_VERSION=1` from `lib/new-cowork.sh` and compares; mismatch = fall back to scope-file-only path. This pins the cross-repo contract without depending on git commit hashes (which drift on rebase).

**Next concrete action:** edit `lib/new-cowork.sh`. Insertion point: between the `mkdir -p` scaffold step and the template substitution step. Pseudo:
```bash
GOBOT_REPO="${GOBOT_REPO:-$HOME/workspace/gobot}"
INTERVIEW_SCRIPT="$GOBOT_REPO/scripts/cowork-interview.ts"
MIN_INTERVIEW_VERSION=1
SCOPE_OUTPUT_JSON=""   # set below; consumed by yq substitution step

# Helper: probe the gobot side for interview availability + version.
interview_available() {
  [[ -d "$GOBOT_REPO" ]] || return 1
  [[ -f "$INTERVIEW_SCRIPT" ]] || return 1
  command -v bun >/dev/null || return 1
  local v
  v=$(cd "$GOBOT_REPO" && bun run scripts/cowork-interview.ts --version 2>/dev/null) || return 1
  [[ "$v" =~ ^cowork-interview\ v([0-9]+)$ ]] || return 1
  (( "${BASH_REMATCH[1]}" >= MIN_INTERVIEW_VERSION )) || return 1
  return 0
}

if [[ -n "$SCOPE_FILE" ]]; then
  bash skills/new-cowork/lib/validate-scope.sh "$SCOPE_FILE" || die "invalid --scope-file (see stderr above)"
  # Extract scope (handles bare-scope or nested-under-project_scope forms)
  SCOPE_OUTPUT_JSON=$(yq -o=json '. as $r | if has("project_scope") then .project_scope else $r end' "$SCOPE_FILE")
  # Per-probe persistence (Finding 2, round 2): emit ALL TEN canonical probe keys, each
  # tagged source=scope-file. The aggregate `_` marker is FORBIDDEN by the receipt schema
  # and exit-gate row 13 — auditors must see field-level provenance for every envelope field.
  # `mailboxes.*` rows are added per-account_id from the loaded scope file (one row each).
  PROBES_JSON=$(jq -n --argjson scope "$SCOPE_OUTPUT_JSON" '
    {
      email_accounts:   {status:"skipped", source:"scope-file"},
      outlook_folders:  {status:"skipped", source:"scope-file"},
      gmail_labels:     {status:"skipped", source:"scope-file"},
      calendar_ids:     {status:"skipped", source:"scope-file"},
      things3_areas:    {status:"skipped", source:"scope-file"},
      things3_tags:     {status:"skipped", source:"scope-file"},
      knowledge_tags:   {status:"skipped", source:"scope-file"},
      async_task_areas: {status:"skipped", source:"scope-file"},
      allowed_specialists: {status:"skipped", source:"scope-file"},
      allowed_mcps:     {status:"skipped", source:"scope-file"}
    } + (
      # Mailbox per-account markers — one per row in mailboxes[]
      ($scope.mailboxes // [])
      | map({ ("mailboxes." + .account_id): {status:"skipped", source:"scope-file"} })
      | add // {}
    )
  ')
elif [[ ! -t 0 ]]; then
  die "interactive shell required for scope interview; pass --scope-file <path> to import a pre-built envelope."
elif ! interview_available; then
  die "Interview path unavailable (gobot/$INTERVIEW_SCRIPT missing, bun missing, or version < $MIN_INTERVIEW_VERSION).
       Either: (a) check out a gobot commit containing scripts/cowork-interview.ts (Task 3),
               (b) pass --scope-file <path> with a pre-built envelope,
               (c) set GOBOT_REPO=<path> if your gobot checkout is non-standard."
else
  RAW=$(cd "$GOBOT_REPO" && bun run scripts/cowork-interview.ts "$AREA" "$PROJECT") \
    || die "interview failed (see stderr above) — partial scaffold rolled back."
  SCOPE_OUTPUT_JSON=$(echo "$RAW" | jq '.project_scope')
  PROBES_JSON=$(echo "$RAW"     | jq '.scope_probes')
fi

# Substitute into _charter.md template
yq --front-matter=process eval ".project_scope = $SCOPE_OUTPUT_JSON | .scope_probes = $PROBES_JSON" -i "$CHARTER_PATH"
bash skills/new-cowork/lib/validate-charter.sh "$CHARTER_PATH" || die "charter failed schema validation post-substitute (rolled back)."
```

`GOBOT_REPO` env var allows override (e.g. for operators with non-standard checkouts). Per-file rollback semantics from Wave 15 precedent: track each file written; on any post-interview failure, remove only files this invocation created. The `--scope-file` path NEVER invokes the gobot script — Task 4 ships fully usable even if Task 3 is unmerged.

**Verify:**
- `bash skills/new-cowork/lib/new-cowork.sh tier1fx test-2 --scope-file skills/new-cowork/fixtures/empty-envelope.yml` produces a charter validating against the schema, with `scope_probes` carrying ALL ten canonical scope_probes keys (`email_accounts`, `outlook_folders`, `gmail_labels`, `calendar_ids`, `things3_areas`, `things3_tags`, `knowledge_tags`, `async_task_areas`, `allowed_specialists`, `allowed_mcps`) each set to `{status: skipped, source: scope-file}`. The aggregate `_` key is ABSENT.
- `bash skills/new-cowork/lib/new-cowork.sh tier1fx test-3 --scope-file skills/new-cowork/fixtures/valid-envelope.yml` produces a charter with two `mailboxes[]` entries, each carrying a distinct `account_id`, AND `scope_probes` includes one `mailboxes.<account_id>` row per row in `mailboxes[]` (each `{status: skipped, source: scope-file}`).
- `bash skills/new-cowork/lib/validate-charter.sh ~/cowork/tier1fx/test-2/_charter.md` exits 0; `yq '.scope_probes | has("_")' ~/cowork/tier1fx/test-2/_charter.md` returns `false`.
- Negative case: hand-author a charter whose `scope_probes` contains only `{_: {status: skipped, source: scope-file}}`, run `bash skills/new-cowork/lib/validate-charter.sh <that-file>`, confirm it exits non-zero with a diagnostic naming the missing canonical keys (proves the schema check from Task 2 catches the regression).
- Non-interactive call without `--scope-file` (e.g. piped from `/dev/null`) exits with the documented "interactive shell required" message.
- Rollback on injected mid-flight failure (e.g. `kill -9` between scaffold and write, simulated via test harness) leaves zero residue.
- `GOBOT_REPO=/nonexistent bash skills/new-cowork/lib/new-cowork.sh tier1fx test-4` (interactive, no `--scope-file`) exits with the documented "Interview path unavailable" message naming all three remediation options.
- Simulate Task 3 absent by temporarily renaming `~/workspace/gobot/scripts/cowork-interview.ts` → confirm wrapper exits with the same actionable message (NOT a stack trace, NOT a confusing "interview failed").

**Manual fallback:** with git+editor+gh only:
1. `git switch -c wave16-task4-wrapper`.
2. Open `skills/new-cowork/lib/new-cowork.sh` in editor.
3. Insert the bash block above between the `mkdir -p` scaffold step and the template substitution step. Pay particular attention to the `interview_available` helper — its return code is the load-bearing gate.
4. Manual verify each branch by hand:
   - `bash skills/new-cowork/lib/new-cowork.sh tier1fx test-empty --scope-file skills/new-cowork/fixtures/empty-envelope.yml` then `cat ~/cowork/tier1fx/test-empty/_charter.md | head -40` and visually confirm `project_scope:` is present, `mailboxes: []`, all ten canonical `scope_probes` keys present each set to `{status: skipped, source: scope-file}`, and `scope_probes` does NOT contain a `_` key (run `yq '.scope_probes | has("_")' ~/cowork/tier1fx/test-empty/_charter.md` — must return `false`).
   - `echo "" | bash skills/new-cowork/lib/new-cowork.sh tier1fx test-stdin` and confirm the "interactive shell required" message prints.
   - `GOBOT_REPO=/nonexistent bash skills/new-cowork/lib/new-cowork.sh tier1fx test-nogobot` and confirm the "Interview path unavailable" message lists all three remediation paths.
   - Clean up scratch projects: `rm -rf ~/cowork/tier1fx/test-empty ~/cowork/tier1fx/test-nogobot`.
5. `git add skills/new-cowork/lib/new-cowork.sh && git commit -m "wave16(task4): cross-repo wrapper + feature-flag gate + scope-file path"`.
6. `git push -u origin wave16-task4-wrapper && gh pr create --title "wave16 T4: new-cowork.sh interview wrapper" --body "Implements docs/specs/2026-05-20-cowork-envelope-interview.md Task 4. Mechanically safe under either merge order — scope-file path independent of gobot Task 3."`.

### Task 5 — Probe smoke tests (gobot-side `bun test`)

**File target:** `~/workspace/gobot/scripts/__tests__/cowork-interview.test.ts` (matches the `backfill-cron-cowork-project-id.test.ts` precedent).

**Done when:** `bun test scripts/__tests__/cowork-interview.test.ts` runs each probe (Q1–Q8) with three fixtures per probe — (a) live service available (mocked happy path), (b) live service unreachable (mocked failure), (c) programmer-error simulation (mocked invalid response shape) — and asserts the correct failure class fires.

**Next concrete action:** write the test harness using `bun:test` (gobot's existing convention). Per-probe pattern:
```typescript
import { describe, test, expect, mock } from "bun:test";
import { probeOutlookFolders } from "../cowork-interview";  // export the probes individually

const OUTLOOK_ACCT = "acct-outlook-001";  // fixture id; must match Q1-selected account_id shape

describe("probeOutlookFolders", () => {
  test("live: returns folder names for the supplied account", async () => {
    mock.module("../src/lib/email/graph-client", () => ({
      graphClientFor: (_account_id: string) => ({
        get: async () => ({ value: [{ displayName: "Inbox" }, { displayName: "Sent" }] }),
      }),
    }));
    const r = await probeOutlookFolders(OUTLOOK_ACCT);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.options).toEqual(["Inbox", "Sent"]);
  });

  test("unreachable: graceful empty (connectivity-class)", async () => {
    mock.module("../src/lib/email/graph-client", () => ({
      graphClientFor: (_account_id: string) => ({
        get: async () => { throw new Error("ECONNREFUSED"); },
      }),
    }));
    const r = await probeOutlookFolders(OUTLOOK_ACCT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unreachable");
  });

  test("programmer error: zod parse failure bubbles up (programmer-class)", async () => {
    mock.module("../src/lib/email/graph-client", () => ({
      graphClientFor: (_account_id: string) => ({
        get: async () => ({ value: [{ wrong_key: "x" }] }),  // shape drift
      }),
    }));
    await expect(probeOutlookFolders(OUTLOOK_ACCT)).rejects.toThrow(/ZodError|displayName/);
  });

  // Type guard fixture — LOAD-BEARING, do NOT delete this test.skip block.
  // The body never runs (skip), but `bunx tsc --noEmit` still typechecks the file as a whole,
  // so the @ts-expect-error directive below binds and pins the no-arg-must-not-compile contract
  // from Task 3 / exit-gate row 14. Removing it would silently drop the guard with no test
  // failure to catch the regression. Pins the Codex round-2 account-binding finding —
  // no-arg probe calls must be compile-time errors, not silent unbound /me probes.
  test.skip("typecheck: probeOutlookFolders() with no arg must not compile", () => {
    // @ts-expect-error — account_id is a mandatory positional per Task 3
    probeOutlookFolders();
  });
});

// The same `test.skip + @ts-expect-error` typecheck fixture MUST be repeated inside the
// `describe("probeGmailLabels", ...)` block (pattern omitted here for brevity but contractually
// required by Task 3 / exit-gate row 14, which greps for ≥2 @ts-expect-error lines).
```

Things3 tests guarded with `test.skipIf(process.platform !== "darwin")` per §4.6.

Additionally, the `mailboxes` shape (per-account folder/label binding) gets dedicated assertions: a test fixture with two accounts (one outlook + one gmail) asserts that the emitted `mailboxes[]` array has two entries, each with the correct provider, and that outlook-only fields are empty for the gmail entry (and vice versa).

**Verify:** `bun test scripts/__tests__/cowork-interview.test.ts` exits 0 with 24 base probe assertions (8 probes × 3 fixtures) plus 4 mailbox-binding assertions (2 accounts × outlook/gmail field isolation), minus Things3 cases on Linux. Two `test.skip("typecheck: ... no arg must not compile")` fixtures (one for `probeOutlookFolders`, one for `probeGmailLabels`) carry `// @ts-expect-error` directives — these are LOAD-BEARING type guards pinned by exit-gate row 14, not stale skips. `bunx tsc --noEmit` baseline unchanged.

**Manual fallback:** with git+editor+gh only (in the gobot repo):
1. `cd ~/workspace/gobot && git switch -c wave16-task5-tests` (or stack on top of `wave16-task3-interview` if testing locally before T3 merges).
2. Open `scripts/__tests__/cowork-interview.test.ts` in editor.
3. Write the per-probe describe blocks using the pattern shown above (3 fixtures: live, unreachable, programmer-error). Mock each module via `mock.module(...)`. Inside BOTH `describe("probeOutlookFolders", ...)` and `describe("probeGmailLabels", ...)` blocks, include the LOAD-BEARING `test.skip("typecheck: ... no arg must not compile")` fixture with `// @ts-expect-error` — required by exit-gate row 14 (greps for ≥2 occurrences).
4. Write the mailbox-binding describe block: mock `probeEmailAccounts` to return one outlook + one gmail account, mock `probeOutlookFolders` and `probeGmailLabels`, then drive the main interview loop with `bun:test`'s spy on `@inquirer/prompts.checkbox` to auto-confirm. Assert `mailboxes` length is 2 and that `mailboxes[0].gmail_labels` is empty for the outlook entry.
5. Add `test.skipIf(process.platform !== "darwin")` to the Things3 describe blocks.
6. Manual verify: `cd ~/workspace/gobot && bun test scripts/__tests__/cowork-interview.test.ts` exits 0. On Linux you'll see Things3 cases skipped; otherwise all 28 assertions green.
7. `git add scripts/__tests__/cowork-interview.test.ts && git commit -m "wave16(task5): cowork-interview tests — 3 probe classes + mailbox binding"`.
8. `git push -u origin wave16-task5-tests && gh pr create --title "wave16 T5: cowork-interview tests" --body "Implements docs/specs/2026-05-20-cowork-envelope-interview.md Task 5"` (or fold into the same gobot PR as Task 3 if not yet merged).

### Task 6a — gobot reader compatibility shim (`scope-mcp-adapter.ts`)

**Why this task exists (Finding 3, round 2).** This spec replaces the flat `outlook_folders` / `gmail_labels` envelope fields with a structured `mailboxes[]` array. The existing gobot adapter at `src/lib/scope-mcp-adapter.ts:115` reads `actor.projectScope.outlook_folders` (flat). With no shim, the new envelope shape produces empty reads from the existing adapter — closing the data-shape half of enforcement while breaking the only known consumer when it gets wired in. This task adds a derivation step that keeps both shapes consistent in a single source of truth.

**File targets:**
- `~/workspace/gobot/src/lib/project-context.ts` — add a pure helper `deriveFlatScope(projectScope): { outlook_folders: string[], gmail_labels: string[] }` that aggregates across `mailboxes[]`.
- `~/workspace/gobot/src/lib/scope-mcp-adapter.ts:115` — consume `mailboxes[]` directly OR read the derived flat fields, depending on which call site is being gated. The adapter MUST treat both representations as equivalent (a tag in `mailboxes[i].outlook_folders` is identical, for enforcement purposes, to the same tag in `derived.outlook_folders`).
- `~/workspace/gobot/src/lib/__tests__/scope-mcp-adapter.test.ts` — new test pair proving the equivalence.

**Done when:**
- `deriveFlatScope(projectScope)` returns `{ outlook_folders: <union of all mailboxes[i].outlook_folders, deduped>, gmail_labels: <union of all mailboxes[i].gmail_labels, deduped> }`. Empty `mailboxes[]` → both arrays empty. Order is stable (sorted ascending).
- The adapter denies/allows identically whether the input is the new structured envelope or its derived flat projection — proven by a pair of test fixtures (one with `mailboxes[]`, one hand-flattened) that produce byte-equal decision outputs across every existing decision path.
- A `// @ts-expect-error` test asserts that the OLD signature `{ outlook_folders: string[] }` directly on `projectScope` (no `mailboxes[]`) is rejected at the type level — proves the new schema is the source of truth, the flat shape is derived-only.

**Next concrete action:** add `deriveFlatScope` to `project-context.ts` (one pure function, ~10 lines). Wire it into `scope-mcp-adapter.ts:115` such that every decision branch consults either `projectScope.mailboxes[]` (preferred, with account_id intact) or `deriveFlatScope(projectScope)` (legacy-shaped consumers). Add the equivalence test.

**Verify:**
- `cd ~/workspace/gobot && bun test src/lib/__tests__/scope-mcp-adapter.test.ts` exits 0 with the new equivalence assertions (≥2 paired fixtures: structured-envelope decision == derived-flat-envelope decision).
- `grep -nE "actor\.projectScope\.(outlook_folders|gmail_labels)" ~/workspace/gobot/src/lib/scope-mcp-adapter.ts` either returns 0 hits (fully migrated to `mailboxes[]`) OR returns hits where the value is sourced from `deriveFlatScope(...)` — never directly off the raw `projectScope`. A reviewer grep MUST be able to distinguish the two.
- `grep -nE "actor\.projectScope\.mailboxes" ~/workspace/gobot/src/lib/scope-mcp-adapter.ts` returns ≥1 hit.
- `cd ~/workspace/gobot && bunx tsc --noEmit` baseline error count unchanged (still 1 — pre-existing `excel-builder.ts:37`).
- `grep -r scopeMcpCall ~/workspace/gobot/src/{lib,scheduler,mcp} | grep -v test | wc -l` returns the same number of hits as before the wave (zero new production callers — this task is a SHAPE-compat shim, not enforcement wiring).

**Manual fallback:** with git+editor+gh only (in the gobot repo):
1. `cd ~/workspace/gobot && git switch -c wave16-task6a-scope-adapter-compat` (or stack on `wave16-task3-interview`).
2. Open `src/lib/project-context.ts` in editor; add the `deriveFlatScope` helper as a pure function. Sort + dedupe outputs for stable comparison.
3. Open `src/lib/scope-mcp-adapter.ts` at line 115; replace direct reads of `actor.projectScope.outlook_folders` / `actor.projectScope.gmail_labels` with either `actor.projectScope.mailboxes` consumption (preferred) or `deriveFlatScope(actor.projectScope).outlook_folders` (legacy-shaped consumer code). Pick ONE strategy per branch and document it inline.
4. Open `src/lib/__tests__/scope-mcp-adapter.test.ts`; add the paired-fixture equivalence test (one fixture with `mailboxes[]`, one hand-flattened, assert decision outputs byte-equal across every adapter decision path).
5. Add the `// @ts-expect-error` test asserting that raw flat-shape input is rejected at the type level.
6. Manual verify: `bun test src/lib/__tests__/scope-mcp-adapter.test.ts` exits 0; `bunx tsc --noEmit` returns the same baseline error count.
7. Stage explicit files only:
   ```bash
   git add \
     src/lib/project-context.ts \
     src/lib/scope-mcp-adapter.ts \
     src/lib/__tests__/scope-mcp-adapter.test.ts
   git commit -m "wave16(task6a): scope-mcp-adapter consumes mailboxes[] via deriveFlatScope shim"
   ```
8. `git push -u origin wave16-task6a-scope-adapter-compat && gh pr create --title "wave16 T6a: scope-mcp-adapter mailboxes[] compat shim" --body "Implements docs/specs/2026-05-20-cowork-envelope-interview.md Task 6a. Keeps the dormant adapter consistent with the new structured envelope so future enforcement wiring (separate gobot wave) reads the right shape."` (or fold into the same gobot PR as Tasks 3 + 5).

### Task 6 — Docs + receipt schema delta

**Done when:**
- `skills/new-cowork/SKILL.md` documents the interview flow, the `--scope-file` flag, and the failure-class behavior in a new `## Scope envelope interview` section.
- `docs/protocol/receipt-schema.md` adds an `envelope_keys[]` field listing array names that the operator populated non-empty.
- `AGENTS.md` Cowork section gains a one-line pointer at the interview shape.
- `CLAUDE.md` gets no edits (interview is tool-neutral; protocol-first doctrine).

**Next concrete action:** SKILL.md insertion at the existing `## Skill body` section's end. Receipt schema delta:
```yaml
audit:
  envelope_keys:                       # NEW: list of project_scope arrays where len > 0
    - mailboxes                        # 'mailboxes' appears here whenever ≥1 mailbox row is present
    - things3_tags
    - knowledge_tags
  scope_probes:                        # NEW: per-probe status records (mirrors charter scope_probes:)
    email_accounts: { status: ok, source: 'himalaya+graph' }
    knowledge_tags: { status: unreachable, source: 'lxc201', warning: 'PGPASSWORD missing' }
    # ... one record per probe (including per-account mailbox probes keyed `mailboxes.<account_id>`)
```

**Verify:** `grep -A2 "envelope_keys" docs/protocol/receipt-schema.md` returns the new entry; `grep "scope_probes" docs/protocol/receipt-schema.md` returns the per-probe block; SKILL.md `## Scope envelope interview` section exists and documents both the interactive and `--scope-file` paths; `grep "scope interview" AGENTS.md` returns ≥1 hit.

**Manual fallback:** with git+editor+gh only:
1. `git switch -c wave16-task6-docs`.
2. Open `skills/new-cowork/SKILL.md` in editor; add a new `## Scope envelope interview` section at the end of `## Skill body`. Document: the 8 question rounds, the `--scope-file` path (with the YAML-or-JSON, bare-or-nested forms), the failure-class taxonomy, the per-probe `scope_probes` block, and the cross-repo dependency on gobot's `cowork-interview.ts` (Task 3).
3. Open `docs/protocol/receipt-schema.md` in editor; add the `envelope_keys[]` and `scope_probes` blocks under the existing `audit:` section. Include a short comment block above each new field explaining "what" and "why" — `envelope_keys[]` resolves audit-time queries about which scope arrays were populated; `scope_probes` distinguishes deny-by-operator from deny-by-degraded-probe.
4. Open `AGENTS.md`; under the existing Cowork section add a one-line pointer: `Scope interview shape: see docs/specs/2026-05-20-cowork-envelope-interview.md.`
5. Manual verify: `grep -A3 "envelope_keys" docs/protocol/receipt-schema.md` and confirm the new block; `grep -A1 "scope_probes" docs/protocol/receipt-schema.md` and confirm; `grep -i "scope envelope interview" skills/new-cowork/SKILL.md` returns 1 hit; `grep -i "scope interview" AGENTS.md` returns ≥1 hit.
6. `git add skills/new-cowork/SKILL.md docs/protocol/receipt-schema.md AGENTS.md && git commit -m "wave16(task6): docs + receipt-schema delta for envelope interview"`.
7. `git push -u origin wave16-task6-docs && gh pr create --title "wave16 T6: docs + receipt-schema delta" --body "Implements docs/specs/2026-05-20-cowork-envelope-interview.md Task 6"`.

---

## Exit Gate

Wave 16 closes when ALL the following return the expected output on the operator's main machine (not in a worktree — receipt CWD gotcha per `feedback_emit_receipt_worktree_cwd_gotcha`):

1. `bash skills/new-cowork/lib/validate-charter.sh skills/new-cowork/templates/_charter.md.tmpl` (with placeholders substituted) returns 0; `bash skills/new-cowork/lib/validate-scope.sh skills/new-cowork/fixtures/valid-envelope.yml` returns 0; invalid fixtures return non-zero with line-numbered diagnostics naming the failing constraint.
2. `cd ~/workspace/gobot && bun test scripts/__tests__/cowork-interview.test.ts` returns 0 (Linux: skips Things3; macOS: all probe assertions + 4 mailbox-binding assertions green).
3. `cd ~/workspace/gobot && bun run scripts/cowork-interview.ts --self-test` returns 0 — every live probe prints `OK <probe>: <N options>` or `UNREACHABLE <probe>: <reason>`, none throw (the programmer-class path stays cold on a healthy machine).
4. `bash skills/new-cowork/lib/new-cowork.sh tier1fx envelope-smoke-test --scope-file skills/new-cowork/fixtures/valid-envelope.yml` produces a charter that:
   - validates against `project-charter.schema.json`
   - has `mailboxes[]` with the 2 fixture entries each bound to a distinct `account_id` (no cross-account folder/label leakage)
   - has all 8 envelope fields present
   - has `writable_paths` and `reflection.cadence` auto-seeded
   - has `scope_probes` carrying ALL ten canonical keys (`email_accounts`, `outlook_folders`, `gmail_labels`, `calendar_ids`, `things3_areas`, `things3_tags`, `knowledge_tags`, `async_task_areas`, `allowed_specialists`, `allowed_mcps`), each `{status: skipped, source: scope-file}`, plus one `mailboxes.<account_id>` row per row in `mailboxes[]`; `yq '.scope_probes | has("_")'` returns `false` (proves the scope-file branch tagged per-field provenance without reintroducing the forbidden aggregate marker)
5. Live invocation `bash skills/new-cowork/lib/new-cowork.sh tier1fx envelope-live-test` from an interactive terminal completes the 8 questions in <30s with skip-all (Q1 + per-account Q2 sequential, then Q3–Q8 concurrent via `Promise.all`). The assertion is <30s; 60s was the historical bash-MVP target this TS path supersedes (~2× faster), kept here only as a context-setting anchor.
6. Receipt emitted at `~/.harness-state/receipts/<wave-16-id>.yml` carries BOTH `audit.envelope_keys` (array of populated names) AND `audit.scope_probes` (per-probe status records).
7. **Cross-repo merge-order safety check.** With `~/workspace/gobot/scripts/cowork-interview.ts` temporarily renamed (simulates "claude-harness PR merges before gobot PR"): `bash skills/new-cowork/lib/new-cowork.sh tier1fx test-no-script --scope-file skills/new-cowork/fixtures/valid-envelope.yml` STILL succeeds (scope-file path is independent), AND interactive `bash skills/new-cowork/lib/new-cowork.sh tier1fx test-no-script-interactive` exits with the actionable "Interview path unavailable" message naming all three remediation options (NOT a stack trace, NOT "interview failed").
8. `~/cowork/tier1fx/email/_charter.md` remains UNCHANGED (this wave doesn't backfill — leaving the live state as-is is part of the contract).
9. `grep -r scopeMcpCall ~/workspace/gobot/src/{lib,scheduler,mcp} | grep -v test` returns the same number of hits as before the wave (zero production callers — confirms we did NOT widen MCP-gating scope into gobot).
10. `cd ~/workspace/gobot && bunx tsc --noEmit` returns the same baseline error count as before the wave (currently 1 — the pre-existing `excel-builder.ts:37` error). No new cross-repo TS drift from the interview file.
11. `GOBOT_REPO=/nonexistent bash skills/new-cowork/lib/new-cowork.sh tier1fx fallback-test` exits with the documented "Interview path unavailable" message naming all three remediation options, NOT a stack trace.
12. **Adapter-shape consistency (Task 6a).** `cd ~/workspace/gobot && bun test src/lib/__tests__/scope-mcp-adapter.test.ts` exits 0 with the paired-fixture equivalence assertions; `grep -nE "actor\.projectScope\.mailboxes" ~/workspace/gobot/src/lib/scope-mcp-adapter.ts` returns ≥1 hit, AND any remaining `actor.projectScope.outlook_folders` reference is sourced from `deriveFlatScope(...)` (never directly off raw `projectScope`).
13. **No aggregate-marker regression in scope-file path (Task 4 + Task 2).** `bash skills/new-cowork/lib/new-cowork.sh tier1fx aggregate-marker-test --scope-file skills/new-cowork/fixtures/valid-envelope.yml && yq '.scope_probes | keys' ~/cowork/tier1fx/aggregate-marker-test/_charter.md` lists ALL ten canonical scope_probes keys (plus per-mailbox `mailboxes.<account_id>` rows); `yq '.scope_probes | has("_")' ~/cowork/tier1fx/aggregate-marker-test/_charter.md` returns `false`; `bash skills/new-cowork/lib/validate-charter.sh skills/new-cowork/fixtures/invalid-charter-aggregate-probes.md` returns non-zero (regression guard for Finding 2 round 2).
14. **Account-binding regression guard (Task 3 + Task 5).** `grep -nE "/me/(mailFolders|labels)" ~/workspace/gobot/scripts/cowork-interview.ts` returns ZERO hits; `grep -cE "@ts-expect-error" ~/workspace/gobot/scripts/__tests__/cowork-interview.test.ts` returns ≥2 (one per scoped probe — `probeOutlookFolders` AND `probeGmailLabels`); `cd ~/workspace/gobot && bunx tsc --noEmit scripts/cowork-interview.ts scripts/__tests__/cowork-interview.test.ts` exits 0 with both `@ts-expect-error` lines still present (proves the type guards are live — removing either would cause tsc to error).

---

## Open Questions

**OQ-1.** ~~**interview.sh vs interview.ts.**~~ **RESOLVED 2026-05-20 (flipped after re-evaluation): bun + gobot.** Interview ships as `~/workspace/gobot/scripts/cowork-interview.ts` (matches the precedent of `scripts/backfill-cron-cowork-project-id.ts` shipped in gobot Wave 16, `0f2ce9d`). Invoked from claude-harness's existing bash `lib/new-cowork.sh` via `bun run`. **Rationale (flip reasoning):**

1. **Type-safety on §4.6's primary failure class.** The probe taxonomy distinguishes "service unreachable" (acceptable empty result) from "programmer error in the probe" (typo, schema drift — must hard-fail). In TypeScript, `t.title` vs `t['title']` is a compile-time error against the Things3 type definitions; the structural soundness of the taxonomy lives in `tsc --noEmit`, not in a runtime shape-assertion line you remembered to write.
2. **Reuse of gobot's already-tested probe code.** `src/lib/knowledge-facts.ts` exposes the KB-tag scan; `src/lib/supabase.ts` exposes `getSupabase()`; `src/lib/email/{gmail-client.ts, graph-client.ts, outlook-folders.ts, himalaya-runner.ts}` have Outlook + Gmail probes; `src/mcp/things3/index.ts` knows the Things3 spawn shape. TS imports these — bash would reimplement them and start drifting from `searchFacts()`'s actual tag normalization on day one.
3. **Forward-compat with Wave 17.** Future `/cowork-status`, `/cowork-rescope-existing`, `/cowork-scope-edit` will all READ `_charter.md` envelopes. If the write path is TS, both read and write share a single parsing + validation module. If bash, every read needs to reparse YAML separately.

**Cost accepted:** the skill stops working on machines without `~/workspace/gobot/` checked out. Mitigation: bash wrapper detects the path, falls back to a clean error message *"This interview requires gobot at ~/workspace/gobot. Pass --scope-file <path> or check out gobot first."* — this is acceptable because `/new-cowork` already writes operator-local paths and was never portable in practice.

**Doctrine note:** this bends `feedback_protocol_first_doctrine` ("operable with git+editor+shell+docs alone"). Acknowledged. Per the re-evaluation, the correctness pros (1) + (2) outweigh the doctrine cost given the skill is operator-only on the operator's machine.

**OQ-2.** ~~**Probe runtime for Q5 + Q6 (Supabase tag scan).**~~ **RESOLVED 2026-05-20: direct psql.** Verified working against LXC 201 (`psql 18.2 → 2151 rows in knowledge_facts as of 2026-05-20`). Credentials path corrected from the spec's earlier guess `~/.gobot/supabase.env` (does not exist) to the canonical operator-machine convention `~/workspace/gobot/.env` containing `LXC201_PG_PASSWORD`. Connection string: `PGPASSWORD=$LXC201_PG_PASSWORD psql -h 10.1.10.233 -p 5432 -U postgres -d postgres`. Same file documents this convention in a header comment block above the var.

**Probe credential resolution order (Task 3 must implement):**
1. If `LXC201_PG_PASSWORD` is already in the shell env → use it.
2. Else if `~/workspace/gobot/.env` exists → source it (subshell, no shell-state pollution: `( set -a; source ~/workspace/gobot/.env; set +a; psql ... )`).
3. Else → log connectivity-class warning, return empty arrays for Q5 + Q6 (no hard fail; per §4.6 probe taxonomy this is "service unreachable", not "programmer error").

This three-step order keeps the skill portable (env var wins) while staying ergonomic on the operator's current machine (file fallback). It bends `feedback_protocol_first_doctrine` slightly — the file fallback hard-codes the gobot-repo path — but the graceful-degrade path means the skill still runs on a fresh machine without gobot checked out, just with empty Q5/Q6 results.

**OQ-3.** **`writable_paths` autoseed scope.** Spec autoseed: `~/cowork/<area>/<project>/**` only. Does the operator want the area-level path `~/cowork/<area>/**` auto-included too, so area-level `_area.md` edits (Wave 15) survive scope enforcement? Or is that explicitly a per-operator hand-edit? Pivot §4.6 says operator hand-adds — recommended as written.

**OQ-4.** **Schema bump on Wave 18 specialist registry expansion.** When Wave 18 (Phase 3.5) ships a new specialist (e.g. `compliance`), the `allowed_specialists` enum in `project-charter.schema.json` must bump. Two options:
- (A) Hardcode the 6-enum in the schema; bump-by-PR when Wave 18 fires.
- (B) Schema reads from a generated file `docs/schemas/specialist-registry.json` populated by a gobot script.
Option A is simpler given Wave 18 may never ship. Recommended.

**OQ-5.** **`--no-interview` flag for ops who want to skip and edit by hand.** Distinct from `--scope-file` (which requires a pre-built envelope). Does anyone want a `--skip-scope` flag that writes an empty envelope and warns? Pivot §4.6 implicitly forbids this ("never lands with empty / missing scope envelope") — recommended to NOT add the flag.

**OQ-6.** **Q8 `mcp-allowlist-options.json` regeneration path.** Currently the static list at `skills/new-cowork/templates/mcp-allowlist-options.json` is hand-maintained. When new MCPs ship in gobot, the list drifts silently. Two options: (a) ship a `/cowork-refresh-mcp-list` skill that scans `gobot/src/mcp/` for available servers and rewrites the JSON; (b) document a manual operator workflow in SKILL.md. Out of scope for this wave — recommended to leave as manual until drift becomes visible in practice; revisit with Wave 18.

**OQ-7.** **Calendar scope account binding (raised in Codex round 3, F3).** Q3 probes calendars per selected Outlook account via `graphClientFor(account_id).get("/calendars")`, but the data model stores only a flat `calendar_ids[]` of opaque strings. Future enforcement cannot determine which account owns a given calendar id, so a lookup under version skew or duplicate/opaque ids could default to the wrong account — the same trust-boundary class fixed for folders/labels by switching to `mailboxes[]`. **Deferred to a future wave.** Per §Trust Boundaries this wave is explicitly "necessary but not sufficient"; the calendar binding was never raised in r1/r2 and pulling it in now would re-design the envelope after the loop converged on the mailbox shape. Future fix would change `calendar_ids[]: string[]` to an account-bound shape such as `calendars[]: { account_id, provider, calendar_id }[]`, or namespace every calendar id with its owning `account_id`, and add adapter tests proving cross-account calendar ids cannot collapse. Tracking: this OQ is the entry point for that wave's spec.

---

## Plan.md row draft

```markdown
### Wave 16 — Cowork envelope interview (Pivot §4.6 implementation, cross-repo)

- depends-on: Wave 15 merged (✓ d7f1d30) + gobot at `~/workspace/gobot/`
- spec: docs/specs/2026-05-20-cowork-envelope-interview.md
- done-when: All 8 envelope arrays land in every new _charter.md scaffolded by /new-cowork; existing charters untouched; scope-mcp-adapter caller count in gobot unchanged; gobot tsc baseline unchanged
- next-concrete-action: Resolve OQ-3 / OQ-4 / OQ-5, then dispatch Task 1 (template skeleton)

**Tasks (7) — splits cross-repo:**

| # | Task | Repo | Estimate |
|---|---|---|---|
| T1 | `_charter.md.tmpl` YAML envelope skeleton (~15 lines) | claude-harness | 30 min |
| T2 | `project-charter.schema.json` + `validate-charter.sh` + 6 fixtures incl. aggregate-marker regression fixture (~140 LOC) | claude-harness | 1.5h |
| T3 | `scripts/cowork-interview.ts` — 8 typed probes (mailbox probes require `account_id`) + `Promise.all` parallelism + `@inquirer/prompts` UI (~300 LOC) | **gobot** | 4-5h |
| T4 | `lib/new-cowork.sh` cross-repo invocation + `--scope-file` flag (with full 10-key `scope_probes` emission) + `GOBOT_REPO` override + clean missing-gobot fallback (~60 LOC delta) | claude-harness | 1.5h |
| T5 | `scripts/__tests__/cowork-interview.test.ts` — 8 × 3 fixtures + mailbox-binding assertions + `@ts-expect-error` typecheck guard (~280 LOC) | **gobot** | 2-3h |
| T6a | `scope-mcp-adapter.ts` consumes `mailboxes[]` via `deriveFlatScope` shim + paired-fixture equivalence test (~50 LOC delta) | **gobot** | 1.5h |
| T6 | SKILL.md + AGENTS.md + receipt-schema.md docs (~80 LOC delta) | claude-harness | 1h |

**Cross-repo coordination:**
- T1 + T2 + T4 + T6 ship in one claude-harness PR.
- T3 + T5 + T6a ship in one gobot PR.
- **Either merge order is mechanically safe.** Task 4 ships with a feature-flag-style `interview_available` gate that probes for `scripts/cowork-interview.ts` + `--version` sentinel before invoking it. If the claude-harness PR lands first, `/new-cowork --scope-file <path>` works immediately (no gobot dependency), and the interactive path emits a clean actionable error directing operator to `--scope-file` or to check out the gobot side. If gobot lands first, claude-harness's wrapper picks it up automatically once merged.
- Per `feedback_cross_repo_wave_dispatch` — host worktree unused; `/close-wave` doesn't apply directly to the gobot side. Operator coordinates the two merges manually but no specific ordering is required for correctness.

**Exit gate:** 14 numbered checks live in `## Exit Gate` of the spec (rows 1-14). Source of truth is that section; do NOT reproduce the row list inline here to avoid drift. Close-wave receipts MUST cite spec §Exit Gate by row number, not by paraphrase.

**Estimate:** ~1.5–2 operator-days end-to-end (TS pros 1+2 buy back the cross-repo coordination cost).
```

---

## Codex pre-emptive review checklist

Pre-empting common Codex findings on this spec shape (`feedback_codex_walks_back_friction_reducers`):

- ✅ **Trust boundary section present** (§Trust Boundaries) — what this wave does and explicitly does NOT enforce.
- ✅ **Probe failure-class taxonomy enforced at code time** (shape assertions, not just doc).
- ✅ **Per-probe status persisted** — `scope_probes:` block in charter + `audit.scope_probes` in receipt distinguish deny-by-operator from deny-by-degraded-probe (Codex round 1, finding 5).
- ✅ **Mandatory probes gated on unreachable** — operator confirmation required when Q1/Q2/Q3 return `unreachable` (Codex round 1, finding 5).
- ✅ **Per-account mailbox binding** — `mailboxes: [{ account_id, provider, outlook_folders, gmail_labels }]` shape prevents cross-account folder/label leakage (Codex round 1, finding 1).
- ✅ **Q1 sequenced before Q2** — per-account folder/label probes run AFTER Q1 closes, scoped by `account_id` (Codex round 1, finding 1).
- ✅ **Account-scoped probe signatures (no `/me/` fallback)** — `probeOutlookFolders(account_id)` and `probeGmailLabels(account_id)` take mandatory `account_id`; clients are constructed via `graphClientFor(account_id)` / `gmailClientFor(account_id)`; no `/me/` paths in the probe library; `// @ts-expect-error` test pins the type guard; exit-gate row 14 greps for `/me/` regression (Codex round 2, finding 1).
- ✅ **Scope-file branch persists per-field provenance** — emits all ten canonical `scope_probes` keys (+ per-mailbox `mailboxes.<account_id>` rows) tagged `source: scope-file`; aggregate `_` key is forbidden by schema (`propertyNames: { not: { const: "_" } }`); regression fixture `invalid-charter-aggregate-probes.md` proves the schema rejects the round-1 shape; exit-gate row 13 verifies (Codex round 2, finding 2).
- ✅ **Adapter-shape compatibility shim (Task 6a)** — `scope-mcp-adapter.ts` consumes `mailboxes[]` directly or via `deriveFlatScope(...)` helper; paired-fixture equivalence test asserts structured-envelope decisions match derived-flat-envelope decisions byte-for-byte; exit-gate row 12 verifies (Codex round 2, finding 3).
- ✅ **Explicit-file staging in manual fallbacks** — Task 2 manual fallback enumerates every file by name (`git add <file> <file>...`); no directory-level `git add` anywhere in the manual fallbacks (Codex round 2, finding 4).
- ✅ **Two-schema design for --scope-file** — `project-scope.schema.json` validates scope-only inputs; `project-charter.schema.json` validates full frontmatter; both share the scope sub-shape via `$ref` (Codex round 1, finding 4).
- ✅ **Cross-repo merge ordering is mechanically safe** — Task 4 `interview_available` probe + `--version` sentinel pin; `--scope-file` path independent of gobot Task 3 (Codex round 1, finding 3).
- ✅ **Manual fallback per task** — every implementation task carries a `Manual fallback:` sub-bullet executable with git + editor + gh, per v2 protocol §"Manual is primary" (Codex round 1, finding 2).
- ✅ **Rollback / re-run semantics declared** (Task 4: track-and-rollback on partial; `--scope-file` for non-interactive re-run; Wave 17 `/cowork-scope-edit` for in-place edit; `save-as-scope-file` confirmation option preserves partial work on unreachable abort).
- ✅ **Observability hook** (receipt `envelope_keys[]` + `scope_probes`).
- ✅ **Cross-repo path drift acknowledged** (OQ-1).
- ✅ **Stale references avoided** — pivot §4.6 line 340 references `gobot/.claude/skills/new-cowork/lib/interview.ts` (a path that doesn't exist; `/new-cowork` lives in claude-harness as a bash skill). This spec calls that out and re-targets to `gobot/scripts/cowork-interview.ts`, matching the precedent of `backfill-cron-cowork-project-id.ts` shipped in gobot Wave 16.
- ✅ **Acceptance test for the no-mailbox / no-Supabase paths** — Tasks 3 + 5 cover connectivity-class probe paths.
- ✅ **Non-happy-path coverage** — programmer-class failure has its own test fixture (Task 5); mailbox-binding has dedicated assertions; --scope-file invalid fixtures exercise schema rejection.
- ✅ **Explicit "this does NOT widen X" assertion** in exit gate (rows 9 + 10).
- ✅ **Merge-order safety test in exit gate** (row 7 — simulates gobot Task 3 absent, asserts wrapper still scaffolds via `--scope-file` and emits clean error in interactive mode).

Likely remaining Codex queries (cross-repo shape after OQ-1 flip):
- "Why TS in gobot instead of bash in claude-harness — isn't this a doctrine violation?" → OQ-1 rationale captures it; correctness pros 1+2 outweigh the doctrine cost given operator-only deployment shape. Manual-fallback bullets keep every task replayable with git+editor+gh regardless of language choice.
- "Where does the operator regenerate `mcp-allowlist-options.json` (Q8)?" → currently undocumented; needs a `/cowork-refresh-mcp-list` skill or a manual step in SKILL.md. **Tracked in OQ-6.**
- "Does the schema validate `id` collisions with second-brain's `projects` table?" → No; namespace separation is enforced at table-write time (gobot `cowork_projects` vs `projects`), not at schema validation. Document this in schema header comment.
- "What happens on a Linux runner that has gobot checked out but no Things3?" → Q4 + Q4b skip cleanly via `process.platform !== 'darwin'` guard; remaining 6 probes run as normal. Already covered in §Behavior edge cases.

---

## References

- Pivot spec §4.6 — `gobot/docs/specs/2026-05-11-pivot-to-workspace-as-context.md:265-356`
- Memory-system-redesign Wave 13 — `docs/specs/2026-05-13-memory-system-redesign.md` (shipped `/new-cowork` bash MVP)
- Cowork area context Wave 15 — `docs/specs/2026-05-14-cowork-area-context.md` (flag + per-file rollback precedent)
- gobot scope adapter — `gobot/src/lib/scope-mcp-adapter.ts:115` (the `actor.projectScope.outlook_folders` read site this wave feeds)
- Receipt schema — `docs/protocol/receipt-schema.md` (`envelope_keys[]` delta target)
