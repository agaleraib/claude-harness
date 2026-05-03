# Receipt Schema

**Status:** NORMATIVE for all harness adapters.
**Source:** `docs/specs/2026-04-30-universal-harness-protocol-v2.md` §4.2.

This file is a faithful materialization of spec §4.2 — adapters read this file as the single source of truth for receipt shape rather than parsing the spec body.

## Receipt path

Every command in `WORKFLOW.md`, regardless of adapter, writes a receipt to:

```
.harness-state/<command>-<wave-or-spec-id>-<timestamp>.yml
```

(or an equivalent namespaced path). This applies to read-only commands as well — read-only means "writes nothing outside `.harness-state/` in any registered repo," not "writes nothing at all." The receipt is the durable audit trail and is mandatory.

## Field table

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `receipt_id` | string | yes | Stable identifier: `<command>-<wave-or-spec-id>-<timestamp>`; reused across retries of the same logical operation |
| `command` | string | yes | Protocol command name as listed in §4 (`run-wave`, `close-wave`, `commit`, etc.) |
| `adapter` | string | yes | One of `manual`, `claude-code`, `codex`, `automation` |
| `wave_id` | string | conditional | Required for `run-wave` / `close-wave` / `archive-plan`; null for spec-only commands |
| `spec_path` | string | conditional | Required for spec-related commands; relative to repo root |
| `inputs` | list[string] | yes | Repo-relative paths of input artifacts read by the operation |
| `outputs` | list[string] | yes | Repo-relative paths of artifacts written or modified |
| `verification` | object | yes | `{ commands: list[string], results: list[{cmd, exit_code, summary}] }`; empty list allowed only for read-only commands |
| `started_at` | ISO-8601 timestamp | yes | UTC start time |
| `completed_at` | ISO-8601 timestamp | conditional | UTC end time on success; absent on partial completion |
| `status` | string | yes | One of `success`, `partial`, `failed`, `aborted-on-ambiguity` |
| `merge_sha` | string | conditional | Required when `command=close-wave` and `status=success` |
| `pr_url` | string | optional | Draft/visibility PR URL when present (Wave 3+) |
| `tracker_ref` | string | optional | External tracker issue ID when tracker adapter is enabled (Wave 4+) |
| `idempotency_key` | string | yes | Content-derived freshness key (per the canonical algorithm below); reruns with the same key MUST be detected and either resumed or no-op'd |
| `operation_id` | string | yes | Stable recovery-lookup identifier (per the algorithm in Recovery semantics below); does NOT change when input contents change mid-operation |
| `retry_of` | string | optional | `receipt_id` of the prior attempt this receipt supersedes; chains forward, never backward |
| `notes` | string | optional | Free-text adapter notes (Codex stop-reason, Claude session summary, etc.) |

## Canonical idempotency_key derivation

NORMATIVE — all adapters MUST follow this exactly.

The `idempotency_key` is the lowercase hex SHA-256 digest of a UTF-8 byte string assembled from the following fields, joined with a single LF (`\n`) separator, with no leading/trailing whitespace and no trailing newline:

```text
field 1: command                  (string, exact value from §4 command column)
field 2: wave_id or spec_path     (whichever applies; if both apply, wave_id wins; if neither, the literal string "-")
field 3: input content digest     (defined below)
```

### Input content digest

- Sort `inputs` lexicographically by repo-relative path.
- For each input path, compute lowercase hex SHA-256 of the file's raw byte contents at the time work starts. If the path is missing on disk, use the literal string `MISSING`.
- Join entries as `<path>:<digest>` and concatenate with single LF separators.
- The input content digest is the lowercase hex SHA-256 of that joined string.

### Excluded fields

Excluded from the key by construction: `started_at`, `completed_at`, `adapter`, `notes`, `pr_url`, `tracker_ref`, `merge_sha`, `retry_of`, and the receipt path itself. Timestamps and adapter identity MUST NOT influence the key.

### Consequences

- Identical command + wave/spec + input contents across manual, Claude, and Codex adapters produces an identical `idempotency_key`. Wave 0's example-receipt exercise MUST demonstrate this with at least one manual/Claude pair sharing a key for the same logical operation; Wave 5 extends the same demonstration to a Codex-generated receipt.
- Editing any input file's contents invalidates the prior key. A success receipt whose `idempotency_key` does not match the current recomputed key MUST NOT be treated as a no-op — adapters re-run the operation and link via `retry_of` only when the prior key was for the same inputs.
- Path-only renames change the key (paths are part of the digest). This is intentional: a rename is a different operation.

## Recovery semantics

- Every receipt MUST also persist an `operation_id` field: lowercase hex SHA-256 of the UTF-8 string `<command>\n<wave_id-or-spec_path-or-"-">` (paths/IDs only, NO input content). Unlike `idempotency_key`, `operation_id` does not change when input file contents change mid-operation.
- Recovery search proceeds in two stages, in this order:
  1. **Exact-content match (no-op or content-equality resume):** Recompute the canonical `idempotency_key` and look for an existing receipt with that exact key. If found and `status=success`, the operation is a no-op and returns the existing receipt. If found and `status=partial|aborted-on-ambiguity`, the new attempt sets `retry_of` to that receipt's `receipt_id` and resumes from the next missing output.
  2. **Operation-identity fallback (mutated-input resume):** If no exact-content match exists, scan `.harness-state/` for receipts with the same `operation_id` and `status` in `partial|aborted-on-ambiguity`. The most recent such receipt MUST be treated as the in-progress attempt: the new run sets `retry_of` to that receipt's `receipt_id` and resumes from the next missing output recorded there. This rule is what makes mutating commands (`/archive-plan`, Review spec, Accept wave, `/close-wave`) resumable after interruption — by the time of retry, input contents on disk have already been mutated by the partial attempt, so the content-derived `idempotency_key` cannot match.
