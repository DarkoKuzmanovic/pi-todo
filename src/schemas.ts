import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

// ── Tool schemas ───────────────────────────────────────────────────────────────

export const TaskSchema = Type.Object({
	id: Type.Optional(
		Type.String({
			description:
				"Unique task ID. Omit to auto-generate. " +
				"When updating existing tasks use their current ID to preserve identity.",
		}),
	),
	content: Type.String({
		description: "Clear, actionable task description.",
	}),
	status: StringEnum(["pending", "in_progress", "completed"] as const, {
		description:
			"Task status. " +
			"Set to 'in_progress' for the task you are actively working on right now. " +
			"Only one task should be 'in_progress' at a time unless tasks are genuinely parallel.",
	}),
	priority: StringEnum(["high", "medium", "low"] as const, {
		description: "Task priority.",
	}),
	blockedBy: Type.Optional(
		Type.Array(Type.String(), {
			description:
				"IDs of tasks in this list that must be completed before this task can start. " +
				"Omit or pass an empty array if the task has no dependencies.",
		}),
	),
	// M4 — Optional rich fields (additive). Description, owner, and activeForm
	// are user-authored strings. Metadata is a flat string|number|boolean bag
	// (no null, no nested objects, no arrays) per the I1 input-boundary policy
	// applied in src/rich-fields.ts.
	description: Type.Optional(
		Type.String({
			description:
				"Long-form notes for this task. Reference content; surfaces in `/todos` and the compact widget, never in the prompt.",
		}),
	),
	owner: Type.Optional(
		Type.String({
			description:
				"Free-form owner id (e.g. agent name, user id, sub-agent id). Surfaces in `/todos` only.",
		}),
	),
	metadata: Type.Optional(
		Type.Record(Type.String(), Type.Union([Type.String(), Type.Number(), Type.Boolean()]), {
			description:
				"Flat key-value bag of string|number|boolean. Hidden on every display surface; preserved in canonical state and replay for future surfacing. Invalid keys are dropped at the input boundary with a per-key warning (per I1).",
		}),
	),
	activeForm: Type.Optional(
		Type.String({
			description:
				"Short present-progressive label (e.g. 'writing tests'). Used as the active-task label in the system prompt (escaped per I3) and in `/todos`.",
		}),
	),
});

export const TodoWriteParams = Type.Object({
	tasks: Type.Array(TaskSchema, {
		description:
			"The COMPLETE, updated task list. " +
			"This REPLACES the current list entirely — always include ALL tasks, " +
			"both updated ones and unchanged ones.",
	}),
});

export const TodoRemoveParams = Type.Object({
	ids: Type.Array(Type.String(), {
		description: "Task IDs to remove (soft-delete: tasks are stamped and retained in history for audit).",
	}),
});

// ── M11 — todo_patch schema ───────────────────────────────────────────────────

/**
 * One targeted mutation of an existing task. Absent fields are unchanged;
 * the patch never creates, deletes, or reorders tasks.
 */
export const TodoPatchItem = Type.Object({
	id: Type.String({
		description: "Task ID to patch; must be a live (non-tombstoned) task.",
	}),
	status: Type.Optional(
		StringEnum(["pending", "in_progress", "completed"] as const, {
			description: "New status. Replaces the current status.",
		}),
	),
	priority: Type.Optional(
		StringEnum(["high", "medium", "low"] as const, {
			description: "New priority. Replaces the current priority.",
		}),
	),
	content: Type.Optional(
		Type.String({
			description: "Rename: replaces the task content. Content is required on a task, so it cannot be cleared.",
		}),
	),
	blockedBy: Type.Optional(
		Type.Array(Type.String(), {
			description: "REPLACES the task's whole blockedBy array. Pass [] to clear all dependencies.",
		}),
	),
	description: Type.Optional(
		Type.String({
			description: "Replaces the description. Pass \"\" to clear it.",
		}),
	),
	appendDescription: Type.Optional(
		Type.String({
			description:
				"Appends \"\\n\\n\" + this text to the existing description. Mutually exclusive with description on the same patch.",
		}),
	),
	owner: Type.Optional(
		Type.String({
			description: "Replaces the owner. Pass \"\" to clear it.",
		}),
	),
	activeForm: Type.Optional(
		Type.String({
			description: "Replaces the activeForm label. Pass \"\" to clear it.",
		}),
	),
	metadata: Type.Optional(
		Type.Record(
			Type.String(),
			Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()]),
			{
				description:
					"Per-key shallow merge into the task's metadata bag. A null value DELETES that key " +
					"(patch-boundary delete marker only; null is never stored, I1 preserved). " +
					"Invalid keys are dropped per-key with a warning (I1).",
			},
		),
	),
});

/**
 * M11 — todo_patch parameters. The whole patches array is atomic: all patches
 * apply or none do. minItems 1 — an empty patch list is a caller error.
 */
export const TodoPatchParams = Type.Object({
	patches: Type.Array(TodoPatchItem, {
		minItems: 1,
		description:
			"Targeted updates to existing tasks by ID, without resending the whole list. " +
			"All patches apply atomically or none do. Unknown IDs reject the whole call.",
	}),
});