import { describe, expect, it } from "vitest";
import { applyPatch as applyPatchRaw } from "./patch";
import type { Task } from "./types";

function applyPatch(task: Task, patch: Parameters<typeof applyPatchRaw>[1]): Task {
	return applyPatchRaw(task, patch).task;
}

function base(overrides: Partial<Task> = {}): Task {
	return {
		id: "t1",
		content: "do the thing",
		status: "pending",
		priority: "medium",
		createdAt: 1,
		...overrides,
	};
}

describe("applyPatch (M11 pure merge rules)", () => {
	it("leaves absent fields unchanged and does not mutate the input", () => {
		const task = base({ description: "keep", metadata: { a: 1 } });
		const snapshot = structuredClone(task);
		const next = applyPatch(task, { id: "t1", status: "completed" });
		expect(next.status).toBe("completed");
		expect(next.description).toBe("keep");
		expect(next.metadata).toEqual({ a: 1 });
		expect(task).toEqual(snapshot);
	});

	it("replaces status, priority, and content", () => {
		const next = applyPatch(base(), {
			id: "t1",
			status: "in_progress",
			priority: "high",
			content: "renamed",
		});
		expect(next).toMatchObject({
			status: "in_progress",
			priority: "high",
			content: "renamed",
		});
	});

	it("replaces blockedBy and clears it with []", () => {
		const withDeps = applyPatch(base(), { id: "t1", blockedBy: ["t2", "t3"] });
		expect(withDeps.blockedBy).toEqual(["t2", "t3"]);
		const cleared = applyPatch(withDeps, { id: "t1", blockedBy: [] });
		expect(cleared.blockedBy).toBeUndefined();
	});

	it("replaces description/owner/activeForm and clears them with \"\"", () => {
		const set = applyPatch(base(), {
			id: "t1",
			description: "notes",
			owner: "agent-1",
			activeForm: "writing",
		});
		expect(set).toMatchObject({
			description: "notes",
			owner: "agent-1",
			activeForm: "writing",
		});
		const cleared = applyPatch(set, {
			id: "t1",
			description: "",
			owner: "",
			activeForm: "",
		});
		expect(cleared.description).toBeUndefined();
		expect(cleared.owner).toBeUndefined();
		expect(cleared.activeForm).toBeUndefined();
	});

	it("appendDescription appends with blank line, or sets when missing", () => {
		const fromEmpty = applyPatch(base(), { id: "t1", appendDescription: "first" });
		expect(fromEmpty.description).toBe("first");
		const appended = applyPatch(fromEmpty, { id: "t1", appendDescription: "second" });
		expect(appended.description).toBe("first\n\nsecond");
	});

	it("metadata merges per-key and null deletes without storing null (I1)", () => {
		const start = applyPatch(base({ metadata: { a: 1, b: true } }), {
			id: "t1",
			metadata: { b: null, c: "new" },
		});
		expect(start.metadata).toEqual({ a: 1, c: "new" });
		expect(Object.values(start.metadata ?? {}).some((v) => v === null)).toBe(false);
	});

	it("deletes metadata bag when the last key is removed", () => {
		const next = applyPatch(base({ metadata: { only: 1 } }), {
			id: "t1",
			metadata: { only: null },
		});
		expect(next.metadata).toBeUndefined();
	});

	it("returns I1 drop warnings from metadata merge", () => {
		const { task, dropped } = applyPatchRaw(base({ metadata: { keep: true } }), {
			id: "t1",
			metadata: {
				keep: null,
				nested: { x: 1 } as unknown as string,
			},
		});
		expect(task.metadata).toBeUndefined();
		expect(dropped.some((d) => d.includes("nested"))).toBe(true);
	});

});
