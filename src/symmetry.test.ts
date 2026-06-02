import { describe, it, expect, beforeEach } from "vitest";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createTodoSnapshot, TODO_SNAPSHOT_CUSTOM_TYPE } from "./replay";
import { TodoRuntime } from "./runtime";
import { store as todoStore, reconstructState } from "./state";
import type { Task } from "./types";
import { extractTasks } from "./tracker";
import { activeTasks } from "./tombstone";
import { buildSystemPromptBlock, formatListForLLM } from "./prompt";
import { TodoViewComponent } from "./component";
import { updateCompactWidget, COMPACT_WIDGET_KEY } from "./compact-widget";
import { TaskTracker } from "./tracker";
import type { Theme } from "@earendil-works/pi-tui";

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

// ── M4 — rich-field symmetry matrix ────────────────────────────────────────────

describe("M4 rich-field symmetry matrix", () => {
	beforeEach(() => {
		todoStore.tasks = [];
		todoStore.idCounter = 0;
	});

	function makeRichTask(overrides: Partial<Task> = {}): Task {
		return {
			id: "t1",
			content: "Test task",
			status: "pending",
			priority: "medium",
			createdAt: 1000,
			description: "long reference notes",
			owner: "agent-1",
			activeForm: "doing something",
			metadata: { n: 42, b: true, s: "x" },
			...overrides,
		};
	}

	it("round-trip: snapshot + tool result agree on the rich fields across store and tracker", () => {
		const snapshotData = createTodoSnapshot({
			tasks: [makeRichTask()],
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
				details: { tasks: [makeRichTask({ id: "t-tool", description: "tool desc", owner: "tool-agent", activeForm: "tooling", metadata: { k: "v" } })] },
			},
		};
		const branch = [customEntry, toolEntry];
		const ctx = mockCtx(branch);

		reconstructState(ctx);
		const runtime = new TodoRuntime();
		runtime.reconstructFromSession(branch, ctx);

		// Latest wins — tool result overrides snapshot
		expect(todoStore.tasks).toHaveLength(1);
		expect(todoStore.tasks[0].id).toBe("t-tool");
		expect(todoStore.tasks[0].description).toBe("tool desc");
		expect(todoStore.tasks[0].owner).toBe("tool-agent");
		expect(todoStore.tasks[0].activeForm).toBe("tooling");
		expect(todoStore.tasks[0].metadata).toEqual({ k: "v" });

		// Tracker agrees with store
		expect(runtime.tracker.tasks[0].description).toBe("tool desc");
		expect(runtime.tracker.tasks[0].owner).toBe("tool-agent");
		expect(runtime.tracker.tasks[0].activeForm).toBe("tooling");
		expect(runtime.tracker.tasks[0].metadata).toEqual({ k: "v" });
	});

	it("empty branch: rich fields default to undefined in both store and tracker", () => {
		const ctx = mockCtx([]);
		reconstructState(ctx);
		const runtime = new TodoRuntime();
		runtime.reconstructFromSession([], ctx);

		expect(todoStore.tasks).toEqual([]);
		expect(runtime.tracker.tasks).toEqual([]);
	});

	it("snapshot-only: rich fields reconstruct from the custom pi-todo:snapshot entry", () => {
		const rich = makeRichTask({ id: "t-snap" });
		const snapshotData = createTodoSnapshot({
			tasks: [rich],
		});
		const customEntry = {
			type: "custom",
			customType: TODO_SNAPSHOT_CUSTOM_TYPE,
			data: snapshotData,
		};
		const branch = [customEntry];
		const ctx = mockCtx(branch);

		reconstructState(ctx);
		const runtime = new TodoRuntime();
		runtime.reconstructFromSession(branch, ctx);

		expect(todoStore.tasks).toHaveLength(1);
		expect(todoStore.tasks[0].description).toBe("long reference notes");
		expect(todoStore.tasks[0].owner).toBe("agent-1");
		expect(todoStore.tasks[0].activeForm).toBe("doing something");
		expect(todoStore.tasks[0].metadata).toEqual({ n: 42, b: true, s: "x" });

		expect(runtime.tracker.tasks[0].description).toBe("long reference notes");
		expect(runtime.tracker.tasks[0].owner).toBe("agent-1");
		expect(runtime.tracker.tasks[0].activeForm).toBe("doing something");
		expect(runtime.tracker.tasks[0].metadata).toEqual({ n: 42, b: true, s: "x" });
	});

	it("latest-wins: a later tool result overrides an earlier snapshot for ALL FOUR rich fields (description, owner, activeForm, metadata)", () => {
		// Snapshot seeds all 4 rich fields; tool result has none. The tool
		// result is the latest, so every rich field should be undefined
		// in BOTH store and tracker after replay.
		const snapshotData = createTodoSnapshot({
			tasks: [
				makeRichTask({
					id: "t1",
					description: "snap desc",
					owner: "snap-owner",
					activeForm: "snap-form",
					metadata: { k: "old" },
				}),
			],
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
				details: { tasks: [makeTask({ id: "t1", content: "Newer" })] },
			},
		};
		const branch = [customEntry, toolEntry];
		const ctx = mockCtx(branch);

		reconstructState(ctx);
		const runtime = new TodoRuntime();
		runtime.reconstructFromSession(branch, ctx);

		// Latest wins: tool result without rich fields should produce undefined
		// for all 4 rich fields in BOTH store and tracker.
		expect(todoStore.tasks).toHaveLength(1);
		expect(todoStore.tasks[0].description).toBeUndefined();
		expect(todoStore.tasks[0].owner).toBeUndefined();
		expect(todoStore.tasks[0].activeForm).toBeUndefined();
		expect(todoStore.tasks[0].metadata).toBeUndefined();

		expect(runtime.tracker.tasks[0].description).toBeUndefined();
		expect(runtime.tracker.tasks[0].owner).toBeUndefined();
		expect(runtime.tracker.tasks[0].activeForm).toBeUndefined();
		expect(runtime.tracker.tasks[0].metadata).toBeUndefined();
	});

	it("tool-result-only: rich fields are picked up from a tool result without a snapshot", () => {
		const toolEntry = {
			type: "message",
			message: {
				role: "toolResult",
				toolName: "todo_write",
				details: { tasks: [makeRichTask({ id: "t-tool" })] },
			},
		};
		const branch = [toolEntry];
		const ctx = mockCtx(branch);

		reconstructState(ctx);
		const runtime = new TodoRuntime();
		runtime.reconstructFromSession(branch, ctx);

		expect(todoStore.tasks).toHaveLength(1);
		expect(todoStore.tasks[0].description).toBe("long reference notes");
		expect(todoStore.tasks[0].owner).toBe("agent-1");
		expect(todoStore.tasks[0].activeForm).toBe("doing something");
		expect(todoStore.tasks[0].metadata).toEqual({ n: 42, b: true, s: "x" });

		expect(runtime.tracker.tasks[0].description).toBe("long reference notes");
		expect(runtime.tracker.tasks[0].owner).toBe("agent-1");
		expect(runtime.tracker.tasks[0].activeForm).toBe("doing something");
		expect(runtime.tracker.tasks[0].metadata).toEqual({ n: 42, b: true, s: "x" });
	});

	it("malformed-clear: a malformed latest replay entry clears ALL rich fields in BOTH store and tracker (M-b)", () => {
		// Seed store and tracker with a task carrying rich fields
		todoStore.setTasks([makeRichTask({ id: "t1" })]);
		const runtime = new TodoRuntime();
		runtime.tracker.reconstructFromDetails({ tasks: [makeRichTask({ id: "t1" })] });

		// Confirm baseline
		expect(todoStore.tasks[0].description).toBe("long reference notes");
		expect(todoStore.tasks[0].owner).toBe("agent-1");
		expect(todoStore.tasks[0].activeForm).toBe("doing something");
		expect(todoStore.tasks[0].metadata).toEqual({ n: 42, b: true, s: "x" });

		// Feed a malformed latest replay entry (bad snapshot details)
		const badSnapshot = {
			type: "custom",
			customType: TODO_SNAPSHOT_CUSTOM_TYPE,
			data: { version: 1, notDetails: true },
		};
		const branch = [badSnapshot];
		const ctx = mockCtx(branch);

		reconstructState(ctx);
		runtime.reconstructFromSession(branch, ctx);

		// M-b: ALL rich fields must be cleared (not just some). Store and
		// tracker are empty after the malformed snapshot, so no rich field
		// can survive as an orphan. The per-key loop below makes the M-b
		// invariant explicit: for any task in store or tracker, all 4 rich
		// fields must be undefined. The loop is vacuous on an empty store
		// but documents the M-b contract.
		expect(todoStore.tasks).toEqual([]);
		expect(runtime.tracker.tasks).toEqual([]);
		for (const t of todoStore.tasks) {
			expect(t.description).toBeUndefined();
			expect(t.owner).toBeUndefined();
			expect(t.activeForm).toBeUndefined();
			expect(t.metadata).toBeUndefined();
		}
		for (const t of runtime.tracker.tasks) {
			expect(t.description).toBeUndefined();
			expect(t.owner).toBeUndefined();
			expect(t.activeForm).toBeUndefined();
			expect(t.metadata).toBeUndefined();
		}
	});

	it("M-b per-key: a malformed metadata container on a snapshot keeps the task but explicitly clears description, owner, activeForm, and metadata in BOTH store and tracker", () => {
		// Seed: a snapshot that has the task with all 4 rich fields set.
		const seedSnapshot = createTodoSnapshot({
			tasks: [
				makeRichTask({
					id: "t1",
					description: "long reference notes",
					owner: "agent-1",
					activeForm: "doing something",
					metadata: { n: 42, b: true, s: "x" },
				}),
			],
		});
		const seedEntry = {
			type: "custom",
			customType: TODO_SNAPSHOT_CUSTOM_TYPE,
			data: seedSnapshot,
		};
		// Malformed metadata container: a string instead of an object. The
		// task itself is valid (has id, content, status) so the task
		// survives replay. The malformed metadata is dropped per the I1
		// defensive re-validation policy.
		const laterEntry = {
			type: "custom",
			customType: TODO_SNAPSHOT_CUSTOM_TYPE,
			data: {
				version: 1,
				details: {
					tasks: [
						{
							id: "t1",
							content: "Test",
							status: "pending",
							priority: "medium",
							createdAt: 1000,
							metadata: "not-an-object",
						},
					],
				},
			},
		};
		const branch = [seedEntry, laterEntry];
		const ctx = mockCtx(branch);

		reconstructState(ctx);
		const runtime = new TodoRuntime();
		runtime.reconstructFromSession(branch, ctx);

		// Task itself survives (latest-wins with the malformed metadata).
		expect(todoStore.tasks).toHaveLength(1);
		expect(todoStore.tasks[0].id).toBe("t1");
		expect(todoStore.tasks[0].content).toBe("Test");
		expect(todoStore.tasks[0].status).toBe("pending");
		// M-b per-key: ALL 4 rich fields are explicitly undefined on the
		// surviving task in BOTH store and tracker. This is the explicit
		// per-key assertion the M-b brief asked for.
		expect(todoStore.tasks[0].description).toBeUndefined();
		expect(todoStore.tasks[0].owner).toBeUndefined();
		expect(todoStore.tasks[0].activeForm).toBeUndefined();
		expect(todoStore.tasks[0].metadata).toBeUndefined();

		expect(runtime.tracker.tasks).toHaveLength(1);
		expect(runtime.tracker.tasks[0].id).toBe("t1");
		expect(runtime.tracker.tasks[0].description).toBeUndefined();
		expect(runtime.tracker.tasks[0].owner).toBeUndefined();
		expect(runtime.tracker.tasks[0].activeForm).toBeUndefined();
		expect(runtime.tracker.tasks[0].metadata).toBeUndefined();
	});
});

