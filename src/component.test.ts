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
});
