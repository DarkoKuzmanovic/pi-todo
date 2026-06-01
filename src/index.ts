/**
	 * pi-todo
 *
 * Task management extension that prevents "goal drift" — the tendency for
 * agents to lose track of the original plan as context grows.
 *
 * How it works:
 *   1. The agent uses `todo_write` to plan multi-step work as structured tasks
 *   2. Before every agent turn, active tasks are injected into the system prompt
 *   3. A live widget above the editor shows the task list to the user
 *   4. State is stored in tool-result details and reconstructed from the session
 *      branch, so /tree navigation and forking work correctly
 *
 * Tools:   todo_write   — replace the entire task list (atomic update)
 *          todo_read    — read the current task list
 *          todo_remove  — remove tasks by ID (permanent deletion)
 * Command: /todos       — open interactive full-screen task viewer
 */

import type { CustomToolResultEvent, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { TodoViewComponent } from "./component";
import { buildSystemPromptBlock, formatListForLLM } from "./prompt";
import { TodoRemoveParams, TodoWriteParams } from "./schemas";
import { registerTodoCommands } from "./commands";
import { TodoRuntime } from "./runtime";
import { reconstructState, store } from "./state";
import { createTodoSnapshot, TODO_SNAPSHOT_CUSTOM_TYPE } from "./replay";
import { formatStrippedWarning, validateDependencyGraph } from "./deps";
import type { Task, TaskDetails, TaskPriority, TaskStatus } from "./types";

// ── Runtime ────────────────────────────────────────────────────────────────────

const runtime = new TodoRuntime();

/** Safely read the session branch; may throw before the session is initialised. */
function getBranchSafe(ctx: { sessionManager: { getBranch(): readonly unknown[] } }): readonly unknown[] {
	try {
		return ctx.sessionManager.getBranch();
	} catch {
		return [];
	}
}

// ── Extension ──────────────────────────────────────────────────────────────────

export default function todoExtension(pi: ExtensionAPI): void {
	// ── Session lifecycle ──────────────────────────────────────────────────
	pi.on("session_start", async (_event, ctx) => {
		reconstructState(ctx);
		runtime.reconstructFromSession(getBranchSafe(ctx), ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		reconstructState(ctx);
		runtime.reconstructFromSession(getBranchSafe(ctx), ctx);
	});

	// ── Compaction lifecycle ─────────────────────────────────────────────
	// Persist current task state as a custom entry before Pi writes the
	// compaction summary. Always include the full task list (even empty) so
	// a future replay from the compacted branch cannot resurrect stale tasks.
	// Do NOT return `compaction` — that would replace Pi's default summary.
	pi.on("session_before_compact", (_event, _ctx) => {
		pi.appendEntry(TODO_SNAPSHOT_CUSTOM_TYPE, createTodoSnapshot({ tasks: [...store.tasks] }));
	});

	// After compaction the branch is trimmed. Reconstruct both the canonical
	// store and the runtime tracker from the kept branch (which now includes
	// the custom entry appended above), then refresh widgets. Celebrations
	// are reset inside `reconstructFromSession` so they do not replay.
	pi.on("session_compact", async (_event, ctx) => {
		reconstructState(ctx);
		runtime.reconstructFromSession(getBranchSafe(ctx), ctx);
	});

	// ── System-prompt injection ────────────────────────────────────────────
	pi.on("before_agent_start", async (event, _ctx) => {
		const block = buildSystemPromptBlock();
		if (!block) return;
		return { systemPrompt: `${event.systemPrompt}\n\n${block}` };
	});

	// ── Post-turn widget refresh ───────────────────────────────────────────
	pi.on("agent_end", async (_event, ctx) => {
		runtime.refreshWidgets(ctx);
	});

	// ── Tool result hook ───────────────────────────────────────────────────
	// Replay safety: if a tool result fires before the in-process `execute`
	// handler updates the runtime, the idempotent `processToolResult` will
	// pick it up. Normal flow is a no-op because `execute` already handled it.
	pi.on("tool_result", async (event, ctx) => {
		const toolEvent = event as CustomToolResultEvent;
		runtime.processToolResult(toolEvent.toolName, toolEvent.details, ctx);
	});

	// ── Tool: todo_write ───────────────────────────────────────────────────
	pi.registerTool({
		name: "todo_write",
		label: "Tasks",
		description:
		"Plan complex work by breaking it into structured, trackable tasks. " +
			"Provide the COMPLETE updated list — this REPLACES the current list entirely.",
		promptSnippet:
			"Create and update a structured task list with statuses (pending / in_progress / completed) and priorities",
		promptGuidelines: [
			"When you receive a task that involves multiple steps, files, or logical phases, call todo_write FIRST " +
				"to break it into a structured plan before writing code or running commands. " +
				"The task list is your north star — refer back to it to avoid drift. " +
				"Each task should be specific, atomic, and actionable.",
			"Before starting a task, call todo_write to set it to 'in_progress'. " +
				"Only one task should be 'in_progress' at a time unless tasks are genuinely parallel.",
			"Immediately after completing a task, call todo_write to mark it 'completed'. " +
				"Do not batch completions — mark each task done as soon as it is finished. " +
				"Completed tasks remain visible in the list; they are never automatically deleted.",
			"todo_write REPLACES the entire list. Always include ALL tasks (both changed and unchanged) in every call.",
			"To permanently remove tasks, use todo_remove instead of omitting them from todo_write.",
		],
		parameters: TodoWriteParams,

		async execute(_id, params, _signal, _onUpdate, ctx) {
			// Build candidate task list preserving any blockedBy metadata the agent sent.
			const candidates: Task[] = params.tasks.map((t) => {
				const next: Task = {
					id: t.id ?? store.generateId(),
					content: t.content,
					status: t.status as TaskStatus,
					priority: t.priority as TaskPriority,
				};
				if (Array.isArray(t.blockedBy)) {
					next.blockedBy = [...t.blockedBy];
				}
				return next;
			});

			// Apply the oracle-specified dependency validation policy:
			//   - strip self-deps and duplicates silently
			//   - strip unknown IDs with warning
			//   - reject cycles atomically
			const validation = validateDependencyGraph(candidates);
			if (!validation.ok) {
				return {
					content: [{ type: "text", text: validation.error }],
					details: { tasks: [...store.tasks] } satisfies TaskDetails,
				};
			}

			store.applyStatusTransitions(validation.tasks);
			store.setTasks(validation.tasks);
			store.syncIdCounter();
			const details = { tasks: [...store.tasks] } satisfies TaskDetails;
			runtime.processToolResult("todo_write", details, ctx);

			const warning = formatStrippedWarning(validation.strippedUnknown);
			const listText = formatListForLLM();
			const text = warning ? `${listText}\n\n${warning}` : listText;
			return {
				content: [{ type: "text", text }],
				details,
			};
		},
		renderCall(args, theme) {
			const list = args.tasks ?? [];
			const inProg = list.filter((t: { status: string }) => t.status === "in_progress").length;
			const done = list.filter((t: { status: string }) => t.status === "completed").length;
			const total = list.length;

			let text = theme.fg("toolTitle", theme.bold("todo_write "));
			text += theme.fg("muted", `${total} task${total !== 1 ? "s" : ""}`);
			if (inProg > 0) text += `  ${theme.fg("accent", `\uf111 ${inProg} active`)}`;
			if (done > 0) text += `  ${theme.fg("success", `\uf00c ${done} done`)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			return TodoViewComponent.renderTaskResult(result.details as TaskDetails | undefined, expanded, theme);
		},
	});

	// ── Tool: todo_read ────────────────────────────────────────────────────
	pi.registerTool({
		name: "todo_read",
		label: "Tasks",
		description: "Read the current task list. Use this to check your tasks and their statuses.",
		promptSnippet: "Read the current task list and statuses",
		parameters: Type.Object({}),

		async execute() {
			return {
				content: [{ type: "text", text: formatListForLLM() }],
				details: { tasks: [...store.tasks] } satisfies TaskDetails,
			};
		},

		renderCall(_args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("todo_read")), 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			return TodoViewComponent.renderTaskResult(result.details as TaskDetails | undefined, expanded, theme);
		},
	});

	// ── Tool: todo_remove ──────────────────────────────────────────────────
	pi.registerTool({
		name: "todo_remove",
		label: "Tasks",
		description:
			"Permanently remove tasks by ID. Use this to clean up tasks that are no longer relevant. " +
			"Completed tasks normally stay in the list for visibility — only remove if truly unwanted.",
		promptSnippet: "Remove tasks by ID",
		promptGuidelines: [
			"Use todo_remove to permanently delete tasks that are no longer needed. " +
				"Completed tasks remain visible by default — only remove if they clutter the list.",
		],
		parameters: TodoRemoveParams,

		async execute(_id, params, _signal, _onUpdate, ctx) {
			const removed = store.removeByIds(params.ids);
			const details = { tasks: [...store.tasks] } satisfies TaskDetails;
			runtime.processToolResult("todo_remove", details, ctx);

			if (removed.length === 0) {
				return {
				content: [{ type: "text", text: "No tasks to remove (empty ID list)." }],
					details,
				};
			}

			return {
				content: [
					{
						type: "text",
						text: `Removed ${removed.length} task${removed.length !== 1 ? "s" : ""}: ${removed.join(", ")}\n\n${formatListForLLM()}`,
					},
				],
				details,
			};
		},

		renderCall(args, theme) {
			const ids = args.ids ?? [];
			const idStr = ids.map((id: string) => theme.fg("accent", id)).join(", ");
			return new Text(
				theme.fg("toolTitle", theme.bold("todo_remove ")) + theme.fg("muted", `remove ${idStr}`),
				0,
				0,
			);
		},

		renderResult(result, { expanded }, theme) {
			return TodoViewComponent.renderTaskResult(result.details as TaskDetails | undefined, expanded, theme);
		},
	});

	// ── Command: /todos ────────────────────────────────────────────────────
	pi.registerCommand("todos", {
		description: "Open the interactive task viewer",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify(store.tasks.length === 0 ? "No tasks yet." : formatListForLLM(), "info");
				return;
			}
			await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
				return new TodoViewComponent(store.tasks, theme, () => done());
			});
		},
	});

	// ── Slash helper commands ─────────────────────────────────────────────
	registerTodoCommands(pi, runtime);
}
