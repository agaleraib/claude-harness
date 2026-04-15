# Co-Vibe Coding Protocol

For two people vibe-coding the same repo when neither has done it before. Optimized for safety over speed.

## Principle

**One workstream, one branch, one human.** The partner never touches `master` directly, never touches protected branches (e.g., `playground-live`), never edits shared state files on `master`. Everything flows through PRs that the integrator reviews and merges.

## Roles

- **Integrator** — owns `master`, protected branches, shared state files (`plan.md`, `parking_lot.md`, `.harness-profile`). Reviews and merges all PRs. Transcribes parking-lot items post-merge. Updates `plan.md` post-merge.
- **Workstream builder** — owns one spec, one branch. Produces PRs. Never edits shared state files on `master`.

---

## Partner onboarding (one-time, ~30 min)

Send the partner this checklist verbatim:

1. Clone the project repo. If the local folder name matters, use: `git clone <url> <desired-folder-name>`.
2. Install Claude Code if not already installed.
3. Install claude-harness **pinned to a specific tag** — the integrator will send the tag name (e.g. `v0.1-co-vibe`). Checkout that tag and run `setup-harness` from inside the project repo.
4. Run `/project-init` using the integrator's `.harness-profile` as a template (the integrator will send it as a file or gist).
5. Create a dedicated branch: `git checkout -b workstream-X/<short-name> master` (X = workstream ID).
6. Copy the assigned spec into `docs/specs/` on the branch if not already there, and commit.
7. Create a personal plan file on the branch: `docs/plan-workstream-X.md`. This is the partner's plan — the shared `plan.md` on `master` is off-limits until merge.
8. Read `docs/methodology.md`, the assigned spec, and this protocol before touching code.

**Gate:** partner screen-shares their first `/session-start` + `/micro` with the integrator. If that works, they are cleared to work solo.

---

## Partner's daily loop

1. `git checkout master && git pull && git checkout <their branch> && git merge master` (keeps drift small).
2. `/session-start` — sets goal from their workstream plan file.
3. `/micro` — 30–60 min focused block per task from the spec.
4. Code → `/verify` (if UI) or run tests.
5. `/commit` — runs code-reviewer automatically. **If reviewer flags issues: fix or park. Never dismiss.**
6. When a spec task's "Done when" is satisfied: push the branch, open a PR.
7. `/session-end`.

### Hard rules (partner)

- Never `git push origin master` — only their own branch.
- Never force-push.
- Never merge their own PR.
- Never edit `plan.md`, `parking_lot.md`, or `.harness-profile` on `master`. Parking goes in their workstream file; the integrator transcribes at merge.
- Never run `/deploy-check` or touch protected/promotion branches (e.g. `playground-live`) — that's the integrator's lane.
- If stuck for more than 20 minutes: park it, message the integrator, move on to another task.

### Escalation triggers — partner must stop and ping the integrator

- Any database migration or schema change.
- Any new npm (or equivalent) dependency.
- Any change to `.harness-profile`, `package.json`, CI files, or anything under `infra/`.
- Any test they want to delete or skip.
- `code-reviewer` flags something they do not understand.

---

## PR protocol

### Opening (partner)

- PR title: `workstream-X: <spec task>` — one spec task per PR when possible. Small PRs merge fast.
- PR body (use this template verbatim):

```markdown
## Spec
Link to `docs/specs/<file>.md` + task name

## Done when
Paste the "Done when" line from the spec

## What changed
2-3 bullets in plain language

## How I tested
- [ ] `/verify` passed (if UI)
- [ ] Type check clean
- [ ] Tests pass
- [ ] Smoke test: <command or N/A>

## Parking lot items surfaced
List anything parked during this work

## Unknowns / questions for reviewer
Anything unclear
```

### Reviewing (integrator) — run this checklist every time

1. **Scope check** — does the diff match the spec task? Reject scope creep immediately.
2. **Run `code-reviewer` agent** on the PR diff. Any "real issue" finding is blocking.
3. **Pull the branch locally**, run type-check + tests. Do not trust the PR body.
4. **If UI:** run `/verify` on the branch.
5. **If API/schema:** run `/api-smoke-test` and `/migration-check` as applicable.
6. **Read every changed file** — not just the diff. Vibe-coded code often adds unexpected files.
7. **Check for unauthorized edits** to `plan.md`, `parking_lot.md`, `.harness-profile`, CI configs, `package.json` deps. If any appear, ask why before merging.
8. **Post-merge:** transcribe parking-lot items from the PR body into the real `parking_lot.md` on `master`.
9. **Post-merge:** update `plan.md` on `master` to mark the task done.

### Merging

- Use `--no-ff` merge to preserve history.
- Merge commit message references the spec task.
- After merge: partner runs `git checkout <their branch> && git pull origin master && git rebase master` before the next micro.

### Rejection / changes requested

- Be explicit: "fix X, then re-request review." Do not let the partner guess.
- If the PR is fundamentally off-spec: close it, rewrite the spec task, hand back.

---

## Harness version discipline

- Integrator cuts a git tag on claude-harness (e.g. `v0.1-co-vibe`) at the start of the collaboration.
- Partner checks out that exact tag and runs `setup-harness` from it.
- Integrator never pushes harness changes directly into the partner's setup. When updates are ready: integrator reviews, cuts a new tag (e.g. `v0.2-co-vibe`), and notifies the partner to pull.
- This prevents "harness drift" — partner's `/commit` or `/verify` behaving differently day-to-day for reasons the partner can't diagnose.

---

## Communication rhythm

- **Start of day:** 5-min sync — what task, any blockers.
- **End of day:** PR link, or "still in progress, here's where I am."
- **Async channel** (Slack/Discord/etc.) for parking-lot questions so the integrator is not interrupted mid-flow.

---

## Per-project glue

The project repo should carry a one-page `docs/partner-quickstart.md` that fills in the project-specific bits this protocol leaves open:

- Which workstream/spec the partner is handed.
- The specific harness tag name.
- The integrator's contact and escalation channel.
- Any project-specific rules (protected branches, deploy gates, etc.).
