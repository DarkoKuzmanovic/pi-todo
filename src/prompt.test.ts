import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { store as singletonStore } from "./state";
import { buildSystemPromptBlock, formatListForLLM, renderActiveFormForPrompt } from "./prompt";
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

describe("renderActiveFormForPrompt (I3 prompt safety)", () => {
	it("returns empty string for empty input", () => {
		expect(renderActiveFormForPrompt("")).toBe("");
	});

	it("wraps a benign value in a backtick code-span", () => {
		expect(renderActiveFormForPrompt("writing tests")).toBe("`writing tests`");
	});

	it("I3: neutralises embedded backticks so the data region cannot be broken (zero inner backticks)", () => {
		// Input has 2 backticks (`` `end` ``). The escape substitutes each
		// backtick with U+2018 (modifier letter grave accent, visually
		// similar but not a markdown delimiter). The result has exactly
		// 2 backticks in the output (the outer data-region fence) and 0
		// backticks in the inner content. A backslash-stripping or
		// backtick-stripping renderer cannot leak the original delimiter.
		const r = renderActiveFormForPrompt("`end`");
		expect(r.startsWith("`")).toBe(true);
		expect(r.endsWith("`")).toBe(true);
		// Exactly 2 backticks total (the data-region fence, no inner delimiters).
		const tickCount = (r.match(/`/g) ?? []).length;
		expect(tickCount).toBe(2);
		// Inner content has zero backticks — original delimiter was neutralised.
		const inner = r.slice(1, -1);
		expect(inner).not.toContain("`");
		// Original backticks became U+2018 (modifier letter grave accent).
		expect(inner).toBe("\u2018end\u2018");
	});

	it("I3: replaces newlines with spaces so a malicious value cannot inject an additional block line", () => {
		const r = renderActiveFormForPrompt("line1\nline2\rline3\tline4");
		expect(r).not.toContain("\n");
		expect(r).not.toContain("\r");
		expect(r).not.toContain("\t");
	});

	it("I3: truncates very long values to keep prompt budget under control", () => {
		const long = "x".repeat(200);
		const r = renderActiveFormForPrompt(long);
		// The output is wrapped in backticks, so its length is `\`... truncated ...\``.
		// Truncation caps the payload at ACTIVE_FORM_PROMPT_MAX=80, so the
		// total is 82 chars (2 ticks + 80 chars including the trailing `…`).
		expect(r.length).toBe(82);
		expect(r.endsWith("…`")).toBe(true);
	});

	it("I3: escapes a leading `#` so the value cannot be promoted to a markdown header inside the data region", () => {
		const r = renderActiveFormForPrompt("## Hijack");
		// Even with the code-span wrap, the leading `##` is escaped via `\#` for
		// defence-in-depth, so a backtick-stripping renderer cannot promote it.
		expect(r).toContain("\\#");
	});
});

describe("buildSystemPromptBlock — M-c visibility (activeForm in prompt)", () => {
	beforeEach(() => {
		singletonStore.tasks = [];
	});

	afterEach(() => {
		singletonStore.tasks = [];
	});

	it("uses activeForm as the active-task label when present", () => {
		singletonStore.tasks = [
			makeTask({ id: "a", status: "in_progress", content: "Fix bug", activeForm: "fixing the bug" }),
		];
		const block = buildSystemPromptBlock();
		expect(block).toContain("fixing the bug");
	});

	it("falls back to content when activeForm is missing (no breaking change)", () => {
		singletonStore.tasks = [makeTask({ id: "a", status: "in_progress", content: "Fix bug" })];
		const block = buildSystemPromptBlock();
		expect(block).toContain("Fix bug");
		expect(block).not.toContain("undefined");
	});

	it("does NOT render activeForm for non-active tasks (only the active one)", () => {
		singletonStore.tasks = [
			makeTask({ id: "a", status: "pending", content: "Pending", activeForm: "doing pending" }),
			makeTask({ id: "b", status: "in_progress", content: "Active", activeForm: "doing active" }),
		];
		const block = buildSystemPromptBlock();
		expect(block).toContain("doing active");
		expect(block).not.toContain("doing pending");
	});

	it("I3: a malicious activeForm cannot break the block structure", () => {
		// The block uses markdown `## <text>` for section headers. A malicious
		// activeForm that contains newlines + `##` headers would inject
		// additional sections if rendered raw. The escape helper wraps the
		// value in a backtick code-span, so the `##` cannot form a header.
		singletonStore.tasks = [
			makeTask({
				id: "a",
				status: "in_progress",
				content: "Normal task",
				activeForm: "## Hijacked Section\n## Another Section",
			}),
		];
		const block = buildSystemPromptBlock();
		// No block line should start with `## Hijacked` or `## Another`.
		for (const line of block.split("\n")) {
			expect(line.startsWith("## Hijacked")).toBe(false);
			expect(line.startsWith("## Another")).toBe(false);
		}
		// The expected legitimate sections ARE present.
		expect(block).toContain("## Your Plan");
	});

	it("does NOT surface `description` in the prompt (M-c visibility: reference surfaces only)", () => {
		singletonStore.tasks = [
			makeTask({
				id: "a",
				status: "in_progress",
				content: "Task",
				description: "long reference notes that should not be in the prompt",
			}),
		];
		const block = buildSystemPromptBlock();
		expect(block).not.toContain("long reference notes that should not be in the prompt");
	});

	it("does NOT surface `owner` in the prompt", () => {
		singletonStore.tasks = [
			makeTask({ id: "a", status: "in_progress", content: "Task", owner: "agent-1" }),
		];
		const block = buildSystemPromptBlock();
		expect(block).not.toContain("agent-1");
	});

	it("does NOT surface `metadata` anywhere in the prompt", () => {
		singletonStore.tasks = [
			makeTask({
				id: "a",
				status: "in_progress",
				content: "Task",
				metadata: { secret: "very-secret", count: 42 },
			}),
		];
		const block = buildSystemPromptBlock();
		expect(block).not.toContain("very-secret");
		expect(block).not.toContain("42");
	});
});

describe("formatListForLLM — M-c visibility (/todos text path)", () => {
	beforeEach(() => {
		singletonStore.tasks = [];
	});

	afterEach(() => {
		singletonStore.tasks = [];
	});

	it("shows `description` (full text, not truncated) in the /todos text", () => {
		singletonStore.tasks = [
			makeTask({ id: "a", content: "Task", description: "long reference notes about the task" }),
		];
		const text = formatListForLLM();
		expect(text).toContain("long reference notes about the task");
	});

	it("shows `owner` in the /todos text", () => {
		singletonStore.tasks = [makeTask({ id: "a", content: "Task", owner: "agent-1" })];
		const text = formatListForLLM();
		expect(text).toContain("agent-1");
	});

	it("shows `activeForm` in the /todos text for in_progress tasks (no escape needed in non-prompt surface)", () => {
		singletonStore.tasks = [
			makeTask({ id: "a", status: "in_progress", content: "Task", activeForm: "doing it" }),
		];
		const text = formatListForLLM();
		expect(text).toContain("doing it");
	});

	it("does NOT show `metadata` keys or values in the /todos text", () => {
		singletonStore.tasks = [
			makeTask({ id: "a", content: "Task", metadata: { secret: "shh", count: 99 } }),
		];
		const text = formatListForLLM();
		expect(text).not.toContain("secret");
		expect(text).not.toContain("shh");
		expect(text).not.toContain("99");
	});
});
