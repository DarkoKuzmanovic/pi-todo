# M0-T4 — Slash helper commands

## PMTI

- Milestone: M0 — Merge `oh-my-todo` polish into `pi-todo`
- Task: M0-T4
- Title: Move `/done`, `/start`, `/next`, and `/pause` helper commands into `pi-todo`
- Depends on: M0-T1 (`src/tracker.ts`) and M0-T3 (`src/runtime.ts` integration)
- Preferred executor: `worker` with model override `zai/glm-5.1`

## Goal

Register the current `oh-my-todo` slash helper commands from `pi-todo` so users can drive task status changes with `/done <id>`, `/start <id>`, `/next`, and `/pause` after the standalone `oh-my-todo` layer is retired. The helpers should preserve auditability by sending natural-language follow-up instructions that cause the agent to use `todo_write`; they must not mutate task state directly or change public todo tool schemas.

## Scope

In scope:
- Add a focused slash-command module, expected `src/commands.ts`, and deterministic command tests, expected `src/commands.test.ts`.
- Wire command registration from `src/index.ts` through a small call such as `registerTodoCommands(pi, runtime)`.
- Port behavior from `../oh-my-todo/src/index.ts` for `/done`, `/start`, `/next`, and `/pause`.
- Use the M0-T3 runtime tracker (`runtime.tracker`) as the command lookup/read model.
- Use the current Pi API shape for follow-up instructions; prefer `pi.sendUserMessage(message, { deliverAs: "followUp" })` or an equivalently typed `pi.sendMessage` path, not the old `deliverAs: "userMessage"` string from `oh-my-todo`.

Out of scope:
- Do not change `todo_write`, `todo_read`, or `todo_remove` names, schemas, result details, or direct state mutation semantics.
- Do not implement dependency metadata, tombstones, rich fields, or new task fields.
- Do not edit, delete, disable, or deactivate `../oh-my-todo`.
- Do not modify docs/changelog or durable PMTI state from the executor.
- Do not change compact widget rendering, lifecycle reconstruction, or celebration logic except for a tiny import/call seam needed to register commands.

## Current seam notes

- `src/index.ts` currently registers only `/todos`; it owns a module-level `const runtime = new TodoRuntime()` and wires runtime lifecycle/tool-result handling.
- `src/runtime.ts` exposes `TodoRuntime` with `readonly tracker: TaskTracker` and stable methods `reconstructFromSession`, `processToolResult`, and `refreshWidgets`.
- `src/tracker.ts` exposes `TaskTracker.tasks`, `activeTask`, and task counts; command lookup should not use canonical `store.tasks` directly unless the packet proves the tracker is unavailable.
- `src/state.ts` still owns canonical tool state and timestamp mutation through `todo_write`; slash helpers should instruct the agent to call `todo_write` rather than applying changes directly.
- `../oh-my-todo/src/index.ts` lines 295–392 are the reference behavior for the four commands.
- Current installed Pi typings allow command handlers as `(args: string, ctx) => Promise<void>` and `sendUserMessage(..., { deliverAs: "followUp" })`; old `deliverAs: "userMessage"` is not valid in the current API.

## Recommended design

- Create `src/commands.ts` exporting `registerTodoCommands(pi: ExtensionAPI, runtime: TodoRuntime): void`.
- Keep helper functions small and testable, e.g. find task by id, sort pending tasks by `PRIORITY_ORDER`, and build command instruction text.
- Register:
  - `/done <task-id>`: warn on missing id; warn if not found; info if already completed; otherwise send instruction to mark that task completed using `todo_write`.
  - `/start <task-id>`: warn on missing id; warn if not found; info if already in progress; otherwise send instruction to set that task in progress using `todo_write`.
  - `/next`: find current in-progress task and highest-priority pending task; if neither exists, notify info; otherwise send one instruction to complete active and/or start next pending using `todo_write`.
  - `/pause`: find active task; if none, notify info; otherwise send instruction to revert it to pending using `todo_write`.
- Prefix or word helper instructions as `pi-todo` rather than `oh-my-todo` so future audit traces identify the owning extension.
- Keep command notifications concise and use only supported notification types: `info`, `warning`, or `error`.
- Wire command registration from `src/index.ts` once, near `/todos` or extension startup registration.

## Acceptance criteria

- `pi-todo` registers `/done`, `/start`, `/next`, and `/pause` without removing `/todos`.
- Command handlers do not directly mutate `store`, `runtime.tracker`, or task objects.
- Commands send follow-up instructions that explicitly tell the agent to use `todo_write`.
- `/done` and `/start` validate missing/unknown/already-in-target-status cases with notifications and no follow-up send.
- `/next` handles active-only, pending-only, active+pending, and no-op cases; pending selection respects `PRIORITY_ORDER` high → medium → low.
- `/pause` handles active and no-active cases.
- Tests cover command registration names, sent follow-up message content/options, notification paths, and no direct mutation.
- Existing public tool schemas/details remain unchanged.
- `npm test -- src/commands.test.ts` passes.
- Full `npm test` passes.
- `bunx --bun @biomejs/biome check /home/quzma/.pi/agent/extensions/pi-todo` exits successfully; pre-existing warnings may remain.

## Test expectations

Add `src/commands.test.ts` or an equivalently focused test file. Use a minimal fake `ExtensionAPI` that captures `registerCommand` calls and `sendUserMessage`/`sendMessage` calls, plus a fake command context that captures `ctx.ui.notify`. Seed runtime state through `runtime.tracker.reconstructFromDetails({ tasks })`, not by mutating internals.

Suggested cases:
- all four command names are registered and `/todos` remains registered by `src/index.ts` smoke coverage if practical.
- `/done t1` sends a follow-up containing `Mark task t1`, task content, `completed`, and `todo_write`.
- `/start t1` sends a follow-up containing `Set task t1`, task content, `in_progress`, and `todo_write`.
- `/next` with active+pending sends one combined instruction; with only pending starts the pending task; with only active completes the active task; with neither sends no instruction.
- `/pause` sends a follow-up to revert the active task to pending.
- missing/unknown/already-done/already-active/no-active/no-tasks paths notify and do not send follow-ups.
- high-priority pending wins over medium/low for `/next`.

## Constraints

- TypeScript style: no `any`, no non-null assertions, `import type` for type-only imports.
- Keep implementation surgical; expected product edits are `src/commands.ts` and a small `src/index.ts` registration call only.
- Do not rely on the old `oh-my-todo` `deliverAs: "userMessage"`; verify against local typings if unsure.
- If command registration tests require exposing helpers, keep exported surface minimal and intentional.
- If the same file or same test fails twice, stop incremental patching, re-read the affected file and failing assertion, then make one deliberate fix or rewrite the small touched file cleanly.
- After an edit warning, re-read before the next edit.
- After a syntax error, inspect the whole edited file before running more tests.

## Model bake-off tracking

Record in the worker response:
- model used (`zai/glm-5.1`), elapsed wall-clock if visible, focused/full test results, Biome result, review/fix-back burden if known, scope discipline, code-quality notes, and any GLM-specific failure modes.
