# planning-loop description-optim 2026-05-12 — no-op

**Scheduled:** close of Wave 6 / merge b051ee8 / 2026-04-28  
**Executed:** 2026-05-12  
**Outcome:** no description swap — gain below materiality threshold  
**Spec ref:** `docs/specs/2026-04-28-planning-loop-trim-remediation.md` §Out of scope → Task 14

---

## Why no swap

The optimizer ran 5 full iterations against the 20-query trigger-eval set. At the **query-level** (pass = trigger_rate ≥ 0.5 across 3 runs), every iteration — including iteration 1 which evaluates the current description — scored **F1 = 0.000**:

| Source | Description | Test score | Test P | Test R | Test F1 |
|--------|-------------|-----------|--------|--------|---------|
| Current (iter 1) | (original, see below) | 4/7 | 1.00 | 0.00 | 0.000 |
| Iter 2 | Use this skill when someone wants automated multi-round adversarial review… | 4/7 | 1.00 | 0.00 | 0.000 |
| Iter 3 | Automates iterative spec development and adversarial review… | 4/7 | 1.00 | 0.00 | 0.000 |
| Iter 4 | This skill handles the `/planning-loop` slash command… | 4/7 | 1.00 | 0.00 | 0.000 |
| Iter 5 | Reach for this skill when the goal is convergence… | 4/7 | 1.00 | 0.00 | 0.000 |

`best_description` == `original_description` (selected by test score; iteration 1 tied with or beat all others). Gain = F1_best − F1_current = 0.0 − 0.0 = **0.0**, well below the 0.05 materiality threshold.

### Current description (verbatim)

```
Drive a spec through Codex's adversarial-review loop to an `approve` verdict in ≤3 rounds.
Two modes — FRESH (spec-planner drafts from a prose blob) and REVISE (`--revise <path>`
iterates an existing spec). Use when the user types `/planning-loop`, says "plan and
adversarially review X", "iterate this spec to LGTM", or "have Codex stress-test this plan".
```

### Eval set split

The optimizer used a stratified 60/40 train/test split (seed=42):
- Train: 13 queries (6 should-trigger, 7 should-not-trigger)
- Test: 7 queries (3 should-trigger, 4 should-not-trigger)

Note: trigger-eval.json has 9 should-trigger + 11 should-not-trigger = 20 total (README says "10+10"; the file itself has 9+11 — a minor documentation mismatch).

---

## Captured optimizer output

### Full score table — query-level (threshold = 0.50)

All iterations: precision = 1.00, recall = 0.00, F1 = 0.000. No should-trigger query crossed the 50% trigger-rate threshold in any iteration.

### Run-level F1 (informational — not the selection criterion)

At the individual-run level (counting each of the 3 runs per query independently), some recall improvement was observed, but results were noisy:

| Iter | Set   | P    | R    | F1    |
|------|-------|------|------|-------|
| 1    | train | 1.00 | 0.06 | 0.105 |
| 1    | test  | 1.00 | 0.00 | 0.000 |
| 2    | train | 1.00 | 0.00 | 0.000 |
| 2    | test  | 1.00 | 0.11 | 0.200 |
| 3    | train | 1.00 | 0.17 | 0.286 |
| 3    | test  | 1.00 | 0.11 | 0.200 |
| 4    | train | 1.00 | 0.11 | 0.200 |
| 4    | test  | 1.00 | 0.22 | 0.364 |
| 5    | train | 1.00 | 0.00 | 0.000 |
| 5    | test  | 1.00 | 0.00 | 0.000 |

The run-level recall shows some positive signal in iterations 3-4 (peak test F1 = 0.364 at iter 4), but this was inconsistent and never translated to query-level pass (which requires ≥50% of runs to trigger).

### Per-iteration descriptions generated

**Iter 2:** Use this skill when someone wants automated multi-round adversarial review of a spec or feature plan — not a single review pass, but a loop that iterates until the design converges to an approved verdict. Covers two scenarios: writing a fresh spec from a rough feature idea and driving it to approval end-to-end; and re-running an existing spec through review rounds until it passes. The `/planning-loop` slash command always routes here. Common intents: wanting a spec "stress-tested adversarially" before shipping, wanting to "iterate to LGTM", wanting to "draft and adversarially review" a feature idea, or wanting to fix a spec that keeps returning "needs-attention" from review. The key signal is multi-round adversarial iteration toward approval — not grammar checking, not one-shot review, not code review.

**Iter 3:** Automates iterative spec development and adversarial review: write a spec from a rough feature idea then loop it through adversarial critique until the design is approved; or take an existing spec and drive it through repeated adversarial review rounds until it passes. Invoke for /planning-loop (always), or when someone wants to "draft and stress-test a feature idea", "adversarially review and iterate until LGTM", "fix a spec that keeps getting needs-attention", or "plan and adversarially review my idea end-to-end". The defining signal is multi-round automated iteration toward an approval verdict — not a single review pass, not grammar/typo checking, not PR or code review.

