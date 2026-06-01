import type { Task } from "./types";

// ── Diff result ────────────────────────────────────────────────────────────

export interface DiffResult {
	completed: Task[];
	started: Task[];
	created: Task[];
	removedIds: string[];
	total: number;
	active: number;
	done: number;
}

// ── Clock type ─────────────────────────────────────────────────────────────

/** Injectable clock for deterministic elapsed-time formatting. Defaults to Date.now. */
export type Clock = () => number;

// ── TaskTracker ────────────────────────────────────────────────────────────

export class TaskTracker {
	private _tasks: Task[] = [];
	private _prevSnapshot: Task[] = [];
	private _clock: Clock;

	constructor(clock?: Clock) {
		this._clock = clock ?? Date.now;
	}

	get tasks(): readonly Task[] {
		return this._tasks;
	}

	get activeTask(): Task | undefined {
		return this._tasks.find((t) => t.status === "in_progress");
	}

	get totalCount(): number {
		return this._tasks.length;
	}

	get pendingCount(): number {
		return this._tasks.filter((t) => t.status === "pending").length;
	}

	get completedCount(): number {
		return this._tasks.filter((t) => t.status === "completed").length;
	}

	/** Replaces current state from a pi-todo details.tasks payload.
	 *  Returns false when nothing changed (no-op). */
	reconstructFromDetails(details: unknown): boolean {
		const tasks = extractTasks(details);
		if (!tasks) return false;

		const serialized = JSON.stringify(tasks);
		if (serialized === JSON.stringify(this._tasks)) return false;

		this._prevSnapshot = this._tasks;
		this._tasks = tasks;
		return true;
	}

	/** Compute transitions since the last snapshot. */
	diff(): DiffResult {
		const prevMap = new Map(this._prevSnapshot.map((t) => [t.id, t]));
		const currMap = new Map(this._tasks.map((t) => [t.id, t]));

		const completed: Task[] = [];
		const started: Task[] = [];
		const created: Task[] = [];

		for (const task of this._tasks) {
			const prev = prevMap.get(task.id);
			if (!prev) {
				created.push(task);
			} else if (prev.status !== task.status) {
				if (task.status === "completed" && prev.status === "in_progress") {
					completed.push(task);
				}
				if (task.status === "in_progress" && prev.status === "pending") {
					started.push(task);
				}
			}
		}

		const removedIds = this._prevSnapshot
			.filter((t) => !currMap.has(t.id))
			.map((t) => t.id);

		return {
			completed,
			started,
			created,
			removedIds,
			total: this._tasks.length,
			active: this._tasks.filter((t) => t.status === "in_progress").length,
			done: this._tasks.filter((t) => t.status === "completed").length,
		};
	}

	/** Human-readable elapsed time for a task.
	 *  Shows time from startedAt (or createdAt) to now (or completedAt). */
	formatElapsed(task: Task): string {
		const from = task.startedAt ?? task.createdAt;
		const to =
			task.status === "completed"
				? (task.completedAt ?? this._clock())
				: this._clock();
		const ms = to - from;
		if (ms < 0) return "now";
		const sec = Math.floor(ms / 1000);
		if (sec < 60) return `${sec}s`;
		const min = Math.floor(sec / 60);
		if (min < 60) return `${min}m ${sec % 60}s`;
		const hr = Math.floor(min / 60);
		return `${hr}h ${min % 60}m`;
	}
}

// ── Internal helpers ───────────────────────────────────────────────────────

/** Safe extractor for pi-todo's { tasks: Task[] } details shape. */
function extractTasks(details: unknown): Task[] | null {
	if (!details || typeof details !== "object") return null;
	const d = details as Record<string, unknown>;
	const arr = d.tasks;
	if (!Array.isArray(arr)) return null;
	const tasks: Task[] = [];
	for (const item of arr) {
		if (!item || typeof item !== "object") continue;
		const t = item as Record<string, unknown>;
		if (typeof t.id !== "string") continue;
		tasks.push({
			id: t.id,
			content: String(t.content ?? ""),
			status: validStatus(t.status),
			priority: validPriority(t.priority),
			createdAt: Number(t.createdAt ?? 0),
			startedAt: t.startedAt != null ? Number(t.startedAt) : undefined,
			completedAt: t.completedAt != null ? Number(t.completedAt) : undefined,
		});
	}
	return tasks;
}

function validStatus(v: unknown): "pending" | "in_progress" | "completed" {
	if (v === "pending" || v === "in_progress" || v === "completed") return v;
	return "pending";
}

function validPriority(v: unknown): "high" | "medium" | "low" {
	if (v === "high" || v === "medium" || v === "low") return v;
	return "medium";
}
