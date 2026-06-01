# Handoff — M0-T1 TaskTracker

## Workspace

Workspace strategy: current-branch
Expected branch/worktree: n/a — this directory has no local `.git/`; expected cwd is `/home/quzma/.pi/agent/extensions/pi-todo`
Workspace owner: orchestrator/executor in current workspace
Close-out owner: orchestrator/human via PMTI close-out; no branch close-out unless a git workspace is introduced later

Before editing, confirm the current branch/worktree matches the Workspace section. If it is missing or mismatched, stop and report the mismatch instead of creating branches or editing product files. In this workspace, confirmation means the cwd is exactly `/home/quzma/.pi/agent/extensions/pi-todo` and no branch/worktree action is required.

## Executor prompt

Implement PMTI task M0-T1 in `/home/quzma/.pi/agent/extensions/pi-todo`.

Read first:

- `.pi/pmti/tasks/m0-t1-task-tracker/brief.md`
- `.pi/pmti/milestones/M0.md`
- `src/types.ts`
- `src/state.ts`
- `../oh-my-todo/src/state.ts` as reference-only

Then:

1. Write failing Vitest tests in `src/tracker.test.ts` for transition detection and deterministic elapsed-time formatting.
2. Create `src/tracker.ts` exporting `TaskTracker` and any necessary exported types.
3. Port only the tracker behavior needed by the brief; do not integrate it into `src/index.ts` yet.
4. Use an injectable clock in the `TaskTracker` constructor so elapsed tests do not depend on wall-clock time.
5. Preserve existing public task/tool schemas; do not edit `src/types.ts` unless a type export is strictly required.
6. Run `npm test -- src/tracker.test.ts`, then `npm test`.

Stop and return to the orchestrator if:

- the cwd is not `/home/quzma/.pi/agent/extensions/pi-todo`,
- referenced files are missing or materially different from the brief,
- implementing this requires changing public tool schemas,
- tests reveal existing unrelated failures that are not caused by this task.

## Recovery discipline

If the same file or same test fails twice, stop incremental patching. Re-read the affected file and the failing assertion, then make one deliberate fix or rewrite the small file cleanly.

After an edit warning, re-read before the next edit.

After a syntax error, inspect the whole edited file before running more tests.

## Expected result

Return a concise summary with:

- files created/modified,
- test commands and results,
- any deviation from the brief,
- whether M0-T2/M0-T3 can now consume the `TaskTracker` API.
