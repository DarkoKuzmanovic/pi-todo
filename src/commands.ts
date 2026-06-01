/**
 * Slash helper commands for `pi-todo`.
 *
 * Registers `/done`, `/start`, `/next`, and `/pause`. Commands do not
 * directly mutate task state; they send follow-up instructions that
 * tell the agent to use `todo_write`.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TodoRuntime } from "./runtime";
import { PRIORITY_ORDER } from "./types";
import type { Task, TaskPriority } from "./types";

// ── Helpers ────────────────────────────────────────────────────────────────

function sendCommand(pi: ExtensionAPI, msg: string): void {
	pi.sendUserMessage(`[pi-todo] ${msg}`, { deliverAs: "followUp" });
}

function findTask(tracker: TodoRuntime["tracker"], id: string): Task | undefined {
	return tracker.tasks.find((t) => t.id === id);
}

function highestPriorityPending(tracker: TodoRuntime["tracker"]): Task | undefined {
	const pending = tracker.tasks.filter((t) => t.status === "pending");
	if (pending.length === 0) return undefined;
	return pending.toSorted(
		(a, b) => PRIORITY_ORDER[a.priority as TaskPriority] - PRIORITY_ORDER[b.priority as TaskPriority],
	)[0];
}

// ── Registration ───────────────────────────────────────────────────────────

export function registerTodoCommands(pi: ExtensionAPI, runtime: TodoRuntime): void {
	const tracker = runtime.tracker;

	// ── /done ─────────────────────────────────────────────────────────────
	pi.registerCommand("done", {
		description: "Mark a task as completed. Usage: /done <task-id>",
		handler: async (args, ctx) => {
			const id = (args ?? "").trim();
			if (!id) {
				ctx.ui.notify("Usage: /done <task-id>", "warning");
				return;
			}
			const task = findTask(tracker, id);
			if (!task) {
				ctx.ui.notify(`Task "${id}" not found`, "warning");
				return;
			}
			if (task.status === "completed") {
				ctx.ui.notify(`Task "${id}" is already done`, "info");
				return;
			}
			sendCommand(pi, `Mark task ${id} ("${task.content}") as completed using todo_write.`);
			ctx.ui.notify(`Marking "${task.content}" as done...`, "info");
		},
	});

	// ── /start ────────────────────────────────────────────────────────────
	pi.registerCommand("start", {
		description: "Set a task as in_progress. Usage: /start <task-id>",
		handler: async (args, ctx) => {
			const id = (args ?? "").trim();
			if (!id) {
				ctx.ui.notify("Usage: /start <task-id>", "warning");
				return;
			}
			const task = findTask(tracker, id);
			if (!task) {
				ctx.ui.notify(`Task "${id}" not found`, "warning");
				return;
			}
			if (task.status === "in_progress") {
				ctx.ui.notify(`Task "${id}" is already in progress`, "info");
				return;
			}
			sendCommand(pi, `Set task ${id} ("${task.content}") to in_progress using todo_write.`);
			ctx.ui.notify(`Starting "${task.content}"...`, "info");
		},
	});

	// ── /next ─────────────────────────────────────────────────────────────
	pi.registerCommand("next", {
		description: "Complete the current task and start the next pending one",
		handler: async (_args, ctx) => {
			const active = tracker.activeTask;
			const nextUp = highestPriorityPending(tracker);

			if (!active && !nextUp) {
				ctx.ui.notify("No tasks to advance", "info");
				return;
			}

			let msg = "";
			if (active) {
				msg += `Mark task ${active.id} ("${active.content}") as completed`;
			}
			if (nextUp) {
				if (msg) msg += " and ";
				msg += `set task ${nextUp.id} ("${nextUp.content}") to in_progress`;
			}
			msg += " using todo_write.";
			sendCommand(pi, msg);
			ctx.ui.notify("Advancing tasks...", "info");
		},
	});

	// ── /pause ────────────────────────────────────────────────────────────
	pi.registerCommand("pause", {
		description: "Revert the current in_progress task back to pending",
		handler: async (_args, ctx) => {
			const active = tracker.activeTask;
			if (!active) {
				ctx.ui.notify("No active task to pause", "info");
				return;
			}
			sendCommand(
				pi,
				`Revert task ${active.id} ("${active.content}") from in_progress back to pending using todo_write.`,
			);
			ctx.ui.notify(`Pausing "${active.content}"...`, "info");
		},
	});
}
