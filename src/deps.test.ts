import { describe, it, expect } from "vitest";
import {
	dedupeBlockedBy,
	findCycle,
	formatStrippedWarning,
	isBlocked,
	normalizeBlockedBy,
	validateDependencyGraph,
} from "./deps";
import { activeBlockerIds } from "./deps";
import { extractTasks } from "./tracker";
import type { Task } from "./types";

// ── Test helpers ───────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "t1",
		content: "Task",
		status: "pending",
		priority: "medium",
		createdAt: 0,
		...overrides,
	};
}

// ── dedupeBlockedBy ────────────────────────────────────────────────────────

describe("dedupeBlockedBy", () => {
	it("returns undefined for tasks without blockedBy", () => {
		expect(dedupeBlockedBy(makeTask())).toBeUndefined();
	});

	it("returns undefined for an empty blockedBy array", () => {
		expect(dedupeBlockedBy(makeTask({ blockedBy: [] }))).toBeUndefined();
	});

	it("strips self-dependencies", () => {
		const t = makeTask({ id: "t1", blockedBy: ["t1"] });
		expect(dedupeBlockedBy(t)).toBeUndefined();
	});

	it("deduplicates duplicate dependency IDs", () => {
		const t = makeTask({ id: "t1", blockedBy: ["t2", "t2", "t3"] });
		expect(dedupeBlockedBy(t)).toEqual(["t2", "t3"]);
	});

	it("ignores non-string entries", () => {
		const t = makeTask({ id: "t1", blockedBy: ["t2", 42, null, "t3"] as unknown as string[] });
		expect(dedupeBlockedBy(t)).toEqual(["t2", "t3"]);
	});

	it("returns undefined when only self/duplicates remain", () => {
		const t = makeTask({ id: "t1", blockedBy: ["t1", "t1"] });
		expect(dedupeBlockedBy(t)).toBeUndefined();
	});
});

// ── normalizeBlockedBy ─────────────────────────────────────────────────────

describe("normalizeBlockedBy", () => {
	it("strips unknown dependency IDs and reports them", () => {
		const tasks = [
			makeTask({ id: "t1", blockedBy: ["t99", "t2"] }),
			makeTask({ id: "t2" }),
		];
		const { tasks: cleaned, strippedUnknown } = normalizeBlockedBy(tasks);
		expect(cleaned[0]?.blockedBy).toEqual(["t2"]);
		expect(strippedUnknown).toEqual(["t99"]);
	});

	it("drops the blockedBy field entirely when all deps were stripped", () => {
		const tasks = [makeTask({ id: "t1", blockedBy: ["t99"] })];
		const { tasks: cleaned, strippedUnknown } = normalizeBlockedBy(tasks);
		expect(cleaned[0]?.blockedBy).toBeUndefined();
		expect(strippedUnknown).toEqual(["t99"]);
	});

	it("leaves tasks without blockedBy untouched", () => {
		const tasks = [makeTask({ id: "t1" }), makeTask({ id: "t2" })];
		const { tasks: cleaned, strippedUnknown } = normalizeBlockedBy(tasks);
		expect(cleaned[0]?.blockedBy).toBeUndefined();
		expect(cleaned[1]?.blockedBy).toBeUndefined();
		expect(strippedUnknown).toEqual([]);
	});

	it("drops an empty blockedBy array entirely", () => {
		const tasks = [makeTask({ id: "t1", blockedBy: [] }), makeTask({ id: "t2" })];
		const { tasks: cleaned, strippedUnknown } = normalizeBlockedBy(tasks);
		expect(cleaned[0]?.blockedBy).toBeUndefined();
		expect(strippedUnknown).toEqual([]);
	});

	it("allows dependencies on completed tasks (does not strip)", () => {
		const tasks = [
			makeTask({ id: "t1", status: "completed" }),
			makeTask({ id: "t2", blockedBy: ["t1"] }),
		];
		const { tasks: cleaned, strippedUnknown } = normalizeBlockedBy(tasks);
		expect(cleaned[1]?.blockedBy).toEqual(["t1"]);
		expect(strippedUnknown).toEqual([]);
	});
});

