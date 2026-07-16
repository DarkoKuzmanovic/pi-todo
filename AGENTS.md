# Agent Instructions

## Crew convention

This project follows the canonical Pi crew convention. See `~/.pi/agent/skills/crew/CONVENTIONS.md` for the full contract. Quick reference:

- **Strategic:** `ROADMAP.md` — strategic `M<n>` milestones. `## Released` past work, `## Planned` future work, `## Current` only while an active build is in flight.
- **Tactical:** `PLAN.md` — gated outcome slices for an *active build*. Created on demand; absent means no current build. Do not create an empty file just to satisfy the convention — its existence is the signal.
- **Durable:** `DECISIONS.md` — append-only design forks, never edited retroactively.
- **Parking lot:** `IDEAS.md` — captured ideas; promote to `ROADMAP.md ## Planned` when ready to ship.
- **Archive:** `docs/archive/` — historical state from older planning systems (e.g. `docs/archive/pmti/` for PMTI-era state preserved verbatim through the 2026-07-16 migration).

Status is derived from `ROADMAP.md` + `DECISIONS.md`; never stored in `status.json` or per-milestone progress files. **M-numbering preserves the PMTI-era scheme** (`M0`–`M5` Released, `M6`–`M10` Planned) so commit messages and the lessons below stay correctly indexed.

The PMTI-managed block that previously lived here (`BEGIN/END PMTI MANAGED BLOCK`) was retired on 2026-07-16. Historical PMTI state is at `docs/archive/pmti/`.

## Lessons learned

*(preserved verbatim from the 2026-07-16 AGENTS.md — the M-references here only stay valid because we kept PMTI M-numbering)*

### Keep live compaction verification as a separate close-out gate

For compaction-sensitive Pi extensions, lifecycle tests and mocked UI coverage are necessary but not sufficient. Keep a manual live `/compact` or equivalent reload/trial step as a milestone close-out gate because background workers cannot safely exercise the real Pi session, prompt-injection, status/widget, and slash-command path end to end.

### Prefer full-file rewrites over stacked anchored edits on code files

A continuous multi-task executor pass over M2 produced repeated structural corruption — duplicate function bodies (`extractBlockedBy`, `DepValidationOk`, `buildMockPi`), a broken mid-function declaration, and missing brace closers that cascaded into parse errors across seven test files — because sequential `replace_lines`/`set_line` edits reused stale line anchors that had shifted under prior edits. Recovery cost a `deslopper` pass plus manual surgical deletions. Standing rule for any executor (model-neutral): make one logical edit per file, then re-read before the next edit to it; for any code file needing more than one change, or a function/block add or remove, rewrite the whole file with `write` instead of stacking anchored edits; after editing, confirm no duplicate declarations, balanced braces/parens, and matching closers; respect the workspace module system; and stop and report after two failed edits on the same file rather than carrying a corrupt file forward.

### Continuous MiniMax M3 cadence is rejected for 4+ subtask work — switch to per-task review

M4 retried the M2-a continuous MiniMax M3 experiment (one packet covering T1..T4 in a single worker run). The worker hit the 30-minute subagent wall-clock cap mid-T2 with a structural corruption in `src/compact-widget.ts` (duplicated outer `let left = "";` and `if (active) {` lines + stray `decorated` reference) that broke 6 test files at module-load time. The worker then spent ~25 min trying to recover by edit-anchor relocation. The orchestrator independently caught the red suite (vitest's default reporter does not surface module-load errors — must grep for `❯ src/.*\.test\.ts \(0 test\)` or run `npx esbuild --bundle` to surface transform errors) and surgically repaired the file in place. The follow-up per-task `deepseek/deepseek-v4-flash` packet covering T3 then T4 with orchestrator I4 gates at every T boundary was clean. Standing rule for this project: 4+ subtask continuous-cadence packets are split into per-task packets; subagent wall-clock caps are hard ceilings regardless of model speed; per-task review with orchestrator I4 gates (mandatory full-suite `npm test` + `tsc --noEmit` + `biome check` at every T-boundary, verbatim "never report success while the suite is red" rule, dropped-import/unused-symbol check) is the durable default. Continuous cadence stays parked unless the work is genuinely tiny (≤1 subtask). M2-a continuous-cadence experiment is closed as rejected for this project.
