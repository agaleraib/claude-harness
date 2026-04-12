---
name: api-smoke-test
description: Generate or run an end-to-end API smoke test (curl/jq-based bash script). Tests critical user paths against a live URL. Run in Test phase and after every deploy.
argument-hint: "[generate|run <BASE_URL>]"
---

# API Smoke Test

Produces and runs a bash-based end-to-end smoke test of the critical API paths. Works for any HTTP API — framework-agnostic.

Two modes:
- **`generate`** — writes `scripts/smoke.sh` based on the project's API surface
- **`run <BASE_URL>`** — executes the existing smoke script against a live URL

## Mode: generate

### Step 1: Read the API surface

Source of truth for API routes, in order of preference:
1. `docs/specs/YYYY-MM-DD-*.md` — look for "API Surface" table
2. Actual route files — scan `routes/`, `app/api/`, `src/routes/`, etc.
3. Ask the user if neither is clear

Extract: method, path, auth requirement, critical request/response shape.

### Step 2: Identify the critical path

Ask the user via `AskUserQuestion`:

> **What's the critical user path for this API?**
>
> The single sequence of calls that must work end-to-end for the app to be useful. Example: "signup → login → create resource → list resources → delete resource".
>
> - Walk me through it in one line
> - I have a flow in the spec (I'll read it)
> - Just test `/health` for now (prototype)

### Step 3: Write `scripts/smoke.sh`

Template:

```bash
#!/usr/bin/env bash
# smoke.sh — critical path smoke test
# Usage: BASE_URL=https://your-app.com ./scripts/smoke.sh
#        BASE_URL=http://localhost:3000 ./scripts/smoke.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
TOKEN=""

log()  { printf "\033[1;34m▶\033[0m %s\n" "$*"; }
pass() { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
fail() { printf "\033[1;31m✗\033[0m %s\n" "$*" >&2; exit 1; }

log "Smoke test → $BASE_URL"

# ---- Health check ----
log "GET /health"
code=$(curl -sS -o /tmp/smoke-health.json -w "%{http_code}" "$BASE_URL/health")
[ "$code" = "200" ] || fail "health check returned $code"
pass "health ok"

# ---- Auth (if applicable) ----
# log "POST /auth/login"
# resp=$(curl -sS -X POST "$BASE_URL/auth/login" \
#   -H "Content-Type: application/json" \
#   -d '{"email":"smoke@test.local","password":"..."}')
# TOKEN=$(echo "$resp" | jq -r .token)
# [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] || fail "no token returned"
# pass "auth ok"

# ---- Critical path steps ----
# log "POST /api/<resource>"
# code=$(curl -sS -o /tmp/smoke-create.json -w "%{http_code}" \
#   -X POST "$BASE_URL/api/<resource>" \
#   -H "Authorization: Bearer $TOKEN" \
#   -H "Content-Type: application/json" \
#   -d '{...}')
# [ "$code" = "201" ] || fail "create returned $code"
# id=$(jq -r .id /tmp/smoke-create.json)
# pass "create ok (id=$id)"

# ---- Cleanup ----
# log "DELETE /api/<resource>/$id"
# ...

pass "smoke test complete"
```

Fill in the actual routes based on the critical path the user provided. Each step must:
- Log what it's testing
- Check the HTTP status code
- Extract anything needed for the next step (IDs, tokens) via `jq`
- Fail loudly on any error

### Step 4: Make it executable

```bash
chmod +x scripts/smoke.sh
```

### Step 5: Update `.env.example` if needed

If the smoke test needs credentials (smoke user password, test API key), add them to `.env.example` with clear placeholders — never real values.

### Step 6: Print instructions

```
✅ Smoke test generated: scripts/smoke.sh

Run it locally:
  BASE_URL=http://localhost:3000 ./scripts/smoke.sh

Run it against staging:
  BASE_URL=https://staging.yourapp.com ./scripts/smoke.sh

Run it against production (after deploy):
  BASE_URL=https://yourapp.com ./scripts/smoke.sh
```

## Mode: run

Execute the existing `scripts/smoke.sh`:

```bash
test -f scripts/smoke.sh || { echo "❌ no scripts/smoke.sh — run 'api-smoke-test generate' first"; exit 1; }
test -x scripts/smoke.sh || chmod +x scripts/smoke.sh

BASE_URL="$1" ./scripts/smoke.sh
```

Capture output. On pass, print `✅ smoke test passed against $BASE_URL`. On fail, surface the fail line and exit non-zero.

## Rules

1. **Never mock.** Smoke tests hit the real thing. That's the whole point.
2. **No assertions on exact response bodies beyond IDs and tokens** — the test verifies the path works, not the data shape. Schema tests belong in the test suite.
3. **Use a dedicated smoke user** for protected paths — create one in a pre-step if your system allows, or document how to seed one.
4. **Clean up after yourself** — anything created during the smoke test should be deleted in a cleanup step. Otherwise the staging/prod db fills up with garbage.
5. **Fail fast, fail loud.** `set -e` is non-negotiable. No silent failures.
6. **Smoke test scripts are committed to git.** Part of the repo, versioned like any other.