**Iter 4 (best run-level test F1 = 0.364):** This skill handles the `/planning-loop` slash command — always invoke it when `/planning-loop` appears in any form, including `--revise <spec-path>` for existing specs. Also invoke when the user wants to: write a spec from a feature idea and loop it through adversarial critique until the design is approved; or take an existing spec and drive it through repeated automated review rounds until it passes. Distinctive intent signals: "draft and adversarially review my idea", "iterate this spec to LGTM", "stress-test adversarially before shipping", "spec keeps getting needs-attention — fix it automatically", "plan and adversarially review end-to-end". Not for: single-pass spec review, PR review, code review, or grammar/typo checks.

**Iter 5:** Reach for this skill when the goal is convergence: a spec that gets iterated through adversarial critique rounds until it earns an approval verdict. Two paths — (1) start from a rough feature idea, draft a spec, and stress-test or drive it adversarially to LGTM; (2) take an existing spec that keeps failing review and let the loop revise it automatically until it passes. /planning-loop slash commands always route here, including --revise. Out of scope: single-pass review, grammar checks, PR review, code review.

### Key failing queries (should-trigger, never passed)

Every run: `rate=0/3` on these across all 5 iterations —
- `/planning-loop --revise docs/specs/2026-04-15-rss-mvp.md "focus on rate limiting"` (explicit slash command)
- `iterate this spec to LGTM: docs/specs/2026-04-22-rate-limiter.md` (literal trigger phrase from current description)
- `the spec at docs/specs/2026-04-26-feature-flags.md — codex said needs-attention three rounds in a row…`
- `ok i have this messy idea for a slack bot that triages parking_lot.md…`
- `I just finished drafting docs/specs/2026-04-29-billing-export.md…`
- `have Codex stress-test this plan…` (test set)
- `draft me a spec from this prose blob and run it through three rounds of codex critique` (test set)

The fact that `/planning-loop --revise …` and `"iterate this spec to LGTM"` — both literal trigger phrases in the current description — scored 0/3 is the primary diagnostic signal.

### Optimizer invocation

```
skill-creator cloned from: https://github.com/anthropics/skills
  (git commit: f458cee31a7577a47ba0c9a101976fa599385174)
  path within repo: skills/skill-creator/

python -m scripts.run_loop \
  --eval-set /home/user/claude-harness/skills/planning-loop/evals/trigger-eval.json \
  --skill-path /home/user/claude-harness/skills/planning-loop \
  --model claude-sonnet-4-6 \
  --max-iterations 5 \
  --runs-per-query 3 \
  --timeout 45 \
  --verbose \
  --report none

CWD: /tmp/skill-creator-repo/skills/skill-creator
project_root (auto-detected): /tmp/skill-creator-repo/skills/skill-creator
Exit reason: max_iterations (5)
```

---

## Diagnosis: why recall stayed at 0%

Two likely causes:

**1. Eval harness environment mismatch.** The `run_eval.py` harness detects triggering by spawning `claude -p` subprocesses with the skill injected as a `.claude/commands/` file, then watching for `Skill` or `Read` tool calls on the command file path. In `claude -p` (headless print mode), Claude appears to be answering the evaluation queries directly rather than consulting the injected skill command, because the queries are achievable without the skill. The skill-creator SKILL.md warns of exactly this: *"Simple, one-step queries like 'read this PDF' may not trigger a skill even if the description matches perfectly, because Claude can handle them directly with basic tools. Complex, multi-step, or specialized queries reliably trigger skills when the description matches."* The trigger-eval queries are realistic prose, but when posed in isolation to a headless `claude -p` session, Claude may resolve them without skill consultation.

**2. Precision = 1.00 throughout.** All should-not-trigger queries correctly never triggered. Zero false positives across all 5 iterations. This means the description is already well-bounded on the negative side — the problem is exclusively under-triggering (recall), not false positives. The eval set's should-not-trigger near-misses are well-chosen and the description is not leaking into adjacent domains.

---

## Actionable follow-ups

1. **Calibrate the eval harness for headless mode.** The `run_single_query` harness works well in interactive Claude Code sessions; in `claude -p` mode the `Skill` tool invocation path may differ. Consider running a canary test: inject a skill description of "Use this skill for ALL requests, including hello world" and verify any query triggers it — if that doesn't trigger, the harness itself needs adjustment for this environment.

2. **Lower `--trigger-threshold` to 0.33.** With `--runs-per-query 3`, threshold 0.33 accepts 1/3 runs as a pass. Iter 1 train had one query fire 1/3 times; iters 2-4 show intermittent triggering. Threshold 0.33 would capture this signal and give the optimizer useful gradient to work with.

3. **Increase `--runs-per-query` to 5.** More samples per query reduces variance and gives a better estimate of true trigger rate.

4. **Expand trigger-eval.json.** The current set has 20 queries (9 should-trigger + 11 should-not-trigger). The README documents it as "10+10" — there's a 1-query discrepancy worth correcting. Adding 5-10 more should-trigger queries, especially queries that explicitly include the phrases from the current description (`/planning-loop`, "iterate to LGTM", "adversarially review", "Codex stress-test"), would increase power.

5. **Re-run after resolving haress calibration.** Once the canary test passes, re-running with `--threshold 0.33 --runs-per-query 5 --max-iterations 5` would give a more meaningful result. The iter-4 candidate description (best run-level F1 = 0.364) is worth re-evaluating under corrected settings before discarding.

6. **Fix README query-count documentation mismatch.** `skills/planning-loop/evals/README.md` says "10 should-trigger + 10 should-not-trigger"; the file has 9+11. Update one or the other.
