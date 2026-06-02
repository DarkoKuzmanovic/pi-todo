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

	it("says not found for tombstoned task", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [makeTask({ id: "t1", status: "pending", deletedAt: 1 })],
		});
		const cmd = fakeApi.commands.get("done");
		const { ctx, notifications } = buildCommandContext();
		await cmd?.handler("t1", ctx);
		expect(notifications[0]?.message).toContain("not found");
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

	// ── M2-T2: /start warns on blocked but still sends the follow-up ──

	it("warns and adds a note when starting a blocked task", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [
				makeTask({ id: "t1", content: "Blocker", status: "pending" }),
				makeTask({ id: "t2", content: "Doomed", status: "pending", blockedBy: ["t1"] }),
			],
		});
		const cmd = fakeApi.commands.get("start");
		const { ctx, notifications } = buildCommandContext();
		await cmd?.handler("t2", ctx);

		expect(fakeApi.sentMessages).toHaveLength(1);
		const msg = fakeApi.sentMessages[0]!;
		expect(msg.options).toEqual({ deliverAs: "followUp" });
		expect(msg.content).toContain("t2");
		expect(msg.content).toContain("Doomed");
		expect(msg.content).toContain("in_progress");
		expect(msg.content).toContain("todo_write");
		expect(msg.content).toContain("incomplete dependencies");

		const blockedNote = notifications.find(
			(n) => n.type === "info" && n.message.includes("blocked by"),
		);
		expect(blockedNote).toBeDefined();
		expect(blockedNote?.message).toContain("t1");
	});

	it("does not warn when starting an unblocked task", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [makeTask({ id: "t1", content: "Solo", status: "pending" })],
		});
		const cmd = fakeApi.commands.get("start");
		const { ctx, notifications } = buildCommandContext();
		await cmd?.handler("t1", ctx);
		const blockedNote = notifications.find((n) => n.message.includes("blocked by"));
		expect(blockedNote).toBeUndefined();
	});

	it("says not found for tombstoned task", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [makeTask({ id: "t1", status: "pending", deletedAt: 1 })],
		});
		const cmd = fakeApi.commands.get("start");
		const { ctx, notifications } = buildCommandContext();
		await cmd?.handler("t1", ctx);
		expect(notifications[0]?.message).toContain("not found");
	});

	// ── M4 fix-back: M3 tombstone-aware follow-up ────────────────────
	// /start must not leak tombstoned dep IDs into the follow-up message
	// (M3 "dead id never printed" invariant). It uses activeBlockerIds
	// instead of raw task.blockedBy.
	it("M3: /start on a blocked task filters tombstoned dep ids out of the follow-up", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [
				makeTask({ id: "t-live", content: "Live dep", status: "pending" }),
				makeTask({ id: "t-dead", content: "Dead dep", status: "completed", deletedAt: 1 }),
				makeTask({
					id: "t-target",
					content: "Doomed",
					status: "pending",
					blockedBy: ["t-live", "t-dead"],
				}),
			],
		});
		const cmd = fakeApi.commands.get("start");
		const { ctx, notifications } = buildCommandContext();
		await cmd?.handler("t-target", ctx);

		expect(fakeApi.sentMessages).toHaveLength(1);
		const msg = fakeApi.sentMessages[0]!;
		expect(msg.content).toContain("incomplete dependencies");
		// Live dep IS in the follow-up
		expect(msg.content).toContain("t-live");
		// Tombstoned dep is NOT in the follow-up (M3 invariant)
		expect(msg.content).not.toContain("t-dead");
		// The notification that lists blockers also must not mention the dead id
		const blockedNote = notifications.find(
			(n) => n.type === "info" && n.message.includes("blocked by"),
		);
		expect(blockedNote?.message).toContain("t-live");
		expect(blockedNote?.message).not.toContain("t-dead");
	});

	// ── M4 fix-back: M-f activeForm surfacing in /start ──────────────
	// /start must include the activeForm label in the follow-up when
	// the task has one, so the agent can phrase its acknowledgement
	// with the present-progressive form.
	it("M-f: /start on a task with activeForm includes 'Currently <activeForm>' in the follow-up", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [
				makeTask({
					id: "t1",
					content: "Write code",
					status: "pending",
					activeForm: "writing code",
				}),
			],
		});
		const cmd = fakeApi.commands.get("start");
		const { ctx } = buildCommandContext();
		await cmd?.handler("t1", ctx);

		expect(fakeApi.sentMessages).toHaveLength(1);
		const msg = fakeApi.sentMessages[0]!;
		expect(msg.content).toContain("Currently writing code");
	});

	it("M-f: /start on a task with activeForm AND blocked deps includes 'Currently <activeForm>' in the follow-up", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [
				makeTask({ id: "t-dep", content: "Blocker", status: "pending" }),
				makeTask({
					id: "t-target",
					content: "Doomed",
					status: "pending",
					blockedBy: ["t-dep"],
					activeForm: "working on doomed",
				}),
			],
		});
		const cmd = fakeApi.commands.get("start");
		const { ctx } = buildCommandContext();
		await cmd?.handler("t-target", ctx);

		expect(fakeApi.sentMessages).toHaveLength(1);
		const msg = fakeApi.sentMessages[0]!;
		expect(msg.content).toContain("Currently working on doomed");
		expect(msg.content).toContain("incomplete dependencies");
		expect(msg.content).toContain("t-dep");
	});

	it("M-f: /start on a task WITHOUT activeForm does not include 'Currently ...' in the follow-up", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [makeTask({ id: "t1", content: "Write code", status: "pending" })],
		});
		const cmd = fakeApi.commands.get("start");
		const { ctx } = buildCommandContext();
		await cmd?.handler("t1", ctx);

		expect(fakeApi.sentMessages).toHaveLength(1);
		const msg = fakeApi.sentMessages[0]!;
		expect(msg.content).not.toContain("Currently");
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

	// ── M2-T2: blocked-state filtering ────────────────────────────────

	it("skips blocked pending tasks and starts the next unblocked one", async () => {

		runtime.tracker.reconstructFromDetails({
			tasks: [
				makeTask({ id: "t1", content: "Blocker", status: "pending", priority: "low" }),
				makeTask({ id: "t2", content: "Blocked work", status: "pending", priority: "high", blockedBy: ["t1"] }),
				makeTask({ id: "t3", content: "Unblocked work", status: "pending", priority: "medium" }),
			],
		});
		const cmd = fakeApi.commands.get("next");
		const { ctx } = buildCommandContext();
		await cmd?.handler("", ctx);
		const msg = fakeApi.sentMessages[0];
		expect(msg?.content).toContain("t3");
		expect(msg?.content).toContain("Unblocked work");
		expect(msg?.content).not.toContain("t2");
	});

	it("informs when all pending tasks are blocked", async () => {
		// Edge case: the only pending task depends on itself. This is the only
		// way to construct a tracker state where every pending task is blocked
		// without forming a multi-task cycle (which the validator rejects).
		runtime.tracker.reconstructFromDetails({
			tasks: [
				makeTask({ id: "t1", content: "Self-blocker", status: "pending", blockedBy: ["t1"] }),
			],
		});
		const cmd = fakeApi.commands.get("next");
		const { ctx, notifications } = buildCommandContext();
		await cmd?.handler("", ctx);
		expect(fakeApi.sentMessages).toHaveLength(0);
		expect(notifications[0]?.type).toBe("info");
		expect(notifications[0]?.message).toContain("blocked");
	});

	it("treats a blocked task as unblocked once its dependency is completed", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [
				makeTask({ id: "t1", content: "Blocker", status: "completed" }),
				makeTask({ id: "t2", content: "Now unblocked", status: "pending", blockedBy: ["t1"] }),
			],
		});
		const cmd = fakeApi.commands.get("next");
		const { ctx } = buildCommandContext();
		await cmd?.handler("", ctx);
		const msg = fakeApi.sentMessages[0];
		expect(msg?.content).toContain("t2");
		expect(msg?.content).toContain("Now unblocked");
	});

	it("does not block on completed dependencies and still picks the task", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [
				makeTask({ id: "t1", content: "Done dep", status: "completed" }),
				makeTask({ id: "t2", content: "Pending with completed dep", status: "pending", blockedBy: ["t1"] }),
			],
		});
		const cmd = fakeApi.commands.get("next");
		const { ctx } = buildCommandContext();
		await cmd?.handler("", ctx);
		expect(fakeApi.sentMessages).toHaveLength(1);
		expect(fakeApi.sentMessages[0]?.content).toContain("t2");
	});

	// ── M3-T2: tombstone-aware command selection ──────────────────────

	it("skips tombstoned in_progress task", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [
				makeTask({ id: "t1", status: "in_progress", deletedAt: Date.now() }),
				makeTask({ id: "t2", status: "pending" }),
			],
		});
		const cmd = fakeApi.commands.get("next");
		const { ctx } = buildCommandContext();
		await cmd?.handler("", ctx);
		expect(fakeApi.sentMessages).toHaveLength(1);
		const msg = fakeApi.sentMessages[0];
		// Should only suggest starting t2 (pending), not completing t1
		expect(msg?.content).toContain("t2");
		expect(msg?.content).not.toContain("t1");
	});

	it("with only tombstoned tasks reports no tasks", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [makeTask({ id: "t1", status: "pending", deletedAt: 1 })],
		});
		const cmd = fakeApi.commands.get("next");
		const { ctx, notifications } = buildCommandContext();
		await cmd?.handler("", ctx);
		expect(notifications[0]?.message).toContain("No tasks");
	});

	it("ignores tombstoned tasks in blocked/unblocked selection", async () => {
		// t1 blocked by t2 (both live), t3 is tombstoned. /next should pick t2,
		// not report blocked, and not pick tombstoned t3.
		runtime.tracker.reconstructFromDetails({
			tasks: [
				makeTask({ id: "t1", status: "pending", blockedBy: ["t2"] }),
				makeTask({ id: "t2", status: "pending" }),
				makeTask({ id: "t3", status: "pending", deletedAt: 1 }),
			],
		});
		const cmd = fakeApi.commands.get("next");
		const { ctx } = buildCommandContext();
		await cmd?.handler("", ctx);
		// Should advance to t2, not report blocked and not pick tombstoned t3
		expect(fakeApi.sentMessages).toHaveLength(1);
		expect(fakeApi.sentMessages[0]?.content).toContain("t2");
	});

	// ── M4 fix-back: M-f activeForm surfacing in /next ──────────────────
	// /next must include the activeForm label in the follow-up when the
	// active and/or next-up task has one, so the agent can phrase its
	// acknowledgement with the present-progressive form.
	it("M-f: /next includes 'Currently <activeForm>' for the active task when it has one", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [
				makeTask({
					id: "t1",
					content: "Current",
					status: "in_progress",
					activeForm: "doing the current thing",
				}),
				makeTask({ id: "t2", content: "Next up", status: "pending" }),
			],
		});
		const cmd = fakeApi.commands.get("next");
		const { ctx } = buildCommandContext();
		await cmd?.handler("", ctx);

		expect(fakeApi.sentMessages).toHaveLength(1);
		const msg = fakeApi.sentMessages[0]!;
		expect(msg.content).toContain("Currently doing the current thing");
	});

	it("M-f: /next includes 'Currently <activeForm>' for the next-up task when it has one", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [
				makeTask({ id: "t1", content: "Current", status: "in_progress" }),
				makeTask({
					id: "t2",
					content: "Next up",
					status: "pending",
					activeForm: "starting the next thing",
				}),
			],
		});
		const cmd = fakeApi.commands.get("next");
		const { ctx } = buildCommandContext();
		await cmd?.handler("", ctx);

		expect(fakeApi.sentMessages).toHaveLength(1);
		const msg = fakeApi.sentMessages[0]!;
		expect(msg.content).toContain("Currently starting the next thing");
	});

	it("M-f: /next does not include 'Currently ...' when neither task has activeForm", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [
				makeTask({ id: "t1", content: "Current", status: "in_progress" }),
				makeTask({ id: "t2", content: "Next up", status: "pending" }),
			],
		});
		const cmd = fakeApi.commands.get("next");
		const { ctx } = buildCommandContext();
		await cmd?.handler("", ctx);

		expect(fakeApi.sentMessages).toHaveLength(1);
		const msg = fakeApi.sentMessages[0]!;
		expect(msg.content).not.toContain("Currently");
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

	it("says not found for tombstoned active task", async () => {
		runtime.tracker.reconstructFromDetails({
			tasks: [makeTask({ id: "t1", content: "Removed task", status: "in_progress", deletedAt: 1 })],
		});
		const cmd = fakeApi.commands.get("pause");
		const { ctx, notifications } = buildCommandContext();
		await cmd?.handler("", ctx);
		// No active task (tombstoned) → same as "no active task" flow
		expect(notifications[0]?.type).toBe("info");
		expect(notifications[0]?.message).toContain("No active");
		expect(fakeApi.sentMessages).toHaveLength(0);
	});
});
