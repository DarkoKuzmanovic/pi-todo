# Changelog

## [Unreleased]

### Added
- M4 — Optional rich task fields: `description`, `owner`, `activeForm`, `metadata` on tasks.
  - **description** — long-form notes, surfaces in `/todos` and compact widget only (not in prompt).
  - **activeForm** — short present-progressive label, used as the active-task label in the system prompt (I3 delimiter-safe) and in `/todos`.
  - **owner** — free-form agent/user attribution, surfaces in `/todos` only.
  - **metadata** — flat `Record<string, string | number | boolean>` key-value bag. **Hidden on every surface**; canonical state + replay only. Per-key reject-with-named-warning (I1). B1 type-preserving passthrough ensures replay fidelity.
  - M-c visibility map: `activeForm` is the only rich field exposed to the prompt. `description` and `owner` surface in `/todos` and tool results. `metadata` hidden everywhere.
  - I2 resurrection invariant: re-sending a tombstoned id makes the new payload's rich fields authoritative (no merge-back from the pre-tombstone payload).
  - T1+T2+T3+T4: schema/extraction/validation, display per M-c, persistence/replay/snapshot symmetry, end-to-end tested (13 new T3 symmetry/surface tests + 5 new e2e tests).
### Added
- Optional `blockedBy?: string[]` dependency metadata on tasks. Tasks may depend on other tasks; blocked state is derived rather than persisted and is reflected in the prompt, `/todos` listing, compact widget, and command semantics.
- Pure `src/deps.ts` helpers: `dedupeBlockedBy`, `normalizeBlockedBy`, `findCycle` (DFS), `isBlocked`, `validateDependencyGraph`, and `formatStrippedWarning`. `todo_write` validates the graph atomically after ID generation, before `store.setTasks()`. Cycles are rejected without mutating canonical state; self/duplicate IDs are stripped silently; unknown IDs are stripped with a warning appended to the tool result; dependencies on completed tasks are allowed.
- `/next` now skips blocked pending tasks and reports "All pending tasks are blocked — complete their dependencies first." when no unblocked pending work remains.
- `/start <id>` warns with the blocked-by context and still sends the audited follow-up message annotated with "incomplete dependencies" so the model can proceed knowingly.
- Compact widget now shows a `⊘ N blocked` segment when pending tasks are blocked.
- Prompt injection and `/todos` listing render blocked pending tasks in a separate `Blocked (waiting on dependencies):` section with `(blocked by: t1, t2)` suffix.
- 26 new `src/deps.test.ts` cases for dependency normalization, cycle detection, and validation.
- 6 new `src/commands.test.ts` cases for blocked-aware `/start` and `/next` semantics.
- 3 new `src/compact-widget.test.ts` cases for the blocked count segment.
- 9 new `src/e2e.test.ts` cases covering M2-T4 end-to-end blockedBy across todo_write, replay, compaction, prompt, /todos, /next, /start, and snapshot carry-forward.
- Ported `oh-my-todo` polish into `pi-todo`: `TaskTracker`, compact above-editor widget, lifecycle refresh, completion celebrations, and `/done`, `/start`, `/next`, `/pause` slash helpers.
- Added deterministic Vitest coverage for tracker transitions, compact widget rendering, runtime replay/celebrations, and slash-helper command behavior.
- Optional `deletedAt?: number` tombstone marker on tasks. `todo_remove` is now soft-delete: removed tasks are stamped with `deletedAt` and retained in canonical state + history, hidden from all active views (prompt, `/todos`, compact widget, slash command selection, derived counts), but they survive `todo_write` full-list replacement, `pi-todo:snapshot` appends, and compaction reconstruction.
- `src/tombstone.ts` pure helpers: `isTombstoned(task)` and `activeTasks(tasks)` live filter.
- `activeBlockerIds(task, allTasks)` in `src/deps.ts` — mirrors `isBlocked`'s predicate so blocked listing labels never print tombstoned dependency IDs.
- Regression coverage: celebration-after-removal fix (tombstoned tasks no longer permanently suppress the "All tasks complete!" celebration); idempotent `removeByIds`; tombstone persistence through `extractTasks` round-trip and `todo_write` B1 preservation.
- 42 new tests across `src/deps.test.ts`, `src/e2e.test.ts`, `src/component.test.ts`, `src/compaction.test.ts`, `src/commands.test.ts`, and new `src/tombstone.test.ts` covering the full M3 tombstone lifecycle (model, soft-delete, hide, persistence, blockedBy interaction, end-to-end).

### Changed
- `pi-todo` now owns the compact widget under the `pi-todo-compact` key while preserving the existing `todo_write`, `todo_read`, and `todo_remove` tool names and schemas.
- Compact widget all-done state now uses a restrained QED-style status (`∎ completed/total — done`) instead of the previous mirrored celebration banner.
- Slash helper commands send auditable follow-up instructions through `todo_write` instead of mutating task state directly.
- `todo_remove` is now soft-delete (was permanent). Tombstoned tasks are retained in canonical state with a `deletedAt` timestamp, hidden from all normal surfaces, and preserved through `todo_write` full-list replacement and compaction/replay.
- Dependency validation now operates over live candidates only; preserved tombstones are merged after validation. A `blockedBy` reference to a tombstoned dependency no longer blocks the dependent and is stripped from the blocker label display.

### Fixed
- Session loading no longer throws: `getBranchSafe()` wraps `ctx.sessionManager.getBranch()` in try/catch (returns `[]`) so `session_start` and `session_tree` recover gracefully when the branch is read before the session is initialised.

### Notes
- Standalone `oh-my-todo` has been fully removed (2026-06-02, M5 fast-track): the folder at `../oh-my-todo/` was deleted via recoverable move + targeted `find -delete`. Its `pi.extensions` had been `[]` since M0 so the live Pi session never loaded it; the deletion was cleanup-only with no behavior change.

## [0.8.2] - 2026-05-11

### Added
- `todo_remove` tool — permanently remove tasks by ID
- Interactive keyboard navigation in `/todos` viewer (↑↓/jk, g/G, Home/End)
- Toggle completed task visibility with `c` key in `/todos` viewer
- Timestamps on tasks: `createdAt`, `startedAt`, `completedAt`
- Status transition tracking — timestamps update automatically when tasks move between states
- Percentage display in progress bar

### Changed
- Replaced module-level mutable globals (`tasks`, `idCounter`) with `TodoStore` class
- Deduplicated rendering logic — shared `priorityColor()`, `priorityLabel()` helpers used everywhere
- Priority labels now display as `High`/`Medium`/`Low` instead of `HIG`/`MED`/`LOW`
- In-progress icon changed from `→` to `●` for visual consistency
- `/todos` viewer now shows cursor indicator (`❯`) on focused task
- Section headers show task counts
- Updated widget status bar to use `●` for active count
- `todo_write` prompt guidelines now explicitly state completed tasks are never auto-deleted

### Fixed
- Rendering inconsistency between widget, viewer, and tool results — all now use the same styling

## [0.8.1] - 2026-05-11

## [0.6.0] - 2026-05-11

### Changed
- Migrated all imports and peerDependencies from `@mariozechner/pi-*` to `@earendil-works/pi-*` namespace

## [0.5.1] - 2026-05-05

## [0.5.0] - 2026-05-05

## [0.2.0] - 2026-04-29

### Added
- Initial release: `todo_write` and `todo_read` tools
- Live widget above editor showing up to 4 active tasks
- System-prompt injection before every agent turn to prevent goal drift
- `/todos` command with full-screen interactive viewer and progress bar
- Session branch reconstruction so task state survives `/tree` navigation and forking
