# pi-todo Consolidation + rpiv-todo Improvements Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Use `todo_write` for tracking, `test-driven-development` for behavior changes, `verification-before-completion` before any completion claim, and fresh-context review for non-trivial diffs.

**Goal:** Merge `oh-my-todo` into `pi-todo` and selectively add the best `rpiv-todo` ideas while preserving the local `todo_write` / `todo_read` / `todo_remove` workflow that PMTI and local skills already use.

**Architecture:** Keep `pi-todo` as the single todo extension. Move `oh-my-todo` UI/command polish into focused `pi-todo/src/*` modules, then extend the core task model with optional dependency/audit metadata in a backward-compatible way. Do **not** introduce the `rpiv-todo` single `todo({ action })` API; local agent discipline depends on the existing explicit tools.

**Tech Stack:** TypeScript ES modules, Pi ExtensionAPI, `@earendil-works/pi-tui`, TypeBox schemas, Vitest. Existing `oh-my-todo` Bun tests should be ported into Vitest before the standalone extension is retired.

---

## Decision: should `oh-my-todo` remain separate?

No. It does not need to be a second extension.

`oh-my-todo` depends on `pi-todo` internals and only adds presentation/commands around the same task state. Keeping it separate creates avoidable coupling:

- two extension load points
- two widget keys
- duplicate session reconstruction logic
- extra package/package-list maintenance
- possible command ownership confusion around `/todos`, `/start`, `/done`, `/next`, `/pause`

The right target is:

```text
pi-todo
  ├─ core tools: todo_write / todo_read / todo_remove
  ├─ prompt injection
  ├─ branch + compaction replay
  ├─ compact above-editor widget
  ├─ /todos full-screen viewer
  ├─ /done /start /next /pause helpers
  └─ celebrations/progress polish
```

After the merge is verified, remove `oh-my-todo` from the active Pi package/extension list. Keep the old folder only until one successful Pi restart/reload verifies the merged behavior.

---

## Source context

### Existing local `pi-todo`

Files:

- `src/index.ts` — registers `todo_write`, `todo_read`, `todo_remove`, `/todos`; hooks `session_start`, `session_tree`, `before_agent_start`, `agent_end`.
- `src/state.ts` — `TodoStore`, state reconstruction from `todo_write` / `todo_remove` tool-result details, status-bar update.
- `src/types.ts` — `Task`, `TaskStatus`, `TaskPriority`.
- `src/schemas.ts` — TypeBox schemas for current public tools.
- `src/prompt.ts` — `## Your Plan` system-prompt block and LLM task-list formatter.
- `src/component.ts` — full-screen `/todos` viewer and inline tool-result rendering.
- `src/*.test.ts` — Vitest coverage for store and component basics.

Current public task shape:

```ts
type TaskStatus = "pending" | "in_progress" | "completed";
type TaskPriority = "high" | "medium" | "low";

interface Task {
  id: string;
  content: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}
```

### Existing local `oh-my-todo`

Files:

- `src/index.ts` — tracks `todo_write` / `todo_remove` tool results, sets compact above-editor widget, registers `/done`, `/start`, `/next`, `/pause`.
- `src/state.ts` — `TaskTracker`, transition diffing, elapsed-time formatter.
- `test/index.test.ts` — Bun tests for widget rendering and commands.

Features to merge:

- compact above-editor widget with active task, progress bar, all-done state, empty state
- per-task and all-done notifications
- `/done <id>`
- `/start <id>`
- `/next`
- `/pause`
- elapsed active task display
- safe grapheme-width truncation

### `rpiv-todo` ideas to borrow

Borrow concepts, not the public API:

- explicit `session_compact` replay hook
- optional dependency metadata: `blockedBy`
- dependency validation and cycle detection
- deleted tombstones for audit-friendly removal
- optional richer fields: `description`, `owner`, `metadata`, `activeForm`
- overlay behavior where completed tasks can disappear from the compact overlay after the next agent turn while still remaining in task history

Do **not** copy:

- the single `todo({ action })` tool API
- `rpiv-i18n` dependency
- replacing priority with dependency-only sequencing

---

## Milestone 1 — Merge `oh-my-todo` into `pi-todo`

Acceptance criteria:

