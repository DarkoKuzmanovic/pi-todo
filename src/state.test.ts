import { TodoStore, reconstructState, store as singletonStore } from "./state";
// ── Helper ──

function makeTask(overrides: Partial<import("./types").Task> = {}): import("./types").Task {
	return {
		id: "t1",
		content: "Test task",
		status: "pending",
		priority: "medium",
		createdAt: 1000,
		...overrides,
	};
}

// ── TodoStore ──

describe("TodoStore", () => {
	let store: TodoStore;

	beforeEach(() => {
		store = new TodoStore();
	});

	describe("generateId", () => {
		it("generates sequential IDs starting from t1", () => {
			expect(store.generateId()).toBe("t1");
			expect(store.generateId()).toBe("t2");
			expect(store.generateId()).toBe("t3");
		});

		it("resets counter after syncIdCounter", () => {
			store.setTasks([makeTask({ id: "t10" })]);
			store.syncIdCounter();
			expect(store.generateId()).toBe("t11");
		});
	});

	describe("syncIdCounter", () => {
		it("scans tasks and sets counter past the highest tNNN ID", () => {
			store.setTasks([
				makeTask({ id: "t3" }),
				makeTask({ id: "t7" }),
				makeTask({ id: "t5" }),
			]);
			store.syncIdCounter();
			expect(store.generateId()).toBe("t8");
		});

		it("handles tasks with non-standard IDs without crashing", () => {
			store.setTasks([
				makeTask({ id: "custom-id" }),
				makeTask({ id: "t2" }),
			]);
			store.syncIdCounter();
			expect(store.generateId()).toBe("t3");
		});

		it("handles empty task list gracefully", () => {
			store.setTasks([]);
			store.syncIdCounter();
			expect(store.generateId()).toBe("t1");
		});
	});

	describe("setTasks", () => {
		it("sets the task list", () => {
			const tasks = [makeTask({ id: "t1" }), makeTask({ id: "t2" })];
			store.setTasks(tasks);
			expect(store.tasks).toEqual(tasks);
		});

		it("replaces the entire task list", () => {
			store.setTasks([makeTask({ id: "t1" })]);
			store.setTasks([makeTask({ id: "t2" })]);
			expect(store.tasks).toHaveLength(1);
			expect(store.tasks[0].id).toBe("t2");
		});

		it("accepts an empty list", () => {
			store.setTasks([makeTask({ id: "t1" })]);
			store.setTasks([]);
			expect(store.tasks).toEqual([]);
		});
	});

	describe("activeTasks", () => {
		it("returns only non-completed tasks", () => {
			store.setTasks([
				makeTask({ id: "t1", status: "pending" }),
				makeTask({ id: "t2", status: "in_progress" }),
				makeTask({ id: "t3", status: "completed" }),
				makeTask({ id: "t4", status: "pending" }),
			]);
			const active = store.activeTasks();
			expect(active).toHaveLength(3);
			expect(active.map((t) => t.id)).toEqual(["t1", "t2", "t4"]);
		});

		it("returns empty array when all tasks are completed", () => {
			store.setTasks([
				makeTask({ id: "t1", status: "completed" }),
				makeTask({ id: "t2", status: "completed" }),
			]);
			expect(store.activeTasks()).toEqual([]);
		});

		it("returns empty array when no tasks exist", () => {
			expect(store.activeTasks()).toEqual([]);
		});
	});

	describe("activeTasks excludes tombstones", () => {
		it("excludes tasks with deletedAt set, even if status is not completed", () => {
			store.setTasks([
				makeTask({ id: "t1", status: "pending" }),
				makeTask({ id: "t2", status: "pending", deletedAt: Date.now() }),
				makeTask({ id: "t3", status: "in_progress" }),
			]);
			expect(store.activeTasks().map((t) => t.id)).toEqual(["t1", "t3"]);
		});

		it("excludes tombstoned completed tasks", () => {
			store.setTasks([
				makeTask({ id: "t1", status: "completed" }),
				makeTask({ id: "t2", status: "completed", deletedAt: 1 }),
			]);
			expect(store.activeTasks()).toHaveLength(0);
		});
	});

	describe("removeByIds", () => {
		it("soft-deletes tasks by stamping deletedAt and retaining them", () => {
			store.setTasks([
				makeTask({ id: "t1" }),
				makeTask({ id: "t2" }),
				makeTask({ id: "t3" }),
			]);
			const before = Date.now();
			const removed = store.removeByIds(["t1", "t3"]);
			expect(removed).toHaveLength(2);
			expect(removed).toEqual(["t1", "t3"]);
			// Tasks are retained, not erased.
			expect(store.tasks).toHaveLength(3);
			const t1 = store.tasks.find((t) => t.id === "t1");
			expect(t1?.deletedAt).toBeGreaterThanOrEqual(before);
			const t3 = store.tasks.find((t) => t.id === "t3");
			expect(t3?.deletedAt).toBeGreaterThanOrEqual(before);
			// Unremoved task is untouched.
			const t2 = store.tasks.find((t) => t.id === "t2");
			expect(t2?.deletedAt).toBeUndefined();
		});

		it("returns empty array when no IDs match", () => {
			store.setTasks([makeTask({ id: "t1" })]);
			const removed = store.removeByIds(["nonexistent"]);
			expect(removed).toEqual([]);
			expect(store.tasks).toHaveLength(1);
			expect(store.tasks[0].deletedAt).toBeUndefined();
		});

		it("handles empty IDs array", () => {
			store.setTasks([makeTask({ id: "t1" })]);
			const removed = store.removeByIds([]);
			expect(removed).toEqual([]);
			expect(store.tasks).toHaveLength(1);
		});

		it("handles duplicate IDs in remove list (stamps once)", () => {
			store.setTasks([
				makeTask({ id: "t1" }),
				makeTask({ id: "t2" }),
			]);
			const removed = store.removeByIds(["t1", "t1"]);
			expect(removed).toHaveLength(1);
			expect(removed).toEqual(["t1"]);
			expect(store.tasks).toHaveLength(2);
		});

		it("re-removing a tombstoned id is a no-op and not counted", () => {
			store.setTasks([
				makeTask({ id: "t1" }),
				makeTask({ id: "t2" }),
			]);
			const first = store.removeByIds(["t1"]);
			expect(first).toEqual(["t1"]);
			const second = store.removeByIds(["t1"]);
			expect(second).toEqual([]);
			expect(store.tasks).toHaveLength(2);
		});
	});

	describe("applyStatusTransitions", () => {
		it("preserves createdAt for existing tasks", () => {
			store.setTasks([
				makeTask({ id: "t1", content: "Original", createdAt: 500 }),
			]);
			const input = [
				makeTask({ id: "t1", content: "Updated", createdAt: 9999 }),
			];
			store.applyStatusTransitions(input);
			expect(input[0].createdAt).toBe(500);
		});

		it("sets startedAt on first transition to in_progress", () => {
			const before = Date.now();
			const input = [
				makeTask({ id: "t1", status: "in_progress", createdAt: 500 }),
			];
			store.applyStatusTransitions(input);
			expect(input[0].startedAt).toBeGreaterThanOrEqual(before);
		});

		it("carries forward startedAt if already in_progress", () => {
			store.setTasks([
				makeTask({ id: "t1", status: "in_progress", createdAt: 500, startedAt: 600 }),
			]);
			const updated = [
				makeTask({ id: "t1", status: "in_progress", createdAt: 9999 }),
			];
			store.applyStatusTransitions(updated);
			expect(updated[0].startedAt).toBe(600);
		});

		it("sets completedAt on transition to completed", () => {
			const before = Date.now();
			const input = [
				makeTask({ id: "t1", status: "completed", createdAt: 500, startedAt: 600 }),
			];
			store.applyStatusTransitions(input);
			expect(input[0].completedAt).toBeGreaterThanOrEqual(before);
		});

		it("carries forward completedAt if already completed", () => {
			store.setTasks([
				makeTask({ id: "t1", status: "completed", createdAt: 500, startedAt: 600, completedAt: 700 }),
			]);
			const updated = [
				makeTask({ id: "t1", status: "completed", createdAt: 9999 }),
			];
			store.applyStatusTransitions(updated);
			expect(updated[0].completedAt).toBe(700);
		});

		it("clears completedAt when reverting from completed", () => {
			store.setTasks([
				makeTask({ id: "t1", status: "completed", createdAt: 500, completedAt: 700 }),
			]);
			const input = [
				makeTask({ id: "t1", status: "pending", createdAt: 9999 }),
			];
			store.applyStatusTransitions(input);
			expect(input[0].completedAt).toBeUndefined();
		});

		it("clears startedAt when reverting from in_progress to pending", () => {
			store.setTasks([
				makeTask({ id: "t1", status: "in_progress", createdAt: 500, startedAt: 600 }),
			]);
			const input = [
				makeTask({ id: "t1", status: "pending", createdAt: 9999 }),
			];
			store.applyStatusTransitions(input);
			expect(input[0].startedAt).toBe(600);
		});

		it("preserves already-set createdAt for brand-new tasks (no prev match)", () => {
			const before = Date.now();
			const input = [
				makeTask({ id: "t-new", createdAt: 42 }),
			];
			store.applyStatusTransitions(input);
			expect(input[0].createdAt).toBe(42);
		});

		it("does not mutate the input array in-place", () => {
			const input = [makeTask({ id: "t1", status: "in_progress" })];
			store.applyStatusTransitions(input);
			expect(input[0].startedAt).toBeGreaterThanOrEqual(0);
		});
	});

	describe("integration: reconstruct scenario", () => {
		it("maintains correct state after multiple write + remove cycles", () => {
			store.setTasks([
				makeTask({ id: "t1", content: "A" }),
				makeTask({ id: "t2", content: "B" }),
				makeTask({ id: "t3", content: "C" }),
			]);

			store.removeByIds(["t2"]);
			// Soft-delete retains t2 with deletedAt.
			expect(store.tasks.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);

			store.setTasks([
				makeTask({ id: "t1", content: "A" }),
				makeTask({ id: "t4", content: "D" }),
			]);
			expect(store.tasks.map((t) => t.id)).toEqual(["t1", "t4"]);
		});
	});
});

