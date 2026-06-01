/**
 * Lifecycle tests for the M1-T3 compaction hooks registered in src/index.ts.
 *
 * Strategy: build a minimal mock ExtensionAPI that captures registered
 * event handlers and appendEntry calls, then invoke the handlers directly
 * to verify behavior without spinning up the full Pi runtime.
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import todoExtension from "./index";
import { createTodoSnapshot, TODO_SNAPSHOT_CUSTOM_TYPE } from "./replay";
import { store as todoStore } from "./state";
import { COMPACT_WIDGET_KEY } from "./compact-widget";
import type { Task } from "./types";

// ── Helpers ────────────────────────────────────────────────────────────────

const noopTheme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
};

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

interface AppendedEntry {
	customType: string;
	data: unknown;
}

interface MockPiResult {
	pi: ExtensionAPI;
	handlers: Map<string, (event: unknown, ctx: ExtensionContext) => unknown>;
	appendedEntries: AppendedEntry[];
}

/**
 * Build a minimal mock ExtensionAPI that:
 *  - captures event handlers registered via pi.on()
 *  - records entries appended via pi.appendEntry()
 *  - stubs registerTool / registerCommand as no-ops
 */
function buildMockPi(): MockPiResult {
	const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => unknown>();
	const appendedEntries: AppendedEntry[] = [];

	const pi = {
		on(event: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) {
			handlers.set(event, handler);
		},
		registerTool() {},
		registerCommand() {},
		appendEntry(customType: string, data?: unknown) {
			appendedEntries.push({ customType, data });
		},
	} as unknown as ExtensionAPI;

	return { pi, handlers, appendedEntries };
}

interface WidgetCall {
	key: string;
	hasContent: boolean;
}

interface Notification {
	message: string;
	type: string | undefined;
}

interface StatusCall {
	key: string;
	text: string | undefined;
}

interface MockCtxResult {
	ctx: ExtensionContext;
	widgetCalls: WidgetCall[];
	statusCalls: StatusCall[];
	notifications: Notification[];
}

/**
 * Build a mock ExtensionContext whose getBranch returns the given branch.
 * Captures setWidget calls and ui.notify calls for assertion.
 */
function buildCtx(branch: readonly unknown[], hasUI = true): MockCtxResult {
	const widgetCalls: WidgetCall[] = [];
	const statusCalls: StatusCall[] = [];
	const notifications: Notification[] = [];

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
		sessionManager: {
			getBranch(): readonly unknown[] {
				return branch;
			},
		},
	} as unknown as ExtensionContext;

	return { ctx, widgetCalls, statusCalls, notifications };
}

// ── session_before_compact ─────────────────────────────────────────────────

describe("compaction lifecycle: session_before_compact", () => {
	let mockPi: MockPiResult;

	beforeEach(() => {
		todoStore.tasks = [];
		todoStore.idCounter = 0;
		mockPi = buildMockPi();
		todoExtension(mockPi.pi);
	});

	it("appends a pi-todo:snapshot entry with the current task list", () => {
		todoStore.tasks = [makeTask({ id: "t1", content: "Active task" })];

		const handler = mockPi.handlers.get("session_before_compact");
		expect(handler).toBeDefined();
		handler!({} as unknown, {} as ExtensionContext);

		expect(mockPi.appendedEntries).toHaveLength(1);
		const entry = mockPi.appendedEntries[0]!;
		expect(entry.customType).toBe(TODO_SNAPSHOT_CUSTOM_TYPE);
		expect(entry.data).toEqual(createTodoSnapshot({ tasks: todoStore.tasks }));
	});

	it("appends a pi-todo:snapshot with an empty task list when the store is empty", () => {
		todoStore.tasks = [];

		const handler = mockPi.handlers.get("session_before_compact")!;
		handler({} as unknown, {} as ExtensionContext);

		expect(mockPi.appendedEntries).toHaveLength(1);
		const entry = mockPi.appendedEntries[0]!;
		expect(entry.customType).toBe(TODO_SNAPSHOT_CUSTOM_TYPE);

		// The snapshot must record an empty tasks array (not undefined / missing).
		const snapshot = entry.data as { version: number; details: { tasks: Task[] } };
		expect(snapshot.details.tasks).toEqual([]);
	});

	it("does not return a compaction result (returns void)", () => {
		todoStore.tasks = [makeTask({ id: "t1" })];

		const handler = mockPi.handlers.get("session_before_compact")!;
		// Must be void/undefined — never a { compaction: ... } object that would
		// replace Pi's default LLM summary and file-tracking metadata.
		const result = handler({} as unknown, {} as ExtensionContext);
		expect(result).toBeUndefined();
	});

	it("always appends exactly one custom entry per handler call", () => {
		todoStore.tasks = [makeTask({ id: "t1" }), makeTask({ id: "t2", content: "B" })];

		const handler = mockPi.handlers.get("session_before_compact")!;
		handler({} as unknown, {} as ExtensionContext);

		// One call → one entry.
		expect(mockPi.appendedEntries).toHaveLength(1);
	});
});