- `pi-todo` alone provides all current `oh-my-todo` user-facing behavior.
- Existing `todo_write`, `todo_read`, `todo_remove` tools keep the same names and schemas.
- `/todos` continues to open the full-screen task viewer.
- `/done`, `/start`, `/next`, and `/pause` exist from `pi-todo`.
- Above-editor compact widget is owned by `pi-todo`, not `oh-my-todo`.
- Vitest passes in `pi-todo`.

### Task 1: Port `TaskTracker` into `pi-todo`

**Files:**

- Create: `src/tracker.ts`
- Test: `src/tracker.test.ts`
- Reference: `../oh-my-todo/src/state.ts`

Steps:

1. Write failing Vitest tests for transition detection.

```ts
import { describe, expect, it } from "vitest";
import { TaskTracker } from "./tracker";
import type { Task } from "./types";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    content: "Investigate crash",
    status: "pending",
    priority: "medium",
    createdAt: 1000,
    ...overrides,
  };
}

describe("TaskTracker", () => {
  it("detects completed tasks after reconstructing from details", () => {
    const tracker = new TaskTracker();
    tracker.reconstructFromDetails({ tasks: [task({ status: "in_progress" })] });
    tracker.reconstructFromDetails({ tasks: [task({ status: "completed", completedAt: 2000 })] });

    expect(tracker.diff().completed.map((t) => t.id)).toEqual(["t1"]);
  });

  it("formats elapsed active time", () => {
    const tracker = new TaskTracker(() => 70_000);
    expect(tracker.formatElapsed(task({ startedAt: 10_000 }))).toBe("1m 0s");
  });
});
```

2. Implement `src/tracker.ts` by moving the existing `TaskTracker` logic from `oh-my-todo/src/state.ts`.
3. Change `formatElapsed` to accept an injectable clock in the constructor for deterministic tests.
4. Run:

```bash
npm test -- src/tracker.test.ts
```

Expected: new tests pass.

### Task 2: Port compact widget rendering into focused module

**Files:**

- Create: `src/compact-widget.ts`
- Test: `src/compact-widget.test.ts`
- Reference: `../oh-my-todo/src/index.ts`

Steps:

1. Write Vitest tests covering:
   - empty state renders one short line
   - active task renders content and priority badge
   - progress bar uses `█` / `░`
   - line length does not exceed supplied width
   - all-done state renders all-done banner
2. Implement `src/compact-widget.ts` with exported function:

```ts
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-tui";
import type { TaskTracker } from "./tracker";

export const COMPACT_WIDGET_KEY = "pi-todo-compact";

export function updateCompactWidget(ctx: ExtensionContext, tracker: TaskTracker): void {
  // Sets aboveEditor widget when ctx.hasUI is true.
}
```

3. Keep grapheme-aware truncation, but make helpers local to `compact-widget.ts` unless tests need exported pure functions.
4. Do not reuse widget key `oh-my-todo`; use `pi-todo-compact` so stale state is visibly from the merged extension.
5. Run:

```bash
npm test -- src/compact-widget.test.ts
```

Expected: widget tests pass.

### Task 3: Integrate tracker/widget and celebrations into `src/index.ts`

**Files:**

- Modify: `src/index.ts`
- Create: `src/celebrations.ts`
- Test: `src/index.test.ts` or `src/celebrations.test.ts`

Steps:

1. Write tests for celebration state:
   - completing one task emits one success notification
   - completing all tasks emits one all-done notification
   - duplicate `agent_end` does not repeat all-done notification without a state change
2. Move celebration logic from `oh-my-todo/src/index.ts` into `src/celebrations.ts`.
3. In `src/index.ts`, create one module-level `TaskTracker` instance.
4. On `tool_result` for `todo_write` or `todo_remove`:
   - reconstruct tracker from `event.details`
   - compute diff
   - run celebrations
   - update compact widget
5. On `session_start` and `session_tree`:
   - call existing `reconstructState(ctx)`
   - update tracker from `{ tasks: store.tasks }`
   - reset celebration state on `session_start`
   - update compact widget
6. Keep existing system-prompt injection unchanged.
7. Run:

```bash
npm test
```

Expected: all current and new pi-todo tests pass.

### Task 4: Move slash helpers into `pi-todo`

**Files:**

- Create: `src/commands.ts`
- Modify: `src/index.ts`
- Test: `src/commands.test.ts`
- Reference: `../oh-my-todo/src/index.ts`

