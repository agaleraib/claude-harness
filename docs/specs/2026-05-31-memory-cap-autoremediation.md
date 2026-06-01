# Memory Cap Auto-Remediation — hook-fired, cross-repo, detached-worker

## Overview

The per-cwd auto-memory system degrades silently as files grow past their soft cap. `/memory-prune` exists (shipped Wave 12 of the 2026-05-13 memory-system-redesign) but it is **manual, dry-run-by-default, and shaped for the wrong target** — so in practice nothing ever runs and the bloat compounds. A system-wide scan on 2026-05-31 quantifies the degradation across **13** per-cwd memory dirs:

| repo (per-cwd dir) | files | over-cap (>5 KB) | `MEMORY.md` |
|---|---:|---:|---:|
| **workspace-gobot** | 411 | 55 | **181,158 B** |
| services-global-proxy | 88 | 22 | 37,673 B |
| workspace-second-brain | 66 | 12 | 27,565 B |
| workspace-wordwideAI | 92 | 13 | 20,635 B |
| workspace-claude-harness | 112 | 29 | 8,521 B |
| cowork-robust | 6 | 3 | 1,509 B |
| quickbase-replaceme | 20 | 4 | 5,535 B |

(remaining dirs healthy). **gobot's `MEMORY.md` is the index itself at 181 KB** — loaded into *every* gobot session, a ~45K-token tax before any work starts. This is a live load-budget breach, not slow housekeeping.

Two root causes:

1. **Append-only with no eviction.** Dossiers (`project_*.md`, `feedback_*.md`) accumulate detail across waves and never shed it. The two biggest claude-harness offenders are *closed* work (`project_memory_system_redesign.md` 54 KB — Wave 14 CLOSED; `project_planning_loop_skill.md` 41 KB — shipped). For closed work the full detail now lives in git + `docs/`, so it is safe to archive the body and leave a stub.
2. **No automatic trigger.** `/memory-prune` must be typed, defaults to the *healthy* shared root, and its `--apply` archives index bullets with vanished links — it cannot sensibly compress a 54 KB standalone dossier. So the right tool is aimed at the wrong target and never fires.

This spec adds a **hook-fired, cross-repo auto-remediation layer** modeled on the community-proven Claude Code memory architecture (claude-mem, Hindsight, the PreCompact auto-memory pattern): a near-zero-cost **detection** path on every memory write, **remediation** fired by lifecycle hooks with overlapping checkpoints (so no single exit path is a point of failure), and the expensive LLM-compaction offloaded to a **detached background worker** that never blocks the turn. It is deliberately scoped to **cap-management of existing files** — it does not change what gets captured or how memory is recalled.

## Prior Work

- `docs/specs/2026-05-13-memory-system-redesign.md` — created the shared root, the per-cwd/shared split, and `/memory-prune` (Wave 12). This spec is its follow-on: it makes prune *fire* and handle the dossier file shape.
- `skills/memory-prune/SKILL.md` — existing safe-mutation machinery to reuse verbatim: temp-rename + byte-exact backup (`git hash-object -w`) + journal + canonical receipt under `.harness-state/`. **Do not reinvent; extend.**
- Community trigger survey (2026-05-31): the Karpathy LLM-wiki gist is *prompt-driven, no hooks*. The mature systems converge on lifecycle hooks (`SessionStart` load · `PostToolUse`/`UserPromptSubmit` capture · `Stop`/`PreCompact`/`SessionEnd` distill) and run LLM work in a **detached process** (claude-mem: ~2 ms hot path, 2–5 s async compression; PreCompact pattern spawns headless `claude -p`). These are the load-bearing design borrowings.

## Design Principles

