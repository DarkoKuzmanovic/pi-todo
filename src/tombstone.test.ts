import { describe, it, expect } from "vitest";
import { isTombstoned, activeTasks } from "./tombstone";
import type { Task } from "./types";

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "t1",
		content: "Test",
		status: "pending",
		priority: "medium",
		createdAt: 0,
		...overrides,
	};
}

describe("isTombstoned", () => {
	it("returns false when deletedAt is undefined", () => {
		expect(isTombstoned(makeTask())).toBe(false);
	});

	it("returns true when deletedAt is set", () => {
		expect(isTombstoned(makeTask({ deletedAt: 1700000000000 }))).toBe(true);
	});

	it("returns true even when deletedAt is 0", () => {
		expect(isTombstoned(makeTask({ deletedAt: 0 }))).toBe(true);
	});
});

describe("activeTasks", () => {
	it("filters out tombstoned tasks", () => {
		const tasks = [
			makeTask({ id: "t1" }),
			makeTask({ id: "t2", deletedAt: 999 }),
			makeTask({ id: "t3" }),
		];
		expect(activeTasks(tasks).map((t) => t.id)).toEqual(["t1", "t3"]);
	});

	it("returns empty when all are tombstoned", () => {
		const tasks = [
			makeTask({ id: "t1", deletedAt: 1 }),
			makeTask({ id: "t2", deletedAt: 2 }),
		];
		expect(activeTasks(tasks)).toEqual([]);
	});

	it("returns all tasks when none are tombstoned", () => {
		const tasks = [makeTask({ id: "t1" }), makeTask({ id: "t2" })];
		expect(activeTasks(tasks)).toHaveLength(2);
	});
});
