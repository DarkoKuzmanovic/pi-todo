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