// ── session_compact ────────────────────────────────────────────────────────

describe("compaction lifecycle: session_compact", () => {
	let mockPi: MockPiResult;

	beforeEach(() => {
		todoStore.tasks = [];
		todoStore.idCounter = 0;
		mockPi = buildMockPi();
		todoExtension(mockPi.pi);
	});

	it("refreshes both pi-todo and pi-todo-compact widget keys when UI is available", async () => {
		// Empty branch → pi-todo is cleared via setWidget, pi-todo-compact
		// shows the "no tasks" empty state via setWidget.
		const { ctx, widgetCalls } = buildCtx([], true);

		const handler = mockPi.handlers.get("session_compact")!;
		await handler({} as unknown, ctx);

		const keys = widgetCalls.map((w) => w.key);
		expect(keys).toContain("pi-todo");
		expect(keys).toContain(COMPACT_WIDGET_KEY);
	});


	it("refreshes active legacy status and compact widget after compaction", async () => {
		const tasks = [makeTask({ id: "t-active", content: "Active", status: "in_progress" })];
		const snapshot = createTodoSnapshot({ tasks });
		const branch = [{ type: "custom", customType: TODO_SNAPSHOT_CUSTOM_TYPE, data: snapshot }];

		const { ctx, widgetCalls, statusCalls } = buildCtx(branch, true);

		const handler = mockPi.handlers.get("session_compact")!;
		await handler({} as unknown, ctx);

		expect(statusCalls).toContainEqual({ key: "pi-todo", text: "\uf111 1 active" });
		const compactCalls = widgetCalls.filter((w) => w.key === COMPACT_WIDGET_KEY);
		expect(compactCalls).toHaveLength(1);
	});

	it("is a no-op for widget calls when ctx.hasUI is false", async () => {
		const { ctx, widgetCalls } = buildCtx([], false);

		const handler = mockPi.handlers.get("session_compact")!;
		await handler({} as unknown, ctx);

		expect(widgetCalls).toHaveLength(0);
	});

	it("does not emit task-completion notifications during reconstruction", async () => {
		// Branch contains already-completed tasks. Reconstruction must not fire
		// celebrations (they happened in a previous session, before compaction).
		const completedTasks = [
			makeTask({ id: "t1", status: "completed" }),
			makeTask({ id: "t2", content: "B", status: "completed" }),
		];
		const snapshot = createTodoSnapshot({ tasks: completedTasks });
		const branch = [{ type: "custom", customType: TODO_SNAPSHOT_CUSTOM_TYPE, data: snapshot }];

		const { ctx, notifications } = buildCtx(branch, true);

		const handler = mockPi.handlers.get("session_compact")!;
		await handler({} as unknown, ctx);

		expect(notifications).toHaveLength(0);
	});

	it("reconstructs the store from a pi-todo:snapshot in the compacted branch", async () => {
		const tasks = [makeTask({ id: "t-snap", content: "Survived compaction" })];
		const snapshot = createTodoSnapshot({ tasks });
		const branch = [{ type: "custom", customType: TODO_SNAPSHOT_CUSTOM_TYPE, data: snapshot }];

		const { ctx } = buildCtx(branch, false);

		const handler = mockPi.handlers.get("session_compact")!;
		await handler({} as unknown, ctx);

		expect(todoStore.tasks).toHaveLength(1);
		expect(todoStore.tasks[0]?.id).toBe("t-snap");
	});

	it("registers pi-todo-compact above-editor widget exactly once per reconstruction", async () => {
		const tasks = [makeTask({ id: "t1", content: "A task" })];
		const snapshot = createTodoSnapshot({ tasks });
		const branch = [{ type: "custom", customType: TODO_SNAPSHOT_CUSTOM_TYPE, data: snapshot }];

		const { ctx, widgetCalls } = buildCtx(branch, true);

		const handler = mockPi.handlers.get("session_compact")!;
		await handler({} as unknown, ctx);

		const compactCalls = widgetCalls.filter((w) => w.key === COMPACT_WIDGET_KEY);
		// Exactly one setWidget call per compact key per reconstruction — no duplicates.
		expect(compactCalls).toHaveLength(1);
	});

	it("clears store tasks when the branch has no todo replay sources", async () => {
		// Pre-populate store to verify it is cleared by session_compact.
		todoStore.tasks = [makeTask({ id: "stale" })];

		// Empty branch: no todo tool results, no snapshot.
		const { ctx } = buildCtx([], false);

		const handler = mockPi.handlers.get("session_compact")!;
		await handler({} as unknown, ctx);

		expect(todoStore.tasks).toEqual([]);
	});
});
