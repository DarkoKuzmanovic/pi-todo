// ── Types ──────────────────────────────────────────────────────────────────────

export type TaskStatus = "pending" | "in_progress" | "completed";
export type TaskPriority = "high" | "medium" | "low";

/**
 * Allowed metadata value types (M4 — flat key-value bag).
 * `null` is explicitly NOT allowed; nested objects and arrays are NOT allowed.
 */
export type MetadataValue = string | number | boolean;
export type TaskMetadata = Record<string, MetadataValue>;

export interface Task {
	id: string;
	content: string;
	status: TaskStatus;
	priority: TaskPriority;
	createdAt: number;
	startedAt?: number;
	completedAt?: number;
	/** IDs of tasks in this list that must be completed before this task can start. */
	blockedBy?: string[];
	/** Epoch-millisecond timestamp set by `todo_remove`. Presence means the task
	 *  has been soft-deleted (tombstoned). Absence means a live task. */
	deletedAt?: number;
	/** M4 — Optional long-form notes. Reference content; surfaces in `/todos`
	 *  and the compact widget, never in the prompt. */
	description?: string;
	/** M4 — Optional free-form owner id (e.g. "agent-1", "user", or a sub-agent
	 *  id). Surfaces in `/todos` only. */
	owner?: string;
	/** M4 — Optional flat key-value bag. Hidden on every surface; preserved in
	 *  canonical state + replay/snapshot for future surfacing. Per-key reject-with-named-warning
	 *  on invalid values (I1). Type-preserving on extraction (B1). */
	metadata?: TaskMetadata;
	/** M4 — Optional short present-progressive label (e.g. "writing tests"). Used
	 *  as the active-task label in the system prompt (escaped per I3) and in `/todos`. */
	activeForm?: string;
}

export interface TaskDetails {
	tasks: Task[];
}

// ── Visual constants ───────────────────────────────────────────────────────────

export const STATUS_ICON: Record<TaskStatus, string> = {
	pending: "\uf4aa",
	in_progress: "\uf111",
	completed: "\uf00c",
};

export const PRIORITY_ORDER: Record<TaskPriority, number> = {
	high: 0,
	medium: 1,
	low: 2,
};
