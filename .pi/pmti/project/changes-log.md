# PMTI Changes Log

This log records completed task/change outcomes, not every planning artifact.

## Format

```md
## YYYY-MM-DD: <change-slug>

**Milestone:** M0
**Task:** M0-T1 or None
**Task packet:** `.pi/pmti/tasks/<mn-tn-slug>/` (scratch; may be deleted) or None
**Status:** completed | abandoned | superseded
**Outcome:** 1-3 sentences
**Decisions surfaced:** M0-a or None
**Reviewer verdict:** session-log/YYYY-MM-DD-NNN.md#reviewer-verdict or None
```

## 2026-05-31: pmti-project-initialized

**Milestone:** None
**Task:** None
**Task packet:** None
**Status:** completed
**Outcome:** Initialized PMTI v1 project state from `IMPLEMENTATION_PLAN.md` so future work can proceed through milestone/task/implementation phases.
**Decisions surfaced:** P0-a, P0-b, P0-c
**Reviewer verdict:** None

## 2026-06-01: m0-t1-task-tracker

**Milestone:** M0
**Task:** M0-T1
**Task packet:** `.pi/pmti/tasks/m0-t1-task-tracker/`
**Status:** completed
**Outcome:** Added `src/tracker.ts` and `src/tracker.test.ts`, porting `oh-my-todo` TaskTracker behavior into `pi-todo` with an injectable clock for deterministic elapsed-time tests. This establishes the tracker API needed by later compact-widget and lifecycle integration tasks without changing public todo tool schemas.
**Decisions surfaced:** M0-a, M0-c
**Reviewer verdict:** session-log/2026-06-01-001.md#reviewer-verdict


## 2026-06-01: m0-t2-compact-widget

**Milestone:** M0
**Task:** M0-T2
**Task packet:** `.pi/pmti/tasks/m0-t2-compact-widget/`
**Status:** completed
**Outcome:** Added `src/compact-widget.ts` and `src/compact-widget.test.ts`, porting the `oh-my-todo` above-editor compact widget into a focused `pi-todo` module without integrating it into `src/index.ts`. This creates the `pi-todo-compact` widget API needed by M0-T3 while preserving public todo tool schemas.
**Decisions surfaced:** M0-a, M0-c
**Reviewer verdict:** session-log/2026-06-01-001.md#m0-t2-reviewer-verdict


## 2026-06-01: m0-t3-lifecycle-integration

**Milestone:** M0
**Task:** M0-T3
**Task packet:** `.pi/pmti/tasks/m0-t3-lifecycle-integration/`
**Status:** completed
**Outcome:** Added `src/runtime.ts` and `src/runtime.test.ts`, and wired `src/index.ts` to reconstruct runtime tracker state, refresh the `pi-todo-compact` widget, process todo tool results idempotently, and emit completion celebrations. Also hardened canonical store reconstruction in `src/state.ts` for branch-read failures and malformed latest todo details, and removed a pre-existing explicit `any` return in `src/component.ts`.
**Decisions surfaced:** M0-a, M0-c
**Reviewer verdict:** session-log/2026-06-01-001.md#m0-t3-reviewer-verdict


## 2026-06-01: m0-t4-slash-helpers

**Milestone:** M0
**Task:** M0-T4
**Task packet:** `.pi/pmti/tasks/m0-t4-slash-helpers/`
**Status:** completed
**Outcome:** Added `src/commands.ts` and `src/commands.test.ts`, and wired `src/index.ts` to register `/done`, `/start`, `/next`, and `/pause` from `pi-todo`. Commands use `runtime.tracker` for lookup and send auditable follow-up instructions through `pi.sendUserMessage(..., { deliverAs: "followUp" })` so task mutation remains mediated by `todo_write`.
**Decisions surfaced:** M0-a, M0-c
**Reviewer verdict:** session-log/2026-06-01-001.md#m0-t4-reviewer-verdict


## 2026-06-01: m0-t5-docs-closeout

**Milestone:** M0
**Task:** M0-T5
**Task packet:** direct close-out edit; no executor packet needed for docs-only finalization
**Status:** completed
**Outcome:** Updated `README.md` and `CHANGELOG.md` to document the merged tracker/widget/runtime/command behavior, preserved public task tool API notes, and then disabled standalone `oh-my-todo` after user approval by clearing `../oh-my-todo/package.json` `pi.extensions` to `[]`. The folder remains for rollback; reload/trial verification is still required before archiving or deleting it.
**Decisions surfaced:** M0-b, M0-c
**Reviewer verdict:** Not requested for docs-only close-out; automated verification passed.