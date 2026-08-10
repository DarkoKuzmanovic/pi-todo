# Roadmap

This roadmap stays high-level. Detailed scope, task decomposition, dependencies, and review state for an active build live in `PLAN.md`.

> **M-numbering.** This project preserves the PMTI-era M-numbering (`M0`–`M5` Released) so commit messages and `AGENTS.md ## Lessons learned` stay correctly indexed. Planned milestones continue the same sequence (`M6`–`M10`). When a milestone graduates to a git commit, the commit message keeps the `M<n>` slug and the new code lands with the M-number as a breadcrumb in the relevant module.

## Released

- **M0** — Merged `oh-my-todo` polish into `pi-todo` (2026-06-01). Preserves explicit `todo_write` / `todo_read` / `todo_remove` tools; `TaskTracker`, compact above-editor widget, lifecycle refresh, `/done` `/start` `/next` `/pause` slash helpers all live under `pi-todo`.
- **M1** — Compaction-aware todo replay (2026-06-01). Extension-owned `pi-todo:snapshot`, store/tracker symmetry, lifecycle refresh. Live `/compact` close-out verified.
- **M2** — Optional `blockedBy` dependency metadata (2026-06-01). Validation at the `todo_write` boundary (atomic cycle reject, silent self/dup strip, unknown-ID warning). `/next` and `/start` blocked semantics; prompt / `/todos` / compact widget blocked display. 225 tests.
- **M3** — Audit-friendly tombstones (2026-06-01). `todo_remove` soft-deletes via `deletedAt?: number`; hidden everywhere; preserved through replay, snapshot, and full-replace (B1). 275 tests.
- **M4** — Optional rich task fields (2026-06-02). `description` / `owner` / `activeForm` / `metadata` with the M-c visibility map; prompt-safe `activeForm` rendering (I3); type-preserving metadata replay (B1); I2 resurrection authoritative. 359 tests.
- **M5** — Standalone `oh-my-todo` cleanup (2026-06-02 fast-track). Recoverable move + targeted `find -delete`. No behavior change (`pi.extensions` had been `[]` since M0).

## Current

*(no active build — the next milestone is up to the human/orchestrator; on-demand `PLAN.md` is created when a build starts)*

## Planned

Cherry-picks drawn from a 2026-06-02 comparison sweep of `@juicesharp/rpiv-todo`, `@firstpick/pi-extension-todo-progress`, `@xaccefy/pi-xtodo`, `@pi-archimedes/todo`, `@xynogen/pix-todo`. Implementation order may shift; milestones graduate to `## Released` when shipped.

- **M6** — **Goal anchor.** Mandatory `Goal:` line on the task list; rendered pinned in the compact widget; re-injected on `before_agent_start` so every turn re-anchors to the session objective. *(highest leverage on goal-drift; firstpick-adjacent)*
- **M7** — **Disk fallback.** `~/.pi/xtodo/<safe-session-id>.json` keyed by cleaned session id. Branch replay stays primary (D7); disk is the fallback for branches pruned before the snapshot was appended. *(pi-xtodo)*
- **M8** — **Settable `blocked` status alongside derived.** Tasks may explicitly carry a settable `blocked` flag for external blockers (CI, user input, PR review), distinct from the M2 graph-derived blocking. *(pix-todo)*
- **M9** — **Subagent streaming.** Implement the event contract locally — bus events + auto-remove-on-complete columns for sub-tasks — without adopting the `pi-archimedes` meta package. *(pi-archimedes, internalized)*
- **M10** — **Config file + LLM-guidance snippet.** `~/.config/pi-todo/config.json` with `maxWidgetLines`, `collapseKey`, plus an optional `llmGuidance` snippet injected into the prompt block for user-tunable nudges. *(rpiv-todo)*
- **Argument completions for `/done` and `/start`** — complete live task ids from the tracker via `getArgumentCompletions`, using each task's text as the item description so ids are never typed from memory; add a round-trip test asserting every suggestion the completer offers is accepted by the parser. *(not part of the cherry-pick sweep above)*

## Parking lot

The full parking lot lives in [`IDEAS.md`](./IDEAS.md). Items rolled forward from the PMTI-era roadmap (2026-06-02):

- Optional `/todos` UI toggle for tombstoned tasks, deferred until the tombstone model proves stable.
- Compact-widget refinements, considered after the first post-M4 merged version is used in normal Pi work.
- ANSI-aware truncation for the compact widget, if real themed output shows narrow-width escape-sequence artifacts.

## Out of scope (V1)

Cross-machine aggregation, history charts, notifications, account login/management, a permanent service, and KDE Store publication are out of V1 scope (consistent with PMTI-era scoping).
