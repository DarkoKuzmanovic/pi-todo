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