import { matchesKey, Text, truncateToWidth } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-tui";
import { priorityColor, priorityLabel } from "./state";
import type { Task, TaskDetails } from "./types";
import { PRIORITY_ORDER, STATUS_ICON } from "./types";

// ── Shared task-line formatter ────────────────────────────────────────────────

export function formatTaskLine(task: Task, theme: Theme): string {
	// ── Status icon ──
	let icon: string;
	if (task.status === "completed") {
		icon = theme.fg("success", STATUS_ICON.completed);
	} else if (task.status === "in_progress") {
		icon = theme.fg("accent", STATUS_ICON.in_progress);
	} else {
		icon = theme.fg("dim", STATUS_ICON.pending);
	}

	// ── Priority badge ──
	const pColor = priorityColor(task.priority);
	const pLabel = theme.fg(pColor, priorityLabel(task.priority));

	// ── Content styling ──
	let content: string;
	if (task.status === "completed") {
		content = theme.fg("dim", theme.strikethrough(task.content));
	} else if (task.status === "in_progress") {
		content = theme.fg("text", theme.bold(task.content));
	} else {
		content = theme.fg("muted", task.content);
	}

	return `${icon} ${pLabel}  ${content}`;
}

// ── /todos interactive viewer ──────────────────────────────────────────────────

export class TodoViewComponent {
	private cursorIndex: number = 0;
	private showCompleted: boolean = true;
	private cachedWidth?: number;
	private cachedLines?: string[];
	private flatTasks: Task[] = [];

	constructor(
		private readonly tasks: Task[],
		private readonly theme: Theme,
		private readonly onClose: () => void,
	) {
		this.rebuildFlatTasks();
		if (this.flatTasks.length > 0) {
			this.cursorIndex = Math.min(this.cursorIndex, this.flatTasks.length - 1);
		}

		// Take a snapshot at construction time — isolate from store mutations
		this.tasks = [...tasks];
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.onClose();
			return;
		}

		if (matchesKey(data, "up") || data === "k") {
			if (this.cursorIndex > 0) this.cursorIndex--;
			this.invalidate();
			return;
		}

		if (matchesKey(data, "down") || data === "j") {
			if (this.cursorIndex < this.flatTasks.length - 1) this.cursorIndex++;
			this.invalidate();
			return;
		}

		if (data === "c") {
			this.showCompleted = !this.showCompleted;
			this.rebuildFlatTasks();
			this.cursorIndex = Math.min(this.cursorIndex, Math.max(0, this.flatTasks.length - 1));
			this.invalidate();
			return;
		}

		if (matchesKey(data, "home") || data === "g") {
			this.cursorIndex = 0;
			this.invalidate();
			return;
		}

