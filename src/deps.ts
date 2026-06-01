/**
 * Dependency metadata and blocked-state helpers for `pi-todo`.
 *
 * `blockedBy` is optional and lives on each `Task`. It is *not* validated
 * during replay/extraction — `extractTasks()` in `./tracker` faithfully
 * preserves whatever `blockedBy` arrays are stored. Normalization and
 * validation live ONLY at the `todo_write` input boundary.
 *
 * Oracle policy (M2):
 *   - Self-dependencies → strip silently
 *   - Duplicate dependency IDs → dedupe silently
 *   - Unknown dependency IDs (not in the current task list) → strip with a
 *     warning appended to the tool result text
 *   - Dependencies on completed tasks → allowed; not stripped
 *   - Cycles → reject the entire `todo_write` call atomically
 */
import type { Task } from "./types";

// ── Validation result types ─────────────────────────────────────────────

export interface DepValidationOk {
	ok: true;
	tasks: Task[];
	/** Stripped unknown dependency IDs, appended to the tool result as a warning. */
	strippedUnknown: string[];
}

export interface DepValidationError {
	ok: false;
	error: string;
}

export type DepValidation = DepValidationOk | DepValidationError;

export interface DepNormalization {
	tasks: Task[];
	/** Stripped unknown dependency IDs, included in tool result as a warning. */
	strippedUnknown: string[];
}

// ── Pure helpers ─────────────────────────────────────────────────────────

/**
 * Strip self-dependencies and deduplicate dependency IDs. Returns the
 * cleaned array, or `undefined` when the cleaned array is empty (so the
 * caller can drop the field entirely). Does not validate against the
 * current task list or detect cycles.
 */
export function dedupeBlockedBy(task: Task): string[] | undefined {
	const raw = task.blockedBy;
	if (!Array.isArray(raw)) return undefined;
	const seen = new Set<string>();
	const out: string[] = [];
	for (const id of raw) {
		if (typeof id !== "string") continue;
		if (id === task.id) continue; // strip self-dep silently
		if (seen.has(id)) continue;
		seen.add(id);
		out.push(id);
	}
	return out.length === 0 ? undefined : out;
}

/**
 * Strip self-dependencies and duplicates from every task, then strip
 * dependency references to IDs not in the current task list. Returns the
 * cleaned task list and the list of unknown IDs that were removed.
 */
export function normalizeBlockedBy(tasks: Task[]): DepNormalization {
	const ids = new Set(tasks.map((t) => t.id));
	const strippedUnknown: string[] = [];

	const cleaned: Task[] = tasks.map((task) => {
		const before = task.blockedBy;
		const dedupedArr = dedupeBlockedBy(task) ?? [];
		const kept: string[] = [];
		for (const id of dedupedArr) {
			if (ids.has(id)) {
				kept.push(id);
			} else if (!strippedUnknown.includes(id)) {
				strippedUnknown.push(id);
			}
		}
		const next: Task = { ...task };
		if (kept.length > 0) {
			next.blockedBy = kept;
		} else if (before !== undefined) {
			// Drop the field entirely so absent and "all-stripped" look the same.
			delete next.blockedBy;
		}
		return next;
	});

	return { tasks: cleaned, strippedUnknown };
}

/**
 * Detect whether `tasks` contains a dependency cycle using simple DFS over
 * the `blockedBy` graph. Returns the first cycle path found, or `null` when
 * the graph is acyclic.
 */
export function findCycle(tasks: readonly Task[]): string[] | null {
	const byId = new Map(tasks.map((t) => [t.id, t]));

	const visiting = new Set<string>();
	const visited = new Set<string>();
	const path: string[] = [];

	function dfs(id: string): string[] | null {
		if (visiting.has(id)) {
			// Cycle: report the path from the repeated id to the current id.
			const start = path.indexOf(id);
			return start >= 0 ? [...path.slice(start), id] : [id];
		}
		if (visited.has(id)) return null;

		visiting.add(id);
		path.push(id);
		const task = byId.get(id);
		if (task?.blockedBy) {
			for (const dep of task.blockedBy) {
				if (!byId.has(dep)) continue; // unknown deps are stripped at the input boundary
				const cycle = dfs(dep);
				if (cycle) return cycle;
			}
		}
		path.pop();
		visiting.delete(id);
		visited.add(id);
		return null;
	}

	for (const t of tasks) {
		const cycle = dfs(t.id);
		if (cycle) return cycle;
	}
	return null;
}

/**
 * `true` when `task` is blocked: not completed AND at least one dependency
 * ID points to a non-completed task in the same list.
 */
export function isBlocked(task: Task, allTasks: readonly Task[]): boolean {
	if (task.status === "completed") return false;
	if (!task.blockedBy || task.blockedBy.length === 0) return false;
	const byId = new Map(allTasks.map((t) => [t.id, t]));
	for (const depId of task.blockedBy) {
		const dep = byId.get(depId);
		if (dep && dep.status !== "completed") return true;
	}
	return false;
}

/**
 * Apply the full oracle policy to a list of incoming tasks. Returns either:
 *   - `{ ok: true, tasks, strippedUnknown }` — normalized tasks + any unknown-ID warning.
 *   - `{ ok: false, error }` — cycles (and any other future atomic failures).
 */
export function validateDependencyGraph(tasks: Task[]): DepValidation {
	const { tasks: cleaned, strippedUnknown } = normalizeBlockedBy(tasks);
	const cycle = findCycle(cleaned);
	if (cycle) {
		return { ok: false, error: `Dependency cycle detected: ${cycle.join(" → ")}` };
	}
	return { ok: true, tasks: cleaned, strippedUnknown };
}

/**
 * Build the human-readable warning text appended to a `todo_write` result
 * when unknown dependency IDs were stripped. Returns `undefined` when there
 * is nothing to warn about.
 */
export function formatStrippedWarning(strippedUnknown: readonly string[]): string | undefined {
	if (strippedUnknown.length === 0) return undefined;
	return `Warning: blockedBy references removed (not found in task list): ${strippedUnknown.join(", ")}`;
}
