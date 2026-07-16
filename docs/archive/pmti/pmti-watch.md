# Watch List

Track conditions that should trigger re-planning, risk review, or architecture checks.

## Active triggers

- Re-check M0 scope if the merge expands beyond `TaskTracker`, compact widget, celebrations, slash helpers, docs/changelog, and verification/deactivation staging.
- Re-check architecture before changing public tool names, TypeBox schemas, session replay assumptions, or ExtensionAPI hook ownership.
- Re-check safety before disabling `oh-my-todo`; the merged `pi-todo` must be tested in a reload/trial session first.
- Re-check compatibility if any existing PMTI skill, prompt injection, or extension assumes completed tasks remain visible.
- Use fresh-context review for non-trivial diffs and consider oracle before schema/deactivation milestones.
- For M0 model bake-off, record per-task model, elapsed wall-clock if available, test/review outcomes, fix-back count, scope discipline, and notable model-specific failure modes.
- **M4 rich-field boundaries (2026-06-02):** Re-check architecture before changing the visibility map (M-c), adding new rich fields, exposing `metadata` on any surface, changing the malformed-container reject policy, or replacing the U+2018 substitution in `renderActiveFormForPrompt`. The prompt block is delimited; any user-authored text rendered into it must use a structurally safe substitution (never backslash-escape).
- **M4 per-task review cadence (2026-06-02):** 4+ subtask continuous-cadence packets are rejected for this project (M4-a decision, M2-a experiment closed). Subagent wall-clock caps are hard ceilings regardless of model speed; per-task review with orchestrator I4 gates is the durable default. Continuous cadence stays parked unless the work is genuinely tiny (≤1 subtask).
- **M4 deepseek-v4-flash vs flash siblings (2026-06-02):** `deepseek/deepseek-v4-flash` is a faster/cheaper variant than the M1/M3 `deepseek-v4-pro`; on per-task T3+T4 work it was clean and self-reported green aligned with orchestrator I4 verification. Treat it as a viable per-task executor for additive-schema work but keep the I4 hardening (full-suite `npm test` + `tsc --noEmit` + `biome check` at every T-boundary, never green over red, dropped-import check) mandatory.
