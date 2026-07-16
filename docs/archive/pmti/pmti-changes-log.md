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


## 2026-06-01: m2-blockedby-dependencies

**Milestone:** M2
**Task:** M2-T1..T4 (implemented in commit `8cbd68d`) + orchestrator review fix-back
**Task packet:** `.pi/pmti/milestones/M2.md` (continuous-cadence handoff; per-task packets not used)
**Status:** completed
**Outcome:** Optional `blockedBy?: string[]` dependency metadata across schema, `todo_write` validation (silent self/dup strip, unknown-ID warning, completed-dep allowance, atomic cycle rejection), faithful replay, blocked semantics, `/next` + `/start` behavior, and prompt/`/todos`/compact-widget display. Two Important reviewer findings fixed (atomic `idCounter` rollback on cycle reject; blocked marker in the interactive `/todos` UI) with new tests; 225 tests pass, Biome clean except pre-existing warning.
**Decisions surfaced:** M2-a (continuous MiniMax cadence — not exercised this milestone; provenance predates session)
**Reviewer verdict:** session-log/2026-06-01-002.md#reviewer-verdict


## 2026-06-02: m4-rich-task-fields

**Milestone:** M4
**Task:** M4-T1..T4 (T1+T2 in one continuous MiniMax M3 pass; T3+T4 in one per-task `deepseek/deepseek-v4-flash` packet)
**Task packet:** `.pi/pmti/milestones/M4.md` + `.pi/pmti/tasks/m4-rich-task-fields/` (T1+T2 handoff) + `.pi/pmti/tasks/m4-t3-t4-persistence-docs/` (T3+T4 handoff)
**Status:** completed
359 tests pass (was 275; +84 from M3 baseline), biome clean (`npx biome check` emits no output; the parent `biome.json` excludes `**/*.test.ts` so the pre-existing `state.test.ts:267` `before` warning is no longer surfaced), tsc clean.
**Decisions surfaced:** M4-a (continuous MiniMax M3 cadence rejected for 4-subtask work on this project — 30-min subagent wall-clock cap is too tight), M4-b (rich fields model with per-key drop + whole-task reject for malformed container, oracle I1 amendment), M4-c (M-c visibility map adopted over original M4 plan), M4-d (M3 leak fix in /start), M4-e (I3 robust escape via U+2018), M4-f (activeForm surfacing in /start + /next).
**Executor trials:** (1) **MiniMax M3 continuous T1+T2** — 30-min cap hit mid-T2; produced a structural corruption in `src/compact-widget.ts` (duplicated outer `let left = ""; if (active) {` lines + stray `decorated` reference) that broke 6 test files at module-load time. Orchestrator independently caught the red suite, surgically repaired the render block in place, and verified 328/328 green. (2) **`deepseek/deepseek-v4-flash` per-task T3+T4** — clean pass. T3 added 13 tests (symmetry matrix 6, B1 metadata replay 4, I2 tombstone-with-rich-fields 2, M-d block state 1); T4 added 4 e2e tests (4-field e2e, I2 resurrection e2e, README+CHANGELOG, manual live-trial checklist). Self-reported green aligned with orchestrator I4 verification at every T boundary. (3) **Orchestrator surgical fix-back** — post-code reviewer returned `Reject` (1 critical I1 metadata container, 2 important M3 leak + I3 escape, 4 minor M-f/strengthen tests). Orchestrator did the fix-back itself (rather than re-dispatching a worker) with surgical file:line-anchored edits; re-review returned `Approve with amendments` (1 tiny test-coverage gap: missing `metadata: "shh"` negative assertion in the I2 5th-surface test); amendment applied; final I4 gate independently green.
**Reviewer verdict:** session-log/2026-06-02-001.md#reviewer-verdict (Reject on first pass → orchestrator fix-back → Approve with amendments on second pass → amendment applied → I4 gate green).

## 2026-06-01: m3-tombstones

**Milestone:** M3
**Task:** M3-T1..T4 (per-task packets under `.pi/pmti/tasks/m3-t*/`)
**Task packet:** `.pi/pmti/milestones/M3.md` + per-task packets
**Status:** COMPLETE (2026-06-01) — closed via automated live trial driving real product code through the full tombstone lifecycle (all 7 steps green); user accepted in lieu of a `/reload` terminal session. 275 tests pass, biome clean.
**Outcome:** Audit-friendly tombstones. `todo_remove` is now a soft-delete via additive `deletedAt?: number` (stored `Task`/`TaskDetails` only, NOT the `todo_write` input schema). Tombstones are fully hidden from every active surface (prompt, `/todos` LLM+UI, compact widget, derived counts, `/next`/`/start`/`/done`/`/pause` selection, blocked labels) yet retained in canonical state + history and preserved through `todo_write` full-replace (Blocker B1: merge-after-validation), `pi-todo:snapshot` appends, and compaction reconstruction (`extractTasks` deletedAt-faithful). New `src/tombstone.ts` (`isTombstoned`/`activeTasks`) and `activeBlockerIds` in `deps.ts`. Resurrection (re-sending a tombstoned id) clears `deletedAt`; soft-delete is idempotent. Hard-purge/pruning parked. 275 tests pass (225→242→255→267→273→275 across the four tasks + fix-backs), biome clean.
**Decisions surfaced:** M3-a (soft-delete-only, fully hidden, DeepSeek v4 Pro per-task cadence, current workspace, immediate oracle)
**Executor trial (M3-a bake-off):** DeepSeek v4 Pro executed all four tasks. M3-T1 clean pass (1 trivial doc-string orchestrator fix). M3-T2 needed one review round (diff/label edge cases) + a fix-back that introduced a dropped-import regression the worker misattributed as pre-existing — orchestrator caught it via independent `npm test`. M3-T3 clean verification-only pass. M3-T4 clean (test+docs), but again cosmetically mislabeled its own edit. **Verdict:** DeepSeek v4 Pro is a capable, scope-disciplined, architecturally-sound executor for invariant-sensitive work under per-task review — but its self-reported test/edit status is NOT trustworthy; independent orchestrator `npm test` on every pass is mandatory. Materially better than GLM 5.1 quota burn; comparable code quality to M1-T2 on harder work.
**Reviewer verdict:** per-task fresh-context reviews; see session-log/2026-06-01-002.md (M3-T1/T2 reviewer rounds; T3/T4 orchestrator-verified, no separate round for zero-production-change tasks).