describe("M4 B1 metadata replay — type preservation + defensive re-validation", () => {
	it("type-preserving passthrough: each metadata value survives extractTasks with typeof intact (B1)", () => {
		const details = {
			tasks: [
				{
					id: "t1",
					content: "Test",
					status: "pending",
					priority: "medium",
					createdAt: 1000,
					metadata: { n: 42, b: true, s: "x" },
				},
			],
		};
		const extracted = extractTasks(details);
		expect(extracted).not.toBeNull();
		const meta = extracted![0].metadata!;
		expect(typeof meta.n).toBe("number");
		expect(meta.n).toBe(42);
		expect(typeof meta.b).toBe("boolean");
		expect(meta.b).toBe(true);
		expect(typeof meta.s).toBe("string");
		expect(meta.s).toBe("x");
	});

	it("defensive re-validation: malformed metadata keys are dropped per-key (no crash)", () => {
		const details = {
			tasks: [
				{
					id: "t1",
					content: "Test",
					status: "pending",
					priority: "medium",
					createdAt: 1000,
					metadata: {
						good: "survives",
						nested: { inner: true },
						arr: [1, 2, 3],
						nullVal: null,
						num: 99,
					},
				},
			],
		};
		const extracted = extractTasks(details);
		expect(extracted).not.toBeNull();
		const meta = extracted![0].metadata;
		expect(meta).toBeDefined();
		expect(meta!.good).toBe("survives");
		expect(meta!.num).toBe(99);
		expect(meta!).not.toHaveProperty("nested");
		expect(meta!).not.toHaveProperty("arr");
		expect(meta!).not.toHaveProperty("nullVal");
		expect(typeof meta).toBe("object");
	});

	it("malformed metadata container does not crash replay", () => {
		const details = {
			tasks: [
				{
					id: "t1",
					content: "Test",
					status: "pending",
					priority: "medium",
					createdAt: 1000,
					metadata: "not-an-object",
				},
			],
		};
		const extracted = extractTasks(details);
		expect(extracted).not.toBeNull();
		expect(extracted![0].metadata).toBeUndefined();
	});

	it("B1 round-trip: metadata with mixed types survives full store+tracker reconstruction", () => {
		const snapshotData = createTodoSnapshot({
			tasks: [
				{
					id: "t1",
					content: "Test",
					status: "pending",
					priority: "medium",
					createdAt: 1000,
					metadata: { n: 42, b: true, s: "x" },
				} as Task,
			],
		});
		const customEntry = {
			type: "custom",
			customType: TODO_SNAPSHOT_CUSTOM_TYPE,
			data: snapshotData,
		};
		const branch = [customEntry];
		const ctx = mockCtx(branch);

		reconstructState(ctx);
		const runtime = new TodoRuntime();
		runtime.reconstructFromSession(branch, ctx);

		const storeMeta = todoStore.tasks[0].metadata!;
		const trackerMeta = runtime.tracker.tasks[0].metadata!;

		expect(storeMeta.n).toBe(42);
		expect(typeof storeMeta.n).toBe("number");
		expect(storeMeta.b).toBe(true);
		expect(typeof storeMeta.b).toBe("boolean");
		expect(storeMeta.s).toBe("x");
		expect(typeof storeMeta.s).toBe("string");

		expect(trackerMeta.n).toBe(42);
		expect(typeof trackerMeta.n).toBe("number");
		expect(trackerMeta.b).toBe(true);
		expect(typeof trackerMeta.b).toBe("boolean");
		expect(trackerMeta.s).toBe("x");
		expect(typeof trackerMeta.s).toBe("string");
	});
});

