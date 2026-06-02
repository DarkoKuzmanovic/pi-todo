import { describe, it, expect } from "vitest";
import type { Task, TaskDetails } from "./types";
import { extractTasks } from "./tracker";
import { validateMetadata, coerceRichFields } from "./rich-fields";
import { isBlocked, activeBlockerIds } from "./deps";
import { activeTasks } from "./tombstone";

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── I1 — Input-boundary metadata validation ─────────────────────────────────

describe("validateMetadata (I1)", () => {
	it("returns ok with empty metadata for undefined input", () => {
		const r = validateMetadata(undefined);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.metadata).toBeUndefined();
	});

	it("returns ok with the same flat metadata for valid input", () => {
		const r = validateMetadata({ foo: "bar", n: 1, b: true });
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.metadata).toEqual({ foo: "bar", n: 1, b: true });
		expect(r.dropped).toEqual([]);
	});

	it("preserves value *types* — `1` (number) ≠ `\"1\"` (string) ≠ `true` (boolean)", () => {
		const r = validateMetadata({ a: 1, b: "1", c: true });
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(typeof r.metadata?.a).toBe("number");
			expect(typeof r.metadata?.b).toBe("string");
			expect(typeof r.metadata?.c).toBe("boolean");
			expect(r.metadata?.a).toBe(1);
			expect(r.metadata?.b).toBe("1");
			expect(r.metadata?.c).toBe(true);
		}
	});

	it("preserves the value `false` (falsy-but-valid)", () => {
		const r = validateMetadata({ f: false, n: 0, s: "" });
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.metadata).toEqual({ f: false, n: 0, s: "" });
			expect(r.dropped).toEqual([]);
		}
	});

	it("drops nested-object keys with a per-key named warning", () => {
		const r = validateMetadata({ ok: "yes", bad: { nested: 1 } });
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.metadata).toEqual({ ok: "yes" });
			expect(r.dropped).toHaveLength(1);
			expect(r.dropped[0]).toMatch(/^metadata\.bad /);
			expect(r.dropped[0]).toMatch(/nested/);
		}
	});

	it("drops array values with a per-key named warning", () => {
		const r = validateMetadata({ ok: "yes", arr: [1, 2, 3] });
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.metadata).toEqual({ ok: "yes" });
			expect(r.dropped[0]).toMatch(/^metadata\.arr /);
			expect(r.dropped[0]).toMatch(/array/);
		}
	});

	it("drops null values with a per-key named warning", () => {
		const r = validateMetadata({ ok: "yes", nul: null });
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.metadata).toEqual({ ok: "yes" });
			expect(r.dropped[0]).toMatch(/^metadata\.nul /);
			expect(r.dropped[0]).toMatch(/null/);
		}
	});

	it("survives a mixed bag: keeps valid, drops each invalid with a distinct warning", () => {
		const r = validateMetadata({
			a: 1,
			b: "two",
			c: { nested: true },
			d: [1, 2],
			e: null,
			f: false,
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.metadata).toEqual({ a: 1, b: "two", f: false });
			expect(r.dropped).toHaveLength(3);
			expect(r.dropped.find((w) => w.startsWith("metadata.c "))).toBeDefined();
			expect(r.dropped.find((w) => w.startsWith("metadata.d "))).toBeDefined();
			expect(r.dropped.find((w) => w.startsWith("metadata.e "))).toBeDefined();
		}
	});

	it("rejects malformed container (not an object) with whole-task ok=false", () => {
		const r = validateMetadata("not-an-object");
		expect(r.ok).toBe(false);
	});

	it("rejects malformed container (array) with whole-task ok=false", () => {
		const r = validateMetadata([1, 2, 3]);
		expect(r.ok).toBe(false);
	});

	it("rejects malformed container (null) with whole-task ok=false", () => {
		const r = validateMetadata(null);
		expect(r.ok).toBe(false);
	});
});

// ── B1 — Faithful extraction with type preservation (extractTasks) ─────────

