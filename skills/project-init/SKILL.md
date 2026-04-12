---
name: project-init
description: Initialize a project's .harness-profile — captures audience, stakes, quality bar, stack, and methodology settings. Run once per project, right after setup-harness. The profile drives session-start injection, drift detector sensitivity, and phase gate strictness.
argument-hint: "[--force]"
---

# Project Init

Write a `.harness-profile` for the current project. This is the **one-time** setup that captures who the app is for, how risky mistakes are, and how strictly the methodology should enforce itself.

Run this **after** `setup-harness` has installed agents/criteria/CLAUDE.md. The profile is what `session-start`, the drift detector, and gate checks read from.

## Step 1: Check for existing profile

```bash
ls -la .harness-profile 2>/dev/null
```

If `.harness-profile` exists and `$ARGUMENTS` does NOT contain `--force`, ask the user:

> A `.harness-profile` already exists. Do you want to:
> - **Keep it** (skip init — profile is unchanged)
> - **View & edit** (print current content, offer to edit specific fields)
> - **Recreate from scratch** (archive old to `.harness-profile.bak`, run full questionnaire)

If `--force` is passed, skip the check and proceed to full questionnaire.

## Step 2: Auto-detect what you can

Examine the current directory to pre-fill fields so you don't waste questions:

### Project type (match setup-harness detection rules — first match wins)
| # | Signal | Type |
|---|---|---|
| 1 | Top-level `skills/` OR `procedures/` OR `.claude/agents/` without app code | `tooling` |
| 2 | Frontend framework (next/vite/svelte/angular/nuxt) | `webapp` |
| 3 | Backend framework (hono/express/fastify/koa) OR `requirements.txt`/`pyproject.toml`/`Cargo.toml`/`go.mod` without frontend | `backend` |
| 4 | Both frontend + backend | `fullstack` |
| 5 | Single script file or only `scripts/` dir, no tooling signals | `script` |

### Stack details
Read `package.json`, `pyproject.toml`, `Cargo.toml`, `bun.lockb`, etc. Extract:
- `runtime`: `bun` / `node` / `deno` / `python` / `rust` / `go`
- `languages`: list from file extensions + manifests
- `frameworks`: from dependencies (`hono`, `react`, `vite`, `tailwind`, ...)
- `database`: detect from dependencies (`drizzle`, `prisma`, `sqlx`, `sqlalchemy`, `mongoose`) — use `deferred` if none found but persistent state implied, `none` if clearly stateless
- `llm_apis`: detect from dependencies (`@anthropic-ai/sdk`, `openai`, `@google/generative-ai`)

### Project name
From `package.json#name`, `pyproject.toml#project.name`, `Cargo.toml#package.name`, or directory basename.

### Description
If `README.md` exists, extract the first paragraph (max 2 sentences). Otherwise leave empty and ask.

## Step 3: Discovery questionnaire

Use `AskUserQuestion` for the fields that can't be auto-detected. Group into at most **3 rounds** to minimize friction.

### Round 1 — Audience & Stakes

1. **Who will use this app?**
   - `internal` — You, teammates, or company staff only
   - `public-free` — Public users, no payment
   - `paying` — Paying customers
   - `friends` — Shared with friends/personal network
   - `unknown` — Not decided yet

2. **How bad is a bug in production?**
   - `low` — Minor annoyance, easy to rollback (prototype / personal tool)
   - `medium` — Broken feature, some user frustration, no financial loss
   - `high` — Loss of trust, refund risk, contract impact
   - `mission-critical` — Safety, legal, or financial consequences

3. **What kind of data does it handle?**
   - `none` — No user data
   - `pii` — Names, emails, personal info
   - `financial` — Money, payments, transactions
   - `health` — Medical records, biometric
   - `regulated` — Anything under GDPR/HIPAA/PCI/etc.

4. **(If stakes ≥ medium)** Size estimate — rough user count? (`"under 10"`, `"10-100"`, `"100-1000"`, `"1000+"`, `"unknown"`)

### Round 2 — Quality bar & deployment

1. **What's the quality target?**
   - `prototype` — Throwaway, demo, proof-of-concept. Fast > polished.
   - `production` — Real users, reasonable polish, tests required.
   - `mission-critical` — Full test coverage, hardening, rollback plans mandatory.

2. **(If quality_bar ≥ production)** Should typecheck, lint, and tests **block commits**?
   - Options: `yes all`, `typecheck only`, `typecheck + lint`, `none`

3. **Enable model routing for the orchestrator?** The orchestrator can dispatch tasks to different models (opus/sonnet/haiku) based on complexity. Saves cost on mechanical tasks while keeping opus for hard problems.
   - `on` — orchestrator routes tasks to appropriate models
   - `off` — everything runs on your current model (Recommended for now — try it later)

