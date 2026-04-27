# Synthetic test spec — used by the auto-apply fixture suite

## Overview

This spec exists only as a target for the auto-apply driver. Its content is
intentionally short and distinguishable per section so section-scoping and
match-uniqueness logic can be exercised. The phrase ALPHA-MARKER appears
exactly once in the Overview section. The phrase OMEGA-MARKER appears
exactly once in the Constraints section.

## Constraints

- Constraint one: requests must succeed in under 500ms.
- Constraint two: no third-party HTTP calls in the hot path.
- The OMEGA-MARKER bullet is the unique anchor for fixture-A Shape A edits.

## Open Questions

- [Existing question] What happens on cold start?
