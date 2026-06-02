import type { Theme } from "@earendil-works/pi-tui";
import { TodoViewComponent, formatTaskLine } from "./component";
import type { Task } from "./types";

const theme: Theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
	strikethrough: (text: string) => text,
} as Theme;

function task(overrides: Partial<Task> = {}): Task {
	return {
		id: "t1",
		content: "Write regression test",
		status: "pending",
		priority: "medium",
		createdAt: 1000,
		...overrides,
	};
}

describe("TodoViewComponent", () => {
	it("renders task rows and exposes lifecycle methods", () => {
		const view = new TodoViewComponent([task()], theme, () => {});

		const lines = view.render(80);

		expect(lines.join("\n")).toContain("Write regression test");
		expect(() => view.dispose()).not.toThrow();
	});
});

describe("formatTaskLine", () => {
	it("includes status, priority, and content", () => {
		expect(formatTaskLine(task(), theme)).toContain("Write regression test");
	});

	it("appends a blocked marker with dependency IDs when blocked", () => {
		const blocked = task({ id: "t2", blockedBy: ["t1"] });
		const t1 = task({ id: "t1" });
		const line = formatTaskLine(blocked, theme, true, [t1, blocked]);
		expect(line).toContain("\u2298");
		expect(line).toContain("t1");
	});

	it("omits the blocked marker when not blocked", () => {
		expect(formatTaskLine(task({ id: "t2", blockedBy: ["t1"] }), theme, false)).not.toContain(
			"\u2298",
		);
	});

	it("blocked marker excludes tombstoned dep IDs", () => {
		const t1 = task({ id: "t1", deletedAt: 1 }); // tombstoned dep
		const t3 = task({ id: "t3" }); // live blocking dep
		const blocked = task({ id: "t2", blockedBy: ["t1", "t3"] });
		const allTasks = [t1, t3, blocked];
		const line = formatTaskLine(blocked, theme, true, allTasks);
		expect(line).toContain("t3");
		expect(line).not.toContain("t1"); // tombstoned dep excluded
	});
});

describe("TodoViewComponent blocked display", () => {
	it("shows a blocked marker in the /todos UI for blocked pending tasks", () => {
		const t1 = task({ id: "t1", content: "Dependency", status: "pending" });
		const t2 = task({ id: "t2", content: "Dependent", status: "pending", blockedBy: ["t1"] });
		const view = new TodoViewComponent([t1, t2], theme, () => {});

		const out = view.render(80).join("\n");

		expect(out).toContain("\u2298");
	});

	it("does not render tombstoned tasks", () => {
		const live = task({ id: "t1", content: "Visible" });
		const tombstoned = task({ id: "t2", content: "Gone", deletedAt: 1 });
		const view = new TodoViewComponent([live, tombstoned], theme, () => {});

		const out = view.render(80).join("\n");

		expect(out).toContain("Visible");
		expect(out).not.toContain("Gone");
	});
});

// ── M4 — M-c visibility in TodoViewComponent ─────────────────────────────────

describe("TodoViewComponent M4 rich fields", () => {
	it("shows `description` under a task line", () => {
		const t = task({ id: "t1", content: "Task", description: "long reference notes" });
		const view = new TodoViewComponent([t], theme, () => {});
		const out = view.render(120).join("\n");
		expect(out).toContain("long reference notes");
	});

	it("shows `owner` next to a task line", () => {
		const t = task({ id: "t1", content: "Task", owner: "agent-1" });
		const view = new TodoViewComponent([t], theme, () => {});
		const out = view.render(120).join("\n");
		expect(out).toContain("agent-1");
	});

	it("shows `activeForm` next to an in_progress task line", () => {
		const t = task({ id: "t1", content: "Task", status: "in_progress", activeForm: "doing it" });
		const view = new TodoViewComponent([t], theme, () => {});
		const out = view.render(120).join("\n");
		expect(out).toContain("doing it");
	});

	it("does NOT show `metadata` keys or values", () => {
		const t = task({ id: "t1", content: "Task", metadata: { secret: "shh" } });
		const view = new TodoViewComponent([t], theme, () => {});
		const out = view.render(120).join("\n");
		expect(out).not.toContain("secret");
		expect(out).not.toContain("shh");
	});
});

// ── M4 — renderTaskResult surfaces rich fields ──────────────────────────────

describe("TodoViewComponent.renderTaskResult M4 rich fields", () => {
	it("shows `description` in the result text", () => {
		const text = TodoViewComponent.renderTaskResult(
			{ tasks: [task({ id: "t1", content: "Task", description: "long reference notes" })] },
			true,
			theme,
		);
		// Text is a pi-tui Text; render it to a string.
		const out = text.render(120).join("\n");
		expect(out).toContain("long reference notes");
	});

	it("does NOT show `metadata` in the result text", () => {
		const text = TodoViewComponent.renderTaskResult(
			{ tasks: [task({ id: "t1", content: "Task", metadata: { secret: "shh" } })] },
			true,
			theme,
		);
		const out = text.render(120).join("\n");
		expect(out).not.toContain("secret");
		expect(out).not.toContain("shh");
	});
});
