---
name: commit
description: Commit protocol — reviews staged changes, surfaces related parking lot items, lets you fix or park issues, updates plan.md if the commit moves a plan item forward.
argument-hint: "[commit message override]"
---

# Commit

A commit protocol that reviews before committing, keeps the parking lot honest, and updates the plan.

## Step 1: Check staged changes

```bash
git diff --cached --stat
```

If nothing is staged, check for unstaged changes:

```bash
git status --short
```

If there are unstaged changes, use `AskUserQuestion`:

> Nothing is staged. Want me to show unstaged changes so you can pick what to stage?

If the working tree is completely clean, stop:

> Nothing to commit — working tree is clean.

## Step 2: Check parking lot for related items

```bash
cat parking_lot.md 2>/dev/null
```

Get the list of files being committed:

```bash
git diff --cached --name-only
```

Scan the parking lot's Open section for items that reference any of the staged files, directories, or closely related functionality. Use your judgment — an item about "translation-engine.ts" is related if you're committing changes to `translation-engine.ts` or `translate.test.ts`.

If related items are found, use `AskUserQuestion`:

> These parking lot items look related to what you're committing:
>
> 1. [item text]
> 2. [item text]
>
> What do you want to do?
>
> - **Resolve now** — fix these before committing
> - **Acknowledge and continue** — commit anyway, items stay parked

If "Resolve now": fix the issues, re-stage, then restart from Step 2.

## Step 3: Run code-reviewer

Invoke the `code-reviewer` agent on the staged diff. Pass it only the staged changes:

```bash
git diff --cached
```

The code-reviewer will run tests, check types, and report findings.

## Step 4: Handle review findings

If the code-reviewer reports no issues, skip to Step 5.

If issues are found, present them numbered and use `AskUserQuestion`:

> Code review found [N] issues:
>
> 1. [severity] [description]
> 2. [severity] [description]
> ...
>
> What do you want to do?
>
> - **Fix all** — fix every issue, re-stage, re-review
> - **Review individually** — go through each one, decide fix or park
> - **Park all** — park everything to parking_lot.md, commit as-is

### Fix all

Fix all reported issues. Re-stage changed files. Go back to Step 3 (re-review).

### Review individually

For each issue, use `AskUserQuestion`:

> **Issue [N]:** [severity] — [description]
> File: [file:line]
>
> - **Fix now** — fix this issue
> - **Park** — add to parking lot, move on

