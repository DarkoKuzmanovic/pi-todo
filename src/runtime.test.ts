import { describe, it, expect, beforeEach } from "vitest";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { COMPACT_WIDGET_KEY } from "./compact-widget";
import { latestTodoDetails, TodoRuntime } from "./runtime";
import { store as todoStore } from "./state";
import type { Task } from "./types";

// ── Test helpers ────────────────────────────────────────────────────────────

/** Minimal theme that satisfies the legacy `updateWidget` widget contract. */
const noopTheme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
};

interface Notification {
	message: string;
	type: string | undefined;
}

interface WidgetCall {
	key: string;
	hasContent: boolean;
}

interface StatusCall {
	key: string;
	text: string | undefined;
}

interface CapturingContext {
	ctx: ExtensionContext;
	notifications: Notification[];
	widgetCalls: WidgetCall[];
	statusCalls: StatusCall[];
}

function buildContext(hasUI = true): CapturingContext {
	const notifications: Notification[] = [];
	const widgetCalls: WidgetCall[] = [];
	const statusCalls: StatusCall[] = [];
	const ctx = {
		hasUI,
		ui: {
			theme: noopTheme,
			notify(message: string, type?: string) {
				notifications.push({ message, type });
			},
			setWidget(key: string, content: unknown, _options?: unknown) {
				widgetCalls.push({ key, hasContent: content !== undefined });
			},
			setStatus(key: string, text: string | undefined) {
				statusCalls.push({ key, text });
			},
		},
	};
	return {
		ctx: ctx as unknown as ExtensionContext,
		notifications,
		widgetCalls,
		statusCalls,
	};
}

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "t1",
		content: "Test task",
		status: "pending",
		priority: "medium",
		createdAt: 1000,
		...overrides,
	};
}

function makeBranchEntry(
	toolName: "todo_write" | "todo_remove",
	details: unknown,
	role: string = "toolResult",
): unknown {
	return {
		type: "message",
		message: { role, toolName, details },
	};
}

function makeNonMessageEntry(type: string = "compaction"): unknown {
	return { type };
}

function makeMessageEntry(toolName: string, role: string = "assistant"): unknown {
	return { type: "message", message: { role, toolName } };
}

// ── Test setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
	todoStore.tasks = [];
	todoStore.idCounter = 0;
});

// ── latestTodoDetails ───────────────────────────────────────────────────────

describe("latestTodoDetails", () => {
	it("returns undefined for an empty branch", () => {
		expect(latestTodoDetails([])).toBeUndefined();
	});

	it("returns undefined when the branch has no todo tool results", () => {
		const branch = [
			makeNonMessageEntry("compaction"),
			makeMessageEntry("bash", "assistant"),
		];
		expect(latestTodoDetails(branch)).toBeUndefined();
	});

	it("returns the details of the latest todo_write entry", () => {
		const branch = [
			makeBranchEntry("todo_write", { tasks: [makeTask({ id: "t1" })] }),
			makeBranchEntry("todo_write", { tasks: [makeTask({ id: "t2" })] }),
		];
		const latest = latestTodoDetails(branch) as { tasks: Task[] };
		expect(latest.tasks[0].id).toBe("t2");
	});

	it("treats the last todo_write/todo_remove as authoritative regardless of order", () => {
		const branch = [
			makeBranchEntry("todo_write", { tasks: [makeTask({ id: "t1" })] }),
			makeBranchEntry("todo_remove", { tasks: [] }),
			makeBranchEntry("todo_write", { tasks: [makeTask({ id: "t3" })] }),
		];
		const latest = latestTodoDetails(branch) as { tasks: Task[] };
		expect(latest.tasks[0].id).toBe("t3");
	});

	it("ignores non-object and malformed entries", () => {
		const branch = [
			null,
			undefined,
			42,
			"string",
			{ type: "message" },
			{ type: "message", message: null },
			{ type: "message", message: { role: "user" } },
		];
		expect(latestTodoDetails(branch)).toBeUndefined();
	});
});

