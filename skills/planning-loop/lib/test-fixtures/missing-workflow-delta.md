# Fixture missing-workflow-delta — command-add spec lacks WORKFLOW.md row delta (preflight-abort)
# Expected: preflight-abort — auto-apply.sh's Phase 1a-pre fires before any
# classification. Spec byte-identical (no apply path was reached).
#
# v2 Wave 1 fixture (docs/specs/2026-05-01-claude-adapter-alignment.md §4.3).
# Demonstrates: a spec adds a user-facing command (Files entry points at
# skills/<name>/SKILL.md) but has no `### WORKFLOW.md row delta` subsection.
# The Phase 1a-pre gate aborts with runner outcome `preflight-abort`.

## Round 3 — 2026-05-01 14:20:00

**Verdict:** needs-attention

```text
Findings:
- [high] F1: spec adds /new-command but no WORKFLOW.md row delta
```

## Arbiter — 2026-05-01 14:21:00

**Routing:** 1 detail bullets → code-reviewer

### code-reviewer verdicts (detail)

**F1: load-bearing** — WORKFLOW.md row delta subsection is missing. The auto-apply preflight Phase 1a-pre will abort before reaching this verdict; this arbiter ruling exists for documentation but the runner exits via preflight, not classification.
