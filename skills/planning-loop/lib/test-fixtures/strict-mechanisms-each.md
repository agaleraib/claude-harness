# strict-mechanisms-each fixture — one bullet per mechanism M1, M2, M3, M4

Proves each mechanism binds standalone under `LC_ALL=C grep -E`.

**Acceptance criteria:**
- [ ] Configuration is parsed by `parseConfig`.
- [ ] POST /submit accepts the payload.
- [ ] Write path stays < 200 units.
- [ ] Error case: upstream timeout returns a retry token.

## End
