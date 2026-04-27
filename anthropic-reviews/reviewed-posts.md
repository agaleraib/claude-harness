# Anthropic Posts — Review Log

Tracks every Anthropic post evaluated for relevance to the **claude-harness** repo.

## Status legend
- `relevant`   — suggestions file written for this post
- `skipped`    — reviewed, not actionable for this repo (reason noted)
- `pending`    — discovered, not yet reviewed

## How this routine works
1. On each run, fetch the latest items from `anthropic.com/news`, `anthropic.com/engineering`, and related sources.
2. Cross-reference URLs against the table below — anything new is a candidate.
3. For each new candidate, judge whether it can materially improve this repo's methodology, skills, agents, criteria, or procedures.
4. If yes → add a bullet to the dated suggestions file `anthropic-reviews/YYYY-MM-DD-improvement-suggestions.md` (create the file if missing) and mark `relevant`.
5. If no → mark `skipped` with a short reason.
6. When a new dated suggestions file is created, fire a PushNotification so the user is aware.

## Review table

| Date reviewed | Post title | URL | Status | Notes / suggestion link |
|---------------|------------|-----|--------|-------------------------|
| 2026-04-19 | Introducing Claude Opus 4.7 | https://www.anthropic.com/news/claude-opus-4-7 | relevant | [2026-04-19 §1](./2026-04-19-improvement-suggestions.md#1-upgrade-the-harness-from-opus-46-to-opus-47) |
| 2026-04-19 | Scaling Managed Agents: Decoupling the brain from the hands | https://www.anthropic.com/engineering/managed-agents | relevant | [2026-04-19 §2](./2026-04-19-improvement-suggestions.md#2-adopt-the-brainhands-split-in-the-orchestrator-agent) |
| 2026-04-19 | Equipping agents for the real world with Agent Skills | https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills | relevant | [2026-04-19 §3](./2026-04-19-improvement-suggestions.md#3-restructure-skills-around-progressive-disclosure) |
| 2026-04-19 | Effective harnesses for long-running agents | https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents | relevant | [2026-04-19 §4](./2026-04-19-improvement-suggestions.md#4-add-a-claude-progresstxt-convention-for-long-running-work) |
| 2026-04-19 | Demystifying evals for AI agents | https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents | relevant | [2026-04-19 §5](./2026-04-19-improvement-suggestions.md#5-formalize-evals-for-the-adversarial-reviewers) |
| 2026-04-19 | 2026 Agentic Coding Trends Report | https://resources.anthropic.com/2026-agentic-coding-trends-report | relevant | [2026-04-19 §6](./2026-04-19-improvement-suggestions.md#6-reflect-the-multi-agent-supervision-trend-in-the-harness-readme) |
| 2026-04-19 | Making frontier cybersecurity capabilities available (Claude Code Security) | https://www.anthropic.com/news/claude-code-security | skipped | Feature is a hosted research-preview on claude.com/code; no local hook into this repo's skills. Revisit if it ships an SDK/CLI surface. |
| 2026-04-19 | Claude Mythos Preview | https://red.anthropic.com/2026/mythos-preview/ | skipped | Frontier safety preview, not a Claude-Code-harness-facing product. |
| 2026-04-19 | How AI Is Transforming Work at Anthropic | https://www.anthropic.com/research/how-ai-is-transforming-work-at-anthropic | skipped | Qualitative workforce research, no concrete harness change. |
| 2026-04-19 | Introducing Agent Skills (news) | https://www.anthropic.com/news/skills | skipped | Covered by the deeper engineering post on the same topic — avoid duplicate suggestions. |
| 2026-04-27 | An update on recent Claude Code quality reports | https://www.anthropic.com/engineering/april-23-postmortem | relevant | [2026-04-27 §1](./2026-04-27-improvement-suggestions.md#1-align-effort_default-derivation-with-anthropics-new-opus-47-default-of-xhigh) · [§2](./2026-04-27-improvement-suggestions.md#2-add-a-no-verbosity-reduction-directives-in-skillagent-prompts-guardrail) |
| 2026-04-27 | Anthropic and Amazon expand collaboration for up to 5 GW of compute | https://www.anthropic.com/news/anthropic-amazon-compute | skipped | Compute/capacity partnership announcement; no surface that touches harness skills, agents, or methodology. |
| 2026-04-27 | Announcing the Anthropic Economic Index Survey | https://www.anthropic.com/research/economic-index-survey-announcement | skipped | Monthly survey product for Claude users; no harness-side hook. Revisit if survey results publish guidance for tooling authors. |
| 2026-04-27 | Anthropic and NEC partner to build AI-native engineering at scale in Japan | https://www.anthropic.com/news/anthropic-nec | skipped | Enterprise partnership announcement; no methodology or skill change implied. |