describe("M4 I2 tombstone-with-rich-fields", () => {
	const testTheme: Theme = {
		fg: (_color: string, text: string) => text,
		bold: (text: string) => text,
		strikethrough: (text: string) => text,
	} as Theme;

	it("tombstone with rich fields is hidden from activeTasks, prompt, /todos, TodoViewComponent render (I2)", () => {
		const richTombstone: Task = {
			id: "t-gone",
			content: "Hidden task",
			status: "pending",
			priority: "low",
			createdAt: 1000,
			deletedAt: 5000,
			description: "secret notes",
			owner: "agent-1",
			activeForm: "doing hidden stuff",
			metadata: { secret: "shh" },
		};
		const liveTask: Task = {
			id: "t-live",
			content: "Visible task",
			status: "pending",
			priority: "medium",
			createdAt: 1000,
		};
		const allTasks = [richTombstone, liveTask];

		// Surface 1: activeTasks hides tombstone
		expect(activeTasks(allTasks)).toHaveLength(1);
		expect(activeTasks(allTasks)[0].id).toBe("t-live");

		// Surface 2: formatListForLLM (prompt block) hides tombstone
		// Set store.tasks directly to control what formatListForLLM reads
		todoStore.tasks = allTasks;
		const promptText = formatListForLLM();
		expect(promptText).toContain("Visible task");
		expect(promptText).not.toContain("Hidden task");
		expect(promptText).not.toContain("secret notes");
		expect(promptText).not.toContain("agent-1");
		expect(promptText).not.toContain("doing hidden stuff");
		expect(promptText).not.toContain("shh");

		// Surface 3+4: TodoViewComponent hides tombstone
		const view = new TodoViewComponent(allTasks, testTheme, () => {});
		const rendered = view.render(120).join("\n");
		expect(rendered).toContain("Visible task");
		expect(rendered).not.toContain("Hidden task");

		// Surface 5: compact widget hides tombstone. The compact widget
		// shows the active task (in_progress) inline; the tombstoned task
		// must not appear and its rich fields must not leak. The live
		// task is bumped to in_progress so the widget's active-task
		// branch is taken (else the widget just shows counts).
		const widgetTasks: Task[] = [
			{ ...liveTask, status: "in_progress" },
			richTombstone,
		];
		todoStore.tasks = widgetTasks;
		const widgetCalls: Array<{
			key: string;
			factory: (tui: { width?: number }, theme: Theme) => { render: (w?: number) => string[]; invalidate: () => void };
			options: unknown;
		}> = [];
		const widgetCtx = {
			hasUI: true,
			ui: {
				setWidget(key: string, content: unknown, options: unknown) {
					widgetCalls.push({
						key,
						factory: content as typeof widgetCalls[number]["factory"],
						options,
					});
				},
			},
		} as unknown as ExtensionContext;
		const widgetTracker = new TaskTracker();
		widgetTracker.reconstructFromDetails({ tasks: widgetTasks });
		updateCompactWidget(widgetCtx, widgetTracker);
		expect(widgetCalls[0]?.key).toBe(COMPACT_WIDGET_KEY);
		const widgetRenderable = widgetCalls[0]?.factory({ width: 120 }, testTheme);
		const widgetLines = widgetRenderable?.render(120) ?? [];
		const widgetText = widgetLines.join("\n");
		expect(widgetText).toContain("Visible task");
		expect(widgetText).not.toContain("Hidden task");
		expect(widgetText).not.toContain("secret notes");
		expect(widgetText).not.toContain("agent-1");
		expect(widgetText).not.toContain("doing hidden stuff");
		expect(widgetText).not.toContain("shh");

		// Restore the original allTasks to the store so the rich-field
		// canonical-retention check below sees the rich tombstone in the
		// store (not the widget-specific array which has a no-rich
		// active task).
		todoStore.tasks = allTasks;

		// The canonical store retains rich fields (they ride along)
		expect(todoStore.tasks[0].description).toBe("secret notes");
		expect(todoStore.tasks[0].owner).toBe("agent-1");
		expect(todoStore.tasks[0].activeForm).toBe("doing hidden stuff");
		expect(todoStore.tasks[0].metadata).toEqual({ secret: "shh" });

		todoStore.tasks = [];
	});

	it("I2: buildSystemPromptBlock also hides tombstone (5th surface: prompt block path)", () => {
		// Define richTombstone + liveTask inline because the previous test
		// scopes them to its own it() block.
		const richTombstone: Task = {
			id: "t-gone",
			content: "Hidden task",
			status: "pending",
			priority: "low",
			createdAt: 1000,
			deletedAt: 5000,
			description: "secret notes",
			owner: "agent-1",
			activeForm: "doing hidden stuff",
			metadata: { secret: "shh" },
		};
		const liveTask: Task = {
			id: "t-live",
			content: "Visible task",
			status: "in_progress",
			priority: "medium",
			createdAt: 1000,
		};
		const widgetTasks: Task[] = [liveTask, richTombstone];
		todoStore.tasks = widgetTasks;

		// buildSystemPromptBlock wraps formatListForLLM with the markdown
		// header. Both prompt paths and /todos non-UI path must hide the
		// tombstoned task and its rich fields.
		const block = buildSystemPromptBlock();
		expect(block).toBeTruthy();
		expect(block).toContain("Visible task");
		expect(block).not.toContain("Hidden task");
		expect(block).not.toContain("secret notes");
		expect(block).not.toContain("agent-1");
		expect(block).not.toContain("doing hidden stuff");
		// The metadata value ("shh") must not appear in the prompt block
		// either: metadata is hidden on every surface.
		expect(block).not.toContain("shh");

		todoStore.tasks = [];
	});

	it("I2: rich fields ride along in snapshot, preserved but hidden", () => {
		const richTombstone: Task = {
			id: "t-tomb",
			content: "Gone",
			status: "pending",
			priority: "low",
			createdAt: 1000,
			deletedAt: 5000,
			description: "audit notes",
			owner: "departed",
			activeForm: "was doing X",
			metadata: { audit: true },
		};
		const snapshotData = createTodoSnapshot({
			tasks: [richTombstone],
		});
		const customEntry = {
			type: "custom",
			customType: TODO_SNAPSHOT_CUSTOM_TYPE,
			data: snapshotData,
		};
		const branch = [customEntry];
		const ctx = mockCtx(branch);

		todoStore.tasks = [];
		reconstructState(ctx);
		const runtime = new TodoRuntime();
		runtime.reconstructFromSession(branch, ctx);

		// Store retains the tombstone with rich fields
		expect(todoStore.tasks).toHaveLength(1);
		expect(todoStore.tasks[0].id).toBe("t-tomb");
		expect(todoStore.tasks[0].description).toBe("audit notes");
		expect(todoStore.tasks[0].owner).toBe("departed");
		expect(todoStore.tasks[0].activeForm).toBe("was doing X");
		expect(todoStore.tasks[0].metadata).toEqual({ audit: true });

		// Tracker agrees
		expect(runtime.tracker.tasks[0].description).toBe("audit notes");
		expect(runtime.tracker.tasks[0].owner).toBe("departed");
		expect(runtime.tracker.tasks[0].activeForm).toBe("was doing X");
		expect(runtime.tracker.tasks[0].metadata).toEqual({ audit: true });

		// Hidden from all surfaces (use activeTasks)
		expect(activeTasks(todoStore.tasks)).toHaveLength(0);
	});
});