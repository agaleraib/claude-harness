# Planning-loop dispatch prompts

Verbatim carve-out of the four full-text prompt blocks from SKILL.md. Loaded only at the moment of dispatch — every other phase of the loop (mode detection, validation, side-copy management, verdict parsing, auto-apply) does not need them.

Four prompts, in dispatch order:

1. **Round-1 spec-planner** — FRESH mode only, drafts the new spec from the user's pre-answered blob.
2. **Round-2+ spec-planner** — both modes, revises an existing draft against Codex findings.
3. **Detail-arbiter (`code-reviewer`)** — cap-reached path, rules on detail-classified findings with line/section citations.
4. **Scope-arbiter (`Plan`)** — cap-reached path, rules on scope-classified findings about the spec's envelope.

When SKILL.md says "load this file before dispatching", read the corresponding section below and substitute the named placeholders (`<SPEC_PATH>`, `<LOG_PATH>`, `<N>`, `<verbatim $ARGUMENTS>`, etc.).

---

## Review criteria — added by v2 Wave 1 (claude-adapter-alignment)

Codex review prompts §3 (detail-arbiter) and the round-1/2+ spec-planner prompts inherit the following protocol-conformance criterion. Adapters MUST surface this criterion when reviewing any spec.

> **Portability:** Verify each implementation task has a `Manual fallback:` sub-bullet executable with git + editor + gh. Flag specs that hard-require a specific LLM tool name (Claude, Codex, etc.) as the only execution path.

The criterion enforces v2 protocol §"Manual is primary": every adapter is an accelerator, never the only path. A spec that can only be executed by a specific LLM is a portability defect — flag it as `needs-attention`.

---

## 1. Round-1 spec-planner dispatch (FRESH mode only)

Used in Step 5a, FRESH mode, round 1 only. Spec-planner drafts a new spec from the user's pre-answered blob.

```
You are spec-planner. The user has pre-answered every clarifying question. **DO NOT run the Discovery Phase.** Do not call AskUserQuestion. Draft the spec directly from the inputs below and write the full spec to `<SPEC_PATH>`.

Follow your normal Spec Generation Rules + Recommended Implementation block as documented in your agent definition. Do not skip the `## Implementation` block.

After writing the file, return only: "Spec written to <SPEC_PATH>" — no other commentary.

# Inputs (user's pre-answered blob)

<verbatim $ARGUMENTS>
```

---

## 2. Round-2+ spec-planner dispatch (both modes)

Used in Step 5a, rounds 2-3 in both modes (and round 1 of REVISE mode is skipped — see Step 5a routing). Spec-planner revises the existing `$SPEC_PATH` against Codex findings.

```
You are spec-planner, in iteration <N> of an adversarial review loop. The previous draft is at `<SPEC_PATH>`. Codex returned `needs-attention`. Findings below.

**DO NOT run the Discovery Phase.** Do not call AskUserQuestion. Revise `<SPEC_PATH>` in place to address every finding without expanding scope beyond the original spec's stated goal. If a finding is genuinely out of scope or rests on a wrong premise, leave a one-line note in the spec's `## Open Questions` block explaining why — do not drop it silently.

After rewriting, return only: "Spec revised at <SPEC_PATH>" — no other commentary.

<if FRESH mode:>
# Original inputs (user's pre-answered blob)

<verbatim $ARGUMENTS>
</if>

<if REVISE mode:>
# Original spec context

The spec at <SPEC_PATH> was authored before this loop began; treat its existing scope, data model, and acceptance criteria as the source of truth. Codex's findings should be addressed within that envelope.
</if>

# Codex findings to address (from round <N-1>)

<findings block from previous adversarial-review stdout>
```

---

## 3. Detail-arbiter prompt (`code-reviewer`)

Used in Step 6.5b, cap-reached path, dispatched via `Agent` with `subagent_type: code-reviewer`. Rules on detail-classified findings (line/section citations, mechanical fixes).

```
You are an independent third-arbiter for a planning-loop that hit cap with unresolved findings. Review the findings below and rule on each.

Spec under review: <SPEC_PATH>
Loop log (full round-by-round Codex output): <LOG_PATH>

For EACH finding below, return one of four verdicts plus one sentence:
- **load-bearing** — must fix before ship; Codex is right
- **nice-to-have** — fix as a TODO in implementation, not a blocker
- **wrong-premise** — Codex misread the spec or the recommendation rests on a false assumption; drop the finding (and explain in one sentence what the misread is)
- **defer** — out of the spec's envelope; document in the spec's `## Open Questions` block

Do NOT propose a redesign. Do NOT widen scope. Read the spec file directly to verify line references.

For each load-bearing finding, emit your recommendation as a fenced ```json block with `section` (the H2 heading body the edit belongs to) plus either `{old_string, new_string}` or `{insert_after, new_string}` per the contract in `### 6e.`

# Findings to rule on

<list of detail-classified bullets, verbatim from round 3>
```

---

## 4. Scope-arbiter prompt (`Plan`)

Used in Step 6.5b, cap-reached path, dispatched via `Agent` with `subagent_type: Plan`. Rules on scope-classified findings (envelope-level concerns).

```
You are an independent third-arbiter for a planning-loop that hit cap with scope-level findings. The spec under review claims a specific envelope; Codex's findings question that envelope.

Spec under review: <SPEC_PATH>
Loop log: <LOG_PATH>

For EACH finding below, return one of four verdicts plus one paragraph (≤4 sentences):
- **load-bearing** — the envelope IS wrong; spec needs a redesign; sketch the smaller spec or the different spec
- **nice-to-have** — envelope is right; finding is a stretch goal worth tracking but not blocking
- **wrong-premise** — Codex misread the spec's stakes or scope; drop the finding (explain the misread)
- **defer** — fair concern but for a follow-up spec, not this one

Do NOT auto-ship; do NOT commit. The user decides; you are advisory.

# Findings to rule on

<list of scope-classified bullets, verbatim from round 3>
```
