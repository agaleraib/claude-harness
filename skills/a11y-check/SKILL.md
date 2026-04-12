---
name: a11y-check
description: Run accessibility audit on key screens using axe-core via the Playwright MCP. Flags WCAG violations. Run in Test phase for webapp/fullstack projects.
argument-hint: "[URL or comma-separated URLs]"
---

# Accessibility Check

Automated a11y audit using axe-core through the Playwright MCP. This catches the majority of automatable accessibility issues — color contrast, missing labels, ARIA errors, focus order, and heading structure.

Manual a11y testing (screen reader, keyboard-only navigation) is still required for compliance but is not this skill's job.

## Prerequisites

- Project type is `webapp` or `fullstack`
- Playwright MCP is configured (`.mcp.json` with `@playwright/mcp`) — `setup-harness` installs this for webapp/fullstack
- App is running locally OR a reachable URL is provided

## Step 1: Determine URLs to test

If `$ARGUMENTS` provided, use those URLs (comma-separated).

Otherwise, check `.harness-state/a11y_targets.md` for a saved list. Example format:

```markdown
# A11y test targets

- http://localhost:3000/              # landing
- http://localhost:3000/login         # auth
- http://localhost:3000/dashboard     # primary authed flow
- http://localhost:3000/settings      # secondary authed flow
```

If neither argument nor state file, ask via `AskUserQuestion`:

> **Which screens should I audit?**
>
> For a meaningful audit, test the screens users actually hit most:
> - Landing / home
> - Sign-up / login
> - Primary authed screen (dashboard, main workspace)
> - 1-2 secondary screens
>
> Provide comma-separated URLs or a range (e.g., "landing, auth, dashboard").

Save the answer to `.harness-state/a11y_targets.md` for next time.

## Step 2: Verify app is reachable

For each URL, attempt a reachability check before invoking Playwright. If localhost URLs and no dev server is running, prompt the user to start it.

## Step 3: Run axe-core via Playwright MCP

For each URL:

1. Navigate: Playwright MCP `browser_navigate` to URL
2. Inject axe-core: Playwright MCP `browser_evaluate` with the axe-core bootstrap snippet:
   ```javascript
   // Load axe-core from CDN (or bundled if offline)
   const script = document.createElement('script');
   script.src = 'https://cdn.jsdelivr.net/npm/axe-core@4.8.0/axe.min.js';
   document.head.appendChild(script);
   await new Promise(r => script.onload = r);
   const results = await axe.run();
   return results;
   ```
3. Capture the results JSON

If CDN access isn't available offline, fall back to prompting the user to install axe-core as a dev dependency:
```bash
bun add -d @axe-core/playwright axe-core
# or
npm install --save-dev @axe-core/playwright axe-core
```

## Step 4: Classify violations

axe-core returns violations with impact levels. Map to action:

| Impact | Action |
|---|---|
| `critical` | **Hard fail** — must be fixed before exit |
| `serious` | **Fix required** unless explicitly waived with reason |
| `moderate` | Fix recommended, may be parked |
| `minor` | Note only |

## Step 5: Write report

Write to `docs/reports/a11y-<YYYY-MM-DD>.md`:

```markdown
# Accessibility Audit — [YYYY-MM-DD]

**Tool:** axe-core 4.8.0 via Playwright MCP
**URLs audited:** [list]

## Summary

| URL | Critical | Serious | Moderate | Minor |
|-----|---------:|--------:|---------:|------:|
| / | 0 | 2 | 1 | 3 |
| /login | 0 | 0 | 0 | 1 |
| ... |

## Critical & Serious violations

### [URL]

#### [Violation ID: color-contrast]
- **Impact:** serious
- **WCAG:** 1.4.3
- **Elements affected:** 3
  - `button.primary` — contrast ratio 3.2 (needs 4.5)
  - `a.nav-link` — contrast ratio 2.9 (needs 4.5)
  - ...
- **Fix guidance:** [axe's `helpUrl`]

[... one section per violation ...]

## Moderate & Minor

[summary list only]

## Waivers

[Any violations the user explicitly waived, with reason]
```

## Step 6: Summary to terminal

```
## A11y audit — [YYYY-MM-DD]

Audited [N] URLs via axe-core.

Total violations: [N]
  Critical: [N]  ← HARD FAIL if > 0
  Serious:  [N]  ← must fix or waive
  Moderate: [N]
  Minor:    [N]

Full report: docs/reports/a11y-[date].md

Next steps:
- [for each critical/serious, a one-liner]
```

## Step 7: Exit gate

- **Any critical** → exit non-zero, report is the blocker
- **Serious with no waiver** → exit non-zero
- **All critical/serious addressed or waived** → exit zero, pass

## Rules

1. **Automated a11y is necessary but not sufficient.** It catches ~30-50% of real issues. Keyboard-only and screen-reader testing still needed for claim-to-be-accessible.
2. **Always audit the happy path screens**, not just the landing page. Auth + primary authed screens are the most-used and must pass.
3. **Document waivers with reasons.** "Contrast of brand color is 3.8, leadership won't change it" is a waiver. "I didn't want to fix it" is not.
4. **Track regressions.** If a URL had 0 criticals yesterday and has 2 today, that's a regression — find the commit that introduced them.
5. **Run this in Test phase, not Deploy phase.** Fixing a11y issues often requires real code changes.
