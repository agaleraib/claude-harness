# Partner Quickstart — {{PROJECT_NAME}}

One-page onboarding. Read this first, then read the [co-vibe protocol](https://github.com/agaleraib/claude-harness/blob/{{HARNESS_TAG}}/docs/co-vibe-protocol.md) for the full rules.

---

## Your assignment

**Spec:** `docs/specs/{{SPEC_FILE}}` — {{SPEC_TITLE}}
**Workstream:** {{WORKSTREAM_ID}} (`{{WORKSTREAM_PACKAGE}}`)
**Package / directory you will build in:** `{{PACKAGE_PATH}}` (isolated — no imports outside this boundary)
**Integrator (review + merge):** {{INTEGRATOR_NAME}}
**Escalation channel:** {{CHANNEL_TYPE}} — contact {{INTEGRATOR_NAME}} at `{{INTEGRATOR_HANDLE}}`

---

## One-time setup

Run these in order. All commands copy-paste verbatim.

### 1. Clone the project repo

```bash
cd ~
git clone {{REPO_URL}} ~/{{PROJECT_DIR}}
cd ~/{{PROJECT_DIR}}
```

### 2. Install Claude Code

If not already installed: https://claude.com/product/claude-code

### 3. Install claude-harness pinned to the shared tag

```bash
cd ~
git clone https://github.com/agaleraib/claude-harness.git
cd ~/claude-harness
git checkout {{HARNESS_TAG}}
```

Install user-level agents and skills from the tag:

```bash
mkdir -p ~/.claude/agents
cp .claude/agents/code-reviewer.md ~/.claude/agents/
cp .claude/agents/spec-planner.md ~/.claude/agents/
cp .claude/agents/project-tracker.md ~/.claude/agents/

for skill in session-start session-end micro park commit project-init \
             setup-harness deploy-check api-smoke-test migration-check a11y-check; do
  mkdir -p ~/.claude/skills/$skill
  cp skills/$skill/SKILL.md ~/.claude/skills/$skill/
done
```

**Do not `git pull` in `~/claude-harness` afterwards.** Stay on tag `{{HARNESS_TAG}}` until {{INTEGRATOR_NAME}} ships a new tag.

### 4. Verify project-level harness files are already in the repo

The following are **committed to the repo** — you already have them after cloning. **Do not** run `/setup-harness` or `/project-init`; they would overwrite files the integrator has tuned.

Verify they exist:

```bash
cd ~/{{PROJECT_DIR}}
ls .harness-profile CLAUDE.md criteria/ procedures/
```

All four should be present. If anything is missing, ping {{INTEGRATOR_NAME}} on {{CHANNEL_TYPE}} before continuing.

### 5. Create your branch

```bash
cd ~/{{PROJECT_DIR}}
git checkout master
git pull
git checkout -b {{BRANCH_NAME}} master
```

**Do not branch off any existing `{{WORKSTREAM_PREFIX}}-*` branch.** Start from `master`.

### 6. Create your personal plan file

Create `docs/plan-{{WORKSTREAM_ID}}.md` on your branch. This is your working plan file.
**Do not edit `docs/plan.md`** (that's the shared plan on master — integrator-only).

Commit the new file:

```bash
git add docs/plan-{{WORKSTREAM_ID}}.md
git commit -m "chore: add {{WORKSTREAM_ID}} plan file"
```

### 7. Read before coding

- The assigned spec (above) — your full assignment
- Any parent spec the integrator points you to (frozen contracts — read only, do not redesign)
- [`CLAUDE.md`](../CLAUDE.md) at repo root — project coding conventions
- [Co-vibe protocol](https://github.com/agaleraib/claude-harness/blob/{{HARNESS_TAG}}/docs/co-vibe-protocol.md) — full rules

### 8. Gate with the integrator

Screen-share your first `/session-start` + `/micro` on {{CHANNEL_TYPE}}. If that works, you're cleared to work solo.

---

## Daily loop

```bash
cd ~/{{PROJECT_DIR}}
git checkout master && git pull
git checkout {{BRANCH_NAME}}
git merge master
```

Then in Claude Code:

1. `/session-start` — sets today's goal from your plan file.
2. `/micro` — 30-60 min focused block on one task from the spec.
3. Write code → run `{{TYPECHECK_CMD}}` and `{{TEST_CMD}}`.
4. `/commit` — runs code-reviewer automatically. **If it flags an issue: fix or park. Never dismiss.**
5. When a spec task's "Done when" is satisfied: push and open a PR.
6. `/session-end`.

### Push and open PR

```bash
git push -u origin {{BRANCH_NAME}}
```

Then fill the PR body template below into a scratch file (e.g. `/tmp/pr-body.md` — don't commit it), and open the PR:

```bash
gh pr create --base master \
  --title "{{WORKSTREAM_ID}}: <spec task name>" \
  --body-file /tmp/pr-body.md
```

---

## PR body template

```markdown
## Spec
[`docs/specs/{{SPEC_FILE}}`](./docs/specs/{{SPEC_FILE}}) — <section name>

## Done when
<paste the exact "Done when" line from the spec>

## What changed
- <2-3 plain-language bullets>

## How I tested
- [ ] `{{TYPECHECK_CMD}}` clean
- [ ] `{{TEST_CMD}}` passes
- [ ] Smoke test: <describe or N/A>

## Parking lot items surfaced
- <anything you parked during this work, or "none">

## Unknowns / questions for reviewer
- <anything you're unsure about, or "none">
```

---

## Hard rules — do not break

- **Never `git push origin master`.** Only your own branch.
- **Never force-push.**
- **Never merge your own PR.** {{INTEGRATOR_NAME}} merges.
- **Never edit** `docs/plan.md`, `parking_lot.md`, or `.harness-profile` on master. Park in the PR body; the integrator transcribes.
- **Never run `/deploy-check`.**
- **Never touch protected branches** (e.g. promotion/staging branches) — that's the integrator's lane.
- **Stuck more than 20 minutes?** Park it, ping {{INTEGRATOR_NAME}} on {{CHANNEL_TYPE}}, move on to another task.

---

## Stop and ping the integrator before you

- Add a database migration or schema change.
- Add any new dependency beyond those named in the spec.
- Change anything in `.harness-profile`, `package.json`/`pyproject.toml` (outside adding your new package), CI files, or anything under `infra/`.
- Delete or skip a test.
- See a `code-reviewer` finding you don't understand.

---

## Communication rhythm

- **Start of day:** {{CHANNEL_TYPE}} message to {{INTEGRATOR_NAME}} — what task, any blockers. ~2 lines.
- **End of day:** PR link if opened, or "still in progress, here's where I am."
- **Async questions:** {{CHANNEL_TYPE}}. Don't wait for a sync if you're blocked > 20 min — park and message.

---

## Template variables

Fill in these placeholders before sending to the partner:

| Placeholder | Description | Example |
|---|---|---|
| `{{PROJECT_NAME}}` | Project display name | `wordwideAI` |
| `{{REPO_URL}}` | Clone URL | `https://github.com/agaleraib/wordwideAI.git` |
| `{{PROJECT_DIR}}` | Local folder name (cloned into ~/) | `wordwideAI` |
| `{{HARNESS_TAG}}` | Pinned harness version | `v0.1-co-vibe` |
| `{{SPEC_FILE}}` | Spec filename | `2026-04-15-sources-rss-mvp.md` |
| `{{SPEC_TITLE}}` | One-line spec description | `RSS Adapter MVP` |
| `{{WORKSTREAM_ID}}` | Workstream identifier | `workstream-b` |
| `{{WORKSTREAM_PACKAGE}}` | Package/module name | `@wfx/sources` |
| `{{WORKSTREAM_PREFIX}}` | Branch prefix to avoid | `workstream-b` |
| `{{PACKAGE_PATH}}` | Directory partner builds in | `packages/sources/` |
| `{{BRANCH_NAME}}` | Partner's branch name | `workstream-b-sources-rss-mvp` |
| `{{INTEGRATOR_NAME}}` | Integrator's name | `Albert` |
| `{{INTEGRATOR_HANDLE}}` | Contact handle | `@albert on Telegram` |
| `{{CHANNEL_TYPE}}` | Communication channel | `Telegram` |
| `{{TYPECHECK_CMD}}` | Type check command | `bun run typecheck` |
| `{{TEST_CMD}}` | Test command | `bun test` |
