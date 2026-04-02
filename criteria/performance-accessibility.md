# Performance & Accessibility Criteria

> Applies to: Web application projects
> Scoring: 1-10 per dimension, all weighted equally (1x)

**Evaluator instructions:** Be skeptical. Cite measured load times, DOM inspection, viewport testing.

## Dimensions

### 1. Load Performance (1x)

How fast does the application load? Bundle size, code splitting, lazy loading, initial paint.

| Score | Description |
|-------|-------------|
| 9-10  | Near-instant. Optimized bundles, proper code splitting, sub-second paint. |
| 7-8   | Fast. Minor optimization opportunities. |
| 5-6   | Acceptable. Missing obvious optimizations. |
| 3-4   | Slow. Large bundles, no lazy loading. |
| 1-2   | Painfully slow. Multi-second blank screens. |

### 2. Runtime Performance (1x)

Smooth during use? No jank, efficient re-renders, no memory leaks.

| Score | Description |
|-------|-------------|
| 9-10  | Buttery smooth. 60fps, efficient updates, handles large datasets. |
| 7-8   | Smooth with occasional minor hiccups under stress. |
| 5-6   | Noticeable lag in some interactions. Unnecessary re-renders. |
| 3-4   | Janky. Dropped frames, sluggish interactions. |
| 1-2   | Unusable. Constant freezing, memory leaks. |

### 3. Semantic HTML & Accessibility (1x)

Proper semantic elements, ARIA, heading hierarchy, keyboard navigation, alt text.

| Score | Description |
|-------|-------------|
| 9-10  | Fully accessible. Semantic markup, correct ARIA, logical tab order. |
| 7-8   | Good. Minor gaps but navigable with assistive tech. |
| 5-6   | Basic semantics. Screen reader experience would be rough. |
| 3-4   | Poor. Div soup, no ARIA, no keyboard support. |
| 1-2   | Inaccessible. Unusable with assistive technology. |

### 4. Responsive Design (1x)

Works across viewport sizes? Proper breakpoints, no overflow, correct touch targets.

| Score | Description |
|-------|-------------|
| 9-10  | Flawless across all viewports. Thoughtful layout shifts. |
| 7-8   | Works on major breakpoints. Minor issues at uncommon sizes. |
| 5-6   | Desktop-first with basic mobile. Some overflow on small screens. |
| 3-4   | Broken on mobile. Overlapping elements, horizontal scrolling. |
| 1-2   | Single viewport only. |

## Formula

```
Score = (Load + Runtime + Semantic HTML + Responsive) / 4
```

## Hard Fail

Any dimension **3 or below** fails. Semantic HTML **4 or below** also fails — accessibility is baseline.
