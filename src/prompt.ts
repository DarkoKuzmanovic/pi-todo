import { priorityLabel, store } from "./state";
import { isBlocked } from "./deps";
import { STATUS_ICON } from "./types";
import { PRIORITY_ORDER } from "./types";

// ── System prompt injection ────────────────────────────────────────────────────

export function buildSystemPromptBlock(): string {
	const active = store.tasks.filter((t) => t.status !== "completed");
	if (active.length === 0) return "";

	const lines: string[] = [
		"## Your Plan",
		"",
		"Follow this plan in order. Mark each task \"in_progress\" before starting it, \"completed\" when done:",
		"",
	];

	const inProg = active.filter((t) => t.status === "in_progress");
	const allTasks = [...store.tasks];
	const unblockedPending = active
		.filter((t) => t.status === "pending" && !isBlocked(t, allTasks))
		.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
	const blockedPending = active
		.filter((t) => t.status === "pending" && isBlocked(t, allTasks))
		.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

	for (const t of [...inProg, ...unblockedPending]) {
		const icon = t.status === "in_progress" ? STATUS_ICON.in_progress : STATUS_ICON.pending;
		const pLabel = `[${priorityLabel(t.priority)}]`;
		const suffix = t.status === "in_progress" ? "  ← in progress" : "";
		lines.push(`${icon} ${pLabel} ${t.content}${suffix}`);
	}

	if (blockedPending.length > 0) {
		lines.push("", "## Blocked (waiting on dependencies):");
		for (const t of blockedPending) {
			const pLabel = `[${priorityLabel(t.priority)}]`;
			const deps = (t.blockedBy ?? []).join(", ");
			lines.push(`⊘ [Blocked] ${pLabel} ${t.content}  (blocked by: ${deps})`);
		}
	}

	const doneCount = store.tasks.length - active.length;
	if (doneCount > 0) {
		lines.push("", `${doneCount}/${store.tasks.length} tasks completed.`);
	}

	return lines.join("\n");
}

// ── LLM text formatter ─────────────────────────────────────────────────────────

export function formatListForLLM(): string {
	if (store.tasks.length === 0) return "Task list is empty.";
	const allTasks = [...store.tasks];
	return store.tasks
		.map((t) => {
			const icon =
				t.status === "in_progress"
					? STATUS_ICON.in_progress
					: t.status === "completed"
						? STATUS_ICON.completed
						: STATUS_ICON.pending;
			const blockedSuffix =
				t.status !== "completed" && isBlocked(t, allTasks)
					? `  (blocked by: ${(t.blockedBy ?? []).join(", ")})`
					: "";
			return `${icon} [${priorityLabel(t.priority)}] [${t.id}] ${t.content}${blockedSuffix}`;
		})
		.join("\n");
}
