# Handoff — M0-T3 lifecycle/tool-result integration

## Workspace

Workspace strategy: current-branch/current workspace
Expected branch/worktree: n/a — use `/home/quzma/.pi/agent/extensions/pi-todo`
Workspace owner: subagent executor
Close-out owner: orchestrator/human via PMTI close-out

Before editing, confirm the current branch/worktree matches the Workspace section. If it is missing or mismatched, stop and report the mismatch instead of creating branches or editing product files.

## Executor

Use `worker` with model override `minimax/MiniMax-M3` for the PMTI M0 bake-off.

## Read first

Read these files before editing:

- `.pi/pmti/tasks/m0-t3-lifecycle-integration/brief.md`
- `.pi/pmti/milestones/M0.md`
- `src/index.ts`
- `src/state.ts`
- `src/tracker.ts`
- `src/compact-widget.ts`
- `src/types.ts`
- `src/state.test.ts`
- `src/tracker.test.ts`
- `src/compact-widget.test.ts`
- `../oh-my-todo/src/index.ts`

## Task

Implement M0-T3 exactly as described in `brief.md`:

- Integrate `TaskTracker` and `updateCompactWidget` into `pi-todo` lifecycle/tool-result flow.
- Port completion celebrations from `oh-my-todo` into `pi-todo`.
- Add focused deterministic tests for the integration and celebration behavior.
- Preserve existing public tool names/schemas/details and `/todos` viewer behavior.

## Hard boundaries

Do not implement M0-T4 slash commands (`/done`, `/start`, `/next`, `/pause`).
Do not edit, delete, disable, or deactivate `../oh-my-todo`.
Do not edit PMTI durable state (`.pi/pmti/project/*` or `.pi/pmti/milestones/*`).
Do not change public task schema or tool names.
Do not replace the explicit `todo_write` / `todo_read` / `todo_remove` API.
Do not add dependency metadata, tombstones, rich fields, or docs cleanup.

Allowed product/test files are expected to be limited to:

- `src/index.ts`
- new or existing focused integration test file, likely `src/index.test.ts`
- small helper module only if needed for test isolation

If you believe another file is necessary, stop and explain why before editing it.

## Implementation guidance

- Prefer a small local helper in `src/index.ts` or a tiny testable helper module over a broad rewrite.
- Keep `store` as the canonical source for existing tools and `/todos`.
- Keep the legacy `pi-todo` status/widget behavior unless it directly conflicts with `pi-todo-compact`.
- Use `TaskTracker.reconstructFromDetails()` idempotence to prevent duplicate celebrations.
- Reset celebration state on session lifecycle reconstruction.
- Use `ctx.hasUI`/`ctx.ui.notify` defensively so non-UI contexts do not throw.
- TypeScript style: no `any`, no non-null assertions, `import type` for type-only imports.

## Recovery discipline

If the same file or same test fails twice, stop incremental patching. Re-read the affected file and the failing assertion, then make one deliberate fix or rewrite the small file cleanly.

After an edit warning, re-read before the next edit.

After a syntax error, inspect the whole edited file before running more tests.

## Verification commands

Run, in order:

```bash
npm test -- src/index.test.ts
npm test
bunx --bun @biomejs/biome check /home/quzma/.pi/agent/extensions/pi-todo
```

If you choose a different focused test filename, run that focused file first and say which one.

## Report back

Return:

- Files changed.
- Verification command outputs summarized.
- Whether M0-T4 can safely proceed after this change.
- Model bake-off notes: model, elapsed wall-clock if visible, test/review/fix-back burden, scope discipline, code-quality notes, and any MiniMax-specific failure modes.
