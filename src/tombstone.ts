import type { Task } from "./types";

/** `true` when a task has been soft-deleted via `todo_remove`. */
export function isTombstoned(task: Task): boolean {
	return task.deletedAt != null;
}

/** Filter out tombstoned (soft-deleted) tasks, returning only live tasks. */
export function activeTasks(tasks: Task[]): Task[] {
	return tasks.filter((t) => t.deletedAt == null);
}
