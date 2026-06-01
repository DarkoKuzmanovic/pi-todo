import { describe, it, expect, beforeEach } from "vitest";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { TodoRuntime } from "./runtime";
import { registerTodoCommands } from "./commands";
import type { Task } from "./types";

// ── Test helpers ────────────────────────────────────────────────────────────

interface SentMessage {
	content: string;
	options: { deliverAs?: string } | undefined;
}

interface Notification {
	message: string;
	type: string | undefined;
}

interface RegisteredCommand {
	name: string;
	description: string;
	handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}

interface FakeApi {
	commands: Map<string, RegisteredCommand>;
	sentMessages: SentMessage[];
	api: {
		registerCommand: (
			name: string,
			options: { description?: string; handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> },
		) => void;
		sendUserMessage: (content: string, options?: { deliverAs?: string }) => void;
	};
}

function buildFakeApi(): FakeApi {
	const commands = new Map<string, RegisteredCommand>();
	const sentMessages: SentMessage[] = [];

	return {
		commands,
		sentMessages,
		api: {
			registerCommand(
				name: string,
				options: {
					description?: string;
					handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
				},
			) {
				commands.set(name, {
					name,
					description: options.description ?? "",
					handler: options.handler,
				});
			},
			sendUserMessage(content: string, options?: { deliverAs?: string }) {
				sentMessages.push({ content, options });
			},
		},
	};
}

function buildCommandContext(): {
	ctx: ExtensionCommandContext;
	notifications: Notification[];
} {
	const notifications: Notification[] = [];
	const ctx = {
		ui: {
			notify(message: string, type?: string) {
				notifications.push({ message, type });
			},
		},
	} as unknown as ExtensionCommandContext;
	return { ctx, notifications };
}

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

interface TaskState {
	id: string;
	status: Task["status"];
}

function taskStates(): TaskState[] {
	return runtime.tracker.tasks.map((task) => ({ id: task.id, status: task.status }));
}

// ── Test setup ──────────────────────────────────────────────────────────────

let fakeApi: FakeApi;
let runtime: TodoRuntime;

beforeEach(() => {
	fakeApi = buildFakeApi();
	runtime = new TodoRuntime();
	registerTodoCommands(fakeApi.api as unknown as Parameters<typeof registerTodoCommands>[0], runtime);
});

// ── Registration ────────────────────────────────────────────────────────────

describe("registerTodoCommands", () => {
	it("registers /done", () => {
		expect(fakeApi.commands.has("done")).toBe(true);
	});

	it("registers /start", () => {
		expect(fakeApi.commands.has("start")).toBe(true);
	});

	it("registers /next", () => {
		expect(fakeApi.commands.has("next")).toBe(true);
	});

	it("registers /pause", () => {
		expect(fakeApi.commands.has("pause")).toBe(true);
	});
});

// ── /done ───────────────────────────────────────────────────────────────────

describe("/done", () => {
	it("warns on missing task id", async () => {
		const cmd = fakeApi.commands.get("done");
		const { ctx, notifications } = buildCommandContext();
		await cmd?.handler("", ctx);
		expect(notifications.length).toBe(1);
		expect(notifications[0]?.type).toBe("warning");
		expect(fakeApi.sentMessages).toHaveLength(0);
	});

	it("warns on unknown task id", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [makeTask({ id: "t1" })],
		});
		const cmd = fakeApi.commands.get("done");
		const { ctx, notifications } = buildCommandContext();
		await cmd?.handler("t99", ctx);
		expect(notifications[0]?.type).toBe("warning");
		expect(notifications[0]?.message).toContain("t99");
		expect(fakeApi.sentMessages).toHaveLength(0);
	});

	it("informs when task is already completed", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [makeTask({ id: "t1", status: "completed" })],
		});
		const cmd = fakeApi.commands.get("done");
		const { ctx, notifications } = buildCommandContext();
		await cmd?.handler("t1", ctx);
		expect(notifications[0]?.type).toBe("info");
		expect(notifications[0]?.message).toContain("already");
		expect(fakeApi.sentMessages).toHaveLength(0);
	});

	it("sends follow-up to mark task completed using todo_write", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [makeTask({ id: "t1", content: "Write tests", status: "in_progress" })],
		});
		const cmd = fakeApi.commands.get("done");
		const { ctx, notifications } = buildCommandContext();
		await cmd?.handler("t1", ctx);
		expect(fakeApi.sentMessages).toHaveLength(1);
		const msg = fakeApi.sentMessages[0];
		expect(msg?.content).toContain("t1");
		expect(msg?.content).toContain("Write tests");
		expect(msg?.content).toContain("completed");
		expect(msg?.content).toContain("todo_write");
		expect(msg?.content).toContain("[pi-todo]");
		expect(msg?.options).toEqual({ deliverAs: "followUp" });
		expect(notifications[0]?.type).toBe("info");
		expect(taskStates()).toEqual([{ id: "t1", status: "in_progress" }]);
	});
});

