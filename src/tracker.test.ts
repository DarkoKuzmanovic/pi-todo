import { describe, it, expect } from "vitest";
import { TaskTracker } from "./tracker";
import type { Task } from "./types";

// ── Helper ──

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

// ── TaskTracker ──

describe("TaskTracker", () => {
	describe("reconstructFromDetails", () => {
		it("returns false for null details", () => {
			const tracker = new TaskTracker();
			expect(tracker.reconstructFromDetails(null)).toBe(false);
		});

		it("returns false for details without tasks array", () => {
			const tracker = new TaskTracker();
			expect(tracker.reconstructFromDetails({})).toBe(false);
		});

		it("returns false when tasks are identical to current state", () => {
			const tracker = new TaskTracker();
			const tasks = [makeTask()];
			tracker.reconstructFromDetails({ tasks });
			expect(tracker.reconstructFromDetails({ tasks })).toBe(false);
		});

		it("returns true and caches tasks from valid details", () => {
			const tracker = new TaskTracker();
			const tasks = [makeTask({ id: "t1" }), makeTask({ id: "t2" })];
			expect(tracker.reconstructFromDetails({ tasks })).toBe(true);
			expect(tracker.tasks).toHaveLength(2);
		});

		it("filters out entries without a string id", () => {
			const tracker = new TaskTracker();
			const tasks = [{ id: "t1", content: "ok" }, { content: "nope" }];
			expect(tracker.reconstructFromDetails({ tasks })).toBe(true);
			expect(tracker.tasks).toHaveLength(1);
			expect(tracker.tasks[0].id).toBe("t1");
		});

		it("defaults invalid status to pending", () => {
			const tracker = new TaskTracker();
			const tasks = [{ id: "t1", content: "x", status: "bogus" }];
			tracker.reconstructFromDetails({ tasks });
			expect(tracker.tasks[0].status).toBe("pending");
		});

		it("defaults invalid priority to medium", () => {
			const tracker = new TaskTracker();
			const tasks = [{ id: "t1", content: "x", priority: "urgent" }];
			tracker.reconstructFromDetails({ tasks });
			expect(tracker.tasks[0].priority).toBe("medium");
		});
	});

	describe("count getters", () => {
		it("totalCount returns total number of cached tasks", () => {
			const tracker = new TaskTracker();
			const tasks = [
				makeTask({ id: "t1", status: "pending" }),
				makeTask({ id: "t2", status: "in_progress" }),
				makeTask({ id: "t3", status: "completed" }),
			];
			tracker.reconstructFromDetails({ tasks });
			expect(tracker.totalCount).toBe(3);
		});

		it("pendingCount returns only pending tasks", () => {
			const tracker = new TaskTracker();
			const tasks = [
				makeTask({ id: "t1", status: "pending" }),
				makeTask({ id: "t2", status: "in_progress" }),
				makeTask({ id: "t3", status: "completed" }),
				makeTask({ id: "t4", status: "pending" }),
			];
			tracker.reconstructFromDetails({ tasks });
			expect(tracker.pendingCount).toBe(2);
		});

		it("completedCount returns only completed tasks", () => {
			const tracker = new TaskTracker();
			const tasks = [
				makeTask({ id: "t1", status: "pending" }),
				makeTask({ id: "t2", status: "completed" }),
				makeTask({ id: "t3", status: "completed" }),
			];
			tracker.reconstructFromDetails({ tasks });
			expect(tracker.completedCount).toBe(2);
		});
	});

	describe("activeTask", () => {
		it("returns the first in_progress task", () => {
			const tracker = new TaskTracker();
			const tasks = [
				makeTask({ id: "t1", status: "pending" }),
				makeTask({ id: "t2", status: "in_progress" }),
				makeTask({ id: "t3", status: "in_progress" }),
			];
			tracker.reconstructFromDetails({ tasks });
			expect(tracker.activeTask?.id).toBe("t2");
		});

		it("returns undefined when no task is in_progress", () => {
			const tracker = new TaskTracker();
			const tasks = [
				makeTask({ id: "t1", status: "pending" }),
				makeTask({ id: "t2", status: "completed" }),
			];
			tracker.reconstructFromDetails({ tasks });
			expect(tracker.activeTask).toBeUndefined();
		});
	});

	describe("diff — transition detection", () => {
		it("detects newly created tasks", () => {
			const tracker = new TaskTracker();
			tracker.reconstructFromDetails({ tasks: [] });
			tracker.reconstructFromDetails({
				tasks: [makeTask({ id: "t1", status: "pending" })],
			});
			const d = tracker.diff();
			expect(d.created).toHaveLength(1);
			expect(d.created[0].id).toBe("t1");
			expect(d.started).toHaveLength(0);
			expect(d.completed).toHaveLength(0);
			expect(d.removedIds).toHaveLength(0);
		});

		it("detects started transitions (pending → in_progress)", () => {
			const tracker = new TaskTracker();
			tracker.reconstructFromDetails({
				tasks: [makeTask({ id: "t1", status: "pending" })],
			});
			tracker.reconstructFromDetails({
				tasks: [makeTask({ id: "t1", status: "in_progress" })],
			});
			const d = tracker.diff();
			expect(d.started).toHaveLength(1);
			expect(d.started[0].id).toBe("t1");
			expect(d.created).toHaveLength(0);
			expect(d.completed).toHaveLength(0);
		});

		it("detects completed transitions (in_progress → completed)", () => {
			const tracker = new TaskTracker();
			tracker.reconstructFromDetails({
				tasks: [makeTask({ id: "t1", status: "in_progress" })],
			});
			tracker.reconstructFromDetails({
				tasks: [makeTask({ id: "t1", status: "completed" })],
			});
			const d = tracker.diff();
			expect(d.completed).toHaveLength(1);
			expect(d.completed[0].id).toBe("t1");
			expect(d.started).toHaveLength(0);
		});

		it("detects removed task IDs", () => {
			const tracker = new TaskTracker();
			tracker.reconstructFromDetails({
				tasks: [
					makeTask({ id: "t1", status: "pending" }),
					makeTask({ id: "t2", status: "pending" }),
				],
			});
			tracker.reconstructFromDetails({
				tasks: [makeTask({ id: "t2", status: "pending" })],
			});
			const d = tracker.diff();
			expect(d.removedIds).toEqual(["t1"]);
		});

		it("reports correct total/active/done counts in diff result", () => {
			const tracker = new TaskTracker();
			tracker.reconstructFromDetails({
				tasks: [
					makeTask({ id: "t1", status: "in_progress" }),
					makeTask({ id: "t2", status: "pending" }),
				],
			});
			tracker.reconstructFromDetails({
				tasks: [
					makeTask({ id: "t1", status: "completed" }),
					makeTask({ id: "t2", status: "in_progress" }),
					makeTask({ id: "t3", status: "pending" }),
				],
			});
			const d = tracker.diff();
			expect(d.total).toBe(3);
			expect(d.active).toBe(1);
			expect(d.done).toBe(1);
		});

		it("does not report status unchanged as a transition", () => {
			const tracker = new TaskTracker();
			tracker.reconstructFromDetails({
				tasks: [makeTask({ id: "t1", status: "pending" })],
			});
			// Same status, different content — not a status transition
			tracker.reconstructFromDetails({
				tasks: [makeTask({ id: "t1", status: "pending", content: "updated" })],
			});
			const d = tracker.diff();
			expect(d.created).toHaveLength(0);
			expect(d.started).toHaveLength(0);
			expect(d.completed).toHaveLength(0);
			expect(d.removedIds).toHaveLength(0);
		});
	});

	describe("formatElapsed — deterministic with injectable clock", () => {
		it("shows seconds for sub-minute elapsed time", () => {
			const clock = () => 5000; // 5 seconds after epoch 0
			const tracker = new TaskTracker(clock);
			const task = makeTask({ startedAt: 1000, completedAt: 5000, status: "completed" });
			expect(tracker.formatElapsed(task)).toBe("4s");
		});

		it("shows minutes and seconds for sub-hour elapsed time", () => {
			const clock = () => 125_000; // 2m 5s
			const tracker = new TaskTracker(clock);
			const task = makeTask({ startedAt: 0, status: "in_progress" });
			expect(tracker.formatElapsed(task)).toBe("2m 5s");
		});

		it("shows hours and minutes for longer durations", () => {
			const clock = () => 3_780_000; // 1h 3m
			const tracker = new TaskTracker(clock);
			const task = makeTask({ startedAt: 0, status: "in_progress" });
			expect(tracker.formatElapsed(task)).toBe("1h 3m");
		});

		it("falls back to createdAt when startedAt is undefined", () => {
			const clock = () => 30_000; // 30s after createdAt
			const tracker = new TaskTracker(clock);
			const task = makeTask({ createdAt: 0, startedAt: undefined, status: "pending" });
			expect(tracker.formatElapsed(task)).toBe("30s");
		});

		it("uses completedAt for completed tasks instead of clock", () => {
			const clock = () => 999_999; // should NOT be used
			const tracker = new TaskTracker(clock);
			const task = makeTask({
				startedAt: 0,
				completedAt: 90_000, // 1m 30s
				status: "completed",
			});
			expect(tracker.formatElapsed(task)).toBe("1m 30s");
		});

		it("returns 'now' for negative elapsed time", () => {
			const clock = () => 500;
			const tracker = new TaskTracker(clock);
			const task = makeTask({ startedAt: 1000, status: "in_progress" });
			expect(tracker.formatElapsed(task)).toBe("now");
		});

		it("uses default Date.now when no clock is provided (smoke)", () => {
			const tracker = new TaskTracker();
			const task = makeTask({
				startedAt: Date.now() - 1000,
				status: "in_progress",
			});
			const result = tracker.formatElapsed(task);
			// Should be either "1s" or "0s" depending on exact timing
			expect(result).toMatch(/^\d+s$/);
		});
	});
});
