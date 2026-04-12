# Phase 3 — Test

> Purpose: Verify the built code against the spec, the criteria rubrics, security expectations, and real usage. Catch regressions and surface anything you skipped in Code.
>
> Rule: Test phase is adversarial. The goal is to find problems, not confirm everything's fine. If you find nothing, you didn't test hard enough.

## Entry gate (must be true to enter)

- [ ] Phase 2 (Code) exit gate fully green
- [ ] `.harness-state/current_phase` = `Test`
- [ ] All phase-1 sprint contracts from `docs/plan.md` marked complete
- [ ] Local dev environment runs; the happy path works manually

## Required tools

| Tool | When | Why |
|---|---|---|
| `code-reviewer` agent | At phase start | Scores against all applicable `criteria/` rubrics, reports gaps with line numbers |
| `ui-evaluator` agent (webapp/fullstack only) | After code-reviewer | Playwright-driven adversarial UI test against `criteria/frontend-ui-design.md` etc. |
| `api-smoke-test` skill (backend/fullstack with HTTP) | Once per phase | End-to-end curl/jq flow test of the primary API paths |
| `procedures/api-security-checklist.md` | If `audience.data_sensitivity ≠ none` | Manual walkthrough of every API route against the checklist |
| `a11y-check` skill (webapp/fullstack only) | Once per phase | axe-core audit of key screens |
| `migration-check` skill (if database changed) | Before moving to Deploy | Reversibility + backfill safety |

## Required artifacts (must exist to exit)

- [ ] **Code-review report** from code-reviewer agent, scored against every applicable rubric in `criteria/`
- [ ] **UI eval report** (webapp/fullstack) from ui-evaluator with screenshots + specific feedback
- [ ] **Security checklist** walked through and each box checked (if `data_sensitivity ≠ none`)
- [ ] **Test suite green** — all existing tests pass, plus regression tests added for any bugs found in this phase
- [ ] **Smoke test run** of the critical user path (automated or manually scripted)
- [ ] Any gaps surfaced by reviews/tests are either fixed or explicitly deferred with a parking-lot entry

## Exit gate (must be true to move to Deploy phase)

- [ ] All code-reviewer scores ≥ 7/10 on applicable rubrics (or each lower score has an acknowledged waiver with reason)
- [ ] Zero P0 issues outstanding from ui-evaluator (webapp) — P1/P2 can be parking-lotted
- [ ] Security checklist: every applicable box checked (not "will do later")
- [ ] Test suite green (100% of existing tests passing)
- [ ] No regressions — features that worked at Code phase exit still work
- [ ] Performance sanity check: critical operations under acceptable thresholds (define per project, e.g., "dashboard loads in <2s on throttled connection")
- [ ] Compliance add-ons (if `compliance.frameworks` has entries): each framework's requirements verified
- [ ] Write `.harness-state/current_phase` = `Deploy`

## Common pitfalls

1. **Confirmation testing** — running tests that you know will pass. Instead: try to break things. Empty inputs, huge inputs, special characters, rate limits, concurrent users, network failures.
2. **Ignoring the ui-evaluator** — "it looks fine to me." The agent's job is to find what you missed. Read the report.
3. **Checking security boxes without verifying** — the checklist is useless if you just tick boxes. Actually open the code path and look.
4. **Deferring everything to Deploy** — "I'll catch that in smoke test." No, you'll catch it in production.
5. **Testing only the happy path** — what about empty results, invalid auth, malformed input, timeouts, rate limits?
6. **No regression tests for bugs found** — if you fix a bug in Test phase without a test, it will come back.

## Decision framework for issues surfaced

| Severity | Action |
|---|---|
| **P0** (security, data loss, complete breakage) | Fix now, re-test, do not move to Deploy |
| **P1** (significant feature broken or degraded) | Fix now if within scope, otherwise explicit defer with parking-lot entry |
| **P2** (minor bug, cosmetic, edge case) | Park it, move on |
| **Out-of-scope improvement** | Park it, move on |

## What this phase does NOT do

- Deploy to production (Deploy phase)
- Load testing at scale (that's a dedicated subphase of Deploy or post-launch)
- Live user testing (post-launch)

## Transition to Deploy phase

When the exit gate is green:

1. Commit any test-phase fixes
2. Ensure test suite is still green after those fixes
3. Write `.harness-state/current_phase` = `Deploy`
4. Update `docs/plan.md` with deploy checklist items (env vars, secrets, hosts, monitoring)
5. `session-end` with tomorrow's starter: "Begin Deploy phase — env validation, staging smoke, rollback plan"
