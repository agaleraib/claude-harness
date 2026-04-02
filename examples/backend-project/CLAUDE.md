# Example: Backend/API Project

## Build & Test
```bash
bun run build
bun test
bun run lint
```

## Conventions
- TypeScript strict mode. No `any`.
- Error handling: always catch async operations, log with context, return typed errors.
- Database: use transactions for multi-step writes. Never trust user input.
- Tests: write integration tests against real database, not mocks.

## Verification
After code changes, run: `bun run build && bun test`
