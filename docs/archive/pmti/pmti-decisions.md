# Decisions

Use milestone-scoped IDs for durable decisions, for example `M0-a`, `M1-a`, `M4-b`.

## P0-a — Adopt PMTI project state

**Date:** 2026-05-31
**Status:** accepted

**Decision:** Use `.pi/pmti/` as durable project workflow state for this project.

**Rationale:** The implementation plan spans multiple extension lifecycle, UI, schema, and configuration milestones. PMTI gives future agents a durable roadmap, milestone boundary, session log, and role separation before implementation changes active Pi task workflows.

**Consequences:** Future agents orient from `.pi/pmti/project/roadmap.md`, current `.pi/pmti/milestones/MN.md`, and `.pi/pmti/project/session-log/`.

## P0-b — Preserve explicit todo tools

**Date:** 2026-05-31
**Status:** accepted

**Decision:** Preserve `todo_write`, `todo_read`, and `todo_remove` as the public task tools; do not adopt `rpiv-todo`'s single `todo({ action })` API.

**Rationale:** Local PMTI skills and agent discipline rely on explicit tools and auditable `todo_write` updates.

**Consequences:** Borrowed `rpiv-todo` ideas must fit the existing task model and schemas.

## P0-c — Defer workspace strategy per milestone

**Date:** 2026-05-31
**Status:** accepted

**Decision:** Record `ask-per-milestone` as the default workspace strategy.

**Rationale:** This extension directory is not currently its own git repository on this machine, and later work may touch global Pi config or sibling `oh-my-todo` state. Each milestone should choose the safest workspace/branch strategy explicitly.

**Consequences:** PMTI milestone planning must ask or record the workspace choice before task packets or implementation handoff.

## M0-a — Use current workspace for M0

**Date:** 2026-06-01
**Status:** accepted

**Decision:** Run M0 implementation in the current workspace at `/home/quzma/.pi/agent/extensions/pi-todo`.

**Rationale:** The user selected current workspace for M0. This directory has no local `.git/` on this machine, so branch/worktree isolation is unavailable from the project folder.

**Consequences:** M0 task handoffs must record expected branch/worktree as `n/a`, require cwd verification before editing, and rely on tests plus PMTI logs for recovery/checkpoint discipline.

## M0-b — Defer `oh-my-todo` deactivation

**Date:** 2026-06-01
**Status:** accepted

**Decision:** Defer standalone `oh-my-todo` deactivation out of M0 implementation unless explicitly re-approved after merged behavior passes reload/trial verification.

**Rationale:** The user chose to defer deactivation. This keeps M0 focused on merged `pi-todo` behavior and avoids prematurely altering active Pi package/extension loading.

**Consequences:** M0 may document and prepare deactivation, but it must not disable `oh-my-todo` as part of task execution.


## M0-c — Compare GLM 5.1 and MiniMax M3 during implementation

**Date:** 2026-06-01
**Status:** accepted

**Decision:** Use M0 as a practical bake-off between the current GLM 5.1 worker route and the newly available MiniMax M3 route. Run comparable implementation or fix-back tasks through both where appropriate, then dissect results after implementation ends.

**Rationale:** The project has several similarly scoped PMTI tasks, and the user wants evidence about speed, quality, and execution behavior rather than relying on assumptions about either model.

**Consequences:** PMTI session logs and close-out summaries should record which model handled each task, rough latency/throughput when observable, verification outcomes, reviewer/fix-back burden, scope discipline, code quality, and any notable failure modes. The final M0 retrospective should compare GLM 5.1 vs MiniMax M3 before choosing the preferred worker route for later milestones.

## M0-d — Pause GLM 5.1 as a regular executor after quota-cost result

**Date:** 2026-06-01
**Status:** accepted

**Decision:** Do not use GLM 5.1 as a regular PMTI executor for this project for now. Keep MiniMax M3 as the preferred default worker route, and evaluate DeepSeek v4 Pro via API on a later suitable PMTI task.

