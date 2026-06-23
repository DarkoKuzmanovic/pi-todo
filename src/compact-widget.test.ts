import { describe, expect, it } from "vitest";
import {
	COMPACT_WIDGET_KEY,
	updateCompactWidget,
} from "./compact-widget";
import { TaskTracker } from "./tracker";
import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { Task } from "./types";

// ── Test helpers ────────────────────────────────────────────────────────────

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

interface WidgetCall {
	key: string;
	factory: (tui: { width?: number }, theme: Theme) => CompactRenderable;
	options: unknown;
}

interface CompactRenderable {
	render: (renderWidth?: number) => string[];
	invalidate: () => void;
}

interface CapturingContext {
	ctx: ExtensionContext;
	calls: WidgetCall[];
}

function buildContext(hasUI: boolean): CapturingContext {
	const calls: WidgetCall[] = [];
	const ctx = {
		hasUI,
		ui: {
			setWidget(key: string, content: unknown, options: unknown) {
				calls.push({
					key,
					factory: content as WidgetCall["factory"],
					options,
				});
			},
		},
	};
	return { ctx: ctx as unknown as ExtensionContext, calls };
}

const noopTheme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as unknown as Theme;

const capturingTheme = {
	fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
	bold: (text: string) => `<b>${text}</b>`,
} as unknown as Theme;


function renderWith(
	tracker: TaskTracker,
	options: {
		renderWidth?: number;
		tuiWidth?: number;
		theme?: Theme;
	} = {},
): { lines: string[]; renderable: CompactRenderable } {
	const { ctx, calls } = buildContext(true);
	updateCompactWidget(ctx, tracker);
	if (calls.length === 0) {
		throw new Error("updateCompactWidget did not call setWidget");
	}
	const renderable = calls[0].factory(
		{ width: options.tuiWidth },
		options.theme ?? noopTheme,
	);
	const lines = renderable.render(options.renderWidth);
	return { lines, renderable };
}

// ── Constants ───────────────────────────────────────────────────────────────

describe("COMPACT_WIDGET_KEY", () => {
	it('equals "pi-todo-compact"', () => {
		expect(COMPACT_WIDGET_KEY).toBe("pi-todo-compact");
	});

	it("does not collide with the legacy pi-todo widget key or oh-my-todo key", () => {
		expect(COMPACT_WIDGET_KEY).not.toBe("pi-todo");
		expect(COMPACT_WIDGET_KEY).not.toBe("oh-my-todo");
	});
});

// ── updateCompactWidget dispatch ────────────────────────────────────────────

describe("updateCompactWidget — setWidget contract", () => {
	it("no-ops when ctx.hasUI is false", () => {
		const { ctx, calls } = buildContext(false);
		const tracker = new TaskTracker(() => 1000);
		tracker.reconstructFromDetails({
			tasks: [makeTask({ id: "t1", status: "in_progress", startedAt: 0 })],
		});

		updateCompactWidget(ctx, tracker);

		expect(calls).toHaveLength(0);
	});

	it("calls setWidget with the compact key and aboveEditor placement when UI is available", () => {
		const { ctx, calls } = buildContext(true);
		const tracker = new TaskTracker(() => 1000);

		updateCompactWidget(ctx, tracker);

		expect(calls).toHaveLength(1);
		expect(calls[0].key).toBe(COMPACT_WIDGET_KEY);
		expect(calls[0].options).toEqual({ placement: "aboveEditor" });
	});

	it("factory returns a renderable with render and invalidate methods", () => {
		const { ctx, calls } = buildContext(true);
		const tracker = new TaskTracker(() => 1000);

		updateCompactWidget(ctx, tracker);

		const renderable = calls[0].factory({ width: 80 }, noopTheme);
		expect(typeof renderable.render).toBe("function");
		expect(typeof renderable.invalidate).toBe("function");
	});

	it("invalidate() is safe to call and does not throw", () => {
		const { lines, renderable } = renderWith(new TaskTracker(() => 1000));
		expect(lines.length).toBeGreaterThan(0);
		expect(() => renderable.invalidate()).not.toThrow();
	});
});

// ── Render states ───────────────────────────────────────────────────────────