Steps:

1. Write tests with mocked `ExtensionAPI` and `ExtensionContext` for:
   - `/done <id>` emits a user message asking the agent to update `todo_write`
   - `/start <id>` emits a user message asking the agent to update `todo_write`
   - `/next` completes current active and starts highest-priority pending
   - `/pause` reverts active task to pending
   - missing/unknown IDs notify instead of sending a message
2. Implement `registerTaskCommands(pi, tracker)`.
3. Keep command behavior intentionally indirect: commands should send a user message instructing the agent to call `todo_write`, not mutate store behind the model's back. This preserves auditability in session history.
4. Register helper commands from `src/index.ts` after tool registration.
5. Run:

```bash
npm test -- src/commands.test.ts
```

Expected: helper command tests pass.

### Task 5: Retire standalone `oh-my-todo` after merged verification

**Files:**

- Modify: `README.md`
- Modify if needed: `CHANGELOG.md`
- Later/manual: Pi package/extension settings that load `oh-my-todo`

Steps:

1. Update `pi-todo/README.md` to list merged features:
   - compact widget
   - celebrations
   - `/done`, `/start`, `/next`, `/pause`
2. Add a changelog entry: "Merged oh-my-todo polish into pi-todo."
3. Run:

```bash
npm test
```

Expected: pass.

4. Restart or `/reload` Pi in a trial session with only `pi-todo` active.
5. Verify manually:
   - `todo_write` creates tasks
   - compact widget appears
   - `/done t1`, `/start t1`, `/next`, `/pause` work
   - `/todos` still opens the full-screen viewer
6. Only after manual verification, remove/disable `oh-my-todo` from the active setup. Do not delete the folder until one normal work session confirms the merged extension is stable.

---

## Milestone 2 — Add compaction-aware replay

Acceptance criteria:

- Todo state is reconstructed on `session_compact` just like on `session_start` and `session_tree`.
- Compact widget and tracker state remain correct after compaction.

### Task 6: Add `session_compact` hook

**Files:**

- Modify: `src/index.ts`
- Test: `src/index.test.ts` or focused lifecycle test

Steps:

1. Add a shared helper in `src/index.ts` or `src/lifecycle.ts`:

```ts
function refreshFromBranch(ctx: ExtensionContext): void {
  reconstructState(ctx);
  tracker.reconstructFromDetails({ tasks: store.tasks });
  updateWidget(ctx);
  updateCompactWidget(ctx, tracker);
}
```

2. Use it for `session_start`, `session_tree`, and new `session_compact`.
3. Ensure `session_start` still resets celebration state; `session_compact` should not emit celebrations.
4. Run:

```bash
npm test
```

Expected: pass.

---

## Milestone 3 — Add optional dependency tracking

Acceptance criteria:

- Existing callers can keep using the old task shape unchanged.
- Tasks may optionally include `blockedBy?: string[]`.
- `todo_write` rejects invalid dependency graphs instead of accepting corrupt task state.
- Prompt and viewer can display blocked tasks compactly.

### Task 7: Extend task type and schema with `blockedBy`

**Files:**

- Modify: `src/types.ts`
- Modify: `src/schemas.ts`
- Test: `src/state.test.ts`

Steps:

1. Extend `Task`:

```ts
export interface Task {
  id: string;
  content: string;
  status: TaskStatus;
  priority: TaskPriority;
  blockedBy?: string[];
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}
```

2. Extend TypeBox schema:

```ts
blockedBy: Type.Optional(
  Type.Array(Type.String(), {
    description: "Optional task IDs that must be completed before this task is unblocked.",
  }),
),
```

3. Ensure tests for old tasks without `blockedBy` still pass.

### Task 8: Add dependency validation and cycle detection

**Files:**

- Create: `src/dependencies.ts`
- Test: `src/dependencies.test.ts`
- Modify: `src/state.ts`

Steps:

1. Write tests:

```ts
expect(validateDependencies(tasksWithDanglingId).ok).toBe(false);
expect(validateDependencies(tasksWithSelfBlock).ok).toBe(false);
expect(validateDependencies(tasksWithCycle).ok).toBe(false);
expect(validateDependencies(validTasks).ok).toBe(true);
```

2. Implement:

