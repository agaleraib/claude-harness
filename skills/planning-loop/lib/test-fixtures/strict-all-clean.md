# strict-all-clean fixture — every scoped acceptance bullet is strict (P == T)

## Requirements

**Acceptance criteria (hard thresholds — all must pass):**
- [ ] `GET /health` returns `200` within the probe window.
- [ ] Error case: malformed body → `400` with a diagnostic payload.
- [ ] End-to-end latency stays < 500 ms under nominal load.

## Out of Scope
Nothing.