4. **Where does this deploy?**
   - Multi-select: `local`, `staging`, `production`, `not yet`
   - If `production` selected, follow up: `rollback_required` yes/no?

5. **(If data_sensitivity ≠ none)** Any compliance frameworks apply? `gdpr` / `soc2` / `hipaa` / `pci` / `none` / multi-select

### Round 3 — Workstreams & team (only if relevant)

1. **Is this a single focused project, or are there parallel workstreams?**
   - `single` — One main thing being built
   - `multi` — Multiple independent workstreams in the same repo (skip `workstreams` section if single)

2. **(If multi)** List the workstreams — ask user to name them. Accept short IDs + names.

3. **Team size?**
   - `solo` — Just you
   - `solo-with-collaborators` — Mostly you, others occasionally
   - `team` — Multiple active contributors

4. **Will someone else read this code soon?** (drives README + architecture.md enforcement) — `yes`/`no`/`eventually`

## Step 4: Apply defaults derivation

Before writing the file, set `methodology:` defaults based on answers:

- `methodology.model_routing` — from Round 2 question (default: `off`)
- `methodology.parking_lot_enabled: true` — always
- `methodology.session_state_local: .harness-state/` — always
- `methodology.session_state_remote: second-brain` — always

## Step 5: Write `.harness-profile`

Write the YAML to `./.harness-profile`. **Only emit the `workstreams:` section if `mode = multi`** — single-workstream projects skip it entirely.

Template:

```yaml
# .harness-profile — generated by project-init on [YYYY-MM-DD]
# Hand-editable. Drives tool manifest, session-start injection, drift detector, and phase gate strictness.
profile_version: 1

project:
  name: [detected or asked]
  type: [backend|webapp|fullstack|script]
  created: [YYYY-MM-DD]
  description: "[one-liner, max 2 sentences]"

audience:
  kind: [internal|public-free|paying|friends|unknown]
  size_estimate: "[range or 'unknown']"
  data_sensitivity: [none|pii|financial|health|regulated]

stakes:
  level: [low|medium|high|mission-critical]
  why: "[one-line reason]"

quality_bar:
  level: [prototype|production|mission-critical]
  typecheck_blocking: [true|false]
  lint_blocking: [true|false]
  test_required: [true|false]

stack:
  runtime: [bun|node|deno|python|rust|go]
  languages: [list]
  frameworks: [list]
  database: [name|deferred|none]
  llm_apis: [list]

# Only include if workstream mode is multi:
# workstreams:
#   mode: multi
#   plan_location: [second-brain|docs/plan.md]
#   active:
#     - {id: A, name: "..."}

deployment:
  targets: [list — local|staging|production]
  hosting: [name or tbd]
  rollback_required: [true|false]
  smoke_test_required: [true|false]

compliance:
  frameworks: [list]
  notes: [null or text]

team:
  size: [solo|solo-with-collaborators|team]
  handoff_ready: [true|false]

methodology:
  model_routing: [on|off]
  parking_lot_enabled: true
  session_state_local: .harness-state/
  session_state_remote: second-brain
```

## Step 6: Bootstrap session state directory

```bash
mkdir -p .harness-state
echo "Architect" > .harness-state/current_phase   # every project starts here
touch parking_lot.md
```

If `parking_lot.md` doesn't already exist, seed it with:

```markdown
# Parking Lot

Drop side-quests and unplanned issues here during micro-sessions instead of derailing.

Format: `- [YYYY-MM-DD] <one-line description> (source: micro-session goal X)`

## Open

## Resolved
```

Add `.harness-state/` to `.gitignore` if not already present. **Do not** gitignore `parking_lot.md` — it's committed so drift history is visible in git log.

## Step 7: Summary

Report what was written:

```
## Project Init Complete

**Profile:** .harness-profile
**State dir:** .harness-state/
**Parking lot:** parking_lot.md

### Captured:
- Project: [name] ([type])
- Audience: [kind], data sensitivity: [level]
- Stakes: [level] — [why]
- Quality bar: [level]
- Drift sensitivity: [low|medium|high]

### Next steps:
- Run `session-start` to open your first session
- Use `micro` to frame a focused work block
- Use `park` when a side-quest appears
- Use `session-end` to close out with an exit ritual

Edit `.harness-profile` anytime to adjust — it's plain YAML.
```

## Rules

1. **Never overwrite `.harness-profile` without explicit confirmation or `--force`.**
2. **Only emit `workstreams:` when `mode = multi`** — single-workstream profiles stay clean.
3. **Always write the `methodology:` section** — even if all defaults apply, so the user can see and override.
4. **Auto-detect aggressively** — every detected field is one less question.
5. **Respect the 3-round limit** — do not interrogate. If information is missing after 3 rounds, write a minimal profile with placeholders and comment them clearly.
6. **Never ask for data you can read from disk** — if `package.json` has the stack, don't ask for it.