// ── findCycle ──────────────────────────────────────────────────────────────

describe("findCycle", () => {
	it("returns null when there are no cycles", () => {
		const tasks = [
			makeTask({ id: "t1", blockedBy: ["t2"] }),
			makeTask({ id: "t2", blockedBy: ["t3"] }),
			makeTask({ id: "t3" }),
		];
		expect(findCycle(tasks)).toBeNull();
	});

	it("detects a 2-task cycle", () => {
		const tasks = [
			makeTask({ id: "t1", blockedBy: ["t2"] }),
			makeTask({ id: "t2", blockedBy: ["t1"] }),
		];
		const cycle = findCycle(tasks);
		expect(cycle).not.toBeNull();
		expect(cycle).toContain("t1");
		expect(cycle).toContain("t2");
	});

	it("detects a self-cycle", () => {
		const tasks = [makeTask({ id: "t1", blockedBy: ["t1"] })];
		expect(findCycle(tasks)).not.toBeNull();
	});

	it("detects a 3-task cycle", () => {
		const tasks = [
			makeTask({ id: "t1", blockedBy: ["t2"] }),
			makeTask({ id: "t2", blockedBy: ["t3"] }),
			makeTask({ id: "t3", blockedBy: ["t1"] }),
		];
		expect(findCycle(tasks)).not.toBeNull();
	});

	it("returns null for empty list", () => {
		expect(findCycle([])).toBeNull();
	});
});

// ── isBlocked ──────────────────────────────────────────────────────────────

describe("isBlocked", () => {
	it("returns false for a task with no dependencies", () => {
		const t = makeTask({ id: "t1" });
		expect(isBlocked(t, [t])).toBe(false);
	});

	it("returns true when a dependency is not completed", () => {
		const t1 = makeTask({ id: "t1" });
		const t2 = makeTask({ id: "t2", blockedBy: ["t1"] });
		expect(isBlocked(t2, [t1, t2])).toBe(true);
	});

	it("returns false when all dependencies are completed", () => {
		const t1 = makeTask({ id: "t1", status: "completed" });
		const t2 = makeTask({ id: "t2", blockedBy: ["t1"] });
		expect(isBlocked(t2, [t1, t2])).toBe(false);
	});

	it("returns false for a completed task even with pending dependencies", () => {
		const t1 = makeTask({ id: "t1" });
		const t2 = makeTask({ id: "t2", status: "completed", blockedBy: ["t1"] });
		expect(isBlocked(t2, [t1, t2])).toBe(false);
	});

	it("returns false when dependencies reference unknown IDs", () => {
		const t = makeTask({ id: "t1", blockedBy: ["t99"] });
		expect(isBlocked(t, [t])).toBe(false);
	});

	it("returns true when at least one of multiple dependencies is pending", () => {
		const t1 = makeTask({ id: "t1", status: "completed" });
		const t2 = makeTask({ id: "t2" });
		const t3 = makeTask({ id: "t3", blockedBy: ["t1", "t2"] });
		expect(isBlocked(t3, [t1, t2, t3])).toBe(true);
	});
});

// ── validateDependencyGraph ────────────────────────────────────────────────

describe("validateDependencyGraph", () => {
	it("accepts a clean graph and preserves the tasks", () => {
		const tasks = [
			makeTask({ id: "t1", blockedBy: ["t2"] }),
			makeTask({ id: "t2" }),
		];
		const result = validateDependencyGraph(tasks);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.tasks.map((t) => t.id)).toEqual(["t1", "t2"]);
			expect(result.strippedUnknown).toEqual([]);
		}
	});

	it("rejects a cycle atomically", () => {
		const tasks = [
			makeTask({ id: "t1", blockedBy: ["t2"] }),
			makeTask({ id: "t2", blockedBy: ["t1"] }),
		];
		const result = validateDependencyGraph(tasks);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Dependency cycle");
		}
	});

	it("strips unknown IDs in the success path and reports them", () => {
		const tasks = [makeTask({ id: "t1", blockedBy: ["t99"] })];
		const result = validateDependencyGraph(tasks);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.strippedUnknown).toEqual(["t99"]);
			expect(result.tasks[0]?.blockedBy).toBeUndefined();
		}
	});
});

