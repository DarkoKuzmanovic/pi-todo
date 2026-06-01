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