describe("updateCompactWidget — render states", () => {
	it("renders the empty-state message when no tasks exist", () => {
		const tracker = new TaskTracker(() => 1000);
		const { lines } = renderWith(tracker, { renderWidth: 80 });

		expect(lines.length).toBeGreaterThan(0);
		expect(lines[0]).toContain("\ue370"); // pencil glyph
	});

	it("renders the all-done QED status when every task is completed", () => {
		const clock = () => 1000;
		const tracker = new TaskTracker(clock);
		tracker.reconstructFromDetails({
			tasks: [
				makeTask({ id: "t1", status: "completed", completedAt: clock() }),
				makeTask({ id: "t2", status: "completed", completedAt: clock() }),
			],
		});

		const { lines } = renderWith(tracker, { renderWidth: 80 });
		const joined = lines.join("\n");

		expect(joined).toContain("∎ 2/2 — done");
		expect(joined).not.toContain("All done!");
	});

	it("renders the active task content and elapsed time", () => {
		const clock = () => 65_000; // 1m 5s after startedAt
		const tracker = new TaskTracker(clock);
		tracker.reconstructFromDetails({
			tasks: [
				makeTask({
					id: "t1",
					content: "Investigate crash",
					status: "in_progress",
					startedAt: 0,
					priority: "medium",
				}),
			],
		});

		const { lines } = renderWith(tracker, { renderWidth: 80 });
		const joined = lines.join("\n");

		expect(joined).toContain("Investigate crash");
		expect(joined).toContain("1m 5s");
	});

	it("uses the high-priority badge for high-priority active tasks", () => {
		const tracker = new TaskTracker(() => 5_000);
		tracker.reconstructFromDetails({
			tasks: [
				makeTask({
					id: "t1",
					content: "Fix crash",
					status: "in_progress",
					startedAt: 0,
					priority: "high",
				}),
			],
		});

		const { lines } = renderWith(tracker, { renderWidth: 80 });
		const joined = lines.join("\n");

		expect(joined).toContain("\uf0e7"); // lightning bolt = high
		expect(joined).toContain("Fix crash");
	});

	it("uses the medium-priority badge for medium-priority active tasks", () => {
		const tracker = new TaskTracker(() => 5_000);
		tracker.reconstructFromDetails({
			tasks: [
				makeTask({
					id: "t1",
					content: "Run tests",
					status: "in_progress",
					startedAt: 0,
					priority: "medium",
				}),
			],
		});

		const { lines } = renderWith(tracker, { renderWidth: 80 });
		const joined = lines.join("\n");

		expect(joined).toContain("\uf444"); // medium badge
	});

	it("uses the low-priority badge for low-priority active tasks", () => {
		const tracker = new TaskTracker(() => 5_000);
		tracker.reconstructFromDetails({
			tasks: [
				makeTask({
					id: "t1",
					content: "Update docs",
					status: "in_progress",
					startedAt: 0,
					priority: "low",
				}),
			],
		});

		const { lines } = renderWith(tracker, { renderWidth: 80 });
		const joined = lines.join("\n");

		expect(joined).toContain("\uf4c3"); // low badge
	});

	it("renders the pending summary when there is no active task but pending tasks exist", () => {
		const tracker = new TaskTracker(() => 5_000);
		tracker.reconstructFromDetails({
			tasks: [
				makeTask({ id: "t1", content: "Pending one", status: "pending" }),
				makeTask({ id: "t2", content: "Done one", status: "completed", completedAt: 5_000 }),
			],
		});

		const { lines } = renderWith(tracker, { renderWidth: 80 });
		const joined = lines.join("\n");

		expect(joined).toContain("pending");
		expect(joined).toContain("done");
		expect(joined).not.toContain("Pending one"); // no active content shown
	});

	it("renders the completed/total progress bar with full and light blocks", () => {
		const clock = () => 1000;
		const tracker = new TaskTracker(clock);
		tracker.reconstructFromDetails({
			tasks: [
				makeTask({ id: "t1", status: "completed", completedAt: clock() }),
				makeTask({ id: "t2", status: "completed", completedAt: clock() }),
				makeTask({ id: "t3", status: "completed", completedAt: clock() }),
				makeTask({ id: "t4", status: "pending" }),
			],
		});

		const { lines } = renderWith(tracker, { renderWidth: 80 });
		const joined = lines.join("\n");

		expect(joined).toContain("█");
		expect(joined).toContain("░");
		expect(joined).toContain("3/4");
		expect(joined).not.toContain("▓"); // old dark-shade blocks should not be used
	});

	// ── M2-T3: blocked count segment ──────────────────────────────

	it("renders a blocked count segment when tasks are blocked", () => {
		const tracker = new TaskTracker(() => 1000);
		tracker.reconstructFromDetails({
			tasks: [
				makeTask({ id: "t1", content: "Blocker", status: "pending" }),
				makeTask({ id: "t2", content: "Blocked A", status: "pending", blockedBy: ["t1"] }),
				makeTask({ id: "t3", content: "Blocked B", status: "pending", blockedBy: ["t1"] }),
			],
		});

		const { lines } = renderWith(tracker, { renderWidth: 80 });
		const joined = lines.join("\n");

		expect(joined).toContain("2 blocked");
	});

	it("omits the blocked count segment when no tasks are blocked", () => {
		const tracker = new TaskTracker(() => 1000);
		tracker.reconstructFromDetails({
			tasks: [
				makeTask({ id: "t1", content: "Solo", status: "pending" }),
				makeTask({ id: "t2", content: "Other", status: "pending" }),
			],
		});

		const { lines } = renderWith(tracker, { renderWidth: 80 });
		const joined = lines.join("\n");

		expect(joined).not.toContain("blocked");
	});

	it("does not count completed tasks toward the blocked count", () => {
		const tracker = new TaskTracker(() => 1000);
		tracker.reconstructFromDetails({
			tasks: [
				makeTask({ id: "t1", content: "Done", status: "completed", completedAt: 1000 }),
				makeTask({ id: "t2", content: "Pending with completed dep", status: "pending", blockedBy: ["t1"] }),
			],
		});

		const { lines } = renderWith(tracker, { renderWidth: 80 });
		const joined = lines.join("\n");

		expect(joined).not.toContain("blocked");
	});

	it("tombstoned tasks do not inflate counts or blocked count", () => {
		const tracker = new TaskTracker(() => 1000);
		tracker.reconstructFromDetails({
			tasks: [
				makeTask({ id: "t1", content: "Live", status: "pending" }),
				makeTask({ id: "t2", content: "Gone", status: "in_progress", deletedAt: 999 }),
				makeTask({ id: "t3", content: "Blocked", status: "pending", blockedBy: ["t2"] }),
			],
		});

		const { lines } = renderWith(tracker, { renderWidth: 80 });
		const joined = lines.join("\n");

		// Only 2 live tasks: t1 pending, t3 pending (not blocked because t2 is tombstoned)
		expect(joined).toContain("2 pending");
		expect(joined).not.toContain("blocked"); // t3 not blocked by tombstoned t2
		expect(joined).not.toContain("Gone");
	});
});