// ── /start ──────────────────────────────────────────────────────────────────

describe("/start", () => {
	it("warns on missing task id", async () => {
		const cmd = fakeApi.commands.get("start");
		const { ctx, notifications } = buildCommandContext();
		await cmd?.handler("", ctx);
		expect(notifications[0]?.type).toBe("warning");
		expect(fakeApi.sentMessages).toHaveLength(0);
	});

	it("warns on unknown task id", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [makeTask({ id: "t1" })],
		});
		const cmd = fakeApi.commands.get("start");
		const { ctx, notifications } = buildCommandContext();
		await cmd?.handler("t99", ctx);
		expect(notifications[0]?.type).toBe("warning");
		expect(fakeApi.sentMessages).toHaveLength(0);
	});

	it("informs when task is already in progress", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [makeTask({ id: "t1", status: "in_progress" })],
		});
		const cmd = fakeApi.commands.get("start");
		const { ctx, notifications } = buildCommandContext();
		await cmd?.handler("t1", ctx);
		expect(notifications[0]?.type).toBe("info");
		expect(notifications[0]?.message).toContain("already");
		expect(fakeApi.sentMessages).toHaveLength(0);
	});

	it("sends follow-up to set task in_progress using todo_write", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [makeTask({ id: "t1", content: "Write code", status: "pending" })],
		});
		const cmd = fakeApi.commands.get("start");
		const { ctx } = buildCommandContext();
		await cmd?.handler("t1", ctx);
		expect(fakeApi.sentMessages).toHaveLength(1);
		const msg = fakeApi.sentMessages[0];
		expect(msg?.content).toContain("t1");
		expect(msg?.content).toContain("Write code");
		expect(msg?.content).toContain("in_progress");
		expect(msg?.content).toContain("todo_write");
		expect(msg?.content).toContain("[pi-todo]");
		expect(msg?.options).toEqual({ deliverAs: "followUp" });
		expect(taskStates()).toEqual([{ id: "t1", status: "pending" }]);
	});
});

// ── /next ───────────────────────────────────────────────────────────────────

