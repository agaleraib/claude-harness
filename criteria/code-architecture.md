# Code Quality & Architecture Criteria

> Applies to: ALL projects (backend, frontend, infrastructure, scripts)
> Scoring: 1-10 per dimension, all weighted equally (1x)

**Evaluator instructions:** Be skeptical. Every score must cite specific files, functions, or patterns as evidence.

## Dimensions

### 1. Structure & Organization (1x)

Is the codebase logically organized? Clear separation of concerns, sensible file/folder structure, discoverable code.

| Score | Description |
|-------|-------------|
| 9-10  | Immediately navigable. Clear module boundaries, consistent file organization. |
| 7-8   | Well-organized with minor inconsistencies. Easy to find things. |
| 5-6   | Adequate but requires some hunting. Mixed conventions. |
| 3-4   | Disorganized. Logic scattered, no clear boundaries. |
| 1-2   | Chaotic. Monolithic files or random scattering. |

### 2. Maintainability (1x)

Can the code be modified safely? Readable naming, reasonable function size, minimal coupling, no hidden side effects.

| Score | Description |
|-------|-------------|
| 9-10  | Clear naming, small focused functions, changes are localized and safe. |
| 7-8   | Most code is readable and modifiable. A few long functions. |
| 5-6   | Functional but risky to change. Some tight coupling. |
| 3-4   | Fragile. Changes break other things. Duplicated logic. |
| 1-2   | Unmaintainable. God functions, global mutable state. |

### 3. Patterns & Consistency (1x)

Same problem solved the same way. Consistent naming, error handling, no style drift.

| Score | Description |
|-------|-------------|
| 9-10  | Perfectly consistent. Feels like one developer wrote it. |
| 7-8   | Mostly consistent. A few deviations. |
| 5-6   | Mixed. Two or three competing patterns for the same problem. |
| 3-4   | Inconsistent. Every file does things differently. |
| 1-2   | No patterns. Random approaches throughout. |

### 4. Type Safety & Correctness (1x)

Proper TypeScript usage. No `any`, correct types, exhaustive handling, no type assertions hiding bugs.

| Score | Description |
|-------|-------------|
| 9-10  | Full type coverage. Types model the domain accurately. No `any`. |
| 7-8   | Strong typing with occasional pragmatic shortcuts. |
| 5-6   | Types present but shallow. Many `any` or overly broad types. |
| 3-4   | Minimal typing. `any` everywhere, types are decorative. |
| 1-2   | Effectively untyped. |

## Formula

```
Score = (Structure + Maintainability + Patterns + Type Safety) / 4
```

## Hard Fail

Any dimension scoring **3 or below** triggers a fail regardless of the overall score.
