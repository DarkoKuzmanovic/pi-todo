# M0-T3 — Lifecycle/tool-result integration

## PMTI

- Milestone: M0 — Merge `oh-my-todo` polish into `pi-todo`
- Task: M0-T3
- Title: Integrate tracker, compact widget, and celebrations into lifecycle/tool-result handling
- Depends on: M0-T1 (`src/tracker.ts`) and M0-T2 (`src/compact-widget.ts`)
- Preferred executor: `worker` with model override `minimax/MiniMax-M3`

## Goal

Wire the completed `TaskTracker` and compact above-editor widget into `pi-todo` runtime lifecycle so task state is reconstructed and refreshed from real `todo_write` / `todo_remove` results, the `pi-todo-compact` widget updates during normal use, and completion celebrations are emitted by `pi-todo` without requiring standalone `oh-my-todo`.

## Scope

In scope:
- Update `src/index.ts` lifecycle/tool-result handling to maintain a module-level `TaskTracker`.
- Call `updateCompactWidget(ctx, tracker)` on session start, session tree/fork recovery, tool result changes, and agent-end refresh paths where appropriate.
- Port the `oh-my-todo` completion celebration behavior: per-task completion notification, every-5-completed milestone notification, and all-done notification.
- Add deterministic tests for lifecycle integration and celebration behavior.
- Keep existing `TodoStore`, tools, `/todos`, prompt injection, and full-screen viewer behavior working.

Out of scope:
- Do not implement `/done`, `/start`, `/next`, or `/pause`; those belong to M0-T4.
- Do not deactivate, edit, or delete `../oh-my-todo`.
- Do not change public tool names, schemas, or result details.
- Do not implement dependency metadata, tombstones, or rich task fields.
- Do not change documentation/changelog except test names/comments if needed.

## Current seam notes

- `src/index.ts` currently calls `reconstructState(ctx)` and legacy `updateWidget(ctx)` on `session_start` and `session_tree`, calls `updateWidget(ctx)` on `agent_end`, and calls `updateWidget(ctx)` inside `todo_write` / `todo_remove` execute handlers.
- `src/state.ts` owns `TodoStore`, `reconstructState(ctx)`, and legacy footer/status `updateWidget(ctx)` under key `pi-todo`.
- `src/tracker.ts` exports `TaskTracker`, `DiffResult`, and clock support; it reconstructs from `{ tasks }` details and computes created/started/completed/removed diffs.
- `src/compact-widget.ts` exports `COMPACT_WIDGET_KEY = "pi-todo-compact"` and `updateCompactWidget(ctx, tracker)`.
- `../oh-my-todo/src/index.ts` has the reference `tool_result`, `session_start`, `agent_end`, latest-details, and celebration behavior.

## Recommended design

- Add a module-level `const tracker = new TaskTracker()` in `src/index.ts` or a very small helper module if tests need isolation.
- Add a small sync helper such as `refreshRuntimeTodoState(ctx, details?: unknown)` or similarly named local function that updates `store`/legacy status and `tracker`/compact widget together.
- On `todo_write` and `todo_remove`, after computing and storing the new task list, update the tracker from the returned details and evaluate celebrations from `tracker.diff()` once.
- On `tool_result`, avoid double-processing the extension's own tool results if `execute` already handled them in-process. If a hook is needed for replay/imported results, make it idempotent by using `TaskTracker.reconstructFromDetails()` returning false for identical details.
- Preserve the legacy `pi-todo` footer/status behavior for this task unless removing it is strictly necessary; M0-T2 introduced a distinct above-editor widget key, not a replacement mandate.
- Reset celebration state on `session_start`/`session_tree` before reconstructing recovered tracker state so reload does not emit stale celebrations.

## Acceptance criteria

- Existing `todo_write`, `todo_read`, `todo_remove` names, schemas, and details shape are unchanged.
- `/todos` still opens the full-screen viewer and uses the canonical `store.tasks`.
- The compact widget is registered under `pi-todo-compact` after session start/tree recovery and after task write/remove changes when UI is available.
- The tracker reconstructs from latest branch task details on `session_start` and `session_tree`.
- Completing a task emits one per-task success notification; all-done and every-5-completed notifications are emitted once per relevant transition.
- Re-running refreshes or receiving identical details does not duplicate celebrations.
- `ctx.hasUI === false` paths do not throw.
- Focused lifecycle/celebration tests pass.
- Full `npm test` passes.
- `bunx --bun @biomejs/biome check /home/quzma/.pi/agent/extensions/pi-todo` exits successfully; pre-existing warnings may remain.

## Test expectations

Add or extend tests near the integration seam, likely `src/index.test.ts` or a small helper-module test if implementation extracts helpers. Cover:
- session reconstruction registers compact widget using latest todo details from branch.
- `todo_write`/`todo_remove` updates compact widget/tracker without changing returned details.
- completion transition sends per-task notification exactly once.
- all-done notification is not repeated on identical details or agent-end refresh.
- non-UI context does not throw.

## Constraints

- TypeScript style: no `any`, no non-null assertions, `import type` for type-only imports.
- Keep implementation surgical; prefer local helpers over broad rewrites.
- If Pi event typings are unclear, inspect existing installed typings before guessing.
- If the same file or same test fails twice, stop incremental patching, re-read the affected file and failing assertion, then make one deliberate fix or rewrite the small touched file cleanly.
- After an edit warning, re-read before the next edit.
- After a syntax error, inspect the whole edited file before running more tests.

## Model bake-off tracking

Record in the worker response:
- model used (`minimax/MiniMax-M3`), elapsed wall-clock if visible, focused/full test results, Biome result, review/fix-back burden if known, scope discipline, and notable failure modes.
