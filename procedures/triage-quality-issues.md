# Triage: "the agent feels off"

When an agent (code-reviewer, ui-evaluator, generator, orchestrator) starts producing visibly worse output, work down this list **before** assuming the underlying model regressed. Anthropic's [April 23 postmortem](https://www.anthropic.com/engineering/a-postmortem-of-three-recent-issues) is a year-2026 reminder that month-long "model" complaints often resolve to harness-layer changes.

1. **What did I touch in the last 30 days?**
   `git log --since="30 days ago" --name-only -- .claude/agents/ skills/`
   If anything in that list is a prompt file (`*.md`), revert-test before anything else.

2. **What did Anthropic ship in the last 30 days?**
   Check `anthropic-reviews/reviewed-posts.md` for model-version changes since the symptom started. If a new Opus minor version landed, note its release date.

3. **Did the symptom start before or after the most recent prompt-file change?**
   If before any local change → likely upstream (Anthropic). If after → likely your harness. Bisect by reverting the most recent prompt edit on a branch and re-running the broken case.

4. **Try the API directly.**
   The April 23 postmortem isolated all three issues to the harness because the bare API was unaffected. Run the same task through `claude` CLI with a stripped system prompt — if quality returns, the problem is in your harness, not the model.

5. **Check `.harness-state/orchestrator.jsonl` for routing drift.**
   `effort` tier or model can silently change if `.harness-profile` was edited. `jq -r '[.task_id, .model, .effort, .ts] | @tsv' .harness-state/orchestrator.jsonl | tail -50` shows the last 50 dispatches.

If after all five steps the symptom persists with a clean harness and a stripped prompt, file an issue against Anthropic with a reproducer.
