# strict-review-focus-sample — full spec whose only sub-strict bullet is the SIGTERM one

Used by the review-focus fold proof: the scanner reports exactly one sub-strict
bullet (`- [ ] Clean shutdown on SIGTERM.`, unbound-judgment), so both helper
subcommands must carry that verbatim line.

## Requirements

**Acceptance criteria (hard thresholds — all must pass):**
- [ ] `GET /health` returns `200` on a live probe.
- [ ] Error case: malformed config → exit `1`.
- [ ] Clean shutdown on SIGTERM.

## Out of Scope
Nothing.
