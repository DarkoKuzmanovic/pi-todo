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
import { latestTodoReplaySource, TODO_REMOVE, TODO_WRITE } from "./replay";
import { updateWidget } from "./state";
import { TaskTracker } from "./tracker";

// ── Session helpers ────────────────────────────────────────────────────────

/**
 * Walk a session branch and return the `details` payload of the most recent
 * supported pi-todo replay source, or `undefined` if none found.
 *
 * Uses the shared replay helper from `src/replay.ts` so that compacted,
 * malformed, empty, and later-tool-result branches are handled the same way
 * by the runtime tracker and the canonical store.
 */
export function latestTodoDetails(
	branch: readonly unknown[],
): unknown | undefined {
	const source = latestTodoReplaySource(branch);
	return source?.details;
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
		const source = latestTodoReplaySource(branch);
		if (source) {
			this.tracker.reconstructFromDetails(source.details);
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
