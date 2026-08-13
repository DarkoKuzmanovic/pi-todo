# Roadmap

This roadmap stays high-level. Detailed scope, task decomposition, dependencies, and review state for an active build live in `PLAN.md`.

> **M-numbering.** This project preserves the PMTI-era M-numbering (`M0`–`M5` Released) so commit messages and `AGENTS.md ## Lessons learned` stay correctly indexed. Planned milestones continue the same sequence (`M6`–`M11`); numbers are never reused, so parked (`M7`, `M8`) and dropped (`M9`) milestones keep their slugs. When a milestone graduates to a git commit, the commit message keeps the `M<n>` slug and the new code lands with the M-number as a breadcrumb in the relevant module.

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

Trimmed on 2026-08-14 (`DECISIONS.md ## D8`) after scrutiny against Mario Zechner's "No built-in to-dos" post and `@jerryan/pi-todo-lite`'s archived lessons: keep human-observability surfaces and token-friction reducers; reject expansions of model-tracked state. `M7`/`M8` parked, `M9` dropped. Working order: **M6 (scoped) → M11 → M10**.

- **M6** — **Goal anchor.** Mandatory `Goal:` line on the task list; rendered pinned in the compact widget; re-injected on `before_agent_start` so every turn re-anchors to the session objective. *(highest leverage on goal-drift; firstpick-adjacent)* **Scope check before starting (D8):** the pi-goals `/goal` machinery already pins an active goal with completion gating — M6's remaining value is non-`/goal` sessions; keep it small or fold the goal line into M10's `llmGuidance` snippet.
- **M10** — **Config file + LLM-guidance snippet.** `~/.config/pi-todo/config.json` with `maxWidgetLines`, `collapseKey`, plus an optional `llmGuidance` snippet injected into the prompt block for user-tunable nudges. *(rpiv-todo; when this starts, fold in the 2026-08-13 pi-tasks survey findings: `maxVisible`, completed-drop-first collapse, `hiddenAt`)*
- **M11** — **Delta ops: `todo_patch`.** Targeted mutation of existing tasks by ID (status/priority/content/blockedBy/rich fields, `appendDescription`, per-key metadata merge with `null`-deletes) without resending the list; desugars into the shared `todo_write` commit tail; terse delta result content. Spec: [`docs/specs/2026-08-14-m11-todo-patch.md`](./docs/specs/2026-08-14-m11-todo-patch.md). *(motivated by the 2026-08-13 ecosystem sweep — Claude Code's TodoWrite → TaskCreate/TaskUpdate migration and pi-todo-lite's batch-complete failure-mode notes; D8 caveat: the payoff assumes this harness's prompt-enforced incremental-update discipline — pi-todo-lite saw agents batch-complete without it)*
- **Argument completions for `/done` and `/start`** — complete live task ids from the tracker via `getArgumentCompletions`, using each task's text as the item description so ids are never typed from memory; add a round-trip test asserting every suggestion the completer offers is accepted by the parser. *(not part of the cherry-pick sweep above)*

## Dropped

- **M9** — **Subagent streaming** *(dropped 2026-08-14, `DECISIONS.md ## D8`)*. The event contract was sourced from `@pi-archimedes/todo` against the pre-switch subagent stack; nicobailon's `pi-subagents` now owns child observability outright (missions, fleet status view, live chat progress cards, per-run `events.jsonl`, the `subagent-watch` pane). A todo-widget projection of child tasks would be a second source of truth — machine-written state in a model-facing list. The `M9` number is retired, never reused.

## Parking lot

The full parking lot lives in [`IDEAS.md`](./IDEAS.md). Items rolled forward from the PMTI-era roadmap (2026-06-02):

- Optional `/todos` UI toggle for tombstoned tasks, deferred until the tombstone model proves stable.
- Compact-widget refinements, considered after the first post-M4 merged version is used in normal Pi work.
- ANSI-aware truncation for the compact widget, if real themed output shows narrow-width escape-sequence artifacts.

Parked from `## Planned` in the 2026-08-14 trim (`DECISIONS.md ## D8`):

- **M7 — Disk fallback.** Revive only after an actual branch-pruned-before-snapshot loss is observed; D7 stays the documented rule until then.
- **M8 — Settable `blocked` status.** Revive on a concrete external-blocker need post-M11; implement then as a `todo_patch`-settable additive flag.

## Out of scope (V1)

Cross-machine aggregation, history charts, notifications, account login/management, a permanent service, and KDE Store publication are out of V1 scope (consistent with PMTI-era scoping).
