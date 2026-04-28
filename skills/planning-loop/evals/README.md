# planning-loop evals/

Skill-creator-style integration prompts for `/planning-loop`. Distinct from `lib/test-fixtures/`:

- **`evals/`** (this directory) — high-level integration prompts a human might type. Driven by skill-creator's `python -m scripts.run_loop`. Tests *whether the skill triggers correctly* (`trigger-eval.json`) and *whether end-to-end behavior matches expectations* (`evals.json`). Runs through Claude (subagents in Claude Code, in-context prompts in Claude.ai).
- **`lib/test-fixtures/`** — bash unit tests for the pure shell helpers (`auto-apply.sh`, `preflight.sh`, `restore.sh`). Driven by `lib/run-fixtures.sh`. Tests *individual abort-reason paths*, hash-stability checks, regex parsers, atomic-rename behavior. Runs in pure bash without Claude.

The two are complementary: bash fixtures catch regressions in the helpers; evals catch regressions in the skill's overall workflow + description triggering accuracy.

## Files

| File | Purpose | Schema reference |
|------|---------|------------------|
| `evals.json` | 3 prompts: FRESH-mode realistic blob, REVISE-mode existing spec with focus, edge case (leftover `state.json`). | `~/.claude/skills/skill-creator/references/schemas.md` §`evals.json` |
| `trigger-eval.json` | 20 queries (10 should-trigger + 10 should-not-trigger near-misses) for description optimization. | `~/.claude/skills/skill-creator/SKILL.md` §"Description Optimization" Step 1 |

## Running

Description optimization (the future one-command operation referenced by the spec):

```bash
cd ~/.claude/skills/skill-creator
python -m scripts.run_loop \
  --eval-set <absolute-path-to>/skills/planning-loop/evals/trigger-eval.json \
  --skill-path <absolute-path-to>/skills/planning-loop \
  --model <model-id-powering-this-session> \
  --max-iterations 5 \
  --verbose
```

Integration evals (when skill-creator's eval runner is available):

```bash
python -m scripts.run_eval \
  --skill-path <absolute-path-to>/skills/planning-loop \
  --evals <absolute-path-to>/skills/planning-loop/evals/evals.json
```

A description-optimization run is **out of scope** for the wave that shipped this scaffolding (deferred to a follow-up spec). The files exist so the future run is a one-command operation.
