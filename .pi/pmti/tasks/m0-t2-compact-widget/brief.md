# M0-T2 — Compact widget module

## Metadata

- Milestone: M0 — Merge `oh-my-todo` polish into `pi-todo`
- Task ID: M0-T2
- Title: Port compact widget rendering into `pi-todo`
- Depends on: M0-T1 (`src/tracker.ts`, `src/tracker.test.ts`) completed
- Preferred executor for bake-off: MiniMax M3 via `worker` model override

## Goal

Create a focused compact-widget module for `pi-todo` that ports the current `oh-my-todo` above-editor widget rendering behavior without integrating it into `src/index.ts` yet.

## In scope

- Create `src/compact-widget.ts`.
- Create `src/compact-widget.test.ts` with deterministic Vitest tests.
- Use `TaskTracker` from `src/tracker.ts` as the state input.
- Export `COMPACT_WIDGET_KEY = "pi-todo-compact"`.
- Export `updateCompactWidget(ctx, tracker)` for later M0-T3 integration.
- Preserve user-facing widget states from `oh-my-todo`: empty, active task, pending/no-active, progress bar, all-done.
- Preserve grapheme-aware truncation semantics for supplied render width.

## Out of scope

- Do not modify `src/index.ts`.
- Do not hook into lifecycle/tool-result handling yet.
- Do not port celebrations; that belongs to M0-T3.
- Do not port `/done`, `/start`, `/next`, or `/pause`; that belongs to M0-T4.
- Do not change `todo_write`, `todo_read`, or `todo_remove` schemas.
- Do not disable or edit standalone `oh-my-todo`.

## Acceptance criteria

- `src/compact-widget.ts` compiles with no `any` and no non-null assertions.
- `src/compact-widget.test.ts` covers empty state, active task content and priority badge, pending/no-active state, progress bar using `█` and `░`, width truncation, all-done banner, and no-op behavior when `ctx.hasUI` is false.
- Widget key is `pi-todo-compact`, not `oh-my-todo` and not the existing legacy `pi-todo` status/widget key.
- The widget factory uses above-editor placement.
- Tests can render the component without a live Pi UI by mocking `ctx.ui.setWidget` and a minimal theme.
- `npm test -- src/compact-widget.test.ts` passes.
- `npm test` passes.

## Constraints and invariants

- Match existing pi-todo TypeScript style: tabs, no `any`, no non-null assertions, `import type` for type-only imports.
- Favor pure helpers inside `src/compact-widget.ts`; export helpers only if tests need them for deterministic coverage.
- Use current `TaskTracker` getters: `activeTask`, `pendingCount`, `completedCount`, `totalCount`, `formatElapsed(task)`.
- Theme calls must be safe under minimal test themes; avoid runtime crashes if a mock theme lacks optional styling helpers.
- Keep the task model unchanged: `TaskStatus`, `TaskPriority`, and `Task` remain as defined in `src/types.ts`.

## Reference files

- `../oh-my-todo/src/index.ts` lines 17–150 for grapheme width helpers and widget rendering.
- `../oh-my-todo/test/index.test.ts` for source behavior expectations.
- `src/tracker.ts` for the new tracker API.
- `src/component.test.ts` for local Vitest/theme mock style.
- `src/state.ts` for existing widget/status key behavior to avoid accidental integration.

## Model bake-off note

Record this task as MiniMax M3 if executed with `model: "minimax/MiniMax-M3"`. Capture elapsed time, verification outcome, review/fix-back burden, scope discipline, and notable behavior for the M0 GLM 5.1 vs MiniMax M3 comparison.
