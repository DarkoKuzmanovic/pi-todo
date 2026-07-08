import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { latestTodoReplaySource } from "./replay";
import { extractTasks } from "./tracker";
import type { Task, TaskPriority } from "./types";

// ── TodoStore ──────────────────────────────────────────────────────────────────

export class TodoStore {
	tasks: Task[] = [];
	idCounter: number = 0;

	generateId(): string {
		return `t${++this.idCounter}`;
	}

	activeTasks(): Task[] {
		return this.tasks.filter((t) => t.status !== "completed" && t.deletedAt == null);
	}

	setTasks(next: Task[]): void {
		this.tasks = next;
	}

	syncIdCounter(): void {
		for (const t of this.tasks) {
			const match = /^t(\d+)$/.exec(t.id);
			if (match) {
				const [, digits] = match;
				if (digits) this.idCounter = Math.max(this.idCounter, parseInt(digits, 10));
			}
		}
	}

	removeByIds(ids: string[]): string[] {
		const removed: string[] = [];
		const idSet = new Set(ids);
		for (const t of this.tasks) {
			if ((idSet.has(t.id)) && t.deletedAt == null) {
				t.deletedAt = Date.now();
				removed.push(t.id);
			}
		}
		return removed;
	}

	/** Apply status transitions and stamp timestamps accordingly. */
	applyStatusTransitions(updated: Task[]): void {
		const now = Date.now();
		const existing = new Map(this.tasks.map((t) => [t.id, t]));

		for (const task of updated) {
			const prev = existing.get(task.id);
			if (!prev) {
				// New task — set createdAt
				task.createdAt = task.createdAt ?? now;
				if (task.status === "in_progress") task.startedAt = now;
				if (task.status === "completed") {
					task.startedAt = task.startedAt ?? now;
					task.completedAt = now;
				}
				continue;
			}
			// Existing task — carry forward timestamps, apply transitions
			task.createdAt = prev.createdAt;
			task.startedAt = prev.startedAt;
			task.completedAt = prev.completedAt;

			if (prev.status !== "in_progress" && task.status === "in_progress") {
				task.startedAt = now;
			}
			if (prev.status !== "completed" && task.status === "completed") {
				task.startedAt = task.startedAt ?? now;
				task.completedAt = now;
			}
			// If reverted from completed back to in_progress/pending, clear completedAt
			if (prev.status === "completed" && task.status !== "completed") {
				task.completedAt = undefined;
			}
		}
	}
}

// ── Singleton ──────────────────────────────────────────────────────────────────

export const store = new TodoStore();

// ── Session reconstruction ─────────────────────────────────────────────────────

export function reconstructState(ctx: ExtensionContext): void {
	store.tasks = [];
	store.idCounter = 0;

	let branch: ReturnType<ExtensionContext["sessionManager"]["getBranch"]>;
	try {
		branch = ctx.sessionManager.getBranch();
	} catch {
		return;
	}

	const source = latestTodoReplaySource(branch);
	if (source) {
		store.tasks = extractTasks(source.details) ?? [];
	}
	store.syncIdCounter();
}

// ── Status bar ─────────────────────────────────────────────────────────────────

export function updateWidget(ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;
	const active = store.activeTasks();

	if (active.length === 0) {
		ctx.ui.setWidget("pi-todo", undefined);
		ctx.ui.setStatus("pi-todo", undefined);
		return;
	}

	const th = ctx.ui.theme;
	const inProg = active.filter((t) => t.status === "in_progress");
	const pending = active.filter((t) => t.status === "pending");
	const doneCount = store.tasks.filter((t) => t.status === "completed" && t.deletedAt == null).length;

	const parts: string[] = [];
	if (inProg.length > 0) parts.push(`\uf111 ${th.fg("accent", String(inProg.length))}`);
	if (pending.length > 0) parts.push(`\uf4aa ${th.fg("muted", String(pending.length))}`);
	if (doneCount > 0) parts.push(`\uf00c ${th.fg("success", String(doneCount))}`);
	ctx.ui.setStatus("pi-todo", parts.join("  "));
}

// ── Shared rendering helpers ───────────────────────────────────────────────────

export const PRIORITY_THEME_COLOR: Record<TaskPriority, "error" | "warning" | "dim"> = {
	high: "error",
	medium: "warning",
	low: "dim",
};

export function priorityColor(p: TaskPriority): "error" | "warning" | "dim" {
	return PRIORITY_THEME_COLOR[p];
}

export function priorityLabel(p: TaskPriority): string {
	return p.charAt(0).toUpperCase() + p.slice(1);
}
