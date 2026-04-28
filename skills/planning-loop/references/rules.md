# Planning-loop rules (with rationale)

Verbatim carve-out of the `## Rules (load-bearing)` block from SKILL.md. Loaded only when a contributor needs the *why* behind a rule; the rule titles themselves stay inline in SKILL.md so the model has the constraint set in context on every invocation.

The auto-apply hot path (Step 6e/6f) does NOT load this file — the audit-entry shape, JSON Shapes A/B contract, and Open-Questions bullet shape stay inline in SKILL.md by design (see Task 10 scope decision in `docs/specs/2026-04-28-planning-loop-trim-remediation.md`).

---

1. **Spec-planner discovery is ALWAYS suppressed.** The dispatch prompt MUST tell the agent not to call `AskUserQuestion`. Applies to both modes; in revise mode, doubly so since we're working from an existing draft.

2. **Hard cap = 3.** Do not raise it. If 3 rounds didn't converge, the gap is design-level, not detail-level.

3. **Fail-closed on missing verdict line.** If Codex stdout doesn't contain a parseable `Verdict:` line, treat it as `needs-attention`. Never default to `approve` because parsing failed.

4. **No auto-ship at cap.** The cap path prints findings and stops. The user decides. Auto-applying unanimously-decided arbiter rulings to the spec text is permitted and is NOT 'shipping'; the user still owns `/commit`.

5. **Log every round.** Even if the user aborts mid-loop, the log under `.harness-state/planning-loop/` is the audit trail.

6. **Spec lives in the working tree.** Don't commit it inside the skill — that belongs to a follow-up `/commit`. The adversarial-review picks it up via working-tree scope.

7. **Slug collision is a user signal — except in revise mode.** Fresh mode stops if `SPEC_PATH` already exists. Revise mode targets an existing path on purpose.

8. **Revise mode does NOT widen scope.** Spec-planner's revise prompt explicitly says: address findings within the spec's existing envelope. If Codex flags a scope-level concern, that's a candidate for the spec's `## Open Questions` block, not a silent rewrite that turns an MVP into v2.

9. **Arbiters are advisory, never authoritative.** Step 6.5 surfaces a third opinion to inform the user's decision; it cannot ship the spec, edit the spec, or replace the user-decides options. Even a unanimous "drop all findings" arbiter ruling produces option 4, not auto-ship. **Clarification:** when arbiter advice is unanimous AND every load-bearing fix passes the JSON edit-block contract (see `### 6e.`), the skill may execute that advice on the spec file via the auto-apply path; the user remains the sole authority over committing. Auto-apply is editing, not shipping.

10. **Auto-park is a lifecycle, not a step.** REVISE mode parks unrelated working-tree changes via a single named stash + state journal at `.git/planning-loop-park/state.json`. Every exit point (success, escalation, error) MUST invoke `bash "$HOME/.claude/skills/planning-loop/lib/restore.sh"` before returning. Leftover state from a crashed/interrupted run is detected on the next invocation by the pre-flight in Step 1 and aborts cleanly with recovery instructions; never silently proceed past leftover state. Orphan-stash detection (a stash named `planning-loop park *` without state.json) is defense-in-depth for cases where state.json was lost.

11. **Auto-apply preconditions are conjunctive — ALL of (a) opt-out not set, (b) unanimous arbiter rulings on every round-3 finding, (c) drop-or-mechanical-fix (every load-bearing recommendation passes the non-mechanical pre-filter), (d) no `defer` or `nice-to-have` verdicts on any finding, (e) every load-bearing fix validates against the JSON edit-block contract including `section`-scoped containment (see `### 6e.`), (f) `$SPEC_PATH` SHA-256 unchanged between Phase 1a validation and Phase 1b apply, must hold. ANY exception falls through to the menu, all-or-nothing (no partial-apply, ever).** Detection is conservative by design — false positives (auto-apply when shouldn't) are worse than false negatives (menu when could've auto-applied), because the menu still works. Opt-out surfaces: `PLANNING_LOOP_NO_AUTO_APPLY=1` env var (precedence) and `planning_loop.auto_apply: false` in `.harness-profile` (default `true`).