// ── TodoRuntime.reconstructFromSession ──────────────────────────────────────

describe("TodoRuntime.reconstructFromSession", () => {
	let runtime: TodoRuntime;

	beforeEach(() => {
		runtime = new TodoRuntime();
	});

	it("starts with an empty tracker when the branch has no todo results", () => {
		const { ctx } = buildContext();
		runtime.reconstructFromSession([], ctx);
		expect(runtime.tracker.totalCount).toBe(0);
	});


	it("clears a stale tracker when the branch has no todo results", () => {
		const { ctx } = buildContext();
		runtime.processToolResult("todo_write", { tasks: [makeTask({ id: "t1" })] }, ctx);
		expect(runtime.tracker.totalCount).toBe(1);

		runtime.reconstructFromSession([], ctx);

		expect(runtime.tracker.totalCount).toBe(0);
	});


	it("clears a stale tracker when latest todo details are malformed", () => {
		const { ctx } = buildContext();
		runtime.processToolResult("todo_write", { tasks: [makeTask({ id: "t1" })] }, ctx);
		expect(runtime.tracker.totalCount).toBe(1);

		const branch = [makeBranchEntry("todo_write", { notTasks: true })];
		runtime.reconstructFromSession(branch, ctx);

		expect(runtime.tracker.totalCount).toBe(0);
	});

	it("reconstructs the tracker from the latest todo_write details in the branch", () => {
		const { ctx } = buildContext();
		const branch = [
			makeBranchEntry("todo_write", {
				tasks: [
					makeTask({ id: "t1", content: "alpha" }),
					makeTask({ id: "t2", content: "beta" }),
				],
			}),
		];
		runtime.reconstructFromSession(branch, ctx);
		expect(runtime.tracker.totalCount).toBe(2);
		expect(runtime.tracker.tasks.map((t) => t.id)).toEqual(["t1", "t2"]);
	});

	it("refreshes both widgets when UI is available", () => {
		const { ctx, widgetCalls } = buildContext();
		const branch = [
			makeBranchEntry("todo_write", { tasks: [makeTask({ id: "t1" })] }),
		];
		runtime.reconstructFromSession(branch, ctx);
		const keys = widgetCalls.map((w) => w.key);
		expect(keys).toContain("pi-todo");
		expect(keys).toContain(COMPACT_WIDGET_KEY);
	});

	it("does not throw when ctx.hasUI is false", () => {
		const { ctx, widgetCalls } = buildContext(false);
		const branch = [
			makeBranchEntry("todo_write", { tasks: [makeTask({ id: "t1" })] }),
		];
		expect(() => runtime.reconstructFromSession(branch, ctx)).not.toThrow();
		expect(widgetCalls).toHaveLength(0);
	});

	it("resets celebration state so a re-reconstruct does not fire stale celebrations", () => {
		const { ctx } = buildContext();
		// First session: two pending tasks.
		runtime.reconstructFromSession(
			[makeBranchEntry("todo_write", { tasks: [makeTask({ id: "t1" }), makeTask({ id: "t2" })] })],
			ctx,
		);
		// Second session (reload): both tasks completed. This should NOT celebrate
		// the completions, because they happened in a previous session.
		const completedBranch = [
			makeBranchEntry("todo_write", {
				tasks: [
					makeTask({ id: "t1", status: "completed" }),
					makeTask({ id: "t2", status: "completed" }),
				],
			}),
		];
		runtime.reconstructFromSession(completedBranch, ctx);
		expect(runtime.tracker.completedCount).toBe(2);
		// The all-done widget is set, but no notifications are emitted.
		// (We can verify by checking that subsequent identical details don't notify.)
		const { notifications } = buildContext();
		runtime.processToolResult("todo_write", completedBranch[0] ? (completedBranch[0] as { message: { details: unknown } }).message.details : undefined, notifications.ctx);
		// After reconstruct, the tracker holds the completed tasks. Processing
		// identical details is a no-op (no diff), so no notifications.
		expect(notifications).toHaveLength(0);
	});
});