		if (matchesKey(data, "end") || data === "G") {
			this.cursorIndex = Math.max(0, this.flatTasks.length - 1);
			this.invalidate();
			return;
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

		const lines: string[] = [];
		const th = this.theme;

		// ── Header ──
		lines.push("");
		const titleText = " Tasks ";
		const sideLen = Math.max(0, width - titleText.length - 3);
		const headerLine =
			th.fg("borderMuted", "─".repeat(3)) +
			th.fg("accent", th.bold(titleText)) +
			th.fg("borderMuted", "─".repeat(sideLen));
		lines.push(truncateToWidth(headerLine, width));
		lines.push("");

		if (this.tasks.length === 0) {
			lines.push(truncateToWidth(`  ${th.fg("dim", "No tasks yet. Ask the agent to plan the work.")}`, width));
		} else {
			// ── Progress bar ──
			const completedCount = this.tasks.filter((t) => t.status === "completed").length;
			const total = this.tasks.length;
			const barWidth = Math.min(20, width - 22);
			const filled = total > 0 ? Math.round((completedCount / total) * barWidth) : 0;
			const empty = barWidth - filled;
			const bar = `[${th.fg("success", "█".repeat(filled))}${th.fg("dim", "░".repeat(empty))}]`;
			const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
			lines.push(
				truncateToWidth(
					`  ${bar}  ${th.fg("muted", `${completedCount}/${total}`)} ${th.fg("dim", `(${pct}%)`)}`,
					width,
				),
			);
			lines.push("");

			// ── Build sections ──
			const inProgress = this.tasks.filter((t) => t.status === "in_progress");
			const pending = this.tasks
				.filter((t) => t.status === "pending")
				.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
			const done = this.tasks.filter((t) => t.status === "completed");

			let flatIdx = 0;

			if (inProgress.length > 0) {
				lines.push(
					truncateToWidth(
						`  ${th.fg("accent", th.bold("In Progress"))} ${th.fg("dim", `(${inProgress.length})`)}`,
						width,
					),
				);
				for (const t of inProgress) {
					lines.push(...this.renderTask(t, width, flatIdx));
					flatIdx++;
				}
				lines.push("");
			}

			if (pending.length > 0) {
				lines.push(
					truncateToWidth(`  ${th.fg("muted", th.bold("Pending"))} ${th.fg("dim", `(${pending.length})`)}`, width),
				);
				for (const t of pending) {
					lines.push(...this.renderTask(t, width, flatIdx));
					flatIdx++;
				}
				lines.push("");
			}

			if (done.length > 0 && this.showCompleted) {
				lines.push(
					truncateToWidth(`  ${th.fg("dim", th.bold("Completed"))} ${th.fg("dim", `(${done.length})`)}`, width),
				);
				for (const t of done) {
					lines.push(...this.renderTask(t, width, flatIdx));
					flatIdx++;
				}
				lines.push("");
			} else if (done.length > 0 && !this.showCompleted) {
				lines.push(truncateToWidth(`  ${th.fg("dim", `${done.length} completed — press c to show`)}`, width));
				lines.push("");
			}
		}

		// ── Footer ──
		lines.push(truncateToWidth(th.fg("borderMuted", "─".repeat(width)), width));
		const keys = ["↑↓ navigate", "c toggle completed", "esc close"];
		lines.push(truncateToWidth(`  ${th.fg("dim", keys.join("  •  "))}`, width));
		lines.push("");

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	private renderTask(task: Task, width: number, flatIdx: number): string[] {
		const th = this.theme;
		const isFocused = flatIdx === this.cursorIndex;

		// ── Cursor indicator ──
		const cursor = isFocused ? th.fg("accent", "❯") : " ";

		// ── ID hint ──
		const idHint = th.fg("dim", ` [${task.id}]`);

		// ── Format line via shared formatter ──
		const line = formatTaskLine(task, this.theme);

		return [truncateToWidth(`  ${cursor} ${line}${idHint}`, width)];
	}

	private rebuildFlatTasks(): void {
		const inProgress = this.tasks.filter((t) => t.status === "in_progress");
		const pending = this.tasks
			.filter((t) => t.status === "pending")
			.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
		const done = this.showCompleted ? this.tasks.filter((t) => t.status === "completed") : [];

		this.flatTasks = [...inProgress, ...pending, ...done];
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	// ── Tool result rendering (inline, used in both tools) ─────────────────────

	static renderTaskResult(details: TaskDetails | undefined, expanded: boolean, theme: Theme): Text {
		if (!details?.tasks?.length) {
			return new Text(theme.fg("dim", "Task list cleared"), 0, 0);
		}

		const list = details.tasks;
		const doneCount = list.filter((t) => t.status === "completed").length;
		const inProgCount = list.filter((t) => t.status === "in_progress").length;
		const total = list.length;

		// ── Summary line ──
		const parts: string[] = [];
		if (inProgCount > 0) parts.push(theme.fg("accent", `${STATUS_ICON.in_progress} ${inProgCount} active`));
		parts.push(theme.fg("success", `${STATUS_ICON.completed} ${doneCount}/${total} done`));
		let output = parts.join("  ");

		// ── Task lines via shared formatter ──
		const display = expanded ? list : list.slice(0, 5);
		for (const t of display) {
			const line = formatTaskLine(t, theme);
			output += `\n${line} ${theme.fg("dim", `[${t.id}]`)}`;
		}

		if (!expanded && list.length > 5) {
			output += `\n${theme.fg("dim", `... ${list.length - 5} more`)}`;
		}

		return new Text(output, 0, 0);
	}

	// ── Cleanup ──
	dispose(): void {
		// No resources to release currently
	}
}