describe("extractTasks — B1 type-preserving passthrough", () => {
	it("returns null for non-object details", () => {
		expect(extractTasks(null)).toBeNull();
		expect(extractTasks("string")).toBeNull();
	});

	it("returns null for details without a tasks array", () => {
		expect(extractTasks({})).toBeNull();
		expect(extractTasks({ tasks: "nope" })).toBeNull();
	});

	it("extracts `description` as a string when present and drops when missing", () => {
		const withDesc = extractTasks({
			tasks: [
				{ id: "t1", content: "x", status: "pending", priority: "medium", createdAt: 0, description: "Long notes" },
			],
		});
		expect(withDesc?.[0].description).toBe("Long notes");

		const withoutDesc = extractTasks({
			tasks: [{ id: "t1", content: "x", status: "pending", priority: "medium", createdAt: 0 }],
		});
		expect(withoutDesc?.[0].description).toBeUndefined();
	});

	it("extracts `owner` as a string when present and drops when missing", () => {
		const r = extractTasks({
			tasks: [
				{ id: "a", content: "x", status: "pending", priority: "medium", createdAt: 0, owner: "agent-1" },
				{ id: "b", content: "y", status: "pending", priority: "medium", createdAt: 0 },
			],
		});
		expect(r?.[0].owner).toBe("agent-1");
		expect(r?.[1].owner).toBeUndefined();
	});

	it("extracts `activeForm` as a string when present and drops when missing", () => {
		const r = extractTasks({
			tasks: [
				{
					id: "a",
					content: "x",
					status: "pending",
					priority: "medium",
					createdAt: 0,
					activeForm: "writing tests",
				},
				{ id: "b", content: "y", status: "pending", priority: "medium", createdAt: 0 },
			],
		});
		expect(r?.[0].activeForm).toBe("writing tests");
		expect(r?.[1].activeForm).toBeUndefined();
	});

	it("B1: preserves metadata value *types* across extractTasks round-trip (typeof + strict-equal per key)", () => {
		const r = extractTasks({
			tasks: [
				{
					id: "t1",
					content: "x",
					status: "pending",
					priority: "medium",
					createdAt: 0,
					metadata: { n: 1, s: "1", b: true, f: false, t: "text" },
				},
			],
		});
		const md = r?.[0].metadata;
		expect(md).toBeDefined();
		expect(typeof md?.n).toBe("number");
		expect(typeof md?.s).toBe("string");
		expect(typeof md?.b).toBe("boolean");
		expect(typeof md?.f).toBe("boolean");
		expect(typeof md?.t).toBe("string");
		// strict-equal per key
		expect(md?.n).toBe(1);
		expect(md?.n).not.toBe("1");
		expect(md?.n).not.toBe(true);
		expect(md?.s).toBe("1");
		expect(md?.b).toBe(true);
		expect(md?.f).toBe(false);
	});

	it("B1: defensive flatness re-validation on a hand-crafted malformed historical entry", () => {
		// Historical entry written before I1 was strict; contains nested objects + arrays.
		// extractTasks must NOT crash and must apply the per-key drop policy.
		const r = extractTasks({
			tasks: [
				{
					id: "t1",
					content: "x",
					status: "pending",
					priority: "medium",
					createdAt: 0,
					metadata: {
						ok: "yes",
						bad: { nested: 1 },
						arr: [1, 2],
						nul: null,
						n: 7,
					},
				},
			],
		});
		const md = r?.[0].metadata;
		expect(md).toBeDefined();
		expect(md?.ok).toBe("yes");
		expect(md?.n).toBe(7);
		expect(md?.bad).toBeUndefined();
		expect(md?.arr).toBeUndefined();
		expect(md?.nul).toBeUndefined();
	});

	it("drops unknown keys silently (whitelist enforced)", () => {
		const r = extractTasks({
			tasks: [
				{
					id: "t1",
					content: "x",
					status: "pending",
					priority: "medium",
					createdAt: 0,
					metadata: { foo: "bar" },
					extraUnknown: "should not appear",
				} as unknown as Task,
			],
		});
		expect(r?.[0].metadata).toEqual({ foo: "bar" });
		expect((r?.[0] as unknown as Record<string, unknown>).extraUnknown).toBeUndefined();
	});

	it("metadata-less task → metadata undefined after extract", () => {
		const r = extractTasks({
			tasks: [{ id: "t1", content: "x", status: "pending", priority: "medium", createdAt: 0 }],
		});
		expect(r?.[0].metadata).toBeUndefined();
	});
});

// ── coerceRichFields — input-boundary author input → stored Task fields ───

