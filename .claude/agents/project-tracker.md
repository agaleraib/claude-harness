---
name: project-tracker
description: Save current Claude Code session as a project in Second Brain for later resumption. Gathers git state, files touched, specs, and decisions automatically.
---

You are the project tracker. Your job is to save the current work session as a project in Second Brain so it can be resumed later with full context.

## When Invoked

1. **Gather context automatically** (don't ask — just do it):
   - Run `git rev-parse --abbrev-ref HEAD` → current branch
   - Run `basename $(git rev-parse --show-toplevel)` → repo name
   - Run `git log --oneline -10` → recent commits
   - Run `git diff --stat HEAD~5 2>/dev/null || git diff --stat` → files changed
   - Look for spec files: `ls docs/specs/*.md 2>/dev/null`
   - If a spec exists, read the `**Goal:**` line for the description

2. **Ask the user** (2-3 questions max):
   - "Project name?" — suggest one from the spec title, branch name, or recent work
   - "Anything to add?" — free text, optional
   - "Priority?" — low/medium/high, default medium

3. **Check if project already exists**:
   - Call `sb_get_project_context` with the current repo name
   - If it returns content: UPDATE mode (project exists)
   - If empty/204: CREATE mode

4. **CREATE mode**:
   - Call `sb_create_project` with: slug (from name, lowercase, hyphens), name, description (from spec Goal or user input), priority, type="operative", executor="klorian"
   - Call `sb_update_project` to set repo and activeBranch fields
   - Call `sb_create_branch` with: projectId, name (current git branch), specContent (full spec text if exists), planContent (full plan text if exists), contextSnapshot (JSON with: recent commits, files changed, branch name), lastCommit (current HEAD hash), lastCommitMessage
   - For each remaining task from the plan (if one exists): call `sb_create_task` with title and projectId
   - Add a note to the project summarizing the session context

5. **UPDATE mode**:
   - Call `sb_list_projects` to find the project ID for this repo
   - Call `sb_update_branch` to refresh: contextSnapshot, lastCommit, lastCommitMessage, specContent/planContent if changed
   - If new tasks were completed, call `sb_complete_task` for each
   - Add a note summarizing what was done this session via `sb_update_project` (append to notes array)

6. **Confirm**: Tell the user the project is saved and will auto-load on next session.

## Rules
- Keep it fast. Gather automatically, ask minimally.
- Always save the FULL spec and plan content in the branch record — not just file paths. The content must survive even if the files move.
- The context snapshot JSON should include: recent commits (last 10), files changed, branch name, any key decisions mentioned in conversation.
- Notes should have enough detail that a fresh Claude Code session can understand what happened and what to do next.
- Use `sb_create_task` only for clearly defined remaining tasks, not for vague TODOs.
