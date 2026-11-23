/**
 * pi-todo
 *
 * Task management extension that prevents "goal drift" — the tendency for
 * agents to lose track of the original plan as context grows.
 *
 * How it works:
 *   1. The agent uses `todo_write` to plan multi-step work as structured tasks
 *   2. Before every agent turn, active tasks are injected into the system prompt
 *   3. A live widget above the editor shows the task list to the user
 *   4. State is stored in tool-result details and reconstructed from the session
 *      branch, so /tree navigation and forking work correctly
 *
 * Tools:   todo_write   — replace the entire task list (atomic update)
 *          todo_patch   — update existing tasks by ID without resending the list
 *          todo_read    — read the current task list
 *          todo_remove  — remove tasks by ID (soft-delete: tasks are stamped and retained in history)
 * Command: /todos       — open interactive full-screen task viewer
 */

import type { CustomToolResultEvent, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { TodoViewComponent } from "./component";
import { buildSystemPromptBlock, formatListForLLM } from "./prompt";
import { TodoPatchParams, TodoRemoveParams, TodoWriteParams } from "./schemas";
import { registerTodoCommands } from "./commands";
import { applyPatch } from "./patch";
import type { TaskPatch } from "./patch";
import { TodoRuntime } from "./runtime";
import { reconstructState, store } from "./state";
import { createTodoSnapshot, TODO_SNAPSHOT_CUSTOM_TYPE } from "./replay";
import { formatStrippedWarning, isBlocked, validateDependencyGraph } from "./deps";
import { coerceRichFields, validateMetadata } from "./rich-fields";
import { STATUS_ICON } from "./types";
import type { Task, TaskDetails, TaskPriority, TaskStatus } from "./types";

// ── Runtime ────────────────────────────────────────────────────────────────────

/** Exported for symmetry tests (M3-T3). */
export const runtime = new TodoRuntime();

/** Safely read the session branch; may throw before the session is initialised. */
function getBranchSafe(ctx: { sessionManager: { getBranch(): readonly unknown[] } }): readonly unknown[] {
	try {
		return ctx.sessionManager.getBranch();
	} catch {
		return [];
	}
}

// ── Shared commit tail (M11 — todo_write / todo_patch) ─────────────────────────

/**
 * The one state-mutation tail shared by `todo_write` and `todo_patch`
 * (spec §4: "No second state-mutation path").
 *
 * B1 tombstone preservation: hidden tombstones whose ids are NOT in the
 * candidate set survive, exactly as in `todo_write`'s full-replace path.
 * Timestamps ride `applyStatusTransitions` (prev-vs-next per task), so
 * `startedAt`/`completedAt`/revert-clears behave identically for a patch
 * transition. `idCounter` is untouched here — patches never mint IDs.
 */
function commitTaskList(tasks: Task[], ctx: ExtensionContext): TaskDetails {
	const candidateIds = new Set(tasks.map((t) => t.id));
	const preservedTombstones = store.tasks.filter(
		(t) => t.deletedAt != null && !candidateIds.has(t.id),
	);

	const finalTasks = [...tasks, ...preservedTombstones];
	store.applyStatusTransitions(finalTasks);
	store.setTasks(finalTasks);
	store.syncIdCounter();
	const details = { tasks: [...store.tasks] } satisfies TaskDetails;
	// The runtime choke point gates on todo_write/todo_remove (src/runtime.ts);
	// todo_patch also produces full-list TaskDetails, so the in-process widget /
	// tracker / celebration refresh uses the gate-compatible name. The session
	// branch records the REAL tool name ("todo_patch") — replay (M11-T3) reads
	// from the branch, never from this call.
	runtime.processToolResult("todo_write", details, ctx);
	return details;
}

// ── Extension ──────────────────────────────────────────────────────────────────

export default function todoExtension(pi: ExtensionAPI): void {
	// ── Session lifecycle ──────────────────────────────────────────────────
	pi.on("session_start", async (_event, ctx) => {
		reconstructState(ctx);
		runtime.reconstructFromSession(getBranchSafe(ctx), ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		reconstructState(ctx);
		runtime.reconstructFromSession(getBranchSafe(ctx), ctx);
	});

	// ── Compaction lifecycle ─────────────────────────────────────────────
	// Persist current task state as a custom entry before Pi writes the
	// compaction summary. Always include the full task list (even empty) so
	// a future replay from the compacted branch cannot resurrect stale tasks.
	// Do NOT return `compaction` — that would replace Pi's default summary.
	pi.on("session_before_compact", (_event, _ctx) => {
		pi.appendEntry(TODO_SNAPSHOT_CUSTOM_TYPE, createTodoSnapshot({ tasks: [...store.tasks] }));
		// M3-T3 M-a risk: every snapshot/tool-result carries cumulative tombstones,
		// so removal-heavy sessions will grow this payload unbounded over long runs.
		// Hard-purge/pruning is parked for a later milestone; the parked hard-purge
		// is the planned pressure valve. Do NOT implement pruning in this milestone.
	});

	// After compaction the branch is trimmed. Reconstruct both the canonical
	// store and the runtime tracker from the kept branch (which now includes
	// the custom entry appended above), then refresh widgets. Celebrations
	// are reset inside `reconstructFromSession` so they do not replay.
	pi.on("session_compact", async (_event, ctx) => {
		reconstructState(ctx);
		runtime.reconstructFromSession(getBranchSafe(ctx), ctx);
	});

	// ── System-prompt injection ────────────────────────────────────────────
	pi.on("before_agent_start", async (event, _ctx) => {
		const block = buildSystemPromptBlock();
		if (!block) return;
		return { systemPrompt: `${event.systemPrompt}\n\n${block}` };
	});

	// ── Post-turn widget refresh ───────────────────────────────────────────
	pi.on("agent_end", async (_event, ctx) => {
		runtime.refreshWidgets(ctx);
	});

	// ── Tool result hook ───────────────────────────────────────────────────
	// Replay safety: if a tool result fires before the in-process `execute`
	// handler updates the runtime, the idempotent `processToolResult` will
	// pick it up. Normal flow is a no-op because `execute` already handled it.
	pi.on("tool_result", async (event, ctx) => {
		const toolEvent = event as CustomToolResultEvent;
		runtime.processToolResult(toolEvent.toolName, toolEvent.details, ctx);
	});

	// ── Tool: todo_write ───────────────────────────────────────────────────
	pi.registerTool({
		name: "todo_write",
		label: "Tasks",
		description:
			"Plan complex work by breaking it into structured, trackable tasks. " +
			"Provide the COMPLETE updated list — this REPLACES the current list entirely.",
		promptSnippet:
			"Create and update a structured task list with statuses (pending / in_progress / completed) and priorities",
		promptGuidelines: [
			"When you receive a task that involves multiple steps, files, or logical phases, call todo_write FIRST " +
				"to break it into a structured plan before writing code or running commands. " +
				"The task list is your north star — refer back to it to avoid drift. " +
				"Each task should be specific, atomic, and actionable.",
			"Before starting a task, call todo_patch to set it to 'in_progress' (or todo_write when creating the task). " +
				"Only one task should be 'in_progress' at a time unless tasks are genuinely parallel.",
			"Immediately after completing a task, call todo_patch to mark it 'completed'. " +
				"Do not batch completions — mark each task done as soon as it is finished. " +
				"Completed tasks remain visible in the list; they are never automatically deleted.",
			"todo_write REPLACES the entire list. Always include ALL tasks (both changed and unchanged) in every call. " +
				"For status flips and single-task edits, prefer todo_patch.",
			"To remove tasks, use todo_remove instead of omitting them from todo_write; removed tasks are soft-deleted (hidden from the active list but retained in history).",
			"Optional rich fields (description, owner, metadata, activeForm) can be passed on each task. " +
				"description and activeForm are user-authored strings; owner is a free-form id; " +
				"metadata is a flat string|number|boolean bag (no nulls, no nested objects, no arrays). " +
				"If a task's metadata container itself is malformed (e.g. a string, array, or null), the entire write is rejected with an error. " +
				"Bad keys inside an otherwise-valid metadata container are dropped per-key with a warning; the write is not aborted.",
		],
		parameters: TodoWriteParams,

		async execute(_id, params, _signal, _onUpdate, ctx) {
			// Snapshot the ID counter so an atomic rejection (e.g. a dependency
			// cycle) leaves NO trace in canonical state, even though building
			// candidates below may call store.generateId() for id-less tasks.
			const savedIdCounter = store.idCounter;
			// M4 — I1 pre-flight: whole-task rejection when a task's metadata
			// *container* is malformed (string, array, null, or non-object).
			// Per-key reject-with-named-warning is handled below for keys inside
			// an otherwise-valid object. The whole-container rejection is
			// atomic: the entire write is aborted with the first malformed
			// container found, no IDs are minted, no tasks are mutated.
			for (const t of params.tasks) {
				if (t.metadata === undefined) continue; // absent is fine
				const preflight = validateMetadata(t.metadata);
				if (!preflight.ok) {
					store.idCounter = savedIdCounter;
					return {
						content: [{ type: "text", text: preflight.error }],
						details: { tasks: [...store.tasks] } satisfies TaskDetails,
					};
				}
			}
			const reserved = new Set<string>();
			for (const t of params.tasks) {
				if (t.id === undefined) continue;
				if (reserved.has(t.id)) {
					return {
						content: [{ type: "text", text: `todo_write rejected: duplicate task id "${t.id}".` }],
						details: { tasks: [...store.tasks] } satisfies TaskDetails,
					};
				}
				reserved.add(t.id);
			}
			// Build candidate task list preserving any blockedBy metadata the agent sent.
			// M4 — also coerce rich fields (description, owner, metadata, activeForm)
			// at this input boundary and aggregate per-key metadata warnings.
			const richWarnings: string[] = [];
			const candidates: Task[] = params.tasks.map((t) => {
				let id = t.id;
				if (id === undefined) {
					do { id = store.generateId(); } while (reserved.has(id));
					reserved.add(id);
				}
				const next: Task = {
					id,
					content: t.content,
					status: t.status as TaskStatus,
					priority: t.priority as TaskPriority,
				};
				if (Array.isArray(t.blockedBy)) {
					next.blockedBy = [...t.blockedBy];
				}
				// M4 — apply I1 input-boundary policy. coerceRichFields does the
				// type-safe coercion for description/owner/activeForm and the
				// per-key validation for metadata.
				const rf = coerceRichFields(
					next,
					t.description,
					t.owner,
					t.metadata,
					t.activeForm,
				);
				if (rf.description !== undefined) next.description = rf.description;
				if (rf.owner !== undefined) next.owner = rf.owner;
				if (rf.activeForm !== undefined) next.activeForm = rf.activeForm;
				if (rf.metadata !== undefined) next.metadata = rf.metadata;
				// Per-key drop warnings. Whole-container errors (string, array,
				// null, non-object) are rejected in the pre-flight loop above;
				// by the time we reach this branch, validateMetadata MUST be
				// ok for any t.metadata that exists. The guard is defensive
				// in case validateMetadata semantics change.
				const mdCheck = validateMetadata(t.metadata);
				if (mdCheck.ok && mdCheck.dropped.length > 0) {
					richWarnings.push(...mdCheck.dropped);
				}
				return next;
			});

			// Apply the oracle-specified dependency validation policy:
			//   - strip self-deps and duplicates silently
			//   - strip unknown IDs with warning
			//   - reject cycles atomically
			const validation = validateDependencyGraph(candidates);
			if (!validation.ok) {
				// Atomic rejection: roll back any IDs generated while building candidates.
				store.idCounter = savedIdCounter;
				return {
					content: [{ type: "text", text: validation.error }],
					details: { tasks: [...store.tasks] } satisfies TaskDetails,
				};
			}

			// Shared commit tail (B1 tombstones, timestamps, widgets, tracker).
			const details = commitTaskList(validation.tasks, ctx);

			const warning = formatStrippedWarning(validation.strippedUnknown);
			const listText = formatListForLLM();
			const richWarningText =
				richWarnings.length > 0
					? `Warning: metadata ${richWarnings.length === 1 ? "key" : "keys"} rejected: ${richWarnings.join("; ")}`
					: "";
			const tail = [warning, richWarningText].filter(Boolean).join("\n\n");
			const text = tail ? `${listText}\n\n${tail}` : listText;
			return {
				content: [{ type: "text", text }],
				details,
			};
		},
		renderCall(args, theme) {
			const list = args.tasks ?? [];
			const inProg = list.filter((t: { status: string }) => t.status === "in_progress").length;
			const done = list.filter((t: { status: string }) => t.status === "completed").length;
			const total = list.length;

			let text = theme.fg("toolTitle", theme.bold("todo_write "));
			text += theme.fg("muted", `${total} task${total !== 1 ? "s" : ""}`);
			if (inProg > 0) text += `  ${theme.fg("accent", `\uf111 ${inProg} active`)}`;
			if (done > 0) text += `  ${theme.fg("success", `\uf00c ${done} done`)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			return TodoViewComponent.renderTaskResult(result.details as TaskDetails | undefined, expanded, theme);
		},
	});

	// ── Tool: todo_patch ───────────────────────────────────────────────────
	pi.registerTool({
		name: "todo_patch",
		label: "Tasks",
		description:
			"Update existing tasks by ID without resending the whole list. " +
			"Use for status flips, renames, priority changes, dependency edits, and rich-field updates. " +
			"The whole patches array is atomic — all patches apply or none do.",
		promptSnippet:
			"Update one or more existing tasks by ID (status, priority, content, dependencies, rich fields) without resending the list",
		promptGuidelines: [
			"Use todo_patch to mark a task in_progress or completed, or to adjust one task's fields — do not resend the whole list for a status change.",
			"Use appendDescription to add notes to a task without rewriting its description.",
		],
		parameters: TodoPatchParams,

		async execute(_id, params, _signal, _onUpdate, ctx) {
			const live = store.tasks.filter((t) => t.deletedAt == null);
			const liveById = new Map(live.map((t) => [t.id, t]));

			// §3 whole-call rejections (first error wins; canonical state untouched).
			const seen = new Set<string>();
			for (const patch of params.patches) {
				// 1. Unknown or tombstoned id — self-healing reject with the full list.
				if (!liveById.has(patch.id)) {
					return {
						content: [{ type: "text", text: `todo_patch rejected: unknown or removed task id "${patch.id}".\n\n${formatListForLLM()}` }],
						details: { tasks: [...store.tasks] } satisfies TaskDetails,
					};
				}
				// 2. Duplicate id within one call — ambiguous ordering.
				if (seen.has(patch.id)) {
					return {
						content: [{ type: "text", text: `todo_patch rejected: duplicate task id "${patch.id}" in one call.\n\n${formatListForLLM()}` }],
						details: { tasks: [...store.tasks] } satisfies TaskDetails,
					};
				}
				seen.add(patch.id);
				// 3. description + appendDescription on the same patch — ambiguous.
				if (patch.description !== undefined && patch.appendDescription !== undefined) {
					return {
						content: [{ type: "text", text: `todo_patch rejected: cannot set both description and appendDescription on task "${patch.id}".\n\n${formatListForLLM()}` }],
						details: { tasks: [...store.tasks] } satisfies TaskDetails,
					};
				}
				// 4. Malformed metadata container (mirrors the todo_write I1 preflight).
				if (patch.metadata !== undefined) {
					const preflight = validateMetadata(patch.metadata);
					if (!preflight.ok) {
						return {
							content: [
								{
									type: "text",
									text: `${preflight.error}\n\n${formatListForLLM()}`,
								},
							],
							details: { tasks: [...store.tasks] } satisfies TaskDetails,
						};
					}
				}
			}

			// Desugar (spec §4): build the merged candidate list via the pure
			// applyPatch, then run the exact same commit tail as todo_write.
			const patchesById = new Map(params.patches.map((p) => [p.id, p]));
			const metadataWarnings: string[] = [];
			const merged: Task[] = live.map((t) => {
				const patch = patchesById.get(t.id);
				if (!patch) return t;
				const result = applyPatch(t, patch);
				metadataWarnings.push(...result.dropped);
				return result.task;
			});

			// §3.5 — dependency cycle after the blockedBy merge → atomic reject,
			// same error shape as todo_write. Also strips unknown/self/dup deps
			// with the standard warnings.
			const validation = validateDependencyGraph(merged);
			if (!validation.ok) {
				return {
					content: [
						{
							type: "text",
							text: `${validation.error}\n\n${formatListForLLM()}`,
						},
					],
					details: { tasks: [...store.tasks] } satisfies TaskDetails,
				};
			}

			const details = commitTaskList(validation.tasks, ctx);

			// §6 — terse delta content, NOT formatListForLLM(). The model resyncs
			// from the per-turn prompt re-injection at the next turn boundary.
			const liveNow = store.tasks.filter((t) => t.deletedAt == null);
			const active = liveNow.filter((t) => t.status === "in_progress").length;
			const pending = liveNow.filter((t) => t.status === "pending").length;
			const blocked = liveNow.filter((t) => t.status === "pending" && isBlocked(t, liveNow)).length;
			const done = liveNow.filter((t) => t.status === "completed").length;

			const changed = params.patches
				.map((p) => {
					const task = liveNow.find((t) => t.id === p.id);
					return task ? `${task.id} → ${task.status}` : `${p.id} → ?`;
				})
				.join(", ");

			let text = `Patched ${changed}.\n${active} active, ${pending} pending (${blocked} blocked), ${done} done.`;
			const warning = formatStrippedWarning(validation.strippedUnknown);
			if (warning) text += `\n\n${warning}`;
			if (metadataWarnings.length > 0) text += `\n\n${metadataWarnings.join("\n")}`;
			return { content: [{ type: "text", text }], details };
		},

		renderCall(args, theme) {
			const patches = args.patches ?? [];
			const max = 5;
			const shown = patches.slice(0, max);
			const segments = shown.map((p: TaskPatch) => {
				const icon = p.status ? STATUS_ICON[p.status] : "\u270e";
				const color =
					p.status === "completed" ? "success" : p.status === "in_progress" ? "accent" : "muted";
				return theme.fg(color, `${icon} ${p.id}${p.status ? ` ${p.status}` : ""}`);
			});
			const rest =
				patches.length > max ? `  ${theme.fg("muted", `+${patches.length - max} more`)}` : "";
			return new Text(
				theme.fg("toolTitle", theme.bold("todo_patch ")) + segments.join("  ") + rest,
				0,
				0,
			);
		},

		renderResult(result, { expanded }, theme) {
			return TodoViewComponent.renderTaskResult(result.details as TaskDetails | undefined, expanded, theme);
		},
	});

	// ── Tool: todo_read ────────────────────────────────────────────────────
	pi.registerTool({
		name: "todo_read",
		label: "Tasks",
		description: "Read the current task list. Use this to check your tasks and their statuses.",
		promptSnippet: "Read the current task list and statuses",
		parameters: Type.Object({}),

		async execute() {
			return {
				content: [{ type: "text", text: formatListForLLM() }],
				details: { tasks: [...store.tasks] } satisfies TaskDetails,
			};
		},

		renderCall(_args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("todo_read")), 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			return TodoViewComponent.renderTaskResult(result.details as TaskDetails | undefined, expanded, theme);
		},
	});

	// ── Tool: todo_remove ──────────────────────────────────────────────────
	pi.registerTool({
		name: "todo_remove",
		label: "Tasks",
		description:
			"Remove tasks by ID (soft-delete: tasks are stamped and retained in history for audit). " +
			"Completed tasks normally stay in the list for visibility — only remove if truly unwanted.",
		promptSnippet: "Remove tasks by ID",
		promptGuidelines: [
			"Use todo_remove to remove tasks that are no longer needed. " +
				"Completed tasks remain visible by default — only remove if they clutter the list.",
		],
		parameters: TodoRemoveParams,

		async execute(_id, params, _signal, _onUpdate, ctx) {
			const removed = store.removeByIds(params.ids);
			const details = { tasks: [...store.tasks] } satisfies TaskDetails;
			runtime.processToolResult("todo_remove", details, ctx);

			if (removed.length === 0) {
				return {
					content: [{ type: "text", text: "No tasks to remove (empty ID list)." }],
					details,
				};
			}

			return {
				content: [
					{
						type: "text",
						text: `Removed ${removed.length} task${removed.length !== 1 ? "s" : ""}: ${removed.join(", ")}\n\n${formatListForLLM()}`,
					},
				],
				details,
			};
		},

		renderCall(args, theme) {
			const ids = args.ids ?? [];
			const idStr = ids.map((id: string) => theme.fg("accent", id)).join(", ");
			return new Text(
				theme.fg("toolTitle", theme.bold("todo_remove ")) + theme.fg("muted", `remove ${idStr}`),
				0,
				0,
			);
		},

		renderResult(result, { expanded }, theme) {
			return TodoViewComponent.renderTaskResult(result.details as TaskDetails | undefined, expanded, theme);
		},
	});

	// ── Command: /todos ────────────────────────────────────────────────────
	pi.registerCommand("todos", {
		description: "Open the interactive task viewer",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify(store.tasks.length === 0 ? "No tasks yet." : formatListForLLM(), "info");
				return;
			}
			const liveTasks = store.tasks.filter((t) => t.deletedAt == null);
			await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
				return new TodoViewComponent(liveTasks, theme, () => done());
			});
		},
	});

	// ── Slash helper commands ─────────────────────────────────────────────
	registerTodoCommands(pi, runtime);
}