// ── formatStrippedWarning ──────────────────────────────────────────────────

describe("formatStrippedWarning", () => {
	it("returns undefined when nothing was stripped", () => {
		expect(formatStrippedWarning([])).toBeUndefined();
	});

	it("returns a warning string for stripped IDs", () => {
		const text = formatStrippedWarning(["t99", "t100"]);
		expect(text).toContain("t99");
		expect(text).toContain("t100");
		expect(text).toContain("Warning");
	});
});

// ── extractBlockedBy (private) integration via tracker ────────────────────
//
// extractBlockedBy is private in src/tracker.ts. The M2 oracle amendment
// requires that it faithfully extracts `blockedBy` from stored details
// without re-validating or normalizing dependency references. The test for
// this lives in src/tracker.test.ts and src/symmetry.test.ts; see the
// "preserves blockedBy across replay" test below for a cross-check.

describe("extractBlockedBy — module cross-check", () => {
	it("preserves blockedBy across replay without normalization", () => {
		// Round-trip: a task with `blockedBy` should round-trip through tracker
		// without losing dependencies. The dep helpers must NOT be invoked
		// during replay, so unknown IDs (e.g. t99) survive.
		const details = {
			tasks: [
				{ id: "t1", content: "A", status: "pending", priority: "high", createdAt: 0, blockedBy: ["t2", "t99"] },
				{ id: "t2", content: "B", status: "pending", priority: "high", createdAt: 0 },
			],
		};
		const extracted = extractTasks(details);
		expect(extracted).not.toBeNull();
		expect(extracted![0]?.blockedBy).toEqual(["t2", "t99"]); // t99 NOT stripped during replay
	});
});

// ── M3-T1: extractTasks deletedAt round-trip ────────────────────────────────

describe("extractTasks deletedAt round-trip", () => {
	it("round-trips deletedAt faithfully through extractTasks", () => {
		const details = {
			tasks: [
				{ id: "t1", content: "A", status: "pending", priority: "high", createdAt: 0 },
				{ id: "t2", content: "B", status: "pending", priority: "high", createdAt: 0, deletedAt: 1700000000000 },
			],
		};
		const extracted = extractTasks(details);
		expect(extracted).not.toBeNull();
		expect(extracted![0]?.deletedAt).toBeUndefined();
		expect(extracted![1]?.deletedAt).toBe(1700000000000);
	});

	it("coerces deletedAt to number", () => {
		const details = {
			tasks: [
				{ id: "t1", content: "A", status: "pending", priority: "medium", createdAt: 0, deletedAt: "1700000000000" },
			],
		};
		const extracted = extractTasks(details);
		expect(extracted![0]?.deletedAt).toBe(1700000000000);
	});

	it("handles null deletedAt as undefined", () => {
		const details = {
			tasks: [
				{ id: "t1", content: "A", status: "pending", priority: "medium", createdAt: 0, deletedAt: null },
			],
		};
		const extracted = extractTasks(details);
		expect(extracted![0]?.deletedAt).toBeUndefined();
	});
});

// ── M3-T1: isBlocked ignores tombstoned tasks ────────────────────────────────

describe("isBlocked with tombstones", () => {
	it("returns false when the task itself is tombstoned", () => {
		const t1 = makeTask({ id: "t1" });
		const t2 = makeTask({ id: "t2", blockedBy: ["t1"], deletedAt: 999 });
		expect(isBlocked(t2, [t1, t2])).toBe(false);
	});

	it("returns false when all blocking deps are tombstoned", () => {
		const t1 = makeTask({ id: "t1", deletedAt: 999 });
		const t2 = makeTask({ id: "t2", blockedBy: ["t1"] });
		expect(isBlocked(t2, [t1, t2])).toBe(false);
	});

	it("returns true when a live dep exists alongside a tombstoned one", () => {
		const t1 = makeTask({ id: "t1", deletedAt: 999 });
		const t2 = makeTask({ id: "t2" });
		const t3 = makeTask({ id: "t3", blockedBy: ["t1", "t2"] });
		expect(isBlocked(t3, [t1, t2, t3])).toBe(true);
	});
});


