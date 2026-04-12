# API Security Checklist

> Framework-agnostic. Run through this for every new or modified API route, endpoint, or RPC handler.
>
> **When to use:** Harden phase exit gate for projects where `audience.data_sensitivity ≠ none`. Required for `financial | health | pii | regulated`. Recommended for all public-facing APIs.
>
> **How to use:** Read each item against the actual code path. Mark each box only if you've verified it — not if you "think it should be there." Unchecked items block phase exit.

## 1. Authentication & Session

- [ ] Route verifies an authenticated session before any business logic runs
- [ ] Unauthenticated requests return `401` with a generic `{ error: "Unauthorized" }` — no "user not found" vs "wrong password" leaks
- [ ] Session expiration enforced; expired tokens return `401`, never fall through
- [ ] No auth bypass via query params, headers, or cookies the route doesn't validate
- [ ] `userId` / `subjectId` comes from the authenticated session — **never** from request body or URL params

## 2. Authorization

- [ ] Every read/write is scoped to the authenticated user (or their org/tenant)
- [ ] Admin/privileged actions check a role or permission, not just "is logged in"
- [ ] Cross-tenant access is impossible by parameter tampering (e.g., `GET /orders/:id` verifies the order belongs to the session's user)
- [ ] Soft-deleted / archived records are excluded from default queries

## 3. Input Validation

- [ ] Request body is parsed through a schema validator (Zod, Pydantic, io-ts, JSON Schema, etc.) — not `as any`
- [ ] All required fields are checked; missing fields return `400` with a clear message
- [ ] Enum fields validated against allowed values, not accepted as free strings
- [ ] String fields have length limits (both min and max) appropriate to the domain
- [ ] IDs (UUIDs, slugs, etc.) validated as proper format **before** touching the database
- [ ] File uploads: size limit, mime-type check, filename sanitization
- [ ] Pagination limits capped (no `limit=1000000`)

## 4. Data Access

- [ ] Parameterized queries only — no string concatenation into SQL / NoSQL filters
- [ ] Row-level security or equivalent enforced at the database layer (defense in depth)
- [ ] Service-role / admin keys never used from request-path code — only from isolated, non-user-facing jobs
- [ ] Secrets (API keys, DB URLs, signing keys) read from environment, never hardcoded, never logged
- [ ] `.env` files in `.gitignore`; secret-scan passes on all new commits

## 5. Response Handling

- [ ] Success responses have correct status code (`200` read, `201` create, `204` delete)
- [ ] Response body shape is stable and typed — no leaking internal fields (password hashes, internal IDs, raw error objects)
- [ ] Client errors (`400`, `404`) return human-readable messages without revealing internal structure
- [ ] Server errors (`500`) return a generic message — **no stack traces, file paths, or SQL in responses**
- [ ] Streaming responses set correct `Content-Type` and close the stream on error

## 6. Rate Limiting & Abuse Prevention

- [ ] Expensive operations (LLM calls, image generation, heavy queries) have per-user rate limits
- [ ] Signup / login have rate limits or CAPTCHA
- [ ] No unbounded loops driven by user input (e.g., `for i in range(userProvidedCount)`)
- [ ] Timeouts on outbound requests (HTTP clients, DB queries, LLM SDKs) so one slow dependency can't hang the process

## 7. Logging & Audit

- [ ] Security-relevant events logged: auth success/failure, permission denials, rate-limit hits, admin actions
- [ ] Logs do **not** include passwords, tokens, full credit card numbers, health data, or other sensitive fields
- [ ] Error logs include enough context (request ID, user ID, route) to investigate without being noisy

## 8. Transport & Headers

- [ ] HTTPS enforced in production (TLS redirect or HSTS)
- [ ] `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` set (for HTML responses)
- [ ] CORS origin allow-list is explicit, not `*`, when the API handles authenticated requests
- [ ] Cookies marked `HttpOnly`, `Secure`, `SameSite=Lax` (or `Strict` where possible)

## 9. Dependencies

- [ ] No dependencies with known high-severity CVEs in the current install (`npm audit`, `pip-audit`, `cargo audit`, `go list -m`)
- [ ] Supply-chain: lockfile committed; no wildcard versions in production dependencies

## Compliance add-ons (only if applicable)

### If `data_sensitivity = financial` or `compliance: pci`
- [ ] No raw card numbers stored — tokenize via payment provider
- [ ] All payment-adjacent code paths logged to an append-only audit trail

### If `data_sensitivity = health` or `compliance: hipaa`
- [ ] PHI encrypted at rest and in transit
- [ ] Access to PHI logged with user ID + timestamp
- [ ] BAA in place with any third-party handling PHI

### If `data_sensitivity = regulated` or `compliance: gdpr`
- [ ] Data-export endpoint exists (user right to portability)
- [ ] Data-deletion endpoint exists and cascades (user right to erasure)
- [ ] Data retention periods documented and enforced

---

**Source:** Adapted from community resource `claude-setup-ways/skills/backend-architect/references/security-checklist.md`, generalized away from Next.js/Supabase/Gemini specifics.
