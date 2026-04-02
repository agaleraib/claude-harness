# Frontend / UI Design Criteria

> Applies to: Web application projects with a user interface
> Scoring: 1-10 per dimension
> Weighting: Design Quality and Originality are **2x**

**Evaluator instructions:** Be skeptical. Every score must cite specific visual evidence. If unsure, score lower.

## Dimensions

### 1. Design Quality (Weight: 2x)

Does the design feel like a coherent whole? Colors, typography, layout combine to establish a distinct mood and visual identity.

| Score | Description |
|-------|-------------|
| 9-10  | Striking, cohesive visual identity. Could pass as professionally designed. |
| 7-8   | Strong identity with minor inconsistencies. Direction is clear and intentional. |
| 5-6   | Competent but generic. Well-executed template without distinct personality. |
| 3-4   | Inconsistent. Some elements feel considered, others feel like defaults. |
| 1-2   | Visually incoherent. Clashing styles, no design intent. |

### 2. Originality (Weight: 2x)

Evidence of custom decisions rather than template layouts or library defaults. Penalize AI slop aggressively: purple gradients, generic hero sections, cookie-cutter card grids, glassmorphism defaults, "Welcome to [App]" copy.

| Score | Description |
|-------|-------------|
| 9-10  | Genuinely distinctive. Custom and surprising choices. |
| 7-8   | Mostly original with a few conventional fallbacks. |
| 5-6   | Some custom touches but largely common patterns. |
| 3-4   | Template-driven. Standard card grid, default component styling. |
| 1-2   | Pure defaults. Indistinguishable from a scaffolded starter. |

### 3. Craft (Weight: 1x)

Technical execution: typography hierarchy, spacing consistency, color harmony, contrast, alignment, responsive behavior.

| Score | Description |
|-------|-------------|
| 9-10  | Pixel-perfect. Flawless type scale, consistent spacing, perfect alignment. |
| 7-8   | Minor imperfections that don't disrupt the experience. |
| 5-6   | Adequate. Inconsistencies noticeable on close inspection. |
| 3-4   | Sloppy spacing, inconsistent type sizes, misaligned elements. |
| 1-2   | No attention to detail. Broken layouts, overlapping elements. |

### 4. Functionality (Weight: 1x)

Usability independent of aesthetics. Can a user locate actions and complete tasks intuitively?

| Score | Description |
|-------|-------------|
| 9-10  | Instantly intuitive. Clear hierarchy, obvious CTAs. |
| 7-8   | Easy to use with minimal friction. |
| 5-6   | Usable but requires guessing. Important actions not obvious. |
| 3-4   | Confusing navigation. Users struggle with basic tasks. |
| 1-2   | Unusable. Critical actions hidden, broken flows. |

## Formula

```
Score = ((Design Quality * 2) + (Originality * 2) + Craft + Functionality) / 6
```

## Hard Fail

Any dimension scoring **3 or below** triggers a fail.

## Calibration

- **6/10** = "competent but generic" — gravitational center of AI output. Don't score higher without evidence of intentional decisions.
- **8/10** = "genuinely good" — requires multiple specific observations of craft and intent.
- **10/10** = almost never given — exhaustive looking found nothing to criticize.
