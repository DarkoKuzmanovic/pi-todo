# Changelog

## [Unreleased]

### Added
- Ported `oh-my-todo` polish into `pi-todo`: `TaskTracker`, compact above-editor widget, lifecycle refresh, completion celebrations, and `/done`, `/start`, `/next`, `/pause` slash helpers.
- Added deterministic Vitest coverage for tracker transitions, compact widget rendering, runtime replay/celebrations, and slash-helper command behavior.

### Changed
- `pi-todo` now owns the compact widget under the `pi-todo-compact` key while preserving the existing `todo_write`, `todo_read`, and `todo_remove` tool names and schemas.
- Slash helper commands send auditable follow-up instructions through `todo_write` instead of mutating task state directly.

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
