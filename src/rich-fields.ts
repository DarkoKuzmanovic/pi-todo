/**
 * M4 — Optional rich task fields: `description`, `owner`, `metadata`, `activeForm`.
 *
 * Two policy-bearing helpers:
 *
 *   - `validateMetadata(input)` — I1 input-boundary policy. Per-key reject-with-named-warning.
 *     Whole-task rejection only when the metadata *container* itself is malformed (not an
 *     object). Valid keys survive; invalid keys are dropped with a warning naming the key.
 *     Used at the `todo_write` input boundary.
 *
 *   - `coerceRichFields(task, description, owner, metadata, activeForm)` — Input-boundary
 *     coercion from the agent's payload to stored `Task` rich fields. Also used at the
 *     `todo_write` boundary.
 *
 * `extractRichFields(input)` — B1 replay extraction. Type-preserving passthrough for
 * historical/snapshot data, with the same per-key drop policy applied defensively to
 * malformed metadata (so a pre-I1 historical entry cannot crash replay or inject a
 * nested object into the canonical store). The "no normalization at replay" M1 invariant
 * is preserved for non-malformed data: types come through byte-identical.
 */

import type { MetadataValue, Task, TaskMetadata } from "./types";

// ── I1 — Input-boundary validation result ────────────────────────────────────

export interface RichFieldsValidationOk {
	ok: true;
	/** The cleaned metadata (only valid keys); `undefined` when input was undefined
	 *  or when every key was dropped. */
	metadata?: TaskMetadata;
	/** Per-key warning messages for dropped keys (e.g.
	 *  `"metadata.bad dropped: nested objects not allowed"`). */
	dropped: string[];
}

export interface RichFieldsValidationError {
	ok: false;
	/** Whole-task-rejection reason: the metadata *container* itself was malformed. */
	error: string;
}

export type RichFieldsValidation = RichFieldsValidationOk | RichFieldsValidationError;

// ── I1 — validateMetadata ────────────────────────────────────────────────────

/**
 * Apply the I1 per-key reject-with-named-warning policy to a `metadata` candidate.
 *
 * - `undefined` input → `{ ok: true, metadata: undefined, dropped: [] }`.
 * - Non-object container (string, number, array, null) → `{ ok: false, error }`
 *   (whole-task rejection, NOT a silent strip).
 * - Each key is independently validated; invalid keys are dropped with a warning
 *   naming the key and the reason.
 *
 * Reasons recognised:
 *   - nested object/array value → "nested objects not allowed" / "arrays not allowed"
 *   - null value → "null not allowed"
 *   - non-string key (e.g. numeric) → "non-string key"
 *   - non-primitive (other) → "unsupported value type"
 */
export function validateMetadata(input: unknown): RichFieldsValidation {
	if (input === undefined) {
		return { ok: true, metadata: undefined, dropped: [] };
	}
	// Whole-container rejection: not an object (covers strings, numbers, arrays, null).
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		return {
			ok: false,
			error: `metadata rejected: not an object (got ${describeType(input)})`,
		};
	}

	const out: TaskMetadata = {};
	const dropped: string[] = [];
	const record = input as Record<string, unknown>;

	for (const key of Object.keys(record)) {
		if (typeof key !== "string") {
			// Defensive — Object.keys always returns strings, but typed as string already.
			dropped.push(`metadata.<non-string key> dropped: non-string key`);
			continue;
		}
		const value = record[key];
		if (value === null) {
			dropped.push(`metadata.${key} dropped: null not allowed`);
			continue;
		}
		if (Array.isArray(value)) {
			dropped.push(`metadata.${key} dropped: arrays not allowed`);
			continue;
		}
		if (typeof value === "object") {
			dropped.push(`metadata.${key} dropped: nested objects not allowed`);
			continue;
		}
		const t = typeof value;
		if (t !== "string" && t !== "number" && t !== "boolean") {
			dropped.push(`metadata.${key} dropped: unsupported value type (${t})`);
			continue;
		}
		// Cast through MetadataValue — we have just narrowed to string|number|boolean.
		out[key] = value as MetadataValue;
	}

	return {
		ok: true,
		metadata: Object.keys(out).length === 0 ? undefined : out,
		dropped,
	};
}

function describeType(v: unknown): string {
	if (v === null) return "null";
	if (Array.isArray(v)) return "array";
	return typeof v;
}

// ── B1 — extractRichFields (replay) ──────────────────────────────────────────

/**
 * Replay-side counterpart of `validateMetadata`. Same per-key policy; same
 * defensive guard against pre-I1 historical entries. Returns `undefined` when
 * the input is missing, malformed, or has no surviving keys (mirrors the
 * "absent = no rich field" semantic of the stored type).
 */
export function extractRichFields(input: unknown): TaskMetadata | undefined {
	const r = validateMetadata(input);
	if (!r.ok) return undefined;
	return r.metadata;
}

// ── coerceRichFields — input-boundary author input → stored Task fields ─────

export interface CoercedRichFields {
	description?: string;
	owner?: string;
	metadata?: TaskMetadata;
	activeForm?: string;
}

/**
 * Coerce a `todo_write` candidate's rich-field inputs into the shape stored on
 * a `Task`. Description/owner/activeForm must be strings (or undefined); non-string
 * scalars are dropped (input-boundary discipline). Metadata goes through
 * `validateMetadata` (I1).
 */
export function coerceRichFields(
	_task: Task,
	description: unknown,
	owner: unknown,
	metadata: unknown,
	activeForm: unknown,
): CoercedRichFields {
	const desc = typeof description === "string" ? description : undefined;
	const own = typeof owner === "string" ? owner : undefined;
	const af = typeof activeForm === "string" ? activeForm : undefined;
	const md = extractRichFields(metadata);
	return { description: desc, owner: own, metadata: md, activeForm: af };
}
