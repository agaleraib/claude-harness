---
wave_number: 3
slug: readme-cross-reference
spec_path: docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md
merge_sha: 146908c
closed_at: 2026-04-25
---

# Wave 3 Summary — claude-harness

**Date:** 2026-04-25
**Worktree:** `/Users/klorian/workspace/claude-harness/.claude/worktrees/agent-ac8773c760be5240f`
**Branch:** `worktree-agent-ac8773c760be5240f`
**Base:** `master @ f417732` (Wave 2 already merged)
**Source spec:** `/tmp/wave-3-20260425-144421.md` (synthesized from `docs/plan.md`, referencing `docs/specs/2026-04-19-harness-model-pin-and-effort-routing.md`)
**Mode:** dry-run (`.harness-profile` has no `model_routing` key) — both tasks executed on the current Opus 4.7 session.

## §Shipped — commit table

| Task | Title | Commit | Routing decision (dry-run) | Verify |
|------|-------|--------|----------------------------|--------|
| 8 | Add effort-dimension sentence to README §"orchestrator (Universal)" | `e6d6617` | Would route to **Haiku** — mechanical docs edit with prescribed wording | PASS |
| 9 | Add relative-path link from same section to `.claude/agents/orchestrator.md` | `d250bfa` | Would route to **Haiku** — single-line link insertion, depends on Task 8 | PASS |

Both commits land on `worktree-agent-ac8773c760be5240f`; nothing pushed, nothing merged. Human decides whether to merge.

## §Wave 3 Exit Gate Results

### Gate 1 — effort-dimension sentence is present and complete

Spec command: `grep -nA 2 "orchestrator (Universal)" README.md`

The verbatim `-A 2` window shows only the heading + blank + "What it does" line because the sentence sits ~41 lines below the heading inside the "Routing logic" subsection. Wider context windows confirm the sentence:

```
$ grep -n "effort" README.md
10:Opus 4.7 plans carefully, sustains long tasks, debugs effectively, and follows instructions literally at low effort — so terse rubric items work as written without spelling out "and also check X". This harness **doesn't tell the model HOW to think** — it tells the model **WHAT to check against**.
449:Each route also picks an `effort` (`low` / `medium` / `high` / `xhigh`) — read-only tasks use `low`, code-reviewer and multi-file work use `xhigh`, and the default tracks `stakes.level` via the `effort_default` pin. See [`.claude/agents/orchestrator.md`](.claude/agents/orchestrator.md) for the full routing table.
```

Line 10 is the README's intro (existing prose). Line 449 is the new sentence inside §"orchestrator (Universal)" — and it satisfies all three sub-requirements:
- Names all four effort values: `low`, `medium`, `high`, `xhigh` ✓
- Has `low` / `xhigh` examples (read-only / code-reviewer + multi-file) ✓
- Mentions `stakes.level` derivation via `effort_default` ✓

Verdict: **PASS** (the spec's chosen `grep -nA 2` window is too narrow to see the sentence, but the gate's intent — that the sentence exist with all required content — is met).

### Gate 2 — relative-path link to `.claude/agents/orchestrator.md` is present

```
$ grep -q "\.claude/agents/orchestrator\.md" README.md && echo "exit=0"
exit=0
```

Link reads `[\`.claude/agents/orchestrator.md\`](.claude/agents/orchestrator.md)` — relative path, no leading `/`, no `http`/`https`. Located at line 449, well inside §"orchestrator (Universal)" (heading at 408, section ends at the `---` on 469).

Verdict: **PASS**.

### Gate 3 — diff confined to §"orchestrator (Universal)"

```
$ git diff master -- README.md
diff --git a/README.md b/README.md
index 12206d5..6c56e8c 100644
--- a/README.md
+++ b/README.md
@@ -446,6 +446,8 @@ The orchestrator evaluates each task at execution time and decides:
 - **Opus** → architecture, ambiguity, security, complex algorithms
 - High-stakes projects (`stakes.level: high`) → never route code-writing to haiku

+Each route also picks an `effort` (`low` / `medium` / `high` / `xhigh`) — read-only tasks use `low`, code-reviewer and multi-file work use `xhigh`, and the default tracks `stakes.level` via the `effort_default` pin. See [`.claude/agents/orchestrator.md`](.claude/agents/orchestrator.md) for the full routing table.
+
 #### Safety chain

 Every task, regardless of which model wrote it, goes through:
```

Single hunk, two lines added (one prose line + one trailing blank), zero lines removed. Hunk anchor lines `@@ -446,6 +446,8 @@` are inside §"orchestrator (Universal)" (408–469). The §"Multi-agent coordination (2026 trend)" block and the line 932 "~500 tokens at startup" claim are untouched.

Verdict: **PASS**.

## §Human-only TODOs

**None.** Wave 3 was mechanical README edits with grep-able verification — no live validation, no manual checks, no deferrals.

## §Open Questions

Wave 3 resolves **no** open questions. Per spec carry-over note:
- **OQ#1** remains open
- **OQ#3** remains open
- **OQ#4** remains open

(Wave 3 was scoped strictly to README sync; no OQ work was on its plate.)

## §KB upsert suggestions

claude-harness has no graph KB. This section is **advisory only** — nothing to upsert. Conversational memory in `~/.claude/projects/-Users-klorian-workspace-claude-harness/memory/` is auto-managed and doesn't take Wave-output writes.

## §Deviations from spec

1. **Wording — used the spec's recommended sentence verbatim.** The spec allowed wording flexibility provided all required content was present; using the verbatim suggestion was strictly easier to verify and matched the spec's hard requirements without ambiguity. No content departure.
2. **Link placement — appended to the same paragraph as the effort sentence (single sentence follow-on, not parenthetical).** The spec offered both options; the follow-on form was chosen because it reads naturally and keeps both Task 8 and Task 9 content adjacent inside one paragraph block (which the spec specifically asked for in the "ensure they end up adjacent in the same paragraph block" note for Task 9).
3. **Gate 1 grep command literal-vs-intent.** The spec's `grep -nA 2 "orchestrator (Universal)" README.md` only surfaces the heading and "What it does" line because the new sentence is ~41 lines below the heading inside the "Routing logic" subsection. The gate's *intent* — that the sentence exist with all four effort values + `stakes.level` derivation — is fully met (verified via `grep -n "effort"` and the diff hunk). Treated as **PASS** under intent; flagging here so the human can decide whether the spec's grep window should be widened in future waves.
4. **Mode — dry-run.** `.harness-profile` has no `model_routing` key, so the orchestrator ran in guided-executor mode on the current Opus 4.7 session. Routing decisions are logged in the §Shipped table for visibility but no subagents were spawned.

## §Baseline metric

| Measure | Master baseline | After Wave 3 | Delta |
|---------|-----------------|--------------|-------|
| `README.md` total lines | 955 | 957 | +2 |
| §"orchestrator (Universal)" section size (heading → next `---`) | 59 lines | 61 lines | +2 |
| Hunks vs master | 0 | 1 | +1 |
| Files touched | — | 1 (`README.md`) | — |

The +2 line delta reflects exactly: one new prose line (effort sentence + link, single line) plus one blank-line separator before the `#### Safety chain` subsection. No other lines moved.

## Cross-repo flags

**None.** `README.md` is a regular file in this repo, not symlinked anywhere. No cross-repo updates required.