After going through all issues:
- Fix the ones marked "fix now", re-stage
- Park the ones marked "park" (append to parking_lot.md Open section with today's date and `source: commit review`)
- If any were fixed, go back to Step 3 (re-review the fixes only)

### Park all

For each issue, append to `parking_lot.md`:

```
- [YYYY-MM-DD] [code-review] [description] — [file:line] (source: commit review)
```

Continue to Step 5.

## Step 4.5: Reserve receipt (BEFORE git commit — §3.0a / v2 Wave 1)

Per `docs/specs/2026-05-01-claude-adapter-alignment.md` §3.3, `/commit` MUST emit a §4.2-conforming receipt under `.harness-state/commit-<spec-or-dash-slug>-<timestamp>.yml` using the shared helper at `skills/_shared/lib/emit-receipt.sh`. The lifecycle is **reserve-then-mutate**: write a `started` receipt BEFORE `git commit` runs (after staging, after pre-commit hooks queue, before the commit SHA exists).

**CRITICAL — single-shell-session lifecycle.** The full receipt lifecycle (`source` → `init` → `preflight` → `started` → `git commit` → `terminal`) MUST run in **one shell invocation**. The helper's state lives in shell variables (`EMIT_RECEIPT__*`) that don't survive across:
- Separate Bash tool calls (each is a fresh shell — sourcing in one and calling functions in the next loses everything).
- A subshell exit (the EXIT trap fires; if state was reserved but not terminally written, an `aborted-on-ambiguity` placeholder may be left behind).

**Wrap everything below in one bash heredoc when invoking from Claude Code:**

```bash
bash <<'BASH_EOF'
set -e
# (entire Step 4.5 + Step 5 + terminal write goes here)
BASH_EOF
```

The helper also requires bash (it guards against zsh sourcing — see `feedback_emit_receipt_zsh_incompat.md`). On macOS where the default shell is zsh, the explicit `bash <<'BASH_EOF'` is mandatory.

**Source the helper:**

```bash
HARNESS_REPO="$(git rev-parse --show-toplevel)"
source "$HARNESS_REPO/skills/_shared/lib/emit-receipt.sh"
```

**Determine the second-line key per §3.0:**

- If this commit will advance a `### Wave N` row in `docs/plan.md` (Step 6 will mark it done) → second line is `<spec_path>` from the row's `spec:` field. The advancing wave number (`N`) is captured separately for the receipt's `wave_id` field.
- Otherwise → second line is the literal string `-`; `wave_id` stays null.

```bash
if [[ -n "$ADVANCING_SPEC_PATH" ]]; then
  WAVE_OR_SPEC="$ADVANCING_SPEC_PATH"   # commit advances plan.md
  # ADVANCING_WAVE_ID is the numeric N from the `### Wave N` row.
else
  WAVE_OR_SPEC="-"                       # no plan.md advance
  ADVANCING_WAVE_ID=""
fi
```

**Initialize and preflight** (before Step 5's `git commit`):

```bash
STAGED_FILES="$(git diff --cached --name-only)"
INPUTS=()
for f in $STAGED_FILES; do INPUTS+=("$f"); done
[[ -f parking_lot.md ]] && INPUTS+=(parking_lot.md)
[[ -f docs/plan.md ]] && INPUTS+=(docs/plan.md)

emit_receipt_init commit "$WAVE_OR_SPEC" "${INPUTS[@]}"
# Spec_path + wave_id are required when the commit advances a plan.md row
# (per spec §3.3 / §Data Model row for `wave_id`). The setters land in the
# SAME atomic terminal-write YAML.
if [[ -n "$ADVANCING_SPEC_PATH" ]]; then
  emit_receipt_set_spec_path "$ADVANCING_SPEC_PATH"
  emit_receipt_set_wave_id "$ADVANCING_WAVE_ID"
fi
PREFLIGHT="$(emit_receipt_preflight)"
case "$PREFLIGHT" in
  PROCEED)  emit_receipt_started ;;
  NOOP*)    echo "Identical staged content already committed; no-op." >&2; exit 0 ;;
  *)        exit 2 ;;
esac
```

**At terminal exit** (after `git commit` succeeds), write `success`:

```bash
COMMIT_SHA="$(git log -1 --format=%H)"
VERIFICATION_YAML="    - cmd: \"git commit\"
      exit_code: 0
      summary: \"commit $COMMIT_SHA created\""

OUTPUTS=("$COMMIT_SHA")
[[ -f parking_lot.md ]] && [[ "$PARKING_TOUCHED" == "1" ]] && OUTPUTS+=(parking_lot.md)
[[ -f docs/plan.md ]] && [[ "$PLAN_TOUCHED" == "1" ]] && OUTPUTS+=(docs/plan.md)

