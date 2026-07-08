/**
 * Lifecycle tests for the M1-T3 compaction hooks registered in src/index.ts.
 *
 * Strategy: build a minimal mock ExtensionAPI that captures registered
 * event handlers and appendEntry calls, then invoke the handlers directly
 * to verify behavior without spinning up the full Pi runtime.
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import todoExtension, { runtime } from "./index";
import { createTodoSnapshot, TODO_SNAPSHOT_CUSTOM_TYPE } from "./replay";
import { store as todoStore } from "./state";
import { COMPACT_WIDGET_KEY } from "./compact-widget";
import type { Task } from "./types";
import { isTombstoned } from "./tombstone";

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

		expect(statusCalls).toContainEqual({ key: "pi-todo", text: "\uf111 1" });
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

// ── M3-T3: Tombstone persistence through compaction/replay ─────────────────

describe("M3-T3: tombstone persistence through compaction/replay", () => {
	let mockPi: MockPi;

	beforeEach(() => {
		todoStore.tasks = [];
		todoStore.idCounter = 0;
		mockPi = buildMockPi();
	});

	// ── Helper: make a task with a tombstone marker ─────────────────────

	function tombstoneTask(overrides: Partial<Task> = {}): Task {
		return {
			id: "tx",
			content: "Removed task",
			status: "pending",
			priority: "low",
			createdAt: 1000,
			deletedAt: 1700000000000,
			...overrides,
		};
	}

	function liveTask(overrides: Partial<Task> = {}): Task {
		return {
			id: "t1",
			content: "Live task",
			status: "pending",
			priority: "medium",
			createdAt: 2000,
			...overrides,
		};
	}
	// ── Helper: snapshot-only branch (mirrors e2e.test.ts) ───────────────

	function snapshotBranch(tasks: Task[]): readonly unknown[] {
		return [
			{
				type: "custom",
				customType: TODO_SNAPSHOT_CUSTOM_TYPE,
				data: createTodoSnapshot({ tasks }),
			},
		];
	}

	// ── 1. Tombstone survives session_before_compact → session_compact ──

	it("a tombstone survives session_before_compact → session_compact round-trip", async () => {
		const tx = tombstoneTask();
		const t1 = liveTask();
		todoStore.tasks = [tx, t1];

		// Seed the extension so session_before_compact/compact are registered
		await todoExtension(mockPi.pi);

		// Fire session_before_compact → append snapshot
		const beforeHandler = mockPi.handlers.get("session_before_compact");
		expect(beforeHandler).toBeTruthy();
		const { ctx: ctxBefore } = buildCtx([], false);
		await beforeHandler!({}, ctxBefore);

		const entries = mockPi.appendedEntries;
		expect(entries.length).toBe(1);
		expect(entries[0]?.customType).toBe(TODO_SNAPSHOT_CUSTOM_TYPE);
		const snapData = entries[0]?.data as { details: { tasks: Task[] } };
		expect(snapData.details.tasks.length).toBe(2);
		expect(snapData.details.tasks[0]?.deletedAt).toBe(1700000000000);
		expect(snapData.details.tasks[1]?.deletedAt).toBeUndefined();

		// Build a snapshot-only branch and fire session_compact
		const branch = snapshotBranch([tx, t1]);
		const { ctx } = buildCtx(branch, false);
		// Re-register to pick up the handler after reset
		mockPi.handlers.clear();
		await todoExtension(mockPi.pi);
		const compactHandler = mockPi.handlers.get("session_compact");
		expect(compactHandler).toBeTruthy();
		await compactHandler!({} as unknown, ctx);

		// Store has the tombstone with deletedAt intact
		expect(todoStore.tasks.length).toBe(2);
		expect(todoStore.tasks[0]?.deletedAt).toBe(1700000000000);
		expect(isTombstoned(todoStore.tasks[0]!)).toBe(true);
		expect(todoStore.tasks[1]?.deletedAt).toBeUndefined();
		expect(isTombstoned(todoStore.tasks[1]!)).toBe(false);

		// Tracker also has the tombstone (same extractTasks)
		const trackerTasks = [...runtime.tracker.tasks];
		expect(trackerTasks.length).toBe(2);
		expect(trackerTasks[0]?.deletedAt).toBe(1700000000000);
		expect(isTombstoned(trackerTasks[0]!)).toBe(true);
		expect(trackerTasks[1]?.deletedAt).toBeUndefined();
		expect(isTombstoned(trackerTasks[1]!)).toBe(false);

		// Store and tracker agree on the tombstoned set
		const storeTombstonedIds = todoStore.tasks.filter((t) => isTombstoned(t)).map((t) => t.id);
		const trackerTombstonedIds = trackerTasks.filter((t) => isTombstoned(t)).map((t) => t.id);
		expect(storeTombstonedIds).toEqual(trackerTombstonedIds);
		expect(storeTombstonedIds).toEqual(["tx"]);
	});

	// ── 2. Empty branch — store/tracker symmetric (no tombstones) ──────

	it("empty branch: store and tracker agree on empty set", async () => {
		await todoExtension(mockPi.pi);
		const { ctx } = buildCtx([], false);
		const handler = mockPi.handlers.get("session_compact")!;
		await handler({} as unknown, ctx);

		expect(todoStore.tasks).toEqual([]);
		expect([...runtime.tracker.tasks]).toEqual([]);
	});

	// ── 3. Snapshot-only — tombstone survives ──────────────────────────

	it("snapshot-only branch: tombstone reconstructs in store and tracker", async () => {
		const tx = tombstoneTask();
		await todoExtension(mockPi.pi);

		const branch = snapshotBranch([tx]);
		const { ctx } = buildCtx(branch, false);
		const handler = mockPi.handlers.get("session_compact")!;
		await handler({} as unknown, ctx);

		expect(todoStore.tasks.length).toBe(1);
		expect(todoStore.tasks[0]?.deletedAt).toBe(1700000000000);
		expect(isTombstoned(todoStore.tasks[0]!)).toBe(true);

		expect([...runtime.tracker.tasks].length).toBe(1);
		expect(isTombstoned([...runtime.tracker.tasks][0]!)).toBe(true);
	});

	// ── 4. Snapshot + later tool-result — latest wins ──────────────────

	it("snapshot + later tool-result: latest wins, store/tracker agree", async () => {
		const tOld = tombstoneTask({ id: "old" });
		const tNew = liveTask({ id: "new", content: "Latest only" });
		await todoExtension(mockPi.pi);

		// Branch: snapshot first (old tombstone), then a tool_result with new task
		const branch = [
			{
				type: "custom",
				customType: TODO_SNAPSHOT_CUSTOM_TYPE,
				data: createTodoSnapshot({ tasks: [tOld] }),
			},
			{
				type: "message",
				message: {
					role: "toolResult",
					toolName: "todo_write",
					details: { tasks: [tNew] },
				},
			},
		];
		const { ctx } = buildCtx(branch, false);
		const handler = mockPi.handlers.get("session_compact")!;
		await handler({} as unknown, ctx);

		// Latest (tool-result) wins: only tNew, no tombstone
		expect(todoStore.tasks.length).toBe(1);
		expect(todoStore.tasks[0]?.id).toBe("new");
		expect(todoStore.tasks[0]?.deletedAt).toBeUndefined();

		const trackerTasks = [...runtime.tracker.tasks];
		expect(trackerTasks.length).toBe(1);
		expect(trackerTasks[0]?.id).toBe("new");

		// Store and tracker agree
		expect(todoStore.tasks.map((t) => t.id)).toEqual(trackerTasks.map((t) => t.id));
	});

	// ── 5. Tool-result-only — tombstone from tool result survives ──────

	it("tool-result-only branch: tombstone preserves in store and tracker", async () => {
		const tx = tombstoneTask();
		await todoExtension(mockPi.pi);

		const branch = [
			{
				type: "message",
				message: {
					role: "toolResult",
					toolName: "todo_write",
					details: { tasks: [tx] },
				},
			},
		];
		const { ctx } = buildCtx(branch, false);
		const handler = mockPi.handlers.get("session_compact")!;
		await handler({} as unknown, ctx);

		expect(todoStore.tasks.length).toBe(1);
		expect(todoStore.tasks[0]?.deletedAt).toBe(1700000000000);
		expect(isTombstoned(todoStore.tasks[0]!)).toBe(true);

		expect([...runtime.tracker.tasks].length).toBe(1);
		expect(isTombstoned([...runtime.tracker.tasks][0]!)).toBe(true);
	});

	// ── 6. Malformed-latest — symmetric clear ──────────────────────────

	it("malformed-latest details: store and tracker clear symmetrically", async () => {
		const t1 = liveTask();
		// Pre-populate store so we can verify it gets cleared
		todoStore.tasks = [t1];
		await todoExtension(mockPi.pi);

		// Branch with a snapshot whose details is null/malformed
		const branch = [
			{
				type: "custom",
				customType: TODO_SNAPSHOT_CUSTOM_TYPE,
				data: { version: 1, details: null },
			},
		];
		const { ctx } = buildCtx(branch, false);
		const handler = mockPi.handlers.get("session_compact")!;
		await handler({} as unknown, ctx);

		// Store cleared (extractTasks returns null → falls back to [])
		expect(todoStore.tasks).toEqual([]);
		// Tracker also cleared (reconstructFromDetails returns false → stays at reset [])
		expect([...runtime.tracker.tasks]).toEqual([]);
	});
});