1. **Hot path is deterministic and ~free.** Detection never calls an LLM and never blocks the turn (target: single-digit ms, mirroring claude-mem's 2 ms capture path).
2. **Redundant checkpoints, not one trigger.** Remediation fires on whichever of `Stop` / `SessionStart` / (`PreCompact`, `SessionEnd` opportunistic) runs first. `SessionStart` (documented `startup|resume`) is the *guaranteed* backstop — it always fires next-open regardless of how the prior session died (Ctrl-C×2, crash, terminal-killed). We do **not** depend on `SessionEnd`, whose trigger reasons are undocumented and unproven for interrupt-style exits.
3. **Closed is deterministic; open is LLM — but the LLM never gets the last word.** Over-cap files whose work is closed → archive-and-stub with no LLM (pure file ops, reversible). Over-cap *open* files → compacted by a detached `claude -p` worker that emits a **candidate**, which a **deterministic preservation gate** (link-set/frontmatter/size checks, the gobot Phase 5 check-set) must pass before any replace. Fail-closed for `MEMORY.md` and open dossiers. Never lose bytes: byte-exact backup before any mutation.
4. **Cross-repo by construction.** One hook block in **global** `~/.claude/settings.json`, matching the path glob `~/.claude/projects/*/memory/`, covers all 13 repos at once. No per-repo wiring.
5. **Reuse, don't reinvent.** All mutation goes through the existing `/memory-prune` safe-apply path (temp-rename + backup + journal + receipt).
6. **Idempotent + debounced.** `Stop` fires after every response; the worker must no-op on an empty queue and debounce so it never thrashes.
7. **Compare-and-swap, never blind-replace.** Every queue entry carries a CAS fingerprint (sha/mtime/size) of the source at enqueue time; the worker re-checks it immediately before replace. A file that changed since enqueue is requeued, never clobbered — a detached worker cannot overwrite memory written by a concurrent session/hook.
8. **Per-cwd containment for archives too.** Stub archives land under the **per-cwd** `archive/` tree with collision-proof names (source stem + content hash), never the user-global read-only shared root. Repo A's remediation cannot collide with or write into repo B / the shared root.

## Data Model

### Entity: over-cap queue (`<per-cwd>/.memory-overcap/` — one-file-per-entry spool)
A **crash-safe, one-file-per-entry spool** (NOT a single append-only file), written by the detection hook **and the worker-side initial scan** (see Phase 0), drained by the worker. The spool replaces the earlier single-JSONL design because hook producers and the worker would otherwise contend on one file with no atomic-append, ack, or crash-recovery semantics (this finding). Layout under `<per-cwd>/.memory-overcap/`:
- `queue/pending/` — entries awaiting drain.
- `queue/processing/` — entries the worker has claimed (moved here atomically before work begins).
- `queue/done/` — entries successfully remediated (durable ack; pruned on a retention window).
- `queue/error/` — entries that failed (durable record for retry/inspection).

**Producer protocol (hook + scan, contention-free):** write the entry JSON to `queue/tmp-<rand>` (a unique temp name within the same dir, so the rename is same-filesystem and atomic), `fsync` optional, then `mv` (atomic `rename(2)`) into `queue/pending/<src_sha[:12]>-<epoch>.json`. Producers never open a shared file; temp+rename means a half-written entry is never visible in `pending/`. The pending filename embeds `src_sha[:12]` so a duplicate enqueue of an unchanged file collides on the same name (idempotent — a producer that loses the rename race is a harmless no-op).

**Consumer protocol (worker, exactly-once-ish drain):** for each file in `queue/pending/`, the worker first `mv`s it into `queue/processing/` (atomic claim — a second worker that loses this rename skips the entry, so two workers never process the same entry; the per-dir lockfile is belt-and-suspenders, not the primary guard). After remediation: on success `mv` the entry to `queue/done/`; on failure `mv` to `queue/error/` with an appended `error` field. A worker that crashes mid-entry leaves the entry in `processing/`; on next spawn the worker **re-claims `processing/` entries older than a staleness window** (re-runs the CAS check, so a stale claim is safe) — durable crash recovery with no lost or double-applied work.

Each entry file contains:
```
{ "path": "<abs file>", "bytes": 54260, "cap": 5120, "status": "closed|open|unknown",
  "src_sha": "<git hash-object of file at enqueue time>", "src_mtime": "<epoch-s>",
  "src_size": 54260, "detected_at": "<iso, injected by hook env>", "source": "hook|scan|all-roots" }
```
- `status` derived deterministically by the hook from the file's frontmatter (`metadata.status: closed|shipped` or an index line marking the topic CLOSED). `unknown` when undeterminable → treated as `open` (conservative: never auto-archive something not provably closed).
- `src_sha` / `src_mtime` / `src_size` are the **compare-and-swap (CAS) fingerprint** captured at enqueue time. The worker re-stats and re-hashes the file immediately before replace; if any of the three differ from the queue entry, the stale-output is discarded and the path is **requeued** (a fresh `pending/` entry, not written) — this prevents a detached compaction from clobbering memory another session/hook appended after the worker read the source.
- Spool is per-cwd (lives beside `MEMORY.md`) so the worker for repo A never touches repo B.
- **No exotic deps:** `mkdir -p`, `mv`, `git hash-object`, `date -u` only — portable to bash 3.2 on darwin + Linux. Atomicity rests on POSIX same-directory `rename(2)`.

### Entity: cap policy
Two caps, because the two file roles have different costs:
- **Index cap** — `MEMORY.md`, loaded *every* session. Strict (proposed 5 KB / 24.4 KB hard loader limit). Over-cap index → highest-priority remediation.
- **Dossier cap** — recalled on-demand. Soft (proposed 5 KB). Over-cap dossier → queued, remediated at next checkpoint.
(Exact values are an Open Question — see below.)

### Entity: bounded-index model (active index + archived index) — resolves the preservation-vs-cap conflict
A naive "keep every pointer bullet AND fit under the loader cap" is **mathematically impossible** for large indexes: gobot's index carries 325 pointer bullets, and the Phase 5 lossless trim still lands at 47.7 KB — roughly 2× the 24.4 KB loader cliff — *precisely because it did not yet split active from shipped pointers*. That residual is the motivating evidence: lossless compaction alone cannot reach the cap; the link set must be **partitioned, not all kept in the loaded file.** The bounded-index model resolves this:
- **`MEMORY.md` (active index — auto-loaded, capped):** holds only the *active pointer set* — live runbooks, open/in-flight work, current gotchas, active conventions. This is the only file `SessionStart` loads, and it is what the index cap binds.
- **`<per-cwd>/MEMORY-shipped.md` (archived index — NOT auto-loaded):** holds pointers to closed/shipped/superseded work moved out of the active index. It is itself capped only loosely (it is never loaded into a session) and is the recall target when a closed topic is needed. It carries a frontmatter pointer back from `MEMORY.md` (`Archived pointers: MEMORY-shipped.md`) so the trail is one hop.
- **Compaction of an over-cap `MEMORY.md` is therefore a *partition*, not a lossy rewrite:** the worker moves shipped/closed pointer bullets from the active index into `MEMORY-shipped.md` (append) and removes them from `MEMORY.md`. No bullet is deleted; every bullet lands in exactly one of the two files.
- **Preservation is checked across the UNION**, not against `MEMORY.md` alone (see preservation gate below). A bullet is "preserved" if it appears in `MEMORY.md` ∪ `MEMORY-shipped.md`; a bullet present in neither is a hard gate failure.
- **Fixture requirement:** a fixture must prove the **largest current index (gobot, 325 bullets / 47.7 KB after lossless trim)** can be partitioned so that the resulting `MEMORY.md` is `≤ index cap` while the active ∪ archived union preserves every link/bullet/source-ref recoverable. This fixture is the acceptance evidence that the bounded-index model actually closes the cap gap (not merely "ought to").

### Entity: remediation outcomes
- **stub** — closed dossier: body moved to a **per-cwd archive** `<per-cwd>/archive/prune-<utc>-<src-stem>-<src_sha[:8]>.md` (collision-proof: the source filename stem + short content hash guarantee uniqueness across concurrent workers and never cross the user-global read-only boundary — finding 3). Original file replaced by a ≤1 KB stub (frontmatter + 2–3 line summary + `Full detail archived: <archive path>` + `[[links]]`). Byte-exact backup first. The archive write is contained to the per-cwd tree; a `realpath`/prefix check asserts the destination is under `<per-cwd>/archive/` before any write (root-containment guard).
- **compact** — open dossier or over-cap index: detached `claude -p` first emits a **candidate file** (`<path>.compact-candidate`), which the deterministic preservation gate (Phase 3a) validates before any replace. For an over-cap `MEMORY.md` the candidate is a **bounded-index partition** (shipped/closed bullets moved to `MEMORY-shipped.md`, active bullets retained) — see the bounded-index entity — and the gate checks preservation across the active ∪ archived union. Only a candidate that passes the gate is promoted (backup-then-replace via the safe-apply path, atomically replacing both `MEMORY.md` and appending to `MEMORY-shipped.md`); a candidate that fails the gate is **discarded and the path requeued** (open dossier) or **left for human review** (`MEMORY.md` index — fail-closed). Diff recorded in journal; receipt emitted. CAS fingerprint (above) re-checked at promote time.

### Entity: preservation gate (deterministic validator)
The compaction output is **not "trust the LLM"**; it is validated by the same deterministic check-set the gobot Phase 5 hotfix proved (link-set + line-length + lossless spot-check), extended to the **bounded-index union** so the gate is satisfiable under the cap. The preservation set is checked against the **union of (active index `MEMORY.md` ∪ archived index `MEMORY-shipped.md`)** for index compaction, and against (candidate ∪ its archive stub) for dossier stubbing — never against the loaded file alone. A candidate passes only if **all** hold against the pre-compaction source:
- **Frontmatter preserved** — YAML frontmatter block present in the active file and `metadata.*` keys are a superset of the source's.
- **Link-set preserved across the union** — every `[[link]]` and every Markdown `](X.md)` reference in the source resolves in `MEMORY.md` ∪ `MEMORY-shipped.md` (no live link dropped). The check, generalizing the hotfix's `source ⊆ candidate`: assert `links(source) ⊆ links(active) ∪ links(archived)`. A link present in neither is a hard failure.
- **Required index entries preserved across the union** (for `MEMORY.md`) — every topic-file pointer bullet in the source index appears in **exactly one** of the active or archived index (no bullet lost, no bullet duplicated); section headers preserved in whichever file retains them.
- **Source references preserved across the union** — git SHAs / wave numbers / `docs/` paths cited in the source still appear in active ∪ archived.
- **Line-length** — no line exceeds the 150-char cap (the per-line policy the prune skill already enforces) in either file.
- **Active-index size** — the resulting **`MEMORY.md` is strictly smaller than source and ≤ the index cap** (the loaded file is what must fit; the archived index is not size-bound because it is never auto-loaded). If `MEMORY.md` cannot reach the cap even after moving every shippable bullet to the archive, the gate fails (the active set itself exceeds budget — route to human review, never silently ship over-cap).

Gate outcome is **fail-closed**: any failed check ⇒ no replace. For `MEMORY.md` and any file with `status: open` the failed candidate is written aside (`<path>.compact-rejected`) and a `needs-review` receipt is emitted for the human; it is never auto-promoted.

## Requirements

### Phase 0 — Initial over-cap migration scan + system-wide sweep (closes the backlog + cross-repo gaps)
The detection hook only enqueues files **written after the hook exists**; the existing backlog of over-cap files (55 in gobot, 29 in claude-harness, etc.) would otherwise never be remediated unless coincidentally re-edited. **Dormant repos** — per-cwd dirs never *opened* after the hook lands — are the harder gap: a per-cwd worker that only ever runs in the current cwd will never scan a repo nobody opens. To close both:
- **Per-cwd scan (steady state):** the **worker performs a one-time-per-dir scan** on first run in a per-cwd dir (and on demand via `/memory-prune --scan`): enumerate every `*.md` under the per-cwd memory dir, stat each, and for every file over its role cap **enqueue a spool entry** (`source: "scan"`, with the full CAS fingerprint) if no live entry for that path already exists. Idempotent — a path already at-or-under cap, or already enqueued with a matching `src_sha` (same `pending/` filename), is skipped.
- **System-wide sweep (`/memory-prune --all-roots` — closes the cross-repo gap):** a one-shot mode that **enumerates `~/.claude/projects/*/memory/` across ALL per-cwd dirs**, not just the current cwd, and runs the per-dir over-cap enumeration in each — populating every dir's spool regardless of whether that repo is ever opened. This is the mechanism that guarantees dormant repos are covered without waiting for next-open. It is runnable by hand at any time and is **required at rollout** (see exit gate). For each dir it reuses the same idempotent enqueue + the closed-first cheap-stub preference (OQ 7).
- A sentinel (`<per-cwd>/.memory-overcap/.scanned`) records that the initial scan ran for the dir so the worker does not re-enumerate the whole tree every spawn; `/memory-prune --scan` and `--all-roots` force-rescan regardless of sentinel.
- **Exit gate obligation (queued does NOT count as remediated):** the wave is not closeable until **every affected `MEMORY.md` (index) across all `~/.claude/projects/*/memory/` dirs is actually `≤ index cap`** — OR carries a **recorded reviewed-exception** (a human-acknowledged entry in `.memory-overcap/exceptions.md` naming the file, the reviewer, the reason, and a **bounded deadline** ≤ a fixed horizon, e.g. 14 days). A live spool entry is **NOT** sufficient — queued-but-undone work does not reduce SessionStart load and does not prove a human reviewed a rejected index. The rollout exit-gate bash must: (a) run `/memory-prune --all-roots` (system-wide sweep) so no dir is silently skipped; (b) for each dir assert `MEMORY.md` byte-size ≤ index cap, **else** assert a non-expired reviewed-exception line exists for it; (c) fail the gate on any dir that is neither under cap nor exception-covered. gobot's 181 KB index is brought under cap by Phase 5 + the bounded-index partition; this gate covers all 13 dirs.

### Phase 1 — Detection hook (deterministic, cross-repo)
- Add a `PostToolUse` hook (matcher `Edit|Write`) to **global** `~/.claude/settings.json`, chained after the existing `Edit|Write` hook (do not clobber it).
- The hook script: if the written file path matches `*/.claude/projects/*/memory/*.md`, stat its byte size; if over the role-appropriate cap, classify `closed|open|unknown` from frontmatter/index, capture the CAS fingerprint (`git hash-object` SHA + mtime + size), and enqueue a spool entry into that dir's `.memory-overcap/queue/pending/` via the **temp+atomic-rename producer protocol** (`source: "hook"`) — never an append to a shared file. Else exit 0 immediately. The producer is contention-free with the worker and with other producers by construction (temp name → `rename(2)` into `pending/`).
- **Never mutates the file Claude just wrote** (avoids corrupting Claude's in-session file-state tracking). Detection only.
- Portable bash (3.2), single-digit-ms target, exit 0 always (non-blocking).

### Phase 2 — `/memory-prune` dossier-mode + correct default root
- **Default-root fix:** when run from inside a project (cwd resolves to a `~/.claude/projects/<encoded-cwd>/` that exists), scan the *per-cwd* dir by default, not only the shared root. A bare `/memory-prune` must surface the real bloat. Add an explicit `--root both` and keep `--root <path>` override.
- **Dossier-archive mode (`--apply`, closed files):** for an over-cap file provably closed, perform stub-and-archive via the existing safe-apply machinery (temp-rename + `git hash-object -w` backup + journal line `{path,bytes_before,bytes_after,archive_path,backup_blob_sha}` + receipt). Deterministic, no LLM. Archive destination is **per-cwd** (`<per-cwd>/archive/prune-<utc>-<src-stem>-<src_sha[:8]>.md`), root-containment-guarded, **not** the shared `~/.claude/memory/archive/` (finding 3).
- **`--scan` flag:** force the Phase 0 over-cap enumeration of the per-cwd dir and (re)populate `.memory-overcap/queue/pending/`, ignoring the `.memory-overcap/.scanned` sentinel.
- **`--all-roots` flag (system-wide sweep):** enumerate **every** `~/.claude/projects/*/memory/` dir and run the over-cap scan in each, populating each dir's spool — the cross-repo guarantee for dormant repos (Phase 0). Reuses the per-dir scan logic; idempotent across runs. This is the mode the rollout exit gate invokes.
- **Compact mode (`--apply --compact`, open files / over-cap index):** invoke the detached worker (Phase 3) rather than archiving. For `MEMORY.md` the worker produces a bounded-index partition (active vs `MEMORY-shipped.md`), not a lossy rewrite.
- Dry-run remains the default and prints the per-role over-cap report (index vs dossier) with counts matching the system-wide scan format above.

### Phase 3 — Detached compaction worker
- A standalone script the hooks/skill spawn **detached** (`nohup … &` / `setsid`, fire-and-forget) so it never blocks the turn — mirroring claude-mem's async worker and the PreCompact `claude -p` pattern.
- On first run in a per-cwd dir (no `.memory-overcap/.scanned` sentinel), runs the **Phase 0 initial scan** to enqueue the existing backlog before draining.
- **Drains the spool** (`.memory-overcap/queue/`) for the current cwd via the consumer protocol: atomically `mv` each `pending/` entry into `processing/` to claim it (a worker that loses this rename simply skips — exactly-once claim), re-reads it, and on next spawn re-claims any `processing/` entry older than the staleness window (crash recovery). For each claimed entry, **re-stat + re-hash the source and compare against the entry's CAS fingerprint** (`src_sha`/`src_mtime`/`src_size`). If it differs, the file changed since enqueue → **discard the stale entry and requeue** a fresh `pending/` entry (never write a stale output). If it matches:
  - **closed** → stub-and-archive to the per-cwd archive (same machinery as Phase 2);
  - **open / over-cap index** → `claude -p '<compaction prompt>'` emits a **candidate file** (not an in-place rewrite; for `MEMORY.md` a bounded-index partition); the candidate is run through the **Phase 3a preservation gate**; only a passing candidate is promoted via backup-then-replace, with the CAS fingerprint **re-checked one final time immediately before the atomic replace** (TOCTOU guard).
  - On success `mv` the entry to `done/`; on unrecoverable failure (gate-reject, repeated CAS thrash) `mv` to `error/` with an `error` field — durable ack/retry, no silent loss.
- **Debounce + idempotency:** lockfile per dir (prevents competing workers, secondary to the atomic `processing/` claim — note neither proves the file is unchanged; that is the CAS check's job); no-op on empty `pending/`; skip a path already remediated to a size under cap; cap the worker's wall-clock and the number of `claude -p` calls per run (cost guard); `log()`/receipt any file it deliberately skipped, requeued, or rejected (no silent truncation).

### Phase 3a — Preservation gate (deterministic validation before replace)
- Compaction **never writes in place**. The `claude -p` rewrite lands at `<path>.compact-candidate` (for `MEMORY.md`, a bounded-index partition: a new active `<path>.compact-candidate` plus the bullets destined for `MEMORY-shipped.md`) and is validated by the deterministic check-set from the **Data Model § preservation gate**, checked **across the active ∪ archived union** (frontmatter superset · link-set `links(source) ⊆ links(active) ∪ links(archived)` · required index entries present in exactly one of active/archived · source refs · 150-char lines · active-index strictly-smaller-and-≤-cap). This generalizes the gobot Phase 5 proven check-set to the bounded-index model — not a new heuristic; the proof that it is *satisfiable* under the cap is the gobot partition fixture (Data Model § bounded-index model).
- **Fail-closed:** any failed check ⇒ no replace. For `MEMORY.md` and any `status: open` file, a failed candidate is written aside (`<path>.compact-rejected`) and a `needs-review` receipt is emitted for human adjudication; it is **never auto-promoted**.
- A passing candidate is promoted through the safe-apply path (byte-exact backup of the original → atomic temp-rename replace → journal → receipt), with the CAS re-check immediately before replace.

### Phase 4 — Remediation triggers (lifecycle hooks)
- **`Stop` hook (primary):** spawn the detached worker after each response. Worker debounce makes frequent firing cheap.
- **`SessionStart` hook (guaranteed backstop):** spawn the worker on `startup|resume` — catches anything a hard-killed prior session left queued, re-claims stale `processing/` entries (crash recovery), and triggers the **Phase 0 initial scan** the first time it runs in a per-cwd dir (so the backlog is enqueued for repos *opened* after the hook lands). Note this covers opened repos only; **dormant (never-opened) repos are covered by the `--all-roots` sweep**, not by SessionStart.
- **`PreCompact` + `SessionEnd` (opportunistic):** also spawn the worker; if they fire we remediate sooner, if not the above two cover it. Never the sole path.
- All four registered in global `~/.claude/settings.json`. `/session-start` and `/session-end` skills already surface prune warnings — keep that human-visible summary.

### Phase 5 — gobot index hotfix (separate, immediate)
- gobot's 181 KB `MEMORY.md` is an active per-session tax; remediate now, by hand, ahead of the automated system: byte-exact backup → archive stale body to **gobot's per-cwd `archive/`** → rebuild `MEMORY.md` as a true pointer-index → receipt. Low-risk, immediate relief; also the canonical worked example the compaction prompt is tuned against **and the source of the deterministic preservation-gate check-set** (Phase 3a) — the link-set resolution check (`every ](X.md) resolves`), the 150-char line check, and the lossless spot-check are lifted directly from this hotfix. (Already shipped 2026-05-31: 181 KB → 47.7 KB.)
- **The 47.7 KB residual is the load-bearing evidence for the bounded-index model.** Lossless trim alone left gobot's index at ~2× the 24.4 KB loader cliff *because it did not yet split active from shipped pointers*. Phase 5 must be **followed by a bounded-index partition** of gobot's `MEMORY.md` — moving shipped/closed pointer bullets into `gobot/MEMORY-shipped.md` until the active `MEMORY.md` is ≤ index cap — and that partition is the **gobot fixture** the bounded-index model (Data Model) requires as acceptance evidence. Until that partition lands, gobot's index is exception-covered (recorded reviewed-exception with a bounded deadline), not silently shipped over-cap.

## Proposed Phasing (for `/planning-loop` to formalize)

Design-complete; wave numbering, exit-gate bash, and atomic guarantees are the planning-loop/spec-planner crossover (per `feedback_planning_loop_stop_signal`). Suggested mapping: P5 hotfix first (urgent, standalone, also tunes the compaction prompt + proves the preservation-gate check-set) **then the gobot bounded-index partition fixture** (proves the active∪archived split reaches the cap) → P1 detection (spool producer) → P2 skill upgrade (incl. `--all-roots`) → P3 worker + spool consumer + P3a preservation gate → P0 initial scan + system-wide sweep (lands with the worker/skill, since they host it) → P4 triggers. P0–P4 touch global settings + a skill + a new script across all repos → high-stakes structural; a multi-wave, **all-or-nothing batch** (the detection hook + spool + CAS fingerprint + preservation gate + bounded-index partition must all land before any trigger spawns a worker that replaces files — a half-shipped state where the worker writes without the gate, the CAS check, or the bounded-index split is materially worse than no change). The **rollout exit gate** (Phase 0) runs `/memory-prune --all-roots` and asserts every `MEMORY.md` is ≤ index cap or carries a non-expired reviewed-exception — queued work does not satisfy it.

## Constraints

- TypeScript/bash strict; portable bash 3.2 (no GNU `-printf`, no `Date.now()` equivalents in hooks beyond `date -u`).
- Hooks must be non-blocking (exit 0) and idempotent; the hot path makes **zero** LLM calls.
- All mutation reversible via byte-exact backup; receipts conform to `docs/protocol/receipt-schema.md`.
- Stage files explicitly; `--no-ff` merges.

## Open Questions

1. **Cap values.** Keep 5 KB for dossiers? Different (looser) cap for dossiers vs the strict index cap? What hard limit for `MEMORY.md` (the 24.4 KB loader cliff)?
2. **`claude -p` cost ceiling.** Max compaction calls per worker run, and per day, across 13 repos? Debounce window for `Stop`?
3. **"Closed" detection.** Is frontmatter `metadata.status` reliably present, or do we need an index-scan heuristic? What is the false-positive cost of auto-archiving a misclassified-closed file? (Mitigated by backup, but stub churn is noise.)
4. **Worker spawn portability.** `setsid` is absent on macOS; confirm the detached-spawn idiom that works on darwin + the LXC/Linux hosts.
5. **Hook ordering.** Confirm chaining a second `PostToolUse` `Edit|Write` block alongside the existing one runs both (vs last-wins) in current Claude Code.
6. **CAS-mismatch policy — requeue vs merge.** On a CAS mismatch (file changed since enqueue) this spec **requeues** (re-compact from the current bytes) rather than attempting a 3-way merge of the stale compaction against the new source. Requeue is simpler and lossless (the new bytes are the source of truth); a merge path could save a `claude -p` call but risks reintroducing the very clobber it aims to avoid. Merge is deferred — decide only if requeue-thrash on hot files proves costly in practice.
7. **Initial-scan blast radius.** The Phase 0 scan, on first run across 13 dirs (or one `--all-roots` sweep), could enqueue ~150 over-cap files at once. Confirm the per-run `claude -p` ceiling (OQ 2) drains this backlog over several worker invocations rather than one expensive burst, and that closed-file stubbing (no LLM) is preferred first to cheaply shrink the queue.
8. **Reviewed-exception horizon.** What is the fixed maximum deadline for a recorded reviewed-exception in the exit gate (proposed ≤14 days)? Where does the exception ledger live (`<per-cwd>/.memory-overcap/exceptions.md` proposed) and what fields are mandatory (file, reviewer, reason, deadline)? An expired exception must re-fail the gate.
9. **`MEMORY-shipped.md` growth.** The archived index is not auto-loaded, so it is only loosely capped — but it still grows unboundedly across waves. Does it need its own eventual eviction (e.g. to a dated `MEMORY-shipped-<year>.md` roll-off), or is unbounded acceptable since it is recall-only? Decide after the bounded-index model is in use.
10. **Spool retention.** `queue/done/` and `queue/error/` accumulate. Confirm the retention window before `done/` entries are pruned, and whether `error/` entries auto-retry or require human inspection.
11. **Bounded-index split heuristic.** How does the worker decide which pointer bullets are "shipped/closed" vs "active" for the partition? Frontmatter `status`/`CLOSED` markers on the *linked dossier* (same signal as the closed-archive classifier), or an explicit section boundary in `MEMORY.md`? False-positives only mis-route a pointer between two preserved files (no data loss), but they hurt recall ergonomics.

> Note on Codex "finding N" labels: the Data Model § entity comments previously referenced `finding 2/3/4` from an earlier round; those inline tags have been normalized to plain descriptions in this revision since the numbering diverged from the current review round and was a source of confusion. No finding was dropped — all four round-2 findings are addressed in the bounded-index model, the spool, the `--all-roots` sweep, and the strengthened exit gate above.

## Risks

- **Worker thrash** from frequent `Stop` firing → mitigated by lockfile + empty-queue no-op + debounce.
- **`claude -p` cost blowout** across 13 repos → mitigated by per-run/per-day call ceilings + receipts.
- **Mutating a file mid-session** corrupting Claude's file-state → mitigated by detection-only on the hot path; mutation only via detached worker on files Claude is no longer editing.
- **Misclassified-closed file** loses live detail → mitigated by `unknown→open` conservative default + byte-exact backup (recoverable).
- **`SessionEnd` undocumented behavior** → explicitly *not* relied upon; `SessionStart` is the guarantee.
- **Existing backlog never remediated** (files written before the hook) → mitigated by the Phase 0 worker-side initial scan + `/memory-prune --scan`.
- **Dormant repos (never opened) never scanned** → mitigated by the system-wide `/memory-prune --all-roots` sweep over `~/.claude/projects/*/memory/`, runnable by hand and **required at the rollout exit gate** so no dir is skipped waiting for next-open.
- **Exit gate accepts an over-cap index because it is merely queued** → closed: the rollout exit gate requires every `MEMORY.md` to be **actually ≤ index cap** or carry a **recorded, non-expired reviewed-exception with a bounded deadline**. A live spool entry does NOT satisfy the gate (queued ≠ remediated).
- **Preservation gate makes index compaction impossible under the cap** → resolved by the **bounded-index model**: keep only the capped *active* pointer set in `MEMORY.md`, move shipped/closed pointers to the not-auto-loaded `MEMORY-shipped.md`, and check preservation across the active ∪ archived **union**. The gobot partition fixture proves the largest current index (47.7 KB after lossless trim) reaches ≤ cap with full recoverability.
- **Concurrent writers/drainers on one queue file** → resolved by the **one-file-per-entry spool** (temp+atomic-rename producer; atomic `pending→processing→done/error` consumer claim; stale-`processing` re-claim for crash recovery). Producers and the worker never contend on a shared file; no JSONL append-locking needed. Portable (`mv`/`mkdir`/`git hash-object` only).
- **Detached worker clobbers a concurrent write** → mitigated by the CAS fingerprint (sha/mtime/size) re-checked immediately before replace; a changed file is requeued, never overwritten.
- **Shared-archive collision / boundary breach** → mitigated by per-cwd archive destination with collision-proof names (stem + content hash) and a root-containment guard; the shared read-only root is never written by a session/worker.
- **LLM compaction drops a live fact** → mitigated by the deterministic, fail-closed preservation gate (Phase 3a) checked across the active ∪ archived union: no replace unless the candidate provably preserves frontmatter/link-set/index entries/source refs and the active index is strictly smaller and ≤ cap; `MEMORY.md` + open dossiers route failures to human review, never auto-promoted.

## Non-Goals

- Changing what gets *captured* into memory, or how memory is *recalled/injected* (that's the capture/recall layer — out of scope; this is maintenance only).
- Replacing the per-cwd auto-memory model with an MCP server or external store (the Karpathy-comment variants). We layer on the existing file-based system per `feedback_layer_dont_replace_convergent_design`.
- Promotion to the shared root (still manual via `/memory-prune` Phase 2 / hand-promote).
- Building a general "self-evolving wiki" — this caps files; it does not author knowledge.