- Mutating commands (any command whose `outputs` overlap with its `inputs`, or which deletes/moves input artifacts) MUST either (a) write to a temp file and atomically rename into place once all changes for a given output are staged, OR (b) record a rollback journal entry in `.harness-state/` naming the original byte contents (or sha256 + git blob ref) of every input artifact about to be mutated, before mutating it. Recovery uses the journal to reconstruct the pre-mutation input state when validating progress.
- Partial-completion receipts MUST list every output produced before stopping; recovery resumes from the next missing output.
- Failed receipts (`status=failed`) MUST include a `verification.results` entry showing which command failed and its exit code.

## Operation_id derivation

```text
operation_id = sha256_hex( "<command>\n<wave_id-or-spec_path-or-'-'>" )
```

Paths/IDs only — NO input content. This makes the value stable across input mutations within a single logical operation; the content-derived `idempotency_key` provides the freshness check; together they enable both no-op detection and mutated-input recovery.

## Stage A no-op exemption (read-only freshness-probe commands)

**Schema extension introduced in Wave 10 (v2 Wave 2).** Read-only commands whose value lives in *live state outside the receipt's input file set* — git branch / dirty-tree / worktree state aggregated across registered repos — MAY opt out of Stage A prior-success no-op reuse by setting an explicit boolean field in `idempotency_key.trace`:

```yaml
idempotency_key:
  value: <sha256_hex(...)>
  trace:
    command: <command>
    wave_id_or_spec_path: "-"
    sorted_inputs: [...]
    input_content_digest: <sha256_hex(...)>
    stage_a_exempt: true
```

When `stage_a_exempt: true` is present in a prior receipt's trace AND a later invocation of the same `operation_id` evaluates Stage A, adapters MUST skip the prior-success short-circuit and execute a fresh scan. Two consecutive runs with identical receipt-input file contents and identical git state across all registered repos will produce DIFFERENT `idempotency_key.value` byte-for-byte (the inverse of every other command's idempotency assertion). For exempt commands, `idempotency_key.value` is computed as a non-content-stable shape that includes the invocation timestamp:

```text
idempotency_key.value = sha256_hex( operation_id + "\n" + ISO-8601 timestamp + "\n" + sha256_hex(<resolved input file contents or 'MISSING'>) )
```

**Canonical example: `/harness-status`.** The command's value is freshness — the branch, dirty-tree state, and worktree list of every registered repo at the moment of invocation. That state lives outside the receipt's input file set (which contains the registry YAML + each registered repo's `docs/plan.md` + `.harness-profile`). If `/harness-status` reused a prior `success` receipt via Stage A whenever its input file set was unchanged, a branch switch / new uncommitted edit / worktree add in any scanned repo would silently no-op into a stale snapshot — defeating the command's purpose with no mechanically observable failure mode.

The alternative — mechanizing per-repo `git rev-parse HEAD` / `git status --porcelain` / `git worktree list --porcelain` digests into the receipt's input set — was rejected because it makes `recompute-keys.sh` fragile: live git state at recompute time would have to match git state at original-run time exactly, which is unreproducible across machines, days, and CI runs. The exemption preserves the receipt schema and `idempotency_key` contract for mutating commands like `/archive-plan` while accurately marking `/harness-status` as the documented freshness-probe exception.

**Currently the sole consumer.** Mutating commands (`/archive-plan`, `/run-wave`, `/close-wave`, `/commit`) continue to use Stage A unchanged — they MUST NOT set `stage_a_exempt`. Future read-only freshness-probe commands MAY adopt the same opt-out by following the canonical example.

**`recompute-keys.sh` handling.** Wave 2 / Wave 10 fixtures' recomputer treats receipts with `stage_a_exempt: true` as a special case: instead of asserting `idempotency_key.value` recomputes to the original value, it asserts the trace's `stage_a_exempt: true` field is present AND that the `value` matches the timestamp-salted formula given the receipt's own `created_at` field.

## Validation

Wave 0's exit gate validates this schema AND the canonical key algorithm: it ships at least one manual-generated example and one Claude-generated example for the same logical operation, and a fixture or verification step proves they compute the same `idempotency_key` byte-for-byte. The Codex-compatible release (§1.1) requires at least one Codex-generated example per command row, and Wave 5's exit gate proves the Codex receipt's key matches the manual/Claude key for the same logical operation.

Worked example pair under `.harness-state/examples/manual-close-wave-6.yml` and `.harness-state/examples/claude-close-wave-6.yml`. Recomputer at `.harness-state/examples/recompute-keys.sh` reads each receipt's `idempotency_key.trace` (the frozen pre-image) and asserts both keys recompute correctly and equal each other.
