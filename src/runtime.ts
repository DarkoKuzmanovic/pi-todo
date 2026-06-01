/**
 * Lifecycle integration for `pi-todo`.
 *
 * Owns the module-level `TaskTracker`, celebration state, and the wiring
 * that turns `todo_write` / `todo_remove` results into compact-widget
 * refreshes and completion notifications. Keeping this in its own module
 * makes the integration testable without standing up the full extension.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { updateCompactWidget } from "./compact-widget";
import { updateWidget } from "./state";
import { TaskTracker } from "./tracker";

// ── Constants ──────────────────────────────────────────────────────────────

/** Tool names that carry task details and should drive the tracker. */
const TODO_WRITE = "todo_write";
const TODO_REMOVE = "todo_remove";

// ── Session helpers ────────────────────────────────────────────────────────

/**
 * Walk a session branch and return the `details` payload of the most recent
 * `todo_write` or `todo_remove` tool result, or `undefined` if none found.
 *
 * Mirrors the recovery helper used in `../oh-my-todo/src/index.ts` so
 * forked or reloaded sessions reconstruct tracker state from the latest
 * tool result without replaying every tool call.
 */
export function latestTodoDetails(
	branch: readonly unknown[],
): unknown | undefined {
	let latest: unknown | undefined;
	for (const entry of branch) {
		if (!entry || typeof entry !== "object") continue;
		const e = entry as {
			type?: unknown;
			message?: { role?: unknown; toolName?: unknown; details?: unknown };
		};
		if (e.type !== "message") continue;
		const msg = e.message;
		if (!msg?.role || msg.role !== "toolResult") continue;
		if (msg.toolName !== TODO_WRITE && msg.toolName !== TODO_REMOVE) continue;
		latest = msg.details;
	}
	return latest;
}

// ── TodoRuntime ────────────────────────────────────────────────────────────

/**
 * Runtime integration for `pi-todo`.
 *
 * Holds the live `TaskTracker` and celebration state, and exposes the
 * three operations the extension needs: session reconstruction, tool-result
 * processing, and widget refresh.
 */
export class TodoRuntime {
	readonly tracker: TaskTracker;
	private milestones = new Set<string>();
	private allDoneNotified = false;

	constructor(tracker: TaskTracker = new TaskTracker()) {
		this.tracker = tracker;
	}

	/**
	 * Reconstruct tracker state from the session branch, reset celebrations,
	 * and refresh both widgets. Called from `session_start` and `session_tree`
	 * so reloaded/forked sessions recover without emitting stale celebrations.
	 */
	reconstructFromSession(
		branch: readonly unknown[],
		ctx: ExtensionContext,
	): void {
		this.resetCelebrations();
		this.tracker.reconstructFromDetails({ tasks: [] });
		const details = latestTodoDetails(branch);
		if (details !== undefined) {
			this.tracker.reconstructFromDetails(details);
		}
		this.refreshWidgets(ctx);
	}

	/**
	 * Process a tool result for `todo_write` or `todo_remove`. Idempotent:
	 * identical details are a no-op, so it is safe to call from both the
	 * in-process `execute` handler and the `tool_result` lifecycle hook.
	 */
	processToolResult(
		toolName: string,
		details: unknown,
		ctx: ExtensionContext,
	): void {
		if (toolName !== TODO_WRITE && toolName !== TODO_REMOVE) return;

		const changed = this.tracker.reconstructFromDetails(details);
		if (!changed) return;

		this.notifyCelebrations(ctx);
		this.refreshWidgets(ctx);
	}

	/**
	 * Refresh both the legacy `pi-todo` footer/status widget and the new
	 * `pi-todo-compact` above-editor widget. Safe to call when `ctx.hasUI`
	 * is false; both widget helpers guard internally.
	 */
	refreshWidgets(ctx: ExtensionContext): void {
		updateWidget(ctx);
		updateCompactWidget(ctx, this.tracker);
	}

	// ── Internals ──────────────────────────────────────────────────────────

	private resetCelebrations(): void {
		this.milestones = new Set();
		this.allDoneNotified = false;
	}

	private notifyCelebrations(ctx: ExtensionContext): void {
		const diff = this.tracker.diff();
		if (diff.completed.length === 0) return;

		// Per-task completion notification.
		for (const task of diff.completed) {
			ctx.ui.notify(`"${task.content}" done!`, "info");
		}

		// Milestone: every 5 completed tasks.
		const milestone = Math.floor(diff.done / 5) * 5;
		if (milestone >= 5 && !this.milestones.has(`m${milestone}`)) {
			this.milestones.add(`m${milestone}`);
			ctx.ui.notify(`${milestone} tasks completed!`, "info");
		}

		// All-done.
		if (diff.done === diff.total && diff.total > 0 && !this.allDoneNotified) {
			this.allDoneNotified = true;
			ctx.ui.notify(`All ${diff.total} tasks complete!`, "info");
		}
	}
}