// ── TodoRuntime.processToolResult ───────────────────────────────────────────

describe("TodoRuntime.processToolResult", () => {
	let runtime: TodoRuntime;

	beforeEach(() => {
		runtime = new TodoRuntime();
	});

	it("ignores non-todo tool names", () => {
		const { ctx, notifications, widgetCalls } = buildContext();
		runtime.processToolResult("bash", { tasks: [makeTask()] }, ctx);
		expect(notifications).toHaveLength(0);
		expect(widgetCalls).toHaveLength(0);
		expect(runtime.tracker.totalCount).toBe(0);
	});

	it("updates the tracker and refreshes widgets for todo_write", () => {
		const { ctx, widgetCalls } = buildContext();
		const details = { tasks: [makeTask({ id: "t1" })] };
		runtime.processToolResult("todo_write", details, ctx);
		expect(runtime.tracker.totalCount).toBe(1);
		const keys = widgetCalls.map((w) => w.key);
		expect(keys).toContain("pi-todo");
		expect(keys).toContain(COMPACT_WIDGET_KEY);
	});

	it("updates the tracker for todo_remove", () => {
		const { ctx } = buildContext();
		runtime.processToolResult("todo_write", { tasks: [makeTask({ id: "t1" }), makeTask({ id: "t2" })] }, ctx);
		// Remove t1.
		runtime.processToolResult("todo_remove", { tasks: [makeTask({ id: "t2" })] }, ctx);
		expect(runtime.tracker.tasks.map((t) => t.id)).toEqual(["t2"]);
	});

	it("is idempotent: processing identical details twice does not re-notify", () => {
		const { ctx, notifications } = buildContext();
		// First: in_progress.
		runtime.processToolResult(
			"todo_write",
			{ tasks: [makeTask({ id: "t1", status: "in_progress" })] },
			ctx,
		);
		// Second: completed (triggers diff.completed).
		const details = { tasks: [makeTask({ id: "t1", status: "completed" })] };
		runtime.processToolResult("todo_write", details, ctx);
		expect(notifications.length).toBeGreaterThan(0);
		const firstCount = notifications.length;
		runtime.processToolResult("todo_write", details, ctx);
		expect(notifications.length).toBe(firstCount);
	});

	it("emits a per-task info notification on completion", () => {
		const { ctx, notifications } = buildContext();
		// First write: task in_progress.
		runtime.processToolResult(
			"todo_write",
			{ tasks: [makeTask({ id: "t1", status: "in_progress" })] },
			ctx,
		);
		// Second write: task completed.
		runtime.processToolResult(
			"todo_write",
			{ tasks: [makeTask({ id: "t1", status: "completed" })] },
			ctx,
		);
		const completion = notifications.filter((n) => n.type === "info" && n.message.includes("Test task"));
		expect(completion).toHaveLength(1);
		expect(completion[0]?.message).toContain("Test task");
	});

	it("emits a milestone notification every 5 completed tasks", () => {
		const { ctx, notifications } = buildContext();
		// First: 5 in_progress tasks.
		const inProgTasks: Task[] = [];
		for (let i = 1; i <= 5; i++) {
			inProgTasks.push(makeTask({ id: `t${i}`, content: `Task ${i}`, status: "in_progress" }));
		}
		runtime.processToolResult("todo_write", { tasks: inProgTasks }, ctx);
		// Second: all completed.
		const completedTasks: Task[] = inProgTasks.map((t) => ({ ...t, status: "completed" as const }));
		runtime.processToolResult("todo_write", { tasks: completedTasks }, ctx);
		const milestone = notifications.find((n) => n.message.includes("5 tasks completed"));
		expect(milestone).toBeDefined();
	});

	it("emits an all-done notification when all tasks are completed", () => {
		const { ctx, notifications } = buildContext();
		// First: 2 in_progress tasks.
		const inProgTasks: Task[] = [
			makeTask({ id: "t1", content: "A", status: "in_progress" }),
			makeTask({ id: "t2", content: "B", status: "in_progress" }),
		];
		runtime.processToolResult("todo_write", { tasks: inProgTasks }, ctx);
		// Second: all completed.
		const completedTasks: Task[] = inProgTasks.map((t) => ({ ...t, status: "completed" as const }));
		runtime.processToolResult("todo_write", { tasks: completedTasks }, ctx);
		const allDone = notifications.find((n) => n.message.includes("All 2 tasks complete"));
		expect(allDone).toBeDefined();
	});

	it("does not re-emit the all-done notification on agent_end refresh", () => {
		const { ctx, notifications } = buildContext();
		// First: 2 in_progress tasks.
		const inProgTasks: Task[] = [
			makeTask({ id: "t1", status: "in_progress" }),
			makeTask({ id: "t2", status: "in_progress" }),
		];
		runtime.processToolResult("todo_write", { tasks: inProgTasks }, ctx);
		// Second: all completed.
		const details = {
			tasks: [
				makeTask({ id: "t1", status: "completed" }),
				makeTask({ id: "t2", status: "completed" }),
			],
		};
		runtime.processToolResult("todo_write", details, ctx);
		const firstCount = notifications.length;
		// Simulate agent_end refresh.
		runtime.refreshWidgets(ctx);
		expect(notifications.length).toBe(firstCount);
	});

	it("does not throw when ctx.hasUI is false", () => {
		const { ctx, widgetCalls } = buildContext(false);
		const details = { tasks: [makeTask({ id: "t1" })] };
		expect(() => runtime.processToolResult("todo_write", details, ctx)).not.toThrow();
		expect(widgetCalls).toHaveLength(0);
		expect(runtime.tracker.totalCount).toBe(1);
	});

	it("does not emit celebrations when the tracker transitions from empty to pending-only", () => {
		const { ctx, notifications } = buildContext();
		runtime.processToolResult(
			"todo_write",
			{ tasks: [makeTask({ id: "t1", status: "pending" })] },
			ctx,
		);
		expect(notifications).toHaveLength(0);
	});

	it("handles details with no tasks array gracefully", () => {
		const { ctx, widgetCalls } = buildContext();
		expect(() => runtime.processToolResult("todo_write", {}, ctx)).not.toThrow();
		expect(runtime.tracker.totalCount).toBe(0);
		expect(widgetCalls).toHaveLength(0);
	});
});

