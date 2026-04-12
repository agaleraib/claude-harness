# Phase 4 — Deploy

> Purpose: Get the code in front of real users safely. Not just "push it live" — includes environment validation, secret management, rollback readiness, smoke testing, and monitoring.
>
> Rule: A deploy without a rollback plan is not a deploy, it's a gamble. Even for prototypes, know how you'd back out.

## Entry gate (must be true to enter)

- [ ] Phase 3 (Test) exit gate fully green
- [ ] `.harness-state/current_phase` = `Deploy`
- [ ] `.harness-profile` has `deployment.targets` set
- [ ] No open P0 or P1 issues from Test phase

## Required tools

| Tool | When | Why |
|---|---|---|
| `deploy-check` skill | At phase start | Validates env vars, secrets, hosting config, rollback plan, smoke test script |
| `api-smoke-test` skill | After deploy to each target | End-to-end curl/jq flow against the **live** URL |
| `migration-check` skill | If any DB schema changed since last deploy | Reversibility check before running migration in production |
| `code-reviewer` agent | One final pass | Catch anything that slipped through — especially secret leaks, debug code left behind |
| `session-start` / `session-end` | Daily | This phase can take several sessions — don't abandon the ritual |

## Required artifacts (must exist to exit)

- [ ] **Env var audit** — every required env var documented in `.env.example`, production values set in hosting platform
- [ ] **Secret audit** — no secrets in repo, all secrets in hosting platform's secret store, rotation schedule documented
- [ ] **Rollback plan** — written, 3-5 steps, explicit on what "rollback" means (git revert? Previous deploy tag? DB restore?)
- [ ] **Smoke test script** — automated or scripted, exercises the critical user path against the live URL
- [ ] **Monitoring configured** — at minimum: error tracking (Sentry, Rollbar, etc.) and uptime check
- [ ] **Staging deployment successful** (if `deployment.targets` includes `staging`)
- [ ] **Production deployment successful** (if `deployment.targets` includes `production`)
- [ ] **Post-deploy smoke test green** — run after each deploy

## Exit gate (must be true to declare "shipped")

- [ ] App is reachable at the intended URL(s)
- [ ] Smoke test script runs green against the live deploy
- [ ] Rollback plan has been dry-run in staging (not just written — actually executed once)
- [ ] Error tracking confirmed receiving events (throw a test error, verify it shows up)
- [ ] Uptime check is alerting (kill the service briefly, verify you get notified; then restore)
- [ ] `README.md` has current deploy instructions and the URL(s)
- [ ] `.harness-profile` updated: `deployment.hosting` filled in with actual platform name
- [ ] Write `.harness-state/current_phase` = `Operate` (you're now in maintenance mode)
- [ ] Run `pivot-check` skill — confirm spec and docs still reflect what's actually live

## Common pitfalls

1. **"It works on staging"** — staging and prod environments diverge. Production is a different test.
2. **Deploying on a Friday** — unless you have on-call coverage, you're volunteering for weekend fire drills.
3. **No rollback plan because "I'll figure it out if something breaks"** — you won't, you'll panic. Write it down now.
4. **Secrets in env files committed to git** — run a secret scan (`gitleaks`, `trufflehog`) before the first deploy.
5. **No monitoring because "it's small"** — small apps break silently. Even a simple uptime check is better than none.
6. **Deploying without re-running code-reviewer** — a week has passed since Test phase; something may have changed.
7. **Forgetting to update README** — future-you (or a collaborator) won't know how the deploy works.
8. **Skipping the rollback dry-run** — a plan you haven't tested is a hope.

## Decision matrix

| `deployment.rollback_required` | `stakes.level` | What this phase minimally requires |
|---|---|---|
| `false` | `low` | Env vars + smoke test. Rollback plan still recommended. |
| `true` | `medium` | All the above + tested rollback + error tracking |
| `true` | `high` | All the above + uptime monitoring + staging mirror |
| `true` | `mission-critical` | All the above + on-call rotation + runbook + incident response plan |

## Compliance add-ons (if applicable)

Read the `procedures/api-security-checklist.md` "Compliance add-ons" section and verify each applicable item is in place before going live.

## What this phase does NOT do

- Ongoing operations (post-launch — that's Operate)
- User onboarding / marketing (product work, not engineering)
- Feature additions (go back to Architect)

## After exit

Once exit gate is green, the project enters **Operate** mode:
- Daily flow still uses `session-start` / `micro` / `park` / `session-end`
- New features cycle back through Architect → Code → Test → Deploy (short-form for small features, full-form for big ones)
- `pivot-check` runs automatically at 14-day intervals to catch spec vs. reality drift
- Monitor alerts, triage issues, fix forward

**Celebrate.** Actually shipping is the rarest thing in software — note the date in `.harness-state/shipped.md` with the URL and your one-line retrospective.