// ── Width truncation ────────────────────────────────────────────────────────

function visibleColumns(text: string): number {
	const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
	let width = 0;
	for (const { segment } of seg.segment(text)) {
		const cp = segment.codePointAt(0) ?? 0;
		// Approximation matching the oh-my-todo helper:
		// - 0 / control / zero-width combining marks → 0
		// - Wide CJK / emoji-like → 2
		// - otherwise → 1
		if (
			cp === 0 ||
			cp < 32 ||
			(cp >= 0x7f && cp < 0xa0) ||
			(cp >= 0x300 && cp <= 0x36f) ||
			(cp >= 0x1ab0 && cp <= 0x1aff) ||
			(cp >= 0x1dc0 && cp <= 0x1dff) ||
			(cp >= 0x20d0 && cp <= 0x20ff) ||
			(cp >= 0xfe00 && cp <= 0xfe0f)
		) {
			continue;
		}
		if (
			cp >= 0x1100 &&
			(cp <= 0x115f ||
				cp === 0x2329 ||
				cp === 0x232a ||
				(cp >= 0x2e80 && cp <= 0xa4cf) ||
				(cp >= 0xac00 && cp <= 0xd7a3) ||
				(cp >= 0xf900 && cp <= 0xfaff) ||
				(cp >= 0xfe10 && cp <= 0xfe19) ||
				(cp >= 0xfe30 && cp <= 0xfe6f) ||
				(cp >= 0xff00 && cp <= 0xff60) ||
				(cp >= 0xffe0 && cp <= 0xffe6))
		) {
			width += 2;
			continue;
		}
		if (
			cp >= 0x1f000 && cp <= 0x1fbff
		) {
			width += 2;
			continue;
		}
		width += 1;
	}
	return width;
}