describe("reconstructState", () => {
	it("clears existing singleton state when getBranch throws", () => {
		singletonStore.setTasks([makeTask({ id: "t1" })]);

		expect(() =>
			reconstructState({
				sessionManager: {
					getBranch() {
						throw new Error("branch unavailable");
					},
				},
			} as Parameters<typeof reconstructState>[0]),
		).not.toThrow();

		expect(singletonStore.tasks).toEqual([]);
	});


	it("clears singleton state when the latest todo result has malformed details", () => {
		const validEntry = {
			type: "message",
			message: {
				role: "toolResult",
				toolName: "todo_write",
				details: { tasks: [makeTask({ id: "t1" })] },
			},
		};
		const malformedEntry = {
			type: "message",
			message: {
				role: "toolResult",
				toolName: "todo_write",
				details: { notTasks: true },
			},
		};

		reconstructState({
			sessionManager: {
				getBranch() {
					return [validEntry, malformedEntry];
				},
			},
		} as Parameters<typeof reconstructState>[0]);

		expect(singletonStore.tasks).toEqual([]);
	});


	it("clears singleton state when latest todo result has a non-array tasks field", () => {
		const validEntry = {
			type: "message",
			message: {
				role: "toolResult",
				toolName: "todo_write",
				details: { tasks: [makeTask({ id: "t1" })] },
			},
		};
		const malformedEntry = {
			type: "message",
			message: {
				role: "toolResult",
				toolName: "todo_write",
				details: { tasks: "bad" },
			},
		};

		reconstructState({
			sessionManager: {
				getBranch() {
					return [validEntry, malformedEntry];
				},
			},
		} as Parameters<typeof reconstructState>[0]);

		expect(singletonStore.tasks).toEqual([]);
	});
});