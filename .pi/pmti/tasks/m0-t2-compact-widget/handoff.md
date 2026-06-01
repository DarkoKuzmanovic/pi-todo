# Handoff — M0-T2 Compact widget module

## Workspace

Workspace strategy: current-branch/current workspace
Expected branch/worktree: n/a — cwd must be `/home/quzma/.pi/agent/extensions/pi-todo`
Workspace owner: executor subagent
Close-out owner: orchestrator/human via PMTI close-out; no local git repo is present here

Before editing, confirm the current branch/worktree matches the Workspace section. If it is missing or mismatched, stop and report the mismatch instead of creating branches or editing product files.

## Recommended executor

Use the builtin `worker` agent with MiniMax M3 for the M0 bake-off:

```ts
subagent({
  agent: "worker",
  model: "minimax/MiniMax-M3",
  cwd: "/home/quzma/.pi/agent/extensions/pi-todo",
  context: "fresh",
  skill: ["test-driven-development", "verification-before-completion"],
  task: "<prompt below>"
})
```

## Read list

Read these before editing:

- `.pi/pmti/tasks/m0-t2-compact-widget/brief.md`
- `.pi/pmti/milestones/M0.md`
- `src/tracker.ts`
- `src/types.ts`
- `src/component.test.ts`
- `src/state.ts`
- `../oh-my-todo/src/index.ts`
- `../oh-my-todo/test/index.test.ts`

## Executor prompt

Implement PMTI task M0-T2 from `.pi/pmti/tasks/m0-t2-compact-widget/brief.md`.

Hard constraints:

- CWD must be `/home/quzma/.pi/agent/extensions/pi-todo`. Stop if it is not.
- Create only `src/compact-widget.ts` and `src/compact-widget.test.ts` unless the brief proves a strictly necessary additional edit.
- Do not modify `src/index.ts`; integration belongs to M0-T3.
- Do not modify public todo tool schemas, `src/types.ts`, or standalone `../oh-my-todo`.
- Do not edit durable PMTI state or mark M0-T2 complete.
- Preserve TypeScript style: no `any`, no non-null assertions, and `import type` for type-only imports.

Implementation target:

- Port the compact above-editor widget behavior from `../oh-my-todo/src/index.ts` into `src/compact-widget.ts`.
- Export `COMPACT_WIDGET_KEY = "pi-todo-compact"`.
- Export `updateCompactWidget(ctx, tracker)` using `ExtensionContext` and `TaskTracker`.
- The function should no-op when `ctx.hasUI` is false.
- When UI is available, it should call `ctx.ui.setWidget(COMPACT_WIDGET_KEY, factory, { placement: "aboveEditor" })`.
- The factory should return a renderable object with `render(renderWidth?: number): string[]` and `invalidate(): void`.
- Render states must include: empty task list, all-done banner, active task with priority badge and elapsed time, pending/no-active summary, and completed/total progress bar with `█` and `░`.
- Keep grapheme-aware truncation so returned lines do not exceed the supplied render width for common ASCII, wide, and emoji-like content.

Tests:

- Use Vitest.
- Create deterministic `TaskTracker` instances with injected clocks.
- Mock only the minimum `ExtensionContext`/UI shape needed to capture `setWidget` calls.
- Cover empty state, all-done state, active task content, high/medium/low priority badge behavior where practical, pending/no-active state, progress bar characters and counts, width truncation, and `hasUI: false` no-op.

Validation commands:

```bash
npm test -- src/compact-widget.test.ts
npm test
```

Return a concise summary with:

- files changed
- verification commands/results
- deviations from packet, if any
- whether M0-T3 can consume `updateCompactWidget`
- elapsed wall-clock time if visible, for the GLM 5.1 vs MiniMax M3 comparison

## Recovery discipline

If the same file or same test fails twice, stop incremental patching. Re-read the affected file and the failing assertion, then make one deliberate fix or rewrite the small file cleanly.

After an edit warning, re-read before the next edit.
After a syntax error, inspect the whole edited file before running more tests.
