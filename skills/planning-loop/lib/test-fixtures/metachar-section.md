# Fixture Z — section name with regex metacharacters
# Verifies the H2 section-uniqueness probe in auto-apply.sh:462,469 matches a
# section heading verbatim even when the section name contains regex
# metacharacters (parens, dots, etc.).
#
# Pre-fix the awk probe used `$0 ~ "^## "s"$"` (regex match), so a section
# named "Notes (advanced)" would be parsed as the regex `^## Notes (advanced)$`
# where `(advanced)` is treated as a group — matching "## Notes advanced"
# but NOT "## Notes (advanced)". section_count would be 0, aborting with
# validation-failure even though the section exists in the spec verbatim.
# The Python re-validation path at auto-apply.sh:609 already used
# `re.escape(section)`; the awk path was the asymmetric gap.
#
# Post-fix uses literal-string equality (`$0 == "## " s`), so any H2 heading
# containing regex metacharacters is matched verbatim. Expected: success.

## Round 3 — 2026-05-10 12:00:00

**Verdict:** needs-attention

```text
Findings:
- [high] DELTA-MARKER bullet wording is awkward
```

## Arbiter — 2026-05-10 12:01:00

**Routing:** 1 detail bullet → code-reviewer

### code-reviewer verdicts (detail)

**F1: load-bearing** — The wording is fine but should be tightened.
```json
{
  "section": "Notes (advanced)",
  "old_string": "- The DELTA-MARKER bullet is the unique anchor for fixture-Z metachar-section edits.",
  "new_string": "- The DELTA-MARKER bullet is the unique anchor for fixture-Z metachar-section edits. (tightened by arbiter ruling)"
}
```