**Rationale:** The M0 qualitative bake-off favored GLM 5.1 for tight bounded packets and MiniMax M3 for larger integration work, but the user's provider usage data changed the operational conclusion: MiniMax M3 consumed about 5% of the available 5-hour usage pool for its M0 work, while GLM 5.1 consumed about 49%. That quota cost is too high for routine executor use in this workflow.

**Consequences:** Future milestone/task packets should not recommend GLM 5.1 by default. Prefer MiniMax M3 unless a task explicitly calls for a new bake-off. When DeepSeek v4 Pro is tested, record model, wall-clock, provider usage/cost, verification result, reviewer/fix-back burden, scope discipline, and notable failure modes so it can be compared against the M0 MiniMax/GLM evidence.


## M1-a — Use current workspace and make M1 a DeepSeek v4 Pro trial

**Date:** 2026-06-01
**Status:** accepted

**Decision:** Plan M1 in the current workspace (`/home/quzma/.pi/agent/extensions/pi-todo`, expected branch/worktree `n/a`) and use M1 as the first DeepSeek v4 Pro API executor trial. Record oracle review as pending before implementation.

**Rationale:** The project root still has no local `.git/` isolation available on this machine, matching M0's workspace constraint. The user paused GLM 5.1 after high quota usage and explicitly wants to try DeepSeek v4 Pro later; M1 is a suitable lifecycle/replay task for that comparison because it exercises the subtle invariant area where M0-T3 needed reviewer-driven fix-back.

**Consequences:** M1 task packets must require cwd verification, avoid GLM 5.1, and designate at least one suitable task as the DeepSeek v4 Pro trial. The trial record should include model, wall-clock, API usage/cost when available, verification result, reviewer/fix-back burden, scope discipline, and failure modes.

## M1-b — Trial Sonnet 4.6 on M1-T3 using worker subagent

**Date:** 2026-06-01
**Status:** accepted

**Decision:** Execute M1-T3 through the `worker` subagent with model override `anthropic/claude-sonnet-4-6` as a direct comparison point against M0 MiniMax M3 and M1-T2 DeepSeek v4 Pro.

**Rationale:** The user expects Sonnet to be a class above M3 but wants evidence from the same PMTI workflow. M1-T3 is a good comparison task because it is a lifecycle-hook integration step with subtle invariants and a clear packet boundary.

**Consequences:** The M1-T3 packet and handoff should use `worker` plus `anthropic/claude-sonnet-4-6`, avoid GLM 5.1/MiniMax/DeepSeek for this trial unless explicitly changed, and record wall-clock, usage/cost if visible, verification, reviewer/fix-back burden, scope discipline, code quality, and failure modes.


## M2-a — Trial continuous MiniMax M3 implementation for M2

**Date:** 2026-06-01
**Status:** accepted

**Decision:** Use M2 as an experiment in a faster, less token-heavy PMTI cadence: the orchestrator prepares the milestone plan and Opus oracle gate, then MiniMax M3 (`minimax/MiniMax-M3`) drives implementation continuously from M2-T1 through M2-T4. The orchestrator performs the review gate after all four steps instead of reviewing after every task.

**Rationale:** The M0/M1 workflow produced strong results but was slow and token-heavy. M2 has additive schema evolution, pure dependency-graph helpers, and testable command/UI semantics, making it a reasonable candidate for a continuous executor pass while preserving an upfront oracle gate and final review.

**Consequences:** M2 task/handoff instructions must encode oracle-decided policies and mandatory MiniMax stop conditions clearly. MiniMax must stop on ambiguity, non-obvious verification failure, new Biome errors, behavior changes for task lists without `blockedBy`, cycle-algorithm uncertainty, or unexpected out-of-scope files. Final acceptance remains with orchestrator review plus manual live trial.


## M3-a — Tombstone model, DeepSeek v4 Pro trial, per-task cadence

