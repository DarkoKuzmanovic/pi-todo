import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { isBlocked } from "./deps";
import type { TaskTracker } from "./tracker";
import type { TaskPriority } from "./types";

// ── Constants ───────────────────────────────────────────────────────────────

/** Widget key for the compact above-editor widget owned by pi-todo. */
export const COMPACT_WIDGET_KEY = "pi-todo-compact";

const WIDGET_OPTIONS = { placement: "aboveEditor" as const };

const SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// ── Grapheme-aware width helpers ────────────────────────────────────────────


/** Truncate `text` so its display width does not exceed `maxColumns`. */
function truncateToColumns(text: string, maxColumns: number): string {
	if (maxColumns <= 0 || text.length === 0) return "";
	let width = 0;
	let result = "";
	for (const { segment } of SEGMENTER.segment(text)) {
		const segmentWidth = graphemeColumns(segment);
		if (width + segmentWidth > maxColumns) break;
		result += segment;
		width += segmentWidth;
	}
	return result;
}

/** Display columns consumed by a single grapheme cluster. */
function graphemeColumns(segment: string): number {
	const codePoint = segment.codePointAt(0);
	if (codePoint === undefined || isZeroWidth(codePoint)) return 0;
	if (isWideCodePoint(codePoint) || isEmojiLike(segment, codePoint)) return 2;
	return 1;
}

function isZeroWidth(codePoint: number): boolean {
	return (
		codePoint === 0 ||
		codePoint < 32 ||
		(codePoint >= 0x7f && codePoint < 0xa0) ||
		(codePoint >= 0x300 && codePoint <= 0x36f) ||
		(codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
		(codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
		(codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
		(codePoint >= 0xfe00 && codePoint <= 0xfe0f)
	);
}

function isWideCodePoint(codePoint: number): boolean {
	return (
		(codePoint >= 0x1100 && codePoint <= 0x115f) ||
		codePoint === 0x2329 ||
		codePoint === 0x232a ||
		(codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
		(codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
		(codePoint >= 0xf900 && codePoint <= 0xfaff) ||
		(codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
		(codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
		(codePoint >= 0xff00 && codePoint <= 0xff60) ||
		(codePoint >= 0xffe0 && codePoint <= 0xffe6)
	);
}

function isEmojiLike(segment: string, codePoint: number): boolean {
	return (
		(codePoint >= 0x1f000 && codePoint <= 0x1fbff) ||
		(codePoint >= 0x2600 && codePoint <= 0x27bf && segment.includes("\ufe0f")) ||
		segment.includes("\u200d")
	);
}

// ── Priority badge ──────────────────────────────────────────────────────────

function priorityBadge(priority: TaskPriority): string {
	switch (priority) {
		case "high":
			return "\uf0e7";
		case "medium":
			return "\uf444";
		case "low":
			return "\uf4c3";
	}
}

// ── Renderable shape returned to the TUI ────────────────────────────────────

interface CompactRenderable {
	render: (renderWidth?: number) => string[];
	invalidate: () => void;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Update the compact above-editor widget with the current tracker state.
 *
 * No-op when the host does not expose a UI (print mode, RPC). When UI is
 * available, registers a renderable factory under `COMPACT_WIDGET_KEY` with
 * above-editor placement. The factory is stateless — its `invalidate()` is a
 * no-op — so every render reflects the live tracker state.
 */
export function updateCompactWidget(
	ctx: ExtensionContext,
	tracker: TaskTracker,
): void {
	if (!ctx.hasUI) return;

	ctx.ui.setWidget(
		COMPACT_WIDGET_KEY,
		(tui: { width?: number }, theme: Theme) => buildRenderable(tracker, theme, tui),
		WIDGET_OPTIONS,
	);
}

function buildRenderable(
	tracker: TaskTracker,
	theme: Theme,
	tui: { width?: number },
): CompactRenderable {
	// Defensive theme helper: fall back to plain text if a mock theme lacks fg().
	// Call fg as a method so Pi's Theme instance keeps its `this` binding.
	const tf = (color: string, text: string): string => {
		const themeWithFg = theme as { fg?: (color: string, text: string) => string };
		return typeof themeWithFg.fg === "function" ? themeWithFg.fg(color, text) : text;
	};

	return {
		render: (renderWidth?: number): string[] => {
			const width = Math.max(0, Math.floor(renderWidth ?? tui.width ?? 80));

			const active = tracker.activeTask;
			const pending = tracker.pendingCount;
			const completed = tracker.completedCount;
			const total = tracker.totalCount;

			// Empty state: friendly message instead of hiding the widget.
			if (total === 0) {
				const msg = tf("muted", "\ue370 No tasks — ready when you are");
				return [truncateToColumns(msg, width)];
			}

			// All-done state: celebration banner.
			if (completed === total) {
				const celebration = tf("success", `\uf527 All done!  ${completed}/${total} \uf527 `);
				return [truncateToColumns(celebration, width)];
			}

		let left = "";
		if (active) {
			const badge = priorityBadge(active.priority);
			// M4 — M-c: surface `description` in the compact widget as a
			// compact marker next to the active content. Full text is not
			// preserved (widget is single-line, prompt-budget discipline);
			// reference content lives in /todos and the renderResult. owner
			// is /todos-only; metadata is hidden.
			const descSuffix = active.description ? ` — ${active.description}` : "";
			const decorated = badge ? `${badge} ${active.content}` : active.content;
			left = `${tf("accent", "\uf111")} ${decorated}${descSuffix}${tf("muted", `  ${tracker.formatElapsed(active)}`)}`;
		} else if (pending > 0) {
			left = tf("muted", `\uf4aa ${pending} pending, ${completed} done`);
		}

			// Blocked count: a small, non-crowding segment.
			const allTasks = [...tracker.tasks];
			const blockedCount = allTasks.filter(
				(t) => t.status === "pending" && isBlocked(t, allTasks),
			).length;
			let blockedSeg = "";
			if (blockedCount > 0) {
				blockedSeg = tf("muted", `  \u2298 ${blockedCount} blocked`);
			}
			let right = "";
			if (completed > 0 && total > 0) {
				const barLen = 12;
				const filled = Math.round((barLen * completed) / total);
				const filledBlocks = tf("success", "█".repeat(filled));
				const emptyBlocks = tf("dim", "░".repeat(barLen - filled));
				right = `${filledBlocks}${emptyBlocks}${tf("text", `  ${completed}/${total}`)}`;
			}

			const gap = left && right ? "  " : "";
			const content = left + gap + right + blockedSeg;
			if (!content) return [];

			return [truncateToColumns(content, width)];
		},
		// Stateless render — no cached state to invalidate, so no-op is correct.
		invalidate: () => {},
	};
}
