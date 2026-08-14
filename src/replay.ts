import type { TaskDetails } from "./types";

// ── Constants ──────────────────────────────────────────────────────────────

/** Tool names whose result details carry the authoritative task list. */
export const TODO_WRITE = "todo_write";
export const TODO_REMOVE = "todo_remove";
export const TODO_PATCH = "todo_patch";

/** Custom session entry type for extension-owned task snapshots. */
export const TODO_SNAPSHOT_CUSTOM_TYPE = "pi-todo:snapshot";

/** Snapshot schema version for future migrations. */
export const TODO_SNAPSHOT_VERSION = 1;

// ── Types ──────────────────────────────────────────────────────────────────

export type TodoToolName = typeof TODO_WRITE | typeof TODO_REMOVE | typeof TODO_PATCH;

export interface TodoSnapshotData {
	version: typeof TODO_SNAPSHOT_VERSION;
	details: TaskDetails;
}

export type TodoReplaySource =
	| {
			kind: "tool_result";
			toolName: TodoToolName;
			details: unknown;
	  }
	| {
			kind: "snapshot";
			customType: typeof TODO_SNAPSHOT_CUSTOM_TYPE;
			details: unknown;
	  };

// ── Snapshot helpers ───────────────────────────────────────────────────────

/** Build the payload passed to `pi.appendEntry()` during compaction.
 *
 * `session_start` does not fire after `/compact`; a future M1-T3 hook should
 * append this custom entry in `session_before_compact`, then refresh from the
 * kept branch in `session_compact` without replacing Pi's default compaction.
 */
export function createTodoSnapshot(details: TaskDetails): TodoSnapshotData {
	return {
		version: TODO_SNAPSHOT_VERSION,
		details,
	};
}

// ── Replay helpers ─────────────────────────────────────────────────────────

/**
 * Walk a session branch in path order and return the latest pi-todo replay
 * source. Today `getBranch()` is append-only and still includes old tool
 * results after compaction; custom snapshots make that accidental correctness
 * explicit and resilient if future compaction semantics hide older entries.
 *
 * Malformed latest supported replay data is returned as authoritative invalid
 * data instead of being skipped, so all projections can clear symmetrically.
 */
export function latestTodoReplaySource(
	branch: readonly unknown[],
): TodoReplaySource | undefined {
	let latest: TodoReplaySource | undefined;
	for (const entry of branch) {
		const toolSource = readTodoToolSource(entry);
		if (toolSource) {
			latest = toolSource;
			continue;
		}

		const snapshotSource = readTodoSnapshotSource(entry);
		if (snapshotSource) latest = snapshotSource;
	}
	return latest;
}

function readTodoToolSource(entry: unknown): TodoReplaySource | undefined {
	const record = asRecord(entry);
	if (record?.type !== "message") return undefined;

	const message = asRecord(record.message);
	if (message?.role !== "toolResult") return undefined;
	if (!isTodoToolName(message.toolName)) return undefined;

	return {
		kind: "tool_result",
		toolName: message.toolName,
		details: message.details,
	};
}

function readTodoSnapshotSource(entry: unknown): TodoReplaySource | undefined {
	const record = asRecord(entry);
	if (record?.type !== "custom") return undefined;
	if (record.customType !== TODO_SNAPSHOT_CUSTOM_TYPE) return undefined;

	return {
		kind: "snapshot",
		customType: TODO_SNAPSHOT_CUSTOM_TYPE,
		details: readSnapshotDetails(record.data),
	};
}

function readSnapshotDetails(data: unknown): unknown {
	const record = asRecord(data);
	if (record?.version !== TODO_SNAPSHOT_VERSION) return undefined;
	return record.details;
}

function isTodoToolName(value: unknown): value is TodoToolName {
	return value === TODO_WRITE || value === TODO_REMOVE || value === TODO_PATCH;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== "object") return undefined;
	return value as Record<string, unknown>;
}