describe("coerceRichFields", () => {
	it("returns the input task unchanged when no rich fields are present", () => {
		const t = makeTask();
		const r = coerceRichFields(t, undefined, undefined, undefined, undefined);
		expect(r).toEqual({ description: undefined, owner: undefined, metadata: undefined, activeForm: undefined });
	});

	it("accepts valid string description, owner, activeForm", () => {
		const t = makeTask();
		const r = coerceRichFields(t, "long", "agent-1", undefined, "doing it");
		expect(r.description).toBe("long");
		expect(r.owner).toBe("agent-1");
		expect(r.activeForm).toBe("doing it");
	});

	it("coerces non-string scalars to undefined (input boundary)", () => {
		const t = makeTask();
		const r = coerceRichFields(
			t,
			42 as unknown as string,
			true as unknown as string,
			undefined,
			{} as unknown as string,
		);
		expect(r.description).toBeUndefined();
		expect(r.owner).toBeUndefined();
		expect(r.activeForm).toBeUndefined();
	});

	it("validates metadata and returns only valid keys (I1 per-key drop)", () => {
		const t = makeTask();
		const r = coerceRichFields(t, undefined, undefined, { ok: "yes", bad: { x: 1 } }, undefined);
		expect(r.metadata).toEqual({ ok: "yes" });
	});

	it("returns metadata=undefined when the input metadata is a malformed container", () => {
		const t = makeTask();
		const r = coerceRichFields(
			t,
			undefined,
			undefined,
			"not-an-object" as unknown as Record<string, unknown>,
			undefined,
		);
		expect(r.metadata).toBeUndefined();
	});
});

// ── M-d — `isBlocked`/`activeBlockerIds` ignore rich fields ────────────────

describe("M-d — blocking ignores rich fields", () => {
	it("a task with rich fields + blockedBy computes identical block state to one without rich fields", () => {
		const a = makeTask({ id: "a", status: "completed" });
		const bPlain = makeTask({ id: "b", status: "pending", blockedBy: ["a"] });
		const bRich = makeTask({
			id: "b",
			status: "pending",
			blockedBy: ["a"],
			description: "long",
			owner: "agent-1",
			activeForm: "doing",
			metadata: { k: "v" },
		});

		const allPlain: Task[] = [a, bPlain];
		const allRich: Task[] = [a, bRich];

		expect(isBlocked(bPlain, allPlain)).toBe(false);
		expect(isBlocked(bRich, allRich)).toBe(false);
		expect(activeBlockerIds(bPlain, allPlain)).toEqual([]);
		expect(activeBlockerIds(bRich, allRich)).toEqual([]);

		// Now make a block, both should be blocked the same way.
		const aPending = makeTask({ id: "a", status: "pending" });
		const allBlockedPlain: Task[] = [aPending, bPlain];
		const allBlockedRich: Task[] = [aPending, bRich];
		expect(isBlocked(bPlain, allBlockedPlain)).toBe(true);
		expect(isBlocked(bRich, allBlockedRich)).toBe(true);
		expect(activeBlockerIds(bPlain, allBlockedPlain)).toEqual(["a"]);
		expect(activeBlockerIds(bRich, allBlockedRich)).toEqual(["a"]);
	});

	it("activeTasks keeps rich-field tasks (only filters tombstones)", () => {
		const t = makeTask({ id: "x", description: "x", metadata: { a: 1 } });
		const out = activeTasks([t]);
		expect(out).toHaveLength(1);
		expect(out[0].description).toBe("x");
		expect(out[0].metadata).toEqual({ a: 1 });
	});
});

// ── Schema/model sanity ─────────────────────────────────────────────────────

describe("TaskDetails carries rich fields", () => {
	it("typecheck: a TaskDetails with description/owner/metadata/activeForm compiles", () => {
		const d: TaskDetails = {
			tasks: [
				makeTask({
					description: "long",
					owner: "agent-1",
					metadata: { k: "v" },
					activeForm: "doing",
				}),
			],
		};
		expect(d.tasks[0].description).toBe("long");
		expect(d.tasks[0].owner).toBe("agent-1");
		expect(d.tasks[0].activeForm).toBe("doing");
		expect(d.tasks[0].metadata).toEqual({ k: "v" });
	});
});