**Date:** 2026-06-01
**Status:** accepted

**Decision:** Plan M3 (audit-friendly tombstones) with: (1) `todo_remove` soft-deletes by default via an additive optional `deletedAt?: number` marker, no hard-purge in M3; (2) tombstones fully hidden from every normal surface (no `/todos` reveal toggle — stays parked); (3) executor = DeepSeek v4 Pro API trial (`deepseek/deepseek-v4-pro`), the suitable later-task evaluation deferred since M0-d; (4) per-task review cadence (review after each task), not continuous; (5) current workspace (branch/worktree `n/a`); (6) run the Opus oracle gate immediately after drafting the manifest.

**Rationale:** Soft-delete-by-default best matches the roadmap's "removals preserve history" intent while preserving the public `todo_remove` tool (P0-b) and additive-schema discipline (like M2's `blockedBy`). Per-task cadence is chosen over the M2 continuous experiment because M3 changes session-replay/persistence semantics — a watch.md-flagged invariant area where DeepSeek's M1-T2 trial showed edit-anchor slips caught only by tests. M3 is a genuinely suitable task to finally run the deferred DeepSeek v4 Pro evaluation.

**Consequences:** M3 task packets must encode oracle-decided policies (representation, re-send-of-tombstoned-ID behavior, blockedBy-vs-tombstone interaction) and require cwd verification. The DeepSeek trial record must capture model handle, wall-clock, API usage/cost if visible, verification, reviewer/fix-back burden, scope discipline, code quality, and failure modes for comparison against M0 MiniMax/GLM and M1 DeepSeek/Sonnet evidence. The continuous-cadence experiment (M2-a) remains unproven and is deferred again.

## M4-a — Continuous MiniMax M3 cadence rejected for 4-subtask work; per-task review wins

**Date:** 2026-06-02
**Status:** accepted

**Decision:** M4 re-tried the M2-a continuous MiniMax M3 cadence (one packet covering T1..T4 in a single worker run). Pass-1 (worker model `minimax/MiniMax-M3`) hit the 30-minute subagent wall-clock cap mid-T2 with one structural-corruption file (`src/compact-widget.ts` active-task render block was duplicated, breaking 6 test files at module-load time). Conclusion: the 30-min budget is too tight for a 4-subtask continuous pass on this project. Pass-2 (orchestrator-repaired T1+T2 on disk) used a per-task `deepseek/deepseek-v4-flash` packet covering T3 then T4 with orchestrator I4 gates at every T boundary; that one was clean.

**Rationale:** The M2-a continuous experiment stayed unproven since M2 because the implementation predated planning; M4 was its first real trial on this project with 4 substantial subtasks. The continuous cadence pays a token-efficiency dividend on 1–2 subtask scope but does not scale: (1) subagent wall-clock caps are hard ceilings regardless of model speed, (2) the M3-T2 fix-back lesson (dropped import that passed biome and broke tests) repeats under continuous cadence because the worker cannot run `npm test` between edits, and (3) a single worker re-attempting edit-anchor relocation eats wall-clock on small structural mistakes (the M4 pass-1 spent ~25 min looping on the same file). Per-task review with orchestrator I4 gates at every T boundary is the durable default; continuous cadence stays parked unless the work is genuinely tiny (≤1 subtask) or the model is on a different budget tier.

**Consequences:** Future 4+ subtask continuous-cadence packets should be split into per-task packets, or only attempted on subagents with no wall-clock cap. The I4 hardening recipe (mandatory full-suite `npm test` + `tsc --noEmit` + `biome check` at every T-boundary, verbatim "never report success while the suite is red" rule, dropped-import/unused-symbol check, orchestrator gates at T1→T2 and T3→T4 minimum) is the durable per-task packet template. If the user withdraws any I4 element, fall back to a post-code reviewer gate per the M3 pattern. The M2-a continuous-cadence experiment is now closed as rejected for this project.

