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
3. Install claude-harness **pinned to a specific tag** — the integrator will send the tag name (e.g. `v0.1-co-vibe`). Clone the harness repo, checkout the tag, and copy agents + skills into `~/.claude/`. **Do not** run `setup-harness` or `project-init` — the integrator has already committed project-level harness files (`.harness-profile`, `CLAUDE.md`, `criteria/`, `procedures/`) to the repo. Running those skills would overwrite them.
4. Verify project-level harness files exist after cloning: `.harness-profile`, `CLAUDE.md`, `criteria/`, `procedures/`. If any are missing, ping the integrator before continuing.
5. Create a dedicated branch: `git checkout -b workstream-X/<short-name> master` (X = workstream ID).
6. Copy the assigned spec into `docs/specs/` on the branch if not already there, and commit.
7. Create a personal plan file on the branch: `docs/plan-workstream-X.md`. This is the partner's plan — the shared `plan.md` on `master` is off-limits until merge.
8. Read `CLAUDE.md` at repo root, the assigned spec (plus any parent spec the integrator references), and this protocol before touching code.

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
10. **Periodically:** if `triage_parking.enabled: true` in `.harness-profile`, run `/triage-parking` to classify stale items, archive expired ones, and ship a draft PR for any item marked `[auto-ok]`. Integrator-only — partners never run this on shared `parking_lot.md`.

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
- Partner checks out that exact tag and copies agents + skills into `~/.claude/` (see onboarding step 3). The partner does **not** run `setup-harness` or `project-init` — the integrator has already committed project-level files to the repo.
- Integrator never pushes harness changes directly into the partner's setup. When updates are ready: integrator reviews, cuts a new tag (e.g. `v0.2-co-vibe`), and notifies the partner to pull.
- This prevents "harness drift" — partner's `/commit` or `/verify` behaving differently day-to-day for reasons the partner can't diagnose.

---

## Escalation channel

The escalation channel is the single place where partner and integrator communicate about work. Pick **one** channel — not two, not "DMs for urgent, group for normal." One channel, one place to search history.

### What makes a good channel

| Requirement | Why |
|---|---|
| **Async-first** | Both people are in flow most of the day. Synchronous interrupts kill vibe-coding. |
| **Searchable history** | "Did Albert approve adding cheerio?" must be answerable by searching, not by memory. |
| **File/image sharing** | Screenshots of failing tests, spec snippets, PR links. |
| **Low ceremony** | If sending a message takes more than 5 seconds, people won't escalate — they'll guess. |

### Recommended channels (pick one)

- **Telegram** — best for 2-person teams. Fast, searchable, screenshot-friendly, no setup overhead. Use a dedicated chat (not a group with other topics).
- **Slack DM or private channel** — good if both are already in a shared Slack workspace. Private channel is better than DM for search history.
- **Discord private channel** — same as Slack, different platform.
- **GitHub issue thread** — works if both are disciplined about writing. Slower, but creates a permanent audit trail linked to the repo.

Avoid: email (too slow, poor threading), SMS/iMessage (no search, no formatting), voice-only calls (no record).

### What goes in the channel

| Message type | Example | Expected response time |
|---|---|---|
| **Start of day** | "Today: RSS parser §4, no blockers" | Acknowledge within 1 hour |
| **End of day** | "PR #12 open, or: still on §4, will push tomorrow" | Acknowledge next morning |
| **Stuck > 20 min** | "Parked: can't get feed timeout right, moved to §5" | Triage within 2 hours |
| **Escalation trigger** | "Want to add `cheerio` — not in spec §7, OK?" | **Block until answered** |
| **Gate request** | "Ready for first screen-share" | Schedule within 24 hours |

### What does NOT go in the channel

- Code reviews — those happen in the PR on GitHub.
- Detailed technical discussion — write it in the PR body or a spec amendment, then link it in the channel.
- Status updates beyond start/end of day — if more detail is needed, the spec or plan file is the place.

The channel is for coordination, not collaboration. The repo is where work lives.

---

## Communication rhythm

- **Start of day:** message in the escalation channel — what task, any blockers. ~2 lines, not a standup essay.
- **End of day:** PR link if opened, or "still in progress, here's where I am." ~2 lines.
- **Async questions:** escalation channel. Don't wait for a sync if you're blocked > 20 min — park it and message immediately.
- **Weekly (optional):** 15-min video call to review merged PRs, upcoming tasks, and any process friction. Skip if everything is flowing.

---

## Per-project glue

The project repo should carry a one-page `docs/partner-quickstart.md` that fills in the project-specific bits this protocol leaves open. A template ships with the harness at [`docs/partner-quickstart-template.md`](partner-quickstart-template.md).

Fill in the template variables and commit as `docs/partner-quickstart.md` in the project repo:

- Which workstream/spec the partner is handed.
- The specific harness tag name.
- The integrator's contact handle and escalation channel.
- Project-specific commands (typecheck, test, smoke test).
- Any project-specific rules (protected branches, deploy gates, etc.).