describe("/next", () => {
	it("informs when there are no tasks to advance", async () => {
		const cmd = fakeApi.commands.get("next");
		const { ctx, notifications } = buildCommandContext();
		await cmd?.handler("", ctx);
		expect(notifications[0]?.type).toBe("info");
		expect(notifications[0]?.message).toContain("No tasks");
		expect(fakeApi.sentMessages).toHaveLength(0);
	});

	it("with active and pending tasks, completes active and starts pending", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [
				makeTask({ id: "t1", content: "Current", status: "in_progress" }),
				makeTask({ id: "t2", content: "Next up", status: "pending" }),
			],
		});
		const cmd = fakeApi.commands.get("next");
		const { ctx, notifications } = buildCommandContext();
		await cmd?.handler("", ctx);
		expect(fakeApi.sentMessages).toHaveLength(1);
		const msg = fakeApi.sentMessages[0];
		expect(msg?.content).toContain("t1");
		expect(msg?.content).toContain("completed");
		expect(msg?.content).toContain("t2");
		expect(msg?.content).toContain("in_progress");
		expect(msg?.content).toContain("todo_write");
		expect(msg?.options).toEqual({ deliverAs: "followUp" });
		expect(notifications[0]?.type).toBe("info");
		expect(taskStates()).toEqual([
			{ id: "t1", status: "in_progress" },
			{ id: "t2", status: "pending" },
		]);
	});

	it("with only an active task, completes it", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [makeTask({ id: "t1", content: "Solo", status: "in_progress" })],
		});
		const cmd = fakeApi.commands.get("next");
		const { ctx } = buildCommandContext();
		await cmd?.handler("", ctx);
		expect(fakeApi.sentMessages).toHaveLength(1);
		const msg = fakeApi.sentMessages[0];
		expect(msg?.content).toContain("t1");
		expect(msg?.content).toContain("completed");
		expect(msg?.content).toContain("todo_write");
		expect(taskStates()).toEqual([{ id: "t1", status: "in_progress" }]);
	});

	it("with only pending tasks, starts the highest-priority one", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [
				makeTask({ id: "t1", content: "Low task", status: "pending", priority: "low" }),
				makeTask({ id: "t2", content: "High task", status: "pending", priority: "high" }),
				makeTask({ id: "t3", content: "Med task", status: "pending", priority: "medium" }),
			],
		});
		const cmd = fakeApi.commands.get("next");
		const { ctx } = buildCommandContext();
		await cmd?.handler("", ctx);
		expect(fakeApi.sentMessages).toHaveLength(1);
		const msg = fakeApi.sentMessages[0];
		expect(msg?.content).toContain("t2");
		expect(msg?.content).toContain("High task");
		expect(msg?.content).toContain("in_progress");
		expect(msg?.content).toContain("todo_write");
		// Should NOT mention completing an active task
		expect(msg?.content).not.toContain("completed");
		expect(taskStates()).toEqual([
			{ id: "t1", status: "pending" },
			{ id: "t2", status: "pending" },
			{ id: "t3", status: "pending" },
		]);
	});

	it("selects high-priority pending over medium-priority", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [
				makeTask({ id: "t1", content: "Medium", status: "pending", priority: "medium" }),
				makeTask({ id: "t2", content: "High", status: "pending", priority: "high" }),
			],
		});
		const cmd = fakeApi.commands.get("next");
		const { ctx } = buildCommandContext();
		await cmd?.handler("", ctx);
		const msg = fakeApi.sentMessages[0];
		expect(msg?.content).toContain("t2");
		expect(msg?.content).not.toContain("t1");
	});
});

// ── /pause ──────────────────────────────────────────────────────────────────

describe("/pause", () => {
	it("informs when there is no active task", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [makeTask({ id: "t1", status: "pending" })],
		});
		const cmd = fakeApi.commands.get("pause");
		const { ctx, notifications } = buildCommandContext();
		await cmd?.handler("", ctx);
		expect(notifications[0]?.type).toBe("info");
		expect(notifications[0]?.message).toContain("No active");
		expect(fakeApi.sentMessages).toHaveLength(0);
	});

	it("sends follow-up to revert active task to pending", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [makeTask({ id: "t1", content: "In progress task", status: "in_progress" })],
		});
		const cmd = fakeApi.commands.get("pause");
		const { ctx, notifications } = buildCommandContext();
		await cmd?.handler("", ctx);
		expect(fakeApi.sentMessages).toHaveLength(1);
		const msg = fakeApi.sentMessages[0];
		expect(msg?.content).toContain("t1");
		expect(msg?.content).toContain("In progress task");
		expect(msg?.content).toContain("pending");
		expect(msg?.content).toContain("todo_write");
		expect(msg?.content).toContain("[pi-todo]");
		expect(msg?.options).toEqual({ deliverAs: "followUp" });
		expect(taskStates()).toEqual([{ id: "t1", status: "in_progress" }]);
		expect(notifications[0]?.type).toBe("info");
	});
});
