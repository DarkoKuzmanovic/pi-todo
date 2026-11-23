import { priorityLabel, store } from "./state";
import { activeBlockerIds, isBlocked } from "./deps";
import { activeTasks } from "./tombstone";
import { STATUS_ICON } from "./types";
import { PRIORITY_ORDER } from "./types";

// ── I3 — Prompt safety for `activeForm` ──────────────────────────────────────

/** Max length for a rendered `activeForm` in the prompt. Keeps prompt budget
 *  under control while still letting short present-progressive labels fit. */
const ACTIVE_FORM_PROMPT_MAX = 80;

/**
 * Render an `activeForm` value into the system-prompt block safely.
 *
 * I3 — any user-authored text in the prompt block (currently `activeForm`)
 * is rendered inside a clearly-delimited data region with structural-delimiter
 * escaping. The block format uses markdown `## <text>` to start a new section.
 *
 * The escape neutralises:
 *   - the backtick code-span delimiter (the data region's own boundary) by
 *     substituting every backtick with U+2018 (modifier letter grave accent,
 *     visually similar to a backtick but not a markdown delimiter). This is
 *     robust against backslash-stripping or backtick-stripping renderers:
 *     a backslash-escaped backtick still renders as a backtick in markdown,
 *     so the inner delimiter would leak; substituting a non-delimiter
 *     character cannot;
 *   - newlines and other whitespace that would inject an additional block
 *     line (a malicious value could try to introduce a `## <text>` header);
 *   - the leading `#` characters that mark a markdown header (defence in
 *     depth — the code-span already prevents header interpretation, but the
 *     backslash escape keeps the literal output obvious to a backtick-stripping
 *     renderer).
 *
 * Length is capped at `ACTIVE_FORM_PROMPT_MAX` characters.
 */
export function renderActiveFormForPrompt(value: string): string {
	if (!value) return "";
	// 1. Normalise whitespace — strip newlines / tabs / carriage returns.
	const oneLine = value.replace(/[\r\n\t]+/g, " ").trim();
	if (!oneLine) return "";
	// 2. Truncate to the prompt budget.
	const truncated = oneLine.length > ACTIVE_FORM_PROMPT_MAX
		? `${oneLine.slice(0, ACTIVE_FORM_PROMPT_MAX - 1)}…`
		: oneLine;
	// 3. Neutralise backticks (the data-region delimiter) by substituting
	//    with U+2018 (modifier letter grave accent). A backslash-escaped
	//    backtick still renders as a backtick in markdown, so the inner
	//    delimiter would leak; substituting a non-delimiter character
	//    cannot.
	const neutralised = truncated.replace(/`/g, "\u2018");
	// 4. Escape leading markdown-header markers (defence in depth).
	const safe = neutralised.replace(/^(#{1,6})\s/, "\\$1 ");
	// 5. Wrap in a backtick code-span (markdown data region).
	return `\`${safe}\``;
}

// ── System prompt injection ────────────────────────────────────────────────────

export function buildSystemPromptBlock(): string {
	const live = activeTasks(store.tasks);
	const active = live.filter((t) => t.status !== "completed");
	if (active.length === 0) return "";

	const lines: string[] = [
		"## Your Plan",
		"",
		"Follow this plan in order. Mark each task \"in_progress\" before starting it, \"completed\" when done:",
		"",
	];

	const inProg = active.filter((t) => t.status === "in_progress");
	const allTasks = activeTasks(store.tasks);
	const unblockedPending = active
		.filter((t) => t.status === "pending" && !isBlocked(t, allTasks))
		.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
	const blockedPending = active
		.filter((t) => t.status === "pending" && isBlocked(t, allTasks))
		.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

	// Active tasks use the `activeForm` as the in-line label (I3 safe).
	for (const t of inProg) {
		const icon = STATUS_ICON.in_progress;
		const pLabel = `[${priorityLabel(t.priority)}]`;
		const label = t.activeForm ? renderActiveFormForPrompt(t.activeForm) : "";
		// Format: `<icon> [priority] <content>  ← <activeForm>` when activeForm is set,
		//         `<icon> [priority] <content>  ← in progress` otherwise (back-compat).
		const suffix = label ? `  ← ${label}` : "  ← in progress";
		lines.push(`${icon} ${pLabel} [${t.id}] ${t.content}${suffix}`);
	}

	for (const t of unblockedPending) {
		const icon = STATUS_ICON.pending;
		const pLabel = `[${priorityLabel(t.priority)}]`;
		lines.push(`${icon} ${pLabel} [${t.id}] ${t.content}`);
	}

	if (blockedPending.length > 0) {
		lines.push("", "## Blocked (waiting on dependencies):");
		for (const t of blockedPending) {
			const pLabel = `[${priorityLabel(t.priority)}]`;
			const deps = activeBlockerIds(t, allTasks).join(", ");
			lines.push(`⊘ [Blocked] ${pLabel} [${t.id}] ${t.content}  (blocked by: ${deps})`);
		}
	}

	const doneCount = live.length - active.length;
	if (doneCount > 0) {
		lines.push("", `${doneCount}/${live.length} tasks completed.`);
	}

	return lines.join("\n");
}

// ── LLM text formatter ─────────────────────────────────────────────────────────

export function formatListForLLM(): string {
	const live = activeTasks(store.tasks);
	if (live.length === 0) return "Task list is empty.";
	const allTasks = activeTasks(store.tasks);
	return live
		.map((t) => {
			const icon =
				t.status === "in_progress"
					? STATUS_ICON.in_progress
					: t.status === "completed"
						? STATUS_ICON.completed
						: STATUS_ICON.pending;
			const blockedSuffix =
				t.status !== "completed" && isBlocked(t, allTasks)
				? `  (blocked by: ${activeBlockerIds(t, allTasks).join(", ")})`
					: "";
			// M4 — M-c visibility: description (full), activeForm, owner surface
			// in the /todos-text path. metadata stays hidden.
			const descSuffix = t.description ? `  📝 ${t.description}` : "";
			const afSuffix = t.activeForm && t.status === "in_progress" ? `  ⮕${t.activeForm}` : "";
			const ownerSuffix = t.owner ? `  @${t.owner}` : "";
			return `${icon} [${priorityLabel(t.priority)}] [${t.id}] ${t.content}${ownerSuffix}${afSuffix}${descSuffix}${blockedSuffix}`;
		})
		.join("\n");
}
