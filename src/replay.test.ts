import { describe, expect, it } from "vitest";
import {
	createTodoSnapshot,
	latestTodoReplaySource,
	TODO_SNAPSHOT_CUSTOM_TYPE,
} from "./replay";
import type { Task, TaskDetails } from "./types";

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

function detailsFor(id: string): TaskDetails {
	return { tasks: [makeTask({ id })] };
}

function makeToolEntry(
	toolName: "todo_write" | "todo_remove" | "todo_patch",
	details: unknown,
): unknown {
	return {
		type: "message",
		message: { role: "toolResult", toolName, details },
	};
}

function makeCustomSnapshot(data: unknown): unknown {
	return {
		type: "custom",
		customType: TODO_SNAPSHOT_CUSTOM_TYPE,
		data,
	};
}

function makeCompactionEntry(): unknown {
	return {
		type: "compaction",
		summary: "Compacted session",
		details: { readFiles: ["src/runtime.ts"] },
	};
}

describe("latestTodoReplaySource", () => {
	it("returns undefined for an empty branch", () => {
		expect(latestTodoReplaySource([])).toBeUndefined();
	});

	it("keeps current append-only behavior by reading old todo tool results before a compaction entry", () => {
		const branch = [
			makeToolEntry("todo_write", detailsFor("t1")),
			makeCompactionEntry(),
		];

		const result = latestTodoReplaySource(branch);

		expect(result?.kind).toBe("tool_result");
		expect((result?.details as TaskDetails | undefined)?.tasks[0]?.id).toBe("t1");
	});

	it("supports todo_remove tool results as replay sources", () => {
		const branch = [makeToolEntry("todo_remove", detailsFor("t2"))];

		const result = latestTodoReplaySource(branch);

		expect(result?.kind).toBe("tool_result");
		expect(result?.details).toEqual(detailsFor("t2"));
	});

	it("reads an appended pi-todo custom snapshot when tool results are unavailable", () => {
		const branch = [makeCustomSnapshot(createTodoSnapshot(detailsFor("t2")))];

		const result = latestTodoReplaySource(branch);

		expect(result?.kind).toBe("snapshot");
		expect((result?.details as TaskDetails | undefined)?.tasks[0]?.id).toBe("t2");
	});

	it("lets later todo tool results override earlier custom snapshots", () => {
		const branch = [
			makeCustomSnapshot(createTodoSnapshot(detailsFor("t1"))),
			makeToolEntry("todo_write", detailsFor("t3")),
		];

		const result = latestTodoReplaySource(branch);

		expect(result?.kind).toBe("tool_result");
		expect((result?.details as TaskDetails | undefined)?.tasks[0]?.id).toBe("t3");
	});

	it("lets later custom snapshots override earlier todo tool results", () => {
		const branch = [
			makeToolEntry("todo_write", detailsFor("t1")),
			makeCustomSnapshot(createTodoSnapshot(detailsFor("t4"))),
		];

		const result = latestTodoReplaySource(branch);

		expect(result?.kind).toBe("snapshot");
		expect((result?.details as TaskDetails | undefined)?.tasks[0]?.id).toBe("t4");
	});

	it("treats a malformed latest custom snapshot as authoritative invalid replay data", () => {
		const branch = [
			makeToolEntry("todo_write", detailsFor("t1")),
			makeCustomSnapshot({ version: 1, notDetails: true }),
		];

		const result = latestTodoReplaySource(branch);

		expect(result?.kind).toBe("snapshot");
		expect(result?.details).toBeUndefined();
	});

	it("ignores unknown custom entries", () => {
		const branch = [
			{ type: "custom", customType: "other-extension:snapshot", data: detailsFor("t1") },
		];

		expect(latestTodoReplaySource(branch)).toBeUndefined();
	});

	it("ignores malformed non-object branch entries", () => {
		const branch = [null, undefined, 42, "bad", { type: "message" }];

		expect(latestTodoReplaySource(branch)).toBeUndefined();
	});
});

describe("M11-T3/T4: todo_patch as a replay source", () => {
	it("recognizes a todo_patch tool result as the latest replay source", () => {
		const branch = [makeToolEntry("todo_patch", detailsFor("t9"))];
		const result = latestTodoReplaySource(branch);
		expect(result?.kind).toBe("tool_result");
		if (result?.kind === "tool_result") {
			expect(result.toolName).toBe("todo_patch");
			expect(result.details).toEqual(detailsFor("t9"));
		}
	});

	it("a later todo_patch result overrides an earlier todo_write result", () => {
		const branch = [
			makeToolEntry("todo_write", detailsFor("t1")),
			makeToolEntry("todo_patch", detailsFor("t2")),
		];
		const result = latestTodoReplaySource(branch);
		expect(result?.kind).toBe("tool_result");
		if (result?.kind === "tool_result") {
			expect(result.toolName).toBe("todo_patch");
			expect((result.details as TaskDetails | undefined)?.tasks[0]?.id).toBe("t2");
		}
	});

	it("a later todo_write result overrides an earlier todo_patch result", () => {
		const branch = [
			makeToolEntry("todo_patch", detailsFor("t1")),
			makeToolEntry("todo_write", detailsFor("t3")),
		];
		const result = latestTodoReplaySource(branch);
		expect(result?.kind).toBe("tool_result");
		if (result?.kind === "tool_result") {
			expect(result.toolName).toBe("todo_write");
			expect((result.details as TaskDetails | undefined)?.tasks[0]?.id).toBe("t3");
		}
	});

	it("a todo_patch result overrides an earlier custom snapshot", () => {
		const branch = [
			makeCustomSnapshot(createTodoSnapshot(detailsFor("t1"))),
			makeToolEntry("todo_patch", detailsFor("t4")),
		];
		const result = latestTodoReplaySource(branch);
		expect(result?.kind).toBe("tool_result");
		if (result?.kind === "tool_result") {
			expect(result.toolName).toBe("todo_patch");
			expect((result.details as TaskDetails | undefined)?.tasks[0]?.id).toBe("t4");
		}
	});
});
