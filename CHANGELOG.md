# Changelog

## [Unreleased]

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

### Changed
- `pi-todo` now owns the compact widget under the `pi-todo-compact` key while preserving the existing `todo_write`, `todo_read`, and `todo_remove` tool names and schemas.
- Slash helper commands send auditable follow-up instructions through `todo_write` instead of mutating task state directly.

### Fixed
- Session loading no longer throws: `getBranchSafe()` wraps `ctx.sessionManager.getBranch()` in try/catch (returns `[]`) so `session_start` and `session_tree` recover gracefully when the branch is read before the session is initialised.

### Notes
- Standalone `oh-my-todo` has been disabled by clearing its package `pi.extensions` list; reload Pi and trial normal todo workflows before archiving or deleting the folder.

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
