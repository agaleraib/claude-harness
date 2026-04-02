# Example: Web Application Project

## Build & Test
```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run typecheck    # Type checking
npm test             # Run test suite
```

## Stack
- Next.js 16 + React 19 + TypeScript
- Tailwind CSS 4
- Supabase (PostgreSQL)

## Conventions
- TypeScript strict mode. No `any`.
- Components under 150 lines. Break up if larger.
- Use framework primitives before external state libraries.

## Design Direction
- Dark mode default. Neutral warm grays.
- Dense but scannable. Progressive disclosure.
- No generic AI slop. Every design decision intentional.

## Verification
After UI changes: `npm run build && npm run dev` — check in browser.
