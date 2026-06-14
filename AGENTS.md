# AGENTS.md

Tool-neutral protocol contract for any agent (LLM or human) operating on this repo.

## What this repo is

`claude-harness` is a meta-harness: it ships protocol files, skills, and agents that consumer projects symlink in (via `setup-harness`). It is not an application — it is the operating system for spec-driven work across other repos.

## Where state lives

- `docs/specs/` — durable technical specs (`YYYY-MM-DD-<topic>.md`).
- `docs/plan.md` — active board (`## Now` / `## Next` / `## Blocked` / `## Recently Shipped` per spec §6 of `docs/specs/2026-04-30-universal-harness-protocol-v2.md`).
- `docs/waves/` — shipped wave summaries (one file per closed wave).
- `.harness-state/` — receipts and logs (machine-readable; per-receipt schema in `docs/protocol/receipt-schema.md`).
- `criteria/` — quality rubrics consulted by code-reviewer and skill-creator.
- `parking_lot.md` — deferred work and side-quests.
- `WORKFLOW.md` — command-form matrix (Manual / Claude Code / Codex / Automation).

## Plan & spec grammar

Two numbering ladders that never cross. Confusing them is the recurring drift source; this section is the canonical rule — conform to it rather than copying a prior spec's numbering.

**Board ladder — `Wave N` (lives in `docs/plan.md` only).** Global and monotonic: assigned at append time as `max(existing wave numbers) + 1`, never restarts, never reused, never renumbered. A Wave is the `/run-wave` unit and a single all-or-nothing commit batch. "Wave" names a board entry — nothing else. `/spec-planner` is the sole writer of `### Wave N` blocks (see that agent's plan.md auto-append rules).

**Spec ladder — `Phase` + `Task` (lives in `docs/specs/` only).** A per-feature spec subdivides exactly one board wave into `Phase 1..n` / `Task 1..m`, both restarting at `1` inside the spec. `Phase`/`Task` numbers are spec-local and carry no board meaning. Do **not** use "Wave" as a spec-internal heading.

**Feature ids — `F-0xx`.** Global and monotonic across all specs (like waves: never reused). They label acceptance criteria and tasks; they are the one id that spans specs.

**Mandatory header line.** Every spec carries a machine-readable map of which board wave it belongs to, as the first line after the H1 title:

> **Board wave:** Wave 7 · Phases 1–4 · Tasks 1–7 · Features F-014–F-017

Segments are `·`-separated; ranges use an en-dash (`–`); singular labels (`Phase 3`, `Task 5`, `Feature F-014`) name a single item. This line — not any inline heading — is the canonical anchor a parser reads to jump between `plan.md` and the spec.

**Exception — whole-project specs.** A spec that defines several board waves at once (a project-scaffold spec, not a per-feature spec) MAY map `Phase N = Wave N`, but only when `N` equals the real board number. Such a spec emits one header line per board wave it defines (`Board wave: Wave 1 · Phase 1 · …`, then `Board wave: Wave 2 · Phase 2 · …`). Per-feature specs are always one board wave and never do this.

**`(Wave N)` parentheticals are legacy, not canonical.** Older specs write `### Phase 1 (Wave 7):` inline. This stays valid as a fallback — it is **not banned** — but the header line is authoritative. New specs need not add the parenthetical; tools resolve the board mapping from the header line first and fall back to the parenthetical only when the header line is absent.

## What to do

1. Read `WORKFLOW.md` first to choose an execution path for the command at hand.
2. Stage files explicitly (`git add <path>`) — never `git add -A` or `git add .`.
3. Emit a receipt under `.harness-state/<command>-<wave-or-spec-id>-<timestamp>.yml` shaped per `docs/protocol/receipt-schema.md` for any command that mutates state.
4. Stop on ambiguity — write a partial-completion receipt rather than guess.
5. Treat `docs/specs/` as durable intent. Treat `docs/plan.md` as the active board.

## What to avoid

- Don't `git add -A` or `git add .` — it sweeps in secrets and unrelated work.
- Don't merge feature branches without `--no-ff` — it loses history.
- Don't write durable state outside the protocol artifacts above (no `~/.tmp_state`, no untracked sidecars).
- Don't invent state when inputs are missing — stop and surface.
- Don't bypass the receipt schema. Adapter divergence on receipt shape breaks cross-tool replay.
- Don't bake dynamic content (timestamps, build IDs, absolute paths, per-session counters) into static prompt files (`CLAUDE.md`, `AGENTS.md`, any `SKILL.md`). Per [Anthropic's prompt-caching guidance](https://claude.com/blog/lessons-from-building-claude-code-prompt-caching-is-everything), prefix-instability invalidates the conversation-wide cache. Use runtime injection (Claude Code's `system-reminder`, hook output, or a fresh-read of `.harness-state/`) for anything that changes session-to-session.

## Memory

The shared user-global memory root lives at `~/.claude/memory/` and contains six entities:

- `~/.claude/memory/USER.md` — operator profile, ≤1KB, human-written only.
- `~/.claude/memory/FEEDBACK.md` — validated-pattern index, ≤5KB hard cap, `/memory-prune` writes + humans may append.
- `~/.claude/memory/REFERENCES.md` — external resource pointers (URLs, doc locations, install commands), ≤2KB, human-written.
- `~/.claude/memory/PROJECTS.md` — registry of repos + cowork projects (one row per), ≤4KB, human-written.
- `~/.claude/memory/archive/` — resolved or stale entries, unlimited size but **never auto-loaded**.
- `~/.claude/memory/feedback/` — per-pattern detail files referenced from FEEDBACK.md; the dir is never auto-loaded as a whole, only the FEEDBACK.md index is.

### Memory protocol (imperative)

1. Memory directories are pre-loaded at session-start — use them. The shared root at `~/.claude/memory/` is read-only for sessions; treat its contents as canonical operator-curated state. The per-tool auto-memory dir (Claude Code: `~/.claude/projects/<encoded-cwd>/memory/`) is the AI-write surface.
2. As you make progress, record status / decisions / new facts to the per-tool auto-memory dir immediately. Don't batch until end-of-session.
3. **ASSUME INTERRUPTION:** context may compact or reset at any time, and the next session inherits only what's on disk. Unrecorded facts are lost. When in doubt, save.
4. Prefer editing existing memory files (Edit tool) over creating new ones. Rename or delete entries that are no longer relevant. New-file sprawl is a worse failure mode than a stale paragraph.
5. Promotion to the shared root is **manual** via `/memory-prune` (move + frontmatter stamp, not copy). Don't try to short-cut this from a session — the operator owns shared-root mutation.

Caps and line budgets are enforced as conventions, not blocking hooks: `~/.claude/memory/FEEDBACK.md` MUST stay ≤5KB hard cap, and every line in `~/.claude/memory/*.md` (excluding `archive/`) MUST stay ≤150 chars. `/memory-prune` writes FEEDBACK.md; humans may append. `USER.md`, `REFERENCES.md`, and `PROJECTS.md` are human-written only. Over-cap files are surfaced as warnings by `/session-start` and as nudges by `/session-end`, never as blocks.

Promotion from per-tool auto-memory into the shared root is **move + frontmatter stamp, not copy**. When an insight reproduced in a tool-specific auto-memory directory generalizes across projects, promotion to `~/.claude/memory/feedback/<slug>.md` carries a frontmatter `originCwd:` (and `originSessionId:` where the source tool records one) preserving the provenance link. The source file is deleted after the move so duplicate basenames in two per-cwd dirs is a bug, not a feature; promotion is the fix. No auto-promotion hook exists — operator triage is required.

`~/.claude/memory/archive/` is **never auto-loaded** by any tool. It is the append-only audit trail for resolved or stale entries pruned out of the live indexes. Adapters MUST NOT pull `archive/` contents into a session context window. Recovery from the archive is a manual `cp` or `git show` by the operator.

Domain glossaries that a project develops live in `<project-root>/CONTEXT.md`. The format conventions (one-sentence definitions, `_Avoid_:` alias list, relationship lines, flagged ambiguities, ≤5KB before splitting into `CONTEXT-MAP.md`) are documented in the `mattpocock-skills-verdict` memory; AGENTS.md is not the format spec.

## Cross-surface consumption

The **data layer** is portable markdown. Anything with filesystem access — Claude Code, Claude Desktop with the Filesystem MCP wired, claude.ai web with a remote-MCP bridge, plain `cat` from a terminal — reads the shared user-global root at `~/.claude/memory/*` and each project's `CLAUDE.md` directly. No format is tool-specific; no piece of state is gated behind a runtime API. The 5-question portability test from spec §2.3 of `docs/specs/2026-04-30-universal-harness-protocol-v2.md` holds because the answers live in files on disk, not in a session's working memory.

The **auto-load layer** is Claude-Code-specific and stays Claude-Code-specific. Claude Code session-start injection reads per-cwd `MEMORY.md`, project `CLAUDE.md`, and the shared root via a hook the other surfaces do not run. Claude Desktop and claude.ai reach the same data layer through one of two paths: (a) the Filesystem MCP exposing `~/.claude/memory/` + the project root as Project Knowledge sources (Desktop only — requires manual MCP config); or (b) a one-time UI drag of the project's `.claude/desktop-knowledge/` bundle into Project Knowledge (Desktop and web). Both paths produce read access to the same bytes Claude Code sees; neither replaces Claude Code's auto-load hook.

The `.claude/desktop-knowledge/` bundle scaffolded by `/new-cowork` inside each cowork project is the explicit cross-surface bridge. It contains 5 files by default: `README.md` (operator drag instructions + caveats), `USER.md` (symlink → `~/.claude/memory/USER.md`), `FEEDBACK.md` (symlink → `~/.claude/memory/FEEDBACK.md`), `workspace-CLAUDE.md` (copy of the project's own `CLAUDE.md` — Desktop symlink-following is unreliable for the persona file), and `mcp-config-snippet.json` (filesystem-MCP allowlist scoping Desktop to the project + memory root). When `/new-cowork` runs with `--area-context=create` (Wave 15), the bundle grows to **7 files**: two additional bytes-exact copies — `area-CLAUDE.md` (from `~/cowork/<area>/CLAUDE.md`) and `area-meta.md` (from `~/cowork/<area>/_area.md`) — propagate area-level persona/collaborators/style to Desktop and claude.ai, which don't parent-walk. After editing the source area files, run `/cowork-area-sync <area>` to refresh every active project's bundle (closed/archived/missing-status projects are skipped and left byte-identical). There is **no programmatic Project-creation API** for Claude Desktop or claude.ai as of 2026-05-13, so initial Project setup is irreducibly a one-time operator UI drag. Refresh cadence varies by surface: live via MCP for Filesystem-wired Desktop; re-drag-after-edit for upload-only flows. See `skills/new-cowork/templates/desktop-knowledge-README.md.tmpl` for the operator instructions that ship in each scaffolded project.

## Loop protocol

The loop is a third execution lane alongside the wave lane (`/run-wave` → `/close-wave`). Where the wave lane dispatches and merges **one** all-or-nothing batch with a human checkpoint between waves, the loop drives a **stream** of ready work — board waves or tracker issues — end-to-end behind a mechanical gate, unattended, until the source drains or a termination cap fires. It is tool-neutral: any agent that can run a per-item gate, read a work source, and merge under a precondition can implement it. The reference implementation lives in `skills/_shared/loop/` and the entry command is `run-loop` (see `WORKFLOW.md`).

**Work sources.** Two providers, selected by argument: a **wave source** (reads `docs/plan.md`, one item per ready `### Wave N` block) and an **issue source** (reads the tracker's `ready-for-agent` items, one item per issue). Each item declares a runner and its dependency edges (`blocked-by`); an item is *ready* only when ALL its blockers are MERGED (not merely attempted) — a fresh build integrates from the merged head, so an un-merged blocker is not present.

**Per-item gate sequence (the mechanical gate).** Every item runs the same ordered sequence; the loop never proceeds past a red step:

1. Run the agent against the item's spec/body inside its runner's isolated workspace.
2. **Exit gate** — the item's own verify gate. Red ⇒ stop at `gate-failed`, never merge.
3. **Code review** + bounded auto-fix (at most one re-review). Surviving blocking findings ⇒ escalate; non-blocking findings are filed as tracker issues so nothing is dropped.
4. **Atomic merge** (AFK items only): run lock → per-item claim → record base → integrate head onto the item branch → **rerun the exit gate on the exact commit to be merged** → fast-forward/precondition merge (abort + re-queue if the head raced) → outbox-keyed downstream effects.
5. **Post-merge effects** — tick the board row (`[ ]`→`[x]`, move to shipped) and write receipts, idempotently keyed by the merge commit, driven by outbox reconciliation. The board stays the single source of truth — no parallel state machine.

**Runner selection.** An item runs in one of two runners. The **sandcastle** runner (default) runs the agent in a container — the OS is its security boundary. The **worktree** runner runs the agent natively on the host — the OS is NOT the boundary, so the worktree lane carries the safety guardrails below. An item's declared runner defaults to sandcastle when unspecified.

**AFK vs HITL classification (the 4-gate capability test).** An item escalates to a human only if it requires (1) an unobtainable credential/access, (2) an out-of-band action, (3) an unspecified product/design judgment, or (4) an irreversible production action. The test is **runner-aware**: the same task can be agent-runnable (AFK) under one runner and human-in-the-loop (HITL) under another, because runners differ in the secrets/tools they expose. The planner classifies at plan time; the loop reconciles each item's existing readiness label against the test once the runner is known, re-labeling on divergence. An initial triage label is a hint only.

**Risk-proportional auto-merge / scheduler semantics.** The scheduler is AFK-frontier-first: it drains every item whose entire ancestry is AFK-or-merged, auto-merging each through the atomic gate. A ready HITL/worktree item opens a PR, is marked awaiting-human, and the run **continues** with other AFK items rather than blocking on it. Any item under an un-merged HITL ancestor is deferred to the blocked-on-human set and not attempted this run. No stacked branches: an item is attempted only when every blocker is actually merged.

**Safety guardrails (worktree lane).** Before any worktree item runs, a catastrophic-command denylist gate (a pre-tool hook that fires regardless of permission mode) must be active; absent, worktree items are refused while sandcastle items still drain. The denylist is a backstop, not the confinement boundary — it canonicalizes commands, covers non-shell file writes via write-root confinement, and fails closed on parse ambiguity. The worktree runner confines writes to an explicit set of roots {the worktree dir, the run's state dir}, OS-enforced where the host supports it and advisory otherwise (surfaced honestly in the run summary). A **secret-bearing** worktree item (declares a credential need) additionally requires: default-deny outbound egress (only an operator-declared host allowlist plus loopback; the git remote is not auto-allowed), per-item pre-execution approval (absent ⇒ deferred, never run unattended), and task-scoped credential injection (only the item's declared secrets, never the whole environment). Where no OS-level egress mechanism exists, the secret-bearing item is refused rather than run with open network and live secrets.

**Termination / safety stops.** The loop stops on the first of: work source drained, iteration cap, stall (N consecutive gate failures), token-budget exhausted, or an optional wall-clock cap. It records a run summary on every exit — the AFK-merged / HITL-waiting / blocked-on-human metric plus any residual-risk warnings (weak-posture, advisory-write-root, allowlisted-git-remote). **Resume is just "run again":** the loop skips items the source reports done, reconciles items left mid-transition, and repairs merged-but-unticked board rows, all idempotently.

**Relationship to the wave lane.** The loop reuses the wave lane's machinery, it does not replace it: an AFK merge performs the same board tick + receipts the wave-close step performs, and the planner's per-wave runner declaration feeds the loop's runner selection. Use the wave lane when a human checkpoint between batches is wanted; use the loop when a stream of independently-gated work should drain unattended.

## How to discover next action

Use the 5-question portability test from spec §2.3 of `docs/specs/2026-04-30-universal-harness-protocol-v2.md`:

1. What is active? → `docs/plan.md ## Now`
2. What is blocked? → `docs/plan.md ## Blocked`
3. What was shipped? → `docs/waves/`
4. What verifies this? → spec exit gate + `.harness-state/` receipt
5. What do I do next? → `WORKFLOW.md`

If any answer requires the original Claude/Codex session, the harness is coupled too tightly — fix the protocol files, not the session.

Tool-specific overrides (Claude-specific behavior, Codex-specific prompts) live in `CLAUDE.md` and future `.codex/` adapters respectively. This file stays neutral.
