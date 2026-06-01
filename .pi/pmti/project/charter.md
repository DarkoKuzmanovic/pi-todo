# Charter

**Project:** pi-todo
**Initialized:** 2026-05-31
**PMTI version:** v1.0.0

## One-liner

`pi-todo` is a Pi extension that keeps an agent-visible task list synchronized with prompt guidance, tool results, and UI affordances.

## Why this exists

This project exists to make task discipline reliable inside Pi sessions without splitting responsibility across multiple todo extensions. When it works, `pi-todo` remains the single source of truth for `todo_write`, `todo_read`, `todo_remove`, `/todos`, compact progress UI, and helper commands.

## Primary user

The primary user is Darko's local Pi agent workflow: orchestrator agents, PMTI skills, and supporting extensions that rely on explicit task tools for goal tracking and auditability.

## Scope

### In

- Merge `oh-my-todo` UI, command, notification, and compact-widget polish into `pi-todo`.
- Preserve the existing explicit public tools: `todo_write`, `todo_read`, and `todo_remove`.
- Add selected `rpiv-todo` ideas when they strengthen the existing model: compaction replay, optional dependency metadata, audit-friendly tombstones, and richer optional task fields.
- Update README/changelog and safely deactivate standalone `oh-my-todo` only after merged behavior is verified.

### Out

- Replacing the public tool surface with a single `todo({ action })` API.
- Adding `rpiv-i18n` or adopting `rpiv-todo` wholesale.
- Removing the `oh-my-todo` folder before a stable post-deactivation session proves the merge.
- Silent mutation of task state behind the model; helper commands should instruct the agent to call `todo_write`.

## Constraints

- **Primary platform:** Local Pi coding-agent extension environment under `~/.pi/agent/extensions/`.
- **Tech stack:** TypeScript ES modules, Pi ExtensionAPI, `@earendil-works/pi-tui`, TypeBox schemas, Vitest.
- **Data / privacy:** Local-only session/task state; no network dependency or telemetry.
- **Performance / UX:** Keep prompt injection concise, compact widget readable, and slash helpers auditable through normal session history.

## Risk profile

**Primary risk:** architecture + scope

**What could make this go wrong:** Extension lifecycle hooks, schema compatibility, and `oh-my-todo` deactivation can regress active Pi task workflows if implemented in too-large batches or without manual reload testing.

**Review intensity:** Oracle before risky milestone plans; fresh-context reviewer for non-trivial implementation diffs.
