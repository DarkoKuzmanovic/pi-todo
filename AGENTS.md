# Agent Instructions

<!-- BEGIN PMTI MANAGED BLOCK -->
## PMTI project state

Canonical PMTI state lives in `.pi/pmti/`.

- Project context: `.pi/pmti/project/`
- Roadmap: `.pi/pmti/project/roadmap.md`
- Milestones: `.pi/pmti/milestones/MN.md`
- Task packets: `.pi/pmti/tasks/<mn-tn-slug>/` (scratch by default)
- Workspace strategy: `ask-per-milestone`; see `.pi/pmti/project/decisions.md`.

### Session orientation

1. Read `.pi/pmti/project/roadmap.md`.
2. Read the current milestone file under `.pi/pmti/milestones/`.
3. Read the most recent `.pi/pmti/project/session-log/` entry.
4. If a milestone was just closed, verify reviewer verdict and full tests before starting the next one.

### PMTI routing

- Fresh project setup or repair → `pmti-project`.
- Milestone planning/decomposition → `pmti-milestone`.
- Executor-ready task packet → `pmti-task`.
- Trivial direct edits bypass PMTI.
- If `.pi/project/` exists without `.pi/pmti/`, this is legacy state; do not mix PMTI files in automatically.

### Mandatory PMTI preflight

Before PMTI writes, delegation, or handoff, classify: CWD, project state, intent, whether PMTI writes are allowed, and the next required action. Use `ask_user` when scope, migration permission, executor choice, or overwrite behavior is ambiguous. Use `todo_write` for non-trivial PMTI work.

### Milestone close-out

A milestone is not done until:

1. Documentation hygiene is checked.
2. Implementation is committed as a checkpoint where git is available; if no local git repo exists, record the recovery/checkpoint strategy in the session log.
3. `reviewer` reviews the committed diff unless the documented low-risk skip clause applies.
4. Blocker findings are fixed before the next milestone.
5. Full tests are rerun after fixes.
6. Final reviewer verdict and test result are recorded in `.pi/pmti/project/session-log/`.

Oracle is pre-code advisory. Reviewer is post-code. Executor fixes blockers. Automated fix-back is bounded to two rounds before human/orchestrator escalation.
<!-- END PMTI MANAGED BLOCK -->

## Lessons learned

### Keep live compaction verification as a separate close-out gate

For compaction-sensitive Pi extensions, lifecycle tests and mocked UI coverage are necessary but not sufficient. Keep a manual live `/compact` or equivalent reload/trial step as a milestone close-out gate because background workers cannot safely exercise the real Pi session, prompt-injection, status/widget, and slash-command path end to end.

### Prefer full-file rewrites over stacked anchored edits on code files

A continuous multi-task executor pass over M2 produced repeated structural corruption — duplicate function bodies (`extractBlockedBy`, `DepValidationOk`, `buildMockPi`), a broken mid-function declaration, and missing brace closers that cascaded into parse errors across seven test files — because sequential `replace_lines`/`set_line` edits reused stale line anchors that had shifted under prior edits. Recovery cost a `deslopper` pass plus manual surgical deletions. Standing rule for any executor (model-neutral): make one logical edit per file, then re-read before the next edit to it; for any code file needing more than one change, or a function/block add or remove, rewrite the whole file with `write` instead of stacking anchored edits; after editing, confirm no duplicate declarations, balanced braces/parens, and matching closers; respect the workspace module system; and stop and report after two failed edits on the same file rather than carrying a corrupt file forward.

### Continuous MiniMax M3 cadence is rejected for 4+ subtask work — switch to per-task review

M4 retried the M2-a continuous MiniMax M3 experiment (one packet covering T1..T4 in a single worker run). The worker hit the 30-minute subagent wall-clock cap mid-T2 with a structural corruption in `src/compact-widget.ts` (duplicated outer `let left = "";` and `if (active) {` lines + stray `decorated` reference) that broke 6 test files at module-load time. The worker then spent ~25 min trying to recover by edit-anchor relocation. The orchestrator independently caught the red suite (vitest's default reporter does not surface module-load errors — must grep for `❯ src/.*\.test\.ts \(0 test\)` or run `npx esbuild --bundle` to surface transform errors) and surgically repaired the file in place. The follow-up per-task `deepseek/deepseek-v4-flash` packet covering T3 then T4 with orchestrator I4 gates at every T boundary was clean. Standing rule for this project: 4+ subtask continuous-cadence packets are split into per-task packets; subagent wall-clock caps are hard ceilings regardless of model speed; per-task review with orchestrator I4 gates (mandatory full-suite `npm test` + `tsc --noEmit` + `biome check` at every T-boundary, verbatim "never report success while the suite is red" rule, dropped-import/unused-symbol check) is the durable default. Continuous cadence stays parked unless the work is genuinely tiny (≤1 subtask). M2-a continuous-cadence experiment is closed as rejected for this project.