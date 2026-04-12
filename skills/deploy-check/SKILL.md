---
name: deploy-check
description: Validate everything needed to deploy safely — env vars, secrets, rollback plan, smoke test script, monitoring. Run at the start of Deploy phase and before every production deploy.
disable-model-invocation: true
---

# Deploy Check

Verify the project is deploy-ready. This is the Deploy-phase entry gate made actionable: each check must pass before a production deploy is safe.

## Step 1: Read the profile

```bash
cat .harness-profile
```

Extract:
- `deployment.targets` — where we deploy
- `deployment.rollback_required` — is rollback mandatory?
- `deployment.smoke_test_required` — is smoke test mandatory?
- `stakes.level` — determines strictness
- `audience.data_sensitivity` — triggers security sub-checks
- `compliance.frameworks` — triggers compliance sub-checks

If profile missing, stop and tell the user to run `project-init`.

## Step 2: Run each check

### 2.1 Environment variables

- [ ] `.env.example` exists and lists every required variable
- [ ] Every var in `.env.example` has a placeholder or comment describing format
- [ ] No real values committed to `.env.example`

Check:
```bash
test -f .env.example || echo "❌ no .env.example"
```

### 2.2 Secrets not in repo

- [ ] `.env`, `.env.local`, `.env.production` are in `.gitignore`
- [ ] No secret patterns in recent commits

Check:
```bash
grep -E '^\.env(\..*)?$' .gitignore || echo "❌ .env not gitignored"
git log --all --oneline | head -20 | while read hash _; do
  git show "$hash" | grep -iE '(api_key|secret|password|token|bearer)=[a-zA-Z0-9]{16,}' && echo "⚠️  potential leak in $hash"
done
```

If `gitleaks` or `trufflehog` is installed, run it:
```bash
command -v gitleaks >/dev/null && gitleaks detect --no-git -v
```

### 2.3 Rollback plan

- [ ] `docs/deployment.md` exists (or `docs/runbook.md`) with a "Rollback" section
- [ ] Rollback section has 3-5 explicit steps
- [ ] Rollback section names the tool/command used (not just "revert the deploy")

If `deployment.rollback_required: true` and no rollback plan, **fail hard** and ask the user to write one before proceeding.

Template if missing:
```markdown
## Rollback

1. [How to identify the bad deploy — git SHA, deploy ID, timestamp]
2. [Exact command to revert — e.g., `vercel rollback <deploy-id>`, `git revert && git push`]
3. [Post-rollback verification — re-run smoke test, check error rate]
4. [Who to notify — even if solo, a note to yourself]
5. [DB migration handling if schema changed — see migration-check]
```

### 2.4 Smoke test script

- [ ] `scripts/smoke.sh` or `tests/smoke.spec.ts` (or equivalent) exists
- [ ] Script exercises the critical user path, not just `/health`
- [ ] Script accepts a `BASE_URL` env var so it can run against staging or prod

If `deployment.smoke_test_required: true` and no smoke test, fail hard.

### 2.5 Monitoring

- [ ] Error tracking configured (Sentry, Rollbar, Bugsnag, or self-hosted equivalent)
- [ ] Uptime check configured (UptimeRobot, BetterUptime, Pingdom, or hosting platform's native check)
- [ ] Logs accessible (where? `journalctl`? hosting dashboard? `kubectl logs`?)

If missing for `stakes.level ≥ medium`, warn (not fail).

### 2.6 Security sub-checks (if `data_sensitivity ≠ none`)

- [ ] `procedures/api-security-checklist.md` has been walked through in Test phase (confirm, don't re-run)
- [ ] HTTPS enforced on production host
- [ ] CORS allow-list is explicit, not `*`

### 2.7 Compliance sub-checks (if `compliance.frameworks` non-empty)

For each framework in the profile:
- `gdpr` — data export endpoint live, deletion endpoint live, privacy policy URL documented
- `hipaa` — PHI encryption verified, BAA on file
- `pci` — no raw card data stored, PCI scope documented
- `soc2` — audit trail logs accessible, access reviews documented

### 2.8 README deploy instructions

- [ ] `README.md` has a "Deploy" section with exact commands
- [ ] Production URL listed (or "pending first deploy")
- [ ] Required env vars listed (or linked to `.env.example`)

## Step 3: Report

Emit a checklist-style report:

```
## Deploy Check — [YYYY-MM-DD]

**Target(s):** [from profile]
**Stakes:** [level]
**Rollback required:** [yes|no]

### Results
✅ Env vars
✅ Secrets not in repo
❌ Rollback plan — MISSING
✅ Smoke test script
⚠️  Monitoring — no uptime check configured
✅ Security sub-checks (from Test phase)
n/a Compliance sub-checks
✅ README deploy section

### Action items before deploy
1. [each ❌ and each ⚠️ the user chose not to waive]
```

## Step 4: Block or pass

- **All ✅** → print: `✅ Deploy check passed. You are clear to deploy.`
- **Any ❌ in hard-fail categories** (secrets, env, rollback if required, smoke test if required) → refuse to proceed; list the blockers; do not offer to bypass.
- **Any ⚠️** → ask the user explicitly: "Do you want to waive [item] or address it first?"

## Rules

1. **Never bypass hard fails.** The user can't talk you into skipping a rollback plan.
2. **Run this every time before a production deploy**, not just the first time. Things drift.
3. **Do not run the actual deploy.** This skill only checks readiness. The deploy command is the user's to execute.
4. **Compliance checks require verification**, not self-certification. "Yes we have it" without evidence = ❌.
