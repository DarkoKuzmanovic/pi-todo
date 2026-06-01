# Handoff — M0-T4 slash helper commands

## Workspace

Workspace strategy: current-branch/current workspace
Expected branch/worktree: n/a — cwd must be `/home/quzma/.pi/agent/extensions/pi-todo`
Workspace owner: executor subagent
Close-out owner: orchestrator/human via PMTI close-out; no local git repo is present here

Before editing, confirm the current branch/worktree matches the Workspace section. If it is missing or mismatched, stop and report the mismatch instead of creating branches or editing product files.

## Recommended executor

Use the builtin `worker` agent with GLM 5.1 for the M0 bake-off:

```ts
subagent({
  agent: "worker",
  model: "zai/glm-5.1",
  cwd: "/home/quzma/.pi/agent/extensions/pi-todo",
  context: "fresh",
  skill: ["test-driven-development", "verification-before-completion"],
  task: "<prompt below>"
})
```

## Read list

Read these before editing:

- `.pi/pmti/tasks/m0-t4-slash-helpers/brief.md`
- `.pi/pmti/milestones/M0.md`
- `src/index.ts`
- `src/runtime.ts`
- `src/tracker.ts`
- `src/state.ts`
- `src/types.ts`
- `src/runtime.test.ts`
- `../oh-my-todo/src/index.ts`
- `/home/quzma/.nvm/versions/node/v24.12.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` if command/send-message typings are unclear

## Executor prompt

Implement PMTI task M0-T4 from `.pi/pmti/tasks/m0-t4-slash-helpers/brief.md`.

Hard constraints:

- CWD must be `/home/quzma/.pi/agent/extensions/pi-todo`. Stop if it is not.
- Expected product/test files are `src/commands.ts`, `src/commands.test.ts`, and a small `src/index.ts` registration import/call.
- Do not modify public todo tool names, schemas, details, or direct task storage semantics.
- Do not directly mutate `store`, `runtime.tracker`, or task objects from slash command handlers.
- Do not implement M0-T5 docs/deactivation work.
- Do not edit, delete, disable, or deactivate `../oh-my-todo`.
- Do not edit durable PMTI state or mark M0-T4 complete.
- Preserve TypeScript style: no `any`, no non-null assertions, and `import type` for type-only imports.

Implementation target:

- Add `src/commands.ts` with `registerTodoCommands(pi, runtime)` or an equivalently small registration surface.
- Register `/done`, `/start`, `/next`, and `/pause` in `pi-todo`.
- Port behavior from `../oh-my-todo/src/index.ts` lines 295–392, adapted to current Pi typings and the M0-T3 `TodoRuntime` surface.
- Use `runtime.tracker` for task lookup, active task, and pending selection.
- Send auditable follow-up instructions that say to use `todo_write`; prefer `pi.sendUserMessage(message, { deliverAs: "followUp" })`.
- Use `pi-todo` wording/prefixes in sent instructions instead of `oh-my-todo`.
- Notify validation/no-op cases using only `info`, `warning`, or `error`.
- Wire `registerTodoCommands(pi, runtime)` once from `src/index.ts`, without disturbing `/todos`.

Tests:

- Use Vitest.
- Create a minimal fake `ExtensionAPI` that captures registered commands and sent follow-up messages.
- Create a minimal command context that captures notifications.
- Seed task state via `runtime.tracker.reconstructFromDetails({ tasks })`.
- Cover registration for all four commands.
- Cover `/done`, `/start`, `/next`, and `/pause` success paths and no-op/validation paths from the brief.
- Cover `/next` priority ordering high → medium → low.
- Assert follow-up messages include `todo_write` and use typed delivery options such as `{ deliverAs: "followUp" }`.

Validation commands:

```bash
npm test -- src/commands.test.ts
npm test
bunx --bun @biomejs/biome check /home/quzma/.pi/agent/extensions/pi-todo
```

If you choose a different focused test filename, run that focused file first and say which one.

## Recovery discipline

If the same file or same test fails twice, stop incremental patching. Re-read the affected file and the failing assertion, then make one deliberate fix or rewrite the small file cleanly.

After an edit warning, re-read before the next edit.

After a syntax error, inspect the whole edited file before running more tests.

## Report back

Return:

- Files changed.
- Verification command outputs summarized.
- Deviations from packet, if any.
- Whether M0-T5 can safely proceed after this change.
- Model bake-off notes: model `zai/glm-5.1`, elapsed wall-clock if visible, test/review/fix-back burden if known, scope discipline, code-quality notes, and any GLM-specific failure modes.
