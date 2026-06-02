import type { Task } from "./types";
import { activeTasks } from "./tombstone";
import { extractRichFields } from "./rich-fields";

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
		return this.#liveTasks().find((t) => t.status === "in_progress");
	}

	get totalCount(): number {
		return this.#liveTasks().length;
	}

	get pendingCount(): number {
		return this.#liveTasks().filter((t) => t.status === "pending").length;
	}

	get completedCount(): number {
		return this.#liveTasks().filter((t) => t.status === "completed").length;
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
		const liveCurr = this.#liveTasks();
		const livePrev = activeTasks(this._prevSnapshot);

		const prevMap = new Map(livePrev.map((t) => [t.id, t]));
		const currMap = new Map(liveCurr.map((t) => [t.id, t]));

		const completed: Task[] = [];
		const started: Task[] = [];
		const created: Task[] = [];

		for (const task of liveCurr) {
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

		// removedIds = livePrev ids not in liveCurr (incl. live→tombstoned)
		const removedIds = livePrev
			.filter((t) => !currMap.has(t.id))
			.map((t) => t.id);

		return {
			completed,
			started,
			created,
			removedIds,
			total: liveCurr.length,
			active: liveCurr.filter((t) => t.status === "in_progress").length,
			done: liveCurr.filter((t) => t.status === "completed").length,
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

	/** Live (non-tombstoned) task view for derived getters/diff. */
	#liveTasks(): Task[] {
		return activeTasks(this._tasks);
	}
}

// ── Internal helpers ───────────────────────────────────────────────────────

/** Safe extractor for pi-todo's { tasks: Task[] } details shape.
 *  Extracts `blockedBy` faithfully from stored details WITHOUT validating
 *  or normalizing dependency references. Replay-time validation lives in
 *  `./deps.ts` and is invoked only at the `todo_write` input boundary. */
export function extractTasks(details: unknown): Task[] | null {
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
			blockedBy: extractBlockedBy(t.blockedBy),
			deletedAt: t.deletedAt != null ? Number(t.deletedAt) : undefined,
			// M4 — rich fields. Sibling-consistent safe coercion for the three
			// user-authored strings (drop when not a string). Metadata goes through
			// extractRichFields for B1 type-preserving passthrough + defensive
			// flatness re-validation on history.
			description: typeof t.description === "string" ? t.description : undefined,
			owner: typeof t.owner === "string" ? t.owner : undefined,
			activeForm: typeof t.activeForm === "string" ? t.activeForm : undefined,
			metadata: extractRichFields(t.metadata),
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

/**
 * Extract a `blockedBy` array of strings from an unknown value, filtering
 * out non-string entries. Returns `undefined` when the cleaned array is
 * empty. Faithfully preserves any dependency references it finds —
 * validation/normalization is a `todo_write`-boundary concern in
 * `./deps.ts`.
 */
function extractBlockedBy(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const out: string[] = [];
	for (const id of value) {
		if (typeof id !== "string") continue;
		out.push(id);
	}
	return out.length === 0 ? undefined : out;
}
