import { describe, it, expect, beforeEach } from "vitest";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createTodoSnapshot, TODO_SNAPSHOT_CUSTOM_TYPE } from "./replay";
import { TodoRuntime } from "./runtime";
import { store as todoStore, reconstructState } from "./state";
import type { Task } from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────────

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

/** Build a mock ctx whose getBranch returns the given array. */
function mockCtx(branch: readonly unknown[]): ExtensionContext {
	return {
		hasUI: false,
		sessionManager: {
			getBranch() {
				return branch;
			},
		},
	} as unknown as ExtensionContext;
}


// ── Symmetry scenarios ──────────────────────────────────────────────────────

describe("store / tracker symmetry", () => {
	let runtime: TodoRuntime;

	beforeEach(() => {
		runtime = new TodoRuntime();
		todoStore.tasks = [];
		todoStore.idCounter = 0;
	});

	it("both store and tracker are empty for an empty branch", () => {
		const ctx = mockCtx([]);
		reconstructState(ctx);
		runtime.reconstructFromSession([], ctx);
		expect(todoStore.tasks).toEqual([]);
		expect(runtime.tracker.tasks.map((t) => t.id)).toEqual([]);
	});

	it("both store and tracker are empty when getBranch throws", () => {
		todoStore.setTasks([makeTask({ id: "t1" })]);
		runtime.tracker.reconstructFromDetails({ tasks: [makeTask({ id: "t1" })] });

		const throwingCtx = {
			hasUI: false,
			sessionManager: {
				getBranch() {
					throw new Error("branch unavailable");
				},
			},
		} as unknown as ExtensionContext;

		expect(() => reconstructState(throwingCtx)).not.toThrow();
		expect(todoStore.tasks).toEqual([]);

		expect(() => runtime.reconstructFromSession([], throwingCtx)).not.toThrow();
		expect(runtime.tracker.tasks).toEqual([]);
	});

	it("both store and tracker reconstruct from a valid pi-todo:snapshot custom entry", () => {
		const snapshotData = createTodoSnapshot({
			tasks: [makeTask({ id: "t-snap", content: "From snapshot" })],
		});
		const customEntry = {
			type: "custom",
			customType: TODO_SNAPSHOT_CUSTOM_TYPE,
			data: snapshotData,
		};
		const branch = [customEntry];
		const ctx = mockCtx(branch);

		reconstructState(ctx);
		runtime.reconstructFromSession(branch, ctx);

		expect(todoStore.tasks).toHaveLength(1);
		expect(todoStore.tasks[0].id).toBe("t-snap");
		expect(runtime.tracker.tasks).toHaveLength(1);
		expect(runtime.tracker.tasks[0].id).toBe("t-snap");
	});

	it("both store and tracker prefer later tool result over earlier snapshot", () => {
		const snapshotData = createTodoSnapshot({
			tasks: [makeTask({ id: "t-snap" })],
		});
		const customEntry = {
			type: "custom",
			customType: TODO_SNAPSHOT_CUSTOM_TYPE,
			data: snapshotData,
		};
		const toolEntry = {
			type: "message",
			message: {
				role: "toolResult",
				toolName: "todo_write",
				details: { tasks: [makeTask({ id: "t-tool" })] },
			},
		};
		const branch = [customEntry, toolEntry];
		const ctx = mockCtx(branch);

		reconstructState(ctx);
		runtime.reconstructFromSession(branch, ctx);

		expect(todoStore.tasks[0].id).toBe("t-tool");
		expect(runtime.tracker.tasks[0].id).toBe("t-tool");
	});

	it("both store and tracker clear when latest replay data is malformed", () => {
		todoStore.setTasks([makeTask({ id: "t1" })]);
		runtime.tracker.reconstructFromDetails({ tasks: [makeTask({ id: "t1" })] });

		const validEntry = {
			type: "message",
			message: {
				role: "toolResult",
				toolName: "todo_write",
				details: { tasks: [makeTask({ id: "t-valid" })] },
			},
		};
		const badSnapshot = {
			type: "custom",
			customType: TODO_SNAPSHOT_CUSTOM_TYPE,
			data: { version: 1, notDetails: true },
		};
		const branch = [validEntry, badSnapshot];
		const ctx = mockCtx(branch);

		reconstructState(ctx);
		runtime.reconstructFromSession(branch, ctx);

		expect(todoStore.tasks).toEqual([]);
		expect(runtime.tracker.tasks).toEqual([]);
	});


	it("both store and tracker clear malformed task items inside a tasks array", () => {
		todoStore.setTasks([makeTask({ id: "t1" })]);
		runtime.tracker.reconstructFromDetails({ tasks: [makeTask({ id: "t1" })] });

		const malformedEntry = {
			type: "message",
			message: {
				role: "toolResult",
				toolName: "todo_write",
				details: { tasks: [{ id: 123 }] },
			},
		};
		const branch = [malformedEntry];
		const ctx = mockCtx(branch);

		reconstructState(ctx);
		runtime.reconstructFromSession(branch, ctx);

		expect(todoStore.tasks).toEqual([]);
		expect(runtime.tracker.tasks).toEqual([]);
	});

	it("both store and tracker clear when tool-result details are malformed", () => {
		todoStore.setTasks([makeTask({ id: "t1" })]);
		runtime.tracker.reconstructFromDetails({ tasks: [makeTask({ id: "t1" })] });

		const validEntry = {
			type: "message",
			message: {
				role: "toolResult",
				toolName: "todo_write",
				details: { tasks: [makeTask({ id: "t-valid" })] },
			},
		};
		const badEntry = {
			type: "message",
			message: {
				role: "toolResult",
				toolName: "todo_write",
				details: { tasks: "not-an-array" },
			},
		};
		const branch = [validEntry, badEntry];
		const ctx = mockCtx(branch);

		reconstructState(ctx);
		runtime.reconstructFromSession(branch, ctx);

		expect(todoStore.tasks).toEqual([]);
		expect(runtime.tracker.tasks).toEqual([]);
	});
});

