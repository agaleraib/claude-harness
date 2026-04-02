# UX & User Flows Criteria

> Applies to: Web application projects with interactive user flows
> Scoring: 1-10 per dimension
> Weighting: Task Completion, Info Architecture, Product Depth at **1.5x**

**Evaluator instructions:** Be skeptical. Cite specific flows, screens, or interactions as evidence.

## Dimensions

### 1. Task Completion (Weight: 1.5x)

Can users complete core tasks end-to-end without confusion or dead ends?

| Score | Description |
|-------|-------------|
| 9-10  | All core flows seamless. Clear entry points, logical steps, obvious completion. |
| 7-8   | Core flows work. Minor friction that doesn't block completion. |
| 5-6   | Completable but requires guessing. Missing confirmation states. |
| 3-4   | Dead ends or confusing branching. Users would abandon tasks. |
| 1-2   | Primary tasks cannot be completed. |

### 2. Information Architecture (Weight: 1.5x)

Is content organized to match user mental models? Logical grouping, sensible navigation.

| Score | Description |
|-------|-------------|
| 9-10  | Intuitive. Users find things where they expect them. |
| 7-8   | Logical with minor surprises. |
| 5-6   | Some features buried or grouped non-obviously. |
| 3-4   | Confusing. Features in unexpected places. |
| 1-2   | No coherent structure. |

### 3. Product Depth (Weight: 1.5x)

Are features complete or just shells? Edge cases handled, not just happy paths.

| Score | Description |
|-------|-------------|
| 9-10  | Every feature complete. Edge cases handled, nothing is a stub. |
| 7-8   | Core features deep. A few secondary features shallow but functional. |
| 5-6   | Happy paths work. Missing edge case handling, some stubs. |
| 3-4   | Surface-level. Features break beyond the demo case. |
| 1-2   | Facades. Buttons exist but do nothing. |

### 4. Feedback & State Communication (Weight: 1x)

Loading states, success/error messages, progress indicators, empty states.

| Score | Description |
|-------|-------------|
| 9-10  | Every action has clear feedback. Users always know what's happening. |
| 7-8   | Good feedback for most actions. A few silent operations. |
| 5-6   | Basic. Some actions give confirmation, others leave users guessing. |
| 3-4   | Sparse. Actions happen silently. |
| 1-2   | No feedback. Users click and nothing happens. |

### 5. Onboarding & Discoverability (Weight: 1x)

Can a first-time user understand the app without instruction?

| Score | Description |
|-------|-------------|
| 9-10  | Self-explanatory. Primary actions immediately clear. |
| 7-8   | Mostly self-explanatory. One or two features require discovery. |
| 5-6   | Requires exploration. Purpose clear but how isn't obvious. |
| 3-4   | Confusing for new users. Key features hidden. |
| 1-2   | Impenetrable. |

## Formula

```
Score = ((Task Completion * 1.5) + (Info Architecture * 1.5) + (Product Depth * 1.5) + Feedback + Onboarding) / 6.5
```

## Hard Fail

Any dimension **3 or below** fails. Task Completion or Product Depth **4 or below** also fails.
