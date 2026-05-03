# Code Simplicity Criteria

> Applies to: ALL projects (backend, frontend, infrastructure, scripts)
> Scoring: 1-10 per dimension, all weighted equally

**Evaluator instructions:** Be skeptical. Every score must cite specific files, functions, or patterns as evidence. The headline test for every dimension: **"Would a senior engineer say this is overcomplicated?"** If yes, score 5 or below.

## Dimensions

### 1. Reuse

Does the change reuse existing helpers, types, and patterns from the codebase, or reinvent them? Scope: cross-codebase — new code vs. what already exists in the repo.

| Score | Description |
|-------|-------------|
| 9-10  | Uses existing utilities. New code only where no equivalent exists. |
| 7-8   | Mostly reuses; one or two avoidable re-implementations. |
| 5-6   | Several places where existing code could have been used. |
| 3-4   | Reinvents significant building blocks already present in the repo. |
| 1-2   | Parallel implementation of an established subsystem. |

### 2. Duplication

Same logic appearing in multiple places **within the change itself**. Three similar lines is fine; the same 20-line block twice is not. Scope: intra-change — duplication-with-existing-code is Dimension 1 (Reuse), not this.

| Score | Description |
|-------|-------------|
| 9-10  | No meaningful duplication. Each invariant lives in one place. |
| 7-8   | Minor near-duplicates; deliberate or below the abstraction threshold. |
| 5-6   | One clear duplicate that should be consolidated. |
| 3-4   | Multiple duplicates of non-trivial logic. |
| 1-2   | Pervasive copy-paste of business rules. |

### 3. Dead Abstraction

Wrappers, interfaces, factories, and config layers that exist for hypothetical future requirements OR are used only once today. Covers single-use abstractions, unused parameters, options nobody passes, type variables that don't vary, error paths for impossible cases, generics for unspecified futures.

| Score | Description |
|-------|-------------|
| 9-10  | Every abstraction has at least two distinct call sites today and solves a problem in front of it. |
| 7-8   | One questionable wrapper or unused option; rest earn their keep. |
| 5-6   | A few single-use interfaces, factories, or "what if" knobs with no current consumer. |
| 3-4   | Heavy configurability, adapters, strategy patterns, or extensibility hooks for unspecified futures. |
| 1-2   | Framework-grade flexibility for a one-shot script. Abstraction theatre. |

### 4. Unnecessary Indirection

Calls that bounce through wrappers, helpers, or re-exports without adding meaning. Straight-line code beats indirection unless the indirection earns its place.

| Score | Description |
|-------|-------------|
| 9-10  | Call paths read top-to-bottom. Indirection only where it adds real meaning. |
| 7-8   | Mostly direct; one or two thin wrappers. |
| 5-6   | Multiple "pass-through" layers that just rename arguments. |
| 3-4   | Call site → helper → helper → real logic, with no value at each hop. |
| 1-2   | Architecture astronaut: every function calls another function that calls another. |

## Formula

```
Score = (Reuse + Duplication + Dead Abstraction + Indirection) / 4
```

## Hard Fail

Any dimension scoring **3 or below** triggers a fail regardless of the overall score.

## Note for the reviewer

This rubric flags simplifications. It does NOT prescribe rewrites. Report findings with file:line and a one-line "what to cut and why." The author or `/simplify` does the rewriting.
