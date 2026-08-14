/**
 * M11 — Pure `todo_patch` merge rules.
 *
 * `applyPatch` is the pure core of the `todo_patch` tool: it computes the
 * next `Task` for one patch without touching any store state. The tool layer
 * (src/index.ts) builds a merged candidate list from these per-task results
 * and runs the exact same commit tail as `todo_write`, so atomicity and the
 * M2 dependency pipeline live there, not here.
 *
 * Field semantics (spec §2):
 *   - `status` / `priority`          — replace
 *   - `content`                      — replace (not clearable; content is required)
 *   - `blockedBy`                    — whole-array replace; `[]` deletes the field
 *   - `description` / `owner` / `activeForm` — replace; `""` deletes the field
 *   - `appendDescription`            — stored ? stored + "\n\n" + text : text
 *   - `metadata`                     — per-key shallow merge; `null` deletes the key
 *   - absent field                   — unchanged
 */

import type { Task, TaskMetadata } from "./types";
import { validateMetadata } from "./rich-fields";

/**
 * One targeted mutation, mirroring the `TodoPatchItem` TypeBox schema in
 * src/schemas.ts. The `metadata` bag admits `null` as a patch-boundary delete
 * marker only; `null` is never stored (I1 preserved).
 */
export interface TaskPatch {
	id: string;
	status?: Task["status"];
	priority?: Task["priority"];
	content?: string;
	blockedBy?: string[];
	description?: string;
	appendDescription?: string;
	owner?: string;
	activeForm?: string;
	metadata?: Record<string, string | number | boolean | null>;
}

/** `true` when a rich-field clear (`""`) or a delete marker removes a field. */
function applyStringField(next: Task, key: "description" | "owner" | "activeForm", value: string): void {
	if (value === "") {
		delete next[key];
	} else {
		next[key] = value;
	}
}

/**
 * Result of applying one patch. `dropped` carries I1 per-key metadata
 * warning strings (same shape as `validateMetadata(...).dropped`) so the
 * tool layer can warn-and-continue without a second validation pass.
 */
export interface ApplyPatchResult {
	task: Task;
	dropped: string[];
}

/**
 * Apply one patch to one task and return the resulting task plus any I1
 * metadata drop warnings.
 *
 * Pure: the input task is never mutated; a shallow-copied `Task` is returned.
 * Metadata merge splits `null` delete markers out BEFORE `validateMetadata`
 * runs on the remainder, so the stored bag stays I1-clean (flat
 * `string|number|boolean`, no nulls, invalid keys dropped).
 */
export function applyPatch(task: Task, patch: TaskPatch): ApplyPatchResult {
	const next: Task = { ...task };
	const dropped: string[] = [];

	if (patch.status !== undefined) next.status = patch.status;
	if (patch.priority !== undefined) next.priority = patch.priority;
	if (patch.content !== undefined) next.content = patch.content;
	if (patch.blockedBy !== undefined) {
		if (patch.blockedBy.length === 0) {
			delete next.blockedBy;
		} else {
			next.blockedBy = [...patch.blockedBy];
		}
	}
	if (patch.description !== undefined) applyStringField(next, "description", patch.description);
	if (patch.owner !== undefined) applyStringField(next, "owner", patch.owner);
	if (patch.activeForm !== undefined) applyStringField(next, "activeForm", patch.activeForm);
	if (patch.appendDescription !== undefined) {
		next.description = next.description
			? `${next.description}\n\n${patch.appendDescription}`
			: patch.appendDescription;
	}
	if (patch.metadata !== undefined) {
		const merged: TaskMetadata = { ...(next.metadata ?? {}) };
		for (const [key, value] of Object.entries(patch.metadata)) {
			// Patch-boundary delete marker — split out BEFORE validation so the
			// stored bag never carries a null (I1).
			if (value === null) {
				delete merged[key];
				continue;
			}
			merged[key] = value;
		}
		// I1 per-key policy on the merged remainder: invalid keys are dropped.
		const validated = validateMetadata(merged);
		if (validated.ok) {
			dropped.push(...validated.dropped);
			if (validated.metadata === undefined) {
				delete next.metadata;
			} else {
				next.metadata = validated.metadata;
			}
		} else {
			// Container malformed after merge — should be unreachable when the
			// tool preflights the patch bag; leave metadata unchanged.
			dropped.push(validated.error);
		}
	}

	return { task: next, dropped };
}