// ── Issue 2: activeBlockerIds ────────────────────────────────────────────────

describe("activeBlockerIds", () => {
	it("returns only live, non-completed dependency IDs", () => {
		const t1 = makeTask({ id: "t1" });
		const t2 = makeTask({ id: "t2" });
		const blocked = makeTask({ id: "t3", blockedBy: ["t1", "t2"] });
		expect(activeBlockerIds(blocked, [t1, t2, blocked])).toEqual(["t1", "t2"]);
	});

	it("excludes completed dependencies", () => {
		const t1 = makeTask({ id: "t1", status: "completed" });
		const t2 = makeTask({ id: "t2" });
		const blocked = makeTask({ id: "t3", blockedBy: ["t1", "t2"] });
		expect(activeBlockerIds(blocked, [t1, t2, blocked])).toEqual(["t2"]);
	});

	it("excludes tombstoned dependencies", () => {
		const t1 = makeTask({ id: "t1", deletedAt: 1 });
		const t2 = makeTask({ id: "t2" });
		const blocked = makeTask({ id: "t3", blockedBy: ["t1", "t2"] });
		expect(activeBlockerIds(blocked, [t1, t2, blocked])).toEqual(["t2"]);
	});

	it("returns empty when all deps are tombstoned or completed", () => {
		const t1 = makeTask({ id: "t1", deletedAt: 1 });
		const t2 = makeTask({ id: "t2", status: "completed" });
		const blocked = makeTask({ id: "t3", blockedBy: ["t1", "t2"] });
		expect(activeBlockerIds(blocked, [t1, t2, blocked])).toEqual([]);
	});

	it("returns empty for a task without blockedBy", () => {
		const t = makeTask({ id: "t1" });
		expect(activeBlockerIds(t, [t])).toEqual([]);
	});

	it("excludes unknown IDs (mirrors isBlocked)", () => {
		const t = makeTask({ id: "t1", blockedBy: ["t99"] });
		expect(activeBlockerIds(t, [t])).toEqual([]);
	});

	it("only counts live non-completed deps when mixed with tombstoned and completed", () => {
		const t1 = makeTask({ id: "t1", deletedAt: 1 });
		const t2 = makeTask({ id: "t2", status: "completed" });
		const t3 = makeTask({ id: "t3" });
		const blocked = makeTask({ id: "t4", blockedBy: ["t1", "t2", "t3"] });
		expect(activeBlockerIds(blocked, [t1, t2, t3, blocked])).toEqual(["t3"]);
	});
});

describe("M4 M-d: rich fields do not affect blocked state", () => {
	it("isBlocked returns identical result for a task with rich fields vs without (M-d)", () => {
		const dep = makeTask({ id: "dep", status: "completed" });
		const blocker = makeTask({ id: "blocker", status: "pending" });

		// Task WITH rich fields — should compute identical block state
		const taskWithout: Task = makeTask({
			id: "t1",
			status: "pending",
			blockedBy: ["blocker"],
		});
		const taskWith: Task = {
			...taskWithout,
			description: "notes",
			owner: "me",
			activeForm: "working",
			metadata: { key: "value" },
		};

		expect(isBlocked(taskWithout, [dep, blocker, taskWithout])).toBe(
			isBlocked(taskWith, [dep, blocker, taskWith]),
		);
		expect(activeBlockerIds(taskWithout, [dep, blocker, taskWithout])).toEqual(
			activeBlockerIds(taskWith, [dep, blocker, taskWith]),
		);
	});
});