```ts
export interface DependencyValidationResult {
  ok: boolean;
  error?: string;
}

export function validateDependencies(tasks: readonly Task[]): DependencyValidationResult;
```

3. Validation rules:
   - every `blockedBy` id must refer to an existing non-deleted task
   - a task cannot block itself
   - dependency graph must be acyclic
   - duplicate `blockedBy` IDs should be normalized away or rejected consistently; prefer normalization during `todo_write`
4. In `TodoStore.setTasks` or a new `TodoStore.validateAndSetTasks`, validate before committing.
5. In `todo_write.execute`, if invalid, return a tool result with a clear error and keep previous state unchanged.
6. Run:

```bash
npm test -- src/dependencies.test.ts src/state.test.ts
```

Expected: pass.

### Task 9: Display blocked state without changing tool discipline

**Files:**

- Modify: `src/prompt.ts`
- Modify: `src/component.ts`
- Modify: `src/compact-widget.ts`
- Test: `src/component.test.ts`, `src/compact-widget.test.ts`, optional `src/prompt.test.ts`

Steps:

1. In prompt injection, append a compact dependency suffix:

```text
○ [Medium] Write docs (blocked by: t1, t2)
```

2. In full-screen viewer, show blocked suffix dimmed.
3. In compact widget, if active task is blocked, prefer showing pending count and blocked hint instead of encouraging action on it.
4. Do not automatically reorder by dependency yet. Preserve current PMTI/tool discipline: agent still owns task ordering, dependencies are advisory/validation metadata.
5. Run:

```bash
npm test
```

Expected: pass.

---

## Milestone 4 — Add audit-friendly tombstones

Acceptance criteria:

- `todo_remove` can preserve removed tasks as `deleted` tombstones.
- Existing hard-remove behavior remains available if needed.
- Prompt injection and compact overlay hide deleted tasks by default.
- `/todos` full-screen viewer can optionally expose deleted tasks later, but this plan does not require a UI toggle.

### Task 10: Extend status model with `deleted`

**Files:**

- Modify: `src/types.ts`
- Modify: `src/schemas.ts`
- Modify: `src/state.ts`
- Test: `src/state.test.ts`

Steps:

1. Extend status:

```ts
export type TaskStatus = "pending" | "in_progress" | "completed" | "deleted";
```

2. Add `deletedAt?: number` to `Task`.
3. Update status icons:

```ts
export const STATUS_ICON: Record<TaskStatus, string> = {
  pending: "\uf4aa",
  in_progress: "\uf111",
  completed: "\uf00c",
  deleted: "\uf1f8",
};
```

4. Update `activeTasks()` to exclude both `completed` and `deleted`.
5. Update formatters to hide deleted by default.
6. Run focused tests.

### Task 11: Change `todo_remove` to tombstone by default

**Files:**

- Modify: `src/schemas.ts`
- Modify: `src/state.ts`
- Modify: `src/index.ts`
- Test: `src/state.test.ts`

Steps:

1. Extend `TodoRemoveParams`:

```ts
export const TodoRemoveParams = Type.Object({
  ids: Type.Array(Type.String(), { description: "Task IDs to remove." }),
  mode: Type.Optional(
    StringEnum(["tombstone", "hard"] as const, {
      description: "Removal mode. Default tombstone preserves audit history; hard permanently removes.",
    }),
  ),
});
```

2. Add store methods:

```ts
tombstoneByIds(ids: string[]): string[];
hardRemoveByIds(ids: string[]): string[];
```

3. Keep old `removeByIds` as an alias for hard remove only if tests or existing code need it; otherwise rename call sites clearly.
4. Update `todo_remove` prompt guidelines:
   - default removal is tombstone/audit-preserving
   - use hard only for accidental junk tasks
5. Ensure completed tasks still remain visible unless deleted.
6. Run:

```bash
npm test
```

Expected: pass.

---

## Milestone 5 — Add optional rich task fields

Acceptance criteria:

- Existing tasks remain valid.
- New optional fields support PMTI/task ownership and UI polish.
- Prompt injection remains concise.

### Task 12: Add `description`, `owner`, `metadata`, and `activeForm`

**Files:**

- Modify: `src/types.ts`
- Modify: `src/schemas.ts`
- Modify: `src/prompt.ts`
- Modify: `src/component.ts`
- Test: `src/state.test.ts`, `src/component.test.ts`

