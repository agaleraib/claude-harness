# Data Integrity & Error Handling Criteria

> Applies to: ALL projects — backend services, APIs, data pipelines, client apps
> Scoring: 1-10 per dimension

**Evaluator instructions:** Be skeptical. Every score must cite specific code paths, error scenarios, or data flows as evidence.

## Dimensions

### 1. Data Modeling (Weight: 1.5x)

Are types and interfaces appropriate for the domain? Proper entity relationships, correct use of types, sensible defaults.

| Score | Description |
|-------|-------------|
| 9-10  | Clean schema that maps naturally to the domain. Relationships correct and efficient. Discriminated unions where appropriate. |
| 7-8   | Solid types with minor suboptimal choices. Relationships correct. |
| 5-6   | Works but data duplication, overly broad types, or awkward structures. |
| 3-4   | Poor modeling. Missing relationships, wrong data types, `any` in data layer. |
| 1-2   | Fundamentally broken. Would require a rewrite. |

### 2. Error Handling (Weight: 1.5x)

Does the system handle failures gracefully? Network errors, malformed input, timeouts, resource exhaustion.

| Score | Description |
|-------|-------------|
| 9-10  | Comprehensive. All failure modes caught, logged, and communicated. Graceful degradation. Retry logic where appropriate. |
| 7-8   | Good coverage. Most failure cases handled. Occasional missing validation. |
| 5-6   | Basic. Happy path works, but failures crash or silently fail. |
| 3-4   | Minimal. Unhandled rejections, no input validation, silent data loss. |
| 1-2   | No error handling. Failures crash the system. |

### 3. Data Consistency (Weight: 1x)

Is data consistent and trustworthy? No orphaned records, no stale references, proper transaction handling.

| Score | Description |
|-------|-------------|
| 9-10  | Always consistent. Deletions cascade properly. No orphaned references. Concurrent operations safe. |
| 7-8   | Solid with minor gaps. Occasional stale references possible but don't cause issues. |
| 5-6   | Basic consistency. Edge cases could produce inconsistent state. |
| 3-4   | Integrity issues in normal use. Orphaned records, broken references. |
| 1-2   | Data routinely becomes inconsistent. |

### 4. Input Validation (Weight: 1x)

Are system boundaries protected? User input validated, API payloads checked, external data sanitized.

| Score | Description |
|-------|-------------|
| 9-10  | All boundaries validated. Malformed input rejected with clear errors. No injection vectors. |
| 7-8   | Good boundary protection. Minor gaps in edge cases. |
| 5-6   | Some validation but inconsistent. Some boundaries unprotected. |
| 3-4   | Minimal validation. Injection possible. Malformed data accepted. |
| 1-2   | No validation. System trusts all input. |

## Formula

```
Score = ((Data Modeling * 1.5) + (Error Handling * 1.5) + Data Consistency + Input Validation) / 5
```

## Hard Fail

Any dimension scoring **3 or below** triggers a fail. Data Consistency scoring **4 or below** also triggers a fail.