emit_receipt_terminal success "$VERIFICATION_YAML" "${OUTPUTS[@]}"
```

**Receipt fields per §3.3:**

| Field | Value |
|---|---|
| `command` | `commit` |
| `wave_id` | numeric string when the commit advances plan.md (`notes: "advances Wave N"`); else `null` |
| `spec_path` | required when advancing plan.md (sourced from row's `spec:` field); else absent |
| `operation_id` | `sha256_hex("commit\n<spec_path>")` when advancing plan.md, else `sha256_hex("commit\n-")` |
| `inputs` | `[<staged paths>, parking_lot.md (if checked), docs/plan.md (if checked)]` |
| `outputs` | `[<commit SHA>, parking_lot.md (if updated), docs/plan.md (if updated)]` (terminal write only) |
| `verification.results` | pre-commit hook results + code-reviewer agent verdict (when run) |
| `status` | `started` → `success` / `partial` / `failed` (terminal) per §3.0a |

**Recovery-key separation (§4.6).** Two unrelated no-advance commits on the same branch share `operation_id = sha256_hex("commit\n-")` but have **different** `idempotency_key.value` (because the staged-content digest differs). Stage A success-lookup uses `idempotency_key`, NOT `operation_id`, so the second commit does NOT no-op against the first. Mutated content (same paths, different bytes) likewise produces a different `idempotency_key` and never short-circuits a prior success.

**Logical retry vs. terminal failure.** SIGTERM mid-pre-commit-hook → terminal `aborted-on-ambiguity` (Stage-B-resumable). Re-run with same staged paths and unchanged content: Stage A finds no success match (prior was aborted); Stage B chains `retry_of` to the prior receipt; fresh work proceeds. Companion case: pre-commit-hook clean non-zero exit (no signal) → terminal `failed`; re-running produces a fresh `started` receipt with NO `retry_of` chain (`failed` is terminal per schema).

**Manual fallback.** Hand-author `.harness-state/commit-<spec-or-dash-slug>-<ISO-8601-Z-ts>.yml`; commit SHA from `git log -1 --format=%H`; compute the input content digest for `idempotency_key.trace` manually via `git diff --cached | sha256sum`.

## Step 5: Commit

Draft a commit message from the staged changes. Follow the repo's existing commit style (check `git log --oneline -5`).

If `$ARGUMENTS` was provided, use that as the commit message instead of generating one.

```bash
git commit -m "<message>

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Step 6: Update plan.md (if applicable)

```bash
cat docs/plan.md 2>/dev/null || cat plan.md 2>/dev/null
```

If no plan.md exists, skip this step entirely.

If plan.md exists, compare the committed changes against the plan's items. If the commit clearly completes or advances a plan item:

- Mark the item as done (e.g., `~~item~~` or `[x] item`)
- Add a brief note with the commit hash: `(done in abc1234)`

If the commit doesn't relate to any plan item, don't touch plan.md. Typo fixes, refactors, and chores don't need plan updates.

Use `AskUserQuestion` to confirm before editing:

> This commit looks like it completes: **"[plan item text]"**
>
> Want me to mark it done in plan.md?
>
> - **Yes** — mark done with commit hash
> - **No** — leave plan.md unchanged

## Step 7: Update spec task checklist (MANDATORY after Step 6)

**This step runs every time Step 6 touches plan.md.** Do not skip it.

After updating plan.md, find the spec file it relates to:

1. Check if the plan.md entry explicitly references a spec path (e.g., `docs/specs/2026-04-12-editorial-memory.md`)
2. If not, scan `docs/specs/` for a spec whose title matches the plan item topic
3. If no spec found, skip this step

Once you have the spec file, read it and find unchecked tasks (`- [ ]`) that match what was just committed. Match by:
- Task number if the commit message mentions one ("Task 11")
- Task description if it matches the committed changes
- All tasks in a phase if the plan.md update marks a full phase complete

Mark matching tasks as done:

```
- [ ] **Task 11:** PostgresEditorialMemoryStore  →  - [x] **Task 11:** PostgresEditorialMemoryStore (done in ef147c4)
```

Ask the user to confirm:

> These spec tasks look done based on this commit:
>
> 1. Task 11 — PostgresEditorialMemoryStore
>
> - **Mark done** — check them off with commit hash
> - **Skip** — leave spec unchanged

## Rules

1. **Never skip the review.** The whole point is that every commit gets a second look.
2. **Don't loop forever.** Re-review happens at most twice. After two rounds, commit with remaining issues parked.
3. **Parking is not failure.** It's a deliberate decision to defer. No guilt, no nagging.
4. **plan.md updates are optional.** Only touch it when a plan item clearly moved. When in doubt, don't.
5. **Spec updates follow plan.md.** Only check spec tasks when a plan item was just marked done. Don't scan specs independently.
6. **Respect the user's commit message.** If they pass one via arguments, use it. Don't rewrite it.