## M4-b — Rich task fields model: per-key drop, whole-task reject on malformed container

**Date:** 2026-06-02
**Status:** accepted

**Decision:** The four M4 rich fields are: `description: string`, `owner: string` (free-form), `metadata: Record<string, string|number|boolean>` (flat, no null, no nested objects, no arrays), `activeForm: string` (short present-progressive). Validation policy: (1) for each task, validate `metadata` per-key: drop bad keys (nested objects, arrays, null, unsupported types) with a named warning in the tool result, e.g. `metadata.foo dropped: nested objects not allowed`; (2) if the metadata **container itself** is malformed (not an object, is an array, is null), the entire `todo_write` is atomic-rejected with a content error — no ID minted, no partial state; (3) other rich fields (description/owner/activeForm) are passed through as-is; missing/null/undefined are accepted (rich fields are all additive optional).

**Rationale:** Per-key drop keeps the store healthy when one bad key is mixed with good keys; whole-task reject on a malformed container prevents silent data loss when the agent sends a wrong shape (e.g. `metadata: "tag1,tag2"` from a stringified tag bag). This combination matches the oracle I1 amendment and the M2/M3 schema-additive discipline: existing tasks without the new fields remain valid, and no public tool name changes. The malformed-container check is implemented as a pre-flight in `execute()` (not just in the TypeBox schema) because direct handler invocations may bypass the schema.

**Consequences:** `src/rich-fields.ts` owns `validateMetadata()` + `describeType()` + per-key drop. The pre-flight check in `src/index.ts:execute()` for `todo_write` runs before candidate construction; on rejection it returns a content error with the unchanged store. The `TodoWriteParams` schema stays strict (TypeBox rejects non-record metadata at the type level) but the pre-flight is defense-in-depth. Tests in `src/e2e.test.ts` cover the string/array/null/mixed valid+malformed/valid mixed cases.

## M4-c — Visibility map: description in /todos+widget; activeForm in prompt+/todos; owner in /todos only; metadata hidden everywhere

**Date:** 2026-06-02
**Status:** accepted

**Decision:** Adopt the oracle M-c recommendation, superseding the original M4 plan (description in prompt+widget+/todos truncated to ~120 chars). Final visibility: (1) `description` is shown in the `/todos` interactive list and the compact widget (when the active task has a description, the widget appends ` — <description>` to the active-task label) but NOT in the system prompt block; (2) `activeForm` is shown in the system prompt block as the active-task label (e.g. `Mark task t1 as completed — currently writing code`) and in `/todos`; (3) `owner` is shown in `/todos` only; (4) `metadata` is hidden on every surface — canonical state + replay only, no UI surface. The I3 requirement that any user-authored text in the prompt block must be in a delimited data region with structural-delimiter escaping is satisfied by `renderActiveFormForPrompt` (see M4-e).

**Rationale:** Description in the prompt would bloat the prompt budget with content the agent does not need to act on; activeForm gives the agent a present-progressive label that is useful for /start and /next follow-up phrasing (M-f). Metadata is intentionally hidden from every surface to avoid leaking it into prompt injection or /todos output; it is purely a canonical-state / replay field for audit and inter-extension communication (e.g. a future external system reads `metadata: { externalId: "X" }` from `todo_read`).

**Consequences:** `formatListForLLM` and `buildSystemPromptBlock` (the two prompt paths) only see `activeForm` from rich fields; `TodoViewComponent` and the compact widget see `description` + `activeForm`; `formatListForLLM` (when used by /todos non-UI) and `TodoViewComponent` see `owner`; `metadata` is never passed to any rendering function. `extractRichFields` is the single chokepoint that promotes extracted rich-field objects onto the `Task`.

## M4-d — Fix M3 mini-leak in /start follow-up: activeBlockerIds over raw task.blockedBy

**Date:** 2026-06-02
**Status:** accepted

