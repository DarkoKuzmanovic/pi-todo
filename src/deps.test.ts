import { describe, it, expect } from "vitest";
import {
	dedupeBlockedBy,
	findCycle,
	formatStrippedWarning,
	isBlocked,
	normalizeBlockedBy,
	validateDependencyGraph,
} from "./deps";
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
