# Claude Harness Cheatsheet

> Keep this open next to the project. One page. Don't leave home without it.

## 🌅 Starting a session (every morning, 2 min)

```
session-start
```
Reads profile + plan + last exit note. Sets ONE goal for today. Shows parking lot.

## 🎯 Starting a work block (every 30–90 min)

```
micro
```
Asks for goal (more specific than today's goal) + budget (time or done). Writes the frame.

**Rules inside a block:**
- ONE goal. Nothing else.
- Side-quests → `park "<description>"` — never context-switch mid-block.
- End with a commit, even WIP.

## 📌 A distraction just surfaced

```
park "brief description of the side-quest"
```
One-liner to `parking_lot.md`. You stay on your current goal. Triaged at session-end.

## 🌙 Ending a session (every close, 5 min)

```
session-end
```
Three parts, all mandatory:
1. State of play (hit / partial / drifted / blocked)
2. Parking lot triage (keep / resolve / promote / delete)
3. Tomorrow's first move (one sentence)

## 🚨 Drift detector signals

The drift hook fires on Stop events. If you see:

```
⚠️  DRIFT DETECTOR
  • Micro-session running 60m with no commits
  • Parking lot grew by 3 items this session
```

Your options:
- **Commit WIP** and start a fresh `micro` with a narrower goal
- **Promote a parking lot item** to be the new focus
- **`session-end`** and come back with a clearer head

After 2 ignores: the hook blocks next tool use until you address it.

---

## 📅 The 4 phases

```
Architect → Code → Test → Deploy → (Operate)
  spec      build   verify  ship     feature cycles restart here
```

**Phase entry/exit gates** in `procedures/phase-N-<name>.md`. Don't cross a gate without reading the checklist.

### Phase 1 — Architect (spec before code)
- Run `spec-planner` once at the start → writes `docs/specs/YYYY-MM-DD-*.md`
- Required artifacts: dated spec, `docs/architecture.md`, `docs/plan.md`
- **Exit:** spec approved, every feature has hard-threshold AC, every task has Files/Depends-on/Verify

### Phase 2 — Code (build what the spec says)
- Daily `session-start` → `micro` → `park` → `session-end` loop
- `code-reviewer` agent after each feature
- `generator` agent for webapp sustained builds
- **Exit:** all sprint contracts verified, typecheck/lint/tests green, no regressions

### Phase 3 — Test (adversarially)
- `code-reviewer` against all `criteria/` rubrics
- `ui-evaluator` for webapp (Playwright)
- `api-smoke-test generate` then `api-smoke-test run http://localhost:3000`
- `a11y-check` for webapp
- `migration-check` if DB changed
- `procedures/api-security-checklist.md` if data sensitivity > none
- **Exit:** all criteria ≥ 7/10, zero P0 issues, security checklist passed

### Phase 4 — Deploy (or it didn't ship)
- `deploy-check` — validates env/secrets/rollback/smoke/monitoring
- `api-smoke-test run https://staging.yourapp.com` then prod
- Dry-run the rollback plan once in staging
- **Exit:** live, smoke test green, error tracking receiving, uptime alerting, README updated

---

## 🔄 Roadmap drift check

Runs automatically every 14 days via session-start. Also run manually anytime:

```
pivot-check
```

Routes to one of: on-track / refresh-docs / partial-pivot / full-pivot / can't-tell.

---

## 🛠 Tool quick-reference

| Situation | Tool |
|---|---|
| New project | `setup-harness` then `project-init` |
| New idea, nothing written | `spec-planner` |
| Opening the day | `session-start` |
| Starting a work block | `micro` |
| Distraction appeared | `park "<it>"` |
| Block done | commit + `micro` or `session-end` |
| End of day | `session-end` |
| Review code | "use the code-reviewer" |
| Test UI (webapp) | "use the ui-evaluator" |
| Sustained build (webapp) | "use the generator" |
| Smoke test | `api-smoke-test` |
| DB migration | `migration-check` |
| A11y audit | `a11y-check` |
| Before deploy | `deploy-check` |
| Docs vs code drift | `pivot-check` |

---

## 🧭 When you're lost

| Feeling | Command |
|---|---|
| "What was I doing?" | `session-start` (reads last exit note) |
| "I have no plan" | `spec-planner` |
| "I'm deep in a refactor that wasn't planned" | Stop. `park` it or frame new `micro` |
| "I want to deploy, not sure I'm ready" | `deploy-check` |
| "The plan doesn't match the code anymore" | `pivot-check` |
| "Drift detector keeps firing" | Fresh `micro` with narrower goal, or `session-end` |

---

## 📜 Core rules

1. **Every session starts with `session-start`.** No exceptions.
2. **Every work block is a `micro`.** One goal, one budget, one commit.
3. **Every distraction goes to `park`.** Never in your head.
4. **Every session ends with `session-end`.** Five minutes that save thirty tomorrow.
5. **Spec before code.** Vague intent = wasted work.
6. **Gates are real.** Don't cross without the checklist green.
7. **Rollback or it didn't ship.** No exceptions.
8. **Commit often.** Every micro ends with a commit.
9. **Test adversarially.** The goal is to find problems, not confirm.
10. **Drift is the enemy.** Catch it at all three scales: micro (minutes), day (hours), roadmap (weeks).
