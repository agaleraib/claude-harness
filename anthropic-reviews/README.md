# Anthropic-reviews

A scheduled routine reviews new Anthropic posts (news, engineering, resources) and proposes harness improvements. Each run produces:

- **One PR** containing a dated suggestions file + a tracker update
- **A notification** to every entry in `.harness-profile` `team.members`

If no new in-scope posts surface in a run, the tracker is updated with a `no new posts since <last-date>` line and no PR/notification fires.

## Files in this directory

| File | Purpose |
|---|---|
| `reviewed-posts.md` | Durable cross-run tracker. One row per Anthropic post: URL + status (`relevant` / `skipped` / `pending`) + notes. Skip-with-reason discipline is enforced. |
| `<YYYY-MM-DD>-improvement-suggestions.md` | Snapshot of a single run. Numbered §s, each with source URL + concrete diff/example + expected payoff + "Verify before applying" line + Status field. |
| `README.md` | This file. |

The dated files are immutable history — never delete them, never rewrite suggestions in place. Only the **Status** field per § is updated as triage decisions are made.

## How to triage a suggestions PR

In the PR thread, comment under each suggestion § with one of these conventions (these are guidance for humans, not bot commands):

- `/apply [@assignee]` — going to do it; assignee owns the implementation
- `/defer until <reason or date>` — interesting later, not now
- `/reject — <one-line reason>` — won't do; reason captured for future readers
- `/spec` — needs a design pass first; will go through `/spec-planner` before any coding

Both collaborators triage before the integrator merges. Disagreements get hashed out in the PR thread or in a sync.

## Closing the loop after triage

Before merging the PR (or in a follow-up commit on master right after), update each suggestion's `**Status:**` line in the dated file from `PENDING` to one of:

- `APPLIED in commit <hash> · <date> · <@handle>`
- `DEFERRED until <when> — <reason> · <date> · <@handles agreed>`
- `REJECTED — <reason> · <date> · <@handle>`
- `SPEC'd in docs/specs/<date>-<topic>.md · <date> · <@handle>`

This makes the dated file a durable record of what was considered and what was decided. Future readers (you next year, a future collaborator) can reconstruct the decision trail without digging through PR comments.

## How approved suggestions actually get built

Pick the path that matches the suggestion's size:

| Size | Path | Examples |
|---|---|---|
| **Trivial** (one-file text edit, README sentence, version bump) | `/micro` → edit → `/commit` | "Opus 4.6 → 4.7 in README" |
| **Modest** (multi-file change, new convention, no architectural shift) | `/micro` → `/commit`; add a one-line item to `docs/plan.md` if worth tracking | New `claude-progress.txt` convention; multi-agent README section |
| **Substantive** (new pattern, new agent, refactor across the harness) | `/spec-planner` → writes `docs/specs/<date>-<topic>.md` → add to `docs/plan.md` as a wave item → `/run-wave N` when scheduled | Brain/hands split refactor; agent evaluation fixtures |

**Rule of thumb:** if a suggestion's "Concrete changes" block has more than ~5 file edits or introduces a convention used in multiple places, it's substantive — spec it before building.

## Anti-patterns to avoid

- **Don't auto-apply.** Even trivial suggestions go through human review. The routine is advisory, not prescriptive.
- **Don't pad the suggestions file.** If a post isn't actionable, skip it in the tracker with a one-line reason — don't manufacture a § to fill space.
- **Don't drop a suggestion silently.** Every § ends with a final Status line. If you reject one, write the reason. Future-you will thank you.
- **Don't re-suggest a known item.** The routine grep's the repo before suggesting structural changes; if it surfaces a "Rename to SKILL.md" suggestion when files already are SKILL.md, that's a routine bug — flag it, don't act on it.

## Related

- `docs/co-vibe-protocol.md` — multi-collaborator working agreement; references this surface
- `.harness-profile` `team.members` — where notifications fan out
- `docs/plan.md` — where substantive applied suggestions get tracked as wave items