describe("updateCompactWidget — width truncation", () => {
	it("truncates an active task line to the supplied ASCII render width", () => {
		const tracker = new TaskTracker(() => 5_000);
		tracker.reconstructFromDetails({
			tasks: [
				makeTask({
					id: "t1",
					content: "x".repeat(200),
					status: "in_progress",
					startedAt: 0,
					priority: "high",
				}),
			],
		});

		const { lines } = renderWith(tracker, { renderWidth: 40 });
		for (const line of lines) {
			expect(visibleColumns(line)).toBeLessThanOrEqual(40);
		}
	});

	it("truncates a long line using the tui.width fallback when renderWidth is omitted", () => {
		const tracker = new TaskTracker(() => 5_000);
		tracker.reconstructFromDetails({
			tasks: [
				makeTask({
					id: "t1",
					content: "x".repeat(500),
					status: "in_progress",
					startedAt: 0,
					priority: "high",
				}),
			],
		});

		const { lines } = renderWith(tracker, { tuiWidth: 25 });
		for (const line of lines) {
			expect(visibleColumns(line)).toBeLessThanOrEqual(25);
		}
	});

	it("truncates wide (CJK) characters by display columns, not grapheme count", () => {
		// Each "中" is 2 display columns. 20 chars would be 40 columns.
		const tracker = new TaskTracker(() => 5_000);
		tracker.reconstructFromDetails({
			tasks: [
				makeTask({
					id: "t1",
					content: "中".repeat(40),
					status: "in_progress",
					startedAt: 0,
					priority: "high",
				}),
			],
		});

		const { lines } = renderWith(tracker, { renderWidth: 20 });
		for (const line of lines) {
			expect(visibleColumns(line)).toBeLessThanOrEqual(20);
		}
	});

	it("truncates emoji-like sequences by display columns", () => {
		// 🚀 is in the emoji range and renders as 2 columns.
		const tracker = new TaskTracker(() => 5_000);
		tracker.reconstructFromDetails({
			tasks: [
				makeTask({
					id: "t1",
					content: "🚀".repeat(30),
					status: "in_progress",
					startedAt: 0,
					priority: "high",
				}),
			],
		});

		const { lines } = renderWith(tracker, { renderWidth: 20 });
		for (const line of lines) {
			expect(visibleColumns(line)).toBeLessThanOrEqual(20);
		}
	});

	it("returns an empty line when renderWidth is 0", () => {
		const tracker = new TaskTracker(() => 5_000);
		tracker.reconstructFromDetails({
			tasks: [
				makeTask({ id: "t1", content: "Anything", status: "pending" }),
			],
		});

		const { lines } = renderWith(tracker, { renderWidth: 0 });
		for (const line of lines) {
			expect(line).toBe("");
		}
	});
});

// ── Theme application ──────────────────────────────────────────────────────

describe("updateCompactWidget — theme application", () => {
	it("applies theme fg() to the active task bullet and progress bar colors", () => {
		const tracker = new TaskTracker(() => 5_000);
		tracker.reconstructFromDetails({
			tasks: [
				makeTask({
					id: "t1",
					content: "Active task",
					status: "in_progress",
					startedAt: 0,
					priority: "high",
				}),
				makeTask({ id: "t2", status: "completed", completedAt: 5_000 }),
			],
		});

		const { lines } = renderWith(tracker, {
			renderWidth: 120,
			theme: capturingTheme,
		});
		const joined = lines.join("\n");

		// Active task bullet is colored with accent; progress bar with success or accent
		expect(joined).toContain("<accent>");
		expect(joined).toMatch(/<success>|<accent>/);
	});
});

// ── M4 — compact widget surfaces description ─────────────────────────────────

describe("updateCompactWidget — M4 description surfacing", () => {
	it("shows `description` as a concise marker next to the active task content", () => {
		const tracker = new TaskTracker(() => 5_000);
		tracker.reconstructFromDetails({
			tasks: [
				makeTask({
					id: "t1",
					content: "Active task",
					status: "in_progress",
					startedAt: 0,
					priority: "high",
					description: "long reference notes",
				}),
			],
		});

		const { lines } = renderWith(tracker, { renderWidth: 200 });
		const joined = lines.join("\n");
		expect(joined).toContain("Active task");
		// The widget truncates to renderWidth but a long-enough render width keeps
		// the description visible. A short renderWidth may truncate, so the test
		// uses a wide width.
		expect(joined).toContain("long reference notes");
	});

	it("does NOT show `metadata` keys or values in the widget", () => {
		const tracker = new TaskTracker(() => 5_000);
		tracker.reconstructFromDetails({
			tasks: [
				makeTask({
					id: "t1",
					content: "Active task",
					status: "in_progress",
					startedAt: 0,
					priority: "high",
					metadata: { secret: "shh", n: 42 },
				}),
			],
		});

		const { lines } = renderWith(tracker, { renderWidth: 200 });
		const joined = lines.join("\n");
		expect(joined).not.toContain("secret");
		expect(joined).not.toContain("shh");
		expect(joined).not.toContain("42");
	});

	it("does NOT show `owner` (widget is single-line; owner surfaces in /todos only)", () => {
		const tracker = new TaskTracker(() => 5_000);
		tracker.reconstructFromDetails({
			tasks: [
				makeTask({
					id: "t1",
					content: "Active task",
					status: "in_progress",
					startedAt: 0,
					priority: "high",
					owner: "agent-1",
				}),
			],
		});

		const { lines } = renderWith(tracker, { renderWidth: 200 });
		const joined = lines.join("\n");
		expect(joined).not.toContain("agent-1");
	});
});
