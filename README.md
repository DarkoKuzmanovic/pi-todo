# @local/pi-todo

A Pi CLI extension that gives the agent a structured task list to prevent **goal drift** — the tendency for agents to lose track of the original plan as context grows and tool calls accumulate.

## How it works

1. The agent calls `todo_write` to plan multi-step work as an explicit task list
2. Before every agent turn, active tasks are injected into the system prompt so the model always knows what remains and what it's currently doing
3. A compact above-editor widget shows current progress, active task context, and all-done state
4. State is reconstructed from the session branch, so `/tree` navigation and forking work correctly
5. Task transitions drive completion notifications without changing the public tool API
6. Completed tasks remain visible in the list — they are never auto-deleted, providing a full audit trail

## Tools

| Tool | Description |
|------|-------------|
| `todo_write` | Replace the entire task list (atomic update) — always pass all tasks |
| `todo_read` | Read the current task list and statuses |
| `todo_remove` | Permanently remove tasks by ID — use for cleanup, not for completed tasks |

### Optional dependency metadata

Each task may carry an optional `blockedBy?: string[]` array of task IDs that must be `completed` before this task is considered unblocked. The field is omitted by default, and tasks without `blockedBy` behave exactly as before.

Example:

```json
{
  "tasks": [
    { "id": "t1", "content": "Set up database", "status": "pending", "priority": "high" },
    { "id": "t2", "content": "Write migrations", "status": "pending", "priority": "medium", "blockedBy": ["t1"] },
    { "id": "t3", "content": "Seed initial data", "status": "pending", "priority": "low", "blockedBy": ["t1", "t2"] }
  ]
}
```

In this example `t2` is unblocked only once `t1` is `completed`; `t3` is unblocked once both `t1` and `t2` are `completed`.

**Validation policy (applied atomically by `todo_write`):**

- Self-dependencies and duplicate IDs inside the same `blockedBy` are stripped silently.
- Unknown dependency IDs (no matching task in the list) are stripped and a warning is appended to the tool result text.
- Dependencies on completed tasks are allowed and never produce a warning.
- Dependency cycles are rejected atomically — the canonical store is not changed and the tool result reports the cycle.
- `todo_remove` is dependency-agnostic; a previously-valid dependency that points to a now-removed task is reported as an unknown ID on the next `todo_write`.

**Visible behavior:**

- `/next` selects only unblocked pending tasks; if every remaining pending task is blocked it notifies `All pending tasks are blocked — complete their dependencies first.`
- `/start <blocked-id>` notifies the user with the blocked-by context and still sends the audited follow-up to the agent, annotated with `incomplete dependencies (t1, t2)` so the model can proceed knowingly.
- `before_agent_start` prompt injection lists unblocked work in normal priority order and blocked pending work in a separate `## Blocked (waiting on dependencies):` section with a `⊘ [Blocked] ... (blocked by: t1, t2)` marker.
- `/todos` listing and `formatListForLLM()` append `(blocked by: t1, t2)` to non-completed tasks that are currently blocked.
- The compact above-editor widget shows a small `⊘ N blocked` segment when pending tasks are blocked.
- Blocked state is **derived**, not stored: a task becomes unblocked automatically as soon as its dependencies are `completed`.

## Task statuses

| Status | Icon | Meaning |
|--------|------|---------|
| `pending` | `○` | Not started |
| `in_progress` | `●` | Actively working — only one at a time |
| `completed` | `✓` | Done — remains in the list |

## Task priorities

| Priority | Label | Color |
|----------|-------|-------|
| `high` | High | Red |
| `medium` | Medium | Yellow |
| `low` | Low | Dim |

## Commands

| Command | Description |
|---------|-------------|
| `/todos` | Open the full-screen task viewer |
| `/done <task-id>` | Ask the agent to mark a task as completed with `todo_write` |
| `/start <task-id>` | Ask the agent to set a task to `in_progress` with `todo_write` |
| `/next` | Ask the agent to complete the active task and/or start the highest-priority **unblocked** pending task |
| `/pause` | Ask the agent to return the active task to `pending` |

Slash helper commands are audit-friendly: they send follow-up instructions for the agent to apply with `todo_write`; they do not mutate task state directly.

Keyboard controls in `/todos`:

| Key | Action |
|-----|--------|
| `↑` / `k` | Move cursor up |
| `↓` / `j` | Move cursor down |
| `g` / `Home` | Jump to first task |
| `G` / `End` | Jump to last task |
| `c` | Toggle completed tasks visibility |
| `Esc` / `Ctrl+C` | Close viewer |

## Install

```bash
# Local development only — add your install URL here
pi install npm:@local/pi-todo
```

## License

[MIT](LICENSE) © Darko Kuzmanovic
