/**
 * Slash helper commands for `pi-todo`.
 *
 * Registers `/done`, `/start`, `/next`, and `/pause`. Commands do not
 * directly mutate task state; they send follow-up instructions that
 * tell the agent to use `todo_write`.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TodoRuntime } from "./runtime";
import { activeBlockerIds, isBlocked } from "./deps";
import { activeTasks } from "./tombstone";
import { PRIORITY_ORDER } from "./types";
import type { Task, TaskPriority } from "./types";

// ── Helpers ────────────────────────────────────────────────────────────────

function sendCommand(pi: ExtensionAPI, msg: string): void {
	pi.sendUserMessage(`[pi-todo] ${msg}`, { deliverAs: "followUp" });
}

function findTask(tracker: TodoRuntime["tracker"], id: string): Task | undefined {
	return activeTasks([...tracker.tasks]).find((t) => t.id === id);
}

/** Highest-priority unblocked pending task, or undefined when none are unblocked. */
function highestPriorityUnblockedPending(tracker: TodoRuntime["tracker"]): Task | undefined {
	const tasks = activeTasks([...tracker.tasks]);
	const pending = tasks.filter((t) => t.status === "pending");
	if (pending.length === 0) return undefined;
	const unblocked = pending.filter((t) => !isBlocked(t, tasks));
	if (unblocked.length === 0) return undefined;
	return unblocked.toSorted(
		(a, b) => PRIORITY_ORDER[a.priority as TaskPriority] - PRIORITY_ORDER[b.priority as TaskPriority],
	)[0];
}

/** True when there is at least one pending task currently blocked by an unfinished dependency. */
function hasAnyBlockedPending(tracker: TodoRuntime["tracker"]): boolean {
	const tasks = activeTasks([...tracker.tasks]);
	return tasks.some((t) => t.status === "pending" && isBlocked(t, tasks));
}

/** Human-readable dependency context for a blocked task. */
function blockedByContext(task: Task, tracker: TodoRuntime["tracker"]): string {
	const deps = activeBlockerIds(task, tracker.tasks);
	if (deps.length === 0) return "no blocking dependencies";
	const byId = new Map(tracker.tasks.map((t) => [t.id, t]));
	return deps
		.map((id) => {
			const dep = byId.get(id);
			return dep
				? `${id} (${dep.status === "completed" ? "done" : "not yet completed"})`
				: `${id} (not found)`;
		})
		.join(", ");
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
		if (isBlocked(task, activeTasks([...tracker.tasks]))) {
				ctx.ui.notify(
					`Task ${id} is blocked by: ${blockedByContext(task, tracker)}. Starting anyway...`,
					"info",
				);
				// M3 — use `activeBlockerIds` so tombstoned deps are NOT in the
				// follow-up message (replaces the raw `task.blockedBy` join
				// which could leak a dead id into the agent's view).
				// M-f — include the activeForm label if present so the agent
				// can phrase its acknowledgement with the present-progressive form.
				const liveActiveDeps = activeBlockerIds(task, activeTasks([...tracker.tasks])).join(", ");
				const activeFormSuffix = task.activeForm ? ` Currently ${task.activeForm}.` : "";
				sendCommand(
					pi,
					`Set task ${id} ("${task.content}") to in_progress using todo_write. ` +
						`Note: this task has incomplete dependencies (${liveActiveDeps || "none"}).${activeFormSuffix}`,
				);
			} else {
				const activeFormSuffix = task.activeForm ? ` Currently ${task.activeForm}.` : "";
				sendCommand(
					pi,
					`Set task ${id} ("${task.content}") to in_progress using todo_write.${activeFormSuffix}`,
				);
			}
			ctx.ui.notify(`Starting "${task.content}"...`, "info");
		},
	});

	// ── /next ─────────────────────────────────────────────────────────────
	pi.registerCommand("next", {
		description: "Complete the current task and start the next unblocked pending one",
		handler: async (_args, ctx) => {
			const active = tracker.activeTask;
			const nextUp = highestPriorityUnblockedPending(tracker);

			if (!active && !nextUp) {
				if (hasAnyBlockedPending(tracker)) {
					ctx.ui.notify(
						"All pending tasks are blocked — complete their dependencies first.",
						"info",
					);
				} else {
					ctx.ui.notify("No tasks to advance", "info");
				}
				return;
			}
			let msg = "";
			if (active) {
				msg += `Mark task ${active.id} ("${active.content}") as completed`;
				if (active.activeForm) msg += ` — Currently ${active.activeForm}`;
			}
			if (nextUp) {
				if (msg) msg += " and ";
				msg += `set task ${nextUp.id} ("${nextUp.content}") to in_progress`;
				if (nextUp.activeForm) msg += ` — Currently ${nextUp.activeForm}`;
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