// ── reconstructState with replay source ─────────────────────────────────────

describe("reconstructState with replay source", () => {
	beforeEach(() => {
		todoStore.tasks = [];
		todoStore.idCounter = 0;
	});

	it("clears singleton state for an empty branch", () => {
		todoStore.setTasks([makeTask({ id: "t1" })]);
		reconstructState({
			sessionManager: { getBranch() { return []; } },
		} as Parameters<typeof reconstructState>[0]);
		expect(todoStore.tasks).toEqual([]);
	});

	it("reconstructs from a valid pi-todo:snapshot custom entry", () => {
		const snapshotData = createTodoSnapshot({
			tasks: [makeTask({ id: "t-snap", content: "From snapshot" })],
		});
		const customEntry = {
			type: "custom",
			customType: TODO_SNAPSHOT_CUSTOM_TYPE,
			data: snapshotData,
		};
		reconstructState({
			sessionManager: { getBranch() { return [customEntry]; } },
		} as Parameters<typeof reconstructState>[0]);
		expect(todoStore.tasks).toHaveLength(1);
		expect(todoStore.tasks[0].id).toBe("t-snap");
	});

	it("lets later todo_write override earlier custom snapshot", () => {
		const snapshotData = createTodoSnapshot({
			tasks: [makeTask({ id: "t-snap", content: "Snapshot" })],
		});
		const customEntry = {
			type: "custom",
			customType: TODO_SNAPSHOT_CUSTOM_TYPE,
			data: snapshotData,
		};
		const toolEntry = {
			type: "message",
			message: {
				role: "toolResult",
				toolName: "todo_write",
				details: { tasks: [makeTask({ id: "t-tool", content: "Tool" })] },
			},
		};
		reconstructState({
			sessionManager: { getBranch() { return [customEntry, toolEntry]; } },
		} as Parameters<typeof reconstructState>[0]);
		expect(todoStore.tasks).toHaveLength(1);
		expect(todoStore.tasks[0].id).toBe("t-tool");
	});

	it("clears state when latest replay source has malformed snapshot details", () => {
		todoStore.setTasks([makeTask({ id: "t1" })]);
		const validEntry = {
			type: "message",
			message: {
				role: "toolResult",
				toolName: "todo_write",
				details: { tasks: [makeTask({ id: "t-valid" })] },
			},
		};
		const badSnapshot = {
			type: "custom",
			customType: TODO_SNAPSHOT_CUSTOM_TYPE,
			data: { version: 1, notDetails: true },
		};
		reconstructState({
			sessionManager: { getBranch() { return [validEntry, badSnapshot]; } },
		} as Parameters<typeof reconstructState>[0]);
		expect(todoStore.tasks).toEqual([]);
	});

	it("clears state when latest replay source has malformed tool-result details", () => {
		todoStore.setTasks([makeTask({ id: "t1" })]);
		const validEntry = {
			type: "message",
			message: {
				role: "toolResult",
				toolName: "todo_write",
				details: { tasks: [makeTask({ id: "t-valid" })] },
			},
		};
		const badEntry = {
			type: "message",
			message: {
				role: "toolResult",
				toolName: "todo_write",
				details: { tasks: "not-an-array" },
			},
		};
		reconstructState({
			sessionManager: { getBranch() { return [validEntry, badEntry]; } },
		} as Parameters<typeof reconstructState>[0]);
		expect(todoStore.tasks).toEqual([]);
	});

	it("supports todo_remove as a replay source", () => {
		const removeEntry = {
			type: "message",
			message: {
				role: "toolResult",
				toolName: "todo_remove",
				details: { tasks: [makeTask({ id: "t-rem", content: "Kept" })] },
			},
		};
		reconstructState({
			sessionManager: { getBranch() { return [removeEntry]; } },
		} as Parameters<typeof reconstructState>[0]);
		expect(todoStore.tasks).toHaveLength(1);
		expect(todoStore.tasks[0].id).toBe("t-rem");
	});
});