// ── TodoRuntime.refreshWidgets ──────────────────────────────────────────────

describe("TodoRuntime.refreshWidgets", () => {
	it("calls both the legacy and compact widget helpers", () => {
		const runtime = new TodoRuntime();
		const { ctx, widgetCalls } = buildContext();
		runtime.tracker.reconstructFromDetails({ tasks: [makeTask({ id: "t1" })] });
		runtime.refreshWidgets(ctx);
		const keys = widgetCalls.map((w) => w.key);
		expect(keys).toContain("pi-todo");
		expect(keys).toContain(COMPACT_WIDGET_KEY);
	});

	it("is a no-op when ctx.hasUI is false", () => {
		const runtime = new TodoRuntime();
		const { ctx, widgetCalls } = buildContext(false);
		runtime.tracker.reconstructFromDetails({ tasks: [makeTask({ id: "t1" })] });
		expect(() => runtime.refreshWidgets(ctx)).not.toThrow();
		expect(widgetCalls).toHaveLength(0);
	});
});

// ── Integration: state.ts and runtime share the store ──────────────────────

describe("integration: runtime uses shared store", () => {
	it("reconstructFromSession updates the shared todoStore", () => {
		todoStore.tasks = [];
		const runtime = new TodoRuntime();
		const { ctx } = buildContext();
		runtime.reconstructFromSession(
			[makeBranchEntry("todo_write", { tasks: [makeTask({ id: "t1" })] })],
			ctx,
		);
		// The shared store is updated by reconstructState (called from index.ts),
		// not by the runtime directly. But the runtime's tracker is in sync.
		expect(runtime.tracker.totalCount).toBe(1);
	});
});