Steps:

1. Extend `Task`:

```ts
description?: string;
owner?: string;
metadata?: Record<string, unknown>;
activeForm?: string;
```

2. Add TypeBox fields with descriptions.
3. Keep `content` as the canonical short task label. Do not rename it to `subject`.
4. Use `activeForm` in the compact widget when task is `in_progress`:

```text
● researching rpiv-todo  2m 13s
```

falling back to `content` when absent.
5. Show `owner` only in expanded/full-screen view, not in compact prompt injection unless needed.
6. Keep `metadata` out of UI by default; it exists for future PMTI integration.
7. Run:

```bash
npm test
```

Expected: pass.

---

## Milestone 6 — Documentation, cleanup, and package deactivation

Acceptance criteria:

- `pi-todo` README documents the merged extension and new fields.
- `oh-my-todo` is no longer needed in the active Pi setup.
- BRAIN/AGENTS notes no longer describe `oh-my-todo` as a separate active extension after the actual deactivation happens.

### Task 13: Update docs

**Files:**

- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Later/manual after deactivation: `/home/quzma/.pi/agent/BRAIN.md`

Steps:

1. Update README sections:
   - How it works
   - Tools
   - Task statuses
   - Task priorities
   - Optional dependencies and metadata
   - Compact widget and slash helpers
2. Add migration note:

```text
As of <version>, oh-my-todo features are built into pi-todo. Do not load both extensions unless testing migration behavior.
```

3. Update changelog with all user-facing changes.
4. Run:

```bash
npm test
```

Expected: pass.

### Task 14: Deactivate `oh-my-todo` safely

**Files:**

- Active Pi config/package list, exact file to be identified during implementation
- `/home/quzma/.pi/agent/BRAIN.md` after deactivation

Steps:

1. Before changing config, run:

```bash
pi list
```

2. Identify whether `oh-my-todo` is loaded as a local extension, package, or submodule-managed extension.
3. Disable it without deleting the folder.
4. Restart Pi or run `/reload`.
5. Test a small todo workflow manually.
6. After successful manual test, update `BRAIN.md` inventory from:

```text
`oh-my-todo` — polish layer for pi-todo.
```

to:

```text
`pi-todo` — structured task tracking with prompt injection, compact widget, slash helpers, dependency metadata, and audit-friendly removal.
```

7. Keep `oh-my-todo/` around for one week or until the next stable sync, then decide whether to archive/delete.

---

## Verification commands

Run from:

```bash
cd /home/quzma/.pi/agent/extensions/pi-todo
```

Primary verification:

```bash
npm test
```

Expected:

```text
vitest run
... all tests pass ...
```

Optional post-merge manual verification in Pi:

```text
/reload
```

Then ask the agent to create a 3-task plan and verify:

- compact widget appears above editor
- `todo_write` result renders correctly
- `/todos` opens viewer
- `/start <id>` sends an instruction to update via `todo_write`
- `/done <id>` sends an instruction to update via `todo_write`
- `/next` advances current/next task
- `/pause` reverts current task
- completed tasks remain in full history
- deleted/tombstoned tasks do not appear in normal prompt injection

---

## Rollback plan

If merged `pi-todo` misbehaves before `oh-my-todo` is disabled:

```bash
git restore /home/quzma/.pi/agent/extensions/pi-todo
```

If `oh-my-todo` was already disabled and the merged behavior fails:

1. Re-enable `oh-my-todo` in the previous Pi package/extension config.
2. Restart Pi or run `/reload`.
3. Restore `pi-todo` changes:

```bash
git restore /home/quzma/.pi/agent/extensions/pi-todo
```

If this config repo is not currently a git repository on the machine, use `pi-sync` / the remote tracked config history to recover the previous extension state.

---

## Self-review

- Spec coverage: covers requested `oh-my-todo` merge plus recommended `rpiv-todo` borrow list: compaction, dependencies, tombstones, rich fields, compact overlay behavior.
- Public API stability: preserves `todo_write`, `todo_read`, `todo_remove`, `/todos`; adds helper commands without replacing current tools.
- Main risk: dependency/tombstone schema changes can affect prompt/schema behavior. Mitigation: implement after merge in separate milestones with tests.
- Non-goal: adopting `rpiv-todo`'s single `todo({ action })` API or i18n stack.
