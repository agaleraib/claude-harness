# Anthropic skill-authoring best practices (vendored snapshot)

> **Source:** <https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices>
> Vendored snapshot — Anthropic's official guidance changes over time. To refresh, re-fetch
> the URL above and reconcile this file. Read this before drafting or revising a SKILL.md.

## Contents
- Hard frontmatter rules (validated)
- Core principles
- Progressive disclosure
- Descriptions
- Naming
- Scripts (skills with executable code)
- Anti-patterns
- Pre-ship checklist

## Hard frontmatter rules (validated by the runtime)

`name`:
- Max **64 characters**; lowercase letters, numbers, hyphens only.
- No XML tags. No reserved words — **"anthropic"** or **"claude"**.

`description`:
- Non-empty, max **1024 characters**. No XML tags.
- Says **what** the skill does **and when** to use it.

## Core principles

- **Concise is key.** The context window is a public good. Only add context Claude doesn't
  already have. Challenge every paragraph: "does Claude really need this? Does it justify its
  token cost?" Assume Claude is already smart.
- **Set appropriate degrees of freedom.** Match specificity to the task's fragility:
  - *High freedom* (prose steps) when many approaches are valid.
  - *Medium freedom* (parameterized scripts/pseudocode) when a preferred pattern exists.
  - *Low freedom* (exact scripts, "run this command, don't modify it") when operations are
    fragile and consistency is critical.
- **Test with every model you'll run it on** (Haiku / Sonnet / Opus). What an Opus skill can
  leave implicit, a Haiku skill may need spelled out.
- **Build evaluations first.** Run the task *without* the skill, note the failures, write ~3
  eval scenarios that target those gaps, then write the *minimum* instructions that pass them.
  Evals are the source of truth for whether the skill works.

## Progressive disclosure

Three loading levels: metadata (always) → SKILL.md body (on trigger) → bundled files (on demand).

- **Keep the SKILL.md body under 500 lines.** Split into separate files when *approaching* the
  limit — don't wait until you're over.
- **Keep references one level deep from SKILL.md.** Claude may only *preview* (`head`) files
  reached through a chain of links, so every reference file should link directly from SKILL.md.
- **Reference files longer than 100 lines need a table of contents** at the top, so a partial
  read still reveals the full scope. (Note: this is stricter than the 300-line figure used
  elsewhere in this skill's body — 100 is the published number.)
- Organize by domain (`reference/finance.md`, `reference/sales.md`) so irrelevant context
  never loads. Bundle comprehensive resources freely — they cost zero tokens until read.

## Descriptions (the primary trigger mechanism)

- **Always third person.** The description is injected into the system prompt; first/second
  person ("I can help…", "You can use…") causes discovery problems.
- Include **both** what it does and the concrete triggers/contexts for when to use it.
- Be specific; include key terms a real user would type. Avoid "Helps with documents."

## Naming

- Prefer **gerund form** (`processing-pdfs`, `analyzing-spreadsheets`). Noun phrases
  (`pdf-processing`) and action forms (`process-pdfs`) are acceptable alternatives.
- Avoid vague (`helper`, `utils`), overly generic (`data`, `files`), and reserved words.

## Skills with executable code

- **Solve, don't punt.** Scripts should handle error conditions, not fail and "let Claude
  figure it out." Document constants (no "voodoo" magic numbers — Ousterhout's law).
- **Provide utility scripts** even when Claude could write them: more reliable, save tokens,
  ensure consistency. Make execution intent explicit — "**run** `x.py`" vs "**read** `x.py`
  for the algorithm."
- **Create verifiable intermediate outputs** for batch/destructive/high-stakes work:
  analyze → write a plan file → validate the plan with a script → execute → verify.
- Use **forward slashes** in all paths. Don't assume packages are installed — list deps.
- **MCP tools** need fully-qualified `ServerName:tool_name` names.

## Anti-patterns

- Time-sensitive info ("before August 2025, use…") — use a collapsed "Old patterns" section.
- Inconsistent terminology — pick one term ("field", "extract", "API endpoint") and keep it.
- Offering too many options — give one default with an escape hatch.
- Windows-style backslash paths.
- Deeply nested references.

## Pre-ship checklist

- Description is specific, includes key terms, and states what + when.
- SKILL.md body < 500 lines; extra detail in separate files; references one level deep.
- No time-sensitive info (or quarantined in "Old patterns"); consistent terminology.
- Examples are concrete, not abstract.
- Scripts solve rather than punt; explicit error handling; no voodoo constants; deps listed.
- ≥3 evaluations created; tested with Haiku, Sonnet, and Opus on real scenarios.