**Decision:** `/start` follow-up message must use `activeBlockerIds(task, activeTasks([...tracker.tasks]))` instead of raw `task.blockedBy` to filter tombstoned dep IDs out of the helper message. (The earlier M3 path used `notify()` with `blockedByContext()` for the slash-command text but `sendCommand()` for the follow-up still used raw `task.blockedBy` — a leak the M4 post-code reviewer caught.)

**Rationale:** M3's "dead id never printed" invariant applies to every place a blocked task's deps are interpolated into a human- or agent-readable string. The notify() path was correct; the sendCommand() path was not. Same single-source-of-truth principle as M3's `activeTasks` / `activeBlockerIds` — any future helper that prints a task's blockers must use the filtered accessor, not the raw `task.blockedBy` array.

**Consequences:** `src/commands.ts:/start` now joins via `activeBlockerIds(task, activeTasks([...tracker.tasks]))`. Test `src/commands.test.ts` covers the live+dead combo: live dep appears in the follow-up, tombstoned dep does not. Future helpers (custom commands, future milestones) must use the same accessor; `task.blockedBy` is a private array and should not be interpolated into output strings directly.

## M4-e — I3 prompt safety: U+2018 substitution over backslash-escape in renderActiveFormForPrompt

**Date:** 2026-06-02
**Status:** accepted

**Decision:** `renderActiveFormForPrompt` substitutes every backtick with U+2018 (modifier letter grave accent, visually similar but not a markdown delimiter) instead of backslash-escaping the backtick. A backslash-escaped backtick still renders as a backtick in markdown, so the structural-delimiter escape was not robust against input like `` `end` `` — the inner delimiter would leak. The test in `src/prompt.test.ts` now asserts exactly 2 backticks total (the data-region fence) and zero backticks in the inner content, with the inner content equal to `\u2018end\u2018` for input `` `end` ``.

**Rationale:** The prompt block is delimited by triple-backtick data regions; any user-authored text inside the data region must not contain a triple-backtick sequence or its surrounding fence markers. Backslash-escape is markdown-flavored, not structural — the rendered output still contains the delimiter character. Substituting with a visually similar non-delimiter character removes the structural risk entirely while keeping the text readable to the agent.

**Consequences:** `renderActiveFormForPrompt` performs 5-step normalization: trim whitespace, length cap at `ACTIVE_FORM_PROMPT_MAX=80`, backtick substitution (U+2018), leading-hash escape (so the value cannot start an ATX heading inside the data region), single-backtick code-span wrap (the data-region fence). Any future field rendered into a delimited data region should apply the same substitution; never rely on backslash-escape for delimiter safety.

## M4-f — activeForm surfacing in /start and /next helper messages

**Date:** 2026-06-02
**Status:** accepted

**Decision:** Both `/start` and `/next` helper messages append a "Currently <activeForm>" segment when the active or next-up task has an `activeForm` field, so the agent can phrase its acknowledgement with the present-progressive label. `/start` appends ` Currently <activeForm>.` after the action description; `/next` appends ` — Currently <activeForm>` after the active and/or nextUp task description. If neither task has an activeForm, the message ends at the action description (no trailing fragment).

**Rationale:** M-c visibility (M4-c) puts activeForm in the prompt block as the active-task label; the slash-command helper messages are the agent's first feedback after `/start` or `/next`, so surfacing the activeForm there keeps the human/agent mental model consistent with the prompt. This is a small, well-bounded UX improvement; it does not change task semantics, only the follow-up text. M-f also documents the "activeForm" naming for the agent so future prompts can rely on it.

**Consequences:** `src/commands.ts:/start` and `src/commands.ts:/next` add the activeForm suffix conditionally. Tests in `src/commands.test.ts` cover with/without activeForm and the blocked+activeForm combo (the suffix appears regardless of blocked status). The suffix is the canonical M-f follow-up; future milestones that add helper messages should mirror this pattern.