# M0-T1 — Port TaskTracker into pi-todo

## Goal

Create a focused `TaskTracker` module inside `pi-todo` by porting the existing behavior from `../oh-my-todo/src/state.ts`, with deterministic Vitest coverage.

## Milestone context

M0 merges `oh-my-todo` polish into `pi-todo` while preserving the explicit `todo_write`, `todo_read`, and `todo_remove` tools. This task only creates the tracker foundation that later M0 tasks will use for compact widgets, celebrations, and slash helpers.

## Scope in

- Create `src/tracker.ts` exporting `TaskTracker`.
- Create `src/tracker.test.ts` with focused Vitest tests.
- Port behavior from `../oh-my-todo/src/state.ts`:
  - cache task lists from `{ tasks: Task[] }` details payloads,
  - expose task counts and active task,
  - detect created, started, completed, and removed transitions,
  - format elapsed task time.
- Make elapsed-time formatting deterministic via an injectable clock in the constructor.

## Scope out

- Do not integrate tracker into `src/index.ts` yet.
- Do not create compact widget, celebrations, or slash-command modules.
- Do not change public `Task`, `todo_write`, `todo_read`, or `todo_remove` schemas.
- Do not edit `oh-my-todo`; it is reference-only.

## Acceptance criteria

- `src/tracker.ts` compiles with TypeScript ESM style used in this repo.
- `src/tracker.test.ts` covers at least transition detection and deterministic elapsed formatting.
- Existing tests still pass with `npm test`.
- No `any`, no non-null assertions, and type-only imports use `import type`.

## Dependencies

- Depends on: none.
- Blocks: M0-T2, M0-T3, M0-T4.
- Can run in parallel with: M0-T2 only after the `TaskTracker` public shape is stable; implementation should otherwise land first.

## Key files

- Read: `src/types.ts`
- Read: `src/state.ts`
- Reference-only read: `../oh-my-todo/src/state.ts`
- Create: `src/tracker.ts`
- Create: `src/tracker.test.ts`

## Verification

Run from `/home/quzma/.pi/agent/extensions/pi-todo`:

```bash
npm test -- src/tracker.test.ts
npm test
```
