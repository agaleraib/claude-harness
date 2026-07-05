# strict-command-span-binds fixture — a command-shaped span binds a judgment bullet

The `grep -c foo bar` span contains `-`, so it is command-shaped and binds M1
even though the bullet also carries the `clean` judgment word (strict=1 total=1).

**Acceptance criteria:**
- [ ] Output looks clean per `grep -c foo bar`.

## End
